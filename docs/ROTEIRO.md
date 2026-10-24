# Roteiro da apresentação de 50 minutos

## Narrativa e escopo

O cenário principal é **CHK-003: envio concorrente iniciado no storefront e observado pelo checkout**. A loja começa com duas unidades de `product-standard`, `customer-pickup` e retirada. O painel começa fechado. Ao abrir o carrinho e repetir a finalização durante a requisição pendente, o backend protege a compra e registra um evento no Sentry.

O Patchwork investiga primeiro no repositório que recebeu a issue. Encaminhar é uma saída opcional quando surgem evidências de outro responsável; não existe triagem obrigatória para todos os incidentes. O relatório chega ao destino como hipótese a confirmar. O resultado esperado é uma issue vinculada e um PR no storefront, com regressão demonstrada antes/depois e revisão humana.

O [roteiro técnico de CHK-003](apresentacao/chk-003/ROTEIRO.md) contém preparação, revisões, reprodução e gabarito exclusivos do operador. **CHK-001: retirada sem endereço** permanece como contingência de reparo local no checkout. Não iniciar os dois cenários simultaneamente.

## Papel dos repositórios

| Repositório | Papel |
| --- | --- |
| bbdw-checkout | Backend saudável: reserva da intenção, rejeição de concorrência, replay do pedido e origem do evento Sentry |
| bbdw-storefront | Revisão defeituosa isolada em `demo/chk-003`; destino sugerido somente quando a investigação sustentar a hipótese |
| bbdw-users | Perfis fictícios e endereços; dependência saudável |
| bbdw-catalog | Catálogo e preços em centavos; dependência saudável em Go |
| patchwork | Motor compartilhado, skill opcional, publicação autenticada e validação de regressão |

## Preparação antes da sessão

- Publicar as revisões preparadas e configurar o App de issues apenas nos repositórios autorizados. Conferir as permissões, assinatura e configuração descritas em [HANDOFF.md](HANDOFF.md).
- Fixar as releases exatas executadas. Configurar atraso de 1500 ms somente no checkout do ensaio; padrão zero fora dele. Executar somente uma instância.
- Ensaiar a cadeia Sentry → issue original → investigação → proposta opcional → issue vinculada → investigação no destino → PR em rascunho.
- Confirmar que a credencial Copilot e a integração Sentry funcionam. Testes locais com coletores e APIs simuladas não comprovam a ativação remota.
- Deixar abertas as abas da loja, Sentry, Issues e Actions. Ter um ensaio concluído, identificado como tal, para eventual indisponibilidade.
- Manter o material deste diretório fora dos prompts e das skills dos agentes. Não fornecer o gabarito.

## Agenda

| Minutos | Apresentação | Execução em segundo plano |
| --- | --- | --- |
| 0–5 | Abrir Carrinho, repetir clique pendente e mostrar o evento no checkout | Investigação local inicia |
| 5–15 | Explicar responsabilidades dos serviços, intenção de compra e captura no Sentry | Agente avalia evidências |
| 15–30 | Mostrar limites de credenciais, skill opcional e issue vinculada | Destino verifica hipótese, reproduz e corrige |
| 30–40 | Revisar diagnóstico, diff e regressão antes/depois | Validação e PR em rascunho |
| 40–45 | Comparar o comportamento defeituoso e saudável com as evidências do ensaio | Revisão humana, sem merge/deploy automáticos |
| 45–50 | Perguntas e margem para imprevistos | Não iniciar outro cenário |

O tempo é uma janela da apresentação, não uma promessa de duração do agente. Não aguardar logs continuamente nem aprovar correções para cumprir o relógio.

## Evidências a mostrar

- Um 409 de concorrência e uma captura específica no Sentry, sem dados pessoais. A primeira requisição pode terminar com sucesso; o sinal demonstrado é o envio redundante.
- Relatório com sintoma, evidências, hipótese, destino, reprodução e incertezas. A origem permanece aberta e marcada como encaminhada.
- Autenticidade do App, assinatura, revisões e apenas um salto. Repetições não geram outra issue.
- PR no storefront; mesmo evento Sentry do checkout. Não exigir erro adicional no frontend.
- Teste de clique durante requisição pendente falhando antes e passando depois; debounce isolado não é suficiente. Payload, total e pagamento demonstrativo preservados.

## Contingência e encerramento

Se CHK-003 não estiver pronto antes da sessão, usar CHK-001 com sua configuração e release próprias, via dispatch manual. Se uma execução ao vivo atrasar, mostrar o ensaio identificado e o estado real, sem inventar um resultado. As duas investigações do encaminhamento não se aplicam ao reparo local de CHK-001.

Não fazer merge ou deploy automático. Registrar links reais quando existirem e encerrar todos os processos iniciados ao concluir.
