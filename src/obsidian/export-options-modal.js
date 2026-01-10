// src/obsidian/export-options-modal.js

const { Modal, Setting, Notice } = require("obsidian");
const { getPresetOptions } = require("../gost/gost-loader");

class ExportOptionsModal extends Modal {
    /**
     * @param {import("obsidian").App} app
     * @param {{
     *  currentPresetId?: string,
     *  onSubmit: (opts: {
     *    presetId: string,
     *    ignorePageBreaks: boolean,
     *    enablePagination: boolean,
     *    includeToc: boolean
     *  }) => void
     * }} props
     */
    constructor(app, props) {
        super(app);
        this.props = props;

        this.state = {
            presetId: props.currentPresetId || (getPresetOptions()[0]?.id ?? ""),
            ignorePageBreaks: false,
            enablePagination: true,
            includeToc: false,
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Экспорт в Word — параметры" });

        const presets = getPresetOptions();
        if (!presets.length) {
            new Notice("Нет доступных пресетов.");
            this.close();
            return;
        }

        new Setting(contentEl)
            .setName("Пресет")
            .setDesc("Выберите набор правил оформления.")
            .addDropdown((dd) => {
                for (const p of presets) dd.addOption(p.id, p.name);
                dd.setValue(this.state.presetId);
                dd.onChange((v) => (this.state.presetId = v));
            });

        new Setting(contentEl)
            .setName("Игнорировать разрывы страниц по ---")
            .setDesc("Если включено — строка '---' не будет вставлять разрыв страницы.")
            .addToggle((t) => {
                t.setValue(this.state.ignorePageBreaks);
                t.onChange((v) => (this.state.ignorePageBreaks = v));
            });

        new Setting(contentEl)
            .setName("Нумерация страниц")
            .setDesc("Добавить номер страницы в колонтитул (позиция берётся из пресета).")
            .addToggle((t) => {
                t.setValue(this.state.enablePagination);
                t.onChange((v) => (this.state.enablePagination = v));
            });

        new Setting(contentEl)
            .setName("Автоматическое содержание (Word TOC)")
            .setDesc("Добавит страницу 'СОДЕРЖАНИЕ' и таблицу содержания по заголовкам.")
            .addToggle((t) => {
                t.setValue(this.state.includeToc);
                t.onChange((v) => (this.state.includeToc = v));
            });

        const footer = contentEl.createDiv({ cls: "gost-export-modal-footer" });
        footer.style.display = "flex";
        footer.style.gap = "8px";
        footer.style.marginTop = "16px";
        footer.style.justifyContent = "flex-end";

        const btnCancel = footer.createEl("button", { text: "Отмена" });
        btnCancel.onclick = () => this.close();

        const btnExport = footer.createEl("button", { text: "Экспорт" });
        btnExport.addClass("mod-cta");
        btnExport.onclick = () => {
            this.close();
            this.props.onSubmit({ ...this.state });
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

module.exports = { ExportOptionsModal };
