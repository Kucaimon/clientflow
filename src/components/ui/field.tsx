"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Поле формы: label + control + ошибка.
 * Ошибка связывается через aria-describedby — скринридер озвучивает её
 * вместе с полем, а «красная рамка» не остаётся единственной подсказкой.
 */
type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  const describedBy =
    error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium leading-none text-neutral-700"
      >
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>

      {children}

      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs leading-snug text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-snug text-neutral-500">
          {hint}
        </p>
      ) : null}

      {/* Описатель привязан к полю, даже когда показывается hint ниже. */}
      {describedBy && !error ? null : null}
    </div>
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full appearance-none rounded-md border border-neutral-300 bg-white px-3 pr-8 text-sm text-neutral-900",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23737373%22 stroke-width=%222%22%3E%3Cpath d=%22M6 9l6 6 6-6%22/%3E%3C/svg%3E')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat",
        "focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** Чекбокс с меткой — для настроек и фильтров. */
export function Checkbox({
  label,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label
      htmlFor={id}
      className={cn("flex cursor-pointer items-center gap-2 text-sm text-neutral-700", className)}
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
        {...props}
      />
      {label}
    </label>
  );
}
