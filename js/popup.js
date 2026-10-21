const syncedSwitches = ['remind', 'tab_icons', 'dark_mode', 'remlogo', 'full_width', 'auto_dark', 'assignments_due', 'gpa_calc', 'gradient_cards', 'disable_color_overlay', 'dashboard_grades', 'dashboard_notes', 'focus_timer', 'breathing', 'daily_quotes', 'better_todo', 'todo_celebrations_enabled', 'better_sidebar', 'condensed_cards', 'hide_new_canvas', 'hide_sequence_footer', 'center_cards', 'quiz_safe_mode', 'global_search', 'grade_analytics', 'hide_personal_details'];
const syncedSubOptions = [
	"grade_analytics_zones",
	"hide_course_images",
	"todo_hide_feedback",
	"todo_hide_read",
	"todo_full_height",
	"todo_celebrations",
	"todo_celebration_amount",
	"todo_progress_rings",
    "todo_timeframe",
    "todo_timeframe_custom_past",
    "todo_timeframe_custom_future",
	"device_dark",
	"relative_dues",
	"card_overdues",
	"hide_completed_cards",
	"equal_height_cards",
	"gpa_calc_prepend",
	"gpa_calc_cumulative",
	"gpa_calc_weighted",
	"focus_timer_position",
	"focus_timer_preset_1",
	"focus_timer_preset_2",
	"focus_timer_preset_3",
	"breathing_position",
	"breathing_preset_1",
	"breathing_preset_2",
	"breathing_preset_3",
	"daily_quotes_position",
	"widget_row_height",
	"dashboard_notes_height",
	"gpa_calc_height",
	"focus_timer_height",
	"breathing_height",
	"daily_quotes_height",
	"auto_dark",
	"auto_dark_start",
	"auto_dark_end",
	"custom_font_skip_p",
	"num_assignments",
	"assignment_date_format",
	"todo_hr24",
	"todo_separate_scrollbar",
	"todo_alternate_colors",
	"todo_ignore_card_colors",
	"todo_remove_icons",
	"todo_show_scores",
	"grade_hover",
	"card_letter",
	"auto_detect_disabled",
	"num_todo_items",
	"hover_preview",
	"customCardStyles",
	"imageSize",
	"cardRoundness",
	"imageRoundness",
	"cardSpacing",
	"cardWidth",
	"cardHeight",
	"cardPadding",
	// Card Grid settings: included so theme exports/snapshots pick them up.
	"card_grid",
	"card_grid_columns",
	"card_grid_rows",
	"card_grid_column_gap",
	"card_grid_row_gap",
	"card_grid_center_rows",
	"card_grid_flex",
	"customBackgroundLink",
    "customBackgroundScale",
    "customBackgroundDaily",
    "customBackgroundNasaDaily",
    "fitImageToScreen",
    "sidebar_scale",
    "bg_opacity",
    "sidebar_opacity",
    "bg_blur",
    "sidebar_blur",
    "card_opacity",
    "card_blur",
];
const localSwitches = [];
const LANGUAGES = {
    "auto": "Auto (browser)",
    "en": "English",
    "de": "Deutsch",
    "es": "Español",
    "fr": "Français",
    "it": "Italiano",
    "ja": "日本語",
    "pt_PT": "Português",
    "ru": "Русский",
    "sv": "Svenska",
    "zh_CN": "中文 (简体)",
    "zh_TW": "中文 (繁體)"
};
const LANGUAGE_STORAGE_KEY = "selected_locale";
let overrideMessages = null;

async function loadOverrideMessages(locale) {
    if (!locale || locale === "auto") { overrideMessages = null; return; }
    try {
        const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        overrideMessages = await res.json();
        // monkey-patch chrome.i18n so any later getMsg respects override
        if (!chrome.i18n._origGetMessage) {
            chrome.i18n._origGetMessage = chrome.i18n.getMessage.bind(chrome.i18n);
            chrome.i18n.getMessage = (key) => getMsg(key) || chrome.i18n._origGetMessage(key) || "";
        }
    } catch (e) {
        console.warn("Failed to load locale", locale, e);
        overrideMessages = null;
    }
}

function getMsg(key, fallback) {
    if (overrideMessages && overrideMessages[key] && overrideMessages[key].message) {
        return overrideMessages[key].message;
    }
    const orig = chrome.i18n._origGetMessage || chrome.i18n.getMessage.bind(chrome.i18n);
    const m = orig(key);
    if (m) return m;
    return fallback !== undefined ? fallback : "";
}

function applyI18nOverride() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const msg = getMsg(key);
        if (msg) el.textContent = msg;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const msg = getMsg(el.dataset.i18nPlaceholder);
        if (msg) el.placeholder = msg;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const msg = getMsg(el.dataset.i18nTitle);
        if (msg) el.title = msg;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const msg = getMsg(el.dataset.i18nAriaLabel);
        if (msg) el.setAttribute("aria-label", msg);
    });
}

async function initLanguageSelector() {
    const sel = document.getElementById("language-select");
    if (!sel) return;
    // populate
    for (const [code, label] of Object.entries(LANGUAGES)) {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = getMsg(code === "auto" ? "language_auto" : code, label) || label;
        // keep native label for non-auto, but allow translation for auto
        if (code !== "auto") opt.textContent = label;
        else opt.textContent = getMsg("language_auto") || label;
        sel.appendChild(opt);
    }
    const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
    const current = stored[LANGUAGE_STORAGE_KEY] || "auto";
    sel.value = current;
    await loadOverrideMessages(current);
    if (current !== "auto") applyI18nOverride();
    sel.addEventListener("change", async () => {
        const next = sel.value;
        await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
        await loadOverrideMessages(next);
        applyI18nOverride();
        // also update dynamic celebration labels etc that use getMsg
        const label = document.getElementById("todo_celebrations_label");
        if (label) {
            // trigger rerender via storage event or just reload popup text
            // easiest: reload popup
            location.reload();
        } else {
            location.reload();
        }
    });
}


// Theme export carries visual settings only, never productivity data.
const exportDarkSchedule = ["auto_dark", "auto_dark_start", "auto_dark_end", "device_dark"];
const exportCardColorToggles = ["gradient_cards", "disable_color_overlay"];
const exportCardStyles = ["customCardStyles", "imageSize", "cardRoundness", "imageRoundness", "cardSpacing", "cardWidth", "cardHeight", "cardPadding", "card_grid", "card_grid_columns", "card_grid_rows", "card_grid_column_gap", "card_grid_row_gap", "card_grid_center_rows", "card_grid_flex"];
const exportLayout = ["full_width", "center_cards", "condensed_cards", "equal_height_cards", "remlogo", "hide_new_canvas", "hide_navbar", "tab_icons"];
const exportSidebar = ["better_sidebar", "sidebar_scale"];
const exportTodo = ["better_todo", "todo_hide_feedback", "todo_hide_read", "todo_full_height", "todo_celebrations_enabled", "todo_celebrations", "todo_celebration_amount", "todo_progress_rings", "todo_timeframe", "todo_timeframe_custom_past", "todo_timeframe_custom_future", "todo_hr24", "todo_separate_scrollbar", "todo_alternate_colors", "todo_ignore_card_colors", "todo_remove_icons", "todo_show_scores", "hover_preview"];
const exportGpa = ["gpa_calc", "gpa_calc_prepend", "gpa_calc_cumulative", "gpa_calc_weighted"];
const exportBackground = ["customBackgroundLink", "customBackgroundScale", "customBackgroundDaily", "customBackgroundNasaDaily", "fitImageToScreen", "card_transparency", "bg_opacity", "sidebar_opacity", "bg_blur", "sidebar_blur", "card_opacity", "card_blur"];
// Master "On/off toggles": every visual toggle, minus GPA/schedule/productivity.
const exportToggles = ["dark_mode", "quiz_safe_mode", "grade_analytics", "grade_analytics_zones"].concat(exportCardColorToggles, exportLayout, exportSidebar, exportTodo);
const fontsDropdownStateKey = "fonts_dropdown_open";

const apiurl = "none";

const defaultOptions = {
    "local": {
        "previous_colors": null,
        "previous_theme": null,
        "errors": [],
    },
    "sync": {
        "dark_preset": {
            "background-0": "#161616",
            "background-1": "#1e1e1e",
            "background-2": "#262626",
            "borders": "#3c3c3c",
            "text-0": "#f5f5f5",
            "text-1": "#e2e2e2",
            "text-2": "#ababab",
            "links": "#56Caf0",
            "sidebar": "#1e1e1e",
            "sidebar-text": "#f5f5f5"
        },
        "new_install": true,
        "assignments_due": true,
        "hide_personal_details": false,
        "hide_course_images": false,
        "gpa_calc": false,
        "dark_mode": true,
        "gradent_cards": false,
        "disable_color_overlay": false,
        "auto_dark": false,
        "auto_dark_start": { "hour": "20", "minute": "00" },
        "auto_dark_end": { "hour": "08", "minute": "00" },
        "num_assignments": 4,
        "custom_domain": [""],
        "custom_domain_denied": [],
        "auto_detect_disabled": false,
        "assignments_done": [],
        "dashboard_grades": false,
        "assignment_date_format": false,
        "dashboard_notes": false,
        "dashboard_notes_text": "",
        "dashboard_notes_mode": "edit",
        "dashboard_notes_position": "top",
        "gpa_calc_position": "cards_end",
        "focus_timer": false,
        "focus_timer_position": "cards_end",
        "focus_timer_preset_1": { "h": 0, "m": 15, "s": 0 },
        "focus_timer_preset_2": { "h": 0, "m": 25, "s": 0 },
        "focus_timer_preset_3": { "h": 0, "m": 45, "s": 0 },
        "breathing": false,
        "breathing_position": "cards_end",
        "breathing_preset_1": { "h": 0, "m": 3, "s": 0 },
        "breathing_preset_2": { "h": 0, "m": 5, "s": 0 },
        "breathing_preset_3": { "h": 0, "m": 10, "s": 0 },
        "daily_quotes": false,
        "daily_quotes_position": "top",
        // Height in px (0 = auto); widget_row_height is the shared Top/Bottom row.
        "widget_row_height": 0,
        "dashboard_notes_height": 0,
        "gpa_calc_height": 0,
        "focus_timer_height": 0,
        "breathing_height": 0,
        "daily_quotes_height": 0,
        "better_todo": true,
        "better_sidebar": false,
        "sidebar_scale": 100,
        "bg_opacity": 65,
        "sidebar_opacity": 100,
        "bg_blur": 8,
        "sidebar_blur": 0,
        "card_transparency": false,
        "card_opacity": 80,
        "card_blur": 8,
        "todo_hr24": false,
        "anon_grade_level": "high",
        "anon_grade_seed": 0,
        "anon_fake_todo": false,
        "anon_fake_completed": 2,
        "anon_progress_enabled": false,
        "anon_progress_done": 12,
        "anon_progress_total": 18,
		"todo_separate_scrollbar": false,
		"todo_alternate_colors": false,
		"todo_ignore_card_colors": false,
		"todo_remove_icons": false,
		"todo_show_scores": false,
        "todo_hide_read": true,
        "condensed_cards": false,
        "center_cards": false,
        "custom_cards": {},
        "custom_cards_2": {},
        "custom_cards_3": {},
        "custom_assignments": [],
        "custom_assignments_overflow": ["custom_assignments"],
        "grade_hover": false,
        "card_letter": true,
        "num_todo_items": 10,
        "custom_font": { "link": "", "family": "" },
        "custom_font_skip_p": false,
        "hover_preview": true,
        "full_width": null,
        "remlogo": null,
        "gpa_calc_bounds": {
            "A+": { "cutoff": 97, "gpa": 4.0 },
            "A": { "cutoff": 93, "gpa": 4 },
            "A-": { "cutoff": 90, "gpa": 3.7 },
            "B+": { "cutoff": 87, "gpa": 3.3 },
            "B": { "cutoff": 83, "gpa": 3 },
            "B-": { "cutoff": 80, "gpa": 2.7 },
            "C+": { "cutoff": 77, "gpa": 2.3 },
            "C": { "cutoff": 73, "gpa": 2 },
            "C-": { "cutoff": 70, "gpa": 1.7 },
            "D+": { "cutoff": 67, "gpa": 1.3 },
            "D": { "cutoff": 63, "gpa": 1 },
            "D-": { "cutoff": 60, "gpa": .7 },
            "F": { "cutoff": 0, "gpa": 0 }
        },
        "card_overdues": false,
        "hide_completed_cards": false,
        "relative_dues": false,
        "equal_height_cards": false,
        "hide_new_canvas": true,
        "hide_sequence_footer": false,
        "hide_navbar": false,
        "grade_analytics_zones": false,
        "quiz_safe_mode": false,
        "dark_mode_fix": [],
        "assignment_states": {},
        "tab_icons": false,
        "todo_hide_feedback": false,
		"todo_full_height": false,
        "todo_progress_rings": "rings",
		"todo_timeframe": "all",
		"todo_timeframe_custom_past": 7,
		"todo_timeframe_custom_future": 14,
		"todo_more_expanded": false,
		"todo_celebrations_enabled": true,
		"todo_celebrations": ["confetti"],
		"todo_celebration_amount": "normal",
        "device_dark": false,
        "cumulative_gpa": { "name": "Cumulative GPA", "hidden": false, "weight": "dnc", "credits": 999, "gr": 3.21 },
        "card_method_date": false,
        "card_method_dashboard": true,
        "card_limit": 25,
        "imageSize": 100,
        "cardRoundness": 5,
        "imageRoundness": 0,
        "cardSpacing": 0,
        "cardWidth": 262,
        "cardHeight": 146,
        "cardPadding": 0,
        "card_grid": false,
        "card_grid_columns": 4,
        "card_grid_rows": 3,
        "card_grid_column_gap": 12,
        "card_grid_row_gap": 12,
        "card_grid_center_rows": false,
        "card_grid_flex": false,
        "customCardStyles": false,
        "customBackgroundLink": "",
        "customBackgroundScale": 100,
        "customBackgroundDaily": false,
        "customBackgroundNasaDaily": false,
        "fitImageToScreen": false,
    }
};


sendFromPopup("getCards");

chrome.storage.onChanged.addListener((changes) => {
    if (changes["custom_cards"]) {
        if (Object.keys(changes["custom_cards"].oldValue || {}).length !== Object.keys(changes["custom_cards"].newValue || {}).length) {
            displayAdvancedCards();
        }
        updateCardGridPreview();
        scheduleGridPreviewFollowUp();
    }
});

// Live count comes from the dashboard DOM, which races the popup's storage
// listener; one debounced follow-up render re-syncs the preview.
let gridPreviewFollowUpTimer = null;
function scheduleGridPreviewFollowUp() {
    if (gridPreviewFollowUpTimer) clearTimeout(gridPreviewFollowUpTimer);
    gridPreviewFollowUpTimer = setTimeout(() => {
        gridPreviewFollowUpTimer = null;
        updateCardGridPreview();
    }, 800);
}

function displayErrors() {
    chrome.storage.local.get("errors", storage => {
        storage["errors"].forEach(e => {
            document.querySelector("#error_log_output").value += (e + "\n\n");
        })
    });
}

function displayDarkModeFixUrls() {
    let output = document.getElementById("dark-mode-fix-urls");
    output.textContent = "";
    chrome.storage.sync.get("dark_mode_fix", sync => {
        sync["dark_mode_fix"].forEach(url => {
            let div = makeElement("div", output, { "className": "customization-button", "textContent": url });
            div.classList.add("fixed-url");
            let btn = makeElement("button", div, { "className": "dd", "textContent": "x" });
            btn.addEventListener("click", () => {
                chrome.storage.sync.get("dark_mode_fix", sync => {
                    for (let i = 0; i < sync["dark_mode_fix"].length; i++) {
                        if (sync["dark_mode_fix"][i] === url) {
                            sync["dark_mode_fix"].splice(i);
                            chrome.storage.sync.set({ "dark_mode_fix": sync["dark_mode_fix"] }).then(() => div.remove());
                        }
                    }
                });
            })
        })
    })
}

document.addEventListener("DOMContentLoaded", setup);

document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("social-toggle");
    const buttons = document.querySelector(".social-buttons");
    const rateLink = document.getElementById("rate-link");
    if (!toggle || !buttons) return;

    // One review link, pointed at whichever store this browser installs from.
    if (rateLink) {
        const isFirefox = /firefox/i.test(navigator.userAgent);
        const key = isFirefox ? "rate_us_firefox" : "rate_us_chrome";
        rateLink.href = isFirefox
            ? "https://addons.mozilla.org/en-US/firefox/addon/canvas-refined/reviews/"
            : "https://chromewebstore.google.com/detail/canvas-refined/ihienfbdfdamhmhhiokjnjmpjgbenedg/reviews";
        rateLink.dataset.i18n = key;
        const msg = getMsg(key);
        if (msg) rateLink.textContent = msg;
    }

    const KEY = "hide_socials";
    const render = (hidden) => {
        buttons.classList.toggle("hidden", hidden);
        if (rateLink) rateLink.classList.toggle("hidden", hidden);
        toggle.textContent = getMsg(hidden ? "show_links" : "hide_links") || (hidden ? "Show links" : "Hide links");
    };
    chrome.storage.local.get(KEY, (res) => render(!!res[KEY]));
    const flip = () => chrome.storage.local.get(KEY, (res) => {
        const next = !res[KEY];
        chrome.storage.local.set({ [KEY]: next });
        render(next);
    });
    toggle.addEventListener("click", flip);
    toggle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
});

