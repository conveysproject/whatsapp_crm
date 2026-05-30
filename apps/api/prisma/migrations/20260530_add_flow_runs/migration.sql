CREATE TABLE IF NOT EXISTS flow_runs (
  id               VARCHAR(36)  NOT NULL,
  organization_id  VARCHAR(36)  NOT NULL,
  flow_id          VARCHAR(36)  NOT NULL,
  contact_phone    VARCHAR(50),
  conversation_id  VARCHAR(36),
  status           VARCHAR(20)  NOT NULL DEFAULT 'completed',
  steps_executed   INTEGER      NOT NULL DEFAULT 0,
  error            TEXT,
  started_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at     TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT flow_runs_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS flow_runs_org_flow_idx
  ON flow_runs(organization_id, flow_id);
