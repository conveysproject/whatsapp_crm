import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma.js";

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] ?? "" });
}

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] ?? "" });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

// GAP-S27: split training text into ≤500-char chunks on sentence boundaries
export function splitIntoSentences(text: string, maxLen = 500): string[] {
  const raw = text.split(/(?<=[.!?])\s+|\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const part of raw) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length > maxLen) {
      if (current.trim().length > 10) chunks.push(current.trim());
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 10) chunks.push(current.trim());
  return chunks;
}

// Embed a list of text sections using text-embedding-3-small
export async function embedSections(sections: string[]): Promise<number[][]> {
  if (sections.length === 0) return [];
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: sections,
  });
  return response.data.map((d) => d.embedding);
}

// Store embeddings to VendorSettings (key: "ai_training_embeddings")
export async function storeTrainingEmbeddings(organizationId: string, text: string): Promise<void> {
  const sections = splitIntoSentences(text);
  if (sections.length === 0) return;
  const embeddings = await embedSections(sections);
  const data = sections.map((s, i) => ({ text: s, embedding: embeddings[i] ?? [] }));
  await prisma.vendorSetting.upsert({
    where: { organizationId_key: { organizationId, key: "ai_training_embeddings" } },
    create: { organizationId, key: "ai_training_embeddings", value: JSON.stringify(data), dataType: "json" },
    update: { value: JSON.stringify(data) },
  });
}

// Find top-k most relevant sections for a query via cosine similarity
export async function findTopRelevantSections(
  organizationId: string,
  query: string,
  k = 3
): Promise<string[]> {
  const setting = await prisma.vendorSetting.findFirst({
    where: { organizationId, key: "ai_training_embeddings" },
    select: { value: true },
  });
  if (!setting?.value) return [];

  const stored = JSON.parse(setting.value) as Array<{ text: string; embedding: number[] }>;
  if (stored.length === 0) return [];

  const [queryEmbedding] = await embedSections([query]);
  if (!queryEmbedding) return [];

  const ranked = stored
    .map((s) => ({ text: s.text, score: cosineSimilarity(queryEmbedding, s.embedding) }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, k).map((r) => r.text);
}

// Generate an answer from the top-k relevant training sections using Claude
export async function generateAnswerFromSections(
  question: string,
  sections: string[]
): Promise<string> {
  if (sections.length === 0) return "";
  const context = sections.map((s, i) => `[Section ${i + 1}]: ${s}`).join("\n\n");
  const response = await getAnthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `You are a helpful assistant. Answer the user's question using ONLY the provided context sections. If the answer is not in the context, say "I don't have information about that."`,
    messages: [{ role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }],
  });
  return response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
}
