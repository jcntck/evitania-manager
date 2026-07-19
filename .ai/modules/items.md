## Módulo

Base central de itens do jogo Evitania.

## Propósito

Este módulo consiste em um CRUD para os materiais brutos obtidos por coleta, monstros ou chefes. Recursos, monstros e chefes possuem telas próprias, mas todos os seus materiais devem referenciar esta mesma base de itens.

## Modelo de dados

- Nome: string;
- Imagem: caminho para arquivo PNG ou JPG.

## Regras

- O nome do item é obrigatório;
- As imagens dos itens devem ser salvas em `./assets/items/`;
- O formulário deve permitir selecionar uma imagem PNG ou JPG do computador, visualizar uma prévia, substituir ou remover a imagem antes de salvar;
- Ao salvar, o aplicativo deve validar e copiar a imagem selecionada para `./assets/items/`, usando um nome de arquivo único, e armazenar no cadastro apenas sua referência;
- Um item pode ser associado a recursos e a drops de diferentes monstros ou chefes;
- A exclusão de um item associado a uma receita, fundição ou drop deve ser bloqueada até que suas associações sejam removidas.
