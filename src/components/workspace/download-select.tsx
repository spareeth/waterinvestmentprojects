import { FieldShell, Select } from "./form-controls";

/** Download choice for a teaser. PLAN v0.3: downloads are allowed by default. */
export function DownloadSelect({
  id,
  allowDownload,
}: {
  id: string;
  allowDownload: boolean;
}) {
  return (
    <FieldShell id={id} label="Allow download?">
      <Select
        id={id}
        name="allowDownload"
        defaultValue={allowDownload ? "download" : "view"}
      >
        <option value="download">Allow download</option>
        <option value="view">View only</option>
      </Select>
    </FieldShell>
  );
}
