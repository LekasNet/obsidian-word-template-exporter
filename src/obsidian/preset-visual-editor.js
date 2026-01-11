// src/obsidian/preset-visual-editor.js

const { Setting, Notice } = require("obsidian");
const { t: tr } = require("../i18n"); // <- импортируем как tr, чтобы не конфликтовало

// порядок, который ты просил
const STYLE_ORDER = [
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
    "normal",
    "tableText",
    "tableHeaderText",
    "tableCaption",
    "figureCaption",
    "listingText",
];

const LABELS = {
    heading1: tr("block.heading1"),
    heading2: tr("block.heading2"),
    heading3: tr("block.heading3"),
    heading4: tr("block.heading4"),
    heading5: tr("block.heading5"),
    heading6: tr("block.heading6"),
    normal: tr("block.normal"),
    tableText: tr("block.tableText"),
    tableHeaderText: tr("block.tableHeaderText"),
    tableCaption: tr("block.tableCaption"),
    figureCaption: tr("block.figureCaption"),
    listingText: tr("block.listingText"),
};

function sortBlocks(blocks) {
    const idx = new Map(STYLE_ORDER.map((k, i) => [k, i]));
    blocks.sort((a, b) => (idx.get(a.type) ?? 999) - (idx.get(b.type) ?? 999));
}

function getSelectedTypes(blocks) {
    return blocks.filter((b) => !!b.type).map((b) => b.type);
}

function getAvailableTypes(selectedTypes) {
    const set = new Set(selectedTypes);
    return STYLE_ORDER.filter((x) => !set.has(x));
}

function defaultStyleFor(type, preset) {
    const normal =
        preset.styles?.normal || {
            font: { family: tr("placeholders.font.family"), sizePt: 14 },
            paragraph: {
                alignment: "justify",
                firstLineIndentCm: 1.25,
                spacingBeforePt: 0,
                spacingAfterPt: 0,
                lineSpacing: 1.5,
            },
        };

    const base = JSON.parse(JSON.stringify(normal));

    if (type.startsWith("heading")) {
        base.font.bold = true;
        base.paragraph.keepWithNext = true;
        base.paragraph.keepLines = true;
        base.paragraph.spacingBeforePt = 24;
        base.paragraph.spacingAfterPt = 12;
    }

    if (type === "tableCaption") {
        base.font.sizePt = 12;
        base.paragraph.firstLineIndentCm = 0;
        base.paragraph.spacingBeforePt = 6;
        base.paragraph.lineSpacing = 1.0;
    }

    if (type === "figureCaption") {
        base.font.sizePt = 12;
        base.paragraph.firstLineIndentCm = 0;
        base.paragraph.alignment = "center";
        base.paragraph.lineSpacing = 1.0;
    }

    if (type === "tableText" || type === "tableHeaderText") {
        base.font.sizePt = 12;
        base.paragraph.firstLineIndentCm = 0;
        base.paragraph.lineSpacing = 1.0;
    }

    if (type === "listingText") {
        base.font.family = "Courier New";
        base.font.sizePt = 10;
        base.paragraph.firstLineIndentCm = 0;
        base.paragraph.alignment = "left";
        base.paragraph.lineSpacing = 1.0;
    }

    return base;
}

/**
 * Visual editor renderer
 * @param {HTMLElement} containerEl
 * @param {{ id: string, name: string, preset: any }} presetWrapper (mutable)
 * @param {{ onChange?: () => void }} [hooks]
 */
