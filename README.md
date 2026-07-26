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

Linux gera um pacote Debian e um ZIP que contém somente esse pacote. Windows gera
um instalador NSIS e seu ZIP isolado. Cada plataforma recebe checksums, SBOM
CycloneDX, inventário de proveniência e estado explícito de assinatura. Consulte
[docs/seguranca-windows.md](docs/seguranca-windows.md).

## Release

Com o repositório limpo e as alterações já enviadas à branch principal:

```bash
scripts/release.sh v1.0.0
```

O script executa o preflight sem enviar tags e inicia o workflow autorizado.
Depois que os dois pacotes e suas evidências passam, o workflow publica
`v1.0.0-linux`, `v1.0.0-windows` e por último `v1.0.0`, sem sobrescrita.
Consulte o [guia de releases](docs/releases.md).
