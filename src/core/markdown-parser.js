// src/core/markdown-parser.js

const { textInline } = require("./document-model");

function normalizeNewlines(md) {
    return (md || "").replace(/\r\n/g, "\n");
}

function stripObsidianLinks(s) {
    return s
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function stripMarkdownLinks(s) {
    return s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function unescapeBackslash(s) {
    return s.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
}

function cleanupText(s) {
    let out = s ?? "";
    out = stripObsidianLinks(out);
    out = stripMarkdownLinks(out);
    out = unescapeBackslash(out);
    out = out.replace(/^\s*\[( |x|X)\]\s+/, "");
    out = out.replace(/[ \t]+/g, " ");
    return out;
}

/**
 * Inline парсер: **bold**, *italic* / _italic_, `code`
 */
function parseInlines(line) {
    let s = cleanupText(line);

    const inlines = [];
    let i = 0;

    const pushText = (t, marks) => {
        if (!t) return;
        inlines.push(textInline(t, marks));
    };

    while (i < s.length) {
        // Inline code: `...`
        if (s[i] === "`") {
            const end = s.indexOf("`", i + 1);
            if (end !== -1) {
                pushText(s.slice(i + 1, end), { code: true });
                i = end + 1;
                continue;
            }
        }

        // Bold: **...**
        if (s[i] === "*" && s[i + 1] === "*") {
            const end = s.indexOf("**", i + 2);
            if (end !== -1) {
                pushText(s.slice(i + 2, end), { bold: true });
                i = end + 2;
                continue;
            }
        }

        // Italic: *...*
        if (s[i] === "*" && s[i + 1] !== "*") {
            const end = s.indexOf("*", i + 1);
            if (end !== -1) {
                pushText(s.slice(i + 1, end), { italic: true });
                i = end + 1;
                continue;
            }
        }

        // Italic: _..._
        if (s[i] === "_") {
            const end = s.indexOf("_", i + 1);
            if (end !== -1) {
                pushText(s.slice(i + 1, end), { italic: true });
                i = end + 1;
                continue;
            }
        }

        // обычный текст
        const nextCandidates = [
            s.indexOf("`", i),
            s.indexOf("**", i),
            s.indexOf("*", i),
            s.indexOf("_", i),
        ].filter((x) => x !== -1);

        const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;

        if (next === -1) {
            pushText(s.slice(i), {});
            break;
        }

        if (next > i) {
            pushText(s.slice(i, next), {});
            i = next;
        } else {
            pushText(s[i], {});
            i += 1;
        }
    }

    // merge adjacent runs with same marks
    const merged = [];
    for (const t of inlines) {
        const last = merged[merged.length - 1];
        if (
            last &&
            last.type === "text" &&
            t.type === "text" &&
            !!last.bold === !!t.bold &&
            !!last.italic === !!t.italic &&
            !!last.code === !!t.code
        ) {
            last.text += t.text;
        } else {
            merged.push({ ...t });
        }
    }

    return merged.filter((x) => (x.text ?? "").length > 0);
}

function isHeading(line) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!m) return null;
    return { level: m[1].length, text: m[2] };
}

function isUlItem(line) {
    const m = /^(\s*)[-*+]\s+(.+)$/.exec(line);
    if (!m) return null;
    return { indent: m[1].length, text: m[2] };
}

function isOlItem(line) {
    const m = /^(\s*)\d+\.\s+(.+)$/.exec(line);
    if (!m) return null;
    return { indent: m[1].length, text: m[2] };
}

function isFenceStart(line) {
    const m = /^\s*```([\w+-]*)\s*$/.exec(line);
    if (!m) return null;
    return { lang: (m[1] || "").trim() };
}

function isFenceEnd(line) {
    return /^\s*```\s*$/.test(line);
}

function isPageBreak(line) {
    return /^\s*---\s*$/.test(line);
}

