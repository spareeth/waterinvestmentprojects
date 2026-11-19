"use client";

import { useState, useTransition } from "react";
import {
  applyContactsAction,
  previewContactsAction,
} from "@/app/(portal)/admin/countries/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/workspace/form-controls";
import {
  CONTACT_ROLE_LABEL,
  type ContactPlan,
} from "@/lib/admin/contacts-input";
import { CsvSource, PreviewCounts } from "./csv-source";

// WBG's focal point list and coordinator mapping from a CSV (M7): file, preview, add.

export function ContactsImportForm() {
  const [text, setText] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    plan: ContactPlan;
    digest: string;
  } | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();
  const plan = preview?.plan;

  return (
    <div className="flex flex-col gap-4">
      <CsvSource
        onText={(next, problem) => {
          setText(next);
          setPreview(null);
          setDone(undefined);
          setError(problem);
        }}
        disabled={pending}
        example="iso3,name,email,role  then  AAA,Jane Example,jane@ministry.example,focal point"
      />
      <Button
        type="button"
        className="self-start"
        disabled={!text || pending}
        onClick={() =>
          startTransition(async () => {
            setDone(undefined);
            const result = await previewContactsAction(text ?? "");
            if (result.ok) {
              setPreview(result.preview);
              setError(undefined);
            } else {
              setPreview(null);
              setError(result.error);
            }
          })
        }
      >
        Check the file
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      {plan ? (
        plan.fileErrors.length > 0 ? (
          <Notice tone="error">{plan.fileErrors.join(" ")}</Notice>
        ) : (
          <section className="flex flex-col gap-4" aria-label="Preview">
            <PreviewCounts
              items={[
                { label: "rows", value: plan.summary.rows },
                { label: "new", value: plan.summary.ready },
                { label: "already stored", value: plan.summary.existing },
                {
                  label: "with errors",
                  value: plan.summary.errors,
                  tone: "error",
                },
              ]}
            />
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr
                      key={row.line}
                      className={`border-b last:border-0 ${row.errors.length > 0 ? "bg-declined/40" : ""}`}
                    >
                      <td className="px-3 py-2 align-top tabular-nums">
                        {row.line}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold">
                          {row.name || "No name"}
                        </div>
                        <div className="break-all text-muted-foreground">
                          {row.iso3} · {row.email}
                          {row.role ? ` · ${CONTACT_ROLE_LABEL[row.role]}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.errors.length > 0 ? (
                          <ul className="list-disc pl-4 text-declined-foreground">
                            {row.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : row.exists ? (
                          "Already stored"
                        ) : (
                          "New"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              className="self-start"
              disabled={pending || plan.summary.ready === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await applyContactsAction(
                    text ?? "",
                    preview.digest,
                  );
                  if (result.ok) {
                    setPreview(null);
                    setError(undefined);
                    setDone(
                      `${result.created} contact${result.created === 1 ? "" : "s"} added` +
                        (result.linked > 0
                          ? `, ${result.linked} linked to an existing account.`
                          : "."),
                    );
                  } else {
                    setError(result.error);
                  }
                })
              }
            >
              {pending
                ? "Adding"
                : `Add ${plan.summary.ready} contact${plan.summary.ready === 1 ? "" : "s"}`}
            </Button>
          </section>
        )
      ) : null}
    </div>
  );
}
