import type { Metadata } from "next";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow, hasRole, type Role } from "@/auth/workspace";
import { findInvitations, findMembers, findWorkspace } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/features/settings/settings-tabs";
import { InviteMemberForm } from "@/features/settings/invite-member-form";
import { MemberRow } from "@/features/settings/member-row";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/status";

export const metadata: Metadata = { title: "Команда" };

export default async function TeamPage() {
  const user = await requireUser();
  const { workspace } = await activeWorkspaceOrThrow({ user });

  const canManage = hasRole(workspace.role, "ADMIN");
  const [members, invitations, ws] = await Promise.all([
    findMembers(workspace.id),
    canManage ? findInvitations(workspace.id) : Promise.resolve([]),
    findWorkspace(workspace.id),
  ]);

  return (
    <>
      <PageHeader
        title="Команда"
        description={
          ws
            ? `Занято ${members.length} мест из ${ws.seats}`
            : undefined
        }
      />
      <SettingsTabs />

      <div className="space-y-4">
        {canManage ? (
          <Section title="Пригласить" description="Ссылка действует неделю и только на один вход">
            <InviteMemberForm workspaceId={workspace.id} />
          </Section>
        ) : null}

        <Section title={`Участники (${members.length})`} bodyClassName="px-5 py-1">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              workspaceId={workspace.id}
              memberId={member.id}
              name={member.user.name}
              email={member.user.email}
              role={member.role as Role}
              isSelf={member.userId === user.id}
              canManage={canManage}
            />
          ))}
        </Section>

        {canManage && invitations.length > 0 ? (
          <Section title="Отправленные приглашения" bodyClassName="px-5 py-1">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    пригласил(а) {invitation.invitedBy.name}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {ROLE_LABEL[invitation.role] ?? invitation.role} · до{" "}
                  {formatDate(invitation.expiresAt)}
                </span>
              </div>
            ))}
          </Section>
        ) : null}

        <p className="text-xs text-ink-subtle">
          Роли: наблюдатель видит данные, сотрудник работает с задачами и временем, администратор
          управляет командой. Владелицу нельзя удалить — только передать владение.
        </p>
      </div>
    </>
  );
}
