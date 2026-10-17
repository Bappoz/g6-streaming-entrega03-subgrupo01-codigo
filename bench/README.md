# Cenários de benchmark (TypeScript)

**Estado:** medidor e cenário do Builder implementados. Cenário do Factory Method pendente (escopo do Matheus).

Ponto de entrada: `bench/run.ts` (`npm run bench`).

```bash
npm run bench                             # todos os cenários, parâmetros padrão
npm run bench -- --scenario builder       # um cenário
npm run bench -- --iterations 50000 --rounds 5 --warmup 5000
```

## O que é medido

Cada cenário tem **braços**: formas diferentes de produzir o mesmo resultado. Cada braço roda em rodadas independentes e cada rodada registra:

- duração da rodada (`performance.now()`);
- variação do heap (`process.memoryUsage().heapUsed`), com `global.gc()` antes — por isso o script roda com `--expose-gc`.

A saída é JSON **bruto**, uma amostra por rodada, em `benchmark/resultados/<cenario>.json` (ignorado pelo git). Quem agrega, calcula estatística e gera gráficos é o projeto Python em [`../benchmark`](../benchmark).

## Decisões do medidor

| Decisão | Motivo |
| --- | --- |
| Rodadas independentes, não uma execução longa | Uma medição única devolve um número que não dá para checar; é a dispersão entre rodadas que diz se a diferença entre braços significa algo |
| Nenhuma média calculada aqui | Estatística dos dois lados produziria número no relatório sem rastro até a medição |
| Aquecimento descartado | As primeiras execuções pagam compilação do JIT e seriam atribuídas ao padrão |
| `gcAvailable: false` quando falta `--expose-gc` | Marcar a medida como inutilizável é melhor que publicar um número de memória sem sentido |
| Checksum acumulado | Impede que o motor elimine código cujo resultado ninguém usa |
| Ressalvas dentro do JSON (`caveats`) | A ressalva viaja junto com o dado até o relatório |

## Comparar braços com diferença pequena

`run.ts` mede os braços em sequência no mesmo processo, então cada braço herda o estado de JIT, heap e CPU deixado pelo anterior. Para diferenças pequenas, use `bench/isolado.ts`, que mede **um** braço por processo, e compare em pares de ordem sorteada:

```bash
node --expose-gc --import tsx bench/isolado.ts builder builder-novo
node --expose-gc --import tsx bench/isolado.ts builder builder-reutilizado
```

O procedimento completo e um exemplo de leitura estão em [`benchmark/relatorio/analise-builder.md`](../benchmark/relatorio/analise-builder.md).

## Como acrescentar um cenário

1. Crie `bench/cenarios/<padrao>.ts` exportando um `Scenario`.
2. Registre-o na lista `SCENARIOS` em `bench/run.ts` — um import e uma linha, sem tocar no arquivo do outro padrão.
3. Descreva em `caveats` tudo que o relatório precisa repetir sobre a comparação.

## Cenário `builder`

Três braços: `builder-novo` (uma instância por configuração), `builder-reutilizado` (uma instância com `reset()`, como o Director usa — decisão D6 do ADR-001) e `manual` (literal congelado, sem validação — alternativa B do ADR).

**Ressalva principal:** o braço `manual` não valida nada, então a diferença medida é custo do padrão **mais** custo da validação. Separar as parcelas exigiria um quarto braço com validação inline, que reescreveria R1–R5 em um segundo lugar — o que o padrão existe para evitar.

A leitura dos números e a conclusão estão em [`benchmark/relatorio/`](../benchmark/relatorio): a investigação de D6 (Heitor) e o relatório de tempo e memória por N, gerado por `benchmark/gerar_relatorio.py`. Este diretório só produz o dado.
