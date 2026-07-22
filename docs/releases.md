# Builds e releases para Linux e Windows

Este guia descreve a configuração inicial do GitHub e o processo usado para publicar uma versão do Evitania Manager.

## Resultado esperado

Uma tag semântica, como `v1.0.0`, inicia o workflow `.github/workflows/release.yml`. Ele executa dois builds em paralelo e, depois que ambos terminam, cria uma única GitHub Release associada à mesma tag.

A Release contém:

- Um AppImage para Linux;
- Um instalador NSIS (`.exe`) para Windows;
- `SHA256SUMS.txt`, para verificação dos downloads;
- `sbom.cdx.json`, com a lista de componentes da aplicação;
- Atestações de procedência geradas pelo GitHub.

Os dois primeiros arquivos são os downloads da aplicação. Os outros arquivos são metadados de segurança e verificação.

## Configuração inicial no GitHub

No repositório, abra **Settings > Actions > General**.

1. Em **Actions permissions**, permita a execução das actions usadas pelo workflow. As actions externas estão fixadas por SHA completo.
2. Confirme que nenhuma política da organização bloqueia `contents: write`, `id-token: write` ou `attestations: write`.
3. Não é necessário criar um token pessoal: o workflow usa o `GITHUB_TOKEN` temporário fornecido pelo próprio GitHub.

O workflow concede permissão de leitura aos jobs de build e permissões de escrita apenas ao job final que publica a Release e as atestações.

## Assinatura opcional do Windows

Sem certificado, o instalador é criado, mas o Windows pode exibir um aviso de publicador desconhecido. O projeto permite essa situação porque `forceCodeSigning` está desativado.

Para assinar o instalador com um certificado compatível com Authenticode, abra **Settings > Secrets and variables > Actions** e cadastre:

- `WIN_CSC_LINK`: certificado em um formato aceito pelo `electron-builder`, normalmente um PFX/P12 codificado ou um endereço seguro compatível;
- `WIN_CSC_KEY_PASSWORD`: senha do certificado.

Nunca registre o certificado, a chave privada ou a senha no Git. Consulte `docs/seguranca-windows.md` antes de habilitar a assinatura em produção.

## Preparação de uma versão

Use versionamento semântico no formato `MAJOR.MINOR.PATCH`. Por exemplo, para preparar `v0.3.0`, comece na branch principal atualizada:

```bash
git switch main
git pull --ff-only
npm version 0.3.0 --no-git-tag-version
```

Esse comando atualiza `package.json` e `package-lock.json`, mas não cria a tag. Revise e publique a alteração:

```bash
npm test
npm run typecheck
npm run build
git add package.json package-lock.json
git commit -m "chore: prepare release v0.3.0"
git push origin main
```

É importante fazer o commit antes da tag. O número do `package.json` define a versão interna da aplicação e o nome dos instaladores.

## Criação da Release

Com o repositório limpo e o commit já enviado:

```bash
scripts/release.sh v0.3.0
```

O script:

1. Valida o formato da versão;
2. Confirma que a versão da tag corresponde ao `package.json`;
3. Exige uma árvore de trabalho limpa;
4. Executa instalação, testes, typecheck, build e auditoria;
5. Cria uma tag anotada;
6. Envia somente essa tag ao GitHub.

O push da tag inicia automaticamente o workflow **Release builds**.

## Acompanhamento no GitHub

1. Abra a aba **Actions**;
2. Selecione **Release builds**;
3. Confirme que os jobs **Build Linux** e **Build Windows** terminaram com sucesso;
4. Confirme que **Publish GitHub Release** terminou depois deles;
5. Abra **Releases** e selecione a tag publicada.

A Release somente é publicada se os dois builds forem concluídos. Uma falha em qualquer plataforma impede a publicação de uma Release incompleta.

## Verificação dos arquivos

No Linux, confira um download com:

```bash
sha256sum -c SHA256SUMS.txt
```

O comando deve indicar `OK` para os arquivos presentes no mesmo diretório. No Windows, compare o hash com:

```powershell
Get-FileHash .\Evitania-Manager-0.3.0-x64.exe -Algorithm SHA256
```

O nome exato pode variar conforme a arquitetura definida pelo `electron-builder`.

## Reexecução e correções

Não mova nem recrie uma tag de Release já publicada. Se houver um problema no código ou no empacotamento:

1. Corrija o problema em um novo commit;
2. Incremente a versão, normalmente o `PATCH`;
3. Publique uma nova tag e uma nova Release.

Se um job falhar por indisponibilidade temporária antes da Release ser criada, use **Re-run failed jobs** na página do workflow. Se a Release já existir, não execute novamente o job de publicação sem antes conferir os arquivos existentes.

## Builds locais

Em Linux:

```bash
npm ci
npm run dist:linux
```

Em Windows:

```powershell
npm ci
npm run dist:windows
```

Os arquivos são gravados em `release/`. Cada comando limpa essa pasta antes de empacotar, evitando que arquivos de uma build anterior sejam confundidos com a versão atual. A geração cruzada do instalador Windows em Linux não é o fluxo suportado; o GitHub Actions usa um runner Windows para esse pacote.

## Checklist rápido

- [ ] A branch `main` está atualizada;
- [ ] `package.json` e `package-lock.json` têm a nova versão;
- [ ] A alteração de versão foi commitada e enviada;
- [ ] Testes, typecheck e build passam;
- [ ] A árvore de trabalho está limpa;
- [ ] `scripts/release.sh vMAJOR.MINOR.PATCH` foi executado;
- [ ] Os três jobs do workflow passaram;
- [ ] A Release contém o AppImage, o EXE, checksums e SBOM;
- [ ] Os hashes dos downloads foram conferidos.
