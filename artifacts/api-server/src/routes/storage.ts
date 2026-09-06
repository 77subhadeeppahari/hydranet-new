import { Router, type IRouter } from "express";
import { RequestStorageUploadUrlBody, RequestStorageUploadUrlResponse } from "@workspace/api-zod";
import { requireAdmin, requireRole } from "../lib/admin-auth";
import { ObjectStorageService } from "../lib/object-storage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.use(requireAdmin);

router.post(
  "/storage/uploads/request-url",
  requireRole("ADMIN", "SUPERADMIN"),
  async (request, response) => {
    const parsed = RequestStorageUploadUrlBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid document metadata" });
      return;
    }
    try {
      response.json(RequestStorageUploadUrlResponse.parse(await storage.requestUploadUrl()));
    } catch (error) {
      request.log?.error(error, "Failed to create document upload URL");
      response.status(500).json({ error: "Could not prepare document upload" });
    }
  },
);

router.get("/storage/objects/*path", async (request, response) => {
  const rawPath = request.params.path;
  const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
  try {
    const result = await storage.download(await storage.getFile(objectPath));
    Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value));
    response.setHeader("Content-Disposition", "inline");
    result.stream.pipe(response);
  } catch (error) {
    request.log?.warn(error, "Protected document not found");
    response.status(404).json({ error: "Document not found" });
  }
});

export default router;