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

Linux gera AppImage e ZIP; Windows gera instalador NSIS e ZIP. A assinatura Windows depende das credenciais descritas em [docs/seguranca-windows.md](docs/seguranca-windows.md).

## Release

Com o repositório limpo e as alterações já enviadas à branch principal:

```bash
scripts/release.sh v1.0.0
```

O script valida o projeto e cria as tags `v1.0.0`, `v1.0.0-linux` e `v1.0.0-windows`. As tags de plataforma acionam o GitHub Actions para gerar artefatos, checksums SHA-256, SBOM e atestações de procedência.
