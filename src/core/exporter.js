// src/core/exporter.js
//
// docx@9.5.1 compatible
// exportActiveNoteToDocx(plugin, preset, options)
// options:
//  - ignorePageBreaks: boolean
//  - enablePagination: boolean
//  - includeToc: boolean  (TOC page BEFORE first content, separate page)

const path = require("path");
const { normalizePath } = require("obsidian");
const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    ImageRun,
    PageNumber,
    TableOfContents,
    Header,
    Footer,
} = require("docx");

const { mmToTwips, cmToTwips, ptToHalfPoints } = require("../utils/units");
const { parseMarkdownToModel } = require("./markdown-parser");

function ensureError(code, message, extra) {
    const err = new Error(message || code);
    err.code = code;
    if (extra && typeof extra === "object") Object.assign(err, extra);
    return err;
}

function joinVaultPath(...parts) {
    return normalizePath(path.posix.join(...parts.filter(Boolean)));
}

async function ensureFolder(adapter, folderPath) {
    const exists = await adapter.exists(folderPath);
    if (!exists) await adapter.mkdir(folderPath);
}

function alignmentFrom(alignment) {
    switch (alignment) {
        case "left":
            return AlignmentType.LEFT;
        case "right":
            return AlignmentType.RIGHT;
        case "center":
            return AlignmentType.CENTER;
        case "justify":
        default:
            return AlignmentType.JUSTIFIED;
    }
}

function applyFileNameTemplate(template, title) {
    const safeTitle = (title || "Untitled")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
        .trim() || "Untitled";

    const t = template && template.trim() ? template.trim() : "{title}.docx";
    const name = t.replaceAll("{title}", safeTitle);
    return name.toLowerCase().endsWith(".docx") ? name : `${name}.docx`;
}

function synthesizeStylesIfMissing(preset) {
    if (preset && !preset.styles) preset.styles = {};

    if (preset && preset.styles && !preset.styles.normal) {
        const baseFont = preset.font || { family: "Times New Roman", sizePt: 14 };
        const basePar = preset.paragraph || {
            alignment: "justify",
            firstLineIndentCm: 1.25,
            spacingBeforePt: 0,
            spacingAfterPt: 0,
            lineSpacing: 1.5,
        };

        preset.styles.normal = {
            font: { ...baseFont },
            paragraph: {
                ...basePar,
                spacingBeforePt: basePar.spacingBeforePt ?? 0,
                spacingAfterPt: basePar.spacingAfterPt ?? 0,
            },
        };
    }

    const s = preset.styles || {};
    const hFallback = s.heading3 || s.heading2 || s.heading1 || s.normal;
    for (let lvl = 1; lvl <= 6; lvl += 1) {
        const key = `heading${lvl}`;
        if (!s[key]) s[key] = hFallback;
    }

    if (!s.tableCaption) s.tableCaption = s.normal;
    if (!s.tableText) s.tableText = s.normal;
    if (!s.tableHeaderText) s.tableHeaderText = s.tableText || s.normal;
    if (!s.figureCaption) s.figureCaption = s.normal;
    if (!s.listingText) s.listingText = s.normal;

    // заголовок "СОДЕРЖАНИЕ"
    if (!s.tocTitle) {
        s.tocTitle = {
            ...(s.heading1 || s.normal),
            paragraph: { ...(s.heading1?.paragraph || s.normal?.paragraph || {}), pageBreakBefore: false },
        };
    }

    preset.styles = s;
}

function getStyle(preset, key, fallbackKey = "normal") {
    const styles = preset?.styles || {};
    return styles[key] || styles[fallbackKey] || {};
}

function paragraphOptionsFromStyle(style) {
    const p = style.paragraph || {};
    const opts = {};

    opts.alignment = alignmentFrom(p.alignment || "justify");

    const indentCm = typeof p.firstLineIndentCm === "number" ? p.firstLineIndentCm : 0;
    if (indentCm > 0) opts.indent = { firstLine: cmToTwips(indentCm) };

    const beforePt = p.spacingBeforePt ?? 0;
    const afterPt = p.spacingAfterPt ?? 0;

    const lineSpacing = p.lineSpacing ?? 1.0;
    const lineTwips = Math.round(240 * lineSpacing);

    opts.spacing = {
        before: Math.round(beforePt * 20),
        after: Math.round(afterPt * 20),
        line: lineTwips,
    };

    if (p.pageBreakBefore) opts.pageBreakBefore = true;
    if (p.keepWithNext) opts.keepNext = true;
    if (p.keepLines) opts.keepLines = true;

    return opts;
}

