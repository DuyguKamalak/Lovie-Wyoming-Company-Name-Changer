import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { IntakeProvider } from "./state/IntakeContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wyoming Company Name Changer",
  description:
    "Prepare a pre-filled Wyoming Secretary of State name-change amendment form via a short chat — not legal advice, not e-filed on your behalf.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <IntakeProvider>{children}</IntakeProvider>
      </body>
    </html>
  );
}
