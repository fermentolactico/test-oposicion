#!/bin/sh
# Pasa todas las pruebas contra la web servida en local (http://127.0.0.1:8765) y el servidor real.
# Uso: cd pruebas && npm install && ADMIN=<contraseña de admin> npm run todas      (antes de publicar cualquier cambio)
# Sin ADMIN se salta la prueba del reto en grupo (necesita borrar personas temporales).
set -e
cd "$(dirname "$0")"
mkdir -p descargas
(cd .. && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &) ; sleep 1
trap 'pkill -f "http.server 8765"' EXIT
echo "== estudio y tiempo";                node estudio-y-tiempo.js
echo "== simulacro y test a medias";       node simulacro-y-test-a-medias.js
if [ -n "$ADMIN" ]; then echo "== reto en grupo"; node reto-en-grupo.js "$ADMIN"; fi
echo "== velocidad";                       node velocidad.js http://127.0.0.1:8765/
