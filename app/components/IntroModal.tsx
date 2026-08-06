"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BrandButton } from "./BrandButton";

// Disclaimer copy matches Disclaimer.tsx (spec.md FR-007/US-4) but isn't
// reusing that component: this modal is always a fixed white card by
// design, independent of any future theme work elsewhere in the app.
// Shown once per fresh chat session, before the hero empty state, so the
// disclaimer is seen before anyone starts describing their company.
export function IntroModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-8 text-brand-black shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-modal-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 id="intro-modal-title" className="font-serif text-2xl font-normal">
              Change your Wyoming company&apos;s name
            </h2>
            <p className="text-[#44403c] leading-relaxed">
              Chat with an assistant about your Wyoming LLC or Corporation, and
              get a pre-filled copy of the official Secretary of State
              amendment form — ready to print, sign, and mail.
            </p>
            <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-[#44403c]">
              <li>Tell the assistant about your company and its new name.</li>
              <li>Review every field before anything is generated.</li>
              <li>Download the filled-in official form.</li>
            </ol>
            <p className="rounded-[10px] border border-[#e7e5e4] bg-[#f5f5f4] p-4 text-sm leading-relaxed text-[#57534e]">
              <strong className="text-brand-black">Not legal advice.</strong> This
              tool prepares a pre-filled copy of the official Wyoming
              Secretary of State amendment form — it does not file anything
              with the state for you. Wyoming only accepts this filing by
              mail or in person, with a $60 fee. You are responsible for
              reviewing, signing, and mailing it yourself.
            </p>
            <BrandButton className="self-end" onClick={onClose} autoFocus>
              Okay
            </BrandButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