function setupAssignmentsSlider(initial) {
    let el = document.querySelector('#numAssignmentsSlider');
    el.value = initial;
    document.querySelector('#numAssignments').textContent = initial;
    el.addEventListener('input', function () {
        document.querySelector('#numAssignments').textContent = this.value;
        chrome.storage.sync.set({ "num_assignments": this.value });
    });
}

function setupTodoSlider(initial) {
    let el = document.querySelector('#numTodoItemsSlider');
    el.value = initial;
    document.querySelector('#numTodoItems').textContent = initial;
    document.querySelector('#numTodoItemsSlider').addEventListener('input', function () {
        document.querySelector('#numTodoItems').textContent = this.value;
        chrome.storage.sync.set({ "num_todo_items": this.value });
    });
}

function setupSidebarScaleSlider(initial) {
    let el = document.querySelector("#sidebarScaleSlider");
    if (!el) return;
    el.value = initial;
    document.querySelector("#sidebarScaleValue").textContent = initial;
    el.addEventListener("input", function () {
        document.querySelector("#sidebarScaleValue").textContent = this.value;
        chrome.storage.sync.set({ "sidebar_scale": parseInt(this.value) });
    });
}

// Slider 0..max; `unit` is appended to the displayed value ("%" / "px").
function setupRangeSlider(key, sliderId, valueId, resetId, defaultValue, max, unit, initial) {
    const el = document.querySelector("#" + sliderId);
    const out = document.querySelector("#" + valueId);
    if (!el || !out) return;
    const value = Math.max(0, Math.min(max, parseInt(initial)));
    if (isNaN(value)) return;
    el.value = value;
    out.textContent = `${value}${unit}`;
    el.addEventListener("input", function () {
        out.textContent = `${this.value}${unit}`;
        chrome.storage.sync.set({ [key]: parseInt(this.value) });
    });
    const reset = document.querySelector("#" + resetId);
    if (reset) {
        reset.addEventListener("click", () => {
            const v = Math.max(0, Math.min(max, parseInt(defaultValue)));
            el.value = v;
            out.textContent = `${v}${unit}`;
            chrome.storage.sync.set({ [key]: v });
        });
    }
}

// Legacy booleans: true -> rings, false/undefined -> none.
function setupProgressRingsSelect(initial) {
    const el = document.querySelector("#todo_progress_rings");
    if (!el) return;
    let value = initial;
    if (value === true) value = "rings";
    else if (value === false || value === undefined || value === null) value = "none";
    const allowed = ["none", "rings", "rainbow", "lines", "line"];
    if (!allowed.includes(value)) value = "rings";
    el.value = value;
    el.addEventListener("change", function () {
        chrome.storage.sync.set({ "todo_progress_rings": this.value });
    });
}

// `todo_celebrations`: multi-select effect ids, one picked at random per
// completion. `todo_celebration_amount` scales intensity.
const CELEBRATION_TYPES = [
    { id: "confetti", label: getMsg("celebration_confetti") || "Confetti" },
    { id: "fireworks", label: getMsg("celebration_fireworks") || "Fireworks" },
    { id: "sparkles", label: getMsg("celebration_sparkles") || "Sparkle burst" },
    { id: "hearts", label: getMsg("celebration_hearts") || "Rising hearts" },
    { id: "rocket", label: getMsg("celebration_rocket") || "Rocket" },
];

// Accepts the legacy todo_confetti boolean and drops unknown ids.
function resolveCelebrations(raw, legacyConfetti) {
    if (Array.isArray(raw)) {
        return [...new Set(raw.filter(id => CELEBRATION_TYPES.some(t => t.id === id)))];
    }
    return legacyConfetti === false ? [] : ["confetti"];
}

function setupCelebrationsSelect(initial) {
    const wrap = document.getElementById("todo_celebrations");
    const btn = document.getElementById("todo_celebrations_btn");
    const menu = document.getElementById("todo_celebrations_menu");
    const label = document.getElementById("todo_celebrations_label");
    if (!wrap || !btn || !menu || !label) return;

    let selected = [];
    const renderMenu = () => {
        menu.innerHTML = CELEBRATION_TYPES.map(t => `
            <label class="celebration-option">
                <input type="checkbox" value="${t.id}" ${selected.includes(t.id) ? "checked" : ""}>
                <span>${t.label}</span>
            </label>
        `).join("");
        menu.querySelectorAll("input").forEach(input => {
            input.addEventListener("change", () => {
                if (input.checked) {
                    if (!selected.includes(input.value)) selected.push(input.value);
                } else {
                    selected = selected.filter(id => id !== input.value);
                }
                updateLabel();
                chrome.storage.sync.set({ "todo_celebrations": selected });
            });
        });
    };
    const updateLabel = () => {
        if (selected.length === 0) label.textContent = getMsg("celebration_none") || "None";
        else if (selected.length === 1) label.textContent = CELEBRATION_TYPES.find(t => t.id === selected[0]) ? (getMsg("celebration_" + selected[0]) || CELEBRATION_TYPES.find(t => t.id === selected[0]).label) : (getMsg("celebration_none") || "None");
        else label.textContent = (getMsg("selected_count") || "$COUNT$ selected").replace("$COUNT$", selected.length);
    };

    // Legacy key: the special handler only passes the new one.
    chrome.storage.sync.get("todo_confetti", legacy => {
        selected = resolveCelebrations(initial, legacy && legacy["todo_confetti"]);
        renderMenu();
        updateLabel();
    });

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = wrap.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        // The box sits low in the popup; flip the menu up when it would overflow.
        if (open) {
            const mr = menu.getBoundingClientRect();
            if (mr.bottom > window.innerHeight - 8) wrap.classList.add("flip-up");
            else wrap.classList.remove("flip-up");
        }
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) {
            wrap.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
        }
    });
}

function setupCelebrationAmount(initial) {
    const el = document.getElementById("todo_celebration_amount");
    if (!el) return;
    const allowed = ["less", "normal", "more", "crazy"];
    el.value = allowed.includes(initial) ? initial : "normal";
    el.addEventListener("change", function () {
        chrome.storage.sync.set({ "todo_celebration_amount": this.value });
    });
}

// Asks Canvas tabs to run the effect on a fake task; no reply means no tab open.
function setupCelebrationPreview() {
    const btn = document.getElementById("celebration-preview-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
        const res = await sendFromPopup("previewCelebration");
        if (!res || res.ok !== true) {
            displayAlert(true, getMsg("open_canvas_preview") || "Open a Canvas page to preview celebrations.");
        }
    });
}

function toggleCelebrationOptionsVisibility(enabled) {
    document.querySelectorAll("#celebrations-container .celebration-sub").forEach(row => {
        row.style.display = enabled ? "" : "none";
    });
}

function toggleCelebrationsVisibility(betterTodoOn) {
    const el = document.getElementById("celebrations-container");
    if (el) el.style.display = betterTodoOn ? "" : "none";
}

// Expanded state is persisted so the popup reopens the same way.
function setupTodoMoreOptions(initial) {
    const wrap = document.getElementById("todo-more-options");
    const toggle = document.getElementById("todo-more-toggle");
    if (!wrap || !toggle) return;
    const setExpanded = (expanded) => {
        wrap.classList.toggle("expanded", expanded === true);
        toggle.setAttribute("aria-expanded", expanded === true ? "true" : "false");
    };
    setExpanded(initial === true);
    const flip = () => {
        const expanded = !wrap.classList.contains("expanded");
        setExpanded(expanded);
        chrome.storage.sync.set({ "todo_more_expanded": expanded });
    };
    toggle.addEventListener("click", flip);
    toggle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            flip();
        }
    });
}

// Persisted across sessions; "custom" reveals the two day inputs.
function setTimeframeCustomVisibility(value) {
    const wrap = document.getElementById("todo_timeframe_custom");
    if (wrap) wrap.classList.toggle("visible", value === "custom");
}

function setupTimeframeSelect(initial) {
    const el = document.querySelector("#todo_timeframe");
    if (!el) return;
    const allowed = ["all", "1week", "2week", "month", "2month", "custom"];
    let value = allowed.includes(initial) ? initial : "all";
    el.value = value;
    setTimeframeCustomVisibility(value);
    el.addEventListener("change", function () {
        chrome.storage.sync.set({ "todo_timeframe": this.value });
        setTimeframeCustomVisibility(this.value);
    });
}

// Clamped to 0-365 so a typo can't hide every task.
function setupCustomTimeframeInput(key, initial, fallback) {
    const el = document.querySelector("#" + key);
    if (!el) return;
    const clamp = (v) => Math.max(0, Math.min(365, v));
    const parsed = parseInt(initial);
    el.value = isNaN(parsed) ? fallback : clamp(parsed);
    el.addEventListener("change", function () {
        const v = clamp(parseInt(this.value));
        this.value = v;
        chrome.storage.sync.set({ [key]: v });
    });
}

function setupAnonGradeSelect(initial) {
    const el = document.querySelector("#anon_grade_preset");
    if (!el) return;
    const allowed = ["high", "medhigh", "med", "medlow"];
    el.value = allowed.includes(initial) ? initial : "high";
    el.addEventListener("change", function () {
        chrome.storage.sync.set({ "anon_grade_level": this.value });
    });
}

function setupAnonFakeCompleted(initial) {
    const el = document.querySelector("#anon_fake_completed");
    if (!el) return;
    const clamp = (v) => Math.max(0, Math.min(7, v));
    const parsed = parseInt(initial);
    el.value = isNaN(parsed) ? 2 : clamp(parsed);
    el.addEventListener("change", function () {
        const v = clamp(parseInt(this.value));
        this.value = v;
        chrome.storage.sync.set({ "anon_fake_completed": v });
    });
}

function toggleAnonFakeCompletedVisibility(show) {
    const wrap = document.getElementById("anon_fake_completed_wrap");
    if (wrap) wrap.style.display = show ? "flex" : "none";
}

function setupAnonProgressInput(key, initial, isDone) {
    const el = document.querySelector("#" + key);
    if (!el) return;
    const clamp = (v) => {
        if (isDone) {
            const total = parseInt(document.querySelector("#anon_progress_total")?.value) || 18;
            return Math.max(0, Math.min(999, Math.min(total, v)));
        }
        return Math.max(1, Math.min(999, v));
    };
    const parsed = parseInt(initial);
    el.value = isNaN(parsed) ? (isDone ? 12 : 18) : clamp(parsed);
    el.addEventListener("change", function () {
        const v = clamp(parseInt(this.value));
        this.value = v;
        chrome.storage.sync.set({ [key]: v });
    });
}

function setupAutoDarkInput(initial, time) {
    let el = document.querySelector('#' + time);
    el.value = initial.hour + ":" + initial.minute;
    el.addEventListener('change', function () {
        let timeinput = { "hour": this.value.split(':')[0], "minute": this.value.split(':')[1] };
        time === "auto_dark_start" ? chrome.storage.sync.set({ auto_dark_start: timeinput }) : chrome.storage.sync.set({ auto_dark_end: timeinput });
    });
}


function setupCardLimitSlider(initial) {
    let el = document.querySelector("#card_limit");
    el.value = initial;
    document.querySelector("#card_limit_num").textContent = initial;
    el.addEventListener("change", (e) => {
        chrome.storage.sync.set({ "custom_cards": {}, "custom_cards_2": {}, "custom_cards_3": {}, "card_limit": parseInt(e.target.value)});
    });
    el.addEventListener("input", (e) => {
        document.querySelector("#card_limit_num").textContent = e.target.value;
    })
}

function setupDashboardMethod(initial) {
    const el = document.getElementById("card_method_dashboard");
    el.checked = initial === true ? true : false;

    el.addEventListener("change", (e) => {
        chrome.storage.sync.set({ "custom_cards": {}, "custom_cards_2": {}, "custom_cards_3": {}, "card_method_dashboard": e.target.checked });
    });
}

// Debounced 200ms: storage.sync allows only 120 writes/min per key set.
// Applied to every card-style number input.
const cardStyleSetTimers = {};
function debouncedCardStyleSet(key, value, delay = 200) {
    if (cardStyleSetTimers[key]) clearTimeout(cardStyleSetTimers[key]);
    cardStyleSetTimers[key] = setTimeout(() => {
        chrome.storage.sync.set({ [key]: value });
    }, delay);
}

function setupImageSizeInput(initial) {
    let el = document.querySelector("#imageSize");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("imageSize", e.target.value);
    });
}

function setupCardRoundnessInput(initial) {
    let el = document.querySelector("#cardRoundness");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("cardRoundness", e.target.value);
    });
}

function setupImageRoundnessInput(initial) {
    let el = document.querySelector("#imageRoundness");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("imageRoundness", e.target.value);
    });
}

function setupCardSpacingInput(initial) {
    let el = document.querySelector("#cardSpacing");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("cardSpacing", e.target.value);
    });
}

function setupCardWidthInput(initial) {
    let el = document.querySelector("#cardWidth");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("cardWidth", e.target.value);
    });
}

function setupCardHeightInput(initial) {
	let el = document.querySelector("#cardHeight");
	el.value = initial;
	el.addEventListener("input", (e) => {
		debouncedCardStyleSet("cardHeight", e.target.value);
	});
}

function setupCardPaddingInput(initial) {
    let el = document.querySelector("#cardPadding");
    el.value = initial;
    el.addEventListener("input", (e) => {
        debouncedCardStyleSet("cardPadding", e.target.value);
    });
}

// Wires the options panel reveal, squares preview and cut-off warning.
function setupCardGrid(initial) {
    const panel = document.getElementById("card-grid-options");
    if (!panel) return;
    panel.style.display = initial === true ? "" : "none";
    // Deferred: a synchronous render would run before the count inputs get their
    // stored values and would preview the HTML defaults.
    setTimeout(() => updateCardGridPreview(), 0);
    document.getElementById("card_grid").addEventListener("change", (e) => {
        panel.style.display = e.target.checked ? "" : "none";
        if (e.target.checked) updateCardGridPreview();
    });
    document.getElementById("card_grid_center_rows").addEventListener("change", () => {
        updateCardGridPreview();
    });
    document.getElementById("card_grid_flex")?.addEventListener("change", () => {
        updateCardGridPreview();
    });
}

// Preview updates on every keystroke, the storage write is debounced.
// `fallback` applies when the field is cleared or invalid.
function setupCardGridCountInput(id, initial, fallback = 1) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = initial;
    el.addEventListener("input", (e) => {
        updateCardGridPreview();
        const num = parseInt(e.target.value, 10);
        debouncedCardStyleSet(id, isNaN(num) ? fallback : num);
    });
}

// Used when no dashboard tab answered "getGridCardCount" (popup opened
// outside Canvas). Treated as truthy so legacy "true" strings count.
function countActiveDashboardCards(cards) {
    return Object.values(cards || {}).filter(c => c && typeof c === "object" && !c.hidden && !c.hide).length;
}

function updateCardGridPreview() {
    const panel = document.getElementById("card-grid-options");
    const preview = document.getElementById("card-grid-preview");
    if (!panel || !preview || panel.style.display === "none") return;
    const cols = Math.max(1, parseInt(document.getElementById("card_grid_columns").value, 10) || 1);
    const rows = Math.max(1, parseInt(document.getElementById("card_grid_rows").value, 10) || 1);
    const colGapRaw = parseInt(document.getElementById("card_grid_column_gap").value, 10);
    const colGap = Math.max(0, Math.min(10, isNaN(colGapRaw) ? 12 : colGapRaw));
    const total = cols * rows;
    preview.style.gridTemplateColumns = `repeat(${cols}, 18px)`;
    // Clamped so extreme values don't blow the layout out.
    preview.style.columnGap = `${colGap}px`;
    preview.style.rowGap = "4px";
    preview.innerHTML = "";
    chrome.storage.sync.get(["custom_cards", "gpa_calc"], async s => {
        if (document.getElementById("card-grid-options").style.display === "none") return;
        // Prefer the live count from a dashboard tab; it knows which cards are
        // actually rendered. Falls back to the storage-derived count.
        const live = await sendFromPopup("getGridCardCount");
        let active = (live && typeof live.count === "number" && live.count >= 0)
            ? live.count
            : countActiveDashboardCards(s.custom_cards);
        if (s.gpa_calc === true) active += 1;
        let lastRowStart = -1, offset = 0;
        if (document.getElementById("card_grid_center_rows")?.checked === true && active > 0 && active < total) {
            lastRowStart = Math.floor((active - 1) / cols) * cols;
            const inLastRow = active - lastRowStart;
            if (inLastRow < cols) offset = cols - inLastRow;
        }
        for (let i = 0; i < total; i++) {
            const inShiftedRow = lastRowStart !== -1 && i >= lastRowStart;
            if (inShiftedRow && i >= active) continue;
            const square = document.createElement("div");
            square.style.cssText = "width:18px;height:18px;border-radius:4px;box-sizing:border-box;";
            square.style.background = i < active ? "#56Caf0" : "#3c3c3c";
            if (inShiftedRow && offset > 0) {
                square.style.marginLeft = `${offset * (18 + colGap) / 2}px`;
            }
            preview.appendChild(square);
        }
        const warning = document.getElementById("card-grid-warning");
        if (warning) {
            if (s.card_grid_flex === true) {
                warning.textContent = getMsg("flexible_grid_on") || "Flexible grid is on - cards wrap to fit narrow windows instead of being cut off.";
                warning.style.display = "block";
            } else if (active > total) {
                const gpaNote = s.gpa_calc === true ? getMsg("grid_includes_gpa", " (including the GPA calculator)") : "";
                warning.textContent = "\u26A0 " + (getMsg("grid_warning") || "Your grid holds $TOTAL$ card$TOTAL_S$ but you have $ACTIVE$ card$ACTIVE_S$$GPA_NOTE$ - some cards may be cut off.").replace("$TOTAL$", total).replace("$TOTAL_S$", total === 1 ? "" : "s").replace("$ACTIVE$", active).replace("$ACTIVE_S$", active === 1 ? "" : "s").replace("$GPA_NOTE$", gpaNote);
                warning.style.display = "block";
            } else {
                warning.style.display = "none";
            }
        }
    });
}

