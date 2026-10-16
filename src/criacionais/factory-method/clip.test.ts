import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { Clip, type ClipFields } from "./clip";
import { ModerationResult } from "./enums";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";

function newRecording(ready = true): RecordedVideo {
  const live = new LiveStream({
    id: "live-1",
    ownerId: "criadora",
    title: "Live de sábado",
    visibility: ContentVisibility.PRIVATE,
    createdAt: new Date("2026-10-16T12:00:00Z"),
    channelId: "canal-1",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically: true,
  });
  live.markLive();
  live.finish();
  const video = new RecordedVideo({ id: "video-1", createdAt: new Date(), source: live });
  if (ready) {
    video.markReady({
      durationSeconds: 600,
      storageUri: "storage://gravacoes/video-1",
      availableAt: new Date(),
    });
  }
  return video;
}

function newClip(overrides: Partial<ClipFields> = {}): Clip {
  return new Clip({
    id: "clip-1",
    title: "Melhor momento",
    createdAt: new Date("2026-10-16T23:00:00Z"),
    createdByUserId: "espectador",
    startOffsetSeconds: 120,
    endOffsetSeconds: 150,
    source: newRecording(),
    ...overrides,
  });
}

describe("Clip (ConcreteProduct)", () => {
  it("preserva o dono da gravação e registra quem pediu o corte (regra 7 do v3)", () => {
    const clip = newClip();

    expect(clip.ownerId).toBe("criadora");
    expect(clip.createdByUserId).toBe("espectador");
    expect(clip.sourceVideoId).toBe("video-1");
  });

  it("herda a visibilidade da gravação, para o recorte não vazar conteúdo privado", () => {
    expect(newClip().visibility).toBe(ContentVisibility.PRIVATE);
  });

  it("deriva a duração dos offsets (regra 5 do v3)", () => {
    expect(newClip().durationSeconds).toBe(30);
  });

  it("recusa gravação que ainda não está pronta com F4", () => {
    expect(() => newClip({ source: newRecording(false) })).toThrow(
      "F4 a gravação video-1 ainda não está pronta (PROCESSING)",
    );
  });

  it.each([
    ["início negativo", -1, 10],
    ["início igual ao fim", 50, 50],
    ["início depois do fim", 60, 50],
    ["fim depois da duração", 590, 601],
    ["offset não numérico", Number.NaN, 10],
  ])("recusa %s com F5", (_, startOffsetSeconds, endOffsetSeconds) => {
    expect(() => newClip({ startOffsetSeconds, endOffsetSeconds })).toThrow(/^F5 recorte /);
  });

  it("aceita o recorte que vai do início ao fim exato da gravação", () => {
    expect(newClip({ startOffsetSeconds: 0, endOffsetSeconds: 600 }).durationSeconds).toBe(600);
  });

  it("tem mídia pronta desde a criação e publica assim que a moderação aprova", () => {
    const clip = newClip();
    expect(clip.isMediaReady()).toBe(true);

    clip.applyModeration(ModerationResult.APPROVED);
    clip.publish();

    expect(clip.isPublished()).toBe(true);
  });
});
