"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const Provider = TooltipPrimitive.Provider;
const Root = TooltipPrimitive.Root;
const Trigger = TooltipPrimitive.Trigger;
const Portal = TooltipPrimitive.Portal;

function Tooltip({ children, delay = 250 }: { children: React.ReactNode; delay?: number }) {
  return (
    <Root delayDuration={delay}>
      <Provider delayDuration={delay}>{children}</Provider>
    </Root>
  );
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs rounded-md border border-line bg-surface px-2 py-1 text-xs leading-snug text-ink",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </Portal>
));
TooltipContent.displayName = "TooltipContent";

export { Tooltip, Root as TooltipRoot, Trigger as TooltipTrigger, TooltipContent };
