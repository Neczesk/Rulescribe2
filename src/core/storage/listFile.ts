import { shortId } from "../../util/nanoid";
import { slugify } from "../../util/slug";
import { list, type List } from "../schema/list";
import { loadList } from "./listStorage";

/**
 * A list is a single JSON document — no image blobs, no Dayjs — so unlike the
 * ruleset bundle it needs no zip and no `serialize*` step: `List` is already
 * structured-clone/JSON safe.
 */
export function downloadList(l: List): void {
  const blob = new Blob([JSON.stringify(l, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(l.name || "list")}.rulescribe-list.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a user-picked list file. Throws a friendly Error on bad input. If the
 * file's id collides with a *different* stored list, a fresh id is minted so
 * the import lands as a new entry rather than overwriting.
 */
export async function readListFile(file: File): Promise<List> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const parsed = list.safeParse(json);
  if (!parsed.success) {
    throw new Error("That file isn't a Rulescribe list.");
  }

  let imported = parsed.data;
  const existing = await loadList(imported.id);
  if (existing) {
    imported = { ...imported, id: shortId() };
  }
  return imported;
}
