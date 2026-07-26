#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([\-][0-9A-Za-z.-]+)?([\+][0-9A-Za-z.-]+)?$ ]]; then
  echo "Uso: scripts/release.sh vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

node scripts/release-preflight.mjs "$version"
command -v gh >/dev/null || { echo "GitHub CLI (gh) é obrigatório." >&2; exit 1; }
gh workflow run release.yml --ref main -f "version=$version"
echo "Preflight concluído. O workflow só enviará as três tags após validar as duas plataformas."
