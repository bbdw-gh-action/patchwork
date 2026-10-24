# Mapa técnico

| Serviço / repositório | Responsabilidade | Interface |
| --- | --- | --- |
| bb-dw-26/bbdw-storefront | Interface React, estado do carrinho e interação de compra | Consome as APIs de users, catalog e checkout |
| bb-dw-26/bbdw-checkout | Validação e criação de pedidos, cálculo de totais | POST /orders; consulta users e catalog |
| bb-dw-26/bbdw-users | Perfis fictícios e endereços cadastrados | GET /users/:id |
| bb-dw-26/bbdw-catalog | Produtos, disponibilidade e preços em centavos | GET /products e GET /products/:id |

O evento Sentry identifica o serviço que observou o erro. A responsabilidade pela causa precisa ser demonstrada pela investigação. Este mapa descreve contratos, não soluções. Somente os destinos listados em `handoff.targets` da configuração confiável estão autorizados para publicação; as demais relações são contexto técnico.
