const { PluginSettingTab, Setting, Notice, Modal } = require("obsidian");
const { getPresetOptions } = require("../gost/gost-loader");
const {PresetEditorModal} = require("./preset-editor-modal");
const { t } = require("../i18n");

class GostExportSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: t("app.title")});

        /* =======================
           ПРЕСЕТ ПО УМОЛЧАНИЮ
           ======================= */
        new Setting(containerEl)
            .setName(t("settings.presetDefault.title"))
            .setDesc(t("settings.presetDefault.desc"))
            .addDropdown((dd) => {
                const presets = getPresetOptions(this.plugin.settings.userPresets);
                for (const p of presets) dd.addOption(p.id, p.name);

                dd.setValue(this.plugin.settings.presetId);
                dd.onChange(async (v) => {
                    this.plugin.settings.presetId = v;
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl("h3", { text: t("settings.exportDefaults.title") });

        /* =======================
           TOGGLES
           ======================= */
        new Setting(containerEl)
            .setName(t("settings.exportDefaults.ignorePageBreaks.title"))
            .addToggle((t) => {
                t.setValue(this.plugin.settings.exportOptions.ignorePageBreaks);
                t.onChange(async (v) => {
                    this.plugin.settings.exportOptions.ignorePageBreaks = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t("settings.exportDefaults.enablePagination.title"))
            .addToggle((t) => {
                t.setValue(this.plugin.settings.exportOptions.enablePagination);
                t.onChange(async (v) => {
                    this.plugin.settings.exportOptions.enablePagination = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t("settings.exportDefaults.includeToc.title"))
            .addToggle((t) => {
                t.setValue(this.plugin.settings.exportOptions.includeToc);
                t.onChange(async (v) => {
                    this.plugin.settings.exportOptions.includeToc = v;
                    await this.plugin.saveSettings();
                });
            });

        /* =======================
           КАСТОМНЫЕ ПРЕСЕТЫ
           ======================= */
        containerEl.createEl("h3", { text: t("settings.userPresets.title") });

        // внутри display(), вместо твоего forEach(...)
        this.plugin.settings.userPresets.forEach((p, index) => {
            new Setting(containerEl)
                .setName(p.name || t("settings.userPresets.unnamed"))
                .setDesc(p.id)
                .addExtraButton((b) => {
                    b.setIcon("pencil");
                    b.setTooltip(t("tooltips.edit"));
                    b.onClick(() => this.openPresetEditor(p, index));
                })
                .addExtraButton((b) => {
                    b.setIcon("download");
                    b.setTooltip(t("tooltips.import"));
                    b.onClick(() => this.importPreset(index));
                })
                .addExtraButton((b) => {
                    b.setIcon("upload");
                    b.setTooltip(t("buttons.export"));
                    b.onClick(() => this.exportPreset(index));
                })
                .addExtraButton((b) => {
                    b.setIcon("trash");
                    b.setTooltip(t("buttons.delete"));
                    b.onClick(async () => {
                        this.plugin.settings.userPresets.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    });
                });
        });


        new Setting(containerEl)
            .addButton((b) =>
                b
                    .setButtonText(t("settings.userPresets.addPreset"))
                    .setCta()
                    .onClick(() => this.createPreset())
            );
    }

    exportPreset(index) {
        const item = this.plugin.settings.userPresets[index];
        if (!item) return;

        const payload = JSON.stringify(item, null, 2);

        const modal = new Modal(this.app);
        modal.onOpen = () => {
            const { contentEl } = modal;
            contentEl.createEl("h2", { text: t("modal.presetExport.title") });

            const ta = contentEl.createEl("textarea");
            ta.value = payload;
            ta.style.width = "100%";
            ta.style.height = "300px";

            ta.focus();
            ta.select();

            new Setting(contentEl)
                .addButton((b) =>
                    b.setButtonText(t("buttons.copy")).setCta().onClick(async () => {
                        try {
                            await navigator.clipboard.writeText(payload);
                            new Notice(t("notices.preset.copied"));
                        } catch {
                            new Notice(t("notices.preset.copyFail"));
                        }
                    })
                )
                .addButton((b) => b.setButtonText(t("buttons.close")).onClick(() => modal.close()));
        };

        modal.open();
    }

    importPreset(index) {
        const modal = new Modal(this.app);
        modal.onOpen = () => {
            const { contentEl } = modal;
            contentEl.createEl("h2", { text: t("modal.presetImport.title") });

            const ta = contentEl.createEl("textarea");
            ta.placeholder = t("modal.presetImport.placeholder");
            ta.style.width = "100%";
            ta.style.height = "300px";

            new Setting(contentEl)
                .addButton((b) =>
                    b.setButtonText(t("buttons.import")).setCta().onClick(async () => {
                        try {
                            const obj = JSON.parse(ta.value);

                            // минимальная валидация
                            if (!obj || typeof obj !== "object") throw new Error("bad json");
                            if (!obj.id || !obj.name || !obj.preset) throw new Error("missing fields");

                            // если импортируем "в существующий" — заменяем его
                            if (typeof index === "number" && this.plugin.settings.userPresets[index]) {
                                this.plugin.settings.userPresets[index] = obj;
                            } else {
                                this.plugin.settings.userPresets.push(obj);
                            }

                            await this.plugin.saveSettings();
                            this.display();
                            modal.close();
                            new Notice(t("notices.preset.imported"));
                        } catch (e) {
                            new Notice(t("notices.preset.importBad"));
                        }
                    })
                )
                .addButton((b) => b.setButtonText(t("buttons.cancel")).onClick(() => modal.close()));
        };

        modal.open();
    }


    openPresetEditor(preset, index) {
        const modal = new PresetEditorModal(
            this.app,
            preset,
            async (updated) => {
                this.plugin.settings.userPresets[index] = updated;
                await this.plugin.saveSettings();
                this.display();
            }
        );
        modal.open();
    }

    createPreset() {
        const base = {
            id: `custom-${Date.now()}`,
            name: "Новый пресет",
            preset: {},
        };

        this.plugin.settings.userPresets.push(base);
        this.openPresetEditor(base, this.plugin.settings.userPresets.length - 1);
    }
}

module.exports = GostExportSettingTab;

