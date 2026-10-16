import { ModerationResult } from "./enums";
import type { ContentRepository, PolicyService } from "./ports";
import { RecordedVideo } from "./recorded-video";
import type { UserContent } from "./user-content";

/**
 * `ContentRepository` em memória, para a demonstração e os testes.
 *
 * Não é participante do padrão: é o adaptador mínimo que deixa os criadores rodarem sem
 * banco. O escopo da entrega é o padrão em demo de terminal (README do repositório), então
 * um `Map` basta. `save` é idempotente por id, como um upsert.
 */
export class InMemoryContentRepository implements ContentRepository {
  private readonly contents = new Map<string, UserContent>();

  save(content: UserContent): void {
    this.contents.set(content.id, content);
  }

  findContentById(contentId: string): UserContent | undefined {
    return this.contents.get(contentId);
  }

  findRecordingByStream(streamId: string): RecordedVideo | undefined {
    for (const content of this.contents.values()) {
      if (content instanceof RecordedVideo && content.sourceStreamId === streamId) {
        return content;
      }
    }
    return undefined;
  }

  /** Quantidade de conteúdos guardados; usado pela demo e pelos testes. */
  get size(): number {
    return this.contents.size;
  }
}

/**
 * Dublê do `PolicyService` externo: recusa títulos com termo bloqueado.
 *
 * A moderação real é fronteira da SubEquipe_03 (DE09); aqui só importa que ela devolva
 * os vereditos do modelo para a demo mostrar os dois caminhos da publicação. Conteúdo que
 * não está no repositório volta como `NEEDS_REVIEW`: a política não aprova o que não vê.
 */
export class BlocklistPolicyService implements PolicyService {
  private readonly blockedTerms: readonly string[];

  constructor(
    private readonly repository: ContentRepository,
    blockedTerms: readonly string[],
  ) {
    this.blockedTerms = blockedTerms.map((term) => term.toLowerCase());
  }

  moderate(contentId: string): ModerationResult {
    const content = this.repository.findContentById(contentId);
    if (content === undefined) {
      return ModerationResult.NEEDS_REVIEW;
    }
    const title = content.title.toLowerCase();
    return this.blockedTerms.some((term) => title.includes(term))
      ? ModerationResult.REJECTED
      : ModerationResult.APPROVED;
  }
}
