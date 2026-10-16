/**
 * Client — demonstração do Factory Method no terminal (`npm run demo:factory-method`).
 *
 * Percorre a cadeia da Entrega 02, `LiveStream → RecordedVideo → ClipRequest → Clip`, na
 * ordem do roteiro do vídeo:
 *
 * 1. a mesma função cliente, `submit`, registra os três tipos de conteúdo;
 * 2. cada conteúdo vai ao ar quando a sua mídia fica pronta (regra F6);
 * 3. pedidos que violam regras são recusados antes de virar conteúdo.
 *
 * `registrar` é o ponto que mostra o padrão: recebe qualquer `UserContentCreator` e só
 * enxerga `UserContent`. O nome da classe concreta aparece na saída apenas para quem
 * assiste ao vídeo conferir o que cada criador instanciou.
 */
import {
  ContentVisibility,
  DefaultStreamConfigBuilder,
  Resolution,
  StreamConfigDirector,
} from "../builder";
import {
  BlocklistPolicyService,
  ClipCreator,
  ContentRuleViolationError,
  InMemoryContentRepository,
  LiveStreamCreator,
  RecordedVideoCreator,
  type UserContent,
  type UserContentCreator,
} from "./index";

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function describeContent(content: UserContent): string {
  return [
    `  classe:        ${content.constructor.name}`,
    `  id:            ${content.id}`,
    `  título:        ${content.title}`,
    `  dono:          ${content.ownerId}`,
    `  visibilidade:  ${content.visibility}`,
    `  moderação:     ${content.moderationStatus}`,
    `  mídia pronta:  ${content.isMediaReady() ? "sim" : "não"}`,
    `  publicação:    ${content.publicationStatus}`,
  ].join("\n");
}

/**
 * O código cliente: o mesmo para os três tipos.
 *
 * O corpo só usa membros de `UserContent`; o tipo concreto aparece apenas na assinatura,
 * para quem chama seguir com o objeto devolvido sem conversão de tipo.
 */
function registrar<TInput, TContent extends UserContent>(
  creator: UserContentCreator<TInput, TContent>,
  input: TInput,
): TContent {
  const content = creator.submit(input);
  console.log(describeContent(content));
  return content;
}

/** Executa um pedido que deve ser recusado e mostra a regra violada. */
function tentar(descricao: string, pedido: () => unknown): void {
  console.log(`\n${descricao}`);
  try {
    pedido();
    console.log("  (inesperado) o pedido foi aceito");
  } catch (erro) {
    if (!(erro instanceof ContentRuleViolationError)) {
      throw erro;
    }
    console.log(`  ${erro.name}: ${erro.message}`);
  }
}

let sequencia = 0;
const dependencies = (() => {
  const repository = new InMemoryContentRepository();
  return {
    repository,
    policy: new BlocklistPolicyService(repository, ["spoiler"]),
    newId: () => `conteudo-${String(++sequencia).padStart(2, "0")}`,
  };
})();

const liveCreator = new LiveStreamCreator(dependencies);
const recordingCreator = new RecordedVideoCreator(dependencies);
const clipCreator = new ClipCreator(dependencies);
const director = new StreamConfigDirector(new DefaultStreamConfigBuilder());

section("1. LiveStreamCreator — a configuração vem do Builder");
const live = registrar(liveCreator, {
  ownerId: "criadora",
  channelId: "canal-da-criadora",
  config: director.highQuality("Show ao vivo em 4K"),
});
console.log("\nmarkLive(): a live entra no ar e a mídia fica pronta → publish()");
live.markLive();
live.publish();
console.log(describeContent(live));

section("2. RecordedVideoCreator — a gravação nasce da live");
live.finish();
const video = registrar(recordingCreator, { streamId: live.id });
console.log("\nRecordingAvailable: processamento concluído → markReady() → publish()");
video.markReady({
  durationSeconds: 3600,
  storageUri: "storage://gravacoes/show-4k",
  availableAt: new Date(),
});
video.publish();
console.log(describeContent(video));

section("3. ClipCreator — um espectador recorta a gravação");
const clip = registrar(clipCreator, {
  requestedByUserId: "espectador",
  sourceStreamId: live.id,
  startOffsetSeconds: 1800,
  endOffsetSeconds: 1830,
  title: "O refrão do show",
});
console.log(`  pedido por:    ${clip.createdByUserId} (${clip.durationSeconds} s de recorte)`);

section("4. Pedidos recusados");
console.log("\nClipe com termo bloqueado: criado, mas a moderação recusa e ele fica fora do ar");
registrar(clipCreator, {
  requestedByUserId: "espectador",
  sourceStreamId: live.id,
  startOffsetSeconds: 3000,
  endOffsetSeconds: 3060,
  title: "Spoiler do final",
});

tentar("Clipe que passa do fim da gravação (3600 s):", () =>
  clipCreator.submit({
    requestedByUserId: "espectador",
    sourceStreamId: live.id,
    startOffsetSeconds: 3590,
    endOffsetSeconds: 3700,
    title: "Depois do fim",
  }),
);

const semGravacao = liveCreator.submit({
  ownerId: "criadora",
  channelId: "canal-da-criadora",
  config: new DefaultStreamConfigBuilder()
    .withTitle("Bastidores sem gravação")
    .withVisibility(ContentVisibility.UNLISTED)
    .withRecording(false)
    .withVideo(Resolution.R720P, 30, 4_000_000)
    .build(),
});
tentar("Gravação de uma live com gravação automática desligada:", () =>
  recordingCreator.submit({ streamId: semGravacao.id }),
);

tentar("Clipe de uma transmissão que não tem gravação:", () =>
  clipCreator.submit({
    requestedByUserId: "espectador",
    sourceStreamId: semGravacao.id,
    startOffsetSeconds: 0,
    endOffsetSeconds: 10,
    title: "Não existe",
  }),
);

console.log(`\nConteúdos no repositório: ${dependencies.repository.size}`);
