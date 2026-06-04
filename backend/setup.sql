-- Ejecutar en la base de datos MySQL de Railway
-- stream_type valores válidos: 'hls' | 'twitch' | 'youtube' | 'web'
CREATE TABLE IF NOT EXISTS channels (
  id          CHAR(36)     PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  url         TEXT         NOT NULL,
  stream_type VARCHAR(20)  NOT NULL,
  category    VARCHAR(50)  NOT NULL,
  logo_url    TEXT,
  referer     TEXT,
  user_agent  TEXT,
  added_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Si la tabla ya existe, añadir las columnas nuevas:
-- ALTER TABLE channels ADD COLUMN referer TEXT;
-- ALTER TABLE channels ADD COLUMN user_agent TEXT;

CREATE TABLE IF NOT EXISTS ads (
  id         CHAR(36)     PRIMARY KEY,
  url        TEXT         NOT NULL,
  label      VARCHAR(200) NULL,
  position   INT          NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
