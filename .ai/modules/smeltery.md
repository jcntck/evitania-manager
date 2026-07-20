## Módulo

Base de dados de produtos criados na forja do jogo Evitania.

## Propósito

Este módulo consiste em um CRUD dos produtos processados na fundição. Esses produtos podem ser utilizados pelo módulo de planejamento e como componentes de outros produtos.

## Modelo de dados

- Produto: referência a um **Produto** do tipo `fundição`;
- Tempo de processamento por unidade: número inteiro, em segundos;
- Componentes: lista de **Itens** ou **Produtos**;
- Quantidade necessária de cada componente: número maior que zero.

## Regras

- As imagens dos produtos devem ser salvas em `./assets/smeltery/`;
- O formulário deve permitir selecionar uma imagem PNG ou JPG do computador, visualizar uma prévia, substituir ou remover a imagem antes de salvar;
- Ao salvar, o aplicativo deve validar e copiar a imagem selecionada para `./assets/smeltery/`, usando um nome de arquivo único, e armazenar no cadastro apenas sua referência;

- A interface pode aceitar valores como `1m 30s`, `1:30`, `90` ou `90s`, desde que apresente claramente o formato aceito e converta o valor para segundos antes de salvar;
- O tempo de processamento deve aceitar durações de segundos a dias;

- Itens obtidos de monstros, chefes ou recursos são materiais brutos. Resultados dos módulos **Receitas** e **Fundição** são produtos;
- Um processo de fundição deve possuir ao menos um componente;
- Referências circulares entre produtos não são permitidas;
- Os modelos compartilhados estão descritos em [`.ai/data/models.md`](../data/models.md);

- O tempo de processamento pertence ao processo de fundição e não à entidade **Produto**. As duas entidades devem possuir um relacionamento.