function setupCustomBackgroundLink(initial) {
    let el = document.querySelector("#customBackgroundLink");
    el.value = initial || "";
    toggleOpacityOptions();
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "customBackgroundLink": e.target.value });
        renderBackgroundPresetSelection();
        toggleOpacityOptions();
    });
}

function setupCustomBackgroundScale(initial) {
    const el = document.querySelector("#customBackgroundScale");
    const output = document.querySelector("#customBackgroundScaleValue");
    if (!el || !output) return;
    const value = Number(initial) || 100;
    el.value = value;
    output.textContent = `${value}%`;
    el.addEventListener("input", (e) => {
        const nextValue = parseInt(e.target.value);
        output.textContent = `${nextValue}%`;
        chrome.storage.sync.set({ "customBackgroundScale": nextValue });
        renderBackgroundPresetSelection();
    });
}

function getDailyBackgroundPreset() {
    if (typeof backgroundPresets === "undefined" || !Array.isArray(backgroundPresets) || backgroundPresets.length === 0) {
        return null;
    }

    const today = new Date();
    const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
    return backgroundPresets[Math.abs(dayNumber) % backgroundPresets.length];
}

function syncCustomBackgroundDailyState(isDaily) {
    const manualControls = document.getElementById("customBackgroundManualControls");
    if (manualControls) {
        manualControls.style.opacity = isDaily ? "0.45" : "1";
        manualControls.style.pointerEvents = isDaily ? "none" : "auto";
        manualControls.style.filter = isDaily ? "grayscale(1)" : "none";
    }

    ["customBackgroundLink", "customBackgroundScale", "clearCustomBackground"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isDaily;
    });

    document.querySelectorAll(".background-preset-card").forEach(button => {
        button.disabled = isDaily;
    });

    renderBackgroundPresetSelection();
}

function renderBackgroundPresetSelection() {
    const isDaily = document.querySelector("#customBackgroundDaily")?.checked === true || document.querySelector("#customBackgroundNasaDaily")?.checked === true;
    const dailyPreset = isDaily ? getDailyBackgroundPreset() : null;
    const currentLink = isDaily ? (dailyPreset?.url || "") : (document.querySelector("#customBackgroundLink")?.value || "");
    const currentScale = isDaily ? String(dailyPreset?.scale || "100") : String(document.querySelector("#customBackgroundScale")?.value || "100");
    document.querySelectorAll(".background-preset-card").forEach(button => {
        const matchesLink = button.dataset.backgroundUrl === currentLink;
        const matchesScale = button.dataset.backgroundScale === currentScale;
        button.classList.toggle("selected", matchesLink && matchesScale);
    });
}

function displayBackgroundPresets() {
    const container = document.querySelector("#background-presets");
    if (!container || container.dataset.rendered === "true" || typeof backgroundPresets === "undefined") return;
    container.dataset.rendered = "true";
    container.innerHTML = backgroundPresets.map(preset => `
        <button type="button" class="theme-button customization-button background-preset-card" data-background-url="${preset.url}" data-background-scale="${preset.scale}" style="background-image: linear-gradient(rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.42)), url('${preset.url}');">
            <p class="theme-button-title">${preset.title}</p>
            <p class="theme-button-creator">${preset.credit}</p>
            <p class="background-preset-scale">Scale ${preset.scale}%</p>
        </button>
    `).join("");

    container.querySelectorAll(".background-preset-card").forEach(button => {
        button.addEventListener("click", () => {
            const backgroundUrl = button.dataset.backgroundUrl;
            const backgroundScale = parseInt(button.dataset.backgroundScale);
            document.querySelector("#customBackgroundLink").value = backgroundUrl;
            document.querySelector("#customBackgroundScale").value = backgroundScale;
            document.querySelector("#customBackgroundScaleValue").textContent = `${backgroundScale}%`;
            chrome.storage.sync.set({ "customBackgroundLink": backgroundUrl, "customBackgroundScale": backgroundScale });
            renderBackgroundPresetSelection();
            toggleOpacityOptions();
        });
    });
    renderBackgroundPresetSelection();
    syncCustomBackgroundDailyState(document.querySelector("#customBackgroundDaily")?.checked === true || document.querySelector("#customBackgroundNasaDaily")?.checked === true);
}

function toggleBetterSidebarSubOptions(betterSidebarOn) {
    const remlogoEl = document.getElementById("remlogo");
    if (remlogoEl) {
        remlogoEl.style.display = betterSidebarOn ? "none" : "flex";
    }
    const sidebarScaleEl = document.getElementById("sidebarScaleSub");
    if (sidebarScaleEl) {
        sidebarScaleEl.style.display = betterSidebarOn ? "block" : "none";
    }
}

function customBackgroundActive() {
    const link = document.querySelector("#customBackgroundLink");
    const daily = document.querySelector("#customBackgroundDaily");
    const nasa = document.querySelector("#customBackgroundNasaDaily");
    return (link && link.value.trim() !== "") || (daily && daily.checked) || (nasa && nasa.checked);
}

function toggleOpacityOptions() {
    const el = document.getElementById("opacity-options");
    if (el) el.style.display = customBackgroundActive() ? "" : "none";
    toggleCardTransparencyOptions();
}

function toggleCardTransparencyOptions() {
    const on = document.getElementById("card_transparency")?.checked === true;
    const opacityRow = document.getElementById("card-transparency-options");
    const blurRow = document.getElementById("card-transparency-blur-row");
    if (opacityRow) opacityRow.style.display = on ? "" : "none";
    if (blurRow) blurRow.style.display = on ? "" : "none";
}

function toggleAlternateColorsVisibility(darkModeOn) {
    const wrap = document.getElementById("todo_alternate_colors_wrap");
    if (wrap) wrap.style.display = darkModeOn ? "none" : "";
}

const WIDGET_LIST = [
    { id: "dashboard_notes", nameKey: "dashboard_notes", shortKey: "widget_short_notes" },
    { id: "gpa_calc", nameKey: "gpa_calculator", shortKey: "widget_short_gpa" },
    { id: "focus_timer", nameKey: "focus_timer", shortKey: "widget_short_focus" },
    { id: "breathing", nameKey: "breathing_breaks", shortKey: "widget_short_breathing" },
    { id: "daily_quotes", nameKey: "daily_quotes", shortKey: "widget_short_quotes" },
];

function widgetPosFromSync(id, sync) {
    if (id === "dashboard_notes") return sync.dashboard_notes_position || "top";
    if (id === "gpa_calc") {
        if (sync.gpa_calc_position !== undefined) return sync.gpa_calc_position;
        return sync.gpa_calc_prepend === true ? "cards_start" : "cards_end";
    }
    return sync[id + "_position"] || (defaultOptions.sync[id + "_position"]) || "top";
}

const WIDGET_ORDER_MIN_PCT = 15;
const WIDGET_ORDER_SNAP_PCT = 4;

// {id, size} entries; legacy plain-id arrays mean equal sizes.
function parseWidgetOrderEntries(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
        if (typeof e === "string") return { id: e, size: null };
        if (e && typeof e === "object" && e.id) {
            const n = Number(e.size);
            return { id: e.id, size: Number.isFinite(n) && n > 0 ? n : null };
        }
        return null;
    }).filter(e => e && WIDGET_LIST.some(w => w.id === e.id));
}

function widgetDisplayName(id) {
    const info = WIDGET_LIST.find(w => w.id === id);
    const msg = info && getMsg(info.shortKey || info.nameKey);
    if (msg) return msg;
    return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

let refreshWidgetOrder = null;

function setupWidgetOrder() {
    const wrap = document.getElementById("widget-order-container");
    if (!wrap) return;

    const KEYS = WIDGET_LIST.map(w => w.id)
        .concat(WIDGET_LIST.map(w => w.id + "_position"))
        .concat(["gpa_calc_prepend", "widget_order"]);

    const AREAS = ["top", "cards_start", "cards_end", "below"];

    const render = (sync) => {
        const areas = { top: [], cards_start: [], cards_end: [], below: [] };
        WIDGET_LIST.forEach(w => {
            if (sync[w.id] !== true) return;
            const pos = widgetPosFromSync(w.id, sync);
            if (areas[pos]) areas[pos].push(w.id);
        });
        let any = false;
        AREAS.forEach(area => {
            const strip = document.getElementById("widget-order-" + area);
            const wrapEl = document.getElementById("widget-order-" + area + "-wrap");
            if (!strip || !wrapEl) return;
            strip.dataset.area = area;
            const ids = areas[area];
            if (ids.length < 2) {
                wrapEl.style.display = "none";
                return;
            }
            any = true;
            wrapEl.style.display = "";
            // Saved order first, then newcomers; before/after share one "cards" order.
            const saved = (sync.widget_order || {})[area.startsWith("cards") ? "cards" : area];
            const entries = parseWidgetOrderEntries(saved).filter(e => ids.includes(e.id));
            ids.forEach(id => { if (!entries.some(e => e.id === id)) entries.push({ id, size: null }); });
            renderWidgetOrderStrip(strip, entries);
        });
        wrap.style.display = any ? "" : "none";
    };

    AREAS.forEach(area => {
        const strip = document.getElementById("widget-order-" + area);
        if (!strip) return;
        strip.addEventListener("dragover", e => {
            e.preventDefault();
            const dragging = strip.querySelector(".wos-item.dragging");
            if (!dragging) return;
            let ref = null;
            for (const el of strip.querySelectorAll(".wos-item:not(.dragging)")) {
                const box = el.getBoundingClientRect();
                if (e.clientX < box.left + box.width / 2) { ref = el; break; }
            }
            if (ref) strip.insertBefore(dragging, ref);
            else strip.appendChild(dragging);
        });
        strip.addEventListener("drop", e => e.preventDefault());
    });

    const refresh = () => chrome.storage.sync.get(KEYS, render);
    refreshWidgetOrder = refresh;

    refresh();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        if (KEYS.some(k => changes[k])) refresh();
    });
}

function renderWidgetOrderStrip(strip, entries) {
    strip.textContent = "";
    const resizable = !strip.dataset.area.startsWith("cards");
    // Normalized to exactly 100%: an unsized widget borrows the average, which
    // otherwise made 50/50 + a third widget overflow the strip.
    let sizes = entries.map(e => (Number.isFinite(e.size) && e.size > 0) ? e.size : null);
    const known = sizes.filter(v => v !== null);
    const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 100 / Math.max(1, entries.length);
    sizes = sizes.map(v => v === null ? fallback : v);
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    const pcts = sizes.map(v => v / total * 100);
    entries.forEach((entry, i) => {
        if (resizable && i > 0) {
            const divider = document.createElement("div");
            divider.className = "wos-divider";
            wireWidgetOrderDivider(strip, divider);
            strip.appendChild(divider);
        }
        const item = document.createElement("div");
        item.className = "wos-item";
        item.dataset.id = entry.id;
        if (resizable) {
            item.dataset.size = pcts[i];
            item.style.flexBasis = pcts[i] + "%";
        }
        item.draggable = true;
        item.textContent = widgetDisplayName(entry.id);
        item.addEventListener("dragstart", e => {
            item.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", entry.id); } catch (_) {}
        });
        item.addEventListener("dragend", () => {
            item.classList.remove("dragging");
            saveWidgetStrip(strip.dataset.area, strip);
        });
        strip.appendChild(item);
    });
}

function wireWidgetOrderDivider(strip, divider) {
    divider.addEventListener("pointerdown", e => {
        e.preventDefault();
        try { divider.setPointerCapture(e.pointerId); } catch (_) {}
        const idx = [...strip.children].indexOf(divider);
        const prev = strip.children[idx - 1];
        const next = strip.children[idx + 1];
        if (!prev || !next || !prev.classList.contains("wos-item") || !next.classList.contains("wos-item")) return;
        const stripWidth = strip.getBoundingClientRect().width || 1;
        const startX = e.clientX;
        const p0 = parseFloat(prev.dataset.size);
        const n0 = parseFloat(next.dataset.size);
        const onMove = ev => {
            const dx = (ev.clientX - startX) / stripWidth * 100;
            let p = p0 + dx;
            p = Math.max(WIDGET_ORDER_MIN_PCT, Math.min(p, p0 + n0 - WIDGET_ORDER_MIN_PCT));
            const count = strip.querySelectorAll(".wos-item").length;
            for (let k = 1; k < count; k++) {
                const mark = k / count * 100;
                if (Math.abs(p - mark) < WIDGET_ORDER_SNAP_PCT) { p = mark; break; }
            }
            const n = p0 + n0 - p;
            prev.dataset.size = p;
            next.dataset.size = n;
            prev.style.flexBasis = p + "%";
            next.style.flexBasis = n + "%";
        };
        const onUp = () => {
            divider.removeEventListener("pointermove", onMove);
            divider.removeEventListener("pointerup", onUp);
            divider.removeEventListener("pointercancel", onUp);
            saveWidgetStrip(strip.dataset.area, strip);
        };
        divider.addEventListener("pointermove", onMove);
        divider.addEventListener("pointerup", onUp);
        divider.addEventListener("pointercancel", onUp);
    });
}

function saveWidgetStrip(area, strip) {
    const items = [...strip.querySelectorAll(".wos-item")];
    if (items.length < 2) return;
    const order = items.map(el => ({ id: el.dataset.id }));
    const storageArea = area.startsWith("cards") ? "cards" : area;
    chrome.storage.sync.get(["widget_order"], sync => {
        const wo = Object.assign({}, sync.widget_order || {});
        if (storageArea === "cards") {
            const ids = new Set(order.map(e => e.id));
            const other = (sync.widget_order && Array.isArray(sync.widget_order.cards) ? sync.widget_order.cards : [])
                .filter(e => e && !ids.has(e.id));
            wo.cards = other.concat(order);
        } else {
            let sizes = items.map(el => parseFloat(el.dataset.size) || 100 / items.length);
            const total = sizes.reduce((a, b) => a + b, 0) || 100;
            sizes = sizes.map(v => v / total * 100);
            const rounded = sizes.map(v => Math.round(v));
            rounded[rounded.length - 1] += 100 - rounded.reduce((a, b) => a + b, 0);
            wo[storageArea] = items.map((el, i) => ({ id: el.dataset.id, size: rounded[i] }));
        }
        chrome.storage.sync.set({ widget_order: wo });
    });
}

function setupWidgetPosition() {
    [
        { select: "dashboard_notes_position", key: "dashboard_notes_position" },
        { select: "gpa_calc_position", key: "gpa_calc_position" },
        { select: "focus_timer_position", key: "focus_timer_position" },
        { select: "breathing_position", key: "breathing_position" },
        { select: "daily_quotes_position", key: "daily_quotes_position" },
    ].forEach(({ select, key }) => {
        const el = document.getElementById(select);
        if (!el) return;
        chrome.storage.sync.get([key, "gpa_calc_prepend"], sync => {
            let value = sync[key];
            if (value === undefined && key === "gpa_calc_position") {
                value = sync["gpa_calc_prepend"] === true ? "cards_start" : "cards_end";
                chrome.storage.sync.set({ [key]: value });
            }
            el.value = value || defaultOptions.sync[key] || "top";
        });
        el.addEventListener("change", function () {
            chrome.storage.sync.set({ [key]: this.value });
        });
    });
}

function setupWidgetHeightInput(id, initial) {
    const el = document.getElementById(id);
    if (!el) return;
    const parse = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    el.value = parse(initial) || "";
    el.addEventListener("change", function () {
        const n = Math.min(2000, Math.max(0, parseInt(this.value, 10) || 0));
        this.value = n > 0 ? n : "";
        chrome.storage.sync.set({ [id]: n });
    });
}

