## Módulo

Base de dados de recursos (minérios e troncos) do jogo Evitania.

## Propósito

Este módulo consiste em um CRUD dos recursos coletáveis, como minérios e troncos, que podem ser utilizados no módulo de planejamento.

## Modelo de dados

- Item: referência ao item obtido na coleta;
- Ato: I, II ou III;
- Imagem: caminho para arquivo PNG ou JPG.

## Regras

- As imagens dos recursos devem ser salvas em `./assets/resources/`;
- O formulário deve permitir selecionar uma imagem PNG ou JPG do computador, visualizar uma prévia, substituir ou remover a imagem antes de salvar;
- Ao salvar, o aplicativo deve validar e copiar a imagem selecionada para `./assets/resources/`, usando um nome de arquivo único, e armazenar no cadastro apenas sua referência;

- Cada recurso deve referenciar um registro da base de **Itens**, apesar de possuir uma tela própria de gerenciamento;
- O modelo de item está descrito em [`.ai/data/models.md`](../data/models.md).
