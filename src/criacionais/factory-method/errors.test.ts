import { describe, expect, it } from "vitest";
import { ContentRuleViolationError } from "./errors";

describe("ContentRuleViolationError", () => {
  it("começa a mensagem pelo id da regra, o elo entre o terminal e o ADR-002", () => {
    const erro = new ContentRuleViolationError("F5", "fim do recorte depois do fim da gravação");

    expect(erro.message).toBe("F5 fim do recorte depois do fim da gravação");
    expect(erro.rule).toBe("F5");
  });

  it("é capturável como Error e identificável pelo nome", () => {
    const erro = new ContentRuleViolationError("F1", "título vazio");

    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe("ContentRuleViolationError");
  });
});
