#!/usr/bin/env bash
set -euo pipefail
case "${1:-serve}" in
  serve)    exec node src/server.js ;;
  generate) exec node src/generate.js data/sample-sirikap.json output/hasil-ulo.pdf ;;
  validate) exec python3 scripts/validate.py fixtures/lampiran.pdf output/hasil-ulo.pdf ;;
  all)      node src/generate.js data/sample-sirikap.json output/hasil-ulo.pdf
            exec python3 scripts/validate.py fixtures/lampiran.pdf output/hasil-ulo.pdf ;;
  test)     exec npm test ;;
  shell)    exec bash ;;
  *)        exec "$@" ;;
esac
