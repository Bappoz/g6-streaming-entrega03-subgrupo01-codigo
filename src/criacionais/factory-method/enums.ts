/**
 * Vocabulário de domínio do conteúdo gerado pelo usuário (UGC).
 *
 * As quatro enumerações aparecem com estes nomes e constantes no diagrama de classes v3
 * da Entrega 02 (componente "Conteúdo gerado pelo usuário"). Foram declaradas como `enum`
 * do TypeScript pelo mesmo motivo do Builder: cada constante do modelo vira uma constante
 * nomeada no código, e os dois artefatos podem ser conferidos lado a lado.
 *
 * `ContentVisibility` e `LatencyMode` **não** são redeclaradas aqui: já existem na API
 * pública do Builder (`../builder`) e são importadas de lá. Duplicá-las criaria dois tipos
 * incompatíveis para a mesma coisa — um `StreamConfig` com visibilidade do Builder não
 * poderia alimentar uma `LiveStream` com a visibilidade daqui. A promoção para um módulo
 * de domínio compartilhado continua sendo decisão das duas duplas (README do Builder).
 */

/** Situação de publicação de um `UserContent` (diagrama v3). */
export enum PublicationStatus {
  UNPUBLISHED = "UNPUBLISHED",
  PUBLISHED = "PUBLISHED",
}

/** Veredito de moderação devolvido por `PolicyService.moderate` (diagrama v3, DE09). */
export enum ModerationResult {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  NEEDS_REVIEW = "NEEDS_REVIEW",
}

/** Estado da transmissão ao vivo (diagrama v3). */
export enum LiveStreamStatus {
  CREATED = "CREATED",
  LIVE = "LIVE",
  ENDED = "ENDED",
  FAILED = "FAILED",
}

/** Estado de processamento da gravação (diagrama v3). */
export enum ProcessingStatus {
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
}
