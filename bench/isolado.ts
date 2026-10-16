import { builderScenario } from "./cenarios/builder";
import { factoryMethodScenario } from "./cenarios/factory-method";
import { DEFAULT_OPTIONS, measureArm, type Scenario } from "./measure";

/**
 * Mede **um** braço em um processo próprio e imprime uma linha JSON com a mediana.
 *
 * Existe porque `run.ts` mede os braços em sequência dentro do mesmo processo, e aí a
 * comparação entre eles carrega junto o estado do JIT, do heap e da frequência da CPU
 * deixado pelo braço anterior. Para comparar dois braços com diferença pequena, o
 * procedimento é chamar este script várias vezes, alternando a ordem dos braços em
 * ordem aleatória, e comparar as medianas par a par (ver `benchmark/relatorio/`).
 *
 * Uso:
 *   node --expose-gc --import tsx bench/isolado.ts <cenario> <braco> [iterações] [rodadas]
 */
const SCENARIOS: readonly Scenario[] = [builderScenario, factoryMethodScenario];

const [scenarioName, armName, rawIterations, rawRounds] = process.argv.slice(2);
const scenario = SCENARIOS.find((candidate) => candidate.name === scenarioName);
const arm = scenario?.arms.find((candidate) => candidate.name === armName);
if (arm === undefined) {
  throw new Error(`braço desconhecido: ${scenarioName ?? "nada"}/${armName ?? "nada"}`);
}

const options = {
  iterations: Number(rawIterations ?? DEFAULT_OPTIONS.iterations),
  rounds: Number(rawRounds ?? DEFAULT_OPTIONS.rounds),
  warmupIterations: DEFAULT_OPTIONS.warmupIterations,
};
const result = measureArm(arm, options);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

console.log(
  JSON.stringify({
    scenario: scenarioName,
    arm: armName,
    options,
    nodeVersion: process.version,
    gcAvailable: typeof (globalThis as { gc?: unknown }).gc === "function",
    medianDurationMs: median(result.samples.map((sample) => sample.durationMs)),
    medianHeapDeltaBytes: median(result.samples.map((sample) => sample.heapDeltaBytes)),
  }),
);
