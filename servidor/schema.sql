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

-- Retos en grupo: varias hacen a la vez el mismo test y ven el avance de las demás
CREATE TABLE IF NOT EXISTS retos (
  id        TEXT PRIMARY KEY,
  creadora  TEXT NOT NULL,
  tipo      TEXT NOT NULL,              -- 'simulacro' o 'test'
  config    TEXT NOT NULL,              -- JSON: temas, n, reserva, maximo, minimo
  preguntas TEXT NOT NULL,              -- JSON: identificadores cortos, en orden
  minutos   INTEGER NOT NULL,
  estado    TEXT NOT NULL,              -- esperando · en_curso · cancelado
  creado    INTEGER NOT NULL,
  inicio    INTEGER                     -- ms; lo fija la creadora al empezar (con 5 s de cuenta atrás)
);
CREATE TABLE IF NOT EXISTS reto_part (
  reto        TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  estado      TEXT NOT NULL,            -- invitada · aceptada · rechazada · sin_respuesta
  respondidas INTEGER NOT NULL DEFAULT 0,
  terminado   INTEGER NOT NULL DEFAULT 0,
  nota REAL, maximo REAL, a INTEGER, e INTEGER, b INTEGER, fin INTEGER,
  orden       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (reto, nombre)
);
CREATE INDEX IF NOT EXISTS reto_part_nombre ON reto_part (nombre);
