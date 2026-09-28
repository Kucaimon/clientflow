import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/auth/session";

export const GET = route(async () => {
  const user = await requireUser();

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok({
    items,
    unread: items.filter((item) => !item.readAt).length,
  });
});

/** Пометить прочитанными: одну или все сразу. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };

  if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return ok({ ok: true });
});
