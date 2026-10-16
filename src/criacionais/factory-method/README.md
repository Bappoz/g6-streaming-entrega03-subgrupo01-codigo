# Factory Method — criação de conteúdo do usuário

**Estado:** todos os participantes implementados e testados; `npm run demo:factory-method` roda a demonstração.

Modelagem e decisão completas no repositório de documentação: [Modelagem — Factory Method](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_03/blob/main/docs/Base/Relat%C3%B3rios/1.1.1.SubEquipe_01/1.1.1.3.ModelagemFactoryMethod.md) · [ADR-002](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_03/blob/main/docs/Base/Relat%C3%B3rios/1.1.1.SubEquipe_01/ADR/ADR-002-factory-method-user-content.md).

**Problema.** Na Entrega 02, `LiveStream`, `RecordedVideo` e `Clip` herdam de `UserContent` (decisão DE03) e nascem em pontos distintos do fluxo `LiveStream → RecordedVideo → ClipRequest → Clip` (`LiveStreamService`, `MediaProcessingService`, `ClipService`). Depois de criados, os três passam pelo mesmo caminho: persistir, moderar e publicar quando a regra 8 do v3 permite. Sem o padrão, esse caminho fica copiado em cada serviço ou centralizado num `switch` sobre o tipo, que conhece todas as classes concretas e precisa ser editado a cada tipo novo.

## Participantes

| Participante GoF | Elemento | Arquivo |
| --- | --- | --- |
| Product | `UserContent` (abstrata) | `user-content.ts` |
| ConcreteProduct | `LiveStream`, `RecordedVideo`, `Clip` | `live-stream.ts`, `recorded-video.ts`, `clip.ts` |
| Creator | `UserContentCreator<TInput, TContent>` — método-fábrica `createContent` e operação `submit` | `user-content-creator.ts` |
| ConcreteCreator | `LiveStreamCreator`, `RecordedVideoCreator`, `ClipCreator` | `live-stream-creator.ts`, `recorded-video-creator.ts`, `clip-creator.ts` |
| Client | função `registrar` da demonstração | `demo.ts` |

Apoio: `enums.ts` (vocabulário do v3), `errors.ts` (`ContentRuleViolationError`), `ports.ts` (`ContentRepository` e `PolicyService`, decisão DE09), `in-memory.ts` (adaptadores para demo e testes), `index.ts` (API pública do padrão).

| ConcreteCreator | Substitui, no diagrama v3 | Entrada | Produto nasce em |
| --- | --- | --- | --- |
| `LiveStreamCreator` | `LiveStreamService.createStream(userId, config)` | dono, canal e `StreamConfig` do Builder | `CREATED` (mídia não pronta) |
| `RecordedVideoCreator` | `MediaProcessingService.persistRecording(streamId)` | id da transmissão | `PROCESSING` (mídia não pronta) |
| `ClipCreator` | extração coordenada pelo `ClipService` | `ClipRequestInput` do v3 | pronto para publicar |

## Como funciona

`submit(input)` é escrito uma vez, no Creator, só com o tipo `UserContent`:

1. `createContent(input)` — o método-fábrica, única linha que depende da subclasse;
2. `repository.save(content)` — antes de moderar, porque `PolicyService.moderate` recebe o **id** no diagrama v3;
3. `content.applyModeration(policy.moderate(content.id))`;
4. `content.publish()` se a moderação aprovou **e** a mídia está pronta (regra F6); senão, o conteúdo fica registrado e fora do ar, sem erro;
5. `repository.save(content)` de novo.

Se a política ou o segundo `save` lançar erro, o erro sobe e o conteúdo fica registrado como no primeiro `save`: moderação `PENDING`, fora do ar. É um estado válido do modelo e pode ser moderado de novo pelo id; não há transação, e repetir o `submit` cria outro conteúdo.

F6 vale enquanto o conteúdo está publicado, não só no instante de publicar: um veredito diferente de `APPROVED` despublica, e `LiveStream.finish()`/`fail()` também.

O que muda entre os tipos entra por dois pontos: o método-fábrica (qual classe e de onde vêm os dados) e o gancho `isMediaReady()` de cada produto (o que "mídia pronta" quer dizer para uma live, uma gravação e um clipe).

## Regras

Cada mensagem de erro começa pelo id da regra, o elo entre a falha no terminal e o ADR-002. O prefixo `F` evita confusão com `R1`–`R5` do Builder.

