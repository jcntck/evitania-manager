## Modelos de dados principais

- Itens;
- Produtos.

## Item

- ID: identificador único;
- Nome: string;
- Imagem: caminho para arquivo PNG ou JPG.

## Produto

- ID: identificador único;
- Nome: string;
- Imagem: caminho para arquivo PNG ou JPG;
- Tipo: `receita` ou `fundição`.

## Componente de produção

Representa cada componente necessário para produzir um produto.

- Produto: referência ao produto produzido;
- Componente: referência a um item ou produto;
- Quantidade: número maior que zero.

As regras específicas de receitas e fundições estão descritas em seus respectivos módulos.
