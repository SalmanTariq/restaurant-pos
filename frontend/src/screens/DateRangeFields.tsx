import { END_OF_DAY, START_OF_DAY } from "../demo-data";

export function DateRangeFields({
  from,
  to,
  fromTime,
  toTime,
  onFrom,
  onTo,
  onFromTime,
  onToTime,
}: {
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onFromTime: (value: string) => void;
  onToTime: (value: string) => void;
}) {
  const sameDay = from === to;
  return (
    <div className="range-fields">
      <label>
        <span>From</span>
        <span className="range-pair">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => onFrom(event.currentTarget.value)}
          />
          <input
            type="time"
            aria-label="From time"
            value={fromTime || START_OF_DAY}
            max={sameDay ? toTime : undefined}
            onChange={(event) => onFromTime(event.currentTarget.value)}
          />
        </span>
      </label>
      <label>
        <span>To</span>
        <span className="range-pair">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => onTo(event.currentTarget.value)}
          />
          <input
            type="time"
            aria-label="To time"
            value={toTime || END_OF_DAY}
            min={sameDay ? fromTime : undefined}
            onChange={(event) => onToTime(event.currentTarget.value)}
          />
        </span>
      </label>
    </div>
  );
}
