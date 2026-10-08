#!/usr/bin/env python3
"""Vuelca el banco de preguntas a preguntas.json para la web.

Usa las mismas funciones que examen.py (el del tutor), así la web y el tutor
eligen y puntúan con las mismas reglas y el mismo banco: tests/ del repo de la
oposición. Para añadir preguntas se añaden allí; luego:

    /Users/nadal/.local/venvs/oposicion/bin/python exportar.py
    git add preguntas.json && git commit -m "Preguntas al día" && git push
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".openclaw/agents/tutor/agent/workshop-skills/oposicion-ib-salut"))
import examen  # noqa: E402

rep, pesos = examen._tribunal()
banco = examen.banco()
preguntas = [
    dict(id=p["origen"], t=p["tema"], e=p["enunciado"], o=p["opciones"], c="abcd".index(p["correcta"]),
         of=int(p["oficial"]), r=rep.get(p["origen"], 0), g=int(p["generada"]))
    for p in banco
]
# Origen del banco, para la tabla de la web: por tipo de fuente y, dentro, por examen o academia.
# Solo cuenta las preguntas que entran en los tests (las de examen.banco(), ya sin repetidas).
import re, collections
def titulo(origen):
    f = examen.BANCO.parent / origen.split("#")[0]
    t = f.read_text(encoding="utf8").split("\n", 1)[0].lstrip("# ").strip()
    t = re.sub(r"^Examen de bolsa\s+", "Bolsa ", t)
    t = re.sub(r"^(Examen|Test)\s+", "", t)
    año = re.match(r"(\d{4})-", f.name)
    return t + (f" ({año.group(1)})" if año and año.group(1) not in t else "")
cuenta = collections.Counter()
for p in banco:
    carpeta = p["origen"].split("/")[1]
    if carpeta == "oficiales":
        cuenta[("Exámenes oficiales del IB-Salut", titulo(p["origen"]))] += 1
    elif carpeta == "academias":
        nombre = p["origen"].split("/")[2]
        cuenta[("Academias", "Benet Rubert" if nombre.startswith("benet") else "Xisco" if nombre.startswith("xisco") else "Otras academias")] += 1
    else:
        cuenta[("Generadas para el temario 2026", "Preguntas nuevas por tema (verificadas con la ley)")] += 1
ORDEN = ["Exámenes oficiales del IB-Salut", "Academias", "Generadas para el temario 2026"]
origenes = [dict(grupo=g, fuente=f, n=n) for (g, f), n in sorted(cuenta.items(), key=lambda x: (ORDEN.index(x[0][0]), -x[1]))]

datos = dict(
    origenes=origenes,
    preguntas=preguntas,
    pesos={str(t): n for t, n in sorted(pesos.items())},
    reglas=dict(maximo=examen.MAXIMO, minimo=examen.MINIMO, preguntas=examen.PREGUNTAS,
                reserva=examen.RESERVA, minutos=examen.MINUTOS, cita=examen.CITA),
)
Path(__file__).with_name("preguntas.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
print(f"{len(preguntas)} preguntas · {sum(p['of'] for p in preguntas)} oficiales · "
      f"temas {min(p['t'] for p in preguntas)}-{max(p['t'] for p in preguntas)}")
