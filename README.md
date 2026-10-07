# Test de oposición

Web de tests para la oposición A2 (grupo de gestión de la función administrativa, IB-Salut).
Simulacros como el examen real y tests de estudio por temas, con descarga del test y de
las respuestas en PDF. Sin registro: los resultados se guardan en el navegador de cada uno.

Las preguntas salen del banco del repo de la oposición (`tests/`), con las mismas reglas que
`examen.py` del tutor (selección y puntuación del BOIB 72/2026).

## Añadir preguntas

1. Añadirlas al banco del repo de la oposición, en el formato de siempre.
2. Volcarlas y publicar:

```
/Users/nadal/.local/venvs/oposicion/bin/python exportar.py
git add preguntas.json && git commit -m "Preguntas al día" && git push
```

GitHub Pages publica el cambio en uno o dos minutos.
