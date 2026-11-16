import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";

// Public landing page (F1), following docs/mockups/01_landing.png.
// No project names or country details appear here: the pipeline is visible only after sign-in.

const principles = [
  {
    eyebrow: "01 · Country control",
    title: "Countries own their information",
    body: "Country focal points upload their own project teasers, confirm they can be shared, and decide which meeting requests to accept.",
  },
  {
    eyebrow: "02 · Invitation only",
    title: "Personal, verified access",
    body: "Investors and operators are invited by the Summit team. Every account is personal, protected by two-step sign-in, and logged.",
  },
  {
    eyebrow: "03 · From teaser to meeting",
    title: "Request a bilateral",
    body: "Review the pipeline, express interest in specific projects and request a meeting. Countries review and confirm.",
  },
] as const;

const partnerSlots = ["partner-1", "partner-2", "partner-3", "partner-4"];

export default function Home() {
  return (
    <>
      <SiteHeader>
        <a
          href="#about"
          className="hidden text-white/90 hover:text-white sm:inline"
        >
          About
        </a>
        <a
          href="#how-access-works"
          className="hidden text-white/90 hover:text-white sm:inline"
        >
          How access works
        </a>
        {appConfig.supportEmail ? (
          <a
            href="#contact"
            className="hidden text-white/90 hover:text-white sm:inline"
          >
            Contact
          </a>
        ) : null}
        <Button
          asChild
          size="lg"
          className="bg-white text-brand-navy hover:bg-white/90"
        >
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </SiteHeader>

      <main className="flex flex-1 flex-col">
        <section
          id="about"
          className="relative overflow-hidden bg-linear-120 from-brand-navy via-brand-deep to-brand-teal text-white"
        >
          <WaveLines className="pointer-events-none absolute top-1/2 right-[4%] hidden h-64 w-auto -translate-y-1/2 text-white/25 lg:block" />
          <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-8 sm:py-20">
            <p className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs sm:text-sm">
              2026 UN Water Conference · Water Investment Summit · 9 December
              2026, Abu Dhabi
            </p>
            <h1 className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
              Investment-ready water projects, shared securely with the people
              who can finance them.
            </h1>
            <p className="max-w-2xl text-base text-white/85 sm:text-lg">
              Participating countries share project teasers with invited
              investors and operators ahead of the Summit, so that bilateral
              meetings start from the same information.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-11 bg-white px-5 text-brand-navy hover:bg-white/90"
              >
                <Link href="/sign-in">
                  Sign in with your invitation
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 border-white/40 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white"
              >
                <a href="#how-access-works">How access works</a>
              </Button>
            </div>
          </div>
        </section>

        <section
          id="how-access-works"
          aria-labelledby="how-access-works-heading"
          className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8"
        >
          <h2 id="how-access-works-heading" className="sr-only">
            How access works
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {principles.map((item) => (
              <li
                key={item.eyebrow}
                className="rounded-xl border bg-card p-6 sm:p-7"
              >
                <p className="text-sm font-bold text-brand-teal uppercase">
                  {item.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer
          id="contact"
          className="mx-auto mt-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span>In partnership with</span>
            {/* Logos to be confirmed with the Summit team (World Bank Group and others). */}
            {partnerSlots.map((slot) => (
              <span
                key={slot}
                className="flex h-11 w-36 items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#b7c4c4] bg-card text-xs"
              >
                Partner logo
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1 lg:items-end">
            {appConfig.supportEmail ? (
              <a
                href={`mailto:${appConfig.supportEmail}`}
                className="text-brand-deep underline-offset-4 hover:underline"
              >
                {appConfig.supportEmail}
              </a>
            ) : null}
            <span>{appConfig.developedBy}</span>
          </div>
        </footer>
      </main>
    </>
  );
}

function WaveLines({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 240"
      fill="none"
      className={className}
    >
      {rows.map((row) => {
        const y = 20 + row * 40;
        return (
          <path
            key={row}
            d={`M0 ${y + 20} C 60 ${y - 10}, 120 ${y - 10}, 180 ${y + 20} S 300 ${y + 50}, 360 ${y + 20}`}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
