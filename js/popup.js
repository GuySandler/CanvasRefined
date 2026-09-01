const syncedSwitches = ['remind', 'tab_icons', 'dark_mode', 'remlogo', 'full_width', 'auto_dark', 'assignments_due', 'gpa_calc', 'gradient_cards', 'disable_color_overlay', 'dashboard_grades', 'dashboard_notes', 'better_todo', 'better_sidebar', 'condensed_cards', 'hide_new_canvas', 'hide_sequence_footer', 'center_cards', 'quiz_safe_mode', 'global_search', 'grade_analytics'];
const syncedSubOptions = [
	"grade_analytics_zones",
	"todo_hide_feedback",
	"todo_full_height",
    "todo_confetti",
    "todo_progress_rings",
    "todo_timeframe",
	"device_dark",
	"relative_dues",
	"card_overdues",
	"equal_height_cards",
	// "todo_overdues",
	"gpa_calc_prepend",
	"gpa_calc_cumulative",
	"gpa_calc_weighted",
	"auto_dark",
	"auto_dark_start",
	"auto_dark_end",
	"num_assignments",
	"assignment_date_format",
	"todo_hr24",
	"todo_separate_scrollbar",
	"todo_alternate_colors",
	"todo_ignore_card_colors",
	"todo_remove_icons",
	"grade_hover",
	"card_letter",
	// "hide_completed",
	"num_todo_items",
	"hover_preview",
	"customCardStyles",
	"imageSize",
	"cardRoundness",
	"cardSpacing",
	"cardWidth",
	"cardHeight",
	"cardPadding",
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

// Theme export only carries visual settings, never personal productivity data.
const exportDarkSchedule = ["auto_dark", "auto_dark_start", "auto_dark_end", "device_dark"];
const exportCardColorToggles = ["gradient_cards", "disable_color_overlay"];
const exportCardStyles = ["customCardStyles", "imageSize", "cardRoundness", "cardSpacing", "cardWidth", "cardHeight", "cardPadding"];
const exportLayout = ["full_width", "center_cards", "condensed_cards", "equal_height_cards", "remlogo", "hide_new_canvas", "tab_icons"];
const exportSidebar = ["better_sidebar", "sidebar_scale"];
const exportTodo = ["better_todo", "todo_hide_feedback", "todo_full_height", "todo_confetti", "todo_progress_rings", "todo_timeframe", "todo_hr24", "todo_separate_scrollbar", "todo_alternate_colors", "todo_ignore_card_colors", "todo_remove_icons", "hover_preview"];
const exportGpa = ["gpa_calc", "gpa_calc_prepend", "gpa_calc_cumulative", "gpa_calc_weighted"];
const exportBackground = ["customBackgroundLink", "customBackgroundScale", "customBackgroundDaily", "customBackgroundNasaDaily", "fitImageToScreen", "card_transparency", "bg_opacity", "sidebar_opacity", "bg_blur", "sidebar_blur", "card_opacity", "card_blur"];
// Master "On/off toggles" = every visual toggle (no GPA, no dark-mode schedule,
// no personal productivity features). Includes the former separate Layout and
// Sidebar groups, plus Grade Analytics and its colored-zones sub-toggle.
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
        "gpa_calc": false,
        "dark_mode": true,
        "gradent_cards": false,
        "disable_color_overlay": false,
        "auto_dark": false,
        "auto_dark_start": { "hour": "20", "minute": "00" },
        "auto_dark_end": { "hour": "08", "minute": "00" },
        "num_assignments": 4,
        "custom_domain": [""],
        "assignments_done": [],
        "dashboard_grades": false,
        "assignment_date_format": false,
        "dashboard_notes": false,
        "dashboard_notes_text": "",
        "dashboard_notes_mode": "edit",
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
		"todo_separate_scrollbar": false,
		"todo_alternate_colors": false,
		"todo_ignore_card_colors": false,
		"todo_remove_icons": false,
        "condensed_cards": false,
        "center_cards": false,
        "custom_cards": {},
        "custom_cards_2": {},
        "custom_cards_3": {},
        "custom_assignments": [],
        "custom_assignments_overflow": ["custom_assignments"],
        "grade_hover": false,
        "card_letter": true,
        // "hide_completed": false,
        "num_todo_items": 10,
        "custom_font": { "link": "", "family": "" },
        "hover_preview": true,
        "full_width": null,
        "remlogo": null,
        "gpa_calc_bounds": {
            "A+": { "cutoff": 97, "gpa": 4.3 },
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
        // "todo_overdues": false,
        "card_overdues": false,
        "relative_dues": false,
        "equal_height_cards": false,
        "hide_new_canvas": true,
        "hide_sequence_footer": false,
        "grade_analytics_zones": false,
        "quiz_safe_mode": false,
        "dark_mode_fix": [],
        "assignment_states": {},
        "tab_icons": false,
        "todo_hide_feedback": false,
		"todo_full_height": false,
        "todo_progress_rings": "rings",
		"todo_timeframe": "all",
		"todo_confetti": true,
        "device_dark": false,
        "cumulative_gpa": { "name": "Cumulative GPA", "hidden": false, "weight": "dnc", "credits": 999, "gr": 3.21 },
        // "show_updates": false,
        "card_method_date": false,
        "card_method_dashboard": true,
        "card_limit": 25,
        "imageSize": 100,
        "cardRoundness": 5,
        "cardSpacing": 0,
        "cardWidth": 262,
        "cardHeight": 250,
        "cardPadding": 0,
        "customCardStyles": false,
        "customBackgroundLink": "",
        "customBackgroundScale": 100,
        "customBackgroundDaily": false,
        "customBackgroundNasaDaily": false,
        "fitImageToScreen": false,
    }
};


