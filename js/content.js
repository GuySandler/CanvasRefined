const domain = window.location.origin;
let current_page = window.location.pathname;

// --- i18n override: language toggle from popup ---
const LANGUAGE_STORAGE_KEY = "selected_locale";
let overrideMessages = null;
let languageReady = null;
async function loadLanguageOverride() {
    try {
        const stored = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
        const locale = stored[LANGUAGE_STORAGE_KEY];
        if (!locale || locale === "auto") { overrideMessages = null; return; }
        const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        overrideMessages = await res.json();
    } catch (e) {
        overrideMessages = null;
    }
}
languageReady = loadLanguageOverride();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[LANGUAGE_STORAGE_KEY]) {
        loadLanguageOverride().then(() => {
            // re-apply to already-injected UI
            const backBtn = document.getElementById("canvasrefined-assignment-return");
            if (backBtn) backBtn.textContent = getMsg("back_to_assignment", "Back to Assignment");
            const gradesBtn = document.getElementById("canvasrefined-assignment-grades");
            if (gradesBtn) gradesBtn.textContent = getMsg("go_to_grades", "Go to Grades");
            const logoutBtn = document.getElementById("canvasrefined-profile-logout");
            if (logoutBtn) logoutBtn.textContent = getMsg("logout", "Logout");
            // Search and quiz elements are re-created on demand; new injections will use new language
        });
    }
});
function getMsg(key, fallback) {
    if (overrideMessages && overrideMessages[key] && overrideMessages[key].message) {
        return overrideMessages[key].message;
    }
    const orig = chrome.i18n._origGetMessage || chrome.i18n.getMessage.bind(chrome.i18n);
    const m = orig(key);
    if (m) return m;
    return fallback !== undefined ? fallback : "";
}
// monkey-patch chrome.i18n so all existing chrome.i18n.getMessage calls respect toggle
if (!chrome.i18n._origGetMessage) {
    chrome.i18n._origGetMessage = chrome.i18n.getMessage.bind(chrome.i18n);
    chrome.i18n.getMessage = (key) => getMsg(key) || chrome.i18n._origGetMessage(key) || "";
}

// Chrome (crbug.com/40206032) runs ReplaceStringPlaceholders on EVERY message,
// which eats "$NAME$" tokens: "$COUNT$" became "OUNT" ("$C" dropped + trailing "$").
// Messages therefore use $ -free tokens like {{COUNT}}; this fills them in.
const PLACEHOLDER_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

function replaceCountPlaceholder(msg, count, token) {
    if (!msg) return msg;
    const name = token || "COUNT";
    return String(msg).split("{{" + name + "}}").join(String(count));
}

// Fill every {{TOKEN}} in a message from a { TOKEN: value } map.
function fillPlaceholders(msg, values) {
    if (!msg) return msg;
    return String(msg).replace(PLACEHOLDER_RE, (m, name) => (
        values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : m
    ));
}

// Canvas' New UI navigates via pushState; without this hook current_page goes stale.
function setupNavigationListener() {
    const update = () => {
        const next = window.location.pathname;
        if (next === current_page) return;
        current_page = next;
        watchSequenceFooter();
        watchSubmissionPageButton();
        watchProfileLogoutPageButton();
        watchGradeAnalytics();
        updateTodoSidebarVisibility();
    };
    for (const method of ["pushState", "replaceState"]) {
        const orig = history[method];
        history[method] = function (...args) {
            const ret = orig.apply(this, args);
            update();
            return ret;
        };
    }
    window.addEventListener("popstate", update);
}

function getCurrentCourseId() {
    const match = current_page.match(/^\/courses\/(\d+)(?:\/|$)/);
    return match ? parseInt(match[1]) : null;
}

function getSidebarLayoutMode() {
    if (current_page.match(/^\/courses\/(\d+)(?:\/|$)/)) return "course";
    if (isProfilePage()) return "course";
    if (current_page === "/courses" || current_page === "/courses/") return "dash";
    if (current_page === "/" || current_page === "") return "dash";
    return "dash";
}

function isGradesPage() {
    return /^\/courses\/\d+\/grades(?:\/|$)/.test(current_page);
}

function isCoursesIndexPage() {
    return /^\/courses\/?$/.test(current_page);
}

function isGroupsIndexPage() {
    return /^\/groups\/?$/.test(current_page);
}

function isConversationsPage() {
    return /^\/conversations(?:\/|$)/.test(current_page);
}

function isAccountsPage() {
    return /^\/accounts(?:\/|$)/.test(current_page);
}

function isProfilePage() {
    return /^\/profile(?:\/|$)/.test(current_page);
}

// Better Todo sidebar: dashboard and course homepages only, not sub-pages.
function isTodoAllowedPage() {
    if (current_page === "/" || current_page === "") return true;
    return /^\/courses\/\d+\/?$/.test(current_page);
}

function updateTodoSidebarVisibility() {
    const list = document.getElementById("canvasrefined-todo-list");
    if (!list) return;
    list.style.display = isTodoAllowedPage() ? "" : "none";
}

// Quiz pages: /courses/123/quizzes/456 and .../456/take.
function isQuizPage() {
    return /^\/courses\/\d+\/quizzes\/\d+(?:\/|$)/.test(current_page);
}
function isQuizTakePage() {
    return /^\/courses\/\d+\/quizzes\/\d+\/take(?:\/|$)/.test(current_page);
}
function isQuizPreTakePage() {
    return isQuizPage() && !isQuizTakePage();
}
// Quiz safe mode: opted-in features are off on quiz pages.
function quizSafeModeActive() {
    return isQuizPage() && options.quiz_safe_mode === true;
}

// Read the URL live: SPA navigation can leave current_page stale.
function getSubmissionAssignmentLink() {
    const match = window.location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/(\d+)(?:\/|$)/);
    if (!match) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/`;
}

// Container varies by layout; fall back to <body> so injection never no-ops.
function findContentContainer() {
    return document.querySelector(".ic-Layout-contentMain")
        || document.getElementById("content")
        || document.querySelector("#main")
        || document.body;
}

let submissionPageButtonObserver = null;
let submissionButtonScheduled = false;
let assignmentButtonScheduled = false;
let profileLogoutButtonObserver = null;
let newCanvasButtonObserver = null;

// undefined = not fetched, null = fetch failed, number = ok.
let currentUserIdCache;
let currentUserIdPromise = null;
function ensureCurrentUserId() {
    if (currentUserIdCache !== undefined) return Promise.resolve(currentUserIdCache);
    if (!currentUserIdPromise) {
        currentUserIdPromise = getData(`${domain}/api/v1/users/self`)
            .then(user => {
                currentUserIdCache = (user && user.id) || null;
            })
            .catch(() => {
                currentUserIdCache = null;
            })
            .then(() => {
                currentUserIdPromise = null;
                return currentUserIdCache;
            });
    }
    return currentUserIdPromise;
}

// Assignment pages link to the current user's submission page; the lookahead skips /submissions/678.
function getAssignmentGradesLink() {
    const match = window.location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)(?!\/submissions)(?:\/|$)/);
    if (!match || currentUserIdCache == null) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/submissions/${currentUserIdCache}`;
}

function addSubmissionPageButton() {
    const assignmentLink = getSubmissionAssignmentLink();
    if (!assignmentLink) return;
    // Only inject once the heading+grades row exists; the observer retries on later DOM changes.
    const row = document.querySelector(".submission-details-header__heading-and-grades")
        || document.querySelector(".submission-details-header")
        || document.querySelector(".submission_details");
    if (!row || row.querySelector("#canvasrefined-assignment-return")) return;

    // Insert between h1 and grade summary: [Heading] [Button] [Grade].
    const gradeSummary = row.querySelector(".submission-details-header__grade-summary");
    const btn = makeElement("a", row, {
        id: "canvasrefined-assignment-return",
        className: "canvasrefined-custom-btn",
        href: assignmentLink,
        textContent: chrome.i18n.getMessage("back_to_assignment") || "Back to Assignment",
        style: "display:inline-flex;align-items:center;justify-content:center;align-self:center;margin-left:auto;margin-right:12px;padding:6px 12px;text-decoration:none;font-weight:700;color:inherit!important;",
    });
    if (gradeSummary && gradeSummary.parentNode === row) {
        row.insertBefore(btn, gradeSummary);
    }
}

function addAssignmentPageButton() {
    const link = getAssignmentGradesLink();
    if (!link) return;
    // .title-content is a plain block; make it a flex row to pin the button right of the h1.
    const titleContent = document.querySelector(".assignment-title .title-content")
        || document.querySelector(".title-content");
    if (!titleContent || titleContent.querySelector("#canvasrefined-assignment-grades")) return;

    titleContent.style.display = "flex";
    titleContent.style.alignItems = "center";
    titleContent.style.gap = "12px";
    makeElement("a", titleContent, {
        id: "canvasrefined-assignment-grades",
        className: "canvasrefined-custom-btn",
        href: link,
        textContent: chrome.i18n.getMessage("go_to_grades") || "Go to Grades",
        style: "display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto;padding:6px 12px;text-decoration:none;font-weight:700;font-size:16px;color:inherit!important;white-space:nowrap;",
    });
}

function addProfileLogoutPageButton() {
    if (!isProfilePage()) return;
    const content = document.getElementById("content");
    if (!content || content.querySelector("#canvasrefined-profile-logout")) return;

    makeElement("a", content, {
        id: "canvasrefined-profile-logout",
        className: "canvasrefined-custom-btn",
        href: `${domain}/logout`,
        textContent: chrome.i18n.getMessage("logout") || "Logout",
        style: "display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;margin:0 0 12px 0;padding:10px 14px;text-decoration:none;font-weight:700;",
    }, true);
}

function ensureProfileLogoutPageButton() {
    if (!isProfilePage()) return false;
    const content = document.getElementById("content");
    if (!content) return false;
    if (content.querySelector("#canvasrefined-profile-logout")) return true;
    addProfileLogoutPageButton();
    return Boolean(content.querySelector("#canvasrefined-profile-logout"));
}

function watchProfileLogoutPageButton() {
    if (!isProfilePage()) {
        document.getElementById("canvasrefined-profile-logout")?.remove();
        return;
    }
    if (ensureProfileLogoutPageButton()) return;
    if (profileLogoutButtonObserver) return;

    profileLogoutButtonObserver = new MutationObserver(() => {
        if (ensureProfileLogoutPageButton() && profileLogoutButtonObserver) {
            profileLogoutButtonObserver.disconnect();
            profileLogoutButtonObserver = null;
        }
    });

    profileLogoutButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
        if (profileLogoutButtonObserver) {
            profileLogoutButtonObserver.disconnect();
            profileLogoutButtonObserver = null;
        }
    }, 10000);
}

// Canvas re-renders wipe the button; a persistent observer re-adds it.
function maintainSubmissionPageButton() {
    if (submissionButtonScheduled) return;
    submissionButtonScheduled = true;
    requestAnimationFrame(() => {
        submissionButtonScheduled = false;
        const link = getSubmissionAssignmentLink();
        const existing = document.getElementById("canvasrefined-assignment-return");
        if (!link) {
            existing?.remove();
            return;
        }
        if (existing) {
            if (existing.href !== link) existing.href = link;
            return;
        }
        addSubmissionPageButton();
    });
}

// Same pattern as maintainSubmissionPageButton; needs currentUserId, fetched once.
function maintainAssignmentPageButton() {
    if (assignmentButtonScheduled) return;
    assignmentButtonScheduled = true;
    requestAnimationFrame(() => {
        assignmentButtonScheduled = false;
        const isAssignmentPage = /^\/courses\/\d+\/assignments\/\d+(?!\/submissions)(?:\/|$)/.test(window.location.pathname);
        const existing = document.getElementById("canvasrefined-assignment-grades");
        if (!isAssignmentPage) {
            if (existing) {
                const titleContent = existing.closest(".title-content");
                existing.remove();
                if (titleContent) {
                    titleContent.style.display = "";
                    titleContent.style.alignItems = "";
                    titleContent.style.gap = "";
                }
            }
            return;
        }
        if (currentUserIdCache === undefined) {
            ensureCurrentUserId().then(() => maintainAssignmentPageButton());
            return;
        }
        const link = getAssignmentGradesLink();
        if (!link) return;
        if (existing) {
            if (existing.href !== link) existing.href = link;
            return;
        }
        addAssignmentPageButton();
    });
}

function isAssignmentPage() {
    return /^\/courses\/\d+\/assignments(?:\/\d+)?(?:\/|$)/.test(current_page);
}

// CSS-only hiding: survives re-renders and toggles back instantly.
function applyHideSequenceFooter() {
    let style = document.getElementById("canvasrefined-hide-sequence-footer");
    if (options.hide_sequence_footer === true) {
        if (!style) {
            style = document.createElement("style");
            style.id = "canvasrefined-hide-sequence-footer";
            (document.head || document.documentElement).appendChild(style);
        }
        // #sequence_footer on show pages; page show renders a bare .module-sequence-footer.
        style.textContent = "#sequence_footer,.module-sequence-footer{display:none!important}";
    } else if (style) {
        style.remove();
    }
}

function watchSequenceFooter() {
    applyHideSequenceFooter();
}

// Persistent observer keeping both assignment nav buttons mounted;
// the delayed re-checks cover React hydration.
function maintainAssignmentNavButtons() {
    maintainSubmissionPageButton();
    maintainAssignmentPageButton();
}

function watchSubmissionPageButton() {
    if (submissionPageButtonObserver) return;
    maintainAssignmentNavButtons();
    submissionPageButtonObserver = new MutationObserver(maintainAssignmentNavButtons);
    submissionPageButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
    for (const ms of [300, 800, 1600, 3000, 5000]) {
        setTimeout(maintainAssignmentNavButtons, ms);
    }
}

function removeNewCanvasButton() {
    document.querySelectorAll('[data-testid="switch-to-new-dashboard-button"]').forEach(btn => btn.remove());
}

function watchNewCanvasButton() {
    if (newCanvasButtonObserver) {
        newCanvasButtonObserver.disconnect();
        newCanvasButtonObserver = null;
    }
    if (options.hide_new_canvas !== true) return;
    removeNewCanvasButton();
    let newCanvasButtonScheduled = false;
    newCanvasButtonObserver = new MutationObserver((mutationList) => {
        if (options.hide_new_canvas !== true) {
            if (newCanvasButtonObserver) {
                newCanvasButtonObserver.disconnect();
                newCanvasButtonObserver = null;
            }
            return;
        }
        // Coalesce to one pass per frame.
        let added = false;
        for (const mutation of mutationList) {
            if (mutation.addedNodes && mutation.addedNodes.length) { added = true; break; }
        }
        if (!added || newCanvasButtonScheduled) return;
        newCanvasButtonScheduled = true;
        requestAnimationFrame(() => {
            newCanvasButtonScheduled = false;
            if (options.hide_new_canvas !== true) return;
            removeNewCanvasButton();
        });
    });
    newCanvasButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
}

async function getActiveCustomBackground() {
    const syncOpts = await chrome.storage.sync.get([
        "customBackgroundDaily",
        "customBackgroundNasaDaily",
        "customBackgroundLink",
        "customBackgroundScale",
    ]);

    if (syncOpts.customBackgroundNasaDaily === true) {
        return await getNasaDailyBackground();
    }

    if (syncOpts.customBackgroundDaily === true) {
        const dailyPreset = await getDailyBackgroundPreset();
        if (dailyPreset) {
            return {
                url: dailyPreset.url,
                scale: dailyPreset.scale,
            };
        }
    }

    if (syncOpts.customBackgroundLink && syncOpts.customBackgroundLink !== "") {
        return {
            url: syncOpts.customBackgroundLink,
            scale: syncOpts.customBackgroundScale || 100,
        };
    }

    return null;
}

async function getDailyBackgroundPreset() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const cacheKey = `picsum_daily_${dateStr}`;
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey];

    const url = `https://picsum.photos/seed/${dateStr}/1920/1080`;
    const result = { url, scale: 100 };
    await chrome.storage.local.set({ [cacheKey]: result });
    return result;
}

async function getNasaDailyBackground() {
    try {
        return await chrome.runtime.sendMessage({ type: "getNasaBackground" });
    } catch (error) {
        console.error("[CanvasRefined] Failed to fetch NASA APOD:", error);
        return null;
    }
}

let nasaInfoOverlayEl = null;

function isDashboardPage() {
    return !!document.querySelector("#DashboardCard_Container");
}

function createNasaInfoOverlay() {
    if (options.customBackgroundNasaDaily !== true) return;
    if (nasaInfoOverlayEl || !isDashboardPage()) return;
    
    const contentMain = document.querySelector("#content.ic-Layout-contentMain, .ic-Layout-contentMain");
    if (!contentMain) return;
    if (getComputedStyle(contentMain).position === "static") {
        contentMain.style.position = "relative";
    }

    nasaInfoOverlayEl = document.createElement("div");
    nasaInfoOverlayEl.id = "canvasrefined-nasa-info-overlay";
    nasaInfoOverlayEl.style.cssText = "position:absolute;right:24px;bottom:24px;z-index:9999;";
    nasaInfoOverlayEl.innerHTML = `
        <div id="nasa-info-icon" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:rgba(30,30,30,0.85);border:1px solid rgba(255,255,255,0.15);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e2e2e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        </div>
        <div id="nasa-info-panel" style="display:none;position:absolute;bottom:calc(100% + 10px);right:0;background:#1e1e1e;border:1px solid #3c3c3c;border-radius:8px;padding:14px 18px;width:340px;max-width:calc(100vw - 40px);box-shadow:0 4px 16px rgba(0,0,0,0.4);">
            <div id="nasa-info-title" style="font-weight:600;font-size:14px;margin-bottom:4px;color:#f5f5f5;"></div>
            <div id="nasa-info-date" style="font-size:12px;color:#ababab;margin-bottom:4px;"></div>
            <div id="nasa-info-credit" style="font-size:12px;color:#dfa581;margin-bottom:8px;"></div>
            <div id="nasa-info-explanation" style="font-size:12px;color:#e2e2e2;line-height:1.5;max-height:200px;overflow-y:auto;white-space:pre-wrap;"></div>
        </div>
    `;
    
    const icon = nasaInfoOverlayEl.querySelector("#nasa-info-icon");
    const panel = nasaInfoOverlayEl.querySelector("#nasa-info-panel");
    
    const populatePanel = async () => {
        // Today's APOD may not be cached yet; search back up to 7 days.
        const date = new Date();
        for (let i = 0; i < 7; i++) {
            const dateStr = date.toISOString().slice(0, 10);
            const cacheKey = `nasa_apod_${dateStr}`;
            const cached = await chrome.storage.local.get(cacheKey);
            if (!cached[cacheKey]) {
                date.setDate(date.getDate() - 1);
                continue;
            }
            const metadataKey = `nasa_apod_meta_${dateStr}`;
            const metadata = await chrome.storage.local.get(metadataKey);
            const meta = metadata[metadataKey];
            if (!meta) return false;
            document.getElementById("nasa-info-title").textContent = meta.title || "";
            document.getElementById("nasa-info-date").textContent = (chrome.i18n.getMessage("nasa_date") || "Date: {{DATE}}").replace("{{DATE}}", meta.date);
            document.getElementById("nasa-info-credit").textContent = meta.copyright ? (chrome.i18n.getMessage("nasa_credit") || "Credit: {{CREDIT}}").replace("{{CREDIT}}", meta.copyright) : "";
            document.getElementById("nasa-info-explanation").textContent = meta.explanation || chrome.i18n.getMessage("no_description") || "No description available.";
            return true;
        }
        return false;
    };

    let pinned = false;

    const showPanel = async () => {
        if (pinned) return;
        if (await populatePanel()) panel.style.display = "block";
    };

    const hidePanel = () => {
        if (pinned) return;
        panel.style.display = "none";
    };

    const togglePanel = async () => {
        if (pinned) {
            pinned = false;
            panel.style.display = "none";
        } else {
            pinned = true;
            if (await populatePanel()) panel.style.display = "block";
        }
    };

    icon.addEventListener("mouseenter", showPanel);
    icon.addEventListener("mouseleave", hidePanel);
    panel.addEventListener("mouseenter", showPanel);
    panel.addEventListener("mouseleave", hidePanel);
    icon.addEventListener("click", togglePanel);
    
    contentMain.appendChild(nasaInfoOverlayEl);
}

function removeNasaInfoOverlay() {
    if (nasaInfoOverlayEl) {
        nasaInfoOverlayEl.remove();
        nasaInfoOverlayEl = null;
    }
}

function getSidebarStateMode(mode = getSidebarLayoutMode()) {
    return mode === "course" ? "course" : "dashboard";
}

function getSidebarStateKey(mode = getSidebarLayoutMode()) {
    return `better_sidebar_expanded_${getSidebarStateMode(mode)}`;
}

async function getSidebarExpandedState(mode = getSidebarLayoutMode()) {
    const key = getSidebarStateKey(mode);
    const result = await chrome.storage.local.get(key);
    return result[key] ?? false;
}

function setSidebarExpandedState(mode, expanded) {
    chrome.storage.local.set({ [getSidebarStateKey(mode)]: expanded });
}

let assignments = null;
let grades = null;
let announcements = [];
let completed = [];
let assignmentsDue = [];
// Bumped per render; rendering aborts when its data lands after a newer render started.
let todoRenderGen = 0;
let cardRenderGen = 0;
let options = {};
let timeCheck = null;
let reminderCheck = null;
let plannerRefreshRunning = false;
let betterSidebarLoading = false;
let dashboardReadyTimer = null;
let sidebarReadyTimer = null;
// Skips the setup pass when the card set is unchanged (stops a self-retriggering reflow loop).
let lastDashboardCardSignature = null;
let sidebarBadgeObserver = null;
let sidebarBadgeSyncTimer = null;
let sidebarBadgeWatchRetries = 0;

/*
Start
*/


/*
Todo Reminders
*/

const canvas_svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="#ff4545" width="25px" height="25px" viewBox="-192 -192 2304.00 2304.00" stroke="white"><g stroke-width="0"><rect x="-192" y="-192" width="2304.00" height="2304.00" rx="0" fill="none" strokewidth="0"/></g><g stroke-linecap="round" stroke-linejoin="round"/><g> <path d="M958.568 277.97C1100.42 277.97 1216.48 171.94 1233.67 34.3881 1146.27 12.8955 1054.57 0 958.568 0 864.001 0 770.867 12.8955 683.464 34.3881 700.658 171.94 816.718 277.97 958.568 277.97ZM35.8207 682.031C173.373 699.225 279.403 815.285 279.403 957.136 279.403 1098.99 173.373 1215.05 35.8207 1232.24 12.8953 1144.84 1.43262 1051.7 1.43262 957.136 1.43262 862.569 12.8953 769.434 35.8207 682.031ZM528.713 957.142C528.713 1005.41 489.581 1044.55 441.31 1044.55 393.038 1044.55 353.907 1005.41 353.907 957.142 353.907 908.871 393.038 869.74 441.31 869.74 489.581 869.74 528.713 908.871 528.713 957.142ZM1642.03 957.136C1642.03 1098.99 1748.06 1215.05 1885.61 1232.24 1908.54 1144.84 1920 1051.7 1920 957.136 1920 862.569 1908.54 769.434 1885.61 682.031 1748.06 699.225 1642.03 815.285 1642.03 957.136ZM1567.51 957.142C1567.51 1005.41 1528.38 1044.55 1480.11 1044.55 1431.84 1044.55 1392.71 1005.41 1392.71 957.142 1392.71 908.871 1431.84 869.74 1480.11 869.74 1528.38 869.74 1567.51 908.871 1567.51 957.142ZM958.568 1640.6C816.718 1640.6 700.658 1746.63 683.464 1884.18 770.867 1907.11 864.001 1918.57 958.568 1918.57 1053.14 1918.57 1146.27 1907.11 1233.67 1884.18 1216.48 1746.63 1100.42 1640.6 958.568 1640.6ZM1045.98 1480.11C1045.98 1528.38 1006.85 1567.51 958.575 1567.51 910.304 1567.51 871.172 1528.38 871.172 1480.11 871.172 1431.84 910.304 1392.71 958.575 1392.71 1006.85 1392.71 1045.98 1431.84 1045.98 1480.11ZM1045.98 439.877C1045.98 488.148 1006.85 527.28 958.575 527.28 910.304 527.28 871.172 488.148 871.172 439.877 871.172 391.606 910.304 352.474 958.575 352.474 1006.85 352.474 1045.98 391.606 1045.98 439.877ZM1441.44 1439.99C1341.15 1540.29 1333.98 1697.91 1418.52 1806.8 1579 1712.23 1713.68 1577.55 1806.82 1418.5 1699.35 1332.53 1541.74 1339.7 1441.44 1439.99ZM1414.21 1325.37C1414.21 1373.64 1375.08 1412.77 1326.8 1412.77 1278.53 1412.77 1239.4 1373.64 1239.4 1325.37 1239.4 1277.1 1278.53 1237.97 1326.8 1237.97 1375.08 1237.97 1414.21 1277.1 1414.21 1325.37ZM478.577 477.145C578.875 376.846 586.039 219.234 501.502 110.339 341.024 204.906 206.338 339.592 113.203 498.637 220.666 584.607 378.278 576.01 478.577 477.145ZM679.155 590.32C679.155 638.591 640.024 677.723 591.752 677.723 543.481 677.723 504.349 638.591 504.349 590.32 504.349 542.048 543.481 502.917 591.752 502.917 640.024 502.917 679.155 542.048 679.155 590.32ZM1440 475.712C1540.3 576.01 1697.91 583.174 1806.8 498.637 1712.24 338.159 1577.55 203.473 1418.51 110.339 1332.54 217.801 1341.13 375.413 1440 475.712ZM1414.21 590.32C1414.21 638.591 1375.08 677.723 1326.8 677.723 1278.53 677.723 1239.4 638.591 1239.4 590.32 1239.4 542.048 1278.53 502.917 1326.8 502.917 1375.08 502.917 1414.21 542.048 1414.21 590.32ZM477.145 1438.58C376.846 1338.28 219.234 1331.12 110.339 1415.65 204.906 1576.13 339.593 1710.82 498.637 1805.39 584.607 1696.49 577.443 1538.88 477.145 1438.58ZM679.155 1325.37C679.155 1373.64 640.024 1412.77 591.752 1412.77 543.481 1412.77 504.349 1373.64 504.349 1325.37 504.349 1277.1 543.481 1237.97 591.752 1237.97 640.024 1237.97 679.155 1277.1 679.155 1325.37Z"/></g></svg>`;

async function insertReminders(reminders) {
    const storage = await chrome.storage.sync.get("reminders");
    const stored = Array.isArray(storage["reminders"]) ? storage["reminders"] : [];
    // Keyed by link ("h"); rebuilding the map heals duplicates left by older versions.
    const byHref = new Map();
    for (const r of stored) {
        if (!r || !r.h) continue;
        const prev = byHref.get(r.h);
        if (!prev || (prev.c !== -1 && r.c === -1)) byHref.set(r.h, r);
    }
    let changed = byHref.size !== stored.length;
    for (const insert of reminders) {
        if (!insert || !insert.h) continue;
        const prev = byHref.get(insert.h);
        if (!prev) {
            byHref.set(insert.h, insert);
            changed = true;
        } else if (insert.c === -1 && prev.c !== -1) {
            // Submitted: update in place instead of appending a second copy.
            byHref.set(insert.h, insert);
            changed = true;
        }
    }
    if (changed) chrome.storage.sync.set({ "reminders": [...byHref.values()] });
}

async function hideReminder(href) {
    const storage = await chrome.storage.sync.get("reminders");

    for (let i = 0; i < storage["reminders"].length; i++) {
        if (storage["reminders"][i]["h"] === href) {
            storage["reminders"][i]["c"]++;
            chrome.storage.sync.set({ "reminders": storage["reminders"] });
            break;
        }
    }
}

function createReminder(reminder, location) {
    const remaining = getRelativeDate(new Date(reminder.d));
    const wrapper = makeElement("div", location, { "className": "canvasrefined-reminder-wrapper" });
    const container = makeElement("div", wrapper, { "className": "canvasrefined-reminder-container" });
    const svg = makeElement("div", container, { "innerHTML": canvas_svg });
    const content = makeElement("a", container, { "className": "canvasrefined-reminder-content", "href": reminder.h, "target": "_blank" });
    const title = makeElement("h2", content, { "className": "canvasrefined-reminder-title", "textContent": reminder.t });
    const due = makeElement("p", content, { "className": "canvasrefined-reminder-due", "textContent": (chrome.i18n.getMessage("assignment_due_in") || "Assignment due in {{TIME}}").replace("{{TIME}}", remaining.time) });
    const hidebtn = makeElement("btn", wrapper, { "className": "canvasrefined-reminder-hide", "textContent": "x" });
    hidebtn.addEventListener("click", () => {
        hideReminder(reminder.h);
        wrapper.remove();
    });
    return container;
}

async function reminderWatch() {
    const sync = await chrome.storage.sync.get("remind");
    if (sync["remind"] !== true) {
        if (document.getElementById("canvasrefined-reminders")) document.getElementById("canvasrefined-reminders").style.display = "none";
        return;
    }
    const container = document.getElementById("canvasrefined-reminders") || makeElement("div", document.body, { "id": "canvasrefined-reminders" });
    container.style.display = "flex";
    container.textContent = "";
    const alertPeriod = 1000 * 60 * 60 * 6; // 6 hours
    const alertPeriod2 = 1000 * 60 * 60 * 2; // 2 hours
    const storage = await chrome.storage.sync.get(["reminders", "reminder_count"]);
    const now = (new Date()).getTime();
    storage["reminders"].forEach((reminder, index) => {
        if (reminder.d < now) {
            storage["reminders"].splice(index, 1);
        } else if ((reminder.c == 0 && reminder.d < now + alertPeriod) || (reminder.c == 1 && reminder.d < now + alertPeriod2)) {
            createReminder(reminder, container);
        }
    });
    chrome.storage.sync.set({ "reminders": storage["reminders"] });
}

function updateReminders() {
    if (!assignments || typeof assignments.then !== "function") return;
    const fiveDays = 1000 * 60 * 60 * 24 * 5;
    const now = (new Date()).getTime();
    const list = [];
    assignments.then(data => {
        data.forEach(item => {
            const due = (new Date(item.plannable_date)).getTime();
            if (item.plannable_type === "announcement") return;
            if (due < now) return;
            if (due > now + fiveDays * 2) return;
            // { due, title, href, hideCount }; hideCount -1 = has a submission.
            list.push({ "d": due, "t": item.plannable.title, "h": domain + item.html_url, "c": item?.submissions?.submitted || false ? -1 : 0 });
        });
        insertReminders(list);
    });
}

function showExampleReminder() {
    const location = document.getElementById("canvasrefined-reminders") || makeElement("div", document.body, { "id": "canvasrefined-reminders" });
    if (options.remind !== true) {
        location.remove();
        return;
    }
    location.textContent = "";
    const example = createReminder({ "d": new Date(), "t": chrome.i18n.getMessage("example_reminder_title") || "This is an example reminder", }, location);
    example.querySelector(".canvasrefined-reminder-due").textContent = chrome.i18n.getMessage("example_reminder_desc") || "This notification will pop up in other pages to remind you of incomplete assignments that are due in less than 6 hours.";
}


// Canvas detection: empty list auto-adds the first canvas, otherwise ask once per domain.
isDomainCanvasPage();

// Saved entries are whatever the user/prompt put in storage ("school.instructure.com",
// "https://school.instructure.com", "https://school.instructure.com/", ...). Matching
// used to be a raw substring test, so a stored URL with a scheme or trailing slash
// never matched the origin — the extension looked like it wasn't detecting the site.
// Compare hostnames instead, and let a parent domain cover its subdomains.
function normalizeDomain(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .replace(/[/?#].*$/, "")
        .replace(/^www\./, "");
}

function domainMatches(entry) {
    const saved = normalizeDomain(entry);
    if (!saved) return false;
    const here = normalizeDomain(domain) || normalizeDomain(location.host);
    return here === saved || here.endsWith("." + saved);
}

function isDomainCanvasPage() {
    chrome.storage.sync.get(['custom_domain', 'custom_domain_denied', 'auto_detect_disabled', 'dark_mode', 'dark_preset', 'device_dark', 'remind'], result => {
        options = result;
        const domains = (result.custom_domain || []).filter(d => d && d !== "");
        const denied = result.custom_domain_denied || [];
        if (domains.some(domainMatches)) {
            startExtension();
            return;
        }

        // auto detect off or already declined here: no prompt, just reminders
        if (result.auto_detect_disabled === true || denied.some(domainMatches)) {
            startReminderMode();
            return;
        }

        detectCanvasPage().then(({ isCanvas, courses }) => {
            if (!isCanvas) {
                startReminderMode();
                return;
            }
            if (domains.length === 0) {
                // first canvas ever: add it and reload
                addCanvasDomain(courses).then(() => location.reload());
            } else {
                // canvases exist: ask once per domain
                promptAddCanvasDomain(courses);
            }
        });
    });
}

function startReminderMode() {
    setTimeout(reminderWatch, 2000);
    setInterval(reminderWatch, 60000);
    chrome.storage.onChanged.addListener((changes) => {
        Object.keys(changes).forEach(key => {
            if (key === "remind") reminderWatch();
        })
    })
}

// The courses API only answers on real Canvas installs. Resolves { isCanvas, courses }.
// Retried: the content script starts before the session/redirect dance settles
// (and on Firefox the first request can race a login redirect), so a single
// attempt used to silently give up and leave the whole extension disabled.
async function detectCanvasPage() {
    const RETRY_DELAYS = [0, 1500, 4000, 9000];
    let lastError = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        if (RETRY_DELAYS[attempt]) await sleep(RETRY_DELAYS[attempt]);

        // At document_start the document is empty, so the markup fingerprints only
        // mean something once parsing has finished. The API call itself runs right
        // away: it is the fast path for normal Canvas pages.
        const domReady = document.readyState !== "loading";
        const score = canvasMarkupScore();

        // Keep retrying only when the page looks like Canvas or the API answered
        // with an auth/server error (i.e. we were too early). Otherwise we would
        // fire four API calls at every site the user visits.
        if (attempt > 0 && domReady && score === 0 && !isTransientDetectError(lastError)) break;

        try {
            const courses = await getData(`${domain}/api/v1/courses?per_page=100`);
            if (isCanvasCourseList(courses)) {
                return { isCanvas: true, courses };
            }
            if (Array.isArray(courses)) {
                // A JSON array is Canvas' own API shape. With zero courses the
                // account simply has no active enrollments (observer/parent, new
                // term) — those used to be missed because the check required items.
                if (score > 0) return { isCanvas: true, courses };
                // Empty-handed before the DOM exists: not enough information yet.
                if (!domReady) continue;
                break;
            }
            break;
        } catch (err) {
            lastError = err;
        }
    }

    console.log("Canvas Refined - this url doesn't seem to be a canvas url");
    return { isCanvas: false, courses: null };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Canvas' window.ENV is a page-defined global: Firefox hides those behind Xray
// wrappers, so read it through wrappedJSObject there.
function pageWindow() {
    try {
        return window.wrappedJSObject || window;
    } catch (_) {
        return window;
    }
}

// Cheap Canvas fingerprints from the DOM/globals. Used to accept an otherwise
// empty courses list and to decide whether a failed request deserves a retry.
// Score >= 2 is "almost certainly Canvas".
function canvasMarkupScore() {
    let score = 0;
    try {
        const env = pageWindow().ENV;
        if (env && typeof env === "object" && (
            env.CANVAS_URL || env.DOMAIN_ROOT_ACCOUNT_UUID || env.APP_CONTEXT ||
            env.CURRENT_USER || env.current_user || env.context_asset_string || env.LOCALE
        )) {
            score += 2;
        }
    } catch (_) { /* ignore */ }

    const has = selector => {
        try { return !!document.querySelector(selector); } catch (_) { return false; }
    };
    if (has('link[href*="brandable_css"], script[src*="brandable_css"]')) score++;
    if (has('#application.ic-Layout-wrapper, .ic-Layout-wrapper')) score++;
    if (has('#header.ic-app-header, .ic-app-header__main-navigation, .ic-Dashboard-header__layout')) score++;
    if (has('.ic-Login__body, #login_form')) score++;
    return score;
}

function isTransientDetectError(err) {
    const match = /\((\d{3})\)/.exec((err && err.message) || "");
    if (!match) return true; // network/opaque failure: worth one more try
    const status = Number(match[1]);
    return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

// Real Canvas courses carry a numeric id and name; looser checks misdetected sites like apstudents.collegeboard.org.
function isCanvasCourseList(courses) {
    return Array.isArray(courses) && courses.length > 0 && courses.every(c =>
        c && c.id != null && typeof c.name === "string" &&
        (c.uuid != null || c.course_code != null || Array.isArray(c.enrollments))
    );
}

// Register the domain; its courses are indexed before the reload.
function addCanvasDomain(courses) {
    return getCards(courses).then(() => new Promise(resolve => {
        setTimeout(() => {
            console.log("Canvas Refined - setting custom domain to " + domain);
            chrome.storage.sync.get(["custom_domain"], storage => {
                const domains = (storage.custom_domain || []).filter(d => d && d !== "");
                domains.push(domain);
                // just accepted: drop it from the decline list
                chrome.storage.sync.get(["custom_domain_denied"], deniedStorage => {
                    const denied = (deniedStorage.custom_domain_denied || []).filter(d => !domainMatches(d));
                    chrome.storage.sync.set({ custom_domain: domains, custom_domain_denied: denied }).then(resolve);
                });
            });
        }, 100);
    }));
}

function promptAddCanvasDomain(courses) {
    // content scripts run at document_start, so the body may not exist yet
    const show = () => showCanvasPrompt(courses);
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
}

function showCanvasPrompt(courses) {
    if (document.getElementById("canvasrefined-domain-prompt-backdrop")) return;

    const host = domain.replace(/^https?:\/\//, "");
    // modal with a backdrop so the ask can't be missed
    const backdrop = makeElement("div", document.body, { "id": "canvasrefined-domain-prompt-backdrop" });
    const prompt = makeElement("div", backdrop, { "id": "canvasrefined-domain-prompt" });
    makeElement("h3", prompt, { "textContent": chrome.i18n.getMessage("new_canvas_detected") || "New Canvas detected" });
    const text = makeElement("p", prompt, {});
    const canvasDesc = (chrome.i18n.getMessage("new_canvas_desc") || "Canvas Refined detected a Canvas page at {{HOST}}. Add it to your canvas list?").replace("{{HOST}}", host);
    const parts = canvasDesc.split(host);
    if (parts.length === 2) {
        text.append(parts[0]);
        makeElement("span", text, { "className": "canvasrefined-domain-host", "textContent": host });
        text.append(parts[1]);
    } else {
        text.append(canvasDesc);
    }
    const actions = makeElement("div", prompt, { "className": "canvasrefined-domain-prompt-actions" });
    const yes = makeElement("button", actions, { "textContent": chrome.i18n.getMessage("add_to_list") || "Add to list", "className": "canvasrefined-domain-yes" });
    const no = makeElement("button", actions, { "textContent": chrome.i18n.getMessage("no_thanks") || "No thanks", "className": "canvasrefined-domain-no" });

    const dismiss = () => backdrop.remove();

    yes.addEventListener("click", () => {
        dismiss();
        addCanvasDomain(courses).then(() => location.reload());
    });
    no.addEventListener("click", () => {
        dismiss();
        chrome.storage.sync.get(["custom_domain_denied"], storage => {
            const denied = storage.custom_domain_denied || [];
            if (!denied.some(domainMatches)) denied.push(domain);
            chrome.storage.sync.set({ custom_domain_denied: denied });
        });
        startReminderMode();
    });
}

function startExtension() {
    // run first so a crash below can't block it
    const removeFooter = () => {
        const footer = document.querySelector('footer#footer.ic-app-footer, footer#footer');
        if (footer) footer.remove();
    };
    removeFooter();
    let footerScheduled = false;
    const footerObserver = new MutationObserver(() => {
        if (footerScheduled) return;
        footerScheduled = true;
        requestAnimationFrame(() => {
            footerScheduled = false;
            removeFooter();
        });
    });
    footerObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Watchers start before the async storage callbacks, so a later throw can't block them.
    setupNavigationListener();
    watchSubmissionPageButton();

    toggleDarkMode();

    // Include bg_opacity/bg_blur so the panel tints with the user's sliders on first load.
    chrome.storage.sync.get(["better_sidebar", "sidebar_scale", "bg_opacity", "bg_blur"], result => {
        options = { ...options, ...result };
        ensureBetterSidebar();
    });

    chrome.storage.sync.get(null, result => {
        options = { ...options, ...result };
        applyTodoAlternateColors();
        toggleAutoDarkMode();
        getApiData();
        checkDashboardReady();
        loadCustomFont();
        applyAestheticChanges();
        watchNewCanvasButton();
        changeFavicon();
        updateReminders();
        applyCustomBackground();
        setupMobileNavStyle();
        ensureBetterSidebar();
        watchSequenceFooter();
        watchProfileLogoutPageButton();
        watchGradeAnalytics();
        setupPersonalDetailsHiding();

        setupQuizSafeModeBanner();

        setupGlobalSearch();

        
        setTimeout(() => runDarkModeFixer(false), 800);
        setTimeout(() => runDarkModeFixer(false), 4500);
    });

    // Custom CSS lives in storage.local: sync's 8KB per-item quota dropped long stylesheets.
    chrome.storage.local.get("custom_styles", local => {
        if (local && local["custom_styles"] !== undefined) {
            options = { ...options, custom_styles: local["custom_styles"] };
            applyAestheticChanges();
        } else {
            chrome.storage.sync.get("custom_styles", sync => {
                if (sync && sync["custom_styles"]) {
                    chrome.storage.local.set({ custom_styles: sync["custom_styles"] });
                    options = { ...options, custom_styles: sync["custom_styles"] };
                    applyAestheticChanges();
                }
            });
        }
    });

    chrome.runtime.onMessage.addListener(recieveMessage);

    chrome.storage.onChanged.addListener(applyOptionsChanges);

    console.log("Canvas Refined - running");
}

function applyOptionsChanges(changes) {
    let rewrite = {};
    Object.keys(changes).forEach(key => {
        rewrite[key] = changes[key].newValue;
    });
    options = { ...options, ...rewrite };


    Object.keys(changes).forEach(key => {
        switch (key) {
			case "dark_mode":
			case "dark_preset":
			case "device_dark":
				toggleDarkMode();
				applyTodoAlternateColors();
				if (options.todo_ignore_card_colors && options.better_todo && document.getElementById("better-todo-main")) {
					clearTodoList();
					createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				}
				break;
			case "todo_alternate_colors":
				applyTodoAlternateColors();
				break;
			case "auto_dark":
			case "auto_dark_start":
			case "auto_dark_end":
				toggleAutoDarkMode();
				break;
			case "gradient_cards":
				changeGradientCards();
				break;
			case "dashboard_notes":
			case "dashboard_notes_text":
			case "dashboard_notes_mode":
			case "dashboard_notes_position":
			case "dashboard_notes_height":
				loadDashboardNotes();
				break;
			case "focus_timer":
			case "focus_timer_position":
			case "focus_timer_height":
			case "focus_timer_preset_1":
			case "focus_timer_preset_2":
			case "focus_timer_preset_3":
				loadFocusTimer();
				break;
			case "breathing":
			case "breathing_position":
			case "breathing_height":
			case "breathing_preset_1":
			case "breathing_preset_2":
			case "breathing_preset_3":
				loadBreathingWidget();
				break;
			case "daily_quotes":
			case "daily_quotes_position":
			case "daily_quotes_height":
				loadDailyQuotesWidget();
				break;
			case "quick_links":
			case "quick_links_position":
			case "quick_links_height":
				loadQuickLinksWidget();
				break;
			case "quick_links_font_size":
			case "quick_links_icon_size":
				document.querySelectorAll(".canvasrefined-quick-links").forEach(quickLinksApplySizes);
				break;
			case "quick_links_items":
				updateQuickLinksWidget();
				break;
			case "daily_quote":
				document.querySelectorAll(".canvasrefined-quotes").forEach(el => {
					renderDailyQuote(el, changes["daily_quote"].newValue);
				});
				break;
			case "widget_order":
				["top", "below"].forEach(area => {
					const row = document.querySelector(".canvasrefined-widget-row[data-area='" + area + "']");
					if (row) applyWidgetRowLayout(row, area);
				});
				applyCardWidgetOrder(document.querySelector(".ic-DashboardCard__box__container"));
				// Neighbouring widgets must re-place too, or the vacated slot keeps the old layout.
				if (options.dashboard_notes === true) loadDashboardNotes();
				if (options.gpa_calc === true && current_page === "/") setupGPACalc();
				loadAllSimpleWidgets();
				break;
			case "widget_row_height":
				document.querySelectorAll(".canvasrefined-widget-row").forEach(row => {
					applyWidgetRowLayout(row, row.dataset.area);
				});
				break;
			case "dashboard_grades":
			case "grade_hover":
			case "card_letter":
				if (!grades) getGrades();
				insertGrades();
				break;
			case "assignments_due":
			case "num_assignments":
				if (!assignments) getAssignments();
				if (
					document.querySelectorAll(".canvasrefined-card-assignment")
						.length === 0
				)
					setupCardAssignments();
				loadCardAssignments();
				// The card overflow fix depends on assignments_due.
				applyAestheticChanges();
				break;
			case "custom_assignments":
			case "assignment_date_format":
			case "card_overdues":
			case "relative_dues":
				cardAssignments = preloadAssignmentEls();
				loadCardAssignments();
				break;
			case "equal_height_cards":
				equalizeCardHeights();
				break;
			case "hide_completed_cards":
				loadCardAssignments();
				break;
			case "custom_cards":
				customizeCards();
				// Hidden cards change which courses show in the todo list and progress display.
				if (options.better_todo && document.getElementById("better-todo-main")) {
					moreAnnouncementCount = 0;
					moreAssignmentCount = 0;
					clearTodoList();
					createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				}
				break;
			case "custom_cards_2":
			case "custom_cards_3":
				customizeCards();
				break;
			case "todo_hr24":
			case "todo_separate_scrollbar":
			case "num_todo_items":
			case "hover_preview":
			case "todo_timeframe":
			case "todo_timeframe_custom_past":
			case "todo_timeframe_custom_future":
			case "todo_hide_feedback":
			case "todo_hide_read":
			case "todo_full_height":
			case "todo_ignore_card_colors":
			case "todo_remove_icons":
			case "todo_show_scores":
			case "custom_cards_3":
				if (options.better_todo && document.getElementById("better-todo-main")) {
					moreAnnouncementCount = 0;
					moreAssignmentCount = 0;
					betterTodoTimeframeOffset = 0;
					clearTodoList();
					createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				}
				break;
			case "hide_personal_details":
			case "anon_grade_level":
			case "anon_grade_seed":
				// New seed invalidates the memoized fake-course mapping.
				if (key === "anon_grade_seed") anonCourseMap.clear();
				// Drop the GPA cached marker so setupGPACalc rebuilds.
				document.querySelectorAll(".canvasrefined-gpa-card, .canvasrefined-gpa").forEach(el => el.removeAttribute("data-canvasrefined-gpa-rendered"));
				// Toggles the DOM watcher; turning it off restores the stashed real text.
				setupPersonalDetailsHiding();
				// Item text, grades and assignment names are baked in at render time.
				if (options.better_todo && document.getElementById("better-todo-main")) {
					moreAnnouncementCount = 0;
					moreAssignmentCount = 0;
					clearTodoList();
					createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				}
				if (!grades) getGrades();
				insertGrades();
				cardAssignments = preloadAssignmentEls();
				loadCardAssignments();
				break;
			case "anon_fake_todo":
			case "anon_fake_completed":
			case "anon_progress_enabled":
			case "anon_progress_done":
			case "anon_progress_total":
				// Rebuild the fake todo items without touching anything else.
				if (options.better_todo && document.getElementById("better-todo-main")) {
					moreAnnouncementCount = 0;
					moreAssignmentCount = 0;
					clearTodoList();
					createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				}
				break;
			case "hide_course_images":
				applyCourseImageHiding();
				break;
			case "gpa_calc":
			case "gpa_calc_prepend":
			case "gpa_calc_position":
			case "gpa_calc_height":
			case "gpa_calc_weighted":
			case "gpa_calc_cumulative":
			case "gpa_calc_show_on_hover":
				if (!grades) getGrades();
				setupGPACalc();
				updateGpaHoverBlur();
				// GPA elements take part in the grid layout, so regenerate the grid CSS.
				if (options.card_grid === true) debouncedApplyAestheticChanges();
				break;
			case "gpa_calc_bounds":
				calculateGPA2();
				{
					const modal = document.getElementById("canvasrefined-gpa-modal");
					if (modal) renderGpaBoundsEditor(modal.querySelector(".cr-gpa-modal-bounds"));
				}
				break;
			case "custom_font":
			case "custom_font_skip_p":
				loadCustomFont();
				break;
			case "remlogo":
			case "disable_color_overlay":
			case "condensed_cards":
			case "full_width":
			case "center_cards":
			case "custom_styles":
			case "hide_navbar":
				applyAestheticChanges();
				// "Hide Navigation Bar" owns that inline style; setupBetterSidebar only sets it on first mount.
				if (options.better_sidebar) {
					const crumbsBar = document.querySelector(".ic-app-nav-toggle-and-crumbs");
					if (options.hide_navbar === true) {
						crumbsBar?.style.setProperty("display", "none");
					} else {
						crumbsBar?.style.removeProperty("display");
					}
					// Mobile context nav follows the same "Hide Navigation Bar" gate.
					setupMobileNavStyle();
				}
				break;
			case "hide_new_canvas":
				watchNewCanvasButton();
				break;
			case "hide_sequence_footer":
				watchSequenceFooter();
				break;
			case "global_search":
				if (options.global_search) {
					setupGlobalSearch();
				} else {
					removeGlobalSearch();
				}
				break;
            case "customBackgroundScale":
                applyCustomBackground();
                break;
            case "customBackgroundDaily":
                applyCustomBackground();
                removeNasaInfoOverlay();
                break;
            case "customBackgroundNasaDaily":
                applyCustomBackground();
                if (options.customBackgroundNasaDaily === true) {
                    createNasaInfoOverlay();
                } else {
                    removeNasaInfoOverlay();
                }
                break;
            case "fitImageToScreen":
                applyCustomBackground();
                break;
			case "remind":
				showExampleReminder();
				break;
			case "imageSize":
			case "cardRoundness":
			case "imageRoundness":
			case "cardSpacing":
			case "cardWidth":
			case "cardHeight":
			case "cardPadding":
			case "card_grid":
			case "card_grid_columns":
			case "card_grid_rows":
			case "card_grid_column_gap":
			case "card_grid_row_gap":
			case "card_grid_center_rows":
			case "card_grid_flex":
			case "customCardStyles":
				// Coalesce rapid card-style edits into one applyAestheticChanges() (~150ms).
				debouncedApplyAestheticChanges();
				break;
			case "customBackgroundLink":
				applyCustomBackground();
				break;
            case "bg_opacity":
                applyCustomBackground();
                applyBetterSidebarContentPanel();
                break;
            case "bg_blur":
                applyCustomBackground();
                applyBetterSidebarContentPanel();
                break;
            case "sidebar_opacity":
            case "sidebar_blur":
                applyCustomBackground();
                setupMobileNavStyle();
                break;
            case "card_transparency":
            case "card_opacity":
            case "card_blur":
                applyCustomBackground();
                break;
			case "better_todo":
				if (options.better_todo) {
					setupBetterTodo();
				} else {
					window.location.reload();
				}
                    break;
                case "todo_progress_rings": {
                    const placeholder = document.getElementById("better-todo-progress-placeholder");
                    if (!placeholder) break;
                    if (progressRingsEnabled()) {
                        if (typeof assignments?.then === 'function') {
                            assignments.then(data => {
                                const courseId = getCurrentCourseId();
                                const scopedData = getTodoScopedData(data, courseId);
                                if (options.hide_personal_details === true && options.anon_fake_todo === true) {
                                    scopedData.push(...buildFakeTodoItems());
                                }
                                renderProgressRings(placeholder, scopedData);
                            });
                        }
                    } else {
                        placeholder.innerHTML = "";
                    }
                    break;
                }
			case "better_sidebar":
				// Either direction reloads for a clean mount; the old-value guard prevents a reload loop.
				if (changes["better_sidebar"]?.oldValue !== options.better_sidebar) {
					window.location.reload();
					break;
				}
				if (options.better_sidebar) {
                    ensureBetterSidebar();
                    setupMobileNavStyle();
                } else {
                    resetBetterSidebarLayout();
                    setupMobileNavStyle();
                }
				break;
            case "grade_analytics":
                watchGradeAnalytics();
                break;
            case "grade_analytics_zones":
                if (gradeAnalyticsActive() && gaOpen && gaData) renderGradeAnalytics();
                break;
            case "quiz_safe_mode":
                // Feature gating changes on quiz pages; reload to apply cleanly.
                if (isQuizPage()) window.location.reload();
                break;
            case "sidebar_scale": {
                const existingSidebar = document.getElementById("better-sidebar-container");
                if (existingSidebar) {
                    const expander = existingSidebar.querySelector(".better-sidebar-expander");
                    updateSidebar(existingSidebar.dataset.expanded === "true", existingSidebar, expander);
                }
                break;
            }
		}
    });
}

function resetBetterSidebarLayout() {
    document.getElementById("header")?.style.removeProperty("display");
    document.querySelector(".ic-Layout-wrapper")?.style.removeProperty("margin-left");
    document.querySelector("#main")?.style.removeProperty("margin-left");
    document.querySelector(".ic-app-nav-toggle-and-crumbs")?.style.removeProperty("display");
    document.getElementById("not_right_side")?.style.removeProperty("display");
    document.getElementById("not_right_side")?.style.removeProperty("flex");
    document.getElementById("not_right_side")?.style.removeProperty("min-width");
    document.getElementById("right-side-wrapper")?.style.removeProperty("flex");
    document.getElementById("right-side-wrapper")?.style.removeProperty("width");
    document.getElementById("right-side-wrapper")?.style.removeProperty("max-width");
    document.querySelector(".ic-Layout-contentWrapper")?.style.removeProperty("display");
    document.querySelector(".ic-Layout-contentWrapper")?.style.removeProperty("align-items");
    document.querySelector(".ic-Layout-contentWrapper")?.style.removeProperty("min-width");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("flex");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("min-width");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("margin");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("padding");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("background");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("backdrop-filter");
    document.querySelector(".ic-Layout-contentMain")?.style.removeProperty("-webkit-backdrop-filter");
    document.getElementById("left-side")?.style.removeProperty("display");
    document.getElementById("left-side")?.style.removeProperty("padding-top");
    document.getElementById("left-side")?.style.removeProperty("padding-left");
    document.getElementById("section-tabs")?.style.removeProperty("padding-top");
    document.getElementById("better-sidebar-container")?.remove();
    clearBetterSidebarLayoutFix();
    if (sidebarBadgeObserver) { sidebarBadgeObserver.disconnect(); sidebarBadgeObserver = null; }
    if (sidebarBadgeSyncTimer) { clearTimeout(sidebarBadgeSyncTimer); sidebarBadgeSyncTimer = null; }
    sidebarBadgeWatchRetries = 0;
}

function ensureBetterSidebar() {
    if (!options.better_sidebar) return;
    // Quiz safe mode: keep Canvas' sidebar.
    if (quizSafeModeActive()) return;
    if (document.querySelector("#better-sidebar-container")) return;
    if (!document.querySelector("#wrapper") || !document.querySelector(".ic-Layout-contentWrapper")) return;
    setupBetterSidebar(getSidebarLayoutMode());
}

async function applyCustomBackground() {
    // Quiz safe mode: leave the background untouched.
    if (quizSafeModeActive()) return;
    let style = document.querySelector("#canvasrefined-background") || document.createElement('style');
    style.id = "canvasrefined-background";

    const activeBackground = await getActiveCustomBackground();
    if (!activeBackground) {
        if (style.isConnected) style.remove();
        return;
    }

    const backgroundScale = Number(activeBackground.scale) || 100;
    const backgroundUrl = JSON.stringify(activeBackground.url);
    const fitToScreen = options.fitImageToScreen === true;
    // Opacity (0-100): 100 = opaque, 0 = background shows through. Only emitted with a background active.
    const bgOpacity = Math.max(0, Math.min(100, Number(options.bg_opacity ?? 65)));
    const sidebarOpacity = Math.max(0, Math.min(100, Number(options.sidebar_opacity ?? 100)));
    const bgTransparent = 100 - bgOpacity;
    const sidebarTransparent = 100 - sidebarOpacity;
    // Blur (px): only visible when opacity < 100. Content surfaces default to 8px.
    const bgBlur = Math.max(0, Math.min(30, Number(options.bg_blur ?? 8)));
    const sidebarBlur = Math.max(0, Math.min(30, Number(options.sidebar_blur ?? 0)));
    // Card glass effect, off by default (transparent cards can hurt legibility).
    const cardTransparency = options.card_transparency === true;
    const cardOpacity = Math.max(0, Math.min(100, Number(options.card_opacity ?? 80)));
    const cardBlur = Math.max(0, Math.min(30, Number(options.card_blur ?? 8)));
    const cardTransparent = 100 - cardOpacity;
    style.textContent = `
        #wrapper {
            background-image: url(${backgroundUrl}) !important;
            background-repeat: no-repeat !important;
            background-position: center center !important;
            background-attachment: fixed !important;
        }
        @media (orientation: landscape) {
            #wrapper { background-size: ${fitToScreen ? 'cover' : backgroundScale + '% auto'} !important; }
        }
        @media (orientation: portrait) {
            #wrapper { background-size: cover !important; }
        }
        .ic-Dashboard-header__layout {
            background: none !important;
            border-radius: 5px;
            padding-left: 20px !important;
        }
        #dashboard_header_container {
            margin-left: -35px !important;
            margin-right: -35px !important;
            box-sizing: border-box !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 60%, transparent) !important;
            border-radius: 10px !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 1000 !important;
            backdrop-filter: blur(${bgBlur}px) saturate(120%) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) saturate(120%) !important;
        }
        /* glass day groups so a background image shows through between day cards */
        #dashboard-planner .planner-day,
        #dashboard-planner .planner-empty-days {
            background: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 12px !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 75%, transparent) !important;
            padding: 8px 12px !important;
            box-sizing: border-box !important;
        }
        /* canvas keeps these inner surfaces opaque; flatten so the glass shows */
        #dashboard-planner .CompletedItemsFacade-styles__root,
        #dashboard-planner .EmptyDays-styles__nothingPlanned,
        #dashboard-planner-header .PlannerHeader-styles__root {
            background: transparent !important;
        }
        #dashboard-planner .Grouping-styles__title {
            background: var(--bcbackground-1) !important;
            border-radius: 6px !important;
        }
        /* hover tint on glass instead of Canvas's flat gray */
        #dashboard-planner .planner-item:hover,
        #dashboard-planner .Grouping-styles__heroHover:hover {
            background: color-mix(in srgb, var(--bctext-0) 5%, transparent) !important;
            border-radius: 8px !important;
        }
        #right-side-wrapper {
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%);
            border-radius: 5px;
        }
        /* tint the whole #left-side column (the inner frame only wraps the links) */
        #left-side {
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
        }
        /* #right-side sub-text keeps Canvas gray in light mode; recolor for contrast */
        .recent_feedback .event-details {
            background: none !important;
        }
        #right-side .event-details .event-details__context,
        #right-side .event-details .event-details__context *,
        #right-side .recent_feedback .event-details p,
        #right-side .recent_feedback .event-details span {
            color: var(--bctext-0) !important;
        }
        .event-details strong {
            color: var(--bctext-0) !important;
        }
        /* color-mix needs a solid color, so gradient/image sidebars are left alone */
        .ic-app-header {
            background: color-mix(in srgb, var(--bcsidebar), transparent ${sidebarTransparent}%) !important;
            backdrop-filter: blur(${sidebarBlur}px) !important;
            -webkit-backdrop-filter: blur(${sidebarBlur}px) !important;
        }
        .ic-app-header__menu-list-link svg,
        .ic-app-header__menu-list-item.ic-app-header__menu-list-item--active svg {
            fill: var(--bcsidebar-text) !important;
        }
        .menu-item-icon-container,
        .ic-app-header__menu-list-link .menu-item__text,
        .ic-app-header__menu-list-item.ic-app-header__menu-list-item--active .menu-item__text {
            color: var(--bcsidebar-text) !important;
        }
        .ic-app-header__menu-list-item.ic-app-header__menu-list-item--active .ic-app-header__menu-list-link,
        .ic-app-header__menu-list-link:hover {
            background: #0000004f !important;
        }
        /* !important required: the inline background-color is var(--bcsidebar) */
        #better-sidebar-container {
            background-color: color-mix(in srgb, var(--bcsidebar), transparent ${sidebarTransparent}%) !important;
            backdrop-filter: blur(${sidebarBlur}px) !important;
            -webkit-backdrop-filter: blur(${sidebarBlur}px) !important;
        }
        .header-bar {
            background: none !important;
            padding: 0 !important;
            border: none !important;
        }
        /* page show: flatten title + sequence footer to match the other glass panels */
        .pages.show .page-title,
        .page-title {
            background: none !important;
        }
        .module-sequence-footer .module-sequence-footer-content {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
        }
        .item-group-condensed,
        .item-group-container {
            background: transparent !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 12px !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 75%, transparent) !important;
        }
        #context_modules_sortable_container {
            border: none !important;
            background: none !important;
            padding: 0 !important;
        }
        .item-group-condensed .ig-header,
        .item-group-condensed .ig-row,
        .item-group-container .ig-header,
        .item-group-container .ig-row,
        .item-group-condensed .header,
        .item-group-container .header {
            background: transparent !important;
        }
        .item-group-condensed .ig-header.header,
        .item-group-container .ig-header.header {
            background: none !important;
            border: none !important;
            border-radius: 0 !important;
        }
        #assignments.ui-tabs-panel {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
        }
        /* InstUI flex View ships an opaque surface; give it the glass treatment */
        .css-fiozi7-view--flex-flex {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
        }
        /* flatten inner Views to one surface; keep avatars, role pills, buttons */
        .css-fiozi7-view--flex-flex [class*="-view"]:not([class*="-avatar"]):not([data-testid="pill-container"]):not([data-testid="pill-container"] *):not([class*="-baseButton"]) {
            background: none !important;
        }
        .css-fiozi7-view--flex-flex [class*="-baseButton"],
        .css-fiozi7-view--flex-flex [class*="-baseButton"] [class*="-baseButton__content"],
        .css-fiozi7-view--flex-flex [class*="-baseButton"] [class*="-baseButton__iconWrapper"] {
            background: none !important;
            border: none !important;
            box-shadow: none !important;
        }
        /* nested copy of the panel: no second blur over the outer glass */
        .css-fiozi7-view--flex-flex .css-fiozi7-view--flex-flex {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }
        /* threads toolbar sits under the header panel; same glass treatment */
        .css-1n94jrf-view {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
            padding: 5px !important;
        }
        #assignments {
            padding-top: 0px !important;
            padding-bottom: 0px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
        }
        ${isCoursesIndexPage() ? `
        #content {
            margin: 36px 48px 48px !important;
            padding: 10px !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
            box-sizing: border-box !important;
        }
        ` : ""}
        ${isGroupsIndexPage() ? `
        #content {
            margin: 36px 48px 48px !important;
            padding: 10px !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
            box-sizing: border-box !important;
        }
        ` : ""}
        /* #content tint so bg_opacity/bg_blur apply without Better Sidebar */
        ${getSidebarLayoutMode() === "course" ? `
        .ic-Layout-contentMain {
            margin: 26px 38px 38px !important;
            padding: 10px !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 10px !important;
        }
        ` : ""}
        ${isConversationsPage() ? `
        .css-1nh4pc4-view-flexItem {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 5px !important;
            box-sizing: border-box !important;
        }
        .css-1nh4pc4-view-flexItem svg,
        .css-1nh4pc4-view-flexItem svg * {
            fill: currentColor !important;
            stroke: currentColor !important;
            color: var(--bctext-0) !important;
        }
        ` : ""}
        .item-group-condensed .ig-row.ig-published.no-estimated-duration {
            color: var(--bctext-1) !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 60%, transparent) !important;
            border-radius: 0 !important;
            padding: 10px 12px !important;
        }
        .item-group-condensed .context_module_item,
        .item-group-container .context_module_item {
            background: transparent !important;
        }
        .item-group-condensed .context_module_item:hover,
        .item-group-container .context_module_item:hover,
        .item-group-condensed .context_module_item.context_module_item_hover,
        .item-group-container .context_module_item.context_module_item_hover {
            background: transparent !important;
            border-radius: 10px !important;
        }
        .item-group-container {
            background: transparent !important;
            border-radius: 12px !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 75%, transparent) !important;
        }
        .ig-header {
        }
        .item-group-condensed.context_module,
        .item-group-condensed.context_module_item,
        .item-group-condensed[class~="context_module"] {
            margin-bottom: 10px !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }

        .item-group-condensed .ig-header.header,
        .item-group-container .ig-header.header {
            padding-top: 0 !important;
        }

        /* module panels keep the slider blur on hover */
        .item-group-condensed.context_module,
        .item-group-condensed.context_module_item,
        .item-group-condensed[class~="context_module"],
        .item-group-condensed.context_module:hover,
        .item-group-condensed.context_module_item:hover,
        .item-group-condensed.context_module.context_module_item_hover,
        .item-group-condensed.context_module_item.context_module_item_hover {
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
        }
        .canvasrefined-gpa-card,
        .canvasrefined-gpa,
        .ic-DashboardCard {
            ${cardTransparency
                ? `background: color-mix(in srgb, var(--bcbackground-0), transparent ${cardTransparent}%) !important;
            backdrop-filter: blur(${cardBlur}px) saturate(120%) !important;
            -webkit-backdrop-filter: blur(${cardBlur}px) saturate(120%) !important;`
                : `background: var(--bcbackground-0) !important;`}
        }
        /* card header strip: transparent on translucent cards, theme color otherwise */
        .ic-DashboardCard__header_content {
            ${cardTransparency
                ? `background: none !important;`
                : `background: var(--bcbackground-0) !important;`}
        }
        tr.student_assignment.assignment_graded.editable > * {
            border:none!important
        }`; 
    // TODO: liquid glass?
    
    document.documentElement.appendChild(style);
}

function applyBetterSidebarLayoutFix() {
    let style = document.querySelector("#canvasrefined-sidebar-layout-fix") || document.createElement("style");
    style.id = "canvasrefined-sidebar-layout-fix";
    style.textContent = `
        #wrapper,
        .ic-Layout-wrapper,
        #main {
            margin-left: 0 !important;
        }
    `;
    document.documentElement.appendChild(style);
}

function clearBetterSidebarLayoutFix() {
	let style = document.querySelector("#canvasrefined-sidebar-layout-fix");
	if (style) style.remove();
}

let insertTimer;
function resetTimer() {
    clearTimeout(insertTimer);
    insertTimer = setTimeout(() => {
        if (document.querySelectorAll(".ic-DashboardCard__link").length > 0) {
            loadCardAssignments();
            loadBetterTodo();
        } else {
            resetTimer();
        }
    }, 1);
}

function syncDashboardLoadingState() {
    const dc = document.querySelector("#DashboardCard_Container");
    if (!dc) return;
    const hasRealCards = !!dc.querySelector(".ic-DashboardCard__link");
    dc.classList.toggle("cr-loading", !hasRealCards);
}
function checkDashboardReady() {
    const isDashboard = () => current_page == "/" || current_page == "" || /^\/courses\/(\d+)(?:\/|$)/.test(current_page);

    const callback = (mutationList) => {
        let hasChildList = false;
        for (const mutation of mutationList) {
            if (mutation.type === "childList") { hasChildList = true; break; }
        }
        if (!hasChildList) return;

        if (isDashboard()) {
            if (dashboardReadyTimer) return;
            dashboardReadyTimer = setTimeout(() => {
                dashboardReadyTimer = null;

                syncDashboardLoadingState();
                const c = document.querySelector("#DashboardCard_Container");
                if (c) {
                    let cards = document.querySelectorAll(".ic-DashboardCard");
                    // Cheap signature of the card set; our own mutations never change it.
                    let signature = cards.length + "";
                    for (let i = 0; i < cards.length; i++) {
                        const link = cards[i].querySelector(".ic-DashboardCard__link");
                        signature += "|" + (link ? link.getAttribute("href") : "");
                    }
                    // A hard reload replaces the card nodes with ones missing our marker, so
                    // also re-run whenever any card lacks it.
                    let missingMarker = false;
                    for (let i = 0; i < cards.length; i++) {
                        if (!cards[i].querySelector(".canvasrefined-card-assignment")) {
                            missingMarker = true;
                            break;
                        }
                    }
                    if (signature !== lastDashboardCardSignature || missingMarker) {
                        lastDashboardCardSignature = signature;
                        changeGradientCards();
                        setupCardAssignments();
                        loadCardAssignments();
                        customizeCards(cards);
                        insertGrades();
                        loadDashboardNotes();
                        setupGPACalc();
                        loadAllSimpleWidgets();
                        showUpdateMsg();
                        createNasaInfoOverlay();
                    }
                }

                const rightSide = document.querySelector("#right-side");
                if (rightSide && !rightSide.querySelector(".canvasrefined-todosidebar")) {
                    setupBetterTodo();
                    setupBetterSidebar(getSidebarLayoutMode());
                }

                if (options.better_sidebar) {
                    ensureBetterSidebar();
                }
            }, 0);
        } else if (options.better_sidebar) {
            // Throttle sidebar setup checks on course pages.
            if (sidebarReadyTimer) return;
            sidebarReadyTimer = setTimeout(() => {
                sidebarReadyTimer = null;
                ensureBetterSidebar();
            }, 100);
        }
    };

    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Canvas can finish rendering before this observer attaches; kick one pass immediately.
    callback([{ type: "childList" }]);
}

function recieveMessage(request, sender, sendResponse) {
    switch (request.message) {
        case ("getCards"):
            if (options["card_method_dashboard"] === true) {
                getCardsFromDashboard().then(() => sendResponse(true)).catch(() => sendResponse(true));
            } else {
                getCards().then(() => sendResponse(true)).catch(() => sendResponse(true));
            }
            return true; // keep the message channel open for async sendResponse
        case ("setcolors"): changeColorPreset(request.options); sendResponse(true); break;
        case ("getcolors"): getCardColors().then(colors => sendResponse(colors)); return true; // keep the message channel open for async sendResponse
        case ("getGridCardCount"): {
            // Only cards actually rendered and not display:none occupy grid cells; null = no dashboard here.
            try {
                const dashCards = Array.from(document.querySelectorAll(".ic-DashboardCard"));
                if (!dashCards.length) { sendResponse(null); break; }
                const visible = dashCards.filter(c => getComputedStyle(c).display !== "none");
                sendResponse({ count: visible.length });
            } catch (e) {
                sendResponse(null);
            }
            break;
        }
        case ("inspect"): sendResponse(inspectDarkMode(true)); break;
        case ("previewCelebration"): sendResponse(runCelebrationPreview()); break;
        case ("fixdm"): sendResponse(runDarkModeFixer(true)); break;
		case ("updateBackground"): applyCustomBackground(); sendResponse(true); break;
        case ("clearPlannerCache"):
            // Clear planner cache: refetch and re-render every consumer in this tab.
            (async () => {
                try { await chrome.storage.local.remove(PLANNER_CACHE_KEY); } catch (e) { /* nothing stored */ }
                if (options.assignments_due === true || options.better_todo === true) {
                    const items = await loadPlannerItems();
                    refreshPlannerConsumers(items);
                }
                sendResponse(true);
            })();
            return true; // keep the message channel open for async sendResponse
        default: sendResponse(true);
    }
}

function hexToRgb(hex) {
    let match = (/#(.{2})(.{2})(.{2})/).exec(hex);
    if (match) {
        return { "r": parseInt(match[1], 16), "g": parseInt(match[2], 16), "b": parseInt(match[3], 16) };
    }
}

function inspectDarkMode(withOutput = false) {
    let output = "";
    let bgcount = 0, textcount = 0, time = performance.now();
    let bg0 = hexToRgb(options.dark_preset["background-0"]);
    let bg1 = hexToRgb(options.dark_preset["background-1"]);
    let txt = hexToRgb(options.dark_preset["text-0"]);
    let bdr = hexToRgb(options.dark_preset["borders"]);
    let lnk = hexToRgb(options.dark_preset["links"]);
    document.querySelectorAll("*").forEach(el => {
        let style = getComputedStyle(el);
        let bgcolor = style.getPropertyValue("background").match(/rgb\((?<r>\d*)\, ?(?<g>\d*)\, ?(?<b>\d*)\) none/);
        let selector = "class=." + el.className + ",id=#" + el.id;

        if (bgcolor) {
            const r = parseInt(bgcolor.groups["r"]);
            const g = parseInt(bgcolor.groups["g"]);
            const b = parseInt(bgcolor.groups["b"]);
            if (r > 245 && g > 245 && b > 245 && !(r === bg0.r && g === bg0.g && b === bg0.b) && !(r === lnk.r && g === lnk.g && b === lnk.b)) {
                el.style.cssText = (";background:" + options.dark_preset["background-0"] + "!important;color" + options.dark_preset["text-0"] + "!important;") + el.style.cssText;
                if (withOutput === true) output += selector + "{background: background-0, color: text-0}\n";
                bgcount++;
            } else if (r > 225 && r < 245 && g > 225 && g < 245 && b > 225 && b < 245 && !(r === bg1.r && g === bg1.g && b === bg1.b) && !(r === lnk.r && g === lnk.g && b === lnk.b)) {
                el.style.cssText = (";background:" + options.dark_preset["background-1"] + "!important;color" + options.dark_preset["text-0"] + "!important;") + el.style.cssText;
                if (withOutput === true) output += selector + "{background: background-1, color: text-0}";
                bgcount++;
            }
        }


        let bordercolor = style.getPropertyValue("border-color").match(/rgb\((?<r>\d*)\, ?(?<g>\d*)\, ?(?<b>\d*)/);
        if (bordercolor) {
            const r = parseInt(bordercolor.groups["r"]);
            const g = parseInt(bordercolor.groups["g"]);
            const b = parseInt(bordercolor.groups["b"]);
            if (r > 195 && g > 195 && b > 195 && !(r === bdr.r && g === bdr.g && b === bdr.b) && !(r === lnk.r && g === lnk.g && b === lnk.b)) {
                el.style.cssText = "border-color:" + options.dark_preset["borders"] + "!important;" + el.style.cssText;
                if (withOutput === true) output += selector + "{border: borders}";
            }
        }

        let text = style.getPropertyValue("color").match(/rgb\((?<r>\d*)\, ?(?<g>\d*)\, ?(?<b>\d*)/);
        if (text) {
            const r = parseInt(text.groups["r"]);
            const g = parseInt(text.groups["g"]);
            const b = parseInt(text.groups["b"]);
            if (r <= 70 && g <= 70 && b <= 70 && !(r === txt.r && g === txt.g && b === txt.b)) {
                el.style.cssText = "color:" + options.dark_preset["text-0"] + "!important;" + el.style.cssText;
                if (withOutput === true) output += selector + "{text: text-0}";
                textcount++;
            }
        }

    });
    console.log("done fixing dark mode - time:", performance.now() - time, "total backgrounds changed: ", bgcount, ", total colors changed: ", textcount);
    return { "selectors": output === "" ? "no gaps determined" : output, "time": performance.now() - time };
}

async function getCardColors() {
    // Same order changeColorPreset applies palettes with, so exports map back to courses.
    const { cards, apiColors } = await getPaletteCards();
    if (cards.length === 0) return [];
    return cards.map(card => card.el
        ? rgbToHex(card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor)
        : (apiColors["course_" + card.href.split("courses/")[1]] || "#ffffff"));
}

function getCardsFromDashboard() {
    console.log("getting cards from dashboard")
    const dashboard_cards = document.querySelectorAll(".ic-DashboardCard");
    return new Promise(resolve => {
    chrome.storage.sync.get(["custom_cards", "custom_cards_2", "custom_cards_3"], storage => {
        let cards = storage["custom_cards"] || {};
        let cards_2 = storage["custom_cards_2"] || {};
        let cards_3 = storage["custom_cards_3"] || {};
        let newCards = false;
        let count = 0;
        try {
            dashboard_cards.forEach(card => {
                const id = card.querySelector(".ic-DashboardCard__link").href.split("courses/")[1];
                if (count >= (options["card_limit"] || 25)) return;

                if (!cards[id]) {
                    newCards = true;
                    cards[id] = { "default": card.querySelector(".ic-DashboardCard__header-subtitle").textContent.substring(0, 20), "fullName": card.querySelector(".ic-DashboardCard__header-title")?.textContent?.trim() || "", "name": "", "code": "", "img": "", "hidden": false, "weight": "regular", "credits": 1, "eid": 100000 - count, "gr": null };
    
                    let links = [];
                    for (let i = 0; i < 4; i++) {
                        links.push({ "path": "default", "is_default": true });
                    }
                    cards_2[id] = { "links": links };
        
                    cards_3[id] = { "url": domain };
                } else {
                    const full = card.querySelector(".ic-DashboardCard__header-title")?.textContent?.trim() || "";
                    if (full && cards[id].fullName !== full) {
                        cards[id].fullName = full;
                        newCards = true;
                    }
                }
                count++;
            });

            if (count === 0) return;

            Object.keys(cards).forEach(key => {
                let found = false;
                if (cards_3[key] && cards_3[key].url !== domain) {
                    found = true;
                } else {
                    dashboard_cards.forEach(card => {
                        const id = card.querySelector(".ic-DashboardCard__link").href.split("courses/")[1];
                        if (parseInt(key) === parseInt(id)) found = true;
                    });
                }

                if (found === false) {
                    console.log("Deleting " + key);
                    cards[key] && delete cards[key];
                    cards_2[key] && delete cards_2[key];
                    cards_3[key] && delete cards_3[key];
                    newCards = true;
                }

            });

        } catch (e) {
            console.log("Error getting dashboard cards\n", e);
            logError(e);
        } finally {
            if(newCards !== true) { resolve(); return; }
            console.log(newCards ? "new cards found" : "");
            chrome.storage.sync.set({ "custom_cards": cards, "custom_cards_2": cards_2, "custom_cards_3": cards_3 }, () => resolve());
        }
    });
    });
}

async function getCards(api = null) {
    let dashboard_cards = api ? api : await getData(`${domain}/api/v1/courses?${/*enrollment_state=active&*/""}per_page=100`);
    await new Promise(resolve => {
    chrome.storage.sync.get(["custom_cards", "custom_cards_2", "custom_cards_3"], storage => {
        let cards = storage["custom_cards"] || {};
        let cards_2 = storage["custom_cards_2"] || {};
        let cards_3 = storage["custom_cards_3"] || {};
        let newCards = false;
        let count = 0;
        if (options["card_method_date"] === true) {
            dashboard_cards.sort((a, b) => (b?.created_at) > (a?.created_at) ? 1 : -1);
        } else {
            dashboard_cards.sort((a, b) => (b?.enrollment_term_id || 0) - (a?.enrollment_term_id || 0));
        }
        try {
            dashboard_cards.forEach(card => {
                if (!card.course_code || count >= (options["card_limit"] || 25)) return;
                let id = card.id;
                if (!cards || !cards[id]) {
                    newCards = true;
                    cards[id] = { "default": card.course_code.substring(0, 20), "fullName": card.name || card.course_code || "", "name": "", "code": "", "img": "", "hidden": false, "weight": "regular", "credits": 1, "eid": card.enrollment_term_id || 0, "gr": null };
                } else if (cards && cards[id]) {
                    newCards = true;
                    cards[id].default = card.course_code.substring(0, 20);
                    cards[id].fullName = card.name || card.course_code || cards[id].fullName || "";
                    cards[id].eid = card.enrollment_term_id || 0;
                    if (!cards[id].code) cards[id].code = "";
                }
                if (!cards_2 || !cards_2[id]) {
                    newCards = true;
                    let links = [];

                    for (let i = 0; i < 4; i++) {
                        links.push({ "path": "default", "is_default": true });
                    }

                    cards_2[id] = { "links": links };
                }

                if (!cards_3 || !cards_3[id]) {
                    newCards = true;
                    cards_3[id] = { "url": domain };
                }
                count++;

            });

            Object.keys(cards).forEach(key => {
                let found = false;
                if (cards_3[key] && cards_3[key].url !== domain) {
                    found = true;
                } else {
                    dashboard_cards.forEach(card => {
                        if (parseInt(key) === card.id) found = true;
                    });
                }

                if (found === false) {
                    console.log("Deleting " + key + " from custom_cards...", cards[key]);
                    cards[key] && delete cards[key];
                    cards_2[key] && delete cards_2[key];
                    cards_3[key] && delete cards_3[key];
                    newCards = true;
                }

            });

        } catch (e) {
            console.log(e);
        } finally {
            chrome.storage.sync.set(newCards ? { "custom_cards": cards, "custom_cards_2": cards_2, "custom_cards_3": cards_3 } : {}, () => resolve());
        }
    });
    });
}

/* 
Better todo list
*/


function convertToDueDate(dueAt) {
	final = "due ";
	let date = new Date(dueAt);
	final += date.toLocaleString("en-US", { month: "short", day: "numeric" });
	final += " at " + date.toLocaleString("en-US", { hour: "numeric", minute: "numeric", hour12: !options.todo_hr24 });
	return final;
}
function updateIndicator(element) {
	const indicator = document.getElementById("better-todo-indicator");
	indicator.style.width = `${element.offsetWidth*2}px`;
	indicator.style.left = `${element.offsetLeft - (element.offsetWidth * .5)}px`;

	const buttons = ["announcement", "assignments", "completed"];
	buttons.forEach(button => {
		const btn = document.getElementById(`better-todo-${button}`);
		if (btn == element) {
			btn.firstElementChild.style.opacity = "1";
		}
		else {
			btn.firstElementChild.style.opacity = ".5";
		}
	})

}
betterTodoFilter = "tasks";
// Timeframe filter for the Tasks tab; "all" = no limit. Announcements and completed are unaffected.
let betterTodoTimeframe = "all";
const BETTER_TODO_TIMEFRAME_DAYS = {
	"1week": 7,
	"2week": 14,
	"month": 30,
	"2month": 60,
};
// Presets include this many days of history so recently overdue work stays visible.
const TODO_TIMEFRAME_LOOKBACK_DAYS = 4;
// Announcements older than this never show and never count toward the unread badge.
const TODO_ANNOUNCEMENT_MAX_AGE_DAYS = 30;
// Look-ahead paging: each right-arrow press advances one full window.
let betterTodoTimeframeOffset = 0;
// null = all classes.
let betterTodoProgressFilter = null;
let domContainers = {};

// Resolve the persisted todo_timeframe option ("all" when unset/unknown).
function getTodoTimeframeKey() {
    const allowed = ["all", "1week", "2week", "month", "2month", "custom"];
    return allowed.includes(options.todo_timeframe) ? options.todo_timeframe : "all";
}

// Custom bounds: X days ago to Y days ahead, clamped to 0-365.
function getTodoCustomTimeframeDays() {
    const past = parseInt(options.todo_timeframe_custom_past);
    const future = parseInt(options.todo_timeframe_custom_future);
    return {
        past: isNaN(past) ? 7 : Math.max(0, Math.min(365, past)),
        future: isNaN(future) ? 14 : Math.max(0, Math.min(365, future)),
    };
}

function getTodoTimeframeSpanDays() {
    const tf = getTodoTimeframeKey();
    if (tf === "all") return 0;
    if (tf === "custom") {
        const c = getTodoCustomTimeframeDays();
        return Math.max(1, c.past + c.future);
    }
    return BETTER_TODO_TIMEFRAME_DAYS[tf] + TODO_TIMEFRAME_LOOKBACK_DAYS;
}

function getTodoTimeframePastDays() {
    const tf = getTodoTimeframeKey();
    if (tf === "all") return 0;
    if (tf === "custom") return getTodoCustomTimeframeDays().past;
    return TODO_TIMEFRAME_LOOKBACK_DAYS;
}

// Before start of today (matches the Overdue group); overdue work bypasses the window.
function isTodoOverdueItem(item) {
    const due = new Date(item?.plannable_date);
    if (isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
}

// Shared by the task list and the progress display so their counts agree.
// Overdue items always pass; lenientPast keeps old announcements/completed on the current window.
function applyTodoTimeframe(items, lenientPast) {
    betterTodoTimeframe = getTodoTimeframeKey();
    if (betterTodoTimeframe === "all") return items;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const days = getTodoTimeframeSpanDays();
    const pastDays = getTodoTimeframePastDays();
    const cutoff = now + ((betterTodoTimeframeOffset + 1) * days - pastDays) * dayMs;
    if (lenientPast === true && betterTodoTimeframeOffset <= 0) {
        return items.filter(item => new Date(item.plannable_date).getTime() <= cutoff);
    }
    const windowStart = now + (betterTodoTimeframeOffset * days - pastDays) * dayMs;
    return items.filter(item => {
        if (lenientPast !== true && isTodoOverdueItem(item)) return true;
        const t = new Date(item.plannable_date).getTime();
        return t > windowStart && t <= cutoff;
    });
}

function getTodoTimeframeWindow() {
    const tf = getTodoTimeframeKey();
    const days = getTodoTimeframeSpanDays();
    const offset = (tf === "all") ? 0 : betterTodoTimeframeOffset;
    const pastDays = getTodoTimeframePastDays();
    const now = Date.now();
    const start = new Date(now + (offset * days - pastDays) * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { tf, range: fmt(start) + " \u2013 " + fmt(end) };
}

// Update the pager after each render; hidden when the timeframe is "all".
function updateTodoTimeframeNav() {
    const nav = document.getElementById("better-todo-timeframe-nav");
    if (!nav) return;
    const tfWindow = getTodoTimeframeWindow();
    const paged = tfWindow.tf !== "all";
    nav.style.display = paged ? "flex" : "none";
    if (!paged) return;
    const label = nav.querySelector("#better-todo-timeframe-label");
    if (label) label.textContent = tfWindow.range;
    const prev = nav.querySelector("#better-todo-timeframe-prev");
    if (prev) {
        const canPrev = betterTodoTimeframeOffset > 0;
        prev.disabled = !canPrev;
        prev.style.opacity = canPrev ? "1" : ".3";
        prev.style.cursor = canPrev ? "pointer" : "default";
    }
}

function getTodoTimeframeBounds() {
    const tf = getTodoTimeframeKey();
    if (tf === "all") return null;
    const spanDays = getTodoTimeframeSpanDays();
    const pastDays = getTodoTimeframePastDays();
    const now = Date.now();
    const start = now + (betterTodoTimeframeOffset * spanDays - pastDays) * 24 * 60 * 60 * 1000;
    return { start, end: start + spanDays * 24 * 60 * 60 * 1000 };
}

function progressFilterDim(courseId) {
    return betterTodoProgressFilter != null && String(courseId) !== String(betterTodoProgressFilter);
}
// Assignments, quizzes and graded discussions (plus custom planner notes) are tasks.
// Peer Review items arrive as assessment_request (legacy peer reviews) and
// peer_review_sub_assignment (new allocation/grading flows), plus checkpoint
// sub_assignments which should also surface in the todo list.
const TODO_PEER_REVIEW_TYPES = ["assessment_request", "peer_review_sub_assignment"];
const TODO_SUB_ASSIGNMENT_TYPES = ["sub_assignment"];
function isTodoTaskType(item) {
    const t = String(item.plannable_type || "").toLowerCase();
    return t === "assignment"
        || t === "planner_note"
        || t === "quiz"
        || t === "discussion_topic"
        || TODO_PEER_REVIEW_TYPES.includes(t)
        || TODO_SUB_ASSIGNMENT_TYPES.includes(t);
}
function isPeerReviewType(item) {
    return TODO_PEER_REVIEW_TYPES.includes(String(item.plannable_type || "").toLowerCase());
}
function isSubAssignmentType(item) {
    return TODO_SUB_ASSIGNMENT_TYPES.includes(String(item.plannable_type || "").toLowerCase());
}

// Click filters the todo list to one class; no-op on course pages, toggles off.
function attachProgressFilterClick(el, courseId) {
    if (getCurrentCourseId() != null) { el.style.cursor = ''; el.onclick = null; return; }
    el.style.cursor = 'pointer';
    el.onclick = () => {
        betterTodoProgressFilter = (String(betterTodoProgressFilter) === String(courseId)) ? null : String(courseId);
        const loc = document.querySelector("#canvasrefined-todo-list");
        if (loc) { clearTodoList(); createTodoSections(loc); }
    };
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatTimeForInput(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

/* Progress display mode, stored in options.todo_progress_rings.
   Modes: "none", "rings", "rainbow", "lines", "line".
   Legacy booleans normalize: true/undefined -> rings, false -> none. */
function getProgressRingMode() {
    const v = options.todo_progress_rings;
    if (v === false) return "none";
    if (v === true || v === undefined || v === null) return "rings";
    const allowed = ["none", "rings", "rainbow", "lines", "line"];
    if (allowed.includes(v)) return v;
    if (v === "per_course") return "rings";
    if (v === "combined" || v === "segmented") return "line";
    return "rings";
}

function progressRingsEnabled() {
    return getProgressRingMode() !== "none";
}

function courseRingColor(courseId, idx) {
    return options.custom_cards_3?.[String(courseId)]?.color
        || options.custom_cards_3?.[courseId]?.color
        || `hsl(${(idx * 60) % 360} 70% 50%)`;
}

function courseRingLabel(courseId) {
    const card = options.custom_cards?.[String(courseId)] || options.custom_cards?.[courseId];
    return card?.default || `Course ${courseId}`;
}

// Courses hidden from the dashboard drop out; personal tasks are always kept.
function isCourseHidden(courseId) {
    if (courseId === undefined || courseId === null) return false;
    const cards = options.custom_cards || {};
    const card = cards[String(courseId)] || cards[courseId];
    return !!card && card.hidden === true;
}

// "Hide this course from the Better Todo list" is independent of dashboard visibility.
function isCourseTodoHidden(courseId) {
    if (courseId === undefined || courseId === null) return false;
    const cards = options.custom_cards || {};
    const card = cards[String(courseId)] || cards[courseId];
    return !!card && card.hide_todo === true;
}

function filterHiddenCourses(data) {
    return data.filter(item => {
        const cid = item.course_id || item.context_id || item?.plannable?.course_id;
        return !isCourseHidden(cid) && !isCourseTodoHidden(cid);
    });
}

function getTodoScopedData(data, courseId) {
    const visible = filterHiddenCourses(data);
    if (!courseId) return visible;
    return visible.filter(item => {
        const itemCourseId = parseInt(item.course_id || item.context_id || item?.plannable?.course_id);
        return itemCourseId === courseId;
    });
}

function getDashboardCourseOrder() {
    const order = new Map();
    document.querySelectorAll('.ic-DashboardCard').forEach((card, idx) => {
        const id = getCardId(card);
        if (id && id !== -1 && !order.has(String(id))) order.set(String(id), idx);
    });
    return order;
}

// Scale the centered % / count text down when it would cross the strokes, dropping
// the count line when the hole is really tight. `neededRadius(hw, hh)` = distance
// from the hole's center to the farthest text corner.
function fitProgressOverlayText(overlay, neededRadius, availableRadius) {
    const textWrap = overlay?.firstElementChild;
    const pct = overlay?.querySelector('.canvasrefined-progress-percent');
    const cnt = overlay?.querySelector('.canvasrefined-progress-count');
    if (!textWrap || !pct || !cnt || textWrap === pct || textWrap === cnt) return;
    pct.style.fontSize = '20px';
    cnt.style.fontSize = '12px';
    cnt.style.display = '';
    if (!availableRadius || availableRadius <= 0) return;
    let w = textWrap.offsetWidth;
    let h = textWrap.offsetHeight;
    if (!w || !h) return;
    let needed = neededRadius(w / 2, h / 2);
    if (needed <= availableRadius) return;
    let scale = availableRadius / needed;
    if (20 * scale < 11) {
        cnt.style.display = 'none';
        w = textWrap.offsetWidth;
        h = textWrap.offsetHeight;
        needed = neededRadius(w / 2, h / 2);
        if (needed <= availableRadius) return;
        scale = availableRadius / needed;
    }
    pct.style.fontSize = `${Math.max(10, Math.round(20 * scale))}px`;
    if (cnt.style.display !== 'none') cnt.style.fontSize = `${Math.max(9, Math.round(12 * scale))}px`;
    if (neededRadius(textWrap.offsetWidth / 2, textWrap.offsetHeight / 2) > availableRadius) {
        cnt.style.display = 'none';
    }
}

// Mode "rings": concentric rings, one per course, each filled by completion.
function renderProgressRingsMode(wrapper, shown, totalAll, completedAll, percent) {
    const containerWidth = wrapper.clientWidth || 240;
    const size = Math.min(280, Math.floor(containerWidth * 0.99));
    const cx = size / 2;
    const cy = size / 2;
    const padding = 2;
    const outerRadius = Math.floor((size / 2) - padding);

    let svg = wrapper.querySelector('svg.canvasrefined-progress-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'canvasrefined-progress-svg');
        svg.style.display = 'block';
        wrapper.appendChild(svg);
    }
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    let overlay = wrapper.querySelector('.canvasrefined-progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'canvasrefined-progress-overlay';
        overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'text-align:center;color:var(--bctext-0);';
        textWrap.innerHTML = `<div class='canvasrefined-progress-percent' style='font-weight:700;font-size:20px;line-height:1;'></div><div class='canvasrefined-progress-count' style='font-size:12px;margin-top:4px;'></div>`;
        overlay.appendChild(textWrap);
        wrapper.appendChild(overlay);
    }
    overlay.querySelector('.canvasrefined-progress-percent').textContent = `${percent}%`;
    overlay.querySelector('.canvasrefined-progress-count').textContent = (chrome.i18n.getMessage("progress_done") || "{{DONE}}/{{TOTAL}} done").replace("{{DONE}}", completedAll).replace("{{TOTAL}}", totalAll);

    const stroke = 8;
    const gap = 4;
    const decrement = stroke + gap;
    const ringCount = shown.length;
    const startRadius = outerRadius - stroke / 2;
    const minCenterRadius = 44;
    const requiredSpace = (ringCount - 1) * decrement + stroke / 2 + minCenterRadius;
    let adjustFactor = 1;
    if (requiredSpace > startRadius) {
        adjustFactor = (startRadius - minCenterRadius - stroke / 2) / Math.max(1, (ringCount - 1) * decrement);
    }

    let innerEdge = startRadius - stroke / 2;
    shown.forEach((entry, idx) => {
        const radius = startRadius - idx * Math.max(1, Math.floor(decrement * adjustFactor));
        if (radius <= 0) return;
        innerEdge = Math.min(innerEdge, radius - stroke / 2);
        const circumference = 2 * Math.PI * radius;
        const prog = entry.total === 0 ? 0 : entry.completed / entry.total;
        const color = courseRingColor(entry.courseId, idx);

        let bg = svg.querySelector(`circle[data-idx='${idx}'][data-role='bg']`);
        if (!bg) {
            bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bg.setAttribute('data-idx', String(idx));
            bg.setAttribute('data-role', 'bg');
            bg.classList.add('canvasrefined-ring-bg');
            svg.appendChild(bg);
        }
        bg.setAttribute('cx', String(cx));
        bg.setAttribute('cy', String(cy));
        bg.setAttribute('r', String(radius));
        bg.setAttribute('stroke', color);
        bg.setAttribute('stroke-opacity', '0.25');
        bg.setAttribute('stroke-width', String(stroke));
        bg.setAttribute('fill', 'none');
        bg.removeAttribute('stroke-dasharray');
        bg.removeAttribute('stroke-dashoffset');
        bg.removeAttribute('transform');

        let fg = svg.querySelector(`circle[data-idx='${idx}'][data-role='fg']`);
        const dasharrayVal = circumference.toFixed(3);
        const target = (circumference * (1 - prog)).toFixed(3);
        if (!fg) {
            fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            fg.setAttribute('data-idx', String(idx));
            fg.setAttribute('data-role', 'fg');
            fg.classList.add('canvasrefined-progress-ring');
            fg.setAttribute('stroke-linecap', 'round');
            fg.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
            fg.setAttribute('stroke-dasharray', dasharrayVal);
            fg.setAttribute('stroke-dashoffset', dasharrayVal); // start empty
            fg.style.transition = 'stroke-dashoffset .8s cubic-bezier(.2,.9,.2,1), opacity .3s ease';
            svg.appendChild(fg);
        }
        fg.setAttribute('cx', String(cx));
        fg.setAttribute('cy', String(cy));
        fg.setAttribute('r', String(radius));
        fg.setAttribute('stroke', color);
        fg.setAttribute('stroke-width', String(stroke));
        fg.setAttribute('fill', 'none');
        fg.setAttribute('stroke-dasharray', dasharrayVal);
        const dim = progressFilterDim(entry.courseId);
        bg.style.transition = 'opacity .3s ease';
        bg.style.opacity = dim ? '0.25' : '';
        fg.style.opacity = dim ? '0.3' : '';
        requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', target)));
        const step = Math.max(1, Math.floor(decrement * adjustFactor));
        let hit = svg.querySelector(`circle[data-idx='${idx}'][data-role='hit']`);
        if (!hit) {
            hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hit.setAttribute('data-idx', String(idx));
            hit.setAttribute('data-role', 'hit');
            hit.setAttribute('fill', 'none');
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('pointer-events', 'stroke');
            svg.appendChild(hit);
        }
        hit.setAttribute('cx', String(cx));
        hit.setAttribute('cy', String(cy));
        hit.setAttribute('r', String(radius));
        hit.setAttribute('stroke-width', String(Math.max(stroke, step)));
        attachProgressFilterClick(hit, entry.courseId);
        hit.onmouseenter = () => { bg.style.opacity = '0.8'; fg.style.opacity = '0.8'; };
        hit.onmouseleave = () => {
            const d = progressFilterDim(entry.courseId);
            bg.style.opacity = d ? '0.25' : '';
            fg.style.opacity = d ? '0.3' : '';
        };
    });

    fitProgressOverlayText(overlay, (hw, hh) => Math.hypot(hw, hh), Math.max(0, innerEdge - 2));

    const maxIdx = shown.length - 1;
    svg.querySelectorAll('circle').forEach(c => {
        const idx = parseInt(c.getAttribute('data-idx'));
        if (Number.isNaN(idx) || idx > maxIdx) c.remove();
    });
}

// Mode "rainbow": one arc per class, condensed into a top half-circle.
function renderProgressRainbow(wrapper, shown, totalAll, completedAll, percent) {
    const containerWidth = wrapper.clientWidth || 240;
    const size = Math.min(280, Math.floor(containerWidth * 0.99));
    const cx = size / 2;
    const stroke = 8;
    const gap = 4;
    const decrement = stroke + gap;
    const ringCount = shown.length;
    const pad = 2;
    const outerRadius = Math.max(20, Math.floor(size / 2) - stroke / 2 - pad);
    // Arcs bulge upward from the diameter line (y < baseY).
    const baseY = outerRadius + stroke / 2 + pad;
    const svgHeight = Math.ceil(baseY + stroke / 2 + 2);

    let svg = wrapper.querySelector('svg.canvasrefined-progress-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'canvasrefined-progress-svg');
        svg.style.display = 'block';
        wrapper.appendChild(svg);
    }
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(svgHeight));
    svg.setAttribute('viewBox', `0 0 ${size} ${svgHeight}`);

    const minInnerRadius = 56;
    const requiredSpace = (ringCount - 1) * decrement;
    let adjustFactor = 1;
    if (requiredSpace > outerRadius - minInnerRadius) {
        adjustFactor = (outerRadius - minInnerRadius) / Math.max(1, (ringCount - 1) * decrement);
    }

    shown.forEach((entry, idx) => {
        const radius = outerRadius - idx * Math.max(1, Math.floor(decrement * adjustFactor));
        if (radius <= 0) return;
        // sweep-flag 1 draws the top semicircle, left to right.
        const arcPath = `M ${cx - radius} ${baseY} A ${radius} ${radius} 0 0 1 ${cx + radius} ${baseY}`;
        const prog = entry.total === 0 ? 0 : entry.completed / entry.total;
        const color = courseRingColor(entry.courseId, idx);

        let track = svg.querySelector(`path[data-idx='${idx}'][data-role='bg']`);
        if (!track) {
            track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            track.setAttribute('data-idx', String(idx));
            track.setAttribute('data-role', 'bg');
            track.setAttribute('fill', 'none');
            track.setAttribute('stroke-linecap', 'round');
            svg.appendChild(track);
        }
        track.setAttribute('d', arcPath);
        track.setAttribute('stroke', color);
        track.setAttribute('stroke-opacity', '0.25');
        track.setAttribute('stroke-width', String(stroke));
        track.removeAttribute('stroke-dasharray');
        track.removeAttribute('stroke-dashoffset');

        // Completed portion from the left, via pathLength=100.
        let progArc = svg.querySelector(`path[data-idx='${idx}'][data-role='fg']`);
        const targetOff = (100 * (1 - prog)).toFixed(3);
        if (!progArc) {
            progArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            progArc.setAttribute('data-idx', String(idx));
            progArc.setAttribute('data-role', 'fg');
            progArc.setAttribute('fill', 'none');
            progArc.setAttribute('stroke-linecap', 'round');
            progArc.setAttribute('pathLength', '100');
            progArc.setAttribute('stroke-dasharray', '100 100');
            progArc.setAttribute('stroke-dashoffset', '100'); // start empty
            progArc.style.transition = 'stroke-dashoffset .8s cubic-bezier(.2,.9,.2,1), opacity .3s ease';
            svg.appendChild(progArc);
        }
        progArc.setAttribute('d', arcPath);
        progArc.setAttribute('stroke', color);
        progArc.setAttribute('stroke-width', String(stroke));
        progArc.setAttribute('stroke-dasharray', '100 100');
        const dim = progressFilterDim(entry.courseId);
        track.style.transition = 'opacity .3s ease';
        track.style.opacity = dim ? '0.25' : '';
        progArc.style.opacity = dim ? '0.3' : '';
        requestAnimationFrame(() => requestAnimationFrame(() => progArc.setAttribute('stroke-dashoffset', targetOff)));
        let hit = svg.querySelector(`path[data-idx='${idx}'][data-role='hit']`);
        if (!hit) {
            hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hit.setAttribute('data-idx', String(idx));
            hit.setAttribute('data-role', 'hit');
            hit.setAttribute('fill', 'none');
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-linecap', 'round');
            hit.setAttribute('pointer-events', 'stroke');
            svg.appendChild(hit);
        }
        hit.setAttribute('d', arcPath);
        hit.setAttribute('stroke-width', String(stroke + 6));
        attachProgressFilterClick(hit, entry.courseId);
        hit.onmouseenter = () => { track.style.opacity = '0.8'; progArc.style.opacity = '0.8'; };
        hit.onmouseleave = () => {
            const d = progressFilterDim(entry.courseId);
            track.style.opacity = d ? '0.25' : '';
            progArc.style.opacity = d ? '0.3' : '';
        };
    });

    const maxIdx = shown.length - 1;
    svg.querySelectorAll('path').forEach(p => {
        const idx = parseInt(p.getAttribute('data-idx'));
        if (Number.isNaN(idx) || idx > maxIdx) p.remove();
    });

    // Text sits in the empty bowl inside the innermost arc, near the bottom.
    const step = Math.max(1, Math.floor(decrement * adjustFactor));
    const innerRadius = ringCount > 0 ? Math.max(1, outerRadius - (ringCount - 1) * step) : outerRadius;
    const holeCenterY = baseY - (4 * innerRadius) / (3 * Math.PI) + 6;
    const nudge = Math.round(holeCenterY - svgHeight / 2);
    let overlay = wrapper.querySelector('.canvasrefined-progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'canvasrefined-progress-overlay';
        overlay.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;transform:translateY(${nudge}px);`;
        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'text-align:center;color:var(--bctext-0);';
        textWrap.innerHTML = `<div class='canvasrefined-progress-percent' style='font-weight:700;font-size:20px;line-height:1;'></div><div class='canvasrefined-progress-count' style='font-size:12px;margin-top:3px;'></div>`;
        overlay.appendChild(textWrap);
        wrapper.appendChild(overlay);
    } else {
        overlay.style.transform = `translateY(${nudge}px)`;
    }
    overlay.querySelector('.canvasrefined-progress-percent').textContent = `${percent}%`;
    overlay.querySelector('.canvasrefined-progress-count').textContent = (chrome.i18n.getMessage("progress_done") || "{{DONE}}/{{TOTAL}} done").replace("{{DONE}}", completedAll).replace("{{TOTAL}}", totalAll);

    const bowlRadius = Math.max(0, innerRadius - stroke / 2 - 2);
    fitProgressOverlayText(overlay, (hw, hh) => {
        const dv = Math.max(
            Math.abs(baseY - holeCenterY + hh),
            Math.abs(baseY - holeCenterY - hh)
        );
        return Math.hypot(hw, dv);
    }, bowlRadius);
}

// Mode "lines": one horizontal bar per course, each with its own %.
function renderProgressLines(wrapper, shown) {
    let list = wrapper.querySelector('.canvasrefined-progress-lines');
    if (!list) {
        list = document.createElement('div');
        list.className = 'canvasrefined-progress-lines';
        list.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;';
        wrapper.appendChild(list);
    }
    while (list.children.length > shown.length) list.lastChild.remove();

    shown.forEach((entry, idx) => {
        const prog = entry.total === 0 ? 0 : entry.completed / entry.total;
        const pct = Math.round(prog * 100);
        const color = courseRingColor(entry.courseId, idx);

        let row = list.children[idx];
        if (!row) {
            row = document.createElement('div');
            row.className = 'canvasrefined-progress-line';
            row.style.cssText = 'display:flex;flex-direction:column;gap:3px;width:100%;';
            row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;"><span class="cr-pl-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;"></span><span class="cr-pl-pct" style="flex-shrink:0;font-weight:600;color:var(--bctext-0);"></span></div><div style="position:relative;height:8px;border-radius:999px;overflow:hidden;"><div class="cr-pl-fill" style="height:100%;border-radius:999px;width:0%;transition:width .8s cubic-bezier(.2,.9,.2,1);"></div></div>`;
            list.appendChild(row);
        }
        const labelEl = row.querySelector('.cr-pl-label');
        labelEl.textContent = courseRingLabel(entry.courseId);
        labelEl.style.color = color;
        row.querySelector('.cr-pl-pct').textContent = (chrome.i18n.getMessage("progress_pct") || "{{PCT}}% ({{DONE}}/{{TOTAL}})").replace("{{PCT}}", pct).replace("{{DONE}}", entry.completed).replace("{{TOTAL}}", entry.total);
        const track = row.children[1];
        track.style.background = `color-mix(in srgb, ${color} 25%, transparent)`;
        const fill = row.querySelector('.cr-pl-fill');
        fill.style.background = color;
        if (!fill.dataset.init) {
            fill.dataset.init = '1';
            requestAnimationFrame(() => requestAnimationFrame(() => fill.style.width = `${pct}%`));
        } else {
            fill.style.width = `${pct}%`;
        }
        row.style.transition = 'opacity .3s ease';
        row.style.opacity = progressFilterDim(entry.courseId) ? '0.4' : '';
        attachProgressFilterClick(row, entry.courseId);
        row.onmouseenter = () => { row.style.opacity = '0.8'; };
        row.onmouseleave = () => { row.style.opacity = progressFilterDim(entry.courseId) ? '0.4' : ''; };
    });
}

// Mode "line": completed portions packed left in full color, remaining portions right in faded color.
function renderProgressOneLine(wrapper, shown, totalAll, completedAll, percent) {
    let box = wrapper.querySelector('.canvasrefined-progress-oneline');
    if (!box) {
        box = document.createElement('div');
        box.className = 'canvasrefined-progress-oneline';
        box.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:100%;box-sizing:border-box;';
        wrapper.appendChild(box);
    }

    let head = box.querySelector('.cr-ol-head');
    if (!head) {
        head = document.createElement('div');
        head.className = 'cr-ol-head';
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--bctext-0);';
        head.innerHTML = `<span>Overall</span><span class="cr-ol-pct" style="font-weight:700;"></span>`;
        box.appendChild(head);
    }
    box.querySelector('.cr-ol-pct').textContent = (chrome.i18n.getMessage("progress_pct") || "{{PCT}}% ({{DONE}}/{{TOTAL}})").replace("{{PCT}}", percent).replace("{{DONE}}", completedAll).replace("{{TOTAL}}", totalAll);
    if (getCurrentCourseId() == null) {
        head.style.cursor = betterTodoProgressFilter != null ? 'pointer' : '';
        head.onclick = () => {
            if (betterTodoProgressFilter == null) return;
            betterTodoProgressFilter = null;
            const loc = document.querySelector("#canvasrefined-todo-list");
            if (loc) { clearTodoList(); createTodoSections(loc); }
        };
    } else {
        head.style.cursor = '';
        head.onclick = null;
    }

    let bar = box.querySelector('.cr-ol-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'cr-ol-bar';
        bar.style.cssText = 'position:relative;width:100%;height:14px;border-radius:999px;overflow:hidden;background:var(--bcbackground-1);';
        box.appendChild(bar);
    }

    // Completed segments first (left), then remaining (right); no gaps.
    const segs = [];
    let left = 0;
    shown.forEach((entry, idx) => {
        const color = courseRingColor(entry.courseId, idx);
        const doneW = totalAll === 0 ? 0 : (entry.completed / totalAll) * 100;
        if (doneW > 0) { segs.push({ left, w: doneW, bg: color, courseId: entry.courseId }); left += doneW; }              // completed: full color
    });
    shown.forEach((entry, idx) => {
        const color = courseRingColor(entry.courseId, idx);
        const remW = totalAll === 0 ? 0 : ((entry.total - entry.completed) / totalAll) * 100;
        if (remW > 0) { segs.push({ left, w: remW, bg: `color-mix(in srgb, ${color} 25%, transparent)`, courseId: entry.courseId }); left += remW; } // remaining: faded
    });

    while (bar.children.length > segs.length) bar.lastChild.remove();

    segs.forEach((seg, idx) => {
        let el = bar.children[idx];
        if (!el) {
            el = document.createElement('div');
            el.className = 'cr-ol-seg';
            el.style.cssText = 'position:absolute;top:0;height:100%;transition:left .6s ease,width .6s ease,background .3s ease,opacity .3s ease;';
            bar.appendChild(el);
        }
        el.style.left = `${seg.left}%`;
        el.style.width = `${seg.w}%`;
        el.style.background = seg.bg;
        el.style.opacity = progressFilterDim(seg.courseId) ? '0.35' : '';
        attachProgressFilterClick(el, seg.courseId);
        el.onmouseenter = () => { el.style.opacity = '0.8'; };
        el.onmouseleave = () => { el.style.opacity = progressFilterDim(seg.courseId) ? '0.35' : ''; };
    });
}


function renderProgressRings(container, scopedData) {
    const mode = getProgressRingMode();
    if (mode === "none") { container.innerHTML = ""; return; }

    // Same timeframe window the list pages through; overdue work always counts, finished
    // work from before the window does not.
    const taskItems = scopedData.filter(item => isTodoTaskType(item));
    const bounds = getTodoTimeframeBounds();
    const isDone = (item) => (item.submissions?.submitted || item.planner_override?.marked_complete === true) && !isPinnedIncomplete(item);
    let allAssignments;
    if (!bounds) {
        allAssignments = taskItems;
    } else {
        allAssignments = taskItems.filter(item => {
            if (!isDone(item) && isTodoOverdueItem(item)) return true;
            const t = new Date(item.plannable_date).getTime();
            return t > bounds.start && t <= bounds.end;
        });
    }

    const groups = {};
    allAssignments.forEach(item => {
        const cid = String(item.course_id || item.context_id || item.plannable?.course_id || "personal");
        groups[cid] = groups[cid] || [];
        groups[cid].push(item);
    });

    const entries = Object.keys(groups).map(cid => {
        const arr = groups[cid];
        const completed = arr.filter(it => (it.submissions?.submitted || it.planner_override?.marked_complete) && !isPinnedIncomplete(it)).length;
        return { courseId: cid, total: arr.length, completed };
    }).filter(e => e.total > 0);

    if (!entries.length) {
        // Quiet empty state instead of blanking the display.
        container.innerHTML = "";
        const empty = document.createElement('div');
        empty.className = 'canvasrefined-progress-empty';
        empty.style.cssText = 'color:var(--bctext-0);opacity:.7;font-size:12px;padding:6px 0;text-align:center;';
        empty.textContent = bounds ? (chrome.i18n.getMessage("no_tasks") || 'No tasks in this timeframe') : (chrome.i18n.getMessage("no_tasks_yet") || 'No tasks yet');
        container.appendChild(empty);
        return;
    }

    // Order by dashboard card order; others sort after, most assignments first.
    const dashboardOrder = getDashboardCourseOrder();
    entries.sort((a, b) => {
        const ai = dashboardOrder.has(a.courseId) ? dashboardOrder.get(a.courseId) : Infinity;
        const bi = dashboardOrder.has(b.courseId) ? dashboardOrder.get(b.courseId) : Infinity;
        if (ai !== bi) return ai - bi;
        return b.total - a.total;
    });
    const shown = entries.slice(0, 6);

    // Fake progress display: report the chosen completed/total, redistributed across courses.
    if (options.hide_personal_details === true && options.anon_progress_enabled === true && shown.length > 0) {
        applyAnonProgressOverride(shown);
    }

    const totalAll = shown.reduce((s, e) => s + e.total, 0);
    const completedAll = shown.reduce((s, e) => s + e.completed, 0);
    const percent = totalAll === 0 ? 0 : Math.round((completedAll / totalAll) * 100);

    let wrapper = container.querySelector('.canvasrefined-progress-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'canvasrefined-progress-wrapper';
        wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;position:relative;width:100%;box-sizing:border-box;';
        container.appendChild(wrapper);
    }
    if (wrapper.dataset.mode !== mode) {
        wrapper.innerHTML = '';
        wrapper.dataset.mode = mode;
    }

    if (mode === "rings") {
        renderProgressRingsMode(wrapper, shown, totalAll, completedAll, percent);
    } else if (mode === "rainbow") {
        renderProgressRainbow(wrapper, shown, totalAll, completedAll, percent);
    } else if (mode === "lines") {
        renderProgressLines(wrapper, shown);
    } else if (mode === "line") {
        renderProgressOneLine(wrapper, shown, totalAll, completedAll, percent);
    }
}

function buildPlannerNotePayload(form) {
    const title = form.querySelector("#better-todo-new-task-title")?.value?.trim();
    const details = form.querySelector("#better-todo-new-task-details")?.value?.trim();
    const courseIdRaw = form.querySelector("#better-todo-new-task-course")?.value;
    const dateValue = form.querySelector("#better-todo-new-task-date")?.value;
    const timeValue = form.querySelector("#better-todo-new-task-time")?.value;
    const link = form.querySelector("#better-todo-new-task-link")?.value?.trim() || "";

    if (!title) {
        throw new Error(getMsg("task_title_required", "Task title is required."));
    }

    if (!dateValue || !timeValue) {
        throw new Error(getMsg("task_date_time_required", "Please choose both a date and time."));
    }

    const localDateTime = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(localDateTime.getTime())) {
        throw new Error(getMsg("task_date_invalid", "Invalid task date."));
    }

    return {
        title,
        details,
        link,
        courseId: courseIdRaw ? parseInt(courseIdRaw) : null,
        // Canvas prefers local timestamp strings over UTC ISO for planner notes.
        todoDate: `${dateValue}T${timeValue}:00`,
    };
}

async function createCanvasPlannerNote(payload) {
    const csrfToken = CSRFtoken();
    const plannerNote = {
        title: payload.title,
        todo_date: payload.todoDate,
    };
    if (payload.details) plannerNote.details = payload.details;
    if (payload.courseId) plannerNote.course_id = payload.courseId;

    const attempts = [
        {
            headers: {
                "content-type": "application/json",
                "accept": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify({ planner_note: plannerNote }),
        },
        {
            headers: {
                "content-type": "application/json",
                "accept": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify(plannerNote),
        },
        {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "accept": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: (() => {
                const formBody = new URLSearchParams();
                formBody.set("planner_note[title]", plannerNote.title);
                formBody.set("planner_note[todo_date]", plannerNote.todo_date);
                if (plannerNote.details) formBody.set("planner_note[details]", plannerNote.details);
                if (plannerNote.course_id) formBody.set("planner_note[course_id]", plannerNote.course_id);
                return formBody.toString();
            })(),
        },
    ];

    let lastError = getMsg("canvas_rejected_create", "Canvas rejected task creation.");
    for (const attempt of attempts) {
        const response = await pageFetch(domain + "/api/v1/planner_notes", {
            method: "POST",
            headers: attempt.headers,
            body: attempt.body,
        });

        if (response.status === 200 || response.status === 201) {
            return response.json();
        }

        try {
            const errData = await response.json();
            if (errData?.errors?.length) {
                lastError = errData.errors.join(" ");
            } else if (errData?.message) {
                lastError = errData.message;
            }
        } catch (_) {
        }
    }

    throw new Error(lastError || getMsg("canvas_rejected_create", "Canvas rejected task creation."));
}

/* Custom task links: Canvas planner notes have no link field, so store a
   user link in sync storage keyed by the note id. */
function getCustomTaskLinks() {
    return (options && options.custom_task_links) || {};
}

function getCustomTaskLinkId(item) {
    return item?.plannable_id ?? item?.plannable?.id ?? null;
}

function normalizeTaskLink(link) {
    if (!link) return "";
    link = String(link).trim();
    if (!link) return "";
    if (/^https?:\/\//i.test(link)) return link;
    if (link.startsWith("//")) return "https:" + link;
    return domain + (link.startsWith("/") ? link : "/" + link);
}

function customTaskHref(item) {
    const id = getCustomTaskLinkId(item);
    const links = getCustomTaskLinks();
    if (id != null && links[String(id)]) {
        return normalizeTaskLink(links[String(id)]);
    }
    const courseId = item?.course_id || item?.plannable?.course_id || item?.context_id;
    if (courseId) return `${domain}/courses/${courseId}`;
    return `${domain}/`;
}

function saveCustomTaskLink(noteId, link) {
    if (noteId == null) return;
    const links = { ...getCustomTaskLinks() };
    const key = String(noteId);
    if (link && String(link).trim()) {
        links[key] = String(link).trim();
    } else {
        delete links[key];
    }
    options = { ...options, custom_task_links: links };
    chrome.storage.sync.set({ custom_task_links: links });
}

function deleteCustomTaskLink(noteId) {
    if (noteId == null) return;
    const links = { ...getCustomTaskLinks() };
    delete links[String(noteId)];
    options = { ...options, custom_task_links: links };
    chrome.storage.sync.set({ custom_task_links: links });
}

async function updateCanvasPlannerNote(id, payload) {
    if (!id) throw new Error(getMsg("missing_task_id", "Missing task id."));
    const csrfToken = CSRFtoken();
    // FLAT params only: nested under planner_note they are silently ignored and the note
    // comes back unchanged. details is always sent (even empty) so it can be cleared.
    const plannerNote = {
        title: payload.title,
        todo_date: payload.todoDate,
        details: payload.details || "",
        // Empty course_id disassociates the note from its course.
        course_id: payload.courseId || "",
    };

    const attempts = [
        {
            headers: {
                "content-type": "application/json",
                "accept": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: JSON.stringify(plannerNote),
        },
        {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "accept": "application/json",
                "X-CSRF-Token": csrfToken,
            },
            body: (() => {
                const formBody = new URLSearchParams();
                formBody.set("title", plannerNote.title);
                formBody.set("todo_date", plannerNote.todo_date);
                formBody.set("details", plannerNote.details);
                formBody.set("course_id", plannerNote.course_id);
                return formBody.toString();
            })(),
        },
    ];

    let lastError = getMsg("canvas_rejected_update", "Canvas rejected task update.");
    for (const attempt of attempts) {
        const response = await pageFetch(`${domain}/api/v1/planner_notes/${id}`, {
            method: "PUT",
            headers: attempt.headers,
            body: attempt.body,
        });

        if (response.status === 200 || response.status === 201) {
            return response.json();
        }

        try {
            const errData = await response.json();
            if (errData?.errors?.length) {
                lastError = errData.errors.join(" ");
            } else if (errData?.message) {
                lastError = errData.message;
            }
        } catch (_) {
        }
    }

    throw new Error(lastError || getMsg("canvas_rejected_update", "Canvas rejected task update."));
}

async function deleteCanvasPlannerNote(id) {
    if (!id) throw new Error(getMsg("missing_task_id", "Missing task id."));
    const csrfToken = CSRFtoken();
    const response = await pageFetch(`${domain}/api/v1/planner_notes/${id}`, {
        method: "DELETE",
        headers: {
            "content-type": "application/json",
            "accept": "application/json",
            "X-CSRF-Token": csrfToken,
        },
    });

    if (response.status === 200 || response.status === 201 || response.status === 204) {
        return true;
    }

    let lastError = getMsg("canvas_rejected_delete", "Canvas rejected task deletion.");
    try {
        const errData = await response.json();
        if (errData?.errors?.length) lastError = errData.errors.join(" ");
        else if (errData?.message) lastError = errData.message;
    } catch (_) { /* ignore */ }
    throw new Error(lastError);
}

/* Scroll a field into view, leaving room below for the native date/time picker. */
function scrollTodoIntoView(el, smooth = true) {
    if (!el) return;
    const sidebar = document.getElementById("right-side-wrapper");
    const style = sidebar ? getComputedStyle(sidebar) : null;
    const scrollsSidebar = sidebar &&
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        sidebar.scrollHeight > sidebar.clientHeight;
    const behavior = smooth ? "smooth" : "auto";
    if (scrollsSidebar) {
        const rect = el.getBoundingClientRect();
        const sRect = sidebar.getBoundingClientRect();
        const elTop = rect.top - sRect.top + sidebar.scrollTop;
        // Keep the element near the top so the picker below it stays on screen.
        const target = elTop - (sidebar.clientHeight - rect.height) * 0.3;
        sidebar.scrollTo({ top: Math.max(0, target), behavior });
    } else {
        el.scrollIntoView({ block: "center", behavior });
    }
}

function fillTaskCourseOptions(courseSelect) {
    const cards = options.custom_cards || {};
    const courseColors = options.custom_cards_3 || {};
    const currentCourseId = getCurrentCourseId();
    const entries = Object.entries(cards)
        .filter(([, card]) => card?.hidden !== true)
        .map(([id, card]) => ({
            id,
            label: card?.default || `Course ${id}`,
            color:
                courseColors?.[String(id)]?.color ??
                courseColors?.[id]?.color ??
                "#c7cdd1",
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    courseSelect.innerHTML = '<option value="">' + (chrome.i18n.getMessage("personal_task_label") || chrome.i18n.getMessage("personal_task") || "Personal task") + '</option>';
    courseSelect.options[0].dataset.color = "#c7cdd1";
    entries.forEach(entry => {
        const option = makeElement("option", courseSelect, {
            value: entry.id,
            textContent: entry.label,
        });
        option.dataset.color = entry.color;
        option.style.color = entry.color;
        if (currentCourseId && String(currentCourseId) === String(entry.id)) {
            option.selected = true;
        }
    });
}

function updateTaskCourseSelectColor(courseSelect) {
    const selectedOption = courseSelect?.options?.[courseSelect.selectedIndex];
    const color = selectedOption?.dataset?.color || "#c7cdd1";
    courseSelect.style.borderLeft = `4px solid ${color}`;
    courseSelect.style.paddingLeft = "8px";
}

function ensureTodoTaskMenu(location, feedbackElement) {
    let actionsRow = location.querySelector("#better-todo-actions-row");

    if (!actionsRow) {
        actionsRow = makeElement("div", location, {
            id: "better-todo-actions-row",
            style: "display:flex;flex-direction:column;gap:8px;margin-top:14px;",
        });

        const addTaskButton = makeElement("button", actionsRow, {
            id: "better-todo-add-task-btn",
            className: "canvasrefined-custom-btn",
            textContent: chrome.i18n.getMessage("add_task") || "+ Add Task",
            style: "width:100%;padding:6px 8px;cursor:pointer;",
        });

        const menu = makeElement("div", actionsRow, {
            id: "better-todo-add-task-menu",
            className: "canvasrefined-add-assignment",
        });

        menu.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid #c7cdd1;border-radius:6px;background:var(--bcbackground-2);position:relative;">
                <button id="better-todo-add-task-close" type="button" class="canvasrefined-custom-btn" title="${chrome.i18n.getMessage("todo_close_title") || "Close"}" style="position:absolute;top:4px;right:6px;padding:0 6px;cursor:pointer;line-height:18px;font-size:14px;color:var(--bctext-1);">\u00d7</button>
                <input type="text" id="better-todo-new-task-title" class="canvasrefined-custom-input" placeholder="${chrome.i18n.getMessage("todo_task_title") || "Task title"}" maxlength="255">
                <textarea id="better-todo-new-task-details" class="canvasrefined-custom-input" placeholder="${chrome.i18n.getMessage("todo_task_details") || "Details (optional)"}" style="min-height:70px;resize:vertical;padding-top:6px;padding-bottom:6px;"></textarea>
                <select id="better-todo-new-task-course" class="canvasrefined-custom-input"></select>
                <div style="display:flex;gap:6px;">
                    <input type="date" id="better-todo-new-task-date" class="canvasrefined-custom-input">
                    <input type="time" id="better-todo-new-task-time" class="canvasrefined-custom-input">
                </div>
                <input type="text" id="better-todo-new-task-link" class="canvasrefined-custom-input" placeholder="${chrome.i18n.getMessage("todo_task_link") || "Link (optional)"}" maxlength="2048">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span id="better-todo-add-task-status" style="font-size:12px;color:var(--bctext-0);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button id="better-todo-add-task-delete" class="canvasrefined-custom-btn" style="padding:4px 10px;cursor:pointer;display:none;color:#db3754;" type="button" title="${chrome.i18n.getMessage("todo_delete_title") || "Delete this custom task"}">${chrome.i18n.getMessage("todo_delete") || "Delete"}</button>
                        <button id="better-todo-add-task-submit" class="canvasrefined-custom-btn" style="padding:4px 10px;cursor:pointer;" type="button">Create</button>
                    </div>
                </div>
            </div>
        `;

        const today = new Date();
        menu.querySelector("#better-todo-new-task-date").value = formatDateForInput(today);
        menu.querySelector("#better-todo-new-task-time").value = formatTimeForInput(today);
        const courseSelect = menu.querySelector("#better-todo-new-task-course");
        fillTaskCourseOptions(courseSelect);
        updateTaskCourseSelectColor(courseSelect);
        courseSelect.addEventListener("change", () => updateTaskCourseSelectColor(courseSelect));

        addTaskButton.addEventListener("click", () => {
            const willOpen = !menu.classList.contains("canvasrefined-custom-open");
            menu.classList.toggle("canvasrefined-custom-open");
            if (willOpen) {
                resetTaskFormToCreate(menu);
                // Scroll the form up so the picker stays on screen.
                scrollTodoIntoView(menu, true);
            }
        });

        const submitTask = async () => {
            const status = menu.querySelector("#better-todo-add-task-status");
            const submitButton = menu.querySelector("#better-todo-add-task-submit");
            const deleteButton = menu.querySelector("#better-todo-add-task-delete");
            status.textContent = "";
            submitButton.disabled = true;
            if (deleteButton) deleteButton.disabled = true;

            try {
                const payload = buildPlannerNotePayload(menu);
                const editingId = menu.dataset.editingId || null;
                if (editingId) {
                    await updateCanvasPlannerNote(editingId, payload);
                    saveCustomTaskLink(editingId, payload.link);
                    status.textContent = chrome.i18n.getMessage("task_updated") || "Task updated.";
                } else {
                    const created = await createCanvasPlannerNote(payload);
                    const newId = created?.id;
                    if (newId != null) saveCustomTaskLink(newId, payload.link);
                    status.textContent = chrome.i18n.getMessage("task_created") || "Task created.";
                }
                status.style.color = "#198754";
                resetTaskFormToCreate(menu);
                menu.classList.remove("canvasrefined-custom-open");

                getAssignments();
                clearTodoList();
                createTodoSections(location);
            } catch (e) {
                status.textContent = e?.message || chrome.i18n.getMessage("could_not_save") || "Could not save task.";
                status.style.color = "#db3754";
            } finally {
                submitButton.disabled = false;
                if (deleteButton) deleteButton.disabled = false;
            }
        };

        menu.querySelector("#better-todo-add-task-submit").addEventListener("click", submitTask);

        menu.querySelector("#better-todo-add-task-close")?.addEventListener("click", () => {
            resetTaskFormToCreate(menu);
            menu.classList.remove("canvasrefined-custom-open");
        });

        // Reposition on focus so the picker opens on screen.
        ["#better-todo-new-task-date", "#better-todo-new-task-time"].forEach((sel) => {
            const input = menu.querySelector(sel);
            input?.addEventListener("focus", () => scrollTodoIntoView(input, false));
        });

        menu.querySelector("#better-todo-add-task-delete").addEventListener("click", async () => {
            const editingId = menu.dataset.editingId || null;
            if (!editingId) return;
            if (!confirm(chrome.i18n.getMessage("todo_delete_confirm") || "Delete this custom task? This cannot be undone.")) return;
            const status = menu.querySelector("#better-todo-add-task-status");
            const submitButton = menu.querySelector("#better-todo-add-task-submit");
            const deleteButton = menu.querySelector("#better-todo-add-task-delete");
            status.textContent = "";
            submitButton.disabled = true;
            deleteButton.disabled = true;
            try {
                await deleteCanvasPlannerNote(editingId);
                deleteCustomTaskLink(editingId);
                resetTaskFormToCreate(menu);
                menu.classList.remove("canvasrefined-custom-open");
                getAssignments();
                clearTodoList();
                createTodoSections(location);
            } catch (e) {
                status.textContent = e?.message || chrome.i18n.getMessage("could_not_delete") || "Could not delete task.";
                status.style.color = "#db3754";
            } finally {
                submitButton.disabled = false;
                deleteButton.disabled = false;
            }
        });
    }

    if (feedbackElement) {
        if (actionsRow.nextSibling !== feedbackElement) {
            location.insertBefore(actionsRow, feedbackElement);
        }
    } else if (actionsRow.parentElement !== location) {
        location.append(actionsRow);
    }
}

function resetTaskFormToCreate(menu) {
    if (!menu) return;
    menu.querySelector("#better-todo-new-task-title").value = "";
    menu.querySelector("#better-todo-new-task-details").value = "";
    menu.querySelector("#better-todo-new-task-link").value = "";
    const courseSelect = menu.querySelector("#better-todo-new-task-course");
    if (courseSelect) {
        fillTaskCourseOptions(courseSelect);
        updateTaskCourseSelectColor(courseSelect);
    }
    const now = new Date();
    menu.querySelector("#better-todo-new-task-date").value = formatDateForInput(now);
    menu.querySelector("#better-todo-new-task-time").value = formatTimeForInput(now);
    const status = menu.querySelector("#better-todo-add-task-status");
    if (status) { status.textContent = ""; status.style.color = ""; }
    const del = menu.querySelector("#better-todo-add-task-delete");
    if (del) del.style.display = "none";
    const submit = menu.querySelector("#better-todo-add-task-submit");
    if (submit) submit.textContent = chrome.i18n.getMessage("create") || "Create";
    delete menu.dataset.editingId;
}

function openTaskForEdit(item) {
    const location = document.getElementById("canvasrefined-todo-list");
    if (!location) return;
    const feedbackElement = location.querySelector(".recent_feedback");
    ensureTodoTaskMenu(location, feedbackElement);
    const menu = document.getElementById("better-todo-add-task-menu");
    if (!menu) return;

    const noteId = getCustomTaskLinkId(item);
    menu.querySelector("#better-todo-new-task-title").value = item?.plannable?.title || "";
    menu.querySelector("#better-todo-new-task-details").value = item?.plannable?.details || "";
    const courseSelect = menu.querySelector("#better-todo-new-task-course");
    const cid = item?.course_id || item?.plannable?.course_id || "";
    if (courseSelect) courseSelect.value = cid ? String(cid) : "";
    updateTaskCourseSelectColor(courseSelect);

    const dateObj = new Date(item?.plannable_date || item?.plannable?.todo_date || Date.now());
    if (!Number.isNaN(dateObj.getTime())) {
        menu.querySelector("#better-todo-new-task-date").value = formatDateForInput(dateObj);
        menu.querySelector("#better-todo-new-task-time").value = formatTimeForInput(dateObj);
    }
    const links = getCustomTaskLinks();
    menu.querySelector("#better-todo-new-task-link").value = (noteId != null && links[String(noteId)]) || "";

    menu.dataset.editingId = noteId != null ? String(noteId) : "";
    const del = menu.querySelector("#better-todo-add-task-delete");
    if (del) del.style.display = "";
    menu.querySelector("#better-todo-add-task-submit").textContent = chrome.i18n.getMessage("save") || "Save";
    const status = menu.querySelector("#better-todo-add-task-status");
    if (status) { status.textContent = ""; status.style.color = ""; }
    menu.classList.add("canvasrefined-custom-open");
    scrollTodoIntoView(menu, true);
}

function dueGroupLabel(key) {
    const known = { "New": "group_new", "Seen": "group_seen", "Ungraded": "group_ungraded", "Graded": "group_graded" };
    return known[key] ? getMsg(known[key], key) : key;
}

async function createTodoSections(location) {
	if (!location || !assignments || typeof assignments.then !== "function") return;
	// Render-generation guard: capture the counter at call time and bail if a newer render started.
	const renderGen = ++todoRenderGen;
	if (!location.querySelector("#better-todo-header")) {
		let header = makeElement("div", location, { id: "better-todo-header" });
		header.style = "display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bcbackground-1);padding-bottom:-2px;";
		let today = new Date();
		today.setHours(0,0,0,0);
		const todayString = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        header.innerHTML = `
                <h2 style="border:none !important;padding: 0">${chrome.i18n.getMessage("tasks_header") || "Tasks"}</h2>
                <h2 style="border:none !important;padding: 0">${todayString}</h2>
            `;

        // Timeframe pager: arrows (or arrow keys while hovering) page the timeframe window.
        const timeframeNav = makeElement("div", location, { id: "better-todo-timeframe-nav" });
        timeframeNav.style = "display:none;align-items:center;justify-content:center;width:100%;margin-top:8px;user-select:none;";
        timeframeNav.innerHTML = `
            <button id="better-todo-timeframe-prev" type="button" title="${chrome.i18n.getMessage("timeframe_prev") || "Previous timeframe"}" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:50%;background:transparent;cursor:pointer;transition:all .2s ease;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 6L9 12L15 18" stroke="var(--bctext-0)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <span id="better-todo-timeframe-label" style="font-size:12px;color:var(--bctext-0);white-space:nowrap;"></span>
            <button id="better-todo-timeframe-next" type="button" title="${chrome.i18n.getMessage("timeframe_next") || "Look ahead to the next timeframe"}" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:50%;background:transparent;cursor:pointer;transition:all .2s ease;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 6L15 12L9 18" stroke="var(--bctext-0)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;
        const changeTimeframeOffset = (delta) => {
            const tf = getTodoTimeframeKey();
            if (tf === "all") return;
            const nextOffset = Math.max(0, betterTodoTimeframeOffset + delta);
            if (nextOffset === betterTodoTimeframeOffset) return;
            betterTodoTimeframeOffset = nextOffset;
            moreAnnouncementCount = 0;
            moreAssignmentCount = 0;
            moreCompletedCount = 0;
            clearTodoList();
            createTodoSections(location);
        };
        timeframeNav.querySelector("#better-todo-timeframe-prev").addEventListener("click", () => changeTimeframeOffset(-1));
        timeframeNav.querySelector("#better-todo-timeframe-next").addEventListener("click", () => changeTimeframeOffset(1));
        // Arrow keys page only while the pager is hovered.
        const timeframeKeyHandler = (e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); changeTimeframeOffset(1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); changeTimeframeOffset(-1); }
        };
        timeframeNav.addEventListener("mouseenter", () => document.addEventListener("keydown", timeframeKeyHandler));
        timeframeNav.addEventListener("mouseleave", () => document.removeEventListener("keydown", timeframeKeyHandler));

        makeElement("div", location, { id: "better-todo-progress-placeholder", style: "display:flex;justify-content:center;margin-top:8px;" });

		let filterControl = makeElement("div", location, { "id": "better-todo-filter" });
		filterControl.innerHTML = `
		<div style="display:flex;justify-content:center;margin-top:20px;">
			<div id="better-todo-filterbuttongroup" style="display:flex;gap:50px;justify-content:space-between;position:relative;padding-bottom:5px;width:70%;height:30px;">
				<div id="better-todo-announcement" style="color:black !important;width:25px;cursor:pointer;">
					<svg fill="var(--bctext-0)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier">
							<path d="M1587.162 31.278c11.52-23.491 37.27-35.689 63.473-29.816 25.525 6.099 43.483 28.8 43.483 55.002V570.46C1822.87 596.662 1920 710.733 1920 847.053c0 136.32-97.13 250.503-225.882 276.705v513.883c0 26.202-17.958 49.016-43.483 55.002a57.279 57.279 0 0 1-12.988 1.468c-21.12 0-40.772-11.745-50.485-31.171C1379.238 1247.203 964.18 1242.347 960 1242.347H564.706v564.706h87.755c-11.859-90.127-17.506-247.003 63.473-350.683 52.405-67.087 129.657-101.082 229.948-101.082v112.941c-64.49 0-110.57 18.861-140.837 57.487-68.781 87.868-45.064 263.83-30.269 324.254 4.18 16.828.34 34.673-10.277 48.34-10.73 13.665-27.219 21.684-44.499 21.684H508.235c-31.171 0-56.47-25.186-56.47-56.47v-621.177h-56.47c-155.747 0-282.354-126.607-282.354-282.353v-56.47h-56.47C25.299 903.523 0 878.336 0 847.052c0-31.172 25.299-56.471 56.47-56.471h56.471v-56.47c0-155.634 126.607-282.354 282.353-282.354h564.593c16.941-.112 420.48-7.002 627.275-420.48Zm-5.986 218.429c-194.71 242.371-452.216 298.164-564.705 311.04v572.724c112.489 12.876 369.995 68.556 564.705 311.04ZM903.53 564.7H395.294c-93.402 0-169.412 76.01-169.412 169.411v225.883c0 93.402 76.01 169.412 169.412 169.412H903.53V564.7Zm790.589 123.444v317.93c65.618-23.379 112.94-85.497 112.94-159.021 0-73.525-47.322-135.53-112.94-158.909Z" fill-rule="evenodd"></path>
						</g>
					</svg>
				</div>
				<div id="better-todo-assignments" style="color:black !important;width:25px;cursor:pointer;">
					<svg fill="var(--bctext-0)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="1"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier">
							<path d="M1468.214 0v551.145L840.27 1179.089c-31.623 31.623-49.693 74.54-49.693 119.715v395.289h395.288c45.176 0 88.093-18.07 119.716-49.694l162.633-162.633v438.206H0V0h1468.214Zm129.428 581.3c22.137-22.136 57.825-22.136 79.962 0l225.879 225.879c22.023 22.023 22.023 57.712 0 79.848l-677.638 677.637c-10.616 10.503-24.96 16.49-39.98 16.49H903.516v-282.35c0-15.02 5.986-29.364 16.49-39.867Zm-920.005 548.095H338.82v112.94h338.818v-112.94Zm225.88-225.879H338.818v112.94h564.697v-112.94Zm734.106-202.5-89.561 89.56 146.03 146.031 89.562-89.56-146.031-146.031Zm-508.228-362.197H338.82v338.818h790.576V338.82Z" fill-rule="evenodd"></path>
						</g>
					</svg>
				</div>
				<div id="better-todo-completed" style="color:black !important;width:25px;cursor:pointer;">
					<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g>
						<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier"> <g id="Interface / Checkbox_Check">
							<path id="Vector" d="M8 12L11 15L16 9M4 16.8002V7.2002C4 6.08009 4 5.51962 4.21799 5.0918C4.40973 4.71547 4.71547 4.40973 5.0918 4.21799C5.51962 4 6.08009 4 7.2002 4H16.8002C17.9203 4 18.4796 4 18.9074 4.21799C19.2837 4.40973 19.5905 4.71547 19.7822 5.0918C20 5.5192 20 6.07899 20 7.19691V16.8036C20 17.9215 20 18.4805 19.7822 18.9079C19.5905 19.2842 19.2837 19.5905 18.9074 19.7822C18.48 20 17.921 20 16.8031 20H7.19691C6.07899 20 5.5192 20 5.0918 19.7822C4.71547 19.5905 4.40973 19.2842 4.21799 18.9079C4 18.4801 4 17.9203 4 16.8002Z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
						</g></g>
					</svg>
				</div>
				<div id="better-todo-indicator" style="position:absolute;bottom:4px;left:0;height:3px;background-color:var(--bctext-0);border-radius:3px 3px 0 0;transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);"></div>
			</div>
		</div>
		`;
		setTimeout(() => updateIndicator(document.getElementById("better-todo-assignments")), 10);

		document.getElementById("better-todo-announcement").addEventListener("click", (e) => {
			betterTodoFilter = "announcements";
			moreAnnouncementCount = 0;
			updateIndicator(e.currentTarget);
			clearTodoList();
			createTodoSections(location);
		});
		document.getElementById("better-todo-assignments").addEventListener("click", (e) => {
			betterTodoFilter = "tasks";
			moreAssignmentCount = 0;
			updateIndicator(e.currentTarget);
			clearTodoList();
			createTodoSections(location);
		});
		document.getElementById("better-todo-completed").addEventListener("click", (e) => {
			betterTodoFilter = "completed";
			moreCompletedCount = 0;
			updateIndicator(e.currentTarget);
			clearTodoList();
			createTodoSections(location);
		});

		let mainSection = makeElement("div", location, {
			id: "better-todo-main",
		});
		mainSection.style = "display:flex;flex-direction:column;";
	}
	let mainSection = location.querySelector("#better-todo-main");
	// Label/arrows depend on the current tab and todo_timeframe, so refresh each render.
	updateTodoTimeframeNav();
	assignments.then(data => {
    // A newer render superseded this one; appending would duplicate the list.
	    if (renderGen !== todoRenderGen) return;
        const courseId = getCurrentCourseId();
        const scopedData = getTodoScopedData(data, courseId);
        // Fake items ride the same scoped pipeline so the list and rings count them.
        if (options.hide_personal_details === true && options.anon_fake_todo === true) {
            scopedData.push(...buildFakeTodoItems());
        }

        // A progress-color filter only applies where multiple classes show.
        if (courseId) betterTodoProgressFilter = null;
        const displayData = (betterTodoProgressFilter == null)
            ? scopedData
            : scopedData.filter(item => {
                const cid = String(item.course_id || item.context_id || item.plannable?.course_id || "personal");
                return cid === String(betterTodoProgressFilter);
            });

        // Dismissed announcements are always hidden, read ones unless todo_hide_read is off,
        // and anything older than TODO_ANNOUNCEMENT_MAX_AGE_DAYS (never-opened ones stay
        // "unread" forever and inflate the badge).
        announcements = displayData.filter(item => {
            if (item.plannable_type != "announcement") return false;
            if (item.planner_override?.marked_complete === true) return false;
            if (options.todo_hide_read !== false && item.plannable.read_state == "read") return false;
            const postedAt = new Date(item.plannable_date).getTime();
            if (!Number.isNaN(postedAt) && postedAt < Date.now() - TODO_ANNOUNCEMENT_MAX_AGE_DAYS * 86400000) return false;
            return true;
        });
        // Show newest first (planner items arrive oldest-first).
        announcements.sort((a, b) => new Date(b.plannable_date) - new Date(a.plannable_date));
        // Pinned ("sent back") items always count as due.
        assignmentsDue = displayData.filter(item => isTodoTaskType(item) && ((!item.submissions?.submitted && !item.planner_override?.marked_complete) || isPinnedIncomplete(item)));
        completed = displayData.filter(item => isTodoTaskType(item) && (item.submissions?.submitted || item.planner_override?.marked_complete) && !isPinnedIncomplete(item));
        // Read the timeframe each render so popup changes apply; overdue and pinned items
        // bypass the window filter so they stay visible.
        const pinnedItems = assignmentsDue.filter(item => isPinnedIncomplete(item));
        assignmentsDue = applyTodoTimeframe(assignmentsDue.filter(item => !isPinnedIncomplete(item)), false).concat(pinnedItems);
        announcements = applyTodoTimeframe(announcements, true);
        completed = applyTodoTimeframe(completed, true);

        if (document.getElementById("better-todo-announcement-badge")) {
            document.getElementById("better-todo-announcement-badge").remove();
        }
        let isAnnoucementBadge = 0;
        announcements.forEach(item => {
            if (item.plannable.read_state == "unread") {
                isAnnoucementBadge++;
                return;
            }
        })
        if (isAnnoucementBadge > 0) {
            makeElement("div", document.getElementById("better-todo-announcement"), {
                id: "better-todo-announcement-badge",
                style: "background-color:#ff0000;width:15px;height:15px;border-radius:50%;font-size:12px;position:absolute;top:-7px;left:16px;display:flex;justify-content:center;align-items:center;", // TODO: theme compatibility
                innerHTML: `<span style="color:white;">${isAnnoucementBadge}</span>`
            })
		}

		domContainers = {};
		const groupKeys = ["-1", "0", "1", "2", "3", "4", "5", "6", "7", "14", "21", "30", "Later", "New", "Seen", "Ungraded", "Graded"];
        for (const key of groupKeys) {
            let wrapper = makeElement("div", mainSection, {
                style: "display:none;margin-top:10px;",
                className: "better-todo-dueheader",
            });
            let label = "";
            if (key == "Later") label = getMsg("due_later", "Due <strong>Later</strong>");
            if (key == "-1") label = getMsg("due_overdue", "<strong>Overdue</strong>");
            else if (key == "0") label = getMsg("due_today", "Due <strong>Today</strong>");
            else if (key == "1") label = getMsg("due_tomorrow", "Due <strong>Tomorrow</strong>");
            else if (key >= 2 && key < 7) label = replaceCountPlaceholder(getMsg("due_days", "Due <strong>{{COUNT}} days</strong>"), key);
            else if (key >= 7 && key < 30) label = replaceCountPlaceholder(getMsg("due_weeks", "Due <strong>{{COUNT}} weeks</strong>"), Math.floor(key / 7));
            else if (key == "30") label = getMsg("due_one_month", "Due <strong>1 month</strong>");
            else label = "<strong>" + dueGroupLabel(key) + "</strong>";
            makeElement("div", wrapper, {
                innerHTML: "<span>" + label + "</span>",
                style: "display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--bctext-0);"
            })

            let listContainer = makeElement("div", wrapper, { className: "todo-group-list" });
            listContainer.style = "display:flex;flex-direction:column;gap:10px;";

            domContainers[key] = { wrapper, listContainer };
        }


        if (betterTodoFilter == "tasks") {
            populateAssignments();
        }
        if (betterTodoFilter == "announcements") {
            populateAnnouncements();
        }
        if (betterTodoFilter == "completed") {
            populateAssignments(true);
        }

        const feedbackElement = location.querySelector(".recent_feedback");

        // populate progress rings placeholder (respect user toggle)
        const progressPlaceholder = document.getElementById("better-todo-progress-placeholder");
        if (progressPlaceholder) {
            if (progressRingsEnabled()) {
                renderProgressRings(progressPlaceholder, scopedData);
            } else {
                progressPlaceholder.innerHTML = "";
            }
        }

        if (betterTodoFilter === "tasks") {
            ensureTodoTaskMenu(location, feedbackElement);
        } else {
            const existing = location.querySelector("#better-todo-actions-row");
            if (existing) existing.remove();
        }

        if (feedbackElement) {
            if (options.todo_hide_feedback == true) {
                feedbackElement.style.display = "none";
            } else {
                feedbackElement.style.display = "block";
            }
        }

        const sidebar = document.getElementById("right-side-wrapper");
        ensureRightSideWrapperScrollbarHidden();
        sidebar.style.setProperty("scrollbar-width", "none");
        sidebar.style.setProperty("-ms-overflow-style", "none");
		const viewportOffset = todoViewportOffsetPx();
		if (options.todo_full_height) {
			sidebar.style.minHeight = viewportOffset > 0 ? `calc(100vh - ${viewportOffset}px)` : "100vh";
		} else {
			sidebar.style.minHeight = "";
		}
		if (options.todo_separate_scrollbar) {
			sidebar.style.position = "sticky";
			sidebar.style.top = "0";
			sidebar.style.height = viewportOffset > 0 ? `calc(100vh - ${viewportOffset}px)` : "100vh";
			sidebar.style.overflowY = "auto";
		} else {
			sidebar.style.position = "";
			sidebar.style.top = "";
			sidebar.style.height = "";
			sidebar.style.overflowY = "";
		}
	}).catch(err => {
		// A rejected promise must not leave the list half-rendered or throw unhandled.
		if (renderGen === todoRenderGen) console.warn("Canvas Refined - todo list render failed", err);
	});
}

// Height the todo sidebar must shed to fit the viewport: the nav-toggle + crumbs bar
// sits above it, so 100vh would force the page to scroll by exactly that height.
function todoViewportOffsetPx() {
	if (options.hide_navbar === true) return 0;
	const crumbs = document.querySelector(".ic-app-nav-toggle-and-crumbs");
	const h = crumbs ? crumbs.offsetHeight : 0;
	return h > 0 ? h : 0;
}

// Navbar height changes with window size/zoom, so re-apply on resize.
let todoHeightResizeTimer = null;
window.addEventListener("resize", () => {
	if (todoHeightResizeTimer) clearTimeout(todoHeightResizeTimer);
	todoHeightResizeTimer = setTimeout(() => {
		const sidebar = document.getElementById("right-side-wrapper");
		if (!sidebar || !document.getElementById("better-todo-main")) return;
		const viewportOffset = todoViewportOffsetPx();
		if (options.todo_full_height) {
			sidebar.style.minHeight = viewportOffset > 0 ? `calc(100vh - ${viewportOffset}px)` : "100vh";
		}
		if (options.todo_separate_scrollbar) {
			sidebar.style.height = viewportOffset > 0 ? `calc(100vh - ${viewportOffset}px)` : "100vh";
		}
	}, 150);
});

function ensureRightSideWrapperScrollbarHidden() {
    let style = document.getElementById("canvasrefined-hide-right-sidebar-scrollbar") || document.createElement("style");
    style.id = "canvasrefined-hide-right-sidebar-scrollbar";
    style.textContent = `
        #right-side-wrapper {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
        }
        #right-side-wrapper::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
        }
    `;
    document.head.append(style);
}

function clearTodoList() {
    const main = document.getElementById("better-todo-main");
    const seeMoreBtn = document.getElementById("better-todo-see-more");
    if (seeMoreBtn) {
        seeMoreBtn.remove();
    }
    // Called from storage-change handlers on every page; bail when no list is mounted.
    if (!main) return;

	main.querySelectorAll(".todo-group-list").forEach(list => {
		list.innerHTML = "";
	});
	document.querySelectorAll(".better-todo-dueheader").forEach(header => {
		header.remove();
	});
}

// "Alternate colors" (light mode only): icon fill goes white for lighter course strips.
const TODO_ALT_ICON_COLOR = "#ffffff";
let todoAltStyleEl = null;
function applyTodoAlternateColors() {
    const altOn = options.todo_alternate_colors === true && options.dark_mode !== true;
    const color = altOn ? TODO_ALT_ICON_COLOR : "var(--bctext-0)";
    if (!todoAltStyleEl) {
        todoAltStyleEl = document.createElement("style");
        todoAltStyleEl.id = "crtodoaltcss";
        document.documentElement.append(todoAltStyleEl);
    }
    todoAltStyleEl.textContent = `:root{--cr-todo-icon:${color};}`;
}

// Hover preview: one shared body-level tooltip so the sidebar's overflow can't clip it.
let todoPreviewDelay = null;
let todoPreviewToken = 0;
const todoPreviewCache = new Map();

function stripHtmlPreview(html) {
    if (!html) return "";
    return String(html).replace(/<\/?[^>]+(>|$)/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function getTodoPreviewEl() {
    let el = document.getElementById("canvasrefined-todo-preview");
    if (el) return el;
    el = document.createElement("div");
    el.id = "canvasrefined-todo-preview";
    el.className = "canvasrefined-hover-preview";
    el.innerHTML = '<p class="canvasrefined-preview-title"></p><p class="canvasrefined-preview-text"></p>';
    el.style.position = "fixed";
    el.style.zIndex = "100001";
    el.style.width = "300px";
    el.style.maxWidth = "90vw";
    el.style.maxHeight = "260px";
    document.body.append(el);
    return el;
}

function positionTodoPreview(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const gap = 10;
    const pw = el.offsetWidth || 300;
    const ph = el.offsetHeight || 160;
    let left = r.left - pw - gap;
    let top = r.top;
    if (left < gap) {
        left = r.right + gap;
        if (left + pw > window.innerWidth - gap) left = Math.max(gap, window.innerWidth - pw - gap);
    }
    if (top + ph > window.innerHeight - gap) top = Math.max(gap, window.innerHeight - ph - gap);
    el.style.left = left + "px";
    el.style.top = top + "px";
}

async function getTodoPreviewText(item) {
    const type = item.plannable_type;
    const id = item.plannable_id;
    const key = type + ":" + id;
    if (todoPreviewCache.has(key)) return todoPreviewCache.get(key);
    // Fake items have no Canvas page behind them; never hit the API for them.
    if (item.anonFake === true) return chrome.i18n.getMessage("no_details") || "No details given";
    // Custom tasks already carry their description in item.plannable.details.
    if (type === "planner_note" || (item.planner_override && item.planner_override.custom === true)) {
        const raw = item.plannable && item.plannable.details ? item.plannable.details : "";
        const text = stripHtmlPreview(raw) || chrome.i18n.getMessage("no_details") || "No details given";
        todoPreviewCache.set(key, text);
        return text;
    }
    let url = null;
    let field = "description";
    const lowType = String(type || "").toLowerCase();
    if (lowType === "assignment") {
        url = `${domain}/api/v1/courses/${item.course_id}/assignments/${id}`;
    } else if (lowType === "quiz") {
        url = `${domain}/api/v1/courses/${item.course_id}/quizzes/${id}`;
    } else if (lowType === "discussion_topic" || lowType === "announcement") {
        url = `${domain}/api/v1/courses/${item.course_id}/discussion_topics/${id}`;
        field = "message";
    } else if (TODO_PEER_REVIEW_TYPES.includes(lowType) || TODO_SUB_ASSIGNMENT_TYPES.includes(lowType)) {
        // Peer review / sub-assignment planner payloads already carry the
        // assignment description inline; avoid an extra API call.
        const raw = item.plannable?.description || item.plannable?.message || item.plannable?.details || "";
        const text = stripHtmlPreview(raw) || chrome.i18n.getMessage("no_details") || "No details given";
        todoPreviewCache.set(key, text);
        return text;
    }
    if (!url) {
        const text = getMsg("preview_unavailable", "No preview available");
        todoPreviewCache.set(key, text);
        return text;
    }
    try {
        const data = await getData(url);
        const raw = data && data[field] ? data[field] : "";
        const text = stripHtmlPreview(raw) || chrome.i18n.getMessage("no_details") || "No details given";
        todoPreviewCache.set(key, text);
        return text;
    } catch (e) {
        return chrome.i18n.getMessage("could_not_load_preview") || "Couldn't load preview";
    }
}

function hideTodoPreview() {
    todoPreviewToken++; // cancel any pending async text update
    const el = document.getElementById("canvasrefined-todo-preview");
    if (el) el.style.display = "none";
}

async function showTodoPreview(anchor, item) {
    const token = ++todoPreviewToken;
    const el = getTodoPreviewEl();
    const title = el.querySelector(".canvasrefined-preview-title");
    const text = el.querySelector(".canvasrefined-preview-text");
    title.textContent = anonTitleForItem(item);
    text.textContent = chrome.i18n.getMessage("loading") || "Loading…";
    el.style.display = "block";
    positionTodoPreview(el, anchor);
    const content = await getTodoPreviewText(item);
    if (token !== todoPreviewToken) return; // a newer hover (or hide) superseded this one
    if (el.style.display !== "block") return; // user already moved away
    // "Hide personal details": don't reveal real assignment descriptions.
    text.textContent = options.hide_personal_details === true ? (chrome.i18n.getMessage("preview_hidden") || "Preview hidden while personal details are hidden.") : content;
    positionTodoPreview(el, anchor); // reposition now that the height is known
}

function attachTodoHoverPreview(anchor, item) {
    if (options.hover_preview !== true) return;
    anchor.addEventListener("mouseenter", () => {
        clearTimeout(todoPreviewDelay);
        todoPreviewDelay = setTimeout(() => {
            if (anchor.matches(":hover")) showTodoPreview(anchor, item);
        }, 250);
    });
    anchor.addEventListener("mouseleave", () => {
        clearTimeout(todoPreviewDelay);
        hideTodoPreview();
    });
}

// Quiz / discussion row icons, sharing the assignment icon's fill variable.
const TODO_QUIZ_ICON_SVG = '<svg fill="var(--cr-todo-icon)" label="Quiz" name="IconQuiz" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><g fill-rule="evenodd" stroke="none" stroke-width="1"><path d="M746.255375,1466.76417 L826.739372,1547.47616 L577.99138,1796.11015 L497.507383,1715.51216 L746.255375,1466.76417 Z M580.35118,1300.92837 L660.949178,1381.52637 L329.323189,1713.15236 L248.725192,1632.55436 L580.35118,1300.92837 Z M414.503986,1135.20658 L495.101983,1215.80457 L80.5979973,1630.30856 L0,1549.71056 L414.503986,1135.20658 Z M1119.32036,264.600006 C1475.79835,-91.8779816 1844.58834,86.3040124 1848.35034,88.1280123 L1848.35034,88.1280123 L1865.45034,96.564012 L1873.88634,113.664011 C1875.71034,117.312011 2053.89233,486.101999 1697.30034,842.693987 L1697.30034,842.693987 L1550.69635,989.297982 L1548.07435,1655.17196 L1325.43235,1877.81395 L993.806366,1546.30196 L415.712386,968.207982 L84.0863971,636.467994 L306.72839,413.826001 L972.602367,411.318001 Z M1436.24035,1103.75398 L1074.40436,1465.70397 L1325.43235,1716.61796 L1434.30235,1607.74796 L1436.24035,1103.75398 Z M1779.26634,182.406009 C1710.18234,156.41401 1457.90035,87.1020124 1199.91836,345.198004 L1199.91836,345.198004 L576.90838,968.207982 L993.806366,1385.10597 L1616.70235,762.095989 C1873.65834,505.139998 1804.68834,250.920007 1779.26634,182.406009 Z M858.146371,525.773997 L354.152388,527.597997 L245.282392,636.467994 L496.310383,887.609985 L858.146371,525.773997 Z"></path><path d="M1534.98715,372.558003 C1483.91515,371.190003 1403.31715,385.326002 1321.69316,466.949999 L1281.22316,507.305998 L1454.61715,680.585992 L1494.97315,640.343994 C1577.16715,558.035996 1591.87315,479.033999 1589.82115,427.164001 L1587.65515,374.610003 L1534.98715,372.558003 Z"></path></g></g></svg>';
const TODO_PEER_REVIEW_ICON_SVG = '<svg fill="var(--cr-todo-icon)" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;"><path d="M8 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM9.5 15.5c1.1 1 2.9 1 4 0" stroke="var(--cr-todo-icon)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 3a7 7 0 0 0-6 10.3V21l3.5-1.8A7 7 0 1 0 12 3Z" stroke="var(--cr-todo-icon)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
const TODO_SUB_ASSIGNMENT_ICON_SVG = '<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;"><path d="M480 200h960v200H480zM480 600h960v200H480zM480 1000h600v200H480z" fill="var(--cr-todo-icon)"/><path d="M1200 950l320 260-320 260V950Z" fill="var(--cr-todo-icon)"/></svg>';
const TODO_DISCUSSION_ICON_SVG = '<svg fill="var(--cr-todo-icon)" name="IconDiscussion" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><path d="M677.647059,16 L677.647059,354.936471 L790.588235,354.936471 L790.588235,129.054118 L1807.05882,129.054118 L1807.05882,919.529412 L1581.06353,919.529412 L1581.06353,1179.29412 L1321.41176,919.529412 L1242.24,919.529412 L1242.24,467.877647 L677.647059,467.877647 L0,467.877647 L0,1484.34824 L338.710588,1484.34824 L338.710588,1903.24706 L756.705882,1484.34824 L1242.24,1484.34824 L1242.24,1032.47059 L1274.99294,1032.47059 L1694.11765,1451.59529 L1694.11765,1032.47059 L1920,1032.47059 L1920,16 L677.647059,16 Z M338.789647,919.563294 L903.495529,919.563294 L903.495529,806.622118 L338.789647,806.622118 L338.789647,919.563294 Z M338.789647,1145.44565 L677.726118,1145.44565 L677.726118,1032.39153 L338.789647,1032.39153 L338.789647,1145.44565 Z M112.941176,580.705882 L1129.41176,580.705882 L1129.41176,1371.40706 L710.4,1371.40706 L451.651765,1631.05882 L451.651765,1371.40706 L112.941176,1371.40706 L112.941176,580.705882 Z" fill-rule="evenodd" stroke="none" stroke-width="1"></path></g></svg>';

// Scores: planner items omit the earned score, so it is fetched per course and cached;
// badges read "{score}/{points} pts" (en dash until known) or "Excused".
const todoScoreCache = new Map(); // `${courseId}:${plannableId}` -> {score, excused}
let todoScoreLoadToken = 0;

function formatTodoScoreNumber(n) {
    return String(Math.round(n * 100) / 100);
}

function todoGradedBadgeHtml() { return `<svg class="better-todo-graded" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;margin-left:5px;display:inline-block;vertical-align:-1px;" title="${getMsg("todo_graded", "Graded")}"><path d="M20 6L9 17l-5-5" stroke="#28a745" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }

function todoScoreBadgeHtml(item) {
    const _low = String(item.plannable_type || "").toLowerCase();
    if (_low === "planner_note" || TODO_PEER_REVIEW_TYPES.includes(_low) || TODO_SUB_ASSIGNMENT_TYPES.includes(_low) || item.planner_override?.custom === true) return "";
    const points = item.plannable?.points_possible;
    if (points == null) return "";
    const pts = formatTodoScoreNumber(points);
    const key = `${item.course_id}:${item.plannable_id}`;
    const cached = todoScoreCache.get(key);
    // Live fetched score wins over the planner boolean until a fetch confirms no grade.
    const graded = cached ? cached.score != null : item.submissions?.graded === true;
    let text;
    // "Hide personal details": never reveal the real earned score.
    const shownScore = options.hide_personal_details === true ? null : cached?.score;
    if (cached?.excused) text = chrome.i18n.getMessage("excused") || "Excused";
    else text = `${shownScore != null ? formatTodoScoreNumber(shownScore) : "–"}/${pts} pts`;
    const attrs = `data-todo-course="${item.course_id ?? ""}" data-todo-plannable="${item.plannable_id}" data-todo-points="${pts}"`;
    return `<span class="better-todo-score" ${attrs} style="margin-left:6px;opacity:.85;">${text}</span>${graded ? todoGradedBadgeHtml() : ""}`;
}

// Patch score badges in place (a re-render would reset "View More"); the token drops
// runs superseded by a newer one.
async function loadTodoScores(items) {
    if (options.todo_show_scores !== true) return;
    const byCourse = new Map();
    for (const item of items) {
        const _lt = String(item.plannable_type || "").toLowerCase();
        if (_lt === "planner_note" || TODO_PEER_REVIEW_TYPES.includes(_lt) || TODO_SUB_ASSIGNMENT_TYPES.includes(_lt) || item.planner_override?.custom === true) continue;
        if (item.plannable?.points_possible == null) continue;
        const cid = item.course_id ?? item.context_id;
        if (cid == null) continue;
        const key = `${cid}:${item.plannable_id}`;
        if (todoScoreCache.has(key)) continue;
        if (item.submissions?.excused === true) { todoScoreCache.set(key, { score: null, excused: true }); continue; }
        let list = byCourse.get(String(cid));
        if (!list) { list = []; byCourse.set(String(cid), list); }
        list.push(item);
    }
    if (byCourse.size === 0) return;
    const token = ++todoScoreLoadToken;
    for (const [cid] of byCourse) {
        try {
            let url = `${domain}/api/v1/courses/${cid}/students/submissions?student_ids[]=self&per_page=100`;
            // Page cap guards against a malformed next link.
            for (let page = 0; page < 10 && url; page++) {
                const response = await pageFetch(url, {
                    method: "GET",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" }
                });
                if (!response.ok) throw new Error(`Canvas API request failed (${response.status})`);
                const data = await response.json();
                if (token !== todoScoreLoadToken) return;
                if (Array.isArray(data)) {
                    for (const s of data) {
                        if (s && s.assignment_id != null) {
                            todoScoreCache.set(`${cid}:${s.assignment_id}`, { score: s.score, excused: s.excused === true });
                        }
                    }
                }
                url = getNextPageUrl(response.headers.get("Link"));
            }
        } catch (e) {
            // Leave uncached so a later render retries (teacher accounts are rejected).
        }
    }
    if (token !== todoScoreLoadToken) return;
    document.querySelectorAll("#better-todo-main .better-todo-score").forEach(el => {
        const cached = todoScoreCache.get(`${el.dataset.todoCourse}:${el.dataset.todoPlannable}`);
        if (!cached) return;
        // "Hide personal details": never reveal the real earned score.
        const shownScore = options.hide_personal_details === true ? null : cached.score;
        if (cached.excused) el.textContent = chrome.i18n.getMessage("excused") || "Excused";
        else el.textContent = `${shownScore != null ? formatTodoScoreNumber(shownScore) : "–"}/${el.dataset.todoPoints} pts`;
        if (cached.score != null && !el.nextElementSibling?.classList.contains("better-todo-graded")) {
            el.insertAdjacentHTML("afterend", todoGradedBadgeHtml());
        }
    });
}

function populateAssignments(iscompleted = false) {
	const today = new Date();
	today.setHours(0,0,0,0);
    let assignments = (iscompleted ? completed : assignmentsDue).slice();
    if (iscompleted) {
        assignments.sort((a, b) => {
            const aIsGraded = Boolean(a.submissions?.graded);
            const bIsGraded = Boolean(b.submissions?.graded);
            if (aIsGraded !== bIsGraded) {
                return aIsGraded - bIsGraded;
            }
            return new Date(b.plannable_date) - new Date(a.plannable_date);
        });
    } else {
        // Sort ascending so the visible-item budget below counts from due today onward.
        assignments.sort((a, b) => new Date(a.plannable_date) - new Date(b.plannable_date));
    }

	let assignmentCount = 0;
	const maxElements = options.num_todo_items;

	assignments.forEach((item) => {
		let dueGroup = -1;
		if (!iscompleted) {
			let dueDate = new Date(item.plannable_date);
			dueDate.setHours(0,0,0,0);
			const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
			if (diffDays < 0) {dueGroup = -1;}
			else if (diffDays <= 1) { dueGroup = diffDays.toString(); }
			else if (diffDays <= 7) { dueGroup = diffDays.toString(); }
			else if (diffDays <= 14) {dueGroup = 14;}
			else if (diffDays <= 21) {dueGroup = 21;}
			else if (diffDays <= 30) {dueGroup = 30;}
			else {dueGroup = "Later"};
		} else {
			dueGroup = item.submissions?.graded ? "Graded" : "Ungraded";
		}

		let assignment
		const targetContainer = domContainers[dueGroup];
		// Overdue items are always shown and don't use up the item budget.
		const isOverdue = !iscompleted && dueGroup === -1;
		if (!isOverdue) assignmentCount++;
		let isHidden = !isOverdue && assignmentCount > maxElements;

		if (targetContainer) {
			if (!isHidden) {
				targetContainer.wrapper.style.display = "block";
				targetContainer.wrapper.setAttribute("data-has-visible", "true");
			}
			else {
				if (!targetContainer.wrapper.hasAttribute("data-has-visible")) {
					targetContainer.wrapper.classList.add(
						"better-todo-hidden-wrapper",
					);
				}
			}

			assignment = makeElement("div", targetContainer.listContainer, {
				class: "better-todo-assignment",
			});
			if (isHidden) {
				assignment.style.display = "none";
				assignment.classList.add("better-todo-hidden-assignment");
			}
		}

		const courseColor =
			item.anonFake === true
				? item.anonColor // fake items carry their (real) course color
				: (options.custom_cards_3?.[String(item.course_id)]?.color ??
				options.custom_cards_3?.[item.course_id]?.color ??
				options.custom_cards_3?.[item.plannable.course_id]?.color ??
				"#cccccc");

        // "Ignore card colors": course name in black (light) or theme text (dark).
        const classNameColor = options.todo_ignore_card_colors
            ? (options.dark_mode === true ? "var(--bctext-0)" : "#000000")
            : courseColor;
        // "Remove icons": drop the task-type icon from the colored strip.
        const removeIcons = options.todo_remove_icons === true;

        const isCustomTask = item.plannable_type == "planner_note" || item.planner_override?.custom === true;
        // Submitted to Canvas: the Completed tab shows it whatever the checkmark says.
        const wasSubmitted = item.submissions?.submitted === true;
        const taskHref = isCustomTask ? customTaskHref(item) : (item.anonFake === true ? "#" : domain + item.html_url);
        const editButtonSvg = isCustomTask
            ? `<svg class="better-todo-assignment-edit" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:18px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'" title="${getMsg("edit_custom_task", "Edit this custom task")}"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
            : "";
        const iconSize = isCustomTask ? 26 : 20;
        // Optical centering: glyphs hug their viewBox's left edge; quiz needs less of a nudge.
        const iconLeftOffset = isCustomTask ? 2 : item.plannable_type == "quiz" ? 2 : 5;
        const scoreBadge = options.todo_show_scores === true ? todoScoreBadgeHtml(item) : "";
        const taskIcon = removeIcons ? "" : isCustomTask
            ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <path d="M19.8201 14H15.6001C15.04 14 14.76 14 14.5461 14.109C14.3579 14.2049 14.2049 14.3578 14.1091 14.546C14.0001 14.7599 14.0001 15.0399 14.0001 15.6V19.82M20 12.7269V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H12.9496C13.4578 20 13.7118 20 13.9498 19.9407C14.1608 19.8882 14.3618 19.8016 14.5449 19.6844C14.7515 19.5522 14.926 19.3675 15.2751 18.9983L19.1254 14.9252C19.4486 14.5833 19.6101 14.4124 19.7255 14.2156C19.8278 14.041 19.903 13.8519 19.9486 13.6548C20 13.4325 20 13.1973 20 12.7269Z" stroke="var(--cr-todo-icon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>`
            : (isPeerReviewType(item) ? TODO_PEER_REVIEW_ICON_SVG : isSubAssignmentType(item) ? TODO_SUB_ASSIGNMENT_ICON_SVG : item.plannable_type == "quiz" ? TODO_QUIZ_ICON_SVG : item.plannable_type == "discussion_topic" ? TODO_DISCUSSION_ICON_SVG : `<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <g id="SVGRepo_bgCarrier" stroke-width="1"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                    <path d="M1468.214 0v551.145L840.27 1179.089c-31.623 31.623-49.693 74.54-49.693 119.715v395.289h395.288c45.176 0 88.093-18.07 119.716-49.694l162.633-162.633v438.206H0V0h1468.214Zm129.428 581.3c22.137-22.136 57.825-22.136 79.962 0l225.879 225.879c22.023 22.023 22.023 57.712 0 79.848l-677.638 677.637c-10.616 10.503-24.96 16.49-39.98 16.49H903.516v-282.35c0-15.02 5.986-29.364 16.49-39.867Zm-920.005 548.095H338.82v112.94h338.818v-112.94Zm225.88-225.879H338.818v112.94h564.697v-112.94Zm734.106-202.5-89.561 89.56 146.03 146.031 89.562-89.56-146.031-146.031Zm-508.228-362.197H338.82v338.818h790.576V338.82Z" fill-rule="evenodd"></path>
                </g>
            </svg>`);

		assignment.style.overflowX = "hidden";
		assignment.innerHTML = `
		<div style="display:flex;align-items:center;gap:5px;width:100%;height:60px;background:var(--bcbackground-2);border-radius:5px;transition:all .4s ease;overflow:hidden;">
			<div style="width:40px;display:flex;align-items:center;justify-content:center;background-color:${courseColor};height:100%;border-radius:5px 0 0 5px;">
                <div style="width:${iconSize}px;height:${iconSize}px;display:flex;margin-left:${iconLeftOffset}px;">
                    ${taskIcon}
				</div>
			</div>
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;position:relative;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:${classNameColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${anonCourseNameForItem(item)}</span>
					<a href="${taskHref}" style="color:inherit;text-decoration:none;font-weight:bold;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;padding-right:28px;margin-top:-5px;">${anonTitleForItem(item)}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}${scoreBadge}</span>
				</div>
				${editButtonSvg}
				<svg class="better-todo-assignment-checkmark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:0px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'"${(iscompleted && wasSubmitted) ? ` title="${getMsg("submitted_return_title", "Submitted to Canvas — clicking sends it back to Tasks (locally)")}"` : ""}>
					<g id="SVGRepo_bgCarrier" stroke-width="0"></g>
					<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
					<g id="SVGRepo_iconCarrier"> <g id="Interface / Checkbox_Check">
						<path id="Vector" d="M8 12L11 15L16 9M4 16.8002V7.2002C4 6.08009 4 5.51962 4.21799 5.0918C4.40973 4.71547 4.71547 4.40973 5.0918 4.21799C5.51962 4 6.08009 4 7.2002 4H16.8002C17.9203 4 18.4796 4 18.9074 4.21799C19.2837 4.40973 19.5905 4.71547 19.7822 5.0918C20 5.5192 20 6.07899 20 7.19691V16.8036C20 17.9215 20 18.4805 19.7822 18.9079C19.5905 19.2842 19.2837 19.5905 18.9074 19.7822C18.48 20 17.921 20 16.8031 20H7.19691C6.07899 20 5.5192 20 5.0918 19.7822C4.71547 19.5905 4.40973 19.2842 4.21799 18.9079C4 18.4801 4 17.9203 4 16.8002Z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					</g></g>
				</svg>
			</div>
		</div>
		`;
		// On the Completed tab the checkmark un-completes; submitted items get a local pin.
		assignment.querySelector(".better-todo-assignment-checkmark").addEventListener("click", () => {
			if (item.anonFake === true) return; // fake items can't be completed in Canvas
			console.log("marking ", item.plannable.title, iscompleted ? "as incomplete" : "as complete");
			markAs(item, assignment.firstElementChild, !iscompleted);
		});
		const editBtn = assignment.querySelector(".better-todo-assignment-edit");
		if (editBtn) {
			editBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				openTaskForEdit(item);
			});
		}
		attachTodoHoverPreview(assignment, item);
	});

	if (options.todo_show_scores === true) loadTodoScores(iscompleted ? completed : assignmentsDue);

	if (document.getElementById("better-todo-see-more")) {
		document.getElementById("better-todo-see-more").remove();
	}

	if (assignmentCount > maxElements) {
		let isExpanded = false;

		let seeMoreButton = makeElement("button", document.getElementById("better-todo-main"), {
			textContent: replaceCountPlaceholder((chrome.i18n.getMessage("view_more_count") || "View More ({{COUNT}})"), assignmentCount - maxElements),
			className: "canvasrefined-custom-btn",
			id: "better-todo-see-more",
			style: "width:100%;margin-top:15px;cursor:pointer;"
		})
		seeMoreButton.addEventListener("click", () => {
			if (!isExpanded) {
				document.querySelectorAll(".better-todo-hidden-assignment").forEach(element => element.style.display = "block");
				document.querySelectorAll(".better-todo-hidden-wrapper").forEach(element => element.style.display = "block");
				seeMoreButton.textContent = chrome.i18n.getMessage("view_less") || "View Less";
			} else {
				document.querySelectorAll(".better-todo-hidden-assignment").forEach(element => element.style.display = "none");
				document.querySelectorAll(".better-todo-hidden-wrapper").forEach(element => element.style.display = "none");
				seeMoreButton.textContent = replaceCountPlaceholder((chrome.i18n.getMessage("view_more_count") || "View More ({{COUNT}})"), assignmentCount - maxElements);
			}
			isExpanded = !isExpanded;
		})
	}
}

function populateAnnouncements() {
	const today = new Date();
	today.setHours(0,0,0,0);

	announcements.forEach((item) => {
		let dueGroup = item.plannable.read_state == "read" ? "Seen" : "New";

		let announcement;
		const targetContainer = domContainers[dueGroup];
		if (targetContainer) {
			targetContainer.wrapper.style.display = "block";
			announcement = makeElement("div", targetContainer.listContainer, {
				class: "better-todo-announcement",
			});
		}

		const courseColor =
			options.custom_cards_3?.[String(item.course_id)]?.color ??
			options.custom_cards_3?.[item.course_id]?.color ??
			options.custom_cards_3?.[item.plannable.course_id]?.color ??
			"#cccccc";

		const classNameColor = options.todo_ignore_card_colors
			? (options.dark_mode === true ? "var(--bctext-0)" : "#000000")
			: courseColor;
		const removeIcons = options.todo_remove_icons === true;

		let filter = "";
		if (item.plannable.read_state == "read") {
			filter = "filter: grayscale(40%);"
		}

		announcement.innerHTML = `
		<div style="display:flex;align-items:center;gap:5px;width:100%;height:60px;background:var(--bcbackground-2);border-radius:5px;transition:all .4s ease;overflow:hidden;${filter}">
			<div style="width:40px;display:flex;align-items:center;justify-content:center;background-color:${courseColor};height:100%;border-radius:5px 0 0 5px;">
				<div style="width:23px;height:23px;display:flex;margin-left:0px;">
					${removeIcons ? "" : `<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier">
							<path d="M1587.162 31.278c11.52-23.491 37.27-35.689 63.473-29.816 25.525 6.099 43.483 28.8 43.483 55.002V570.46C1822.87 596.662 1920 710.733 1920 847.053c0 136.32-97.13 250.503-225.882 276.705v513.883c0 26.202-17.958 49.016-43.483 55.002a57.279 57.279 0 0 1-12.988 1.468c-21.12 0-40.772-11.745-50.485-31.171C1379.238 1247.203 964.18 1242.347 960 1242.347H564.706v564.706h87.755c-11.859-90.127-17.506-247.003 63.473-350.683 52.405-67.087 129.657-101.082 229.948-101.082v112.941c-64.49 0-110.57 18.861-140.837 57.487-68.781 87.868-45.064 263.83-30.269 324.254 4.18 16.828.34 34.673-10.277 48.34-10.73 13.665-27.219 21.684-44.499 21.684H508.235c-31.171 0-56.47-25.186-56.47-56.47v-621.177h-56.47c-155.747 0-282.354-126.607-282.354-282.353v-56.47h-56.47C25.299 903.523 0 878.336 0 847.052c0-31.172 25.299-56.471 56.47-56.471h56.471v-56.47c0-155.634 126.607-282.354 282.353-282.354h564.593c16.941-.112 420.48-7.002 627.275-420.48Zm-5.986 218.429c-194.71 242.371-452.216 298.164-564.705 311.04v572.724c112.489 12.876 369.995 68.556 564.705 311.04ZM903.53 564.7H395.294c-93.402 0-169.412 76.01-169.412 169.411v225.883c0 93.402 76.01 169.412 169.412 169.412H903.53V564.7Zm790.589 123.444v317.93c65.618-23.379 112.94-85.497 112.94-159.021 0-73.525-47.322-135.53-112.94-158.909Z" fill-rule="evenodd"></path>
						</g>
					</svg>`}
				</div>
			</div>
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;position:relative;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:${classNameColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${anonCourseNameForItem(item)}</span>
					<a href="${domain + item.html_url}" style="color:inherit;text-decoration:none;font-weight:bold;text-overflow:ellipsis;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-5px;">${anonTitleForItem(item)}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}</span>
				</div>
				<svg class="better-todo-announcement-checkmark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:0px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'" title="${getMsg("mark_as_seen", "Mark as seen")}">
					<g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
					<g id="SVGRepo_iconCarrier"> <g id="Interface / Checkbox_Check">
						<path id="Vector" d="M8 12L11 15L16 9M4 16.8002V7.2002C4 6.08009 4 5.51962 4.21799 5.0918C4.40973 4.71547 4.71547 4.40973 5.0918 4.21799C5.51962 4 6.08009 4 7.2002 4H16.8002C17.9203 4 18.4796 4 18.9074 4.21799C19.2837 4.40973 19.5905 4.71547 19.7822 5.0918C20 5.5192 20 6.07899 20 7.19691V16.8036C20 17.9215 20 18.4805 19.7822 18.9079C19.5905 19.2842 19.2837 19.5905 18.9074 19.7822C19.48 20 17.921 20 16.8031 20H7.19691C6.07899 20 5.5192 20 5.0918 19.7822C4.71547 19.5905 4.40973 19.2842 4.21799 18.9079C4 18.4801 4 17.9203 4 16.8002Z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					</g></g>
				</svg>
			</div>
		</div>
		`;
		// "Mark as seen" shares the task checkmark's planner override; the toggle is two-way.
		announcement.querySelector(".better-todo-announcement-checkmark").addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			markAs(item, announcement.firstElementChild, !(item.planner_override?.marked_complete === true), { celebrate: false });
		});
		attachTodoHoverPreview(announcement, item);
	});
}

// One fullscreen canvas per burst instead of DOM particles — keeps "crazy" volumes smooth.
function celebrationCanvas() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { canvas, ctx, w: window.innerWidth, h: window.innerHeight };
}

// rAF driver: runs step(now) until it returns false, then removes the canvas.
function runCelebrationCanvas(view, step, graceMs) {
    let rafId = null;
    const loop = (now) => {
        try {
            if (step(now)) rafId = requestAnimationFrame(loop);
            else {
                setTimeout(() => { try { view.canvas.remove(); } catch (e) { /* ignore */ } }, graceMs || 100);
            }
        } catch (e) {
            try { view.canvas.remove(); } catch (err) { /* ignore */ }
        }
    };
    rafId = requestAnimationFrame(loop);
    setTimeout(() => { try { rafId && cancelAnimationFrame(rafId); view.canvas.remove(); } catch (e) { /* ignore */ } }, 9000);
}

function createConfettiBurst(targetElement, opts = {}) {
    try {
        const amountScale = celebrationAmountScale();
        const count = Math.min(220, Math.round((opts.count || 48) * amountScale * (amountScale >= 4 ? 1.25 : amountScale >= 2 ? 1.2 : 1)));
        const durationFactor = amountScale >= 4 ? 1.6 : amountScale >= 2 ? 1.35 : amountScale < 1 ? 0.85 : 1;
        // Fan the burst wider as the amount grows so it doesn't read as one clump.
        const spread = (opts.spread || 110) * (amountScale >= 4 ? 1.9 : amountScale >= 2 ? 1.45 : 1);
        const colors = opts.colors || ['#ff4d4f', '#ffc107', '#28a745', '#17a2b8', '#6f42c1', '#ff6b6b', '#ff8a65', '#ffd54f'];
        const rect = targetElement.getBoundingClientRect();
        const view = celebrationCanvas();
        const ctx = view.ctx;

        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height * 0.35;
        const pieceScale = amountScale >= 4 ? 1.6 : amountScale >= 2 ? 1.35 : 1;
        const pieces = [];
        let maxEnd = 0;

        for (let i = 0; i < count; i++) {
            const bigPiece = Math.random() < 0.25 && pieceScale > 1 ? 1.9 : 1;
            const w = (4 + Math.floor(Math.random() * 7)) * pieceScale * bigPiece;
            const h = Math.max(3, Math.floor(w * (0.4 + Math.random() * 0.8)));
            const duration = Math.round((850 + Math.random() * 500) * durationFactor);
            const delay = Math.floor(Math.random() * 160);
            const horizontalBias = (Math.random() - 0.5) * 2;
            const endX = originX + horizontalBias * (spread * (0.7 + Math.random() * 0.6));
            const endY = originY - (16 + Math.random() * 34);
            const ctrlX = originX + horizontalBias * (spread * 0.25) + (Math.random() - 0.5) * 14;
            const ctrlY = originY - (30 + Math.random() * 55) * (amountScale >= 2 ? 1.4 : 1);
            pieces.push({
                delay,
                duration,
                ox: originX - w / 2,
                oy: originY - h / 2,
                endX, endY, ctrlX, ctrlY,
                w, h,
                rot: (Math.random() * 260) - 130,
                round: Math.random() > 0.75,
                sc: 0.8 + Math.random() * 0.5,
                color: colors[(Math.random() * colors.length) | 0],
            });
            const end = delay + duration;
            if (end > maxEnd) maxEnd = end;
        }

        const startTime = performance.now();
        runCelebrationCanvas(view, (now) => {
            ctx.clearRect(0, 0, view.w, view.h);
            let active = false;
            for (let i = 0; i < pieces.length; i++) {
                const pc = pieces[i];
                const elapsed = now - startTime - pc.delay;
                if (elapsed < 0) { active = true; continue; }
                const p = Math.min(1, elapsed / pc.duration);
                if (p < 1) active = true;
                // Bezier arc: fast rise, then settle at the end point while fading.
                const eased = 1 - Math.pow(1 - p, 3);
                const inv = 1 - eased;
                const x = inv * inv * pc.ox + 2 * inv * eased * pc.ctrlX + eased * eased * pc.endX;
                const y = inv * inv * pc.oy + 2 * inv * eased * pc.ctrlY + eased * eased * pc.endY;
                const sc = pc.sc * (1 - eased * 0.15);
                ctx.save();
                ctx.globalAlpha = Math.max(0, 1 - p);
                ctx.translate(x, y);
                ctx.rotate((pc.rot * eased * Math.PI) / 180);
                ctx.scale(sc, sc);
                ctx.fillStyle = pc.color;
                if (pc.round) {
                    ctx.beginPath();
                    ctx.ellipse(0, 0, pc.w / 2, pc.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-pc.w / 2, -pc.h / 2, pc.w, pc.h);
                }
                ctx.restore();
            }
            return active;
        }, 150);
    } catch (e) {
        console.error('confetti error', e);
    }
}

// --- Completion celebrations ---
// Each effect renders into a fixed container; "rocket" also replaces the task exit.
const CELEBRATION_EFFECT_IDS = ["confetti", "fireworks", "sparkles", "hearts", "rocket"];

// Intensity tiers for the "Amount" dropdown; rocket uses the raw factor.
const CELEBRATION_AMOUNT_SCALES = { less: 0.5, normal: 1, more: 2, crazy: 4 };
function celebrationAmountScale() {
    const v = options.todo_celebration_amount;
    return CELEBRATION_AMOUNT_SCALES[v] || 1;
}

function enabledCelebrationTypes() {
    if (options.todo_celebrations_enabled === false) return [];
    // Legacy migration from the old todo_confetti checkbox.
    const list = options.todo_celebrations;
    if (Array.isArray(list)) return list.filter(t => CELEBRATION_EFFECT_IDS.includes(t));
    return options.todo_confetti === false ? [] : ["confetti"];
}

// Lead-in pause so the task is visible before the effect and its exit start.
const CELEBRATION_LEAD_IN = 250;
const CELEBRATION_SLIDE_AFTER = 200;

// Returns the task's exit as { style, delay, startDelay, start }.
function runCelebration(targetElement) {
    const types = enabledCelebrationTypes();
    if (!types.length) return { style: "slide", delay: 0 };
    const type = types[Math.floor(Math.random() * types.length)];
    ensureCelebrationStyles();
    const lead = CELEBRATION_LEAD_IN;
    switch (type) {
        case "confetti": return { style: "slide", delay: lead + CELEBRATION_SLIDE_AFTER, startDelay: lead, start: () => createConfettiBurst(targetElement) };
        case "fireworks": return { style: "slide", delay: lead + 350, startDelay: lead, start: () => createFireworksBurst(targetElement) };
        case "sparkles": return { style: "slide", delay: lead + CELEBRATION_SLIDE_AFTER, startDelay: lead, start: () => createSparkleBurst(targetElement) };
        // Hearts stay on screen about half their runtime.
        case "hearts": return { style: "slide", delay: lead + Math.round(risingHeartsRuntime() * 0.5), startDelay: lead, start: () => createRisingHearts(targetElement) };
        // The rocket's exhaust is spawned by applyTodoExitAnimation, so it has no start fn.
        case "rocket": return { style: "rocket", delay: lead, startDelay: lead, start: null };
    }
    return { style: "slide", delay: 0 };
}

// Exit animation duration per style; the list re-render waits at least this long.
const CELEBRATION_EXIT_DURATIONS = { slide: 400, rocket: 1250 };
// Headroom so the swipe finishes before the re-render swaps the DOM.
const CELEBRATION_EXIT_SETTLE = 60;
function celebrationExitDuration(exitStyle, delay) {
    return (delay || 0) + (CELEBRATION_EXIT_DURATIONS[exitStyle] || CELEBRATION_EXIT_DURATIONS.slide) + CELEBRATION_EXIT_SETTLE;
}

function applyTodoExitAnimation(element, exitStyle, delay) {
    const run = () => {
        if (element.__crCelebrationCancelled === true) return;
    try {
        if (exitStyle === "rocket") {
            // The list clips overflow, so a fixed-position clone is flown off screen instead.
            const rect = element.getBoundingClientRect();
            const distF = celebrationAmountScale() >= 4 ? 1.9 : 1;
            const clone = element.cloneNode(true);
            clone.classList.remove("canvasrefined-rocket-exit");
            clone.style.setProperty("--cr-rx1", (2.5 * distF).toFixed(2) + "vw");
            clone.style.setProperty("--cr-ry1", Math.round(-55 * distF) + "vh");
            clone.style.setProperty("--cr-rx2", (8 * distF).toFixed(2) + "vw");
            clone.style.setProperty("--cr-ry2", Math.round(-125 * distF) + "vh");
            clone.style.position = "fixed";
            clone.style.left = rect.left + "px";
            clone.style.top = rect.top + "px";
            clone.style.width = rect.width + "px";
            clone.style.height = rect.height + "px";
            clone.style.margin = "0";
            clone.style.boxSizing = "border-box";
            clone.style.pointerEvents = "none";
            clone.style.zIndex = "2147483646";
            document.body.appendChild(clone);
            element.__crRocketClone = clone;
            element.style.transition = "none";
            element.style.opacity = "0";
            requestAnimationFrame(() => clone.classList.add("canvasrefined-rocket-exit"));
            createRocketCelebration(clone);
            setTimeout(() => {
                try { clone.remove(); } catch (e) { /* ignore */ }
                if (element.__crRocketClone === clone) element.__crRocketClone = null;
            }, 1500);
        } else {
            // The row's transition may have been cleared by a revert; restore it first.
            if (getComputedStyle(element).transitionDuration === "0s") {
                element.style.transition = "transform .4s ease, opacity .4s ease";
            }
            // Double rAF so the slide always starts from the painted state.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                element.style.transform = "translate(100%)";
                element.style.opacity = "0";
            }));
        }
    } catch (e) {
        element.style.transform = "translate(100%)";
        element.style.opacity = "0";
    }
    };
    if (delay > 0) {
        if (element.__crExitTimer) clearTimeout(element.__crExitTimer);
        element.__crExitTimer = setTimeout(() => {
            element.__crExitTimer = null;
            run();
        }, delay);
    } else {
        run();
    }
}

let celebrationStylesEl = null;
function ensureCelebrationStyles() {
    if (celebrationStylesEl && document.getElementById("canvasrefined-celebration-styles")) return;
    celebrationStylesEl = document.createElement("style");
    celebrationStylesEl.id = "canvasrefined-celebration-styles";
    celebrationStylesEl.textContent = `
@keyframes canvasrefined-rocket-exit {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  12%  { transform: translate(0, 12px) rotate(0deg); opacity: 1; }
  60%  { transform: translate(var(--cr-rx1, 2.5vw), var(--cr-ry1, -55vh)) rotate(4deg); opacity: 1; }
  100% { transform: translate(var(--cr-rx2, 8vw), var(--cr-ry2, -125vh)) rotate(8deg); opacity: 1; }
}
.canvasrefined-rocket-exit { animation: canvasrefined-rocket-exit 1.2s cubic-bezier(.55, 0, .85, .4) forwards !important; }
/* Rocket flames use WAAPI keyframes (compositor); other particles are canvas-drawn. */
.canvasrefined-rocket-flame { position: fixed; border-radius: 50%; pointer-events: none; z-index: 2147483647; }
/* outer span rises, inner sways: reads as one smooth drift */
@keyframes canvasrefined-heart-rise {
  0%   { transform: translateY(6px) scale(.55); opacity: 0; animation-timing-function: cubic-bezier(.2, .7, .4, 1); }
  6%   { transform: translateY(0) scale(var(--cr-s, 1)); opacity: 1; animation-timing-function: cubic-bezier(.3, .6, .5, 1); }
  /* a quarter of the climb happens in the first ~15% */
  15%  { transform: translateY(calc(var(--cr-hy, -160px) * .28)) scale(var(--cr-s, 1)); }
  80%  { opacity: .92; }
  100% { transform: translateY(var(--cr-hy, -160px)) scale(var(--cr-s, 1)); opacity: 0; }
}
@keyframes canvasrefined-heart-sway {
  0%   { transform: translateX(calc(var(--cr-hx, 14px) * -.5)) rotate(calc(var(--cr-rot, 9deg) * -1)); }
  100% { transform: translateX(calc(var(--cr-hx, 14px) * .5)) rotate(var(--cr-rot, 9deg)); }
}
.canvasrefined-heart { position: absolute; pointer-events: none; line-height: 1; will-change: transform, opacity; animation: canvasrefined-heart-rise var(--cr-dur, 1400ms) var(--cr-cdelay, 0ms) both; }
.canvasrefined-heart-inner { display: inline-block; animation: canvasrefined-heart-sway calc(var(--cr-dur, 1400ms) * .55) ease-in-out infinite alternate; }
`;
    (document.head || document.documentElement).appendChild(celebrationStylesEl);
}

function celebrationContainer() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'visible';
    container.style.zIndex = '2147483647';
    document.body.appendChild(container);
    return container;
}

function createFireworksBurst(targetElement) {
    try {
        const rect = targetElement.getBoundingClientRect();
        const view = celebrationCanvas();
        const ctx = view.ctx;
        const colors = ['#ff4d4f', '#ffc107', '#4dd0e1', '#7c4dff', '#ff6ec7', '#ffd54f', '#69f0ae'];
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height * 0.4;
        const scale = celebrationAmountScale();
        const burstScale = scale > 1 ? (scale >= 4 ? 2.2 : 1.5) : 1;
        const shellCount = Math.max(1, Math.round(3 * scale));
        const shellGap = 260 / Math.sqrt(scale);
        const shells = [];
        const sparks = [];
        const flashes = [];
        for (let i = 0; i < shellCount; i++) {
            shells.push({
                start: i * shellGap + Math.random() * 130,
                apexX: originX + (Math.random() - 0.5) * 90 * burstScale,
                apexY: originY - (55 + Math.random() * 110) * burstScale,
                duration: 320 + Math.random() * 160,
                color: colors[(Math.random() * colors.length) | 0],
            });
        }

        const explode = (shell, now) => {
            flashes.push({ x: shell.apexX, y: shell.apexY, r: 26 * burstScale, born: now });
            const count = Math.min(48, Math.round((26 + Math.random() * 12) * scale));
            const life = 700 + Math.random() * 500;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
                const speed = (60 + Math.random() * 100) * burstScale;
                sparks.push({
                    x: shell.apexX,
                    y: shell.apexY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 25 * burstScale,
                    size: (2 + Math.random() * 3) * burstScale,
                    born: now,
                    duration: life,
                    color: shell.color,
                });
            }
        };

        const startTime = performance.now();
        let last = startTime;
        let remainingShells = shells.length;
        runCelebrationCanvas(view, (now) => {
            const dt = Math.min(50, now - last) / 1000;
            last = now;
            ctx.clearRect(0, 0, view.w, view.h);
            let active = false;

            for (let i = shells.length - 1; i >= 0; i--) {
                const sh = shells[i];
                const elapsed = now - startTime - sh.start;
                if (elapsed < 0) { active = true; continue; }
                const p = Math.min(1, elapsed / sh.duration);
                const eased = 1 - Math.pow(1 - p, 2);
                const x = originX + (sh.apexX - originX) * eased;
                const y = originY + (sh.apexY - originY) * (1 - Math.pow(1 - eased, 1.6));
                ctx.beginPath();
                ctx.fillStyle = '#fffbe6';
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fill();
                if (p >= 1) { explode(sh, now); shells.splice(i, 1); }
                else active = true;
            }

            for (let i = flashes.length - 1; i >= 0; i--) {
                const f = flashes[i];
                const p = (now - f.born) / 300;
                if (p >= 1) { flashes.splice(i, 1); continue; }
                active = true;
                const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * (1 - p)).toFixed(3) + ')');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fill();
            }

            const gravity = 300;
            for (let i = sparks.length - 1; i >= 0; i--) {
                const sp = sparks[i];
                const p = (now - sp.born) / sp.duration;
                if (p >= 1) { sparks.splice(i, 1); continue; }
                active = true;
                sp.x += sp.vx * dt;
                sp.y += sp.vy * dt;
                sp.vy += gravity * dt;
                sp.vx *= (1 - 1.1 * dt);
                ctx.globalAlpha = Math.max(0, 1 - p);
                ctx.fillStyle = sp.color;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, sp.size * (1 - p * 0.6), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            return active || shells.length > 0 || (remainingShells-- > 0 && now - startTime < shellCount * shellGap + 1500);
        }, 200);
    } catch (e) {
        console.error('fireworks error', e);
    }
}

function createSparkleBurst(targetElement) {
    try {
        const rect = targetElement.getBoundingClientRect();
        const view = celebrationCanvas();
        const ctx = view.ctx;
        const colors = ['#ffe082', '#fff59d', '#ffd54f', '#ffffff', '#ff8ab5', '#b388ff'];
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height * 0.4;
        const scale = celebrationAmountScale();
        const sparkCount = Math.min(80, Math.round(22 * scale));
        const sizeScale = scale >= 4 ? 1.5 : scale >= 2 ? 1.25 : 1;
        const sparks = [];
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 40 + Math.random() * 95;
            sparks.push({
                dx: Math.cos(angle) * dist,
                dy: Math.sin(angle) * dist * 0.7 - 18,
                size: (6 + Math.random() * 10) * sizeScale,
                rot: Math.random() * 360,
                dur: 700 + Math.random() * 500,
                delay: Math.floor(Math.random() * 120),
                color: colors[(Math.random() * colors.length) | 0],
            });
        }

        const startTime = performance.now();
        runCelebrationCanvas(view, (now) => {
            ctx.clearRect(0, 0, view.w, view.h);
            let active = false;
            for (let i = 0; i < sparks.length; i++) {
                const sp = sparks[i];
                const elapsed = now - startTime - sp.delay;
                if (elapsed < 0) { active = true; continue; }
                const p = Math.min(1, elapsed / sp.dur);
                if (p < 1) active = true;
                const eased = 1 - Math.pow(1 - p, 2.2);
                const scalePulse = p < 0.3 ? 0.2 + (p / 0.3) * 0.8 : Math.max(0.1, 1 - ((p - 0.3) / 0.7) * 0.9);
                const x = originX + sp.dx * eased;
                const y = originY + sp.dy * eased;
                const r = sp.size * scalePulse;
                ctx.save();
                ctx.globalAlpha = Math.max(0, 1 - p * p);
                ctx.translate(x, y);
                ctx.rotate(((sp.rot + 220 * p) * Math.PI) / 180);
                const q = r * 0.38;
                ctx.fillStyle = sp.color;
                ctx.beginPath();
                ctx.moveTo(0, -r);
                ctx.quadraticCurveTo(q * 0.3, -q * 0.3, r, 0);
                ctx.quadraticCurveTo(q * 0.3, q * 0.3, 0, r);
                ctx.quadraticCurveTo(-q * 0.3, q * 0.3, -r, 0);
                ctx.quadraticCurveTo(-q * 0.3, -q * 0.3, 0, -r);
                ctx.fill();
                ctx.restore();
            }
            return active;
        }, 120);
    } catch (e) {
        console.error('sparkle error', e);
    }
}

// Runtime of the hearts effect, so the task exit can wait for it.
function risingHeartsRuntime() {
    const heartCount = Math.round(13 * celebrationAmountScale());
    return Math.min(2200, (heartCount - 1) * 20 + 1500) + 300;
}

function createRisingHearts(targetElement) {
    try {
        const rect = targetElement.getBoundingClientRect();
        const container = celebrationContainer();
        const scale = celebrationAmountScale();
        const heartScale = scale >= 4 ? 2.2 : scale >= 2 ? 1.5 : 1;
        const colors = ['#ff5c8a', '#ff80ab', '#f06292', '#ff4081', '#e91e63'];
        const heartCount = Math.round(13 * scale);
        for (let i = 0; i < heartCount; i++) {
            const el = document.createElement('span');
            el.className = 'canvasrefined-heart';
            const inner = document.createElement('span');
            inner.className = 'canvasrefined-heart-inner';
            inner.textContent = '\u2764';
            el.appendChild(inner);
            const size = (10 + Math.random() * 14) * heartScale;
            el.style.fontSize = size + 'px';
            inner.style.color = colors[Math.floor(Math.random() * colors.length)];
            el.style.left = Math.round(rect.left + rect.width * 0.14 + Math.random() * rect.width * 0.72) + 'px';
            el.style.top = Math.round(rect.top + rect.height - 8) + 'px';
            inner.style.textShadow = '0 1px 4px rgba(0,0,0,.25)';
            el.style.setProperty('--cr-hy', '-' + Math.round(90 + Math.random() * 150) + 'px');
            el.style.setProperty('--cr-hx', (10 + Math.random() * 22).toFixed(1) + 'px');
            el.style.setProperty('--cr-s', (0.8 + Math.random() * 0.7).toFixed(2));
            el.style.setProperty('--cr-rot', Math.round(6 + Math.random() * 8) + 'deg');
            el.style.setProperty('--cr-dur', (900 + Math.random() * 600) + 'ms');
            // Staggered delays; fill-mode "both" keeps each heart hidden until it starts.
            el.style.setProperty('--cr-cdelay', Math.round(i * (i < 3 ? 16 : 20)) + 'ms');
            container.appendChild(el);
        }
        setTimeout(() => { try { container.remove(); } catch (e) { /* ignore */ } }, 2400 + heartCount * 20);
        return risingHeartsRuntime();
    } catch (e) {
        console.error('hearts error', e);
    }
}

function createRocketCelebration(targetElement) {
    try {
        const container = celebrationContainer();
        const colors = ['#ffb74d', '#ff9800', '#ff7043', '#ffd54f', '#eceff1', '#ffcc80'];
        const flightMs = 1200;
        const scale = celebrationAmountScale();
        const start = performance.now();
        const flames = []; // tracked so expiry is swept in the same pass
        // Continuous emission: per-frame bursts saturated the pool cap and read as gaps.
        const flameRate = 26 * scale; // flames per second
        const sizeScale = scale >= 4 ? 3 : scale >= 2 ? 2.4 : scale >= 1 ? 1.8 : 1;
        // Cap = steady-state concurrent flames + headroom, so emission never gets throttled.
        const poolCap = Math.ceil(flameRate * 1.1) + 8;
        let emitAcc = 0;
        let lastEmit = start;
        let rafId = null;
        const tick = (now) => {
            let r;
            try { r = targetElement.getBoundingClientRect(); } catch (e) { r = null; }
            for (let i = flames.length - 1; i >= 0; i--) {
                if (now >= flames[i].expire) {
                    flames[i].el.remove();
                    flames.splice(i, 1);
                }
            }
            const gone = !r || r.width === 0 || r.bottom < -110 || r.top > window.innerHeight + 110;
            if (!gone && now - start < flightMs + 150) {
                const climb = Math.max(0.45, Math.min(1, (now - start) / 500)); // throttle ramps up after liftoff
                const dt = Math.min(0.1, (now - lastEmit) / 1000);
                lastEmit = now;
                emitAcc = Math.min(emitAcc + flameRate * dt, 3); // don't bank a backlog
                while (emitAcc >= 1 && flames.length < poolCap) {
                    emitAcc -= 1;
                    const size = (5 + Math.random() * 7) * sizeScale;
                    const life = (520 + Math.random() * 300) * (scale >= 4 ? 1.3 : 1);
                    const el = document.createElement('div');
                    el.className = 'canvasrefined-rocket-flame';
                    el.style.width = (size * (0.8 + climb * 0.4)).toFixed(1) + 'px';
                    el.style.height = (size * (1.4 + Math.random() * 1.2) * (0.8 + climb * 0.4)).toFixed(1) + 'px';
                    el.style.left = Math.round(r.left + r.width * (0.38 + Math.random() * 0.24)) + 'px';
                    el.style.top = Math.round(r.bottom - 4) + 'px';
                    el.style.background = colors[(Math.random() * colors.length) | 0];
                    // WAAPI so the flames animate on the compositor.
                    const fx = (Math.random() - 0.5) * 28 * scale;
                    const fy = 30 * scale;
                    el.animate([
                        { transform: 'translate(0px, 0px) scale(1)', opacity: 0.95 },
                        { transform: 'translate(' + fx.toFixed(1) + 'px, ' + fy + 'px) scale(0.15)', opacity: 0 }
                    ], { duration: Math.round(life), easing: 'ease-out', fill: 'forwards' });
                    container.appendChild(el);
                    flames.push({ el, expire: now + life + 120 });
                }
                rafId = requestAnimationFrame(tick);
            } else {
                setTimeout(() => { try { container.remove(); } catch (e) { /* ignore */ } }, 1100);
            }
        };
        rafId = requestAnimationFrame(tick);
    } catch (e) {
        console.error('rocket celebration error', e);
    }
}

// --- Celebration preview ---
// Runs the selected effect against a disposable fake card in the real todo list.
function runCelebrationPreview() {
    try {
        if (enabledCelebrationTypes().length === 0) return { ok: false, reason: "disabled" };

        const stale = document.getElementById("canvasrefined-celebration-preview");
        if (stale) stale.remove();

        // Reuse a real task row, dropped into the Due Today group when possible.
        const todayContainer = domContainers["0"];
        const listEl = document.getElementById("canvasrefined-todo-list");
        const onTasksTab = betterTodoFilter === "tasks" && todayContainer && todayContainer.wrapper.isConnected && listEl;
        const card = document.createElement("div");
        card.id = "canvasrefined-celebration-preview";
        card.className = "better-todo-assignment";
        card.style.overflowX = "hidden";
        card.innerHTML = `
		<div style="display:flex;align-items:center;gap:5px;width:100%;height:60px;background:var(--bcbackground-2);border-radius:5px;transition:all .4s ease;overflow:hidden;">
			<div style="width:40px;display:flex;align-items:center;justify-content:center;background-color:#56caf0;height:100%;border-radius:5px 0 0 5px;">
				<div style="width:20px;height:20px;display:flex;margin-left:5px;">
					<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
						<path d="M1468.214 0v551.145L840.27 1179.089c-31.623 31.623-49.693 74.54-49.693 119.715v395.289h395.288c45.176 0 88.093-18.07 119.716-49.694l162.633-162.633v438.206H0V0h1468.214Zm129.428 581.3c22.137-22.136 57.825-22.136 79.962 0l225.879 225.879c22.023 22.023 22.023 57.712 0 79.848l-677.638 677.637c-10.616 10.503-24.96 16.49-39.98 16.49H903.516v-282.35c0-15.02 5.986-29.364 16.49-39.867Zm-920.005 548.095H338.82v112.94h338.818v-112.94Zm225.88-225.879H338.818v112.94h564.697v-112.94Zm734.106-202.5-89.561 89.56 146.03 146.031 89.562-89.56-146.031-146.031Zm-508.228-362.197H338.82v338.818h790.576V338.82Z" fill-rule="evenodd"></path>
					</svg>
				</div>
			</div>
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;position:relative;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">Celebration preview</span>
					<span style="color:inherit;text-decoration:none;font-weight:bold;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;padding-right:28px;margin-top:-5px;">Sample task</span>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">Due today</span>
				</div>
			</div>
		</div>`;

        let restoreWrapper = null;
        if (onTasksTab) {
            const groupList = todayContainer.wrapper.querySelector(".todo-group-list");
            if (groupList) groupList.insertBefore(card, groupList.firstChild);
            // Force Due Today visible and remember its state so the empty header doesn't linger.
            restoreWrapper = {
                wrapper: todayContainer.wrapper,
                display: todayContainer.wrapper.style.display,
                hadVisible: todayContainer.wrapper.hasAttribute("data-has-visible"),
            };
            todayContainer.wrapper.style.display = "block";
            todayContainer.wrapper.setAttribute("data-has-visible", "true");
        } else {
            card.style.cssText += "position:fixed;top:70px;right:16px;width:300px;z-index:2147483646;box-shadow:0 2px 10px rgba(0,0,0,.25);";
            document.body.appendChild(card);
        }

        // Mirror a real completion: effect plus matching exit, honouring the lead-in.
        const celebration = runCelebration(card);
        if (celebration.start) {
            const startFn = celebration.start;
            setTimeout(() => { if (card.isConnected) startFn(); }, celebration.startDelay || 0);
        }
        applyTodoExitAnimation(card, celebration.style, celebration.delay);
        setTimeout(() => {
            try { card.remove(); } catch (e) { /* ignore */ }
            if (restoreWrapper) {
                try {
                    restoreWrapper.wrapper.style.display = restoreWrapper.display;
                    if (!restoreWrapper.hadVisible) restoreWrapper.wrapper.removeAttribute("data-has-visible");
                } catch (e) { /* wrapper re-rendered away already */ }
            }
        }, celebrationExitDuration(celebration.style, celebration.delay) + 120);
        return { ok: true };
    } catch (e) {
        console.error("celebration preview error", e);
        return { ok: false, reason: "error" };
    }
}

// --- Local "incomplete" pins ---
// Canvas can't un-submit, so submitted items are pinned back into Tasks locally.
function todoPinKey(item) {
    return item.plannable_type + "_" + item.plannable_id;
}
function isPinnedIncomplete(item) {
    return options.todo_force_incomplete?.[todoPinKey(item)] === true;
}
function setPinnedIncomplete(item, pinned) {
    const pins = Object.assign({}, options.todo_force_incomplete || {});
    if (pinned) pins[todoPinKey(item)] = true;
    else delete pins[todoPinKey(item)];
    options.todo_force_incomplete = pins;
    chrome.storage.sync.set({ todo_force_incomplete: pins });
}

// opts.celebrate === false suppresses the celebration (announcement "mark as seen").
function markAs(item, element, makeComplete, opts = {}) {
	const csrfToken = CSRFtoken();
	const completeState = makeComplete;

    // Pre-click state, for rollback if the server refuses the change.
    const previousComplete = item.planner_override ? item.planner_override.marked_complete === true : false;
    const hadPin = isPinnedIncomplete(item);

    // Checking off clears a pin; unchecking a submitted item sets one.
    if (completeState) {
        if (isPinnedIncomplete(item)) setPinnedIncomplete(item, false);
    } else if (item.submissions?.submitted) {
        setPinnedIncomplete(item, true);
    }

    // --- Optimistic UI ---
    // Canvas sometimes 400s even though the change lands: update the UI now, persist later.
    item.planner_override = item.planner_override || {};
    item.planner_override.marked_complete = completeState;

    // Cancel timers left by a previous markAs on this element (fast double-click).
    element.__crCelebrationCancelled = true;
    if (element.__crExitTimer) { clearTimeout(element.__crExitTimer); element.__crExitTimer = null; }
    if (element.__crCelebTimer) { clearTimeout(element.__crCelebTimer); element.__crCelebTimer = null; }
    element.__crCelebrationCancelled = false;

    // Celebrate before the exit moves the element: effects measure its rect.
    let exitStyle = "slide";
    let exitDelay = 0;
    if (completeState && opts.celebrate !== false) {
        try {
            const celebration = runCelebration(element);
            exitStyle = celebration.style;
            exitDelay = celebration.delay || 0;
            if (celebration.start) {
                const startFn = celebration.start;
                const fire = () => {
                    if (element.__crCelebrationCancelled === true || !element.isConnected) return;
                    startFn();
                };
                if (celebration.startDelay > 0) {
                    if (element.__crCelebTimer) clearTimeout(element.__crCelebTimer);
                    element.__crCelebTimer = setTimeout(() => {
                        element.__crCelebTimer = null;
                        fire();
                    }, celebration.startDelay);
                } else {
                    fire();
                }
            }
        } catch (e) { console.error('celebration trigger error', e); }
    }

    applyTodoExitAnimation(element, exitStyle, exitDelay);

    // Update progress rings now so they animate along with the exit.
    const refreshProgressRings = () => {
        const progressPlaceholder = document.getElementById("better-todo-progress-placeholder");
        if (!progressPlaceholder || typeof assignments?.then !== 'function' || !progressRingsEnabled()) return;
        assignments.then(data => {
            const courseId = getCurrentCourseId();
            const scopedData = getTodoScopedData(data.map(d => Object.assign({}, d)), courseId);

            for (let i = 0; i < scopedData.length; i++) {
                if (scopedData[i].plannable_id === item.plannable_id && scopedData[i].plannable_type === item.plannable_type) {
                    scopedData[i].planner_override = scopedData[i].planner_override || {};
                    scopedData[i].planner_override.marked_complete = item.planner_override.marked_complete;
                    break;
                }
            }
            if (options.hide_personal_details === true && options.anon_fake_todo === true) {
                scopedData.push(...buildFakeTodoItems());
            }

            renderProgressRings(progressPlaceholder, scopedData);
        });
    };
    refreshProgressRings();

    // --- Failure rollback ---
    // Restore the pre-click state when the server refuses: soft-deleted override rows are
    // invisible to the read endpoints yet still block the POST with 400 "already exists".
    const revertOptimisticUI = (reason) => {
        item.planner_override = item.planner_override || {};
        item.planner_override.marked_complete = previousComplete;
        if (completeState) {
            if (hadPin) setPinnedIncomplete(item, true);
        } else if (item.submissions?.submitted && !hadPin) {
            setPinnedIncomplete(item, false);
        }
        console.warn("planner override not persisted, reverting UI:", reason);
        // Snap the card back and undo any exit animation still applied to it.
        element.style.transform = "";
        element.style.opacity = "";
        element.style.transition = "";
        element.style.visibility = "";
        element.classList.remove("canvasrefined-rocket-exit");
        element.__crCelebrationCancelled = true;
        if (element.__crExitTimer) {
            clearTimeout(element.__crExitTimer);
            element.__crExitTimer = null;
        }
        if (element.__crCelebTimer) {
            clearTimeout(element.__crCelebTimer);
            element.__crCelebTimer = null;
        }
        if (element.__crRocketClone) {
            try { element.__crRocketClone.remove(); } catch (e) { /* ignore */ }
            element.__crRocketClone = null;
        }
        const loc = document.querySelector("#canvasrefined-todo-list");
        if (loc) { clearTodoList(); createTodoSections(loc); }
        refreshProgressRings();
    };

    setTimeout(() => {
        clearTodoList();
        createTodoSections(document.querySelector("#canvasrefined-todo-list"));
    }, celebrationExitDuration(exitStyle, exitDelay));

    // --- Persistence (background, best-effort) ---
    // Store the override id so later toggles PUT instead of POSTing a duplicate.
    const sendOverride = (override) => pageFetch(domain + "/api/v1/planner/overrides" + (override && override.id ? "/" + override.id : ""), {
        method: override && override.id ? "PUT" : "POST",
        headers: {
            "content-type": "application/json",
            "accept": "application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
            id: override && override.id ? override.id : null,
            marked_complete: completeState,
            plannable_id: item.plannable_id,
            plannable_type: item.plannable_type
        })
    });

    // Every active override, following the Link header. Soft-deleted rows are unlistable
    // but still block POST with 400, hence the PUT retry. Returns null on failure.
    const fetchAllOverrides = async () => {
        const all = [];
        let url = domain + "/api/v1/planner/overrides?per_page=100";
        for (let page = 0; page < 10 && url; page++) {
            const pageResp = await pageFetch(url, { headers: { "accept": "application/json" } });
            if (!pageResp.ok) return null;
            const data = await pageResp.json();
            if (!Array.isArray(data)) return null;
            all.push(...data);
            url = getNextPageUrl(pageResp.headers.get("Link"));
        }
        return all;
    };

    // Canvas re-points overrides on save, so fall back to matching assignment_id.
    const matchesItem = (o) => {
        if (!o) return false;
        if (String(o.plannable_id) === String(item.plannable_id) &&
            String(o.plannable_type).toLowerCase() === String(item.plannable_type).toLowerCase()) return true;
        const assignmentId = item.plannable && item.plannable.assignment_id != null
            ? item.plannable.assignment_id
            : (item.plannable_type === "assignment" ? item.plannable_id : null);
        return assignmentId != null && o.assignment_id != null && String(o.assignment_id) === String(assignmentId);
    };

    sendOverride(item.planner_override)
    .then(async resp => {
        if (resp.ok) {
            // Keep the id: without it every later toggle POSTs a duplicate and 400s.
            try {
                const saved = await resp.json();
                if (saved && saved.id) {
                    item.planner_override = item.planner_override || {};
                    item.planner_override.id = saved.id;
                }
            } catch (e) { /* no JSON body; id stays unknown */ }
            console.log("marked as complete");
            return;
        }
        // No known id: look the item's override up and retry as a PUT.
        if (!(item.planner_override && item.planner_override.id)) {
            try {
                const overrides = await fetchAllOverrides();
                const match = overrides && overrides.find(matchesItem);
                if (match && match.id) {
                    item.planner_override = item.planner_override || {};
                    item.planner_override.id = match.id;
                    const retry = await sendOverride(item.planner_override);
                    if (retry.ok) {
                        try {
                            const saved = await retry.json();
                            if (saved && saved.id) item.planner_override.id = saved.id;
                        } catch (e) { /* id stays unknown */ }
                        console.log("marked as complete (recovered override id)");
                        return;
                    }
                    console.warn("planner override PUT retry returned", retry.status);
                    return revertOptimisticUI("PUT retry returned " + retry.status);
                }
                return revertOptimisticUI("POST returned " + resp.status + " and no matching override was found");
            } catch (e) {
                console.error("error recovering planner override id", e);
                return revertOptimisticUI("override recovery failed: " + e);
            }
        }
        return revertOptimisticUI("request returned " + resp.status);
    })
    .catch(err => {
        console.error("error marking as complete", err);
        revertOptimisticUI(err);
    });

}

function createTodoViewMore(location, type) {
    let viewMoreButton = makeElement("button", location, { "className": "canvasrefined-custom-btn canvasrefined-viewmore-btn", "textContent": chrome.i18n.getMessage("view_more") || "View More" });
    const showMoreCount = 3;
    viewMoreButton.addEventListener("click", function (e) {
        if (type === "announcement") {
            moreAnnouncementCount += showMoreCount;
        } else {
            moreAssignmentCount += showMoreCount;
        }
        loadBetterTodo();
    });
}

function setupBetterTodo() {
    if (isQuizPage()) return;
    // Only the dashboard and course homepages get the todo sidebar.
    if (!isTodoAllowedPage()) return;
    if (options.better_todo !== true || isGradesPage()) return;
    if (document.querySelector('#canvasrefined-todo-list')) return;
    // `assignments` may not be set yet; bail and let checkDashboardReady call us again.
    if (!assignments || typeof assignments.then !== "function") return;
    let list = document.querySelector("#right-side");
    if (!list) return;
    try {
        /* save the feedback to append it later */
        const feedback = list.querySelector(".events_list.recent_feedback");

        list.textContent = "";
        list = makeElement("div", list, { "className": "canvasrefined-todosidebar","id": "canvasrefined-todo-list"});
        createTodoSections(list);

        if (feedback) list.append(feedback);

    } catch (e) {
        logError(e);
    }
}

function getSidebarScale() {
    const rawScale = parseInt(options.sidebar_scale || 100);
    if (isNaN(rawScale)) return 1;
    return Math.max(0.7, Math.min(1.5, rawScale / 100));
}

function applySidebarScaleStyles(sidebarList) {
    const scale = getSidebarScale();
    sidebarList.style.setProperty("--bc-sidebar-icon-size", `${Math.round(20 * scale)}px`);
    sidebarList.style.setProperty("--bc-sidebar-btn-height", `${Math.round(30 * scale)}px`);
    sidebarList.style.setProperty("--bc-sidebar-btn-gap", `${Math.round(8 * scale)}px`);
    sidebarList.style.setProperty("--bc-sidebar-label-size", `${Math.round(14 * scale)}px`);
}

// --- Mobile global-nav tray (Better Sidebar styling) ---
// Below Canvas' breakpoint the nav is an InstUI tray dialog, so restyle it to match the
// rail. Selectors use stable attributes, not emotion hashes.
function setupMobileNavStyle() {
    let style = document.getElementById("canvasrefined-mobile-nav") || document.createElement("style");
    style.id = "canvasrefined-mobile-nav";
    if (!options.better_sidebar) {
        style.remove();
        return;
    }
    const sidebarOpacity = Math.max(0, Math.min(100, Number(options.sidebar_opacity ?? 100)));
    const sidebarBlur = Math.max(0, Math.min(30, Number(options.sidebar_blur ?? 0)));
    const sidebarTransparent = 100 - sidebarOpacity;
    const dialog = '[role="dialog"][aria-label="Global Navigation"]';
    style.textContent = `
        /* tray wrapper: fixed drawer width instead of InstUI's inline width */
        span:has(> ${dialog}) {
            width: min(320px, 90vw) !important;
            max-width: 90vw !important;
        }
        /* same glass surface as the Better Sidebar rail */
        ${dialog} {
            background: color-mix(in srgb, var(--bcsidebar), transparent ${sidebarTransparent}%) !important;
            backdrop-filter: blur(${sidebarBlur}px) !important;
            -webkit-backdrop-filter: blur(${sidebarBlur}px) !important;
            border-right: 1px solid color-mix(in srgb, var(--bcsidebar-text) 10%, transparent) !important;
            border-radius: 0 16px 16px 0 !important;
            box-shadow: 8px 0 40px rgba(0, 0, 0, .28) !important;
            color: var(--bcsidebar-text) !important;
        }
        /* recolor labels/icons/arrows to sidebar text; fill + currentColor both */
        ${dialog} svg {
            fill: var(--bcsidebar-text) !important;
        }
        ${dialog} a,
        ${dialog} span[class*="-text"],
        ${dialog} h2[class*="-heading"],
        ${dialog} h2[class*="-heading"] a {
            color: var(--bcsidebar-text) !important;
            text-decoration: none !important;
        }
        /* hide the big institution logo so the header collapses to the close button */
        ${dialog} .ic-brand-mobile-global-nav-logo {
            display: none !important;
        }
        /* rows: padded, rounded, same hover tint as the rail */
        ${dialog} li[data-cid="ListItem"] > a,
        ${dialog} li[data-cid="ListItem"] > div[data-cid="ToggleDetails"] > button {
            padding: 12px 14px !important;
            border-radius: 10px !important;
            transition: background-color .15s ease !important;
        }
        ${dialog} li[data-cid="ListItem"] > a:hover,
        ${dialog} li[data-cid="ListItem"] > a:focus-visible,
        ${dialog} li[data-cid="ListItem"] > div[data-cid="ToggleDetails"] > button:hover,
        ${dialog} li[data-cid="ListItem"] > div[data-cid="ToggleDetails"] > button:focus-visible {
            background: #0000004f !important;
        }
        /* expanded sub-items, indented like the rail's section links */
        ${dialog} div[id^="Expandable"] a {
            padding: 10px 14px 10px 40px !important;
            border-radius: 10px !important;
            opacity: .92;
            transition: background-color .15s ease !important;
        }
        ${dialog} div[id^="Expandable"] a:hover,
        ${dialog} div[id^="Expandable"] a:focus-visible {
            background: #0000004f !important;
        }
        /* close button: bare glass circle (data-cid holds several tokens) */
        ${dialog} button[data-cid*="BaseButton"] {
            background: color-mix(in srgb, var(--bcsidebar-text) 12%, transparent) !important;
            border-radius: 999px !important;
            color: var(--bcsidebar-text) !important;
            transition: background-color .15s ease !important;
        }
        ${dialog} button[data-cid*="BaseButton"]:hover {
            background: color-mix(in srgb, var(--bcsidebar-text) 22%, transparent) !important;
        }
        /* avatar ring so it reads on the glass */
        ${dialog} [class*="-avatar"] {
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--bcsidebar-text) 30%, transparent) !important;
        }
        /* theme-tinted thin scrollbar */
        ${dialog} ::-webkit-scrollbar { width: 8px; height: 8px; }
        ${dialog} ::-webkit-scrollbar-track { background: transparent; }
        ${dialog} ::-webkit-scrollbar-thumb {
            background: color-mix(in srgb, var(--bcsidebar-text) 30%, transparent);
            border-radius: 999px;
        }
    `;
    // Hide the mobile context nav with the same "Hide Navigation Bar" gate as the rail.
    if (options.hide_navbar === true) {
        style.textContent += `
            #mobileContextNavContainer,
            button.mobile-header-arrow {
                display: none !important;
            }
        `;
    }
    if (!style.isConnected) document.documentElement.append(style);
}

// Re-apply the tinted content panel when the opacity or blur slider changes.
function applyBetterSidebarContentPanel() {
    if (!options.better_sidebar) return;
    if (getSidebarLayoutMode() !== "course") return;
    const contentMain = document.querySelector(".ic-Layout-contentMain");
    if (!contentMain) return;
    const bgOpacity = Math.max(0, Math.min(100, Number(options.bg_opacity ?? 65)));
    const bgBlur = Math.max(0, Math.min(30, Number(options.bg_blur ?? 8)));
    contentMain.style.setProperty("background", `color-mix(in srgb, var(--bcbackground-0) ${bgOpacity}%, transparent)`, "important");
    contentMain.style.setProperty("backdrop-filter", `blur(${bgBlur}px)`, "important");
    contentMain.style.setProperty("-webkit-backdrop-filter", `blur(${bgBlur}px)`, "important");
}

async function setupBetterSidebar(mode = getSidebarLayoutMode()) {
    if (!options.better_sidebar) return;
    if (document.querySelector('#better-sidebar-container')) return;
    let wrapper = document.querySelector("#wrapper");
    if (!wrapper || betterSidebarLoading) return;
    betterSidebarLoading = true;
    try {
        const layoutMode = mode === "course" || mode === "dash" ? mode : getSidebarLayoutMode();
        let expanded = await getSidebarExpandedState(layoutMode);
        const outerWrapper = document.getElementById("main");
        outerWrapper?.style.setProperty("display", "flex", "important");
        const leftSide = document.getElementById("left-side");
        leftSide?.style.setProperty("opacity", "1");
        leftSide?.style.setProperty("position", "static");
        const mainWrapper = document.querySelector(".ic-Layout-contentWrapper");
        if (!mainWrapper) return;
        applyBetterSidebarLayoutFix();
        mainWrapper.style.display = "flex";
        mainWrapper.style.alignItems = "stretch";
        mainWrapper.style.minWidth = "0";
        const contentMain = document.querySelector(".ic-Layout-contentMain");
        contentMain?.style.setProperty("flex", "1 1 auto");
        contentMain?.style.setProperty("min-width", "0");
        const notRightSide = document.getElementById("not_right_side");
        if (notRightSide && isAccountsPage()) {
            notRightSide.style.setProperty("width", "100%");
            notRightSide.style.setProperty("max-width", "100%");
            notRightSide.style.setProperty("min-width", "0");
        }
        if (layoutMode === "course" && leftSide) {
            const rightSideWrapper = document.getElementById("right-side-wrapper");
            const sectionTabs = document.getElementById("section-tabs");
            leftSide.style.setProperty("padding-top", "0", "important");
            leftSide.style.setProperty("padding-left", "0", "important");
            if (sectionTabs) {
                if (getCurrentCourseId() !== null || isProfilePage()) {
                    sectionTabs.style.setProperty("padding-top", "40px", "important");
                } else {
                    sectionTabs.style.removeProperty("padding-top");
                }
            }
            leftSide.style.flex = "0 0 250px";
            leftSide.style.width = "250px";
            leftSide.style.maxWidth = "250px";
            if (notRightSide) {
                notRightSide.style.display = "flex";
                notRightSide.style.flex = "1 1 auto";
                notRightSide.style.minWidth = "0";
            }
            if (rightSideWrapper) {
                rightSideWrapper.style.flex = "0 0 280px";
                rightSideWrapper.style.width = "280px";
                rightSideWrapper.style.maxWidth = "280px";
            }
            contentMain?.style.setProperty("margin", "26px 38px 38px", "important");
            contentMain?.style.setProperty("padding", "10px", "important");
            contentMain?.style.setProperty("border-radius", "10px", "important");
            contentMain?.style.setProperty("background", `color-mix(in srgb, var(--bcbackground-0) ${Math.max(0, Math.min(100, Number(options.bg_opacity ?? 65)))}%, transparent)`, "important");
            contentMain?.style.setProperty("backdrop-filter", `blur(${Math.max(0, Math.min(30, Number(options.bg_blur ?? 8)))}px)`, "important");
            contentMain?.style.setProperty("-webkit-backdrop-filter", `blur(${Math.max(0, Math.min(30, Number(options.bg_blur ?? 8)))}px)`, "important");
        }
        // Prepending keeps the order [rail][native nav], so the native column can't render left of it.
        const sidebarParent = leftSide ? leftSide : mainWrapper;
        if (leftSide) {
            leftSide.style.display = "flex";
            leftSide.style.flexDirection = "row";
            leftSide.style.alignItems = "stretch";
            leftSide.style.minWidth = "0";
            leftSide.style.gap = "0";
        }
        // Only when "Hide Navigation Bar" is on.
        if (options.hide_navbar === true) {
            document.querySelector(".ic-app-nav-toggle-and-crumbs")?.style.setProperty("display", "none");
        }
        if (layoutMode == "dash") {
            document.getElementById("header")?.style.setProperty("display", "none");
        }
        else if (layoutMode == "course") {
            document.getElementById("header")?.style.setProperty("display", "none");
        }

        let sidebarList = makeElement("div", sidebarParent, { id: "better-sidebar-container",
            style: `display:flex;flex-direction:column;width:50px;justify-content:center;align-items:center;box-sizing:border-box;position:relative;background-color:var(--bcsidebar);height:100vh;position:sticky;top:0;left:0;`
        }, true);
        let sidebarContent = makeElement("div", sidebarList, {
            style: "display:flex;flex-direction:column;gap:20px;width:100%;flex:1;justify-content:flex-start;align-items:center;margin:40px;"
        });
        applySidebarScaleStyles(sidebarList);
        let expander = makeElement("div", sidebarList, {
            className: "better-sidebar-expander",
            style: "display:flex;flex-direction:column;gap:0px;margin-top:auto;width:100%;justify-content:center;align-items:center;cursor:pointer;",
        });
        expander.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:30px;height:30px;transition:all .3s ease;">
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                    <path d="M20 4V20M4 12H16M16 12L12 8M16 12L12 16" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </g>
            </svg>
        `
        sidebarList.dataset.expanded = expanded ? "true" : "false";
        updateSidebar(expanded, sidebarList, expander);
        setSidebarExpandedState(layoutMode, expanded);
        requestAnimationFrame(() => {
            populateSidebarFromNav(sidebarContent);
            updateSidebar(expanded, sidebarList, expander);
            watchSidebarBadges();
        });

        expander.addEventListener("click", () => {
            expanded = !expanded;
            sidebarList.dataset.expanded = expanded ? "true" : "false";
            setSidebarExpandedState(layoutMode, expanded);
            updateSidebar(expanded, sidebarList, expander);
        })
    } catch (e) {
        logError(e);
    } finally {
        betterSidebarLoading = false;
    }
}
function createSidebarButton(text, url, parent, icon) {
	let button = makeElement("a", parent, {
        style: "width:40%;height:var(--bc-sidebar-btn-height,30px);cursor:pointer;text-align:center;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:var(--bc-sidebar-btn-gap,8px);color:var(--bcsidebar-text) !important;font-weight:bold;position:relative;",
		className: "canvasrefined-custom-btn better-sidebar-btn",
		href: url,
	});
    button.innerHTML = `${icon ? `${icon}<span class="better-sidebar-label" style="font-size:var(--bc-sidebar-label-size,14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${text}</span>` : `<span class="better-sidebar-label" style="font-size:var(--bc-sidebar-label-size,14px);">${text}</span>`}`;
    return button;
}

function getNavBadgeCount(item) {
    const badge = item.querySelector(".menu-item__badge");
    if (!badge) return 0;
    const badgeText = badge.querySelector('[aria-hidden="true"]')?.textContent?.trim() || badge.textContent?.trim() || "";
    const count = parseInt(badgeText, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
}

function addSidebarButtonBadge(button, count) {
    if (!button) return;
    button.querySelector(".better-sidebar-badge")?.remove();
    if (!count) return;
    makeElement("div", button, {
        className: "better-sidebar-badge",
        style: "position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background-color:#ff0000;color:white;font-size:11px;line-height:16px;display:flex;justify-content:center;align-items:center;box-sizing:border-box;pointer-events:none;",
        textContent: String(count),
    });
}

// Re-read nav badges: Canvas loads unread counts after render, so build-time dots go stale.
function syncSidebarBadges() {
    document.querySelectorAll(".better-sidebar-btn").forEach(button => {
        const navId = button.dataset.navItemId;
        if (!navId) return;
        const navItem = document.getElementById(navId);
        if (!navItem) return;
        addSidebarButtonBadge(button, getNavBadgeCount(navItem));
    });
}

function scheduleSidebarBadgeSync() {
    if (sidebarBadgeSyncTimer) clearTimeout(sidebarBadgeSyncTimer);
    sidebarBadgeSyncTimer = setTimeout(() => {
        sidebarBadgeSyncTimer = null;
        syncSidebarBadges();
    }, 100);
}

// Keep the sidebar dots in sync with the nav badges.
function watchSidebarBadges() {
    const navMenu = document.getElementById("menu");
    if (!navMenu) {
        if (sidebarBadgeWatchRetries++ < 20) setTimeout(watchSidebarBadges, 500);
        return;
    }
    sidebarBadgeWatchRetries = 0;
    if (sidebarBadgeObserver) sidebarBadgeObserver.disconnect();
    sidebarBadgeObserver = new MutationObserver(scheduleSidebarBadgeSync);
    sidebarBadgeObserver.observe(navMenu, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    scheduleSidebarBadgeSync();
}
function populateSidebarFromNav(sidebarContent) {
	const excludeIds = ["global_nav_help_link", "global_nav_history_link"];
	const customIcons = {
		"global_nav_profile_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="var(--bcsidebar-text)"></path></g></svg>`,
		"global_nav_dashboard_link": `<svg fill="var(--bcsidebar-text)" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><rect x="2" y="2" width="9" height="11" rx="2"></rect><rect x="13" y="2" width="9" height="7" rx="2"></rect><rect x="2" y="15" width="9" height="7" rx="2"></rect><rect x="13" y="11" width="9" height="11" rx="2"></rect></g></svg>`,
		"global_nav_conversations_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M4 18L9 12M20 18L15 12M3 8L10.225 12.8166C10.8665 13.2443 11.1872 13.4582 11.5339 13.5412C11.8403 13.6147 12.1597 13.6147 12.4661 13.5412C12.8128 13.4582 13.1335 13.2443 13.775 12.8166L21 8M6.2 19H17.8C18.9201 19 19.4802 19 19.908 18.782C20.2843 18.5903 20.5903 18.2843 20.782 17.908C21 17.4802 21 16.9201 21 15.8V8.2C21 7.0799 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V15.8C3 16.9201 3 17.4802 3.21799 17.908C3.40973 18.2843 3.71569 18.5903 4.09202 18.782C4.51984 19 5.07989 19 6.2 19Z" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>`,
		"global_nav_calendar_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M3 9H21M7 3V5M17 3V5M6 12H8M11 12H13M16 12H18M6 15H8M11 15H13M16 15H18M6 18H8M11 18H13M16 18H18M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round"></path></g></svg>`,
		"global_nav_courses_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M20 12V4C20 2.89543 19.1046 2 18 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V18.5" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M13 2V14L16.8182 11L20 14V5" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>`,
		"global_nav_groups_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M16 6C14.3432 6 13 7.34315 13 9C13 10.6569 14.3432 12 16 12C17.6569 12 19 10.6569 19 9C19 7.34315 17.6569 6 16 6ZM11 9C11 6.23858 13.2386 4 16 4C18.7614 4 21 6.23858 21 9C21 10.3193 20.489 11.5193 19.6542 12.4128C21.4951 13.0124 22.9176 14.1993 23.8264 15.5329C24.1374 15.9893 24.0195 16.6114 23.5631 16.9224C23.1068 17.2334 22.4846 17.1155 22.1736 16.6591C21.1979 15.2273 19.4178 14 17 14C13.166 14 11 17.0742 11 19C11 19.5523 10.5523 20 10 20C9.44773 20 9.00001 19.5523 9.00001 19C9.00001 18.308 9.15848 17.57 9.46082 16.8425C9.38379 16.7931 9.3123 16.7323 9.24889 16.6602C8.42804 15.7262 7.15417 15 5.50001 15C3.84585 15 2.57199 15.7262 1.75114 16.6602C1.38655 17.075 0.754692 17.1157 0.339855 16.7511C-0.0749807 16.3865 -0.115709 15.7547 0.248886 15.3398C0.809035 14.7025 1.51784 14.1364 2.35725 13.7207C1.51989 12.9035 1.00001 11.7625 1.00001 10.5C1.00001 8.01472 3.01473 6 5.50001 6C7.98529 6 10 8.01472 10 10.5C10 11.7625 9.48013 12.9035 8.64278 13.7207C9.36518 14.0785 9.99085 14.5476 10.5083 15.0777C11.152 14.2659 11.9886 13.5382 12.9922 12.9945C11.7822 12.0819 11 10.6323 11 9ZM3.00001 10.5C3.00001 9.11929 4.1193 8 5.50001 8C6.88072 8 8.00001 9.11929 8.00001 10.5C8.00001 11.8807 6.88072 13 5.50001 13C4.1193 13 3.00001 11.8807 3.00001 10.5Z" fill="var(--bcsidebar-text)"></path></g></svg>`,
		"globalNavExternalTool-69": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 1C4.34315 1 3 2.34315 3 4V17V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V17V4C21 2.34315 19.6569 1 18 1H6ZM5 20V17C5 16.4477 5.44772 16 6 16H18C18.5523 16 19 16.4477 19 17V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20ZM18 14C18.3506 14 18.6872 14.0602 19 14.1707V4C19 3.44772 18.5523 3 18 3H6C5.44772 3 5 3.44772 5 4V14.1707C5.31278 14.0602 5.64936 14 6 14H18ZM14.5 19.25C15.1904 19.25 15.75 18.6904 15.75 18C15.75 17.3096 15.1904 16.75 14.5 16.75C13.8096 16.75 13.25 17.3096 13.25 18C13.25 18.6904 13.8096 19.25 14.5 19.25Z" fill="var(--bcsidebar-text)"></path></g></svg>`,
	};
	
	const navMenu = document.getElementById("menu");
    let hasDashboardButton = false;

    // Nav buttons go in ahead of the search trigger so Search stays last.
    const searchBtn = sidebarContent.querySelector("#canvasrefined-gs-sidebar-btn");
    const insertNavButton = (text, href, icon) => {
        const button = createSidebarButton(text, href, sidebarContent, icon);
        if (searchBtn && searchBtn.parentNode === sidebarContent) {
            sidebarContent.insertBefore(button, searchBtn);
        }
        return button;
    };

    if (navMenu) {
        const menuItems = navMenu.querySelectorAll("a[id^='global_nav'], .globalNavExternalTool a");
        menuItems.forEach(item => {
            const itemId = item.id;
            if (excludeIds.includes(itemId)) return;

            const href = item.getAttribute("href");
            let textEl = item.querySelector(".menu-item__text");
            let text = textEl?.textContent?.trim();
		
            if (!text) {
                text = item.getAttribute("aria-label")?.trim() || 
                        item.getAttribute("title")?.trim() || 
                        item.textContent?.trim();
            }
		
            if (!text || !href) return;

            let icon = customIcons[itemId] || "";
            if (!icon) {
                const svg = item.querySelector("svg");
                if (svg) {
                    icon = svg.outerHTML;
                    const viewBoxMatch = icon.match(/viewBox="([^"]+)"/);
                    if (viewBoxMatch) {
                        const [, viewBox] = viewBoxMatch;
                        const parts = viewBox.split(/\s+/);
                        const width = parseFloat(parts[2]);
                        const height = parseFloat(parts[3]);
                        if (width > 32 || height > 32) {
                            if (icon.includes('style="')) {
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 width:20px;height:20px;flex-shrink:0;fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"`);
                            } else {
                                icon = icon.replace("<svg", '<svg style="width:20px;height:20px;flex-shrink:0;fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"');
                            }
                        } else {
                            if (icon.includes('style="')) {
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);flex-shrink:0;"`);
                            } else {
                                icon = icon.replace("<svg", '<svg style="fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);flex-shrink:0;"');
                            }
                        }
                    } else {
                        if (icon.includes('style="')) {
                            icon = icon.replace(/style="([^"]*)"/, `style="$1 fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"`);
                        } else {
                            icon = icon.replace("<svg", '<svg style="fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"');
                        }
                    }
                }
            }

            if (itemId === "global_nav_dashboard_link") hasDashboardButton = true;
            const button = insertNavButton(text, href, icon);
            if (itemId) button.dataset.navItemId = itemId;
            addSidebarButtonBadge(button, getNavBadgeCount(item));
        });
    }

    if (!hasDashboardButton) {
        insertNavButton("Dashboard", `${domain}/`, customIcons["global_nav_dashboard_link"]);
    }
}
function updateSidebar(expanded, sidebarList, expander) {
    const scale = getSidebarScale();
    const expandedWidth = Math.round(150 * scale);
    const collapsedWidth = Math.round(50 * scale);
    sidebarList.style.width = expanded ? `${expandedWidth}px` : `${collapsedWidth}px`;
    applySidebarScaleStyles(sidebarList);

    expander.style.transform = expanded ? "rotate(180deg)" : "rotate(0deg)";
    expander.querySelector("svg").style.width = `${Math.round(30 * scale)}px`;
    expander.querySelector("svg").style.height = `${Math.round(30 * scale)}px`;
    const labels = document.querySelectorAll(".better-sidebar-label");
    labels.forEach(label => label.style.display = expanded ? "block" : "none");
    const buttons = document.querySelectorAll(".better-sidebar-btn");
    buttons.forEach(label => label.style.width = expanded ? "80%" : "40%");
    sidebarList.querySelectorAll(".better-sidebar-btn svg").forEach(svg => {
        svg.style.width = "var(--bc-sidebar-icon-size,20px)";
        svg.style.height = "var(--bc-sidebar-icon-size,20px)";
    });

    const leftSide = document.getElementById("left-side");
    if (leftSide) {
        if (!leftSide.dataset.bcOrigWidth) {
            const computed = getComputedStyle(leftSide).width || "";
            leftSide.dataset.bcOrigWidth = leftSide.style.width || "";
            leftSide.dataset.bcOrigFlex = leftSide.style.flex || "";
            leftSide.dataset.bcOrigMaxWidth = leftSide.style.maxWidth || "";
            leftSide.dataset.bcOrigWidthPx = parseFloat(computed) || 0;
        }

        const origPx = parseFloat(leftSide.dataset.bcOrigWidthPx || 0);
        const delta = expandedWidth - collapsedWidth;

        if (expanded) {
            if (origPx > 0) {
                const newWidth = Math.round(origPx + delta);
                leftSide.style.flex = `0 0 ${newWidth}px`;
                leftSide.style.width = `${newWidth}px`;
                leftSide.style.maxWidth = `${newWidth}px`;
            } else {
                leftSide.style.flex = `0 0 ${expandedWidth}px`;
                leftSide.style.width = `${expandedWidth}px`;
                leftSide.style.maxWidth = `${expandedWidth}px`;
            }
        } else {
            if (leftSide.dataset.bcOrigWidth !== "") leftSide.style.width = leftSide.dataset.bcOrigWidth; else leftSide.style.removeProperty('width');
            if (leftSide.dataset.bcOrigFlex !== "") leftSide.style.flex = leftSide.dataset.bcOrigFlex; else leftSide.style.removeProperty('flex');
            if (leftSide.dataset.bcOrigMaxWidth !== "") leftSide.style.maxWidth = leftSide.dataset.bcOrigMaxWidth; else leftSide.style.removeProperty('max-width');
        }
    }

    const courseLinksTitle = document.getElementById("better-course-links-title");
    if (courseLinksTitle) {
        courseLinksTitle.style.display = expanded ? "block" : "none";
        const separator = courseLinksTitle.nextElementSibling;
        if (separator) separator.style.display = expanded ? "block" : "none";
        
        const container = document.getElementById("better-course-links");
        if (container) {
            container.style.opacity = expanded ? "1" : "0.6";
            container.style.gap = expanded ? "12px" : "8px";
        }
    }
}

let delay;
let moreAssignmentCount = 0;
let moreAnnouncementCount = 0;
let filter = "todo";
async function loadBetterTodo() {
    if (options.better_todo !== true || isGradesPage()) return;
    try {
        await getColors();
        const discussion_svg = '<svg class="canvasrefined-todo-svg" name="IconDiscussion" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><path d="M677.647059,16 L677.647059,354.936471 L790.588235,354.936471 L790.588235,129.054118 L1807.05882,129.054118 L1807.05882,919.529412 L1581.06353,919.529412 L1581.06353,1179.29412 L1321.41176,919.529412 L1242.24,919.529412 L1242.24,467.877647 L677.647059,467.877647 L0,467.877647 L0,1484.34824 L338.710588,1484.34824 L338.710588,1903.24706 L756.705882,1484.34824 L1242.24,1484.34824 L1242.24,1032.47059 L1274.99294,1032.47059 L1694.11765,1451.59529 L1694.11765,1032.47059 L1920,1032.47059 L1920,16 L677.647059,16 Z M338.789647,919.563294 L903.495529,919.563294 L903.495529,806.622118 L338.789647,806.622118 L338.789647,919.563294 Z M338.789647,1145.44565 L677.726118,1145.44565 L677.726118,1032.39153 L338.789647,1032.39153 L338.789647,1145.44565 Z M112.941176,580.705882 L1129.41176,580.705882 L1129.41176,1371.40706 L710.4,1371.40706 L451.651765,1631.05882 L451.651765,1371.40706 L112.941176,1371.40706 L112.941176,580.705882 Z" fill-rule="evenodd" stroke="none" stroke-width="1"></path></g></svg>';
        const quiz_svg = '<svg class="canvasrefined-todo-svg" label="Quiz" name="IconQuiz" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><g fill-rule="evenodd" stroke="none" stroke-width="1"><path d="M746.255375,1466.76417 L826.739372,1547.47616 L577.99138,1796.11015 L497.507383,1715.51216 L746.255375,1466.76417 Z M580.35118,1300.92837 L660.949178,1381.52637 L329.323189,1713.15236 L248.725192,1632.55436 L580.35118,1300.92837 Z M414.503986,1135.20658 L495.101983,1215.80457 L80.5979973,1630.30856 L0,1549.71056 L414.503986,1135.20658 Z M1119.32036,264.600006 C1475.79835,-91.8779816 1844.58834,86.3040124 1848.35034,88.1280123 L1848.35034,88.1280123 L1865.45034,96.564012 L1873.88634,113.664011 C1875.71034,117.312011 2053.89233,486.101999 1697.30034,842.693987 L1697.30034,842.693987 L1550.69635,989.297982 L1548.07435,1655.17196 L1325.43235,1877.81395 L993.806366,1546.30196 L415.712386,968.207982 L84.0863971,636.467994 L306.72839,413.826001 L972.602367,411.318001 Z M1436.24035,1103.75398 L1074.40436,1465.70397 L1325.43235,1716.61796 L1434.30235,1607.74796 L1436.24035,1103.75398 Z M1779.26634,182.406009 C1710.18234,156.41401 1457.90035,87.1020124 1199.91836,345.198004 L1199.91836,345.198004 L576.90838,968.207982 L993.806366,1385.10597 L1616.70235,762.095989 C1873.65834,505.139998 1804.68834,250.920007 1779.26634,182.406009 Z M858.146371,525.773997 L354.152388,527.597997 L245.282392,636.467994 L496.310383,887.609985 L858.146371,525.773997 Z"></path><path d="M1534.98715,372.558003 C1483.91515,371.190003 1403.31715,385.326002 1321.69316,466.949999 L1281.22316,507.305998 L1454.61715,680.585992 L1494.97315,640.343994 C1577.16715,558.035996 1591.87315,479.033999 1589.82115,427.164001 L1587.65515,374.610003 L1534.98715,372.558003 Z"></path></g></g></svg>';
        const announcement_svg = '<svg class="canvasrefined-todo-svg" label="Announcement" name="IconAnnouncement" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false" ><g role="presentation"><path d="M1587.16235,31.2784941 C1598.68235,7.78672942 1624.43294,-4.41091764 1650.63529,1.46202354 C1676.16,7.56084707 1694.11765,30.2620235 1694.11765,56.4643765 L1694.11765,56.4643765 L1694.11765,570.459671 C1822.87059,596.662024 1920,710.732612 1920,847.052612 C1920,983.372612 1822.87059,1097.55614 1694.11765,1123.75849 L1694.11765,1123.75849 L1694.11765,1637.64085 C1694.11765,1663.8432 1676.16,1686.65732 1650.63529,1692.6432 C1646.23059,1693.65967 1641.93882,1694.11144 1637.64706,1694.11144 C1616.52706,1694.11144 1596.87529,1682.36555 1587.16235,1662.93967 C1379.23765,1247.2032 964.178824,1242.34673 960,1242.34673 L960,1242.34673 L564.705882,1242.34673 L564.705882,1807.05261 L652.461176,1807.05261 C640.602353,1716.92555 634.955294,1560.05026 715.934118,1456.37026 C768.338824,1389.2832 845.590588,1355.28791 945.882353,1355.28791 L945.882353,1355.28791 L945.882353,1468.22908 C881.392941,1468.22908 835.312941,1487.09026 805.044706,1525.71614 C736.263529,1613.58438 759.981176,1789.54673 774.776471,1849.97026 C778.955294,1866.79849 775.115294,1884.6432 764.498824,1898.30908 C753.769412,1911.97496 737.28,1919.99379 720,1919.99379 L720,1919.99379 L508.235294,1919.99379 C477.063529,1919.99379 451.764706,1894.80791 451.764706,1863.5232 L451.764706,1863.5232 L451.764706,1242.34673 L395.294118,1242.34673 C239.548235,1242.34673 112.941176,1115.73967 112.941176,959.993788 L112.941176,959.993788 L112.941176,903.5232 L56.4705882,903.5232 C25.2988235,903.5232 0,878.337318 0,847.052612 C0,815.880847 25.2988235,790.582024 56.4705882,790.582024 L56.4705882,790.582024 L112.941176,790.582024 L112.941176,734.111435 C112.941176,578.478494 239.548235,451.758494 395.294118,451.758494 L395.294118,451.758494 L959.887059,451.758494 C976.828235,451.645553 1380.36706,444.756141 1587.16235,31.2784941 Z M1581.17647,249.706729 C1386.46588,492.078494 1128.96,547.871435 1016.47059,560.746729 L1016.47059,560.746729 L1016.47059,1133.47144 C1128.96,1146.34673 1386.46588,1202.02673 1581.17647,1444.51144 L1581.17647,1444.51144 Z M903.529412,564.699671 L395.294118,564.699671 C301.891765,564.699671 225.882353,640.709082 225.882353,734.111435 L225.882353,734.111435 L225.882353,959.993788 C225.882353,1053.39614 301.891765,1129.40555 395.294118,1129.40555 L395.294118,1129.40555 L903.529412,1129.40555 L903.529412,564.699671 Z M1694.11765,688.144376 L1694.11765,1006.07379 C1759.73647,982.694965 1807.05882,920.577318 1807.05882,847.052612 C1807.05882,773.527906 1759.73647,711.5232 1694.11765,688.144376 L1694.11765,688.144376 Z" fill-rule="evenodd" stroke="none" stroke-width="1"></path></g></svg>';
        const assignment_svg = '<svg class="canvasrefined-todo-svg" label="Assignment" name="IconAssignment" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"><g role="presentation"><path d="M1468.2137,0 L1468.2137,564.697578 L1355.27419,564.697578 L1355.27419,112.939516 L112.939516,112.939516 L112.939516,1807.03225 L1355.27419,1807.03225 L1355.27419,1581.15322 L1468.2137,1581.15322 L1468.2137,1919.97177 L2.5243549e-29,1919.97177 L2.5243549e-29,0 L1468.2137,0 Z M1597.64239,581.310981 C1619.77853,559.174836 1655.46742,559.174836 1677.60356,581.310981 L1677.60356,581.310981 L1903.4826,807.190012 C1925.5058,829.213217 1925.5058,864.902104 1903.4826,887.038249 L1903.4826,887.038249 L1225.8455,1564.67534 C1215.22919,1575.17872 1200.88587,1581.16451 1185.86491,1581.16451 L1185.86491,1581.16451 L959.985883,1581.16451 C928.814576,1581.16451 903.516125,1555.86606 903.516125,1524.69475 L903.516125,1524.69475 L903.516125,1298.81572 C903.516125,1283.79477 909.501919,1269.45145 920.005294,1258.94807 L920.005294,1258.94807 Z M1442.35055,896.29929 L1016.45564,1322.1942 L1016.45564,1468.225 L1162.48643,1468.225 L1588.38135,1042.33008 L1442.35055,896.29929 Z M677.637094,1242.34597 L677.637094,1355.28548 L338.818547,1355.28548 L338.818547,1242.34597 L677.637094,1242.34597 Z M903.516125,1016.46693 L903.516125,1129.40645 L338.818547,1129.40645 L338.818547,1016.46693 L903.516125,1016.46693 Z M1637.62298,701.026867 L1522.19879,816.451052 L1668.22958,962.481846 L1783.65377,847.057661 L1637.62298,701.026867 Z M1129.39516,338.829841 L1129.39516,790.587903 L338.818547,790.587903 L338.818547,338.829841 L1129.39516,338.829841 Z M1016.45564,451.769356 L451.758062,451.769356 L451.758062,677.648388 L1016.45564,677.648388 L1016.45564,451.769356 Z" fill-rule="evenodd" stroke="none" stroke-width="1"></path></g></svg>';
        const x_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></svg>';
        const check_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M5 12l5 5l10 -10"></path></svg>';
        const tag_svg = '<svg  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z" /></svg>';

        const maxAssignmentCount = parseInt(options.num_todo_items) + moreAssignmentCount;
        const maxAnnouncementCount = parseInt(options.num_todo_items) + moreAnnouncementCount;
        const hr24 = options.todo_hr24;
        const now = new Date();
        let todoAnnouncements = document.querySelector("#canvasrefined-announcement-list");
        let todoAssignments = document.querySelector("#canvasrefined-todo-list");
        let assignmentsToInsert = [];
        let announcementsToInsert = [];

        assignments.then(data => {
            chrome.storage.sync.get(options.custom_assignments_overflow, storage => {
                let items = combineAssignments(data);
                // Fake courses join the real items, re-sorted chronologically.
                if (options.hide_personal_details === true && options.anon_fake_todo === true) {
                    items = items.concat(buildFakeTodoItems())
                        .sort((a, b) => new Date(a.plannable_date) - new Date(b.plannable_date));
                }
                items.forEach((item, index) => {
                    let date = new Date(item.plannable_date);
                    let itemState = options.assignment_states[item.plannable_id];

                    let svg;
                    switch (item.plannable_type) {
                        case "assignment": svg = assignment_svg; break;
                        case "discussion_topic": svg = discussion_svg; break;
                        case "quiz": svg = quiz_svg; break;
                        case "announcement": svg = announcement_svg; break;
                        default: return;
                    }

                    if (item.plannable_type !== "announcement") {
                        // Keep one extra item so the "View More" button appears.
                        if (assignmentsToInsert.length >= maxAssignmentCount + 1) return;
                        if (filter === "todo" && options.hide_completed === true && item.submissions.submitted === true) return;
                        if (filter === "todo" && ((options.todo_overdues !== true && now >= date) || (options.todo_overdues === true && item.submissions.submitted === true))) return;
                        if (filter === "done" && now <= date && !(itemState?.["rem"] === true || item?.submissions?.submitted === true)) return;
                    }
                    if (filter === "todo" && ((itemState && itemState["rem"] === true) || (item.planner_override && item.planner_override.marked_complete === true))) return;

                    let listItemContainer = document.createElement("div");
                    listItemContainer.classList.add("canvasrefined-todo-container");
                    listItemContainer.innerHTML = '<div class="canvasrefined-hover-preview"><p class="canvasrefined-preview-title"></p><p class="canvasrefined-preview-text"></p></div><div class="canvasrefined-todo-actions"></div><div class="canvasrefined-todo-icon"></div><a class="canvasrefined-todo-item"><div class="canvasrefined-todo-item-header"></div></a><button class="canvasrefined-todo-actions-btn"><i class="icon-more canvasrefined-dots-icon" aria-hidden="true"></i></button>';
                    listItemContainer.querySelector(".canvasrefined-todo-item").href = item.html_url;
                    listItemContainer.dataset.id = item.plannable_id;
                    listItemContainer.querySelector('.canvasrefined-todo-icon').innerHTML += svg;

                    let listItem = listItemContainer.querySelector(".canvasrefined-todo-item");
                    const courseColor =
                        item.anonFake === true
                            ? item.anonColor // fake items carry their (real) course color
                            : (options.custom_cards_3?.[String(item.course_id)]?.color ??
                            options.custom_cards_3?.[item.course_id]?.color ??
                            options.custom_cards_3?.[item.plannable?.course_id]?.color ??
                            "#cccccc");
                    if (itemState?.["lbl"] && itemState["lbl"] !== "") {
                        makeElement("span", listItem.querySelector(".canvasrefined-todo-item-header"), { "className": "canvasrefined-todo-label", "textContent": itemState["lbl"] });
                    }
                    if (itemState?.["crs"] === true) {
                        listItemContainer.querySelector(".canvasrefined-todo-item").style.textDecoration = "line-through";
                    }
                    let title = makeElement("a", listItem.querySelector(".canvasrefined-todo-item-header"), { "className": "canvasrefined-todoitem-title", "textContent": anonTitleForItem(item) });
                    if (options.todo_hide_feedback === true) title.style = "color:" + courseColor + "!important;";
                    let course = makeElement("p", listItem, { "className": "canvasrefined-todoitem-course", "textContent": anonCourseNameForItem(item) });
                    course.style.color = courseColor;
                    let format = formatTodoDate(date, item.submissions, hr24);
                    let todoDate = makeElement("p", listItem, { "className": "canvasrefined-todoitem-date", "textContent": format.date });
                    if (format.dueSoon) todoDate.classList.add("canvasrefined-due-soon");

                    if (options.hover_preview === true) {
                        const customItem = item.planner_override && item.planner_override.custom && item.planner_override.custom === true;
                        listItem.addEventListener("mouseover", () => {
                            listItem.classList.add("canvasrefined-todo-hover");
                            let preview = listItemContainer.querySelector(".canvasrefined-hover-preview");
                            let previewTitle = preview.querySelector(".canvasrefined-preview-title");
                            let previewText = preview.querySelector(".canvasrefined-preview-text");
                            clearTimeout(delay);
                            delay = setTimeout(async () => {
                                if (listItem.classList.contains("canvasrefined-todo-hover")) {
                                    previewTitle.textContent = item.plannable.title;
                                    // Fake todo items have no Canvas page behind them.
                                    if (item.anonFake === true) {
                                        previewText.textContent = chrome.i18n.getMessage("no_details") || "No details given";
                                        preview.style.display = "block";
                                        return;
                                    }
                                    if (customItem) {
                                        const details = item.plannable && item.plannable.details ? item.plannable.details : "";
                                        previewText.textContent = details === "" ? (chrome.i18n.getMessage("no_details") || "No details given") : details.replace(/<\/?[^>]+(>|$)/g, " ");
                                    } else {
                                        console.log(item);
                                        let found = false;
                                        let searchCount = 1;
                                        while (searchCount < 5 && found === false) {
                                            for (let i = 0; i < announcements.length; i++) {
                                                if (announcements[i].id === item.plannable_id) {
                                                    found = true;
                                                    if (previewText.textContent === "") {
                                                        let description = item.plannable_type === "announcement" ? announcements[i].message : announcements[i].description;
                                                        previewText.textContent = description === "" ? (chrome.i18n.getMessage("no_details") || "No details given") : description.replace(/<\/?[^>]+(>|$)/g, " ");
                                                    }
                                                    break;
                                                }
                                            }
                                            if (found === false) {
                                                let apiLink = domain + "/api/v1/";
                                                if (item.plannable_type === "assignment") {
                                                    apiLink += `courses/${item.course_id}/assignments/${item.plannable_id}`;
                                                } else if (item.plannable_type === "announcement") {
                                                    apiLink += `announcements?context_codes[]=course_${item.course_id}&per_page=3&page=${searchCount}`;
                                                }
                                                let data = await getData(apiLink);
                                                item.plannable_type === "announcement" ? announcements.push(...data) : announcements.push(data);
                                                searchCount++;
                                            }
                                        }
                                        if (found === false) {
                                            previewText.textContent = chrome.i18n.getMessage("could_not_load_preview") || "Couldn't load preview";
                                        }
                                    }
                                    preview.style.display = "block";
                                }
                            }, 250);
                        });

                        listItem.addEventListener("mouseleave", () => {
                            listItem.classList.remove("canvasrefined-todo-hover");
                            listItemContainer.querySelector(".canvasrefined-hover-preview").style.display = "none";
                        });
                    }

                    const actions = listItemContainer.querySelector(".canvasrefined-todo-actions");

                    let clickOutActions = (e) => {
                        if (e.target.className.includes("canvasrefined")) return;
                        document.body.removeEventListener("click", clickOutActions);
                        actions.style.display = "none";
                    }

                    listItemContainer.querySelector(".canvasrefined-todo-actions-btn").addEventListener("click", () => {
                        actions.style.display = "block";
                        setTimeout(() => {
                            document.body.addEventListener("click", clickOutActions);
                        }, 100);
                    });

                    let removeBtn = makeElement("div", actions, { "className": "canvasrefined-todo-action", "textContent": chrome.i18n.getMessage("todo_remove") || "Remove" });
                    removeBtn.innerHTML += x_svg;
                    const dueAt = new Date(item.plannable_date).getTime();

                    let crossOffBtn = makeElement("div", actions, { "className": "canvasrefined-todo-action", "textContent": chrome.i18n.getMessage("todo_cross_off") || "Cross off" });
                    crossOffBtn.innerHTML += check_svg;
                    crossOffBtn.addEventListener("click", () => {
                        setAssignmentState(item.plannable_id, { "crs": listItemContainer.querySelector(".canvasrefined-todo-item").style.textDecoration === "line-through" ? false : true, "expire": dueAt });
                    });
                    let label = makeElement("span", actions, { "className": "canvasrefined-todo-action-tag", "textContent": chrome.i18n.getMessage("todo_label") || "Label:" });
                    label.innerHTML += tag_svg;
                    let labelInput = makeElement("input", actions, { "className": "canvasrefined-todo-input", "type": "text", "placeholder": chrome.i18n.getMessage("todo_label") || "Label", "value": itemState && itemState["lbl"] ? itemState["lbl"] : "" });
                    labelInput.addEventListener("change", (e) => {
                        setAssignmentState(item.plannable_id, { "lbl": e.target.value, "expire": dueAt });
                    });

                    removeBtn.addEventListener('click', function () {
                        setAssignmentState(item.plannable_id, { "rem": filter === "todo", "expire": dueAt });
                        if (item.planner_override && item.planner_override.custom && item.planner_override.custom === true) {
                            chrome.storage.sync.get("custom_assignments_overflow", overflow => {
                                chrome.storage.sync.get(overflow["custom_assignments_overflow"], storage => {
                                    overflow["custom_assignments_overflow"].forEach(overflow => {
                                        for (let i = 0; i < storage[overflow].length; i++) {
                                            if (storage[overflow][i].plannable_id === item.plannable_id) {
                                                storage[overflow].splice(i, 1);
                                                chrome.storage.sync.set({ [overflow]: storage[overflow] }).then(() => {
                                                });
                                                break;
                                            }
                                        }
                                    });
                                });
                            });
                        }
                    });

                    if (item.plannable_type === "announcement") {
                        announcementsToInsert.push(listItemContainer);
                    } else {
                        assignmentsToInsert.push(listItemContainer);
                        if (item.submissions && item.submissions.submitted) {
                            listItemContainer.classList.add("canvasrefined-todo-item-completed");
                        }
                    }


                });

                todoAssignments.textContent = "";
                if (assignmentsToInsert.length > 0) {
                    let i;
                    for (i = 0; i < (assignmentsToInsert.length > maxAssignmentCount ? maxAssignmentCount : assignmentsToInsert.length); i++) {
                        todoAssignments.append(assignmentsToInsert[i]);
                    }
                    if (i !== assignmentsToInsert.length) createTodoViewMore(todoAssignments, "assignment");
                } else {
                    makeElement("p", todoAssignments, { "className": "canvasrefined-none-due", "textContent": chrome.i18n.getMessage("todo_none") || "None" });
                }

                todoAnnouncements.textContent = "";
                if (announcementsToInsert.length > 0) {
                    let i;
                    for (i = announcementsToInsert.length - 1; i >= (announcementsToInsert.length - maxAnnouncementCount < 0 ? 0 : announcementsToInsert.length - maxAnnouncementCount); i--) {
                        todoAnnouncements.append(announcementsToInsert[i]);
                    }
                    if (i !== -1) createTodoViewMore(todoAnnouncements, "announcement");
                } else {
                    makeElement("p", todoAnnouncements, { "className": "canvasrefined-none-due", "textContent": chrome.i18n.getMessage("todo_none") || "None" });
                }

                cleanCustomAssignments();
            });
        });

    } catch (e) {
        logError(e);
    }
}

/*
Card color palettes
*/

let changeColorInterval = null;
let colorChanges = [];

// Courses in display order (card view: DOM cards; list mode: dashboard_cards API),
// plus the user's current course colors for "revert colors".
async function getPaletteCards() {
    let cards = [];
    let apiColors = {};
    document.querySelectorAll(".ic-DashboardCard__header").forEach(card => {
        cards.push({ "href": card.querySelector(".ic-DashboardCard__link").href, "el": card });
    });
    if (cards.length > 0) return { cards, apiColors };
    try {
        const [cardsRes, colorsRes] = await Promise.all([
            pageFetch(domain + "/api/v1/dashboard/dashboard_cards", { headers: { "accept": "application/json" } }),
            pageFetch(domain + "/api/v1/users/self/colors", { headers: { "accept": "application/json" } })
        ]);
        const apiCards = await cardsRes.json();
        apiColors = (await colorsRes.json())?.custom_colors || {};
        const seen = new Set();
        const orderedIds = [];
        document.querySelectorAll("a.Grouping-styles__hero").forEach(hero => {
            const m = (hero.getAttribute("href") || "").match(/\/courses\/(\d+)/);
            if (m && !seen.has(m[1])) { seen.add(m[1]); orderedIds.push(m[1]); }
        });
        apiCards.forEach(card => {
            const id = String(card.id);
            if (!seen.has(id)) { seen.add(id); orderedIds.push(id); }
        });
        orderedIds.forEach(id => cards.push({ "href": domain + "/courses/" + id, "el": null }));
    } catch (e) {
        logError(e);
    }
    return { cards, apiColors };
}

async function changeColorPreset(colors) {

    if (colors.length === 0) return;

    clearInterval(changeColorInterval);
    const csrfToken = CSRFtoken();
    const delay = 250;
    previous = []
    colorChanges = [];

    // sort cards
    // (display order — see getPaletteCards; no re-sorting here so palette
    // colors apply from the first course on screen to the last)
    const { cards: sortedCards, apiColors } = await getPaletteCards();

    try {
        sortedCards.forEach((card, i) => {
            let course_id = card.href.split("courses/")[1];
            let previousColor = card.el
                ? rgbToHex(card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor)
                : (apiColors["course_" + course_id] || "#ffffff");
            previous.push(previousColor);

            let cnum = i % colors.length;

            // paint card view or planner list avatars so it shows without a reload
            let applyColor = () => {
                if (card.el) {
                    card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor = colors[cnum];
                    card.el.querySelector(".ic-DashboardCard__header-title span").style.color = colors[cnum];
                    card.el.querySelector(".ic-DashboardCard__header-button-bg").style.backgroundColor = colors[cnum];
                    // after the 250ms queue lands the color, not before
                    changeGradientCards();
                } else {
                    const coursePrefix = "/courses/" + course_id;
                    document.querySelectorAll(".planner-item").forEach(item => {
                        const titleLink = item.querySelector(".PlannerItem-styles__title a");
                        const heroLink = item.closest(".Grouping-styles__root")?.querySelector("a.Grouping-styles__hero");
                        const inCourse = (titleLink && (titleLink.getAttribute("href") || "").startsWith(coursePrefix)) ||
                            (heroLink && (heroLink.getAttribute("href") || "").startsWith(coursePrefix));
                        if (inCourse) {
                            const avatar = item.querySelector(".PlannerItem-styles__avatar, .PlannerItem-styles__icon");
                            if (avatar) avatar.style.color = colors[cnum];
                        }
                    });
                }
            };

            let changeCardColor = () => {
                pageFetch(domain + "/api/v1/users/self/colors/courses_" + course_id,
                    {
                        method: "PUT",
                        headers: {
                            "content-type": "application/json",
                            'accept': 'application/json',
                            'X-CSRF-Token': csrfToken,
                        },
                        body: JSON.stringify({ "hexcode": colors[cnum] })
                    }).then(() => applyColor());
            }

            colorChanges.push(changeCardColor);

            applyColor();
        });
    } catch (e) {
        logError(e);
        colorChanges = [];
    }

    changeGradientCards();

    changeColorInterval = setInterval(() => {
        if (colorChanges.length > 0) {
            let current = colorChanges.shift();
            current();
        } else {
            clearInterval(changeColorInterval);
        }
    }, delay);

    chrome.storage.local.get("previous_colors", local => {
        const now = Date.now();
        const prev = local["previous_colors"];
        // also overwrite empty captures and undefined (unset key), both broke revert
        if (previous.length > 0 && (!prev || now >= prev.expire || !Array.isArray(prev.colors) || prev.colors.length === 0)) {
            chrome.storage.local.set({ "previous_colors": { "colors": previous, "expire": now + 86400000 } });
        }
    });
}

/*
Dark mode
*/

// always emitted so extension UI renders in light mode too
const BC_LIGHT_DEFAULTS = {
    "background-0": "#ffffff",
    "background-1": "#c7c7c7",
    "background-2": "#d9d9d9",
    "borders": "#808080",
    "links": "#418df1",
    "sidebar": "#e3e3e3",
    "sidebar-text": "#000000",
    "text-0": "#000000",
    "text-1": "#050505",
    "text-2": "#4f4f4f"
};

const BC_DARK_DEFAULTS = {
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
};

function generateWidgetDarkCSS() {
    const preset = options.dark_preset || BC_DARK_DEFAULTS;
    let css = "/* CanvasRefined widgets always use dark mode colors */\n";
    css += ".canvasrefined-widget-card,\n";
    css += ".canvasrefined-dashboard-notes,\n";
    css += ".canvasrefined-gpa-card,\n";
    css += ".canvasrefined-gpa,\n";
    css += "#canvasrefined-gpa-modal,\n";
    css += ".cr-gpa-modal,\n";
    css += ".canvasrefined-widget-slot {\n";
    Object.keys(preset).forEach((key) => {
        css += "    --bc" + key + ": " + preset[key] + ";\n";
    });
    css += "}\n";
    return css;
}

function generateDarkModeCSS() {
    let css = ":root{\n";
    Object.keys(BC_LIGHT_DEFAULTS).forEach((key) => {
        css += "    --bc" + key + ": " + BC_LIGHT_DEFAULTS[key] + ";\n";
    });
    css += "}\n\n";

    css += generateWidgetDarkCSS() + "\n";

    const darkOn = options.dark_mode === true || options.device_dark === true;
    if (!darkOn) return css;

    let darkBlock = ":root{\n";
    if (options.dark_preset) {
        Object.keys(options.dark_preset).forEach((key) => {
            darkBlock += "    --bc" + key + ": " + options.dark_preset[key] + ";\n";
        });
    }
    darkBlock += "}\n\n";
    darkBlock += DARKMODE_CSS;

    if (options.device_dark === true) {
        css += "@media (prefers-color-scheme: dark) {\n" + darkBlock + "\n}";
    } else {
        css += darkBlock;
    }
    return css;
}

let darkStyleInserted = false;
// Canvas emotion class hashes change between releases, so the submission comments
// tray is recolored at runtime; touched elements are tagged for revert
let submissionTrayObserver = null;
let submissionTrayFixScheduled = false;

function crApplySubmissionTrayFix(el, props) {
    const applied = el.dataset.crdarkfix ? el.dataset.crdarkfix.split(" ") : [];
    for (const prop of Object.keys(props)) {
        if (!applied.includes(prop)) applied.push(prop);
        el.style.setProperty(prop, props[prop], "important");
    }
    el.dataset.crdarkfix = applied.join(" ");
}

function fixSubmissionTrayColors(root) {
    const preset = options.dark_preset;
    if (!preset) return;
    const light = (r, g, b) => r >= 225 && g >= 225 && b >= 225;
    const darkInk = (r, g, b) => r <= 70 && g <= 70 && b <= 70;
    const rgb = (str) => { const m = str && str.match(/rgb\((\d+), ?(\d+), ?(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
    root.querySelectorAll("*").forEach(el => {
        if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) return;
        const cs = getComputedStyle(el);
        const bg = rgb(cs.backgroundColor);
        if (bg && light(bg[0], bg[1], bg[2])) {
            crApplySubmissionTrayFix(el, {
                "background-color": preset["background-2"],
                "color": preset["text-0"]
            });
        } else {
            const c = rgb(cs.color);
            if (c && darkInk(c[0], c[1], c[2])) {
                crApplySubmissionTrayFix(el, { "color": preset["text-0"] });
            }
        }
        const bc = rgb(cs.borderColor);
        if (bc && light(bc[0], bc[1], bc[2])) {
            crApplySubmissionTrayFix(el, { "border-color": preset["borders"] });
        }
    });
}

function setupSubmissionTrayWatcher() {
    if (submissionTrayObserver) return;
    const run = () => {
        submissionTrayFixScheduled = false;
        if (options.dark_mode !== true && options.device_dark !== true) return;
        const tray = document.querySelector('[data-testid="submission-tray"]');
        if (tray) fixSubmissionTrayColors(tray);
    };
    // rAF-debounced; tray contents load async so re-run on every subtree change
    submissionTrayObserver = new MutationObserver(() => {
        if (submissionTrayFixScheduled) return;
        submissionTrayFixScheduled = true;
        requestAnimationFrame(run);
    });
    submissionTrayObserver.observe(document.documentElement, { childList: true, subtree: true });
    run();
}

function teardownSubmissionTrayFixes() {
    if (submissionTrayObserver) {
        submissionTrayObserver.disconnect();
        submissionTrayObserver = null;
    }
    document.querySelectorAll("[data-crdarkfix]").forEach(el => {
        (el.dataset.crdarkfix || "").split(" ").forEach(prop => el.style.removeProperty(prop));
        delete el.dataset.crdarkfix;
    });
}

function toggleDarkMode() {
    const css = generateDarkModeCSS();
    const darkOn = options.dark_mode === true || options.device_dark === true;
    // reuse the existing #darkcss element (document_start bootstrap may have made it)
    let style = document.querySelector("#darkcss");
    if (!style) {
        style = document.createElement('style');
        style.id = 'darkcss';
        document.documentElement.append(style);
    }
    style.textContent = css;
    style.className = darkOn ? "canvasrefined-darkmode-enabled" : "";
    darkStyleInserted = true;
    if (darkOn) {
        setupSubmissionTrayWatcher();
    } else {
        teardownSubmissionTrayFixes();
    }
    runiframeChecker();
}

function runDarkModeFixer(override = false) {
    // Quiz safe mode: never auto-run the dark mode fixer on quiz pages.
    if (quizSafeModeActive()) return { "path": "canvasrefined-none", "time": "" };
    if (options.dark_mode !== true) return { "path": "canvasrefined-darkmode_off", "time": "" };
    if (override === false && !options["dark_mode_fix"].includes(window.location.pathname)) return { "path": "canvasrefined-none", "time": "" };
    let output = inspectDarkMode();
    return { "path": window.location.pathname, "time": output.time };
}

function autoDarkModeCheck() {
    let date = new Date();
    let currentHour = date.getHours();
    let currentMinute = date.getMinutes();
    let status = false;
    if (options.auto_dark === false) return;
    let startHour = parseInt(options.auto_dark_start["hour"]);
    let startMinute = parseInt(options.auto_dark_start["minute"]);
    let endHour = parseInt(options.auto_dark_end["hour"]);
    let endMinute = parseInt(options.auto_dark_end["minute"]);
    if (currentHour === startHour) {
        status = currentMinute >= startMinute;
    } else if (currentHour === endHour) {
        status = currentMinute <= endMinute;
    } else if (startHour > endHour) {
        status = currentHour > startHour || currentHour < endHour;
    } else if (startHour < endHour) {
        status = currentHour > startHour && currentHour < endHour;
    }
    if (options.auto_dark === true) {
        // skip the write (and its storage.onChanged cascade) when nothing changed
        if (status === options.dark_mode) return;
        options.dark_mode = status;
        chrome.storage.sync.set({ "dark_mode": status }, toggleDarkMode);
    }
}



function toggleAutoDarkMode() {
    clearInterval(timeCheck);
    if (options.auto_dark && options.auto_dark === false) return;
    autoDarkModeCheck();
    timeCheck = setInterval(autoDarkModeCheck, 60000);
}


let iframeObserver;
function runiframeChecker() {
    if (current_page === "/" || current_page === "") return;

    if (options.dark_mode !== true) {
        if (iframeObserver) iframeObserver.disconnect();
        document.querySelectorAll('iframe').forEach((frame) => {
            if (frame.contentDocument && frame.contentDocument.documentElement && frame.contentDocument.documentElement.querySelector('#darkcss')) {
                frame.contentDocument.documentElement.querySelector('#darkcss').textContent = '';
                frame.contentDocument.body.classList.remove("canvasrefined--darkmode--enabled");
            }
        });
        return;
    }

    const callback = (mutationList) => {
        for (const mutation of mutationList) {
            if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeName !== 'IFRAME') continue;
                // cross-origin frames throw on contentDocument access
                let doc;
                try { doc = node.contentDocument; } catch (_) { continue; }
                if (!doc || !doc.documentElement || !doc.body) continue;
                try {
                    const new_style_element = document.createElement("style");
                    new_style_element.textContent = generateDarkModeCSS();
                    new_style_element.id = "darkcss";
                    doc.body.classList.add("canvasrefined--darkmode--enabled");
                    doc.documentElement.prepend(new_style_element);
                } catch (_) { /* cross-origin or detached frame: ignore */ }
            }
        }
    };

    iframeObserver = new MutationObserver(callback);
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

/*
Hide personal details (screenshot privacy mode)
*/

// stable fake course per real course — same name on cards, todo list and feedback
const FAKE_COURSES = [
    { name: "Algebra II", teacher: "Martinez" },
    { name: "AP Biology", teacher: "Nguyen" },
    { name: "Art History", teacher: "Kowalski" },
    { name: "Astronomy", teacher: "Delgado" },
    { name: "Chemistry", teacher: "Patel" },
    { name: "Computer Science", teacher: "Brooks" },
    { name: "Creative Writing", teacher: "Ellis" },
    { name: "European History", teacher: "Fischer" },
    { name: "Geography", teacher: "Okafor" },
    { name: "Marine Biology", teacher: "Silva" },
    { name: "Physics", teacher: "Jensen" },
    { name: "Psychology", teacher: "Moreau" },
    { name: "Spanish III", teacher: "Rivera" },
    { name: "Statistics", teacher: "Chen" },
    { name: "World History", teacher: "Adler" },
];
const FAKE_SCHOOL_NAME = "Ridgeview High School";
const FAKE_ASSIGNMENT_TITLES = [
    "Homework 4", "Reading Response", "Lab Report 2", "Practice Problems",
    "Unit Quiz", "Essay Draft", "Worksheet 7", "Group Project",
    "Chapter Review", "Study Guide", "Discussion Post", "Exit Ticket",
    "Vocabulary Quiz", "Lab Worksheet", "Project Proposal", "Test Review",
    "Notes Check", "Article Summary", "Problem Set 3", "Class Survey",
];
const FAKE_FEEDBACK_COMMENTS = [
    "Nice work!", "Good effort.", "Well done!", "Keep it up!", "Solid job!",
    "Great improvement!", "Strong submission.", "Excellent detail.",
];

// FNV-1a — deterministic, dependency-free
function anonHash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function anonSeededHash(key) {
    return anonHash(String(key) + "/" + String(options.anon_grade_seed ?? 0));
}

// key -> FAKE_COURSES index; linear probing keeps each real course unique
const anonCourseMap = new Map();
function getAnonCourse(key) {
    const k = String(key ?? "unknown");
    if (!anonCourseMap.has(k)) {
        const used = new Set(anonCourseMap.values());
        let idx = anonSeededHash(k) % FAKE_COURSES.length;
        if (used.size < FAKE_COURSES.length) {
            while (used.has(idx)) idx = (idx + 1) % FAKE_COURSES.length;
        }
        anonCourseMap.set(k, idx);
    }
    return FAKE_COURSES[anonCourseMap.get(k)];
}
function fakeCourseLabel(key) {
    const c = getAnonCourse(key);
    return `${c.name} - ${c.teacher}`;
}

function fakeAssignmentTitle(key) {
    return FAKE_ASSIGNMENT_TITLES[anonSeededHash(key) % FAKE_ASSIGNMENT_TITLES.length];
}
function fakeFeedbackComment(key) {
    return FAKE_FEEDBACK_COMMENTS[anonSeededHash(key) % FAKE_FEEDBACK_COMMENTS.length];
}

function fakeFeedbackScore(key) {
    const earned = 13 + (anonSeededHash(key) % 8);
    return `${earned} out of 20`;
}

// fake-grade presets: weighted letter mixes, weights in percent summing to 100
const ANON_GRADE_MIXES = {
    high:    [["A+", 16], ["A", 30], ["A-", 22], ["B+", 14], ["B", 10], ["B-", 8]],
    medhigh: [["A", 5], ["A-", 13], ["B+", 22], ["B", 24], ["B-", 18], ["C+", 12], ["C", 6]],
    med:     [["B", 5], ["B-", 12], ["C+", 21], ["C", 24], ["C-", 19], ["D+", 12], ["D", 7]],
    medlow:  [["C", 5], ["C-", 12], ["D+", 20], ["D", 23], ["D-", 20], ["F", 20]],
};

// highest -> lowest, for percent bands derived from the user's GPA cutoffs
const ANON_LETTER_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

// letter from the selected preset, then a percent inside that letter's band
function fakeGradePercent(key) {
    const mix = ANON_GRADE_MIXES[options.anon_grade_level] || ANON_GRADE_MIXES.high;
    const bounds = options.gpa_calc_bounds;
    // separate hash channels so same-letter courses still differ
    let pick = anonSeededHash(key) % 100;
    let letter = mix[mix.length - 1][0];
    for (const [l, weight] of mix) {
        if (pick < weight) { letter = l; break; }
        pick -= weight;
    }
    // ~1 in 9 courses jumps two letters, like real transcripts
    if (anonSeededHash(key + ":out") % 9 === 0) {
        const dir = anonSeededHash(key + ":dir") % 2 === 0 ? -2 : 2;
        const idx = ANON_LETTER_ORDER.indexOf(letter);
        letter = ANON_LETTER_ORDER[Math.min(ANON_LETTER_ORDER.length - 1, Math.max(0, idx + dir))];
    }
    const idx = ANON_LETTER_ORDER.indexOf(letter);
    const min = bounds && bounds[letter] ? Number(bounds[letter].cutoff) : 70;
    const upper = bounds && idx > 0 && bounds[ANON_LETTER_ORDER[idx - 1]] ? Number(bounds[ANON_LETTER_ORDER[idx - 1]].cutoff) : 100;
    const max = Math.max(min + 0.5, upper - 0.1); // never reach the next letter's cutoff
    let percent = Math.round((min + (anonSeededHash(key + ":pct") % 997) / 1000 * (max - min)) * 10) / 10;
    if (percent > max) percent = max;
    return percent;
}

function fakeGradeText(key) {
    const percent = fakeGradePercent(key);
    const letter = percentToLetterGrade(percent);
    return (letter ? `${letter} ` : "") + `${percent}%`;
}

function fakeCumulativeGpa() {
    const letter = percentToLetterGrade(fakeGradePercent("cumulative"));
    const bounds = options.gpa_calc_bounds;
    return bounds && bounds[letter] ? bounds[letter].gpa : 3.5;
}

// "2026/2027 - School - Year" -> fake school name, term and type kept
function anonFakeTerm(orig) {
    const parts = String(orig).split(" - ").map(p => p.trim()).filter(p => p !== "");
    if (parts.length >= 3) return `${parts[0]} - ${FAKE_SCHOOL_NAME} - ${parts[parts.length - 1]}`;
    return FAKE_SCHOOL_NAME;
}

// render-time fakes: a DOM pass alone loses to async re-renders
function anonCourseNameForItem(item) {
    const real = item?.context_name ?? "";
    if (options.hide_personal_details !== true) return real;
    const cid = item?.course_id ?? item?.context_id;
    const key = (cid != null && /^\d+$/.test(String(cid)))
        ? "id:" + cid
        : (cid != null ? String(cid) : "name:" + String(real).trim().toLowerCase());
    return fakeCourseLabel(key);
}
function anonTitleForItem(item) {
    const real = item?.plannable?.title ?? "";
    if (options.hide_personal_details !== true) return real;
    const id = item?.plannable_id ?? item?.plannable?.id;
    return fakeAssignmentTitle(id != null ? "a:" + id : "t:" + String(real).trim());
}

const ANON_FAKE_COLORS = ["#E24C4B", "#E28227", "#7A9E29", "#0B99AF", "#6A68D9", "#9B59D0", "#C24A9F", "#357FA3"];

// fake items impersonate the user's real courses (color + fake name); hidden ones excluded
function getAnonFakeCoursePool() {
    const cards = options.custom_cards_3 || {};
    const pool = [];
    Object.keys(cards).forEach(id => {
        const card = cards[id];
        if (!card || typeof card !== "object") return;
        if (!/^\d+$/.test(String(id))) return; // only real course ids
        if (isCourseHidden(id) || isCourseTodoHidden(id)) return;
        pool.push({ id: String(id), color: card.color || null });
    });
    return pool;
}

// fake todo items so a screenshot hides the real course/assignment count; seeded, and
// anonFake keeps click/hover handlers off the Canvas API
function buildFakeTodoItems() {
    const types = ["assignment", "quiz", "assignment", "discussion_topic", "assignment", "quiz", "assignment"];
    const dayOffsets = [0, 1, 2, 3, 5, 8, 12];
    const dueHours = [23, 23, 20, 23, 18, 23, 22];
    const pool = getAnonFakeCoursePool();
    const now = Date.now();
    // "Fake tasks completed" spinner: drives the rings' x/y readout
    const rawDone = parseInt(options.anon_fake_completed);
    const doneCount = isNaN(rawDone) ? 2 : Math.max(0, Math.min(types.length, rawDone));
    // seeded shuffle so rerolling changes which ones are done
    const doneSet = new Set(
        types.map((_, i) => i)
            .sort((a, b) => anonSeededHash("done:" + b) - anonSeededHash("done:" + a))
            .slice(0, doneCount)
    );
    const items = [];
    for (let i = 0; i < types.length; i++) {
        let courseId, color;
        if (pool.length > 0) {
            // Each fake item is attributed to one of the user's real courses
            // (picked per seed), so it inherits that course's dashboard color
            // and its anonymized name.
            const pick = pool[anonSeededHash("pick:" + i) % pool.length];
            courseId = pick.id;
            color = pick.color || ANON_FAKE_COLORS[anonSeededHash(String(courseId)) % ANON_FAKE_COLORS.length];
        } else {
            // No colored dashboard cards available — fall back to anonymous
            // courses with a neutral palette.
            courseId = "anonfake-" + i;
            color = ANON_FAKE_COLORS[anonSeededHash(String(courseId)) % ANON_FAKE_COLORS.length];
        }
        const id = -(anonSeededHash("todoId:" + i) % 900000) - 1;
        const due = new Date(now + dayOffsets[i] * 86400000);
        due.setHours(dueHours[i], 59, 0, 0);
        const isDone = doneSet.has(i);
        items.push({
            anonFake: true,
            anonColor: color,
            plannable_id: id,
            plannable_type: types[i],
            plannable_date: due.toISOString(),
            plannable: { id: id, title: fakeAssignmentTitle("a:" + id) },
            course_id: courseId,
            context_id: courseId,
            context_name: fakeCourseLabel(courseId),
            html_url: "#",
            // done items need submitted+graded for the rings and Completed tab
            submissions: isDone ? { submitted: true, graded: true } : { submitted: false },
        });
    }
    return items;
}

// originals kept in dataset so toggling off restores in place
function anonText(el, computeFake) {
    if (!el || el.dataset.crAnonOrig !== undefined) return;
    const orig = el.textContent;
    el.dataset.crAnonOrig = orig;
    el.textContent = computeFake(orig);
}
function anonAttr(el, attr, computeFake) {
    if (!el) return;
    let attrs = {};
    if (el.dataset.crAnonAttrs !== undefined) {
        attrs = JSON.parse(el.dataset.crAnonAttrs);
        if (attrs[attr] !== undefined) return;
    } else {
        el.dataset.crAnonAttrs = "{}";
    }
    const orig = el.getAttribute(attr);
    if (orig == null) return;
    attrs[attr] = orig;
    el.dataset.crAnonAttrs = JSON.stringify(attrs);
    el.setAttribute(attr, computeFake(orig));
}
function restoreAnonymized(root = document) {
    root.querySelectorAll("[data-cr-anon-orig]").forEach(el => {
        el.textContent = el.dataset.crAnonOrig;
        delete el.dataset.crAnonOrig;
    });
    root.querySelectorAll("[data-cr-anon-attrs]").forEach(el => {
        try {
            const attrs = JSON.parse(el.dataset.crAnonAttrs);
            for (const [attr, value] of Object.entries(attrs)) el.setAttribute(attr, value);
        } catch (e) { /* malformed marker: leave as-is */ }
        delete el.dataset.crAnonAttrs;
    });
}

function anonymizeDashboardCard(card) {
    const link = card.querySelector('.ic-DashboardCard__link[href*="/courses/"]');
    const idMatch = link ? (link.getAttribute("href") || "").match(/courses\/(\d+)/) : null;
    const key = idMatch
        ? "id:" + idMatch[1]
        : "name:" + (card.querySelector(".ic-DashboardCard__header-title")?.textContent || "").trim().toLowerCase();
    const fakeLabel = fakeCourseLabel(key);

    // snapshot real names first: aria-labels/screenreader spans need them, and the h2
    // nickname differs from the full course name
    const titleEl = card.querySelector(".ic-DashboardCard__header-title");
    const origNames = [];
    if (titleEl) {
        origNames.push((titleEl.getAttribute("title") || "").trim());
        origNames.push(titleEl.textContent.trim());
    }
    const subtitleEl = card.querySelector(".ic-DashboardCard__header-subtitle");
    if (subtitleEl) {
        origNames.push(subtitleEl.textContent.trim());
        origNames.push((subtitleEl.getAttribute("title") || "").trim());
    }
    const uniqueOrigNames = [...new Set(origNames.filter(n => n && n.length > 1))];
    const replaceNames = (s) => {
        let out = String(s);
        uniqueOrigNames.forEach(n => { out = out.split(n).join(fakeLabel); });
        return out;
    };

    if (titleEl) {
        const inner = titleEl.querySelector("span") || titleEl;
        anonText(inner, () => fakeLabel);
        anonAttr(titleEl, "title", () => fakeLabel);
    }
    if (subtitleEl) {
        anonText(subtitleEl, () => fakeLabel);
        anonAttr(subtitleEl, "title", () => fakeLabel);
    }
    const termEl = card.querySelector(".ic-DashboardCard__header-term");
    if (termEl) {
        anonText(termEl, anonFakeTerm);
        anonAttr(termEl, "title", anonFakeTerm);
    }
    // querySelectorAll skips the card itself, so handle its own aria-label
    anonAttr(card, "aria-label", replaceNames);
    card.querySelectorAll("[aria-label]").forEach(el => anonAttr(el, "aria-label", replaceNames));
    card.querySelectorAll(".screenreader-only").forEach(el => anonText(el, replaceNames));
    // fallback for cards rendered before insertGrades() ran
    const gradeEl = card.querySelector(".canvasrefined-card-grade");
    if (gradeEl && gradeEl.textContent.trim() !== "") anonText(gradeEl, () => fakeGradeText(key));
}

function anonymizeFeedbackLink(a) {
    const details = a.querySelector(".event-details");
    if (!details) return;
    const href = a.getAttribute("href") || "";
    const cMatch = href.match(/courses\/(\d+)/);
    const aMatch = href.match(/assignments\/(\d+)/);
    const contextEl = details.querySelector(".event-details__context");
    const key = cMatch
        ? "id:" + cMatch[1]
        : "name:" + (contextEl ? contextEl.textContent : "").trim().toLowerCase();
    const fakeLabel = fakeCourseLabel(key);

    if (contextEl) anonText(contextEl, () => fakeLabel);
    const titleEl = details.querySelector(".recent_feedback_title");
    if (titleEl) anonText(titleEl, () => fakeAssignmentTitle(aMatch ? "a:" + aMatch[1] : "t:" + titleEl.textContent.trim()));
    const scoreEl = details.querySelector("p strong");
    if (scoreEl && /out of|\/.|%/.test(scoreEl.textContent)) {
        anonText(scoreEl, () => fakeFeedbackScore(aMatch ? "a:" + aMatch[1] : "t:" + (titleEl ? titleEl.textContent : "")));
    }
    // the comment is the last <p> and is quoted text
    const ps = details.querySelectorAll("p");
    const commentP = ps.length ? ps[ps.length - 1] : null;
    if (commentP && commentP !== scoreEl?.parentElement && !commentP.querySelector("strong")) {
        anonText(commentP, (orig) => {
            const t = orig.trim();
            return t.startsWith('"') ? `"${fakeFeedbackComment(aMatch ? "a:" + aMatch[1] : "t:" + t)}"` : fakeFeedbackComment(aMatch ? "a:" + aMatch[1] : "t:" + t);
        });
    }
}

function anonymizePersonalDetails(root = document) {
    if (options.hide_personal_details !== true) return;
    try {
        root.querySelectorAll(".ic-DashboardCard").forEach(anonymizeDashboardCard);
        root.querySelectorAll(".recent_feedback a[href]").forEach(anonymizeFeedbackLink);
    } catch (e) {
        logError(e);
    }
}

// hide course images via a style element so unchecking restores instantly
function applyCourseImageHiding() {
    const on = options.hide_course_images === true;
    let style = document.getElementById("canvasrefined-hide-course-images");
    if (on && !style) {
        style = document.createElement("style");
        style.id = "canvasrefined-hide-course-images";
        style.textContent = `
            .ic-DashboardCard__header_image { background-image: none !important; }
            .ic-DashboardCard__header_image img { display: none !important; }
            .canvasrefined-link-image { display: none !important; }
        `;
        (document.head || document.documentElement).append(style);
    } else if (!on && style) {
        style.remove();
    }
}

let personalDetailsObserver = null;
let anonPassScheduled = false;

function setupPersonalDetailsHiding() {
    applyCourseImageHiding();
    if (options.hide_personal_details === true) {
        if (!personalDetailsObserver) {
            personalDetailsObserver = new MutationObserver(() => {
                if (anonPassScheduled) return;
                anonPassScheduled = true;
                requestAnimationFrame(() => {
                    anonPassScheduled = false;
                    anonymizePersonalDetails();
                });
            });
            personalDetailsObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
        anonymizePersonalDetails();
    } else {
        if (personalDetailsObserver) {
            personalDetailsObserver.disconnect();
            personalDetailsObserver = null;
        }
        restoreAnonymized();
    }
}

/* 
Dashboard grades 
*/

// percent -> letter via the user's GPA cutoffs: picks the highest cutoff met so an
// imported theme can't reorder keys, and Number()-coerces string cutoffs
function percentToLetterGrade(percent) {
    const bounds = options.gpa_calc_bounds;
    if (!bounds || typeof percent !== "number") return null;
    let best = null;
    let bestCutoff = -Infinity;
    for (const letter of Object.keys(bounds)) {
        const cutoff = Number(bounds[letter]?.cutoff);
        if (Number.isFinite(cutoff) && percent >= cutoff && cutoff > bestCutoff) {
            best = letter;
            bestCutoff = cutoff;
        }
    }
    return best;
}

function insertGrades() {
    if (options.dashboard_grades === true) {
        grades.then(data => {
            try {
                let cards = document.querySelectorAll('.ic-DashboardCard');
                if (cards.length === 0 || cards[0].querySelectorAll(".ic-DashboardCard__link").length === 0) return;
                for (let i = 0; i < cards.length; i++) {
                    let course_id = parseInt(cards[i].querySelector(".ic-DashboardCard__link").href.split("courses/")[1]);
                    data.forEach(grade => {
                        if (course_id === grade.id) {
                            let gradepercent = grade.enrollments[0].has_grading_periods === true ? grade.enrollments[0].current_period_computed_current_score : grade.enrollments[0].computed_current_score;
                            let percent = (gradepercent || "--") + "%";
                            if (options.card_letter === true) {
                                const letter = percentToLetterGrade(gradepercent);
                                if (letter) percent = `${letter} ${percent}`;
                            }
                            let gradeContainer = cards[i].querySelector(".canvasrefined-card-grade") || makeElement("a", cards[i].querySelector(".ic-DashboardCard__header"), { "className": "canvasrefined-card-grade" });
                            gradeContainer.textContent = options.hide_personal_details === true ? fakeGradeText("id:" + course_id) : percent;
                            if (options.grade_hover === true) {
                                gradeContainer.classList.add("canvasrefined-hover-only");
                            } else {
                                gradeContainer.classList.remove("canvasrefined-hover-only");
                            }
                            gradeContainer.setAttribute("href", `${domain}/courses/${course_id}/grades`);
                            gradeContainer.style.display = "block";
                        }
                    });

                }
            } catch (e) {
                logError(e);
            }
        }).catch(e => logError(e));
    } else {
        document.querySelectorAll('.canvasrefined-card-grade').forEach(grade => {
            grade.style.display = "none";
        });
    }
}

/*
Card assignments
*/


function createCardAssignment(assignment) {
    let assignmentContainer = document.createElement("div");
    assignmentContainer.className = "canvasrefined-assignment-container";
    let assignmentName = makeElement("a", assignmentContainer, { "className": "canvasrefined-assignment-link", "textContent": anonTitleForItem(assignment), "href": assignment.html_url });
    let assignmentDueAt = makeElement("span", assignmentContainer, { "className": "canvasrefined-assignment-dueat", "textContent": formatCardDue(new Date(assignment.plannable_date)) });
    if (assignment.overdue === true) assignmentDueAt.classList.add("canvasrefined-assignment-overdue");
    if (assignment?.submissions?.submitted === true) {
        assignmentContainer.classList.add("canvasrefined-completed");
    } else {
        if (options.assignment_states[assignment.plannable_id]?.["crs"] === true) {
            assignmentContainer.classList.add("canvasrefined-completed");
        }
    }
    assignmentDueAt.addEventListener('mouseup', function () {
        assignmentContainer.classList.toggle("canvasrefined-completed");
        const status = assignmentContainer.classList.contains("canvasrefined-completed");
        setAssignmentState(assignment.plannable_id, { "crs": status, "expire": assignment.plannable_date });
    });
    return assignmentContainer;
}

let cardAssignments;

/* Equal Height Cards: stretch each card's assignment area to match the tallest
   one, using min-height so cards can still grow. */
let equalHeightResizeTimer = null;

function equalizeCardHeights() {
    const cards = document.querySelectorAll(".ic-DashboardCard");
    if (cards.length === 0) return;

    const enabled = options.equal_height_cards === true && options.assignments_due === true;

    cards.forEach(card => {
        const area = card.querySelector(".canvasrefined-card-assignment");
        if (area) area.style.removeProperty("min-height");
    });

    if (!enabled) return;

    let maxHeight = 0;
    cards.forEach(card => {
        const area = card.querySelector(".canvasrefined-card-assignment");
        if (area) maxHeight = Math.max(maxHeight, area.offsetHeight);
    });

    if (maxHeight > 0) {
        cards.forEach(card => {
            const area = card.querySelector(".canvasrefined-card-assignment");
            if (area) area.style.minHeight = maxHeight + "px";
        });
    }
}

window.addEventListener("resize", () => {
    if (equalHeightResizeTimer) clearTimeout(equalHeightResizeTimer);
    equalHeightResizeTimer = setTimeout(equalizeCardHeights, 150);
});

function preloadAssignmentEls() {
    return new Promise((resolve) => {
        let assignmentEls = {};
        const now = new Date();
        // Resolve even on error: a throw here used to leave this promise pending forever.
        const finish = () => resolve(assignmentEls);
        if (!assignments || typeof assignments.then !== "function") { finish(); return; }
        assignments.then(data => {
            try {
                data = combineAssignments(data);
                data.forEach(item => {
                    let due = new Date(item.plannable_date);
                    item.overdue = now >= due;
                    let o = {
                        "submitted": item.submissions && item.submissions.submitted === true,
                        "override": item.planner_override && item.planner_override.marked_complete,
                        "type": item.plannable_type,
                        "due": due,
                        "el": createCardAssignment(item)
                    }
                    if (assignmentEls[item.course_id]) {
                        assignmentEls[item.course_id].push(o);
                    } else {
                        assignmentEls[item.course_id] = [o];
                    }
                });
            } catch (e) {
                logError(e);
            } finally {
                finish();
            }
        }).catch(e => {
            logError(e);
            finish();
        });
    });
}

function loadCardAssignments() {
    if (options.assignments_due !== true) {
        document.querySelectorAll(".canvasrefined-card-assignment").forEach(card => {
            card.style.display = "none";
        });
        equalizeCardHeights();
        return;
    }
    setupCardAssignments();
    if (!cardAssignments || typeof cardAssignments.then !== "function") return;
    // Ignore stale planner data: it would re-append old rows over a newer render.
    const renderGen = ++cardRenderGen;
    cardAssignments.then(els => {
        if (renderGen !== cardRenderGen) return;
        try {
            let cards = document.querySelectorAll('.ic-DashboardCard');
            if (cards.length === 0) return;
            const now = new Date();

            cards.forEach(card => {
                let count = 0;
                let link = card.querySelector(".ic-DashboardCard__link");
                if (!link) return;
                let course_id = link.href.split("courses/")[1];
                let cardContainer = card.querySelector('.canvasrefined-card-container');
                if (!cardContainer) return;
                cardContainer.textContent = "";
                if (cardContainer.parentElement) {
                    cardContainer.parentElement.style.display = "block";
                }

                if (els[course_id]) {
                    els[course_id].forEach(assignment => {
                        if (count >= options.num_assignments) return;
                        if (options.hide_completed_cards === true && assignment.submitted === true) return;
                        if ((options.card_overdues !== true && now >= assignment.due) || (options.card_overdues === true && assignment.submitted === true)) return;
                        if (assignment.type !== "assignment" && assignment.type !== "quiz" && assignment.type !== "discussion_topic") return;
                        if (assignment.override === true) return;
                        cardContainer.appendChild(assignment.el);
                        count++;
                    });
                }

                if (count === 0) {
                    let assignmentContainer = makeElement("div", cardContainer, { "className": "canvasrefined-assignment-container" });
                    let assignmentDivLink = makeElement("a", assignmentContainer, { "className": "canvasrefined-assignment-link", "textContent": chrome.i18n.getMessage("card_none") || chrome.i18n.getMessage("todo_none") || "None" });
                }
            });
            requestAnimationFrame(equalizeCardHeights);
        } catch (e) {
            logError(e);
        }
    });
}


function setupCardAssignments() {
    if (options.assignments_due !== true) return;
    try {
        let containersCount = document.querySelectorAll('.canvasrefined-card-container').length;
        if (document.querySelectorAll('.ic-DashboardCard').length > 0 && containersCount > 0) return;
        let cards = document.querySelectorAll('.ic-DashboardCard');
        cards.forEach(card => {
            let assignmentContainer = card.querySelector(".canvasrefined-card-assignment") || makeElement("div", card, { "className": "canvasrefined-card-assignment" });
            let assignmentsDueHeader = card.querySelector(".canvasrefined-card-header-container") || makeElement("div", assignmentContainer, { "className": "canvasrefined-card-header-container" });
            let assignmentsDueLabel = card.querySelector(".canvasrefined-card-header") || makeElement("h3", assignmentsDueHeader, { "className": "canvasrefined-card-header", "textContent": chrome.i18n.getMessage("due") });
            let cardContainer = card.querySelector(".canvasrefined-card-container") || makeElement("div", assignmentContainer, { "className": "canvasrefined-card-container" });
            let skeletonText = card.querySelector(".canvasrefined-skeleton-text") || makeElement("div", cardContainer, { "className": "canvasrefined-skeleton-text" });
        });
    } catch (e) {
        logError(e);
    }
}

/*
Card customization
*/

function getCardId(card) {
    let link = card.querySelector(".ic-DashboardCard__link");
    if (!link) return -1;
    let href = link.href;
    if (!href || !href.includes("courses/")) return -1;
    let id = href.split("courses/")[1];
    if (!id) return -1;
    if (!id.includes("~")) return id;

    // has ~ but the dashboard-card id is the one to use
    if (options["custom_cards"][id]) return id;

    // some Canvas hosts replace runs of 0s with ~, with varying counts
    id = id.split("~");
    let re = new RegExp(`${id[0]}0+${id[1]}`);
    for (const c of Object.keys(options["custom_cards"])) {
        if (c.match(re)) return c;
    }
    return -1;
}

function customizeCards(c = null) {
    if (!options.custom_cards) return;
    try {
        let cards = c ? c : document.querySelectorAll('.ic-DashboardCard');
        if (cards.length && cards.length > 0 && cards[0].querySelectorAll(".ic-DashboardCard__link").length === 0) return;

        cards.forEach(card => {
            const id = getCardId(card);
            let cardOptions = options["custom_cards"][id] || null;
            let cardOptions_2 = options["custom_cards_2"][id] || null;
            if (!cardOptions) return;
            card.style.display = cardOptions.hidden === true ? "none" : "inline-block";

            if (cardOptions.img === "none") {
                let currentImg = card.querySelector(".ic-DashboardCard__header_image");
                if (currentImg) {
                    card.querySelector(".ic-DashboardCard__header_hero").style.opacity = 1;
                }
            } else if (cardOptions.img !== "") {
                let topColor = card.querySelector(".ic-DashboardCard__header_hero");
                let container = card.querySelector(".ic-DashboardCard__header_image") || makeElement("div", card, { "className": "ic-DashboardCard__header_image" });
                card.querySelector(".ic-DashboardCard__header").prepend(container);
                container.appendChild(topColor);
                container.style.backgroundImage = "url(\"" + cardOptions.img + "\")";
                topColor.style.opacity = .5;
            }

            if (cardOptions.name !== "") {
                card.querySelector(".ic-DashboardCard__header-title > span").textContent = cardOptions.name;
            }

            if (cardOptions.code !== "") {
                card.querySelector(".ic-DashboardCard__header-subtitle").textContent = cardOptions.code;
            }

            let links = card.querySelectorAll(".ic-DashboardCard__action");
            for (let i = links.length; i < 4; i++) {
                makeElement("a", card.querySelector(".ic-DashboardCard__action-container"), { "className": "ic-DashboardCard__action" });
            }
            links = card.querySelectorAll(".ic-DashboardCard__action");
            for (let i = 0; i < 4; i++) {
                let img = links[i].querySelector(".canvasrefined-link-image") || makeElement("img", links[i], { "className": "canvasrefined-link-image" });
                links[i].style.display = "inherit";
                if (cardOptions_2.links[i].path === "none") {
                    links[i].style.display = "none";
                } else if (cardOptions_2.links[i].is_default === false) {
                    links[i].href = cardOptions_2.links[i].path;
                    img.src = getCustomLinkImage(cardOptions_2.links[i].path);
                    if (links[i].querySelector(".ic-DashboardCard__action-layout")) links[i].querySelector(".ic-DashboardCard__action-layout").style.display = "none";
                    img.style.display = "block";
                } else {
                    if (links[i].querySelector(".ic-DashboardCard__action-layout")) links[i].querySelector(".ic-DashboardCard__action-layout").style.display = "inherit";
                    img.style.display = "none";
                }
                img.addEventListener("error", () => {
                    img.src = "https://www.instructure.com/favicon.ico";
                })
            }

        });

        // Visibility changes row widths, so re-center the uneven rows.
        centerUnevenGridRows();

    } catch (e) {
        logError(e);
    }
}

function getCustomLinkImage(path) {
    if (path.includes("webassign.net")) {
        return "https://www.cengage.com/favicon.ico";
    } else if (path.includes("docs.google")) {
        return "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico";
    } else {
        let url = { "hostname": "instructure.com/" };
        try {
            url = new URL(path);
        } catch (e) {
            logError(e);
        }
        return "https://" + url.hostname + "/favicon.ico";;
    }
}

/*
GPA calculator
*/

function calculateGPA2() {
    if (!document.querySelector("#canvasrefined-cumulative-gpa")) return;
    let qualityPoints = 0, numCredits = 0, weightedQualityPoints = 0, cumulativePoints = 0, cumulativeCredits = 0;
    document.querySelectorAll('.canvasrefined-gpa-course').forEach(course => {
        course.dataset.gradeLetter = "--";
        const weight = course.querySelector('.canvasrefined-course-weight').value;
        const credits = parseFloat(course.querySelector('.canvasrefined-course-credit').value);
        const grade = parseFloat(course.querySelector('.canvasrefined-course-percent').value);
        if (weight === "dnc" || !credits || !grade) return;
        let letter = "--";
        let gpa;
        if (grade >= options.gpa_calc_bounds["A+"].cutoff) {
            gpa = options.gpa_calc_bounds["A+"].gpa;
            letter = "A+";
        } else if (grade >= options.gpa_calc_bounds["A"].cutoff) {
            gpa = options.gpa_calc_bounds["A"].gpa;
            letter = "A";
        } else if (grade >= options.gpa_calc_bounds["A-"].cutoff) {
            gpa = options.gpa_calc_bounds["A-"].gpa;
            letter = "A-";
        } else if (grade >= options.gpa_calc_bounds["B+"].cutoff) {
            gpa = options.gpa_calc_bounds["B+"].gpa;
            letter = "B+";
        } else if (grade >= options.gpa_calc_bounds["B"].cutoff) {
            gpa = options.gpa_calc_bounds["B"].gpa;
            letter = "B";
        } else if (grade >= options.gpa_calc_bounds["B-"].cutoff) {
            gpa = options.gpa_calc_bounds["B-"].gpa;
            letter = "B-"
        } else if (grade >= options.gpa_calc_bounds["C+"].cutoff) {
            gpa = options.gpa_calc_bounds["C+"].gpa;
            letter = "C+";
        } else if (grade >= options.gpa_calc_bounds["C"].cutoff) {
            gpa = options.gpa_calc_bounds["C"].gpa;
            letter = "C";
        } else if (grade >= options.gpa_calc_bounds["C-"].cutoff) {
            gpa = options.gpa_calc_bounds["C-"].gpa;
            letter = "C-";
        } else if (grade >= options.gpa_calc_bounds["D+"].cutoff) {
            gpa = options.gpa_calc_bounds["D+"].gpa;
            letter = "D+";
        } else if (grade >= options.gpa_calc_bounds["D"].cutoff) {
            gpa = options.gpa_calc_bounds["D"].gpa;
            letter = "D";
        } else if (grade >= options.gpa_calc_bounds["D-"].cutoff) {
            gpa = options.gpa_calc_bounds["D-"].gpa;
            letter = "D-";
        } else {
            letter = "F";
            gpa = options.gpa_calc_bounds["F"].gpa;
        }
            course.querySelector(".canvasrefined-gpa-letter-grade").textContent = letter;
            course.dataset.gradeLetter = letter;

            let weightMultiplier = 0;
            if (weight === "ap") {
                weightMultiplier = 1;
            } else if (weight === "honors") {
                weightMultiplier = .5;
            }
            
            qualityPoints += gpa * credits;
            weightedQualityPoints += (gpa + weightMultiplier) * credits;
            numCredits += credits;


    });
    document.querySelector("#canvasrefined-gpa-unweighted").textContent = Number.isFinite(qualityPoints / numCredits) ? (qualityPoints / numCredits).toFixed(2) : "--";
    document.querySelector("#canvasrefined-gpa-weighted").textContent = Number.isFinite(weightedQualityPoints / numCredits) ? (weightedQualityPoints / numCredits).toFixed(2) : "--";
    const cGPA = document.querySelector("#canvasrefined-cumulative-gpa");
    const g = parseFloat(cGPA.querySelector(".canvasrefined-course-percent").value);
    const c = parseInt(cGPA.querySelector(".canvasrefined-course-credit").value);
    const cumulativeTotal = (options.gpa_calc_weighted === true ? weightedQualityPoints : qualityPoints) + (g * c);
    document.querySelector("#canvasrefined-gpa-cumulative").textContent = Number.isFinite(cumulativeTotal / (numCredits + c)) ? (cumulativeTotal / (numCredits + c)).toFixed(2) : "--";
    const gpaModal = document.getElementById("canvasrefined-gpa-modal");
    if (gpaModal) gpaModal.querySelectorAll("[data-gpa-mirror]").forEach(tile => {
        const src = document.getElementById("canvasrefined-gpa-" + tile.dataset.gpaMirror);
        if (src) tile.querySelector(".cr-gpa-result-value").textContent = src.textContent;
    });
}

function changeGPASettings(course_id, update) {
    calculateGPA2();
    chrome.storage.sync.get(["custom_cards", "cumulative_gpa"], storage => {
        if (course_id === "cumulative") {
            chrome.storage.sync.set({ "cumulative_gpa": { ...storage["cumulative_gpa"], ...update } });
        } else {
            chrome.storage.sync.set({ "custom_cards": { ...storage["custom_cards"], [course_id]: { ...storage["custom_cards"][course_id], ...update } } });
        }
    });
}

function createGPACalcCourse(location, course) {

    let customs;
    if (course.access_restricted_by_date === true) {
        return null;
    } if (course.id === "cumulative") {
        customs = options["cumulative_gpa"];
    } else if (options.custom_cards && options.custom_cards[course.id]) {
        customs = options.custom_cards[course.id];
    } else {
        return;
        customs = { "name": course.name, "hidden": false, "weight": "regular", "credits": 1, "gr": null };
    }
    if (customs.hidden === true) return;

    let courseContainer = makeElement("div", location, { "className": course.id === "cumulative" ? "canvasrefined-gpa-cumulative" : "canvasrefined-gpa-course", "innerHTML": '<div class="canvasrefined-gpa-letter-grade"></div>' });
    let courseName = makeElement("p", courseContainer, { "className": "canvasrefined-gpa-name", "textContent": customs.name === "" ? course.course_code : customs.name });
    let changerContainer = makeElement("div", courseContainer, { "className": "canvasrefined-gpa-percent-container" });

    let credits = makeElement("div", courseContainer, { "className": "canvasrefined-course-credits", "innerHTML": '<input class="canvasrefined-course-credit" value="1"></input><span class="canvasrefined-course-percent-sign">cr</span>' });
    let creditsChanger = credits.querySelector(".canvasrefined-course-credit");
    creditsChanger.value = customs.credits;
    let changer = makeElement("input", changerContainer, { "className": "canvasrefined-course-percent" });
    let percent = makeElement("span", changerContainer, { "className": "canvasrefined-course-percent-sign", "textContent": course.id === "cumulative" ? "/4" : "%" });
    let courseGrade = course?.enrollments[0].has_grading_periods === true ? course.enrollments[0].current_period_computed_current_score : course.enrollments[0].computed_current_score;

    // Hidden details: same fake grade as the card, and a fake GPA from its letter.
    const anonGpa = options.hide_personal_details === true;
    if (anonGpa) {
        changer.value = course.id === "cumulative" ? fakeCumulativeGpa() : fakeGradePercent("id:" + course.id);
    } else if (customs["gr"] !== null) {
        changer.value = customs["gr"];
    } else if (courseGrade) {
        changer.value = courseGrade;
    } else {
        changer.value = "--";
    }

    if (anonGpa && course.id !== "cumulative") {
        courseName.textContent = fakeCourseLabel("id:" + course.id);
    }

    if (course.id !== "cumulative") {
        let weightSelections = makeElement("form", courseContainer, { "className": "canvasrefined-course-weights" });
        weightSelections.innerHTML = '<select name="weight-selection" class="canvasrefined-course-weight"><option value="dnc">' + (chrome.i18n.getMessage("gpa_weight_dnc") || "Do not count") + '</option><option value="regular">' + (chrome.i18n.getMessage("gpa_weight_regular") || "Regular/College") + '</option><option value="honors">' + (chrome.i18n.getMessage("gpa_weight_honors") || "Honors") + '</option><option value="ap">' + (chrome.i18n.getMessage("gpa_weight_ap") || "AP/IB") + '</option></select>';
        let weightChanger = weightSelections.querySelector(".canvasrefined-course-weight");
        // Only courses with a real (or saved) grade count; a fake must not revive blanks.
        weightChanger.value = (courseGrade || customs["gr"] !== null) ? customs.weight : "dnc";   
        weightChanger.addEventListener('change', () => changeGPASettings(course.id, { "weight": weightSelections.querySelector(".canvasrefined-course-weight").value }));

        let useCustomGr = makeElement("input", courseContainer, { "className": "canvasrefined-course-customgr", "type": "checkbox", "checked": customs.gr !== null ? true : false });
        let useCustomGrLabel = makeElement("span", courseContainer, { "className": "canvasrefined-course-customgr-label", "textContent": chrome.i18n.getMessage("gpa_save_custom") || "Save custom grade" });
        useCustomGr.addEventListener("input", () => {
            if (options["custom_cards"][course.id]) {
                if (options["custom_cards"][course.id]["gr"] !== undefined && options["custom_cards"][course.id]["gr"] !== null) {
                    changer.value = courseGrade;
                    changeGPASettings(course.id, { "gr": null });
                } else {
                    changeGPASettings(course.id, { "gr": changer.value });
                }
            }
            if (options.hide_personal_details === true) changer.value = fakeGradePercent("id:" + course.id);
        });
    }   

    changer.addEventListener('input', (e) => {
        if (options.hide_personal_details === true) {
            calculateGPA2();
            return;
        }
        if (course.id === "cumulative" || (options["custom_cards"][course.id]["gr"] !== undefined && options["custom_cards"][course.id]["gr"] !== null)) {
            changeGPASettings(course.id, { "gr": e.target.value });
        } else {
            calculateGPA2();
        }
    });

    credits.querySelector(".canvasrefined-course-credit").addEventListener('input', () => changeGPASettings(course.id, { "credits": credits.querySelector(".canvasrefined-course-credit").value }));
    return courseContainer;
}

function gpaCalcPosition() {
    if (options.gpa_calc_position !== undefined) return options.gpa_calc_position;
    return options.gpa_calc_prepend === true ? "cards_start" : "cards_end";
}

// Place the pair at the chosen position; re-inserting in-place nodes retriggers this pass.
function placeGPAElements(dashboardContainer, container, container2) {
    // Leave it alone while the calculator is hosted in the open modal.
    if (container.closest && container.closest("#canvasrefined-gpa-modal")) return;
    if (options.gpa_calc !== true) {
        releaseWidgetFromRow("gpa_calc", [container2, container], dashboardContainer);
        return;
    }
    const pos = gpaCalcPosition();
    const containerMode = pos === "top" || pos === "below";
    crApplyCardHeight("gpa_calc", container2, !containerMode);
    container.classList.toggle("container-mode", containerMode);
    container2.classList.toggle("container-mode", containerMode);
    const parent = dashboardContainer.parentNode;
    if (containerMode) {
        placeWidgetInRow("gpa_calc", pos, [container2, container], dashboardContainer);
        return;
    }
    releaseWidgetFromRow("gpa_calc", [container2, container], dashboardContainer);
    if (pos === "cards_start") {
        if (dashboardContainer.children[0] !== container || dashboardContainer.children[1] !== container2) {
            dashboardContainer.insertBefore(container, dashboardContainer.firstChild);
            dashboardContainer.insertBefore(container2, container.nextSibling);
        }
        applyCardWidgetOrder(dashboardContainer);
    } else if (pos === "cards_end") {
        if (dashboardContainer.lastElementChild !== container || container2.nextElementSibling !== container) {
            dashboardContainer.appendChild(container2);
            dashboardContainer.appendChild(container);
        }
        applyCardWidgetOrder(dashboardContainer);
    } else if (pos === "top") {
        if (container2.parentNode !== parent || container2.nextElementSibling !== container || container.nextElementSibling !== dashboardContainer) {
            if (parent) {
                parent.insertBefore(container2, dashboardContainer);
                parent.insertBefore(container, container2.nextSibling);
            } else {
                dashboardContainer.prepend(container2);
                dashboardContainer.prepend(container);
            }
        }
    } else { // below
        if (container2.parentNode !== parent || dashboardContainer.nextElementSibling !== container2 || container2.nextElementSibling !== container) {
            if (parent) {
                parent.insertBefore(container2, dashboardContainer.nextSibling);
                parent.insertBefore(container, container2.nextSibling);
            } else {
                dashboardContainer.appendChild(container2);
                dashboardContainer.appendChild(container);
            }
        }
    }
}

const CR_WIDGET_IDS = ["dashboard_notes", "gpa_calc", "focus_timer", "breathing", "daily_quotes", "quick_links"];
// Widgets rendered by the generic loader: one root element, no GPA-style pair.
const CR_SIMPLE_WIDGET_IDS = ["focus_timer", "breathing", "daily_quotes", "quick_links"];
function isCRWidget(id) { return CR_WIDGET_IDS.indexOf(id) !== -1; }

// Shared full-width row (top/below): slot width is the % from the Widgets tab.
function containerWidgetOrder(area) {
    const saved = options.widget_order && options.widget_order[area];
    if (!Array.isArray(saved)) return [];
    return saved.map(e => {
        if (typeof e === "string") return { id: e, size: null };
        if (e && typeof e === "object" && e.id) {
            const n = Number(e.size);
            return { id: e.id, size: Number.isFinite(n) && n > 0 ? n : null };
        }
        return null;
    }).filter(e => e && isCRWidget(e.id));
}

// Card widgets keep their own before/after anchor; saved order sequences the tie.
function cardWidgetOrder() {
    const saved = options.widget_order && options.widget_order.cards;
    if (!Array.isArray(saved)) return [];
    return saved.map(e => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object" && e.id) return e.id;
        return null;
    }).filter(id => isCRWidget(id));
}

// Order card widgets per the saved order; only re-inserts when the DOM order is wrong.
function applyCardWidgetOrder(grid) {
    if (!grid) return;
    const saved = cardWidgetOrder();
    const units = [];
    grid.querySelectorAll(":scope > .canvasrefined-widget-card[data-cr-widget]").forEach(el => {
        if (!el.classList.contains("in-cards")) return;
        const id = el.dataset.crWidget;
        if (CR_SIMPLE_WIDGET_IDS.indexOf(id) === -1) return;
        units.push({ id, anchor: (options[id + "_position"] === "cards_start") ? "start" : "end", els: [el] });
    });
    const notes = grid.querySelector(":scope > .canvasrefined-dashboard-notes");
    if (notes && notes.classList.contains("in-cards")) {
        units.push({
            id: "dashboard_notes",
            anchor: options.dashboard_notes_position === "cards_start" ? "start" : "end",
            els: [notes]
        });
    }
    const gpaCard = grid.querySelector(":scope > .canvasrefined-gpa-card");
    if (gpaCard && !gpaCard.classList.contains("container-mode")) {
        const pos = gpaCalcPosition();
        const anchor = pos === "cards_start" ? "start" : "end";
        // The GPA is two adjacent children (calculator + card); keep the pair in order.
        const calc = grid.querySelector(":scope > .canvasrefined-gpa");
        const els = calc ? (anchor === "start" ? [calc, gpaCard] : [gpaCard, calc]) : [gpaCard];
        units.push({ id: "gpa_calc", anchor, els });
    }
    if (units.length < 2) return;
    const rank = id => {
        const i = saved.indexOf(id);
        return i === -1 ? saved.length : i;
    };
    ["start", "end"].forEach(anchor => {
        const group = units.filter(u => u.anchor === anchor)
            .sort((a, b) => rank(a.id) - rank(b.id));
        if (group.length < 2) return;
        const desired = group.flatMap(u => u.els);
        const positions = desired.map(el => [...grid.children].indexOf(el));
        const sorted = [...positions].sort((a, b) => a - b);
        const inOrder = desired.every((_, i) =>
            anchor === "start" ? positions[i] === sorted[i] : positions[i] === sorted[sorted.length - 1 - i]);
        if (inOrder) return;
        if (anchor === "start") {
            // Insert in reverse so the group's first widget ends up leftmost.
            for (let i = desired.length - 1; i >= 0; i--) grid.insertBefore(desired[i], grid.firstChild);
        } else {
            desired.forEach(el => grid.appendChild(el));
        }
    });
}

// Anchor both widgets to the outer card container, or they build two separate rows.
function widgetContainerAnchor(container) {
    if (container && container.id === "DashboardCard_Container") return container;
    return document.querySelector("#DashboardCard_Container") || container;
}

function ensureWidgetRow(area, container) {
    const parent = container.parentNode;
    if (!parent) return null;
    let row = parent.querySelector(":scope > .canvasrefined-widget-row[data-area='" + area + "']");
    if (!row) {
        row = document.createElement("div");
        row.className = "canvasrefined-widget-row";
        row.dataset.area = area;
        if (area === "top") parent.insertBefore(row, container);
        else parent.insertBefore(row, container.nextSibling);
    }
    return row;
}

function applyWidgetRowLayout(row, area) {
    const slots = [...row.querySelectorAll(":scope > .canvasrefined-widget-slot")];
    if (!slots.length) { row.remove(); return; }
    // Shared row height (px; 0 = auto) so every widget in the row matches.
    const rowHeight = parseInt(options.widget_row_height, 10);
    if (Number.isFinite(rowHeight) && rowHeight > 0) row.style.height = rowHeight + "px";
    else row.style.height = "";
    const entries = containerWidgetOrder(area);
    const byId = {};
    slots.forEach(slot => { byId[slot.dataset.widget] = slot; });
    const order = entries.map(e => e.id).filter(id => byId[id]);
    slots.forEach(slot => { if (!order.includes(slot.dataset.widget)) order.push(slot.dataset.widget); });

    const currentOrder = slots.map(s => s.dataset.widget);
    if (currentOrder.join("|") !== order.join("|")) {
        order.forEach(id => row.appendChild(byId[id]));
    }

    row.querySelectorAll(":scope > .canvasrefined-widget-divider").forEach(d => d.remove());

    // Unsized widgets borrow the average, so the weights always sum to 1.
    const byIdEntry = Object.fromEntries(entries.map(e => [e.id, e]));
    const raw = order.map(id => {
        const e = byIdEntry[id];
        return e && Number.isFinite(e.size) && e.size > 0 ? e.size : null;
    });
    const known = raw.filter(v => v !== null);
    const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    const rawFilled = raw.map(v => v === null ? fallback : v);
    const totalWeight = rawFilled.reduce((a, b) => a + b, 0) || 1;
    const weights = rawFilled.map(v => v / totalWeight);
    order.forEach((id, i) => {
        byId[id].dataset.sizePct = weights[i] * 100;
        byId[id].style.flex = weights[i] + " 1 0%";
        byId[id].style.minWidth = "0";
    });
}

function placeWidgetInRow(id, area, els, container) {
    const row = ensureWidgetRow(area, widgetContainerAnchor(container));
    if (!row) return;
    let slot = row.querySelector(":scope > .canvasrefined-widget-slot[data-widget='" + id + "']");
    if (!slot) {
        slot = document.createElement("div");
        slot.className = "canvasrefined-widget-slot";
        slot.dataset.widget = id;
        row.appendChild(slot);
    }
    // Drop the slot it held in a different row, or its old % keeps reserving space.
    const first = els[0];
    const oldSlot = first && first.closest && first.closest(".canvasrefined-widget-slot");
    if (oldSlot && oldSlot !== slot) {
        const oldRow = oldSlot.parentNode;
        oldSlot.remove();
        if (oldRow && oldRow !== row) applyWidgetRowLayout(oldRow, oldRow.dataset.area);
    }
    els.forEach(el => { if (el.parentNode !== slot) slot.appendChild(el); });
    applyWidgetRowLayout(row, area);
}

function releaseWidgetFromRow(id, els, container) {
    const first = els[0];
    const slot = first && first.closest && first.closest(".canvasrefined-widget-slot");
    if (!slot) return;
    const row = slot.parentNode;
    const parent = row.parentNode;
    const ref = row.dataset.area === "top" ? row.nextSibling : row;
    els.forEach(el => { if (el.parentNode === slot) parent.insertBefore(el, ref); });
    slot.remove();
    if (row && !row.querySelector(":scope > .canvasrefined-widget-slot")) row.remove();
    else if (row) applyWidgetRowLayout(row, row.dataset.area);
}

// Edit Calculator modal: built fresh per open; state syncs through chrome.storage.
const GPA_BOUNDS_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

const GPA_PLUS_MINUS_PRESET = {
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
};

const GPA_BY_LETTER_PRESET = {
    "A+": { "cutoff": 97, "gpa": 4.0 },
    "A": { "cutoff": 93, "gpa": 4.0 },
    "A-": { "cutoff": 90, "gpa": 4.0 },
    "B+": { "cutoff": 87, "gpa": 3.0 },
    "B": { "cutoff": 83, "gpa": 3.0 },
    "B-": { "cutoff": 80, "gpa": 3.0 },
    "C+": { "cutoff": 77, "gpa": 2.0 },
    "C": { "cutoff": 73, "gpa": 2.0 },
    "C-": { "cutoff": 70, "gpa": 2.0 },
    "D+": { "cutoff": 67, "gpa": 1.0 },
    "D": { "cutoff": 63, "gpa": 1.0 },
    "D-": { "cutoff": 60, "gpa": 1.0 },
    "F": { "cutoff": 0, "gpa": 0 }
};

function renderGpaBoundsEditor(host) {
    if (!host.isConnected) return;
    chrome.storage.sync.get(["gpa_calc_bounds"], storage => {
        const bounds = storage["gpa_calc_bounds"];
        if (!bounds || !host.isConnected) return;
        host.textContent = "";
        GPA_BOUNDS_ORDER.forEach(key => {
            const row = document.createElement("label");
            row.className = "cr-gpa-row";
            row.innerHTML =
                '<span class="cr-gpa-chip">' + key + '</span>' +
                '<span class="cr-gpa-field"><input class="cr-gpa-input" data-field="cutoff" type="text" inputmode="decimal"><span class="cr-gpa-suffix">%</span></span>' +
                '<span class="cr-gpa-field"><input class="cr-gpa-input" data-field="gpa" type="text" inputmode="decimal"><span class="cr-gpa-suffix">' + getMsg("gpa_pts_abbr", "pts") + '</span></span>';
            const [cutoff, gpa] = row.querySelectorAll("input");
            cutoff.value = bounds[key].cutoff;
            gpa.value = bounds[key].gpa;
            const save = field => () => {
                chrome.storage.sync.get(["gpa_calc_bounds"], existing => {
                    chrome.storage.sync.set({ "gpa_calc_bounds": { ...existing["gpa_calc_bounds"], [key]: { ...existing["gpa_calc_bounds"][key], [field]: parseFloat(field === "cutoff" ? cutoff.value : gpa.value) } } });
                });
            };
            cutoff.addEventListener("change", save("cutoff"));
            gpa.addEventListener("change", save("gpa"));
            host.appendChild(row);
        });
        const modal = host.closest("#canvasrefined-gpa-modal");
        if (modal) {
            const json = JSON.stringify(bounds);
            modal.querySelectorAll(".cr-gpa-preset").forEach(btn => {
                const preset = btn.dataset.preset === "letter" ? GPA_BY_LETTER_PRESET : GPA_PLUS_MINUS_PRESET;
                btn.classList.toggle("active", JSON.stringify(preset) === json);
            });
        }
    });
}

function closeGpaModal(dashboardContainer, container, container2) {
    const modal = document.getElementById("canvasrefined-gpa-modal");
    if (modal) {
        if (modal.__crKeyHandler) document.removeEventListener("keydown", modal.__crKeyHandler);
        modal.remove();
    }
    if (container2.parentNode) container2.parentNode.insertBefore(container, container2.nextSibling);
    container.style.display = "none";
    placeGPAElements(dashboardContainer, container, container2);
}

function openGpaModal(dashboardContainer, container, container2) {
    closeGpaModal(dashboardContainer, container, container2);

    const modal = document.createElement("div");
    modal.id = "canvasrefined-gpa-modal";
    modal.innerHTML = `
        <div class="cr-gpa-modal" role="dialog" aria-modal="true" aria-label="${getMsg("gpa_calculator_title", "GPA Calculator")}">
            <header class="cr-gpa-head">
                <div class="cr-gpa-head-titles">
                    <span class="cr-gpa-title">${getMsg("gpa_calculator_title", "GPA Calculator")}</span>
                    <span class="cr-gpa-subtitle">${getMsg("gpa_autosave", "Changes save automatically")}</span>
                </div>
                <div class="cr-gpa-results">
                    <div class="cr-gpa-result" data-gpa-mirror="unweighted"><span class="cr-gpa-result-value">--</span><span class="cr-gpa-result-label">${getMsg("gpa_current", "Current")}</span></div>
                    <div class="cr-gpa-result" data-gpa-mirror="weighted"><span class="cr-gpa-result-value">--</span><span class="cr-gpa-result-label">${getMsg("gpa_weighted", "Weighted")}</span></div>
                    <div class="cr-gpa-result" data-gpa-mirror="cumulative"><span class="cr-gpa-result-value">--</span><span class="cr-gpa-result-label">${getMsg("gpa_cumulative", "Cumulative")}</span></div>
                </div>
                <button class="cr-gpa-close" type="button" aria-label="${getMsg("close", "Close")}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </header>
            <div class="cr-gpa-body">
                <section class="cr-gpa-pane cr-gpa-pane-courses">
                    <div class="cr-gpa-pane-head">${getMsg("gpa_courses", "Courses")}</div>
                    <div class="cr-gpa-colhead" aria-hidden="true"><span></span><span>${getMsg("gpa_col_course", "Course")}</span><span>${getMsg("gpa_col_grade", "Grade")}</span><span>${getMsg("gpa_col_credits", "Credits")}</span><span>${getMsg("gpa_col_course_type", "Course type")}</span><span class="cr-gpa-colhead-custom">${getMsg("gpa_col_custom_grade", "Custom grade")}</span></div>
                    <div class="cr-gpa-courses-host"></div>
                </section>
                <aside class="cr-gpa-pane cr-gpa-pane-scale">
                    <div class="cr-gpa-pane-head">${getMsg("gpa_grade_scale", "Grade scale")}</div>
                    <div class="cr-gpa-seg">
                        <button class="cr-gpa-preset" data-preset="plusminus" type="button">${getMsg("gpa_scale_plusminus", "+/- Scale")}</button>
                        <button class="cr-gpa-preset" data-preset="letter" type="button">${getMsg("gpa_scale_letter", "Letter only")}</button>
                    </div>
                    <div class="cr-gpa-scale-head" aria-hidden="true"><span></span><span>${getMsg("gpa_min_pct", "Min %")}</span><span>GPA</span></div>
                    <div class="cr-gpa-modal-bounds"></div>
                    <p class="cr-gpa-note">${getMsg("gpa_scale_note", "A percentage earns the GPA of the first row whose Min % is at or below it. If your school doesn't use +/- grades, set the Min % of the +/- rows to 101 to take them out of the math.")}</p>
                </aside>
            </div>
        </div>`;
    document.body.appendChild(modal);

    if (options.gpa_calc_weighted !== true) modal.querySelector('[data-gpa-mirror="weighted"]').style.display = "none";
    if (options.gpa_calc_cumulative !== true) modal.querySelector('[data-gpa-mirror="cumulative"]').style.display = "none";

    // Seed the tiles from the card's numbers; calculateGPA2 keeps them live.
    modal.querySelectorAll("[data-gpa-mirror]").forEach(tile => {
        const src = document.getElementById("canvasrefined-gpa-" + tile.dataset.gpaMirror);
        if (src) tile.querySelector(".cr-gpa-result-value").textContent = src.textContent || "--";
    });

    modal.querySelector(".cr-gpa-courses-host").appendChild(container);
    container.style.display = "block";

    const boundsHost = modal.querySelector(".cr-gpa-modal-bounds");
    renderGpaBoundsEditor(boundsHost);
    modal.querySelector('[data-preset="plusminus"]').addEventListener("click", () => {
        chrome.storage.sync.set({ "gpa_calc_bounds": GPA_PLUS_MINUS_PRESET }, () => renderGpaBoundsEditor(boundsHost));
    });
    modal.querySelector('[data-preset="letter"]').addEventListener("click", () => {
        chrome.storage.sync.set({ "gpa_calc_bounds": GPA_BY_LETTER_PRESET }, () => renderGpaBoundsEditor(boundsHost));
    });

    const close = () => closeGpaModal(dashboardContainer, container, container2);
    modal.__crKeyHandler = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", modal.__crKeyHandler);
    modal.querySelector(".cr-gpa-close").addEventListener("click", close);
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
}

function updateGpaHoverBlur() {
    const card = document.querySelector(".canvasrefined-gpa-card");
    if (!card) return;
    card.classList.toggle("gpa-show-on-hover", options.gpa_calc_show_on_hover === true);
}

// Bounded retry while Canvas renders the container, instead of waiting for the observer.
let gpaSetupRetryTimer = null;
let gpaSetupAttempts = 0;
function setupGPACalc() {
    if (current_page !== "/" && current_page !== "") return;
    try {
        const sortableContainer = document.querySelector(".ic-DashboardCard__box__container");
        const dashboardContainer = sortableContainer || document.querySelector("#DashboardCard_Container");
        if (!dashboardContainer) {
            if (!gpaSetupRetryTimer && gpaSetupAttempts < 20) {
                gpaSetupAttempts++;
                gpaSetupRetryTimer = setTimeout(() => {
                    gpaSetupRetryTimer = null;
                    setupGPACalc();
                }, 150);
            }
            return;
        }
        gpaSetupAttempts = 0;

        let container2 = document.querySelector(".canvasrefined-gpa-card");
        let container = document.querySelector(".canvasrefined-gpa");
        const alreadyRendered = container2?.dataset?.canvasrefinedGpaRendered === "true" && container?.dataset?.canvasrefinedGpaRendered === "true";

        if (!container2) {
            container2 = document.createElement("div");
            container2.className = "canvasrefined-gpa-card";
        }
        if (!container) {
            container = document.createElement("div");
            container.className = "canvasrefined-gpa";
        }

        container2.style.display = options.gpa_calc === true ? "inline-block" : "none";

        if (!alreadyRendered) {
            // Render the shell now (with "--") and fill the numbers once grades resolve.
            container2.innerHTML = `<h3 class="canvasrefined-gpa-header">${getMsg("gpa_header", "GPA")}</h3><div><div><p id="canvasrefined-gpa-unweighted">--</p><p>${getMsg("gpa_current", "Current")}</p></div><div style="display:${options["gpa_calc_weighted"] ? "block" : "none"}"><p id="canvasrefined-gpa-weighted">--</p><p>${getMsg("gpa_weighted", "Weighted")}</p></div><div style="display:${options["gpa_calc_cumulative"] ? "block" : "none"}"><p id="canvasrefined-gpa-cumulative">--</p><p>${getMsg("gpa_cumulative", "Cumulative")}</p></div></div>`;
            let editBtn = makeElement("button", container2, { "className": "canvasrefined-gpa-edit-btn", "textContent": chrome.i18n.getMessage("gpa_edit_calculator") || "Edit Calculator" });

            container.innerHTML = '<h3 class="canvasrefined-gpa-header">' + (chrome.i18n.getMessage("gpa_calculator_title") || chrome.i18n.getMessage("gpa_calculator") || "GPA Calculator") + '</h3><div class="canvasrefined-gpa-courses-container"><div class="canvasrefined-gpa-courses"></div></div>';

            editBtn.addEventListener("click", () => openGpaModal(dashboardContainer, container, container2));

            container.style.display = "none";

            container2.dataset.canvasrefinedGpaRendered = "true";
            container.dataset.canvasrefinedGpaRendered = "true";
        } else {
            const weighted = container2.querySelector("#canvasrefined-gpa-weighted")?.parentElement;
            const cumulative = container2.querySelector("#canvasrefined-gpa-cumulative")?.parentElement;
            if (weighted) weighted.style.display = options.gpa_calc_weighted ? "block" : "none";
            if (cumulative) cumulative.style.display = options.gpa_calc_cumulative ? "block" : "none";
        }

        placeGPAElements(dashboardContainer, container, container2);
        updateGpaHoverBlur();

        try {
            if (sortableContainer && window.jQuery && window.jQuery.fn && window.jQuery.fn.sortable) {
                window.jQuery(sortableContainer).sortable('refresh');
            }
        } catch (e) {}

        grades?.then(result => {
            const location = container.querySelector(".canvasrefined-gpa-courses");
            if (!location || !container.isConnected) return;
            if (container.dataset.canvasrefinedGpaPopulated !== "true") {
                location.textContent = "";
                const cumulative = createGPACalcCourse(location, { "id": "cumulative", "enrollments": [{ "has_grading_periods": true, "current_period_computed_current_score": 0 }] });
                if (cumulative) cumulative.id = "canvasrefined-cumulative-gpa";
                result.forEach(course => createGPACalcCourse(location, course));
                container.dataset.canvasrefinedGpaPopulated = "true";
            }
            calculateGPA2();
        }).catch(e => logError(e));
    } catch (e) {
        logError(e);
    }
}

/*
Dashboard notes
*/

let dashboardNotesTimer;
function delayDashboardNotesStorage(text) {
    clearTimeout(dashboardNotesTimer);
    dashboardNotesTimer = setTimeout(() => {
        chrome.storage.sync.set({ dashboard_notes_text: text });
    }, 250);
}

/* Fallback Markdown renderer used only if js/markdown.js failed to load. */
function crRenderMarkdownFallback(src) {
    if (src == null) return "";
    const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const sanitizeUrl = (u) => {
        const v = String(u == null ? "" : u).trim();
        if (!v) return "";
        if (/^(https?:|mailto:|ftp:|tel:)/i.test(v)) return v;
        if (/^(javascript:|vbscript:|file:|data:)/i.test(v)) return "#";
        if (/^[#/?]/.test(v)) return v;
        if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "#";
        return v;
    };
    let text = String(src).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const out = [];
    const lines = text.split("\n");
    let i = 0;
    let taskSeq = 0; // ordinal of rendered task items, stable across code-block stashing
    const inline = (t) => {
        let h = escapeHtml(t);
        h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, url, title) =>
            `<img src="${sanitizeUrl(url)}" alt="${alt}"${title ? ` title="${title}"` : ""}>`);
        h = h.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, txt, url, title) =>
            `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ""}>${txt}</a>`);
        h = h.replace(/`([^`\n]+)`/g, (m, c) => `<code>${c}</code>`);
        h = h.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
        h = h.replace(/~~([^~]+?)~~/g, "<del>$1</del>");
        h = h.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
        return h;
    };
    while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) { i++; continue; }
        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) { const l = h[1].length; out.push(`<h${l}>${inline(h[2])}</h${l}>`); i++; continue; }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
        if (/^>\s?/.test(line)) {
            const q = []; while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(inline(lines[i].replace(/^>\s?/, ""))); i++; }
            out.push(`<blockquote>${q.join("<br>")}</blockquote>`); continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const items = []; while (i < lines.length) { const m = lines[i].match(/^\s*[-*+]\s+(.*)$/); if (!m) break; const tk = m[1].match(/^\[([ xX])\]\s+(.*)$/); if (tk) { items.push(`<li class="cr-task" data-cr-task="${taskSeq++}"><input type="checkbox"${/x/i.test(tk[1]) ? " checked" : ""}> ${inline(tk[2])}</li>`); } else { items.push(`<li>${inline(m[1])}</li>`); } i++; } out.push(`<ul>${items.join("")}</ul>`); continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
            const items = []; while (i < lines.length) { const m = lines[i].match(/^\s*\d+\.\s+(.*)$/); if (!m) break; items.push(`<li>${inline(m[1])}</li>`); i++; } out.push(`<ol>${items.join("")}</ol>`); continue;
        }
        const para = [line]; i++; while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>)/.test(lines[i])) { para.push(lines[i]); i++; }
        out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("\n");
}

function renderDashboardNotesPreview(preview, text) {
    if (!preview) return;
    // Skip identical re-renders to avoid a self-sustaining observer loop.
    if (preview._crLastText === text) return;
    preview._crLastText = text;
    const renderer = (typeof window.renderMarkdown === "function") ? window.renderMarkdown : crRenderMarkdownFallback;
    preview.innerHTML = renderer(text);
}

/* Insert/wrap Markdown formatting at the selection and fire an input event. */
function notesApplyFormat(editor, action) {
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = editor.value;
    const fire = () => {
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.focus();
    };

    const wrap = (before, after, placeholder) => {
        const had = end > start;
        const sel = had ? value.slice(start, end) : (placeholder || "");
        editor.setRangeText(before + sel + after, start, end, "end");
        editor.selectionStart = start + before.length;
        editor.selectionEnd = start + before.length + sel.length;
        fire();
    };

    const lineBlock = () => {
        const ls = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
        let le = value.indexOf("\n", end);
        if (le === -1) le = value.length;
        return { ls, le, block: value.slice(ls, le) };
    };

    const togglePrefix = (prefix) => {
        const { ls, le, block } = lineBlock();
        const lines = block.split("\n");
        const allHave = lines.every((l) => l.startsWith(prefix));
        const newBlock = lines.map((l) => allHave ? l.slice(prefix.length) : prefix + l).join("\n");
        editor.setRangeText(newBlock, ls, le, "end");
        editor.selectionStart = ls;
        editor.selectionEnd = ls + newBlock.length;
        fire();
    };

    switch (action) {
        case "bold": wrap("**", "**", "bold"); break;
        case "italic": wrap("*", "*", "italic"); break;
        case "strike": wrap("~~", "~~", "strikethrough"); break;
        case "code": wrap("`", "`", "code"); break;
        case "h1": togglePrefix("# "); break;
        case "h2": togglePrefix("## "); break;
        case "list": togglePrefix("- "); break;
        case "numbered": togglePrefix("1. "); break;
        case "quote": togglePrefix("> "); break;
        case "task": {
            const { ls, le, block } = lineBlock();
            const marker = block.match(/^-\s*\[([ xX])\]\s+/);
            const bullet = block.match(/^[-*+]\s+/);
            let newBlock;
            if (marker) {
                newBlock = block.slice(marker[0].length);
            } else if (bullet) {
                newBlock = "- [ ] " + block.slice(bullet[0].length);
            } else {
                newBlock = "- [ ] " + block;
            }
            editor.setRangeText(newBlock, ls, le, "end");
            editor.selectionStart = ls;
            editor.selectionEnd = ls + newBlock.length;
            fire();
            break;
        }
        case "link": {
            const had = end > start;
            const sel = had ? value.slice(start, end) : "text";
            editor.setRangeText("[" + sel + "](url)", start, end, "end");
            const urlStart = start + 1 + sel.length + 2; // after "]("
            editor.selectionStart = urlStart;
            editor.selectionEnd = urlStart + 3; // select "url"
            fire();
            break;
        }
        case "hr": {
            const lead = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
            editor.setRangeText(lead + "---\n", start, start, "end");
            fire();
            break;
        }
        case "codeblock": {
            const had = end > start;
            const sel = had ? value.slice(start, end) : "code";
            const lead = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
            editor.setRangeText(lead + "```\n" + sel + "\n```", start, end, "end");
            fire();
            break;
        }
    }
}

/* Toggle the Nth rendered Markdown task checkbox (ordinal skips code blocks). */
function toggleDashboardNoteTask(editor, taskIndex) {
    if (!editor) return;
    const value = editor.value || "";
    const lines = value.split("\n");
    let inFence = false;
    let count = 0;
    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;
        const m = line.match(/^(\s*[-*+]\s+)\[([ xX])\](\s+)/);
        if (!m) continue;
        if (count === taskIndex) {
            const newMark = m[2] === " " ? "x" : " ";
            lines[idx] = m[1] + "[" + newMark + "]" + m[3] + line.slice(m[0].length);
            editor.value = lines.join("\n");
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            const notes = editor.closest(".canvasrefined-dashboard-notes");
            const rendered = notes ? notes.querySelector(".canvasrefined-notes-rendered") : null;
            if (rendered) renderDashboardNotesPreview(rendered, editor.value);
            return;
        }
        count++;
    }
}

function dashboardNotesHtml() { return `
    <div class="canvasrefined-notes-toolbar" role="toolbar" aria-label="${getMsg("notes_format", "Format notes")}">
        <button type="button" class="cr-fmt" data-action="bold" title="${getMsg("notes_bold", "Bold (Ctrl/Cmd+B)")}"><strong>B</strong></button>
        <button type="button" class="cr-fmt" data-action="italic" title="${getMsg("notes_italic", "Italic (Ctrl/Cmd+I)")}"><em>I</em></button>
        <button type="button" class="cr-fmt" data-action="strike" title="${getMsg("notes_strike", "Strikethrough")}"><s>S</s></button>
        <button type="button" class="cr-fmt" data-action="code" title="${getMsg("notes_inline_code", "Inline code")}"><code>&lt;/&gt;</code></button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="h1" title="${getMsg("notes_h1", "Heading 1")}">H1</button>
        <button type="button" class="cr-fmt" data-action="h2" title="${getMsg("notes_h2", "Heading 2")}">H2</button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="list" title="${getMsg("notes_bullet_list", "Bullet list")}">&bull;</button>
        <button type="button" class="cr-fmt" data-action="numbered" title="${getMsg("notes_numbered_list", "Numbered list")}">1.</button>
        <button type="button" class="cr-fmt" data-action="task" title="${getMsg("notes_task_list", "Task list")}">&#9744;</button>
        <button type="button" class="cr-fmt" data-action="quote" title="${getMsg("notes_quote", "Quote")}">&ldquo;</button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="link" title="${getMsg("notes_link", "Insert link")}">Link</button>
        <button type="button" class="cr-fmt" data-action="hr" title="${getMsg("notes_hr", "Horizontal rule")}">&mdash;</button>
        <button type="button" class="cr-fmt" data-action="codeblock" title="${getMsg("notes_codeblock", "Code block")}">&#96;&#96;&#96;</button>
    </div>
    <div class="canvasrefined-notes-surface">
        <div class="canvasrefined-notes-rendered" tabindex="0" aria-label="${chrome.i18n.getMessage("todo_click_to_edit") || "Dashboard notes — click to edit"}" title="${chrome.i18n.getMessage("todo_click_to_edit") || "Click to edit"}"></div>
        <textarea class="canvasrefined-notes-editor" placeholder="${chrome.i18n.getMessage("todo_type_away") || "Type away!"}" spellcheck="false"></textarea>
    </div>
`; }

function wireDashboardNotes(notes) {
    const editor = notes.querySelector(".canvasrefined-notes-editor");
    const rendered = notes.querySelector(".canvasrefined-notes-rendered");
    editor.value = options.dashboard_notes_text || "";
    renderDashboardNotesPreview(rendered, editor.value);

    const enterEdit = () => {
        if (notes.classList.contains("is-editing")) return;
        notes.classList.add("is-editing");
        editor.focus();
        const len = editor.value.length;
        editor.setSelectionRange(len, len);
    };
    const exitEdit = () => {
        notes.classList.remove("is-editing");
        renderDashboardNotesPreview(rendered, editor.value);
    };

    rendered.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.nodeType === 1 && t.tagName === "INPUT" && t.type === "checkbox" && t.closest && t.closest("li.cr-task")) {
            e.stopPropagation();
            const li = t.closest("li.cr-task");
            const taskIndex = parseInt(li.dataset.crTask, 10);
            if (!Number.isNaN(taskIndex)) toggleDashboardNoteTask(editor, taskIndex);
            return;
        }
        enterEdit();
    });
    rendered.addEventListener("focus", enterEdit);
    editor.addEventListener("blur", exitEdit);
    editor.addEventListener("input", function () {
        options.dashboard_notes_text = this.value;
        delayDashboardNotesStorage(this.value);
    });

    const toolbar = notes.querySelector(".canvasrefined-notes-toolbar");
    if (toolbar) toolbar.addEventListener("mousedown", e => e.preventDefault());
    notes.querySelectorAll(".cr-fmt").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!notes.classList.contains("is-editing")) enterEdit();
            notesApplyFormat(editor, btn.dataset.action);
        });
    });

    editor.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.preventDefault(); editor.blur(); return; } // Esc: render
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        const k = e.key.toLowerCase();
        if (k === "b") { e.preventDefault(); notesApplyFormat(editor, "bold"); }
        else if (k === "i") { e.preventDefault(); notesApplyFormat(editor, "italic"); }
        else if (k === "enter") { e.preventDefault(); editor.blur(); } // Ctrl/Cmd+Enter: render
    });
}

// Mount at the Widgets-tab position: top / cards_start / cards_end / below.
function placeDashboardNotes(notes, container) {
    const pos = options.dashboard_notes_position || "top";
    crApplyCardHeight("dashboard_notes", notes, pos === "cards_start" || pos === "cards_end");
    if (pos === "top" || pos === "below") {
        notes.classList.remove("in-cards");
        const slot = notes.closest && notes.closest(".canvasrefined-widget-slot");
        const row = slot && slot.parentNode;
        if (notes.dataset.crPos === pos && row && row.dataset.area === pos && slot.dataset.widget === "dashboard_notes") return;
        placeWidgetInRow("dashboard_notes", pos, [notes], container);
    } else {
        notes.classList.add("in-cards");
        // Same card-grid container the GPA uses, resolved here for every entry path.
        const grid = document.querySelector(".ic-DashboardCard__box__container") || container;
        if (notes.dataset.crPos === pos && notes.parentNode === grid) return;
        releaseWidgetFromRow("dashboard_notes", [notes], container);
        if (pos === "cards_start") {
            grid.prepend(notes);
        } else {
            grid.appendChild(notes);
        }
        applyCardWidgetOrder(grid);
        try {
            if (grid !== container && window.jQuery && window.jQuery.fn && window.jQuery.fn.sortable) {
                window.jQuery(grid).sortable('refresh');
            }
        } catch (e) {}
    }
    notes.dataset.crPos = pos;
}

function loadDashboardNotes() {
    const container = document.querySelector("#DashboardCard_Container");
    if (options.dashboard_notes === true) {
        if (!container) return;
        let notes = document.querySelector('.canvasrefined-dashboard-notes');
        if (notes && !notes.querySelector(".canvasrefined-notes-surface")) {
            notes.remove();
            notes = null;
        }
        if (!notes) {
            notes = document.createElement("div");
            notes.classList.add("canvasrefined-dashboard-notes");
            notes.innerHTML = dashboardNotesHtml();
            wireDashboardNotes(notes);
        } else {
            notes.style.display = "";
            const editor = notes.querySelector(".canvasrefined-notes-editor");
            const rendered = notes.querySelector(".canvasrefined-notes-rendered");
            if (!notes.classList.contains("is-editing")) {
                if (editor && editor.value !== (options.dashboard_notes_text || "")) {
                    editor.value = options.dashboard_notes_text || "";
                }
                renderDashboardNotesPreview(rendered, editor ? editor.value : "");
            }
        }
        placeDashboardNotes(notes, container);
    } else {
        let notes = document.querySelector('.canvasrefined-dashboard-notes');
        if (notes) {
            notes.style.display = "none";
            releaseWidgetFromRow("dashboard_notes", [notes]);
        }
    }
}

/*
Generic dashboard widgets (Focus Timer, Breathing Breaks, Daily Quote)

These share the placement/ordering machinery built for Dashboard Notes and the
GPA calculator, but render from one element each (see CR_SIMPLE_WIDGET_IDS).
*/

const CR_WIDGET_DEFAULT_POSITION = {
    dashboard_notes: "top",
    gpa_calc: "cards_end",
    focus_timer: "cards_end",
    breathing: "cards_end",
    daily_quotes: "top",
    quick_links: "cards_end",
};

function crWidgetPosition(id) {
    const v = options[id + "_position"];
    if (v === "top" || v === "below" || v === "cards_start" || v === "cards_end") return v;
    return CR_WIDGET_DEFAULT_POSITION[id] || "cards_end";
}

// Per-widget height in px (0 = auto) for cards_* placement; container mode uses row height.
function crApplyCardHeight(id, el, inCards) {
    if (!el) return;
    const h = parseInt(options[id + "_height"], 10);
    if (inCards && Number.isFinite(h) && h > 0) {
        el.style.height = h + "px";
        el.style.minHeight = h + "px";
    } else {
        el.style.height = "";
        el.style.minHeight = "";
    }
}

function placeSimpleWidget(id, el, container) {
    const pos = crWidgetPosition(id);
    crApplyCardHeight(id, el, pos === "cards_start" || pos === "cards_end");
    if (pos === "top" || pos === "below") {
        el.classList.remove("in-cards");
        el.classList.add("container-mode");
        const slot = el.closest && el.closest(".canvasrefined-widget-slot");
        const row = slot && slot.parentNode;
        if (el.dataset.crPos === pos && row && row.dataset.area === pos && slot.dataset.widget === id) return;
        placeWidgetInRow(id, pos, [el], container);
    } else {
        el.classList.add("in-cards");
        el.classList.remove("container-mode");
        const grid = document.querySelector(".ic-DashboardCard__box__container") || container;
        if (el.dataset.crPos === pos && el.parentNode === grid) return;
        releaseWidgetFromRow(id, [el], container);
        if (pos === "cards_start") grid.prepend(el);
        else grid.appendChild(el);
        applyCardWidgetOrder(grid);
        try {
            if (grid !== container && window.jQuery && window.jQuery.fn && window.jQuery.fn.sortable) {
                window.jQuery(grid).sortable('refresh');
            }
        } catch (e) {}
    }
    el.dataset.crPos = pos;
}

function crLoadWidget(id, spec) {
    const existing = document.querySelector("." + spec.className);
    if (options[id] !== true) {
        if (existing) {
            existing.style.display = "none";
            releaseWidgetFromRow(id, [existing]);
        }
        return;
    }
    const container = document.querySelector("#DashboardCard_Container");
    if (!container) return;
    let el = existing;
    if (!el) {
        el = document.createElement("div");
        el.className = "canvasrefined-widget-card " + spec.className;
        el.dataset.crWidget = id;
        el.innerHTML = spec.html;
        try { if (spec.wire) spec.wire(el); } catch (e) { logError(e); }
    } else {
        el.style.display = "";
        try { if (spec.update) spec.update(el); } catch (e) { logError(e); }
    }
    placeSimpleWidget(id, el, container);
}

/* ---- Shared timer engine (Focus Timer + Breathing Breaks) ---- */

const crTimers = {};
function crTimer(id) {
    if (!crTimers[id]) crTimers[id] = { total: 0, remaining: 0, running: false, raf: null, endTime: 0 };
    return crTimers[id];
}
// ceil, so a fresh 25:00 shows 24:59 only after a full second.
function crTimerFormat(sec) {
    const s = Math.max(0, Math.ceil(sec - 0.001));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}
function crFormatDuration(sec) {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h && m) return h + getMsg("timer_unit_h", "h") + " " + m + getMsg("timer_unit_m", "m");
    if (h) return h + getMsg("timer_unit_h", "h") + (r ? " " + r + getMsg("timer_unit_s", "s") : "");
    if (m && r) return m + getMsg("timer_unit_m", "m") + " " + r + getMsg("timer_unit_s", "s");
    if (m) return m + " " + getMsg("timer_unit_min", "min");
    return r + getMsg("timer_unit_s", "s");
}
function crTimerCancel(st) {
    if (st && st.raf) { cancelAnimationFrame(st.raf); st.raf = null; }
}
function crTimerRender(id, el) {
    const st = crTimer(id);
    const disp = el.querySelector(".cr-timer-time") || el.querySelector(".cr-timer-display");
    if (disp) {
        const txt = crTimerFormat(st.remaining);
        if (disp.textContent !== txt) disp.textContent = txt;
    }
    const start = el.querySelector(".cr-timer-start");
    if (start) {
        const label = st.running ? getMsg("timer_pause", "Pause") : getMsg("timer_start", "Start");
        if (start.textContent !== label) start.textContent = label;
    }
    el.classList.toggle("is-running", st.running);
    const bar = el.querySelector(".cr-timer-progress-bar");
    if (bar) bar.style.width = (st.total ? ((st.total - st.remaining) / st.total) * 100 : 0) + "%";
    const presets = [...el.querySelectorAll(".cr-timer-preset[data-slot]")];
    const totals = presets.map(b => parseInt(b.dataset.sec, 10));
    const matched = totals.indexOf(st.total) !== -1;
    presets.forEach((btn, i) => btn.classList.toggle("active", !st.running && totals[i] === st.total));
    const customBtn = el.querySelector(".cr-timer-custom");
    if (customBtn) customBtn.classList.toggle("active", !st.running && !matched && st.total > 0);
}
// rAF loop off real elapsed time, so the fill moves continuously.
function crTimerFrame(id, el) {
    const st = crTimer(id);
    if (!st.running) return;
    st.remaining = Math.max(0, (st.endTime - Date.now()) / 1000);
    if (st.remaining <= 0) {
        st.remaining = 0;
        st.running = false;
        st.raf = null;
    }
    crTimerRender(id, el);
    if (st.running) st.raf = requestAnimationFrame(() => crTimerFrame(id, el));
}
function crTimerStart(id, el) {
    const st = crTimer(id);
    if (st.running || st.remaining <= 0) return;
    st.running = true;
    st.endTime = Date.now() + st.remaining * 1000;
    crTimerCancel(st);
    st.raf = requestAnimationFrame(() => crTimerFrame(id, el));
    crTimerRender(id, el);
}
function crTimerPause(id, el) {
    const st = crTimer(id);
    if (st.running) st.remaining = Math.max(0, (st.endTime - Date.now()) / 1000);
    st.running = false;
    crTimerCancel(st);
    crTimerRender(id, el);
}
function crTimerSet(id, el, seconds) {
    const st = crTimer(id);
    st.running = false;
    crTimerCancel(st);
    st.total = Math.max(1, Math.round(seconds));
    st.remaining = st.total;
    crTimerRender(id, el);
}
function crTimerReset(id, el) {
    const st = crTimer(id);
    st.running = false;
    crTimerCancel(st);
    st.remaining = st.total;
    crTimerRender(id, el);
}
function crTimerApplyCfg(el, cfg) {
    el.querySelectorAll(".cr-timer-preset[data-slot]").forEach(btn => {
        const slot = parseInt(btn.dataset.slot, 10);
        const sec = cfg.presets[slot - 1];
        btn.dataset.sec = sec;
        btn.textContent = crFormatDuration(sec);
    });
}
function crTimerHideCustom(el) {
    const row = el.querySelector(".cr-timer-custom-row");
    if (row) row.hidden = true;
}
function crTimerCustomSeconds(el) {
    const num = (sel) => {
        const v = parseInt((el.querySelector(sel) || {}).value, 10);
        return Number.isFinite(v) && v > 0 ? v : 0;
    };
    return Math.min(99, num(".cr-tf-h")) * 3600
        + Math.min(59, num(".cr-tf-m")) * 60
        + Math.min(59, num(".cr-tf-s"));
}
function crTimerFillCustom(el, totalSec) {
    const secs = Math.max(0, Math.round(totalSec || 0));
    const put = (sel, v) => {
        const inp = el.querySelector(sel);
        if (inp) inp.value = String(v).padStart(2, "0");
    };
    put(".cr-tf-h", Math.min(99, Math.floor(secs / 3600)));
    put(".cr-tf-m", Math.floor((secs % 3600) / 60));
    put(".cr-tf-s", secs % 60);
}
// Listeners are wired once (update passes only refresh config labels).
function crTimerWireControls(id, el) {
    el.querySelectorAll(".cr-timer-preset[data-slot]").forEach(btn => {
        btn.addEventListener("click", () => {
            const sec = parseInt(btn.dataset.sec, 10);
            if (Number.isFinite(sec) && sec > 0) crTimerSet(id, el, sec);
            crTimerHideCustom(el);
        });
    });

    const customBtn = el.querySelector(".cr-timer-custom");
    const row = el.querySelector(".cr-timer-custom-row");
    const fields = [...el.querySelectorAll(".cr-timer-custom-row .cr-tf")];
    const focusField = (i) => {
        const inp = fields[i];
        if (inp) { inp.focus(); inp.select(); }
    };
    const applyCustom = () => {
        const sec = crTimerCustomSeconds(el);
        if (sec <= 0) {
            focusField(fields.length - 1);
            return;
        }
        crTimerSet(id, el, sec);
        crTimerHideCustom(el);
    };
    const openCustom = () => {
        crTimerFillCustom(el, crTimer(id).total);
        row.hidden = false;
        const mi = fields.findIndex(f => f.classList.contains("cr-tf-m"));
        focusField(mi === -1 ? 0 : mi);
    };
    if (customBtn && row) customBtn.addEventListener("click", () => {
        if (row.hidden) openCustom();
        else crTimerHideCustom(el);
    });
    fields.forEach((inp, i) => {
        inp.addEventListener("focus", () => inp.select());
        inp.addEventListener("input", () => {
            inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 2);
            if (inp.value.length >= 2 && i < fields.length - 1) focusField(i + 1);
        });
        inp.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); applyCustom(); }
            else if (e.key === "Escape") { e.preventDefault(); crTimerHideCustom(el); }
            else if ((e.key === "ArrowRight" || e.key === "Tab" && !e.shiftKey) && i < fields.length - 1) { e.preventDefault(); focusField(i + 1); }
            else if ((e.key === "ArrowLeft" || e.key === "Tab" && e.shiftKey) && i > 0) { e.preventDefault(); focusField(i - 1); }
            else if (e.key === "Backspace" && inp.value === "" && i > 0) { e.preventDefault(); focusField(i - 1); }
        });
    });
    const go = el.querySelector(".cr-timer-custom-go");
    if (go) go.addEventListener("click", applyCustom);

    const start = el.querySelector(".cr-timer-start");
    if (start) start.addEventListener("click", () => {
        const st = crTimer(id);
        if (st.running) crTimerPause(id, el);
        else crTimerStart(id, el);
    });
    const reset = el.querySelector(".cr-timer-reset");
    if (reset) reset.addEventListener("click", () => crTimerReset(id, el));
}
function crTimerInitial(id, el, cfg) {
    const st = crTimer(id);
    if (!st.total) { st.total = cfg.presets[1]; st.remaining = st.total; }
    crTimerRender(id, el);
}
// Presets store {h,m,s}; a plain number is legacy minutes. `fallback` is seconds.
function crTimerReadSlots(prefix, fallback) {
    return [1, 2, 3].map(i => {
        const v = options[prefix + "_preset_" + i];
        if (v && typeof v === "object") {
            const h = Math.max(0, parseInt(v.h, 10) || 0);
            const m = Math.max(0, parseInt(v.m, 10) || 0);
            const s = Math.max(0, parseInt(v.s, 10) || 0);
            const total = h * 3600 + m * 60 + s;
            if (total > 0) return total;
        } else {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) return n * 60;
        }
        return fallback[i - 1];
    });
}

/* ---- Focus Timer ---- */

const FOCUS_TIMER_DEFAULT_PRESETS = [15 * 60, 25 * 60, 45 * 60];

function focusTimerCfg() {
    return { presets: crTimerReadSlots("focus_timer", FOCUS_TIMER_DEFAULT_PRESETS) };
}

function focusTimerHtml() { return `
    <div class="cr-widget-head"><span class="cr-widget-title">${getMsg("focus_timer", "Focus Timer")}</span></div>
    <div class="cr-time-box cr-focus-display">
        <div class="cr-time-fill cr-timer-progress-bar"></div>
        <div class="cr-timer-time cr-timer-display" aria-live="polite">25:00</div>
    </div>
    <div class="cr-timer-presets">
        <button type="button" class="cr-timer-preset" data-slot="1">15 min</button>
        <button type="button" class="cr-timer-preset" data-slot="2">25 min</button>
        <button type="button" class="cr-timer-preset" data-slot="3">45 min</button>
        <button type="button" class="cr-timer-preset cr-timer-custom">${getMsg("timer_custom", "Custom")}</button>
    </div>
    <div class="cr-timer-custom-row" hidden>
        <div class="cr-time-input">
            <input type="text" class="cr-tf cr-tf-h" inputmode="numeric" maxlength="2" value="00" aria-label="${getMsg("timer_hours", "Hours")}">
            <span class="cr-tf-colon" aria-hidden="true">:</span>
            <input type="text" class="cr-tf cr-tf-m" inputmode="numeric" maxlength="2" value="00" aria-label="${getMsg("timer_minutes", "Minutes")}">
            <span class="cr-tf-colon" aria-hidden="true">:</span>
            <input type="text" class="cr-tf cr-tf-s" inputmode="numeric" maxlength="2" value="00" aria-label="${getMsg("timer_seconds", "Seconds")}">
        </div>
        <button type="button" class="cr-widget-btn cr-timer-custom-go">${getMsg("timer_set", "Set")}</button>
    </div>
    <div class="cr-timer-controls">
        <button type="button" class="cr-widget-btn cr-timer-start">${getMsg("timer_start", "Start")}</button>
        <button type="button" class="cr-widget-btn cr-widget-btn-ghost cr-timer-reset">${getMsg("timer_reset", "Reset")}</button>
    </div>
`; }

function wireFocusTimer(el) {
    crTimerApplyCfg(el, focusTimerCfg());
    crTimerWireControls("focus_timer", el);
    crTimerInitial("focus_timer", el, focusTimerCfg());
}
function updateFocusTimer(el) {
    crTimerApplyCfg(el, focusTimerCfg());
    crTimerRender("focus_timer", el);
}
function loadFocusTimer() {
    crLoadWidget("focus_timer", {
        className: "canvasrefined-focus-timer",
        html: focusTimerHtml(),
        wire: wireFocusTimer,
        update: updateFocusTimer,
    });
}

/* ---- Breathing Breaks (a zen timer) ---- */

const BREATHING_DEFAULT_PRESETS = [3 * 60, 5 * 60, 10 * 60];

function breathingCfg() {
    return { presets: crTimerReadSlots("breathing", BREATHING_DEFAULT_PRESETS) };
}

function breathingHtml() { return `
    <div class="cr-widget-head"><span class="cr-widget-title">${getMsg("breathing_breaks", "Breathing Breaks")}</span></div>
    <div class="cr-breath-layout">
        <div class="cr-breath-left">
            <div class="cr-breath-stage">
                <div class="cr-breath-circle">
                    <span class="cr-breath-phase cr-breath-phase-in">${getMsg("breathing_in", "Breathe in")}</span>
                    <span class="cr-breath-phase cr-breath-phase-out">${getMsg("breathing_out", "Breathe out")}</span>
                    <span class="cr-breath-idle">${getMsg("breathing_ready", "Ready")}</span>
                </div>
            </div>
            <div class="cr-timer-time cr-timer-display cr-breath-display" aria-live="polite">05:00</div>
        </div>
        <div class="cr-breath-right">
            <div class="cr-timer-presets">
                <button type="button" class="cr-timer-preset" data-slot="1">3 min</button>
                <button type="button" class="cr-timer-preset" data-slot="2">5 min</button>
                <button type="button" class="cr-timer-preset" data-slot="3">10 min</button>
                <button type="button" class="cr-timer-preset cr-timer-custom">${getMsg("timer_custom", "Custom")}</button>
            </div>
            <div class="cr-timer-custom-row" hidden>
                <div class="cr-time-input">
                    <input type="text" class="cr-tf cr-tf-m" inputmode="numeric" maxlength="2" value="00" aria-label="${getMsg("timer_minutes", "Minutes")}">
                    <span class="cr-tf-colon" aria-hidden="true">:</span>
                    <input type="text" class="cr-tf cr-tf-s" inputmode="numeric" maxlength="2" value="00" aria-label="${getMsg("timer_seconds", "Seconds")}">
                </div>
                <button type="button" class="cr-widget-btn cr-timer-custom-go">${getMsg("timer_set", "Set")}</button>
            </div>
            <div class="cr-timer-controls">
                <button type="button" class="cr-widget-btn cr-timer-start">${getMsg("timer_start", "Start")}</button>
                <button type="button" class="cr-widget-btn cr-widget-btn-ghost cr-timer-reset">${getMsg("timer_reset", "Reset")}</button>
            </div>
        </div>
    </div>
`; }

function wireBreathingWidget(el) {
    crTimerApplyCfg(el, breathingCfg());
    crTimerWireControls("breathing", el);
    crTimerInitial("breathing", el, breathingCfg());
}
function updateBreathingWidget(el) {
    crTimerApplyCfg(el, breathingCfg());
    crTimerRender("breathing", el);
}
function loadBreathingWidget() {
    crLoadWidget("breathing", {
        className: "canvasrefined-breathing",
        html: breathingHtml(),
        wire: wireBreathingWidget,
        update: updateBreathingWidget,
    });
}

/* ---- Daily Quote (stoic.tekloon.net, refreshed once a day) ---- */

function dailyQuoteDefault() {
    return {
        quote: getMsg("daily_quote_default", "The secret of getting ahead is getting started."),
        author: "Mark Twain",
    };
}

function dailyQuoteHtml() { return `
    <div class="cr-widget-head"><span class="cr-widget-title">${getMsg("daily_quote", "Daily Quote")}</span></div>
    <div class="cr-quote-body">
        <span class="cr-quote-mark" aria-hidden="true">&#8220;</span>
        <p class="cr-quote-text">${dailyQuoteDefault().quote}</p>
        <span class="cr-quote-author">&mdash; ${dailyQuoteDefault().author}</span>
    </div>
`; }

function renderDailyQuote(el, data) {
    if (!el) return;
    const fallback = dailyQuoteDefault();
    const quote = data && data.quote ? data.quote : fallback.quote;
    const author = data && data.author ? data.author : fallback.author;
    const textEl = el.querySelector(".cr-quote-text");
    const authorEl = el.querySelector(".cr-quote-author");
    if (textEl) textEl.textContent = quote;
    if (authorEl) authorEl.textContent = author ? "\u2014 " + author : "";
}

// Ask the background worker to refresh; it caches per calendar day.
let dailyQuoteRequested = false;
function ensureDailyQuote() {
    if (dailyQuoteRequested) return;
    dailyQuoteRequested = true;
    try {
        chrome.runtime.sendMessage({ type: "getDailyQuote" }, () => {
            // Reading lastError suppresses the warning; a later pass retries on failure.
            if (chrome.runtime.lastError) dailyQuoteRequested = false;
        });
    } catch (e) {
        dailyQuoteRequested = false;
    }
}

function refreshDailyQuoteWidget(el) {
    chrome.storage.local.get("daily_quote", st => {
        if (st && st.daily_quote) renderDailyQuote(el, st.daily_quote);
    });
    ensureDailyQuote();
}

function loadDailyQuotesWidget() {
    crLoadWidget("daily_quotes", {
        className: "canvasrefined-quotes",
        html: dailyQuoteHtml(),
        wire: refreshDailyQuoteWidget,
        update: refreshDailyQuoteWidget,
    });
}

function loadAllSimpleWidgets() {
    loadFocusTimer();
    loadBreathingWidget();
    loadDailyQuotesWidget();
    loadQuickLinksWidget();
}

/* ---- Quick Links (editable links with theme-aware preset icons) ---- */

const QUICK_LINK_ICONS = {
    link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5 14.5 9.5"/><path d="M7 17a4.5 4.5 0 0 1 0-6.36l2.12-2.12a4.5 4.5 0 0 1 6.36 0"/><path d="M17 7a4.5 4.5 0 0 1 0 6.36l-2.12 2.12a4.5 4.5 0 0 1-6.36 0"/></svg>`,
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v14c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-14c-4.5 0-6.5.5-8 2Z"/><path d="M12 6.5v14"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/></svg>`,
    video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="14" height="12" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>`,
};
const QUICK_LINK_ICON_KEYS = Object.keys(QUICK_LINK_ICONS);
const QUICK_LINK_ICON_LABELS = {
    link: "Link", home: "Home", book: "Book", calendar: "Calendar", mail: "Mail",
    video: "Video", code: "Code", chart: "Chart", chat: "Chat", star: "Star",
};

const quickLinksUI = { editing: false, mode: null, id: null, error: "" };

function crEscapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Blocks script-ish schemes; plain "example.com" becomes https, bare paths stay Canvas-relative.
function quickLinksSafeUrl(value, isImage) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    if (isImage) {
        if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(raw)) return raw.length <= 4000 ? raw : "";
        if (/^https?:\/\//i.test(raw)) return raw;
        if (/^\/\//.test(raw)) return "https:" + raw;
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
        if (/^[\w-]+(?:\.[\w-]+)+(?::\d+)?(?=[/?#]|$)/.test(raw)) return "https://" + raw;
        return "";
    }
    if (/^\/\//.test(raw)) return "https:" + raw;
    if (/^(?:\/|#|\?)/.test(raw)) return raw;
    if (/^(?:https?:|mailto:|tel:)/i.test(raw)) return raw;
    if (/^(?:javascript:|vbscript:|file:|data:|blob:)/i.test(raw)) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
    if (/^[\w-]+(?:\.[\w-]+)+(?::\d+)?(?=[/?#]|$)/.test(raw)) return "https://" + raw;
    return "/" + raw.replace(/^\.?\/+/, "");
}

function quickLinksLabelFromUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.hostname && parsed.hostname !== window.location.hostname) {
            return parsed.hostname.replace(/^www\./i, "");
        }
        const part = parsed.pathname.split("/").filter(Boolean).pop();
        if (part) return decodeURIComponent(part).replace(/[-_]+/g, " ");
        return parsed.hostname || url;
    } catch (e) {
        return url;
    }
}

function quickLinksSanitizeItem(raw, index) {
    if (!raw || typeof raw !== "object") return null;
    const url = quickLinksSafeUrl(raw.url, false);
    if (!url) return null;
    let image = raw.icon === "image" ? quickLinksSafeUrl(raw.image, true) : "";
    const icon = image ? "image" : (QUICK_LINK_ICONS[raw.icon] ? raw.icon : "link");
    let label = typeof raw.label === "string" ? raw.label.trim().slice(0, 60) : "";
    if (!label) label = quickLinksLabelFromUrl(url).slice(0, 60);
    return {
        id: typeof raw.id === "string" && raw.id ? raw.id : "ql_legacy_" + index,
        label: label,
        url: url,
        icon: icon,
        image: icon === "image" ? image : "",
    };
}

function quickLinksItems() {
    const raw = options.quick_links_items;
    if (!Array.isArray(raw)) return [];
    return raw.map(quickLinksSanitizeItem).filter(Boolean);
}

// Per-tile sizes (px): stored per setting, exposed as CSS vars on the widget so
// the grid, edit mode and the "add" tile all follow one value. Unset keeps the
// stylesheet default.
const QUICK_LINKS_SIZE_SETTINGS = [
    { key: "quick_links_font_size", cssVar: "--cr-ql-label-size", min: 8, max: 24 },
    { key: "quick_links_icon_size", cssVar: "--cr-ql-icon-size", min: 20, max: 64 },
];

function quickLinksApplySizes(el) {
    if (!el) return;
    QUICK_LINKS_SIZE_SETTINGS.forEach(({ key, cssVar, min, max }) => {
        const n = parseInt(options[key], 10);
        if (!Number.isFinite(n) || n <= 0) {
            el.style.removeProperty(cssVar);
            return;
        }
        el.style.setProperty(cssVar, Math.min(max, Math.max(min, n)) + "px");
    });
}

function quickLinksIconMarkup(item) {
    const image = item.icon === "image" ? quickLinksSafeUrl(item.image, true) : "";
    if (image) return `<img src="${crEscapeHtml(image)}" alt="" loading="lazy">`;
    return QUICK_LINK_ICONS[item.icon] || QUICK_LINK_ICONS.link;
}

function quickLinksTileHtml(item, editing) {
    const label = crEscapeHtml(item.label || quickLinksLabelFromUrl(item.url));
    const letter = crEscapeHtml((item.label || quickLinksLabelFromUrl(item.url) || "?").trim().charAt(0).toUpperCase() || "?");
    const icon = `<span class="cr-ql-icon">${quickLinksIconMarkup(item)}<span class="cr-ql-icon-letter" aria-hidden="true">${letter}</span></span>`;
    if (editing) {
        return `<div class="cr-ql-tile is-editing" role="button" tabindex="0" data-ql-action="edit" data-ql-id="${crEscapeHtml(item.id)}" title="${getMsg("quick_links_edit_link", "Edit link")}">
            ${icon}<span class="cr-ql-label">${label}</span>
            <button type="button" class="cr-ql-tile-delete" data-ql-action="delete" data-ql-id="${crEscapeHtml(item.id)}" title="${getMsg("quick_links_delete", "Delete")}" aria-label="${getMsg("quick_links_delete", "Delete")}">&times;</button>
        </div>`;
    }
    return `<a class="cr-ql-tile" href="${crEscapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${label}" data-ql-id="${crEscapeHtml(item.id)}">
        ${icon}<span class="cr-ql-label">${label}</span>
    </a>`;
}

function quickLinksGridHtml(items, editing) {
    const tiles = items.map(item => quickLinksTileHtml(item, editing)).join("");
    const error = quickLinksUI.error
        ? `<p class="cr-ql-error">${crEscapeHtml(quickLinksUI.error)}</p>`
        : "";
    if (editing) {
        return `<div class="cr-ql-hint">${getMsg("quick_links_hint_edit", "Click a link to edit it.")}</div>
            ${error}<div class="cr-ql-grid">${tiles}
                <button type="button" class="cr-ql-tile cr-ql-add" data-ql-action="add">
                    <span class="cr-ql-add-plus" aria-hidden="true">+</span>
                    <span class="cr-ql-label">${getMsg("quick_links_add", "Add link")}</span>
                </button>
            </div>`;
    }
    if (!items.length) {
        return `<div class="cr-ql-empty">
            <span>${getMsg("quick_links_empty", "No links yet.")}</span>
            <button type="button" class="cr-widget-btn" data-ql-action="add">${getMsg("quick_links_add", "Add link")}</button>
        </div>`;
    }
    return `<div class="cr-ql-grid">${tiles}</div>`;
}

function quickLinksEditorHtml(item) {
    const isEdit = quickLinksUI.mode === "edit";
    const icon = item && item.icon !== "image" ? item.icon : "link";
    const image = item && item.icon === "image" ? item.image : "";
    const picks = QUICK_LINK_ICON_KEYS.map(key => `
        <button type="button" class="cr-ql-icon-choice${icon === key ? " is-active" : ""}" data-ql-action="icon" data-icon="${key}" title="${QUICK_LINK_ICON_LABELS[key] || key}" aria-label="${QUICK_LINK_ICON_LABELS[key] || key}">${QUICK_LINK_ICONS[key]}</button>`).join("");
    const preview = image
        ? `<img src="${crEscapeHtml(image)}" alt="" loading="lazy">`
        : QUICK_LINK_ICONS[icon] || QUICK_LINK_ICONS.link;
    return `<div class="cr-ql-editor">
        <div class="cr-ql-editor-title">${isEdit ? getMsg("quick_links_edit_title", "Edit link") : getMsg("quick_links_add_title", "New link")}</div>
        <label class="cr-ql-field">${getMsg("quick_links_label", "Label")}
            <input type="text" class="cr-ql-input cr-ql-label-input" maxlength="60" placeholder="${getMsg("quick_links_label_ph", "e.g. Canvas")}" value="${crEscapeHtml(item ? item.label : "")}">
        </label>
        <label class="cr-ql-field">${getMsg("quick_links_url", "URL")}
            <input type="text" class="cr-ql-input cr-ql-url-input" maxlength="2048" placeholder="${getMsg("quick_links_url_ph", "https://...")}" value="${crEscapeHtml(item ? item.url : "")}">
        </label>
        <div class="cr-ql-field">${getMsg("quick_links_icon", "Icon")}
            <div class="cr-ql-icon-picker">${picks}</div>
        </div>
        <label class="cr-ql-field">${getMsg("quick_links_custom_image", "Custom image URL")}
            <div class="cr-ql-custom-row">
                <span class="cr-ql-custom-preview">${preview}</span>
                <input type="text" class="cr-ql-input cr-ql-image-input" maxlength="4000" placeholder="${getMsg("quick_links_custom_image_ph", "https://example.com/icon.png")}" value="${crEscapeHtml(image)}">
            </div>
        </label>
        <p class="cr-ql-error" ${quickLinksUI.error ? "" : "hidden"}>${crEscapeHtml(quickLinksUI.error)}</p>
        <div class="cr-ql-editor-actions">
            <button type="button" class="cr-widget-btn" data-ql-action="save">${getMsg("quick_links_save", "Save")}</button>
            <button type="button" class="cr-widget-btn cr-widget-btn-ghost" data-ql-action="cancel">${getMsg("quick_links_cancel", "Cancel")}</button>
        </div>
        ${isEdit ? `<button type="button" class="cr-ql-delete-link" data-ql-action="delete" data-ql-id="${crEscapeHtml(quickLinksUI.id || "")}">${getMsg("quick_links_delete", "Delete")}</button>` : ""}
    </div>`;
}

function renderQuickLinks(el) {
    if (!el) return;
    quickLinksApplySizes(el);
    const body = el.querySelector(".cr-ql-body");
    const toggle = el.querySelector(".cr-ql-edit-toggle");
    if (!body) return;
    body.classList.toggle("is-editing", quickLinksUI.editing);
    if (quickLinksUI.mode) {
        const items = quickLinksItems();
        const item = quickLinksUI.mode === "edit" ? items.find(i => i.id === quickLinksUI.id) : null;
        body.innerHTML = quickLinksEditorHtml(item);
    } else {
        body.innerHTML = quickLinksGridHtml(quickLinksItems(), quickLinksUI.editing);
    }
    if (toggle) {
        const done = quickLinksUI.editing;
        toggle.classList.toggle("is-editing", done);
        toggle.title = done ? getMsg("quick_links_done", "Done") : getMsg("quick_links_edit", "Edit links");
        toggle.setAttribute("aria-label", toggle.title);
        toggle.innerHTML = done
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
    }
}

function quickLinksCloseEditor(keepEditing) {
    quickLinksUI.editing = keepEditing === true;
    quickLinksUI.mode = null;
    quickLinksUI.id = null;
    quickLinksUI.error = "";
}

function quickLinksPersist(items, el) {
    // Drop our bookkeeping fields and keep only serializable link data.
    const payload = items.map(item => ({
        id: item.id,
        label: item.label,
        url: item.url,
        icon: item.icon,
        image: item.icon === "image" ? item.image : "",
    }));
    const previous = options.quick_links_items;
    options = { ...options, quick_links_items: payload };
    renderQuickLinks(el);
    chrome.storage.sync.set({ quick_links_items: payload }, () => {
        if (chrome.runtime.lastError) {
            options = { ...options, quick_links_items: previous };
            quickLinksUI.editing = true;
            quickLinksUI.error = getMsg("quick_links_store_error", "Couldn't save your links. Try shorter URLs.");
            renderQuickLinks(el);
        }
    });
}

function quickLinksShowError(el, message, focusSelector) {
    quickLinksUI.error = message;
    const errorEl = el.querySelector(".cr-ql-error");
    if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = message;
    }
    if (focusSelector) {
        const field = el.querySelector(focusSelector);
        if (field) field.focus();
    }
}

function quickLinksSaveEditor(el) {
    const labelEl = el.querySelector(".cr-ql-label-input");
    const urlEl = el.querySelector(".cr-ql-url-input");
    const imageEl = el.querySelector(".cr-ql-image-input");
    const active = el.querySelector(".cr-ql-icon-choice.is-active");
    const rawUrl = urlEl ? urlEl.value.trim() : "";
    const rawImage = imageEl ? imageEl.value.trim() : "";
    const url = quickLinksSafeUrl(rawUrl, false);
    const image = rawImage ? quickLinksSafeUrl(rawImage, true) : "";
    if (!url) {
        quickLinksShowError(el, getMsg("quick_links_url_error", "Enter a valid URL."), ".cr-ql-url-input");
        return;
    }
    if (rawImage && !image) {
        quickLinksShowError(el, getMsg("quick_links_image_error", "Enter a valid image URL."), ".cr-ql-image-input");
        return;
    }
    const items = quickLinksItems();
    let label = labelEl ? labelEl.value.trim().slice(0, 60) : "";
    if (!label) label = quickLinksLabelFromUrl(url).slice(0, 60);
    const icon = image ? "image" : ((active && active.dataset.icon) || "link");
    if (quickLinksUI.mode === "edit") {
        const index = items.findIndex(item => item.id === quickLinksUI.id);
        if (index !== -1) items[index] = { ...items[index], label, url, icon, image };
        else items.push({ id: "ql_" + Date.now().toString(36), label, url, icon, image });
    } else {
        items.push({ id: "ql_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label, url, icon, image });
    }
    quickLinksCloseEditor(true);
    quickLinksPersist(items, el);
}

function quickLinksOpenEditor(el, mode, id) {
    quickLinksUI.editing = true;
    quickLinksUI.mode = mode;
    quickLinksUI.id = id || null;
    quickLinksUI.error = "";
    renderQuickLinks(el);
    const label = el.querySelector(".cr-ql-label-input");
    if (label) label.focus();
}

function quickLinksDelete(el, id) {
    if (!id) return;
    if (!window.confirm(getMsg("quick_links_delete_confirm", "Delete this link?"))) return;
    const items = quickLinksItems().filter(item => item.id !== id);
    quickLinksCloseEditor(true);
    quickLinksPersist(items, el);
}

function wireQuickLinks(el) {
    el.addEventListener("click", e => {
        const toggle = e.target.closest(".cr-ql-edit-toggle");
        if (toggle) {
            if (quickLinksUI.editing) quickLinksCloseEditor(false);
            else quickLinksUI.editing = true;
            renderQuickLinks(el);
            return;
        }
        const actionEl = e.target.closest("[data-ql-action]");
        if (!actionEl) return;
        const action = actionEl.dataset.qlAction;
        if (action === "add") {
            e.preventDefault();
            quickLinksOpenEditor(el, "add", null);
        } else if (action === "edit") {
            e.preventDefault();
            quickLinksOpenEditor(el, "edit", actionEl.dataset.qlId);
        } else if (action === "delete") {
            e.preventDefault();
            quickLinksDelete(el, actionEl.dataset.qlId);
        } else if (action === "save") {
            e.preventDefault();
            quickLinksSaveEditor(el);
        } else if (action === "cancel") {
            e.preventDefault();
            quickLinksCloseEditor(true);
            renderQuickLinks(el);
        } else if (action === "icon") {
            e.preventDefault();
            el.querySelectorAll(".cr-ql-icon-choice.is-active").forEach(btn => btn.classList.remove("is-active"));
            actionEl.classList.add("is-active");
            const imageEl = el.querySelector(".cr-ql-image-input");
            if (imageEl) imageEl.value = "";
            const preview = el.querySelector(".cr-ql-custom-preview");
            if (preview) preview.innerHTML = QUICK_LINK_ICONS[actionEl.dataset.icon] || QUICK_LINK_ICONS.link;
        }
    });

    el.addEventListener("input", e => {
        const target = e.target;
        if (target.classList.contains("cr-ql-image-input")) {
            el.querySelectorAll(".cr-ql-icon-choice.is-active").forEach(btn => btn.classList.remove("is-active"));
            const preview = el.querySelector(".cr-ql-custom-preview");
            const image = quickLinksSafeUrl(target.value.trim(), true);
            if (preview) preview.innerHTML = image
                ? `<img src="${crEscapeHtml(image)}" alt="" loading="lazy">`
                : QUICK_LINK_ICONS.link;
        }
        if (quickLinksUI.error) {
            quickLinksUI.error = "";
            const errorEl = el.querySelector(".cr-ql-error");
            if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }
        }
    });

    el.addEventListener("keydown", e => {
        if (!el.querySelector(".cr-ql-editor")) {
            if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-ql-action='edit']")) {
                e.preventDefault();
                e.target.click();
            }
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            quickLinksCloseEditor(true);
            renderQuickLinks(el);
        } else if (e.key === "Enter" && e.target.matches && e.target.matches(".cr-ql-input")) {
            e.preventDefault();
            quickLinksSaveEditor(el);
        }
    });

    // Custom image URLs can 404; reveal the label initial instead of a broken icon.
    el.addEventListener("error", e => {
        const img = e.target;
        if (!img || img.tagName !== "IMG") return;
        if (img.closest(".cr-ql-icon")) {
            const tile = img.closest(".cr-ql-tile");
            if (tile) tile.classList.add("cr-ql-img-broken");
        } else if (img.closest(".cr-ql-custom-preview")) {
            img.parentNode.innerHTML = QUICK_LINK_ICONS.link;
        }
    }, true);

    renderQuickLinks(el);
}

function quickLinksHtml() { return `
    <div class="cr-widget-head">
        <span class="cr-widget-title">${getMsg("quick_links", "Quick Links")}</span>
        <button type="button" class="cr-ql-edit-toggle" title="${getMsg("quick_links_edit", "Edit links")}" aria-label="${getMsg("quick_links_edit", "Edit links")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
    </div>
    <div class="cr-ql-body"></div>
`; }

function updateQuickLinksWidget() {
    const el = document.querySelector(".canvasrefined-quick-links");
    if (!el) return;
    // Don't rebuild while the user is typing in the editor (e.g. our own storage echo).
    if (quickLinksUI.mode && el.querySelector(".cr-ql-editor")) return;
    renderQuickLinks(el);
}

function loadQuickLinksWidget() {
    if (options.quick_links !== true) quickLinksCloseEditor(false);
    crLoadWidget("quick_links", {
        className: "canvasrefined-quick-links",
        html: quickLinksHtml(),
        wire: wireQuickLinks,
        update: updateQuickLinksWidget,
    });
}


/*
Custom font
*/

// "Keep original assignment font": the custom rule's `*` selector hits <p> too, so
// carve <p> out and pin it to body's pre-custom font (`inherit` would still inherit).
let originalPageFontFamily = null;
const CANVAS_DEFAULT_FONT_STACK = '"Lato Extended", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif';

function captureOriginalPageFont() {
    if (originalPageFontFamily) return;
    if (document.querySelector("#custom_font")) return;
    try {
        const family = getComputedStyle(document.body || document.documentElement).fontFamily;
        if (family) originalPageFontFamily = family;
    } catch (_) { /* keep fallback */ }
}

function originalPageFontOrFallback() {
    return originalPageFontFamily || CANVAS_DEFAULT_FONT_STACK;
}

function customFontRules() {
    if (options.custom_font_skip_p !== true) {
        return `${customFontSelector()} {font-family: ${options.custom_font.family}!important}`;
    }
    return `${customFontSelector()} {font-family: ${options.custom_font.family}!important}\n`
        + `p, p * {font-family: ${originalPageFontOrFallback()}!important}`;
}

function customFontSelector() {
    return options.custom_font_skip_p === true
        ? "*:not(p):not(p *), input, a, button, h1, h2, h3, h4, h5, h6, span"
        : "*, input, a, button, h1, h2, h3, h4, h5, h6, p, span";
}

function loadCustomFont() {
    // Quiz safe mode: don't override fonts on quiz pages.
    if (quizSafeModeActive()) return;
    let link = document.querySelector("#custom_font_link");
    let style = document.querySelector("#custom_font");

    let load = () => {
        if (options.custom_font.link !== "") {
            captureOriginalPageFont();
            document.head.appendChild(style);
            link.href = `https://fonts.googleapis.com/css2?family=${options.custom_font.link}&display=swap`;
            link.rel = "stylesheet";
            document.head.appendChild(link);
        }

        style.textContent = options.custom_font.link === "" ? "" : customFontRules();
    }

    let createEls = () => {
        link = document.createElement("link");
        link.id = "custom_font_link";
        style = document.createElement("style");
        style.id = "custom_font";
        load();
    }

    if (link && style) {
        load();
    } else if (options.custom_font.link !== "") {
        if (document.readyState !== 'loading') {
            createEls();
        } else {
            document.addEventListener("DOMContentLoaded", () => {
                createEls();
            });
        }
    }
}

/*
Smaller features
*/

let aestheticDebounceTimer = null;
function debouncedApplyAestheticChanges(delay = 150) {
    if (aestheticDebounceTimer) clearTimeout(aestheticDebounceTimer);
    aestheticDebounceTimer = setTimeout(() => {
        aestheticDebounceTimer = null;
        applyAestheticChanges();
    }, delay);
}

function applyAestheticChanges() {
    if (quizSafeModeActive()) return;
    let style = document.querySelector("#canvasrefined-aesthetics") || document.createElement('style');
    style.id = "canvasrefined-aesthetics";
    style.textContent = "";
    if (options.condensed_cards === true) style.textContent += ".ic-DashboardCard__header_hero {height:60px!important}.ic-DashboardCard__header-subtitle, .ic-DashboardCard__header-term{display:none}";
    if (options.remlogo === true) style.textContent += ".ic-app-header__logomark-container{display:none}";
    if (options.disable_color_overlay === true) style.textContent += ".ic-DashboardCard__header_hero{opacity: 0!important} .ic-DashboardCard__header-button-bg{opacity: 1!important}";
    if (options.full_width === true) style.textContent += "#wrapper,.ic-Layout-wrapper{max-width:100%!important}";
    if (options.center_cards === true) style.textContent += ".ic-DashboardCard__box__container{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;align-items:flex-start!important}";
    // Card Grid: strict columns x rows layout, emitted after center_cards to win the
    // !important tie-break. Columns are doubled into sub-columns (each card spans 2) so
    // "center uneven rows" can shift a partial row by half a card; two spare rows keep
    // the GPA card/calculator out of the clipped implicit rows.
    if (options.card_grid === true) {
        const gridCols = Math.max(1, parseInt(options.card_grid_columns, 10) || 4);
        const gridRows = Math.max(1, parseInt(options.card_grid_rows, 10) || 3);
        const gridColGap = Math.max(0, !isNaN(parseInt(options.card_grid_column_gap, 10)) ? parseInt(options.card_grid_column_gap, 10) : 12);
        const gridRowGap = Math.max(0, !isNaN(parseInt(options.card_grid_row_gap, 10)) ? parseInt(options.card_grid_row_gap, 10) : 12);
        // strip Canvas' natural top/left card margins; the grid supplies its own gaps
        style.textContent += `.ic-DashboardCard__box__container{margin-top:0!important;margin-left:0!important}`;
        style.textContent += `.ic-DashboardCard__box__container > .ic-DashboardCard,.ic-DashboardCard__box__container > .canvasrefined-gpa-card{margin-top:0!important;margin-left:0!important}`;
        // CanvasRefined's own widgets carry 36px outer margins meant for the flex
        // card flow; in the grid every side is spacing the gaps already provide
        style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-widget-card,.ic-DashboardCard__box__container > .canvasrefined-dashboard-notes,.ic-DashboardCard__box__container > .canvasrefined-gpa-card,.ic-DashboardCard__box__container > .canvasrefined-gpa{margin:0!important}`;
        const centerGrid = options.center_cards === true;
        const gpaOn = options.gpa_calc === true;
        const gpaPos = gpaCalcPosition();
        const gpaInsideGrid = gpaPos === "cards_start" || gpaPos === "cards_end";
        const gpaFirst = gpaPos === "cards_start";
        const flexGrid = options.card_grid_flex === true;
        if (flexGrid) {
            // flexible grid: fixed-width tracks; @container queries step the column count
            // down when the next column stops fitting (no window-width guessing)
            const cardW = options.customCardStyles === true && parseInt(options.cardWidth, 10) > 0
                ? parseInt(options.cardWidth, 10)
                : 262;
            // container queries need a size container; the card wrapper is full-width
            style.textContent += `#DashboardCard_Container{container-type:inline-size}`;
            style.textContent += `.ic-DashboardCard__box__container{display:grid!important;grid-template-columns:repeat(${gridCols},${cardW}px)!important;grid-auto-rows:auto!important;column-gap:${gridColGap}px!important;row-gap:${gridRowGap}px!important;align-items:start!important${centerGrid ? ";justify-content:center!important" : ""}}`;
            // grid gaps alone control spacing (beats the later customCardStyles margins)
            style.textContent += `.ic-DashboardCard__box__container > .ic-DashboardCard,.ic-DashboardCard__box__container > .canvasrefined-gpa-card{margin-right:0!important;margin-bottom:0!important}`;
            if (gpaOn && gpaInsideGrid) {
                if (gpaFirst) {
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa-card{grid-row:1!important;grid-column:1!important}`;
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa{grid-row:2!important;grid-column:1/-1!important}`;
                } else {
                    // auto-placed: flows into the next open slot after the last card
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa{grid-column:1/-1!important}`;
                }
            }
            // step down to m columns once m+1 no longer fit; widest-first so the
            // narrowest matching rule wins the cascade
            for (let m = gridCols - 1; m >= 1; m--) {
                const tooWideFor = (m + 1) * cardW + m * gridColGap;
                if (m === 1) {
                    style.textContent += `@container (max-width:${tooWideFor - 1}px){.ic-DashboardCard__box__container{grid-template-columns:minmax(0,1fr)!important}.ic-DashboardCard__box__container > .ic-DashboardCard${gpaInsideGrid ? ",.ic-DashboardCard__box__container > .canvasrefined-gpa-card" : ""}{width:100%!important;min-width:0!important}}`;
                } else {
                    style.textContent += `@container (max-width:${tooWideFor - 1}px){.ic-DashboardCard__box__container{grid-template-columns:repeat(${m},${cardW}px)!important}}`;
                }
            }
        } else {
            const totalRows = gridRows + (gpaOn && gpaInsideGrid ? 2 : 0);
            style.textContent += `.ic-DashboardCard__box__container{display:grid!important;grid-template-columns:repeat(${gridCols * 2},minmax(0,max-content))!important;grid-template-rows:repeat(${totalRows},minmax(0,auto))!important;grid-auto-rows:0!important;column-gap:${gridColGap}px!important;row-gap:${gridRowGap}px!important;align-items:start!important;overflow:hidden!important${centerGrid ? ";justify-content:center!important" : ""}}`;
            style.textContent += `.ic-DashboardCard__box__container > .ic-DashboardCard,.ic-DashboardCard__box__container > .canvasrefined-gpa-card{grid-column:span 2!important}`;
            if (gpaOn && gpaInsideGrid) {
                // GPA card pinned to the first slot, or auto-placed after the cards; the
                // expanded calculator always takes a full-width row
                if (gpaFirst) {
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa-card{grid-row:1!important;grid-column:1/span 2!important}`;
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa{grid-row:2!important;grid-column:1/-1!important}`;
                } else {
                    style.textContent += `.ic-DashboardCard__box__container > .canvasrefined-gpa{grid-column:1/-1!important}`;
                }
            }
        }
    }
    if (options.customCardStyles === true) {
        if (options.imageSize !== undefined && options.imageSize !== 100) style.textContent += `.ic-DashboardCard__header_image {transform: scale(${options.imageSize / 100})!important; }`;
        if (options.cardRoundness !== undefined && options.cardRoundness !== 5) style.textContent += `.ic-DashboardCard {border-radius: ${options.cardRoundness}px!important;}`;
        // the hero overlay sits on top of the photo, so both need the radius — rounding
        // one alone leaves the other's square corners showing
        if (options.imageRoundness !== undefined && options.imageRoundness !== 0) style.textContent += `.ic-DashboardCard__header_image, .ic-DashboardCard__header_hero {border-radius: ${options.imageRoundness}px!important;}`;
        if (options.cardSpacing !== undefined && options.cardSpacing !== 0) style.textContent += `.ic-DashboardCard {margin-right: ${options.cardSpacing / 2}px!important; margin-bottom: ${options.cardSpacing / 2}px!important;}`;
        if (options.cardWidth !== undefined && options.cardWidth !== 262) style.textContent += `.ic-DashboardCard {width: ${options.cardWidth}px!important;}`;
        // card height goes on the hero band (146px stock): the card and header are
        // content-sized, so a height on either just clips or adds dead space
        if (options.condensed_cards !== true && options.cardHeight !== undefined && options.cardHeight !== null && options.cardHeight !== "") {
            style.textContent += `.ic-DashboardCard__header_hero {height: ${options.cardHeight}px!important;}`;
        }
        // padding on the card box; content-box so it grows the card instead of squishing
        // the content (Canvas cards are border-box with a fixed width)
        if (options.cardPadding !== undefined && Number(options.cardPadding) > 0) {
            style.textContent += `.ic-DashboardCard {padding: ${options.cardPadding}px!important; box-sizing: content-box!important;}`;
        }
    }

    // margins always cleared so the bar lines up with the content column; hiding it is opt-in
    style.textContent += ".ic-app-nav-toggle-and-crumbs{margin-left:0!important;margin-right:0!important}";
    if (options.hide_navbar === true) style.textContent += ".ic-app-nav-toggle-and-crumbs{display:none!important}";
    if (options.custom_styles !== "") style.textContent += options.custom_styles;
    document.documentElement.appendChild(style);
    // after the style lands; clears stale offsets so turning the grid off needs no refresh
    requestAnimationFrame(centerUnevenGridRows);
}

/*
Center uneven grid rows.

CSS grid always packs rows from the left, so a last row with fewer cards
than the chosen column count sits flush-left while the rows above are full.
Pure CSS can't center a partial row, so we offset the first card of the last
partial row with grid-column-start.

The grid runs on double sub-columns (each card spans 2 — see
applyAestheticChanges), which is what makes this possible at all: with 3
cards under a 4-card row the leftover space is one column, and centering
needs a HALF-column shift — impossible on plain column lines. On sub-columns
the shift is a whole sub-column (half a card + half a gap), so every
remainder can be centered exactly.

Only runs while Card Grid is on. Skips when the cards overflow the explicit
template (those extra rows are clipped anyway, and the last visible row is
full). Any previously applied offset is cleared first so re-runs (card
hidden/unhidden, dashboard re-render, setting changes) start clean.
*/
function centerUnevenGridRows() {
    const container = document.querySelector(".ic-DashboardCard__box__container");
    if (!container) return;
    // DOM order matches auto-placement order, so chunking this list matches the real rows
    const items = Array.from(container.children).filter(el => el.classList && (el.classList.contains("ic-DashboardCard") || el.classList.contains("canvasrefined-gpa-card")));
    items.forEach(el => el.style.removeProperty("grid-column"));
    if (options.card_grid !== true || options.card_grid_center_rows !== true) return;
    // flexible grid changes the column count live, so fixed offsets would be wrong
    if (options.card_grid_flex === true) return;
    const cols = Math.max(1, parseInt(options.card_grid_columns, 10) || 4);
    const rows = Math.max(1, parseInt(options.card_grid_rows, 10) || 3);
    const visible = items.filter(el => getComputedStyle(el).display !== "none");
    const count = visible.length;
    // overflow past the template is clipped and the last visible row is full — nothing to center
    const gpaExpanded = options.gpa_calc === true && (() => {
        const expanded = container.querySelector(":scope > .canvasrefined-gpa");
        return !!expanded && getComputedStyle(expanded).display !== "none";
    })();
    const capacity = cols * (rows + (options.gpa_calc === true ? 2 : 0)) - (gpaExpanded ? cols : 0);
    if (count === 0 || count > capacity) return;
    const lastRowStart = Math.floor((count - 1) / cols) * cols;
    const inLastRow = count - lastRowStart;
    if (inLastRow >= cols) return;
    // half the leftover, in sub-columns, paired with an explicit span; !important because
    // the stylesheet span rule is !important too
    const offset = cols - inLastRow;
    if (offset > 0) visible[lastRowStart].style.setProperty("grid-column", `${offset + 1} / span 2`, "important");
}

/*
Quiz safe mode banner (pre-quiz pages only).
Shows an info box explaining the extension hasn't been approved by all teachers,
with a toggle for Quiz Safe Mode and a "Don't show again" button.
*/
function setupQuizSafeModeBanner() {
    if (!isQuizPreTakePage()) return;
    if (document.getElementById("canvasrefined-quiz-safe-banner")) return;

    chrome.storage.local.get("quiz_safe_mode_reminder_dismissed", local => {
        if (local && local.quiz_safe_mode_reminder_dismissed === true) return;
        chrome.storage.sync.get("quiz_safe_mode", sync => {
            const safeModeOn = sync && sync.quiz_safe_mode === true;
            injectQuizSafeModeBanner(safeModeOn);
        });
    });
}

function injectQuizSafeModeBanner(safeModeOn) {
    // never inject into <body>: it would land outside the content area
    const findContainer = () =>
        document.querySelector(".ic-Layout-contentMain") ||
        document.querySelector("#content") ||
        document.querySelector("#main");

    const insertInto = (container) => {
        if (!container) return false;
        if (document.getElementById("canvasrefined-quiz-safe-banner")) return true;

        const banner = makeElement("div", container, {
            id: "canvasrefined-quiz-safe-banner",
            className: "canvasrefined-quiz-safe-banner",
        }, true);

        makeElement("div", banner, {
            className: "canvasrefined-quiz-safe-title",
            textContent: chrome.i18n.getMessage("quiz_safe_title") || "Canvas Refined — Quiz Safe Mode",
        });

        makeElement("p", banner, {
            className: "canvasrefined-quiz-safe-info",
            textContent: chrome.i18n.getMessage("quiz_safe_desc") || "This extension hasn't been 100% approved by all teachers. Quiz Safe Mode turns off most Canvas Refined features that could interfere with this quiz page, giving you the default Canvas quiz experience.",
        });

        const toggleRow = makeElement("div", banner, { className: "canvasrefined-quiz-safe-row" });
        const toggleWrap = makeElement("label", toggleRow, { className: "canvasrefined-quiz-safe-toggle" });
        const checkbox = makeElement("input", toggleWrap, { type: "checkbox" });
        checkbox.checked = !!safeModeOn;
        checkbox.addEventListener("change", () => {
            chrome.storage.sync.set({ quiz_safe_mode: checkbox.checked });
            // The storage.onChanged listener (applyOptionsChanges) reloads quiz pages.
        });
        makeElement("span", toggleWrap, {
            className: "canvasrefined-quiz-safe-toggle-label",
            textContent: chrome.i18n.getMessage("quiz_enable") || "Enable Quiz Safe Mode",
        });

        const dismissBtn = makeElement("button", toggleRow, {
            className: "canvasrefined-quiz-safe-dismiss",
 type: "button",
            textContent: chrome.i18n.getMessage("quiz_dont_show") || "Don't show again",
            title: chrome.i18n.getMessage("quiz_dont_show_title") || "Hides this reminder permanently. You can still toggle Quiz Safe Mode in the extension popup.",
        });
        dismissBtn.addEventListener("click", () => {
            chrome.storage.local.set({ quiz_safe_mode_reminder_dismissed: true });
            banner.remove();
        });

        return true;
    };

    if (insertInto(findContainer())) return;

    const obs = new MutationObserver(() => {
        if (insertInto(findContainer())) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
}



// Global Canvas Search: search every course's modules, items and assignments, then jump
// to them. Triggered by the floating button or Ctrl/Cmd+K.

// Cost model: Canvas has no cross-course search API, so the index is assembled from
// /courses -> (/assignments + /modules?include[]=items). Items are returned inline by
// Canvas where it supports it, which keeps a full build at ~2 requests per course
// instead of one per module. The result is cached per host in chrome.storage.local,
// so reopening search costs zero requests; stale courses are topped up a few at a
// time while the tab idles, and "Refresh" forces a full network rebuild.

const GS_CACHE_VERSION = 2;
const GS_CACHE_KEY_PREFIX = "canvasrefined_gs_cache_";
const GS_CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000; // drop a cache untouched for 2 weeks
const GS_COURSE_TTL = 30 * 60 * 1000;              // course content is fresh for 30 min
const GS_COURSELIST_TTL = 15 * 60 * 1000;          // enrollment list is fresh for 15 min
const GS_REFRESH_PER_LOAD = 6;                     // stale courses topped up per page load
const GS_CONCURRENCY = 12;                         // parallel requests while indexing
const GS_MAX_COURSES = 60;
const GS_MAX_PAGES = 10;                           // pagination safety net
const GS_BUILD_LOCK = "canvasrefined-gs-build";

// Persisted shape (keyed per host):
// { v, updatedAt, courses: { "<id>": { n: name, c: code, at: fetchedAt,
//                                       e: [[kind, title, urlPath], ...] } } }
let gsCache = null;
let gsCacheLoaded = false;
let gsCachePromise = null;
let gsEntries = [];                 // live flat index, appended per course as it lands
let gsEntriesByCourse = new Map();  // "<id>" -> its entries, so a course can be replaced
let gsSeenUrls = new Set();         // dedupe across courses by normalized URL
let gsBuildPromise = null;
let gsTopUpPromise = null;          // background stale-course refresh, if any
let gsBuiltOnce = false;
let gsRequests = 0;                 // request counter for the debug summary
let gsRateLimitedUntil = 0;         // throttle gate shared by all workers
let gsOnIndexUpdated = null;        // modal hook: rerun the current query
let _gsPrewarmScheduled = false;
let _gsShortcutBound = false;

function setupGlobalSearch() {
    if (options.global_search !== true) return;
    ensureGlobalSearchButton();
    ensureGlobalSearchShortcut();
    gsSchedulePrewarm();
}

function removeGlobalSearch() {
    document.getElementById("canvasrefined-global-search-header-btn")?.remove();
    removeGlobalSearchBetterSidebarButton();
    removeGlobalSearchNativeSidebarButton();
    closeGlobalSearchModal();
    if (_gsPlacementObserver) { _gsPlacementObserver.disconnect(); _gsPlacementObserver = null; }
    if (_gsShortcutBound) {
        document.removeEventListener("keydown", onGlobalSearchShortcut, true);
        _gsShortcutBound = false;
    }
}

const GLOBAL_SEARCH_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><circle cx="11" cy="11" r="7" stroke="var(--bcsidebar-text)" stroke-width="2" fill="none"/><path d="m20 20-3.2-3.2" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round"/></g></svg>`;

// One trigger per active left sidebar (Better Sidebar or native nav), plus a
// dashboard header button; a rAF-debounced observer re-places them.
let _gsPlacementObserver = null;
let _gsPlacementScheduled = false;
function ensureGlobalSearchButton() {
    placeGlobalSearchTrigger();
    if (_gsPlacementObserver) return;
    _gsPlacementObserver = new MutationObserver(() => {
        if (_gsPlacementScheduled) return;
        _gsPlacementScheduled = true;
        requestAnimationFrame(() => {
            _gsPlacementScheduled = false;
            placeGlobalSearchTrigger();
        });
    });
    _gsPlacementObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function placeGlobalSearchTrigger() {
    if (options.global_search !== true) return;

    ensureGlobalSearchNativeSidebarButton();

    const betterSidebar = document.getElementById("better-sidebar-container");
    if (betterSidebar) {
        ensureGlobalSearchBetterSidebarButton(betterSidebar);
    } else {
        removeGlobalSearchBetterSidebarButton();
    }

    const headerActions = document.querySelector(".ic-Dashboard-header__actions");
    if (isDashboardPage() && headerActions) {
        ensureGlobalSearchHeaderButton(headerActions);
    } else {
        document.getElementById("canvasrefined-global-search-header-btn")?.remove();
    }
}


function ensureGlobalSearchBetterSidebarButton(betterSidebar) {
    const sidebarContent = betterSidebar.querySelector("div");
    if (!sidebarContent) return;
    if (sidebarContent.querySelector("#canvasrefined-gs-sidebar-btn")) return;
    const btn = document.createElement("a");
    btn.id = "canvasrefined-gs-sidebar-btn";
    btn.className = "canvasrefined-custom-btn better-sidebar-btn canvasrefined-gs-sidebar-btn";
    btn.href = "#";
    btn.title = getMsg("search_canvas_ctrlk", "Search Canvas (Ctrl+K)");
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", getMsg("search_canvas", "Search Canvas"));
    const searchLabel = getMsg("search", "Search");    btn.style.cssText = "width:40%;height:var(--bc-sidebar-btn-height,30px);cursor:pointer;text-align:center;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:var(--bc-sidebar-btn-gap,8px);color:var(--bcsidebar-text) !important;font-weight:bold;position:relative;";
    btn.innerHTML = `${GLOBAL_SEARCH_ICON_SVG}<span class="better-sidebar-label" style="font-size:var(--bc-sidebar-label-size,14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${searchLabel}</span>`;
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openGlobalSearchModal(); });
    sidebarContent.appendChild(btn);
    // Match the sidebar's current state now so the button doesn't render wrong
    // until the next updateSidebar().
    applyGlobalSearchSidebarButtonMode(btn, betterSidebar.dataset.expanded === "true");
}

function removeGlobalSearchBetterSidebarButton() {
    document.getElementById("canvasrefined-gs-sidebar-btn")?.remove();
}

function applyGlobalSearchSidebarButtonMode(btn, expanded) {
    if (!btn) return;
    btn.style.width = expanded ? "80%" : "40%";
    const label = btn.querySelector(".better-sidebar-label");
    if (label) label.style.display = expanded ? "block" : "none";
    btn.querySelectorAll("svg").forEach(svg => {
        svg.style.width = "var(--bc-sidebar-icon-size,20px)";
        svg.style.height = "var(--bc-sidebar-icon-size,20px)";
    });
}


function ensureGlobalSearchNativeSidebarButton() {
    const navMenu = document.getElementById("menu");
    if (!navMenu) return;
    if (navMenu.querySelector("#canvasrefined-gs-nav-item")) return;
    const li = document.createElement("li");
    li.id = "canvasrefined-gs-nav-item";
    li.className = "ic-app-header__menu-list-item canvasrefined-gs-nav-item";
    const link = document.createElement("a");
    link.className = "ic-app-header__menu-list-link";
    link.href = "#";
    link.setAttribute("role", "button");
    link.title = chrome.i18n.getMessage("search_canvas_ctrlk") || "Search Canvas (Ctrl+K)";
    link.setAttribute("aria-label", chrome.i18n.getMessage("search_canvas") || "Search Canvas");
    link.innerHTML = `<span class="menu-item-icon-container" aria-hidden="true">${GLOBAL_SEARCH_ICON_SVG}</span><span class="menu-item__text">${chrome.i18n.getMessage("search") || "Search"}</span>`;
    link.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openGlobalSearchModal(); });
    li.appendChild(link);
    navMenu.appendChild(li);
}

function removeGlobalSearchNativeSidebarButton() {
    document.getElementById("canvasrefined-gs-nav-item")?.remove();
}


function ensureGlobalSearchHeaderButton(headerActions) {
    if (headerActions.querySelector("#canvasrefined-global-search-header-btn")) return;
    const btn = document.createElement("button");
    btn.id = "canvasrefined-global-search-header-btn";
    btn.type = "button";
    btn.className = "canvasrefined-gs-header-btn";
    btn.title = chrome.i18n.getMessage("search_canvas_ctrlk") || "Search Canvas (Ctrl+K)";
    btn.setAttribute("aria-label", chrome.i18n.getMessage("search_canvas") || "Search Canvas");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="canvasrefined-gs-header-btn-label">${chrome.i18n.getMessage("search") || "Search"}</span>`;
    btn.addEventListener("click", openGlobalSearchModal);
    // First child of the actions row, just left of the ⋯ button.
    headerActions.insertBefore(btn, headerActions.firstChild);
}

function ensureGlobalSearchShortcut() {
    if (_gsShortcutBound) return;
    document.addEventListener("keydown", onGlobalSearchShortcut, true);
    _gsShortcutBound = true;
}

function onGlobalSearchShortcut(e) {
    // Ctrl/Cmd+K toggles the modal.
    if (!(e.ctrlKey || e.metaKey) || !(e.key === "k" || e.key === "K")) return;

    // Not on quiz pages. Read the URL live: current_page can be stale after
    // Canvas' client-side navigation.
    if (/^\/courses\/\d+\/quizzes\/\d+(?:\/|$)/.test(window.location.pathname)) return;

    const modal = document.getElementById("canvasrefined-global-search-modal");
    if (modal && modal.dataset.open === "true") {
        closeGlobalSearchModal();
    } else {
        e.preventDefault();
        openGlobalSearchModal();
    }
}

function openGlobalSearchModal() {
    if (document.getElementById("canvasrefined-global-search-modal")) return;

    const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "\u2318" : "Ctrl";
    const modal = document.createElement("div");
    modal.id = "canvasrefined-global-search-modal";
    modal.className = "canvasrefined-gs-modal";
    modal.dataset.open = "true";
    modal.innerHTML = `
        <div class="canvasrefined-gs-card" role="dialog" aria-modal="true" aria-label="${getMsg("search_canvas", "Search Canvas")}">
            <div class="canvasrefined-gs-input-row">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="canvasrefined-gs-input-icon"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <input id="canvasrefined-gs-input" class="canvasrefined-gs-input" type="text" placeholder="${chrome.i18n.getMessage("search_placeholder") || "Search modules & assignments\u2026 (@coursename filters by course)"}" autocomplete="off" spellcheck="false" />
                <button id="canvasrefined-gs-close" class="canvasrefined-gs-close" type="button" title="${getMsg("search_close_title", "Close (Esc)")}">Esc</button>
            </div>
            <div id="canvasrefined-gs-results" class="canvasrefined-gs-results"></div>
            <div class="canvasrefined-gs-status" style="display:none;">
                <span id="canvasrefined-gs-status-text" class="canvasrefined-gs-status-text"></span>
                <button id="canvasrefined-gs-refresh" class="canvasrefined-gs-refresh" type="button" title="${getMsg("search_refresh_title", "Rebuild the index from Canvas")}">${getMsg("search_refresh", "Refresh")}</button>
            </div>
            <div class="canvasrefined-gs-footer">
                <span><kbd>\u2191</kbd><kbd>\u2193</kbd> ${getMsg("search_navigate", "navigate")}</span>
                <span><kbd>Enter</kbd> ${getMsg("search_open", "open")}</span>
                <span><kbd>${modKey}</kbd>+<kbd>Enter</kbd> ${getMsg("search_new_tab", "new tab")}</span>
                <span><kbd>${modKey}</kbd>+<kbd>K</kbd> ${getMsg("search_toggle", "toggle search")}</span>
                <span><kbd>Esc</kbd> ${getMsg("search_close", "Close")}</span>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector("#canvasrefined-gs-input");
    const resultsEl = modal.querySelector("#canvasrefined-gs-results");
    const closeBtn = modal.querySelector("#canvasrefined-gs-close");
    let selected = -1;
    let currentResults = [];

    closeBtn.addEventListener("click", closeGlobalSearchModal);
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeGlobalSearchModal(); });

    // Capture phase so we win over the global Ctrl+K handler.
    modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeGlobalSearchModal(); return; }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selected = Math.min(selected + 1, currentResults.length - 1);
            renderGlobalSearchSelection(resultsEl, selected);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selected = Math.max(selected - 1, 0);
            renderGlobalSearchSelection(resultsEl, selected);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const item = currentResults[selected];
            if (item) openGlobalSearchResult(item, e.ctrlKey || e.metaKey);
        }
    });
    input.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) e.stopPropagation();
    });

    const applyResults = (res) => {
        currentResults = res;
        selected = res.length ? 0 : -1;
        renderGlobalSearchSelection(resultsEl, selected);
    };
    let debounce = null;
    const rerun = () => {
        if (document.getElementById("canvasrefined-global-search-modal") !== modal) return;
        clearTimeout(debounce);
        runGlobalSearch(input.value.trim(), resultsEl).then(applyResults);
    };
    input.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(rerun, 120);
    });

    modal.querySelector("#canvasrefined-gs-refresh")?.addEventListener("click", () => {
        gsForceRefresh();
        gsUpdateStatus(true);
    });

    // Results that land late (cold build, background top-up) should show up without
    // the user retyping.
    gsOnIndexUpdated = () => {
        if (input.value.trim()) rerun();
        gsUpdateStatus(true);
    };

    requestAnimationFrame(() => input.focus());
    ensureGlobalSearchIndex();
    gsUpdateStatus(true);
    resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">${getMsg("search_hint", "Start typing to search your modules and assignments. Use @coursename to search a specific course, or @grades to open a course's grades page.")}</div>`;
}

function closeGlobalSearchModal() {
    const modal = document.getElementById("canvasrefined-global-search-modal");
    gsOnIndexUpdated = null;
    if (!modal) return;
    modal.remove();
}

function openGlobalSearchResult(item, newTab) {
    if (!item || !item.url) return;
    if (newTab) {
        window.open(item.url, "_blank", "noopener");
        const input = document.getElementById("canvasrefined-gs-input");
        if (input) input.focus();
    } else {
        closeGlobalSearchModal();
        window.location.href = item.url;
    }
}

function renderGlobalSearchSelection(resultsEl, selected) {
    const rows = resultsEl.querySelectorAll(".canvasrefined-gs-row");
    rows.forEach((row, i) => {
        if (i === selected) { row.classList.add("canvasrefined-gs-selected"); row.scrollIntoView({ block: "nearest" }); }
        else row.classList.remove("canvasrefined-gs-selected");
    });
}


function gsCacheKey() {
    return GS_CACHE_KEY_PREFIX + location.host;
}

function gsSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// chrome.storage supports both callbacks and promises depending on browser and
// version; wrap either shape so the cache path can't hang.
function gsStorageGet(key) {
    return new Promise(resolve => {
        try {
            const maybe = chrome.storage.local.get(key, result => resolve(result || {}));
            if (maybe && typeof maybe.then === "function") {
                maybe.then(r => resolve(r || {}), () => resolve({}));
            }
        } catch (_) { resolve({}); }
    });
}

function gsStorageSet(value) {
    return new Promise(resolve => {
        try {
            const maybe = chrome.storage.local.set(value, () => resolve());
            if (maybe && typeof maybe.then === "function") maybe.then(() => resolve(), () => resolve());
        } catch (_) { resolve(); }
    });
}

async function gsReadCache() {
    const key = gsCacheKey();
    const stored = (await gsStorageGet(key))[key];
    if (!stored || stored.v !== GS_CACHE_VERSION || !stored.courses) return null;
    const now = Date.now();
    const courses = {};
    let kept = 0;
    for (const [cid, course] of Object.entries(stored.courses)) {
        if (!course || !course.n || !Array.isArray(course.e)) continue;
        if (now - (course.at || 0) > GS_CACHE_MAX_AGE) continue;
        courses[cid] = course;
        kept++;
    }
    if (!kept) return null;
    return {
        v: GS_CACHE_VERSION,
        updatedAt: stored.updatedAt || 0,
        courseList: stored.courseList && Array.isArray(stored.courseList.items) ? stored.courseList : null,
        courses
    };
}

async function gsEnsureCacheLoaded() {
    if (gsCacheLoaded) return gsCache;
    if (gsCachePromise) return gsCachePromise;
    gsCachePromise = (async () => {
        gsCache = await gsReadCache();
        gsCacheLoaded = true;
        return gsCache;
    })();
    try {
        return await gsCachePromise;
    } finally {
        gsCachePromise = null;
    }
}

// Merge rather than overwrite: Canvas is often open in several tabs and every tab
// shares this cache, so a per-course entry is only ever replaced by a newer one.
async function gsPersistCache() {
    if (!gsCache || !gsCache.courses) return;
    try {
        const key = gsCacheKey();
        const stored = (await gsStorageGet(key))[key];
        if (stored && stored.v === GS_CACHE_VERSION && stored.courses) {
            for (const [cid, course] of Object.entries(stored.courses)) {
                const mine = gsCache.courses[cid];
                if (!mine || (course.at || 0) > (mine.at || 0)) gsCache.courses[cid] = course;
            }
            const theirs = stored.courseList;
            if (theirs && (!gsCache.courseList || (theirs.at || 0) > (gsCache.courseList.at || 0))) {
                gsCache.courseList = theirs;
            }
        }
        gsCache.updatedAt = Date.now();
        await gsStorageSet({ [key]: gsCache });
    } catch (_) { /* cache write is best-effort */ }
}

async function gsMergeFromStorage() {
    const fresh = await gsReadCache();
    if (!fresh || !gsCache) return;
    for (const [cid, course] of Object.entries(fresh.courses)) {
        const mine = gsCache.courses[cid];
        if (!mine || (course.at || 0) > (mine.at || 0)) gsCache.courses[cid] = course;
    }
    if (fresh.courseList && (!gsCache.courseList || (fresh.courseList.at || 0) > (gsCache.courseList.at || 0))) {
        gsCache.courseList = fresh.courseList;
    }
}

// Cached URLs are stored as paths so the cache is small and host-independent
// within one Canvas instance.
function gsRelUrl(url) {
    try {
        const u = new URL(url, domain);
        if (u.origin === domain) return u.pathname + u.search;
        return u.href;
    } catch (_) {
        return String(url || "");
    }
}

function gsAbsUrl(url) {
    const s = String(url || "");
    if (!s) return "";
    if (/^https?:/i.test(s)) return s;
    return domain + (s.charAt(0) === "/" ? s : "/" + s);
}

const GS_KIND_CLASS = {
    course: "course",
    module: "module",
    assignment: "assignment",
    quiz: "quiz",
    discussion_topic: "discussion",
    discussion: "discussion",
    page: "page",
    file: "file",
    externalurl: "link",
    externaltool: "external-tool",
    grades: "grades",
};

function gsKindClass(kind) {
    return GS_KIND_CLASS[kind] || String(kind || "item").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function gsKindLabel(kind) {
    if (kind === "course") return getMsg("search_type_course", "Course");
    if (kind === "module") return getMsg("search_type_module", "Module");
    if (kind === "grades") return getMsg("search_type_grades", "Grades");
    return prettyModuleItemType(kind);
}

function gsKindFromItemType(type) {
    const t = (type || "").toLowerCase();
    if (t === "discussion") return "discussion_topic";
    return t || "item";
}

// Entries carry their lowercase forms and display label so a keystroke only has to
// compare strings (the index is rebuilt in memory once per page, not per keypress).
function gsMakeEntry(kind, title, course, courseCode, courseId, url) {
    const t = String(title || "");
    const c = String(course || "");
    return {
        kind,
        cls: gsKindClass(kind),
        type: gsKindLabel(kind),
        title: t,
        course: c,
        courseCode: courseCode || c,
        courseId,
        url,
        _t: t.toLowerCase(),
        _c: c.toLowerCase()
    };
}

function gsRemoveCourseEntries(courseId) {
    const old = gsEntriesByCourse.get(courseId);
    if (!old || !old.length) return;
    const drop = new Set(old);
    gsEntries = gsEntries.filter(entry => !drop.has(entry));
    for (const entry of old) gsSeenUrls.delete(normalizeGlobalSearchUrl(entry.url));
    gsEntriesByCourse.delete(courseId);
}

function gsAddCourseEntries(courseId, name, courseCode, tuples) {
    gsRemoveCourseEntries(courseId);
    const list = [];
    const push = (kind, title, url) => {
        const absolute = gsAbsUrl(url);
        const key = normalizeGlobalSearchUrl(absolute);
        if (!key || gsSeenUrls.has(key)) return;
        gsSeenUrls.add(key);
        const entry = gsMakeEntry(kind, title, name, courseCode, courseId, absolute);
        gsEntries.push(entry);
        list.push(entry);
    };
    if (name) push("course", name, `/courses/${courseId}`);
    for (const tuple of tuples || []) {
        if (Array.isArray(tuple)) push(tuple[0], tuple[1], tuple[2]);
    }
    gsEntriesByCourse.set(courseId, list);
}

// courses === null rebuilds from everything cached (used before the course list
// arrives, so search works while that request is still in flight).
function gsLoadFromCache(courses) {
    gsEntries = [];
    gsEntriesByCourse = new Map();
    gsSeenUrls = new Set();
    const cachedCourses = (gsCache && gsCache.courses) || {};
    if (courses) {
        for (const course of courses) {
            const cached = cachedCourses[String(course.id)];
            if (cached) gsAddCourseEntries(String(course.id), cached.n, cached.c || cached.n, cached.e);
        }
    } else {
        for (const [cid, cached] of Object.entries(cachedCourses)) {
            gsAddCourseEntries(cid, cached.n, cached.c || cached.n, cached.e);
        }
    }
}

// One request with retry. Canvas throttles with 429 — or 403 "Rate Limit Exceeded"
// — and costs are per token, so a burst of 60 courses would otherwise lose courses.
async function gsFetchOnce(url, attempt) {
    const gate = gsRateLimitedUntil - Date.now();
    if (gate > 0) await gsSleep(Math.min(gate, 4000));

    let response;
    try {
        response = await pageFetch(url, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
    } catch (e) {
        if (attempt < 2) {
            await gsSleep(300 * (attempt + 1));
            return gsFetchOnce(url, attempt + 1);
        }
        throw e;
    }
    gsRequests++;

    const remainingHeader = response.headers.get("X-Rate-Limit-Remaining");
    const remaining = remainingHeader === null ? NaN : Number(remainingHeader);
    if (Number.isFinite(remaining) && remaining <= 50) gsRateLimitedUntil = Date.now() + 1500;

    if (response.ok) {
        const data = await response.json();
        return { data, response };
    }

    let retryable = response.status === 429 || response.status >= 500;
    if (response.status === 403) {
        let body = "";
        try { body = await response.text(); } catch (_) { /* ignore */ }
        retryable = /rate.?limit/i.test(body);
    }
    if (retryable && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 400 * Math.pow(2, attempt);
        gsRateLimitedUntil = Math.max(gsRateLimitedUntil, Date.now() + delay);
        await gsSleep(Math.min(delay, 8000));
        return gsFetchOnce(url, attempt + 1);
    }
    throw new Error(`Canvas API request failed (${response.status})`);
}

async function gsGetJsonPages(url, options_) {
    const maxPages = (options_ && options_.maxPages) || GS_MAX_PAGES;
    const out = [];
    let next = url;
    for (let page = 0; page < maxPages && next; page++) {
        const { data, response } = await gsFetchOnce(next, 0);
        if (Array.isArray(data)) out.push(...data);
        next = response && response.headers ? getNextPageUrl(response.headers.get("Link")) : null;
    }
    return out;
}

async function gsFetchCourseList() {
    const raw = await gsGetJsonPages(`${domain}/api/v1/courses?enrollment_state=active&per_page=100`, { maxPages: 3 });
    const now = Date.now();
    const seen = new Set();
    const courses = [];
    for (const course of raw) {
        if (!course || !course.id || !course.name) continue;
        // Some institutions report past-term courses as active.
        if (course.access_restricted_by_date === true) continue;
        if (course.concluded === true) continue;
        const endAt = (course.term && course.term.end_at) || course.end_at;
        if (endAt) {
            const end = new Date(endAt).getTime();
            if (!isNaN(end) && end < now) continue;
        }
        // Canvas can repeat a course (multi-role, cross-listed) — dedupe by id.
        const id = String(course.id);
        if (seen.has(id)) continue;
        seen.add(id);
        courses.push(course);
        if (courses.length >= GS_MAX_COURSES) break;
    }
    return courses;
}

// Two requests per course in the common case: assignments, and modules with their
// items inlined. Canvas may omit `items` (it is explicitly best-effort), and only
// then do we pay for per-module requests.
async function gsFetchCourse(course) {
    const courseId = String(course.id);
    const name = course.name;
    const courseCode = course.course_code || name;
    const tuples = [];
    const seen = new Set();

    const add = (kind, title, url, dedupeKey) => {
        if (!title || !url) return;
        const key = dedupeKey || `url:${normalizeGlobalSearchUrl(gsAbsUrl(url))}`;
        if (seen.has(key)) return;
        seen.add(key);
        tuples.push([kind, String(title), gsRelUrl(url)]);
    };

    const settle = (url) => gsGetJsonPages(url).then(data => ({ ok: true, data }), () => ({ ok: false, data: [] }));
    const [assignmentsResult, modulesResult] = await Promise.all([
        settle(`${domain}/api/v1/courses/${courseId}/assignments?per_page=100`),
        settle(`${domain}/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`)
    ]);
    const assignments = assignmentsResult.data;
    const modules = modulesResult.data;
    // Nothing came back (expired session, outage): keep the previous cache entry
    // rather than overwrite it with an empty course.
    if (!assignmentsResult.ok && !modulesResult.ok) {
        throw new Error(`course ${courseId} unavailable`);
    }
    // A half-fetched course is still useful but must not look fresh.
    const complete = assignmentsResult.ok && modulesResult.ok;

    // Assignments first so their direct URL wins over a module-item copy.
    for (const assignment of assignments) {
        if (!assignment || !assignment.name || !assignment.html_url) continue;
        add("assignment", assignment.name, assignment.html_url, `asn:${assignment.id}`);
    }

    const missingInline = [];
    const addItems = (items) => {
        for (const item of items) {
            if (!item || !item.title) continue;
            const itemType = (item.type || "").toLowerCase();
            if (itemType === "subheader") continue;
            // Prefer html_url/external_url; bare `url` is the API endpoint.
            const url = item.html_url || item.external_url;
            if (!url) continue;
            let key;
            if (itemType === "assignment" && item.content_id) key = `asn:${item.content_id}`;
            else if (item.content_id) key = `${itemType}:${item.content_id}`;
            else key = `url:${normalizeGlobalSearchUrl(gsAbsUrl(url))}`;
            add(gsKindFromItemType(itemType), item.title, url, key);
        }
    };

    for (const module of modules) {
        if (!module || !module.name) continue;
        add("module", module.name, `/courses/${courseId}/modules`, `module:${module.id}`);
        if (Array.isArray(module.items)) addItems(module.items);
        else missingInline.push(module);
    }

    if (missingInline.length) {
        await gsRunPool(missingInline, 4, async (module) => {
            const items = await gsGetJsonPages(`${domain}/api/v1/courses/${courseId}/modules/${module.id}/items?per_page=100`).catch(() => []);
            addItems(items);
        });
    }

    // A half-fetched course is retried sooner (half a TTL) instead of on every load.
    const at = complete ? Date.now() : Date.now() - Math.floor(GS_COURSE_TTL / 2);
    return { courseId, name, code: courseCode, at, tuples };
}

async function gsRefreshCourse(course) {
    try {
        const result = await gsFetchCourse(course);
        if (!gsCache) gsCache = { v: GS_CACHE_VERSION, updatedAt: 0, courses: {} };
        gsCache.courses[result.courseId] = {
            n: result.name,
            c: result.code,
            at: result.at,
            e: result.tuples
        };
        // Publish progressively so typing during a cold build already finds things.
        gsAddCourseEntries(result.courseId, result.name, result.code, result.tuples);
        gsUpdateStatus();
    } catch (e) {
        // Keep the previously cached copy; this course retries on the next load.
        console.debug("[CanvasRefined] global search: course failed", course && course.id, e && e.message);
    }
}

async function gsRunPool(items, limit, worker) {
    let next = 0;
    const runners = [];
    const count = Math.max(1, Math.min(limit, items.length));
    for (let i = 0; i < count; i++) {
        runners.push((async () => {
            while (next < items.length) {
                const item = items[next++];
                try {
                    await worker(item);
                } catch (_) { /* per-item failure is non-fatal */ }
            }
        })());
    }
    await Promise.all(runners);
}

// Web Locks are origin-scoped, so all Canvas tabs of this instance coordinate: the
// first tab builds, the rest pick the result up from storage instead of refetching.
async function gsWithBuildLock(fn) {
    let entered = false;
    if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
        try {
            return await navigator.locks.request(GS_BUILD_LOCK, async () => {
                entered = true;
                return await fn();
            });
        } catch (e) {
            if (entered) throw e;
        }
    }
    return await fn();
}

function gsIsIndexing() {
    return !!(gsBuildPromise || gsTopUpPromise);
}

function gsNewestCourseAt() {
    let newest = 0;
    const courses = (gsCache && gsCache.courses) || {};
    for (const course of Object.values(courses)) {
        if ((course.at || 0) > newest) newest = course.at;
    }
    return newest;
}

function gsFormatAge(ms) {
    if (ms < 60000) return getMsg("search_age_now", "just now");
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return getMsg("search_age_minutes", "{{COUNT}}m ago").replace("{{COUNT}}", String(minutes));
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return getMsg("search_age_hours", "{{COUNT}}h ago").replace("{{COUNT}}", String(hours));
    return getMsg("search_age_days", "{{COUNT}}d ago").replace("{{COUNT}}", String(Math.floor(hours / 24)));
}

let _gsStatusAt = 0;
function gsUpdateStatus(force) {
    const textEl = document.getElementById("canvasrefined-gs-status-text");
    if (!textEl) return;
    const now = Date.now();
    if (!force && now - _gsStatusAt < 120) return;
    _gsStatusAt = now;

    const count = gsEntries.length;
    let text = "";
    if (count) {
        const parts = [getMsg("search_index_count", "{{COUNT}} items").replace("{{COUNT}}", count.toLocaleString())];
        const newest = gsNewestCourseAt();
        if (newest) parts.push(getMsg("search_index_updated", "updated {{AGE}}").replace("{{AGE}}", gsFormatAge(now - newest)));
        if (gsIsIndexing()) parts.push(getMsg("search_index_working", "updating\u2026"));
        text = parts.join(" \u00b7 ");
    } else if (gsIsIndexing()) {
        text = getMsg("search_indexing", "Indexing your courses\u2026");
    }

    textEl.textContent = text;
    const row = textEl.parentElement;
    if (row) row.style.display = text ? "" : "none";
    const refreshBtn = document.getElementById("canvasrefined-gs-refresh");
    if (refreshBtn) refreshBtn.disabled = !!gsBuildPromise;
}

function gsIndexUpdated() {
    try {
        if (typeof gsOnIndexUpdated === "function") gsOnIndexUpdated();
    } catch (_) { /* ignore */ }
}

function gsDebugSummary(startedAt, requestsBefore) {
    try {
        console.debug(`[CanvasRefined] global search index: ${gsEntries.length} items, ` +
            `${gsRequests - requestsBefore} requests, ${Date.now() - startedAt}ms`);
    } catch (_) { /* ignore */ }
}

async function gsBuildIndex(options_) {
    const force = !!(options_ && options_.force);
    const startedAt = Date.now();
    const requestsBefore = gsRequests;
    try {
        await gsEnsureCacheLoaded();

        // Serve whatever is on disk before touching the network: a warm open shows
        // results in milliseconds and updates behind the user's back.
        if (gsCache && !gsEntries.length) {
            gsLoadFromCache(null);
            gsUpdateStatus();
        }

        if (!gsCache) gsCache = { v: GS_CACHE_VERSION, updatedAt: 0, courses: {} };

        // A fresh enrollment list (or a failed refresh with a list on hand) means a
        // warm open costs literally zero requests.
        const cachedList = gsCache.courseList;
        const listFresh = cachedList && (Date.now() - (cachedList.at || 0)) < GS_COURSELIST_TTL;
        let courses = (!force && listFresh) ? cachedList.items : [];
        if (!courses.length) {
            try {
                courses = await gsFetchCourseList();
                if (courses.length) {
                    gsCache.courseList = {
                        at: Date.now(),
                        items: courses.map(c => ({ id: c.id, name: c.name, course_code: c.course_code }))
                    };
                }
            } catch (e) {
                console.warn("[CanvasRefined] global search: failed to load courses", e);
                courses = (cachedList && cachedList.items) || [];
                if (!courses.length) return gsEntries;
            }
        }
        if (!courses.length) {
            if (!gsEntries.length) gsLoadFromCache(null);
            return gsEntries;
        }

        const activeIds = new Set(courses.map(course => String(course.id)));
        for (const cid of Object.keys(gsCache.courses)) {
            if (!activeIds.has(cid)) delete gsCache.courses[cid];
        }

        // Ignore cached courses that are no longer in the active enrollment list.
        gsLoadFromCache(courses);

        const now = Date.now();
        const missing = force ? courses : courses.filter(course => !gsCache.courses[String(course.id)]);
        const stale = force ? [] : courses.filter(course => {
            const cached = gsCache.courses[String(course.id)];
            return cached && (now - (cached.at || 0)) > GS_COURSE_TTL;
        });

        if (missing.length) {
            await gsWithBuildLock(async () => {
                // Another tab may have finished the same build while we waited.
                await gsMergeFromStorage();
                gsLoadFromCache(courses);
                // A forced rebuild refetches everything even if storage already has it
                // (another tab may have built while we queued for the lock).
                const stillMissing = force
                    ? courses
                    : missing.filter(course => !gsCache.courses[String(course.id)]);
                await gsRunPool(stillMissing, GS_CONCURRENCY, course => gsRefreshCourse(course));
            });
            gsLoadFromCache(courses);
            await gsPersistCache();
        }

        gsUpdateStatus();

        // Warm start: refresh the stalest courses a few per page load instead of
        // rebuilding everything. Never blocks the modal.
        if (stale.length) {
            const batch = stale.slice(0, GS_REFRESH_PER_LOAD);
            gsTopUpPromise = gsRunPool(batch, Math.min(GS_CONCURRENCY, 3), course => gsRefreshCourse(course));
            gsTopUpPromise
                .then(() => gsPersistCache())
                .then(() => gsIndexUpdated())
                .catch(() => { /* background top-up is best-effort */ })
                .finally(() => {
                    gsTopUpPromise = null;
                    gsUpdateStatus(true);
                });
        }

        return gsEntries;
    } finally {
        gsDebugSummary(startedAt, requestsBefore);
    }
}

function gsStartBuild(force) {
    if (gsBuildPromise) return gsBuildPromise;
    if (!force && gsBuiltOnce) return Promise.resolve(gsEntries);
    gsBuiltOnce = true;

    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    gsBuildPromise = done;

    gsBuildIndex({ force: !!force })
        .catch(e => console.warn("[CanvasRefined] global search index failed", e))
        .then(() => {
            gsBuildPromise = null;
            gsUpdateStatus(true);
            gsIndexUpdated();
            resolveDone(gsEntries);
        });

    gsUpdateStatus(true);
    return done;
}

function gsForceRefresh() {
    if (gsBuildPromise) return;
    gsBuiltOnce = false;
    // Let an in-flight top-up finish first: the full rebuild supersedes it anyway.
    if (gsTopUpPromise) {
        gsTopUpPromise.then(() => {
            gsTopUpPromise = null;
            gsStartBuild(true);
        });
        return;
    }
    gsStartBuild(true);
}

function ensureGlobalSearchIndex() {
    return gsStartBuild(false);
}

// Warm the index on dashboard loads so Ctrl+K has something to show instantly. Only
// runs once a cache exists (i.e. the user has searched before): a cold build costs
// ~120 requests and shouldn't happen for a feature nobody has opened. Once warm, a
// page load only tops up a handful of stale courses at idle.
function gsSchedulePrewarm() {
    if (_gsPrewarmScheduled || options.global_search !== true) return;
    if (!isDashboardPage()) return;
    _gsPrewarmScheduled = true;
    const run = async () => {
        if (options.global_search !== true) return;
        try {
            await gsEnsureCacheLoaded();
            if (gsCache) gsStartBuild(false);
        } catch (_) { /* prewarm is best-effort */ }
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 2500);
}

function normalizeGlobalSearchUrl(url) {
    if (!url) return "";
    try {
        const u = new URL(url, domain);
        let path = u.pathname.replace(/\/+$/, ""); // strip trailing slashes
        return (u.host.toLowerCase() + path).toLowerCase();
    } catch (_) {
        return String(url).replace(/\/+$/, "").toLowerCase();
    }
}

function prettyModuleItemType(type) {
    switch ((type || "").toLowerCase()) {
        case "assignment": return getMsg("search_type_assignment", "Assignment");
        case "quiz": return getMsg("search_type_quiz", "Quiz");
        case "discussion": case "discussion_topic": return getMsg("search_type_discussion", "Discussion");
        case "externalurl": return getMsg("search_type_link", "Link");
        case "externaltool": return getMsg("search_type_external_tool", "External Tool");
        case "file": return getMsg("search_type_file", "File");
        case "page": return getMsg("search_type_page", "Page");
        case "module": return getMsg("search_type_module", "Module");
        case "course": return getMsg("search_type_course", "Course");
        case "grades": return getMsg("search_type_grades", "Grades");
        case "subheader": return getMsg("search_type_section", "Section");
        default: return type || getMsg("search_type_item", "Item");
    }
}


// Case-insensitive match on full name or course code; empty filter matches all.
function globalSearchCourseMatches(courseEntry, filter) {
    const f = (filter || "").toLowerCase();
    if (!f) return true;
    return (courseEntry.title || "").toLowerCase().includes(f) ||
        (courseEntry.courseCode || "").toLowerCase().includes(f);
}

// Splits "@Math 101 homework 5" into { courseFilter, content }: the filter is the
// longest prefix that matches a course. Null when there is no @token.
function parseGlobalSearchCourseFilter(query, courseEntries) {
    const at = query.lastIndexOf("@");
    if (at < 0) return null;
    // '@' must start the query or follow whitespace, so emails aren't split.
    if (at > 0 && !/\s/.test(query[at - 1])) return null;
    const before = query.slice(0, at).trim();
    const rest = query.slice(at + 1);
    // Longest match, ending on a word boundary ("@mathh" is not math + h).
    for (let len = rest.length; len > 0; len--) {
        if (len < rest.length && rest[len] !== " ") continue;
        const candidate = rest.slice(0, len).trim().toLowerCase();
        if (!candidate) continue;
        if (courseEntries.some(c => globalSearchCourseMatches(c, candidate))) {
            return { courseFilter: candidate, content: `${before} ${rest.slice(len)}`.trim() };
        }
    }
    if (!rest.trim()) return { courseFilter: "", content: before }; // bare "@" -> all courses
    return null;
}

function globalSearchRowHtml(item, i) {
    return `
        <div class="canvasrefined-gs-row" data-i="${i}" data-url="${escapeGlobalSearchAttr(item.url)}">
            <div class="canvasrefined-gs-row-main">
                <span class="canvasrefined-gs-type canvasrefined-gs-type-${escapeGlobalSearchAttr(item.cls || (item.type || "").toLowerCase().replace(/\s+/g, "-"))}">${escapeGlobalSearchHtml(item.type || "")}</span>
                <span class="canvasrefined-gs-title">${escapeGlobalSearchHtml(item.title || "")}</span>
            </div>
            <span class="canvasrefined-gs-course">${escapeGlobalSearchHtml(item.course || "")}</span>
        </div>`;
}

function bindGlobalSearchRows(resultsEl, top) {
    resultsEl.querySelectorAll(".canvasrefined-gs-row").forEach((row) => {
        row.addEventListener("click", (e) => {
            const url = row.getAttribute("data-url");
            const item = top.find(x => x.url === url);
            if (item) openGlobalSearchResult(item, e.ctrlKey || e.metaKey || (e.button === 1));
        });
        row.addEventListener("auxclick", (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            const url = row.getAttribute("data-url");
            const item = top.find(x => x.url === url);
            if (item) openGlobalSearchResult(item, true);
        });
    });
}

// Never awaits the network: searches whatever the live index holds right now (the
// persisted cache on a warm load, partially-filled during a cold build) so results
// appear as courses land instead of after the whole index is ready.
async function runGlobalSearch(query, resultsEl) {
    gsStartBuild(false);
    const index = gsEntries;
    const indexing = gsIsIndexing();

    if (!query) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">${getMsg("search_hint", "Start typing to search your modules and assignments. Use @coursename to search a specific course, or @grades to open a course's grades page.")}</div>`;
        return [];
    }
    if (!index.length) {
        resultsEl.innerHTML = indexing
            ? `<div class="canvasrefined-gs-loading">${getMsg("search_building", "Building search index…")}</div>`
            : `<div class="canvasrefined-gs-hint">${getMsg("search_no_modules_found", "No modules or assignments found. Open the search again later if your courses are still loading.")}</div>`;
        return [];
    }

    // Hidden courses are filtered here (not at build time) so hiding a course never
    // needs an index rebuild.
    const hiddenCourseIds = gsHiddenCourseIds();

    // "@grades [filter]" lists grade pages instead. Checked before the @course
    // parse so a course actually named "Grades" isn't eaten.
    const gradesMatch = query.match(/(?:^|\s)@grades(?:\s+(.+))?$/i);
    if (gradesMatch) {
        const courseEntries = index.filter(entry => entry.kind === "course" && !hiddenCourseIds.has(String(entry.courseId)));
        const filter = (gradesMatch[1] || "").trim();
        const matching = courseEntries.filter(c => globalSearchCourseMatches(c, filter));
        if (!matching.length) {
            resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">${filter ? getMsg("search_no_course", "No course matches \"{{QUERY}}\".").replace("{{QUERY}}", escapeGlobalSearchHtml(filter)) : getMsg("search_no_courses_grades", "No courses found to open grades for.")}</div>`;
            return [];
        }
        const gradeRows = matching.map(c => ({
            kind: "grades",
            cls: "grades",
            type: gsKindLabel("grades"),
            title: c.title,
            course: c.course,
            courseCode: c.courseCode,
            courseId: c.courseId,
            url: `${domain}/courses/${c.courseId}/grades`
        }));
        resultsEl.innerHTML = gradeRows.map((item, i) => globalSearchRowHtml(item, i)).join("");
        bindGlobalSearchRows(resultsEl, gradeRows);
        return gradeRows;
    }

    // "@course name" narrows the search; a bare filter lists course homepages.
    const courseEntries = index.filter(entry => entry.kind === "course" && !hiddenCourseIds.has(String(entry.courseId)));
    const parsed = parseGlobalSearchCourseFilter(query, courseEntries);
    let effectiveQuery = query;
    let allowedCourseIds = null;
    if (parsed) {
        effectiveQuery = parsed.content;
        const matching = courseEntries.filter(c => globalSearchCourseMatches(c, parsed.courseFilter));
        allowedCourseIds = new Set(matching.map(c => String(c.courseId)));
        if (!effectiveQuery) {
            if (!matching.length) {
                resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">${getMsg("search_no_course", "No course matches \"{{QUERY}}\".").replace("{{QUERY}}", escapeGlobalSearchHtml(parsed.courseFilter))}</div>`;
                return [];
            }
            resultsEl.innerHTML = matching.map((item, i) => globalSearchRowHtml(item, i)).join("");
            bindGlobalSearchRows(resultsEl, matching);
            return matching;
        }
    }

    const q = effectiveQuery.toLowerCase();
    const matches = [];
    for (const item of index) {
        if (allowedCourseIds && !allowedCourseIds.has(String(item.courseId))) continue;
        if (hiddenCourseIds.has(String(item.courseId))) continue;
        let score = -1;
        const at = item._t.indexOf(q);
        if (at === 0) score = 100;
        else if (at > 0) score = 60 - at;
        else if (item._c.includes(q)) score = 20;
        if (score >= 0) {
            if (item.kind === "course" && at === 0) score += 40;
            item._score = score + (item._t === q ? 50 : 0);
            matches.push(item);
        }
    }
    matches.sort((a, b) => b._score - a._score);
    const top = matches.slice(0, 50);

    if (!top.length) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">${getMsg("search_no_match", "No results for \"{{QUERY}}\".").replace("{{QUERY}}", escapeGlobalSearchHtml(query))}${indexing ? `<br><span class="canvasrefined-gs-partial">${getMsg("search_partial", "Still indexing your courses…")}</span>` : ""}</div>`;
        return [];
    }

    resultsEl.innerHTML = top.map((item, i) => globalSearchRowHtml(item, i)).join("");
    bindGlobalSearchRows(resultsEl, top);
    return top;
}

// One pass over the card settings rather than an options lookup per index entry.
function gsHiddenCourseIds() {
    const hidden = new Set();
    const cards = options.custom_cards || {};
    for (const [courseId, card] of Object.entries(cards)) {
        if (card && card.hidden === true) hidden.add(String(courseId));
    }
    return hidden;
}

function escapeGlobalSearchHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function escapeGlobalSearchAttr(s) {
    return escapeGlobalSearchHtml(s).replace(/`/g, "&#96;");
}

function changeGradientCards() {
    // Inline per-hero gradient rather than index-based CSS: it always uses that
    // hero's current color, so it survives reordering and recoloring.
    const heroes = document.querySelectorAll('.ic-DashboardCard__header_hero');
    heroes.forEach(hero => {
        if (options.gradient_cards !== true) {
            hero.style.removeProperty("background-image");
            return;
        }
        const rgb = hero.style.backgroundColor;
        const parts = rgb.match(/\d+(\.\d+)?/g);
        if (!parts || parts.length < 3) return;
        const [r, g, b] = [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2])];
        let [h, s, l] = rgbToHsl(r, g, b);
        let degree = ((h % 60) / 60) >= .66 ? 30 : ((h % 60) / 60) <= .33 ? -30 : 15;
        let newh = h > 300 ? (360 - (h + 65)) + (65 + degree) : h + 65 + degree;
        hero.style.backgroundImage = `linear-gradient(115deg, hsl(${h}deg,${s}%,${l}%) 5%, hsl(${newh}deg,${s}%,${l}%) 100%)`;
    });

    const legacy = document.querySelector("#gradientcss");
    if (legacy) legacy.remove();
}

function showUpdateMsg() {
    const el = document.getElementById("announcementWrapper");
    if (!el) return;

    let div = document.getElementById("canvasrefined-update-msg");
    if (options.show_updates !== true || options.update_msg === "") {
        if (div) div.style.display = "none";
        return;
    } else if (div) {
        div.style.display = "flex";
        return;
    }

    div = makeElement("div", el, { "id": "canvasrefined-update-msg" });
    makeElement("p", div, { "textContent": options.update_msg });
    const close = makeElement("button", div, { "id": "canvasrefined-update-close", "textContent": "Close" });
    close.addEventListener("click", () => {
        readUpdate();
        div.remove();
    });
}

function readUpdate() {
    chrome.storage.sync.set({ "update_msg": "" });
}


function combineAssignments(data) {
    let combined = data;
    try {
        options.custom_assignments_overflow.forEach(overflow => {
            combined = combined.concat(options[overflow]);
        });
    } catch (e) {
        logError(e);
    }
    // Dedupe by planner item identity, keeping the LAST occurrence so locally
    // stored overflow entries win over fetched ones.
    if (Array.isArray(combined)) {
        const seen = new Set();
        const deduped = [];
        for (let i = combined.length - 1; i >= 0; i--) {
            const item = combined[i];
            if (!item) continue;
            const key = `${item.plannable_type}|${item.plannable_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }
        deduped.reverse();
        combined = deduped;
    }
    return combined.sort((a, b) => new Date(a.plannable_date).getTime() - new Date(b.plannable_date).getTime());
}

function cleanCustomAssignments() {
    chrome.storage.sync.get("custom_assignments_overflow", overflows => {
        chrome.storage.sync.get(overflows["custom_assignments_overflow"], storage => {
            const now = new Date();

            overflows["custom_assignments_overflow"].forEach(overflow => {
                let changed = false;
                for (let i = 0; i < storage[overflow].length; i++) {
                    let assignmentDate = new Date(storage[overflow][i].plannable_date);
                    if (!assignmentDate.getTime() || assignmentDate < now) {
                        storage[overflow].splice(i, 1);
                        changed = true;
                    }
                }
                if (changed) chrome.storage.sync.set({ [overflow]: storage[overflow] });
            });

        });
    });
}

function getGrades() {
    if (options.gpa_calc === true || options.dashboard_grades === true) {
        grades = getData(`${domain}/api/v1/courses?${/*enrollment_state=active&*/""}include[]=concluded&include[]=total_scores&include[]=computed_current_score&include[]=current_grading_period_scores&per_page=100`);
        if (options.gpa_calc === true) {
            grades.then(() => setupGPACalc()).catch(() => {});
        }
    }
}

function getColors() {
    if (options.tab_icons || options.better_todo || options.better_sidebar) {
        return getData(`${domain}/api/v1/users/self/colors`).then(data => {
            let cards = options.custom_cards_3;
            Object.keys(cards).forEach(key => {
                cards[key] = { ...cards[key], "color": data["custom_colors"]["course_" + key] ? data["custom_colors"]["course_" + key] : null };
            });
            chrome.storage.sync.set({ "custom_cards_3": cards });
            return cards;
        }).catch(e => {
            // Keep the stored colors on failure; don't leak an unhandled rejection.
            console.warn("Canvas Refined - could not load course colors", e);
            return options.custom_cards_3;
        });
    }
}

function changeFavicon() {
    if (options.tab_icons !== true) return;
    let match = current_page.match(/courses\/(?<id>\d*)/);
    if (match && match.groups.id && options.custom_cards_3[match.groups.id]?.color) {
        document.querySelector('link[rel="icon"').href = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="white" width="128px" height="128px" viewBox="-192 -192 2304.00 2304.00" stroke="white"><g stroke-width="0"><rect x="-192" y="-192" width="2304.00" height="2304.00" rx="0" fill="${options.custom_cards_3[match.groups.id].color.replace("#", "%23")}" strokewidth="0"/></g><g stroke-linecap="round" stroke-linejoin="round"/><g> <path d="M958.568 277.97C1100.42 277.97 1216.48 171.94 1233.67 34.3881 1146.27 12.8955 1054.57 0 958.568 0 864.001 0 770.867 12.8955 683.464 34.3881 700.658 171.94 816.718 277.97 958.568 277.97ZM35.8207 682.031C173.373 699.225 279.403 815.285 279.403 957.136 279.403 1098.99 173.373 1215.05 35.8207 1232.24 12.8953 1144.84 1.43262 1051.7 1.43262 957.136 1.43262 862.569 12.8953 769.434 35.8207 682.031ZM528.713 957.142C528.713 1005.41 489.581 1044.55 441.31 1044.55 393.038 1044.55 353.907 1005.41 353.907 957.142 353.907 908.871 393.038 869.74 441.31 869.74 489.581 869.74 528.713 908.871 528.713 957.142ZM1642.03 957.136C1642.03 1098.99 1748.06 1215.05 1885.61 1232.24 1908.54 1144.84 1920 1051.7 1920 957.136 1920 862.569 1908.54 769.434 1885.61 682.031 1748.06 699.225 1642.03 815.285 1642.03 957.136ZM1567.51 957.142C1567.51 1005.41 1528.38 1044.55 1480.11 1044.55 1431.84 1044.55 1392.71 1005.41 1392.71 957.142 1392.71 908.871 1431.84 869.74 1480.11 869.74 1528.38 869.74 1567.51 908.871 1567.51 957.142ZM958.568 1640.6C816.718 1640.6 700.658 1746.63 683.464 1884.18 770.867 1907.11 864.001 1918.57 958.568 1918.57 1053.14 1918.57 1146.27 1907.11 1233.67 1884.18 1216.48 1746.63 1100.42 1640.6 958.568 1640.6ZM1045.98 1480.11C1045.98 1528.38 1006.85 1567.51 958.575 1567.51 910.304 1567.51 871.172 1528.38 871.172 1480.11 871.172 1431.84 910.304 1392.71 958.575 1392.71 1006.85 1392.71 1045.98 1431.84 1045.98 1480.11ZM1045.98 439.877C1045.98 488.148 1006.85 527.28 958.575 527.28 910.304 527.28 871.172 488.148 871.172 439.877 871.172 391.606 910.304 352.474 958.575 352.474 1006.85 352.474 1045.98 391.606 1045.98 439.877ZM1441.44 1439.99C1341.15 1540.29 1333.98 1697.91 1418.52 1806.8 1579 1712.23 1713.68 1577.55 1806.82 1418.5 1699.35 1332.53 1541.74 1339.7 1441.44 1439.99ZM1414.21 1325.37C1414.21 1373.64 1375.08 1412.77 1326.8 1412.77 1278.53 1412.77 1239.4 1373.64 1239.4 1325.37 1239.4 1277.1 1278.53 1237.97 1326.8 1237.97 1375.08 1237.97 1414.21 1277.1 1414.21 1325.37ZM478.577 477.145C578.875 376.846 586.039 219.234 501.502 110.339 341.024 204.906 206.338 339.592 113.203 498.637 220.666 584.607 378.278 576.01 478.577 477.145ZM679.155 590.32C679.155 638.591 640.024 677.723 591.752 677.723 543.481 677.723 504.349 638.591 504.349 590.32 504.349 542.048 543.481 502.917 591.752 502.917 640.024 502.917 679.155 542.048 679.155 590.32ZM1440 475.712C1540.3 576.01 1697.91 583.174 1806.8 498.637 1712.24 338.159 1577.55 203.473 1418.51 110.339 1332.54 217.801 1341.13 375.413 1440 475.712ZM1414.21 590.32C1414.21 638.591 1375.08 677.723 1326.8 677.723 1278.53 677.723 1239.4 638.591 1239.4 590.32 1239.4 542.048 1278.53 502.917 1326.8 502.917 1375.08 502.917 1414.21 542.048 1414.21 590.32ZM477.145 1438.58C376.846 1338.28 219.234 1331.12 110.339 1415.65 204.906 1576.13 339.593 1710.82 498.637 1805.39 584.607 1696.49 577.443 1538.88 477.145 1438.58ZM679.155 1325.37C679.155 1373.64 640.024 1412.77 591.752 1412.77 543.481 1412.77 504.349 1373.64 504.349 1325.37 504.349 1277.1 543.481 1237.97 591.752 1237.97 640.024 1237.97 679.155 1277.1 679.155 1325.37Z"/></g></svg>`;
    }
}


function getAssignments() {
    if (options.assignments_due === true || options.better_todo === true) {
        assignments = loadPlannerItems();
        cardAssignments = preloadAssignmentEls();
        // setupBetterTodo bails rather than mounting a permanent empty shell while
        // data loads, so retry once it resolves (the dashboard may have gone quiet).
        assignments.then(() => setupBetterTodo());
    }
}

// ===================== Planner items (cached) =====================
// Cached in chrome.storage.local: instant load, a 14-day refresh window per page
// load, and a full 1-year lookback at most weekly while the tab is idle.
const PLANNER_CACHE_KEY = "planner_cache_v1";
const PLANNER_LOOKBACK_DAYS = 365;   // max history fetched from Canvas
const PLANNER_WINDOW_DAYS = 14;     // per-load "what changed" refresh window
const PLANNER_FULL_REFRESH_DAYS = 7; // min time between full lookback walks
// 50 pages × 100 items — a safety net against a malformed next link.
const PLANNER_MAX_PAGES = 50;

function plannerDateDaysAgo(days) {
    return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function plannerItemKey(item) {
    return `${item.plannable_type}|${item.plannable_id}`;
}

// ===================== Active-enrollment filter =====================
// The planner API excludes concluded *courses* but not items whose enrollment
// concluded (common at term boundaries), so filter by active enrollment ids.
// Returns null on failure so callers skip filtering instead of hiding everything.
async function fetchActiveCourseIds() {
    const ids = new Set();
    let url = `${domain}/api/v1/courses?enrollment_state=active&per_page=100`;
    for (let page = 0; page < 10 && url; page++) {
        let response;
        let data;
        try {
            response = await pageFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            data = await response.json();
        } catch (e) {
            return null;
        }
        if (!response.ok || !Array.isArray(data)) return null;
        for (const course of data) {
            if (course && course.id != null) ids.add(String(course.id));
        }
        url = getNextPageUrl(response.headers.get("Link"));
    }
    return ids;
}

// null courseIds = unknown (fetch failed), so no filtering; items with no course
// context (planner notes, groups) are always kept.
function filterPlannerItemsByActiveCourses(items, courseIds) {
    if (!courseIds) return items;
    const active = (courseIds instanceof Set) ? courseIds : new Set(courseIds.map(String));
    return items.filter(item => {
        const cid = item.course_id ?? (item.context_type === "course" ? item.context_id : null);
        return cid == null || active.has(String(cid));
    });
}

async function readPlannerCache() {
    try {
        const result = await chrome.storage.local.get(PLANNER_CACHE_KEY);
        const cache = result && result[PLANNER_CACHE_KEY];
        if (cache && Array.isArray(cache.items)) return cache;
    } catch (e) { /* storage unavailable; fall back to live fetch */ }
    return null;
}

function writePlannerCache(items, lastFullRefresh, activeCourseIds, minRefreshedAt = 0) {
    try {
        // Cross-tab guard: never overwrite a cache newer than our snapshot.
        chrome.storage.local.get(PLANNER_CACHE_KEY, result => {
            try {
                const current = result && result[PLANNER_CACHE_KEY];
                if (current && ((current.refreshedAt || 0) > minRefreshedAt)) return;
                const p = chrome.storage.local.set({ [PLANNER_CACHE_KEY]: { items, lastFullRefresh, activeCourseIds, refreshedAt: Date.now() } });
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (e) { /* cache write failure is non-fatal */ }
        });
    } catch (e) { /* cache write failure is non-fatal */ }
}

// Pages through /api/v1/planner/items from `startDate`. Returns null when the
// fetch failed — callers must treat null as "unknown", never as "no items".
async function fetchPlannerItemsSince(startDate) {
    const allItems = [];
    let url = `${domain}/api/v1/planner/items?start_date=${startDate}&per_page=100`;
    for (let page = 0; page < PLANNER_MAX_PAGES && url; page++) {
        let response;
        let data;
        try {
            response = await pageFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            data = await response.json();
        } catch (e) {
            return null;
        }
        if (!response.ok || !Array.isArray(data)) return null;
        try {
            allItems.push(...JSON.parse(JSON.stringify(data)));
        } catch (_) {
            allItems.push(...data);
        }
        url = getNextPageUrl(response.headers.get("Link"));
    }
    return allItems;
}

// Cached items inside the window are replaced wholesale; older ones are kept.
function mergePlannerItems(cached, fetched, windowStartMs) {
    const byKey = new Map();
    for (const item of cached) {
        const due = new Date(item.plannable_date).getTime();
        if (due >= windowStartMs) continue; // superseded by the fresh fetch
        byKey.set(plannerItemKey(item), item);
    }
    for (const item of fetched) byKey.set(plannerItemKey(item), item);
    return sortAndTrimPlannerItems([...byKey.values()]);
}

// Trim to the lookback, dedupe by item identity and sort by due date, so every
// cache-write path is idempotent.
function sortAndTrimPlannerItems(items) {
    const cutoff = Date.now() - PLANNER_LOOKBACK_DAYS * 86400000;
    // Last occurrence per key wins: Canvas returns items oldest-first.
    const byKey = new Map();
    for (const item of items) {
        if (new Date(item.plannable_date).getTime() < cutoff) continue;
        byKey.set(plannerItemKey(item), item);
    }
    const trimmed = [...byKey.values()];
    trimmed.sort((a, b) => new Date(a.plannable_date) - new Date(b.plannable_date));
    return trimmed;
}

// Cheap change signature so consumers only re-render on real changes.
function plannerFingerprint(items) {
    return items.map(item =>
        `${plannerItemKey(item)}:${item.plannable_date}:${item.submissions?.submitted ? 1 : 0}:${item.submissions?.graded ? 1 : 0}:${item.planner_override?.marked_complete ? 1 : 0}:${item.plannable?.read_state ?? ""}`
    ).join("|");
}

// Cache first; on first run a single bounded (1-year) fetch is on the critical
// path. Items are always limited to the active courses.
async function loadPlannerItems() {
    const cache = await readPlannerCache();
    if (cache) {
        schedulePlannerRefresh(cache);
        return filterPlannerItemsByActiveCourses(cache.items, cache.activeCourseIds);
    }
    // First run: fetch the lookback and the enrollment list in parallel, then
    // cache. A failed fetch caches nothing, so the next load retries.
    const [items, courseIds] = await Promise.all([
        fetchPlannerItemsSince(plannerDateDaysAgo(PLANNER_LOOKBACK_DAYS)),
        fetchActiveCourseIds(),
    ]);
    if (items === null) return [];
    const filtered = filterPlannerItemsByActiveCourses(
        sortAndTrimPlannerItems(items), courseIds
    );
    writePlannerCache(filtered, Date.now(), courseIds ? [...courseIds] : null);
    return filtered;
}

// Recent-window refresh on every load, a full lookback walk at most weekly, and
// the enrollment list refreshed each pass. Runs while the tab is idle.
function schedulePlannerRefresh(cache) {
    const fullRefreshDue = !cache.lastFullRefresh ||
        (Date.now() - cache.lastFullRefresh > PLANNER_FULL_REFRESH_DAYS * 86400000);
    // One refresh at a time: concurrent runs (other tabs, Add-Task) could let a
    // slow stale run overwrite a newer write.
    if (plannerRefreshRunning) return;
    const run = async () => {
        if (plannerRefreshRunning) return;
        plannerRefreshRunning = true;
        try {
            const before = plannerFingerprint(
                filterPlannerItemsByActiveCourses(cache.items, cache.activeCourseIds)
            );
            const courseIds = await fetchActiveCourseIds();
            const active = courseIds ?? (cache.activeCourseIds ?? null);
            const idsToStore = courseIds ? [...courseIds] : (cache.activeCourseIds ?? null);
            let merged;
            if (fullRefreshDue) {
                const fetched = await fetchPlannerItemsSince(plannerDateDaysAgo(PLANNER_LOOKBACK_DAYS));
                // Fetch failed: keep the cache untouched and retry next load.
                if (fetched === null) return;
                merged = filterPlannerItemsByActiveCourses(
                    sortAndTrimPlannerItems(fetched),
                    active
                );
                writePlannerCache(merged, Date.now(), idsToStore, cache.refreshedAt || 0);
            } else {
                const windowStart = plannerDateDaysAgo(PLANNER_WINDOW_DAYS);
                const fetched = await fetchPlannerItemsSince(windowStart);
                // Fetch failed: merging would delete the last two weeks from the cache.
                if (fetched === null) return;
                merged = filterPlannerItemsByActiveCourses(
                    // Threshold at the window start's LOCAL midnight: Canvas reads
                    // start_date in the user's timezone, so a UTC threshold deleted items.
                    mergePlannerItems(cache.items, fetched, Date.parse(windowStart + "T00:00:00")),
                    active
                );
                writePlannerCache(merged, cache.lastFullRefresh, idsToStore, cache.refreshedAt || 0);
            }
            if (plannerFingerprint(merged) !== before) refreshPlannerConsumers(merged);
        } catch (e) {
            console.warn("planner refresh failed", e);
        } finally {
            plannerRefreshRunning = false;
        }
    };
    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => run(), { timeout: 20000 });
    } else {
        setTimeout(run, 5000);
    }
}

// Re-render every planner consumer after a background refresh.
function refreshPlannerConsumers(items) {
    assignments = Promise.resolve(items);
    updateReminders();
    if (options.assignments_due === true || options.better_todo === true) {
        cardAssignments = preloadAssignmentEls();
        loadCardAssignments();
    }
    if (options.better_todo && document.getElementById("better-todo-main")) {
        moreAnnouncementCount = 0;
        moreAssignmentCount = 0;
        moreCompletedCount = 0;
        clearTodoList();
        createTodoSections(document.querySelector("#canvasrefined-todo-list"));
    }
}

function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
}

// ===================== Grade Analytics =====================
// Grades-page panel: score doughnut, grade-over-time line, GitHub-style heatmap
// and a final-grade calculator, all hand-drawn on <canvas> from the page's data.

const GA_BUCKETS = [
    { label: "90+",   min: 90, max: Infinity, color: "#16a34a" },
    { label: "80-89", min: 80, max: 90,       color: "#4ade80" },
    { label: "70-79", min: 70, max: 80,       color: "#facc15" },
    { label: "60-69", min: 60, max: 70,       color: "#fb923c" },
    { label: "50-59", min: 50, max: 60,       color: "#f87171" },
    { label: "40-49", min: 40, max: 50,       color: "#ef4444" },
    { label: "30-39", min: 30, max: 40,       color: "#dc2626" },
    { label: "20-29", min: 20, max: 30,       color: "#b91c1c" },
    { label: "10-19", min: 10, max: 20,       color: "#991b1b" },
    { label: "0-9",   min: 0,  max: 10,       color: "#7f1d1d" },
];
const GA_UNGRADED_COLOR = "#6b7280";
// 20 five-percent bands sampled at their lower edge, so each decade starts on its
// pure bucket color (a 70 is exactly yellow).
const GA_ZONE_COLORS = (() => {
    const stops = GA_BUCKETS.slice().reverse(); // 0-9 (dark red) → 90+ (green)
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    return Array.from({ length: 20 }, (_, i) => {
        const m = i * 5; // band's lower edge, e.g. 70
        const k = Math.min(stops.length - 1, Math.floor(m / 10));
        if (k >= stops.length - 1) return stops[stops.length - 1].color;
        const t = (m - k * 10) / 10;
        const c1 = rgb(stops[k].color), c2 = rgb(stops[k + 1].color);
        return `rgb(${lerp(c1[0], c2[0], t)},${lerp(c1[1], c2[1], t)},${lerp(c1[2], c2[2], t)})`;
    });
})();
const GA_OPEN_KEY = "grade_analytics_open";

async function getGradeAnalyticsOpenState() {
    const result = await chrome.storage.local.get(GA_OPEN_KEY);
    return result[GA_OPEN_KEY] ?? true;
}

function setGradeAnalyticsOpenState(open) {
    chrome.storage.local.set({ [GA_OPEN_KEY]: open });
}

const GA_FIT_Y_KEY = "grade_analytics_fit_y";

async function getGradeAnalyticsFitY() {
    const result = await chrome.storage.local.get(GA_FIT_Y_KEY);
    return result[GA_FIT_Y_KEY] ?? false;
}

function setGradeAnalyticsFitY(fit) {
    chrome.storage.local.set({ [GA_FIT_Y_KEY]: fit });
}

// Final-grade calculator settings per course: { weight, target, show }. The needed
// score is always recomputed, never stored.
const GA_CALC_PREFIX = "grade_analytics_final_";

function gaCalcStorageKey(courseId) {
    return GA_CALC_PREFIX + courseId;
}

async function getGaCalcSettings(courseId) {
    const empty = { weight: null, target: null, show: false };
    if (courseId == null) return empty;
    const key = gaCalcStorageKey(courseId);
    const result = await chrome.storage.local.get(key);
    const v = result[key];
    return v && typeof v === "object" ? v : empty;
}

function saveGaCalcSettings() {
    const courseId = getCurrentCourseId();
    if (courseId == null || !gaCalc) return;
    chrome.storage.local.set({ [gaCalcStorageKey(courseId)]: gaCalc });
}

let gaObserver = null;
let gaOpen = false;          // panel open on this page view
let gaFitY = false;         // scale the line chart Y axis to fit the data
let gaImagineIf = false;    // per page view only
let gaScenario = null;      // imagine-if working copy of groups + assignments
let gaIfCounter = 0;         // unique ids for user-added groups/assignments
let gaOriginalFinalHtml = null; // Total row's original grade span innerHTML, for restore
let gaTab = "overview";     // active panel tab: "overview" | "calc" | "heatmap"
let gaCalc = null;           // final-grade calculator settings for this course
let gaCourseId = null;       // course whose data is cached
let gaData = null;           // computed data for the current course
let gaLoading = false;
let gaChartObserver = null;  // ResizeObserver: redraw once the charts have a size

function gradeAnalyticsActive() {
    return options.grade_analytics === true && isGradesPage() && !quizSafeModeActive();
}

// Data is read from the #grades_summary table the page already rendered: instant
// even for huge courses, and always matching what the user sees.
function gaWaitForGradesTable(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const ready = () => {
            const table = document.querySelector("#grades_summary");
            return table && table.querySelector("tr.student_assignment") ? table : null;
        };
        const found = ready();
        if (found) { resolve(found); return; }
        const started = Date.now();
        const timer = setInterval(() => {
            const table = ready();
            if (table) { clearInterval(timer); resolve(table); }
            else if (Date.now() - started > timeoutMs) {
                clearInterval(timer);
                reject(new Error("grades table not found on this page"));
            }
        }, 250);
    });
}

function watchGradeAnalytics() {
    if (!gradeAnalyticsActive()) {
        removeGradeAnalyticsPanel();
        if (gaObserver) { gaObserver.disconnect(); gaObserver = null; }
        return;
    }
    // SPA navigation to another course: drop the previous course's data.
    const courseId = getCurrentCourseId();
    if (gaCourseId !== null && gaCourseId !== courseId) {
        gaData = null;
        gaCourseId = null;
        gaCalc = null; // per-course final-calculator settings
        removeGradeAnalyticsPanel();
    }
    if (!gaObserver) {
        // Canvas re-renders the nav and content on SPA navigation; keep the panel placed.
        gaObserver = new MutationObserver(() => scheduleGradeAnalyticsSync());
        gaObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    scheduleGradeAnalyticsSync();
    // Restore the stored open/Y-axis/calculator state, then place the panel.
    Promise.all([getGradeAnalyticsOpenState(), getGradeAnalyticsFitY(), getGaCalcSettings(courseId)]).then(([open, fit, calc]) => {
        gaOpen = open;
        gaFitY = fit;
        gaCalc = calc;
        const panel = ensureGradeAnalyticsPanel();
        if (panel) applyGaCalcState(panel);
        if (gaOpen && gaData) renderGradeAnalytics();
    });
    if (!gaData && !gaLoading) loadGradeAnalytics();
}

let gaSyncRaf = null;
function scheduleGradeAnalyticsSync() {
    if (gaSyncRaf) return;
    gaSyncRaf = requestAnimationFrame(() => {
        gaSyncRaf = null;
        syncGradeAnalyticsUI();
    });
}

function syncGradeAnalyticsUI() {
    if (!gradeAnalyticsActive()) return;
    const panel = ensureGradeAnalyticsPanel();
    if (!panel) return;
    // Canvas re-renders can wipe the overwritten Total — reapply it.
    if (gaImagineIf) {
        gaRenderImagineIf();
        gaApplyImagineTotal();
    }
    // A 0-width canvas means "never drawn" (panel was hidden or unsized), so
    // redraw now that layout is real.
    if (gaOpen && gaData) {
        const pie = panel.querySelector("#canvasrefined-ga-pie");
        const line = panel.querySelector("#canvasrefined-ga-line");
        if ((pie && pie.width === 0) || (line && line.width === 0)) {
            renderGradeAnalytics();
        }
    }
}

function removeGradeAnalyticsPanel() {
    gaOpen = false;
    if (gaChartObserver) { gaChartObserver.disconnect(); gaChartObserver = null; }
    gaClearImagineUI();
    gaRestoreImagineTotal();
    document.getElementById("canvasrefined-grade-analytics")?.remove();
}

// Applies the in-memory open state; creation can beat the storage read.
function applyGradeAnalyticsOpenState(panel) {
    const body = panel.querySelector("#canvasrefined-ga-body");
    const btn = panel.querySelector("#canvasrefined-ga-toggle");
    if (!body || !btn) return;
    body.style.display = gaOpen ? "" : "none";
    const svg = btn.querySelector("svg");
    if (svg) svg.style.transform = gaOpen ? "rotate(180deg)" : "rotate(0deg)";
    btn.setAttribute("aria-expanded", String(gaOpen));
}

function applyGradeAnalyticsImagineState(panel) {
    const btn = panel.querySelector("#canvasrefined-ga-imagine");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(gaImagineIf));
    btn.style.borderColor = gaImagineIf ? "#2563eb" : "var(--bcborders)";
    btn.style.color = gaImagineIf ? "#2563eb" : "var(--bctext-0)";
    btn.style.fontWeight = gaImagineIf ? "600" : "";
}

// Injected right below the "Print Grades" header; null until that anchor renders.
function ensureGradeAnalyticsPanel() {
    let panel = document.getElementById("canvasrefined-grade-analytics");
    const anchor = document.getElementById("print-grades-container");
    if (panel && panel.isConnected) {
        // Canvas re-renders can move the anchor — keep the panel right after it.
        if (anchor && panel.previousElementSibling !== anchor) {
            anchor.insertAdjacentElement("afterend", panel);
        }
        applyGradeAnalyticsOpenState(panel);
        applyGradeAnalyticsImagineState(panel);
        return panel;
    }
    const container = anchor || findContentContainer();
    if (!container) return null;
    panel = document.createElement("div");
    panel.id = "canvasrefined-grade-analytics";
    if (anchor) {
        anchor.insertAdjacentElement("afterend", panel);
    } else {
        container.insertBefore(panel, container.firstChild);
    }
    panel.style.cssText = `margin:18px 0;padding:16px;border:1px solid color-mix(in srgb, var(--bcborders) 75%, transparent);border-radius:10px;background-color:var(--bcbackground-0);color:var(--bctext-0);font-family:"Lato","Helvetica Neue",Helvetica,Arial,sans-serif;box-sizing:border-box;`;
    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <h2 style="margin:0;font-size:18px;color:var(--bctext-0);">${getMsg("grade_analytics", "Grade Analytics")}</h2>
            <button id="canvasrefined-ga-imagine" type="button" aria-pressed="false" title="${getMsg("imagine_if_toggle", "Toggle Imagine-If mode")}" style="margin-left:auto;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:8px;padding:4px 12px;font-size:14px;line-height:1.4;cursor:pointer;">${getMsg("imagine_if_mode", "Imagine-If mode")}</button>
            <button id="canvasrefined-ga-toggle" type="button" aria-expanded="true" title="${getMsg("grade_analytics_toggle", "Toggle Grade Analytics")}" style="background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:8px;padding:4px 12px;font-size:14px;line-height:1.4;cursor:pointer;"><svg style="transform:rotate(180deg);display:block;" fill="currentColor" width="16px" height="16px" viewBox="-6.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.6"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="M18.813 11.406l-7.906 9.906c-0.75 0.906-1.906 0.906-2.625 0l-7.906-9.906c-0.75-0.938-0.375-1.656 0.781-1.656h16.875c1.188 0 1.531 0.719 0.781 1.656z"/></svg></button>
        </div>
        <div id="canvasrefined-ga-body">
        <p id="canvasrefined-ga-status" style="margin:0 0 10px;color:var(--bctext-1);font-size:13px;">${getMsg("reading_grade_data", "Reading grade data…")}</p>
        <div id="canvasrefined-ga-tabs" style="display:flex;gap:4px;border-bottom:1px solid color-mix(in srgb, var(--bcborders) 75%, transparent);margin-bottom:14px;">
            <button type="button" data-ga-tab="overview" style="${gaTabStyle(true)}">${getMsg("ga_tab_overview", "Overview")}</button>
            <button type="button" data-ga-tab="calc" style="${gaTabStyle(false)}">${getMsg("ga_tab_calc", "Final Calculator")}</button>
            <button type="button" data-ga-tab="heatmap" style="${gaTabStyle(false)}">${getMsg("ga_tab_heatmap", "Heatmap")}</button>
        </div>
        <div id="canvasrefined-ga-tab-overview">
        <div id="canvasrefined-ga-stats" style="display:none;flex-wrap:wrap;gap:10px;margin-bottom:14px;"></div>
        <div id="canvasrefined-ga-charts" style="display:none;gap:24px;flex-wrap:wrap;">
            <div id="canvasrefined-ga-box-pie" style="flex:1 1 calc(33.333% - 8px);min-width:0;">
                <h3 style="margin:0 0 8px;font-size:14px;color:var(--bctext-0);">${getMsg("ga_pie_title", "Score distribution (graded assignments)")}</h3>
                <div style="position:relative;height:280px;"><canvas id="canvasrefined-ga-pie"></canvas><div id="canvasrefined-ga-pie-tip" style="position:absolute;display:none;pointer-events:none;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:6px;padding:6px 10px;font-size:12px;z-index:10;white-space:nowrap;"></div></div>
            </div>
            <div id="canvasrefined-ga-box-line" style="flex:1 1 calc(66.666% - 16px);min-width:0;">
                <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;">
                    <h3 style="margin:0;font-size:14px;color:var(--bctext-0);">${getMsg("ga_line_title", "Overall grade over time")}</h3>
                    <label for="canvasrefined-ga-fity" style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--bctext-1);cursor:pointer;user-select:none;"><input type="checkbox" id="canvasrefined-ga-fity"> ${getMsg("ga_fit_y", "Fit Y axis")}</label>
                </div>
                <div style="position:relative;height:280px;"><canvas id="canvasrefined-ga-line"></canvas><div id="canvasrefined-ga-line-tip" style="position:absolute;display:none;pointer-events:none;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:6px;padding:8px 10px;font-size:12px;z-index:20;max-width:260px;box-shadow:0 4px 14px rgba(0,0,0,0.25);"></div></div>
            </div>
        </div>
        </div>
        <div id="canvasrefined-ga-tab-calc" style="display:none;">
            <div style="max-width:620px;">
                <p style="margin:0 0 14px;color:var(--bctext-1);font-size:13px;">${getMsg("ga_calc_desc", "Enter how much your final is worth and the overall grade you want to show see what grade you need on the final.")}</p>
                <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
                    <label style="flex:1 1 200px;font-size:12px;color:var(--bctext-1);">${getMsg("ga_final_weight", "Final exam weight (% of grade)")}
                        <input id="canvasrefined-ga-calc-weight" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="20" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:15px;">
                    </label>
                    <label style="flex:1 1 200px;font-size:12px;color:var(--bctext-1);">${getMsg("ga_target_grade", "Target overall grade (%)")}
                        <input id="canvasrefined-ga-calc-target" type="number" min="0" step="0.1" inputmode="decimal" placeholder="90" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:15px;">
                    </label>
                </div>
                <label for="canvasrefined-ga-calc-show" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--bctext-0);cursor:pointer;user-select:none;margin-bottom:14px;"><input type="checkbox" id="canvasrefined-ga-calc-show"> ${getMsg("ga_show_goal", "Show grade goal on the overview")}</label>
                <div id="canvasrefined-ga-calc-result" style="padding:12px 16px;border-radius:8px;background:var(--bcbackground-1);border:1px solid color-mix(in srgb, var(--bcborders) 75%, transparent);font-size:14px;"></div>
            </div>
        </div>
        <div id="canvasrefined-ga-tab-heatmap" style="display:none;position:relative;">
            <div style="overflow-x:auto;max-width:100%;padding:2px 2px 6px;">
                <div id="canvasrefined-ga-heatmap-grid" style="display:inline-flex;gap:4px;"></div>
            </div>
            <div id="canvasrefined-ga-heatmap-note" style="margin:0;color:var(--bctext-1);font-size:12px;"></div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;color:var(--bctext-1);">
                <span>0%</span>
                <span style="width:11px;height:11px;border-radius:3px;display:inline-block;background:${GA_ZONE_COLORS[0]};"></span>
                <span style="width:11px;height:11px;border-radius:3px;display:inline-block;background:${GA_ZONE_COLORS[5]};"></span>
                <span style="width:11px;height:11px;border-radius:3px;display:inline-block;background:${GA_ZONE_COLORS[10]};"></span>
                <span style="width:11px;height:11px;border-radius:3px;display:inline-block;background:${GA_ZONE_COLORS[15]};"></span>
                <span style="width:11px;height:11px;border-radius:3px;display:inline-block;background:${GA_ZONE_COLORS[19]};"></span>
                <span>100%</span>
                <span style="margin-left:12px;display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;display:inline-block;background:color-mix(in srgb, var(--bctext-1) 20%, transparent);"></span>${getMsg("ga_no_grade_legend", "No grade/assignment")}</span>
            </div>
            <style>#canvasrefined-grade-analytics .canvasrefined-ga-hcell:hover{outline:1px solid var(--bctext-0);outline-offset:1px;}</style>
            <div id="canvasrefined-ga-heatmap-tip" style="position:absolute;display:none;pointer-events:none;z-index:100;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:6px;padding:6px 10px;font-size:12px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,0.25);"></div>
        </div>
        </div>
    `;
    const toggleBtn = panel.querySelector("#canvasrefined-ga-toggle");
    const imagineBtn = panel.querySelector("#canvasrefined-ga-imagine");
    const fitYCheckbox = panel.querySelector("#canvasrefined-ga-fity");
    const applyOpenState = () => applyGradeAnalyticsOpenState(panel);
    toggleBtn.addEventListener("click", () => {
        gaOpen = !gaOpen;
        setGradeAnalyticsOpenState(gaOpen);
        applyOpenState();
        if (gaOpen && gaData) renderGradeAnalytics();
    });
    // Imagine-If toggle: per page view only, never persisted.
    imagineBtn.addEventListener("click", () => {
        gaImagineIf = !gaImagineIf;
        applyGradeAnalyticsImagineState(panel);
        if (gaImagineIf) gaEnterImagineIf();
        else gaExitImagineIf();
    });
    // Fit Y axis: remembered across pages via chrome.storage.
    fitYCheckbox.checked = gaFitY;
    fitYCheckbox.addEventListener("change", () => {
        gaFitY = fitYCheckbox.checked;
        setGradeAnalyticsFitY(gaFitY);
        if (gaData) {
            gaDrawLine(panel.querySelector("#canvasrefined-ga-line"), panel.querySelector("#canvasrefined-ga-line-tip"));
        }
    });
    panel.querySelectorAll("[data-ga-tab]").forEach(btn => {
        btn.addEventListener("click", () => gaSetTab(btn.dataset.gaTab));
    });
    // Calculator inputs persist per course and recompute on every change.
    const calcWeight = panel.querySelector("#canvasrefined-ga-calc-weight");
    const calcTarget = panel.querySelector("#canvasrefined-ga-calc-target");
    const calcShow = panel.querySelector("#canvasrefined-ga-calc-show");
    const onCalcInput = () => {
        gaCalc = gaCalc || { weight: null, target: null, show: false };
        const w = parseFloat(calcWeight.value);
        const t = parseFloat(calcTarget.value);
        gaCalc.weight = isFinite(w) ? Math.min(100, Math.max(0, w)) : null;
        gaCalc.target = isFinite(t) ? Math.max(0, t) : null;
        gaCalc.show = calcShow.checked;
        saveGaCalcSettings();
        renderGaCalculator();
        renderGaStats();
    };
    calcWeight.addEventListener("input", onCalcInput);
    calcTarget.addEventListener("input", onCalcInput);
    calcShow.addEventListener("change", onCalcInput);
    applyGaCalcState(panel);
    applyGradeAnalyticsImagineState(panel);
    applyOpenState();
    if (gaOpen && gaData) renderGradeAnalytics();
    // Redraw charts whose boxes had no size when the render ran.
    if (gaChartObserver) gaChartObserver.disconnect();
    gaChartObserver = new ResizeObserver(() => {
        if (!gaOpen || !gaData) return;
        const pie = panel.querySelector("#canvasrefined-ga-pie");
        const line = panel.querySelector("#canvasrefined-ga-line");
        if ((pie && pie.width === 0) || (line && line.width === 0)) renderGradeAnalytics();
    });
    gaChartObserver.observe(panel.querySelector("#canvasrefined-ga-pie").parentNode);
    gaChartObserver.observe(panel.querySelector("#canvasrefined-ga-line").parentNode);
    return panel;
}

async function loadGradeAnalytics() {
    const courseId = getCurrentCourseId();
    if (courseId == null) return;
    gaLoading = true;
    const status = document.getElementById("canvasrefined-ga-status");
    if (status) status.textContent = chrome.i18n.getMessage("reading_grade_data") || "Reading grade data…";
    try {
        const table = await gaWaitForGradesTable();
        gaCourseId = courseId;
        gaData = computeGradeAnalyticsFromPage(table);
        gaLoading = false;
        renderGradeAnalytics();
    } catch (err) {
        logError(err);
        const s = document.getElementById("canvasrefined-ga-status");
        if (s) s.textContent = (chrome.i18n.getMessage("grade_analytics_failed") || "Grade Analytics failed to load: {{ERROR}}").replace("{{ERROR}}", err && err.message ? err.message : err);
    } finally {
        gaLoading = false;
    }
}

// One assignment row of #grades_summary. The hidden original_score span holds the
// posted score; points possible only appears in the "/ 15" span after the grade.
const GA_MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Parses "Sep 12", "Sep 12 at 11:59pm" or "Sep 12, 2024 …" → { mon, day, minutes }.
function gaParseDueDate(due) {
    const m = String(due || "").toLowerCase().match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:[^\d]+\d{4})?(?:[^\d]{0,8}?(\d{1,2}):(\d{2})\s*(am|pm)?)?/);
    if (!m) return null;
    const mon = GA_MONTH_NAMES.indexOf(m[1]);
    if (mon < 0) return null;
    const day = parseInt(m[2], 10);
    if (!isFinite(day) || day < 1 || day > 31) return null;
    let minutes = 0;
    if (m[3] !== undefined) {
        let h = parseInt(m[3], 10);
        minutes = h * 60 + parseInt(m[4], 10);
        if (m[5] === "pm" && h < 12) minutes += 720;
        if (m[5] === "am" && h === 12) minutes = parseInt(m[4], 10);
    }
    return { mon, day, minutes };
}

function gaParseNum(t) {
    if (!t) return null;
    let s = String(t).replace(/\s+/g, "");
    if (s === "" || !/\d/.test(s)) return null;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
}

function gaParseAssignmentRow(tr) {
    const q = (sel) => tr.querySelector(sel);
    const titleLink = q(".title a");
    const possibleText = q(".tooltip .grade + span")?.textContent || "";
    return {
        title: (titleLink ? titleLink.textContent : (q("th.title")?.textContent || "")).trim(),
        score: gaParseNum(q(".original_score")?.textContent),
        points: gaParseNum(possibleText.replace(/^.*\//, "")),
        status: (q(".submission_status")?.textContent || "").trim(),
        gid: (q(".assignment_group_id")?.textContent || "").trim(),
        due: (q("td.due")?.textContent || "").replace(/\s+/g, " ").trim(),
        dueTitle: q("td.due [title]")?.getAttribute("title") || q("td.due")?.getAttribute("title") || "",
    };
}

function computeGradeAnalyticsFromPage(table) {
    // Group weights come from the "group total" summary rows.
    const groupWeight = {};
    for (const tr of table.querySelectorAll("tr.group_total")) {
        const gid = tr.querySelector(".assignment_group_id")?.textContent.trim();
        const w = parseFloat((tr.querySelector(".group_weight")?.textContent || "").trim());
        if (gid) groupWeight[gid] = isFinite(w) ? w : 0;
    }
    const totalWeight = Object.values(groupWeight).reduce((s, w) => s + w, 0);

    // Use the page's own Total so the stat always matches.
    let pageTotal = null;
    const totalText = table.querySelector("tr.final_grade .grade")?.textContent || "";
    const totalMatch = totalText.match(/-?\d+(?:\.\d+)?/);
    if (totalMatch) pageTotal = parseFloat(totalMatch[0]);

    const rows = [...table.querySelectorAll("tr.student_assignment")]
        .filter(tr => !tr.classList.contains("group_total") && !tr.classList.contains("final_grade"))
        .map(gaParseAssignmentRow);

    const counts = GA_BUCKETS.map(() => 0);
    let ungraded = 0;
    const graded = [];
    for (const a of rows) {
        if (a.points == null || a.points <= 0) continue; // no points possible
        if (a.score == null) { ungraded++; continue; }    // unposted / unsubmitted
        graded.push(a);
        const pct = (a.score / a.points) * 100;
        const idx = GA_BUCKETS.findIndex(b => pct >= b.min && pct < b.max);
        counts[idx >= 0 ? idx : GA_BUCKETS.length - 1]++;
    }

    // Sort graded work by due date for the timeline. Due strings have no year, so
    // each rotation r maps a month to (mon - r) mod 12; the rotation with the least
    // backward drift in row order wins, and undated rows inherit a neighbour's key.
    const parsed = graded.map(a => gaParseDueDate(a.dueTitle || a.due));
    const rotationCost = (r) => {
        let cost = 0, prev = null;
        for (const d of parsed) {
            if (!d) continue;
            const k = (d.mon - r + 12) % 12;
            if (prev != null && k < prev) cost += prev - k;
            prev = k;
        }
        return cost;
    };
    let bestRotation = 0, bestCost = Infinity;
    for (let r = 0; r < 12; r++) {
        const cost = rotationCost(r);
        if (cost < bestCost) { bestCost = cost; bestRotation = r; }
    }
    const firstDated = parsed.find(d => d);
    if (firstDated) {
        const pref = firstDated.mon;
        for (let r = 0; r < 12; r++) {
            if (rotationCost(r) === bestCost && r === pref) { bestRotation = r; break; }
        }
    }
    const keys = parsed.map(d => d ? [(d.mon - bestRotation + 12) % 12, d.day, d.minutes] : null);
    let lastKey = null;
    for (let i = 0; i < keys.length; i++) { if (keys[i] == null) keys[i] = lastKey; else lastKey = keys[i]; }
    let nextKey = null;
    for (let i = keys.length - 1; i >= 0; i--) { if (keys[i] == null) keys[i] = nextKey; else nextKey = keys[i]; }
    const order = graded.map((_, i) => i).sort((x, y) => {
        const kx = keys[x], ky = keys[y];
        if (!kx || !ky) return x - y;
        for (let j = 0; j < 3; j++) if (kx[j] !== ky[j]) return kx[j] - ky[j];
        return x - y;
    });
    const sortedGraded = order.map(i => graded[i]);
    graded.length = 0;
    graded.push(...sortedGraded);

    // Running grade per Canvas's GradeCalculator: Σ(group pct × weight) over graded
    // groups, scaled to 100% when those weights total < 100. Points-based courses
    // use earned / possible.
    const running = {};
    const pointsGrade = () => {
        let s = 0, p = 0;
        for (const g of Object.values(running)) { s += g.score; p += g.pts; }
        return p > 0 ? (s / p) * 100 : null;
    };
    const points = graded.map(a => {
        const r = (running[a.gid] ||= { score: 0, pts: 0 });
        r.score += a.score;
        r.pts += a.points;
        let grade = null;
        if (totalWeight > 0) {
            let weighted = 0, fullWeight = 0;
            for (const gid of Object.keys(running)) {
                const g = running[gid];
                if (g.pts <= 0) continue;
                const w = groupWeight[gid] || 0;
                weighted += (g.score / g.pts) * w;
                fullWeight += w;
            }
            // Only zero-weighted groups have work — fall back to points.
            grade = fullWeight > 0 ? (fullWeight < 100 ? (weighted / fullWeight) * 100 : weighted) : pointsGrade();
        } else {
            grade = pointsGrade();
        }
        return {
            title: a.title,
            score: a.score,
            points: a.points,
            pct: (a.score / a.points) * 100,
            grade,
            due: a.due,
        };
    });

    const pcts = graded.map(a => (a.score / a.points) * 100);
    // Change in the running grade over the last 5 graded assignments.
    let trend = null;
    if (points.length >= 2) {
        const from = points[Math.max(0, points.length - 1 - 5)].grade;
        const to = points[points.length - 1].grade;
        if (from != null && to != null) trend = to - from;
    }
    return {
        counts,
        ungraded,
        graded: graded.length,
        avg: pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null,
        current: pageTotal != null ? pageTotal : (points.length ? points[points.length - 1].grade : null),
        trend,
        points,
    };
}

// Overview stat cards; the "Grade goal" card follows the calculator's show flag.
function renderGaStats() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel || !gaData) return;
    const stats = panel.querySelector("#canvasrefined-ga-stats");
    if (!stats) return;
    stats.style.display = "flex";
    const stat = (cap, val, color) =>
        `<div style="padding:8px 14px;border-radius:8px;background:var(--bcbackground-1);"><div style="font-size:18px;font-weight:700;color:${color || "var(--bctext-0)"};">${val}</div><div style="font-size:11px;text-transform:uppercase;color:var(--bctext-1);">${cap}</div></div>`;
    let trendVal = "-", trendColor = "var(--bctext-0)";
    if (gaData.trend != null) {
        if (gaData.trend > 0.05) { trendVal = "\u25B2 +" + gaData.trend.toFixed(2) + "%"; trendColor = "#16a34a"; }
        else if (gaData.trend < -0.05) { trendVal = "\u25BC " + gaData.trend.toFixed(2) + "%"; trendColor = "#dc2626"; }
        else { trendVal = "\u25BA " + gaData.trend.toFixed(2) + "%"; trendColor = "var(--bctext-1)"; }
    }
    let goalStat = "";
    if (gaCalc && gaCalc.show && gaCalc.weight > 0 && gaCalc.target != null && gaData.current != null) {
        const w = gaCalc.weight / 100;
        const needed = (gaCalc.target - gaData.current * (1 - w)) / w;
        let val, color;
        if (needed <= 0) { val = getMsg("ga_secured", "✓ Secured"); color = "#16a34a"; }
        else if (needed > 100) { val = getMsg("ga_out_of_reach", "Out of reach"); color = "#dc2626"; }
        else { val = "\u2265 " + needed.toFixed(2) + "%"; color = gaNeededColor(needed); }
        goalStat = stat(getMsg("ga_stat_final_exam", "Final Exam"), val, color);
    }
    stats.innerHTML =
        stat(getMsg("ga_stat_overall", "Overall grade"), gaData.current == null ? "-" : gaData.current.toFixed(2) + "%") +
        stat(getMsg("ga_stat_trend", "Grade trend (last 5)"), trendVal, trendColor) +
        stat(getMsg("ga_stat_graded", "Graded"), gaData.graded) +
        stat(getMsg("ga_stat_ungraded", "Ungraded"), gaData.ungraded) +
        goalStat;
}

function renderGradeAnalytics() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel || !gaData) return;
    const status = panel.querySelector("#canvasrefined-ga-status");
    if (status) status.style.display = "none";

    renderGaStats();

    const charts = panel.querySelector("#canvasrefined-ga-charts");
    charts.style.display = "flex";
    const fitYBox = panel.querySelector("#canvasrefined-ga-fity");
    if (fitYBox) fitYBox.checked = gaFitY;

    gaDrawPie(panel.querySelector("#canvasrefined-ga-pie"), panel.querySelector("#canvasrefined-ga-pie-tip"));
    gaDrawLine(panel.querySelector("#canvasrefined-ga-line"), panel.querySelector("#canvasrefined-ga-line-tip"));
    renderGaHeatmap();
    renderGaCalculator();
}


function gaTabStyle(active) {
    return `background:transparent;border:none;padding:6px 14px;font-size:14px;font-weight:600;cursor:pointer;color:${active ? "var(--bctext-0)" : "var(--bctext-1)"};border-bottom:2px solid ${active ? "#2563eb" : "transparent"};`;
}

function gaSetTab(tab) {
    gaTab = tab;
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel) return;
    for (const name of ["overview", "calc", "heatmap"]) {
        const el = panel.querySelector(`#canvasrefined-ga-tab-${name}`);
        if (el) el.style.display = name === tab ? "" : "none";
    }
    panel.querySelectorAll("[data-ga-tab]").forEach(btn => {
        const active = btn.dataset.gaTab === tab;
        btn.style.color = active ? "var(--bctext-0)" : "var(--bctext-1)";
        btn.style.borderBottomColor = active ? "#2563eb" : "transparent";
    });
    if (tab === "overview") {
        // The canvases were zero-size while the tab was hidden — redraw.
        if (gaOpen && gaData) renderGradeAnalytics();
    } else if (tab === "heatmap") {
        renderGaHeatmap();
    } else {
        renderGaCalculator();
    }
}

// Palette-matched color for an arbitrary score percentage.
function gaSeverityColor(pct) {
    if (pct == null || !isFinite(pct)) return "var(--bctext-0)";
    const b = GA_BUCKETS.find(b => pct >= b.min && pct < b.max);
    return (b || GA_BUCKETS[GA_BUCKETS.length - 1]).color;
}

// Inverted scale for the calculator: a low required score is good (≥95% red,
// 75–94% yellow, ≤74% green).
const GA_NEEDED_COLORS = [
    { min: 95, color: "#dc2626" },
    { min: 75, color: "#facc15" },
    { min: 0,  color: "#16a34a" },
];

function gaNeededColor(needed) {
    if (needed == null || !isFinite(needed)) return "var(--bctext-0)";
    const b = GA_NEEDED_COLORS.find(b => needed >= b.min);
    return (b || GA_NEEDED_COLORS[GA_NEEDED_COLORS.length - 1]).color;
}

function applyGaCalcState(panel) {
    const w = panel.querySelector("#canvasrefined-ga-calc-weight");
    const t = panel.querySelector("#canvasrefined-ga-calc-target");
    const s = panel.querySelector("#canvasrefined-ga-calc-show");
    if (!w || !t || !s) return;
    if (document.activeElement !== w) w.value = gaCalc && gaCalc.weight != null ? gaCalc.weight : "";
    if (document.activeElement !== t) t.value = gaCalc && gaCalc.target != null ? gaCalc.target : "";
    s.checked = !!(gaCalc && gaCalc.show);
    renderGaCalculator();
}

// needed = (target − current·(1−w)) / w, always recomputed from the live grade.
function renderGaCalculator() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel) return;
    const box = panel.querySelector("#canvasrefined-ga-calc-result");
    if (!box) return;
    if (!gaCalc || gaCalc.weight == null || !(gaCalc.weight > 0) || gaCalc.target == null) {
        box.innerHTML = `<span style="color:var(--bctext-1);">${chrome.i18n.getMessage("final_weight_prompt") || "Enter your final's weight and your target grade to see what you need on the final."}</span>`;
        return;
    }
    const w = gaCalc.weight / 100;
    const target = gaCalc.target;
    const current = gaData ? gaData.current : null;
    if (current == null) {
        box.innerHTML = `<span style="color:var(--bctext-1);">${chrome.i18n.getMessage("final_waiting") || "Waiting for grade data…"}</span>`;
        return;
    }
    const needed = (target - current * (1 - w)) / w;
    const withZero = current * (1 - w);
    const withPerfect = withZero + 100 * w;
    let head, sub;
    if (needed <= 0) {
        head = `<span style="font-size:20px;font-weight:700;color:#16a34a;">${getMsg("ga_already_there", "You're already there!")}</span>`;
        sub = getMsg("ga_sub_secured", "Even a 0 on the final leaves you at <b>{{ZERO}}%</b>, which is above your <b>{{TARGET}}%</b> goal.").replace("{{ZERO}}", withZero.toFixed(2)).replace("{{TARGET}}", target);
    } else if (needed > 100) {
        head = `<span style="font-size:20px;font-weight:700;color:#dc2626;">${getMsg("ga_out_of_reach", "Out of reach")}</span>`;
        sub = getMsg("ga_sub_unreachable", "Even a perfect final only gets you to <b>{{PERFECT}}%</b>, which is below your <b>{{TARGET}}%</b> goal.").replace("{{PERFECT}}", withPerfect.toFixed(2)).replace("{{TARGET}}", target);
    } else {
        head = `<span style="font-size:20px;font-weight:700;color:${gaNeededColor(needed)};">${getMsg("ga_you_need", "You need ≥ {{PCT}}% on the final").replace("{{PCT}}", needed.toFixed(2))}</span>`;
        sub = getMsg("ga_you_got_this", "You got this!");
    }
    box.innerHTML = head + `<div style="margin-top:6px;color:var(--bctext-1);font-size:13px;">${sub}</div>`;
}


// Day cells: 13px squares, 3px gaps, GitHub-style Sunday–Saturday columns.
const GA_HM_CELL = 13;
const GA_HM_GAP = 3;
const GA_HM_MONTH_H = 16; // vertical room for the month labels above the grid
let gaHeatmapToken = null; // identifies the data the grid was last built from

// Same 5%-banded red→green palette as the line chart's zones.
function gaHeatmapColor(avg) {
    return GA_ZONE_COLORS[Math.max(0, Math.min(GA_ZONE_COLORS.length - 1, Math.floor(avg / 5)))];
}

function gaEscHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Buckets graded work by due date. The table's dates carry no year, so the year is
// reconstructed below.
function gaBuildHeatmapData() {
    if (!gaData || !Array.isArray(gaData.points) || !gaData.points.length) return null;
    const parsed = [];
    for (const p of gaData.points) {
        const m = /^([A-Za-z]{3})\s+(\d{1,2})/.exec((p.due || "").trim());
        if (!m) continue;
        const mo = months.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
        const day = parseInt(m[2], 10);
        if (mo < 0 || day < 1 || day > 31) continue;
        parsed.push({ p, mo, day });
    }
    if (!parsed.length) return null;
    // Rows aren't necessarily in due-date order (Canvas groups them), so pick the
    // rotation packing every due month into the shortest window, then the base year
    // whose window contains today.
    const present = [...new Set(parsed.map(e => e.mo))];
    let rho = 0, bestSpan = 12;
    for (let r = 0; r < 12; r++) {
        let lo = 12, hi = -1;
        for (const m of present) {
            const u = (m - r + 12) % 12;
            if (u < lo) lo = u;
            if (u > hi) hi = u;
        }
        if (hi - lo < bestSpan) { bestSpan = hi - lo; rho = r; }
    }
    const thisYear = new Date().getFullYear();
    const now = Date.now(), grace = 45 * 86400000;
    const mkDate = (e, y) => new Date(y + (e.mo < rho ? 1 : 0), e.mo, e.day);
    let base = null;
    for (let y = thisYear + 1; y >= thisYear - 2 && base == null; y--) {
        const ds = parsed.map(e => mkDate(e, y).getTime());
        if (Math.min(...ds) <= now && now <= Math.max(...ds) + grace) base = y;
    }
    if (base == null) {
        for (let y = thisYear; y >= thisYear - 3 && base == null; y--) {
            if (parsed.every(e => mkDate(e, y).getTime() <= now + grace)) base = y;
        }
    }
    if (base == null) base = thisYear;
    const abs = (e) => mkDate(e, base);
    // Same-day assignments pool into one cell, colored by their average score.
    const byDay = new Map();
    let min = null, max = null;
    for (const e of parsed) {
        const d = abs(e);
        const key = d.getTime();
        let cell = byDay.get(key);
        if (!cell) {
            cell = { date: d, sum: 0, items: [] };
            byDay.set(key, cell);
            if (min == null || d.getTime() < min.getTime()) min = d;
            if (max == null || d.getTime() > max.getTime()) max = d;
        }
        cell.sum += e.p.pct;
        cell.items.push(e.p);
    }
    return { byDay, min, max, undated: gaData.points.length - parsed.length };
}

// Positioned relative to the heatmap tab, not the viewport: transformed or
// filtered ancestors break position:fixed.
function gaHeatmapShowTip(tip, e, cell, avg) {
    const d = cell.date;
    const rows = cell.items.map(p =>
        `<div style="margin-top:2px;color:var(--bctext-1);">${gaEscHtml(p.title)} — <b style="color:${gaHeatmapColor(p.pct)};">${p.pct.toFixed(2)}%</b></div>`).join("");
    tip.innerHTML = `<b>${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</b> — ${getMsg("ga_heatmap_avg", "avg")} <b style="color:${gaHeatmapColor(avg)};">${avg.toFixed(2)}%</b><div style="margin-top:4px;font-size:11px;color:var(--bctext-1);">${replaceCountPlaceholder(getMsg("ga_heatmap_assignments", "{{COUNT}} assignment(s):"), cell.items.length)}</div>${rows}`;
    tip.style.display = "block";
    const host = tip.offsetParent || tip.parentNode;
    const hostRect = host.getBoundingClientRect();
    const cellRect = e.target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = cellRect.right - hostRect.left + 6;
    if (left + tw > host.clientWidth - 4) left = Math.max(4, cellRect.left - hostRect.left - tw - 6);
    let top = cellRect.top - hostRect.top + (cellRect.height - th) / 2;
    top = Math.min(Math.max(4, top), Math.max(4, host.clientHeight - th - 4));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
}

// GitHub-style calendar, pure DOM; the token skips rebuilding for the same data.
function renderGaHeatmap() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel) return;
    const grid = panel.querySelector("#canvasrefined-ga-heatmap-grid");
    const note = panel.querySelector("#canvasrefined-ga-heatmap-note");
    const tip = panel.querySelector("#canvasrefined-ga-heatmap-tip");
    if (!grid || !note || !tip) return;
    const data = gaBuildHeatmapData();
    const token = data ? `${gaCourseId}:${data.min.getTime()}:${data.max.getTime()}:${gaData.points.length}` : "none";
    if (grid.childElementCount && gaHeatmapToken === token) return; // already built
    gaHeatmapToken = token;
    grid.textContent = "";
    if (!data) {
        note.textContent = chrome.i18n.getMessage("no_graded_assignments") || "No graded assignments with due dates yet.";
        return;
    }
    note.textContent = data.undated > 0
        ? replaceCountPlaceholder(getMsg("ga_heatmap_undated", "{{COUNT}} graded assignment(s) without a due date not shown."), data.undated)
        : "";
    const start = new Date(data.min);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(data.max);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const labels = document.createElement("div");
    labels.style.cssText = `display:flex;flex-direction:column;gap:${GA_HM_GAP}px;padding-top:${GA_HM_MONTH_H}px;`;
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach(t => {
        const l = document.createElement("div");
        l.style.cssText = `height:${GA_HM_CELL}px;font-size:9px;line-height:${GA_HM_CELL}px;color:var(--bctext-1);white-space:nowrap;`;
        l.textContent = t;
        labels.appendChild(l);
    });
    grid.appendChild(labels);
    const wrap = document.createElement("div");
    wrap.style.cssText = `position:relative;padding-top:${GA_HM_MONTH_H}px;`;
    const cols = document.createElement("div");
    cols.style.cssText = `display:flex;gap:${GA_HM_GAP}px;`;
    wrap.appendChild(cols);
    grid.appendChild(wrap);
    const cursor = new Date(start);
    let wk = 0, prevMonth = null;
    while (cursor.getTime() <= end.getTime()) {
        const col = document.createElement("div");
        col.style.cssText = `display:flex;flex-direction:column;gap:${GA_HM_GAP}px;`;
        // Month label once the week's Thursday enters a new month.
        const thursday = new Date(cursor);
        thursday.setDate(thursday.getDate() + 4);
        if (prevMonth == null || thursday.getMonth() !== prevMonth) {
            prevMonth = thursday.getMonth();
            const lab = document.createElement("div");
            lab.textContent = new Date(thursday.getFullYear(), prevMonth, 1).toLocaleDateString(undefined, { month: "short" });
            lab.style.cssText = `position:absolute;top:0;left:${wk * (GA_HM_CELL + GA_HM_GAP)}px;font-size:10px;line-height:1;color:var(--bctext-1);white-space:nowrap;`;
            wrap.appendChild(lab);
        }
        for (let d = 0; d < 7; d++) {
            const cell = data.byDay.get(cursor.getTime());
            const div = document.createElement("div");
            div.className = "canvasrefined-ga-hcell";
            div.style.cssText = `width:${GA_HM_CELL}px;height:${GA_HM_CELL}px;border-radius:3px;background:${cell ? gaHeatmapColor(cell.sum / cell.items.length) : "color-mix(in srgb, var(--bctext-1) 20%, transparent)"};`;
            if (cell) {
                const avg = cell.sum / cell.items.length;
                div.addEventListener("mousemove", (e) => gaHeatmapShowTip(tip, e, cell, avg));
                div.addEventListener("mouseleave", () => { tip.style.display = "none"; });
            }
            col.appendChild(div);
            cursor.setDate(cursor.getDate() + 1);
        }
        cols.appendChild(col);
        wk++;
    }
}


function gaSetupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentNode.clientWidth, h = canvas.parentNode.clientHeight;
    // Zero size means the panel isn't laid out yet: leave width 0 as the "never
    // drawn" marker so the self-heal paths retry.
    if (w <= 0 || h <= 0) {
        canvas.width = 0;
        canvas.height = 0;
        return null;
    }
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
}

function gaShowTooltip(el, x, y, html) {
    el.innerHTML = html;
    el.style.display = "block";
    const parent = el.parentNode;
    const tw = el.offsetWidth, th = el.offsetHeight;
    let left = x + 14;
    if (left + tw > parent.clientWidth) left = Math.max(0, x - tw - 14);
    let top = y - th / 2;
    top = Math.min(Math.max(0, top), Math.max(0, parent.clientHeight - th));
    el.style.left = left + "px";
    el.style.top = top + "px";
}

function gaDrawPie(canvas, tooltip) {
    const size = gaSetupCanvas(canvas);
    if (!size || !gaData) return;
    const { ctx, w, h } = size;
    const cx = w / 2, cy = h / 2;
    const r = Math.max(10, Math.min(w, h) / 2 - 10);
    const slices = GA_BUCKETS.map((b, i) => ({ label: b.label, value: gaData.counts[i], color: b.color }))
        .concat([{ label: "Ungraded", value: gaData.ungraded, color: GA_UNGRADED_COLOR }]);
    const total = slices.reduce((s, x) => s + x.value, 0);
    const arcs = [];
    if (total === 0) {
        ctx.strokeStyle = "#888";
        ctx.lineWidth = r - r * 0.55;
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(cx, cy, (r + r * 0.55) / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#888"; ctx.textAlign = "center";
        ctx.font = "13px Lato, sans-serif";
        ctx.fillText(getMsg("ga_no_graded_short", "No graded assignments yet"), cx, cy);
    }
    let start = -Math.PI / 2;
    for (const s of slices) {
        if (!s.value) continue;
        const ang = (s.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + ang);
        ctx.arc(cx, cy, r * 0.55, start + ang, start, true);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        arcs.push({ ...s, start, end: start + ang });
        start += ang;
    }
    canvas._gaArcs = arcs;
    canvas._gaCenter = { cx, cy, r };
    if (canvas._gaHover) { canvas.removeEventListener("mousemove", canvas._gaHover); canvas.removeEventListener("mouseleave", canvas._gaLeave); }
    canvas._gaHover = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - canvas._gaCenter.cx;
        const y = e.clientY - rect.top - canvas._gaCenter.cy;
        const dist = Math.hypot(x, y);
        const hit = canvas._gaArcs.find(a => {
            let d = Math.atan2(y, x);
            if (d < a.start) d += Math.PI * 2;
            return dist <= canvas._gaCenter.r && dist >= canvas._gaCenter.r * 0.55 && d >= a.start && d <= a.end;
        });
        if (hit) gaShowTooltip(tooltip, e.clientX - rect.left, e.clientY - rect.top, `<b>${hit.label}</b>: ${replaceCountPlaceholder(getMsg("ga_tooltip_assignments", "{{COUNT}} assignment(s)"), hit.value)}`);
        else tooltip.style.display = "none";
    };
    canvas._gaLeave = () => { tooltip.style.display = "none"; };
    canvas.addEventListener("mousemove", canvas._gaHover);
    canvas.addEventListener("mouseleave", canvas._gaLeave);
}

function gaDrawLine(canvas, tooltip) {
    const size = gaSetupCanvas(canvas);
    if (!size || !gaData) return;
    const pts = gaData.points;
    const { ctx, w, h } = size;
    const pad = { l: 38, r: 12, t: 12, b: 26 };
    const text = getComputedStyle(document.body).color || "#666";
    ctx.font = "11px Lato, sans-serif";
    // Fixed 0-100, or scaled to the data when "Fit Y axis" is on.
    let yMin = 0, yMax = 100;
    if (gaFitY) {
        const vals = pts.map(p => p.grade).filter(v => v != null);
        if (vals.length) {
            const lo = Math.min(...vals), hi = Math.max(...vals);
            if (hi - lo < 1e-9) {
                yMin = Math.max(0, lo - 5);
                yMax = hi + 5;
            } else {
                const margin = (hi - lo) * 0.1;
                yMin = Math.max(0, lo - margin);
                yMax = hi + margin;
            }
            if (yMax - yMin < 1) yMax = yMin + 1;
        }
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const decimals = (yMax - yMin) <= 1 ? 2 : (yMax - yMin) <= 10 ? 1 : 0;
    for (let i = 0; i <= 5; i++) {
        const v = yMin + (yMax - yMin) * (i / 5);
        const y = pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
        ctx.strokeStyle = "rgba(128,128,128,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillStyle = text;
        ctx.fillText(v.toFixed(decimals) + "%", pad.l - 6, y);
    }
    if (pts.length === 0) {
        ctx.fillStyle = text; ctx.textAlign = "center";
        ctx.fillText(getMsg("ga_no_graded_short", "No graded assignments yet"), w / 2, h / 2);
        return;
    }
    const X = (i) => pad.l + (pts.length === 1 ? (w - pad.l - pad.r) / 2 : (i / (pts.length - 1)) * (w - pad.l - pad.r));
    const Y = (v) => pad.t + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    // Full redraw, parameterized by the hovered point index.
    const draw = (hover) => {
        ctx.clearRect(0, 0, w, h);
        // Optional 5% color zones behind the plot ("Colored grade zones").
        if (options.grade_analytics_zones) {
            GA_ZONE_COLORS.forEach((color, i) => {
                const top = Math.min(yMax, (i + 1) * 5);
                const bottom = Math.max(yMin, i * 5);
                if (top <= bottom) return;
                const y1 = pad.t + (1 - (top - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
                const y2 = pad.t + (1 - (bottom - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = color;
                ctx.fillRect(pad.l, y1, w - pad.l - pad.r, y2 - y1);
                ctx.globalAlpha = 1;
            });
        }
        ctx.font = "11px Lato, sans-serif";
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for (let i = 0; i <= 5; i++) {
            const v = yMin + (yMax - yMin) * (i / 5);
            const y = pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
            ctx.strokeStyle = "rgba(128,128,128,0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
            ctx.fillStyle = text;
            ctx.fillText(v.toFixed(decimals) + "%", pad.l - 6, y);
        }
        ctx.beginPath();
        pts.forEach((p, i) => { const x = X(i), y = Y(p.grade); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
        ctx.lineTo(X(pts.length - 1), h - pad.b); ctx.lineTo(X(0), h - pad.b); ctx.closePath();
        ctx.fillStyle = "rgba(37,99,235,0.12)"; ctx.fill();
        pts.forEach((p, i) => {
            ctx.beginPath(); ctx.arc(X(i), Y(p.grade), 3, 0, Math.PI * 2);
            ctx.fillStyle = "#2563eb"; ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        });
        // X axis: a tick and label at the first point of each calendar month.
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.strokeStyle = "rgba(128,128,128,0.55)";
        ctx.lineWidth = 1;
        const tick = (x) => {
            ctx.beginPath(); ctx.moveTo(x, h - pad.b); ctx.lineTo(x, h - pad.b + 4); ctx.stroke();
        };
        if (pts.length <= 25) pts.forEach((_, i) => tick(X(i)));
        const boundaries = [];
        let prevM = null, absM = null;
        pts.forEach((p, i) => {
            const m = months.indexOf((p.due || "").trim().slice(0, 3));
            if (m < 0) return; // no due date on this point
            if (absM == null) absM = m;
            else if (m >= prevM) absM += m - prevM;
            else absM += 12 - prevM + m; // wrapped to a new year
            prevM = m;
            const last = boundaries[boundaries.length - 1];
            if (!last || last.absM !== absM) {
                boundaries.push({ i, absM, label: (p.due || "").trim().slice(0, 3) });
            }
        });
        boundaries.forEach(b => tick(X(b.i)));
        // Drop colliding month labels; the first and last always keep theirs.
        const GAP = 6;
        const kept = [];
        boundaries.forEach((b, idx) => {
            const x = X(b.i);
            const w = ctx.measureText(b.label).width;
            if (idx === 0 || x - w / 2 > kept[kept.length - 1].right + GAP) {
                kept.push({ ...b, x, right: x + w / 2 });
            }
        });
        const lastB = boundaries[boundaries.length - 1];
        if (lastB && kept[kept.length - 1].i !== lastB.i) {
            const x = X(lastB.i);
            const w = ctx.measureText(lastB.label).width;
            while (kept.length && kept[kept.length - 1].right + GAP > x - w / 2) kept.pop();
            kept.push({ ...lastB, x, right: x + w / 2 });
        }
        kept.forEach((b, k) => {
            ctx.textAlign = k === 0 ? "left" : (b.i === pts.length - 1 ? "right" : "center");
            ctx.fillStyle = text;
            ctx.fillText(b.label, b.x, h - pad.b + 6);
        });
        // Dashed guide plus a halo ring on the hovered dot.
        if (hover != null && pts[hover]) {
            const hx = X(hover), hy = Y(pts[hover].grade);
            ctx.save();
            ctx.strokeStyle = "rgba(37,99,235,0.55)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, h - pad.b); ctx.stroke();
            ctx.restore();
            ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(37,99,235,0.25)"; ctx.fill();
            ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = "#2563eb"; ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        }
    };
    draw(null);
    canvas._gaHoverIdx = null; // stale hover index from a previous draw
    canvas._gaPts = pts;
    canvas._gaX = X; canvas._gaY = Y; canvas._gaPad = pad;
    if (canvas._gaHover) { canvas.removeEventListener("mousemove", canvas._gaHover); canvas.removeEventListener("mouseleave", canvas._gaLeave); }
    canvas._gaHover = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let best = 0, bestD = Infinity;
        pts.forEach((_, i) => { const d = Math.abs(X(i) - mx); if (d < bestD) { bestD = d; best = i; } });
        if (best !== canvas._gaHoverIdx) {
            canvas._gaHoverIdx = best;
            draw(best);
        }
        const p = pts[best];
        gaShowTooltip(tooltip, X(best), Y(p.grade),
            `<b>${p.title}</b><br>Overall: ${p.grade == null ? "-" : p.grade.toFixed(2) + "%"}<br>This: ${p.score}/${p.points} (${p.pct.toFixed(2)}%)${p.due ? `<br>Due: ${p.due}` : ""}`);
    };
    canvas._gaLeave = () => {
        tooltip.style.display = "none";
        if (canvas._gaHoverIdx != null) {
            canvas._gaHoverIdx = null;
            draw(null);
        }
    };
    canvas.addEventListener("mousemove", canvas._gaHover);
    canvas.addEventListener("mouseleave", canvas._gaLeave);
}

window.addEventListener("resize", () => {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (panel && gaOpen && gaData) renderGradeAnalytics();
});

// --- Imagine-If mode ---------------------------------------------------------
// A hypothetical-grade sandbox drawn on the grades table itself (never in the
// panel). Nothing is sent to Canvas; turning it off restores the table.

// Standard scheme for the hypothetical letter grade (Canvas's default cutoffs).
const GA_LETTER_SCALE = [
    ["A", 93], ["A−", 90], ["B+", 87], ["B", 83], ["B−", 80],
    ["C+", 77], ["C", 73], ["C−", 70], ["D+", 67], ["D", 63], ["D−", 60],
];

function gaLetterFor(pct) {
    if (pct == null || !isFinite(pct)) return null;
    for (const [letter, min] of GA_LETTER_SCALE) if (pct >= min) return letter;
    return "F";
}

// The recalculated grade overwrites this row's percentage span.
function gaFindTotalGradeSpan() {
    const row = document.querySelector("#grades_summary tr.final_grade");
    return row ? row.querySelector("td.assignment_score .tooltip .grade") : null;
}

function gaFindTotalTitleCell() {
    const row = document.querySelector("#grades_summary tr.final_grade");
    return row ? row.querySelector("th.title") : null;
}

// Row-id signature: a change (grading period, SPA navigation) rebuilds the scenario.
function gaImagineTableSig() {
    const table = document.querySelector("#grades_summary");
    return table ? [...table.querySelectorAll("tr.student_assignment")].map(tr => tr.id).join(",") : "";
}

// Snapshot of the page's groups and assignments. Scores come from the hidden
// original_score spans; ungraded rows stay null until the user types a score.
function gaBuildImagineScenario() {
    const table = document.querySelector("#grades_summary");
    if (!table) return null;
    const groups = [];
    for (const tr of table.querySelectorAll("tr.group_total")) {
        const gid = (tr.querySelector(".assignment_group_id")?.textContent || "").trim();
        if (!gid) continue;
        const name = (tr.querySelector("th.title")?.textContent || "").trim() || ("Group " + gid);
        const w = parseFloat((tr.querySelector(".group_weight")?.textContent || "").trim());
        groups.push({ gid, name, weight: isFinite(w) ? w : 0 });
    }
    const assignments = [];
    for (const tr of table.querySelectorAll("tr.student_assignment")) {
        if (tr.classList.contains("group_total") || tr.classList.contains("final_grade")) continue;
        const a = gaParseAssignmentRow(tr);
        assignments.push({
            key: tr.id || ("row-" + assignments.length),
            title: (a.title || "Assignment").trim() || "Assignment",
            score: a.score,
            points: a.points,
            gid: (a.gid || "").trim(),
        });
    }
    return { groups, assignments };
}

// Scenario total, computed from scratch (never read from the page): only rows with
// a score, positive points possible and a live group count.
function gaComputeImagineTotal() {
    if (!gaScenario) return null;
    const groups = new Map();
    let totalWeightAll = 0;
    for (const g of gaScenario.groups) {
        if (g.deleted) continue;
        const w = isFinite(g.weight) ? g.weight : 0;
        groups.set(String(g.gid), w);
        totalWeightAll += w;
    }
    const noGroups = groups.size === 0;
    const stats = new Map(); // gid -> { score, pts }
    for (const a of gaScenario.assignments) {
        if (a.deleted || a.score == null || !(a.points > 0)) continue;
        const gid = String(a.gid ?? "");
        if (!noGroups && !groups.has(gid)) continue; // group deleted / unassigned
        const s = stats.get(gid) || { score: 0, pts: 0 };
        s.score += a.score;
        s.pts += a.points;
        stats.set(gid, s);
    }
    if (!stats.size) return null;
    if (totalWeightAll > 0) {
        let weighted = 0, used = 0;
        for (const [gid, s] of stats) {
            const w = groups.get(gid) || 0;
            weighted += (s.score / s.pts) * w;
            used += w;
        }
        if (used > 0) return used < 100 ? (weighted / used) * 100 : weighted;
    }
    let score = 0, pts = 0;
    for (const s of stats.values()) { score += s.score; pts += s.pts; }
    return pts > 0 ? (score / pts) * 100 : null;
}

// Total-row content with an explicit Imagine-If badge so it can't be mistaken for
// the real grade.
function gaImagineTotalHtml(pct) {
    const letter = gaLetterFor(pct);
    const pctText = pct == null || !isFinite(pct) ? "—" : pct.toFixed(2) + "%";
    return `<span style="display:inline-flex;align-items:center;gap:6px;">`
        + `<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.5px;padding:1px 6px;border-radius:999px;text-transform:uppercase;white-space:nowrap;">${getMsg("imagine_if_badge", "Imagine-If")}</span>`
        + `<span style="font-weight:700;color:#7c3aed;">${pctText}</span>`
        + (letter ? `<span style="color:#7c3aed;">(${letter})</span>` : "")
        + `</span>`;
}


// Cached on the span so identical writes are skipped and the DOM observer can't loop.
function gaApplyImagineTotal() {
    if (!gaImagineIf) { gaRestoreImagineTotal(); return; }
    gaIfUpdateGroupPcts();
    const span = gaFindTotalGradeSpan();
    if (!span) return;
    const html = gaImagineTotalHtml(gaComputeImagineTotal());
    if (!(span.dataset.gaImagine && span._gaImagineHtml === html)) {
        if (!span.dataset.gaImagine) gaOriginalFinalHtml = span.innerHTML;
        span.dataset.gaImagine = "1";
        span._gaImagineHtml = html;
        span.innerHTML = html;
    }
    const th = gaFindTotalTitleCell();
    if (th) {
        let note = th.querySelector(".canvasrefined-ga-if-note");
        if (!note) {
            note = document.createElement("div");
            note.className = "canvasrefined-ga-if-note";
            note.style.cssText = "font-size:11px;font-style:italic;color:var(--bctext-1);margin-top:2px;";
            th.appendChild(note);
        }
        if (note.dataset.gaIfHtml !== "Imagine-If scenario; not your actual grade.") {
            note.dataset.gaIfHtml = "Imagine-If scenario; not your actual grade.";
            note.textContent = chrome.i18n.getMessage("imagine_if") || "Imagine-If scenario; not your actual grade.";
        }
    }
}

function gaRestoreImagineTotal() {
    const span = gaFindTotalGradeSpan();
    if (span && span.dataset.gaImagine) {
        delete span.dataset.gaImagine;
        delete span._gaImagineHtml;
        if (gaOriginalFinalHtml != null) span.innerHTML = gaOriginalFinalHtml;
    }
    document.querySelectorAll("#grades_summary tr.final_grade .canvasrefined-ga-if-note").forEach(n => n.remove());
}

// Canvas gives selects a tall box and an 11px bottom margin, which made our rows
// taller than the page's; margin:0 and a fixed height keep them even.
const GA_IF_TD_INPUT = "box-sizing:border-box;padding:3px 6px;border-radius:5px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:12px;margin:0;";
const GA_IF_TD_NUM = GA_IF_TD_INPUT + "width:58px;";
const GA_IF_TD_SEL = GA_IF_TD_INPUT + "max-width:170px;height:26px;padding:2px 4px;";
const GA_IF_TD_BTN = GA_IF_TD_INPUT + "cursor:pointer;white-space:nowrap;";

// Group picker for one assignment; a removed group leaves it on "not counted".
function gaIfSelectHtml(gid) {
    const groups = gaScenario ? gaScenario.groups.filter(g => !g.deleted) : [];
    return `<select data-ga-if-groupsel title="${getMsg("ga_title_group_select", "Imagine-If assignment group")}" style="${GA_IF_TD_SEL}">`
        + `<option value="">${getMsg("ga_not_counted", "— not counted —")}</option>`
        + groups.map(g => `<option value="${gaEscHtml(g.gid)}"${String(gid) === String(g.gid) ? " selected" : ""}>${gaEscHtml(g.name)}</option>`).join("")
        + `</select>`;
}

// Refresh the options, keeping the current choice; skips the focused select.
function gaIfRefreshSelects(table) {
    for (const sel of table.querySelectorAll("select[data-ga-if-groupsel]")) {
        if (document.activeElement === sel) continue;
        const cur = sel.value;
        const groups = gaScenario ? gaScenario.groups.filter(g => !g.deleted) : [];
        sel.innerHTML = `<option value="">${getMsg("ga_not_counted", "— not counted —")}</option>`
            + groups.map(g => `<option value="${gaEscHtml(g.gid)}"${String(cur) === String(g.gid) ? " selected" : ""}>${gaEscHtml(g.name)}</option>`).join("");
        sel.value = groups.some(g => String(g.gid) === cur) ? cur : "";
    }
}

function gaIfDelButton(attr, title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(attr, "");
    btn.title = title;
    btn.textContent = "✕";
    btn.style.cssText = GA_IF_TD_BTN + "padding:3px 8px;";
    return btn;
}

// Scenario controls for one assignment row: score/points inputs in the score cell,
// a group select under the title, and a remove button in the last cell.
function gaIfBuildAssignmentControls(tr, a) {
    if (tr.querySelector(".canvasrefined-ga-if-edit")) return;
    const scoreTd = tr.querySelector("td.assignment_score");
    if (!scoreTd) return;
    const tooltip = scoreTd.querySelector("span.tooltip");
    if (tooltip) { tooltip.style.display = "none"; tooltip.dataset.gaIfHidden = "1"; }
    const edit = document.createElement("span");
    edit.className = "canvasrefined-ga-if-edit";
    edit.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    edit.innerHTML = `<input data-ga-if-score type="number" step="any" placeholder="—" value="${a.score == null ? "" : a.score}" title="${getMsg("ga_title_score", "Imagine-If score (numerator); blank = not counted")}" style="${GA_IF_TD_NUM}">`
        + ` <span style="color:var(--bctext-1);">/</span> `
        + `<input data-ga-if-pts type="number" step="any" min="0" placeholder="—" value="${a.points == null ? "" : a.points}" title="${getMsg("ga_title_points", "Imagine-If points possible (denominator)")}" style="${GA_IF_TD_NUM}">`;
    (scoreTd.querySelector(".score_holder") || scoreTd).appendChild(edit);
    const th = tr.querySelector("th.title");
    const ctx = th?.querySelector("div.context");
    if (ctx) { ctx.style.display = "none"; ctx.dataset.gaIfHidden = "1"; }
    const ctl = document.createElement("div");
    ctl.className = "canvasrefined-ga-if-ctl";
    ctl.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;";
    ctl.innerHTML = gaIfSelectHtml(a.gid);
    (th || tr).appendChild(ctl);
    const lastTd = tr.cells[tr.cells.length - 1];
    if (lastTd && !lastTd.querySelector("[data-ga-if-adel]")) {
        lastTd.appendChild(gaIfDelButton("data-ga-if-adel", getMsg("ga_remove_assignment", "Remove this assignment from the scenario")));
    }
}

function gaIfBuildGroupControls(tr, g) {
    if (tr.querySelector(".canvasrefined-ga-if-edit")) return;
    const scoreTd = tr.querySelector("td.assignment_score");
    if (!scoreTd) return;
    const edit = document.createElement("span");
    edit.className = "canvasrefined-ga-if-edit";
    edit.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-left:8px;";
    edit.innerHTML = `<input data-ga-if-gweight type="number" min="0" max="100" step="0.1" value="${g.weight}" title="${getMsg("ga_title_group_weight", "Imagine-If group weight (% of grade)")}" style="${GA_IF_TD_NUM}">`
        + ` <span style="color:var(--bctext-1);">%</span>`;
    (scoreTd.querySelector(".score_holder") || scoreTd).appendChild(edit);
    const lastTd = tr.cells[tr.cells.length - 1];
    if (lastTd && !lastTd.querySelector("[data-ga-if-gdel]")) {
        lastTd.appendChild(gaIfDelButton("data-ga-if-gdel", getMsg("ga_remove_group", "Remove this group from the scenario (its assignments stop counting until reassigned)")));
    }
}

// User-added assignment row: the page's 8-cell shape, but a custom class so the
// page's own parsers ignore it.
function gaIfMakeAssignmentRow(a) {
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-newrow";
    tr.innerHTML = `
        <th class="title" scope="row"><input data-ga-if-title type="text" value="${gaEscHtml(a.title)}" title="${getMsg("ga_title_assignment_name", "Assignment name")}" style="${GA_IF_TD_INPUT}width:100%;max-width:260px;"></th>
        <td class="due"></td><td class="submitted"></td><td class="status"></td>
        <td class="assignment_score"><div class="score_holder" style="position:relative;"></div></td>
        <td class="asset_processors_cell"></td><td class="details"></td><td></td>`;
    // Cell-level !important borders: dark mode's .ic-Table td rule beats inline styles
    // and, with collapsed borders, cell borders win over row borders.
    for (const cell of tr.cells) {
        cell.style.setProperty("border-top", "1px solid var(--bctext-1,#e2e2e2)", "important");
        cell.style.setProperty("border-bottom", "1px solid var(--bctext-1,#e2e2e2)", "important");
    }
    return tr;
}

function gaIfMakeGroupRow(g) {
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-newrow";
    tr.innerHTML = `
        <th class="title" scope="row"><input data-ga-if-gname type="text" value="${gaEscHtml(g.name)}" title="${getMsg("ga_title_group_name", "Group name")}" style="${GA_IF_TD_INPUT}width:100%;max-width:260px;"></th>
        <td class="due"></td><td class="submitted"></td><td class="status"></td>
        <td class="assignment_score"><div class="score_holder" style="position:relative;"><span class="tooltip"><span class="grade">—</span></span></div></td>
        <td class="asset_processors_cell"></td><td class="details"></td><td></td>`;
    for (const cell of tr.cells) {
        cell.style.setProperty("border-top", "1px solid var(--bctext-1,#e2e2e2)", "important");
        cell.style.setProperty("border-bottom", "1px solid var(--bctext-1,#e2e2e2)", "important");
    }
    return tr;
}

function gaIfInsertAssignmentRow(table, tr) {
    const lastNew = [...table.querySelectorAll("tr.canvasrefined-ga-if-newrow[data-ga-if-key]")].pop();
    if (lastNew) { lastNew.after(tr); return; }
    const firstReal = [...table.querySelectorAll("tr.student_assignment")]
        .find(r => !r.classList.contains("group_total") && !r.classList.contains("final_grade"));
    if (firstReal) { firstReal.before(tr); return; }
    (table.querySelector("tr.group_total") || table.querySelector("tr.final_grade") || table.lastElementChild).before(tr);
}

function gaIfInsertGroupRow(table, tr) {
    const lastNew = [...table.querySelectorAll("tr.canvasrefined-ga-if-newrow[data-ga-if-gid]")].pop();
    const lastReal = [...table.querySelectorAll("tr.group_total")].pop();
    (lastNew || lastReal || table.querySelector("tr.final_grade") || table.lastElementChild).after(tr);
}

// "+ Add assignment" sits on its own row at the top of the table.
function gaIfEnsureAddAssignmentRow(table) {
    if (table.querySelector("#canvasrefined-ga-if-add-asg")) return;
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-addrow";
    tr.innerHTML = `<td colspan="8" style="border:none!important;padding:6px 8px;">`
        + `<button type="button" id="canvasrefined-ga-if-add-asg" style="${GA_IF_TD_BTN}padding:4px 10px;">${getMsg("ga_add_assignment", "+ Add assignment")}</button>`
        + `</td>`;
    const firstNew = table.querySelector("tr.canvasrefined-ga-if-newrow[data-ga-if-key]");
    const firstReal = [...table.querySelectorAll("tr.student_assignment")]
        .find(r => !r.classList.contains("group_total") && !r.classList.contains("final_grade"));
    const anchor = firstNew || firstReal;
    if (anchor) anchor.before(tr);
    else (table.querySelector("tr.group_total") || table.querySelector("tr.final_grade") || table.lastElementChild).before(tr);
}

// "+ Add group" sits on its own row right above the Total row.
function gaIfEnsureAddGroupRow(table) {
    if (table.querySelector("#canvasrefined-ga-if-add-group")) return;
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-addrow";
    tr.innerHTML = `<td colspan="8" style="border:none!important;padding:10px 8px;">`
        + `<button type="button" id="canvasrefined-ga-if-add-group" style="${GA_IF_TD_BTN}padding:6px 12px;">${getMsg("ga_add_group", "+ Add group")}</button>`
        + `</td>`;
    (table.querySelector("tr.final_grade") || table.lastElementChild).before(tr);
}

// Rewrite group percentages to the scenario's values (originals stashed).
function gaIfUpdateGroupPcts() {
    const table = document.querySelector("#grades_summary");
    if (!table || !gaScenario) return;
    const stats = new Map();
    for (const a of gaScenario.assignments) {
        if (a.deleted || a.score == null || !(a.points > 0)) continue;
        if (!gaScenario.groups.some(g => !g.deleted && String(g.gid) === String(a.gid))) continue;
        const s = stats.get(String(a.gid)) || { score: 0, pts: 0 };
        s.score += a.score;
        s.pts += a.points;
        stats.set(String(a.gid), s);
    }
    for (const tr of table.querySelectorAll("tr[data-ga-if-gid]")) {
        const gradeEl = tr.querySelector("td.assignment_score .tooltip .grade");
        if (!gradeEl) continue;
        if (gradeEl.dataset.gaIfOrig == null) gradeEl.dataset.gaIfOrig = gradeEl.textContent;
        const s = stats.get(String(tr.dataset.gaIfGid));
        const txt = s && s.pts > 0 ? ((s.score / s.pts) * 100).toFixed(2).replace(/\.?0+$/, "") + "%" : "—";
        if (gradeEl.textContent !== txt) gradeEl.textContent = txt;
    }
}

function gaClearImagineUI(table) {
    table = table || document.querySelector("#grades_summary");
    if (!table) return;
    delete table.dataset.gaIfUi;
    delete table.dataset.gaIfBuilt;
    table.querySelectorAll(".canvasrefined-ga-if-edit, .canvasrefined-ga-if-ctl, tr.canvasrefined-ga-if-newrow, tr.canvasrefined-ga-if-addrow").forEach(el => el.remove());
    table.querySelectorAll("[data-ga-if-hidden]").forEach(el => { el.style.display = ""; delete el.dataset.gaIfHidden; });
    table.querySelectorAll(".grade[data-ga-if-orig]").forEach(el => { el.textContent = el.dataset.gaIfOrig; delete el.dataset.gaIfOrig; });
    table.querySelectorAll("tr[data-ga-if-deleted]").forEach(tr => { tr.style.display = ""; delete tr.dataset.gaIfDeleted; });
    table.querySelectorAll("tr[data-ga-if-key], tr[data-ga-if-gid]").forEach(tr => { delete tr.dataset.gaIfKey; delete tr.dataset.gaIfGid; });
}

// One delegated listener set, so rows can be rebuilt freely.
function gaIfBindTable(table) {
    if (table.dataset.gaIfBound) return;
    table.dataset.gaIfBound = "1";
    table.addEventListener("input", e => {
        if (!gaScenario || !gaImagineIf) return;
        const t = e.target;
        const tr = t.closest("tr");
        if (!tr) return;
        if (t.matches("[data-ga-if-score],[data-ga-if-pts],[data-ga-if-title]")) {
            const a = gaScenario.assignments.find(x => String(x.key) === String(tr.dataset.gaIfKey));
            if (!a) return;
            if (t.matches("[data-ga-if-title]")) a.title = t.value;
            else if (t.matches("[data-ga-if-score]")) { const v = parseFloat(t.value); a.score = t.value.trim() !== "" && isFinite(v) ? v : null; }
            else { const v = parseFloat(t.value); a.points = t.value.trim() !== "" && isFinite(v) ? v : null; }
            gaApplyImagineTotal();
        } else if (t.matches("[data-ga-if-gname],[data-ga-if-gweight]")) {
            const g = gaScenario.groups.find(x => String(x.gid) === String(tr.dataset.gaIfGid));
            if (!g) return;
            if (t.matches("[data-ga-if-gname]")) g.name = t.value;
            else { const w = parseFloat(t.value); g.weight = isFinite(w) ? w : 0; }
            gaApplyImagineTotal();
        }
    });
    table.addEventListener("change", e => {
        if (!gaScenario || !gaImagineIf) return;
        const t = e.target;
        if (!t.matches("select[data-ga-if-groupsel]")) return;
        const tr = t.closest("tr");
        const a = gaScenario.assignments.find(x => String(x.key) === String(tr?.dataset.gaIfKey));
        if (a) { a.gid = t.value; gaApplyImagineTotal(); }
    });
    table.addEventListener("click", e => {
        if (!gaScenario || !gaImagineIf) return;
        const btn = e.target.closest("button");
        if (!btn) return;
        const table = btn.closest("table") || document.querySelector("#grades_summary");
        if (btn.matches("[data-ga-if-adel]")) {
            const tr = btn.closest("tr");
            const a = gaScenario.assignments.find(x => String(x.key) === String(tr.dataset.gaIfKey));
            if (!a) return;
            a.deleted = true;
            if (a._new) tr.remove();
            else { tr.style.display = "none"; tr.dataset.gaIfDeleted = "1"; }
            gaApplyImagineTotal();
        } else if (btn.matches("[data-ga-if-gdel]")) {
            const tr = btn.closest("tr");
            const g = gaScenario.groups.find(x => String(x.gid) === String(tr.dataset.gaIfGid));
            if (!g) return;
            g.deleted = true;
            if (g._new) tr.remove();
            else { tr.style.display = "none"; tr.dataset.gaIfDeleted = "1"; }
            gaIfRefreshSelects(table);
            gaApplyImagineTotal();
        } else if (btn.id === "canvasrefined-ga-if-add-asg") {
            const groups = gaScenario.groups.filter(g => !g.deleted);
            const a = { key: "new-asg-" + (++gaIfCounter), title: getMsg("ga_new_assignment", "New assignment"), score: null, points: 100, gid: groups[0] ? String(groups[0].gid) : "", _new: true };
            gaScenario.assignments.push(a);
            const tr = gaIfMakeAssignmentRow(a);
            gaIfInsertAssignmentRow(table, tr);
            tr.dataset.gaIfKey = a.key;
            gaIfBuildAssignmentControls(tr, a);
            tr.scrollIntoView({ block: "nearest" });
            tr.querySelector("[data-ga-if-title]")?.focus();
            gaApplyImagineTotal();
        } else if (btn.id === "canvasrefined-ga-if-add-group") {
            const g = { gid: "new-group-" + (++gaIfCounter), name: getMsg("ga_new_group", "New group"), weight: 0, _new: true };
            gaScenario.groups.push(g);
            const tr = gaIfMakeGroupRow(g);
            gaIfInsertGroupRow(table, tr);
            tr.dataset.gaIfGid = g.gid;
            gaIfBuildGroupControls(tr, g);
            gaIfRefreshSelects(table);
            tr.scrollIntoView({ block: "nearest" });
            tr.querySelector("[data-ga-if-gname]")?.focus();
            gaApplyImagineTotal();
        }
    });
}

// Builds the inline UI on the table. Rebuilds when the row signature changes or
// Canvas wiped our controls; otherwise typing is never clobbered.
function gaRenderImagineIf(force) {
    if (!gaImagineIf) return;
    const table = document.querySelector("#grades_summary");
    if (!table) return;
    const sig = gaImagineTableSig();
    if (!gaScenario || gaScenario.sig !== sig) {
        const sc = gaBuildImagineScenario();
        if (!sc) return; // table hasn't rendered yet; the DOM observer retries
        gaScenario = { sig, groups: sc.groups, assignments: sc.assignments };
        force = true;
    }
    if (!force
        && table.dataset.gaIfUi === sig
        && Number(table.dataset.gaIfBuilt || 0) === table.querySelectorAll("tr[data-ga-if-key]").length) return;
    gaClearImagineUI(table);
    table.dataset.gaIfUi = sig;
    gaIfBindTable(table);

    const rowById = new Map();
    for (const tr of table.querySelectorAll("tr.student_assignment")) {
        if (tr.classList.contains("group_total") || tr.classList.contains("final_grade")) continue;
        if (tr.id) rowById.set(tr.id, tr);
    }
    const groupRowByGid = new Map();
    for (const tr of table.querySelectorAll("tr.group_total")) {
        const gid = (tr.querySelector(".assignment_group_id")?.textContent || "").trim();
        if (gid) groupRowByGid.set(gid, tr);
    }

    let built = 0;
    for (const a of gaScenario.assignments) {
        let tr = a._new ? table.querySelector(`tr[data-ga-if-key="${CSS.escape(a.key)}"]`) : rowById.get(a.key);
        if (a.deleted) {
            if (tr) { tr.style.display = "none"; tr.dataset.gaIfDeleted = "1"; }
            continue;
        }
        if (!tr) {
            if (!a._new) continue; // the page row vanished — nothing to edit
            tr = gaIfMakeAssignmentRow(a);
            gaIfInsertAssignmentRow(table, tr);
        }
        tr.dataset.gaIfKey = a.key;
        gaIfBuildAssignmentControls(tr, a);
        built++;
    }
    for (const g of gaScenario.groups) {
        let tr = g._new ? table.querySelector(`tr[data-ga-if-gid="${CSS.escape(g.gid)}"]`) : groupRowByGid.get(g.gid);
        if (g.deleted) {
            if (tr) { tr.style.display = "none"; tr.dataset.gaIfDeleted = "1"; }
            continue;
        }
        if (!tr) {
            if (!g._new) continue;
            tr = gaIfMakeGroupRow(g);
            gaIfInsertGroupRow(table, tr);
        }
        tr.dataset.gaIfGid = g.gid;
        gaIfBuildGroupControls(tr, g);
    }
    gaIfEnsureAddAssignmentRow(table);
    gaIfEnsureAddGroupRow(table);
    table.dataset.gaIfBuilt = String(built);
    gaApplyImagineTotal();
}

function gaEnterImagineIf() {
    gaRenderImagineIf();
    gaApplyImagineTotal();
}

function gaExitImagineIf() {
    gaClearImagineUI();
    gaRestoreImagineTotal();
}


function getApiData() {
    if (current_page === "/" || current_page === "" || options.better_todo || options.better_sidebar) {
        getAssignments();
        getGrades();
        getColors();
    }
}


function makeElement(element, location, options, prepend = false) {
    let creation = document.createElement(element);
    Object.keys(options).forEach(key => {
        creation[key] = options[key];
    });
    if (prepend) {
        location.insertBefore(creation, location.firstChild);
    } else {
        location.appendChild(creation);
    }
    return creation
}


// Firefox content scripts run `fetch` with the *extension's* origin, so the
// request loses the page's cookies and Referer/Origin; Canvas then answers
// 401/403 (or a login page), which made detection and every API call fail on
// Firefox only. `content.fetch` (Firefox 58+) sends the request exactly as the
// page would. Chrome has no `content` global, so this is a no-op there.
function pageFetch(url, init) {
    const opts = { credentials: "include", cache: "no-store", ...init };
    try {
        if (typeof content !== "undefined" && content && typeof content.fetch === "function") {
            return content.fetch(url, opts);
        }
    } catch (_) { /* fall through to the normal fetch */ }
    return fetch(url, opts);
}

async function getData(url) {
    let response = await pageFetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    // Fail loudly on non-OK responses (expired session → 401 or a login redirect);
    // callers used to get HTML back and crash somewhere else.
    if (!response.ok) {
        throw new Error(`Canvas API request failed (${response.status})`);
    }
    let data = await response.json();
    try {
        return JSON.parse(JSON.stringify(data));
    } catch (_) {
        return data;
    }
}


function rgbToHex(rgb) {
    try {
        let pat = /^rgb\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/;
        let exec = pat.exec(rgb);
        return "#" + parseInt(exec[1]).toString(16).padStart(2, "0") + parseInt(exec[2]).toString(16).padStart(2, "0") + parseInt(exec[3]).toString(16).padStart(2, "0");
    } catch (e) {
        console.warn(e);
    }
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max == min) {
        h = s = 0;
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0); break;
            case g:
                h = (b - r) / d + 2; break;
            case b:
                h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatTodoDate(date, submissions, hr24) {
    let { time, ms } = getRelativeDate(date);
    let fromNow = ms < 0
        ? getMsg("relative_in", "in {{TIME}}").replace("{{TIME}}", time)
        : getMsg("relative_ago", "{{TIME}} ago").replace("{{TIME}}", time);
    let dueSoon = false;
    if (submissions && submissions.submitted === false && ms >= -21600000) {
        dueSoon = true;
    }
    const dateText = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeText = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !hr24 });
    return { "dueSoon": dueSoon, "date": getMsg("todo_date_format", "{{DATE}} at {{TIME}} ({{RELATIVE}})").replace("{{DATE}}", dateText).replace("{{TIME}}", timeText).replace("{{RELATIVE}}", fromNow) };
}

function formatCardDue(date) {
    let due = new Date(date);
    if (options.relative_dues === true) {
        let relative = getRelativeDate(due, true);
        return relative.ms > 0
            ? getMsg("relative_ago", "{{TIME}} ago").replace("{{TIME}}", relative.time)
            : getMsg("relative_in", "in {{TIME}}").replace("{{TIME}}", relative.time);
    }
    return options.assignment_date_format ? (due.getDate()) + "/" + (due.getMonth() + 1) : (due.getMonth() + 1) + "/" + (due.getDate());
}

function logError(e) {
    chrome.storage.local.get("errors", storage => {
        if (storage.errors.length > 20) {
            storage["errors"] = [];
        }
        chrome.storage.local.set({ "errors": storage["errors"].concat(e.stack) });

        console.log(e.stack);
        console.log(storage["errors"].concat(e.stack));
    })

}

const CSRFtoken = function () {
    return decodeURIComponent((document.cookie.match('(^|;) *_csrf_token=([^;]*)') || '')[2])
}
