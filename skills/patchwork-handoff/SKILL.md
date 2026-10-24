---
name: patchwork-handoff
description: Propor encaminhamento de um incidente Patchwork somente quando a investigação em andamento encontrar evidências de responsabilidade de outro repositório autorizado. Não usar como triagem inicial ou requisito de reparos locais.
---

# Encaminhamento opcional

O padrão é investigar e corrigir no repositório atual. Use esta saída apenas quando as evidências já obtidas apontarem para responsabilidade de outro serviço. A localização da exceção, sozinha, não comprova a causa.

1. Consulte o mapa técnico em `references/services.md` e os destinos/revisões autorizados em `.github/patchwork.json`. Não invente um destino ou uma revisão: informe o SHA completo observado nas evidências, distinguindo origem Sentry e código de correção.
2. Registre sintoma, evidências concretas (arquivos/linhas, requests, evento e releases), hipótese, motivo do destino, passos de reprodução e incertezas. Evite dados pessoais, tokens ou payloads de clientes. O relatório é uma hipótese que o destino deverá verificar.
3. Se `hop=1`, não encaminhe novamente. Registre a discordância e solicite revisão humana no relatório final. Não altere código para simular uma correção.
4. Para propor o primeiro salto, escreva **apenas** `.patchwork-handoff.json` na raiz da aplicação com o formato abaixo. Não combine com patch ou teste novo na origem; descreva as verificações realmente feitas em sua resposta. Um job confiável valida, assina e publica. Não execute APIs de escrita em outros repositórios.

```json
{
  "destination": "organizacao/repositorio-autorizado",
  "targetRevision": "SHA completo observado do serviço de destino",
  "symptom": "Sintoma observado e impacto",
  "evidence": "Evidências verificáveis, referências e revisões",
  "hypothesis": "Hipótese causal a confirmar no destino",
  "destinationReason": "Responsabilidade técnica que justifica o destino",
  "reproduction": "Passos e resultado observado",
  "uncertainties": "Limitações e pontos ainda não confirmados"
}
```

Cada campo textual do relatório precisa conter 12–6000 caracteres. Revisões desatualizadas, destino não autorizado, assinatura inválida e segundo salto são recusados; não tente contornar a validação. A issue original permanece aberta. O destino segue o fluxo normal de teste que falha antes, correção mínima e PR para revisão humana.
