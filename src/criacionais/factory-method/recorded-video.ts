import { LiveStreamStatus, ProcessingStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";
import type { LiveStream } from "./live-stream";
import { UserContent } from "./user-content";

/** Dados que a gravação recebe quando o processamento termina (evento `RecordingAvailable`). */
export interface RecordingReadyFields {
  readonly durationSeconds: number;
  readonly storageUri: string;
  readonly availableAt: Date;
}

/** Campos de criação de uma `RecordedVideo`: a identidade e a live de origem. */
export interface RecordedVideoFields {
  readonly id: string;
  readonly createdAt: Date;
  readonly source: LiveStream;
}

/**
 * ConcreteProduct — gravação de uma transmissão (`RecordedVideo` do diagrama v3).
 *
 * Recebe a `LiveStream` de origem, e não um `ownerId` solto, para que a regra 7 do v3
 * ("preservar o proprietário da origem") seja garantida pela construção: dono, título e
 * visibilidade vêm da live, sem chance de o chamador passar um dono diferente.
 *
 * Só nasce de live encerrada (`ENDED`): na máquina de estados M4 da Entrega 02, a gravação
 * entra em processamento a partir do encerramento da transmissão.
 *
 * Nasce em `PROCESSING` — é o que `MediaProcessingService.persistRecording` devolve no
 * v3 —, e só fica pronta com `markReady()`, quando o evento `RecordingAvailable` chega
 * (decisão DE05). Até lá a mídia não está pronta e a gravação não pode ser publicada.
 */
export class RecordedVideo extends UserContent {
  readonly sourceStreamId: string;
  private processing = ProcessingStatus.PROCESSING;
  private duration: number | undefined;
  private storage: string | undefined;
  private available: Date | undefined;
  private views = 0;

  constructor(fields: RecordedVideoFields) {
    // Regra F2 (regra 2 do v3): sem gravação habilitada não existe gravação.
    if (!fields.source.recordAutomatically) {
      throw new ContentRuleViolationError(
        "F2",
        `a transmissão ${fields.source.id} não tem gravação automática habilitada`,
      );
    }
    // Ainda F2: a gravação nasce do encerramento (máquina M4 da Entrega 02).
    if (fields.source.status !== LiveStreamStatus.ENDED) {
      throw new ContentRuleViolationError(
        "F2",
        `a transmissão ${fields.source.id} ainda não terminou (${fields.source.status}); a gravação nasce do encerramento`,
      );
    }
    super({
      id: fields.id,
      ownerId: fields.source.ownerId,
      title: fields.source.title,
      visibility: fields.source.visibility,
      createdAt: fields.createdAt,
    });
    this.sourceStreamId = fields.source.id;
  }

  get processingStatus(): ProcessingStatus {
    return this.processing;
  }

  get durationSeconds(): number | undefined {
    return this.duration;
  }

  get storageUri(): string | undefined {
    return this.storage;
  }

  get availableAt(): Date | undefined {
    return this.available === undefined ? undefined : new Date(this.available.getTime());
  }

  get viewCount(): number {
    return this.views;
  }

  /**
   * Conclui o processamento — regra F3 (regra 9 do v3).
   *
   * A nota do v3 exige duração, `storageUri`, `availableAt` e manifesto para `READY`. Aqui
   * são verificados os três primeiros; exigir duração **positiva** e data **válida** é
   * refinamento desta entrega, não texto literal da nota. O manifesto (`MediaManifest`,
   * DE08) não é representado: a entrega de mídia está fora do escopo do padrão de criação.
   *
   * @throws {ContentRuleViolationError} F3, se faltar algum dado ou a gravação não estiver em processamento.
   */
  markReady(ready: RecordingReadyFields): void {
    if (this.processing !== ProcessingStatus.PROCESSING) {
      throw new ContentRuleViolationError("F3", `gravação já está em ${this.processing}`);
    }
    if (!Number.isFinite(ready.durationSeconds) || ready.durationSeconds <= 0) {
      throw new ContentRuleViolationError(
        "F3",
        `duração deve ser positiva (recebido: ${ready.durationSeconds})`,
      );
    }
    if (ready.storageUri.trim() === "") {
      throw new ContentRuleViolationError("F3", "storageUri é obrigatório para READY");
    }
    // `Date` garante o tipo, não a validade: `new Date(NaN)` também é um `Date`.
    if (Number.isNaN(ready.availableAt.getTime())) {
      throw new ContentRuleViolationError("F3", "availableAt deve ser uma data válida");
    }
    this.processing = ProcessingStatus.READY;
    this.duration = ready.durationSeconds;
    this.storage = ready.storageUri;
    this.available = new Date(ready.availableAt.getTime());
  }

  /**
   * Processamento falhou (evento `RecordingFailed` do v3).
   *
   * Só vale durante o processamento: uma gravação `READY` já pode ter originado clipes, e
   * marcá-la como falha depois disso deixaria clipes apontando para uma origem "inexistente".
   */
  markFailed(): void {
    if (this.processing !== ProcessingStatus.PROCESSING) {
      throw new Error(`markFailed() não é permitido em ${this.processing}`);
    }
    this.processing = ProcessingStatus.FAILED;
  }

  isReady(): boolean {
    return this.processing === ProcessingStatus.READY;
  }

  incrementViewCount(): void {
    this.views += 1;
  }

  override isMediaReady(): boolean {
    return this.isReady();
  }
}
