#!/bin/sh
# Pasa todas las pruebas contra la web servida en local (http://127.0.0.1:8765) y el servidor real.
# Uso: cd pruebas && npm install && npm run todas      (antes de publicar cualquier cambio)
set -e
cd "$(dirname "$0")"
mkdir -p descargas
(cd .. && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &) ; sleep 1
trap 'pkill -f "http.server 8765"' EXIT
echo "== estudio y tiempo";                node estudio-y-tiempo.js
echo "== simulacro y test a medias";       node simulacro-y-test-a-medias.js
echo "== velocidad";                       node velocidad.js http://127.0.0.1:8765/
