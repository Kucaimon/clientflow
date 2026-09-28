import type { Metadata } from "next";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { findWorkspace } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/features/settings/settings-tabs";
import { ProfileForm } from "@/features/settings/profile-form";
import { PasswordForm } from "@/features/settings/password-form";
import { WorkspaceForm } from "@/features/settings/workspace-form";
import { ExportButton } from "@/features/settings/export-button";
import { ImportButton } from "@/features/settings/import-button";
import { isCurrency } from "@/lib/format";
import { Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "Настройки" };

/**
 * Настройки: профиль, безопасность, воркспейс и данные.
 *
 * Секции идут одной страницей, а не четырьмя: переключаться между
 * «сменить пароль» и «поменять валюту» ради двух полей — только плодить
 * пустые переходы.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const { workspace } = await activeWorkspaceOrThrow({ user });
  const ws = await findWorkspace(workspace.id);

  return (
    <>
      <PageHeader title="Настройки" description="Профиль, воркспейс и данные" />
      <SettingsTabs />

      <div className="space-y-4">
        <Section title="Профиль" description="Имя видно коллегам в задачах и комментариях">
          <ProfileForm defaultValues={{ name: user.name, email: user.email }} />
        </Section>

        <Section title="Пароль" description="Требуется текущий пароль — форма бесполезна в чужом браузере">
          <PasswordForm />
        </Section>

        {ws ? (
          <Section
            title="Воркспейс"
            description={`Тариф ${ws.plan}, мест ${ws.seats}. Валюта общая для всех счетов`}
          >
            <WorkspaceForm
              workspaceId={ws.id}
              defaultValues={{
                name: ws.name,
                currency: isCurrency(ws.currency) ? ws.currency : undefined,
              }}
            />
          </Section>
        ) : null}

        <Section
          title="Данные"
          description="Клиенты, проекты, задачи, время и счета одним файлом. Пароли и токены в выгрузку не попадают"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton />
            <ImportButton />
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            Загрузка создаёт отдельный воркспейс с пометкой «импорт» и переключает на него:
            текущие данные файл не меняет. Люди из файла не восстанавливаются — все задачи
            и комментарии записываются на вас.
          </p>
        </Section>
      </div>
    </>
  );
}
