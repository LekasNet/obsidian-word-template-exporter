// src/obsidian/preset-editor-modal.js

const { Modal, Setting, Notice } = require("obsidian");
const { renderPresetVisualEditor } = require("./preset-visual-editor");
const { t } = require("../i18n");

class PresetEditorModal extends Modal {
    constructor(app, presetWrapper, onSave) {
        super(app);
        this.presetWrapper = JSON.parse(JSON.stringify(presetWrapper)); // {id,name,preset}
        this.onSave = onSave;

        this.activeTab = "visual"; // стартуем с визуального
        this.jsonText = JSON.stringify(this.presetWrapper.preset || {}, null, 2);

        this._textarea = null;
        this._bodyEl = null;
    }

    onOpen() {
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: t("modal.presetEditor.title") });

        new Setting(contentEl)
            .setName(t("modal.presetEditor.name.title"))
            .addText((t) => {
                t.setValue(this.presetWrapper.name || "");
                t.onChange((v) => (this.presetWrapper.name = v));
            });

        // tabs
        const tabs = contentEl.createDiv();
        tabs.style.display = "flex";
        tabs.style.gap = "8px";
        tabs.style.margin = "10px 0";

        const btnVisual = tabs.createEl("button", { text: t("modal.presetEditor.tabs.visual") });
        const btnJson = tabs.createEl("button", { text: t("modal.presetEditor.tabs.json") });

        const setActive = (tab) => {
            if (tab === this.activeTab) return;

            // синхронизация при переключении
            if (tab === "json") {
                // из визуального -> json
                this.jsonText = JSON.stringify(this.presetWrapper.preset || {}, null, 2);
            } else {
                // из json -> визуальный (пробуем применить json)
                try {
                    const parsed = JSON.parse(this.jsonText || "{}");
                    this.presetWrapper.preset = parsed;
                } catch {
                    new Notice(t("notices.preset.invalidJsonVisualNotUpdated"));
                    // остаёмся в json, не переключаем
                    return;
                }
            }

            this.activeTab = tab;
            btnVisual.classList.toggle("mod-cta", tab === "visual");
            btnJson.classList.toggle("mod-cta", tab === "json");
            this.renderBody();
        };

        btnVisual.onclick = () => setActive("visual");
        btnJson.onclick = () => setActive("json");

        // init button states
        btnVisual.classList.toggle("mod-cta", this.activeTab === "visual");
        btnJson.classList.toggle("mod-cta", this.activeTab === "json");

        // body
        this._bodyEl = contentEl.createDiv({ cls: "gost-preset-editor-body" });
        this.renderBody();

        // footer
        const footer = contentEl.createDiv();
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "8px";
        footer.style.marginTop = "12px";

        const cancel = footer.createEl("button", { text: t("buttons.cancel") });
        cancel.onclick = () => this.close();

        const save = footer.createEl("button", { text: t("buttons.save") });
        save.classList.add("mod-cta");
        save.onclick = () => this.saveAndClose();
    }

    renderBody() {
        this._bodyEl.empty();
        this._textarea = null;

        if (this.activeTab === "json") {
            const ta = this._bodyEl.createEl("textarea");
            ta.style.width = "100%";
            ta.style.height = "380px";
            ta.value = this.jsonText;

            ta.oninput = () => {
                this.jsonText = ta.value;
            };

            this._textarea = ta;
            return;
        }

        // visual tab
        renderPresetVisualEditor(this._bodyEl, this.presetWrapper, {
            onChange: () => {
                // при любом изменении визуального — обновляем jsonText
                this.jsonText = JSON.stringify(this.presetWrapper.preset || {}, null, 2);
                // если вдруг textarea уже создана (редко, но пусть будет)
                if (this._textarea) this._textarea.value = this.jsonText;
            },
        });
    }

    saveAndClose() {
        try {
            // если сейчас JSON-таб — применим его перед сохранением
            if (this.activeTab === "json") {
                this.presetWrapper.preset = JSON.parse(this.jsonText || "{}");
            }
            this.onSave(this.presetWrapper);
            this.close();
            new Notice(t("notices.preset.saved"));
        } catch {
            new Notice(t("notices.preset.invalidJson"));
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

module.exports = { PresetEditorModal };