| Id | Regra | Origem | Onde vive |
| --- | --- | --- | --- |
| F1 | Título não vazio | Decisão de projeto (simétrica à R1) | construtor de `UserContent` |
| F2 | Gravação só nasce de transmissão existente, encerrada (`ENDED`) e com gravação automática; uma gravação por transmissão | Regra 2 da nota "Regras do fluxo de clipes" (v3) e máquina M4 da Entrega 02; unicidade é decisão de projeto | `RecordedVideoCreator` (existência, unicidade) e construtor de `RecordedVideo` |
| F3 | `READY` exige duração, `storageUri` e `availableAt` | Regra 9 (v3), sem o manifesto; duração positiva e data válida são refinamentos | `RecordedVideo.markReady` |
| F4 | Clipe só nasce de gravação `READY` da transmissão | Regra 1 (v3) | `ClipCreator` (existência) e construtor de `Clip` |
| F5 | `0 ≤ início < fim ≤ duração da gravação` | Regra 4 (v3) | construtor de `Clip` |
| F6 | Publicar exige moderação `APPROVED` e mídia pronta | Regra 8 (v3) | `UserContent.publish` |

A regra 7 do v3 (preservar o dono da origem; `createdByUserId` é quem pediu o corte) não tem id porque não é verificada: é garantida pela construção. `RecordedVideo` e `Clip` recebem a **origem inteira**, e não um `ownerId`, e copiam dela o dono.

## Como a estrutura dos arquivos foi decidida

- **Um arquivo por participante**, como no Builder: quem lê o diagrama de classes acha o arquivo pelo nome da classe.
- **As regras moram no produto, a busca da origem no criador.** O construtor de `Clip` recebe a gravação e confere F4 e F5 sozinho; o `ClipCreator` só sabe onde encontrar essa gravação. Assim nem um `new Clip` escrito fora do padrão consegue criar um clipe inválido.
- **`ContentVisibility` e `LatencyMode` importados da API do Builder** (`../builder`), não duplicados: duas enumerações iguais em pastas diferentes seriam tipos incompatíveis para o TypeScript, e a `StreamConfig` do Builder não poderia alimentar a `LiveStream`. A promoção para um módulo compartilhado continua sendo decisão das duas duplas, como registra o README do Builder.
- **`newId` e `now` injetáveis no Creator**, com UUID e relógio do sistema como padrão: os testes e a demo fixam ids legíveis sem mexer no padrão.

## Limites declarados

- **Entrada tipada no método-fábrica.** No GoF, `FactoryMethod()` não recebe parâmetros; aqui cada tipo precisa de entradas diferentes, então o Creator é genérico em `TInput`. É uma adaptação tipada, não a variante de métodos-fábrica parametrizados do GoF (em que o parâmetro escolhe o produto): o parâmetro só carrega dados e quem decide a classe continua sendo a subclasse. Por isso os criadores não são intercambiáveis entre si; o comum é `submit` e o retorno `UserContent`.
- **Manifesto da gravação.** A regra 9 do v3 também exige manifesto para `READY`; `MediaManifest` (DE08) não é representado, porque a entrega de mídia está fora do escopo do padrão de criação.
- **Pedido de clipe antes da gravação.** No v3, o `ClipRequest` espera em `WAITING_RECORDING` até o evento `RecordingAvailable` (DE04, DE05). Aqui o pedido sem gravação pronta é recusado com F4: fila e reprocessamento são do `ClipService`, fora do escopo de um padrão de criação.
- **Construtores públicos.** Como `StreamConfig.fromBuilder` no Builder, nada impede um `new LiveStream(...)` fora do criador; TypeScript não tem visibilidade de pacote. O que o padrão garante é o caminho comum de `submit`; as regras do produto valem nos dois caminhos.
- **Transições de estado.** `LiveStream` e `RecordedVideo` têm só as transições que a demo usa (`markLive`, `finish`, `fail`, `markReady`, `markFailed`), seguindo as máquinas de estados da Entrega 02.

## Executar

```bash
npm run check                # format:check → lint → typecheck → test
npm run coverage             # testes + cobertura
npm run demo:factory-method  # live → gravação → clipe pelo mesmo submit, e pedidos recusados
npm run bench -- --scenario factory-method
```
