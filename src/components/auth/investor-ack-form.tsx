"use client";

import { useActionState } from "react";
import { acceptInvestorAckAction } from "@/app/(account)/actions";
import {
  emptyFormState,
  FormError,
  SubmitButton,
} from "@/components/auth/form-parts";

/**
 * The investor acknowledgement. 25 Nov (Jacob Kim): the box shows the full terms of use, and the wording from
 * config is the label of the tick box.
 */
export function InvestorAckForm({
  text,
  sections = [],
}: {
  text: string;
  sections?: readonly { heading: string; body: string }[];
}) {
  const [state, action, pending] = useActionState(
    acceptInvestorAckAction,
    emptyFormState,
  );
  const error = state.fieldErrors?.accept;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <div className="flex flex-col gap-4 rounded-lg border border-ack-border bg-ack-surface p-4 text-sm">
        {sections.length > 0 ? (
          <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pe-1">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-semibold text-brand-navy">
                  {section.heading}
                </h2>
                <p className="mt-1">{section.body}</p>
              </section>
            ))}
          </div>
        ) : null}
        <label className="flex items-start gap-3 border-t border-ack-border pt-3 font-medium first:border-t-0 first:pt-0">
          <input
            type="checkbox"
            name="accept"
            value="yes"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "accept-error" : undefined}
            className="mt-0.5 size-4 shrink-0 accent-brand-teal"
          />
          <span>{text}</span>
        </label>
      </div>
      {error ? (
        <p id="accept-error" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Accept and continue
      </SubmitButton>
    </form>
  );
}
