"use client";

import { useState, useTransition } from "react";
import {
  applyMetadataAction,
  previewMetadataAction,
} from "@/app/(portal)/admin/projects/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/workspace/form-controls";
import { METADATA_LABEL, type ImportPlan } from "@/lib/admin/metadata-import";
import { CsvSource, PreviewCounts } from "./csv-source";

// CSV import of PPP model, size and development stage (M7): file, preview with row errors, apply.

const ROW_TONE = {
  change: "",
  unchanged: "text-muted-foreground",
  error: "bg-declined/40",
} as const;

export function MetadataImportForm() {
  const [text, setText] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    plan: ImportPlan;
    digest: string;
  } | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  function reset(next: string | null, problem?: string) {
    setText(next);
    setPreview(null);
    setDone(undefined);
    setError(problem);
  }

  const plan = preview?.plan;

  return (
    <div className="flex flex-col gap-6">
      <CsvSource
        onText={reset}
        disabled={pending}
        example="project_id,ppp_model,size_min_usd_million,size_max_usd_million,development_stage"
      />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={!text || pending}
          onClick={() =>
            startTransition(async () => {
              setDone(undefined);
              const result = await previewMetadataAction(text ?? "");
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
          {pending && !preview ? "Checking" : "Check the file"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}

      {plan ? (
        <section className="flex flex-col gap-4" aria-label="Preview">
          {plan.fileErrors.length > 0 ? (
            <Notice tone="error">{plan.fileErrors.join(" ")}</Notice>
          ) : (
            <>
              <PreviewCounts
                items={[
                  { label: "rows", value: plan.summary.rows },
                  { label: "to change", value: plan.summary.changes },
                  { label: "unchanged", value: plan.summary.unchanged },
                  {
                    label: "with errors",
                    value: plan.summary.errors,
                    tone: "error",
                  },
                ]}
              />
              {plan.ignoredColumns.length > 0 ? (
                <Notice tone="info">
                  Ignored columns: {plan.ignoredColumns.join(", ")}.
                </Notice>
              ) : null}
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">Line</th>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row) => (
                      <tr
                        key={row.line}
                        className={`border-b last:border-0 ${ROW_TONE[row.status]}`}
                      >
                        <td className="px-3 py-2 align-top tabular-nums">
                          {row.line}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {row.projectLabel ?? "Not found"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {row.status === "error" ? (
                            <ul className="list-disc pl-4 text-declined-foreground">
                              {row.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          ) : row.status === "unchanged" ? (
                            "No change"
                          ) : (
                            <ul className="flex flex-col gap-1">
                              {row.changes.map((c) => (
                                <li key={c.field}>
                                  <span className="font-semibold">
                                    {METADATA_LABEL[c.field]}:
                                  </span>{" "}
                                  <span className="text-muted-foreground line-through">
                                    {c.from ?? "empty"}
                                  </span>{" "}
                                  to {c.to ?? "empty"}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="self-start"
                  disabled={pending || plan.summary.changes === 0}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await applyMetadataAction(
                        text ?? "",
                        preview.digest,
                      );
                      if (result.ok) {
                        setPreview(null);
                        setError(undefined);
                        setDone(
                          `Saved: ${result.result.changed} project${result.result.changed === 1 ? "" : "s"} updated.` +
                            (result.result.errors > 0
                              ? ` ${result.result.errors} row${result.result.errors === 1 ? "" : "s"} with errors left out.`
                              : ""),
                        );
                      } else {
                        setError(result.error);
                      }
                    })
                  }
                >
                  {pending
                    ? "Saving"
                    : `Apply ${plan.summary.changes} change${plan.summary.changes === 1 ? "" : "s"}`}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Only PPP model, size and development stage are changed. Rows
                  with errors are left out; fix them and import the file again.
                </p>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
