import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { ModerationResult } from "./enums";
import { BlocklistPolicyService, InMemoryContentRepository } from "./in-memory";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";

function newLiveStream(id: string, title = "Live de sábado"): LiveStream {
  return new LiveStream({
    id,
    ownerId: "criadora",
    title,
    visibility: ContentVisibility.PUBLIC,
    createdAt: new Date(),
    channelId: "canal-1",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically: true,
  });
}

describe("InMemoryContentRepository", () => {
  it("guarda por id e substitui ao salvar de novo (upsert)", () => {
    const repository = new InMemoryContentRepository();
    const live = newLiveStream("live-1");

    repository.save(live);
    repository.save(live);

    expect(repository.size).toBe(1);
    expect(repository.findContentById("live-1")).toBe(live);
    expect(repository.findContentById("nao-existe")).toBeUndefined();
  });

  it("encontra a gravação pela transmissão de origem", () => {
    const repository = new InMemoryContentRepository();
    const live = newLiveStream("live-1");
    const outra = newLiveStream("live-2");
    live.markLive();
    live.finish();
    const video = new RecordedVideo({ id: "video-1", createdAt: new Date(), source: live });
    repository.save(live);
    repository.save(outra);
    repository.save(video);

    expect(repository.findRecordingByStream("live-1")).toBe(video);
    expect(repository.findRecordingByStream("live-2")).toBeUndefined();
  });
});

describe("BlocklistPolicyService", () => {
  it("aprova título limpo e recusa título com termo bloqueado, sem diferenciar caixa", () => {
    const repository = new InMemoryContentRepository();
    repository.save(newLiveStream("ok", "Live de sábado"));
    repository.save(newLiveStream("ruim", "Live com SPOILER do final"));
    const policy = new BlocklistPolicyService(repository, ["spoiler"]);

    expect(policy.moderate("ok")).toBe(ModerationResult.APPROVED);
    expect(policy.moderate("ruim")).toBe(ModerationResult.REJECTED);
  });

  it("pede revisão quando o conteúdo não está no repositório", () => {
    const policy = new BlocklistPolicyService(new InMemoryContentRepository(), []);

    expect(policy.moderate("desconhecido")).toBe(ModerationResult.NEEDS_REVIEW);
  });
});
