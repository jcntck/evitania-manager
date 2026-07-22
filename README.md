# Evitania Manager

Aplicativo desktop para gerenciar itens, recursos, receitas, fundições, monstros, chefes e planos de produção do Evitania.

## Desenvolvimento

Requisitos: Node.js 22 ou superior e npm.

```bash
npm ci
npm start
```

A base começa vazia. Os dados e as imagens enviadas são armazenados na pasta de dados do usuário, acessível pelo botão **Abrir local dos dados**.

## Validação

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

## Builds

```bash
npm run dist:linux
npm run dist:windows
```

Linux gera um AppImage; Windows gera um instalador NSIS. A assinatura Windows depende das credenciais descritas em [docs/seguranca-windows.md](docs/seguranca-windows.md).

## Release

Com o repositório limpo e as alterações já enviadas à branch principal:

```bash
scripts/release.sh v1.0.0
```

O script valida o projeto e cria a tag `v1.0.0`. Ela aciona o GitHub Actions para gerar uma única GitHub Release contendo os builds de Linux e Windows, checksums SHA-256, SBOM e atestações de procedência. Consulte o [guia de releases](docs/releases.md) para a configuração inicial e o passo a passo completo.
