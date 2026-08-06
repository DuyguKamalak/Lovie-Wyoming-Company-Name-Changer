import Image from "next/image";

// Source: https://www.lovie.co/lovie-logo.png (vendored into public/ — see
// public/lovie-logo.png plus pre-sized 128/256 variants — rather than
// hotlinking an external domain at request time).
//
// priority defaults to false: this component renders repeatedly per chat
// message (as the assistant avatar), and Next.js's own guidance is that
// `priority` should mark only the actual above-the-fold LCP image, not
// every instance of a component that happens to reuse it. Callers that
// render this once, above the fold (the splash screen, the chat page's
// hero empty state) pass `priority` explicitly.
export function LovieLogo({
  size = 48,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const src = size <= 128 ? "/lovie-logo-128.png" : size <= 256 ? "/lovie-logo-256.png" : "/lovie-logo.png";
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt="Lovie"
      className={className}
      priority={priority}
    />
  );
}
