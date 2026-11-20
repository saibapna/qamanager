#!/usr/bin/env bash
set -euo pipefail
case "${1:-generate}" in
  generate) node src/generate.js data/sample-sirikap.json output/hasil-ulo.pdf ;;
  validate) python scripts/validate.py fixtures/lampiran.pdf output/hasil-ulo.pdf ;;
  all)      node src/generate.js data/sample-sirikap.json output/hasil-ulo.pdf && \
            python scripts/validate.py fixtures/lampiran.pdf output/hasil-ulo.pdf ;;
  test)     npm test ;;
  shell)    exec bash ;;
  *)        echo "Usage: $0 [generate|validate|all|test|shell]"; exit 1 ;;
esac
