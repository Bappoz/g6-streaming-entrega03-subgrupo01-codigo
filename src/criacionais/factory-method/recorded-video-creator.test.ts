import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { ModerationResult, ProcessingStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";
import { BlocklistPolicyService, InMemoryContentRepository } from "./in-memory";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";
import { RecordedVideoCreator } from "./recorded-video-creator";

function setup() {
  const repository = new InMemoryContentRepository();
  const policy = new BlocklistPolicyService(repository, []);
  const creator = new RecordedVideoCreator({ repository, policy, newId: () => "video-1" });
  return { repository, creator };
}

function newLiveStream(recordAutomatically = true): LiveStream {
  const live = new LiveStream({
    id: "live-1",
    ownerId: "criadora",
    title: "Live de sábado",
    visibility: ContentVisibility.PUBLIC,
    createdAt: new Date(),
    channelId: "canal-1",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically,
  });
  if (recordAutomatically) {
    live.markLive();
    live.finish();
  }
  return live;
}

describe("RecordedVideoCreator (ConcreteCreator)", () => {
  it("busca a live pelo id e cria a gravação ligada a ela", () => {
    const { repository, creator } = setup();
    repository.save(newLiveStream());

    const video = creator.submit({ streamId: "live-1" });

    expect(video).toBeInstanceOf(RecordedVideo);
    expect(video.id).toBe("video-1");
    expect(video.sourceStreamId).toBe("live-1");
    expect(video.ownerId).toBe("criadora");
    expect(repository.findRecordingByStream("live-1")).toBe(video);
  });

  it("registra a gravação em PROCESSING, aprovada mas sem publicar", () => {
    const { repository, creator } = setup();
    repository.save(newLiveStream());

    const video = creator.submit({ streamId: "live-1" });

    expect(video.processingStatus).toBe(ProcessingStatus.PROCESSING);
    expect(video.moderationStatus).toBe(ModerationResult.APPROVED);
    expect(video.isPublished()).toBe(false);
  });

  it("recusa segunda gravação da mesma transmissão com F2", () => {
    const { repository, creator } = setup();
    repository.save(newLiveStream());
    creator.submit({ streamId: "live-1" });

    expect(() => creator.submit({ streamId: "live-1" })).toThrow(
      "F2 a transmissão live-1 já tem gravação",
    );
    expect(repository.size).toBe(2);
  });

  it("recusa transmissão inexistente com F2", () => {
    const { creator } = setup();

    expect(() => creator.submit({ streamId: "nao-existe" })).toThrow(
      "F2 não existe transmissão nao-existe para originar a gravação",
    );
  });

  it("recusa id que aponta para conteúdo que não é transmissão", () => {
    const { repository, creator } = setup();
    repository.save(newLiveStream());
    const video = creator.submit({ streamId: "live-1" });

    expect(() => creator.submit({ streamId: video.id })).toThrow(ContentRuleViolationError);
  });

  it("recusa live sem gravação automática com F2, sem persistir nada novo", () => {
    const { repository, creator } = setup();
    repository.save(newLiveStream(false));

    expect(() => creator.submit({ streamId: "live-1" })).toThrow(
      "F2 a transmissão live-1 não tem gravação automática habilitada",
    );
    expect(repository.size).toBe(1);
  });
});
