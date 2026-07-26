# Releases verificáveis para Linux e Windows

O Evitania Manager publica três tags e três GitHub Releases imutáveis:

1. `<versão>-linux` — pacote Debian, ZIP que contém somente esse pacote e evidências Linux;
2. `<versão>-windows` — instalador NSIS, ZIP que contém somente esse instalador e evidências Windows;
3. `<versão>` — código-fonte e referências explícitas às duas releases de plataforma.

A release principal nunca é criada antes das duas plataformas. Reexecuções não
movem tags nem substituem assets existentes.

## Artefatos e evidências

Cada release de plataforma contém exatamente o instalador nativo (`.deb` ou
`.exe`), o ZIP de um membro, `SHA256SUMS.txt`, `sbom.cdx.json` CycloneDX 1.6,
`provenance-subjects.json`, `release-metadata.json` e
`signing-status.json`. O GitHub também registra uma atestação para o instalador e
o ZIP. Arquivos ausentes, extras, cruzados ou divergentes interrompem a publicação.

## Preparar e iniciar

Atualize `package.json` e `package-lock.json`, faça commit na `main` e mantenha a
árvore limpa:

```bash
scripts/release.sh v0.3.0
```

O comando valida versão e package, branch autorizada, árvore limpa, ausência das
três tags local e remotamente, instalação travada, testes completos, typecheck,
auditoria de produção, seed reproduzível, build, ícones e metadados. Nenhuma tag
é enviada no preflight.

Depois, o workflow constrói, inspeciona, instala e abre cada pacote com dados de
usuário isolados, grava estado e verifica a persistência após reinício. Só então
reconcilia as evidências, envia as três tags em um push Git atômico e cria as
releases na ordem documentada.

## Builds locais

```bash
npm ci
npm run dist:linux
```

No Windows:

```powershell
npm ci
npm run dist:windows
```

As saídas ficam isoladas em `release/linux/publish/` e
`release/windows/publish/`. Valide-as com:

```bash
node scripts/validate-release.mjs --platform linux --directory release/linux/publish
node scripts/validate-release.mjs --platform windows --directory release/windows/publish
```

## Instalação

No Linux Debian:

```bash
sudo apt install ./Evitania-Manager-0.3.0-amd64.deb
```

No Windows, execute `Evitania-Manager-0.3.0-x64.exe`. O instalador oferece
atalhos e permite escolher a pasta.

## Verificação pelo usuário

Coloque os dois downloads da plataforma ao lado de `SHA256SUMS.txt`.

```bash
sha256sum -c SHA256SUMS.txt
```

No Windows, use `Get-FileHash <arquivo> -Algorithm SHA256`. Confirme ainda
`bomFormat: CycloneDX`, o componente `evitania-manager` e a versão no SBOM.
Compare os dois itens de `provenance-subjects.json` e verifique a atestação com
`gh attestation verify <arquivo> --repo <proprietário/repositório>`.

No Windows, consulte `signing-status.json`. Se o estado for `signed`, execute
`Get-AuthenticodeSignature <instalador>` e exija `Status: Valid`. Se for
`unsigned`, a ausência do certificado é intencional e explícita; hashes, SBOM e
proveniência continuam obrigatórios.

## Recuperação de falhas

Uma falha antes do job final não cria tag. Uma falha de provedor depois do push
atômico termina explicitamente e nunca cria a release principal antes das duas
plataformas. Não mova tags nem sobrescreva assets: corrija, incremente a versão e
publique uma nova topologia.
