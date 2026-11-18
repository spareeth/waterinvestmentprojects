/**
 * The consent tick box on the workspace teaser upload (PLAN v0.3: every teaser is stored with a Submission
 * recording this consent). The wording comes from config through the page.
 */
export function AcknowledgementFields({
  idPrefix,
  text,
  errors,
}: {
  idPrefix: string;
  text: string;
  errors: Record<string, string>;
}) {
  const boxId = `${idPrefix}-acknowledge`;
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
    </div>
  );
}