sendFromPopup("getCards");

// refresh the cards if new ones were just recieved
chrome.storage.onChanged.addListener((changes) => {
    if (changes["custom_cards"]) {
        if (Object.keys(changes["custom_cards"].oldValue).length !== Object.keys(changes["custom_cards"].newValue).length) {
            displayAdvancedCards();
        }
    }
});

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
            //let div = makeElement("div", "customization-button", output, url);
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

// toggle visibility of the Discord/GitHub social links (persists locally)
document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("social-toggle");
    const buttons = document.querySelector(".social-buttons");
    if (!toggle || !buttons) return;
    const KEY = "hide_socials";
    const render = (hidden) => {
        buttons.classList.toggle("hidden", hidden);
        toggle.textContent = chrome.i18n.getMessage(hidden ? "show_links" : "hide_links");
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

// Generic range slider (0..max). `key` is the storage id, `valueId` is the
// <span> that shows the live value, `resetId` is the small reset button that
// restores `defaultValue`. `unit` is appended to the displayed value ("%" or "px").
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

// Progress display dropdown. Normalizes legacy boolean values:
// true -> rings, false/undefined -> none.
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

// Timeframe dropdown for the upcoming Tasks tab. Persisted so the Better Todo
// List remembers the selected range across sessions.
function setupTimeframeSelect(initial) {
    const el = document.querySelector("#todo_timeframe");
    if (!el) return;
    const allowed = ["all", "1week", "2week", "month", "2month"];
    let value = allowed.includes(initial) ? initial : "all";
    el.value = value;
    el.addEventListener("change", function () {
        chrome.storage.sync.set({ "todo_timeframe": this.value });
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

// Custom card style inputs (image size, roundness, spacing, width, height,
// padding) fire `chrome.storage.sync.set` on every keystroke/arrow press.
// chrome.storage.sync caps writes at MAX_WRITE_OPERATIONS_PER_MINUTE (120/min),
// so rapidly adjusting these number inputs used to hit the quota and surface
// a "quota exceeded" error. Coalesce rapid edits into a single write with a
// short (200ms) debounce — barely noticeable to the user, but stays well
// under the write quota even when dragging arrows or typing fast.
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

// The opacity sliders live under "Edit dark mode" but only make sense (and
// only show) when a custom background is active, since transparency without a
// background image behind these surfaces would just expose the dark body.
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

// Card opacity/blur sliders only show when both a custom background is active
// (so #opacity-options is visible) and the "Card transparency" checkbox is on.
function toggleCardTransparencyOptions() {
    const on = document.getElementById("card_transparency")?.checked === true;
    const opacityRow = document.getElementById("card-transparency-options");
    const blurRow = document.getElementById("card-transparency-blur-row");
    if (opacityRow) opacityRow.style.display = on ? "" : "none";
    if (blurRow) blurRow.style.display = on ? "" : "none";
}

// "Alternate colors" (Better Todo List sub-option) only makes sense in light
// mode, so hide its checkbox whenever dark mode is on.
function toggleAlternateColorsVisibility(darkModeOn) {
    const wrap = document.getElementById("todo_alternate_colors_wrap");
    if (wrap) wrap.style.display = darkModeOn ? "none" : "";
}

// Hide a toggle's sub-options when it's off; auto_dark only hides its time clocks.
function toggleSubOptionsVisibility(option, isOn) {
    const togglesWithSubOptions = ["gpa_calc", "assignments_due", "better_todo", "auto_dark", "grade_analytics"];
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

    // Map (reference-keyed) each .tab element -> the button id that opens it.
    // A plain object won't work: DOM elements stringify to the same key.
    const tabElToBtnId = new Map();
    Object.entries(menu.tabs).forEach(([btnId, info]) => {
        const tabEl = document.querySelector(info.tab);
        if (tabEl) tabElToBtnId.set(tabEl, btnId);
    });

    function shouldSkip(el) {
        // Skip overlays / scrapped containers that aren't real features
        if (el.closest('#submit-popup, #browser-settings-popup, #opt-in, #card-edit-menu')) return true;
        // Skip statically-hidden containers but keep dynamically-hidden sub-options.
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
        // Bare <span> label (e.g. Export Settings checkboxes have no label/.sub-text).
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

    // Reveal any hidden sub-option blocks between el and .main so the target
    // is visible (purely visual; doesn't change stored settings).
    function revealAncestors(el) {
        const main = document.querySelector(".main");
        let node = el;
        while (node && node !== main && node !== document.body) {
            if (node.style && node.style.display === "none") node.style.display = "";
            node = node.parentElement;
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

        // Big section buttons (Edit Dark Mode, Cards, Themes, Styles, GPA Settings, Report issue)
        document.querySelectorAll(".more-options-container .tab-btn").forEach(btn => {
            const span = btn.querySelector("span");
            add({ key: "tab:" + btn.id, text: span ? span.textContent.trim() : "", el: btn, action: () => openTab(btn.id) });
        });

        // Home: option toggles
        document.querySelectorAll(".options .option").forEach(opt => {
            if (!opt.id) return;
            const name = opt.querySelector(".option-name");
            if (!name) return;
            if (shouldSkip(opt)) return;
            add({ key: "option:" + opt.id, text: name.textContent.trim(), el: opt, action: () => goToMainElement(opt) });
        });

        // Home: sub-options / timesets / labelled rows (e.g. "Use dd/mm", "Start time", max-items)
        document.querySelectorAll(".options .sub-option, .options .timeset, .options .sub-options > div").forEach(sub => {
            if (shouldSkip(sub)) return;
            // Skip statically-hidden sub-options; dynamically-hidden ones stay indexed.
            if (sub.classList.contains("sub-option") && sub.style.display === "none") return;
            const text = labelOf(sub);
            if (!text) return;
            add({ key: "sub:" + keyIdOf(sub), text, el: sub, action: () => goToMainElement(sub) });
        });

        // Home: custom Canvas URL
        const customDomain = document.querySelector("#customDomain");
        if (customDomain && !shouldSkip(customDomain)) {
            const wrap = customDomain.closest(".customDomain");
            const label = wrap ? wrap.querySelector("[data-i18n='enter_url']") : null;
            add({ key: "custom:customDomain", text: label ? label.textContent.trim() : "Canvas URL", el: wrap || customDomain, action: () => goToMainElement(wrap || customDomain) });
        }

        // Tabs: section headings (e.g. "Presets", "Custom styles", "Popular Palettes", "Custom Background")
        document.querySelectorAll(".tab .header-small").forEach(h => {
            if (shouldSkip(h)) return;
            const text = h.textContent.trim();
            if (!text) return;
            const btnId = tabElToBtnId.get(h.closest(".tab"));
            add({ key: "heading:" + (btnId || "?") + ":" + text, text, el: h, action: () => goToTabElement(h) });
        });

        // Tabs: checkbox sub-options (e.g. "Daily Random Image", "Custom Card Styles")
        document.querySelectorAll(".tab .sub-option").forEach(sub => {
            if (shouldSkip(sub)) return;
            const text = labelOf(sub);
            if (!text) return;
            const btnId = tabElToBtnId.get(sub.closest(".tab"));
            add({ key: "tabsub:" + (btnId || "?") + ":" + keyIdOf(sub), text, el: sub, action: () => goToTabElement(sub) });
        });

        // Dark mode color fields (e.g. "Sidebar Text", "Background Main")
        document.querySelectorAll(".tab .color-type-header").forEach(h => {
            if (shouldSkip(h)) return;
            const text = h.textContent.trim();
            if (!text) return;
            const btnId = tabElToBtnId.get(h.closest(".tab"));
            add({ key: "color:" + (btnId || "?") + ":" + text, text, el: h, action: () => goToTabElement(h) });
        });

        // Tab: range sliders that live in dedicated rows (Opacity & Blur, Image scale).
        // These aren't .sub-option, so the generic blocks above miss them.
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

        // Tab: preset buttons (dark mode presets + popular color palettes).
        document.querySelectorAll(".tab .preset-button").forEach(btn => {
            if (shouldSkip(btn)) return;
            const text = btn.textContent.trim().replace(/\s+/g, " ");
            if (!text || text === "placeholder") return;
            const btnId = tabElToBtnId.get(btn.closest(".tab"));
            add({ key: "preset:" + (btnId || "?") + ":" + (btn.id || text), text, el: btn, action: () => goToTabElement(btn) });
        });

        // Tab: standalone action buttons with distinct labels (GPA scale presets, revert colors).
        ["gpa-plus-minus", "gpa-by-letter", "revert-colors", "clearCustomBackground"].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn || shouldSkip(btn)) return;
            const text = btn.textContent.trim();
            if (!text) return;
            add({ key: "action:" + id, text, el: btn, action: () => goToTabElement(btn) });
        });

        // Tab: checkbox/radio controls whose label is a bare sibling span and that
        // aren't wrapped in .sub-option (e.g. "Get Active Cards From Dashboard",
        // sidebar background "Solid/Gradient/Image").
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
            empty.textContent = "No features found";
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

function setup() {

    const menu = {
		switches: syncedSwitches,
		checkboxes: [
			"browser_show_likes",
			"gpa_calc_weighted",
			"gpa_calc_cumulative",
			// /*'card_method_date',*/ "show_updates",
            "todo_hide_feedback",
            "todo_confetti",
			"todo_full_height",
			"device_dark",
			"relative_dues",
			"card_overdues",
			"equal_height_cards",
			// "todo_overdues",
			"gpa_calc_prepend",
			"auto_dark",
			"assignment_date_format",
			"todo_hr24",
			"todo_separate_scrollbar",
			"todo_alternate_colors",
			"todo_ignore_card_colors",
			"todo_remove_icons",
			"grade_hover",
			"card_letter",
			// "hide_completed",
			"hover_preview",
            "customBackgroundDaily",
            "customBackgroundNasaDaily",
            "fitImageToScreen",
            "card_transparency",
			"customCardStyles",
			"grade_analytics_zones",
		],
		tabs: {
			"advanced-settings": {
				setup: displayAdvancedCards,
				tab: ".advanced",
			},
			"gpa-bounds-btn": {
				setup: displayGPABounds,
				tab: ".gpa-bounds-container",
			},
			"custom-font-btn": {
				setup: displayCustomFont,
				tab: ".custom-font-container",
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
				identifier: "customBackgroundLink",
				setup: (initial) => setupCustomBackgroundLink(initial),
			},
            {
                identifier: "customBackgroundScale",
                setup: (initial) => setupCustomBackgroundScale(initial),
            },
			{
				identifier: "todo_progress_rings",
				setup: (initial) => setupProgressRingsSelect(initial),
			},
			{
				identifier: "todo_timeframe",
				setup: (initial) => setupTimeframeSelect(initial),
			},
		],
	};

    chrome.storage.sync.get(menu.switches, sync => {
        menu.switches.forEach(option => {
            let optionSwitch = document.getElementById(option);
            let status = sync[option] === true ? "#on" : "#off";
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
                if (option === "dark_mode") {
                    toggleAlternateColorsVisibility(status);
                }
                toggleSubOptionsVisibility(option, status);
            });
        });
        toggleBetterSidebarSubOptions(sync["better_sidebar"] === true);
        ["gpa_calc", "assignments_due", "better_todo", "auto_dark", "grade_analytics"].forEach(opt => {
            toggleSubOptionsVisibility(opt, sync[opt] === true);
        });
        toggleAlternateColorsVisibility(sync["dark_mode"] === true);
    });

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
                syncCustomBackgroundDailyState(document.querySelector("#customBackgroundDaily")?.checked === true || document.querySelector("#customBackgroundNasaDaily")?.checked === true);
                toggleOpacityOptions();
            });
            const value = sync[option] !== undefined ? sync[option] : defaultOptions.sync[option];
            document.querySelector("#" + option).checked = value;
        });
        syncCustomBackgroundDailyState(sync.customBackgroundDaily === true || sync.customBackgroundNasaDaily === true);
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


    // activate tab buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (menu.tabs[btn.id].setup !== null) menu.tabs[btn.id].setup();
            document.querySelector(".main").style.display = "none";
            document.querySelector(menu.tabs[btn.id].tab).style.display = "block";
            window.scrollTo(0, 0);
        });
    });

    // activate the back buttons on each tab
    document.querySelectorAll(".back-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".tab").forEach(tab => {
                tab.style.display = "none";
            });
            document.querySelector(".main").style.display = "block";
        });
    });

    // give everything the appropirate i18n text
    document.querySelectorAll('[data-i18n]').forEach(text => {
        const msg = chrome.i18n.getMessage(text.dataset.i18n);
        // keep the in-HTML fallback text when a key is missing instead of blanking it
        if (msg) text.innerText = msg;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const msg = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
        if (msg) el.placeholder = msg;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const msg = chrome.i18n.getMessage(el.dataset.i18nTitle);
        if (msg) el.title = msg;
    });

    // header feature search (search bar that jumps to features)
    setupFeatureSearch(menu);

    // activate dark mode inspector button
    document.querySelector("#inspector-btn").addEventListener("click", async function () {
        document.querySelector("#inspector-output").textContent = (await sendFromPopup("inspect"))["selectors"];
    });

    // activate dark mode fixer button
    document.querySelector("#fix-dm-btn").addEventListener("click", async function () {
        let output = await sendFromPopup("fixdm");
        if (output.path === "canvasrefined-none" || output.path === "canvasrefined-darkmode_off") return;
        let rating = "bad";
        if (output.time < 100) {
            rating = "good";
        } else if (output.time < 250) {
            rating = "ok";
        }
        document.getElementById("fix-dm-output").textContent = "Fix took " + Math.round(output.time) + "ms (rating: " + rating + ")";
        chrome.storage.sync.get("dark_mode_fix", sync => {
            if (sync["dark_mode_fix"].includes(output.path)) return;
            sync["dark_mode_fix"].push(output.path);
            chrome.storage.sync.set({ "dark_mode_fix": sync["dark_mode_fix"] }).then(() => displayDarkModeFixUrls());
        })
    });

    // activate storage dump button
    document.querySelector("#rk_btn").addEventListener("click", () => {
        chrome.storage.local.get(null, local => {
            chrome.storage.sync.get(null, sync => {
                document.querySelector("#rk_output").value = JSON.stringify(local) + JSON.stringify(sync);
            })
        })
    });

    // activate storage reset button
    document.querySelector("#storage-reset-btn").addEventListener("click", () => {
        chrome.storage.sync.set(defaultOptions["sync"]);
    });

    // activate custom url input
    document.querySelector('#customDomain').addEventListener('input', function () {
        let domains = this.value.split(",");
        domains.forEach((domain, index) => {
            let val = domain.replace(" ", "");
            if (val === "") return;
            //if (!val.includes("https://") && !val.includes("http://")) val = "https://" + val;
            try {
                let url = new URL(val);
                domains[index] = url.hostname;
                clearAlert();
            } catch (e) {
                domains[index] = val;
                displayAlert(true, "The URL you entered appears to be invalid, so it might not work.");
            }
        });
        chrome.storage.sync.set({ custom_domain: domains });
    });

    // setup custom url
    chrome.storage.sync.get(["custom_domain"], storage => {
        document.querySelector("#customDomain").value = storage.custom_domain ? storage.custom_domain : "";
    });

    // activate import input box
    document.querySelector("#import-input").addEventListener("input", (e) => {
        const obj = JSON.parse(e.target.value);
        importTheme(obj);
    });

    // copy export output to clipboard
    document.querySelector("#export-copy").addEventListener("click", async () => {
        const output = document.querySelector("#export-output");
        const btn = document.querySelector("#export-copy");
        const text = output.value;
        if (!text) { displayAlert(true, "Nothing to copy — select what to export first."); return; }
        const flash = () => { const old = btn.textContent; btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = old; }, 1200); };
        try {
            await navigator.clipboard.writeText(text);
            flash();
        } catch (e) {
            output.select();
            document.execCommand("copy");
            flash();
        }
    });

    // activate export checkbox
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
                            case "export-customStyles":
                                final = { ...final, ...(await getExport(storage, ["custom_styles"])) };
                                break;
                            case "export-font":
                                final = { ...final, ...(await getExport(storage, ["custom_font"])) };
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

    // Toggle all export checkboxes and dispatch one change event to refresh output.
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

    // activate revert to original button
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

    // activate card color inputs
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

    // activate revert to original card colors button
    document.querySelector("#revert-colors").addEventListener("click", () => {
        chrome.storage.local.get("previous_colors", local => {
            const prev = local["previous_colors"];
            // Guard against unset/expired-shape entries and the empty lists
            // old list-mode runs stored — sending [] would be a silent no-op.
            if (prev && Array.isArray(prev.colors) && prev.colors.length > 0) {
                sendFromPopup("setcolors", prev.colors);
            }
        })
    })

    // activate every card color palette button
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


    // activate sidebar tool radio
    ["#radio-sidebar-image", "#radio-sidebar-gradient", "#radio-sidebar-solid"].forEach(radio => {
        document.querySelector(radio).addEventListener("click", () => {
            chrome.storage.sync.get(["dark_preset"], storage => {
                let mode = radio === "#radio-sidebar-image" ? "image" : radio === "#radio-sidebar-gradient" ? "gradient" : "solid";
                displaySidebarMode(mode, storage["dark_preset"]["sidebar"]);
            });
        })
    });

    // theme browser controls
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
        // linear search
        let themesToShow = [];
        for (let i = 0; i < themes.length; i++) {
            if (themes[i].title.toLowerCase().includes(searchFor.toLowerCase())) {
                themesToShow.push(themes[i]);
            }
        }
        console.log(themesToShow);
        displayThemeSearchList(themesToShow);
    });

    // activate theme save button
    document.getElementById("save-theme").addEventListener("click", saveCurrentTheme);

    // activate submit theme button

    document.getElementById("submit-theme-btn-1").addEventListener("click", () => {
        document.getElementById("submit-popup").classList.add("open");
    });

    document.getElementById("cancel-theme-btn").addEventListener("click", () => {
        document.getElementById("submit-popup").classList.remove("open");
    })

    // update theme button preview on input
    document.getElementById("submit-title").addEventListener("input", (e) => {
        document.getElementById("theme-button-title-preview").textContent = e.target.value.replaceAll(" ", "");
    });

    // update theme button preview on input
    document.getElementById("submit-credits").addEventListener("input", (e) => {
        document.getElementById("theme-button-creator-preview").textContent = e.target.value;
    });

    // activate the show button to open the theme submission drawer
    document.getElementById("show-submit-form").addEventListener("click",  (e) => {
        const drawer = document.getElementById("submit-drawer");
        if (drawer.style.display === "none") {
            drawer.style.display = "block";
            e.target.textContent = "Hide";
        } else {
            drawer.style.display = "none";
            e.target.textContent = "Show";
        }
    });

    // activate theme browser opt out

    // activate theme browser opt in

    document.querySelectorAll(".theme-sort-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            themeSort(e.target.textContent);
        });
    });

    // browser settings buttons
    document.getElementById("browser-settings-btn").addEventListener("click", () => {
        document.getElementById("browser-settings-popup").classList.add("open");
    });

    document.getElementById("close-settings-btn").addEventListener("click", () => {
        displayThemeList(0);
        document.getElementById("browser-settings-popup").classList.remove("open");
    });


    document.getElementById("submit-form-btn").addEventListener("click", displayThemeSubmissionForm);

    document.getElementById("gpa-plus-minus").addEventListener("click", () => {
        applyGPAPreset({
            "A+": { "cutoff": 97, "gpa": 4.0 },
            "A": { "cutoff": 93, "gpa": 4.0 },
            "A-": { "cutoff": 90, "gpa": 3.7 },
            "B+": { "cutoff": 87, "gpa": 3.3 },
            "B": { "cutoff": 83, "gpa": 3.0 },
            "B-": { "cutoff": 80, "gpa": 2.7 },
            "C+": { "cutoff": 77, "gpa": 2.3 },
            "C": { "cutoff": 73, "gpa": 2.0 },
            "C-": { "cutoff": 70, "gpa": 1.7 },
            "D+": { "cutoff": 67, "gpa": 1.3 },
            "D": { "cutoff": 63, "gpa": 1.0 },
            "D-": { "cutoff": 60, "gpa": 0.7 },
            "F": { "cutoff": 0, "gpa": 0 }
        });
    });
    document.getElementById("gpa-by-letter").addEventListener("click", () => {
        applyGPAPreset({
            "A+": { "cutoff": 97, "gpa": 4.0 },
            "A": { "cutoff": 93, "gpa": 4.0 },
            "A-": { "cutoff": 90, "gpa": 4.0 },
            "B+": { "cutoff": 87, "gpa": 3.0 },
            "B": { "cutoff": 83, "gpa": 3.0 },
            "B-": { "cutoff": 89, "gpa": 3.0 },
            "C+": { "cutoff": 77, "gpa": 2.0 },
            "C": { "cutoff": 73, "gpa": 2.0 },
            "C-": { "cutoff": 70, "gpa": 2.0 },
            "D+": { "cutoff": 67, "gpa": 1.0 },
            "D": { "cutoff": 63, "gpa": 1.0 },
            "D-": { "cutoff": 60, "gpa": 1.0 },
            "F": { "cutoff": 0, "gpa": 0 }
        });
    });

    // Note: the card-style number inputs (imageSize, cardRoundness, cardSpacing,
    // cardWidth, cardHeight, cardPadding) are wired via their setup*Input
    // handlers in menu.special above, which debounce the storage writes. The
    // duplicate listeners that used to live here referenced nonexistent
    // #*Value spans (threw on every input) and double-wrote to storage, which
    // is what blew the sync write quota when adjusting card styles quickly.

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

}

