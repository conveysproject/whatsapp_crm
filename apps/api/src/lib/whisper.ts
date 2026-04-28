import OpenAI from "openai";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

export async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<string> {
  const urlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!urlRes.ok) throw new Error(`Failed to get media URL for ${mediaId}`);
  const urlData = await urlRes.json() as { url: string };

  const mediaRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) throw new Error(`Failed to download media ${mediaId}`);

  const tmpPath = join(tmpdir(), `wa-audio-${mediaId}.ogg`);
  const fileStream = createWriteStream(tmpPath);
  if (!mediaRes.body) throw new Error("Empty response body from media download");
  await pipeline(mediaRes.body as unknown as NodeJS.ReadableStream, fileStream);
  return tmpPath;
}

export async function transcribeAudio(mediaId: string, accessToken: string): Promise<string> {
  const tmpPath = await downloadWhatsAppMedia(mediaId, accessToken);
  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(tmpPath),
    model: "whisper-1",
  });
  return transcription.text;
}
