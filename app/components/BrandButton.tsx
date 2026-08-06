import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Shared everywhere a button appears (splash, modal, chat, review) per
// explicit feedback: fixed brand-green background, black text/icon, no
// hover color change — only :active (a tactile "press" scale-down, since
// clicks felt unresponsive without it) and :disabled look different.
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
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-green px-7 text-base font-medium text-brand-black transition-transform duration-100 active:scale-95 disabled:cursor-default disabled:opacity-50 disabled:active:scale-100",
        className
      )}
    />
  );
}
