const { Plugin } = require("obsidian");
const { registerCommands } = require("./obsidian/commands");
const { DEFAULT_SETTINGS} = require("./obsidian/settings");
const GostExportSettingTab = require("./obsidian/settings-tab");

module.exports = class GostExportPlugin extends Plugin {
    async onload() {
        console.log("ГОСТ Word Export plugin loaded");

        await this.loadSettings();

        // Локализация
        const { initI18n } = require("./i18n");
        initI18n(this.app);


        // Вкладка настроек
        this.addSettingTab(new GostExportSettingTab(this.app, this));

        // Команды
        registerCommands(this);
    }

    async loadSettings() {
        const saved = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
    }
};
