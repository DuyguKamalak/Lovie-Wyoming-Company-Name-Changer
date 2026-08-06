import type { Metadata } from "next";
import { Cambo, Inter_Tight } from "next/font/google";
import { IntakeProvider } from "./state/IntakeContext";
import "./globals.css";

// Matches the reference screenshots: serif headings (Cambo, falling back
// to ui-serif/Georgia), sans-serif body (Inter Tight — the actual
// reference used "Aspekta", a commercial font unavailable here, but
// Inter Tight is explicitly next in that same font-family stack).
const cambo = Cambo({
  variable: "--font-serif",
  weight: "400",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wyoming Company Name Changer",
  description:
    "Prepare a pre-filled Wyoming Secretary of State name-change amendment form via a short chat — not legal advice, not e-filed on your behalf.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cambo.variable} ${interTight.variable}`}>
      <body>
        <IntakeProvider>{children}</IntakeProvider>
      </body>
    </html>
  );
}
