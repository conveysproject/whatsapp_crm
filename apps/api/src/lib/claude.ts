import Anthropic from "@anthropic-ai/sdk";

function getClient(): Anthropic {
  if (!process.env["ANTHROPIC_API_KEY"]) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
}

export type IntentType = "question" | "complaint" | "order" | "compliment" | "other";
export type SentimentType = "positive" | "negative" | "neutral";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful customer support assistant for WBMSG, a WhatsApp-first CRM.
Your job is to help support agents respond to customer messages.
Be concise, professional, and empathetic. Respond in the same language as the customer.`;

export async function generateSuggestions(
  history: Message[],
  count = 3
): Promise<string[]> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      ...history,
      {
        role: "user",
        content: `Based on this conversation, generate ${count} short, natural reply suggestions for the agent. Return ONLY a JSON array of strings. No explanation.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string").slice(0, count);
  } catch {
    // Return empty if parse fails
  }
  return [];
}

export async function detectIntent(messageBody: string): Promise<IntentType> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    system: "Classify the customer message intent. Reply with exactly one word: question, complaint, order, compliment, or other.",
    messages: [{ role: "user", content: messageBody }],
  });

  const text = (response.content[0]?.type === "text" ? response.content[0].text : "other").toLowerCase().trim() as IntentType;
  const valid: IntentType[] = ["question", "complaint", "order", "compliment", "other"];
  return valid.includes(text) ? text : "other";
}

export async function analyzeSentiment(messageBody: string): Promise<SentimentType> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    system: "Classify the sentiment of this customer message. Reply with exactly one word: positive, negative, or neutral.",
    messages: [{ role: "user", content: messageBody }],
  });

  const text = (response.content[0]?.type === "text" ? response.content[0].text : "neutral").toLowerCase().trim() as SentimentType;
  const valid: SentimentType[] = ["positive", "negative", "neutral"];
  return valid.includes(text) ? text : "neutral";
}
