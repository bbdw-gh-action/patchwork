# Material da apresentação

Roteiros, cenários planejados, causas, soluções e registros de ensaio ficam somente neste diretório do Patchwork. Este material é destinado a quem prepara e avalia a apresentação e não integra as skills fornecidas ao agente.

[Roteiro da sessão](../ROTEIRO.md). O cenário principal é [CHK-003: envio duplicado e encaminhamento opcional](chk-003/ROTEIRO.md); CHK-001 permanece como contingência de reparo local. Consulte também o [registro de validação](chk-003/VALIDACAO.md).

| Aplicação | Material |
| --- | --- |
| bbdw-checkout | [FALHAS.md](bbdw-checkout/FALHAS.md) · [SOLUCOES.md](bbdw-checkout/SOLUCOES.md) · [AVALIACAO.md](bbdw-checkout/AVALIACAO.md) · [scenarios.json](bbdw-checkout/scenarios.json) · [Exemplos de payloads](bbdw-checkout/exemplos.json) · [DEMO.md](bbdw-checkout/DEMO.md) |
| bbdw-users | [FALHAS.md](bbdw-users/FALHAS.md) · [SOLUCOES.md](bbdw-users/SOLUCOES.md) · [AVALIACAO.md](bbdw-users/AVALIACAO.md) · [scenarios.json](bbdw-users/scenarios.json) |
| bbdw-catalog | [FALHAS.md](bbdw-catalog/FALHAS.md) · [SOLUCOES.md](bbdw-catalog/SOLUCOES.md) · [AVALIACAO.md](bbdw-catalog/AVALIACAO.md) · [scenarios.json](bbdw-catalog/scenarios.json) |
| bbdw-storefront | [FALHAS.md](bbdw-storefront/FALHAS.md) · [SOLUCOES.md](bbdw-storefront/SOLUCOES.md) · [AVALIACAO.md](bbdw-storefront/AVALIACAO.md) · [scenarios.json](bbdw-storefront/scenarios.json) · [Exemplos de payloads](bbdw-storefront/exemplos.json) |

Os adaptadores antigos do checkout e seus testes foram removidos. A integração nativa Sentry → GitHub e o motor atual do Patchwork substituem essa automação.

A mudança não reescreve commits ou branches antigos. A preparação do agente remove o material legado da cópia de trabalho e fornece a documentação técnica da revisão confiável. Material público e histórico Git não constituem uma avaliação cega isolada.

Os exemplos JSON são material de apoio e não são carregados pelos apps. Evidências antigas e registros de migração estão no [histórico](../historico/README.md).
