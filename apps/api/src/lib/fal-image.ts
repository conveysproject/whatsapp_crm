import { fal } from "@fal-ai/client";
import { uploadToR2 } from "./r2.js";

export async function generateAndUploadImage(
  prompt: string,
  organizationId: string,
): Promise<string> {
  if (!process.env["FAL_KEY"]) throw new Error("FAL_KEY is not set");

  fal.config({ credentials: process.env["FAL_KEY"] });

  const result = await fal.run("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "landscape_4_3",
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    },
  }) as unknown as { images: Array<{ url: string; content_type: string }> };

  const image = result.images[0];
  if (!image?.url) throw new Error("fal.ai returned no image");

  const imageRes = await fetch(image.url);
  if (!imageRes.ok) throw new Error(`Failed to fetch generated image: ${imageRes.status}`);
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  const { url } = await uploadToR2(buffer, organizationId, image.content_type ?? "image/jpeg");
  return url;
}
