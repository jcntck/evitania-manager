## Módulo

Base de dados de chefes do jogo Evitania.

## Propósito

Este módulo consiste em um CRUD dos chefes e de seus drops. Os itens obtidos podem ser utilizados no módulo de planejamento.

## Modelo de dados

- Nome do chefe: string;
- Ato: I, II ou III;
- Imagem: caminho para arquivo PNG ou JPG;
- Drops: lista contendo:
  - Item: referência a um registro da base de **Itens**;
  - Numerador da taxa: número inteiro maior que zero;
  - Denominador da taxa: número inteiro maior que zero.

## Regras

- As imagens dos chefes devem ser salvas em `./assets/bosses/`;
- O formulário deve permitir selecionar uma imagem PNG ou JPG do computador, visualizar uma prévia, substituir ou remover a imagem antes de salvar;
- Ao salvar, o aplicativo deve validar e copiar a imagem selecionada para `./assets/bosses/`, usando um nome de arquivo único, e armazenar no cadastro apenas sua referência;

- A taxa de saque segue o formato `x em y`. Por exemplo, `1 em 10` representa uma probabilidade base de `1 / 10` por luta;

- Ao cadastrar um drop, o usuário deve selecionar um item existente ou criar um novo registro por meio do [módulo de Itens](items.md) e, em seguida, associá-lo ao chefe;
- Um chefe não pode possuir o mesmo item duplicado em sua lista de drops.

O relacionamento esperado é:

`Chefe -> Drop (taxa de saque) -> Item`
