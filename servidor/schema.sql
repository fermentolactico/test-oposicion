-- Base de datos de la web de tests. Aplicar: npx wrangler d1 execute test-oposicion --remote --file schema.sql
CREATE TABLE IF NOT EXISTS usuarias (
  nombre TEXT PRIMARY KEY,
  pin    TEXT NOT NULL DEFAULT '',      -- resumen SHA-256 con sal; vacío = aún no tiene PIN
  alta   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS resultados (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT NOT NULL,
  tipo     TEXT NOT NULL,               -- 'simulacro' o 'test'
  descr    TEXT NOT NULL DEFAULT '',
  nota     REAL NOT NULL,
  maximo   REAL NOT NULL,
  aprobado INTEGER NOT NULL,
  a INTEGER, e INTEGER, b INTEGER, n INTEGER,
  fin      INTEGER NOT NULL,            -- milisegundos; con el nombre identifica el resultado
  UNIQUE (nombre, fin)                  -- un reintento no duplica nada
);
CREATE INDEX IF NOT EXISTS resultados_nombre ON resultados (nombre, fin);
CREATE TABLE IF NOT EXISTS usadas (     -- preguntas ya salidas en los simulacros de cada una
  nombre TEXT NOT NULL,
  h      TEXT NOT NULL,
  PRIMARY KEY (nombre, h)
);
CREATE TABLE IF NOT EXISTS fallos (     -- intentos de PIN fallidos seguidos
  nombre TEXT PRIMARY KEY,
  n      INTEGER NOT NULL,
  hasta  INTEGER NOT NULL
);
INSERT OR IGNORE INTO usuarias (nombre, pin, alta) VALUES
  ('Ana', '', unixepoch() * 1000), ('Carmen', '', unixepoch() * 1000), ('Georgina', '', unixepoch() * 1000);
