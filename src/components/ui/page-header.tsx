import type { ReactNode } from "react";

/** Заголовок страницы с действиями справа; на мобильном действия уходят под заголовок. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-medium tracking-tight text-on-canvas">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-sm text-on-canvas-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
