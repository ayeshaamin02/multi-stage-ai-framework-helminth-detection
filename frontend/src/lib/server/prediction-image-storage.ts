import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const R2_ENDPOINT = process.env.R2_S3_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

let r2Client: S3Client | null = null;

type StoredImageObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  etag?: string;
};

function getMissingR2Config(): string[] {
  const missing: string[] = [];
  if (!R2_ENDPOINT) missing.push("R2_S3_ENDPOINT");
  if (!R2_BUCKET) missing.push("R2_BUCKET_NAME");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  return missing;
}

function assertR2Configured(): void {
  const missing = getMissingR2Config();
  if (missing.length > 0) {
    throw new Error(`R2 is not configured (${missing.join(", ")}).`);
  }
}

function getR2Client(): S3Client {
  assertR2Configured();
  if (r2Client) return r2Client;
  r2Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID as string,
      secretAccessKey: R2_SECRET_ACCESS_KEY as string,
    },
  });
  return r2Client;
}

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
    case "image/x-png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/tiff":
      return "tiff";
    default:
      return "bin";
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildPredictionImageObjectKey(params: {
  userId: string;
  runId: string;
  mimeType: string;
}): string {
  const ext = extensionForMime(params.mimeType || "");
  const userSegment = sanitizePathSegment(params.userId);
  const runSegment = sanitizePathSegment(params.runId);
  return `users/${userSegment}/runs/${runSegment}/original.${ext}`;
}

export function buildStage3AnnotatedObjectKey(params: {
  userId: string;
  runId: string;
}): string {
  const userSegment = sanitizePathSegment(params.userId);
  const runSegment = sanitizePathSegment(params.runId);
  return `users/${userSegment}/runs/${runSegment}/stage3-annotated.png`;
}

export type ExplanationKind = "gradcam" | "lime";
export type ExplanationStage = 1 | 2 | 3;

/**
 * GradCAM keys are deterministic per (run, stage, model) so re-uploads
 * overwrite. LIME keys include a timestamp + sample count so each run gets a
 * distinct object.
 */
export function buildExplanationObjectKey(params: {
  userId: string;
  runId: string;
  stage: ExplanationStage;
  kind: ExplanationKind;
  modelFilename: string;
  /** Required for LIME, ignored for GradCAM. */
  numSamples?: number;
  /** Required for LIME, ignored for GradCAM. */
  createdAtMs?: number;
}): string {
  const userSegment = sanitizePathSegment(params.userId);
  const runSegment = sanitizePathSegment(params.runId);
  const modelSlug = sanitizePathSegment(
    params.modelFilename.replace(/\.(keras|pt)$/i, ""),
  );
  const prefix = `users/${userSegment}/runs/${runSegment}/explanations/stage${params.stage}`;
  if (params.kind === "gradcam") {
    return `${prefix}/gradcam/${modelSlug}.png`;
  }
  const ts = Math.floor((params.createdAtMs ?? Date.now()) / 1000);
  const samples = Math.max(0, Math.floor(params.numSamples ?? 0));
  return `${prefix}/lime/${modelSlug}-${ts}-${samples}.png`;
}

export async function uploadExplanationArtifact(params: {
  objectKey: string;
  body: Buffer;
  contentType?: string;
}): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType ?? "image/png",
      ContentLength: params.body.byteLength,
    }),
  );
}

export async function streamWebBodyToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function uploadPredictionImage(params: {
  objectKey: string;
  file: File;
}): Promise<void> {
  const client = getR2Client();
  const body = new Uint8Array(await params.file.arrayBuffer());
  const contentType = params.file.type || "application/octet-stream";
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: params.objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

export async function uploadPredictionImageBuffer(params: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.body.byteLength,
    }),
  );
}

export async function copyPredictionImage(params: {
  sourceKey: string;
  destKey: string;
}): Promise<void> {
  const client = getR2Client();
  const bucket = R2_BUCKET as string;
  const encodedSource = `${bucket}/${params.sourceKey
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodedSource,
      Key: params.destKey,
    }),
  );
}

export async function deletePredictionImage(objectKey: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
    }),
  );
}

function toWebStream(value: unknown): ReadableStream<Uint8Array> {
  if (!value) {
    throw new Error("R2 object body is empty.");
  }
  if (value instanceof ReadableStream) {
    return value as ReadableStream<Uint8Array>;
  }
  if (value instanceof Readable) {
    return Readable.toWeb(value) as ReadableStream<Uint8Array>;
  }
  throw new Error("Unsupported R2 object stream type.");
}

export async function getPredictionImage(
  objectKey: string,
): Promise<StoredImageObject | null> {
  const client = getR2Client();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
      }),
    );
    return {
      body: toWebStream(result.Body),
      contentType: result.ContentType || "application/octet-stream",
      contentLength:
        typeof result.ContentLength === "number"
          ? result.ContentLength
          : undefined,
      etag: typeof result.ETag === "string" ? result.ETag : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NoSuchKey") || message.includes("NotFound")) {
      return null;
    }
    throw error;
  }
}