function runsFromInlines(inlines, style, preset) {
    const baseFont = style.font || preset.font || { family: "Times New Roman", sizePt: 14 };
    const baseFamily = baseFont.family || "Times New Roman";
    const baseSize = ptToHalfPoints(baseFont.sizePt || 14);

    const forceBold = !!baseFont.bold;
    const forceItalic = !!baseFont.italic;
    const allCaps = !!baseFont.allCaps;

    return (inlines || []).map((inl) => {
        const isCode = !!inl.code;

        const run = new TextRun({
            text: inl.text || "",
            font: isCode ? "Courier New" : baseFamily,
            size: isCode ? ptToHalfPoints(Math.max(10, (baseFont.sizePt || 14) - 2)) : baseSize,
            bold: forceBold || !!inl.bold,
            italics: forceItalic || !!inl.italic,
        });

        if (allCaps) run.allCaps = true;
        return run;
    });
}

function paragraphFromInlines(inlines, styleKey, preset, overrides) {
    const style = getStyle(preset, styleKey);
    const pOpts = paragraphOptionsFromStyle(style);

    const merged = { ...pOpts, ...(overrides || {}) };
    if (overrides && overrides.indent === null) delete merged.indent;

    return new Paragraph({
        ...merged,
        children: runsFromInlines(inlines, style, preset),
    });
}

function inlinesToText(inlines) {
    return (inlines || []).map((x) => x.text || "").join("");
}

function isTableCaptionParagraphBlock(block) {
    if (!block || block.type !== "paragraph") return false;
    const t = inlinesToText(block.inlines).trim();
    return /^Таблица\s+\d+([.\d]*)\b/i.test(t);
}

// italics: everything EXCEPT "Таблица N -/—"
function makeTableCaptionParagraphFromText(text, preset) {
    const style = getStyle(preset, "tableCaption", "normal");
    const pOpts = paragraphOptionsFromStyle(style);
    const font = style.font || { family: "Times New Roman", sizePt: 12 };

    const family = font.family || "Times New Roman";
    const size = ptToHalfPoints(font.sizePt || 12);

    const t = (text || "").trim();

    // with dash
    let m = /^(Таблица\s+\d+(?:\.\d+)*\s*[—-]\s*)(.*)$/i.exec(t);
    if (m) {
        const prefix = m[1];
        const rest = m[2] || "";
        return new Paragraph({
            ...pOpts,
            indent: undefined,
            children: [
                new TextRun({ text: prefix, font: family, size, italics: false }),
                new TextRun({ text: rest, font: family, size, italics: true }),
            ],
        });
    }

    // without dash
    m = /^(Таблица\s+\d+(?:\.\d+)*\s+)(.*)$/i.exec(t);
    if (m) {
        const prefix = m[1];
        const rest = m[2] || "";
        return new Paragraph({
            ...pOpts,
            indent: undefined,
            children: [
                new TextRun({ text: prefix, font: family, size, italics: false }),
                new TextRun({ text: rest, font: family, size, italics: true }),
            ],
        });
    }

    return new Paragraph({
        ...pOpts,
        indent: undefined,
        children: [new TextRun({ text: t, font: family, size, italics: true })],
    });
}

function makeTable(block, preset) {
    const rows = block.rows || [];
    if (!rows.length) return null;

    const borders = {
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    };

    const docxRows = rows.map((row, rowIndex) => {
        const styleKey = rowIndex === 0 ? "tableHeaderText" : "tableText";

        const cells = (row || []).map((cellInlines) => {
            const para = paragraphFromInlines(cellInlines, styleKey, preset, {
                indent: null,
                alignment: alignmentFrom(getStyle(preset, styleKey).paragraph?.alignment || "justify"),
            });

            return new TableCell({
                children: [para],
                width: { size: 100, type: WidthType.AUTO },
            });
        });

        return new TableRow({ children: cells });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders,
        rows: docxRows,
    });
}

