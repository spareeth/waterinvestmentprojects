import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Result of an auth server action, shown by the form that submitted it. */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export const emptyFormState: FormState = {};

export function Field({
  label,
  name,
  hint,
  error,
  ...inputProps
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
} & Omit<ComponentProps<"input">, "name">) {
  const id = inputProps.id ?? `field-${name}`;
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A drop-down in the style of Field (M13: organisation type at registration). */
export function SelectField({
  label,
  name,
  options,
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue=""
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-declined px-3 py-2 text-sm text-declined-foreground"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  children,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="h-10 w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
