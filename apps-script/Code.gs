/**
 * Almacén común de la web de tests: usuarias, PIN, resultados y tablero.
 * Va pegado en el Apps Script de una hoja de Google (Extensiones > Apps Script)
 * y se implementa como aplicación web: «Ejecutar como: yo», «Quién tiene acceso: cualquiera».
 *
 * La web envía el PIN ya resumido (SHA-256); aquí se vuelve a resumir con una sal propia
 * y se compara. Cinco fallos seguidos bloquean a esa usuaria 15 minutos. Leer el tablero
 * es público; escribir o leer el historial propio exige el PIN.
 */
const HOJA_USUARIAS = "Usuarias", HOJA_RESULTADOS = "Resultados", HOJA_USADAS = "Usadas";
const INICIALES = ["Ana", "Carmen", "Georgina"];
const PRUEBA = "Prueba";   // perfil de pruebas: no sale en el tablero ni ocupa plaza
const MAX_USUARIAS = 5, MAX_FALLOS = 5, BLOQUEO_SEG = 15 * 60, ZONA = "Europe/Madrid";

function doGet(e) {
  return responder(() => {
    if ((e.parameter.accion || "estado") !== "estado") throw new Error("Acción desconocida.");
    return estado();
  });
}

function doPost(e) {
  return responder(() => {
    const d = JSON.parse(e.postData.contents || "{}");
    switch (d.accion) {
      case "nueva": return conCandado(() => nueva(d.nombre));
      case "crearPin": return conCandado(() => crearPin(d.nombre, d.clave));
      case "entrar": comprobar(d.nombre, d.clave); return { ok: true, historial: historial(d.nombre), usadas: usadas(d.nombre) };
      case "guardar": comprobar(d.nombre, d.clave); return conCandado(() => guardar(d.nombre, d.resultado, d.usadas));
      case "borrar": comprobar(d.nombre, d.clave); return conCandado(() => borrarTodo(d.nombre));
      default: throw new Error("Acción desconocida.");
    }
  });
}

function responder(fn) {
  let salida;
  try { salida = fn(); } catch (err) { salida = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

function conCandado(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- hojas ----------
function hoja(nombre) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (h) return h;
  h = libro.insertSheet(nombre);
  if (nombre === HOJA_USUARIAS) {
    h.appendRow(["Nombre", "PIN (resumen)", "Alta"]);
    INICIALES.forEach(n => h.appendRow([n, "", new Date()]));
  } else if (nombre === HOJA_RESULTADOS) {
    h.appendRow(["Fecha", "Nombre", "Tipo", "Descripción", "Nota", "Sobre", "Superado", "Aciertos", "Errores", "En blanco", "Preguntas", "fin_ms"]);
  } else if (nombre === HOJA_USADAS) {
    h.appendRow(["Nombre", "Preguntas usadas en simulacros"]);
  }
  h.setFrozenRows(1);
  return h;
}
const filas = h => h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues();
function filaDe(h, nombre) { const f = filas(h); for (let i = 0; i < f.length; i++) if (f[i][0] === nombre) return i + 2; return 0; }

// ---------- usuarias y PIN ----------
function sal() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("SAL");
  if (!s) { s = Utilities.getUuid(); p.setProperty("SAL", s); }
  return s;
}
function resumen(clave) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal() + ":" + clave)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}
function limpiaNombre(n) {
  n = String(n || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!n) throw new Error("Falta el nombre.");
  return n;
}
function nueva(nombre) {
  nombre = limpiaNombre(nombre);
  const h = hoja(HOJA_USUARIAS);
  if (filaDe(h, nombre)) return { ok: true };
  if (nombre !== PRUEBA && filas(h).filter(f => f[0] !== PRUEBA).length >= MAX_USUARIAS) throw new Error(`Ya hay ${MAX_USUARIAS} personas.`);
  h.appendRow([nombre, "", new Date()]);
  return { ok: true };
}
function crearPin(nombre, clave) {
  if (!/^[0-9a-f]{64}$/.test(String(clave))) throw new Error("PIN no válido.");
  const h = hoja(HOJA_USUARIAS), r = filaDe(h, nombre);
  if (!r) throw new Error("No existe esa persona.");
  if (h.getRange(r, 2).getValue()) throw new Error("Esa persona ya tiene PIN.");
  h.getRange(r, 2).setValue(resumen(clave));
  return { ok: true, historial: [], usadas: [] };
}
function comprobar(nombre, clave) {
  const cache = CacheService.getScriptCache(), k = "fallos:" + nombre;
  const fallos = Number(cache.get(k) || 0);
  if (fallos >= MAX_FALLOS) throw new Error("Demasiados intentos. Espera 15 minutos.");
  const h = hoja(HOJA_USUARIAS), r = filaDe(h, nombre);
  const guardado = r ? h.getRange(r, 2).getValue() : "";
  if (!guardado || guardado !== resumen(clave)) {
    cache.put(k, String(fallos + 1), BLOQUEO_SEG);
    throw new Error("PIN incorrecto.");
  }
  cache.remove(k);
}

