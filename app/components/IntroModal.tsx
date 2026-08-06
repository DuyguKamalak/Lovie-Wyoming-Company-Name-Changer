"use client";

import { AnimatePresence, motion } from "framer-motion";
import styles from "./IntroModal.module.css";

// Disclaimer copy matches app/components/Disclaimer.tsx (spec.md
// FR-007/US-4) but isn't reusing that component: this modal is always a
// fixed white card by design, while Disclaimer.tsx follows the app's
// light/dark CSS variables — mixing the two would fight the theme system.
// Shown once per fresh chat session, before the hero empty state, so the
// disclaimer is seen before anyone starts describing their company.
export function IntroModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-modal-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 id="intro-modal-title" className={styles.title}>
              Change your Wyoming company&apos;s name
            </h2>
            <p className={styles.body}>
              Chat with an assistant about your Wyoming LLC or Corporation, and
              get a pre-filled copy of the official Secretary of State
              amendment form — ready to print, sign, and mail.
            </p>
            <ol className={styles.steps}>
              <li>Tell the assistant about your company and its new name.</li>
              <li>Review every field before anything is generated.</li>
              <li>Download the filled-in official form.</li>
            </ol>
            <p className={styles.disclaimer}>
              <strong>Not legal advice.</strong> This tool prepares a
              pre-filled copy of the official Wyoming Secretary of State
              amendment form — it does not file anything with the state for
              you. Wyoming only accepts this filing by mail or in person,
              with a $60 fee. You are responsible for reviewing, signing, and
              mailing it yourself.
            </p>
            <button type="button" className={styles.okButton} onClick={onClose} autoFocus>
              Okay
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
