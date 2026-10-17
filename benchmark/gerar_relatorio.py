"""Orquestra o benchmark do Builder (padrão × instanciação manual) e gera o relatório.

Fluxo:
    1. executa `bench/isolado.ts` — **um braço por processo**, com a ordem dos braços
       sorteada a cada repetição — e guarda as medianas brutas em CSV;
    2. agrega (mediana, quartis, razão e IC por bootstrap);
    3. desenha os gráficos em `relatorio/graficos/`;
    4. escreve `relatorio/relatorio-benchmark.md` com todos os números.

Tempo e memória são medidos em fases separadas porque pedem configurações do Node
incompatíveis entre si:

- **tempo**: flags padrão do V8, para que o custo de coleta de lixo faça parte da medida;
- **memória**: semi-space grande (`SEMI_SPACE_MB`), para que nenhuma coleta aconteça
  durante a rodada. Sem isso `heapUsed` antes/depois não mede alocação: coletas no meio
  da rodada liberam memória e o braço que aloca menos pode aparecer como o maior.
  Uma medida só é aceita quando a alocação da rodada cabe com folga no semi-space.

Nenhum número do relatório é digitado à mão: tudo sai do CSV de medições brutas.

Uso:
    uv run python gerar_relatorio.py                  # mede e gera o relatório
    uv run python gerar_relatorio.py --reusar         # só reagrega o CSV já existente
    uv run python gerar_relatorio.py --repeticoes 5 --ns 1000,10000   # execução rápida
"""

from __future__ import annotations

import argparse
import csv
import json
import platform
import random
import statistics
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = Path(__file__).resolve().parent / "relatorio"
GRAFICOS = SAIDA / "graficos"
CSV_BRUTO = SAIDA / "builder-isolado-brutos.csv"
RELATORIO = SAIDA / "relatorio-benchmark.md"

CENARIO = "builder"
BRACOS = ("manual", "builder-novo", "builder-reutilizado")
ROTULOS = {
    "manual": "Instanciação manual (sem validação)",
    "builder-novo": "Builder (instância nova)",
    "builder-reutilizado": "Builder (reutilizado, reset())",
}
CORES = {
    "manual": "#6b7280",
    "builder-novo": "#2563eb",
    "builder-reutilizado": "#16a34a",
}

NS_PADRAO = (1_000, 10_000, 100_000, 1_000_000)
REPETICOES_PADRAO = 15
RODADAS = 10
SEMENTE = 20261017
SEMI_SPACE_MB = 128
# Alocação por rodada acima disso já pode ter disparado coleta: medida descartada.
LIMITE_ALOCACAO = 0.5 * SEMI_SPACE_MB * 1024 * 1024
NODE = "/usr/bin/node"


def rodar_braco(braco: str, n: int, extras: list[str]) -> dict:
    """Mede um braço em um processo próprio e devolve o JSON de `bench/isolado.ts`."""
    cmd = [NODE, "--expose-gc", *extras, "--import", "tsx", "bench/isolado.ts"]
    cmd += [CENARIO, braco, str(n), str(RODADAS)]
    saida = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, check=True)
    resultado = json.loads(saida.stdout.strip().splitlines()[-1])
    if not resultado["gcAvailable"]:
        raise RuntimeError("gc() indisponível: a medida de memória seria inválida")
    return resultado


def medir(ns: tuple[int, ...], repeticoes: int) -> list[dict]:
    """Executa as duas fases e devolve uma linha por (fase, N, repetição, braço)."""
    sorteio = random.Random(SEMENTE)
    linhas: list[dict] = []
    fases = (
        ("tempo", [], ns),
        (
            "memoria",
            [
                f"--min-semi-space-size={SEMI_SPACE_MB}",
                f"--max-semi-space-size={SEMI_SPACE_MB}",
            ],
            tuple(n for n in ns if n <= 100_000),
        ),
    )
    for fase, extras, ns_fase in fases:
        for n in ns_fase:
            for rep in range(repeticoes):
                ordem = list(BRACOS)
                sorteio.shuffle(
                    ordem
                )  # ordem sorteada: remove o viés de ordem entre braços
                for posicao, braco in enumerate(ordem):
                    r = rodar_braco(braco, n, extras)
                    linhas.append(
                        {
                            "fase": fase,
                            "n": n,
                            "repeticao": rep,
                            "posicao_na_ordem": posicao,
                            "braco": braco,
                            "mediana_duracao_ms": r["medianDurationMs"],
                            "mediana_heap_bytes": r["medianHeapDeltaBytes"],
                            "node": r["nodeVersion"],
                        }
                    )
                print(f"  {fase} N={n} repetição {rep + 1}/{repeticoes}", flush=True)
    return linhas