// h:mm:ss fields: click to edit a segment, a second digit auto-advances, and
// the value is saved zero-padded on blur. The hours field is optional.
function setupWidgetTimeInput(prefix, initial) {
    const hEl = document.getElementById(prefix + "_h");
    const mEl = document.getElementById(prefix + "_m");
    const sEl = document.getElementById(prefix + "_s");
    if (!mEl || !sEl) return;
    let v = initial;
    if (!v || typeof v !== "object") {
        const n = parseInt(v, 10);
        v = Number.isFinite(n) && n > 0 ? { h: 0, m: n, s: 0 } : (defaultOptions.sync[prefix] || { h: 0, m: 0, s: 0 });
    }
    const fields = [hEl, mEl, sEl].filter(Boolean);
    const pad = (n) => String(Math.max(0, parseInt(n, 10) || 0)).padStart(2, "0");
    if (hEl) hEl.value = pad(v.h);
    mEl.value = pad(v.m);
    sEl.value = pad(v.s);

    const save = () => {
        const clamp = (el, max) => Math.min(max, Math.max(0, parseInt(el.value, 10) || 0));
        let h = hEl ? clamp(hEl, 99) : 0;
        let m = clamp(mEl, 59);
        let s = clamp(sEl, 59);
        if (h === 0 && m === 0 && s === 0) {
            const d = defaultOptions.sync[prefix] || { h: 0, m: 5, s: 0 };
            h = hEl ? d.h : 0; m = d.m; s = d.s;
        }
        if (hEl) hEl.value = pad(h);
        mEl.value = pad(m);
        sEl.value = pad(s);
        chrome.storage.sync.set({ [prefix]: { h, m, s } });
    };

    fields.forEach((inp, i) => {
        inp.addEventListener("focus", () => inp.select());
        inp.addEventListener("input", () => {
            inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 2);
            if (inp.value.length >= 2 && i < fields.length - 1) fields[i + 1].focus();
        });
        inp.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); save(); inp.blur(); }
            else if (e.key === "ArrowRight" && i < fields.length - 1) { e.preventDefault(); fields[i + 1].focus(); }
            else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); fields[i - 1].focus(); }
        });
        inp.addEventListener("change", save);
        inp.addEventListener("blur", save);
    });
}

function toggleSubOptionsVisibility(option, isOn) {
    const togglesWithSubOptions = ["dashboard_notes", "gpa_calc", "focus_timer", "breathing", "daily_quotes", "assignments_due", "better_todo", "auto_dark", "grade_analytics", "hide_personal_details"];
    if (!togglesWithSubOptions.includes(option)) return;
    const optionEl = document.getElementById(option);
    if (!optionEl) return;
    const subOptions = optionEl.parentElement.querySelector(":scope > .sub-options");
    if (!subOptions) return;
    if (option === "auto_dark") {
        const timesets = subOptions.querySelector(".timesets");
        if (timesets) timesets.style.display = isOn ? "" : "none";
    } else {
        subOptions.style.display = isOn ? "" : "none";
    }
}

function setupFeatureSearch(menu) {
    const searchInput = document.querySelector("#feature-search");
    const resultsEl = document.querySelector("#feature-search-results");
    const headerSearch = document.querySelector("#header-search");
    if (!searchInput || !resultsEl || !headerSearch) return;

    // A Map, not an object: DOM elements stringify to the same key.
    const tabElToBtnId = new Map();
    Object.entries(menu.tabs).forEach(([btnId, info]) => {
        const tabEl = document.querySelector(info.tab);
        if (tabEl) tabElToBtnId.set(tabEl, btnId);
    });

    function shouldSkip(el) {
        if (el.closest('#submit-popup, #browser-settings-popup, #opt-in, #card-edit-menu')) return true;
        let node = el;
        while (node && node !== document.body) {
            if (node.classList && node.classList.contains('option-container') && node.style.display === 'none') return true;
            node = node.parentElement;
        }
        return false;
    }

    function labelOf(sub) {
        const label = sub.querySelector("label");
        if (label) return label.textContent.trim();
        const st = sub.querySelector(".sub-text");
        if (st) return st.textContent.trim();
        // Bare <span> label: checkboxes like Export Settings have no .sub-text.
        const span = sub.querySelector("span");
        if (span) return span.textContent.trim();
        return "";
    }

    function keyIdOf(sub) {
        const label = sub.querySelector("label");
        if (label && label.getAttribute("for")) return label.getAttribute("for");
        const input = sub.querySelector("input");
        if (input && input.id) return input.id;
        return labelOf(sub);
    }

    function categoryFor(el) {
        const tabEl = el.closest(".tab");
        if (tabEl) {
            const btnId = tabElToBtnId.get(tabEl);
            if (btnId) {
                const btn = document.getElementById(btnId);
                const span = btn && btn.querySelector("span");
                if (span) return span.textContent.trim();
            }
            return "Section";
        }
        if (el.classList && el.classList.contains("tab-btn")) return "Section";
        if (el.classList && el.classList.contains("option")) return "Settings";
        const owner = el.closest(".option");
        if (owner) {
            const name = owner.querySelector(".option-name");
            if (name) return name.textContent.trim();
        }
        return "Settings";
    }

    function openTab(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) btn.click();
    }

    function showMain() {
        const back = document.querySelector(".back-btn");
        if (back) back.click();
    }

    function revealAncestors(el) {
        const main = document.querySelector(".main");
        let node = el;
        while (node && node !== main && node !== document.body) {
            if (node.style && node.style.display === "none") node.style.display = "";
            node = node.parentElement;
        }
        const moreWrap = el.closest ? el.closest("#todo-more-options") : null;
        if (moreWrap && !moreWrap.classList.contains("expanded")) {
            const toggle = document.getElementById("todo-more-toggle");
            if (toggle) toggle.click();
        }
    }

    function highlight(el) {
        el.classList.add("search-highlight");
        setTimeout(() => el.classList.remove("search-highlight"), 2000);
    }

    function goToMainElement(el) {
        showMain();
        revealAncestors(el);
        requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            highlight(el);
        });
    }

    function goToTabElement(el) {
        const tabEl = el.closest(".tab");
        const btnId = tabElToBtnId.get(tabEl);
        if (btnId) openTab(btnId);
        requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            highlight(el);
        });
    }

    let featureIndex = null;
    let currentMatches = [];
    let activeIndex = -1;

    function buildIndex() {
        const index = [];
        const seen = new Set();
        function add(entry) {
            if (!entry.text || seen.has(entry.key)) return;
            seen.add(entry.key);
            index.push(entry);
        }

        document.querySelectorAll(".more-options-container .tab-btn").forEach(btn => {
            const span = btn.querySelector("span");
            add({ key: "tab:" + btn.id, text: span ? span.textContent.trim() : "", el: btn, action: () => openTab(btn.id) });
        });

        document.querySelectorAll(".options .option").forEach(opt => {
            if (!opt.id) return;
            const name = opt.querySelector(".option-name");
            if (!name) return;
            if (shouldSkip(opt)) return;
            add({ key: "option:" + opt.id, text: name.textContent.trim(), el: opt, action: () => goToMainElement(opt) });
        });

        document.querySelectorAll(".tab .option").forEach(opt => {
            if (!opt.id) return;
            const name = opt.querySelector(".option-name");
            if (!name) return;
            if (shouldSkip(opt)) return;
            add({ key: "option:" + opt.id, text: name.textContent.trim(), el: opt, action: () => goToTabElement(opt) });
        });

        document.querySelectorAll(".options .sub-option, .options .timeset, .options .sub-options > div").forEach(sub => {
            if (shouldSkip(sub)) return;
            if (sub.classList.contains("sub-option") && sub.style.display === "none") return;
            const text = labelOf(sub);
            if (!text) return;
            add({ key: "sub:" + keyIdOf(sub), text, el: sub, action: () => goToMainElement(sub) });
        });

        const customDomain = document.querySelector(".customDomain");
        if (customDomain && !shouldSkip(customDomain)) {
            const wrap = customDomain.closest(".customDomain");
            const label = wrap ? wrap.querySelector("[data-i18n='enter_url']") : null;
            add({ key: "custom:customDomain", text: label ? label.textContent.trim() : "Canvas URL", el: wrap || customDomain, action: () => goToMainElement(wrap || customDomain) });
        }

        document.querySelectorAll(".tab .header-small").forEach(h => {
            if (shouldSkip(h)) return;
            const text = h.textContent.trim();
            if (!text) return;
            const btnId = tabElToBtnId.get(h.closest(".tab"));
            add({ key: "heading:" + (btnId || "?") + ":" + text, text, el: h, action: () => goToTabElement(h) });
        });

        document.querySelectorAll(".tab .sub-option").forEach(sub => {
            if (shouldSkip(sub)) return;
            const text = labelOf(sub);
            if (!text) return;
            const btnId = tabElToBtnId.get(sub.closest(".tab"));
            add({ key: "tabsub:" + (btnId || "?") + ":" + keyIdOf(sub), text, el: sub, action: () => goToTabElement(sub) });
        });

        document.querySelectorAll(".tab .color-type-header").forEach(h => {
            if (shouldSkip(h)) return;
            const text = h.textContent.trim();
            if (!text) return;
            const btnId = tabElToBtnId.get(h.closest(".tab"));
            add({ key: "color:" + (btnId || "?") + ":" + text, text, el: h, action: () => goToTabElement(h) });
        });

        document.querySelectorAll(".tab .opacity-slider-row, .tab .background-scale-row").forEach(row => {
            if (shouldSkip(row)) return;
            const label = row.querySelector(".sub-text");
            const input = row.querySelector("input[type='range']");
            if (!label || !input) return;
            const text = label.textContent.trim();
            if (!text) return;
            const btnId = tabElToBtnId.get(row.closest(".tab"));
            add({ key: "slider:" + (btnId || "?") + ":" + (input.id || text), text, el: row, action: () => goToTabElement(row) });
        });

        document.querySelectorAll(".tab .preset-button").forEach(btn => {
            if (shouldSkip(btn)) return;
            const text = btn.textContent.trim().replace(/\s+/g, " ");
            if (!text || text === "placeholder") return;
            const btnId = tabElToBtnId.get(btn.closest(".tab"));
            add({ key: "preset:" + (btnId || "?") + ":" + (btn.id || text), text, el: btn, action: () => goToTabElement(btn) });
        });

        ["revert-colors", "clearCustomBackground"].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn || shouldSkip(btn)) return;
            const text = btn.textContent.trim();
            if (!text) return;
            add({ key: "action:" + id, text, el: btn, action: () => goToTabElement(btn) });
        });

        document.querySelectorAll(".tab input[type='checkbox'], .tab input[type='radio']").forEach(input => {
            if (!input.id) return;
            if (input.closest(".sub-option") || input.closest(".option")) return;
            if (shouldSkip(input)) return;
            const text = (input.parentElement && input.parentElement.textContent.trim()) || "";
            if (!text) return;
            const btnId = tabElToBtnId.get(input.closest(".tab"));
            add({ key: "control:" + (btnId || "?") + ":" + input.id, text, el: input, action: () => goToTabElement(input) });
        });

        return index;
    }

    function filterFeatures(query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        if (!featureIndex) featureIndex = buildIndex();
        const scored = [];
        for (const entry of featureIndex) {
            const t = entry.text.toLowerCase();
            let score = -1;
            if (t === q) score = 1000;
            else if (t.startsWith(q)) score = 500 - t.length;
            else {
                const idx = t.indexOf(q);
                if (idx !== -1) score = 200 - idx;
                else if (t.split(/\s+/).some(w => w.toLowerCase().startsWith(q))) score = 50;
            }
            if (score >= 0) scored.push({ entry, score });
        }
        scored.sort((a, b) => b.score - a.score || a.entry.text.length - b.entry.text.length);
        return scored.slice(0, 12).map(s => s.entry);
    }

    function renderResults(matches) {
        currentMatches = matches;
        activeIndex = matches.length ? 0 : -1;
        resultsEl.innerHTML = "";
        if (!matches.length) {
            const empty = document.createElement("div");
            empty.className = "search-result empty";
            empty.textContent = getMsg("no_features") || "No features found";
            resultsEl.appendChild(empty);
            resultsEl.classList.add("open");
            return;
        }
        matches.forEach((entry, i) => {
            const item = document.createElement("div");
            item.className = "search-result" + (i === activeIndex ? " active" : "");
            item.setAttribute("role", "option");
            const title = document.createElement("span");
            title.className = "search-result-title";
            title.textContent = entry.text;
            const cat = document.createElement("span");
            cat.className = "search-result-category";
            cat.textContent = categoryFor(entry.el);
            item.appendChild(title);
            item.appendChild(cat);
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                selectResult(i);
            });
            resultsEl.appendChild(item);
        });
        resultsEl.classList.add("open");
    }

    function setActive(i) {
        activeIndex = i;
        const items = resultsEl.querySelectorAll(".search-result");
        items.forEach((el, idx) => el.classList.toggle("active", idx === i));
        const active = resultsEl.querySelector(".search-result.active");
        if (active) active.scrollIntoView({ block: "nearest" });
    }

    function closeResults() {
        resultsEl.classList.remove("open");
        resultsEl.innerHTML = "";
        currentMatches = [];
        activeIndex = -1;
    }

    function selectResult(i) {
        const entry = currentMatches[i];
        if (!entry) return;
        closeResults();
        searchInput.value = "";
        searchInput.blur();
        entry.action();
    }

    searchInput.addEventListener("input", () => {
        if (!searchInput.value.trim()) { closeResults(); return; }
        renderResults(filterFeatures(searchInput.value));
    });
    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim()) renderResults(filterFeatures(searchInput.value));
    });
    searchInput.addEventListener("keydown", (e) => {
        if (!currentMatches.length) {
            if (e.key === "Escape") searchInput.blur();
            return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((activeIndex + 1) % currentMatches.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((activeIndex - 1 + currentMatches.length) % currentMatches.length); }
        else if (e.key === "Enter") { e.preventDefault(); if (activeIndex >= 0) selectResult(activeIndex); }
        else if (e.key === "Escape") { e.preventDefault(); closeResults(); searchInput.blur(); }
    });
    searchInput.addEventListener("blur", () => setTimeout(closeResults, 150));

    const icon = headerSearch.querySelector(".header-search-icon");
    if (icon) icon.addEventListener("click", () => searchInput.focus());

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#header-search")) closeResults();
    });
}

