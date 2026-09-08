import { useState } from "react";
import type { FieldValue } from "../../core/schema/selector";
import type { TableColumn } from "./categoryTableView";
import classes from "./listBuilding.module.css";

export interface TableCellProps {
  column: TableColumn;
  value: FieldValue | undefined;
  onChange: (next: FieldValue | undefined) => void;
}

export function TableCell({ column, value, onChange }: TableCellProps) {
  const [draft, setDraft] = useState("");

  if (column.kind === "name") {
    return (
      <input
        type="text"
        className={classes.cellText}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  if (column.kind === "cost" || column.fieldType === "number") {
    return (
      <input
        type="number"
        className={classes.cellNumber}
        value={typeof value === "number" ? value : ""}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          const parsed = Number(raw);
          onChange(raw === "" || Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
    );
  }

  if (column.fieldType === "boolean") {
    return (
      <input
        type="checkbox"
        className={classes.cellCheck}
        checked={value === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }

  if (column.fieldType === "text" || (!column.multiple && (column.freeText || !column.choices))) {
    return (
      <input
        type="text"
        className={classes.cellText}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      />
    );
  }

  if (column.multiple) {
    const values = Array.isArray(value) ? value : [];
    const labelOf = (v: string) => column.choices?.find((c) => c.value === v)?.label ?? v;
    const remaining = (column.choices ?? []).filter((c) => !values.includes(c.value));

    const add = (v: string) => {
      const next = v.trim();
      if (next && !values.includes(next)) onChange([...values, next]);
      setDraft("");
    };

    return (
      <div className={classes.miniChips}>
        {values.map((v) => (
          <span key={v} className={classes.miniChip}>
            {labelOf(v)}
            <button
              type="button"
              className={classes.miniChipX}
              aria-label={`Remove ${labelOf(v)}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        {column.freeText ? (
          <input
            type="text"
            className={classes.miniAdd}
            placeholder="add…"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => add(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
            }}
          />
        ) : (
          remaining.length > 0 && (
            <select
              className={classes.miniAdd}
              value=""
              onChange={(event) => {
                if (event.currentTarget.value) add(event.currentTarget.value);
              }}
            >
              <option value="">add…</option>
              {remaining.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          )
        )}
      </div>
    );
  }

  // single-choice select: singleValue with options, single reference / article link
  return (
    <select
      className={classes.cellSelect}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
    >
      <option value="">—</option>
      {(column.choices ?? []).map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}
