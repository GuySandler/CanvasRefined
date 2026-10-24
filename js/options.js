// Options page i18n: honours the language picked in the popup, like content.js.
const LANGUAGE_STORAGE_KEY = "selected_locale";
let overrideMessages = null;

async function loadLanguageOverride() {
    try {
        const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
        const locale = stored[LANGUAGE_STORAGE_KEY];
        if (!locale || locale === "auto") { overrideMessages = null; return; }
        const res = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
        if (!res.ok) throw new Error("fetch failed");
        overrideMessages = await res.json();
    } catch (e) {
        overrideMessages = null;
    }
}

function getMsg(key, fallback) {
    if (overrideMessages && overrideMessages[key] && overrideMessages[key].message) {
        return overrideMessages[key].message;
    }
    const m = chrome.i18n.getMessage(key);
    return m || (fallback !== undefined ? fallback : "");
}

function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const msg = getMsg(el.dataset.i18n);
        if (msg) el.textContent = msg;
    });
    const contact = document.getElementById("options-contact");
    if (contact) {
        const msg = getMsg("options_contact", "My email is {{EMAIL}} if you have any issues/suggestions - any feedback is appreciated!");
        const email = "sandlerguy5@gmail.com";
        const parts = msg.split("{{EMAIL}}");
        contact.textContent = "";
        contact.append(parts[0]);
        const strong = document.createElement("span");
        strong.style.fontWeight = "700";
        strong.textContent = email;
        contact.append(strong, parts[1] || "");
    }
}

(async () => {
    await loadLanguageOverride();
    applyI18n();
})();
