"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type ToastInput = { title: string; description?: string; variant?: ToastVariant };

type ToastItem = ToastInput & { id: number; variant: ToastVariant };

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

/**
 * Провайдер тостов.
 * Кнопка закрытия не размонтирует узел мгновенно: Radix сам доигрывает анимацию
 * и снимает элемент на onClose, иначе DOM останется с «полупрозрачным» тостом.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      toast: ({ title, description, variant = "info" }: ToastInput) => {
        setItems((prev) => [...prev, { id: Date.now() + Math.random(), title, description, variant }]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPrimitive.Provider duration={4500} swipeDirection="right">
        {items.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <ToastPrimitive.Root
              key={item.id}
              className="card flex items-start gap-3 p-3"
              // Radix убирает узел из DOM сам, но из нашего списка элемент
              // никто не выкидывает — без этого тосты копятся весь сеанс.
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
            >
              <Icon
                className={
                  item.variant === "error"
                    ? "mt-0.5 size-4 text-danger"
                    : item.variant === "success"
                      ? "mt-0.5 size-4 text-success"
                      : "mt-0.5 size-4 text-accent"
                }
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-medium">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="mt-0.5 text-sm text-ink-muted">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                className="rounded p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
                aria-label="Закрыть уведомление"
              >
                <X className="size-4" aria-hidden />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast должен вызываться внутри ToastProvider");
  return ctx.toast;
}
