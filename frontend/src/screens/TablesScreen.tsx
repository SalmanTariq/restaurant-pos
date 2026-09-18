import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_FLOOR } from "../demo-data";
import { usePos } from "../pos-store";
import type { DiningTable, TableLayout, TableStatus } from "../pos-types";

const STATUS_COPY: Record<TableStatus, string> = {
  free: "Free",
  seated: "Seated",
  bill: "Bill printed",
};

const NEW_TABLE_SIZE = { w: 128, h: 128 };

function nextTableId(layout: TableLayout[]): string {
  const used = new Set(
    layout.filter((piece) => piece.kind !== "counter").map((piece) => piece.id),
  );
  let n = 1;
  while (used.has(`T${n}`)) n += 1;
  return `T${n}`;
}

function findFreeSpot(layout: TableLayout[]): { x: number; y: number } {
  const xs = [12, 28, 44, 60, 76, 88];
  const ys = [24, 40, 56, 72, 84];
  for (const y of ys) {
    for (const x of xs) {
      const clash = layout.some((piece) => Math.hypot(piece.x - x, piece.y - y) < 14);
      if (!clash) return { x, y };
    }
  }
  return { x: 50, y: 40 };
}

export function TablesScreen({
  tables,
  selected,
  onSelect,
  onBack,
}: {
  tables: DiningTable[];
  selected: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const { layout, saveLayout, activeOrders } = usePos();
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const floorRef = useRef<HTMLDivElement>(null);

  function persist(next: TableLayout[], _syncTables = false) {
    layoutRef.current = next;
    saveLayout(next);
  }

  function addTable() {
    const id = nextTableId(layoutRef.current);
    const spot = findFreeSpot(layoutRef.current);
    persist(
      [
        ...layoutRef.current,
        {
          id,
          x: spot.x,
          y: spot.y,
          w: NEW_TABLE_SIZE.w,
          h: NEW_TABLE_SIZE.h,
          shape: "round",
          kind: "table",
        },
      ],
      true,
    );
    setNotice(null);
  }

  function removeTable(id: string) {
    const piece = layoutRef.current.find((entry) => entry.id === id);
    if (!piece || piece.kind === "counter") return;
    const busy = activeOrders.find((order) => order.tableId === id);
    if (busy) {
      const state = busy.status === "billed" ? "a printed bill" : "an open order";
      setNotice(
        `Table ${id} has ${state}. Finish or pay it before removing this table.`,
      );
      return;
    }
    persist(
      layoutRef.current.filter((entry) => entry.id !== id),
      true,
    );
    setNotice(null);
  }

  function resetLayout() {
    const defaultIds = new Set(DEFAULT_FLOOR.map((piece) => piece.id));
    const blocking = activeOrders.find(
      (order) => order.tableId && !defaultIds.has(order.tableId),
    );
    if (blocking) {
      setNotice(
        `Table ${blocking.tableId} has an open order. Finish or pay it before resetting the floor.`,
      );
      return;
    }
    const ok = window.confirm(
      "Reset the floor to the default 12 tables and counter? Added tables and saved positions will be cleared.",
    );
    if (!ok) return;
    persist(DEFAULT_FLOOR, true);
    setRemoving(false);
    setNotice(null);
  }

  function onPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    selectable: boolean,
  ) {
    event.preventDefault();
    const spot = layoutRef.current.find((entry) => entry.id === id);
    if (!spot || !floorRef.current) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const origX = spot.x;
    const origY = spot.y;
    let moved = false;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      const box = floorRef.current?.getBoundingClientRect();
      if (!box) return;
      const x = Math.min(96, Math.max(3, origX + (dx / box.width) * 100));
      const y = Math.min(94, Math.max(16, origY + (dy / box.height) * 100));
      persist(
        layoutRef.current.map((entry) =>
          entry.id === id ? { ...entry, x, y } : entry,
        ),
      );
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved || !selectable) return;
      if (removing) {
        removeTable(id);
        return;
      }
      onSelect(id);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const counter = layout.find((entry) => entry.kind === "counter");

  return (
    <main className="page floor-page">
      <div className="page-head">
        <div>
          <h1>Floor</h1>
          <p className="subhead">
            {removing
              ? "Tap a dining table to remove it. Occupied tables stay until the order is paid."
              : "Drag tables and the counter to match the dining room. Tap a table to open its order."}
          </p>
        </div>
        <ul className="legend">
          <li>
            <span className="swatch free" /> Free
          </li>
          <li>
            <span className="swatch seated" /> Seated
          </li>
          <li>
            <span className="swatch bill" /> Bill printed
          </li>
        </ul>
      </div>

      {notice && (
        <p className="floor-notice" role="alert">
          {notice}
        </p>
      )}

      <div className="floor" ref={floorRef}>
        <div className="floor-kitchen">Kitchen · تندور</div>
        {counter && (
          <button
            type="button"
            className="floor-fixture"
            style={{
              left: `${counter.x}%`,
              top: `${counter.y}%`,
              width: counter.w,
              height: counter.h,
            }}
            onPointerDown={(event) => onPointerDown(event, counter.id, false)}
          >
            Counter
          </button>
        )}
        {tables.map((table) => {
          const spot = layout.find((entry) => entry.id === table.id);
          if (!spot) return null;
          const extra =
            table.status !== "free" && table.itemCount
              ? ` · ${table.itemCount}`
              : "";
          return (
            <button
              key={table.id}
              type="button"
              className={`floor-table is-${spot.shape} is-${table.status}${selected === table.id ? " is-picked" : ""}${removing ? " is-removing" : ""}`}
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                width: spot.w,
                height: spot.h,
              }}
              onPointerDown={(event) => onPointerDown(event, table.id, true)}
            >
              <strong>{table.label}</strong>
              <span>
                {STATUS_COPY[table.status]}
                {extra}
              </span>
            </button>
          );
        })}
      </div>

      <div className="floor-actions">
        <button type="button" className="btn-ink back-order" onClick={onBack}>
          Back to order
        </button>
        <button type="button" className="ghost-btn floor-add" onClick={addTable}>
          Add table
        </button>
        <button
          type="button"
          className={`ghost-btn floor-edit${removing ? " is-on" : ""}`}
          aria-pressed={removing}
          onClick={() => {
            setRemoving((value) => !value);
            setNotice(null);
          }}
        >
          {removing ? "Done removing" : "Remove tables"}
        </button>
        <button type="button" className="ghost-btn floor-reset" onClick={resetLayout}>
          Reset layout
        </button>
      </div>
    </main>
  );
}
