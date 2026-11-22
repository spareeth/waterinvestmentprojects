"use client";

import { useActionState } from "react";
import {
  createProjectAction,
  updateProjectAction,
  type WorkspaceFormState,
} from "@/app/(portal)/workspace/actions";
import { Button } from "@/components/ui/button";
import {
  describe,
  FieldShell,
  Notice,
  Select,
  TextInput,
} from "@/components/workspace/form-controls";
import {
  DEVELOPMENT_STAGE_SUGGESTIONS,
  PPP_MODEL_SUGGESTIONS,
  PROJECT_TYPE_LABEL,
  type ProjectFormValues,
  SECTOR_SUGGESTIONS,
} from "@/lib/workspace/project-input";

const initial: WorkspaceFormState = {};

/**
 * Key fields of a project (PLAN F3). Used for a new project (with a country choice) and for editing.
 * `readOnly` comes from the policy module (canEditProject) via the page; the server checks again.
 */
export function ProjectForm({
  mode,
  projectId,
  defaults,
  countries = [],
  readOnly = false,
}: {
  mode: "create" | "edit";
  projectId?: string;
  defaults: ProjectFormValues;
  countries?: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  const action =
    mode === "create"
      ? createProjectAction
      : updateProjectAction.bind(null, projectId ?? "");
  const [state, formAction, pending] = useActionState(action, initial);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};

  const text = (
    name: keyof ProjectFormValues,
    label: string,
    options: {
      hint?: string;
      required?: boolean;
      list?: string;
      inputMode?: "decimal";
    } = {},
  ) => {
    const id = `project-${name}`;
    return (
      <FieldShell id={id} label={label} hint={options.hint} error={e[name]}>
        <TextInput
          {...describe(id, options.hint, e[name])}
          name={name}
          defaultValue={v[name] ?? ""}
          required={options.required}
          list={options.list}
          inputMode={options.inputMode}
          disabled={readOnly}
        />
      </FieldShell>
    );
  };

  /**
   * A WBG drop-down (PLAN v0.4 0b.8). A value saved before the lists were agreed stays selectable, so editing an
   * older project never changes it silently.
   */
  const choice = (
    name: "sector" | "pppModel" | "developmentStage",
    label: string,
    values: readonly string[],
    { required = false }: { required?: boolean } = {},
  ) => {
    const id = `project-${name}`;
    const current = v[name] ?? "";
    const options =
      current && !values.includes(current) ? [current, ...values] : values;
    return (
      <FieldShell id={id} label={label} error={e[name]}>
        <Select
          {...describe(id, undefined, e[name])}
          name={name}
          defaultValue={current}
          required={required}
          disabled={readOnly}
        >
          <option value="" disabled={required}>
            {required ? "Choose the sector" : "Not stated"}
          </option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </FieldShell>
    );
  };

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
      {readOnly ? (
        <Notice tone="info">
          Project details are kept by the Summit team. Contact them if something
          needs to change.
        </Notice>
      ) : null}

      {mode === "create" && countries.length > 1 ? (
        <FieldShell id="project-countryId" label="Country" error={e.countryId}>
          <Select
            {...describe("project-countryId", undefined, e.countryId)}
            name="countryId"
            defaultValue=""
            required
          >
            <option value="" disabled>
              Choose a country
            </option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FieldShell>
      ) : mode === "create" && countries[0] ? (
        <input type="hidden" name="countryId" value={countries[0].id} />
      ) : null}

      {text("title", "Project title", { required: true })}
      <div className="grid gap-5 sm:grid-cols-2">
        {choice("sector", "Sector", SECTOR_SUGGESTIONS, { required: true })}
        <FieldShell
          id="project-projectType"
          label="Project type"
          error={e.projectType}
        >
          <Select
            {...describe("project-projectType", undefined, e.projectType)}
            name="projectType"
            defaultValue={v.projectType ?? "SUMMIT_PIPELINE"}
            disabled={readOnly}
          >
            {Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldShell>
        {text("region", "Region", {
          hint: "The region or province within the country, if known.",
        })}
        {choice("pppModel", "PPP model", PPP_MODEL_SUGGESTIONS)}
        {text("sizeMinUsdMillion", "Size from (USD million)", {
          inputMode: "decimal",
          hint: "Leave both sizes empty if not known: the pipeline shows TBC.",
        })}
        {text("sizeMaxUsdMillion", "Size to (USD million)", {
          inputMode: "decimal",
        })}
        {choice(
          "developmentStage",
          "Development stage",
          DEVELOPMENT_STAGE_SUGGESTIONS,
        )}
      </div>

      {readOnly ? null : (
        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Save as draft"
                : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
