import styles from "./Disclaimer.module.css";

// spec.md FR-007 / US-4: this exact message must appear on the landing
// page and again, unmissable, on the review screen right above the
// download button. One component, two call sites — never restate it.
export function Disclaimer() {
  return (
    <p className={styles.disclaimer}>
      <strong>Not legal advice.</strong> This tool prepares a pre-filled copy
      of the official Wyoming Secretary of State amendment form — it does not
      file anything with the state for you. Wyoming only accepts this
      filing by mail or in person, with a $60 fee. You are responsible
      for reviewing, signing, and mailing it yourself.
    </p>
  );
}
