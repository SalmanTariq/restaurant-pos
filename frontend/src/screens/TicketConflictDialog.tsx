import { describeConflictCopy, type TillConflict } from "../till-conflict";

export function TicketConflictDialog({
  conflict,
  onPick,
}: {
  conflict: TillConflict;
  onPick: (keep: "local" | "server") => void;
}) {
  const saved = describeConflictCopy(conflict.current);
  const here = describeConflictCopy(conflict.after);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal conflict-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
      >
        <h2 id="conflict-title">This ticket does not match the server</h2>
        <p>
          Usually this happens when an old order is edited or deleted after it was
          already saved. Pick which copy to keep. The other copy is discarded.
        </p>
        <div className="conflict-copies">
          <article className="conflict-copy">
            <p className="conflict-kicker">Saved on server</p>
            <h3>{saved.heading}</h3>
            <p>{saved.detail}</p>
            <button className="btn-ink" type="button" onClick={() => onPick("server")}>
              Keep saved copy
            </button>
          </article>
          <article className="conflict-copy">
            <p className="conflict-kicker">On this till</p>
            <h3>{here.heading}</h3>
            <p>{here.detail}</p>
            <button className="btn-tandoor" type="button" onClick={() => onPick("local")}>
              Keep this till’s copy
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
