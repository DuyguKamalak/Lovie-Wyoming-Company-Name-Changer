import type { ButtonHTMLAttributes } from "react";

// Shared everywhere a button appears (splash, modal, chat, review) per
// explicit feedback: fixed brand-green background, black text/icon,
// no hover color change — only the disabled state should look different.
export function BrandButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-green px-7 text-base font-medium text-brand-black transition-opacity disabled:cursor-default disabled:opacity-50 ${className}`}
    />
  );
}
