import { route } from "@/lib/api";
import { destroySession } from "@/auth/session";

export const POST = route(async () => {
  await destroySession();
  return Response.json({ ok: true });
});
