# Encaminhamento opcional

O fluxo padrão continua `prepare → propose → validate → publish`: investigação local, teste novo que falha antes e passa depois, PR em rascunho. Não existe job de triagem prévia. A skill `patchwork-handoff` só é consultada quando a investigação encontra evidências de responsabilidade de outro serviço.

Nesse caso o agente entrega `.patchwork-handoff.json`, sem patch local. `export` valida o formato, destino autorizado e limite de um salto. O job `handoff`, em outro runner, confere revisões, assina o relatório e publica uma nova issue no destino. O agente não recebe a chave privada nem o token de instalação do App.

## Configuração confiável

`handoff.targets` lista `{repository, baseBranch}` autorizados. `handoff.sources` lista origens com `{repository, baseBranch, sentry: {org, project, projectId}, scenario?}`. `receiveBranch`, quando presente, define a branch de reparo de incidentes recebidos; não altera a base dos incidentes locais. O mapa técnico da skill não concede permissão de publicação.

O relatório contém `destination`, `targetRevision` (SHA completo observado), `symptom`, `evidence`, `hypothesis`, `destinationReason`, `reproduction` e `uncertainties`. Campos textuais: 12–6000 caracteres; JSON total até 18.000 caracteres. Não inclui credenciais nem dados pessoais. As revisões de origem e destino precisam continuar no topo das branches autorizadas.

## App e credenciais

Instale um GitHub App dedicado, com **Repository permissions → Issues: read and write** e Metadata: read, somente nos repositórios autorizados. Não conceda Contents ou Pull requests a esse App. Configure:

- Variáveis: `PATCHWORK_APP_ID`, `PATCHWORK_BOT_ID` (ID numérico do bot), `PATCHWORK_INSTALLATION_ID` e `PATCHWORK_APP_PUBLIC_KEY` (PEM RSA correspondente à chave privada).
- Secret `PATCHWORK_APP_PRIVATE_KEY`: PEM RSA do App, fornecido apenas ao job `handoff`. O receptor precisa somente da chave pública e identidade do App; pode omitir o secret privado se não tiver destinos.
- `SENTRY_AUTH_TOKEN`: leitura dos projetos autorizados de origem. O MCP fica restrito ao projeto validado para cada incidente, mesmo quando o código reparado pertence a outro serviço.

O publicador emite um token temporário restrito a Issues nos dois repositórios envolvidos e o revoga em `finally`. O token normal de cada repositório continua publicando seus próprios PRs. As consultas de refs entre os repositórios usam leitura pública; esta configuração de demonstração pressupõe repositórios públicos. Para repositórios privados, é necessário definir separadamente acesso de leitura às revisões, sem ampliar as permissões do agente ou do App de issues.

Fixe o consumidor no SHA **publicado** do motor que contém este recurso antes de encaminhar o novo secret. Um consumidor apontando para uma versão antiga do workflow não pode receber esse secret adicional.

## Recebimento e repetição

O receptor exige autor Bot e App com IDs configurados, ator autorizado, labels, assinatura RSA do envelope, origem permitida, evento Sentry original e revisões compatíveis. O Markdown visível não é usado como contexto autenticado; o relatório assinado é fornecido como hipótese não confiável a verificar. Um colaborador autorizado pode repetir o workflow manualmente; isso não dispensa a validação da assinatura.

A chave de deduplicação combina incidente Sentry, release de origem e destino. O publicador procura todas as páginas de issues, inclusive fechadas, e serializa execuções do mesmo incidente/release. Se a issue já existe, recupera a ligação sem publicar outra. O comentário e o label `agent:forwarded` na origem são retomáveis; ela permanece aberta. O sistema não resolve automaticamente o incidente Sentry nem fecha a origem quando o PR é criado.

Um incidente recebido tem `hop=1`; não admite outro encaminhamento. Discordância, revisão alterada, credencial ausente ou incompatibilidade exigem revisão humana. Isso não autoriza inventar patch ou teste. Não há merge ou deploy automático.

## Verificação

`npm test` cobre autenticação, assinatura, deduplicação, revisões, token restrito/revogado e um ensaio com APIs GitHub simuladas de incidente backend até PR no destino. Os testes de integração existentes continuam executando regressões reais Node e Playwright. `python -m unittest discover -s tests -v` verifica os limites dos jobs e que a chave privada nunca chega ao agente.

O ensaio simulado não comprova instalação do App, permissão Copilot, entrega Sentry→GitHub ou criação de issues/PRs reais. Esses pontos dependem da ativação nos repositórios e de uma execução remota observada.
