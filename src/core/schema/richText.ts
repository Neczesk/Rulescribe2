import type { JSONContent } from "@tiptap/core";
import * as z from "zod";

/**
 * A TipTap document, stored verbatim as the editor's `JSONContent`. Kept in its
 * own module (rather than in `./ruleset`) so schema files that both `./ruleset`
 * imports *and* need rich text — e.g. `./listBuilding` — can depend on it
 * without a circular import.
 */

const isDoc = (val: unknown): val is JSONContent =>
  typeof val === "object" && val !== null && (val as JSONContent).type === "doc";

export const richText = z.custom<JSONContent>(isDoc, {
  error: 'Expected a TipTap document (a "doc" node)', // on Zod 3 this key is `message`
});

export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export type RichText = z.infer<typeof richText>; // resolves to exactly JSONContent
