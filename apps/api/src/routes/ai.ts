import type { FastifyPluginAsync } from "fastify";
import { generateSuggestions, detectIntent, analyzeSentiment, generateSmartReplies, detectIntentWithConfidence, buildAiContext, summarizeConversation, AI_CONTEXT_LONG } from "../lib/claude.js";
import { findTopRelevantSections, generateAnswerFromSections } from "../lib/ai-rag.js";
import type { ConversationId, MessageId } from "@WBMSG/shared";

export const aiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ConversationId } }>(
    "/conversations/:id/suggestions",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }

      // GAP-S26: use contact's past AI summary for sliding window (6 vs 30 messages)
      const contact = conversation.contactId
        ? await fastify.prisma.contact.findUnique({
            where: { id: conversation.contactId },
            select: { pastAiSummary: true },
          })
        : null;

      const messages = await fastify.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "desc" },
        take: AI_CONTEXT_LONG,
      });

      const { contextMessages } = await buildAiContext(messages.toReversed(), contact?.pastAiSummary);

      // Auto-summarize after 30 messages and store back to contact
      if (!contact?.pastAiSummary && messages.length >= AI_CONTEXT_LONG && conversation.contactId) {
        void (async () => {
          try {
            const summary = await summarizeConversation(
              messages.toReversed().map((m) => ({ body: m.body, direction: m.direction, sentAt: m.sentAt }))
            );
            if (summary) {
              await fastify.prisma.contact.update({
                where: { id: conversation.contactId! },
                data: { pastAiSummary: summary },
              });
            }
          } catch { /* non-critical */ }
        })();
      }

      const suggestions = await generateSuggestions(contextMessages);
      return reply.send({ data: { suggestions } });
    }
  );

  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/analyze",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      if (!message.body) {
        return reply.status(400).send({ error: { code: "NO_BODY", message: "Message has no text body to analyze" } });
      }

      const [intent, sentiment] = await Promise.all([
        detectIntent(message.body),
        analyzeSentiment(message.body),
      ]);

      return reply.send({ data: { intent, sentiment } });
    }
  );

  // ── Smart replies ────────────────────────────────────────────────────────
  fastify.post<{ Body: { conversationId: string } }>("/ai/smart-replies", async (request, reply) => {
    if (!request.body.conversationId) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "conversationId is required" } });
    }
    const { organizationId } = request.auth;
    const messages = await fastify.prisma.message.findMany({
      where: { conversationId: request.body.conversationId, organizationId },
      orderBy: { sentAt: "desc" },
      take: 10,
      select: { body: true, direction: true },
    });
    const flowise = await fastify.prisma.vendorSetting.findFirst({
      where: { organizationId, key: "flowise_url" },
    });
    let replies: string[];
    if (flowise?.value) {
      const flowiseSetting = await fastify.prisma.vendorSetting.findFirst({
        where: { organizationId, key: "flowise_access_token" },
      });
      const flowiseRes = await fetch(`${flowise.value}/api/v1/prediction/smart-replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(flowiseSetting?.value ? { Authorization: `Bearer ${flowiseSetting.value}` } : {}),
        },
        body: JSON.stringify({ messages: messages.toReversed() }),
      });
      const flowiseData = await flowiseRes.json() as { replies?: string[] };
      replies = flowiseData.replies ?? [];
    } else {
      replies = await generateSmartReplies(messages.toReversed());
    }
    return reply.send({ data: { replies } });
  });

  // ── Intent detection ─────────────────────────────────────────────────────
  fastify.post<{ Body: { messageId: string; text: string } }>("/ai/intent", async (request, reply) => {
    if (!request.body.text) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "text is required" } });
    }
    const result = await detectIntentWithConfidence(request.body.text);
    return reply.send({ data: result });
  });

  // ── RAG answer from training data (GAP-S27) ───────────────────────────────
  fastify.post<{ Body: { question: string; topK?: number } }>("/ai/rag-answer", async (request, reply) => {
    const { organizationId } = request.auth;
    const { question, topK = 3 } = request.body;
    if (!question) return reply.status(400).send({ error: { code: "MISSING_QUESTION", message: "question is required" } });
    if (!process.env["OPENAI_API_KEY"]) {
      return reply.status(400).send({ error: { code: "NO_OPENAI_KEY", message: "OPENAI_API_KEY not configured; RAG mode requires OpenAI embeddings" } });
    }
    const sections = await findTopRelevantSections(organizationId, question, Math.min(topK, 5));
    if (sections.length === 0) {
      return reply.send({ data: { answer: null, sections: [], note: "No training data found; upload training text via vendor settings (key: open_ai_input_training_data)" } });
    }
    const answer = await generateAnswerFromSections(question, sections);
    return reply.send({ data: { answer, sections } });
  });
};
