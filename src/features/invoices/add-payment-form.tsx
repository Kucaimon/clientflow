"use client";

import { useState } from "react";
import { CURRENCY_LABEL } from "@/lib/format";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";
import { PAYMENT_METHOD } from "@/lib/status";

/**
 * Оплата счёта.
 *
 * Сумма по умолчанию — остаток: почти всегда платят ровно столько, а
 * вводить цифры вручную каждый раз значит провоцировать опечатку в деньгах.
 */
export function AddPaymentForm({
  invoiceId,
  remaining,
  currency,
}: {
  invoiceId: string;
  remaining: number;
  currency: string;
}) {
  const [amount, setAmount] = useState(String(remaining / 100));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("TRANSFER");
  const [note, setNote] = useState("");
  const { request, pending } = useApi();
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Math.round(Number(amount) * 100);
    if (!Number.isFinite(value) || value <= 0) return;

    const result = await request(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: { amount: value, date, method, note: note || undefined },
      successTitle: "Оплата проведена",
    });
    if (result.ok) {
      setNote("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Сумма, ${CURRENCY_LABEL[currency] ?? currency}`} htmlFor="amount">
          <input
            id="amount"
            type="number"
            min={1}
            max={remaining / 100}
            step="1"
            className="input tnum"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Дата" htmlFor="payment-date">
          <input
            id="payment-date"
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Способ" htmlFor="method">
        <select
          id="method"
          className="input"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Комментарий" htmlFor="payment-note">
        <input
          id="payment-note"
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Платёжное поручение №…"
        />
      </Field>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-secondary h-9" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Wallet className="size-4" aria-hidden />
          )}
          Провести оплату
        </button>
      </div>
    </form>
  );
}
