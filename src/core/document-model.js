// src/core/document-model.js

/**
 * DocumentModel:
 *  blocks: Array<Block>
 *
 * Block:
 *  - { type: "heading", level: 1..6, inlines: Inline[] }
 *  - { type: "paragraph", inlines: Inline[] }
 *  - { type: "list", ordered: boolean, items: ListItem[] }
 *
 * ListItem:
 *  - { inlines: Inline[] }
 *
 * Inline:
 *  - { type: "text", text: string, bold?: boolean, italic?: boolean, code?: boolean }
 */

function textInline(text, marks) {
    return { type: "text", text: text ?? "", ...(marks || {}) };
}

module.exports = {
    textInline,
};
