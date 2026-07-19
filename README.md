# Evitania Planner

Aplicativo desktop MVC para Linux e Windows. Na primeira abertura, importa `docs/base-cadastro.xlsx` para uma base local em JSON.

## Executar

```bash
npm install
npm start
```

## Versão atual

- Planejamento de receitas com expansão dos subprodutos até materiais brutos.
- Estoque por item e taxas de coleta/hora ou abates/hora isoladas do catálogo.
- Registro de Receitas, Monstros (normal/boss) e Equipamentos, com imagens extraídas da planilha.
- Drops convertidos de fração para decimal; a quantidade de saque aplica +1% por ponto aos drops raros.
- Dados locais em JSON, adequados para futura sincronização com Google Drive.

```bash
npm test
```
