"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  publishProjectsAction,
  unpublishProjectAction,
} from "@/app/(portal)/admin/projects/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/workspace/form-controls";
import { ScanBadge, StatusBadge } from "@/components/workspace/status-badge";
import type { ProjectStatus, ScanStatus } from "@/generated/prisma/enums";
import { usdToMillion } from "@/lib/workspace/project-input";
import { cn } from "@/lib/utils";
import {
  tableFrameClass,
  tableHeadClass,
  tableRowClass,
} from "@/components/ui/table-styles";

// Every project for the admin team (M7): filters at a glance, publish one or many, take one out of the pipeline.
// What each button may do comes from the server (workspacePermissions); the actions check again.

export interface ProjectRow {
  id: string;
  title: string;
  sector: string;
  country: string;
  countryInactive: boolean;
  pppModel: string | null;
  sizeMinUsd: string | null;
  sizeMaxUsd: string | null;
  developmentStage: string | null;
  status: ProjectStatus;
  teaser: { version: number; scanStatus: ScanStatus } | null;
  missing: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
}

function size(min: string | null, max: string | null): string | null {
  if (min === null && max === null) return null;
  const a = min === null ? null : usdToMillion(min);
  const b = max === null ? null : usdToMillion(max);
  if (a !== null && b !== null && a !== b) return `USD ${a} to ${b}m`;
  return `USD ${a ?? b}m`;
}

function Missing() {
  return <span className="text-pending-foreground">Missing</span>;
}

export function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<{
    error?: string;
    message?: string;
    refused?: Record<string, string>;
  }>({});
  const [pending, startTransition] = useTransition();
  const publishable = projects.filter((p) => p.canPublish);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await publishProjectsAction([...selected]);
              setState(result);
              setSelected(new Set());
            })
          }
        >
          {pending ? "Publishing" : `Publish selected (${selected.size})`}
        </Button>
        {publishable.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              setSelected(
                selected.size === publishable.length
                  ? new Set()
                  : new Set(publishable.map((p) => p.id)),
              )
            }
          >
            {selected.size === publishable.length
              ? "Clear selection"
              : `Select all ready to publish (${publishable.length})`}
          </Button>
        ) : null}
      </div>
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className={tableFrameClass}>
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th className="px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">PPP model</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr
                key={p.id}
                className={cn(
                  tableRowClass(
                    i,
                    p.status === "DRAFT" ? "bg-sand-50" : undefined,
                  ),
                  "align-top",
                )}
              >
                <td className="px-3 py-3">
                  {p.canPublish ? (
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`Select ${p.title}`}
                      checked={selected.has(p.id)}
                      onChange={(e) => toggle(p.id, e.currentTarget.checked)}
                    />
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-muted-foreground">
                    {p.country}
                    {p.countryInactive ? " (switched off)" : ""}, {p.sector}
                  </div>
                  {state.refused?.[p.id] ? (
                    <p className="mt-1 text-xs text-declined-foreground">
                      {state.refused[p.id]}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3">{p.pppModel ?? <Missing />}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {size(p.sizeMinUsd, p.sizeMaxUsd) ?? <Missing />}
                </td>
                <td className="px-3 py-3">
                  {p.developmentStage ?? <Missing />}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={p.status} />
                    {p.teaser ? (
                      p.teaser.scanStatus === "CLEAN" ? (
                        <span className="text-xs text-muted-foreground">
                          Teaser v{p.teaser.version}
                        </span>
                      ) : (
                        <ScanBadge status={p.teaser.scanStatus} />
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No teaser
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/workspace/projects/${p.id}`}>Edit</Link>
                    </Button>
                    {p.canWithdraw ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Take "${p.title}" out of the pipeline? Investors will no longer see it.`,
                            )
                          ) {
                            return;
                          }
                          startTransition(async () => {
                            setState(await unpublishProjectAction(p.id));
                          });
                        }}
                      >
                        Unpublish
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