function parseImageLine(line) {
    // Obsidian embed: ![[path|alt]]
    let m = /^\s*!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/.exec(line);
    if (m) return { src: m[1].trim(), alt: (m[2] || "").trim() };

    // Markdown: ![alt](path)
    m = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (m) return { src: m[2].trim(), alt: (m[1] || "").trim() };

    return null;
}

function splitTableRow(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return null;
    const core = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const parts = core.split("|").map((x) => x.trim());
    return parts;
}

function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return false;
    const parts = splitTableRow(trimmed);
    if (!parts) return false;
    return parts.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseMarkdownToModel(markdown) {
    const md = normalizeNewlines(markdown);
    const lines = md.split("\n");

    const blocks = [];
    let i = 0;

    const flushParagraph = (buf) => {
        const text = buf.join(" ").trim();
        if (!text) return;
        blocks.push({ type: "paragraph", inlines: parseInlines(text) });
    };

    while (i < lines.length) {
        const raw = lines[i];
        const line = raw.trimEnd();

        if (line.trim() === "") {
            i += 1;
            continue;
        }

        // page break by ---
        if (isPageBreak(line)) {
            blocks.push({ type: "pageBreak" });
            i += 1;
            continue;
        }

        // image line
        const img = parseImageLine(line);
        if (img) {
            blocks.push({ type: "image", src: img.src, alt: img.alt || "" });
            i += 1;
            continue;
        }

        // fenced code block
        const fence = isFenceStart(line);
        if (fence) {
            i += 1;
            const codeLines = [];
            while (i < lines.length && !isFenceEnd(lines[i])) {
                codeLines.push(lines[i].replace(/\r$/, ""));
                i += 1;
            }
            if (i < lines.length && isFenceEnd(lines[i])) i += 1;

            blocks.push({ type: "codeBlock", lang: fence.lang, lines: codeLines });
            continue;
        }

        // table
        if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const header = splitTableRow(line);
            if (header) {
                i += 2;
                const rows = [];
                rows.push(header);

                while (i < lines.length) {
                    const r = lines[i].trimEnd();
                    if (r.trim() === "") break;
                    if (!r.includes("|")) break;

                    const parts = splitTableRow(r);
                    if (!parts) break;
                    rows.push(parts);
                    i += 1;
                }

                const table = rows.map((row) => row.map((cell) => parseInlines(cell)));
                blocks.push({ type: "table", rows: table });
                continue;
            }
        }

        // heading
        const h = isHeading(line.trim());
        if (h) {
            blocks.push({ type: "heading", level: h.level, inlines: parseInlines(h.text) });
            i += 1;
            continue;
        }

        // list
        const ul = isUlItem(line);
        const ol = isOlItem(line);
        if (ul || ol) {
            const ordered = !!ol;
            const items = [];
            while (i < lines.length) {
                const cur = lines[i].trimEnd();
                if (cur.trim() === "") break;
                if (isPageBreak(cur)) break;
                const curUl = isUlItem(cur);
                const curOl = isOlItem(cur);
                if (ordered && !curOl) break;
                if (!ordered && !curUl) break;

                const txt = ordered ? curOl.text : curUl.text;
                items.push({ inlines: parseInlines(txt) });
                i += 1;
            }
            blocks.push({ type: "list", ordered, items });
            continue;
        }

        // paragraph
        const buf = [];
        while (i < lines.length) {
            const cur = lines[i].trimEnd();
            if (cur.trim() === "") break;
            if (isPageBreak(cur)) break;
            if (parseImageLine(cur)) break;
            if (isFenceStart(cur)) break;
            if (isHeading(cur.trim())) break;
            if (isUlItem(cur) || isOlItem(cur)) break;
            if (cur.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;

            buf.push(cur.trim());
            i += 1;
        }
        flushParagraph(buf);
    }

    return { blocks };
}

module.exports = {
    parseMarkdownToModel,
    parseInlines,
};
