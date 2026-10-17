# Relatório de benchmark (Python)

**Estado:** implementado para o cenário `builder`. Cenário do Factory Method pendente (escopo do Matheus).

`gerar_relatorio.py` mede, agrega, desenha e escreve o relatório. Resultado: [`relatorio/relatorio-benchmark.md`](relatorio/relatorio-benchmark.md).

```bash
uv sync                                    # cria o ambiente com matplotlib
uv run python gerar_relatorio.py           # mede (≈ 10 min) e gera o relatório
uv run python gerar_relatorio.py --reusar  # só reagrega o CSV já medido
uv run python gerar_relatorio.py --repeticoes 3 --ns 1000,10000   # execução rápida
uv run ruff check . && uv run ruff format .
```

## O que o script faz

1. Chama `bench/isolado.ts` — **um braço por processo**, ordem dos braços sorteada a cada repetição (semente fixa) — e grava as medianas brutas em `relatorio/builder-isolado-brutos.csv`.
2. **Tempo** com as flags padrão do V8; **memória** em fase separada, com semi-space grande, para que nenhuma coleta de lixo ocorra durante a rodada. Medida de memória cuja alocação não cabe no semi-space é descartada.
3. Agrega: mediana e intervalo interquartil entre processos; razões pareadas com IC 95% por bootstrap.
4. Gera `relatorio/graficos/*.png` e `relatorio/relatorio-benchmark.md`. Nenhum número do relatório é digitado à mão.

Complementa [`relatorio/analise-builder.md`](relatorio/analise-builder.md), a investigação do resultado preliminar sobre a decisão D6.

Todo número publicado registra: máquina, versão do Node, N, quantidade de repetições e data da execução.
