export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-on-canvas">
      <span
        aria-hidden
        // Монохромный белый знак: цветных заливок в системе нет.
        className="grid size-6 place-items-center rounded-md border border-line-canvas text-[13px] font-bold"
      >
        C
      </span>
      {!compact && <span className="text-[15px]">ClientFlow</span>}
    </span>
  );
}
