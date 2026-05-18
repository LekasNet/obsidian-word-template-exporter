// src/core/exporter.js
//
// docx@9.5.1 compatible
// exportActiveNoteToDocx(plugin, preset, options)
// options:
//  - ignorePageBreaks: boolean
//  - enablePagination: boolean
//  - includeToc: boolean  (TOC page BEFORE first content, separate page)
//  - extractListingTitleFromFirstComment: boolean

const path = require("path");
const { normalizePath } = require("obsidian");
const { t } = require("../i18n");
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
    HeadingLevel,
    LevelFormat,
    LevelSuffix,
} = require("docx");

const { mmToTwips, cmToTwips, ptToHalfPoints } = require("../utils/units");
const { parseMarkdownToModel } = require("./markdown-parser");

const BULLET_NUMBERING_REFERENCE = "word-export-bullet-list";
const ORDERED_NUMBERING_REFERENCE = "word-export-ordered-list";

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

// ---------- preset strings (TOC / captions / messages) ----------

function getStrings(preset) {
    const s = preset?.strings || {};
    return {
        tocTitle: s.tocTitle || "СОДЕРЖАНИЕ",
        tocFieldTitle: s.tocFieldTitle || "Содержание",
        tableLabel: s.tableLabel || "Таблица",
        figureLabel: s.figureLabel || "Рисунок",
        listingLabel: s.listingLabel || "Листинг",
        captionSeparator: s.captionSeparator || " — ",
        imageNotFound: s.imageNotFound || "Изображение не найдено: {src}",
    };
}

function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- filename template ----------

function applyFileNameTemplate(template, title) {
    const safeTitle = (title || "Untitled")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
        .trim() || "Untitled";

    const templateStr = template && template.trim() ? template.trim() : "{title}.docx";
    const name = templateStr.replaceAll("{title}", safeTitle);
    return name.toLowerCase().endsWith(".docx") ? name : `${name}.docx`;
}

// ---------- styles ----------

