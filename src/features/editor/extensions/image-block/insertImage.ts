import type { EditorView } from "@tiptap/pm/view";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { saveImageBlob } from "../../../../core/storage/imageStorage";
import { shortId } from "../../../../util/nanoid";
import type { ImageBlockAttributes } from "./ImageBlock";

const DEFAULT_WIDTH = 480;
const FALLBACK_SIZE = { width: 400, height: 300 };

/** Decode a file's natural dimensions; falls back gracefully (e.g. HEIC). */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const done = (size: { width: number; height: number }) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => done(FALLBACK_SIZE);
    image.src = url;
  });
}

/**
 * Save a file's bytes to the blob store, register its metadata in the
 * ruleset's image registry, and return the attrs an `imageBlock` node should
 * be inserted with. Shared by the toolbar button and paste/drop handling so
 * both routes stay in sync.
 */
export async function prepareImageInsert(file: File): Promise<ImageBlockAttributes> {
  const { width, height } = await readImageDimensions(file);
  const id = shortId();
  await saveImageBlob(id, file);
  currentRulesetStore.getState().addImage({
    id,
    mimeType: file.type,
    width: width || FALLBACK_SIZE.width,
    height: height || FALLBACK_SIZE.height,
    filename: file.name,
  });
  return {
    imageId: id,
    width: Math.min(width || FALLBACK_SIZE.width, DEFAULT_WIDTH),
    wrap: "none",
    alt: "",
  };
}

/** Insert an `imageBlock` node directly via the ProseMirror view — used where
 * no `Editor` instance is available yet (e.g. inside `editorProps.handlePaste`/
 * `handleDrop`, which fire before `useEditor` returns). */
export function insertImageBlockAtSelection(view: EditorView, attrs: ImageBlockAttributes): void {
  const { state, dispatch } = view;
  const node = state.schema.nodes.imageBlock.create(attrs);
  dispatch(state.tr.replaceSelectionWith(node));
}
