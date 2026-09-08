import type { JSONContent } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";

export const tableExtensions = [
  Table.configure({ resizable: false, HTMLAttributes: { class: "table" } }),
  TableRow,
  TableHeader,
  TableCell,
];

const cell = (type: "tableHeader" | "tableCell", text?: string): JSONContent => ({
  type,
  content: [
    text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" },
  ],
});

export function createTableContent(rows: number, cols: number): JSONContent {
  return {
    type: "table",
    content: Array.from({ length: rows }, (_, row) => ({
      type: "tableRow",
      content: Array.from({ length: cols }, (_, col) =>
        row === 0 ? cell("tableHeader", `Column ${col + 1}`) : cell("tableCell"),
      ),
    })),
  };
}
