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
import {
  describeMeetingRooms,
  MEETING_SCHEDULE,
} from "@/lib/meetings/schedule";

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
  "my-requests",
  "admin-submissions",
  "admin-meetings",
] as const;

type ScreenshotName = (typeof GUIDE_SCREENSHOTS)[number];

export const GUIDE_SECTIONS = [
  { id: "signing-in", title: "Signing in" },
  { id: "governments", title: "Governments: uploading teasers" },
  { id: "focal-points", title: "Country focal points: meeting requests" },
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
          {appConfig.summit.city}). Investors request bilateral meetings, and
          each country decides which meetings to accept. Access is by invitation
          only.
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
            Investors and operators then read and accept a short acknowledgement
            about how the shared information may be used. You are asked again
            only if its wording changes.
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
          The person who uploads becomes your country&apos;s contact for meeting
          requests, unless the Summit team names another focal point.
        </p>
        <p>
          With a country account you can also add teasers yourself, without the
          link: sign in, open <strong>My projects</strong> and select{" "}
          <strong>Add project</strong>. The form and its checks are the same.
        </p>
      </Section>

      <Section id="focal-points" title="Country focal points: meeting requests">
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
            <strong>My projects</strong> lists your country&apos;s projects,
            whether each one is published, and how many meeting requests it has
            received by type of organisation (declined requests included).{" "}
            <strong>Add project</strong> uploads new teasers for your country.
            The Summit team reviews and publishes them; contact them if an
            existing project needs correcting. A project that is not yet
            published (or was taken out of the pipeline) can be deleted with{" "}
            <strong>Delete project</strong> on its page; ask the Summit team to
            delete a published one.
          </li>
          <li>
            <strong>Meeting requests</strong> lists the requests from investors
            and operators for your country&apos;s projects: who will attend,
            their organisation and role, their note and the meeting time they
            chose. Use the filter to see new, accepted or declined requests.
          </li>
          <li>
            Select <strong>Accept</strong> or <strong>Decline</strong> for each
            request. Your decision is final and the investor sees it in their
            list. Accepting books the chosen time and room, and the investor,
            your country&apos;s contacts and the Summit team receive a
            confirmation by email; declining frees the time. The Summit team may
            occasionally cancel a meeting (for example if a room is needed);
            everyone concerned is told by email.
          </li>
          <li>
            <strong>Download CSV</strong> gives you the list as a spreadsheet,
            for example to share with colleagues preparing the meetings.
          </li>
        </ul>
        <Screenshot
          name="inbox"
          alt="A country's meeting requests, with Accept and Decline"
        />
        <p>
          Please check the list regularly between the opening of the portal and
          the {appConfig.summit.name}.
        </p>
      </Section>

      <Section id="investors" title="Investors and operators">
        <ol>
          <li>Sign in and accept the acknowledgement (first time only).</li>
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
            To meet the country, use <strong>Request a meeting</strong> on the
            project page: the name and email address of the person who will
            attend, your organisation and role, and, if you wish, a short note.
            Choose a <strong>Meeting time</strong>: 30-minute bilateral meetings
            in {describeMeetingRooms()}, UAE time. Pick the room on its tab,
            then a free time. Times you or the country already have are not
            offered. The time is held for you until the country answers. You can
            have one open request per project.
          </li>
          <li>
            <strong>My requests</strong> shows each request and its status:
            Awaiting reply, Accepted, Declined, Withdrawn or Cancelled by the
            Summit team. You can withdraw a request that is awaiting a reply or
            already accepted, for example if you can no longer attend; you
            receive an email when a meeting is confirmed, withdrawn or
            cancelled.
          </li>
        </ol>
        <Screenshot
          name="investor-acknowledgement"
          alt="The acknowledgement shown at first sign-in"
        />
        <Screenshot
          name="pipeline"
          alt="The project pipeline with search and filters"
        />
        <Screenshot
          name="project"
          alt="A project page: the teaser, key facts and the meeting request form"
        />
        <Screenshot
          name="my-requests"
          alt="My requests, with the status of each request"
        />
        <p>
          When a country accepts, your meeting time and room are booked; you see
          them under <strong>My requests</strong>. If every time was taken, the
          Summit team contacts you about a time. Please use the teasers only for
          the purposes set out in the acknowledgement.
        </p>
      </Section>

      <Section id="coordinators" title="Coordinators">
        <p>
          Coordinators see the meeting requests for the countries they follow
          under <strong>Meeting requests</strong>, and can select{" "}
          <strong>Download CSV</strong> for a spreadsheet of them. Decisions on
          requests are made by the country focal points.
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
            requests; open requests are cancelled and everyone is told. Country
            users can delete their own projects that are not published.
          </li>
          <li>
            <strong>Accounts</strong>: create accounts one by one or from a CSV
            list (several people per country are fine), hand over passwords
            personally, issue new ones, and deactivate accounts. Country and WBG
            coordinator accounts keep the password they are given; switch them
            off after the Summit. <strong>Remove user</strong> erases and
            disables an account: the person can no longer sign in, their name
            and email are erased (the email can be used for a new account) and
            their open meeting requests are cancelled.
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
            <strong>Meeting calendar</strong> has two views.{" "}
            <strong>All requests</strong> lists every request (with or without a
            meeting time), with Accept and Decline on behalf of a country and a
            CSV download. <strong>Calendar</strong> shows one day at a time,
            every 30-minute time in {MEETING_SCHEDULE.rooms.join(" and ")},
            showing which times are free, blocked, awaiting the country or
            booked, with the project, the attendee, their organisation and
            email. Use <strong>Block these times</strong> (or{" "}
            <strong>Block</strong> on one time) to stop times being offered to
            investors, for example during the Summit plenary, and{" "}
            <strong>Unblock</strong> to offer them again.{" "}
            <strong>Cancel meeting</strong> cancels a request or a confirmed
            meeting and frees its time; the investor, the country and the Summit
            mailbox are told, with your reason if you give one.
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
          name="admin-meetings"
          alt="The meeting calendar: booked, awaiting, blocked and free times by room, with Block and Cancel meeting"
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
