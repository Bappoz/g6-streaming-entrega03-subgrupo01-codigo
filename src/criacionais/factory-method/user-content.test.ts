import { describe, expect, it } from "vitest";
import { ContentVisibility } from "../builder";
import { ModerationResult, PublicationStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";
import { UserContent, type UserContentFields } from "./user-content";

/** ConcreteProduct mínimo, só para exercitar o contrato comum de `UserContent`. */
class FakeContent extends UserContent {
  mediaReady = true;

  constructor(overrides: Partial<UserContentFields> = {}) {
    super({
      id: "c-1",
      ownerId: "u-1",
      title: "Conteúdo",
      visibility: ContentVisibility.PUBLIC,
      createdAt: new Date("2026-10-16T12:00:00Z"),
      ...overrides,
    });
  }

  override isMediaReady(): boolean {
    return this.mediaReady;
  }
}

describe("UserContent (Product)", () => {
  it("nasce não publicado e com moderação pendente, como no diagrama v3", () => {
    const content = new FakeContent();

    expect(content.publicationStatus).toBe(PublicationStatus.UNPUBLISHED);
    expect(content.moderationStatus).toBe(ModerationResult.PENDING);
    expect(content.isPublished()).toBe(false);
  });

  it("remove espaços das pontas do título", () => {
    expect(new FakeContent({ title: "  Live de sábado  " }).title).toBe("Live de sábado");
  });

  it.each(["", "   "])("rejeita título vazio (%j) com F1", (title) => {
    expect(() => new FakeContent({ title })).toThrow(ContentRuleViolationError);
    expect(() => new FakeContent({ title })).toThrow(/^F1 /);
  });

  describe("publish() — regra F6", () => {
    it("publica com moderação aprovada e mídia pronta", () => {
      const content = new FakeContent();
      content.applyModeration(ModerationResult.APPROVED);

      content.publish();

      expect(content.isPublished()).toBe(true);
      expect(content.publicationStatus).toBe(PublicationStatus.PUBLISHED);
    });

    it.each([ModerationResult.PENDING, ModerationResult.REJECTED, ModerationResult.NEEDS_REVIEW])(
      "recusa publicar com moderação %s",
      (result) => {
        const content = new FakeContent();
        content.applyModeration(result);

        expect(() => content.publish()).toThrow(/^F6 publicar exige moderação APPROVED/);
        expect(content.isPublished()).toBe(false);
      },
    );

    it("recusa publicar com mídia que ainda não está pronta", () => {
      const content = new FakeContent();
      content.mediaReady = false;
      content.applyModeration(ModerationResult.APPROVED);

      expect(() => content.publish()).toThrow("F6 publicar exige mídia pronta");
    });
  });

  it("despublica quando um novo veredito deixa de ser APPROVED", () => {
    const content = new FakeContent();
    content.applyModeration(ModerationResult.APPROVED);
    content.publish();

    content.applyModeration(ModerationResult.NEEDS_REVIEW);

    expect(content.isPublished()).toBe(false);
    expect(content.moderationStatus).toBe(ModerationResult.NEEDS_REVIEW);
  });

  it("unpublish() tira do ar sem mexer na moderação", () => {
    const content = new FakeContent();
    content.applyModeration(ModerationResult.APPROVED);
    content.publish();

    content.unpublish();

    expect(content.isPublished()).toBe(false);
    expect(content.moderationStatus).toBe(ModerationResult.APPROVED);
  });
});
