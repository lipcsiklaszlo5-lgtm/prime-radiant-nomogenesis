#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "$(node --version)" in
  v22.*) ;;
  *) echo 'Node.js 22 is required; see .nvmrc' >&2; exit 2 ;;
esac
command -v python3 >/dev/null
test -f package-lock.json
test -s artifacts/nomogenesis-v2.wasm

printf '%s  %s\n' \
  '2730e3d0413929aa15201d27f23ce4173731745dab658c1b21f12c624cb93b9e' \
  'artifacts/nomogenesis-v2.wasm' | sha256sum --check --status

# Require this checkout's installed npm package, irrespective of the caller's
# shell environment or another checkout on the same machine.
unset NODE_PATH PYTHONHOME PYTHONPATH
node -e "require.resolve('near-workspaces')"

# The SDK is used by the lifecycle auditor. If its Python dependencies are
# absent, install the local package into an isolated environment.
if PYTHONPATH="$ROOT/sdk/python/src" python3 -c 'import nomogenesis.client' >/dev/null 2>&1; then
  export PYTHONPATH="$ROOT/sdk/python/src"
elif test -f sdk/python/pyproject.toml; then
  python3 -m venv node_modules/.nomogenesis-verify-venv
  node_modules/.nomogenesis-verify-venv/bin/python -m pip install \
    --disable-pip-version-check --no-input --quiet ./sdk/python
  export PATH="$ROOT/node_modules/.nomogenesis-verify-venv/bin:$PATH"
else
  echo 'Python SDK import failed and no installable pyproject.toml exists' >&2
  exit 2
fi

echo 'FULL_LOCAL_SANDBOX_LIFECYCLE_START'
NOMOGENESIS_V2_WASM="$ROOT/artifacts/nomogenesis-v2.wasm" \
  node scripts/m3/technical_closure.cjs --sandbox
echo 'NOMOGENESIS_SUBMISSION_VERIFY: PASS'
