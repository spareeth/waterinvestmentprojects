import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { appConfig } from "@/lib/config";
import { formatBytes, MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";
import {
  MAX_SUBMISSION_BYTES,
  MAX_TEASERS_PER_SUBMISSION,
} from "@/lib/submission/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { BLOCK_ROOMS, MEETING_SIGNUP } from "@/lib/meetings/schedule";

// The user guide (public page /guide), linked from every header. Plain language, one section per role. Name,
// support mailbox and upload limits come from config and the code, so the guide stays true when they change.
// Screenshots (public/user-guide/) show the real screens with fictional demo data; retake them after screen
// changes with `npm run guide:screenshots`.

/** Every screenshot file the guide shows (all 1280 by 860 pixels). */
export const GUIDE_SCREENSHOTS = [
  "sign-in",
  "upload-link",
  "inbox",
  "investor-acknowledgement",
  "pipeline",
  "project",
  "meeting-signup",
  "my-requests",
  "admin-submissions",
  "admin-blocks",
  "admin-meetings",
] as const;

type ScreenshotName = (typeof GUIDE_SCREENSHOTS)[number];

export const GUIDE_SECTIONS = [
  { id: "signing-in", title: "Signing in" },
  { id: "governments", title: "Governments: uploading teasers" },
  { id: "focal-points", title: "Country focal points: meeting sign-ups" },
  { id: "investors", title: "Investors and operators" },
  { id: "coordinators", title: "Coordinators" },
  { id: "summit-team", title: "Summit team" },
  { id: "help", title: "Help" },
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-6 rounded-xl border bg-card p-6 sm:p-8"
    >
      <h2
        id={`${id}-heading`}
        className="text-xl font-semibold tracking-tight text-brand-navy"
      >
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-foreground/90 [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6">
        {children}
      </div>
    </section>
  );
}

function SupportContact() {
  return appConfig.supportEmail ? (
    <a href={`mailto:${appConfig.supportEmail}`} className="link">
      {appConfig.supportEmail}
    </a>
  ) : (
    <>the Summit team</>
  );
}

function Screenshot({ name, alt }: { name: ScreenshotName; alt: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <a
        href={`/user-guide/${name}.png`}
        target="_blank"
        rel="noopener"
        className="block overflow-hidden rounded-lg border shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Image
          src={`/user-guide/${name}.png`}
          alt={alt}
          width={1280}
          height={860}
          sizes="(min-width: 768px) 690px, 100vw"
          unoptimized
          className="h-auto w-full"
        />
      </a>
      <figcaption className="text-sm text-muted-foreground">
        {alt}. Example with fictional data; select the image to enlarge it.
      </figcaption>
    </figure>
  );
}

export function UserGuide() {
  const maxFile = formatBytes(MAX_TEASER_BYTES);
  const maxTotal = formatBytes(MAX_SUBMISSION_BYTES);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {appConfig.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">
          User guide
        </h1>
        <p className="text-muted-foreground">
          The {appConfig.name} portal lets participating governments share
          one-page project teasers with invited investors and operators ahead of
          the {appConfig.summit.name} ({appConfig.summit.date},{" "}
          {appConfig.summit.city}). Investors sign up to meet the country
          delegations, and the Summit team allocates the bilateral meetings.
          Access is by invitation only.
        </p>
      </header>

      <nav
        aria-label="Guide contents"
        className="rounded-xl border bg-card p-6"
      >
        <p className="font-medium">Go straight to your part:</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {GUIDE_SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="link">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="signing-in" title="Signing in">
        <p>
          Governments and the Summit team receive their accounts from the Summit
          team. Investors and operators{" "}
          <Link
            href="/register"
            className="text-brand-deep underline underline-offset-4"
          >
            register
          </Link>{" "}
          with their name, work email, organisation, organisation type, job
          title and a password of their choice. If your organisation is on the
          Summit&apos;s pre-approved list, access is usually immediate;
          otherwise the Summit team checks your registration first, and the
          projects become visible once it is approved. The Summit team can also
          create an investor account directly.
        </p>
        <ol>
          <li>
            Go to{" "}
            <Link
              href="/sign-in"
              className="text-brand-deep underline underline-offset-4"
            >
              Sign in
            </Link>
            , choose how you take part (government or country, investor or
            operator, Summit team) and enter your email address and password.
          </li>
          <li>
            If the Summit team gave you a temporary password, investors,
            operators and the Summit team then choose their own (at least{" "}
            {MIN_PASSWORD_LENGTH} characters), and the temporary one stops
            working. Country and WBG coordinator accounts keep the password they
            were given, because WBG colleagues may help a government manage its
            account.
          </li>
          <li>
            Investors and operators then read and accept the terms of use (how
            the shared information may be used). You are asked again only if
            they change.
          </li>
        </ol>
        <Screenshot name="sign-in" alt="The sign-in page" />
        <ul>
          <li>
            You are signed out automatically after a period of inactivity. Sign
            in again to continue.
          </li>
          <li>
            After five wrong passwords in a row, sign-in is paused for 15
            minutes.
          </li>
          <li>
            Forgotten your password? Contact <SupportContact />. The Summit team
            gives you a new temporary password.
          </li>
          <li>
            Please do not pass your password on to anyone outside the people the
            Summit team gave it to. Several people of one country can each have
            their own account: ask <SupportContact />.
          </li>
        </ul>
      </Section>

      <Section id="governments" title="Governments: uploading teasers">
        <p>Your country receives its own upload link from the Summit team.</p>
        <ol>
          <li>Open the upload link. Your country is already filled in.</li>
          <li>
            Enter your full name, email, job title and the government
            organisation you represent (for example the ministry, utility or
            agency). All four are required.
          </li>
          <li>
            Add your project teasers: up to {MAX_TEASERS_PER_SUBMISSION} at a
            time. For each one, select the file, up to {maxFile} each and{" "}
            {maxTotal} in total. PDF is preferred; PowerPoint, Word, Excel and
            images (JPG, PNG) are also accepted. The Summit team converts other
            formats to PDF before a teaser is shared.
          </li>
          <li>
            The sector is read from the teaser&apos;s subtitle (the part before
            the dot, as in the WBG template). You can choose it yourself
            instead; if it cannot be read, for example from an image or a scan,
            the form asks you to choose it. Other key facts, such as size and
            development stage, are also read from the teaser and checked by the
            Summit team.
          </li>
          <li>
            Read the consent statement and tick the box. It confirms, on behalf
            of your government, that the teasers may be shared with the
            participants invited to the {appConfig.summit.name}.
          </li>
          <li>
            Select <strong>Send teasers</strong>. A confirmation page shows a
            reference; please print or save it. You also receive a confirmation
            by email.
          </li>
        </ol>
        <Screenshot
          name="upload-link"
          alt="The upload form opened from a country's upload link"
        />
        <p>
          Every file is checked for viruses. The Summit team then reviews the
          teasers and publishes them in the pipeline. To replace or withdraw a
          teaser, or if the link no longer works, contact <SupportContact />.
        </p>
        <p>
          The person who uploads becomes your country&apos;s contact for
          meetings, unless the Summit team names another focal point.
        </p>
        <p>
          With a country account you can also add teasers yourself, without the
          link: sign in, open <strong>My projects</strong> and select{" "}
          <strong>Add project</strong>. The form and its checks are the same.
        </p>
      </Section>

      <Section id="focal-points" title="Country focal points: meeting sign-ups">
        <p>
          As a country user (focal point, colleague or WBG relationship manager
          acting for the country) you sign in with the account the Summit team
          gave you (see Signing in).
        </p>
        <ul>
          <li>
            <strong>Pipeline projects</strong> shows the published teasers of
            every participating country, read-only, as investors see them.
          </li>
          <li>
            <strong>My projects</strong> lists your country&apos;s projects, and
            whether each one is published. <strong>Add project</strong> uploads
            new teasers for your country. The Summit team reviews and publishes
            them. If you uploaded a project, you can correct its{" "}
            <strong>Key facts</strong> (title, sector, region, PPP model, size,
            stage) on its page until it is published; use{" "}
            <strong>Fill from teaser</strong> to read them from the file again.
            After that, or for projects others uploaded, contact the Summit
            team. Until it is published (or after it was taken out of the
            pipeline), the person who uploaded a project can also delete it with{" "}
            <strong>Delete project</strong> on its page; ask the Summit team to
            delete a published one.
          </li>
          <li>
            <strong>Meeting sign-ups</strong> lists the investors and operators
            who would like to meet your delegation: who will attend, their
            organisation and role, the projects they are interested in, their
            note and every time they could make within your country&apos;s
            meeting blocks. The list is for information: you do not need to
            accept or decline anything. Your country&apos;s focal points also
            receive an email for each new, changed or withdrawn sign-up (WBG
            colleagues in copy).
          </li>
          <li>
            Sign-ups close on {MEETING_SIGNUP.deadlineLabel}. The Summit team
            then allocates the meetings and tells you and the investors by{" "}
            {MEETING_SIGNUP.confirmationLabel}.
          </li>
          <li>
            <strong>Download sign-ups (CSV)</strong> gives you the list as a
            spreadsheet, for example to share with colleagues preparing the
            meetings. Requests made before 25 November, under the earlier
            system, are listed below the sign-ups.
          </li>
        </ul>
        <Screenshot
          name="inbox"
          alt="A country's meeting sign-ups, with the times each investor could make"
        />
        <p>
          Please check the list regularly between the opening of the portal and
          the {appConfig.summit.name}.
        </p>
      </Section>

      <Section id="investors" title="Investors and operators">
        <ol>
          <li>Sign in and accept the terms of use (first time only).</li>
          <li>
            Open <strong>Pipeline</strong> to see every published project
            teaser. Search by title or country, and filter by country, sector,
            PPP model, indicative size and development stage.
          </li>
          <li>
            Open a project to read its teaser in the page, or download it. On a
            phone, open the teaser in a new tab.
          </li>
          <li>
            The project page lists the government counterparts attending the{" "}
            {appConfig.summit.name} for the country. To meet them, use{" "}
            <strong>Meet the delegation</strong> on any of the country&apos;s
            projects. You sign up once per country, not per project.
          </li>
          <li>
            Tick every time you could make: the times are the country&apos;s
            meeting blocks, {MEETING_SIGNUP.meetingMinutes}-minute bilateral
            meetings, UAE time. Each time is a potential option; ticking it does
            not book it, and other investors may tick the same times. Tick the
            projects you are interested in, and give the name and email address
            of the person who will attend, your organisation and role, and, if
            you wish, a short note.
          </li>
          <li>
            Sign-ups close on {MEETING_SIGNUP.deadlineLabel}. Until then you can
            change your times or withdraw. The Summit team then matches
            investors and delegations, and you receive a meeting confirmation by
            email by {MEETING_SIGNUP.confirmationLabel}. Signing up does not
            guarantee a meeting.
          </li>
          <li>
            <strong>My sign-ups</strong> shows each country you signed up for,
            with your times and projects.
          </li>
        </ol>
        <Screenshot
          name="investor-acknowledgement"
          alt="The terms of use shown at first sign-in"
        />
        <Screenshot
          name="pipeline"
          alt="The project pipeline with search and filters"
        />
        <Screenshot
          name="project"
          alt="A project page: the teaser, key facts and the government counterparts"
        />
        <Screenshot
          name="meeting-signup"
          alt="Meet the delegation: the times you could make and the projects of interest"
        />
        <Screenshot
          name="my-requests"
          alt="My sign-ups, with your times for each country"
        />
        <p>
          Please use the teasers only for the purposes set out in the terms of
          use.
        </p>
      </Section>

      <Section id="coordinators" title="Coordinators">
        <p>
          Coordinators see the meeting sign-ups for the countries they follow
          under <strong>Meeting sign-ups</strong>, and can select{" "}
          <strong>Download sign-ups (CSV)</strong> for a spreadsheet of them.
        </p>
      </Section>

      <Section id="summit-team" title="Summit team">
        <p>Summit and platform admins have an Admin area. In short:</p>
        <ul>
          <li>
            <strong>Upload links</strong>: create one link per country, with an
            expiry date, or links for every country at once with a CSV download.
            The full link is shown only once; send it to the country. Links can
            be revoked and replaced.
          </li>
          <li>
            <strong>Submissions</strong>: see every upload, its sender and its
            virus check, and open clean files.
          </li>
          <li>
            <strong>Projects</strong>: correct titles and sectors, add region,
            PPP model, size and development stage (one by one or by CSV import),
            then publish. Key facts are read from each teaser when it arrives;
            check them, and use <strong>Fill from teaser</strong> on the project
            page to read them again. A project marked <strong>Needs PDF</strong>{" "}
            was sent in another format: convert it, upload the PDF as a new
            version on the project page, then publish. Investors only ever see
            PDFs. <strong>Delete project</strong> at the bottom of a project
            page removes it for good, with its teaser files and meeting
            requests. The person who uploaded a project can delete it too, until
            it is published.
          </li>
          <li>
            <strong>Accounts</strong>: create accounts one by one or from a CSV
            list (several people per country are fine), hand over passwords
            personally, issue new ones, and deactivate accounts. Country and WBG
            coordinator accounts keep the password they are given; switch them
            off after the Summit. <strong>Remove user</strong> erases and
            disables an account: the person can no longer sign in, their name
            and email are erased (the email can be used for a new account) and
            their meeting sign-ups are withdrawn.
          </li>
          <li>
            <strong>Registrations</strong>: investor and operator registrations
            wait at the top of Accounts. Approve or reject each one; the Summit
            mailbox is told of every new registration. Under{" "}
            <strong>Pre-approved organisations and people</strong>, keep the
            list from WBG: registrants at a listed email domain, or with a
            listed address, are marked as pre-approved and, when automatic
            approval is switched on, get access straight away. Check new
            accounts regularly and deactivate any that should not be there.
          </li>
          <li>
            <strong>Meeting calendar</strong> has three views.{" "}
            <strong>Sign-ups</strong> lists every investor&apos;s sign-up for
            every country, with their times and projects, and{" "}
            <strong>Download sign-ups (CSV)</strong> for allocating the
            meetings. The Summit mailbox receives an email for every new,
            changed or withdrawn sign-up.{" "}
            <strong>Time blocks and counterparts</strong> sets each
            country&apos;s meeting blocks ({BLOCK_ROOMS.join(", ")}): under{" "}
            <strong>Load time blocks</strong>, paste one line per block (country
            ISO3 code, date, start, end, room number) and select{" "}
            <strong>Save these blocks</strong>; the countries named are
            replaced, the others kept. On the same page, enter each
            country&apos;s government counterparts, one per line; investors see
            them on the country&apos;s project pages.{" "}
            <strong>Room calendar</strong> shows the meeting requests made
            before 25 November.
          </li>
          <li>
            <strong>Countries and contacts</strong>, <strong>Exports</strong>:
            focal points and coordinators per country, and CSV exports of
            projects, submissions, contacts and meeting requests.
          </li>
        </ul>
        <Screenshot
          name="admin-submissions"
          alt="Teaser submissions in the Admin area, with the virus check of each file"
        />
        <Screenshot
          name="admin-blocks"
          alt="Time blocks and counterparts: each country's meeting blocks, sign-ups and delegation"
        />
        <Screenshot
          name="admin-meetings"
          alt="The meeting calendar: every country's sign-ups, with the CSV download"
        />
      </Section>

      <Section id="help" title="Help">
        <p>
          For access, passwords or anything that does not work as described
          here, contact <SupportContact />.
        </p>
        <p className="text-sm text-muted-foreground">{appConfig.copyright}</p>
      </Section>
    </div>
  );
}