function renderPresetVisualEditor(containerEl, presetWrapper, hooks) {
    const preset = presetWrapper.preset || {};
    presetWrapper.preset = preset;
    if (!preset.styles) preset.styles = {};

    // blocks model:
    // { id: string, type: string|null } where type=null means "unselected yet"
    const blocks = [];

    // pull existing styles as blocks
    for (const type of STYLE_ORDER) {
        if (preset.styles[type]) blocks.push({ id: `b-${type}`, type });
    }
    sortBlocks(blocks);

    function notifyChange() {
        if (hooks && typeof hooks.onChange === "function") hooks.onChange();
    }

    const header = containerEl.createDiv();
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "8px";

    header.createEl("h3", { text: tr("visualEditor.title") });

    const addBtn = header.createEl("button", { text: tr("buttons.addBlock") });
    addBtn.classList.add("mod-cta");

    const blocksEl = containerEl.createDiv();

    function renderBlockTypeChooser(blockEl, block) {
        const selectedTypes = getSelectedTypes(blocks);
        const available = getAvailableTypes(selectedTypes);

        const s = new Setting(blockEl)
            .setName(tr("visualEditor.blockType.title"))
            .setDesc(tr("visualEditor.blockType.desc"));

        s.addDropdown((dd) => {
            // лучше тоже локализовать, но можно и так:
            dd.addOption("", "— выбрать —");

            // если уже выбран тип в этом блоке — показываем его в списке тоже
            if (block.type && !available.includes(block.type)) {
                dd.addOption(block.type, LABELS[block.type] || block.type);
            }

            for (const type of available) dd.addOption(type, LABELS[type] || type);

            dd.setValue(block.type || "");
            dd.onChange((v) => {
                if (!v) return;

                // защита от дублей
                const alreadyUsed = selectedTypes.includes(v) && block.type !== v;
                if (alreadyUsed) {
                    new Notice(tr("notices.blocks.typeAlreadyAdded"));
                    dd.setValue(block.type || "");
                    return;
                }

                // если меняем тип, удалим старый стиль
                if (block.type && block.type !== v) {
                    delete preset.styles[block.type];
                }

                block.type = v;
                preset.styles[v] = preset.styles[v] || defaultStyleFor(v, preset);

                // теперь сортируем блоки, чтобы он встал "на своё место"
                sortBlocks(blocks);

                notifyChange();
                renderAll();
            });
        });
    }

    function renderStyleFields(blockEl, type) {
        const styleObj =
            preset.styles[type] || (preset.styles[type] = defaultStyleFor(type, preset));
        const font = styleObj.font || (styleObj.font = {});
        const par = styleObj.paragraph || (styleObj.paragraph = {});

        // FONT
        new Setting(blockEl)
            .setName(tr("fields.font.family"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.font.family"));
                input.setValue(font.family || "");
                input.onChange((v) => {
                    font.family = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.font.sizePt"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.font.sizePt"));
                input.setValue(font.sizePt != null ? String(font.sizePt) : "");
                input.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    font.sizePt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.font.color"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.font.color"));
                input.setValue(font.color || "");
                input.onChange((v) => {
                    // разрешим пусто = "не задавать"
                    const s = String(v || "").trim().replace(/^#/, "").toUpperCase();
                    if (!s) {
                        delete font.color;
                        notifyChange();
                        return;
                    }
                    // простая валидация HEX 6 символов
                    if (!/^[0-9A-F]{6}$/.test(s)) return;
                    font.color = s;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.font.bold"))
            .addToggle((tg) => {
                tg.setValue(!!font.bold);
                tg.onChange((v) => {
                    font.bold = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.font.italic"))
            .addToggle((tg) => {
                tg.setValue(!!font.italic);
                tg.onChange((v) => {
                    font.italic = v;
                    notifyChange();
                });
            });

        // PARAGRAPH
        new Setting(blockEl)
            .setName(tr("fields.paragraph.alignment"))
            .addDropdown((dd) => {
                dd.addOption("justify", tr("fields.paragraph.alignment.justify"));
                dd.addOption("left", tr("fields.paragraph.alignment.left"));
                dd.addOption("center", tr("fields.paragraph.alignment.center"));
                dd.addOption("right", tr("fields.paragraph.alignment.right"));
                dd.setValue(par.alignment || "justify");
                dd.onChange((v) => {
                    par.alignment = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.paragraph.firstLineIndentCm"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.paragraph.firstLineIndentCm"));
                input.setValue(par.firstLineIndentCm != null ? String(par.firstLineIndentCm) : "");
                input.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.firstLineIndentCm = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.paragraph.spacingBeforePt"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.paragraph.spacingBeforePt"));
                input.setValue(par.spacingBeforePt != null ? String(par.spacingBeforePt) : "");
                input.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.spacingBeforePt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.paragraph.spacingAfterPt"))
            .addText((input) => {
                // ✅ тут был баг: placeholder брался spacingBeforePt
                input.setPlaceholder(tr("placeholders.paragraph.spacingAfterPt"));
                input.setValue(par.spacingAfterPt != null ? String(par.spacingAfterPt) : "");
                input.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.spacingAfterPt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName(tr("fields.paragraph.lineSpacing"))
            .addText((input) => {
                input.setPlaceholder(tr("placeholders.paragraph.lineSpacing"));
                input.setValue(par.lineSpacing != null ? String(par.lineSpacing) : "");
                input.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.lineSpacing = n;
                    notifyChange();
                });
            });
    }

    function renderAll() {
        blocksEl.empty();

        // сортируем только “выбранные”; но пустые (без type) пусть остаются внизу
        const chosen = blocks.filter((b) => !!b.type);
        const unchosen = blocks.filter((b) => !b.type);
        sortBlocks(chosen);
        blocks.length = 0;
        blocks.push(...chosen, ...unchosen);

        blocks.forEach((b, index) => {
            const blockEl = blocksEl.createDiv();
            blockEl.style.border = "1px solid var(--background-modifier-border)";
            blockEl.style.borderRadius = "8px";
            blockEl.style.padding = "10px";
            blockEl.style.marginBottom = "10px";

            // top row: title + delete
            const top = blockEl.createDiv();
            top.style.display = "flex";
            top.style.justifyContent = "space-between";
            top.style.alignItems = "center";
            top.style.marginBottom = "6px";

            top.createEl("strong", {
                text: b.type ? (LABELS[b.type] || b.type) : tr("visualEditor.block.new"),
            });

            const del = top.createEl("button", { text: tr("buttons.delete") });
            del.onclick = () => {
                if (b.type) delete preset.styles[b.type];
                blocks.splice(index, 1);
                notifyChange();
                renderAll();
            };

            // chooser always visible
            renderBlockTypeChooser(blockEl, b);

            // if chosen → show fields
            if (b.type) {
                renderStyleFields(blockEl, b.type);
            }
        });

        const available = getAvailableTypes(getSelectedTypes(blocks));
        addBtn.disabled = available.length === 0;
    }

    addBtn.onclick = () => {
        const available = getAvailableTypes(getSelectedTypes(blocks));
        if (!available.length) {
            new Notice(tr("notices.blocks.allAdded"));
            return;
        }
        // добавляем “пустой” блок только с dropdown
        blocks.push({ id: `b-${Date.now()}`, type: null });
        renderAll();
    };

    renderAll();

    return {
        getPresetWrapper: () => presetWrapper,
    };
}

module.exports = {
    renderPresetVisualEditor,
    STYLE_ORDER,
    LABELS,
};
