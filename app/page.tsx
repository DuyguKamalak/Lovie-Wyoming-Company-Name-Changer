"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { LovieLogo } from "./components/LovieLogo";
import { BrandButton } from "./components/BrandButton";

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white text-brand-black">
      <motion.div
        className="flex flex-col items-center gap-3 px-8 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <LovieLogo size={72} />
        </motion.div>

        <motion.span
          className="font-serif text-2xl font-normal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Lovie
        </motion.span>

        <motion.p
          className="mb-1 max-w-sm text-[1.05rem] text-[#555151]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.55 }}
        >
          Change your Wyoming company&apos;s name in minutes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <BrandButton className="rounded-full" onClick={() => router.push("/chat")}>
            Start
          </BrandButton>
        </motion.div>
      </motion.div>
    </div>
  );
}
