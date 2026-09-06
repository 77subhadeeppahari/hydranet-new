import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListPublicTeamResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/object-storage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.get("/public/team", async (_request, response): Promise<void> => {
  const members = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      department: usersTable.department,
      profilePhotoPath: usersTable.profilePhotoPath,
    })
    .from(usersTable)
    .where(and(eq(usersTable.status, "ACTIVE"), eq(usersTable.isPublic, true)))
    .orderBy(asc(usersTable.name));

  response.json(ListPublicTeamResponse.parse(members.map((member) => ({
    id: member.id,
    name: member.name,
    department: member.department,
    photoUrl: member.profilePhotoPath ? `/api/public/team/${member.id}/photo` : null,
  }))));
});

router.get("/public/team/:id/photo", async (request, response): Promise<void> => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: "Invalid team member" });
    return;
  }

  const [member] = await db
    .select({ profilePhotoPath: usersTable.profilePhotoPath })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.status, "ACTIVE"), eq(usersTable.isPublic, true)));

  if (!member?.profilePhotoPath) {
    response.status(404).json({ error: "Team member photo not found" });
    return;
  }

  try {
    const result = await storage.download(await storage.getFile(member.profilePhotoPath));
    Object.entries(result.headers).forEach(([key, value]) => response.setHeader(key, value));
    response.setHeader("Content-Disposition", "inline");
    result.stream.pipe(response);
  } catch (error) {
    request.log?.warn(error, "Public team member photo not found");
    response.status(404).json({ error: "Team member photo not found" });
  }
});

export default router;
