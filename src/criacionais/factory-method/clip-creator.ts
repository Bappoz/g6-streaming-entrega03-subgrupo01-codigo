import { Clip } from "./clip";
import { ContentRuleViolationError } from "./errors";
import { UserContentCreator } from "./user-content-creator";

/** Pedido de recorte — `ClipRequestInput` do diagrama v3, com os mesmos campos. */
export interface ClipRequestInput {
  readonly requestedByUserId: string;
  readonly sourceStreamId: string;
  readonly startOffsetSeconds: number;
  readonly endOffsetSeconds: number;
  readonly title: string;
}

/**
 * ConcreteCreator — cria `Clip`.
 *
 * Ocupa o lugar da extração do clipe no fluxo do v3 (`ClipService` coordenando
 * `MediaProcessingService.extractClip`). O pedido aponta para a **transmissão**, como o
 * `ClipRequestInput` do modelo; o criador encontra a gravação dessa transmissão com
 * `ContentRepository.findRecordingByStream` e entrega a gravação ao `Clip`, que confere
 * as regras F4 e F5 e preserva o dono da origem.
 *
 * **Limite declarado.** No v3, um pedido feito antes de a gravação ficar pronta espera em
 * `WAITING_RECORDING` (`ClipRequest`, decisão DE04). Aqui o pedido sem gravação pronta é
 * recusado: a fila de pedidos e o reprocessamento pelo evento são responsabilidade do
 * `ClipService`, fora do escopo do padrão de criação.
 */
export class ClipCreator extends UserContentCreator<ClipRequestInput, Clip> {
  /** @throws {ContentRuleViolationError} F4 sem gravação pronta; F5 com recorte fora da gravação. */
  protected override createContent(input: ClipRequestInput): Clip {
    const source = this.repository.findRecordingByStream(input.sourceStreamId);
    if (source === undefined) {
      throw new ContentRuleViolationError(
        "F4",
        `a transmissão ${input.sourceStreamId} não tem gravação para recortar`,
      );
    }
    return new Clip({
      id: this.nextId(),
      title: input.title,
      createdAt: this.currentTime(),
      createdByUserId: input.requestedByUserId,
      startOffsetSeconds: input.startOffsetSeconds,
      endOffsetSeconds: input.endOffsetSeconds,
      source,
    });
  }
}
