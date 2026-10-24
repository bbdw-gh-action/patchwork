# CHK-003 — material exclusivo do operador

Não copiar este diretório, roteiro ou gabarito para `.agents`, prompts ou docs das aplicações. O motor copia somente a skill técnica; `docs/apresentacao` fica fora do checkout da aplicação e do ambiente do agente.

## Preparação e gabarito

A versão saudável mantém um lock síncrono (`inFlight`) e desabilita o botão durante a requisição. `create-scenario.mjs` cria `demo/chk-003-base` e `demo/chk-003` a partir da árvore atual do storefront usando índice Git separado, sem trocar a branch de trabalho, alterar seu índice ou sobrescrever refs existentes. A revisão defeituosa remove somente o lock de submissão e o bloqueio do botão principal. Testes existentes e novos permanecem intactos; a falha de CI nessa branch é intencional.

Execute da raiz do workspace:

```sh
node patchwork/docs/apresentacao/chk-003/create-scenario.mjs
```

Antes da execução remota, publique as revisões preparadas do motor e serviços e configure o App conforme `docs/HANDOFF.md`. O `main` confiável de cada consumidor precisa conter o adaptador novo e docs/skills atualizados. O checkout usa `main`, cenário `CHK-003`; o destino do storefront usa `demo/chk-003`. As revisões configuradas devem corresponder exatamente às releases executadas.

No checkout configure `CHECKOUT_DEMO_DELAY_MS=1500`, `DEMO_SCENARIO=CHK-003` e `SENTRY_RELEASE` igual ao SHA do backend saudável publicado. No storefront execute a branch `demo/chk-003`, com `VITE_SENTRY_RELEASE` igual ao seu SHA completo. Não alterar `.env` compartilhado silenciosamente; prefira variáveis do processo do ensaio. Fora do ensaio, atraso zero.

## Apresentação

1. Abra **Carrinho** (cliente de retirada, duas canecas, retirada). Clique para finalizar e clique novamente durante os 1,5 segundos de processamento.
2. O backend reserva a intenção antes de aguardar, devolve 409 à concorrência e registra um único `CheckoutInProgressError`. A primeira requisição pode concluir normalmente. O evento fica no projeto Sentry do checkout e traz hashes de correlação e `client_release`, sem corpo do pedido.
3. Aguarde a issue criada pelo App oficial Sentry com `sentry` e `agent:repair`. O agente investiga no checkout; só encaminha se as evidências justificarem responsabilidade externa.
4. A proposta assinada cria issue vinculada no storefront. A original permanece aberta, com comentário e `agent:forwarded`. O receptor verifica assinatura, origem, evento e SHAs antes de investigar.
5. O agente no storefront confirma a hipótese, acrescenta teste novo e propõe a correção. A validação exige falha antes e sucesso depois. O PR é rascunho no próprio storefront, sem merge/deploy automáticos.

O gabarito é restaurar exclusão mútua imediata até a requisição terminar e o botão desabilitado. Debounce isolado não basta. `tests/pending-submission.spec.ts` mantém a requisição pendente, aguarda 1,6 segundo e repete o clique; os testes existentes também exercitam dois cliques no mesmo ciclo e fechamento/reabertura do painel.

Repetir depois do sucesso com a mesma chave recupera o pedido original. Alterar cliente, modalidade ou itens cria outra intenção. Pagamento demonstrativo não altera payload nem chave. O cache é limitado a 1000 intenções por instância e retém sucessos por dez minutos; reinício perde o cache. Não demonstrar garantia distribuída.

## Contingência e encerramento

CHK-001 continua em `demo/chk-001`; use o dispatch manual do checkout com cenário `CHK-001` e a release correspondente. A configuração `.github/patchwork-chk001.json` não habilita encaminhamento. Não combine releases de contingência e cenário principal.

Guarde links do incidente, issues, execuções e PR quando o ensaio remoto realmente ocorrer. Sem credenciais de escrita/App, registre apenas o ensaio local, sem fabricar links. Encerre todos os servidores e navegadores iniciados pelo ensaio.
