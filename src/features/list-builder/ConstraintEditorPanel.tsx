import { useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { Condition, PartitionKeySpec } from "../../core/schema/listBuilding";
import type { Selector } from "../../core/schema/selector";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import {
  type ClauseOptions,
  constraintEditorView,
  type RefOptionGroup,
  type SentenceToken,
} from "./constraintEditorView";
import { type RecipeId, selectorFromSlot, slotFromSelector } from "./constraintRecipes";
import type { ArgSpec, TreeRow } from "./constraintTreeView";
import { constraintEditorStore, useConstraintEditor } from "./state/constraintEditor";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const store = () => constraintEditorStore.getState();
const rulesetActions = () => currentRulesetStore.getState();

type Cmp = "lt" | "lte" | "eq" | "gte" | "gt";
const CMP_LABELS: Record<Cmp, string> = {
  gte: "is at least",
  gt: "is more than",
  eq: "equals",
  lte: "is at most",
  lt: "is less than",
};
const CMP_ENTRIES = Object.entries(CMP_LABELS) as [Cmp, string][];

/**
 * The one shared constraint editor. Reads the transient `constraintEditorStore`
 * for its draft + face, the ruleset for name resolution, and writes only on
 * Save / Delete (through `currentRulesetStore`). Exactly one instance is mounted
 * per page.
 */
export function ConstraintEditorPanel() {
  const ruleset = useRuleset();
  const snapshot = useConstraintEditor((s) => s);
  if (!ruleset || !snapshot.open || !snapshot.host) return null;

  const vm = constraintEditorView(ruleset, snapshot);
  const host = snapshot.host;

  const save = () => {
    if (!vm.finalizedDef) return;
    if (snapshot.mode === "new") rulesetActions().addConstraint(host, vm.finalizedDef);
    else if (snapshot.originalId) {
      rulesetActions().updateConstraint(host, snapshot.originalId, vm.finalizedDef);
    }
    store().close();
  };

  const remove = () => {
    if (snapshot.mode === "existing" && snapshot.originalId) {
      rulesetActions().deleteConstraint(host, snapshot.originalId);
    }
    store().close();
  };

  return (
    <div className={classes.cePanel} role="dialog" aria-label="Constraint editor">
      <div className={classes.cePanelHeader}>
        {vm.canGoBack && (
          <button
            type="button"
            className={classes.ceIconBtn}
            aria-label="Back"
            onClick={() => store().back()}
          >
            ←
          </button>
        )}
        <div className={classes.cePanelHeadings}>
          <div className={classes.cePanelTitle}>{vm.heading}</div>
          <div className={classes.cePanelSub}>on {vm.hostLabel}</div>
        </div>
        <button
          type="button"
          className={classes.ceIconBtn}
          aria-label="Close"
          onClick={() => store().close()}
        >
          ✕
        </button>
      </div>

      <div className={classes.ceBody}>
        {vm.face === "recipes" && <RecipesFace recipes={vm.recipes} />}
        {vm.face === "sentence" && <SentenceFace vm={vm} />}
        {vm.face === "tree" && <TreeFace vm={vm} />}
      </div>

      {vm.face !== "recipes" && (
        <div className={classes.ceFooter}>
          <button
            type="button"
            className={classes.primaryBtn}
            disabled={!vm.canSave}
            onClick={save}
          >
            {vm.saveLabel}
          </button>
          <button type="button" className={classes.ghostBtn} onClick={remove}>
            {vm.destructiveLabel}
          </button>
          <span style={{ flex: 1 }} />
          {vm.face === "sentence" ? (
            <button
              type="button"
              className={classes.inlineLink}
              onClick={() => store().toStructure()}
            >
              Edit as structure
            </button>
          ) : (
            <button
              type="button"
              className={classes.inlineLink}
              onClick={() => store().toSentence()}
            >
              Back to the sentence
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipes face.
// ---------------------------------------------------------------------------

function RecipesFace({ recipes }: { recipes: { id: RecipeId; title: string; blurb: string }[] }) {
  return (
    <div className={classes.ceRecipeList}>
      <div className={classes.ceHintText}>
        What kind of rule is it? You can rewrite it as a structure afterwards.
      </div>
      {recipes.map((r) => (
        <button
          key={r.id}
          type="button"
          className={classes.ceRecipeBtn}
          onClick={() => store().pickRecipe(r.id)}
        >
          <div className={classes.ceRecipeName}>{r.title}</div>
          <div className={classes.ceRecipeBlurb}>{r.blurb}</div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sentence face.
// ---------------------------------------------------------------------------

function SentenceFace({ vm }: { vm: ReturnType<typeof constraintEditorView> }) {
  if (vm.sentenceReadOnly) {
    return (
      <>
        <div className={classes.ceReadOnlySentence}>{vm.readOnlyText || "New constraint."}</div>
        <div className={classes.ceHintText}>
          This constraint is shaped in the structure view. Open “Edit as structure” below.
        </div>
        <LintStrip vm={vm} />
      </>
    );
  }

  return (
    <>
      <div className={classes.ceSentence}>
        {vm.tokens.map((token, i) => (
          <TokenView key={`${token.kind}-${i}`} token={token} />
        ))}
      </div>

      {vm.armedSlot && (
        <div className={classes.ceSlotHelper}>
          <span className={classes.ceSlotHelperText}>Pick what goes here:</span>
          <select
            className={classes.select}
            value=""
            onChange={(e) => {
              if (e.currentTarget.value)
                store().setSlot(vm.armedSlot!.slotId, e.currentTarget.value);
            }}
          >
            <option value="">Choose…</option>
            {vm.armedSlot.groups.map((group) => (
              <RefGroupOptions key={group.label} group={group} />
            ))}
          </select>
        </div>
      )}

      <ClauseChips vm={vm} />
      <LintStrip vm={vm} />
    </>
  );
}

function TokenView({ token }: { token: SentenceToken }) {
  if (token.kind === "text") return <span className={classes.ceTokenText}>{token.text}</span>;

  if (token.kind === "number") {
    return (
      <input
        type="text"
        className={classes.ceNum}
        value={token.value}
        aria-label="value"
        onChange={(e) => store().setSlot(token.slotId, e.currentTarget.value)}
      />
    );
  }

  if (token.kind === "bound") {
    return (
      <span className={classes.seg}>
        {(["max", "min"] as const).map((b) => (
          <button
            key={b}
            type="button"
            className={`${classes.segOpt} ${token.value === b ? classes.segOptOn : ""}`}
            onClick={() => store().setSlot(token.slotId, b)}
          >
            {b === "max" ? "At most" : "At least"}
          </button>
        ))}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${classes.ceChip} ${token.filled ? "" : classes.ceChipEmpty} ${
        token.armed ? classes.ceChipArmed : ""
      }`}
      onClick={() => store().armSlot(token.armed ? null : token.slotId)}
    >
      {token.label}
    </button>
  );
}

function RefGroupOptions({ group }: { group: RefOptionGroup }) {
  if (!group.label) {
    return (
      <>
        {group.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </>
    );
  }
  return (
    <optgroup label={group.label}>
      {group.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </optgroup>
  );
}

// ---------------------------------------------------------------------------
// Clauses.
// ---------------------------------------------------------------------------

const DEFAULT_WHEN: Condition = {
  op: "compare",
  left: { op: "count", selector: { type: "all" } },
  cmp: "gte",
  right: { op: "constant", value: 1 },
};

function ClauseChips({ vm }: { vm: ReturnType<typeof constraintEditorView> }) {
  const { clauses } = vm;
  const [overridesOpen, setOverridesOpen] = useState(clauses.overrides.length > 0);

  return (
    <>
      <div className={classes.ceClauseRow}>
        <button
          type="button"
          className={`${classes.ceClauseChip} ${clauses.when ? classes.ceClauseChipOn : ""}`}
          onClick={() => store().setDecorations({ when: clauses.when ? undefined : DEFAULT_WHEN })}
        >
          only when…
        </button>
        <button
          type="button"
          className={`${classes.ceClauseChip} ${clauses.perPartitionKey ? classes.ceClauseChipOn : ""}`}
          onClick={() =>
            store().setDecorations({
              perPartition: clauses.perPartitionKey ? undefined : { key: { type: "nodeDefId" } },
            })
          }
        >
          for each…
        </button>
        <button
          type="button"
          className={`${classes.ceClauseChip} ${overridesOpen ? classes.ceClauseChipOn : ""}`}
          disabled={clauses.siblings.length === 0}
          onClick={() => {
            const next = !overridesOpen;
            setOverridesOpen(next);
            if (!next && clauses.overrides.length > 0) store().setDecorations({ overrides: [] });
          }}
        >
          overrides…
        </button>
        <button
          type="button"
          className={`${classes.ceClauseChip} ${clauses.message ? classes.ceClauseChipOn : ""}`}
          onClick={() =>
            store().setDecorations({ message: clauses.message ? undefined : emptyDoc() })
          }
        >
          message
        </button>
        <span className={classes.seg}>
          {(["error", "warning"] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              className={`${classes.segOpt} ${clauses.severity === sev ? classes.segOptOn : ""}`}
              onClick={() => store().setDecorations({ severity: sev })}
            >
              {sev}
            </button>
          ))}
        </span>
      </div>

      {clauses.when && <WhenEditor when={clauses.when} groups={clauses.refGroups} />}
      {clauses.perPartitionKey && <PerPartitionEditor clauses={clauses} />}
      {overridesOpen && clauses.siblings.length > 0 && (
        <OverridesEditor selected={clauses.overrides} siblings={clauses.siblings} />
      )}
      {clauses.message && <MessageEditor doc={clauses.message} />}
    </>
  );
}

function WhenEditor({ when, groups }: { when: Condition; groups: RefOptionGroup[] }) {
  const parsed = parseCompareCount(when);
  const patch = (next: { selector?: Selector; cmp?: Cmp; value?: number }) => {
    const base = parsed ?? { selector: { type: "all" } as Selector, cmp: "gte" as Cmp, value: 1 };
    store().setDecorations({
      when: {
        op: "compare",
        left: { op: "count", selector: next.selector ?? base.selector },
        cmp: next.cmp ?? base.cmp,
        right: { op: "constant", value: next.value ?? base.value },
      },
    });
  };

  return (
    <div className={classes.ceSubEditor}>
      <div className={classes.ceSubEditorHead}>
        <span className={classes.ceSubEditorLabel}>Only when</span>
        <button
          type="button"
          className={classes.ceIconBtn}
          aria-label="Remove clause"
          onClick={() => store().setDecorations({ when: undefined })}
        >
          ✕
        </button>
      </div>
      {parsed ? (
        <div className={classes.ceInlineRow}>
          <span className={classes.ceTokenText}>the number of</span>
          <select
            className={classes.select}
            value={slotFromSelector(parsed.selector) ?? ""}
            onChange={(e) => patch({ selector: selectorFromSlot(e.currentTarget.value) })}
          >
            {groups
              .flatMap((g) => g.options)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <select
            className={classes.select}
            value={parsed.cmp}
            onChange={(e) => patch({ cmp: e.currentTarget.value as Cmp })}
          >
            {CMP_ENTRIES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            className={classes.ceInlineNum}
            value={String(parsed.value)}
            onChange={(e) => patch({ value: Number(e.currentTarget.value) || 0 })}
          />
        </div>
      ) : (
        <div className={classes.ceHintText}>
          This gate is more than a simple count — edit it in the structure view.
        </div>
      )}
      <div className={classes.ceHintText}>
        Checked before the rule. If it does not hold, the rule is inactive.
      </div>
    </div>
  );
}

function PerPartitionEditor({ clauses }: { clauses: ClauseOptions }) {
  const value = clauses.perPartitionKey;
  const fields = clauses.partitionFields;
  const expectedKeys = clauses.expectedKeys;
  if (!value) return null;
  const kind = value.type;

  /** Rewrite `perPartition`, carrying the checkbox state (on ⇒ keep an array, off ⇒ undefined). */
  const setKey = (key: PartitionKeySpec) =>
    store().setDecorations({
      perPartition: { key, expectedKeys: expectedKeys === undefined ? undefined : [] },
    });
  const setExpected = (next: string[] | undefined) =>
    store().setDecorations({ perPartition: { key: value, expectedKeys: next } });

  return (
    <div className={classes.ceSubEditor}>
      <div className={classes.ceSubEditorHead}>
        <span className={classes.ceSubEditorLabel}>Separately for each</span>
        <button
          type="button"
          className={classes.ceIconBtn}
          aria-label="Remove clause"
          onClick={() => store().setDecorations({ perPartition: undefined })}
        >
          ✕
        </button>
      </div>
      <div className={classes.ceInlineRow}>
        <select
          className={classes.select}
          value={kind}
          onChange={(e) => {
            const t = e.currentTarget.value;
            setKey(
              t === "field"
                ? { type: "field", fieldId: fields[0]?.id ?? "" }
                : { type: t as "nodeDefId" | "nodeCategory" },
            );
          }}
        >
          <option value="nodeDefId">node type</option>
          <option value="nodeCategory">category</option>
          <option value="field">value of a field</option>
        </select>
        {kind === "field" && (
          <select
            className={classes.select}
            value={value.type === "field" ? value.fieldId : ""}
            onChange={(e) => setKey({ type: "field", fieldId: e.currentTarget.value })}
          >
            {fields.length === 0 && <option value="">no fields</option>}
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className={classes.checkboxLabel}>
        <input
          type="checkbox"
          checked={expectedKeys !== undefined}
          onChange={(e) => setExpected(e.currentTarget.checked ? [] : undefined)}
        />
        <span>Check buckets nothing landed in — the only way a bucket can be capped at zero.</span>
      </label>

      {expectedKeys !== undefined && (
        <div className={classes.tagList}>
          {clauses.expectedKeyChips.map((chip) => (
            <span key={chip.value} className={classes.valueTag}>
              {chip.label}
              <button
                type="button"
                className={classes.valueTagRemove}
                aria-label={`Remove ${chip.label}`}
                onClick={() => setExpected(expectedKeys.filter((v) => v !== chip.value))}
              >
                ×
              </button>
            </span>
          ))}
          {clauses.expectedKeyOptions.length > 0 && (
            <select
              className={classes.select}
              value=""
              onChange={(e) => {
                if (e.currentTarget.value) setExpected([...expectedKeys, e.currentTarget.value]);
              }}
            >
              <option value="">add a bucket…</option>
              {clauses.expectedKeyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {clauses.expectedKeyFreeform && (
            <input
              type="text"
              className={classes.addValueInput}
              placeholder="add a bucket…"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = e.currentTarget.value.trim();
                if (v && !expectedKeys.includes(v)) setExpected([...expectedKeys, v]);
                e.currentTarget.value = "";
              }}
            />
          )}
        </div>
      )}

      <div className={classes.ceHintText}>The rule runs once per bucket.</div>
    </div>
  );
}

function OverridesEditor({
  selected,
  siblings,
}: {
  selected: string[];
  siblings: { id: string; text: string; severity: string }[];
}) {
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    store().setDecorations({ overrides: next });
  };
  return (
    <div className={classes.ceSubEditor}>
      <div className={classes.ceSubEditorHead}>
        <span className={classes.ceSubEditorLabel}>This one supersedes</span>
      </div>
      {siblings.map((s) => (
        <label key={s.id} className={classes.checkboxLabel}>
          <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
          <span>
            {s.text} <span className={classes.ceInheritedSev}>{s.severity}</span>
          </span>
        </label>
      ))}
      <div className={classes.ceHintText}>Only reaches constraints inside this subtree.</div>
    </div>
  );
}

function MessageEditor({ doc }: { doc: JSONContent }) {
  return (
    <div className={classes.ceSubEditor}>
      <div className={classes.ceSubEditorHead}>
        <span className={classes.ceSubEditorLabel}>What the player is told</span>
        <button
          type="button"
          className={classes.ceIconBtn}
          aria-label="Remove clause"
          onClick={() => store().setDecorations({ message: undefined })}
        >
          ✕
        </button>
      </div>
      <textarea
        className={classes.textareaInput}
        rows={2}
        value={docToText(doc)}
        onChange={(e) => {
          const text = e.currentTarget.value;
          store().setDecorations({ message: text.trim() ? textToDoc(text) : emptyDoc() });
        }}
      />
    </div>
  );
}

function LintStrip({ vm }: { vm: ReturnType<typeof constraintEditorView> }) {
  if (vm.blockingReasons.length === 0 && vm.lint.length === 0) return null;
  return (
    <div className={classes.ceLintStrip}>
      {vm.blockingReasons.map((reason) => (
        <div key={reason} className={classes.ceLintWarn}>
          {reason}
        </div>
      ))}
      {vm.lint.map((issue) => (
        <div
          key={issue.code + issue.message}
          className={issue.severity === "error" ? classes.ceLintError : classes.ceLintWarn}
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree face.
// ---------------------------------------------------------------------------

function TreeFace({ vm }: { vm: ReturnType<typeof constraintEditorView> }) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const parentOf = (path: (string | number)[]) => path.slice(0, -2).join(".");
  const endDrag = () => {
    setDragKey(null);
    setOverKey(null);
  };
  const drop = () => {
    const from = vm.treeRows.find((r) => r.path.join(".") === dragKey);
    const to = vm.treeRows.find((r) => r.path.join(".") === overKey);
    endDrag();
    if (!from || !to || from === to) return;
    if (parentOf(from.path) !== parentOf(to.path)) return;
    store().applyTreeTransform({
      type: "reorderOperand",
      path: from.path.slice(0, -1),
      from: Number(from.path.at(-1)),
      to: Number(to.path.at(-1)),
    });
  };
  const nudge = (row: TreeRow, delta: number) => {
    const index = Number(row.path.at(-1));
    store().applyTreeTransform({
      type: "reorderOperand",
      path: row.path.slice(0, -1),
      from: index,
      to: index + delta,
    });
  };

  return (
    <div className={classes.ceTree}>
      {!vm.hasWhenBranch && (
        <button type="button" className={classes.dashBtn} onClick={() => store().addWhenBranch()}>
          + only when
        </button>
      )}
      {vm.treeRows.map((row) => {
        const key = row.path.join(".");
        return (
          <TreeRowView
            key={key}
            row={row}
            vm={vm}
            dropBefore={overKey === key && dragKey !== null && dragKey !== key}
            onDragStart={() => setDragKey(key)}
            onDragEnd={endDrag}
            onDragOver={() => setOverKey(key)}
            onDrop={drop}
            onNudge={(delta) => nudge(row, delta)}
          />
        );
      })}
    </div>
  );
}

interface TreeRowViewProps {
  row: TreeRow;
  vm: ReturnType<typeof constraintEditorView>;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onNudge: (delta: number) => void;
}

function TreeRowView({
  row,
  vm,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onNudge,
}: TreeRowViewProps) {
  const isWhenRoot = row.depth === 0 && row.path[0] === "when";
  return (
    <div
      onDragOver={(e) => {
        if (row.reorderable) {
          e.preventDefault();
          onDragOver();
        }
      }}
      onDrop={(e) => {
        e.stopPropagation();
        onDrop();
      }}
    >
      {row.label && <div className={classes.ceTreeLabel}>{row.label}</div>}
      <div
        className={`${classes.ceTreeRow} ${dropBefore ? classes.ceTreeRowOver : ""}`}
        style={{ marginLeft: row.depth * 16 }}
      >
        {row.reorderable && (
          <button
            type="button"
            className={classes.dragHandleBtn}
            draggable
            aria-label="Reorder (drag, or arrow keys)"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", row.path.join("."));
              e.dataTransfer.effectAllowed = "move";
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                onNudge(-1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                onNudge(1);
              }
            }}
          >
            ⠿
          </button>
        )}
        <select
          className={classes.ceTreeOp}
          value={row.op}
          onChange={(e) =>
            store().applyTreeTransform({ type: "setOp", path: row.path, op: e.currentTarget.value })
          }
        >
          {row.opOptions.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <div className={classes.ceTreeArg}>
          {row.args.map((arg, i) => (
            <ArgEditor key={`${arg.kind}-${i}`} path={row.path} index={i} arg={arg} vm={vm} />
          ))}
        </div>
        <select
          className={classes.ceMiniBtn}
          value=""
          title={row.depth === 0 ? "Wrap the whole thing" : "Wrap this in an operator"}
          onChange={(e) => {
            if (e.currentTarget.value) {
              store().applyTreeTransform({
                type: "wrap",
                path: row.path,
                op: e.currentTarget.value,
              });
            }
          }}
        >
          <option value="">wrap…</option>
          {row.opOptions.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        {row.canAddOperand && (
          <button
            type="button"
            className={classes.ceMiniBtn}
            onClick={() => store().applyTreeTransform({ type: "addOperand", path: row.path })}
          >
            + operand
          </button>
        )}
        {isWhenRoot ? (
          <button
            type="button"
            className={classes.ceMiniBtn}
            title="Remove the gate"
            onClick={() => store().removeWhenBranch()}
          >
            ✕
          </button>
        ) : (
          row.depth > 0 && (
            <button
              type="button"
              className={classes.ceMiniBtn}
              title="Replace with its first operand"
              onClick={() => store().applyTreeTransform({ type: "unwrap", path: row.path })}
            >
              ✕
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ArgEditor({
  path,
  index,
  arg,
  vm,
}: {
  path: (string | number)[];
  index: number;
  arg: ArgSpec;
  vm: ReturnType<typeof constraintEditorView>;
}) {
  const set = (next: ArgSpec) =>
    store().applyTreeTransform({ type: "setArg", path, index, arg: next });

  switch (arg.kind) {
    case "selector": {
      const slot = slotFromSelector(arg.selector);
      if (slot === null) return <span className={classes.ceHintText}>(complex selector)</span>;
      return (
        <select
          className={classes.select}
          value={slot}
          onChange={(e) =>
            set({ kind: "selector", selector: selectorFromSlot(e.currentTarget.value) })
          }
        >
          {vm.clauses.refGroups
            .flatMap((g) => g.options)
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </select>
      );
    }
    case "number":
      return (
        <input
          type="text"
          className={classes.ceInlineNum}
          value={String(arg.value)}
          onChange={(e) => set({ kind: "number", value: Number(e.currentTarget.value) || 0 })}
        />
      );
    case "resource":
      return (
        <select
          className={classes.select}
          value={arg.resourceId}
          onChange={(e) => set({ kind: "resource", resourceId: e.currentTarget.value })}
        >
          <option value="">resource…</option>
          {(vm.clauses.refGroups.find((g) => g.label === "Resources")?.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "field":
      return (
        <select
          className={classes.select}
          value={arg.fieldId}
          onChange={(e) => set({ kind: "field", fieldId: e.currentTarget.value })}
        >
          <option value="">field…</option>
          {vm.clauses.partitionFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      );
    case "cmp":
      return (
        <select
          className={classes.select}
          value={arg.cmp}
          onChange={(e) => set({ kind: "cmp", cmp: e.currentTarget.value as Cmp })}
        >
          {CMP_ENTRIES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );
    case "step":
      return (
        <input
          type="text"
          className={classes.ceInlineNum}
          value={String(arg.step)}
          onChange={(e) => set({ kind: "step", step: Number(e.currentTarget.value) || 1 })}
        />
      );
    case "numbers":
      return (
        <input
          type="text"
          className={classes.select}
          value={arg.values.join(", ")}
          onChange={(e) =>
            set({
              kind: "numbers",
              values: e.currentTarget.value
                .split(",")
                .map((n) => Number(n.trim()))
                .filter((n) => Number.isFinite(n)),
            })
          }
        />
      );
    case "partitionKey":
      return (
        <select
          className={classes.select}
          value={arg.key.type}
          onChange={(e) => {
            const t = e.currentTarget.value;
            set({
              kind: "partitionKey",
              key:
                t === "field"
                  ? { type: "field", fieldId: vm.clauses.partitionFields[0]?.id ?? "" }
                  : { type: t as "nodeDefId" | "nodeCategory" },
            });
          }}
        >
          <option value="nodeDefId">node type</option>
          <option value="nodeCategory">category</option>
          <option value="field">field value</option>
        </select>
      );
    case "nRange":
      return (
        <>
          <input
            type="text"
            className={classes.ceInlineNum}
            placeholder="min"
            value={arg.min ?? ""}
            onChange={(e) =>
              set({
                kind: "nRange",
                min: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value),
                max: arg.max,
              })
            }
          />
          <input
            type="text"
            className={classes.ceInlineNum}
            placeholder="max"
            value={arg.max ?? ""}
            onChange={(e) =>
              set({
                kind: "nRange",
                min: arg.min,
                max: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value),
              })
            }
          />
        </>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function parseCompareCount(
  cond: Condition,
): { selector: Selector; cmp: Cmp; value: number } | null {
  if (cond.op !== "compare" || cond.left.op !== "count") return null;
  const value = cond.right.op === "constant" ? cond.right.value : 0;
  return { selector: cond.left.selector, cmp: cond.cmp, value };
}

function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function textToDoc(text: string): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function docToText(doc: JSONContent): string {
  const paragraph = (doc.content ?? []).find((n) => n.type === "paragraph");
  return (paragraph?.content ?? [])
    .filter((n) => n.type === "text")
    .map((n) => n.text ?? "")
    .join("");
}
