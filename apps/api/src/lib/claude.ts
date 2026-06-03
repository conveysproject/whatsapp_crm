import OpenAI from "openai";

function getClient(): OpenAI {
  if (!process.env["OPENAI_API_KEY"]) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
}

const MODEL = "gpt-4o-mini";

export type IntentType = "question" | "complaint" | "order" | "compliment" | "other";
export type SentimentType = "positive" | "negative" | "neutral";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful customer support assistant for WBMSG, a WhatsApp-first CRM.
Your job is to help support agents respond to customer messages.
Be concise, professional, and empathetic. Respond in the same language as the customer.`;

// GAP-S26: sliding window — 6 messages when a past summary exists; 30 messages when not.
export const AI_CONTEXT_SHORT = 6;
export const AI_CONTEXT_LONG = 30;

function text(response: OpenAI.Chat.ChatCompletion): string {
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function buildAiContext(
  messages: { body: string | null; direction: string }[],
  pastSummary?: string | null
): Promise<{ contextMessages: Message[]; systemContext: string }> {
  const limit = pastSummary ? AI_CONTEXT_SHORT : AI_CONTEXT_LONG;
  const recent = messages.slice(-limit);
  const contextMessages: Message[] = recent
    .filter((m) => m.body)
    .map((m) => ({
      role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: m.body ?? "",
    }));
  const systemContext = pastSummary
    ? `Previous conversation summary:\n${pastSummary}\n\n${SYSTEM_PROMPT}`
    : SYSTEM_PROMPT;
  return { contextMessages, systemContext };
}

export async function generateSuggestions(
  history: Message[],
  count = 3
): Promise<string[]> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      {
        role: "user",
        content: `Based on this conversation, generate ${count} short, natural reply suggestions for the agent. Return ONLY a JSON array of strings. No explanation.`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(text(response)) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string").slice(0, count);
  } catch { /* return empty */ }
  return [];
}

export async function detectIntent(messageBody: string): Promise<IntentType> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 16,
    messages: [
      { role: "system", content: "Classify the customer message intent. Reply with exactly one word: question, complaint, order, compliment, or other." },
      { role: "user", content: messageBody },
    ],
  });

  const result = text(response).toLowerCase() as IntentType;
  const valid: IntentType[] = ["question", "complaint", "order", "compliment", "other"];
  return valid.includes(result) ? result : "other";
}

export async function analyzeSentiment(messageBody: string): Promise<SentimentType> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 16,
    messages: [
      { role: "system", content: "Classify the sentiment of this customer message. Reply with exactly one word: positive, negative, or neutral." },
      { role: "user", content: messageBody },
    ],
  });

  const result = text(response).toLowerCase() as SentimentType;
  const valid: SentimentType[] = ["positive", "negative", "neutral"];
  return valid.includes(result) ? result : "neutral";
}

export async function generateSmartReplies(
  messages: { body: string | null; direction: string }[]
): Promise<string[]> {
  const conversation = messages
    .filter((m) => m.body)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
    .join("\n");

  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Given this WhatsApp conversation, suggest 3 short, helpful reply options for the agent. Return ONLY a JSON array of 3 strings, nothing else.\n\nConversation:\n${conversation}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(text(response)) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string").slice(0, 3);
  } catch { /* fallthrough */ }
  return ["Thank you for your message.", "Let me check on that for you.", "I'll get back to you shortly."];
}

export async function summarizeConversation(
  messages: { body: string | null; direction: string; sentAt: Date }[],
  existingSummary?: string | null
): Promise<string> {
  const transcript = messages
    .filter((m) => m.body)
    .map((m) => `[${m.sentAt.toISOString().slice(0, 10)}] ${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
    .join("\n");

  const context = existingSummary
    ? `Previous summary:\n${existingSummary}\n\nNew messages:\n${transcript}`
    : transcript;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      { role: "system", content: "You are a CRM assistant. Summarize customer conversations concisely for agents. Focus on: what the customer needed, what was resolved, any follow-up actions. Max 3 sentences." },
      { role: "user", content: context },
    ],
  });

  return text(response);
}

export async function detectIntentWithConfidence(
  messageText: string
): Promise<{ intent: string; confidence: number }> {
  const intents = ["purchase_inquiry", "support_request", "complaint", "general_inquiry", "pricing", "refund_request"];
  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Classify this message into one of these intents: ${intents.join(", ")}. Return ONLY a JSON object with "intent" and "confidence" (0-1). Message: "${messageText}"`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(text(response)) as unknown;
    if (parsed && typeof parsed === "object" && "intent" in parsed && "confidence" in parsed) {
      return parsed as { intent: string; confidence: number };
    }
  } catch { /* fallthrough */ }
  return { intent: "general_inquiry", confidence: 0.5 };
}
