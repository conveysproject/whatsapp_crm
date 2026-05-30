-- Add flow_session to conversations (pause/resume flow execution)
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "flow_session" JSONB;

-- Add current_node_id to flow_runs (track execution position)
ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "current_node_id" TEXT;
