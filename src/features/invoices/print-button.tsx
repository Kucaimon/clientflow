"use client";

import { Printer } from "lucide-react";

/**
 * Печать / «Сохранить как PDF» средствами браузера.
 *
 * Отдельный PDF-сервер демо не нужен: стили @media print в globals.css
 * убирают навигацию и формы, и в диалоге печати остаётся чистый счёт.
 */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary h-9" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Печать / PDF
    </button>
  );
}