function fileBaseName(p) {
    const base = path.posix.basename((p || "").replace(/\\/g, "/"));
    return base.replace(/\.[^.]+$/, "");
}

async function resolveImageBinary(plugin, activeFile, src) {
    const adapter = plugin.app.vault.adapter;
    const clean = (src || "").replace(/\\/g, "/");

    const near = activeFile?.parent?.path ? joinVaultPath(activeFile.parent.path, clean) : clean;
    if (await adapter.exists(near)) {
        return { vaultPath: near, data: await adapter.readBinary(near) };
    }

    const abs = joinVaultPath(clean);
    if (await adapter.exists(abs)) {
        return { vaultPath: abs, data: await adapter.readBinary(abs) };
    }

    return null;
}

function makeImageParagraph(imageRun) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [imageRun],
    });
}

/**
 * Builds headers/footers for page numbers for docx@9.x
 * position: top-left/top-center/top-right/bottom-left/bottom-center/bottom-right/none
 */
function buildPageNumberHF(position) {
    if (!position || position === "none") return null;

    const isTop = position.startsWith("top-");
    const alignment =
        position.endsWith("-left")
            ? AlignmentType.LEFT
            : position.endsWith("-right")
                ? AlignmentType.RIGHT
                : AlignmentType.CENTER;

    const p = new Paragraph({
        alignment,
        children: [new TextRun({ children: [PageNumber.CURRENT] })],
    });

    if (isTop) {
        return { headers: { default: new Header({ children: [p] }) } };
    }
    return { footers: { default: new Footer({ children: [p] }) } };
}

/**
 * Export active note to DOCX
 */
