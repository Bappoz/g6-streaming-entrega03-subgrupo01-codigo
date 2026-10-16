import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { Clip } from "./clip";
import { ClipCreator, type ClipRequestInput } from "./clip-creator";
import { ModerationResult, PublicationStatus } from "./enums";
import { BlocklistPolicyService, InMemoryContentRepository } from "./in-memory";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";

function setup({ ready = true, withRecording = true, blockedTerms = [] as string[] } = {}) {
  const repository = new InMemoryContentRepository();
  const live = new LiveStream({
    id: "live-1",
    ownerId: "criadora",
    title: "Live de sábado",
    visibility: ContentVisibility.PUBLIC,
    createdAt: new Date(),
    channelId: "canal-1",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically: true,
  });
  repository.save(live);
  if (withRecording) {
    live.markLive();
    live.finish();
    const video = new RecordedVideo({ id: "video-1", createdAt: new Date(), source: live });
    if (ready) {
      video.markReady({
        durationSeconds: 600,
        storageUri: "storage://v1",
        availableAt: new Date(),
      });
    }
    repository.save(video);
  }
  const policy = new BlocklistPolicyService(repository, blockedTerms);
  const creator = new ClipCreator({ repository, policy, newId: () => "clip-1" });
  return { repository, creator };
}

const REQUEST: ClipRequestInput = {
  requestedByUserId: "espectador",
  sourceStreamId: "live-1",
  startOffsetSeconds: 120,
  endOffsetSeconds: 150,
  title: "Melhor momento",
};

describe("ClipCreator (ConcreteCreator)", () => {
  it("encontra a gravação pela transmissão do pedido e cria o clipe dela", () => {
    const { creator, repository } = setup();

    const clip = creator.submit(REQUEST);

    expect(clip).toBeInstanceOf(Clip);
    expect(clip.id).toBe("clip-1");
    expect(clip.sourceVideoId).toBe("video-1");
    expect(clip.ownerId).toBe("criadora");
    expect(clip.createdByUserId).toBe("espectador");
    expect(clip.durationSeconds).toBe(30);
    expect(repository.findContentById("clip-1")).toBe(clip);
  });

  it("publica o clipe na hora quando a moderação aprova: a mídia já nasce pronta", () => {
    const { creator } = setup();

    expect(creator.submit(REQUEST).publicationStatus).toBe(PublicationStatus.PUBLISHED);
  });

  it("deixa fora do ar o clipe recusado pela moderação", () => {
    const { creator } = setup({ blockedTerms: ["momento"] });

    const clip = creator.submit(REQUEST);

    expect(clip.moderationStatus).toBe(ModerationResult.REJECTED);
    expect(clip.isPublished()).toBe(false);
  });

  it("recusa transmissão sem gravação com F4", () => {
    const { creator } = setup({ withRecording: false });

    expect(() => creator.submit(REQUEST)).toThrow(
      "F4 a transmissão live-1 não tem gravação para recortar",
    );
  });

  it("recusa gravação ainda em processamento com F4", () => {
    const { creator } = setup({ ready: false });

    expect(() => creator.submit(REQUEST)).toThrow(/^F4 a gravação video-1 ainda não está pronta/);
  });

  it("recusa recorte fora da gravação com F5, sem persistir o clipe", () => {
    const { creator, repository } = setup();

    expect(() => creator.submit({ ...REQUEST, endOffsetSeconds: 700 })).toThrow(/^F5 /);
    expect(repository.findContentById("clip-1")).toBeUndefined();
  });
});
