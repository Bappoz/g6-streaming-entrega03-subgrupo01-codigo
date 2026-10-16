# Plataforma de Streaming de Vídeo — Entrega 03 · Código

Implementação dos **Padrões de Projeto GoF** do **Grupo 06, Turma 01** — FGA0208 Arquitetura e Desenho de Software, UnB, 2026.2.

Este repositório guarda **código, testes e benchmark**. A documentação (modelos UML, relatórios, vídeos, relatos de IA Generativa) fica no repositório principal:
[2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_03](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_03) · [GitHub Pages](https://unbarqdsw2026-2-turma01.github.io/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_03/).

> **Estado:** Builder e Factory Method implementados, testados e com demonstração no terminal.

## Padrões

| Categoria | Padrão | Pasta | Estado |
| --- | --- | --- | --- |
| Criacional | Builder | [`src/criacionais/builder`](src/criacionais/builder) | Todos os participantes, demo e cenário de benchmark |
| Criacional | Factory Method | [`src/criacionais/factory-method`](src/criacionais/factory-method) | Todos os participantes, demo e cenário de benchmark |

## Pré-requisitos

- Node.js **22+** (`.nvmrc`) e npm
- Opcional: [`just`](https://github.com/casey/just) para os atalhos do `justfile`
- Só para o benchmark: [`uv`](https://docs.astral.sh/uv/) (Python 3.12)

## Uso

```bash
npm ci                       # instala as dependências travadas no package-lock.json
npm run check                # format:check → lint → typecheck → test (o mesmo que a CI roda)
npm run format               # corrige a formatação
npm run coverage             # testes + relatório de cobertura em coverage/
npm run demo:builder         # executa a demonstração do Builder
npm run demo:factory-method  # executa a demonstração do Factory Method
npm run bench                # benchmark (padrão × instanciação manual)
```

## Estrutura

```text
src/criacionais/<padrao>/   # implementação, testes (*.test.ts) e demo.ts de cada padrão
bench/                      # cenários de benchmark em TypeScript (mede tempo e heap)
benchmark/                  # projeto Python (uv): orquestra as execuções, gera gráficos e relatório
docs/adr/                   # Architecture Decision Records
.github/workflows/ci.yml    # format:check → lint → typecheck → coverage em todo PR
```

## Ferramentas

| Finalidade | Ferramenta |
| --- | --- |
| Linguagem | TypeScript (modo `strict`) |
| Execução das demos | `tsx` |
| Testes e cobertura | Vitest + `@vitest/coverage-v8` |
| Formatação e lint | Biome |
| Benchmark | Node (`--expose-gc`) + Python/matplotlib via `uv` |
| CI | GitHub Actions |

## Como contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md): branch por tarefa, Conventional Commits e PR revisado por um integrante da outra dupla.
