const { PluginSettingTab, Setting, Notice, Modal } = require("obsidian");
const { getPresetOptions } = require("../gost/gost-loader");
const {PresetEditorModal} = require("./preset-editor-modal");

class GostExportSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "ГОСТ Word Export" });

        /* =======================
           ПРЕСЕТ ПО УМОЛЧАНИЮ
           ======================= */
        new Setting(containerEl)
            .setName("Пресет по умолчанию")
            .setDesc("Используется при Fast Export")
            .addDropdown((dd) => {
                const presets = getPresetOptions(this.plugin.settings.userPresets);
                for (const p of presets) dd.addOption(p.id, p.name);

                dd.setValue(this.plugin.settings.presetId);
                dd.onChange(async (v) => {
                    this.plugin.settings.presetId = v;
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl("h3", { text: "Параметры экспорта (по умолчанию)" });

        /* =======================
           TOGGLES
           ======================= */
        new Setting(containerEl)
            .setName("Игнорировать разрывы страниц ---")
            .addToggle((t) => {
                t.setValue(this.plugin.settings.exportOptions.ignorePageBreaks);
                t.onChange(async (v) => {
                    this.plugin.settings.exportOptions.ignorePageBreaks = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Нумерация страниц")
            .addToggle((t) => {
                t.setValue(this.plugin.settings.exportOptions.enablePagination);
                t.onChange(async (v) => {
                    this.plugin.settings.exportOptions.enablePagination = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Автоматическое содержание (Word)")
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
        containerEl.createEl("h3", { text: "Кастомные шаблоны" });

        // внутри display(), вместо твоего forEach(...)
        this.plugin.settings.userPresets.forEach((p, index) => {
            new Setting(containerEl)
                .setName(p.name || "(без названия)")
                .setDesc(p.id)
                .addExtraButton((b) => {
                    b.setIcon("pencil");
                    b.setTooltip("Редактировать");
                    b.onClick(() => this.openPresetEditor(p, index));
                })
                .addExtraButton((b) => {
                    b.setIcon("download");
                    b.setTooltip("Импорт");
                    b.onClick(() => this.importPreset(index));
                })
                .addExtraButton((b) => {
                    b.setIcon("upload");
                    b.setTooltip("Экспорт");
                    b.onClick(() => this.exportPreset(index));
                })
                .addExtraButton((b) => {
                    b.setIcon("trash");
                    b.setTooltip("Удалить");
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
                    .setButtonText("➕ Добавить пресет")
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
            contentEl.createEl("h2", { text: "Экспорт пресета (JSON)" });

            const ta = contentEl.createEl("textarea");
            ta.value = payload;
            ta.style.width = "100%";
            ta.style.height = "300px";

            ta.focus();
            ta.select();

            new Setting(contentEl)
                .addButton((b) =>
                    b.setButtonText("Скопировать").setCta().onClick(async () => {
                        try {
                            await navigator.clipboard.writeText(payload);
                            new Notice("✅ Скопировано в буфер обмена");
                        } catch {
                            new Notice("⚠️ Не удалось скопировать. Скопируй вручную.");
                        }
                    })
                )
                .addButton((b) => b.setButtonText("Закрыть").onClick(() => modal.close()));
        };

        modal.open();
    }

    importPreset(index) {
        const modal = new Modal(this.app);
        modal.onOpen = () => {
            const { contentEl } = modal;
            contentEl.createEl("h2", { text: "Импорт пресета (JSON)" });

            const ta = contentEl.createEl("textarea");
            ta.placeholder = "Вставь сюда JSON пресета (объект с id/name/preset)...";
            ta.style.width = "100%";
            ta.style.height = "300px";

            new Setting(contentEl)
                .addButton((b) =>
                    b.setButtonText("Импортировать").setCta().onClick(async () => {
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
                            new Notice("✅ Пресет импортирован");
                        } catch (e) {
                            new Notice("❌ Некорректный JSON или структура (нужно: id, name, preset)");
                        }
                    })
                )
                .addButton((b) => b.setButtonText("Отмена").onClick(() => modal.close()));
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

