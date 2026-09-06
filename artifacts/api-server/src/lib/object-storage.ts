import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parseObjectPath(value: string) {
  const normalized = value.startsWith("/") ? value : `/${value}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectUrl(bucketName: string, objectName: string) {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign upload URL (${response.status})`);
  const body = await response.json() as { signed_url?: string };
  if (!body.signed_url) throw new Error("Storage did not return an upload URL");
  return body.signed_url;
}

export class ObjectStorageService {
  private privateDir() {
    const value = process.env.PRIVATE_OBJECT_DIR;
    if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return value.replace(/\/$/, "");
  }

  async requestUploadUrl() {
    const objectName = `uploads/${randomUUID()}`;
    const { bucketName } = parseObjectPath(`${this.privateDir()}/${objectName}`);
    return {
      uploadURL: await signObjectUrl(bucketName, `${this.privateDir()}/${objectName}`.split("/").slice(2).join("/")),
      objectPath: `/objects/${objectName}`,
    };
  }

  async getFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new Error("Invalid object path");
    const fullPath = `${this.privateDir()}/${objectPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new Error("Object not found");
    return file;
  }

  async download(file: File) {
    const [metadata] = await file.getMetadata();
    return {
      headers: {
        "Content-Type": metadata.contentType || "application/octet-stream",
        ...(metadata.size ? { "Content-Length": String(metadata.size) } : {}),
        "Cache-Control": "private, max-age=300",
      },
      stream: file.createReadStream(),
    };
  }
}