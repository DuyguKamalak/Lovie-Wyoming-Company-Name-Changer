import { readFile } from "node:fs/promises";
import path from "node:path";

// Loaded once per warm serverless instance, from the vendored copy in
// assets/forms/ — never fetched over the network at request time (plan.md
// section 5). See next.config.ts outputFileTracingIncludes for why these
// specific paths are guaranteed to ship with the deployed function.
const cache = new Map<string, Uint8Array>();

export async function loadFormTemplate(relativePath: string): Promise<Uint8Array> {
  const cached = cache.get(relativePath);
  if (cached) return cached;
  // turbopackIgnore: this path is dynamic (two call sites, one function),
  // which makes Next's build-time tracer conservatively bundle the whole
  // project instead of just assets/forms/. We already declare the exact
  // files to include via next.config.ts's outputFileTracingIncludes, so
  // it's safe to opt this specific call out of automatic tracing.
  const bytes = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), relativePath));
  cache.set(relativePath, bytes);
  return bytes;
}