async function setup() {
    await initLanguageSelector();
    const menu = {
		switches: syncedSwitches,
		checkboxes: [
			"hide_navbar",
			"browser_show_likes",
			"gpa_calc_weighted",
			"gpa_calc_cumulative",
            "todo_hide_feedback",
            "todo_hide_read",
			"todo_full_height",
			"device_dark",
			"relative_dues",
			"card_overdues",
			"hide_completed_cards",
			"equal_height_cards",
			"auto_dark",
			"assignment_date_format",
			"custom_font_skip_p",
			"todo_hr24",
			"todo_separate_scrollbar",
			"todo_alternate_colors",
			"todo_ignore_card_colors",
			"todo_remove_icons",
			"todo_show_scores",
			"grade_hover",
			"card_letter",
			"auto_detect_disabled",
			"hide_course_images",
			"anon_fake_todo",
			"anon_progress_enabled",
			"hover_preview",
            "customBackgroundDaily",
            "customBackgroundNasaDaily",
            "fitImageToScreen",
            "card_transparency",
			"customCardStyles",
			"card_grid",
			"card_grid_center_rows",
			"card_grid_flex",
			"grade_analytics_zones",
		],
		tabs: {
			"advanced-settings": {
				setup: displayAdvancedCards,
				tab: ".advanced",
			},
			
			"custom-font-btn": {
				setup: displayCustomFont,
				tab: ".custom-font-container",
			},
			"gpa-bounds-btn": {
				setup: null,
				tab: ".gpa-bounds-container",
			},
			"card-colors-btn": { setup: null, tab: ".card-colors-container" },
			"customize-dark-btn": {
				setup: displayDarkModeFixUrls,
				tab: ".customize-dark",
			},
			"import-export-btn": {
				setup: displayThemeList,
				tab: ".import-export",
			},
			"report-issue-btn": {
				setup: displayErrors,
				tab: ".report-issue-container",
			},
			"updates-btn": { setup: null, tab: ".updates-container" },
		},
		special: [
			{
				identifier: "auto_dark_start",
				setup: (initial) =>
					setupAutoDarkInput(initial, "auto_dark_start"),
			},
			{
				identifier: "auto_dark_end",
				setup: (initial) =>
					setupAutoDarkInput(initial, "auto_dark_end"),
			},
			{
				identifier: "num_assignments",
				setup: (initial) => setupAssignmentsSlider(initial),
			},
			{
				identifier: "num_todo_items",
				setup: (initial) => setupTodoSlider(initial),
			},
            {
                identifier: "sidebar_scale",
                setup: (initial) => setupSidebarScaleSlider(initial),
            },
            {
                identifier: "bg_opacity",
                setup: (initial) => setupRangeSlider("bg_opacity", "bgOpacitySlider", "bgOpacityValue", "bgOpacityReset", 65, 100, "%", initial),
            },
            {
                identifier: "sidebar_opacity",
                setup: (initial) => setupRangeSlider("sidebar_opacity", "sidebarOpacitySlider", "sidebarOpacityValue", "sidebarOpacityReset", 100, 100, "%", initial),
            },
            {
                identifier: "bg_blur",
                setup: (initial) => setupRangeSlider("bg_blur", "bgBlurSlider", "bgBlurValue", "bgBlurReset", 8, 30, "px", initial),
            },
            {
                identifier: "sidebar_blur",
                setup: (initial) => setupRangeSlider("sidebar_blur", "sidebarBlurSlider", "sidebarBlurValue", "sidebarBlurReset", 0, 30, "px", initial),
            },
            {
                identifier: "card_opacity",
                setup: (initial) => setupRangeSlider("card_opacity", "cardOpacitySlider", "cardOpacityValue", "cardOpacityReset", 80, 100, "%", initial),
            },
            {
                identifier: "card_blur",
                setup: (initial) => setupRangeSlider("card_blur", "cardBlurSlider", "cardBlurValue", "cardBlurReset", 8, 30, "px", initial),
            },
			{
				identifier: "card_limit",
				setup: (initial) => setupCardLimitSlider(initial),
			},
			{
				identifier: "card_method_dashboard",
				setup: (initial) => setupDashboardMethod(initial),
			},
			{
				identifier: "custom_styles",
				setup: (initial) => setupCustomStyle(initial),
			},
			{
				identifier: "imageSize",
				setup: (initial) => setupImageSizeInput(initial),
			},
			{
				identifier: "cardRoundness",
				setup: (initial) => setupCardRoundnessInput(initial),
			},
			{
				identifier: "imageRoundness",
				setup: (initial) => setupImageRoundnessInput(initial),
			},
			{
				identifier: "cardSpacing",
				setup: (initial) => setupCardSpacingInput(initial),
			},
			{
				identifier: "cardWidth",
				setup: (initial) => setupCardWidthInput(initial),
			},
			{
				identifier: "cardHeight",
				setup: (initial) => setupCardHeightInput(initial),
			},
			{
				identifier: "cardPadding",
				setup: (initial) => setupCardPaddingInput(initial),
			},
			{
				identifier: "card_grid",
				setup: (initial) => setupCardGrid(initial),
			},
			{
				identifier: "card_grid_columns",
				setup: (initial) => setupCardGridCountInput("card_grid_columns", initial),
			},
			{
				identifier: "card_grid_rows",
				setup: (initial) => setupCardGridCountInput("card_grid_rows", initial),
			},
			{
				identifier: "card_grid_column_gap",
				setup: (initial) => setupCardGridCountInput("card_grid_column_gap", initial, 0),
			},
			{
				identifier: "card_grid_row_gap",
				setup: (initial) => setupCardGridCountInput("card_grid_row_gap", initial, 0),
			},
			{
				identifier: "customBackgroundLink",
				setup: (initial) => setupCustomBackgroundLink(initial),
			},
            {
                identifier: "customBackgroundScale",
                setup: (initial) => setupCustomBackgroundScale(initial),
            },
			{
				identifier: "todo_celebrations",
				setup: (initial) => setupCelebrationsSelect(initial),
			},
			{
				identifier: "todo_celebration_amount",
				setup: (initial) => setupCelebrationAmount(initial),
			},
			{
				identifier: "celebration_preview",
				setup: () => setupCelebrationPreview(),
			},
			{
				identifier: "todo_progress_rings",
				setup: (initial) => setupProgressRingsSelect(initial),
			},
			{
				identifier: "todo_timeframe",
				setup: (initial) => setupTimeframeSelect(initial),
			},
			{
				identifier: "todo_timeframe_custom_past",
				setup: (initial) => setupCustomTimeframeInput("todo_timeframe_custom_past", initial, 7),
			},
			{
				identifier: "todo_timeframe_custom_future",
				setup: (initial) => setupCustomTimeframeInput("todo_timeframe_custom_future", initial, 14),
			},
			{
				identifier: "anon_grade_level",
				setup: (initial) => setupAnonGradeSelect(initial),
			},
			{
				identifier: "anon_fake_completed",
				setup: (initial) => setupAnonFakeCompleted(initial),
			},
			{
				identifier: "anon_progress_done",
				setup: (initial) => setupAnonProgressInput("anon_progress_done", initial, true),
			},
			{
				identifier: "anon_progress_total",
				setup: (initial) => setupAnonProgressInput("anon_progress_total", initial, false),
			},
			{
				identifier: "widget_row_height",
				setup: (initial) => setupWidgetHeightInput("widget_row_height", initial),
			},
			{
				identifier: "dashboard_notes_height",
				setup: (initial) => setupWidgetHeightInput("dashboard_notes_height", initial),
			},
			{
				identifier: "gpa_calc_height",
				setup: (initial) => setupWidgetHeightInput("gpa_calc_height", initial),
			},
			{
				identifier: "focus_timer_height",
				setup: (initial) => setupWidgetHeightInput("focus_timer_height", initial),
			},
			{
				identifier: "breathing_height",
				setup: (initial) => setupWidgetHeightInput("breathing_height", initial),
			},
			{
				identifier: "daily_quotes_height",
				setup: (initial) => setupWidgetHeightInput("daily_quotes_height", initial),
			},
			{
				identifier: "focus_timer_preset_1",
				setup: (initial) => setupWidgetTimeInput("focus_timer_preset_1", initial),
			},
			{
				identifier: "focus_timer_preset_2",
				setup: (initial) => setupWidgetTimeInput("focus_timer_preset_2", initial),
			},
			{
				identifier: "focus_timer_preset_3",
				setup: (initial) => setupWidgetTimeInput("focus_timer_preset_3", initial),
			},
			{
				identifier: "breathing_preset_1",
				setup: (initial) => setupWidgetTimeInput("breathing_preset_1", initial),
			},
			{
				identifier: "breathing_preset_2",
				setup: (initial) => setupWidgetTimeInput("breathing_preset_2", initial),
			},
			{
				identifier: "breathing_preset_3",
				setup: (initial) => setupWidgetTimeInput("breathing_preset_3", initial),
			},
			{
				identifier: "todo_more_expanded",
				setup: (initial) => setupTodoMoreOptions(initial),
			},
		],
	};

    chrome.storage.sync.get(menu.switches, sync => {
        menu.switches.forEach(option => {
            let optionSwitch = document.getElementById(option);
            let status = (sync[option] !== undefined ? sync[option] === true : defaultOptions.sync[option] === true) ? "#on" : "#off";
            optionSwitch.querySelector(status).checked = true;
            optionSwitch.querySelector(status).classList.add('checked');

            optionSwitch.querySelector(".slider").addEventListener("mouseup", () => {
                let status = !optionSwitch.querySelector("#on").checked;
                optionSwitch.querySelector("#on").checked = status;
                optionSwitch.querySelector("#on").classList.toggle("checked");
                optionSwitch.querySelector("#off").classList.toggle("checked");
                chrome.storage.sync.set({ [option]: status });
                if (option === "auto_dark") {
                    toggleDarkModeDisable(status);
                }
                if (option === "better_sidebar") {
                    toggleBetterSidebarSubOptions(status);
                }
                if (option === "better_todo") {
                    toggleCelebrationsVisibility(status);
                }
                if (option === "todo_celebrations_enabled") {
                    toggleCelebrationOptionsVisibility(status);
                }
                if (option === "dark_mode") {
                    toggleAlternateColorsVisibility(status);
                }
                if (option === "hide_personal_details" && status === false) {
                    // Content script watches this key and drops its hiding stylesheet.
                    const imgCheckbox = document.getElementById("hide_course_images");
                    if (imgCheckbox) imgCheckbox.checked = false;
                    chrome.storage.sync.set({ "hide_course_images": false });
                }
                toggleSubOptionsVisibility(option, status);
                if (option === "dashboard_notes" || option === "gpa_calc" || option === "focus_timer" || option === "breathing" || option === "daily_quotes") {
                    if (refreshWidgetOrder) refreshWidgetOrder();
                }
            });
        });
        toggleBetterSidebarSubOptions(sync["better_sidebar"] === true);
        toggleCelebrationsVisibility(sync["better_todo"] === true);
        chrome.storage.sync.get("todo_celebrations_enabled", v => {
            toggleCelebrationOptionsVisibility(v["todo_celebrations_enabled"] !== false);
        });
        ["dashboard_notes", "gpa_calc", "focus_timer", "breathing", "daily_quotes", "assignments_due", "better_todo", "auto_dark", "grade_analytics", "hide_personal_details"].forEach(opt => {
            toggleSubOptionsVisibility(opt, sync[opt] === true);
        });
        toggleAlternateColorsVisibility(sync["dark_mode"] === true);
    });

    setupWidgetPosition();
    setupWidgetOrder();

    chrome.storage.sync.get(menu.checkboxes, sync => {
        menu.checkboxes.forEach(option => {
			const checkbox = document.querySelector("#" + option);
			if (!checkbox) {console.log(option); return;}
            checkbox.addEventListener("change", function (e) {
                let status = this.checked;
                if (option === "customBackgroundDaily" && status) {
                    document.querySelector("#customBackgroundNasaDaily").checked = false;
                    chrome.storage.sync.set({ "customBackgroundDaily": true, "customBackgroundNasaDaily": false });
                } else if (option === "customBackgroundNasaDaily" && status) {
                    document.querySelector("#customBackgroundDaily").checked = false;
                    chrome.storage.sync.set({ "customBackgroundNasaDaily": true, "customBackgroundDaily": false });
                } else {
                    chrome.storage.sync.set(JSON.parse(`{"${option}": ${status}}`));
                }
                if (option === "anon_fake_todo") {
                    toggleAnonFakeCompletedVisibility(status);
                }
                syncCustomBackgroundDailyState(document.querySelector("#customBackgroundDaily")?.checked === true || document.querySelector("#customBackgroundNasaDaily")?.checked === true);
                toggleOpacityOptions();
            });
            const value = sync[option] !== undefined ? sync[option] : defaultOptions.sync[option];
            document.querySelector("#" + option).checked = value;
        });
        syncCustomBackgroundDailyState(sync.customBackgroundDaily === true || sync.customBackgroundNasaDaily === true);
        toggleAnonFakeCompletedVisibility(sync["anon_fake_todo"] === true);
        toggleDarkModeDisable(sync.auto_dark);
        displayBackgroundPresets();
        toggleOpacityOptions();
    });

    const specialOptions = menu.special.map(obj => obj.identifier);
    chrome.storage.sync.get(specialOptions, sync => {
        console.log(sync);
        menu.special.forEach(option => {
            if (option.setup !== null) {
                const value = sync[option.identifier] !== undefined ? sync[option.identifier] : defaultOptions.sync[option.identifier];
                option.setup(value);
            }
        });
    })


    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (menu.tabs[btn.id].setup !== null) menu.tabs[btn.id].setup();
            document.querySelector(".main").style.display = "none";
            document.querySelector(menu.tabs[btn.id].tab).style.display = "block";
            window.scrollTo(0, 0);
        });
    });

    document.querySelectorAll(".back-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".tab").forEach(tab => {
                tab.style.display = "none";
            });
            document.querySelector(".main").style.display = "block";
        });
    });

    applyI18nOverride();

    setupFeatureSearch(menu);

    document.querySelector("#inspector-btn").addEventListener("click", async function () {
        document.querySelector("#inspector-output").textContent = (await sendFromPopup("inspect"))["selectors"];
    });

    document.querySelector("#fix-dm-btn").addEventListener("click", async function () {
        let output = await sendFromPopup("fixdm");
        if (output.path === "canvasrefined-none" || output.path === "canvasrefined-darkmode_off") return;
        let rating = "bad";
        if (output.time < 100) {
            rating = "good";
        } else if (output.time < 250) {
            rating = "ok";
        }
        document.getElementById("fix-dm-output").textContent = (getMsg("fix_took") || "Fix took $TIME$ms (rating: $RATING$)").replace("$TIME$", Math.round(output.time)).replace("$RATING$", rating);
        chrome.storage.sync.get("dark_mode_fix", sync => {
            if (sync["dark_mode_fix"].includes(output.path)) return;
            sync["dark_mode_fix"].push(output.path);
            chrome.storage.sync.set({ "dark_mode_fix": sync["dark_mode_fix"] }).then(() => displayDarkModeFixUrls());
        })
    });

    document.querySelector("#rk_btn").addEventListener("click", () => {
        chrome.storage.local.get(null, local => {
            chrome.storage.sync.get(null, sync => {
                document.querySelector("#rk_output").value = JSON.stringify(local) + JSON.stringify(sync);
            })
        })
    });

    document.querySelector("#storage-reset-btn").addEventListener("click", () => {
        chrome.storage.sync.set(defaultOptions["sync"]);
        updateStorageUsage();
    });

    // Bumps the fake-data seed; every open Canvas tab re-shuffles without a reload.
    document.querySelector("#anon-reroll-btn").addEventListener("click", () => {
        chrome.storage.sync.set({ "anon_grade_seed": Math.floor(Math.random() * 1000000) });
        displayAlert(false, getMsg("fake_rerolled") || "Fake classes rerolled.");
    });

    // Key must stay in sync with PLANNER_CACHE_KEY in content.js.
    document.querySelector("#planner-cache-clear-btn").addEventListener("click", async () => {
        displayAlert(false, getMsg("planner_cleared") || "Planner cache cleared.");
        try {
            await chrome.storage.local.remove("planner_cache_v1");
        } catch (e) { /* nothing stored yet */ }
        await sendFromPopup("clearPlannerCache");
        updateStorageUsage();
    });

    function formatStorageBytes(bytes) {
        if (bytes == null) return "unknown";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(2) + " MB";
    }

    // getBytesInUse is missing on older Firefox; measure a serialized Blob instead.
    async function storageBytesInUse(area, keys) {
        try {
            const bytes = await area.getBytesInUse(keys ?? null);
            if (typeof bytes === "number") return bytes;
        } catch (e) { /* not supported */ }
        try {
            const data = await area.get(keys ?? null);
            return new Blob([JSON.stringify(data)]).size;
        } catch (e) {
            return null;
        }
    }

    async function updateStorageUsage() {
        const set = (id, text) => {
            const el = document.querySelector(id);
            if (el) el.textContent = text;
        };

        const syncBytes = await storageBytesInUse(chrome.storage.sync);
        set("#storage-usage-sync", syncBytes == null ? getMsg("storage_unknown", "unknown") : formatStorageBytes(syncBytes) + getMsg("storage_quota_100kb", " of 100 KB quota"));

        const cacheBytes = await storageBytesInUse(chrome.storage.local, "planner_cache_v1");
        let cacheText = getMsg("storage_empty", "empty");
        if (cacheBytes) {
            try {
                const result = await chrome.storage.local.get("planner_cache_v1");
                const count = result?.["planner_cache_v1"]?.items?.length;
                cacheText = formatStorageBytes(cacheBytes) + (typeof count === "number" ? getMsg("storage_items", " ($COUNT$ items)").replace("$COUNT$", count) : "");
            } catch (e) {
                cacheText = formatStorageBytes(cacheBytes);
            }
        }
        set("#storage-usage-cache", cacheText);

        const localBytes = await storageBytesInUse(chrome.storage.local);
        if (localBytes == null) {
            set("#storage-usage-local", getMsg("storage_unknown", "unknown"));
        } else {
            const other = cacheBytes != null ? Math.max(localBytes - cacheBytes, 0) : null;
            set("#storage-usage-local", other == null ? formatStorageBytes(localBytes) : formatStorageBytes(other));
        }

        try {
            const est = await navigator.storage.estimate();
            if (est && est.quota) {
                set("#storage-usage-quota", formatStorageBytes(est.quota) + " available");
            }
        } catch (e) { /* estimate unsupported */ }
    }
    updateStorageUsage();

    const domainListEl = document.querySelector("#custom-domain-list");
    const addDomainBtn = document.querySelector("#add-domain-btn");

    // Idempotent: rows store bare hostnames, which fail new URL() without a
    // scheme, so they are validated as hostnames instead.
    function sanitizeDomainEntry(val, showAlert = true) {
        let trimmed = val.trim().replace(/ /g, "");
        if (trimmed === "") return "";
        try {
            const host = new URL(trimmed).hostname;
            if (host) {
                clearAlert();
                return host;
            }
        } catch (e) { /* not a full URL — may still be a bare hostname */ }
        const host = trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
        if (host && /^[a-z0-9][a-z0-9.-]*$/i.test(host)) {
            clearAlert();
            return host;
        }
        if (showAlert) displayAlert(true, getMsg("invalid_url") || "The URL you entered appears to be invalid, so it might not work.");
        return trimmed;
    }

    function saveDomainList() {
        const domains = [];
        domainListEl.querySelectorAll(".domain-row input").forEach(input => {
            const val = sanitizeDomainEntry(input.value);
            if (val !== "") domains.push(val);
        });
        chrome.storage.sync.set({ custom_domain: domains.length ? domains : [""] });
    }

    function makeDomainRow(value) {
        const row = document.createElement("div");
        row.className = "domain-row";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = getMsg("placeholder_example") || "canvas.myschool.edu";
        input.value = value || "";
        input.spellcheck = false;
        input.addEventListener("input", saveDomainList);
        input.addEventListener("blur", () => {
            if (input.value.trim() === "") {
                if (domainListEl.querySelectorAll(".domain-row").length > 1) row.remove();
            } else {
                input.value = sanitizeDomainEntry(input.value);
            }
            saveDomainList();
        });
        const remove = document.createElement("button");
        remove.className = "domain-remove";
        remove.type = "button";
        remove.textContent = "\u2715";
        remove.title = getMsg("remove_label") || "Remove";
        remove.addEventListener("click", () => {
            const val = sanitizeDomainEntry(input.value, false);
            row.remove();
            saveDomainList();
            if (val) {
                chrome.storage.sync.get(["custom_domain_denied"], storage => {
                    const denied = (storage.custom_domain_denied || []).filter(d => d !== val);
                    chrome.storage.sync.set({ custom_domain_denied: denied });
                });
            }
        });
        row.appendChild(input);
        row.appendChild(remove);
        return row;
    }

    chrome.storage.sync.get(["custom_domain"], storage => {
        const domains = (storage.custom_domain || []).filter(d => d && d.trim() !== "");
        domains.forEach(d => domainListEl.appendChild(makeDomainRow(d)));
    });

    addDomainBtn.addEventListener("click", () => {
        domainListEl.appendChild(makeDomainRow(""));
        const rows = domainListEl.querySelectorAll(".domain-row input");
        rows[rows.length - 1].focus();
    });

    document.querySelector("#import-input").addEventListener("input", (e) => {
        const obj = JSON.parse(e.target.value);
        importTheme(obj);
    });

    document.querySelector("#export-copy").addEventListener("click", async () => {
        const output = document.querySelector("#export-output");
        const btn = document.querySelector("#export-copy");
        const text = output.value;
        if (!text) { displayAlert(true, getMsg("nothing_to_copy") || "Nothing to copy — select what to export first."); return; }
        const flash = () => { const old = btn.textContent; btn.textContent = getMsg("copied") || "Copied!"; setTimeout(() => { btn.textContent = old; }, 1200); };
        try {
            await navigator.clipboard.writeText(text);
            flash();
        } catch (e) {
            output.select();
            document.execCommand("copy");
            flash();
        }
    });

    document.querySelectorAll(".export-details input").forEach(input => {
        input.addEventListener("change", () => {
            chrome.storage.sync.get(syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "custom_styles"]), async storage => {
                let final = {};
                for await (item of document.querySelectorAll(".export-details input")) {
                    if (item.checked) {
                        switch (item.id) {
                            case "export-toggles":
                                final = { ...final, ...(await getExport(storage, exportToggles)) };
                                break;
                            case "export-dark":
                                final = { ...final, ...(await getExport(storage, ["dark_preset", "dark_mode"])) };
                                break;
                            case "export-dark-schedule":
                                final = { ...final, ...(await getExport(storage, exportDarkSchedule)) };
                                break;
                            case "export-cards":
                                final = { ...final, ...(await getExport(storage, ["custom_cards"])) };
                                break;
                            case "export-colors":
                                final = { ...final, ...(await getExport(storage, ["card_colors", ...exportCardColorToggles])) };
                                break;
                            case "export-card-styles":
                                final = { ...final, ...(await getExport(storage, exportCardStyles)) };
                                break;
                            case "export-customStyles": {
                                const localStyles = await chrome.storage.local.get("custom_styles");
                                const styleSource = localStyles && localStyles["custom_styles"] !== undefined ? localStyles : storage;
                                final = { ...final, ...(await getExport(styleSource, ["custom_styles"])) };
                                break;
                            }
                            case "export-font":
                                final = { ...final, ...(await getExport(storage, ["custom_font", "custom_font_skip_p"])) };
                                break;
                            case "export-background":
                                final = { ...final, ...(await getExport(storage, exportBackground)) };
                                break;
                            case "export-todo":
                                final = { ...final, ...(await getExport(storage, exportTodo)) };
                                break;
                            case "export-gpa":
                                final = { ...final, ...(await getExport(storage, [...exportGpa, "gpa_calc_bounds"])) };
                                break;
                        }
                    }
                }
                document.querySelector("#export-output").value = JSON.stringify(final);
            });
        });
    });

    const exportCheckboxes = () => document.querySelectorAll(".export-details input");
    const refreshExport = () => {
        const first = exportCheckboxes()[0];
        if (first) first.dispatchEvent(new Event("change", { bubbles: true }));
    };
    document.querySelector("#export-check-all")?.addEventListener("click", () => {
        exportCheckboxes().forEach(c => { c.checked = true; });
        refreshExport();
    });
    document.querySelector("#export-check-none")?.addEventListener("click", () => {
        exportCheckboxes().forEach(c => { c.checked = false; });
        refreshExport();
    });

    document.querySelector("#theme-revert").addEventListener("click", () => {
        chrome.storage.local.get("previous_theme", local => {
            if (local["previous_theme"] !== null) {
                importTheme(local["previous_theme"]);
            }
        });
    });

    document.querySelector("#alert").addEventListener("click", clearAlert);
    // TODO: maybe fix this at some point, idk what is causing the error here
    document.querySelectorAll(".preset-button.customization-button").forEach(btn => btn.addEventListener("click", changeToPresetCSS));

    document.querySelector("#singleColorInput").addEventListener("change", e => document.querySelector("#singleColorText").value = e.target.value);
    document.querySelector("#singleColorText").addEventListener("change", e => document.querySelector("#singleColorInput").value = e.target.value);
    document.querySelector("#gradientColorFrom").addEventListener("change", e => document.querySelector("#gradientColorFromText").value = e.target.value);
    document.querySelector("#gradientColorFromText").addEventListener("change", e => document.querySelector("#gradientColorFrom").value = e.target.value);
    document.querySelector("#gradientColorTo").addEventListener("change", e => document.querySelector("#gradientColorToText").value = e.target.value);
    document.querySelector("#gradientColorToText").addEventListener("change", e => document.querySelector("#gradientColorTo").value = e.target.value);
    document.querySelector("#setSingleColor").addEventListener("click", () => {
        let colors = [document.querySelector("#singleColorInput").value];;
        sendFromPopup("setcolors", colors);
    });
    document.querySelector("#setGradientColor").addEventListener("click", () => {
        chrome.storage.sync.get("custom_cards", sync => {
            length = 0;
            Object.keys(sync["custom_cards"]).forEach(key => {
                if (sync["custom_cards"][key].hidden !== true) length++;
            });
            let colors = [];
            let from = document.querySelector("#gradientColorFrom").value;
            let to = document.querySelector("#gradientColorTo").value;
            for (let i = 1; i <= length; i++) {
                colors.push(getColorInGradient(i / length, from, to));
            }
            sendFromPopup("setcolors", colors);
        });
    });

    document.querySelector("#revert-colors").addEventListener("click", () => {
        chrome.storage.local.get("previous_colors", local => {
            const prev = local["previous_colors"];
            if (prev && Array.isArray(prev.colors) && prev.colors.length > 0) {
                sendFromPopup("setcolors", prev.colors);
            }
        })
    })

    document.querySelectorAll(".preset-button.colors-button").forEach(btn => {
        const colors = getPalette(btn.querySelector("p").textContent);
        let preview = btn.querySelector(".colors-preview");
        colors.forEach(color => {
            let div = makeElement("div", preview, { "className": "color-preview"});
            div.style.background = color;
        });
        btn.addEventListener("click", () => {
            sendFromPopup("setcolors", colors);
        })
    });


    ["#radio-sidebar-image", "#radio-sidebar-gradient", "#radio-sidebar-solid"].forEach(radio => {
        document.querySelector(radio).addEventListener("click", () => {
            chrome.storage.sync.get(["dark_preset"], storage => {
                let mode = radio === "#radio-sidebar-image" ? "image" : radio === "#radio-sidebar-gradient" ? "gradient" : "solid";
                displaySidebarMode(mode, storage["dark_preset"]["sidebar"]);
            });
        })
    });

    document.getElementById("premade-themes-left").addEventListener("click", () => changePage(-1));
    document.getElementById("premade-themes-right").addEventListener("click", () => changePage(1));
    document.getElementById("theme-sorts").addEventListener("click", () => {
        const el = document.getElementById("theme-sort-selector");
        if (el.classList.contains("open")) {
            clickout();
        } else {
            el.classList.add("open");
            setTimeout(() => {
                document.addEventListener("click", clickout);
        }, 10);
        }
    });
    document.getElementById("theme-search").addEventListener("change", async (e) => {
        searchFor = e.target.value;
        console.log(searchFor);
        let themesToShow = [];
        for (let i = 0; i < themes.length; i++) {
            if (themes[i].title.toLowerCase().includes(searchFor.toLowerCase())) {
                themesToShow.push(themes[i]);
            }
        }
        console.log(themesToShow);
        displayThemeSearchList(themesToShow);
    });

    document.getElementById("save-theme").addEventListener("click", saveCurrentTheme);


    document.getElementById("submit-theme-btn-1").addEventListener("click", () => {
        document.getElementById("submit-popup").classList.add("open");
    });

    document.getElementById("cancel-theme-btn").addEventListener("click", () => {
        document.getElementById("submit-popup").classList.remove("open");
    })

    document.getElementById("submit-title").addEventListener("input", (e) => {
        document.getElementById("theme-button-title-preview").textContent = e.target.value.replaceAll(" ", "");
    });

    document.getElementById("submit-credits").addEventListener("input", (e) => {
        document.getElementById("theme-button-creator-preview").textContent = e.target.value;
    });

    document.getElementById("show-submit-form").addEventListener("click",  (e) => {
        const drawer = document.getElementById("submit-drawer");
        if (drawer.style.display === "none") {
            drawer.style.display = "block";
            e.target.textContent = getMsg("hide") || "Hide";
        } else {
            drawer.style.display = "none";
            e.target.textContent = getMsg("show") || "Show";
        }
    });



    document.querySelectorAll(".theme-sort-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            themeSort(e.target.textContent);
        });
    });

    document.getElementById("browser-settings-btn").addEventListener("click", () => {
        document.getElementById("browser-settings-popup").classList.add("open");
    });

    document.getElementById("close-settings-btn").addEventListener("click", () => {
        displayThemeList(0);
        document.getElementById("browser-settings-popup").classList.remove("open");
    });


    document.getElementById("submit-form-btn").addEventListener("click", displayThemeSubmissionForm);


    document.getElementById("clearCustomBackground").addEventListener("click", () => {
                chrome.storage.sync.set({ "customBackgroundLink": "", "customBackgroundScale": 100 });
        document.querySelector("#customBackgroundLink").value = "";
		document.querySelector("#customBackgroundScale").value = 100;
		document.querySelector("#customBackgroundScaleValue").textContent = "100%";
		renderBackgroundPresetSelection();
		sendFromPopup("updateBackground");
        toggleOpacityOptions();
    });

    const applyFontsDropdownState = (isOpen) => {
        const el = document.getElementById("quick-fonts");
        const el2 = document.getElementsByClassName("custom-font")[0];
        const arrow = document.getElementById("fontsDropdownArrow");
        if (!el || !el2 || !arrow) return;
        el.style.display = isOpen ? "flex" : "none";
        el2.style.display = isOpen ? "block" : "none";
        arrow.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
    };

    chrome.storage.local.get([fontsDropdownStateKey], (storage) => {
        const isOpen = storage[fontsDropdownStateKey] !== false;
        applyFontsDropdownState(isOpen);
    });

    document.getElementById("fontsDropdown").addEventListener("click", () => {
        const el = document.getElementById("quick-fonts");
        const el2 = document.getElementsByClassName("custom-font")[0];
        if (!el || !el2) return;
        const isCurrentlyOpen = getComputedStyle(el).display !== "none" && getComputedStyle(el2).display !== "none";
        const nextOpen = !isCurrentlyOpen;
        applyFontsDropdownState(nextOpen);
        chrome.storage.local.set({ [fontsDropdownStateKey]: nextOpen });
    });

    const skipPToggle = document.getElementById("custom_font_skip_p");
    if (skipPToggle) {
        skipPToggle.closest("span").addEventListener("click", (e) => e.stopPropagation());
    }
}

