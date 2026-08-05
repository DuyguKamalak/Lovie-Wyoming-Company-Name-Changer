import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/pdf/loadTemplate.ts reads assets/forms/*.pdf at request time via a
  // dynamic path.join, one indirection deeper than Next's build-time file
  // tracer reliably follows — spell it out explicitly so the vendored PDFs
  // ship with the deployed /api/generate-pdf function (plan.md section 5).
  outputFileTracingIncludes: {
    "/api/generate-pdf": ["./assets/forms/**"],
  },
};

export default nextConfig;
