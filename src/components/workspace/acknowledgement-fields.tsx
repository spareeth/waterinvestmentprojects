import { describe, FieldShell, Textarea } from "./form-controls";

/** The confidentiality tick box (PLAN F4) and, for an admin acting for a country, the evidence note. */
export function AcknowledgementFields({
  idPrefix,
  text,
  onBehalf,
  errors,
}: {
  idPrefix: string;
  text: string;
  onBehalf: boolean;
  errors: Record<string, string>;
}) {
  const boxId = `${idPrefix}-acknowledge`;
  const noteId = `${idPrefix}-evidence`;
  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={boxId}
        className="flex items-start gap-3 rounded-lg border border-ack-border bg-ack-surface p-4 text-sm leading-relaxed"
      >
        <input
          id={boxId}
          type="checkbox"
          name="acknowledge"
          value="yes"
          required
          aria-invalid={errors.acknowledge ? true : undefined}
          aria-describedby={errors.acknowledge ? `${boxId}-error` : undefined}
          className="mt-1 size-4 shrink-0 accent-ack"
        />
        <span>{text}</span>
      </label>
      {errors.acknowledge ? (
        <p id={`${boxId}-error`} className="text-xs text-destructive">
          {errors.acknowledge}
        </p>
      ) : null}
      {onBehalf ? (
        <FieldShell
          id={noteId}
          label="Where is the country's confirmation kept?"
          hint="You are acting for the country. For example: email from the focal point, 18 Nov 2026, filed in the Summit mailbox."
          error={errors.evidenceNote}
        >
          <Textarea
            {...describe(noteId, true, errors.evidenceNote)}
            name="evidenceNote"
            rows={3}
            required
          />
        </FieldShell>
      ) : null}
    </div>
  );
}
