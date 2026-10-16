import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builderScenario } from "./cenarios/builder";
import { factoryMethodScenario } from "./cenarios/factory-method";
import { DEFAULT_OPTIONS, type MeasureOptions, type Scenario, runScenario } from "./measure";

/**
 * Ponto de entrada do benchmark (`npm run bench`).
 *
 * Os cenários ficam em um registro, um arquivo por cenário: assim o cenário do Factory
 * Method entra com um import e uma linha nesta lista, sem ninguém editar o arquivo do
 * outro padrão. O conflito de merge entre as duas duplas fica reduzido a essa linha.
 *
 * A saída é JSON bruto, uma amostra por rodada, sem média nem gráfico. Quem agrega é o
 * projeto Python em `benchmark/`; manter a estatística de um lado só evita que o
 * relatório mostre um número que ninguém consegue rastrear até a medição.
 *
 * Uso:
 *   npm run bench                        # todos os cenários, parâmetros padrão
 *   npm run bench -- --scenario builder  # um cenário
 *   npm run bench -- --iterations 50000 --rounds 5
 */

const SCENARIOS: readonly Scenario[] = [builderScenario, factoryMethodScenario];

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "benchmark", "resultados");

/** Lê um argumento numérico da linha de comando, recusando valor que não serve. */
function readNumber(args: readonly string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  const raw = args[index + 1];
  const value = Number(raw);
  if (raw === undefined || !Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} exige um inteiro positivo (recebido: ${raw ?? "nada"})`);
  }
  return value;
}

function selectScenarios(args: readonly string[]): readonly Scenario[] {
  const index = args.indexOf("--scenario");
  if (index === -1) {
    return SCENARIOS;
  }

  const name = args[index + 1];
  const scenario = SCENARIOS.find((candidate) => candidate.name === name);
  if (scenario === undefined) {
    const disponiveis = SCENARIOS.map((candidate) => candidate.name).join(", ");
    throw new Error(`cenário desconhecido: ${name ?? "nada"}. Disponíveis: ${disponiveis}`);
  }
  return [scenario];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: MeasureOptions = {
    iterations: readNumber(args, "--iterations", DEFAULT_OPTIONS.iterations),
    rounds: readNumber(args, "--rounds", DEFAULT_OPTIONS.rounds),
    warmupIterations: readNumber(args, "--warmup", DEFAULT_OPTIONS.warmupIterations),
  };

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const scenario of selectScenarios(args)) {
    console.log(
      `cenário "${scenario.name}": ${scenario.arms.length} braços × ${options.rounds} rodadas × ${options.iterations} iterações`,
    );

    const result = runScenario(scenario, options);

    if (!result.environment.gcAvailable) {
      console.warn(
        "  aviso: sem --expose-gc; as medidas de memória deste arquivo não são confiáveis",
      );
    }

    const destino = join(OUTPUT_DIR, `${scenario.name}.json`);
    await writeFile(destino, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    for (const arm of result.arms) {
      const duracoes = arm.samples.map((sample) => sample.durationMs);
      const menor = Math.min(...duracoes);
      console.log(`  ${arm.name.padEnd(20)} melhor rodada: ${menor.toFixed(2)} ms`);
    }
    console.log(`  resultados em ${destino}`);
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
