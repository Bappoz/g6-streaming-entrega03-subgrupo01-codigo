/**
 * API pública do padrão Factory Method.
 *
 * A demonstração e o benchmark importam daqui, e não dos arquivos internos, pelo mesmo
 * motivo do Builder: a organização dos módulos pode mudar sem quebrar quem consome.
 */
export { Clip } from "./clip";
export { ClipCreator, type ClipRequestInput } from "./clip-creator";
export { LiveStreamStatus, ModerationResult, ProcessingStatus, PublicationStatus } from "./enums";
export { type ContentRule, ContentRuleViolationError } from "./errors";
export { BlocklistPolicyService, InMemoryContentRepository } from "./in-memory";
export { LiveStream } from "./live-stream";
export { type LiveStreamInput, LiveStreamCreator } from "./live-stream-creator";
export type { ContentRepository, PolicyService } from "./ports";
export { RecordedVideo } from "./recorded-video";
export { RecordedVideoCreator, type RecordingInput } from "./recorded-video-creator";
export { UserContent } from "./user-content";
export { type CreatorDependencies, UserContentCreator } from "./user-content-creator";