async function exportActiveNoteToDocx(plugin, preset, options) {
    const opts = {
        ignorePageBreaks: !!options?.ignorePageBreaks,
        enablePagination: !!options?.enablePagination,
        includeToc: !!options?.includeToc,
    };

    const app = plugin.app;
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) throw ensureError("NO_ACTIVE_FILE", "Нет активной заметки для экспорта.");

    synthesizeStylesIfMissing(preset);

    const md = await app.vault.read(activeFile);
    const model = parseMarkdownToModel(md);
    if (!model.blocks.length) throw ensureError("EXPORT_FAILED", "Заметка пустая — нечего экспортировать.");

    const outputFolder = (plugin.settings?.outputFolder || "Exports").trim() || "Exports";
    const fileNameTemplate = plugin.settings?.fileNameTemplate || "{title}.docx";
    const outName = applyFileNameTemplate(fileNameTemplate, activeFile.basename);

    const outFolderPath = joinVaultPath(outputFolder);
    const outFilePath = joinVaultPath(outputFolder, outName);

    const margins = preset.page?.marginsMm || { top: 20, bottom: 20, left: 25, right: 10 };

    const contentChildren = [];

    let tableCounter = 0;
    let figureCounter = 0;
    let pendingTableCaptionText = null;

    for (const block of model.blocks) {
        if (block.type === "pageBreak") {
            if (!opts.ignorePageBreaks) contentChildren.push(new Paragraph({ pageBreakBefore: true }));
            continue;
        }

        if (block.type === "heading") {
            const level = Math.min(6, Math.max(1, block.level || 1));
            contentChildren.push(paragraphFromInlines(block.inlines, `heading${level}`, preset));
            continue;
        }

        if (block.type === "paragraph") {
            if (isTableCaptionParagraphBlock(block)) {
                pendingTableCaptionText = inlinesToText(block.inlines).trim();
                continue;
            }
            contentChildren.push(paragraphFromInlines(block.inlines, "normal", preset));
            continue;
        }

        if (block.type === "list") {
            // "-" as part of text (no bullets/tabs/numbering)
            for (const item of block.items || []) {
                const inlines = [{ type: "text", text: "- " }, ...(item.inlines || [])];
                contentChildren.push(
                    paragraphFromInlines(inlines, "normal", preset, { alignment: AlignmentType.LEFT })
                );
            }
            continue;
        }

        if (block.type === "codeBlock") {
            const style = getStyle(preset, "listingText", "normal");
            const pOpts = paragraphOptionsFromStyle(style);
            const font = style.font || { family: "Courier New", sizePt: 10 };

            for (const line of block.lines || []) {
                contentChildren.push(
                    new Paragraph({
                        alignment: AlignmentType.LEFT,
                        spacing: pOpts.spacing,
                        children: [
                            new TextRun({
                                text: line,
                                font: font.family || "Courier New",
                                size: ptToHalfPoints(font.sizePt || 10),
                            }),
                        ],
                    })
                );
            }
            continue;
        }

        if (block.type === "table") {
            tableCounter += 1;

            const captionText = pendingTableCaptionText || `Таблица ${tableCounter} — `;
            contentChildren.push(makeTableCaptionParagraphFromText(captionText, preset));
            pendingTableCaptionText = null;

            const t = makeTable(block, preset);
            if (t) contentChildren.push(t);
            continue;
        }

        if (block.type === "image") {
            figureCounter += 1;

            const name = fileBaseName(block.src || "image");
            const caption = `Рисунок ${figureCounter} — ${name}`;

            const resolved = await resolveImageBinary(plugin, activeFile, block.src);
            if (resolved) {
                const imageRun = new ImageRun({
                    data: resolved.data,
                    transformation: { width: 500, height: 300 },
                });
                contentChildren.push(makeImageParagraph(imageRun));
            } else {
                contentChildren.push(
                    paragraphFromInlines(
                        [{ type: "text", text: `[Изображение не найдено: ${block.src}]` }],
                        "normal",
                        preset,
                        { indent: null, alignment: AlignmentType.CENTER }
                    )
                );
            }

            contentChildren.push(
                paragraphFromInlines([{ type: "text", text: caption }], "figureCaption", preset, {
                    indent: null,
                })
            );
            continue;
        }
    }

    // Common page margins
    const pageProps = {
        margin: {
            top: mmToTwips(margins.top),
            bottom: mmToTwips(margins.bottom),
            left: mmToTwips(margins.left),
            right: mmToTwips(margins.right),
        },
    };

    // Page numbering placement per preset
    const pagPos = preset.pagination?.position || "none";
    const pageNumHF = opts.enablePagination ? buildPageNumberHF(pagPos) : null;

    // Determine numbering start
    const startAt = Number.isFinite(preset.pagination?.startAt) ? preset.pagination.startAt : 1;
    const skipFirstPages = Number.isFinite(preset.pagination?.skipFirstPages) ? preset.pagination.skipFirstPages : 0;

    // Build sections
    const sections = [];

    // 1) TOC section (separate page) — by requirement: before first paragraph and on separate page
    if (opts.includeToc) {
        const tocTitle = paragraphFromInlines(
            [{ type: "text", text: "СОДЕРЖАНИЕ" }],
            "tocTitle",
            preset,
            { indent: null, alignment: AlignmentType.CENTER }
        );

        const toc = new TableOfContents("Содержание", {
            hyperlink: true,
            headingStyleRange: "1-6",
        });

        // TOC section: typically without page number (matches skip-first-pages behavior)
        sections.push({
            properties: {
                page: pageProps,
            },
            children: [tocTitle, toc],
        });
    }

    // If pagination enabled and skipFirstPages > 0, we want the numbering to start in the MAIN section
    // (TOC/titles etc. are in previous section(s) without numbering).
    // That is exactly what multiple sections give us.

    const mainSectionProperties = {
        page: pageProps,
        ...(opts.enablePagination
            ? {
                // attach header/footer with page number
                ...(pageNumHF || {}),
                // start page numbers from preset.pagination.startAt (e.g. 3)
                pageNumberStart: startAt > 0 ? startAt : 1,
            }
            : {}),
    };

    sections.push({
        properties: mainSectionProperties,
        // If TOC exists: main content must start on a new page (new section already starts on new page in Word)
        // If no TOC: just starts immediately
        children: contentChildren,
    });

    const doc = new Document({ sections });

    let buffer;
    try {
        buffer = await Packer.toBuffer(doc);
    } catch (e) {
        throw ensureError("EXPORT_FAILED", "Не удалось сформировать DOCX.", { cause: e });
    }

    const adapter = app.vault.adapter;
    try {
        await ensureFolder(adapter, outFolderPath);
        await adapter.writeBinary(outFilePath, buffer);
    } catch (e) {
        throw ensureError("EXPORT_FAILED", "Не удалось сохранить файл в vault.", { cause: e });
    }

    return { outFilePath, outName };
}

module.exports = {
    exportActiveNoteToDocx,
};
