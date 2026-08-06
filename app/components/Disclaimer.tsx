// spec.md FR-007 / US-4: this exact message must appear on the landing
// page and again, unmissable, on the review screen right above the
// download button. One component, two call sites — never restate it.
export function Disclaimer() {
  return (
    <p className="max-w-xl rounded-lg border border-[#e7e5e4] bg-[#f5f5f4] px-4 py-3.5 text-sm leading-relaxed text-[#57534e]">
      <strong className="text-brand-black">Not legal advice.</strong> This tool prepares a
      pre-filled copy of the official Wyoming Secretary of State amendment form — it does not
      file anything with the state for you. Wyoming only accepts this filing by mail or in
      person, with a $60 fee. You are responsible for reviewing, signing, and mailing it
      yourself.
    </p>
  );
}
