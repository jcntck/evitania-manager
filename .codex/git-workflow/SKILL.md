---
name: git-workflow
description: "Aplicar o fluxo Git deste projeto ao iniciar e entregar features, correções ou manutenção: criar e nomear branches, preparar commits atômicos, validar alterações, fazer push e abrir pull requests com títulos e descrições claros e concisos. Usar sempre que Codex implementar uma mudança que possa resultar em branch, commit ou PR neste repositório."
---

# Fluxo Git do projeto

Preservar alterações preexistentes do usuário e nunca incluir arquivos fora do escopo da tarefa.

## Preparar o trabalho

1. Executar `git status --short` e identificar a branch atual antes de editar.
2. Para cada nova feature, criar uma branch própria antes da implementação.
3. Se a branch atual já for específica para a mesma feature, continuar nela em vez de criar outra.
4. Partir da branch-base indicada pelo usuário. Na ausência de indicação, usar a branch principal configurada no repositório sem atualizá-la remotamente por conta própria.
5. Não trocar de branch com alterações locais conflitantes. Preservar o trabalho existente e pedir orientação quando não for possível isolá-lo com segurança.

## Nomear branches

Usar nomes curtos em inglês, minúsculos e separados por hífen:

- `feature/<objetivo>` para novas funcionalidades;
- `fix/<problema>` para correções;
- `refactor/<escopo>` para refatorações sem mudança funcional;
- `docs/<escopo>` para documentação;
- `chore/<escopo>` para manutenção;
- `release/<versão>` para preparação de release.

Exemplos: `feature/image-upload`, `fix/drop-time-calculation` e `docs/windows-signing`.

## Criar commits

1. Revisar o diff e executar as validações relevantes antes do commit.
2. Separar mudanças independentes em commits atômicos.
3. Adicionar ao índice somente arquivos pertencentes à tarefa.
4. Usar Conventional Commits no formato `tipo(escopo): descrição`.
5. Escrever a descrição em inglês, no imperativo, sem ponto final e preferencialmente com até 72 caracteres.

Tipos permitidos: `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci` e `chore`.

Exemplos:

```text
feat(items): add local image upload
fix(planner): calculate loot using adjusted denominator
docs(security): document Windows code signing
```

Adicionar corpo ao commit somente quando ele explicar uma decisão importante que não esteja clara no diff. Manter o corpo curto.

Não reescrever commits, usar `--amend`, fazer rebase ou force push sem autorização explícita.

## Abrir pull requests

Toda branch de feature concluída deve resultar em um pull request. Antes de abri-lo:

1. Confirmar que os testes e verificações relevantes passaram.
2. Revisar o diff completo contra a branch-base.
3. Confirmar que não há segredos, credenciais, certificados ou arquivos não relacionados.
4. Fazer push e criar o PR somente quando houver autorização para alterar o repositório remoto.

Usar um título claro, curto e coerente com Conventional Commits. Escrever a descrição em português, de forma objetiva, usando este modelo:

```markdown
## Resumo

- Mudança principal
- Comportamento ou decisão relevante

## Validação

- `comando executado`
```

Manter normalmente entre dois e cinco itens no total. Acrescentar riscos, migrações, screenshots ou issue relacionada apenas quando forem relevantes. Não repetir o diff arquivo por arquivo.

Se a implementação ainda não estiver pronta para revisão, abrir um draft PR somente quando solicitado ou quando o fluxo remoto autorizado exigir acompanhamento antecipado.

## Segurança operacional

- Nunca usar `git reset --hard`, descartar alterações locais ou apagar branches sem solicitação explícita.
- Nunca fazer push direto para a branch principal.
- Nunca usar force push.
- Não criar tags ou releases durante o fluxo comum de feature; seguir o processo de release do projeto quando ele for solicitado.
- Relatar ao usuário a branch, os commits, as validações e o link do PR ao concluir.
