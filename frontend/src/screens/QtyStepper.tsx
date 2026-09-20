import { useEffect, useState } from "react";

export function QtyStepper({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  onChange: (qty: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onChange(0);
      setDraft(value > 0 ? String(value) : "");
      return;
    }
    const next = Math.min(parsed, Math.max(1, max));
    onChange(next);
    setDraft(String(next));
  }

  return (
    <div className="qty">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={`Remove ${name}`}
      >
        −
      </button>
      <input
        className="qty-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={draft}
        aria-label={`Quantity for ${name}`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = Math.floor(Number(next));
          if (Number.isFinite(parsed) && parsed > 0) commit(next);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
            event.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`Add ${name}`}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}