function setupCustomStyle(initial) {
    const el = document.getElementById("custom-styles");
    // storage.local: storage.sync's 8KB per-item quota dropped long stylesheets.
    // `initial` is the legacy sync value, used until the user saves again.
    chrome.storage.local.get("custom_styles", local => {
        el.value = local && local["custom_styles"] !== undefined ? local["custom_styles"] : (initial || "");
    });
    el.addEventListener("change", (e) => {
        chrome.storage.local.set({ "custom_styles": e.target.value });
    });
}


function displayThemeSubmissionForm() {
    document.getElementById("submit-form").style.display = "block";
    document.getElementById("view-submissions").style.display = "none";
    document.getElementById("submit-form-btn").classList.add("active");
    document.getElementById("view-submissions-btn").classList.remove("active");
}


async function getExport(storage, options) {
    let final = {};
    for (const option of options) {
        switch (option) {
            case "custom_cards":
                let arr = [];
                Object.keys(storage["custom_cards"]).forEach(key => {
                    const img = storage["custom_cards"][key].img;
                    if (img && img !== "none" && img.trim() !== "") arr.push(img);
                });
                final["custom_cards"] = arr;
                break;
            case "card_colors":
                final["card_colors"] = [];
                try {
                    final["card_colors"] = await sendFromPopup("getcolors");
                } catch (e) {
                    console.log(e);
                }
                break;
			case "custom_styles":
				final["custom_styles"] = storage["custom_styles"];
				break;
            default:
                final[option] = storage[option];
        }
    }
    return final;
}

let pageTimeout = false;

function changePage(direction) {
    if (pageTimeout) return;
    pageTimeout = true;
    displayThemeList(direction);
    setTimeout(() => {
        pageTimeout = false;
    }, 500);
}

const colorValues = {
    "red": 1,
    "pink": 2,
    "orange": 3,
    "yellow": 4,
    "lightgreen": 5,
    "green": 6,
    "lightblue": 7,
    "blue": 8,
    "lightpurple": 9,
    "purple": 10,
    "lightpurple": 11,
    "beige": 12,
    "brown": 13,
    "gray": 14,
}

function themeSortFn(method) {
    let themes = getTheme("all");
    switch (method) {
        case "New":
            return themes.reverse();
        case "Old":
            return themes;
        case "Color":
            return themes.sort((a, b) => {
                return (colorValues[a.color] || (a.color !== "whiteblack" && a.color.includes("white") ? 15 : 16)) - (colorValues[b.color] || (b.color !== "whiteblack" && b.color.includes("white") ? 15 : 16))
            })
            return themes.sort((a, b) => {
                return a.color < b.color ? 1 : -1;
            })
        case "ABC":
            return themes.sort((a, b) => {
                return a.title.toLowerCase() > b.title.toLowerCase() ? 1 : -1;
            })
        default:
            return shuffle(themes).sort((a, b) => {
                a = a.score + "";
                b = b.score + "";
                a = parseInt(a.charAt(0)) + parseInt(a.charAt(1)) + parseInt(a.charAt(2)) + parseInt(a.charAt(3));
                b = parseInt(b.charAt(0)) + parseInt(b.charAt(1)) + parseInt(b.charAt(2)) + parseInt(b.charAt(3));
                return b - a;
            });
    }
}

let cache = {};

function themeSort(sort) {
    current_sort = sort;
    current_page_num = 1;
    allThemes = themeSortFn(current_sort);
    displayThemeList(0);
}

function clickout() {
    setTimeout(() => {
        document.getElementById("theme-sort-selector").classList.remove("open");
        document.removeEventListener("click", clickout);
    }, 10);
}

// shuffled so equal scores get no fixed order
function shuffle (arr) {
    var j, x, index;
    for (index = arr.length - 1; index > 0; index--) {
        j = Math.floor(Math.random() * (index + 1));
        x = arr[index];
        arr[index] = arr[j];
        arr[j] = x;
    }
    return arr;
}

let current_page_num = 1;
let maxPage = 0;
let searchFor = "";
let current_sort = "Popular";
let allThemes = themeSortFn(current_sort);

let fallback = false;


