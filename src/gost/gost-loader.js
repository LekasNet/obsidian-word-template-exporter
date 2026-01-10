// src/gost/gost-loader.js

const preset_7097_2025 = require("./presets/gost-r-7.0.97-2025.json");
const preset_mirea_vkr_7091_2021 = require("./presets/mirea-vkr-gost-r-7.0.91-2021.json");

function validatePreset(p) {
    const errors = [];

    if (!p || typeof p !== "object") errors.push("Preset must be an object");
    if (!p.id || typeof p.id !== "string") errors.push("id must be a string");
    if (!p.name || typeof p.name !== "string") errors.push("name must be a string");

    if (p.page?.marginsMm) {
        const m = p.page.marginsMm;
        for (const k of ["top", "bottom", "left", "right"]) {
            if (m[k] != null && typeof m[k] !== "number") errors.push(`page.marginsMm.${k} must be a number`);
        }
    }

    if (p.styles != null && typeof p.styles !== "object") errors.push("styles must be an object");

    if (errors.length) {
        const msg = `Invalid ГОСТ preset "${p?.id ?? "unknown"}":\n- ` + errors.join("\n- ");
        const err = new Error(msg);
        err.code = "GOST_PRESET_INVALID";
        err.details = errors;
        throw err;
    }

    return p;
}

function getBuiltinPresets() {
    const presets = [
        preset_7097_2025,
        preset_mirea_vkr_7091_2021
    ];

    return presets.map(validatePreset);
}

function getPresetOptions(userPresets = []) {
    const builtIn = getBuiltinPresets().map((p) => ({
        id: p.id,
        name: p.name,
    }));

    const user = (userPresets || []).map((p) => ({
        id: p.id,
        name: `🧩 ${p.name}`,
    }));

    return [...user, ...builtIn];
}

function getPresetById(id, userPresets = []) {
    const user = (userPresets || []).find((p) => p.id === id);
    if (user) return user.preset;

    return getBuiltinPresets().find((p) => p.id === id) || null;
}


module.exports = {
    getBuiltinPresets,
    getPresetOptions,
    getPresetById
};
