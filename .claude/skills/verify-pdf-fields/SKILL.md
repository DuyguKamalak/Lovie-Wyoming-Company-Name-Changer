---
name: verify-pdf-fields
description: Verify the vendored Wyoming SOS PDF forms' AcroForm fields still match the field tables documented in spec.md. Use before touching lib/pdf/fill*.ts, right after re-vendoring a form, or as part of the pre-launch check (tasks.md T015).
---

# Verify PDF fields

The two forms in `assets/forms/` are the actual legal documents this
product fills out. Constitution principle II ("Official-form fidelity")
means our code's field names must always match the live PDF's field names
exactly — a silent mismatch is a bug that could put wrong data in the
wrong box on a document someone mails to a state government.

## Steps

1. Extract every AcroForm field name/type from both vendored PDFs:

```bash
python3 - <<'EOF'
from pypdf import PdfReader

for label, path in [
    ("LLC", "assets/forms/llc-amendment.pdf"),
    ("CORP", "assets/forms/corp-amendment-form-p.pdf"),
]:
    print(f"\n=== {label} ({path}) ===")
    fields = PdfReader(path).get_fields() or {}
    for name, f in fields.items():
        print(f"  name={name!r} type={f.get('/FT')} states={f.get('/_States_')}")
EOF
```

(`pip3 install pypdf` first if not already installed. If `cryptography`
import errors occur, `pip3 install --force-reinstall cffi` fixes it — seen
once during this project's setup.)

2. Diff the output against the field tables in
   `.specify/specs/001-wyoming-name-change/spec.md` sections 5.1 and 5.2.

3. If anything differs — a renamed field, a new required field, a removed
   field, changed checkbox states — **stop and flag it**. Do not quietly
   edit `lib/pdf/fillLlc.ts`/`fillCorp.ts` to match the new PDF without
   first updating `spec.md`'s field tables and getting sign-off
   (constitution principle VI: spec before code). Update the spec, then
   fix the code, then re-run this check to confirm it round-trips.

4. If the vendored PDF itself was just replaced (e.g. during tasks.md
   T015's pre-launch check), also re-read the visible instruction text
   (`page.extract_text()` in the same script) to catch any wording change
   that might affect what the intake agent should ask about — not just
   the field names.
