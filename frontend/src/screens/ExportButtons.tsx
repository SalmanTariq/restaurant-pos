import type { ExportFormat } from "../export-report";

export function ExportButtons({
  disabled,
  onExport,
}: {
  disabled?: boolean;
  onExport: (format: ExportFormat) => void;
}) {
  return (
    <div className="export-block">
      <span>Export</span>
      <div className="export-group" role="group" aria-label="Export">
        <button type="button" disabled={disabled} onClick={() => onExport("csv")}>
          CSV
        </button>
        <button type="button" disabled={disabled} onClick={() => onExport("xlsx")}>
          XLSX
        </button>
        <button type="button" disabled={disabled} onClick={() => onExport("pdf")}>
          PDF
        </button>
      </div>
    </div>
  );
}
