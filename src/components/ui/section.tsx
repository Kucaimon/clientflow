import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Блок настроек и карточек: заголовок, пояснение и содержимое в одной рамке.
 *
 * Пояснение держим рядом с заголовком, а не под полями: человек решает,
 * нужна ли ему секция, до того как начал её заполнять.
 */
export function Section({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-ink-subtle">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}