def salvar_csv(linhas: list[dict]) -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    with CSV_BRUTO.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0]))
        w.writeheader()
        w.writerows(linhas)


def carregar_csv() -> list[dict]:
    with CSV_BRUTO.open(encoding="utf-8") as f:
        return [
            {
                **l,
                "n": int(l["n"]),
                "repeticao": int(l["repeticao"]),
                "mediana_duracao_ms": float(l["mediana_duracao_ms"]),
                "mediana_heap_bytes": float(l["mediana_heap_bytes"]),
            }
            for l in csv.DictReader(f)
        ]


def quartis(valores: list[float]) -> tuple[float, float, float]:
    q1, q2, q3 = statistics.quantiles(valores, n=4, method="inclusive")
    return q1, q2, q3


def serie(linhas: list[dict], fase: str, n: int, braco: str, campo: str) -> list[float]:
    """Valores por repetição, em ordem de repetição (permite pareamento)."""
    sel = [l for l in linhas if (l["fase"], l["n"], l["braco"]) == (fase, n, braco)]
    return [l[campo] for l in sorted(sel, key=lambda l: l["repeticao"])]


def bootstrap_mediana(
    valores: list[float], reamostragens: int = 10_000
) -> tuple[float, float]:
    """IC 95% da mediana por bootstrap; semente fixa para o relatório ser reproduzível."""
    rng = random.Random(SEMENTE)
    k = len(valores)
    medianas = sorted(
        statistics.median(rng.choices(valores, k=k)) for _ in range(reamostragens)
    )
    return medianas[int(0.025 * reamostragens)], medianas[
        int(0.975 * reamostragens) - 1
    ]


def ns_da_fase(linhas: list[dict], fase: str) -> list[int]:
    return sorted({l["n"] for l in linhas if l["fase"] == fase})


def ambiente() -> dict:
    cpu = "desconhecida"
    try:
        for linha in Path("/proc/cpuinfo").read_text().splitlines():
            if linha.startswith("model name"):
                cpu = linha.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    return {
        "cpu": cpu,
        "nucleos_logicos": str(__import__("os").cpu_count()),
        "sistema": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
    }


def grafico_tempo(linhas: list[dict]) -> None:
    ns = ns_da_fase(linhas, "tempo")
    fig, ax = plt.subplots(figsize=(7, 4.2))
    for braco in BRACOS:
        med, inf, sup = [], [], []
        for n in ns:
            por_instancia = [
                v / n * 1e6
                for v in serie(linhas, "tempo", n, braco, "mediana_duracao_ms")
            ]
            q1, q2, q3 = quartis(por_instancia)
            med.append(q2)
            inf.append(q2 - q1)
            sup.append(q3 - q2)
        ax.errorbar(
            ns,
            med,
            yerr=[inf, sup],
            marker="o",
            capsize=3,
            label=ROTULOS[braco],
            color=CORES[braco],
        )
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("N (instâncias por rodada)")
    ax.set_ylabel("tempo por instância (ns)")
    ax.set_title(
        "Tempo por instância — mediana e intervalo interquartil entre processos"
    )
    ax.grid(alpha=0.3, which="both")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(GRAFICOS / "tempo-por-instancia.png", dpi=150)
    plt.close(fig)


def memoria_valida(linhas: list[dict], n: int, braco: str) -> bool:
    v = serie(linhas, "memoria", n, braco, "mediana_heap_bytes")
    return (
        bool(v) and statistics.median(v) < LIMITE_ALOCACAO and statistics.median(v) > 0
    )


