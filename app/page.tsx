import Link from "next/link";
import { Disclaimer } from "./components/Disclaimer";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Change your Wyoming company&apos;s name</h1>
        <p className={styles.subtitle}>
          Chat with an assistant about your Wyoming LLC or Corporation, and
          get a pre-filled copy of the official Secretary of State amendment
          form — ready to print, sign, and mail.
        </p>

        <ol className={styles.steps}>
          <li>Tell the assistant about your company and its new name.</li>
          <li>Review every field before anything is generated.</li>
          <li>Download the filled-in official form.</li>
        </ol>

        <Link href="/chat" className={styles.cta}>
          Start
        </Link>

        <Disclaimer />
      </main>
    </div>
  );
}
