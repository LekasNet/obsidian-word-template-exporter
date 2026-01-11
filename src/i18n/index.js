const ru = require("./ru.json");
const en = require("./en.json");
const {moment} = require("obsidian");

// Пытаемся достать getLanguage() из obsidian, но не падаем, если его нет
let obsidianGetLanguage = null;
try {
    const obsidian = require("obsidian");
    obsidianGetLanguage = typeof obsidian.getLanguage === "function" ? obsidian.getLanguage : null;
} catch (_) {}

const dict = { ru, en };

let currentLang = "en";

/**
 * Normalizes any locale-like string into "ru" or "en"
 * - "ru", "ru-RU", "ru_RU" -> "ru"
 * - anything else -> "en"
 */
function normalizeLang(raw) {
    const s = String(raw || "").trim().toLowerCase().replace("_", "-");
    if (s === "ru" || s.startsWith("ru-")) return "ru";
    return "en";
}

function detectFromObsidian(app) {
    // 1) Official API (best)
    try {
        if (obsidianGetLanguage) {
            const lang = obsidianGetLanguage(); // e.g. "en", "ru", "pt-BR" (depends)
            if (lang) return lang;
        }
    } catch (_) {}

    // 2) app.vault.getConfig("language") (may exist depending on version/exposure)
    try {
        const lang =
            app && app.vault && typeof app.vault.getConfig === "function"
                ? app.vault.getConfig("language")
                : null;
        if (lang) return lang;
    } catch (_) {}

    // 3) moment.locale() (sometimes OK, sometimes not in older versions)
    try {
        // moment is usually globally available in Obsidian, but not guaranteed
        if (typeof moment !== "undefined" && typeof moment.locale === "function") {
            const lang = moment.locale();
            if (lang) return lang;
        }
    } catch (_) {}

    return null;
}

function detectSystemLanguage() {
    try {
        if (typeof navigator !== "undefined") {
            // Prefer languages[] if present, else language
            const langs = Array.isArray(navigator.languages) ? navigator.languages : [];
            if (langs.length) return langs[0];
            if (navigator.language) return navigator.language;
        }
    } catch (_) {}
    return null;
}

/**
 * Call once in onload(), after loadSettings().
 * Optionally call again if you want to react to language change (Obsidian doesn’t
 * expose an official event for that, so you'd re-init on app reload only).
 */
function initI18n(app) {
    const obsLang = detectFromObsidian(app);
    const sysLang = detectSystemLanguage();

    // Priority: Obsidian -> System -> default en
    currentLang = normalizeLang(obsLang || sysLang || "en");
}

function getLang() {
    return currentLang;
}

/**
 * t(key, vars?)
 * vars: {name:"x"} -> replaces {name} in translation
 */
function t(key, vars) {
    const table = dict[currentLang] || dict.en;
    let s = (table && table[key]) || dict.en[key] || key;

    if (vars && typeof vars === "object") {
        for (const [k, v] of Object.entries(vars)) {
            s = s.replaceAll(`{${k}}`, String(v));
        }
    }
    return s;
}

module.exports = {
    initI18n,
    t,
    getLang
};
