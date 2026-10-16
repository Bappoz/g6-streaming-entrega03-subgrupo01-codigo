import { ContentVisibility, LatencyMode } from "../../src/criacionais/builder";
import {
  BlocklistPolicyService,
  Clip,
  ClipCreator,
  type ClipRequestInput,
  type ContentRepository,
  LiveStream,
  ModerationResult,
  RecordedVideo,
  type UserContent,
} from "../../src/criacionais/factory-method";
import type { Scenario } from "../measure";

/**
 * Cenário do Factory Method: quanto custa criar e registrar um `Clip` pelo padrão.
 *
 * Dois braços que fazem **exatamente o mesmo trabalho** — buscar a gravação, construir o
 * clipe com as regras F4 e F5, persistir, moderar, publicar e persistir de novo:
 *
 * - `factory-method` — `ClipCreator.submit`, com a operação no Creator abstrato e a
 *   criação no método-fábrica da subclasse.
 * - `manual` — os mesmos passos escritos em linha, com `new Clip` direto, como ficaria
 *   cada serviço da Entrega 02 sem o padrão.
 *
 * Diferente do cenário do Builder, aqui o braço manual **não** pula validação: as regras
 * moram no produto (`Clip`), então os dois braços as executam. A diferença medida é só a
 * indireção do padrão — chamada ao método-fábrica e acesso aos colaboradores pelo Creator.
 *
 * O repositório do cenário guarda só o último conteúdo salvo. Com o repositório em
 * memória da demo, cada iteração acrescentaria um clipe ao `Map`: a memória retida e o
 * trabalho do coletor de lixo cresceriam rodada a rodada, e a medida misturaria esse
 * crescimento com o custo do padrão. O repositório falso mede a indireção neste cenário;
 * não representa o custo de uma persistência real.
 *
 * Cada braço tem **estado próprio** (repositório, política e contador de ids), criado por
 * `newArmState()`. Com estado compartilhado, o segundo braço começaria com ids maiores e
 * herdaria o último conteúdo salvo pelo primeiro — diferenças pequenas, mas do tamanho do
 * que este cenário tenta medir. Para comparar os braços, prefira `bench/isolado.ts`, um
 * braço por processo, em ordem alternada.
 */

const SOURCE_STREAM_ID = "live-bench";

function newReadyRecording(): RecordedVideo {
  const live = new LiveStream({
    id: SOURCE_STREAM_ID,
    ownerId: "criadora",
    title: "Transmissão de referência",
    visibility: ContentVisibility.PUBLIC,
    createdAt: new Date(0),
    channelId: "canal-bench",
    latencyMode: LatencyMode.STANDARD,
    recordAutomatically: true,
  });
  live.markLive();
  live.finish();
  const recording = new RecordedVideo({ id: "video-bench", createdAt: new Date(0), source: live });
  recording.markReady({
    durationSeconds: 3600,
    storageUri: "storage://bench",
    availableAt: new Date(0),
  });
  return recording;
}

/** Repositório de tamanho fixo: a gravação de origem e o último conteúdo salvo. */
class LastSavedRepository implements ContentRepository {
  private last: UserContent | undefined;

  constructor(private readonly recording: RecordedVideo) {}

  save(content: UserContent): void {
    this.last = content;
  }

  findContentById(contentId: string): UserContent | undefined {
    if (this.last?.id === contentId) {
      return this.last;
    }
    return this.recording.id === contentId ? this.recording : undefined;
  }

  findRecordingByStream(streamId: string): RecordedVideo | undefined {
    return this.recording.sourceStreamId === streamId ? this.recording : undefined;
  }
}

const REQUEST: ClipRequestInput = {
  requestedByUserId: "espectador",
  sourceStreamId: SOURCE_STREAM_ID,
  startOffsetSeconds: 1800,
  endOffsetSeconds: 1830,
  title: "Recorte de referência",
};

const FIXED_NOW = new Date(0);

/** Estado independente de um braço: nenhum braço herda ids ou conteúdo do outro. */
function newArmState() {
  const repository = new LastSavedRepository(newReadyRecording());
  const policy = new BlocklistPolicyService(repository, ["spoiler"]);
  let sequence = 0;
  const newId = (): string => `clip-${++sequence}`;
  const now = (): Date => FIXED_NOW;
  return { repository, policy, newId, now };
}

const patternArm = newArmState();
const creator = new ClipCreator(patternArm);
const manualArm = newArmState();

export const factoryMethodScenario: Scenario = {
  name: "factory-method",
  description:
    "Criação e registro de Clip pelo ClipCreator (Factory Method) contra os mesmos passos escritos em linha com new Clip.",
  caveats: [
    "Os dois braços executam as mesmas regras (F4 e F5 no construtor de Clip), a mesma moderação e as mesmas duas gravações no repositório; a diferença medida é a indireção do padrão.",
    "O repositório guarda só o último conteúdo salvo, para a memória retida não crescer com o número de clipes; não representa o custo de uma persistência real.",
    "Cada braço tem repositório, política e contador de ids próprios; para diferenças pequenas, comparar com bench/isolado.ts em ordem alternada.",
    "Medida de memória só é válida quando environment.gcAvailable é true (node --expose-gc).",
  ],
  arms: [
    {
      name: "factory-method",
      description: "ClipCreator.submit: Creator abstrato com o método-fábrica na subclasse.",
      run: () => creator.submit(REQUEST).durationSeconds,
    },
    {
      name: "manual",
      description: "Mesmos passos em linha: busca da gravação, new Clip, save, moderate, publish.",
      run: () => {
        const { repository, policy, newId, now } = manualArm;
        const source = repository.findRecordingByStream(REQUEST.sourceStreamId);
        if (source === undefined) {
          throw new Error("gravação de referência ausente");
        }
        const clip = new Clip({
          id: newId(),
          title: REQUEST.title,
          createdAt: now(),
          createdByUserId: REQUEST.requestedByUserId,
          startOffsetSeconds: REQUEST.startOffsetSeconds,
          endOffsetSeconds: REQUEST.endOffsetSeconds,
          source,
        });
        repository.save(clip);
        clip.applyModeration(policy.moderate(clip.id));
        if (clip.moderationStatus === ModerationResult.APPROVED && clip.isMediaReady()) {
          clip.publish();
        }
        repository.save(clip);
        return clip.durationSeconds;
      },
    },
  ],
};
