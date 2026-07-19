#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Uso: scripts/release.sh vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "O repositório deve estar limpo antes da release." >&2
  exit 1
fi

for tag in "$version" "$version-linux" "$version-windows"; do
  if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    echo "A tag $tag já existe." >&2
    exit 1
  fi
done

npm ci
npm test
npm run typecheck
npm run build
npm audit --omit=dev

git tag -a "$version" -m "Release $version"
git tag -a "$version-linux" -m "Linux build for $version"
git tag -a "$version-windows" -m "Windows build for $version"
git push origin "$version" "$version-linux" "$version-windows"

echo "Tags publicadas. O GitHub Actions gerará os artefatos por plataforma."
