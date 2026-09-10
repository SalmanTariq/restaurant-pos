export function DateRangeFields({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <div className="range-fields">
      <label>
        <span>From</span>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(event) => onFrom(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(event) => onTo(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
