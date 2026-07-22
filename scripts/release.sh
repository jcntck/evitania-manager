#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Uso: scripts/release.sh vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

package_version="$(node -p "require('./package.json').version")"
if [[ "$version" != "v$package_version" ]]; then
  echo "A tag $version não corresponde à versão $package_version do package.json." >&2
  echo "Execute: npm version ${version#v} --no-git-tag-version" >&2
  echo "Depois faça commit e push da alteração antes de tentar novamente." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "O repositório deve estar limpo antes da release." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/$version" >/dev/null; then
  echo "A tag $version já existe." >&2
  exit 1
fi

npm ci
npm test
npm run typecheck
npm run build
npm audit --omit=dev

git tag -a "$version" -m "Release $version"
git push origin "$version"

echo "Tag publicada. O GitHub Actions gerará uma Release com os builds de Linux e Windows."
