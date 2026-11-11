import type { CommandProps } from '@tiptap/core';

// Tables in the article body editor (2026-11-12 user report: a table could not grow or shrink). The Table menu in its
// toolbar runs TableKit's row and column commands on the table the cursor is in; this keeps the result a table
// Markdown can hold.

/**
 * A Markdown table has one header row, its first: after a row goes in or out above it, the table the cursor is in has
 * header cells in its first row and body cells in the rest, so the editor shows what the Markdown keeps.
 */
export function headerRowFirst({ tr }: CommandProps) {
  const { $from } = tr.selection;
  const { tableHeader, tableCell } = tr.doc.type.schema.nodes;
  for (let depth = $from.depth; depth > 0; depth--) {
    const table = $from.node(depth);
    if (table.type.name !== 'table') continue;
    let row = $from.before(depth) + 1;
    table.forEach((node, _offset, index) => {
      let cell = row + 1;
      node.forEach((c) => {
        const type = index === 0 ? tableHeader : tableCell;
        if (type && c.type !== type)
          tr.setNodeMarkup(cell, type, c.attrs, c.marks);
        cell += c.nodeSize;
      });
      row += node.nodeSize;
    });
    break;
  }
  return true;
}
