import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Without this, a component's own base classes and a caller's override
// classes (e.g. BrandButton's `h-12` vs. a call site's `h-10`) sit side by
// side in the same class attribute with no defined winner — Tailwind
// doesn't dedupe conflicting utilities on its own. twMerge resolves that
// correctly (last one wins per property), which clsx alone doesn't do.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
