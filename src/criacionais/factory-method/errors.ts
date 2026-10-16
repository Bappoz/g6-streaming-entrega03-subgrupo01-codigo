/**
 * Identificadores das regras do Factory Method (ADR-002).
 *
 * Cada regra vem de uma nota do diagrama v3 da Entrega 02 ("Regras do fluxo de clipes")
 * ou de uma decisão de projeto declarada no ADR. O prefixo `F` evita confusão com as
 * regras `R1`–`R5` do Builder quando as duas demonstrações aparecem no mesmo vídeo.
 */
export type ContentRule = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";

/**
 * Erro lançado quando a criação ou a publicação de um conteúdo viola uma regra do domínio.
 *
 * Diferente do `InvalidStreamConfigError` do Builder, este erro carrega **uma** violação.
 * As regras daqui são verificadas em momentos diferentes — na construção do produto, na
 * busca da origem pelo criador ou na publicação —, e cada momento barra o fluxo na
 * primeira falha: não faz sentido checar a janela de um clipe cuja gravação não existe.
 */
export class ContentRuleViolationError extends Error {
  /** Regra violada, no formato do ADR-002 (`F1`–`F6`). */
  readonly rule: ContentRule;

  constructor(rule: ContentRule, detail: string) {
    super(`${rule} ${detail}`);
    // `name` explícito: subclasses de Error perdem o nome útil em stack trace e em log.
    this.name = "ContentRuleViolationError";
    this.rule = rule;
  }
}
