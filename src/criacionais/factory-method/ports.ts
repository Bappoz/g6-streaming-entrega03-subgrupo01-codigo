import type { ModerationResult } from "./enums";
import type { RecordedVideo } from "./recorded-video";
import type { UserContent } from "./user-content";

/**
 * Persistência do conteúdo — interface `ContentRepository` do diagrama v3 (decisão DE09).
 *
 * Os criadores dependem deste contrato, não de um banco: a decisão DE09 da Entrega 02 já
 * colocava a persistência em outra camada. Os três métodos são os do diagrama, com `UUID`
 * representado como `string` (TypeScript não tem tipo nativo para UUID).
 */
export interface ContentRepository {
  save(content: UserContent): void;
  findContentById(contentId: string): UserContent | undefined;
  findRecordingByStream(streamId: string): RecordedVideo | undefined;
}

/**
 * Moderação — interface externa `PolicyService` do diagrama v3 (decisão DE09).
 *
 * É a fronteira com a SubEquipe_03. Só `moderate` é usado pelo Factory Method; a
 * assinatura recebe o **id** do conteúdo, e não o objeto, como no modelo. Por isso a
 * operação do criador persiste o conteúdo antes de pedir a moderação.
 */
export interface PolicyService {
  moderate(contentId: string): ModerationResult;
}
