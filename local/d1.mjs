// La parte de la API de D1 (Cloudflare) que usa servidor/src/index.js, sobre SQLite (node:sqlite)
// (node:sqlite, Node 26): prepare(sql).bind(...).first()/all()/run() y batch([...]).
// Así el mismo código del servidor corre aquí sin tocarlo.
import { DatabaseSync } from "node:sqlite";

class Sentencia {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Sentencia(this.db, this.sql, params); }
  st() { return this.db.prepare(this.sql); }
  // D1 devuelve null cuando no hay fila; node:sqlite, undefined
  async first() { return this.st().get(...this.params) ?? null; }
  async all() { return { results: this.st().all(...this.params), success: true }; }
  async run() { const r = this.st().run(...this.params); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  ejecutar() {   // dentro de un lote: SELECT devuelve filas; el resto, el resumen
    return /^\s*(select|with|pragma)\b/i.test(this.sql)
      ? { results: this.st().all(...this.params), success: true }
      : (r => ({ success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }))(this.st().run(...this.params));
  }
}

export function abrirD1(ruta) {
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return {
    db,
    prepare: sql => new Sentencia(db, sql),
    // D1 ejecuta un lote como una transacción: o todo o nada
    async batch(sentencias) {
      db.exec("BEGIN");
      try { const r = sentencias.map(s => s.ejecutar()); db.exec("COMMIT"); return r; }
      catch (err) { db.exec("ROLLBACK"); throw err; }
    },
  };
}
