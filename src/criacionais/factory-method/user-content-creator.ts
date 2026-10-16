import { randomUUID } from "node:crypto";
import { ModerationResult } from "./enums";
import type { ContentRepository, PolicyService } from "./ports";
import type { UserContent } from "./user-content";

/** Colaboradores de todo criador. `newId` e `now` existem para os testes fixarem id e relógio. */
export interface CreatorDependencies {
  readonly repository: ContentRepository;
  readonly policy: PolicyService;
  readonly newId?: () => string;
  readonly now?: () => Date;
}

/**
 * Creator — declara o método-fábrica `createContent` e a operação que o usa, `submit`.
 *
 * **O problema que o padrão resolve aqui.** Na Entrega 02, o conteúdo nasce em três pontos
 * do fluxo `LiveStream → RecordedVideo → ClipRequest → Clip`: `LiveStreamService`,
 * `MediaProcessingService` e `ClipService`. Depois de nascer, os três passam pelo mesmo
 * caminho — persistir, moderar e publicar se a regra 8 do v3 permitir. Sem o padrão, esse
 * caminho fica copiado em cada serviço, ou centralizado num `switch` sobre o tipo, que
 * precisa ser editado a cada tipo novo e conhece todas as classes concretas.
 *
 * Com o Factory Method, `submit` escreve o caminho uma vez, só com o tipo `UserContent`,
 * e delega a única parte que varia — **qual classe instanciar e com quais dados** — ao
 * método-fábrica de cada ConcreteCreator. É a definição do GoF: "deixar as subclasses
 * decidirem qual classe instanciar".
 *
 * **Adaptação declarada em relação ao livro.** No GoF, `FactoryMethod()` não recebe
 * parâmetros. Aqui cada tipo precisa de entradas diferentes (uma `StreamConfig`, o id de
 * uma transmissão, um pedido de recorte), então o Creator é genérico na entrada: `TInput`.
 * É uma adaptação tipada, e não a variante de "métodos-fábrica parametrizados" do GoF, em
 * que o parâmetro identifica qual produto criar: aqui o parâmetro só carrega dados, e quem
 * decide a classe continua sendo a subclasse. Como cada criador tem a sua entrada, eles
 * não são intercambiáveis entre si; o que é comum a todos é `submit` e o retorno
 * `UserContent`.
 *
 * @typeParam TInput Dados de que o ConcreteCreator precisa para criar o conteúdo.
 * @typeParam TContent ConcreteProduct criado; o Client pode enxergá-lo só como `UserContent`.
 */
export abstract class UserContentCreator<TInput, TContent extends UserContent> {
  protected readonly repository: ContentRepository;
  private readonly policy: PolicyService;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(dependencies: CreatorDependencies) {
    this.repository = dependencies.repository;
    this.policy = dependencies.policy;
    this.newId = dependencies.newId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * Operação do Creator: cria, persiste, modera e publica quando possível.
   *
   * 1. `createContent` — o método-fábrica; única linha que depende da subclasse.
   * 2. `save` antes de moderar: `PolicyService.moderate` recebe o **id** (diagrama v3),
   *    então a política precisa encontrar o conteúdo já persistido.
   * 3. Publica só com moderação `APPROVED` **e** mídia pronta (regra F6). Conteúdo que
   *    ainda não pode ir ao ar — uma live que não começou, uma gravação em processamento —
   *    fica registrado e despublicado, sem erro: publicar depois é outro passo do fluxo.
   * 4. `save` de novo, com a moderação e a publicação registradas.
   *
   * Erros de regra do método-fábrica (`ContentRuleViolationError`) atravessam sem ser
   * capturados, e nada é persistido nesse caso.
   *
   * **Falha depois do primeiro `save`.** Se a política ou o segundo `save` lançar erro, o
   * erro sobe sem ser tratado e o conteúdo fica registrado como estava no primeiro `save`:
   * moderação `PENDING`, fora do ar. É um estado válido do modelo (conteúdo aguardando
   * moderação), não um objeto pela metade, e pode ser moderado de novo pelo id. Não há
   * transação: quem repetir o `submit` cria **outro** conteúdo. Essa é a consequência
   * declarada da ordem `save → moderate → save` imposta pela assinatura do v3.
   */
  submit(input: TInput): TContent {
    const content = this.createContent(input);

    this.repository.save(content);
    content.applyModeration(this.policy.moderate(content.id));
    if (content.moderationStatus === ModerationResult.APPROVED && content.isMediaReady()) {
      content.publish();
    }
    this.repository.save(content);

    return content;
  }

  /**
   * Método-fábrica: cada ConcreteCreator decide qual `UserContent` instanciar.
   *
   * `protected` porque quem cria conteúdo de fora chama `submit`; chamar o método-fábrica
   * direto pularia moderação e persistência.
   */
  protected abstract createContent(input: TInput): TContent;

  /** Id para o conteúdo novo (UUID por padrão). */
  protected nextId(): string {
    return this.newId();
  }

  /** Instante de criação (relógio do sistema por padrão). */
  protected currentTime(): Date {
    return this.now();
  }
}
