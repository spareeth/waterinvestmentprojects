// Display helpers for the upload link pages (M0). Pure.

const UAE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Dubai",
});

/** For example "19 November 2026 at 12:30 (UAE time)". */
export function formatUaeTime(date: Date): string {
  return `${UAE_TIME.format(date)} (UAE time)`;
}
