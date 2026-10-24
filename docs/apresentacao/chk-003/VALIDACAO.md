# Validação local — 24/10/2026

Implementação local preparada e verificada. Nenhuma issue ou PR remoto foi criado neste ensaio; não houve merge ou deploy.

## Resultados observados

| Verificação | Resultado |
| --- | --- |
| `bbdw-checkout: npm run check` | Lint, tipos, build e 10 testes passaram |
| `bbdw-storefront: npm run check` | Lint, build e 16 testes Playwright passaram |
| `bbdw-storefront: npm run smoke` | Serviços reais: retirada, endereço ausente, entrega, layout mobile; processos encerrados |
| `patchwork: npm test` | 42 passaram; 1 teste Go com race omitido no Windows por exigir compilador C, conforme configuração existente |
| `python -m unittest discover -s tests -v` | 6 testes de workflow passaram |
| actionlint | Workflow compartilhado e dois consumidores válidos, com as exceções existentes para identidade do workflow e permissão Copilot |
| Validador de skill | `patchwork-handoff` válida |
| Regressão de clique pendente | Exit 1 na branch defeituosa, sem erro de infraestrutura; exit 0 na saudável |
| Ensaio com quatro serviços e coletor local Sentry | Defeituosa: 2 requests; saudável: 1 request; 1 evento `CheckoutInProgressError`; replay devolveu o mesmo pedido |
| Encaminhamento → PR | Ensaio com APIs GitHub simuladas passou: assinatura, origem, revisões, vínculo, deduplicação e publicação no destino |

A captura usa SDK Sentry e transporte HTTP reais com coletor local; não envolve o serviço Sentry remoto. O ensaio de encaminhamento usa doubles de API, sem inferência do agente nem escrita no GitHub. Os testes de integração existentes do motor continuam executando patches e regressões reais em fixtures Node e Playwright.

Revisão React: chave e lock em refs, alterações de intenção nos handlers, confirmação e carregamento em estado; sem novo efeito que dispare pedidos, nova dependência ou mudança nos controles acessíveis da versão saudável.

## Revisões locais preservadas

| Repositório / ref | SHA |
| --- | --- |
| patchwork / revisão do motor fixada nos consumidores | `62fd23ef06a0af15107b31669b3c1461853f6331` |
| bbdw-checkout / `feat/idempotency-handoff` | `5653b1cc8cfa33a2cc36438c61082f71d3bac36a` |
| bbdw-storefront / `demo/chk-003-base` | `ce451ade91b58de2db0e43c6adc3088fd22168af` |
| bbdw-storefront / `demo/chk-003` | `06a07f41c0ccfe9da183198dd5ed6991b4e3284a` |

Snapshots criados com índice separado; as branches de trabalho e índices originais foram preservados. A diferença entre storefront saudável e defeituoso contém somente `src/App.tsx` e `src/CheckoutPanel.tsx` (2 adições, 3 remoções). Nenhum teste foi alterado entre essas duas revisões.

As evidências JSON estão em `.verification/chk003-before.json`, `.verification/chk003-after.json` e `.verification/chk003-system.json`, na raiz local do workspace. Os scripts de ensaio nessa pasta encerram seus processos em `finally`; as portas utilizadas ficaram livres após a execução.

## Ativação remota pendente

A credencial `gh` disponível retornou `push: false` para `bb-dw-26/patchwork`. A consulta às variáveis de `bb-dw-26/bbdw-checkout` retornou HTTP 403. Não foi possível confirmar/configurar o App dedicado ou publicar estas revisões com essa credencial.

Antes do ensaio remoto:

1. Publicar a branch `feat/optional-handoff` do motor, que contém o SHA fixado nos consumidores. Não aplicar consumidores antes de esse SHA estar acessível no GitHub.
2. Revisar e integrar manualmente as configurações confiáveis e a versão saudável do checkout/storefront; publicar a branch isolada `demo/chk-003` do storefront. Os consumidores usam a revisão confiável da branch principal para configuração e skills.
3. Instalar o App restrito a Issues, configurar IDs, chave pública e secret privado na origem, além de acesso Sentry de leitura aos projetos de origem e permissão Copilot. O destino não precisa da chave privada para receber.
4. Executar o [roteiro](ROTEIRO.md), confirmar os links reais de incidente, duas issues, execuções e PR no storefront. Sem esse passo, o fluxo remoto permanece não comprovado.

CHK-001 continua disponível como contingência pelo dispatch `scenario=CHK-001`; não usa encaminhamento obrigatório.
