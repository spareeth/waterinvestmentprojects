"use client";

import { useState, useTransition } from "react";
import {
  applyBulkAccountsAction,
  previewBulkAccountsAction,
} from "@/app/(portal)/admin/accounts/bulk/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/workspace/form-controls";
import type { BulkAccountPlan } from "@/lib/admin/bulk-accounts-input";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { toCsv } from "@/lib/requests/csv";
import { CsvSource, PreviewCounts } from "./csv-source";

// Bulk account hand-out (M7, PLAN 0a.4): file, preview, create, then the temporary passwords ONCE. The hand-out
// CSV is built here in the browser from the response; the server never keeps the passwords.

interface HandOut {
  line: number;
  name: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
  temporaryPassword: string;
}

function downloadHandOut(rows: HandOut[], signInUrl: string) {
  const csv = toCsv(
    ["name", "email", "role", "temporary_password", "sign_in_address"],
    rows.map((r) => [
      r.name,
      r.email,
      ROLE_LABEL[r.role],
      r.temporaryPassword,
      signInUrl,
    ]),
  );
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `account-hand-out-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BulkAccountsForm({ signInUrl }: { signInUrl: string }) {
  const [text, setText] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    plan: BulkAccountPlan;
    digest: string;
  } | null>(null);
  const [handOut, setHandOut] = useState<HandOut[] | null>(null);
  const [failed, setFailed] = useState<
    { line: number; email: string; message: string }[]
  >([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const plan = preview?.plan;

  if (handOut) {
    return (
      <section className="flex flex-col gap-4" aria-label="Temporary passwords">
        <Notice tone="success">
          {handOut.length} account{handOut.length === 1 ? "" : "s"} created.
          Download or print the temporary passwords now: they are not shown
          again and are not stored anywhere.
        </Notice>
        {failed.length > 0 ? (
          <Notice tone="error">
            {failed.length} row{failed.length === 1 ? "" : "s"} refused:{" "}
            {failed
              .map((f) => `line ${f.line} (${f.email}): ${f.message}`)
              .join("; ")}
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-3 print:hidden">
          <Button
            type="button"
            onClick={() => downloadHandOut(handOut, signInUrl)}
          >
            Download hand-out CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  "Close the list? The temporary passwords cannot be shown again.",
                )
              ) {
                setHandOut(null);
                setFailed([]);
                setPreview(null);
                setText(null);
              }
            }}
          >
            Done
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Temporary password</th>
              </tr>
            </thead>
            <tbody>
              {handOut.map((h) => (
                <tr key={h.email} className="border-b last:border-0">
                  <td className="px-3 py-2">{h.name}</td>
                  <td className="px-3 py-2 break-all">{h.email}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[h.role]}</td>
                  <td className="px-3 py-2 font-mono">{h.temporaryPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign-in address: {signInUrl}. Each person chooses their own password
          at the first sign-in.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CsvSource
        onText={(next, problem) => {
          setText(next);
          setPreview(null);
          setError(problem);
        }}
        disabled={pending}
        example="email,name,organisation,job_title,role,countries  then  ann@bank.example,Ann Example,Example Bank,Director,investor,"
      />
      <Button
        type="button"
        className="self-start"
        disabled={!text || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await previewBulkAccountsAction(text ?? "");
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
      {plan ? (
        plan.fileErrors.length > 0 ? (
          <Notice tone="error">{plan.fileErrors.join(" ")}</Notice>
        ) : (
          <section className="flex flex-col gap-4" aria-label="Preview">
            <PreviewCounts
              items={[
                { label: "rows", value: plan.summary.rows },
                { label: "ready", value: plan.summary.ready },
                {
                  label: "with errors",
                  value: plan.summary.errors,
                  tone: "error",
                },
              ]}
            />
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Person</th>
                    <th className="px-3 py-2">Role and countries</th>
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
                          {row.email}
                          {row.organisation ? `, ${row.organisation}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.role ? ROLE_LABEL[row.role] : "Unknown"}
                        {row.countryCodes.length > 0
                          ? ` (${row.countryCodes.join(", ")})`
                          : ""}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.errors.length > 0 ? (
                          <ul className="list-disc pl-4 text-declined-foreground">
                            {row.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          "Ready"
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
                disabled={pending || plan.summary.ready === 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await applyBulkAccountsAction(
                      text ?? "",
                      preview.digest,
                    );
                    if (result.ok) {
                      setError(undefined);
                      setFailed(result.result.failed);
                      setHandOut(result.result.created);
                    } else {
                      setError(result.error);
                    }
                  })
                }
              >
                {pending
                  ? "Creating accounts"
                  : `Create ${plan.summary.ready} account${plan.summary.ready === 1 ? "" : "s"}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Rows with errors are left out. Creating many accounts can take a
                little while.
              </p>
            </div>
          </section>
        )
      ) : null}
    </div>
  );
}
