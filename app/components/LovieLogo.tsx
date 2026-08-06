import Image from "next/image";

// Source: https://www.lovie.co/lovie-logo.png (vendored into public/ — see
// public/lovie-logo.png plus pre-sized 128/256 variants — rather than
// hotlinking an external domain at request time).
export function LovieLogo({ size = 48, className }: { size?: number; className?: string }) {
  const src = size <= 128 ? "/lovie-logo-128.png" : size <= 256 ? "/lovie-logo-256.png" : "/lovie-logo.png";
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt="Lovie"
      className={className}
      priority
    />
  );
}
