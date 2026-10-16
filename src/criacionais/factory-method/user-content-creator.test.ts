import { describe, expect, it } from "vitest";
import { ContentVisibility } from "../builder";
import { ModerationResult, PublicationStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";
import { InMemoryContentRepository } from "./in-memory";
import type { ContentRepository, PolicyService } from "./ports";
import { UserContent } from "./user-content";
import { UserContentCreator } from "./user-content-creator";

class FakeContent extends UserContent {
  constructor(
    id: string,
    title: string,
    createdAt: Date,
    private readonly ready: boolean,
  ) {
    super({ id, ownerId: "u-1", title, visibility: ContentVisibility.PUBLIC, createdAt });
  }

  override isMediaReady(): boolean {
    return this.ready;
  }
}

interface FakeInput {
  readonly title: string;
  readonly ready: boolean;
}

/** ConcreteCreator de teste: só instancia `FakeContent`, para isolar a operação `submit`. */
class FakeCreator extends UserContentCreator<FakeInput, FakeContent> {
  protected override createContent(input: FakeInput): FakeContent {
    return new FakeContent(this.nextId(), input.title, this.currentTime(), input.ready);
  }
}

/** Repositório que registra a ordem das chamadas, para conferir o passo a passo de `submit`. */
class RecordingRepository implements ContentRepository {
  readonly calls: string[] = [];
  private readonly inner = new InMemoryContentRepository();

  save(content: UserContent): void {
    this.calls.push(`save:${content.moderationStatus}`);
    this.inner.save(content);
  }

  findContentById(contentId: string) {
    return this.inner.findContentById(contentId);
  }

  findRecordingByStream(streamId: string) {
    return this.inner.findRecordingByStream(streamId);
  }
}

function policyReturning(result: ModerationResult, calls?: string[]): PolicyService {
  return {
    moderate: (contentId) => {
      calls?.push(`moderate:${contentId}`);
      return result;
    },
  };
}

const FIXED_NOW = new Date("2026-10-16T12:00:00Z");

function newCreator(repository: ContentRepository, policy: PolicyService): FakeCreator {
  return new FakeCreator({ repository, policy, newId: () => "id-fixo", now: () => FIXED_NOW });
}

describe("UserContentCreator (Creator)", () => {
  it("usa o método-fábrica e devolve o conteúdo criado pela subclasse", () => {
    const content = newCreator(
      new InMemoryContentRepository(),
      policyReturning(ModerationResult.APPROVED),
    ).submit({ title: "Conteúdo", ready: true });

    expect(content).toBeInstanceOf(FakeContent);
    expect(content.id).toBe("id-fixo");
    expect(content.createdAt).toEqual(FIXED_NOW);
  });

  it("persiste antes de moderar, porque a política recebe só o id (diagrama v3)", () => {
    const repository = new RecordingRepository();
    const content = newCreator(
      repository,
      policyReturning(ModerationResult.APPROVED, repository.calls),
    ).submit({ title: "Conteúdo", ready: true });

    expect(repository.calls).toEqual(["save:PENDING", "moderate:id-fixo", "save:APPROVED"]);
    expect(repository.findContentById(content.id)).toBe(content);
  });

  it("publica quando a moderação aprova e a mídia está pronta", () => {
    const content = newCreator(
      new InMemoryContentRepository(),
      policyReturning(ModerationResult.APPROVED),
    ).submit({ title: "Conteúdo", ready: true });

    expect(content.publicationStatus).toBe(PublicationStatus.PUBLISHED);
  });

  it("registra sem publicar quando a mídia ainda não está pronta", () => {
    const content = newCreator(
      new InMemoryContentRepository(),
      policyReturning(ModerationResult.APPROVED),
    ).submit({ title: "Conteúdo", ready: false });

    expect(content.moderationStatus).toBe(ModerationResult.APPROVED);
    expect(content.isPublished()).toBe(false);
  });

  it.each([ModerationResult.REJECTED, ModerationResult.NEEDS_REVIEW])(
    "registra sem publicar quando a moderação devolve %s",
    (result) => {
      const repository = new InMemoryContentRepository();
      const content = newCreator(repository, policyReturning(result)).submit({
        title: "Conteúdo",
        ready: true,
      });

      expect(content.moderationStatus).toBe(result);
      expect(content.isPublished()).toBe(false);
      expect(repository.findContentById(content.id)).toBe(content);
    },
  );

  it("deixa o erro de regra do método-fábrica passar e não persiste nada", () => {
    const repository = new InMemoryContentRepository();
    const creator = newCreator(repository, policyReturning(ModerationResult.APPROVED));

    expect(() => creator.submit({ title: "  ", ready: true })).toThrow(ContentRuleViolationError);
    expect(repository.size).toBe(0);
  });

  it("se a moderação falha, o erro sobe e o conteúdo fica registrado como PENDING", () => {
    const repository = new InMemoryContentRepository();
    const failingPolicy: PolicyService = {
      moderate: () => {
        throw new Error("serviço de moderação indisponível");
      },
    };

    expect(() =>
      newCreator(repository, failingPolicy).submit({ title: "Conteúdo", ready: true }),
    ).toThrow("serviço de moderação indisponível");

    const registrado = repository.findContentById("id-fixo");
    expect(registrado?.moderationStatus).toBe(ModerationResult.PENDING);
    expect(registrado?.isPublished()).toBe(false);
  });

  it("gera UUID e usa o relógio do sistema quando não recebe id nem relógio", () => {
    const content = new FakeCreator({
      repository: new InMemoryContentRepository(),
      policy: policyReturning(ModerationResult.APPROVED),
    }).submit({ title: "Conteúdo", ready: true });

    expect(content.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(content.createdAt).toBeInstanceOf(Date);
  });
});
