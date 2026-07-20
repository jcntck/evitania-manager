## Módulo

Base de dados dos produtos criados na ferraria do jogo Evitania.

## Propósito

Este módulo consiste em um CRUD dos produtos fabricados por receita. Esses produtos podem ser selecionados como objetivos no módulo de planejamento e utilizados como componentes de outros produtos.

## Modelo de dados

- Produto: referência a um **Produto** do tipo `receita`;
- Componentes: lista de **Itens** ou **Produtos**;
- Quantidade necessária de cada componente: número maior que zero.

## Regras

- As imagens dos produtos devem ser salvas em `./assets/recipes/`;
- O formulário deve permitir selecionar uma imagem PNG ou JPG do computador, visualizar uma prévia, substituir ou remover a imagem antes de salvar;
- Ao salvar, o aplicativo deve validar e copiar a imagem selecionada para `./assets/recipes/`, usando um nome de arquivo único, e armazenar no cadastro apenas sua referência;

- Itens obtidos de monstros, chefes ou recursos são materiais brutos. Resultados dos módulos **Receitas** e **Fundição** são produtos;
- Uma receita deve possuir ao menos um componente;
- Referências circulares entre produtos não são permitidas;
- Os modelos compartilhados estão descritos em [`.ai/data/models.md`](../data/models.md).
