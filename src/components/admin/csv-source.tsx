"use client";

import { useId, useState } from "react";
import { Textarea } from "@/components/workspace/form-controls";

// Step 1 of every admin CSV import: choose a .csv file or paste the rows. The text stays in the browser until the
// admin asks for a preview; nothing is stored on the server at any step.

export const MAX_CSV_BYTES = 1_000_000;

export function CsvSource({
  onText,
  disabled,
  example,
}: {
  /** Called with the file text (or null when cleared or refused), and an error to show. */
  onText: (text: string | null, error?: string) => void;
  disabled?: boolean;
  /** One or two example lines shown under the paste box. */
  example: string;
}) {
  const id = useId();
  const [pasted, setPasted] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-file`} className="text-sm font-semibold">
          CSV file
        </label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv"
          disabled={disabled}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            setPasted("");
            if (!file) return onText(null);
            if (file.size > MAX_CSV_BYTES) {
              return onText(null, "The file must be 1 MB or smaller.");
            }
            onText(await file.text());
          }}
        />
        <p className="text-xs text-muted-foreground">
          Save from Excel as &quot;CSV UTF-8&quot;. Commas or semicolons both
          work.
        </p>
      </div>
      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Or paste the rows instead
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`${id}-paste`} className="sr-only">
            CSV rows
          </label>
          <Textarea
            id={`${id}-paste`}
            rows={6}
            value={pasted}
            disabled={disabled}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => {
              setPasted(event.currentTarget.value);
              onText(
                event.currentTarget.value.trim()
                  ? event.currentTarget.value
                  : null,
              );
            }}
          />
          <p className="text-xs text-muted-foreground">
            Example: <code className="break-all">{example}</code>
          </p>
        </div>
      </details>
    </div>
  );
}

/** Small counts line for a preview: "12 rows: 8 ready, 1 unchanged, 3 with errors". */
export function PreviewCounts({
  items,
}: {
  items: { label: string; value: number; tone?: "error" }[];
}) {
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {items.map((item) => (
        <li
          key={item.label}
          className={
            item.tone === "error" && item.value > 0
              ? "rounded-full bg-declined px-3 py-1 font-semibold text-declined-foreground"
              : "rounded-full bg-muted px-3 py-1 font-semibold"
          }
        >
          {item.value} {item.label}
        </li>
      ))}
    </ul>
  );
}
