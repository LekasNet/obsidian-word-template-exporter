// src/obsidian/commands.js

const { Notice } = require("obsidian");
const { getPresetById } = require("../gost/gost-loader");
const { normalizePreset } = require("../gost/gost-schema");
const { exportActiveNoteToDocx } = require("../core/exporter");
const { ExportOptionsModal } = require("./export-options-modal");

function getUserErrorMessage(error) {
    if (!error) return "Неизвестная ошибка";

    if (typeof error === "object" && error.code) {
        switch (error.code) {
            case "PRESET_NOT_FOUND":
                return "Выбранный пресет не найден.";
            case "GOST_PRESET_INVALID":
                return "Некорректный пресет ГОСТ.";
            case "NO_ACTIVE_FILE":
                return "Нет активной заметки для экспорта.";
            case "EXPORT_FAILED":
                return "Ошибка при экспорте в Word.";
            default:
                return "Неизвестная ошибка.";
        }
    }

    if (typeof error?.message === "string" && error.message.trim()) {
        return error.message.trim();
    }

    return "Неизвестная ошибка.";
}

async function runExport(plugin, opts) {
    const rawPreset = getPresetById(opts.presetId);
    if (!rawPreset) {
        const err = new Error("Preset not found");
        err.code = "PRESET_NOT_FOUND";
        throw err;
    }

    const preset = normalizePreset(rawPreset, { longTermStorage: false });

    const result = await exportActiveNoteToDocx(plugin, preset, {
        ignorePageBreaks: !!opts.ignorePageBreaks,
        enablePagination: !!opts.enablePagination,
        includeToc: !!opts.includeToc,
    });

    return result;
}

function registerCommands(plugin) {
    // FAST EXPORT (текущая команда)
    plugin.addCommand({
        id: "export-to-word-gost",
        name: "Export note to Word (ГОСТ) — Fast",
        callback: async () => {
            try {
                const presetId = plugin.settings?.presetId;
                const result = await runExport(plugin, {
                    presetId,
                    ignorePageBreaks: false,
                    enablePagination: true,
                    includeToc: false,
                });

                new Notice(`✅ Экспорт выполнен\n${result.outFilePath}`, 6000);
            } catch (error) {
                console.error("[ГОСТ Export] Ошибка экспорта:", error);
                new Notice(`❌ Экспорт не выполнен\n${getUserErrorMessage(error)}`, 6000);
            }
        },
    });

    // ADVANCED EXPORT (НОВАЯ команда)
    plugin.addCommand({
        id: "export-to-word-gost-advanced",
        name: "Export note to Word (ГОСТ) — Advanced…",
        callback: () => {
            const modal = new ExportOptionsModal(plugin.app, {
                currentPresetId: plugin.settings?.presetId,
                onSubmit: async (opts) => {
                    try {
                        const result = await runExport(plugin, opts);
                        new Notice(`✅ Экспорт выполнен\n${result.outFilePath}`, 6000);
                    } catch (error) {
                        console.error("[ГОСТ Export] Ошибка экспорта:", error);
                        new Notice(`❌ Экспорт не выполнен\n${getUserErrorMessage(error)}`, 6000);
                    }
                },
            });

            modal.open();
        },
    });
}

module.exports = { registerCommands };