def grafico_memoria(linhas: list[dict]) -> None:
    ns = [
        n
        for n in ns_da_fase(linhas, "memoria")
        if all(memoria_valida(linhas, n, b) for b in BRACOS)
    ]
    if not ns:
        return
    fig, ax = plt.subplots(figsize=(7, 4.2))
    largura = 0.8 / len(BRACOS)
    for i, braco in enumerate(BRACOS):
        pos = [k + (i - 1) * largura for k in range(len(ns))]
        med = [
            statistics.median(serie(linhas, "memoria", n, braco, "mediana_heap_bytes"))
            / n
            for n in ns
        ]
        ax.bar(pos, med, width=largura, label=ROTULOS[braco], color=CORES[braco])
    ax.set_xticks(range(len(ns)))
    ax.set_xticklabels([f"{n:,}".replace(",", ".") for n in ns])
    ax.set_xlabel("N (instâncias por rodada)")
    ax.set_ylabel("bytes alocados por instância")
    ax.set_title("Memória por instância (sem coleta de lixo durante a rodada)")
    ax.set_ylim(
        top=ax.get_ylim()[1] * 1.25
    )  # folga para a legenda não cobrir as barras
    ax.grid(alpha=0.3, axis="y")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(GRAFICOS / "memoria-por-instancia.png", dpi=150)
    plt.close(fig)


def grafico_dispersao(linhas: list[dict]) -> None:
    n = (
        100_000
        if 100_000 in ns_da_fase(linhas, "tempo")
        else ns_da_fase(linhas, "tempo")[-1]
    )
    dados = [
        [v / n * 1e6 for v in serie(linhas, "tempo", n, b, "mediana_duracao_ms")]
        for b in BRACOS
    ]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.boxplot(dados, tick_labels=[ROTULOS[b] for b in BRACOS], showmeans=False)
    ax.set_ylabel("tempo por instância (ns)")
    ax.set_title(f"Dispersão entre processos — N = {n:,}".replace(",", "."))
    ax.tick_params(axis="x", labelsize=7)
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(GRAFICOS / "dispersao-n-maior.png", dpi=150)
    plt.close(fig)


def fmt(x: float, casas: int = 1) -> str:
    return f"{x:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def tabela_tempo(linhas: list[dict]) -> str:
    cab = "| N | Braço | Mediana (ns/instância) | Intervalo interquartil | Razão sobre o manual |\n| --- | --- | --- | --- | --- |\n"
    corpo = []
    for n in ns_da_fase(linhas, "tempo"):
        manual = statistics.median(
            serie(linhas, "tempo", n, "manual", "mediana_duracao_ms")
        )
        for braco in BRACOS:
            v = [
                x / n * 1e6
                for x in serie(linhas, "tempo", n, braco, "mediana_duracao_ms")
            ]
            q1, q2, q3 = quartis(v)
            razao = (
                statistics.median(
                    serie(linhas, "tempo", n, braco, "mediana_duracao_ms")
                )
                / manual
            )
            corpo.append(
                f"| {n} | `{braco}` | {fmt(q2)} | {fmt(q1)} – {fmt(q3)} | {fmt(razao)}× |"
            )
    return cab + "\n".join(corpo) + "\n"


def tabela_pareada(linhas: list[dict]) -> tuple[str, list[str]]:
    """Razões pareadas (mesma repetição) com IC 95% por bootstrap e leitura condicional."""
    cab = "| N | Comparação | Razão mediana pareada | IC 95% | Pares em que a razão ficou abaixo de 1 |\n| --- | --- | --- | --- | --- |\n"
    corpo, leituras = [], []
    pares = (
        ("builder-novo", "manual", "custo do padrão"),
        ("builder-reutilizado", "builder-novo", "D6 (reaproveitar o builder)"),
    )
    for n in ns_da_fase(linhas, "tempo"):
        for a, b, nome in pares:
            va = serie(linhas, "tempo", n, a, "mediana_duracao_ms")
            vb = serie(linhas, "tempo", n, b, "mediana_duracao_ms")
            razoes = [x / y for x, y in zip(va, vb, strict=True)]
            med = statistics.median(razoes)
            lo, hi = bootstrap_mediana(razoes)
            menores = sum(1 for r in razoes if r < 1)
            corpo.append(
                f"| {n} | `{a}` ÷ `{b}` | {fmt(med, 2)}× | {fmt(lo, 2)} – {fmt(hi, 2)} | {menores} de {len(razoes)} |"
            )
            if n == max(ns_da_fase(linhas, "tempo")):
                if lo <= 1 <= hi:
                    leituras.append(
                        f"- **{nome}**, N = {n}: IC 95% da razão contém 1 — **sem diferença mensurável** nesta execução."
                    )
                else:
                    sentido = "mais lento" if med > 1 else "mais rápido"
                    leituras.append(
                        f"- **{nome}**, N = {n}: `{a}` ficou {sentido} que `{b}` em {fmt(abs(med - 1) * 100)}% (IC 95% da razão: {fmt(lo, 2)} – {fmt(hi, 2)})."
                    )
    return cab + "\n".join(corpo) + "\n", leituras


