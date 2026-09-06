import { Router, type IRouter } from "express";
import { CreatePublicInquiryBody, CreatePublicInquiryResponse } from "@workspace/api-zod";
import { db, inquiriesTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/public/inquiries", async (request, response): Promise<void> => {
  const parsed = CreatePublicInquiryBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Please complete all inquiry fields." });
    return;
  }

  const [inquiry] = await db.insert(inquiriesTable).values({
    name: parsed.data.name.trim(),
    contact: parsed.data.contact.trim(),
    topic: parsed.data.topic,
    message: parsed.data.message.trim(),
    marketingConsent: parsed.data.marketingConsent,
  }).returning();

  response.status(201).json(CreatePublicInquiryResponse.parse(inquiry));
});

export default router;