import type { EntityType, LlcFields, CorpFields } from "@/lib/types";
import { missingFields, hasValidDesignator } from "@/lib/validation";
import { fillLlcAmendment } from "@/lib/pdf/fillLlc";
import { fillCorpAmendment } from "@/lib/pdf/fillCorp";

interface RequestBody {
  entityType: EntityType;
  fields: LlcFields | CorpFields;
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { entityType, fields } = body ?? {};
  if (entityType !== "llc" && entityType !== "corp") {
    return Response.json({ error: 'entityType must be "llc" or "corp".' }, { status: 400 });
  }
  if (!fields || typeof fields !== "object") {
    return Response.json({ error: "fields is required." }, { status: 400 });
  }

  const missing = missingFields(entityType, fields as unknown as Record<string, string>);
  if (missing.length > 0) {
    return Response.json({ error: "Missing required fields.", missing }, { status: 400 });
  }

  // FR-005 is a warn-not-block rule on the review screen — but the API
  // boundary still refuses to silently file a name with no designator at
  // all if the client somehow skipped that check.
  if (!hasValidDesignator(entityType, fields.newName)) {
    return Response.json(
      { error: "newName is missing a valid entity designator.", field: "newName" },
      { status: 400 }
    );
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes =
      entityType === "llc"
        ? await fillLlcAmendment(fields as LlcFields)
        : await fillCorpAmendment(fields as CorpFields);
  } catch (error) {
    console.error("PDF generation failed:", error);
    return Response.json({ error: "Failed to generate PDF." }, { status: 500 });
  }

  const filename =
    entityType === "llc" ? "wyoming-llc-amendment.pdf" : "wyoming-corp-amendment.pdf";

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
