import { ContentRuleViolationError } from "./errors";
import type { RecordedVideo } from "./recorded-video";
import { UserContent } from "./user-content";

/** Campos de criação de um `Clip`. */
export interface ClipFields {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  /** Quem pediu o recorte; pode não ser o dono da transmissão (regra 7 do v3). */
  readonly createdByUserId: string;
  readonly startOffsetSeconds: number;
  readonly endOffsetSeconds: number;
  readonly source: RecordedVideo;
}

/**
 * ConcreteProduct — clipe derivado de uma gravação (`Clip` do diagrama v3).
 *
 * Como a `RecordedVideo`, recebe a origem inteira, e não ids soltos: assim a própria
 * construção garante as regras que dependem dela.
 *
 * - **Regra 7 do v3.** `ownerId` é o dono da gravação; quem pediu o corte fica em
 *   `createdByUserId`. Um espectador que recorta a live de outra pessoa não vira dono
 *   do conteúdo dela.
 * - **Regra F4 (regra 1 do v3).** Só gravação `READY` serve de origem.
 * - **Regra F5 (regra 4 do v3).** `0 ≤ início < fim ≤ duração da gravação`.
 * - **Visibilidade herdada.** Decisão de projeto: um clipe de gravação privada não pode
 *   nascer público, senão o recorte vazaria o que a origem esconde.
 *
 * A duração é derivada dos offsets (regra 5 do v3: `/durationSeconds`), não armazenada.
 * A mídia do clipe está pronta desde a criação, porque ele só nasce de gravação pronta.
 */
export class Clip extends UserContent {
  readonly sourceVideoId: string;
  readonly createdByUserId: string;
  readonly startOffsetSeconds: number;
  readonly endOffsetSeconds: number;

  constructor(fields: ClipFields) {
    const { source, startOffsetSeconds: start, endOffsetSeconds: end } = fields;
    if (!source.isReady() || source.durationSeconds === undefined) {
      throw new ContentRuleViolationError(
        "F4",
        `a gravação ${source.id} ainda não está pronta (${source.processingStatus})`,
      );
    }
    if (!(start >= 0 && start < end && end <= source.durationSeconds)) {
      throw new ContentRuleViolationError(
        "F5",
        `recorte ${start}s–${end}s fora de 0 ≤ início < fim ≤ ${source.durationSeconds}s`,
      );
    }
    super({
      id: fields.id,
      ownerId: source.ownerId,
      title: fields.title,
      visibility: source.visibility,
      createdAt: fields.createdAt,
    });
    this.sourceVideoId = source.id;
    this.createdByUserId = fields.createdByUserId;
    this.startOffsetSeconds = start;
    this.endOffsetSeconds = end;
  }

  /** `/durationSeconds` do diagrama: atributo derivado, nunca armazenado. */
  get durationSeconds(): number {
    return this.endOffsetSeconds - this.startOffsetSeconds;
  }

  override isMediaReady(): boolean {
    return true;
  }
}