function saveCurrentTheme() {
    const allOptions = syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "card_colors", "custom_styles"]);
    chrome.storage.local.get(["saved_themes", "custom_styles"], local => {
        chrome.storage.sync.get(allOptions, async sync => {
            if (local["custom_styles"] !== undefined) sync["custom_styles"] = local["custom_styles"];
            let current = await getExport(sync, allOptions);
            let trimmed = { 
                "disable_color_overlay": current["disable_color_overlay"], 
                "gradient_cards": current["gradient_cards"],
                "dark_mode": current["dark_mode"],
                "dark_preset": current["dark_preset"],
                "custom_cards": current["custom_cards"],
                "card_colors": current["card_colors"] === null ? [current["dark_preset"]["links"]] : current["card_colors"],
                "custom_font": current["custom_font"],
                "custom_font_skip_p": current["custom_font_skip_p"],
                "better_todo": current["better_todo"],
                "todo_hide_feedback": current["todo_hide_feedback"],
                "todo_hide_read": current["todo_hide_read"] !== false,
                "todo_full_height": current["todo_full_height"],
                "todo_celebrations_enabled": current["todo_celebrations_enabled"],
                "todo_celebrations": current["todo_celebrations"],
                "todo_celebration_amount": current["todo_celebration_amount"],
                "todo_progress_rings": current["todo_progress_rings"],
                "todo_timeframe": current["todo_timeframe"],
                "todo_timeframe_custom_past": current["todo_timeframe_custom_past"],
                "todo_timeframe_custom_future": current["todo_timeframe_custom_future"],
                "todo_hr24": current["todo_hr24"],
                "todo_separate_scrollbar": current["todo_separate_scrollbar"],
                "todo_alternate_colors": current["todo_alternate_colors"],
                "todo_ignore_card_colors": current["todo_ignore_card_colors"],
                "todo_remove_icons": current["todo_remove_icons"],
                "todo_show_scores": current["todo_show_scores"],
                "better_sidebar": current["better_sidebar"],
                "sidebar_scale": current["sidebar_scale"],
				"imageSize": current["imageSize"],
				"cardRoundness": current["cardRoundness"],
				"imageRoundness": current["imageRoundness"],
				"cardSpacing": current["cardSpacing"],
				"cardWidth": current["cardWidth"],
				"cardHeight": current["cardHeight"],
				"cardPadding": current["cardPadding"],
				"card_grid": current["card_grid"],
				"card_grid_columns": current["card_grid_columns"],
				"card_grid_rows": current["card_grid_rows"],
				"card_grid_column_gap": current["card_grid_column_gap"],
				"card_grid_row_gap": current["card_grid_row_gap"],
				"card_grid_center_rows": current["card_grid_center_rows"],
				"custom_styles": current["custom_styles"],
				"customCardStyles": current["customCardStyles"],
				"customBackgroundLink": current["customBackgroundLink"],
				"customBackgroundScale": current["customBackgroundScale"],
				"customBackgroundDaily": current["customBackgroundDaily"],
				"customBackgroundNasaDaily": current["customBackgroundNasaDaily"],
				"fitImageToScreen": current["fitImageToScreen"],
				"bg_opacity": current["bg_opacity"],
				"sidebar_opacity": current["sidebar_opacity"],
				"bg_blur": current["bg_blur"],
				"sidebar_blur": current["sidebar_blur"],
            }
            const now = new Date();
            local["saved_themes"][now.getTime()] = trimmed;
            chrome.storage.local.set({ "saved_themes": local["saved_themes"] }).then(() => {
                displaySavedThemes();
            });
        });        
    });
}


function displayThemeList(direction = 0) {
    let themesToShow = allThemes;
    if (searchFor) {
        themesToShow = allThemes.filter(theme => theme.title.toLowerCase().includes(searchFor.toLowerCase()));
    }
    displayThemeSearchList(themesToShow, direction);
}


function displayThemeSearchList(themesToShow, pageDir = 0) {
    document.getElementById("theme-current-sort").textContent = current_sort;
    const perPage = 24;
    const maxPage = Math.ceil(themesToShow.length / perPage);
    if (pageDir == -1 && current_page_num > 1) current_page_num--;
    if (pageDir == 1 && current_page_num < maxPage) current_page_num++;
    let container = document.getElementById("premade-themes");
    container.textContent = "";
    let start = (current_page_num - 1) * perPage, end = start + perPage;
    themesToShow.forEach((theme, index) => {
            if (index < start || index >= end) return;
            let themeBtn = makeElement("button", container, { "className": "theme-button" });
            themeBtn.classList.add("customization-button");
            if (!themeBtn.style.background) themeBtn.style.backgroundImage = "linear-gradient(#00000070, #00000070), url(" + theme.preview + ")";
            let split = theme.title.split(" by ");
            makeElement("p", themeBtn, {"className": "theme-button-title", "textContent":  split[0] });
            makeElement("p", themeBtn, {"className": "theme-button-creator", "textContent": split[1] });
            themeBtn.addEventListener("click", () => {
                const allOptions = syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "card_colors", "custom_styles"]);
                chrome.storage.sync.get(allOptions, sync => {
                    chrome.storage.local.get(["previous_theme", "custom_styles"], async local => {
                        if (local["previous_theme"] === null) {
                            if (local["custom_styles"] !== undefined) sync["custom_styles"] = local["custom_styles"];
                            let previous = await getExport(sync, allOptions);
                            chrome.storage.local.set({ "previous_theme": previous });
                        }
                        importTheme(theme.exports);
                    });
                });
            });
        }
    )
}

function getRelativeDate(date, short = false) {
    let now = new Date();
    let timeSince = (now.getTime() - date.getTime()) / 60000;
    let unitKey = short ? "time_min_short" : "time_min";
    let unitFallback = "min";
    let pluralKey = null;
    let pluralFallback = "";
    timeSince = Math.abs(timeSince);
    if (timeSince >= 60) {
        timeSince /= 60;
        unitKey = short ? "time_hour_short" : "time_hour";
        unitFallback = short ? "h" : "hour";
        pluralKey = short ? null : "time_hour_plural";
        pluralFallback = "hours";
        if (timeSince >= 24) {
            timeSince /= 24;
            unitKey = short ? "time_day_short" : "time_day";
            unitFallback = short ? "d" : "day";
            pluralKey = short ? null : "time_day_plural";
            pluralFallback = "days";
            if (timeSince >= 7) {
                timeSince /= 7;
                unitKey = short ? "time_week_short" : "time_week";
                unitFallback = short ? "w" : "week";
                pluralKey = short ? null : "time_week_plural";
                pluralFallback = "weeks";
            }
        }
    }
    timeSince = Math.round(timeSince);
    const unit = getMsg(timeSince > 1 && pluralKey ? pluralKey : unitKey, timeSince > 1 && pluralKey ? pluralFallback : unitFallback);
    let relative = short ? timeSince + unit : timeSince + " " + unit;
    return { time: relative, ms: now.getTime() - date.getTime() };
}

