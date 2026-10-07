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
preguntas = [
    dict(id=p["origen"], t=p["tema"], e=p["enunciado"], o=p["opciones"], c="abcd".index(p["correcta"]),
         of=int(p["oficial"]), r=rep.get(p["origen"], 0), g=int(p["generada"]))
    for p in examen.banco()
]
datos = dict(
    preguntas=preguntas,
    pesos={str(t): n for t, n in sorted(pesos.items())},
    reglas=dict(maximo=examen.MAXIMO, minimo=examen.MINIMO, preguntas=examen.PREGUNTAS,
                reserva=examen.RESERVA, minutos=examen.MINUTOS, cita=examen.CITA),
)
Path(__file__).with_name("preguntas.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
print(f"{len(preguntas)} preguntas · {sum(p['of'] for p in preguntas)} oficiales · "
      f"temas {min(p['t'] for p in preguntas)}-{max(p['t'] for p in preguntas)}")
