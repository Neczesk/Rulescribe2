import { shortId } from "../../util/nanoid";
import { slugify } from "../../util/slug";
import { ruleset, type Ruleset } from "../schema/ruleset";
import { loadImageBlob, saveImageBlob } from "./imageStorage";
import { migrate } from "./rulesetMigrate";
import { loadRuleset, serializeRuleset } from "./rulesetStorage";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "bin";
}

/**
 * Trigger a download of the ruleset as a zip bundle: `ruleset.json` plus an
 * `images/` folder of the raw bytes for every image still resolvable in the
 * blob store. A registry entry whose blob is missing is skipped silently —
 * the imported copy will just show the existing "image unavailable" fallback.
 *
 * JSZip is dynamically imported so it never lands in the app shell's eager
 * chunk — `readRulesetFile` below is reached from `app/MainMenu.tsx` as well
 * as the editor feature, and neither should pay for it until a file is
 * actually opened/downloaded.
 */
export async function downloadRuleset(rs: Ruleset): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("ruleset.json", JSON.stringify(serializeRuleset(rs), null, 2));

  const images = zip.folder("images")!;
  for (const asset of Object.values(rs.registry.images)) {
    const blob = await loadImageBlob(asset.id);
    if (!blob) continue;
    images.file(`${asset.id}.${extensionForMime(asset.mimeType)}`, blob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(rs.metadata.title)}.rulescribe.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a user-picked ruleset bundle (zip) into a Ruleset, restoring its
 * images into the blob store. Throws a friendly Error on bad input.
 * If the file's id collides with a *different* stored ruleset, a fresh id is
 * minted so the import lands as a new library entry rather than overwriting.
 *
 * Tolerant of mismatches between the registry and the zip's `images/` folder
 * in either direction — an image with no matching file (or vice versa) is
 * left as-is rather than repaired; the editor's broken-image placeholder
 * handles the gap at render time.
 */
export async function readRulesetFile(file: File): Promise<Ruleset> {
  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("That file isn't a Rulescribe ruleset bundle.");
  }

  const rulesetEntry = zip.file("ruleset.json");
  if (!rulesetEntry) {
    throw new Error("That file isn't a Rulescribe ruleset bundle.");
  }

  let json: unknown;
  try {
    json = JSON.parse(await rulesetEntry.async("string"));
  } catch {
    throw new Error("That file's ruleset.json isn't valid JSON.");
  }

  // Run forward-migrations too — an exported bundle can be on an older schema
  // version, and pure Zod defaults don't cover the transform migrations.
  const parsed = ruleset.safeParse(migrate(json));
  if (!parsed.success) {
    throw new Error("That file isn't a Rulescribe ruleset.");
  }

  let rs = parsed.data;
  const existing = await loadRuleset(rs.metadata.id);
  if (existing) {
    rs = { ...rs, metadata: { ...rs.metadata, id: shortId() } };
  }

  const imagesFolder = zip.folder("images");
  if (imagesFolder) {
    const entries = imagesFolder.file(/.*/);
    for (const entry of entries) {
      const basename = entry.name.split("/").pop() ?? entry.name;
      const id = basename.replace(/\.[^.]+$/, "");
      const blob = await entry.async("blob");
      await saveImageBlob(id, blob);
    }
  }

  return rs;
}
