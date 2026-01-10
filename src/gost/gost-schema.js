// src/gost/gost-schema.js

const DEFAULT_PRESET = {
    id: "custom",
    name: "Пользовательский",

    page: {
        size: "A4",
        marginsMm: { top: 20, bottom: 20, left: 20, right: 10 },
        // Для документов > 10 лет хранения в ГОСТе часто фигурирует 30 мм слева,
        // поэтому держим как параметр пресета/политики:
        longTermStorageLeftMarginMm: 30
    },

    font: {
        family: "Times New Roman",
        sizePt: 14
    },

    paragraph: {
        alignment: "justify",        // left | right | center | justify
        firstLineIndentCm: 1.25,
        lineSpacing: 1.5
    },

    pagination: {
        position: "top-center",      // top-center | bottom-center | none
        offsetFromTopMm: 10
    }
};

function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, patch) {
    const out = { ...base };
    if (!isPlainObject(patch)) return out;

    for (const [k, v] of Object.entries(patch)) {
        if (isPlainObject(v) && isPlainObject(base[k])) out[k] = deepMerge(base[k], v);
        else out[k] = v;
    }
    return out;
}

function validateNormalizedPreset(p) {
    const errors = [];

    if (!p.id || typeof p.id !== "string") errors.push("id must be a string");
    if (!p.name || typeof p.name !== "string") errors.push("name must be a string");

    const m = p.page?.marginsMm;
    if (!m) errors.push("page.marginsMm is required");
    else {
        for (const k of ["top", "bottom", "left", "right"]) {
            if (typeof m[k] !== "number") errors.push(`page.marginsMm.${k} must be a number`);
            if (m[k] < 0) errors.push(`page.marginsMm.${k} must be >= 0`);
        }
    }

    if (!p.font?.family || typeof p.font.family !== "string") errors.push("font.family must be a string");
    if (typeof p.font?.sizePt !== "number" || p.font.sizePt <= 0) errors.push("font.sizePt must be a positive number");

    if (typeof p.paragraph?.firstLineIndentCm !== "number") errors.push("paragraph.firstLineIndentCm must be a number");
    if (typeof p.paragraph?.lineSpacing !== "number") errors.push("paragraph.lineSpacing must be a number");

    const okAlign = new Set(["left", "right", "center", "justify"]);
    if (!okAlign.has(p.paragraph?.alignment)) errors.push("paragraph.alignment must be one of left/right/center/justify");

    const okPag = new Set([
        "none",
        "top-left", "top-center", "top-right",
        "bottom-left", "bottom-center", "bottom-right"
    ]);
    if (!okPag.has(p.pagination?.position)) {
        errors.push("pagination.position must be one of none/top-left/top-center/top-right/bottom-left/bottom-center/bottom-right");
    }
    if (typeof p.pagination?.offsetFromTopMm !== "number" || p.pagination.offsetFromTopMm < 0) {
        errors.push("pagination.offsetFromTopMm must be a number >= 0");
    }

    if (errors.length) {
        const err = new Error("Invalid ГОСТ preset: " + errors.join("; "));
        err.code = "GOST_PRESET_INVALID";
        err.details = errors;
        throw err;
    }
}

/**
 * Нормализует пресет: подставляет дефолты + валидирует.
 * @param {object} rawPreset
 * @param {{ longTermStorage?: boolean }} [policy]
 */
function normalizePreset(rawPreset, policy) {
    const merged = deepMerge(DEFAULT_PRESET, rawPreset || {});
    const normalized = merged;

    // Политика (пример): если документ долгого хранения — левое поле 30 мм
    if (policy?.longTermStorage === true) {
        normalized.page.marginsMm.left = normalized.page.longTermStorageLeftMarginMm;
    }

    validateNormalizedPreset(normalized);
    return normalized;
}

module.exports = {
    DEFAULT_PRESET,
    normalizePreset
};
