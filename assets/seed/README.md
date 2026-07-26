# Seed v2 compilation

`npm run seed:compile` reads the four worksheets in `docs/base-cadastro.xlsx`.
Only explicit fields are accepted:

- `Receitas`: `Nome`, `Tipo`, `Componentes`, and `Tempo` for smelting rows.
- `Registro de monstros`: `Nome`, `Ato`, `Tipo`, and `Drops`.
- The equipment/collectible sheets: rows with an explicit supported `Tipo`
  (`item`, `resource`, `recipe`, or `smelting`) and that type's required fields.
- `Imagem` may reference a PNG/JPEG beside the workbook; accepted files are
  copied to `assets/seed/assets/<module>/<entity-uuid>.<ext>`.

Free-form rows without product identity, act, relation quantities, or another
required field are omitted and recorded in `artifacts/seed-rejections.json`.
Runtime loads only `seed-v2.json` and never parses the workbook.
