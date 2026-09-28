import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { logActivity } from "@/lib/audit";

/** Возврат клиента из архива. Проекты и счета при этом не восстанавливаются. */
export const POST = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { clientId } = await params;

  const client = await prisma.client.findFirst({
    where: { id: clientId, workspaceId: access.workspace.id },
  });
  if (!client) throw new AppError(ErrorCodes.NOT_FOUND, "Клиент не найден");
  if (!client.archivedAt) throw new AppError(ErrorCodes.CONFLICT, "Клиент и так не в архиве");

  const restored = await prisma.client.update({
    where: { id: clientId },
    data: { archivedAt: null },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: clientId,
    type: "client.restored",
    meta: { title: client.name },
  });

  revalidatePath("/app/clients");
  return ok(restored);
});
