// src/obsidian/preset-visual-editor.js

const { Setting, Notice } = require("obsidian");

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
    heading1: "Заголовок 1",
    heading2: "Заголовок 2",
    heading3: "Заголовок 3",
    heading4: "Заголовок 4",
    heading5: "Заголовок 5",
    heading6: "Заголовок 6",
    normal: "Текст",
    tableText: "Таблица — текст",
    tableHeaderText: "Таблица — шапка",
    tableCaption: "Подпись таблицы",
    figureCaption: "Подпись картинки",
    listingText: "Код-листинг",
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
    return STYLE_ORDER.filter((t) => !set.has(t));
}

function defaultStyleFor(type, preset) {
    const normal =
        preset.styles?.normal || {
            font: { family: "Times New Roman", sizePt: 14 },
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
    // { id: string, type: string|null }  where type=null means "unselected yet"
    const blocks = [];

    // pull existing styles as blocks
    for (const t of STYLE_ORDER) {
        if (preset.styles[t]) blocks.push({ id: `b-${t}`, type: t });
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

    header.createEl("h3", { text: "Визуальный редактор" });

    const addBtn = header.createEl("button", { text: "➕ Добавить блок" });
    addBtn.classList.add("mod-cta");

    const blocksEl = containerEl.createDiv();

    function renderBlockTypeChooser(blockEl, block) {
        const selectedTypes = getSelectedTypes(blocks);
        const available = getAvailableTypes(selectedTypes);

        const s = new Setting(blockEl)
            .setName("Тип блока")
            .setDesc("Выбери, что редактируем. Уже выбранные типы недоступны.");

        s.addDropdown((dd) => {
            dd.addOption("", "— выбрать —");

            // если уже выбран тип в этом блоке — показываем его в списке тоже
            if (block.type && !available.includes(block.type)) {
                dd.addOption(block.type, LABELS[block.type] || block.type);
            }

            for (const t of available) dd.addOption(t, LABELS[t] || t);

            dd.setValue(block.type || "");
            dd.onChange((v) => {
                if (!v) return;

                // защита от дублей
                const alreadyUsed = selectedTypes.includes(v) && block.type !== v;
                if (alreadyUsed) {
                    new Notice("Этот тип уже добавлен.");
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
        const styleObj = preset.styles[type] || (preset.styles[type] = defaultStyleFor(type, preset));
        const font = styleObj.font || (styleObj.font = {});
        const par = styleObj.paragraph || (styleObj.paragraph = {});

        // FONT
        new Setting(blockEl)
            .setName("Шрифт")
            .addText((t) => {
                t.setPlaceholder("Times New Roman");
                t.setValue(font.family || "");
                t.onChange((v) => {
                    font.family = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Размер (pt)")
            .addText((t) => {
                t.setPlaceholder("14");
                t.setValue(font.sizePt != null ? String(font.sizePt) : "");
                t.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    font.sizePt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Жирный")
            .addToggle((tg) => {
                tg.setValue(!!font.bold);
                tg.onChange((v) => {
                    font.bold = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Курсив")
            .addToggle((tg) => {
                tg.setValue(!!font.italic);
                tg.onChange((v) => {
                    font.italic = v;
                    notifyChange();
                });
            });

        // PARAGRAPH
        new Setting(blockEl)
            .setName("Выравнивание")
            .addDropdown((dd) => {
                dd.addOption("justify", "По ширине");
                dd.addOption("left", "По левому краю");
                dd.addOption("center", "По центру");
                dd.addOption("right", "По правому краю");
                dd.setValue(par.alignment || "justify");
                dd.onChange((v) => {
                    par.alignment = v;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Красная строка (см)")
            .addText((t) => {
                t.setPlaceholder("1.25");
                t.setValue(par.firstLineIndentCm != null ? String(par.firstLineIndentCm) : "");
                t.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.firstLineIndentCm = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Интервал до (pt)")
            .addText((t) => {
                t.setPlaceholder("0");
                t.setValue(par.spacingBeforePt != null ? String(par.spacingBeforePt) : "");
                t.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.spacingBeforePt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Интервал после (pt)")
            .addText((t) => {
                t.setPlaceholder("0");
                t.setValue(par.spacingAfterPt != null ? String(par.spacingAfterPt) : "");
                t.onChange((v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    par.spacingAfterPt = n;
                    notifyChange();
                });
            });

        new Setting(blockEl)
            .setName("Межстрочный интервал")
            .addText((t) => {
                t.setPlaceholder("1.5");
                t.setValue(par.lineSpacing != null ? String(par.lineSpacing) : "");
                t.onChange((v) => {
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

            top.createEl("strong", { text: b.type ? (LABELS[b.type] || b.type) : "Новый блок" });

            const del = top.createEl("button", { text: "Удалить" });
            del.onclick = () => {
                if (b.type) delete preset.styles[b.type];
                blocks.splice(index, 1);
                notifyChange();
                renderAll();
            };

            // chooser always visible (so you can create empty then pick)
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
            new Notice("Все блоки уже добавлены");
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