// ---------- resultados ----------
function guardar(nombre, r, ids) {
  if (!r || typeof r.nota !== "number") throw new Error("Resultado no válido.");
  // la web reintenta si una respuesta se pierde: el mismo resultado (persona y hora exacta) solo se guarda una vez
  const fin = Number(r.fin) || Date.now();
  if (filas(hoja(HOJA_RESULTADOS)).some(f => f[1] === nombre && Number(f[11]) === fin)) return { ok: true, tablero: tablero() };
  hoja(HOJA_RESULTADOS).appendRow([new Date(r.fin || Date.now()), nombre, r.tipo === "simulacro" ? "simulacro" : "test",
    String(r.desc || "").slice(0, 120), r.nota, r.maximo, r.aprobado ? "sí" : "no", r.a, r.e, r.b, r.n, r.fin || Date.now()]);
  if (Array.isArray(ids) && ids.length) {
    const h = hoja(HOJA_USADAS), fila = filaDe(h, nombre);
    const previas = fila ? String(h.getRange(fila, 2).getValue()).split(",").filter(Boolean) : [];
    let todas = [...new Set(previas.concat(ids.map(String)))].join(",");
    if (todas.length > 45000) todas = ids.join(",");      // una celda admite 50.000 caracteres: se empieza de nuevo
    if (fila) h.getRange(fila, 2).setValue(todas); else h.appendRow([nombre, todas]);
  }
  return { ok: true, tablero: tablero() };
}
function historial(nombre) {
  return filas(hoja(HOJA_RESULTADOS)).filter(f => f[1] === nombre)
    .map(f => ({ tipo: f[2], desc: f[3], nota: f[4], maximo: f[5], aprobado: f[6] === "sí", fin: Number(f[11]) }))
    .sort((a, b) => b.fin - a.fin).slice(0, 50);
}
function usadas(nombre) {
  const h = hoja(HOJA_USADAS), fila = filaDe(h, nombre);
  return fila ? String(h.getRange(fila, 2).getValue()).split(",").filter(Boolean) : [];
}
function borrarTodo(nombre) {
  const h = hoja(HOJA_RESULTADOS), f = filas(h);
  for (let i = f.length - 1; i >= 0; i--) if (f[i][1] === nombre) h.deleteRow(i + 2);
  const hu = hoja(HOJA_USADAS), fu = filaDe(hu, nombre);
  if (fu) hu.deleteRow(fu);
  return { ok: true, tablero: tablero() };
}

// ---------- tablero (público) ----------
function estado() {
  const us = filas(hoja(HOJA_USUARIAS)).map(f => ({ nombre: f[0], tienePin: !!f[1] }));   // la web oculta «Prueba» salvo con ?prueba
  return { ok: true, usuarias: us, tablero: tablero(us.map(u => u.nombre)) };
}
function tablero(nombres) {
  nombres = (nombres || filas(hoja(HOJA_USUARIAS)).map(f => f[0])).filter(n => n !== PRUEBA);
  const ahora = new Date();
  const diaSemana = Number(Utilities.formatDate(ahora, ZONA, "u"));          // 1 = lunes
  const lunes = Utilities.formatDate(new Date(ahora.getTime() - (diaSemana - 1) * 86400000), ZONA, "yyyy-MM-dd");
  const res = filas(hoja(HOJA_RESULTADOS));
  return nombres.map(n => {
    const mias = res.filter(f => f[1] === n).sort((a, b) => Number(b[11]) - Number(a[11]));
    const sims = mias.filter(f => f[2] === "simulacro").map(f => Number(f[4]));
    const ult = sims.slice(0, 5);
    return {
      nombre: n,
      mejor: sims.length ? Math.max(...sims) : null,
      media5: ult.length ? Math.round(ult.reduce((a, b) => a + b, 0) / ult.length * 100) / 100 : null,
      simulacros: sims.length,
      semana: mias.filter(f => Utilities.formatDate(new Date(Number(f[11])), ZONA, "yyyy-MM-dd") >= lunes).length,
      total: mias.length,
    };
  });
}
