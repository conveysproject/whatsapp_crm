-- CreateTable
CREATE TABLE "chatbots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flow_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_sessions" (
    "id" TEXT NOT NULL,
    "chatbot_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "current_node_id" TEXT,
    "is_escalated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chatbots_organization_id_idx" ON "chatbots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_sessions_conversation_id_key" ON "bot_sessions"("conversation_id");

-- CreateIndex
CREATE INDEX "bot_sessions_conversation_id_idx" ON "bot_sessions"("conversation_id");

-- AddForeignKey
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