function applyGPAPreset(bounds) {
    chrome.storage.sync.set({ "gpa_calc_bounds": bounds }, () => {
        displayGPABounds();
    });
}

function setupCustomStyle(initial) {
    const el = document.getElementById("custom-styles");
    el.value = initial;
    el.addEventListener("change", (e) => {
        chrome.storage.sync.set({ "custom_styles": e.target.value });
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
                    if (storage["custom_cards"][key].img !== "") arr.push(storage["custom_cards"][key].img);
                });
                if (arr.length === 0) {
                    arr = ["none"];
                }
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

// new theme sort button
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

// shuffle function for the score sorting so theres no order bias
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
    chrome.storage.local.get("saved_themes", local => {
        chrome.storage.sync.get(allOptions, async sync => {
            let current = await getExport(sync, allOptions);
            let trimmed = { 
                "disable_color_overlay": current["disable_color_overlay"], 
                "gradient_cards": current["gradient_cards"],
                "dark_mode": current["dark_mode"],
                "dark_preset": current["dark_preset"],
                "custom_cards": current["custom_cards"],
                "card_colors": current["card_colors"] === null ? [current["dark_preset"]["links"]] : current["card_colors"],
                "custom_font": current["custom_font"],
                "better_todo": current["better_todo"],
                "todo_hide_feedback": current["todo_hide_feedback"],
                "todo_full_height": current["todo_full_height"],
                "todo_confetti": current["todo_confetti"],
                "todo_progress_rings": current["todo_progress_rings"],
                "todo_timeframe": current["todo_timeframe"],
                "todo_hr24": current["todo_hr24"],
                "todo_separate_scrollbar": current["todo_separate_scrollbar"],
                "todo_alternate_colors": current["todo_alternate_colors"],
                "todo_ignore_card_colors": current["todo_ignore_card_colors"],
                "todo_remove_icons": current["todo_remove_icons"],
                "better_sidebar": current["better_sidebar"],
                "sidebar_scale": current["sidebar_scale"],
				"imageSize": current["imageSize"],
				"cardRoundness": current["cardRoundness"],
				"cardSpacing": current["cardSpacing"],
				"cardWidth": current["cardWidth"],
				"cardHeight": current["cardHeight"],
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
    // Render the sorted theme list, filtered by any active search.
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
                    chrome.storage.local.get(["previous_theme"], async local => {
                        if (local["previous_theme"] === null) {
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
    let time = "min";
    timeSince = Math.abs(timeSince);
    if (timeSince >= 60) {
        timeSince /= 60;
        time = short ? "h" : "hour";
        if (timeSince >= 24) {
            timeSince /= 24;
            time = short ? "d" : "day";
            if (timeSince >= 7) {
                timeSince /= 7;
                time = short ? "w" : "week";
            }
        }
    }
    timeSince = Math.round(timeSince);
    let relative = timeSince + (short ? "" : " ") + time + (timeSince > 1 && !short ? "s" : "");
    return { time: relative, ms: now.getTime() - date.getTime() };
}

function displaySavedThemes() {
    chrome.storage.local.get("saved_themes", local => {
        const target = document.getElementById("saved-themes");
        target.textContent = "";
        Object.keys(local["saved_themes"]).forEach((key, index) => {
            const created = new Date(parseInt(key));
            let btn = makeElement("div", target, { "className": "saved-theme" });
            let title = makeElement("p", btn, { "className": "theme-button-title", "textContent": `Theme ${index + 1}`});
            let date = makeElement("p", btn, { "className": "theme-button-creator", "textContent": `${getRelativeDate(created).time} ago` });
            let remove = makeElement("div", btn, { "className": "theme-button-remove", "textContent": "x" });
            btn.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.44), rgba(0, 0, 0, 0.44)), url(${local["saved_themes"][key]["custom_cards"][0]})`;
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

    // get localThemes from themes.js
    console.log(themes);

    if (name === "all") return themes;
    for (const theme in themes) if (theme.title === name) return theme
    return {};
}

function importTheme(theme) {
    try {
        let keys = Object.keys(theme);
        let final = {};
        chrome.storage.sync.get("custom_cards", sync => {
            keys.forEach(key => {
                switch (key) {
                    case "dark_preset":
                        changeToPresetCSS(null, theme["dark_preset"]);
                        break;
                    case "card_colors":
                        sendFromPopup("setcolors", theme["card_colors"]);
                        break;
                    case "custom_cards":
                        if (theme["custom_cards"].length > 0) {
                            let pos = 0;
                            Object.keys(sync["custom_cards"]).forEach(key => {
                                sync["custom_cards"][key].img = theme["custom_cards"][pos];
                                pos = (pos === theme["custom_cards"].length - 1) ? 0 : pos + 1;
                            });
                        }
                        final["custom_cards"] = sync["custom_cards"];
                        break;
                    default:
                        final[key] = theme[key];
                        break;
                }
            });
            chrome.storage.sync.set(final);
        });
    } catch (e) {
        console.log(e);
    }
}

function updateCards(key, value) {
    chrome.storage.sync.get(["custom_cards"], result => {
        chrome.storage.sync.set({ "custom_cards": { ...result["custom_cards"], [key]: { ...result["custom_cards"][key], ...value } } }, () => {
            if (chrome.runtime.lastError) {
                displayAlert(true, "The data you're entering is exceeding the storage limit, so it won't save. Try using shorter links, and make sure to press \"copy image address\" and not \"copy image\" for links.");
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
        let noFont = makeElement("button", quickFonts, { "className": "customization-button", "textContent": "None" });
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

function displayGPABounds() {
    chrome.storage.sync.get(["gpa_calc_bounds"], storage => {
        const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
        const el = document.querySelector(".gpa-bounds");
        el.textContent = "";
        order.forEach(key => {
            let inputs = makeElement("div", el, { "className": "gpa-bounds-item" });
            inputs.innerHTML += '<div><span class="gpa-bounds-grade"></span><input class="gpa-bounds-input gpa-bounds-cutoff" type="text"></input><span style="margin-left:6px;margin-right:6px;">%</span><input class="gpa-bounds-input gpa-bounds-gpa" type="text" value=></input><span style="margin-left:6px">GPA</span></div>';
            inputs.querySelector(".gpa-bounds-grade").textContent = key;
            inputs.querySelector(".gpa-bounds-cutoff").value = storage["gpa_calc_bounds"][key].cutoff;
            inputs.querySelector(".gpa-bounds-gpa").value = storage["gpa_calc_bounds"][key].gpa;

            inputs.querySelector(".gpa-bounds-cutoff").addEventListener("change", function (e) {
                chrome.storage.sync.get(["gpa_calc_bounds"], existing => {
                    chrome.storage.sync.set({ "gpa_calc_bounds": { ...existing["gpa_calc_bounds"], [key]: { ...existing["gpa_calc_bounds"][key], "cutoff": parseFloat(e.target.value) } } });
                });
            });

            inputs.querySelector(".gpa-bounds-gpa").addEventListener("change", function (e) {
                chrome.storage.sync.get(["gpa_calc_bounds"], existing => {
                    chrome.storage.sync.set({ "gpa_calc_bounds": { ...existing["gpa_calc_bounds"], [key]: { ...existing["gpa_calc_bounds"][key], "gpa": parseFloat(e.target.value) } } });
                });
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
            displayAlert(true, "It seems that the image link you provided isn't working. Make sure to right click on any images you want to use and select \"copy image address\" to get the correct link.");
            updateCards(key, { "img": val });
        }
        test.onload = clearAlert;
        test.src = val;
    }
    updateCards(key, { "img": val });
}

async function displayAdvancedCards() {
    // Sync from Canvas only when needed: when there are no cards yet (fresh
    // install) or when older cards predate the stored fullName field. Once
    // every card has a fullName this is a no-op and the grid renders instantly.
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
            cardGrid.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No course cards found. Visit your Canvas dashboard to load courses.</p>';
            return;
        }

        Object.keys(allCards).forEach(courseId => {
            const course = allCards[courseId];
            if (course && typeof course === 'object') {
                const courseButton = createCourseButton(courseId, course);
                cardGrid.appendChild(courseButton);
            }
        });

        // showCardEditMenu sets an inline display:none on the grid; clear it
        // so reopening the menu shows the cards again (CSS default = grid).
        cardGrid.style.display = "";
        const editMenu = document.getElementById("card-edit-menu");
        if (editMenu) {
            editMenu.style.display = "none";
        }
    });
}

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

	if (courseData.img || courseData.hidden || courseData.hide) {
		button.classList.add("customized");
	}

	button.addEventListener("click", () => {
		document.querySelectorAll(".course-card-button").forEach(btn => btn.classList.remove("active"));
		button.classList.add("active");
		showCardEditMenu(courseId, courseData);
	});

	return button;
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

	const updates = {
		name: nameInput.value,
		code: codeInput.value,
		img: imageInput.value,
		hidden: hideInput.checked,
		hide: hideInput.checked,
	};

	if (imageInput.value !== "" && imageInput.value !== "none") {
		setCustomImage(courseId, imageInput.value);
	} else {
		updateCards(courseId, updates);
	}

	displayAlert(false, "Card settings saved successfully!");

	hideCardEditMenu();

	setTimeout(() => {
		displayAdvancedCards();
	}, 500);
}


function resetCardToDefault(courseId) {
	updateCards(courseId, { name: "", code: "", img: "", hidden: false, hide: false });
	displayAlert(false, "Card reset to default settings!");

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

// customization tab

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
