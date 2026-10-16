import type { ContentVisibility } from "../builder";
import { ModerationResult, PublicationStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";

/** Dados comuns a todo conteúdo, recebidos do criador concreto. */
export interface UserContentFields {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly visibility: ContentVisibility;
  readonly createdAt: Date;
}

/**
 * Product — conteúdo gerado pelo usuário, a classe abstrata `UserContent` do diagrama v3.
 *
 * Na Entrega 02, `LiveStream`, `RecordedVideo` e `Clip` herdam desta classe (decisão DE03):
 * os três compartilham identidade, autor, título, visibilidade, publicação e moderação. É
 * esse contrato comum que permite ao Creator registrar, moderar e publicar qualquer um
 * deles sem saber qual classe concreta acabou de nascer.
 *
 * O que cada tipo tem de diferente entra por um único gancho, `isMediaReady()`: a regra 8
 * do v3 diz que publicar exige moderação aprovada **e** mídia pronta, mas "pronta" quer
 * dizer coisas diferentes para uma live, uma gravação e um clipe.
 *
 * O construtor é `protected` porque não existe conteúdo "genérico": só as subclasses
 * podem ser instanciadas. Publicação e moderação nascem nos estados iniciais do modelo
 * (`UNPUBLISHED`, `PENDING`) e só mudam pelos métodos abaixo, nunca por atribuição direta.
 */
export abstract class UserContent {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly visibility: ContentVisibility;
  private readonly created: Date;
  private publication = PublicationStatus.UNPUBLISHED;
  private moderation = ModerationResult.PENDING;

  protected constructor(fields: UserContentFields) {
    // Regra F1 (decisão de projeto, simétrica à R1 do Builder): título inventado seria
    // dado falso, e título só de espaços não identifica o conteúdo em lugar nenhum.
    if (fields.title.trim() === "") {
      throw new ContentRuleViolationError("F1", "título é obrigatório e não pode ser vazio");
    }
    this.id = fields.id;
    this.ownerId = fields.ownerId;
    this.title = fields.title.trim();
    this.visibility = fields.visibility;
    // Cópia: `readonly` impede reatribuir, não `setTime()` no objeto que veio de fora.
    this.created = new Date(fields.createdAt.getTime());
  }

  /** Instante de criação; devolve uma cópia, pelo mesmo motivo do construtor. */
  get createdAt(): Date {
    return new Date(this.created.getTime());
  }

  get publicationStatus(): PublicationStatus {
    return this.publication;
  }

  get moderationStatus(): ModerationResult {
    return this.moderation;
  }

  /**
   * Gancho de cada ConcreteProduct: a mídia deste conteúdo já pode ser exibida?
   *
   * Live: está no ar. Gravação: processamento concluído. Clipe: nasce de gravação pronta.
   */
  abstract isMediaReady(): boolean;

  /**
   * Registra o veredito da moderação.
   *
   * Um veredito diferente de `APPROVED` despublica o conteúdo, se ele estava publicado:
   * a regra 8 do v3 vale enquanto o conteúdo está no ar, não só no instante de publicar.
   */
  applyModeration(result: ModerationResult): void {
    this.moderation = result;
    if (result !== ModerationResult.APPROVED) {
      this.unpublish();
    }
  }

  /**
   * Publica o conteúdo — regra F6 (regra 8 do v3).
   *
   * @throws {ContentRuleViolationError} F6, se a moderação não aprovou ou a mídia não está pronta.
   */
  publish(): void {
    if (this.moderation !== ModerationResult.APPROVED) {
      throw new ContentRuleViolationError(
        "F6",
        `publicar exige moderação ${ModerationResult.APPROVED} (atual: ${this.moderation})`,
      );
    }
    if (!this.isMediaReady()) {
      throw new ContentRuleViolationError("F6", "publicar exige mídia pronta");
    }
    this.publication = PublicationStatus.PUBLISHED;
  }

  unpublish(): void {
    this.publication = PublicationStatus.UNPUBLISHED;
  }

  isPublished(): boolean {
    return this.publication === PublicationStatus.PUBLISHED;
  }
}
