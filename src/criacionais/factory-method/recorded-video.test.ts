import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { ModerationResult, ProcessingStatus } from "./enums";
import { ContentRuleViolationError } from "./errors";
import { LiveStream } from "./live-stream";
import { RecordedVideo } from "./recorded-video";

function newLiveStream(recordAutomatically = true, ended = true): LiveStream {
  const live = new LiveStream({
    id: "live-1",
    ownerId: "criadora",
    title: "Live de sábado",
    visibility: ContentVisibility.UNLISTED,
    createdAt: new Date("2026-10-16T12:00:00Z"),
    channelId: "canal-1",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically,
  });
  if (ended) {
    live.markLive();
    live.finish();
  }
  return live;
}

function newRecording(source = newLiveStream()): RecordedVideo {
  return new RecordedVideo({
    id: "video-1",
    createdAt: new Date("2026-10-16T22:00:00Z"),
    source,
  });
}

const READY = {
  durationSeconds: 7200,
  storageUri: "storage://gravacoes/video-1",
  availableAt: new Date("2026-10-16T22:05:00Z"),
};

describe("RecordedVideo (ConcreteProduct)", () => {
  it("herda dono, título e visibilidade da live de origem (regra 7 do v3)", () => {
    const video = newRecording();

    expect(video.ownerId).toBe("criadora");
    expect(video.title).toBe("Live de sábado");
    expect(video.visibility).toBe(ContentVisibility.UNLISTED);
    expect(video.sourceStreamId).toBe("live-1");
  });

  it("nasce em PROCESSING, sem dados de mídia e sem visualizações", () => {
    const video = newRecording();

    expect(video.processingStatus).toBe(ProcessingStatus.PROCESSING);
    expect(video.isReady()).toBe(false);
    expect(video.durationSeconds).toBeUndefined();
    expect(video.storageUri).toBeUndefined();
    expect(video.availableAt).toBeUndefined();
    expect(video.viewCount).toBe(0);
  });

  it("recusa gravação de live que ainda não terminou com F2 (máquina M4 da Entrega 02)", () => {
    expect(() => newRecording(newLiveStream(true, false))).toThrow(
      "F2 a transmissão live-1 ainda não terminou (CREATED); a gravação nasce do encerramento",
    );
  });

  it("recusa gravação de live sem gravação automática com F2", () => {
    expect(() => newRecording(newLiveStream(false))).toThrow(
      "F2 a transmissão live-1 não tem gravação automática habilitada",
    );
  });

  describe("markReady() — regra F3", () => {
    it("fica READY com duração, storageUri e availableAt", () => {
      const video = newRecording();

      video.markReady(READY);

      expect(video.processingStatus).toBe(ProcessingStatus.READY);
      expect(video.isReady()).toBe(true);
      expect(video.durationSeconds).toBe(7200);
      expect(video.storageUri).toBe("storage://gravacoes/video-1");
      expect(video.availableAt).toEqual(READY.availableAt);
      expect(video.availableAt).not.toBe(READY.availableAt);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
      "recusa duração %s",
      (durationSeconds) => {
        expect(() => newRecording().markReady({ ...READY, durationSeconds })).toThrow(
          /^F3 duração deve ser positiva/,
        );
      },
    );

    it("recusa storageUri vazio", () => {
      expect(() => newRecording().markReady({ ...READY, storageUri: " " })).toThrow(
        "F3 storageUri é obrigatório para READY",
      );
    });

    it("recusa availableAt inválido", () => {
      expect(() =>
        newRecording().markReady({ ...READY, availableAt: new Date(Number.NaN) }),
      ).toThrow("F3 availableAt deve ser uma data válida");
    });

    it("recusa concluir duas vezes", () => {
      const video = newRecording();
      video.markReady(READY);

      expect(() => video.markReady(READY)).toThrow(ContentRuleViolationError);
      expect(() => video.markReady(READY)).toThrow("F3 gravação já está em READY");
    });
  });

  it("markFailed() só vale durante o processamento", () => {
    const falhou = newRecording();
    falhou.markFailed();
    expect(falhou.processingStatus).toBe(ProcessingStatus.FAILED);

    const pronta = newRecording();
    pronta.markReady(READY);
    expect(() => pronta.markFailed()).toThrow("markFailed() não é permitido em READY");
  });

  it("só pode ser publicada depois de pronta (regra 8 do v3)", () => {
    const video = newRecording();
    video.applyModeration(ModerationResult.APPROVED);

    expect(() => video.publish()).toThrow("F6 publicar exige mídia pronta");

    video.markReady(READY);
    video.publish();
    expect(video.isPublished()).toBe(true);
  });

  it("conta visualizações", () => {
    const video = newRecording();

    video.incrementViewCount();
    video.incrementViewCount();

    expect(video.viewCount).toBe(2);
  });
});
