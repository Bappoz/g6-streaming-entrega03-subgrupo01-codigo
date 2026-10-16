import { ContentRuleViolationError } from "./errors";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";
import { UserContentCreator } from "./user-content-creator";

/** Entrada de `MediaProcessingService.persistRecording(streamId)` no diagrama v3. */
export interface RecordingInput {
  readonly streamId: string;
}

/**
 * ConcreteCreator — cria `RecordedVideo`.
 *
 * Ocupa o lugar de `MediaProcessingService.persistRecording(streamId)` do diagrama v3. A
 * entrada é só o id da transmissão: o criador busca a `LiveStream` no repositório e a
 * passa inteira à gravação, que herda dela o dono, o título e a visibilidade (regra 7 do
 * v3). Saber **de onde** vêm os dados do produto é parte do que o método-fábrica esconde
 * do cliente.
 *
 * A gravação nasce em `PROCESSING`; `submit` a registra e modera, e ela só pode ser
 * publicada depois de `markReady()` (evento `RecordingAvailable`, decisão DE05).
 */
export class RecordedVideoCreator extends UserContentCreator<RecordingInput, RecordedVideo> {
  /**
   * @throws {ContentRuleViolationError} F2, se a transmissão não existe, não grava, não
   * terminou ou já tem gravação. Uma gravação por transmissão: com duas, a busca por
   * transmissão do `ClipCreator` poderia achar a que falhou e recusar um recorte válido.
   */
  protected override createContent(input: RecordingInput): RecordedVideo {
    const source = this.repository.findContentById(input.streamId);
    if (!(source instanceof LiveStream)) {
      throw new ContentRuleViolationError(
        "F2",
        `não existe transmissão ${input.streamId} para originar a gravação`,
      );
    }
    if (this.repository.findRecordingByStream(source.id) !== undefined) {
      throw new ContentRuleViolationError("F2", `a transmissão ${source.id} já tem gravação`);
    }
    return new RecordedVideo({ id: this.nextId(), createdAt: this.currentTime(), source });
  }
}