function synthesizeStylesIfMissing(preset) {
    if (preset && !preset.styles) preset.styles = {};

    if (preset && preset.styles && !preset.styles.normal) {
        const baseFont = preset.font || { family: t("placeholders.font.family"), sizePt: 14 };
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
    if (!s.listingCaption) s.listingCaption = s.tableCaption || s.normal;
    if (!s.listingText) s.listingText = s.normal;
    if (!s.listText) s.listText = s.normal;

    // TOC title style (text itself comes from preset.strings.tocTitle)
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

function styleRunOptionsFromStyle(style, preset) {
    const font = style.font || preset.font || { family: t("placeholders.font.family"), sizePt: 14 };
    const color = (font.color || "").replace(/^#/, "").toUpperCase();
    const hasColor = /^[0-9A-F]{6}$/.test(color);

    return {
        font: font.family || t("placeholders.font.family"),
        size: ptToHalfPoints(font.sizePt || 14),
        bold: !!font.bold,
        italics: !!font.italic,
        allCaps: !!font.allCaps,
        ...(hasColor ? { color } : {}),
    };
}

function buildDocumentStyles(preset) {
    const normal = getStyle(preset, "normal");
    const normalParagraph = paragraphOptionsFromStyle(normal);
    const tocParagraph = {
        ...normalParagraph,
        alignment: AlignmentType.LEFT,
        indent: {},
    };
    const tocRun = styleRunOptionsFromStyle(normal, preset);

    return {
        paragraphStyles: Array.from({ length: 6 }, (_, index) => ({
            id: `TOC${index + 1}`,
            name: `TOC ${index + 1}`,
            basedOn: "Normal",
            next: "Normal",
            paragraph: tocParagraph,
            run: tocRun,
        })),
    };
}

function transformInlineText(text, transform) {
    let out = text || "";
    if (transform?.stripTerminalPunctuation) out = out.replace(/[.!?;:]+$/u, "");
    if (transform?.uppercase) out = out.toLocaleUpperCase("ru-RU");
    return out;
}

function runsFromInlines(inlines, style, preset, transform) {
    const baseFont = style.font || preset.font || { family: t("placeholders.font.family"), sizePt: 14 };
    const baseFamily = baseFont.family || t("placeholders.font.family");
    const baseSize = ptToHalfPoints(baseFont.sizePt || 14);
    const baseColor = (baseFont.color || "").replace(/^#/, "").toUpperCase();
    const hasColor = /^[0-9A-F]{6}$/.test(baseColor);


    const forceBold = !!baseFont.bold;
    const forceItalic = !!baseFont.italic;
    const allCaps = !!baseFont.allCaps;

    return (inlines || []).map((inl) => {
        const isCode = !!inl.code;

        const run = new TextRun({
            text: transformInlineText(inl.text, transform),
            font: isCode ? "Courier New" : baseFamily,
            size: isCode ? ptToHalfPoints(Math.max(10, (baseFont.sizePt || 14) - 2)) : baseSize,
            bold: forceBold || !!inl.bold,
            italics: forceItalic || !!inl.italic,
            ...(hasColor ? { color: baseColor } : {}),
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
    delete merged.textTransform;

    return new Paragraph({
        ...merged,
        children: runsFromInlines(inlines, style, preset, overrides?.textTransform),
    });
}

function inlinesToText(inlines) {
    return (inlines || []).map((x) => x.text || "").join("");
}

function normalizedHeadingText(inlines) {
    return inlinesToText(inlines)
        .trim()
        .replace(/[.!?;:]+$/u, "")
        .replace(/\s+/g, " ")
        .toLocaleUpperCase("ru-RU");
}

function getPresetRules(preset) {
    return preset?.rules || {};
}

function headingRulesFor(block, preset) {
    const rules = getPresetRules(preset).headings || {};
    const special = new Set((rules.centeredUppercase || []).map((x) => String(x).toLocaleUpperCase("ru-RU")));
    const text = normalizedHeadingText(block.inlines);
    const isCenteredUppercase = special.has(text);

    return {
        center: isCenteredUppercase,
        uppercase: block.level === 1 || isCenteredUppercase,
        stripTerminalPunctuation: rules.stripTerminalPunctuation !== false,
    };
}

function getNumberedHeadingPrefix(block) {
    const text = inlinesToText(block.inlines).trim();
    const match = /^(\d+)(?:[.)]|\s)/u.exec(text);
    return match ? match[1] : null;
}

function formatScopedNumber(label, sectionNumber, counter) {
    return sectionNumber ? `${label} ${sectionNumber}.${counter}` : `${label} ${counter}`;
}

function formatCaptionNumber(label, sectionNumber, counter, preset) {
    const scoped = getPresetRules(preset).captions?.numberWithinHeading1 !== false;
    return formatScopedNumber(label, scoped ? sectionNumber : null, counter);
}

function listIndentOptionsFromRules(listRules) {
    const markerIndentCm = listRules.markerIndentCm ?? 1.25;
    const textIndentCm = listRules.textIndentCm ?? 2.25;

    if (
        typeof listRules.leftIndentCm === "number" ||
        typeof listRules.firstLineIndentCm === "number"
    ) {
        return {
            left: cmToTwips(listRules.leftIndentCm ?? 0),
            firstLine: cmToTwips(listRules.firstLineIndentCm ?? markerIndentCm),
        };
    }

    return {
        left: cmToTwips(textIndentCm),
        hanging: cmToTwips(listRules.hangingIndentCm ?? Math.max(0, textIndentCm - markerIndentCm)),
    };
}

function listTabStopCmFromRules(listRules) {
    return listRules.tabStopCm ?? listRules.textIndentCm ?? 2.25;
}

function buildNumberingConfig(preset) {
    const listRules = getPresetRules(preset).lists || {};
    const bulletSymbol = String(listRules.bulletSymbol || "-");
    const paragraph = {
        indent: listIndentOptionsFromRules(listRules),
        leftTabStop: cmToTwips(listTabStopCmFromRules(listRules)),
    };

    return {
        config: [
            {
                reference: BULLET_NUMBERING_REFERENCE,
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.BULLET,
                        text: bulletSymbol,
                        suffix: LevelSuffix.TAB,
                        style: { paragraph },
                    },
                ],
            },
            {
                reference: ORDERED_NUMBERING_REFERENCE,
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.DECIMAL,
                        text: "%1.",
                        suffix: LevelSuffix.TAB,
                        style: { paragraph },
                    },
                ],
            },
        ],
    };
}

function isTableCaptionParagraphBlock(block, preset) {
    if (!block || block.type !== "paragraph") return false;

    const strings = getStrings(preset);
    const label = escapeRegExp(strings.tableLabel);

    const text = inlinesToText(block.inlines).trim();
    const rx = new RegExp(`^${label}\\s+\\d+(?:\\.\\d+)*\\b`, "i"); // Table 1 / Таблица 1 / Table 1.1 ...
    return rx.test(text);
}

function isListingCaptionParagraphBlock(block, preset) {
    if (!block || block.type !== "paragraph") return false;

    const strings = getStrings(preset);
    const label = escapeRegExp(strings.listingLabel);

    const text = inlinesToText(block.inlines).trim();
    const rx = new RegExp(`^${label}\\s+\\d+(?:\\.\\d+)*\\b`, "i");
    return rx.test(text);
}

function stripCaptionFinalPeriod(text, preset) {
    if (getPresetRules(preset).captions?.stripFinalPeriod === false) return text || "";
    return String(text || "").trim().replace(/\.$/u, "");
}

function makeTableCaptionParagraphFromText(text, preset) {
    const strings = getStrings(preset);

    const style = getStyle(preset, "tableCaption", "normal");
    const pOpts = paragraphOptionsFromStyle(style);
    const font = style.font || { family: t("placeholders.font.family"), sizePt: 12 };

    const family = font.family || t("placeholders.font.family");
    const size = ptToHalfPoints(font.sizePt || 12);
    const bold = !!font.bold;
    const italics = !!font.italic;

    const line = stripCaptionFinalPeriod(text, preset);

    const label = escapeRegExp(strings.tableLabel);
    const sep = escapeRegExp(strings.captionSeparator || " — ");

    // with separator (Table 1 — Title)
    let m = new RegExp(`^(${label}\\s+\\d+(?:\\.\\d+)*\\s*${sep}\\s*)(.*)$`, "i").exec(line);
    if (m) {
        const prefix = m[1];
        const rest = m[2] || "";
        return new Paragraph({
            ...pOpts,
            indent: undefined,
            children: [
                new TextRun({ text: prefix, font: family, size, bold, italics }),
                new TextRun({ text: rest, font: family, size, bold, italics }),
            ],
        });
    }

    // without separator (Table 1 Title)
    m = new RegExp(`^(${label}\\s+\\d+(?:\\.\\d+)*\\s+)(.*)$`, "i").exec(line);
    if (m) {
        const prefix = m[1];
        const rest = m[2] || "";
        return new Paragraph({
            ...pOpts,
            indent: undefined,
            children: [
                new TextRun({ text: prefix, font: family, size, bold, italics }),
                new TextRun({ text: rest, font: family, size, bold, italics }),
            ],
        });
    }

    return new Paragraph({
        ...pOpts,
        indent: undefined,
        children: [new TextRun({ text: line, font: family, size, bold, italics })],
    });
}

function makeListingCaptionParagraphFromText(text, preset) {
    return paragraphFromInlines(
        [{ type: "text", text: stripCaptionFinalPeriod(text, preset) }],
        "listingCaption",
        preset,
        { indent: null }
    );
}

function extractListingTitleFromFirstComment(lines) {
    const first = Array.isArray(lines) ? lines[0] : null;
    if (typeof first !== "string") return null;

    const match = /^\s*(?:\/\/|#)\s*(.+?)\s*$/.exec(first);
    if (!match) return null;

    const title = (match[1] || "").trim();
    if (!title) return null;

    return {
        title,
        lines: lines.slice(1),
    };
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

function makeListingTable(block, preset) {
    const style = getStyle(preset, "listingText", "normal");
    const pOpts = paragraphOptionsFromStyle(style);
    const font = style.font || { family: "Courier New", sizePt: 10 };

    const paragraphs = (block.lines || [""]).map((line) => new Paragraph({
        ...pOpts,
        indent: undefined,
        children: [
            new TextRun({
                text: line,
                font: font.family || "Courier New",
                size: ptToHalfPoints(font.sizePt || 10),
            }),
        ],
    }));

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            insideHorizontal: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: paragraphs,
                    }),
                ],
            }),
        ],
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
        extractListingTitleFromFirstComment: !!options?.extractListingTitleFromFirstComment,
    };

    const app = plugin.app;
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) throw ensureError("NO_ACTIVE_FILE", t("errors.noActiveFile"));

    synthesizeStylesIfMissing(preset);
    const strings = getStrings(preset);

    const md = await app.vault.read(activeFile);
    const model = parseMarkdownToModel(md);
    if (!model.blocks.length) throw ensureError("EXPORT_FAILED", t("errors.emptyNote"));

    const outputFolder = (plugin.settings?.outputFolder || "Exports").trim() || "Exports";
    const fileNameTemplate = plugin.settings?.fileNameTemplate || "{title}.docx";
    const outName = applyFileNameTemplate(fileNameTemplate, activeFile.basename);

    const outFolderPath = joinVaultPath(outputFolder);
    const outFilePath = joinVaultPath(outputFolder, outName);

    const margins = preset.page?.marginsMm || { top: 20, bottom: 20, left: 25, right: 10 };

    const contentChildren = [];

    let tableCounter = 0;
    let figureCounter = 0;
    let listingCounter = 0;
    let currentSectionNumber = null;
    let pendingTableCaptionText = null;
    let pendingListingCaptionText = null;
    let nextNormalSpacingBeforePt = null;
    let listInstanceCounter = 0;
    const afterObjectSpacingBeforePt = getPresetRules(preset).objects?.followingParagraphSpacingBeforePt;

    for (const block of model.blocks) {
        if (block.type === "pageBreak") {
            if (!opts.ignorePageBreaks) contentChildren.push(new Paragraph({ pageBreakBefore: true }));
            continue;
        }

        if (block.type === "heading") {
            const level = Math.min(6, Math.max(1, block.level || 1));
            if (level === 1) {
                currentSectionNumber = getNumberedHeadingPrefix(block);
                tableCounter = 0;
                figureCounter = 0;
                listingCounter = 0;
            }

            const headingMap = {
                1: HeadingLevel.HEADING_1,
                2: HeadingLevel.HEADING_2,
                3: HeadingLevel.HEADING_3,
                4: HeadingLevel.HEADING_4,
                5: HeadingLevel.HEADING_5,
                6: HeadingLevel.HEADING_6,
            };
            const rules = headingRulesFor(block, preset);

            contentChildren.push(
                paragraphFromInlines(block.inlines, `heading${level}`, preset, {
                    heading: headingMap[level],
                    ...(rules.center ? { alignment: AlignmentType.CENTER, indent: null } : {}),
                    textTransform: {
                        uppercase: rules.uppercase,
                        stripTerminalPunctuation: rules.stripTerminalPunctuation,
                    },
                })
            );
            continue;
        }


        if (block.type === "paragraph") {
            if (isTableCaptionParagraphBlock(block, preset)) {
                pendingTableCaptionText = inlinesToText(block.inlines).trim();
                continue;
            }
            if (isListingCaptionParagraphBlock(block, preset)) {
                pendingListingCaptionText = inlinesToText(block.inlines).trim();
                continue;
            }
            const overrides = {};
            if (typeof nextNormalSpacingBeforePt === "number") {
                overrides.spacing = {
                    ...paragraphOptionsFromStyle(getStyle(preset, "normal")).spacing,
                    before: Math.round(nextNormalSpacingBeforePt * 20),
                };
                nextNormalSpacingBeforePt = null;
            }
            contentChildren.push(paragraphFromInlines(block.inlines, "normal", preset, overrides));
            continue;
        }

        if (block.type === "list") {
            const style = getStyle(preset, "listText", "normal");
            const pOpts = paragraphOptionsFromStyle(style);
            const listInstance = listInstanceCounter;
            listInstanceCounter += 1;

            for (const item of block.items || []) {
                const listRules = getPresetRules(preset).lists || {};
                contentChildren.push(
                    new Paragraph({
                        ...pOpts,
                        alignment: AlignmentType.LEFT,
                        numbering: {
                            reference: block.ordered ? ORDERED_NUMBERING_REFERENCE : BULLET_NUMBERING_REFERENCE,
                            level: 0,
                            instance: listInstance,
                            custom: true,
                        },
                        indent: listIndentOptionsFromRules(listRules),
                        children: runsFromInlines(item.inlines || [], style, preset),
                    })
                );
            }
            continue;
        }

        if (block.type === "codeBlock") {
            listingCounter += 1;
            const extractedListingTitle = opts.extractListingTitleFromFirstComment && !pendingListingCaptionText
                ? extractListingTitleFromFirstComment(block.lines)
                : null;
            const captionText =
                pendingListingCaptionText ||
                `${formatCaptionNumber(strings.listingLabel, currentSectionNumber, listingCounter, preset)}${strings.captionSeparator}${extractedListingTitle?.title || ""}`;
            contentChildren.push(makeListingCaptionParagraphFromText(captionText, preset));
            pendingListingCaptionText = null;

            contentChildren.push(makeListingTable(
                extractedListingTitle ? { ...block, lines: extractedListingTitle.lines } : block,
                preset
            ));
            if (typeof afterObjectSpacingBeforePt === "number") nextNormalSpacingBeforePt = afterObjectSpacingBeforePt;
            continue;
        }

        if (block.type === "table") {
            tableCounter += 1;

            const captionText =
                pendingTableCaptionText ||
                `${formatCaptionNumber(strings.tableLabel, currentSectionNumber, tableCounter, preset)}${strings.captionSeparator}`;
            contentChildren.push(makeTableCaptionParagraphFromText(captionText, preset));
            pendingTableCaptionText = null;

            const table = makeTable(block, preset);
            if (table) contentChildren.push(table);
            if (typeof afterObjectSpacingBeforePt === "number") nextNormalSpacingBeforePt = afterObjectSpacingBeforePt;
            continue;
        }

        if (block.type === "image") {
            figureCounter += 1;

            const name = fileBaseName(block.src || "image");
            const caption = `${formatCaptionNumber(strings.figureLabel, currentSectionNumber, figureCounter, preset)}${strings.captionSeparator}${name}`;

            const resolved = await resolveImageBinary(plugin, activeFile, block.src);
            if (resolved) {
                const imageRun = new ImageRun({
                    data: resolved.data,
                    transformation: { width: 500, height: 300 },
                });
                contentChildren.push(makeImageParagraph(imageRun));
            } else {
                const msg = strings.imageNotFound.replace("{src}", String(block.src || ""));
                contentChildren.push(
                    paragraphFromInlines([{ type: "text", text: `[${msg}]` }], "normal", preset, {
                        indent: null,
                        alignment: AlignmentType.CENTER,
                    })
                );
            }

            contentChildren.push(
                paragraphFromInlines([{ type: "text", text: stripCaptionFinalPeriod(caption, preset) }], "figureCaption", preset, {
                    indent: null,
                })
            );
            if (typeof afterObjectSpacingBeforePt === "number") nextNormalSpacingBeforePt = afterObjectSpacingBeforePt;
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

    // 1) TOC section (separate page) — before first content and on separate page
    if (opts.includeToc) {
        const tocTitle = paragraphFromInlines(
            [{ type: "text", text: strings.tocTitle }],
            "tocTitle",
            preset,
            { indent: null, alignment: AlignmentType.CENTER }
        );

        const toc = new TableOfContents(strings.tocFieldTitle, {
            hyperlink: true,
            headingStyleRange: "1-6",
            hideTabAndPageNumbersInWebView: true,
            useAppliedParagraphOutlineLevel: true,
        });

        sections.push({
            properties: {
                page: pageProps,
            },
            children: [tocTitle, toc],
        });
    }

    // Note: skipFirstPages is currently not used to auto-insert extra unnumbered sections/pages here.
    // Your existing behavior relies on whether TOC is enabled as "first unnumbered section".
    // Keeping this as-is to avoid behavior changes.
    void skipFirstPages;

    const mainSectionProperties = {
        page: {
            ...pageProps,
            ...(opts.enablePagination ? { pageNumbers: { start: startAt > 0 ? startAt : 1 } } : {}),
        },
        ...(opts.enablePagination
            ? {
                ...(pageNumHF || {}),
            }
            : {}),
    };

    sections.push({
        properties: mainSectionProperties,
        children: contentChildren,
    });

    const doc = new Document({
        sections,
        styles: buildDocumentStyles(preset),
        numbering: buildNumberingConfig(preset),
        features: {
            updateFields: opts.includeToc,
        },
    });

    let buffer;
    try {
        buffer = await Packer.toBuffer(doc);
    } catch (e) {
        throw ensureError("EXPORT_FAILED", t("errors.buildDocxFailed"), { cause: e });
    }

    const adapter = app.vault.adapter;
    try {
        await ensureFolder(adapter, outFolderPath);
        await adapter.writeBinary(outFilePath, buffer);
    } catch (e) {
        throw ensureError("EXPORT_FAILED", t("errors.saveFailed"), { cause: e });
    }

    return { outFilePath, outName };
}

module.exports = {
    exportActiveNoteToDocx,
};
