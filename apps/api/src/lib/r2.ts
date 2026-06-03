import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const client = new S3Client({
  region: "auto",
  endpoint: process.env["R2_ENDPOINT"]!,
  credentials: {
    accessKeyId: process.env["R2_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"]!,
  },
});

const BUCKET = process.env["R2_BUCKET_NAME"] ?? "wbmsg-media";
const PUBLIC_URL = (process.env["R2_PUBLIC_URL"] ?? "").replace(/\/$/, "");

export async function uploadToR2(
  file: Buffer,
  organizationId: string,
  mimeType: string,
): Promise<{ key: string; url: string }> {
  const rawExt = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  // Normalise common mime subtypes to clean extensions
  const extMap: Record<string, string> = {
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "msword": "doc",
    "vnd.ms-excel": "xls",
  };
  const ext = extMap[rawExt] ?? rawExt;
  const key = `${organizationId}/${randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: mimeType,
    }),
  );

  return { key, url: `${PUBLIC_URL}/${key}` };
}

export async function deleteFromR2(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export { PUBLIC_URL as R2_PUBLIC_URL };
