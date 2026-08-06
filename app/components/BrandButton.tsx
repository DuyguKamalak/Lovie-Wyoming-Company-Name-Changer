import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Shared everywhere a button appears (splash, modal, chat, review). Fixed
// brand-green background, black text/icon — never a different color on
// hover — but it does need to feel alive: hover brightens slightly and
// lifts with a shadow, :active scales down for a tactile "press", and
// :disabled is the one state that actually looks different in substance.
//
// Uses cn() (clsx + tailwind-merge), not plain string concatenation: a
// call site overriding e.g. the default h-12 with h-10 needs tailwind-merge
// to actually drop h-12, or both classes land in the DOM and which one
// wins is undefined — that exact bug shipped once already (oversized send
// button in the hero composer, found via direct feedback).
export function BrandButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-green px-7 text-base font-medium text-brand-black shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-md active:translate-y-0 active:scale-95 active:brightness-95 disabled:cursor-default disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm disabled:hover:brightness-100 disabled:active:scale-100",
        className
      )}
    />
  );
}
