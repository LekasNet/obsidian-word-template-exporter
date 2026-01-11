// src/obsidian/export-options-modal.js

const { Modal, Setting, Notice } = require("obsidian");
const { getPresetOptions } = require("../gost/gost-loader");
const { t } = require("../i18n");

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

        contentEl.createEl("h2", { text: t("modal.exportOptions.title") });

        const presets = getPresetOptions();
        if (!presets.length) {
            new Notice(t("notices.preset.noPresets"));
            this.close();
            return;
        }

        new Setting(contentEl)
            .setName(t("modal.exportOptions.preset.title"))
            .setDesc(t("modal.exportOptions.preset.desc"))
            .addDropdown((dd) => {
                for (const p of presets) dd.addOption(p.id, p.name);
                dd.setValue(this.state.presetId);
                dd.onChange((v) => (this.state.presetId = v));
            });

        new Setting(contentEl)
            .setName(t("modal.exportOptions.ignorePageBreaks.title"))
            .setDesc(t("modal.exportOptions.ignorePageBreaks.desc"))
            .addToggle((t) => {
                t.setValue(this.state.ignorePageBreaks);
                t.onChange((v) => (this.state.ignorePageBreaks = v));
            });

        new Setting(contentEl)
            .setName(t("settings.exportDefaults.enablePagination.title"))
            .setDesc(t("modal.exportOptions.enablePagination.desc"))
            .addToggle((t) => {
                t.setValue(this.state.enablePagination);
                t.onChange((v) => (this.state.enablePagination = v));
            });

        new Setting(contentEl)
            .setName(t("modal.exportOptions.includeToc.title"))
            .setDesc(t("modal.exportOptions.includeToc.desc"))
            .addToggle((t) => {
                t.setValue(this.state.includeToc);
                t.onChange((v) => (this.state.includeToc = v));
            });

        const footer = contentEl.createDiv({ cls: "gost-export-modal-footer" });
        footer.style.display = "flex";
        footer.style.gap = "8px";
        footer.style.marginTop = "16px";
        footer.style.justifyContent = "flex-end";

        const btnCancel = footer.createEl("button", { text: t("buttons.cancel") });
        btnCancel.onclick = () => this.close();

        const btnExport = footer.createEl("button", { text: t("buttons.export") });
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
