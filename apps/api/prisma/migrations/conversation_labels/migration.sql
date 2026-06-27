CREATE TABLE inbox_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  TEXT NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_inbox_labels_org ON inbox_labels(organization_id);

CREATE TABLE conversation_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT NOT NULL UNIQUE,
  inbox_label_id   TEXT NOT NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_conv  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_label FOREIGN KEY (inbox_label_id)  REFERENCES inbox_labels(id)  ON DELETE CASCADE
);
CREATE INDEX idx_conv_labels_label ON conversation_labels(inbox_label_id);
