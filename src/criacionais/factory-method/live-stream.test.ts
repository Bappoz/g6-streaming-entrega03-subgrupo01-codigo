import { describe, expect, it } from "vitest";
import { ContentVisibility, LatencyMode } from "../builder";
import { LiveStreamStatus, ModerationResult } from "./enums";
import { LiveStream } from "./live-stream";
import { UserContent } from "./user-content";

function newLiveStream(): LiveStream {
  return new LiveStream({
    id: "live-1",
    ownerId: "criadora",
    title: "Live de sábado",
    visibility: ContentVisibility.PUBLIC,
    createdAt: new Date("2026-10-16T12:00:00Z"),
    channelId: "canal-1",
    latencyMode: LatencyMode.LOW,
    recordAutomatically: true,
  });
}

describe("LiveStream (ConcreteProduct)", () => {
  it("é um UserContent e guarda os campos próprios do diagrama v3", () => {
    const live = newLiveStream();

    expect(live).toBeInstanceOf(UserContent);
    expect(live.channelId).toBe("canal-1");
    expect(live.latencyMode).toBe(LatencyMode.LOW);
    expect(live.recordAutomatically).toBe(true);
    expect(live.status).toBe(LiveStreamStatus.CREATED);
    expect(live.startedAt).toBeUndefined();
    expect(live.endedAt).toBeUndefined();
  });

  it("percorre CREATED → LIVE → ENDED registrando os instantes", () => {
    const live = newLiveStream();
    const inicio = new Date("2026-10-16T20:00:00Z");
    const fim = new Date("2026-10-16T22:00:00Z");

    live.markLive(inicio);
    expect(live.status).toBe(LiveStreamStatus.LIVE);
    expect(live.startedAt).toEqual(inicio);

    live.finish(fim);
    expect(live.status).toBe(LiveStreamStatus.ENDED);
    expect(live.endedAt).toEqual(fim);
  });

  it("não compartilha as datas com quem chama: alterar o Date de fora não muda a live", () => {
    const live = newLiveStream();
    const inicio = new Date("2026-10-16T20:00:00Z");
    live.markLive(inicio);

    inicio.setFullYear(2000);
    live.startedAt?.setFullYear(1999);
    live.createdAt.setFullYear(1998);

    expect(live.startedAt).toEqual(new Date("2026-10-16T20:00:00Z"));
    expect(live.createdAt).toEqual(new Date("2026-10-16T12:00:00Z"));
  });

  it("usa o instante atual quando nenhum é informado", () => {
    const live = newLiveStream();

    live.markLive();
    live.finish();

    expect(live.startedAt).toBeInstanceOf(Date);
    expect(live.endedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["CREATED", (l: LiveStream) => l],
    [
      "LIVE",
      (l: LiveStream) => {
        l.markLive();
        return l;
      },
    ],
  ])("pode falhar a partir de %s, guardando o motivo", (_, prepare) => {
    const live = prepare(newLiveStream());

    live.fail("encoder desconectado");

    expect(live.status).toBe(LiveStreamStatus.FAILED);
    expect(live.failureReason).toBe("encoder desconectado");
  });

  it("recusa transições fora de ordem em vez de ignorá-las", () => {
    const live = newLiveStream();

    expect(() => live.finish()).toThrow("finish() não é permitido em CREATED; esperado: LIVE");

    live.markLive();
    expect(() => live.markLive()).toThrow("markLive() não é permitido em LIVE");

    live.finish();
    expect(() => live.fail("tarde demais")).toThrow(
      "fail() não é permitido em ENDED; esperado: CREATED ou LIVE",
    );
  });

  it("só tem mídia pronta enquanto está no ar (regra 8 do v3)", () => {
    const live = newLiveStream();
    live.applyModeration(ModerationResult.APPROVED);
    expect(live.isMediaReady()).toBe(false);

    live.markLive();
    expect(live.isMediaReady()).toBe(true);
    live.publish();
    expect(live.isPublished()).toBe(true);

    live.finish();
    expect(live.isMediaReady()).toBe(false);
  });

  it.each([
    ["finish()", (l: LiveStream) => l.finish()],
    ["fail()", (l: LiveStream) => l.fail("encoder desconectado")],
  ])("%s tira do ar a live que estava publicada (F6 vale enquanto publicada)", (_, end) => {
    const live = newLiveStream();
    live.applyModeration(ModerationResult.APPROVED);
    live.markLive();
    live.publish();

    end(live);

    expect(live.isPublished()).toBe(false);
    expect(live.moderationStatus).toBe(ModerationResult.APPROVED);
  });
});