function displaySavedThemes() {
    chrome.storage.local.get("saved_themes", local => {
        const target = document.getElementById("saved-themes");
        target.textContent = "";
        Object.keys(local["saved_themes"]).forEach((key, index) => {
            const created = new Date(parseInt(key));
            let btn = makeElement("div", target, { "className": "saved-theme" });
            let title = makeElement("p", btn, { "className": "theme-button-title", "textContent": (getMsg("theme_number") || "Theme $NUM$").replace("$NUM$", index + 1)});
            let date = makeElement("p", btn, { "className": "theme-button-creator", "textContent": (getMsg("relative_ago", "$TIME$ ago")).replace("$TIME$", getRelativeDate(created).time) });
            let remove = makeElement("div", btn, { "className": "theme-button-remove", "textContent": "x" });
            btn.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.44), rgba(0, 0, 0, 0.44)), url(${local["saved_themes"][key]["custom_cards"]?.[0] || ""})`;
            btn.addEventListener("click", () => {
                importTheme(local["saved_themes"][key]);
            });
            remove.addEventListener("click", () => {
                chrome.storage.local.get("saved_themes", local => {
                    delete local["saved_themes"][key];
                    chrome.storage.local.set({ "saved_themes": local["saved_themes"] }).then(() => {
                        btn.remove();
                    })
                })
            });
        });
    });
}

function getTheme(name) {

    console.log(themes);

    if (name === "all") return themes;
    for (const theme in themes) if (theme.title === name) return theme
    return {};
}

function importTheme(theme) {
    try {
        let keys = Object.keys(theme);
        let final = {};
        let localFinal = null;
        chrome.storage.sync.get("custom_cards", sync => {
            keys.forEach(key => {
                switch (key) {
                    case "dark_preset":
                        changeToPresetCSS(null, theme["dark_preset"]);
                        break;
                    case "card_colors":
                        sendFromPopup("setcolors", theme["card_colors"]);
                        break;
                    case "custom_cards": {
                        // Legacy "none" placeholder meant "no custom card images"; writing it
                        // literally would hide the card images.
                        const themeImgs = (theme["custom_cards"] || []).filter(u => u && u !== "none" && u.trim() !== "");
                        if (theme["custom_cards"].length > 0) {
                            let pos = 0;
                            Object.keys(sync["custom_cards"]).forEach(key => {
                                sync["custom_cards"][key].img = themeImgs.length ? themeImgs[pos] : "";
                                pos = (pos === themeImgs.length - 1) ? 0 : pos + 1;
                            });
                            final["custom_cards"] = sync["custom_cards"];
                        }
                        break;
                    }
                    case "todo_confetti":
                        final["todo_celebrations"] = theme["todo_confetti"] === false ? [] : ["confetti"];
                        break;
                    default:
                        final[key] = theme[key];
                        break;
                }
            });
            if (Object.prototype.hasOwnProperty.call(final, "custom_styles")) {
                localFinal = { "custom_styles": final["custom_styles"] };
                delete final["custom_styles"];
            }
            chrome.storage.sync.set(final);
            if (localFinal) chrome.storage.local.set(localFinal);
        });
    } catch (e) {
        console.log(e);
    }
}

function updateCards(key, value) {
    chrome.storage.sync.get(["custom_cards"], result => {
        chrome.storage.sync.set({ "custom_cards": { ...result["custom_cards"], [key]: { ...result["custom_cards"][key], ...value } } }, () => {
            if (chrome.runtime.lastError) {
                displayAlert(true, getMsg("storage_limit_error", "The data you're entering is exceeding the storage limit, so it won't save. Try using shorter links, and make sure to press \"copy image address\" and not \"copy image\" for links."));
            }
        })
    });
}

function displayCustomFont() {
    chrome.storage.sync.get(["custom_font"], storage => {
        let el = document.querySelector(".custom-font");
        let linkContainer = document.querySelector(".custom-font-flex") || makeElement("div", el, {"className": "custom-font-flex" });
        linkContainer.innerHTML = '<span>https://fonts.googleapis.com/css2?family=</span><input class="card-input" id="custom-font-link"></input>';
        let link = linkContainer.querySelector("#custom-font-link");
        link.value = storage.custom_font.link;

        link.addEventListener("change", function (e) {
            let linkVal = e.target.value.split(":")[0];
            let familyVal = linkVal.replace("+", " ");
            linkVal += linkVal === "" ? "" : ":wght@400;700";
            familyVal = linkVal === "" ? "" : "'" + familyVal + "'";
            chrome.storage.sync.set({ "custom_font": { "link": linkVal, "family": familyVal } });
            link.value = linkVal;
        });

        const popularFonts = ["Arimo", "Barriecito", "Barlow", "Caveat", "Cinzel", "Comfortaa", "Corben", "DM Sans", "Expletus Sans", "Gluten", "Happy Monkey", "Inconsolata", "Inria Sans", "Jost", "Kanit", "Karla", "Kode Mono", "Lobster", "Lora", "Madimi One", "Mali", "Montserrat", "Nanum Myeongjo", "Open Sans", "Oswald", "Permanent Marker", "Playfair Display", "Poetsen One", "Poppins", "Quicksand", "Rakkas", "Redacted Script", "Roboto Mono", "Rubik", "Silkscreen", "Sixtyfour", "Syne Mono", "Tektur", "Texturina", "Ysabeau Infant", "Yuji Syuku"];
        let quickFonts = document.querySelector("#quick-fonts");
        quickFonts.textContent = "";
        let noFont = makeElement("button", quickFonts, { "className": "customization-button", "textContent": getMsg("todo_progress_none") || "None" });
        noFont.addEventListener("click", () => {
            chrome.storage.sync.set({ "custom_font": { "link": "", "family": "" } });
            link.value = "";
        })
        popularFonts.forEach(font => {
            let btn = makeElement("button", quickFonts, { "className":"customization-button", "textContent": font });
            btn.addEventListener("click", () => {
                let linkVal = font.replace(" ", "+") + ":wght@400;700";
                chrome.storage.sync.set({ "custom_font": { "link": linkVal, "family": "'" + font + "'" } });
                link.value = linkVal;
            });
        });
    });
}

let removeAlert = null;

function clearAlert() {
    clearTimeout(removeAlert);
    document.querySelector("#alert").style.bottom = "-400px";
}

function displayAlert(bad, msg) {
    clearTimeout(removeAlert);
    document.querySelector("#alert").style.bottom = "0";
    document.querySelector("#alert").textContent = msg;
    document.querySelector("#alert").style.background = bad ? "#e7495ed9" : "#468b46d9";
    removeAlert = setTimeout(() => {
        clearAlert();
    }, 15000);
}

function setCustomImage(key, val) {
    if (val !== "" && val !== "none") {
        let test = new Image();
        test.onerror = () => {
            displayAlert(true, getMsg("image_link_error", "It seems that the image link you provided isn't working. Make sure to right click on any images you want to use and select \"copy image address\" to get the correct link."));
            updateCards(key, { "img": val });
        }
        test.onload = clearAlert;
        test.src = val;
    }
    updateCards(key, { "img": val });
}

async function displayAdvancedCards() {
    // Syncs only on fresh install or when a stored card lacks fullName.
    const needsSync = await new Promise(resolve => {
        chrome.storage.sync.get("custom_cards", s => {
            const c = s.custom_cards || {};
            const ids = Object.keys(c);
            resolve(!ids.length || ids.some(id => !c[id].fullName));
        });
    });
    if (needsSync) await sendFromPopup("getCards");
    chrome.storage.sync.get(["custom_cards", "custom_cards_2"], storage => {


		const cardGrid = document.getElementById("card-grid");
        if (!cardGrid) {
            console.error("Card grid element not found");
            return;
        }

        cardGrid.innerHTML = "";
        const customCards = storage.custom_cards || {};
        const customCards2 = storage.custom_cards_2 || {};
		const allCards = {};
		Object.keys(customCards).forEach((courseId) => {
			allCards[courseId] = {
				...customCards[courseId],
				...(customCards2[courseId] || {}),
			};
		});

		Object.keys(customCards2).forEach((courseId) => {
			if (!allCards[courseId]) {
				allCards[courseId] = customCards2[courseId];
			}
		});

        if (Object.keys(allCards).length === 0) {
            cardGrid.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">' + (getMsg("no_course_cards") || "No course cards found. Visit your Canvas dashboard to load courses.") + '</p>';
            return;
        }

        Object.keys(allCards).forEach(courseId => {
            const course = allCards[courseId];
            if (course && typeof course === 'object') {
                const courseButton = createCourseButton(courseId, course);
                cardGrid.appendChild(courseButton);
            }
        });

        // showCardEditMenu leaves an inline display:none; clear it to show cards.
        cardGrid.style.display = "";
        const editMenu = document.getElementById("card-edit-menu");
        if (editMenu) {
            editMenu.style.display = "none";
        }
    });
}

const CARD_EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-eye"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>';

function createCourseButton(courseId, courseData) {
	const button = document.createElement("button");
	button.className = "course-card-button";
	const displayName =
		courseData.name ||
		courseData.fullName ||
		courseData.default ||
		courseData.code ||
		`Course ${courseId}`;
	button.textContent = displayName;
	button.dataset.courseId = courseId;

	if (courseData.img || courseData.hidden || courseData.hide || courseData.hide_todo) {
		button.classList.add("customized");
	}

	button.addEventListener("click", () => {
		document.querySelectorAll(".course-card-button").forEach(btn => btn.classList.remove("active"));
		button.classList.add("active");
		showCardEditMenu(courseId, courseData);
	});

	const tile = document.createElement("div");
	tile.className = "course-card-tile";
	tile.classList.toggle("card-hidden", courseData.hidden === true);
	tile.appendChild(button);
	makeElement("button", tile, { className: "course-card-hide-toggle", title: getMsg("card_hide_toggle", "Hide/show on dashboard"), innerHTML: CARD_EYE_SVG }).addEventListener("click", () => {
		const hidden = courseData.hidden !== true;
        courseData.hidden = courseData.hide = hidden;
		updateCards(courseId, { hidden, hide: hidden });
		tile.classList.toggle("card-hidden", hidden);
	});

	return tile;
}

function showCardEditMenu(courseId, courseData) {
	const editMenu = document.getElementById("card-edit-menu");
	const cardGrid = document.getElementById("card-grid");
	if (cardGrid) cardGrid.style.display = "none";
	editMenu.style.display = "block";

	const displayName =
		courseData.name ||
		courseData.fullName ||
		courseData.default ||
		courseData.code ||
		`Course ${courseId}`;

	editMenu.innerHTML = `
        <div class="card-edit-header">
            <h3 class="card-edit-title">${displayName}</h3>
            <button class="card-close-btn" id="card-close-btn">close</button>
        </div>
        
        <div class="card-edit-section">
            <label class="card-edit-label">Custom Name</label>
            <input type="text" class="card-input" id="card-name-input" 
                   value="${courseData.name || ""}" placeholder="Enter custom course name">
        </div>
        
        <div class="card-edit-section">
            <label class="card-edit-label">Custom Code</label>
            <input type="text" class="card-input" id="card-code-input" 
                   value="${courseData.code || ""}" placeholder="Enter custom course code">
        </div>
        
        <div class="card-edit-section">
            <label class="card-edit-label">Card Image URL</label>
            <input type="text" class="card-input" id="card-image-input" 
                   value="${courseData.img || ""}" placeholder="Enter image URL or 'none'">
            <div class="card-image-preview" id="card-image-preview"></div>
        </div>
        
        <div class="card-edit-section">
            <label class="card-edit-label">Hide Card</label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="card-hide-input" ${courseData.hidden || courseData.hide ? "checked" : ""}>
                <span>Hide this card from dashboard</span>
            </div>
        </div>
        
        <div class="card-edit-section">
            <label class="card-edit-label">Better Todo List</label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="card-todo-hidden-input" ${courseData.hide_todo === true ? "checked" : ""}>
                <span>Hide this course from the Better Todo list</span>
            </div>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="big-button" id="save-card-btn">Save Changes</button>
            <button class="customization-button" id="reset-card-btn">Reset to Default</button>
        </div>
    `;

	document
		.getElementById("card-close-btn")
		.addEventListener("click", hideCardEditMenu);
	document
		.getElementById("save-card-btn")
		.addEventListener("click", () => saveCardChanges(courseId));
	document
		.getElementById("reset-card-btn")
		.addEventListener("click", () => resetCardToDefault(courseId));

	updateImagePreview();
	document
		.getElementById("card-image-input")
		.addEventListener("input", updateImagePreview);
}

function updateImagePreview() {
	const imageInput = document.getElementById("card-image-input");
	const preview = document.getElementById("card-image-preview");

	if (imageInput && preview) {
		const imageUrl = imageInput.value;
		if (imageUrl && imageUrl !== "none" && imageUrl.trim() !== "") {
			preview.style.backgroundImage = `url(${imageUrl})`;
			preview.style.display = "block";
		} else {
			preview.style.backgroundImage = "none";
			preview.style.display = "none";
		}
	}
}

function saveCardChanges(courseId) {
	const nameInput = document.getElementById("card-name-input");
	const codeInput = document.getElementById("card-code-input");
	const imageInput = document.getElementById("card-image-input");
	const hideInput = document.getElementById("card-hide-input");
	const todoHiddenInput = document.getElementById("card-todo-hidden-input");

	const updates = {
		name: nameInput.value,
		code: codeInput.value,
		img: imageInput.value,
		hidden: hideInput.checked,
		hide: hideInput.checked,
		hide_todo: todoHiddenInput.checked,
	};

	if (imageInput.value !== "" && imageInput.value !== "none") {
		setCustomImage(courseId, imageInput.value);
	} else {
		updateCards(courseId, updates);
	}

	displayAlert(false, getMsg("card_settings_saved", "Card settings saved successfully!"));

	hideCardEditMenu();

	setTimeout(() => {
		displayAdvancedCards();
	}, 500);
}


function resetCardToDefault(courseId) {
	updateCards(courseId, { name: "", code: "", img: "", hidden: false, hide: false, hide_todo: false });
	displayAlert(false, getMsg("card_reset_default", "Card reset to default settings!"));

	setTimeout(() => {
		displayAdvancedCards();
	}, 500);
}

function hideCardEditMenu() {
	const editMenu = document.getElementById("card-edit-menu");
	const cardGrid = document.getElementById("card-grid");

	if (editMenu) editMenu.style.display = "none";
	if (cardGrid) cardGrid.style.display = "grid";

	document
		.querySelectorAll(".course-card-button")
		.forEach((btn) => btn.classList.remove("active"));
}

function toggleDarkModeDisable(disabled) {
    let darkSwitch = document.querySelector('#dark_mode');
    if (disabled === true) {
        darkSwitch.classList.add('switch_disabled');
        darkSwitch.style.pointerEvents = "none";
    } else {
        darkSwitch.classList.remove('switch_disabled');
        darkSwitch.style.pointerEvents = "auto";
    }
}


function getPalette(name) {
    const colors = {
        "Blues": ["#ade8f4", "#90e0ef", "#48cae4", "#00b4d8", "#0096c7"],
        "Reds": ["#e01e37", "#c71f37", "#b21e35", "#a11d33", "#6e1423"],
        "Rainbow": ["#ff0000", "#ff5200", "#efea5a", "#3cf525", "#147df5", "#be0aff"],
        "Candy": ["#cdb4db", "#ffc8dd", "#ffafcc", "#bde0fe", "#a2d2ff"],
        "Purples": ["#e0aaff", "#c77dff", "#9d4edd", "#7b2cbf", "#5a189a"],
        "Pastels": ["#fff1e6", "#fde2e4", "#fad2e1", "#bee1e6", "#cddafd"],
        "Ocean": ["#22577a", "#38a3a5", "#57cc99", "#80ed99", "#c7f9cc"],
        "Sunset": ["#eaac8b", "#e56b6f", "#b56576", "#6d597a", "#355070"],
        "Army": ["#6b705c", "#a5a58d", "#b7b7a4", "#ffe8d6", "#ddbea9", "#cb997e"],
        "Pinks": ["#ff0a54", "#ff5c8a", "#ff85a1", "#ff99ac", "#fbb1bd"],
        "Watermelon": ["#386641", "#6a994e", "#a7c957", "#f2e8cf", "#bc4749"],
        "Popsicle": ["#70d6ff", "#ff70a6", "#ff9770", "#ffd670", "#e9ff70"],
        "Chess": ["#ffffff", "#000000"],
        "Greens": ["#d8f3dc", "#b7e4c7", "#95d5b2", "#74c69d", "#52b788"],
        "Fade": ["#ff69eb", "#ff86c8", "#ffa3a5", "#ffbf81", "#ffdc5e"],
        "Oranges": ["#ffc971", "#ffb627", "#ff9505", "#e2711d", "#cc5803"],
        "Mesa": ["#f6bd60", "#f28482", "#f5cac3", "#84a59d", "#f7ede2"],
        "Berries": ["#4cc9f0", "#4361ee", "#713aed", "#9348c3", "#f72585"],
        "Fade2": ["#f2f230", "#C2F261", "#91f291", "#61F2C2", "#30f2f2"],
        "Muted": ["#E7E6F7", "#E3D0D8", "#AEA3B0", "#827081", "#C6D2ED"],
        "Base": ["#e3b505", "#95190C", "#610345", "#107E7D", "#044B7F"],
        "Fruit": ["#7DDF64", "#C0DF85", "#DEB986", "#DB6C79", "#ED4D6E"],
        "Night": ["#25171A", "#4B244A", "#533A7B", "#6969B3", "#7F86C6"]
    }
    return colors[name] || [];
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function getColorInGradient(d, from, to) {
    let pat = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
    var exec1 = pat.exec(from);
    var exec2 = pat.exec(to);
    let a1 = [parseInt(exec1[1], 16), parseInt(exec1[2], 16), parseInt(exec1[3], 16)];
    let a2 = [parseInt(exec2[1], 16), parseInt(exec2[2], 16), parseInt(exec2[3], 16)];
    let rgb = a1.map((x, i) => Math.floor(a1[i] + d * (a2[i] - a1[i])));
    return "#" + componentToHex(rgb[0]) + componentToHex(rgb[1]) + componentToHex(rgb[2]);
}

function displaySidebarMode(mode, style) {
    style = style.replace(" ", "");
    let match = style.match(/linear-gradient\((?<color1>\#\w*),(?<color2>\#\w*)\)/);
    let c1 = c2 = "#000000";

    if (mode === "image") {
        document.querySelector("#radio-sidebar-image").checked = true;
        document.querySelector("#sidebar-color2").style.display = "flex";
        document.querySelector("#sidebar-image").style.display = "flex";
        if (style.includes("url") && match) {
            if (match.groups.color1) c1 = match.groups.color1.replace("c7", "");
            if (match.groups.color2) c2 = match.groups.color2.replace("c7", "");
        }
        let url = style.match(/url\(\"(?<url>.*)\"\)/);
        document.querySelector('#sidebar-image input[type="text"]').value = url && url.groups.url ? url.groups.url : "";
    } else if (mode === "gradient") {
        document.querySelector("#radio-sidebar-gradient").checked = true;
        document.querySelector("#sidebar-color2").style.display = "flex";
        document.querySelector("#sidebar-image").style.display = "none";
        if (!style.includes("url") && match) {
            if (match.groups.color1) c1 = match.groups.color1;
            if (match.groups.color2) c2 = match.groups.color2;
        }
    } else {
        document.querySelector("#radio-sidebar-solid").checked = true;
        document.querySelector("#sidebar-color2").style.display = "none";
        document.querySelector("#sidebar-image").style.display = "none";
        c1 = match ? "#000000" : style;
    }

    document.querySelector('#sidebar-color1 input[type="text"]').value = c1;
    document.querySelector('#sidebar-color1 input[type="color"]').value = c1;
    document.querySelector('#sidebar-color2 input[type="text"]').value = c2;
    document.querySelector('#sidebar-color2 input[type="color"]').value = c2;
}

let presetChangeTimeout = null;

chrome.storage.sync.get(["dark_preset"], storage => {
    let tab = document.querySelector(".customize-dark");
    Object.keys(storage["dark_preset"]).forEach(key => {
        if (key !== "sidebar") {
            let c = tab.querySelector("#dp_" + key);
            let color = c.querySelector('input[type="color"]');
            let text = c.querySelector('input[type="text"]');
            [color, text].forEach(changer => {
                changer.value = storage["dark_preset"][key];
                changer.addEventListener("input", function (e) {
                    clearTimeout(presetChangeTimeout);
                    presetChangeTimeout = setTimeout(() => changeCSS(key, e.target.value), 200);
                });
            });
        } else {
            let mode = storage["dark_preset"][key].includes("url") ? "image" : storage["dark_preset"][key].includes("gradient") ? "gradient" : "solid";
            displaySidebarMode(mode, storage["dark_preset"][key]);
            let changeSidebar = () => {
                let c1 = tab.querySelector('#sidebar-color1 input[type="text"]').value.replace("c7", "");
                let c2 = tab.querySelector('#sidebar-color2 input[type="text"]').value.replace("c7", "");
                let url = tab.querySelector('#sidebar-image input[type="text"]').value;
                if (tab.querySelector("#radio-sidebar-image").checked) {
                    changeCSS(key, `linear-gradient(${c1}c7, ${c2}c7), center url("${url}")`);
                } else if (tab.querySelector("#radio-sidebar-gradient").checked) {
                    changeCSS(key, `linear-gradient(${c1}, ${c2})`);
                } else {
                    changeCSS(key, c1);
                }
            }
            ["#sidebar-color1", "#sidebar-color2"].forEach(group => {
                ['input[type="text"]', 'input[type="color"]'].forEach(input => {
                    document.querySelector(group + " " + input).addEventListener("input", e => {
                        ['input[type="text"]', 'input[type="color"]'].forEach(i => {
                            document.querySelector(group + " " + i).value = e.target.value;
                        });
                        clearTimeout(presetChangeTimeout);
                        presetChangeTimeout = setTimeout(() => changeSidebar(), 200);
                    });
                });
            });
            document.querySelector('#sidebar-image input[type="text"').addEventListener("change", () => changeSidebar());
        }
    });
});

function refreshColors() {
    chrome.storage.sync.get(["dark_preset"], storage => {
        Object.keys(storage["dark_preset"]).forEach(key => {
            let c = document.querySelector("#dp_" + key);
            let color = c.querySelector('input[type="color"]');
            let text = c.querySelector('input[type="text"]');
            color.value = storage["dark_preset"][key];
            text.value = storage["dark_preset"][key];
        });
        let mode = storage["dark_preset"]["sidebar"].includes("url") ? "image" : storage["dark_preset"]["sidebar"].includes("gradient") ? "gradient" : "solid";
        displaySidebarMode(mode, storage["dark_preset"]["sidebar"]);
    });
}

function changeCSS(name, color) {
    chrome.storage.sync.get("dark_preset", storage => {
        storage["dark_preset"][name] = color;
        chrome.storage.sync.set({ "dark_preset": storage["dark_preset"] }).then(() => refreshColors());
    });
}

function changeToPresetCSS(e, preset = null) {
    const presets = {
        "dark-lighter": { "background-0": "#272727", "background-1": "#353535", "background-2": "#404040", "borders": "#454545", "sidebar": "#353535", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#56Caf0", "sidebar-text": "#f5f5f5" },
        "dark-light": { "background-0": "#202020", "background-1": "#2e2e2e", "background-2": "#4e4e4e", "borders": "#404040", "sidebar": "#2e2e2e", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#56Caf0", "sidebar-text": "#f5f5f5" },
        "dark-default": { "background-0": "#161616", "background-1": "#1e1e1e", "background-2": "#262626", "borders": "#3c3c3c", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#56Caf0", "sidebar": "#1e1e1e", "sidebar-text": "#f5f5f5" },
        "dark-dark": { "background-0": "#101010", "background-1": "#121212", "background-2": "#1a1a1a", "borders": "#272727", "sidebar": "#121212", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#56Caf0", "sidebar-text": "#f5f5f5" },
        "dark-darker": { "background-0": "#000000", "background-1": "#000000", "background-2": "#000000", "borders": "#000000", "sidebar": "#000000", "text-0": "#c5c5c5", "text-1": "#c5c5c5", "text-2": "#c5c5c5", "links": "#c5c5c5", "sidebar-text": "#c5c5c5" },
        "dark-blue": { "background-0": "#14181d", "background-1": "#1a2026", "background-2": "#212930", "borders": "#2e3943", "sidebar": "#1a2026", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#56Caf0", "sidebar-text": "#f5f5f5" },
        "dark-mint": { "background-0": "#0f0f0f", "background-1": "#0c0c0c", "background-2": "#141414", "borders": "#1e1e1e", "sidebar": "#0c0c0c", "text-0": "#f5f5f5", "text-1": "#e2e2e2", "text-2": "#ababab", "links": "#7CF3CB", "sidebar-text": "#f5f5f5" },
        "dark-burn": { "background-0": "#ffffff", "background-1": "#ffffff", "background-2": "#ffffff", "borders": "#cccccc", "sidebar": "#ffffff", "text-0": "#cccccc", "text-1": "#cccccc", "text-2": "#cccccc", "links": "#cccccc", "sidebar-text": "#cccccc" },
        "dark-unicorn": { "background-0": "#ff6090", "background-1": "#00C1FF", "background-2": "#FFFF00", "borders": "#FFFF00", "sidebar": "#00C1FF", "text-0": "#ffffff", "text-1": "#ffffff", "text-2": "#ffffff", "links": "#000000", "sidebar-text": "#ffffff" },
        "dark-lightmode": { "background-0": "#ffffff", "background-1": "#f5f5f5", "background-2": "#d4d4d4", "borders": "#c7cdd1", "links": "#04ff00", "sidebar": "#04ff00", "sidebar-text": "#ffffff", "text-0": "#2d3b45", "text-1": "#919191", "text-2": "#a5a5a5" },
        "dark-catppuccin": { "background-0": "#11111b", "background-1": "#181825", "background-2": "#1e1e2e", "borders": "#4f5463", "text-0": "#cdd6f4", "text-1": "#7f849c", "text-2": "#a6e3a1", "links": "#f5c2e7", "sidebar": "#181825", "sidebar-text": "#7f849c" },
        "dark-sage": { "background-0": "#2f3e46", "background-1": "#354f52", "background-2": "#52796f", "borders": "#84a98c", "links": "#d8f5c7", "sidebar": "#354f52", "sidebar-text": "#e2e8de", "text-0": "#e2e8de", "text-1": "#cad2c5", "text-2": "#adb1aa" },
        "dark-pink": { "background-0": "#ffffff", "background-1": "#ffe0ed", "background-2": "#ff0066", "borders": "#ff007b", "links": "#ff0088", "sidebar": "#f490b3", "sidebar-text": "#ffffff", "text-0": "#ff0095", "text-1": "#ff8f8f", "text-2": "#ff5c5c" },
        "dark-coral": {"background-0":"#131c26","background-1":"#0e1721","background-2":"#151c24","borders":"#0e1721","links":"#f88379","sidebar":"#131c26","sidebar-text":"#f88379","text-0":"#f88379","text-1":"#f88379","text-2":"#f88379"},
    }
    if (preset === null) preset = presets[e.target.id] || presets["default"];
    applyPreset(preset);
}

function applyPreset(preset) {
    chrome.storage.sync.set({ "dark_preset": preset }).then(() => refreshColors());
}

function makeElement(element, location, options) {
    let creation = document.createElement(element);
    Object.keys(options).forEach(key => {
        creation[key] = options[key];
    });
    location.appendChild(creation);
    return creation
}

async function sendFromPopup(message, options = {}) {

    let response = new Promise((resolve, reject) => {
        chrome.tabs.query({ currentWindow: true }).then(async tabs => {
            for (let i = 0; i < tabs.length; i++) {
                try {
                    let res = await chrome.tabs.sendMessage(tabs[i].id, { "message": message, "options": options });
                    if (res) resolve(res);
                } catch (e) {
                }
            }
            resolve(null);
        });
    })

    return await response;
}