def tabela_memoria(linhas: list[dict]) -> str:
    cab = "| N | Braço | Bytes por instância (mediana) | Intervalo interquartil | Validade |\n| --- | --- | --- | --- | --- |\n"
    corpo = []
    for n in ns_da_fase(linhas, "memoria"):
        for braco in BRACOS:
            v = [
                x / n for x in serie(linhas, "memoria", n, braco, "mediana_heap_bytes")
            ]
            q1, q2, q3 = quartis(v)
            ok = (
                "válida"
                if memoria_valida(linhas, n, braco)
                else "descartada (coleta provável)"
            )
            corpo.append(
                f"| {n} | `{braco}` | {fmt(q2, 0)} | {fmt(q1, 0)} – {fmt(q3, 0)} | {ok} |"
            )
    return cab + "\n".join(corpo) + "\n"


def escrever_relatorio(linhas: list[dict], repeticoes: int) -> None:
    amb = ambiente()
    nos = sorted({l["node"] for l in linhas})
    ns_t = ns_da_fase(linhas, "tempo")
    ns_m = ns_da_fase(linhas, "memoria")
    pareada, leituras = tabela_pareada(linhas)
    n_ref = (
        max(n for n in ns_m if all(memoria_valida(linhas, n, b) for b in BRACOS))
        if any(all(memoria_valida(linhas, n, b) for b in BRACOS) for n in ns_m)
        else None
    )
    leitura_mem = ""
    if n_ref is not None:
        m = {
            b: statistics.median(
                serie(linhas, "memoria", n_ref, b, "mediana_heap_bytes")
            )
            / n_ref
            for b in BRACOS
        }
        leitura_mem = (
            f"Com N = {n_ref}, a mediana foi de **{fmt(m['builder-novo'], 0)} B** por instância no `builder-novo`, "
            f"**{fmt(m['builder-reutilizado'], 0)} B** no `builder-reutilizado` e **{fmt(m['manual'], 0)} B** no `manual`. "
            f"O Builder novo aloca {fmt(m['builder-novo'] / m['manual'])}× o que a instanciação manual aloca; "
            "a diferença é o objeto do próprio builder e os campos que ele acumula antes de `build()`."
        )
    texto = f"""# Benchmark do Builder — tempo e memória (padrão × instanciação manual)

> Relatório **gerado** por [`gerar_relatorio.py`](../gerar_relatorio.py) a partir das medições brutas em [`builder-isolado-brutos.csv`](builder-isolado-brutos.csv). Nenhum número deste arquivo foi digitado à mão. Para refazer: `cd benchmark && uv run python gerar_relatorio.py`.

Complementa a [análise do Heitor](analise-builder.md) (investigação do resultado preliminar sobre D6) com: variação por N, memória medida sem coleta de lixo durante a rodada e gráficos.

## Pergunta

Quanto custa, em tempo e memória, montar um `StreamConfig` pelo Builder em comparação com a instanciação manual, e como esse custo varia com o número de instâncias?

## Ambiente

| Item | Valor |
| --- | --- |
| CPU | {amb["cpu"]} ({amb["nucleos_logicos"]} threads) |
| Sistema | {amb["sistema"]} |
| Node | {", ".join(nos)} (`--expose-gc`) |
| Python | {amb["python"]} |
| Data | {datetime.now().astimezone().strftime("%d/%m/%Y")} |
| N (tempo) | {", ".join(str(n) for n in ns_t)} |
| N (memória) | {", ".join(str(n) for n in ns_m)} |
| Repetições | {repeticoes} processos por braço e por N; cada processo faz {RODADAS} rodadas e informa a mediana |
| Semente | {SEMENTE} (ordem dos braços e bootstrap) |

## Método

1. **Um braço por processo** (`bench/isolado.ts`), com a ordem dos três braços **sorteada a cada repetição**. Assim nenhum braço herda o JIT, o heap ou a frequência de CPU do anterior.
2. **Tempo** com as flags padrão do V8, para que o custo de coleta de lixo conte.
3. **Memória** em fase separada, com semi-space de {SEMI_SPACE_MB} MB (`--min/--max-semi-space-size`), de modo que nenhuma coleta ocorra durante a rodada e `heapUsed` antes/depois meça alocação de fato. Uma medida é descartada se a alocação da rodada passa de metade do semi-space. Por isso não há memória para os N maiores.
4. **Estatística:** mediana e intervalo interquartil **entre processos**; razões **pareadas** (mesma repetição) com IC 95% por bootstrap de 10.000 reamostragens.

Braços (definidos em [`bench/cenarios/builder.ts`](../../bench/cenarios/builder.ts)):

| Braço | O que faz |
| --- | --- |
| `manual` | Literal congelado com os mesmos campos, **sem nenhuma validação** (alternativa B do ADR-001) |
| `builder-novo` | Um `DefaultStreamConfigBuilder` por configuração, com validação em `build()` |
| `builder-reutilizado` | Um builder único com `reset()`, como o Director usa (decisão D6) |

## Resultados — tempo

{tabela_tempo(linhas)}
![Tempo por instância](graficos/tempo-por-instancia.png)

*Figura 1 — Tempo por instância em função de N (eixos logarítmicos). Barras: intervalo interquartil entre processos.*

### Razões pareadas

{pareada}
Leitura para o maior N:

{chr(10).join(leituras)}

![Dispersão entre processos](graficos/dispersao-n-maior.png)

*Figura 2 — Dispersão do tempo por instância entre processos, no maior N com tempo medido.*

## Resultados — memória

{tabela_memoria(linhas)}
{leitura_mem}

![Memória por instância](graficos/memoria-por-instancia.png)

*Figura 3 — Bytes alocados por instância, apenas nos N com medida válida.*

## Limitações

- **O braço `manual` não valida nada.** A diferença entre ele e o Builder é custo do padrão **mais** custo das regras R1–R5; este benchmark não separa as duas parcelas (separá-las exigiria reescrever as regras fora do Builder, o que o padrão existe para evitar).
- **Uma máquina, uma versão do Node, um dia.** Valores absolutos mudam com outra CPU ou outro V8; a razão entre braços tende a ser mais estável, mas isso não foi verificado em outra máquina.
- **Máquina de uso geral, sem controle de frequência da CPU.** A dispersão entre processos vem em parte disso; o pareamento reduz o efeito, não o elimina.
- **Tempo e memória vêm de configurações diferentes do V8** (flags padrão × semi-space grande). Os dois números não saem da mesma execução e não devem ser multiplicados entre si.
- **Memória só para N pequeno e médio.** Para N maiores a alocação da rodada não cabe no semi-space e a medida seria inválida; o script a descarta em vez de publicá-la.
- **Escopo:** apenas o cenário `builder`. O cenário do Factory Method ainda não existe em `bench/cenarios/`.
"""
    RELATORIO.write_text(texto, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--ns",
        default=",".join(map(str, NS_PADRAO)),
        help="valores de N, separados por vírgula",
    )
    ap.add_argument("--repeticoes", type=int, default=REPETICOES_PADRAO)
    ap.add_argument(
        "--reusar", action="store_true", help="não mede; reagrega o CSV existente"
    )
    args = ap.parse_args()

    GRAFICOS.mkdir(parents=True, exist_ok=True)
    if args.reusar:
        linhas = carregar_csv()
        repeticoes = max(l["repeticao"] for l in linhas) + 1
    else:
        ns = tuple(int(x) for x in args.ns.split(","))
        print(
            f"medindo: N={ns}, {args.repeticoes} repetições, braços em ordem sorteada"
        )
        linhas = medir(ns, args.repeticoes)
        salvar_csv(linhas)
        repeticoes = args.repeticoes

    grafico_tempo(linhas)
    grafico_memoria(linhas)
    grafico_dispersao(linhas)
    escrever_relatorio(linhas, repeticoes)
    print(f"relatório: {RELATORIO}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
