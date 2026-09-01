const domain = window.location.origin;
let current_page = window.location.pathname;

// Canvas' "New Canvas" UI navigates client-side via history.pushState/
// replaceState without a full page reload. current_page is captured once at
// document_start, so without this hook it goes stale and page-specific features
// (Back to Assignment button, sequence-footer removal, profile logout button)
// never activate when the user clicks into a page instead of loading it directly.
function setupNavigationListener() {
    const update = () => {
        const next = window.location.pathname;
        if (next === current_page) return;
        current_page = next;
        // Re-run the page-scoped watchers so they evaluate against the new URL.
        watchSequenceFooter();
        watchSubmissionPageButton();
        watchProfileLogoutPageButton();
        watchGradeAnalytics();
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

// Quiz pages: /courses/123/quizzes/456 (pre-take/intro) and
// /courses/123/quizzes/456/take (the actual quiz).
function isQuizPage() {
    return /^\/courses\/\d+\/quizzes\/\d+(?:\/|$)/.test(current_page);
}
function isQuizTakePage() {
    return /^\/courses\/\d+\/quizzes\/\d+\/take(?:\/|$)/.test(current_page);
}
function isQuizPreTakePage() {
    return isQuizPage() && !isQuizTakePage();
}
// "Quiz safe mode" disables features that interfere with the default Canvas
// quiz experience. Only active on quiz pages when the user has opted in.
function quizSafeModeActive() {
    return isQuizPage() && options.quiz_safe_mode === true;
}

// Read the URL live: Canvas' "New Canvas" UI navigates client-side via
// history.pushState/replaceState, and current_page (captured at document_start)
// can be stale when the user clicks into a submission page. Reading
// window.location.pathname at check time makes this correct regardless.
function getSubmissionAssignmentLink() {
    const match = window.location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/(\d+)(?:\/|$)/);
    if (!match) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/`;
}

// The content container isn't always #content on every Canvas layout (submission
// pages in particular may render into .ic-Layout-contentMain or #main). Match the
// quiz-safe-mode banner's container finder so the button lands in the visible
// content area; fall back to <body> so injection never silently no-ops.
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
let sequenceFooterObserver = null;

// Current user id, needed to build "Go to Grades" links on assignment pages.
// The page's ENV global isn't visible to content scripts (isolated world), so
// ask the Canvas API once and cache the result.
// undefined = not fetched yet, null = fetch failed, number = ok.
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

// Assignment pages (/courses/123/assignments/456) link to the current user's
// submission ("grades") page for that assignment. The lookahead keeps this
// from matching the submission pages themselves (/.../submissions/678).
function getAssignmentGradesLink() {
    const match = window.location.pathname.match(/^\/courses\/(\d+)\/assignments\/(\d+)(?!\/submissions)(?:\/|$)/);
    if (!match || currentUserIdCache == null) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/submissions/${currentUserIdCache}`;
}

function addSubmissionPageButton() {
    const assignmentLink = getSubmissionAssignmentLink();
    if (!assignmentLink) return;
    // Place the button inline with the "Submission Details" heading and the
    // grade-values table, inside the .submission-details-header__heading-and-grades
    // flex row (appended so it sits to the right of the grade summary). Only inject
    // once that row exists; if it's not there yet the persistent MutationObserver
    // re-tries on the next DOM change so we never fall back to body/#content
    // (which would put the button at the bottom of the page).
    const row = document.querySelector(".submission-details-header__heading-and-grades")
        || document.querySelector(".submission-details-header")
        || document.querySelector(".submission_details");
    if (!row || row.querySelector("#canvasrefined-assignment-return")) return;

    // Insert between the h1 heading and the grade-summary div so it reads
    // [Heading] [Back to Assignment] [Grade]. Falls back to appending if the
    // grade-summary div isn't found for some reason.
    const gradeSummary = row.querySelector(".submission-details-header__grade-summary");
    const btn = makeElement("a", row, {
        id: "canvasrefined-assignment-return",
        className: "canvasrefined-custom-btn",
        href: assignmentLink,
        textContent: "Back to Assignment",
        style: "display:inline-flex;align-items:center;justify-content:center;align-self:center;margin-left:auto;margin-right:12px;padding:6px 12px;text-decoration:none;font-weight:700;color:inherit!important;",
    });
    if (gradeSummary && gradeSummary.parentNode === row) {
        row.insertBefore(btn, gradeSummary);
    }
}

// Assignment pages: /courses/123/assignments/456 — add a "Go to Grades" button
// to the right edge of the title row.
function addAssignmentPageButton() {
    const link = getAssignmentGradesLink();
    if (!link) return;
    // Place the button inside the assignment header's .title-content block,
    // pinned to its right edge on the title's line. .title-content is a plain
    // block wrapping the <h1>, so switch it to a flex row (h1 left, button
    // right); the h1 still wraps its text when long.
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
        textContent: "Go to Grades",
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
        textContent: "Logout",
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

// Reconcile the button against the current page on a rAF-throttled schedule.
// Canvas (React-based "New Canvas" UI) re-renders the content area on SPA
// navigation and can wipe our injected node; a persistent observer re-adds it.
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

// Same reconciliation pattern as maintainSubmissionPageButton, but for the
// "Go to Grades" button on assignment pages. The grades link needs the
// current user id, so on the first assignment page visit we kick off the API
// fetch and re-run once it resolves.
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
                // Undo the flex-row layout we applied to the title block.
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

function removeSequenceFooter() {
    if (options.hide_sequence_footer !== true) return false;
    if (!isAssignmentPage()) return false;
    const sequenceFooter = document.getElementById("sequence_footer");
    if (!sequenceFooter) return false;
    sequenceFooter.remove();
    return true;
}

// CSS-based hiding is the primary mechanism: the style element persists across
// Canvas re-renders and full reloads, so the footer can never flash back after
// the JS observer has removed it (or timed out) once.
function applyHideSequenceFooter() {
    let style = document.getElementById("canvasrefined-hide-sequence-footer");
    if (options.hide_sequence_footer === true) {
        if (!style) {
            style = document.createElement("style");
            style.id = "canvasrefined-hide-sequence-footer";
            style.textContent = "#sequence_footer{display:none!important}";
            (document.head || document.documentElement).appendChild(style);
        }
    } else if (style) {
        style.remove();
    }
}

function watchSequenceFooter() {
    applyHideSequenceFooter();
    if (options.hide_sequence_footer !== true) {
        if (sequenceFooterObserver) {
            sequenceFooterObserver.disconnect();
            sequenceFooterObserver = null;
        }
        return;
    }
    if (!isAssignmentPage()) return;
    if (removeSequenceFooter()) return;
    if (sequenceFooterObserver) return;

    // The observer strips the footer from the DOM (no leftover gap), and
    // disconnects once removed — after that (or after the 10s timeout below)
    // the CSS rule above is what keeps it hidden across Canvas re-renders.
    sequenceFooterObserver = new MutationObserver(() => {
        if (removeSequenceFooter() && sequenceFooterObserver) {
            sequenceFooterObserver.disconnect();
            sequenceFooterObserver = null;
        }
    });

    sequenceFooterObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
        if (sequenceFooterObserver) {
            sequenceFooterObserver.disconnect();
            sequenceFooterObserver = null;
        }
    }, 10000);
}

// One persistent, rAF-throttled observer that keeps both assignment-page
// navigation buttons present: the "Back to Assignment" button on submission
// pages and the "Go to Grades" button on assignment pages. Unlike the old
// 10s-disconnecting observer, this survives Canvas' post-navigation re-renders
// that remove injected nodes. The extra delayed checks cover React hydration
// that wipes the button after our first add without emitting any later mutation
// for the observer to catch.
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
        // Only scan when nodes were actually added, and coalesce to one pass per frame.
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
        // Search backward up to 7 days for the APOD actually cached, since today's may not be ready.
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
            document.getElementById("nasa-info-date").textContent = `Date: ${meta.date}`;
            document.getElementById("nasa-info-credit").textContent = meta.copyright ? `Credit: ${meta.copyright}` : "";
            document.getElementById("nasa-info-explanation").textContent = meta.explanation || "No description available.";
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
let options = {};
let timeCheck = null;
let reminderCheck = null;
let betterSidebarLoading = false;
let dashboardReadyTimer = null;
let sidebarReadyTimer = null;
// Signature of the dashboard card set last time we ran the full setup pass.
// The MutationObserver in checkDashboardReady fires on every childList change
// in the document — including the ones our own setup pass (loadCardAssignments,
// customizeCards, etc.) causes. Without a guard, that re-triggers the observer
// and re-runs the whole pass every animation frame (an infinite reflow loop).
// We only need to re-run when Canvas actually changes the dashboard cards, so
// we skip the heavy pass whenever the card set is unchanged.
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
    const toAdd = [];
    const storage = await chrome.storage.sync.get("reminders");
    // overrides = if theres a item that needs to update, but already exists
    let overrides = false;
    for (const insert of reminders) {
        let found = false;
        for (let i = 0; i < storage["reminders"].length; i++) {
            // check if item was recently submitted
            if (insert.c === -1 && insert.h === storage["reminders"][i].h) {
                overrides = true;
                storage["reminders"][i] = insert;
            } else if (insert.h === storage["reminders"][i].h) {
                found = true;
            }
        }
        if (found === false) toAdd.push(insert);
    }
    if (toAdd.length > 0 || overrides === true) chrome.storage.sync.set({ "reminders": [...storage["reminders"], ...toAdd] });
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
    const due = makeElement("p", content, { "className": "canvasrefined-reminder-due", "textContent": `Assignment due in ${remaining.time}` });
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
            // { due, title, href, hide count }
            // hide count of -1 indicates the item has a submission
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
    const example = createReminder({ "d": new Date(), "t": "This is an example reminder", }, location);
    example.querySelector(".canvasrefined-reminder-due").textContent = "This notification will pop up in other pages to remind you of incomplete assignments that are due in less than 6 hours." /*It will notify again at 2 hours if the 'Remind 2x' option is on."*/;
}


isDomainCanvasPage();

function isDomainCanvasPage() {
    chrome.storage.sync.get(['custom_domain', 'dark_mode', 'dark_preset', 'device_dark', 'remind'], result => {
        options = result;
        if (result.custom_domain.length && result.custom_domain[0] !== "") {
            for (let i = 0; i < result.custom_domain.length; i++) {
                if (domain.includes(result.custom_domain[i])) {
                    startExtension();
                    return;
                }
            }

            // if the code reaches this point, its not a canvas page so run the reminders
            setTimeout(reminderWatch, 2000);
            setInterval(reminderWatch, 60000);
            // turn the reminders on/off if the option is changed
            chrome.storage.onChanged.addListener((changes) => {
                Object.keys(changes).forEach(key => {
                    if (key === "remind") reminderWatch();
                })
            })
        } else {
            setupCustomURL();
        }
    });
}

function startExtension() {
    // Remove footer robustly - run first so a crash below can't block it
    const removeFooter = () => {
        const footer = document.querySelector('footer#footer.ic-app-footer, footer#footer');
        if (footer) footer.remove();
    };
    removeFooter();
    let footerScheduled = false;
    const footerObserver = new MutationObserver(() => {
        // Canvas mutates the DOM constantly; only check for the footer at most once
        // per animation frame instead of running a querySelector on every mutation.
        if (footerScheduled) return;
        footerScheduled = true;
        requestAnimationFrame(() => {
            footerScheduled = false;
            removeFooter();
        });
    });
    footerObserver.observe(document.documentElement, { childList: true, subtree: true });

    // Start the submission-page "Back to Assignment" button watcher and the SPA
    // navigation hook immediately, before the async storage callbacks below.
    // These don't depend on `options`, and running them first means a throw in
    // any later init step can't prevent the button from appearing. The watcher
    // reads window.location.pathname live and uses a persistent MutationObserver
    // to (re)inject the button once the content container exists.
    setupNavigationListener();
    watchSubmissionPageButton();

    toggleDarkMode();

    // Include bg_opacity/bg_blur so setupBetterSidebar (called below) tints the
    // course-content panel with the user's slider values on first load, instead
    // of falling back to the defaults until a slider is touched.
    chrome.storage.sync.get(["better_sidebar", "sidebar_scale", "bg_opacity", "bg_blur"], result => {
        options = { ...options, ...result };
        ensureBetterSidebar();
    });

    chrome.storage.sync.get(null, result => {
        options = { ...options, ...result };
        applyTodoAlternateColors();
        toggleAutoDarkMode();
        // toggleScheduledReminders();
        getApiData();
        checkDashboardReady();
        loadCustomFont();
        applyAestheticChanges();
        watchNewCanvasButton();
        changeFavicon();
        updateReminders();
        applyCustomBackground();
        ensureBetterSidebar();
        watchSequenceFooter();
        watchProfileLogoutPageButton();
        watchGradeAnalytics();

        setupQuizSafeModeBanner();

        setupGlobalSearch();

        
        setTimeout(() => runDarkModeFixer(false), 800);
        setTimeout(() => runDarkModeFixer(false), 4500);
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

    // when an option is updated it will call the necessary functions again
    // so any changes made in the menu no longer require a refresh to apply

    Object.keys(changes).forEach(key => {
        switch (key) {
			case "dark_mode":
			case "dark_preset":
			case "device_dark":
				toggleDarkMode();
				applyTodoAlternateColors();
				// "Ignore card colors" picks black vs. theme text color based on dark
				// mode, so re-render the Better Todo list to keep it in sync.
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
				loadDashboardNotes();
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
				// The card overflow fix in applyAestheticChanges() depends on
				// assignments_due, so re-run it when that option toggles to keep
				// the overflow rule in sync without a page reload.
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
				// Stretch or reset card heights in place instead of rebuilding rows.
				equalizeCardHeights();
				break;
			case "custom_cards":
				customizeCards();
				// Hiding/unhiding a card changes which courses appear in the todo
				// list and the progress display, so re-render them immediately.
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
			// case "todo_overdues":
			case "todo_hide_feedback":
			case "todo_full_height":
			case "todo_ignore_card_colors":
			case "todo_remove_icons":
			case "custom_cards_3":
				moreAnnouncementCount = 0;
				moreAssignmentCount = 0;
				// loadBetterTodo();
				clearTodoList();
				createTodoSections(document.querySelector("#canvasrefined-todo-list"));
				break;
			case "gpa_calc":
			case "gpa_calc_prepend":
			case "gpa_calc_weighted":
			case "gpa_calc_cumulative":
				if (!grades) getGrades();
				setupGPACalc();
				break;
			case "gpa_calc_bounds":
				calculateGPA2();
				break;
			case "custom_font":
				loadCustomFont();
				break;
			case "remlogo":
			case "disable_color_overlay":
			case "condensed_cards":
			case "full_width":
			case "center_cards":
			case "custom_styles":
				applyAestheticChanges();
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
			case "customCardStyles":
				// Coalesce rapid card-style edits (e.g. holding the arrow keys on a
			// number input) into a single applyAestheticChanges() call. Each
			// storage onChanged event would otherwise re-run the dashboard style
			// pass immediately; a ~150ms cooldown is barely noticeable but keeps
			// the page from thrashing while the user is still adjusting values.
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
                    // toggle progress rings immediately
                    const placeholder = document.getElementById("better-todo-progress-placeholder");
                    if (!placeholder) break;
                    if (progressRingsEnabled()) {
                        if (typeof assignments?.then === 'function') {
                            assignments.then(data => {
                                const courseId = getCurrentCourseId();
                                const scopedData = getTodoScopedData(data, courseId);
                                renderProgressRings(placeholder, scopedData);
                            });
                        }
                    } else {
                        placeholder.innerHTML = "";
                    }
                    break;
                }
			case "better_sidebar":
                if (options.better_sidebar) {
                    ensureBetterSidebar();
                } else {
                    resetBetterSidebarLayout();
                }
				break;
            case "grade_analytics":
                watchGradeAnalytics();
                break;
            case "grade_analytics_zones":
                // Colored 10% zones on the line chart — just redraw the charts.
                if (gradeAnalyticsActive() && gaOpen && gaData) renderGradeAnalytics();
                break;
            case "quiz_safe_mode":
                // Toggling safe mode changes which features run on quiz pages; reload
                // so the gating is applied cleanly.
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
    // Quiz safe mode: don't replace the Canvas sidebar on quiz pages.
    if (quizSafeModeActive()) return;
    if (document.querySelector("#better-sidebar-container")) return;
    if (!document.querySelector("#wrapper") || !document.querySelector(".ic-Layout-contentWrapper")) return;
    setupBetterSidebar(getSidebarLayoutMode());
}

async function applyCustomBackground() {
    // Quiz safe mode: leave the quiz page background untouched.
    if (quizSafeModeActive()) return;
    // let style = document.querySelector("#DashboardCard_Container")
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
    // Opacity sliders (0-100). 100 = fully opaque surface, 0 = fully transparent
    // so the background image shows through. Only emitted while a background is
    // active, since transparency without an image just exposes the dark body.
    const bgOpacity = Math.max(0, Math.min(100, Number(options.bg_opacity ?? 65)));
    const sidebarOpacity = Math.max(0, Math.min(100, Number(options.sidebar_opacity ?? 100)));
    const bgTransparent = 100 - bgOpacity;
    const sidebarTransparent = 100 - sidebarOpacity;
    // Blur sliders (px). Pairs with opacity: blur only has a visible effect when
    // the surface is semi-transparent (opacity < 100) so the background behind
    // shows through and gets blurred. Default 8px on content surfaces preserves
    // the previous dashboard-header glass look; sidebar defaults to none.
    const bgBlur = Math.max(0, Math.min(30, Number(options.bg_blur ?? 8)));
    const sidebarBlur = Math.max(0, Math.min(30, Number(options.sidebar_blur ?? 0)));
    // Card transparency mirrors the content-panel glass effect (bg_opacity/
    // bg_blur) but applies it to dashboard course cards (.ic-DashboardCard).
    // Only active when the user explicitly enables it, since transparent cards
    // over a busy background can hurt legibility.
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
            /* backdrop-filter: blur(10px) !important; */
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
        /* Dashboard list view (planner). Canvas paints each day block an
           opaque theme color, so with a background image the whole list reads
           as one solid slab that hides the image — unlike card view, where
           the glass header and (optionally) translucent cards let it show
           through. Give each day group the same glass treatment as the module
           panels (color-mix tint + slider blur + rounded border) so the
           background peeks through between the day cards. */
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
        /* Inner surfaces Canvas keeps opaque (the "Show N completed
           item" facade, "Nothing Planned" filler, and the Today/Add To Do
           header cluster that sits on the glass dashboard header bar):
           flatten them so the glass behind shows through. The course-
           grouping label instead gets a subtle chip behind the course name —
           it sits over the course hero image, so without a backdrop the
           text can be hard to read on busy images. */
        #dashboard-planner .CompletedItemsFacade-styles__root,
        #dashboard-planner .EmptyDays-styles__nothingPlanned,
        #dashboard-planner-header .PlannerHeader-styles__root {
            background: transparent !important;
        }
        #dashboard-planner .Grouping-styles__title {
            background: var(--bcbackground-1) !important;
            border-radius: 6px !important;
        }
        /* Item-row hover: subtle tint on the glass instead of Canvas's flat
           gray, so rows feel alive on the translucent day cards. */
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
        /* Native left nav column: #left-side > #sticky-container.ic-sticky-frame
           (the course/account/group menu links). Tint the whole #left-side column
           rather than the inner .ic-sticky-frame, whose height only wraps its
           links — the column spans the full viewport height like the other
           sidebars, at the same bg_opacity/bg_blur as the Better Todo List
           panel. Without this, a custom background (most visible in light mode)
           shows through untinted behind the nav links. */
        #left-side {
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%) !important;
        }
        /* Recent feedback lives in #right-side. The dark-mode CSS
           (darkmodecss.js) recolors its text, but those rules are dark-mode-
           only — so in light mode + custom background the sub-text (context,
           grade, quote) keeps Canvas's default gray on the now-translucent
           panel and becomes hard to read. Recolor to the theme text color so
           it stays readable in both modes whenever a background is active.
           Mirrors the dark-mode selectors; redundant (same value) in dark mode. */
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
        /* Native global nav sidebar. color-mix only accepts a solid color, so
           gradient/image sidebars keep their existing look (rule is invalid and
           ignored). At 100% opacity this is equivalent to var(--bcsidebar).
           Sidebar blur only shows when sidebar opacity < 100.
           The icon/text colors are recolored to var(--bcsidebar-text) to match
           the background we just set — without this, light mode (where
           --bcsidebar is the light default #e3e3e3) would leave institution-
           themed light icons on a now-light background = white-on-white.
           Mirrors the dark-mode rules in css/darkmodecss.js. */
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
        /* Better sidebar. The inline background-color is var(--bcsidebar), so the
           !important here is required to override it. The same sidebar_opacity /
           sidebar_blur sliders drive both surfaces, so whichever sidebar is
           active (Better Sidebar when enabled, otherwise the native nav) picks
           up the value. */
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
        .item-group-condensed,
        .item-group-container {
            background: transparent !important;
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            border-radius: 12px !important;
            border: 1px solid color-mix(in srgb, var(--bcborders) 75%, transparent) !important;
            /* box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important; */
        }
        #context_modules_sortable_container {
            border: none !important;
            background: none !important;
            padding: 0 !important;
            /* backdrop-filter: blur(0) !important; */
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
        /* Course content pages (sidebar layout "course": /courses/:id/* and
           /profile): tint the #content.ic-Layout-contentMain panel so the
           bg_opacity/bg_blur sliders have a surface to control even without Better
           Sidebar. setupBetterSidebar only adds this panel when Better Sidebar is
           on; this mirrors its inline values so the panel shows regardless. When
           Better Sidebar is on, its inline !important overrides these (same values),
           so this rule is inert in that case. */
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
            /* backdrop-filter: blur(10px) saturate(115%) !important;
               -webkit-backdrop-filter: blur(10px) saturate(115%) !important; */
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
            /* backdrop-filter: blur(10px) !important; */
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

        /* Module panels keep the slider blur on hover (previously a fixed 5px). */
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
        /* Card header strip (the course-nickname bar under the hero). Canvas
           paints it a solid light color ($ic-color-light) and nothing overrides
           that in light mode, so with card transparency on it reads as a solid
           band across an otherwise translucent card. Mirror the card surface:
           transparent cards drop the strip's background so the card's glass
           (tint + blur already applied to .ic-DashboardCard) shows through;
           opaque cards paint it the same solid theme color as the card body.
           Dark mode already flattens this strip via darkmodecss.js, so this
           is inert there (same value). */
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

function checkDashboardReady() {
    const isDashboard = () => current_page == "/" || current_page == "" || /^\/courses\/(\d+)(?:\/|$)/.test(current_page);

    const callback = (mutationList) => {
        // Ignore attribute-only mutations; only structural (childList) changes matter here.
        let hasChildList = false;
        for (const mutation of mutationList) {
            if (mutation.type === "childList") { hasChildList = true; break; }
        }
        if (!hasChildList) return;

        if (isDashboard()) {
            // Debounce: a single setup pass per burst of mutations.
            if (dashboardReadyTimer) return;
            dashboardReadyTimer = setTimeout(() => {
                dashboardReadyTimer = null;

                const c = document.querySelector("#DashboardCard_Container");
                if (c) {
                    let cards = document.querySelectorAll(".ic-DashboardCard");
                    // Build a cheap signature of the current card set. The setup
                    // pass below mutates the cards' internals (assignment rows,
                    // grades, etc.) but never adds/removes the .ic-DashboardCard
                    // elements themselves, so the signature stays stable across
                    // our own mutations. It only changes when Canvas re-renders the
                    // dashboard (cards added/removed/reordered/replaced). Skipping
                    // when it's unchanged breaks the self-retriggering reflow loop.
                    let signature = cards.length + "";
                    for (let i = 0; i < cards.length; i++) {
                        const link = cards[i].querySelector(".ic-DashboardCard__link");
                        signature += "|" + (link ? link.getAttribute("href") : "");
                    }
                    // Canvas often re-renders the dashboard on a hard reload and
                    // replaces the .ic-DashboardCard nodes with fresh ones that have
                    // the same courses/links (so the signature is unchanged) but no
                    // longer carry our .canvasrefined-card-assignment marker. The
                    // signature guard alone would skip re-setup in that case, leaving
                    // card assignments empty until a popup toggle forces a reload.
                    // Re-run whenever any card is missing its marker too. This is safe
                    // from the self-retriggering reflow loop: after the pass every
                    // card has the marker, so our own subsequent mutation bursts skip.
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
            // Throttle sidebar setup checks on non-dashboard (course) pages instead
            // of calling ensureBetterSidebar() on every mutation burst.
            if (sidebarReadyTimer) return;
            sidebarReadyTimer = setTimeout(() => {
                sidebarReadyTimer = null;
                ensureBetterSidebar();
            }, 100);
        }
    };

    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

function recieveMessage(request, sender, sendResponse) {
    switch (request.message) {
        case ("getCards"):
            if (options["card_method_dashboard"] === true) {
                getCardsFromDashboard().then(() => sendResponse(true));
            } else {
                getCards().then(() => sendResponse(true));
            }
            return true; // keep the message channel open for async sendResponse
        case ("setcolors"): changeColorPreset(request.options); sendResponse(true); break;
        case ("getcolors"): getCardColors().then(colors => sendResponse(colors)); return true; // keep the message channel open for async sendResponse
        case ("inspect"): sendResponse(inspectDarkMode(true)); break;
        case ("fixdm"): sendResponse(runDarkModeFixer(true)); break;
		case ("updateBackground"): applyCustomBackground(); sendResponse(true); break;
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
    // Same display order changeColorPreset uses to APPLY palettes, so an
    // exported theme's color list maps back onto the same courses when
    // applied. Works in list mode too (API fallback inside getPaletteCards).
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
                    // backfill full name for cards created before this field existed
                    const full = card.querySelector(".ic-DashboardCard__header-title")?.textContent?.trim() || "";
                    if (full && cards[id].fullName !== full) {
                        cards[id].fullName = full;
                        newCards = true;
                    }
                }
                count++;
            });

            // there shouldn't be 0 cards
            if (count === 0) return;

            //delete cards that aren't on the dashboard anymore
            Object.keys(cards).forEach(key => {
                let found = false;
                // ignore cards that are not for the current url
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
        // sort cards by enrollment id (i think the higher the id, the more recent it is)
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

            //delete cards that aren't on the dashboard anymore
            Object.keys(cards).forEach(key => {
                let found = false;
                // ignore cards that are not for the current url
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
			// btn.style.filter = "none";
		}
		else {
			btn.firstElementChild.style.opacity = ".5";
			// btn.style.filter = "grayscale(100%)";
		}
	})

}
// better todo html
betterTodoFilter = "tasks";
// Timeframe filter for the upcoming Tasks tab. "all" = no limit; otherwise
// items are limited to those due on/before now+range (which also keeps
// overdue items). Only affects the Tasks (upcoming) tab; announcements and
// completed are unaffected because their dates are in the past.
let betterTodoTimeframe = "all";
const BETTER_TODO_TIMEFRAME_DAYS = {
	"1week": 7,
	"2week": 14,
	"month": 30,
	"2month": 60,
};
// null = show every class; a string courseId = only that class's tasks.
let betterTodoProgressFilter = null;
let domContainers = {};

// Better Todo timeframe filter, shared by the task list and the progress
// display so their counts always agree: keeps items due on/before now+range
// (overdue items are before now, so they are kept too). "all" keeps
// everything.
function applyTodoTimeframe(items) {
    betterTodoTimeframe = (options.todo_timeframe && Object.prototype.hasOwnProperty.call(BETTER_TODO_TIMEFRAME_DAYS, options.todo_timeframe)) ? options.todo_timeframe : "all";
    if (betterTodoTimeframe === "all") return items;
    const cutoff = Date.now() + (BETTER_TODO_TIMEFRAME_DAYS[betterTodoTimeframe] * 24 * 60 * 60 * 1000);
    return items.filter(item => new Date(item.plannable_date).getTime() <= cutoff);
}

// true when `courseId` is the dimmed-out class because another class is selected.
function progressFilterDim(courseId) {
    return betterTodoProgressFilter != null && String(courseId) !== String(betterTodoProgressFilter);
}
// Canvas serves gradable work as several plannable types: assignments, quizzes,
// and graded discussions (plus extension-created planner notes/custom tasks).
// All of these are "tasks" for the Better Todo list; announcements are
// handled separately.
function isTodoTaskType(item) {
    return item.plannable_type == "assignment"
        || item.plannable_type == "planner_note"
        || item.plannable_type == "quiz"
        || item.plannable_type == "discussion_topic";
}

// Make an element filter the todo list to one class on click. A no-op on
// course pages (where only one class is in scope anyway); toggles off when the
// active class is clicked again.
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
    // migrate unreleased string values from the prior experimental set
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

// Planner items for courses the user has hidden from their dashboard should
// not appear in the Better Todo list or its progress display. Personal
// tasks (planner notes with no course) are always kept.
function isCourseHidden(courseId) {
    if (courseId === undefined || courseId === null) return false;
    const cards = options.custom_cards || {};
    const card = cards[String(courseId)] || cards[courseId];
    return !!card && card.hidden === true;
}

function filterHiddenCourses(data) {
    return data.filter(item => {
        const cid = item.course_id || item.context_id || item?.plannable?.course_id;
        return !isCourseHidden(cid);
    });
}

// Build scoped data for the Better Todo list: drop hidden courses, then (on
// a course page) restrict to the current course.
function getTodoScopedData(data, courseId) {
    const visible = filterHiddenCourses(data);
    if (!courseId) return visible;
    return visible.filter(item => {
        const itemCourseId = parseInt(item.course_id || item.context_id || item?.plannable?.course_id);
        return itemCourseId === courseId;
    });
}

// Returns a Map of courseId (string) -> dashboard position index, read from
// the live dashboard card DOM order. Empty when not on the dashboard. Used
// to order the progress display the same way the user ordered their cards.
function getDashboardCourseOrder() {
    const order = new Map();
    document.querySelectorAll('.ic-DashboardCard').forEach((card, idx) => {
        const id = getCardId(card);
        if (id && id !== -1 && !order.has(String(id))) order.set(String(id), idx);
    });
    return order;
}

// Keep the centered % / count text clear of the progress graphics (the rings'
// center hole and the rainbow's bowl). The text block is measured after each
// render; if it would cross into the strokes its fonts are scaled down, and
// when the hole is really tight the count line is dropped before the % is
// allowed to shrink below readable size. Font sizes reset to the defaults on
// every render so the text grows back when there is room again.
// `neededRadius(hw, hh)` returns the distance from the hole's center to the
// farthest text corner; the text fits when that is <= availableRadius.
function fitProgressOverlayText(overlay, neededRadius, availableRadius) {
    const textWrap = overlay?.firstElementChild;
    const pct = overlay?.querySelector('.canvasrefined-progress-percent');
    const cnt = overlay?.querySelector('.canvasrefined-progress-count');
    if (!textWrap || !pct || !cnt || textWrap === pct || textWrap === cnt) return;
    // Undo any shrink applied by a previous render before measuring (these
    // are the default sizes the overlays are created with).
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
        // Too tight for both lines: drop the count and re-fit the % alone.
        cnt.style.display = 'none';
        w = textWrap.offsetWidth;
        h = textWrap.offsetHeight;
        needed = neededRadius(w / 2, h / 2);
        if (needed <= availableRadius) return;
        scale = availableRadius / needed;
    }
    pct.style.fontSize = `${Math.max(10, Math.round(20 * scale))}px`;
    if (cnt.style.display !== 'none') cnt.style.fontSize = `${Math.max(9, Math.round(12 * scale))}px`;
    // Final safety: if the readable-size floors above still don't fit, drop
    // the count line so the % is guaranteed to clear the strokes.
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
    overlay.querySelector('.canvasrefined-progress-count').textContent = `${completedAll}/${totalAll} done`;

    const stroke = 8;
    const gap = 4;
    const decrement = stroke + gap;
    const ringCount = shown.length;
    const startRadius = outerRadius - stroke / 2;
    // Keep the center hole big enough for the % / count text so the numbers
    // never sit on top of the ring strokes (fitProgressOverlayText shrinks the
    // text as a safety net for unusually wide labels).
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
        // transparent hit band on top so the whole ring is easy to click;
        // width tracks the ring spacing so adjacent bands don't overlap.
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

    // Shrink the % / count text if it would reach the innermost ring.
    fitProgressOverlayText(overlay, (hw, hh) => Math.hypot(hw, hh), Math.max(0, innerEdge - 2));

    const maxIdx = shown.length - 1;
    svg.querySelectorAll('circle').forEach(c => {
        const idx = parseInt(c.getAttribute('data-idx'));
        if (Number.isNaN(idx) || idx > maxIdx) c.remove();
    });
}

// Mode "rainbow": like "rings" (one arc per class) but condensed into a top
// half-circle and colored with a rainbow palette instead of course colors.
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
    // diameter line; arcs bulge UPWARD from here (into y < baseY)
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

    // shrink spacing if too many classes would overflow the inner radius;
    // keep the inner bowl big enough for the % / count text so the numbers
    // never sit on top of the arcs (fitProgressOverlayText shrinks the text
    // as a safety net for unusually wide labels).
    const minInnerRadius = 56;
    const requiredSpace = (ringCount - 1) * decrement;
    let adjustFactor = 1;
    if (requiredSpace > outerRadius - minInnerRadius) {
        adjustFactor = (outerRadius - minInnerRadius) / Math.max(1, (ringCount - 1) * decrement);
    }

    shown.forEach((entry, idx) => {
        const radius = outerRadius - idx * Math.max(1, Math.floor(decrement * adjustFactor));
        if (radius <= 0) return;
        // sweep-flag 1 => arc bulges UPWARD (top semicircle), drawn left -> right
        const arcPath = `M ${cx - radius} ${baseY} A ${radius} ${radius} 0 0 1 ${cx + radius} ${baseY}`;
        const prog = entry.total === 0 ? 0 : entry.completed / entry.total;
        const color = courseRingColor(entry.courseId, idx);

        // track: full semicircle, faded class color
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

        // progress arc: completed portion drawn from the left, via pathLength=100
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
        // transparent hit arc on top so the whole arc is easy to click.
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

    // drop arcs for classes no longer shown
    const maxIdx = shown.length - 1;
    svg.querySelectorAll('path').forEach(p => {
        const idx = parseInt(p.getAttribute('data-idx'));
        if (Number.isNaN(idx) || idx > maxIdx) p.remove();
    });

    // Overlay the percent/count text INSIDE the rainbow's semicircle hole
    // (the empty bowl bounded by the INNERMOST arc) instead of beneath it or
    // up among the arcs. The SVG is centered in the wrapper, so an absolutely-
    // positioned overlay covering the wrapper with flex centering aligns the
    // text to the SVG's horizontal center. Vertically we target the centroid of
    // the innermost semicircle (a touch above the diameter line) so the text
    // sits in the arc-free pocket near the bottom rather than near the apexes
    // of the inner arcs, where it would overlap the rainbow strokes.
    const step = Math.max(1, Math.floor(decrement * adjustFactor));
    const innerRadius = ringCount > 0 ? Math.max(1, outerRadius - (ringCount - 1) * step) : outerRadius;
    const holeCenterY = baseY - (4 * innerRadius) / (3 * Math.PI) + 6;
    const nudge = Math.round(holeCenterY - svgHeight / 2);
    let overlay = wrapper.querySelector('.canvasrefined-progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'canvasrefined-progress-overlay';
        overlay.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;transform:translateY(${nudge}px);`;
        // Same textWrap structure as rings mode so fitProgressOverlayText
        // measures the whole percent+count block, not just one line.
        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'text-align:center;color:var(--bctext-0);';
        textWrap.innerHTML = `<div class='canvasrefined-progress-percent' style='font-weight:700;font-size:20px;line-height:1;'></div><div class='canvasrefined-progress-count' style='font-size:12px;margin-top:3px;'></div>`;
        overlay.appendChild(textWrap);
        wrapper.appendChild(overlay);
    } else {
        overlay.style.transform = `translateY(${nudge}px)`;
    }
    overlay.querySelector('.canvasrefined-progress-percent').textContent = `${percent}%`;
    overlay.querySelector('.canvasrefined-progress-count').textContent = `${completedAll}/${totalAll} done`;

    // Shrink the % / count text if any corner would cross the innermost arc.
    // The text is centered at (cx, holeCenterY); the bowl is the semicircle
    // of innerRadius around (cx, baseY), so check the farthest text corner
    // against the bowl's inner edge.
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
        row.querySelector('.cr-pl-pct').textContent = `${pct}% (${entry.completed}/${entry.total})`;
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

// Mode "line": one horizontal bar where each class's COMPLETED portion is packed
// to the left (full course color) and its UNCOMPLETED portion to the right
// (faded course color), with no gaps between segments. Overall % shown above.
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
    box.querySelector('.cr-ol-pct').textContent = `${percent}% (${completedAll}/${totalAll})`;
    // Clicking the "Overall" header clears the active class filter.
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
        // position:relative so absolutely-positioned segments anchor to it
        bar.style.cssText = 'position:relative;width:100%;height:14px;border-radius:999px;overflow:hidden;background:var(--bcbackground-1);';
        box.appendChild(bar);
    }

    // Build the segment list left -> right: ALL completed blocks first (each
    // class's full course color), then ALL remaining blocks (each class's faded
    // course color). This keeps every completed segment on the left and every
    // remaining segment on the right. Consecutive segments share edges, so
    // there are no gaps between them.
    const segs = [];
    let left = 0;
    // First pass: completed blocks for every class (left side).
    shown.forEach((entry, idx) => {
        const color = courseRingColor(entry.courseId, idx);
        const doneW = totalAll === 0 ? 0 : (entry.completed / totalAll) * 100;
        if (doneW > 0) { segs.push({ left, w: doneW, bg: color, courseId: entry.courseId }); left += doneW; }              // completed: full color
    });
    // Second pass: remaining blocks for every class (right side).
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

    // Apply the same timeframe filter the list uses so the counts in the
    // display match what's shown below it.
    const allAssignments = applyTodoTimeframe(scopedData.filter(item => isTodoTaskType(item)));

    const groups = {};
    allAssignments.forEach(item => {
        const cid = String(item.course_id || item.context_id || item.plannable?.course_id || "personal");
        groups[cid] = groups[cid] || [];
        groups[cid].push(item);
    });

    const entries = Object.keys(groups).map(cid => {
        const arr = groups[cid];
        const completed = arr.filter(it => (it.submissions?.submitted || it.planner_override?.marked_complete)).length;
        return { courseId: cid, total: arr.length, completed };
    }).filter(e => e.total > 0);

    if (!entries.length) { container.innerHTML = ""; return; }

    // Order courses to match the user's dashboard card order. Courses that
    // aren't on the dashboard (personal tasks, dropped courses) sort after
    // dashboard courses, keeping their relative order; ties fall back to
    // most assignments first so the display stays stable.
    const dashboardOrder = getDashboardCourseOrder();
    entries.sort((a, b) => {
        const ai = dashboardOrder.has(a.courseId) ? dashboardOrder.get(a.courseId) : Infinity;
        const bi = dashboardOrder.has(b.courseId) ? dashboardOrder.get(b.courseId) : Infinity;
        if (ai !== bi) return ai - bi;
        return b.total - a.total;
    });
    const shown = entries.slice(0, 6);

    const totalAll = shown.reduce((s, e) => s + e.total, 0);
    const completedAll = shown.reduce((s, e) => s + e.completed, 0);
    const percent = totalAll === 0 ? 0 : Math.round((completedAll / totalAll) * 100);

    // wrapper reused across renders; clear on mode switch so each mode rebuilds fresh DOM
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
        throw new Error("Task title is required.");
    }

    if (!dateValue || !timeValue) {
        throw new Error("Please choose both a date and time.");
    }

    const localDateTime = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(localDateTime.getTime())) {
        throw new Error("Invalid task date.");
    }

    return {
        title,
        details,
        link,
        courseId: courseIdRaw ? parseInt(courseIdRaw) : null,
        // Canvas accepts local timestamp strings more reliably than UTC ISO strings for planner notes.
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

    let lastError = "Canvas rejected task creation.";
    for (const attempt of attempts) {
        const response = await fetch(domain + "/api/v1/planner_notes", {
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
            // Keep prior error text when body is not JSON.
        }
    }

    throw new Error(lastError || "Canvas rejected task creation.");
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
    if (!id) throw new Error("Missing task id.");
    const csrfToken = CSRFtoken();
    // Canvas's planner_notes update endpoint permits FLAT parameters
    // (title, details, course_id, todo_date) — NOT nested under planner_note.
    // Sending nested params is silently ignored, so note.update({}) runs and
    // returns 200 with the unchanged note, making edits appear to "not save".
    // Always include details (even empty) so the field can be cleared.
    const plannerNote = {
        title: payload.title,
        todo_date: payload.todoDate,
        details: payload.details || "",
        // Sending course_id as empty string disassociates the note from its course.
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

    let lastError = "Canvas rejected task update.";
    for (const attempt of attempts) {
        const response = await fetch(`${domain}/api/v1/planner_notes/${id}`, {
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
            // Keep prior error text when body is not JSON.
        }
    }

    throw new Error(lastError || "Canvas rejected task update.");
}

async function deleteCanvasPlannerNote(id) {
    if (!id) throw new Error("Missing task id.");
    const csrfToken = CSRFtoken();
    const response = await fetch(`${domain}/api/v1/planner_notes/${id}`, {
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

    let lastError = "Canvas rejected task deletion.";
    try {
        const errData = await response.json();
        if (errData?.errors?.length) lastError = errData.errors.join(" ");
        else if (errData?.message) lastError = errData.message;
    } catch (_) { /* ignore */ }
    throw new Error(lastError);
}

/* Scroll a task form field into view, leaving room below for the native date/time picker. */
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
    // Hidden courses should not be offered as a target for custom tasks.
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

    courseSelect.innerHTML = '<option value="">Personal task</option>';
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
            textContent: "+ Add Task",
            style: "width:100%;padding:6px 8px;cursor:pointer;",
        });

        const menu = makeElement("div", actionsRow, {
            id: "better-todo-add-task-menu",
            className: "canvasrefined-add-assignment",
        });

        menu.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid #c7cdd1;border-radius:6px;background:var(--bcbackground-2);position:relative;">
                <button id="better-todo-add-task-close" type="button" class="canvasrefined-custom-btn" title="Close" style="position:absolute;top:4px;right:6px;padding:0 6px;cursor:pointer;line-height:18px;font-size:14px;color:var(--bctext-1);">\u00d7</button>
                <input type="text" id="better-todo-new-task-title" class="canvasrefined-custom-input" placeholder="Task title" maxlength="255">
                <textarea id="better-todo-new-task-details" class="canvasrefined-custom-input" placeholder="Details (optional)" style="min-height:70px;resize:vertical;padding-top:6px;padding-bottom:6px;"></textarea>
                <select id="better-todo-new-task-course" class="canvasrefined-custom-input"></select>
                <div style="display:flex;gap:6px;">
                    <input type="date" id="better-todo-new-task-date" class="canvasrefined-custom-input">
                    <input type="time" id="better-todo-new-task-time" class="canvasrefined-custom-input">
                </div>
                <input type="text" id="better-todo-new-task-link" class="canvasrefined-custom-input" placeholder="Link (optional)" maxlength="2048">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span id="better-todo-add-task-status" style="font-size:12px;color:var(--bctext-0);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button id="better-todo-add-task-delete" class="canvasrefined-custom-btn" style="padding:4px 10px;cursor:pointer;display:none;color:#db3754;" type="button" title="Delete this custom task">Delete</button>
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
                    status.textContent = "Task updated.";
                } else {
                    const created = await createCanvasPlannerNote(payload);
                    const newId = created?.id;
                    if (newId != null) saveCustomTaskLink(newId, payload.link);
                    status.textContent = "Task created.";
                }
                status.style.color = "#198754";
                resetTaskFormToCreate(menu);
                menu.classList.remove("canvasrefined-custom-open");

                getAssignments();
                clearTodoList();
                createTodoSections(location);
            } catch (e) {
                status.textContent = e?.message || "Could not save task.";
                status.style.color = "#db3754";
            } finally {
                submitButton.disabled = false;
                if (deleteButton) deleteButton.disabled = false;
            }
        };

        menu.querySelector("#better-todo-add-task-submit").addEventListener("click", submitTask);

        // Close (×) button: dismiss the form without creating/editing a task.
        menu.querySelector("#better-todo-add-task-close")?.addEventListener("click", () => {
            resetTaskFormToCreate(menu);
            menu.classList.remove("canvasrefined-custom-open");
        });

        // Reposition the field on focus so the picker opens on screen.
        ["#better-todo-new-task-date", "#better-todo-new-task-time"].forEach((sel) => {
            const input = menu.querySelector(sel);
            input?.addEventListener("focus", () => scrollTodoIntoView(input, false));
        });

        menu.querySelector("#better-todo-add-task-delete").addEventListener("click", async () => {
            const editingId = menu.dataset.editingId || null;
            if (!editingId) return;
            if (!confirm("Delete this custom task? This cannot be undone.")) return;
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
                status.textContent = e?.message || "Could not delete task.";
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

// Reset the shared add/edit task form back to a blank "create" state.
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
    if (submit) submit.textContent = "Create";
    delete menu.dataset.editingId;
}

// Open the shared form pre-filled with a custom task for editing or deletion.
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
    menu.querySelector("#better-todo-add-task-submit").textContent = "Save";
    const status = menu.querySelector("#better-todo-add-task-status");
    if (status) { status.textContent = ""; status.style.color = ""; }
    menu.classList.add("canvasrefined-custom-open");
    scrollTodoIntoView(menu, true);
}

async function createTodoSections(location) {
	if (!location.querySelector("#better-todo-header")) {
		let header = makeElement("div", location, { id: "better-todo-header" });
		header.style = "display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bcbackground-1);padding-bottom:-2px;";
		let today = new Date();
		today.setHours(0,0,0,0);
		const todayString = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        header.innerHTML = `
                <h2 style="border:none !important;padding: 0">Tasks</h2>
                <h2 style="border:none !important;padding: 0">${todayString}</h2>
            `;

        // placeholder for progress rings above the tab/filter control
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
	assignments.then(data => {
        const courseId = getCurrentCourseId();
        const scopedData = getTodoScopedData(data, courseId);

        // Clicking a color in the progress display filters the list to that
        // one class. The filter only makes sense where multiple classes show
        // (dashboard/profile), so it is cleared on course pages.
        if (courseId) betterTodoProgressFilter = null;
        const displayData = (betterTodoProgressFilter == null)
            ? scopedData
            : scopedData.filter(item => {
                const cid = String(item.course_id || item.context_id || item.plannable?.course_id || "personal");
                return cid === String(betterTodoProgressFilter);
            });

        announcements = displayData.filter(item => item.plannable_type == "announcement");
        assignmentsDue = displayData.filter(item => isTodoTaskType(item) && !item.submissions?.submitted && !item.planner_override?.marked_complete);
        completed = displayData.filter(item => isTodoTaskType(item) && (item.submissions?.submitted || item.planner_override?.marked_complete));
        // The timeframe is a persisted Better Todo List sub-option set in the
        // popup. Read the current value each render so popup changes apply on
        // the next render. Only the Tasks tab is affected (announcements and
        // the completed tab always show everything).
        assignmentsDue = applyTodoTimeframe(assignmentsDue);
		// console.log("assignments", assignmentsDue);
		// console.log("announcements", announcements);
		// console.log("completed", completed);

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
            if (key == "Later") label = "Due <strong>Later</strong>";
            if (key == "-1") label = "<strong>Overdue</strong>";
            else if (key == "0") label = "Due <strong>Today</strong>";
            else if (key == "1") label = "Due <strong>Tomorrow</strong>";
            else if (key >= 2 && key < 7) label = "Due <strong>" + key + " days</strong>";
            else if (key >= 7 && key < 30) label = "Due <strong>" + key/7 + " weeks</strong>";
            else if (key == "30") label = "Due <strong>1 month</strong>";
            else label = "<strong>" + key + "</strong>";
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

        // Only show the Add Task control on the Assignments (tasks) tab.
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
		if (options.todo_full_height) {
			sidebar.style.minHeight = "100vh";
		} else {
			sidebar.style.minHeight = "";
		}
		if (options.todo_separate_scrollbar) {
			sidebar.style.position = "sticky";
			sidebar.style.top = "0";
			sidebar.style.height = "100vh";
			sidebar.style.overflowY = "auto";
		} else {
			sidebar.style.position = "";
			sidebar.style.top = "";
			sidebar.style.height = "";
			sidebar.style.overflowY = "";
			// maybe invisible scrollbar?
		}
	});
}

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
    const seeMoreBtn = document.getElementById("better-todo-see-more");
    if (seeMoreBtn) {
        seeMoreBtn.remove();
    }

	document.getElementById("better-todo-main").querySelectorAll(".todo-group-list").forEach(list => {
		list.innerHTML = "";
	});
	document.querySelectorAll(".better-todo-dueheader").forEach(header => {
		header.remove();
	});
}

// "Alternate colors" (Better Todo List, light mode only): recolors the main
// todo-list icon fill to white instead of the default --bctext-0, so icons
// stay visible on lighter course-color strips. Implemented through a CSS
// variable so toggling the option or dark mode recolors existing icons live
// without a re-render.
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

// --- Hover preview (Better Todo List: "Previews on hover") ---
// The todo list is rendered by createTodoSections -> populateAssignments /
// populateAnnouncements (the old loadBetterTodo renderer is no longer called).
// A single shared, body-level tooltip is reused across items so it is never
// clipped by the sidebar's scroll/overflow containers. It reuses the
// .canvasrefined-hover-preview class so existing light/dark styling applies.
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
    // Custom task (planner note): the description is already on the planner
    // item as item.plannable.details, so no API call is needed.
    if (type === "planner_note" || (item.planner_override && item.planner_override.custom === true)) {
        const raw = item.plannable && item.plannable.details ? item.plannable.details : "";
        const text = stripHtmlPreview(raw) || "No details given";
        todoPreviewCache.set(key, text);
        return text;
    }
    let url = null;
    let field = "description";
    if (type === "assignment") {
        url = `${domain}/api/v1/courses/${item.course_id}/assignments/${id}`;
    } else if (type === "quiz") {
        url = `${domain}/api/v1/courses/${item.course_id}/quizzes/${id}`;
    } else if (type === "discussion_topic" || type === "announcement") {
        url = `${domain}/api/v1/courses/${item.course_id}/discussion_topics/${id}`;
        field = "message";
    }
    if (!url) {
        const text = "No preview available";
        todoPreviewCache.set(key, text);
        return text;
    }
    try {
        const data = await getData(url);
        const raw = data && data[field] ? data[field] : "";
        const text = stripHtmlPreview(raw) || "No details given";
        todoPreviewCache.set(key, text);
        return text;
    } catch (e) {
        return "Couldn't load preview";
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
    title.textContent = item.plannable && item.plannable.title ? item.plannable.title : "";
    text.textContent = "Loading…";
    el.style.display = "block";
    positionTodoPreview(el, anchor);
    const content = await getTodoPreviewText(item);
    if (token !== todoPreviewToken) return; // a newer hover (or hide) superseded this one
    if (el.style.display !== "block") return; // user already moved away
    text.textContent = content;
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

// Task-type icons for the Better Todo task rows (quiz / graded discussion),
// adapted from the legacy todo renderer so quizzes and discussions get a
// recognizable icon instead of the generic assignment one. Same fill
// variable as the assignment icon so "Remove icons"/theme tweaks apply.
const TODO_QUIZ_ICON_SVG = '<svg fill="var(--cr-todo-icon)" label="Quiz" name="IconQuiz" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><g fill-rule="evenodd" stroke="none" stroke-width="1"><path d="M746.255375,1466.76417 L826.739372,1547.47616 L577.99138,1796.11015 L497.507383,1715.51216 L746.255375,1466.76417 Z M580.35118,1300.92837 L660.949178,1381.52637 L329.323189,1713.15236 L248.725192,1632.55436 L580.35118,1300.92837 Z M414.503986,1135.20658 L495.101983,1215.80457 L80.5979973,1630.30856 L0,1549.71056 L414.503986,1135.20658 Z M1119.32036,264.600006 C1475.79835,-91.8779816 1844.58834,86.3040124 1848.35034,88.1280123 L1848.35034,88.1280123 L1865.45034,96.564012 L1873.88634,113.664011 C1875.71034,117.312011 2053.89233,486.101999 1697.30034,842.693987 L1697.30034,842.693987 L1550.69635,989.297982 L1548.07435,1655.17196 L1325.43235,1877.81395 L993.806366,1546.30196 L415.712386,968.207982 L84.0863971,636.467994 L306.72839,413.826001 L972.602367,411.318001 Z M1436.24035,1103.75398 L1074.40436,1465.70397 L1325.43235,1716.61796 L1434.30235,1607.74796 L1436.24035,1103.75398 Z M1779.26634,182.406009 C1710.18234,156.41401 1457.90035,87.1020124 1199.91836,345.198004 L1199.91836,345.198004 L576.90838,968.207982 L993.806366,1385.10597 L1616.70235,762.095989 C1873.65834,505.139998 1804.68834,250.920007 1779.26634,182.406009 Z M858.146371,525.773997 L354.152388,527.597997 L245.282392,636.467994 L496.310383,887.609985 L858.146371,525.773997 Z"></path><path d="M1534.98715,372.558003 C1483.91515,371.190003 1403.31715,385.326002 1321.69316,466.949999 L1281.22316,507.305998 L1454.61715,680.585992 L1494.97315,640.343994 C1577.16715,558.035996 1591.87315,479.033999 1589.82115,427.164001 L1587.65515,374.610003 L1534.98715,372.558003 Z"></path></g></g></svg>';
const TODO_DISCUSSION_ICON_SVG = '<svg fill="var(--cr-todo-icon)" name="IconDiscussion" viewBox="0 0 1920 1920" rotate="0" aria-hidden="true" role="presentation" focusable="false"  ><g role="presentation"><path d="M677.647059,16 L677.647059,354.936471 L790.588235,354.936471 L790.588235,129.054118 L1807.05882,129.054118 L1807.05882,919.529412 L1581.06353,919.529412 L1581.06353,1179.29412 L1321.41176,919.529412 L1242.24,919.529412 L1242.24,467.877647 L677.647059,467.877647 L0,467.877647 L0,1484.34824 L338.710588,1484.34824 L338.710588,1903.24706 L756.705882,1484.34824 L1242.24,1484.34824 L1242.24,1032.47059 L1274.99294,1032.47059 L1694.11765,1451.59529 L1694.11765,1032.47059 L1920,1032.47059 L1920,16 L677.647059,16 Z M338.789647,919.563294 L903.495529,919.563294 L903.495529,806.622118 L338.789647,806.622118 L338.789647,919.563294 Z M338.789647,1145.44565 L677.726118,1145.44565 L677.726118,1032.39153 L338.789647,1032.39153 L338.789647,1145.44565 Z M112.941176,580.705882 L1129.41176,580.705882 L1129.41176,1371.40706 L710.4,1371.40706 L451.651765,1631.05882 L451.651765,1371.40706 L112.941176,1371.40706 L112.941176,580.705882 Z" fill-rule="evenodd" stroke="none" stroke-width="1"></path></g></svg>';

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
		assignmentCount++;
		let isHidden = assignmentCount > maxElements;

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

			// targetContainer.wrapper.style.display = "block";
			assignment = makeElement("div", targetContainer.listContainer, {
				class: "better-todo-assignment",
			});
			if (isHidden) {
				assignment.style.display = "none";
				assignment.classList.add("better-todo-hidden-assignment");
			}
		}

		const courseColor =
			options.custom_cards_3?.[String(item.course_id)]?.color ??
			options.custom_cards_3?.[item.course_id]?.color ??
			options.custom_cards_3?.[item.plannable.course_id]?.color ??
			"#cccccc";

        // "Ignore card colors" (Better Todo List): when on, the class name is
        // rendered black in light mode or the theme text color in dark mode
        // instead of the course's card color.
        const classNameColor = options.todo_ignore_card_colors
            ? (options.dark_mode === true ? "var(--bctext-0)" : "#000000")
            : courseColor;
        // "Remove icons" (Better Todo List): when on, the task-type icon is
        // omitted from the colored strip on the left of each task.
        const removeIcons = options.todo_remove_icons === true;

        const isCustomTask = item.plannable_type == "planner_note" || item.planner_override?.custom === true;
        const taskHref = isCustomTask ? customTaskHref(item) : (domain + item.html_url);
        const editButtonSvg = isCustomTask
            ? `<svg class="better-todo-assignment-edit" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:18px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'" title="Edit this custom task"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
            : "";
        const iconSize = isCustomTask ? 26 : 20;
        const iconLeftOffset = isCustomTask ? 2 : 5;
        const taskIcon = removeIcons ? "" : isCustomTask
            ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <path d="M19.8201 14H15.6001C15.04 14 14.76 14 14.5461 14.109C14.3579 14.2049 14.2049 14.3578 14.1091 14.546C14.0001 14.7599 14.0001 15.0399 14.0001 15.6V19.82M20 12.7269V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H12.9496C13.4578 20 13.7118 20 13.9498 19.9407C14.1608 19.8882 14.3618 19.8016 14.5449 19.6844C14.7515 19.5522 14.926 19.3675 15.2751 18.9983L19.1254 14.9252C19.4486 14.5833 19.6101 14.4124 19.7255 14.2156C19.8278 14.041 19.903 13.8519 19.9486 13.6548C20 13.4325 20 13.1973 20 12.7269Z" stroke="var(--cr-todo-icon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>`
            : (item.plannable_type == "quiz" ? TODO_QUIZ_ICON_SVG : item.plannable_type == "discussion_topic" ? TODO_DISCUSSION_ICON_SVG : `<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
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
					<span style="color:${classNameColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${item.context_name}</span>
					<a href="${taskHref}" style="color:inherit;text-decoration:none;font-weight:bold;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;padding-right:28px;margin-top:-5px;">${item.plannable.title}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}</span>
				</div>
				${editButtonSvg}
				<svg class="better-todo-assignment-checkmark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:0px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'">
					<g id="SVGRepo_bgCarrier" stroke-width="0"></g>
					<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
					<g id="SVGRepo_iconCarrier"> <g id="Interface / Checkbox_Check">
						<path id="Vector" d="M8 12L11 15L16 9M4 16.8002V7.2002C4 6.08009 4 5.51962 4.21799 5.0918C4.40973 4.71547 4.71547 4.40973 5.0918 4.21799C5.51962 4 6.08009 4 7.2002 4H16.8002C17.9203 4 18.4796 4 18.9074 4.21799C19.2837 4.40973 19.5905 4.71547 19.7822 5.0918C20 5.5192 20 6.07899 20 7.19691V16.8036C20 17.9215 20 18.4805 19.7822 18.9079C19.5905 19.2842 19.2837 19.5905 18.9074 19.7822C18.48 20 17.921 20 16.8031 20H7.19691C6.07899 20 5.5192 20 5.0918 19.7822C4.71547 19.5905 4.40973 19.2842 4.21799 18.9079C4 18.4801 4 17.9203 4 16.8002Z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
					</g></g>
				</svg>
			</div>
		</div>
		`;
		assignment.querySelector(".better-todo-assignment-checkmark").addEventListener("click", () => {
			console.log("marking ", item.plannable.title, " as complete");
			markAs(item, assignment.firstElementChild);
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

	if (document.getElementById("better-todo-see-more")) {
		document.getElementById("better-todo-see-more").remove();
	}

	if (assignmentCount > maxElements) {
		let isExpanded = false;

		let seeMoreButton = makeElement("button", document.getElementById("better-todo-main"), {
			textContent: `View More (${assignmentCount - maxElements})`,
			className: "canvasrefined-custom-btn",
			id: "better-todo-see-more",
			style: "width:100%;margin-top:15px;cursor:pointer;"
		})
		seeMoreButton.addEventListener("click", () => {
			if (!isExpanded) {
				document.querySelectorAll(".better-todo-hidden-assignment").forEach(element => element.style.display = "block");
				document.querySelectorAll(".better-todo-hidden-wrapper").forEach(element => element.style.display = "block");
				seeMoreButton.textContent = "View Less";
			} else {
				document.querySelectorAll(".better-todo-hidden-assignment").forEach(element => element.style.display = "none");
				document.querySelectorAll(".better-todo-hidden-wrapper").forEach(element => element.style.display = "none");
				seeMoreButton.textContent = `View More (${assignmentCount - maxElements})`;
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
		// console.log(domContainers)
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

		// "Ignore card colors": black in light mode, theme text color in dark.
		const classNameColor = options.todo_ignore_card_colors
			? (options.dark_mode === true ? "var(--bctext-0)" : "#000000")
			: courseColor;
		// "Remove icons": drop the announcement icon from the colored strip.
		const removeIcons = options.todo_remove_icons === true;

		let filter = "";
		if (item.plannable.read_state == "read") {
			filter = "filter: grayscale(40%);"
		}

		announcement.innerHTML = `
		<div style="display:flex;align-items:center;gap:5px;width:100%;height:60px;background:var(--bcbackground-2);border-radius:5px;${filter}">
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
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:${classNameColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${item.context_name}</span>
					<a href="${domain + item.html_url}" style="color:inherit;text-decoration:none;font-weight:bold;text-overflow:ellipsis;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-5px;">${item.plannable.title}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}</span>
				</div>
			</div>
		</div>
		`;
		attachTodoHoverPreview(announcement, item);
	});
}

function createConfettiBurst(targetElement, opts = {}) {
    try {
        if (options.todo_confetti === false) return;

        const count = opts.count || 48;
        const colors = opts.colors || ['#ff4d4f', '#ffc107', '#28a745', '#17a2b8', '#6f42c1', '#ff6b6b', '#ff8a65', '#ffd54f'];
        const rect = targetElement.getBoundingClientRect();
        const container = document.createElement('div');
        container.className = 'canvasrefined-confetti-container';
        container.style.position = 'fixed';
        container.style.left = '0';
        container.style.top = '0';
        container.style.pointerEvents = 'none';
        container.style.overflow = 'visible';
        container.style.zIndex = '2147483647';
        document.body.appendChild(container);

        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height * 0.35;
        const particles = [];

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'canvasrefined-confetti';
            const w = 4 + Math.floor(Math.random() * 7); // smaller pieces
            const h = Math.max(3, Math.floor(w * (0.4 + Math.random() * 0.8)));
            el.style.position = 'absolute';
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            el.style.background = colors[Math.floor(Math.random() * colors.length)];
            el.style.left = (originX - w / 2) + 'px';
            el.style.top = (originY - h / 2) + 'px';
            el.style.opacity = '1';
            el.style.borderRadius = Math.random() > 0.75 ? '50%' : '2px';
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
            el.style.transformOrigin = 'center center';
            el.style.willChange = 'transform, opacity';
            container.appendChild(el);

            const duration = 850 + Math.floor(Math.random() * 500);
            const delay = Math.floor(Math.random() * 90);
            const spread = opts.spread || 110;
            const horizontalBias = (Math.random() - 0.5) * 2;

            // Arc stays lower and wider than the old cone-shaped burst.
            const endX = originX + horizontalBias * (spread * (0.7 + Math.random() * 0.6));
            const endY = originY - (16 + Math.random() * 34);
            const ctrlX = originX + horizontalBias * (spread * 0.25) + (Math.random() - 0.5) * 14;
            const ctrlY = originY - (30 + Math.random() * 55);

            particles.push({
                el,
                delay,
                duration,
                originX,
                originY,
                ctrlX,
                ctrlY,
                endX,
                endY,
                rotate: (Math.random() * 260) - 130,
                scale: 0.8 + Math.random() * 0.5,
            });
        }

        const startTime = performance.now();
        let rafId = null;

        const animate = now => {
            let active = false;

            for (let i = particles.length - 1; i >= 0; i--) {
                const particle = particles[i];
                const elapsed = now - startTime - particle.delay;
                if (elapsed < 0) {
                    active = true;
                    continue;
                }

                const progress = Math.min(1, elapsed / particle.duration);
                const eased = 1 - Math.pow(1 - progress, 3);

                const x = (1 - eased) * (1 - eased) * particle.originX + 2 * (1 - eased) * eased * particle.ctrlX + eased * eased * particle.endX;
                const y = (1 - eased) * (1 - eased) * particle.originY + 2 * (1 - eased) * eased * particle.ctrlY + eased * eased * particle.endY;

                particle.el.style.transform = `translate(${Math.round(x - particle.originX)}px, ${Math.round(y - particle.originY)}px) rotate(${particle.rotate * eased}deg) scale(${particle.scale * (1 - eased * 0.15)})`;
                particle.el.style.opacity = String(1 - progress);

                if (progress < 1) {
                    active = true;
                } else {
                    particle.el.remove();
                    particles.splice(i, 1);
                }
            }

            if (active) {
                rafId = requestAnimationFrame(animate);
            } else {
                try { container.remove(); } catch (e) { /* ignore */ }
                if (rafId) cancelAnimationFrame(rafId);
            }
        };

        rafId = requestAnimationFrame(animate);

        // cleanup container after animations
        setTimeout(() => {
            try { container.remove(); } catch (e) { /* ignore */ }
        }, 2400);
    } catch (e) {
        console.error('confetti error', e);
    }
}

function markAs(item, element) {
	const csrfToken = CSRFtoken();
	const completeState = item.planner_override ? !item.planner_override.marked_complete : true;

    // --- Optimistic UI ---
    // Canvas's /planner/overrides endpoint occasionally returns 400 (Bad
    // Request) for both custom tasks and normal tasks, even though the action
    // is actually applied server-side shortly after. When that happens the
    // item would neither visually mark nor animate, and would later appear
    // "secretly complete" on reload. To avoid that confusing UX, we update the
    // UI as if the request succeeded immediately, and fire the actual API
    // call in the background for persistence.
    item.planner_override = item.planner_override || {};
    item.planner_override.marked_complete = completeState;
    element.style.transform = "translate(100%)";
    element.style.opacity = "0";

    // fire confetti only when marking complete (not when unmarking)
    if (completeState) {
        try { createConfettiBurst(element); } catch (e) { console.error('confetti trigger error', e); }
    }

    // update progress rings immediately so they animate while the item slides/fades
    const progressPlaceholder = document.getElementById("better-todo-progress-placeholder");
    if (progressPlaceholder && typeof assignments?.then === 'function' && progressRingsEnabled()) {
        assignments.then(data => {
            const courseId = getCurrentCourseId();
            const scopedData = getTodoScopedData(data.map(d => Object.assign({}, d)), courseId);

            // reflect the updated state for this item in the snapshot
            for (let i = 0; i < scopedData.length; i++) {
                if (scopedData[i].plannable_id === item.plannable_id && scopedData[i].plannable_type === item.plannable_type) {
                    scopedData[i].planner_override = scopedData[i].planner_override || {};
                    scopedData[i].planner_override.marked_complete = item.planner_override.marked_complete;
                    break;
                }
            }

            renderProgressRings(progressPlaceholder, scopedData);
        });
    }

    setTimeout(() => {
        clearTodoList();
        createTodoSections(document.querySelector("#canvasrefined-todo-list"));
    }, 400);

    // --- Persistence (background, best-effort) ---
    // A 400/non-OK response is treated as a soft success because Canvas often
    // completes the override server-side anyway; we already reflected the
    // change in the UI, so just log it.
    fetch(domain + "/api/v1/planner/overrides" + (item.planner_override && item.planner_override.id ? "/" + item.planner_override.id : ""), {
        method: item.planner_override && item.planner_override.id ? "PUT" : "POST",
        headers: {
            "content-type":"application/json",
            "accept":"application/json",
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
            id: item.planner_override && item.planner_override.id ? item.planner_override.id : null,
            marked_complete: completeState,
            plannable_id: item.plannable_id,
            plannable_type: item.plannable_type
        })
    })
    .then(resp => {
        if (resp.ok) {
            console.log("marked as complete");
        } else {
            // Non-OK (e.g. 400) is logged but not surfaced: the UI already
            // reflects the intended state, and Canvas typically applies the
            // override server-side regardless.
            console.warn("planner override request returned", resp.status, "— UI already updated optimistically");
        }
    })
    .catch(err => console.error("error marking as complete", err));

}

function createTodoViewMore(location, type) {
    let viewMoreButton = makeElement("button", location, { "className": "canvasrefined-custom-btn canvasrefined-viewmore-btn", "textContent": "View More" });
    //viewMoreButton.classList.add("canvasrefined-viewmore-btn");
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

// better todo init
function setupBetterTodo() {
    // Better Todo list is removed from quizzes (it interferes with the quiz page).
    if (isQuizPage()) return;
    if (options.better_todo !== true || isGradesPage()) return;
    if (document.querySelector('#canvasrefined-todo-list')) return;
    let list = document.querySelector("#right-side");
    if (!list) return;
    //if (!list || list.childElementCount === 0 || list.children[0].id === "canvasrefined-todo-list") return;
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

// Re-apply the tinted course-content panel when the background opacity slider
// changes. Only the better sidebar (course mode) gives .ic-Layout-contentMain a
// tinted panel in the first place (see setupBetterSidebar). Re-applies both the
// opacity and blur sliders so changing either updates the panel live.
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
        // document.getElementById("not_right_side").style.setProperty("display", "none", "important");
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
        // The rail must always render leftmost. Course-layout pages already
        // prepend it into #left-side; dash-layout pages that still have a
        // native left nav (accounts, groups, etc.) must too — otherwise the
        // native #left-side column (made position:static above) flows before
        // #not_right_side and shows up to the LEFT of the Better Sidebar,
        // looking like a competing sidebar once the custom background tints
        // it. Prepending keeps the order: [Better Sidebar rail][native nav].
        const sidebarParent = leftSide ? leftSide : mainWrapper;
        if (leftSide) {
            leftSide.style.display = "flex";
            leftSide.style.flexDirection = "row";
            leftSide.style.alignItems = "stretch";
            leftSide.style.minWidth = "0";
            leftSide.style.gap = "0";
        }
        document.querySelector(".ic-app-nav-toggle-and-crumbs")?.style.setProperty("display", "none");
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
    // Always clear any existing badge first so a drop to 0 unread removes it.
    button.querySelector(".better-sidebar-badge")?.remove();
    if (!count) return;
    makeElement("div", button, {
        className: "better-sidebar-badge",
        style: "position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background-color:#ff0000;color:white;font-size:11px;line-height:16px;display:flex;justify-content:center;align-items:center;box-sizing:border-box;pointer-events:none;",
        textContent: String(count),
    });
}

// Re-read the global nav badge for each better-sidebar button and update its dot.
// Canvas loads the unread counts (Inbox/announcements) asynchronously after the
// page renders, so the dot captured at build time is often missing or stale.
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

// Watch the global nav for badge changes (late load, new mail, read/unread)
// and keep the better-sidebar dots in sync.
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

    // Keep the global-search trigger last in the sidebar. The search button's
    // placement pass and this populate pass run on independent rAF callbacks,
    // so either can execute first. If the search button was appended before
    // the nav buttons exist, slot the nav buttons in ahead of it so Search
    // always stays at the bottom of the sidebar.
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
		
            // If text not found, try other sources
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
                    // Detect and scale down large viewBox SVGs
                    const viewBoxMatch = icon.match(/viewBox="([^"]+)"/);
                    if (viewBoxMatch) {
                        const [, viewBox] = viewBoxMatch;
                        const parts = viewBox.split(/\s+/);
                        const width = parseFloat(parts[2]);
                        const height = parseFloat(parts[3]);
                        // If viewBox is large, add fixed size to scale it down
                        if (width > 32 || height > 32) {
                            // Check if svg already has a style attribute
                            if (icon.includes('style="')) {
                                // Append to existing style
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 width:20px;height:20px;flex-shrink:0;fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"`);
                            } else {
                                // Add new style attribute
                                icon = icon.replace("<svg", '<svg style="width:20px;height:20px;flex-shrink:0;fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);"');
                            }
                        } else {
                            // Smaller SVG - just add colors
                            if (icon.includes('style="')) {
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);flex-shrink:0;"`);
                            } else {
                                icon = icon.replace("<svg", '<svg style="fill:var(--bcsidebar-text);stroke:var(--bcsidebar-text);flex-shrink:0;"');
                            }
                        }
                    } else {
                        // No viewBox - just add colors
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

    // Expand (or restore) the entire left-side column when the sidebar toggles
    const leftSide = document.getElementById("left-side");
    if (leftSide) {
        // on first run store the original width (prefer computed) and inline flex/maxWidth
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
            // restore original inline values if present, otherwise remove the properties
            if (leftSide.dataset.bcOrigWidth !== "") leftSide.style.width = leftSide.dataset.bcOrigWidth; else leftSide.style.removeProperty('width');
            if (leftSide.dataset.bcOrigFlex !== "") leftSide.style.flex = leftSide.dataset.bcOrigFlex; else leftSide.style.removeProperty('flex');
            if (leftSide.dataset.bcOrigMaxWidth !== "") leftSide.style.maxWidth = leftSide.dataset.bcOrigMaxWidth; else leftSide.style.removeProperty('max-width');
        }
    }

    const courseLinksTitle = document.getElementById("better-course-links-title");
    if (courseLinksTitle) {
        courseLinksTitle.style.display = expanded ? "block" : "none";
        // Also hide separator when collapsed
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
        // end of SVGs

        const maxAssignmentCount = parseInt(options.num_todo_items) + moreAssignmentCount;
        const maxAnnouncementCount = parseInt(options.num_todo_items) + moreAnnouncementCount;
        const hr24 = options.todo_hr24;
        const now = new Date();
        //const csrfToken = CSRFtoken();
        let todoAnnouncements = document.querySelector("#canvasrefined-announcement-list");
        let todoAssignments = document.querySelector("#canvasrefined-todo-list");
        let assignmentsToInsert = [];
        let announcementsToInsert = [];

        assignments.then(data => {
            chrome.storage.sync.get(options.custom_assignments_overflow, storage => {
                //assignmentData = assignmentData === null ? data : assignmentData;
                let items = combineAssignments(data);
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

                    // if (item.plannable_type === "announcement") {
                    //if (announcementsToInsert.length >= maxAnnouncementCount + 1) return;
                    if (item.plannable_type !== "announcement") {
                        // leaving one extra assignment in the array to indicate there are more and the "view more" button should be created
                        if (assignmentsToInsert.length >= maxAssignmentCount + 1) return;
                        if (filter === "todo" && options.hide_completed === true && item.submissions.submitted === true) return;
                        if (filter === "todo" && ((options.todo_overdues !== true && now >= date) || (options.todo_overdues === true && item.submissions.submitted === true))) return;
                        if (filter === "done" && now <= date && !(itemState?.["rem"] === true || item?.submissions?.submitted === true)) return;
                        //if (item.plannable_type !== "assignment" && item.plannable_type !== "quiz" && item.plannable_type !== "discussion_topic") return;
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
                        options.custom_cards_3?.[String(item.course_id)]?.color ??
                        options.custom_cards_3?.[item.course_id]?.color ??
                        options.custom_cards_3?.[item.plannable?.course_id]?.color ??
                        "#cccccc";
                    if (itemState?.["lbl"] && itemState["lbl"] !== "") {
                        makeElement("span", listItem.querySelector(".canvasrefined-todo-item-header"), { "className": "canvasrefined-todo-label", "textContent": itemState["lbl"] });
                    }
                    if (itemState?.["crs"] === true) {
                        listItemContainer.querySelector(".canvasrefined-todo-item").style.textDecoration = "line-through";
                    }
                    let title = makeElement("a", listItem.querySelector(".canvasrefined-todo-item-header"), { "className": "canvasrefined-todoitem-title", "textContent": item.plannable.title });
                    if (options.todo_hide_feedback === true) title.style = "color:" + courseColor + "!important;";
                    let course = makeElement("p", listItem, { "className": "canvasrefined-todoitem-course", "textContent": item.context_name });
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
                                    // custom assignment (planner note): preview its description/details
                                    if (customItem) {
                                        const details = item.plannable && item.plannable.details ? item.plannable.details : "";
                                        previewText.textContent = details === "" ? "No details given" : details.replace(/<\/?[^>]+(>|$)/g, " ");
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
                                                        previewText.textContent = description === "" ? "No details given" : description.replace(/<\/?[^>]+(>|$)/g, " ");
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
                                            previewText.textContent = "Couldn't load preview";
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

                    let removeBtn = makeElement("div", actions, { "className": "canvasrefined-todo-action", "textContent": "Remove" });
                    removeBtn.innerHTML += x_svg;
                    const dueAt = new Date(item.plannable_date).getTime();

                    let crossOffBtn = makeElement("div", actions, { "className": "canvasrefined-todo-action", "textContent": "Cross off" });
                    crossOffBtn.innerHTML += check_svg;
                    crossOffBtn.addEventListener("click", () => {
                        setAssignmentState(item.plannable_id, { "crs": listItemContainer.querySelector(".canvasrefined-todo-item").style.textDecoration === "line-through" ? false : true, "expire": dueAt });
                    });
                    let label = makeElement("span", actions, { "className": "canvasrefined-todo-action-tag", "textContent": "Label:" });
                    label.innerHTML += tag_svg;
                    let labelInput = makeElement("input", actions, { "className": "canvasrefined-todo-input", "type": "text", "placeholder": "Label", "value": itemState && itemState["lbl"] ? itemState["lbl"] : "" });
                    labelInput.addEventListener("change", (e) => {
                        setAssignmentState(item.plannable_id, { "lbl": e.target.value, "expire": dueAt });
                    });

                    removeBtn.addEventListener('click', function () {
                        setAssignmentState(item.plannable_id, { "rem": filter === "todo", "expire": dueAt });
                        if (item.planner_override && item.planner_override.custom && item.planner_override.custom === true) {
                            // set item as complete locally
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

                // appending assignments all at once
                todoAssignments.textContent = "";
                if (assignmentsToInsert.length > 0) {
                    let i;
                    for (i = 0; i < (assignmentsToInsert.length > maxAssignmentCount ? maxAssignmentCount : assignmentsToInsert.length); i++) {
                        todoAssignments.append(assignmentsToInsert[i]);
                    }
                    if (i !== assignmentsToInsert.length) createTodoViewMore(todoAssignments, "assignment");
                } else {
                    makeElement("p", todoAssignments, { "className": "canvasrefined-none-due", "textContent": "None" });
                }

                // appending announcements all at once
                todoAnnouncements.textContent = "";
                if (announcementsToInsert.length > 0) {
                    let i;
                    for (i = announcementsToInsert.length - 1; i >= (announcementsToInsert.length - maxAnnouncementCount < 0 ? 0 : announcementsToInsert.length - maxAnnouncementCount); i--) {
                        todoAnnouncements.append(announcementsToInsert[i]);
                    }
                    if (i !== -1) createTodoViewMore(todoAnnouncements, "announcement");
                } else {
                    makeElement("p", todoAnnouncements, { "className": "canvasrefined-none-due", "textContent": "None" });
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

// Course list for palette operations, in DISPLAY order (first shown to
// last) so palette colors land on courses in the order the user sees them.
// Card view: dashboard cards are already in the DOM in display order.
// List mode: there are no .ic-DashboardCard elements (which used to make the
// palette silently do nothing), so fall back to the dashboard_cards API —
// ordered by where each course's planner grouping first appears top-to-
// bottom, with any courses not currently displayed (no items in the loaded
// date range) at the end in API order. Also returns the user's current
// course colors from the users/self/colors API (used for "revert colors"
// when no DOM cards exist to read inline styles from).
async function getPaletteCards() {
    let cards = [];
    let apiColors = {};
    document.querySelectorAll(".ic-DashboardCard__header").forEach(card => {
        cards.push({ "href": card.querySelector(".ic-DashboardCard__link").href, "el": card });
    });
    if (cards.length > 0) return { cards, apiColors };
    try {
        const [cardsRes, colorsRes] = await Promise.all([
            fetch(domain + "/api/v1/dashboard/dashboard_cards", { headers: { "accept": "application/json" } }),
            fetch(domain + "/api/v1/users/self/colors", { headers: { "accept": "application/json" } })
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

    // reset everything
    //let res = await getData(`${domain}/api/v1/users/self/colors`);
    clearInterval(changeColorInterval);
    const csrfToken = CSRFtoken();
    const delay = 250;
    previous = []
    colorChanges = [];

    // sort cards
    // (display order — see getPaletteCards; no re-sorting here so palette
    // colors apply from the first course on screen to the last)
    const { cards: sortedCards, apiColors } = await getPaletteCards();

    // push each color change into a queue
    try {
        sortedCards.forEach((card, i) => {
            let course_id = card.href.split("courses/")[1];
            let previousColor = card.el
                ? rgbToHex(card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor)
                : (apiColors["course_" + course_id] || "#ffffff");
            previous.push(previousColor);

            let cnum = i % colors.length;

            // Apply the new color to whatever surface is rendered: dashboard
            // card elements (card view) or planner item avatars (list view),
            // so the change is visible immediately instead of only after a
            // reload.
            let applyColor = () => {
                if (card.el) {
                    card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor = colors[cnum];
                    card.el.querySelector(".ic-DashboardCard__header-title span").style.color = colors[cnum];
                    card.el.querySelector(".ic-DashboardCard__header-button-bg").style.backgroundColor = colors[cnum];
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
                fetch(domain + "/api/v1/users/self/colors/courses_" + course_id,
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

    // go through the queue until empty
    changeColorInterval = setInterval(() => {
        if (colorChanges.length > 0) {
            let current = colorChanges.shift();
            current();
        } else {
            clearInterval(changeColorInterval);
        }
    }, delay);

    // set colors to revert back to
    chrome.storage.local.get("previous_colors", local => {
        const now = Date.now();
        const prev = local["previous_colors"];
        // Overwrite when missing or expired — and when an old list-mode run
        // (which found no dashboard cards) stored an empty list, which made
        // revert a silent no-op. Never store an empty capture (nothing to
        // revert to). chrome.storage.local.get yields undefined (not null)
        // for an unset key, so the old `=== null` check never matched it.
        if (previous.length > 0 && (!prev || now >= prev.expire || !Array.isArray(prev.colors) || prev.colors.length === 0)) {
            chrome.storage.local.set({ "previous_colors": { "colors": previous, "expire": now + 86400000 } });
        }
    });
}

/*
Dark mode
*/

// Light-mode fallbacks for the --bc* variables, always emitted so extension UI renders in light mode; dark mode overrides below.
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

function generateDarkModeCSS() {
    // Always-on light-mode defaults so var(--bc*) resolves in light mode too.
    let css = ":root{\n";
    Object.keys(BC_LIGHT_DEFAULTS).forEach((key) => {
        css += "    --bc" + key + ": " + BC_LIGHT_DEFAULTS[key] + ";\n";
    });
    css += "}\n\n";

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
function toggleDarkMode() {
    const css = generateDarkModeCSS();
    const darkOn = options.dark_mode === true || options.device_dark === true;
    // Reuse the existing #darkcss style if present (never create a duplicate), so a
    // document_start dark-mode bootstrap and later updates stay on one element.
    let style = document.querySelector("#darkcss");
    if (!style) {
        style = document.createElement('style');
        style.id = 'darkcss';
        document.documentElement.append(style);
    }
    style.textContent = css;
    style.className = darkOn ? "canvasrefined-darkmode-enabled" : "";
    darkStyleInserted = true;
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
        // Skip the write (and the storage.onChanged cascade it would trigger) when the
        // computed state already matches dark_mode, so the 60s timer is a cheap no-op.
        if (status === options.dark_mode) return;
        options.dark_mode = status;
        chrome.storage.sync.set({ "dark_mode": status }, toggleDarkMode);
    }
}


// }

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
                // Cross-origin iframes expose no contentDocument; access it safely so we
                // don't throw a TypeError into the console on every added iframe.
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
Dashboard grades 
*/

// Map a percentage to a letter grade using the user's configurable GPA
// calculator cutoffs (A+ down to F). Returns null when no grade is present.
// Picks the letter with the HIGHEST cutoff the percent meets so the result
// doesn't depend on the key order of the stored bounds object — theme imports
// can reorder keys (e.g. alphabetically, where "A" precedes "A+"), which made
// "+" grades unreachable and displayed e.g. 100% as "A". Cutoffs are coerced
// with Number() so string values carried in by imported themes still match.
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
                            //let gradepercent = grade.enrollments[0].computed_current_score;
                            let percent = (gradepercent || "--") + "%";
                            if (options.card_letter === true) {
                                const letter = percentToLetterGrade(gradepercent);
                                if (letter) percent = `${letter} ${percent}`;
                            }
                            let gradeContainer = cards[i].querySelector(".canvasrefined-card-grade") || makeElement("a", cards[i].querySelector(".ic-DashboardCard__header"), { "className": "canvasrefined-card-grade" });
                            gradeContainer.textContent = percent;
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
        });
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
    let assignmentName = makeElement("a", assignmentContainer, { "className": "canvasrefined-assignment-link", "textContent": assignment.plannable.title, "href": assignment.html_url });
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

    // Clear prior min-height so we can measure fresh or fully reset.
    cards.forEach(card => {
        const area = card.querySelector(".canvasrefined-card-assignment");
        if (area) area.style.removeProperty("min-height");
    });

    if (!enabled) return;

    // Stretch each assignment area to the tallest one.
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
    return new Promise((resolve, reject) => {
        let assignmentEls = {};
        const now = new Date();
        assignments.then((data) => {
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
            resolve(assignmentEls);
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
    cardAssignments.then(els => {
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
                        //assignment.el.querySelector(".canvasrefined-assignment-dueat").textContent = formatCardDue(assignment.due);
                        cardContainer.appendChild(assignment.el);
                        count++;
                    });
                }

                if (count === 0) {
                    let assignmentContainer = makeElement("div", cardContainer, { "className": "canvasrefined-assignment-container" });
                    let assignmentDivLink = makeElement("a", assignmentContainer, { "className": "canvasrefined-assignment-link", "textContent": "None" });
                }
            });
            // Wait one frame so the browser lays out the freshly appended
            // assignment rows before measuring/equalizing card heights.
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
    // no ~
    if (!id.includes("~")) return id;

    // has ~ but dashboard card method is used
    if (options["custom_cards"][id]) return id;

    // weird case, some canvases replace consecutive 0s with a ~ in the id
    // but the number of 0s isn't consistent between schools
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
            // hide card
            card.style.display = cardOptions.hidden === true ? "none" : "inline-block";

            // card image
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

            // card name
            if (cardOptions.name !== "") {
                card.querySelector(".ic-DashboardCard__header-title > span").textContent = cardOptions.name;
            }

            // card code
            if (cardOptions.code !== "") {
                card.querySelector(".ic-DashboardCard__header-subtitle").textContent = cardOptions.code;
            }

            // card links
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
    let qualityPoints = 0, numCredits = 0, weightedQualityPoints = 0, cumulativePoints = 0, cumulativeCredits = 0;
    document.querySelectorAll('.canvasrefined-gpa-course').forEach(course => {
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
    document.querySelector("#canvasrefined-gpa-unweighted").textContent = (qualityPoints / numCredits).toFixed(2);
    document.querySelector("#canvasrefined-gpa-weighted").textContent = (weightedQualityPoints / numCredits).toFixed(2);
    const cGPA = document.querySelector("#canvasrefined-cumulative-gpa");
    const g = parseFloat(cGPA.querySelector(".canvasrefined-course-percent").value);
    const c = parseInt(cGPA.querySelector(".canvasrefined-course-credit").value);
    document.querySelector("#canvasrefined-gpa-cumulative").textContent = (((options.gpa_calc_weighted === true ? weightedQualityPoints : qualityPoints) + (g * c)) / (numCredits + c)).toFixed(2);
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

    if (customs["gr"] !== null) {
        changer.value = customs["gr"];
    } else if (courseGrade) {
        changer.value = courseGrade;
    } else {
        changer.value = "--";
    }

    if (course.id !== "cumulative") {
        let weightSelections = makeElement("form", courseContainer, { "className": "canvasrefined-course-weights" });
        weightSelections.innerHTML = '<select name="weight-selection" class="canvasrefined-course-weight"><option value="dnc">Do not count</option><option value="regular">Regular/College</option><option value="honors">Honors</option><option value="ap">AP/IB</option></select>';
        let weightChanger = weightSelections.querySelector(".canvasrefined-course-weight");
        weightChanger.value = changer.value === "--" ? "dnc" : customs.weight;   
        weightChanger.addEventListener('change', () => changeGPASettings(course.id, { "weight": weightSelections.querySelector(".canvasrefined-course-weight").value }));

        let useCustomGr = makeElement("input", courseContainer, { "className": "canvasrefined-course-customgr", "type": "checkbox", "checked": customs.gr !== null ? true : false });
        let useCustomGrLabel = makeElement("span", courseContainer, { "className": "canvasrefined-course-customgr-label", "textContent": "Save custom grade" });
        useCustomGr.addEventListener("input", () => {
            if (options["custom_cards"][course.id]) {
                if (options["custom_cards"][course.id]["gr"] !== undefined && options["custom_cards"][course.id]["gr"] !== null) {
                    changer.value = courseGrade;
                    changeGPASettings(course.id, { "gr": null });
                } else {
                    changeGPASettings(course.id, { "gr": changer.value });
                }
            }
        });
    }   

    changer.addEventListener('input', (e) => {
        if (course.id === "cumulative" || (options["custom_cards"][course.id]["gr"] !== undefined && options["custom_cards"][course.id]["gr"] !== null)) {
            changeGPASettings(course.id, { "gr": e.target.value });
        } else {
            calculateGPA2();
        }
    });

    credits.querySelector(".canvasrefined-course-credit").addEventListener('input', () => changeGPASettings(course.id, { "credits": credits.querySelector(".canvasrefined-course-credit").value }));
    return courseContainer;
}

function setupGPACalc() {
    if (current_page !== "/" && current_page !== "") return;
    try {
        grades?.then(result => {

            const sortableContainer = document.querySelector(".ic-DashboardCard__box__container");
            const dashboardContainer = sortableContainer || document.querySelector("#DashboardCard_Container");
            if (!dashboardContainer) return;

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
                container2.innerHTML = `<h3 class="canvasrefined-gpa-header">GPA</h3><div><div><p id="canvasrefined-gpa-unweighted"></p><p>Current</p></div><div style="display:${options["gpa_calc_weighted"] ? "block" : "none"}"><p id="canvasrefined-gpa-weighted"></p><p>Weighted</p></div><div style="display:${options["gpa_calc_cumulative"] ? "block" : "none"}"><p id="canvasrefined-gpa-cumulative"></p><p>Cumulative</p></div></div>`;
                let editBtn = makeElement("button", container2, { "className": "canvasrefined-gpa-edit-btn", "textContent": "Edit Calculator" });

                container.innerHTML = '<h3 class="canvasrefined-gpa-header">GPA Calculator</h3><div class="canvasrefined-gpa-courses-container"><div class="canvasrefined-gpa-courses"></div></div>';

                if (options.gpa_calc_prepend === true) {
                    dashboardContainer.prepend(container2);
                    dashboardContainer.prepend(container);
                } else {
                    dashboardContainer.appendChild(container2);
                    dashboardContainer.appendChild(container);
                }

                let location = document.querySelector(".canvasrefined-gpa-courses");
                if (!location) return;

                let cumulative = createGPACalcCourse(location, { "id": "cumulative", "enrollments": [{ "has_grading_periods": true, "current_period_computed_current_score": 0 }] });
                cumulative.id = "canvasrefined-cumulative-gpa";
                result.forEach(course => createGPACalcCourse(location, course));

                container.style.display = "none";

                editBtn.addEventListener("click", () => {
                    if (container.style.display === "none") {
                        container.style.display = "inline-block";
                        editBtn.textContent = "Close Calculator";
                    } else {
                        container.style.display = "none";
                        editBtn.textContent = "Edit Calculator";
                    }
                });

                container2.dataset.canvasrefinedGpaRendered = "true";
                container.dataset.canvasrefinedGpaRendered = "true";
            } else {
                const weighted = container2.querySelector("#canvasrefined-gpa-weighted")?.parentElement;
                const cumulative = container2.querySelector("#canvasrefined-gpa-cumulative")?.parentElement;
                if (weighted) weighted.style.display = options.gpa_calc_weighted ? "block" : "none";
                if (cumulative) cumulative.style.display = options.gpa_calc_cumulative ? "block" : "none";

                const shouldPrepend = options.gpa_calc_prepend === true;
                if (shouldPrepend) {
                    if (dashboardContainer.children[0] !== container || dashboardContainer.children[1] !== container2) {
                        dashboardContainer.insertBefore(container, dashboardContainer.firstChild);
                        dashboardContainer.insertBefore(container2, container.nextSibling);
                    }
                } else {
                    if (dashboardContainer.lastElementChild !== container || container2.nextElementSibling !== container) {
                        dashboardContainer.appendChild(container2);
                        dashboardContainer.appendChild(container);
                    }
                }
            }

            try {
                if (sortableContainer && window.jQuery && window.jQuery.fn && window.jQuery.fn.sortable) {
                    window.jQuery(sortableContainer).sortable('refresh');
                }
            } catch (e) {}

            calculateGPA2();
        });
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

    // Range covering every line touched by the selection.
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

/* Toggle the Nth rendered Markdown task checkbox and re-render, using a task
   ordinal that skips fenced code blocks. */
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

const DASHBOARD_NOTES_HTML = `
    <div class="canvasrefined-notes-toolbar" role="toolbar" aria-label="Format notes">
        <button type="button" class="cr-fmt" data-action="bold" title="Bold (Ctrl/Cmd+B)"><strong>B</strong></button>
        <button type="button" class="cr-fmt" data-action="italic" title="Italic (Ctrl/Cmd+I)"><em>I</em></button>
        <button type="button" class="cr-fmt" data-action="strike" title="Strikethrough"><s>S</s></button>
        <button type="button" class="cr-fmt" data-action="code" title="Inline code"><code>&lt;/&gt;</code></button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="h1" title="Heading 1">H1</button>
        <button type="button" class="cr-fmt" data-action="h2" title="Heading 2">H2</button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="list" title="Bullet list">&bull;</button>
        <button type="button" class="cr-fmt" data-action="numbered" title="Numbered list">1.</button>
        <button type="button" class="cr-fmt" data-action="task" title="Task list">&#9744;</button>
        <button type="button" class="cr-fmt" data-action="quote" title="Quote">&ldquo;</button>
        <span class="cr-fmt-sep"></span>
        <button type="button" class="cr-fmt" data-action="link" title="Insert link">Link</button>
        <button type="button" class="cr-fmt" data-action="hr" title="Horizontal rule">&mdash;</button>
        <button type="button" class="cr-fmt" data-action="codeblock" title="Code block">&#96;&#96;&#96;</button>
    </div>
    <div class="canvasrefined-notes-surface">
        <div class="canvasrefined-notes-rendered" tabindex="0" aria-label="Dashboard notes — click to edit" title="Click to edit"></div>
        <textarea class="canvasrefined-notes-editor" placeholder="Type away!" spellcheck="false"></textarea>
    </div>
`;

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
        // Clicking a checkbox toggles the task; clicking the text edits.
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

    // preventDefault on the toolbar keeps focus in the editor across misclicks.
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

function loadDashboardNotes() {
    const container = document.querySelector("#DashboardCard_Container");
    if (options.dashboard_notes === true) {
        if (!container) return;
        let notes = document.querySelector('.canvasrefined-dashboard-notes');
        // Rebuild older (split edit/preview) markup into the new single-surface layout.
        if (notes && !notes.querySelector(".canvasrefined-notes-surface")) {
            notes.remove();
            notes = null;
        }
        if (!notes) {
            notes = document.createElement("div");
            notes.classList.add("canvasrefined-dashboard-notes");
            notes.innerHTML = DASHBOARD_NOTES_HTML;
            // Mount as a full-width sibling above the card grid. Prepending inside the
            // DashboardCard_Container makes the notes a masonry/grid cell (narrow & broken).
            const parent = container.parentNode;
            if (parent) parent.insertBefore(notes, container);
            else container.prepend(notes);
            wireDashboardNotes(notes);
        } else {
            notes.style.display = "";
            const editor = notes.querySelector(".canvasrefined-notes-editor");
            const rendered = notes.querySelector(".canvasrefined-notes-rendered");
            // Only sync and render in view mode; the textarea is the source of truth while editing.
            if (!notes.classList.contains("is-editing")) {
                if (editor && editor.value !== (options.dashboard_notes_text || "")) {
                    editor.value = options.dashboard_notes_text || "";
                }
                renderDashboardNotesPreview(rendered, editor ? editor.value : "");
            }
        }
    } else {
        let notes = document.querySelector('.canvasrefined-dashboard-notes');
        if (notes) notes.style.display = "none";
    }
}


/*
Custom font
*/

function loadCustomFont() {
    // Quiz safe mode: don't override fonts on quiz pages.
    if (quizSafeModeActive()) return;
    let link = document.querySelector("#custom_font_link");
    let style = document.querySelector("#custom_font");

    let load = () => {
        if (options.custom_font.link !== "") {
            document.head.appendChild(style);
            link.href = `https://fonts.googleapis.com/css2?family=${options.custom_font.link}&display=swap`;
            link.rel = "stylesheet";
            document.head.appendChild(link);
        }

        style.textContent = options.custom_font.link === "" ? "" : `*, input, a, button, h1, h2, h3, h4, h5, h6, p, span {font-family: ${options.custom_font.family}!important}`;
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

// Debounced wrapper around applyAestheticChanges for card-style options that
// can fire many storage onChanged events in quick succession (number inputs).
// See the "cardPadding"/"imageSize"/etc. cases in applyOptionsChanges.
let aestheticDebounceTimer = null;
function debouncedApplyAestheticChanges(delay = 150) {
    if (aestheticDebounceTimer) clearTimeout(aestheticDebounceTimer);
    aestheticDebounceTimer = setTimeout(() => {
        aestheticDebounceTimer = null;
        applyAestheticChanges();
    }, delay);
}

function applyAestheticChanges() {
    // Quiz safe mode: don't inject custom layout/aesthetic CSS on quiz pages.
    if (quizSafeModeActive()) return;
    let style = document.querySelector("#canvasrefined-aesthetics") || document.createElement('style');
    style.id = "canvasrefined-aesthetics";
    style.textContent = "";
    if (options.condensed_cards === true) style.textContent += ".ic-DashboardCard__header_hero {height:60px!important}.ic-DashboardCard__header-subtitle, .ic-DashboardCard__header-term{display:none}";
    if (options.remlogo === true) style.textContent += ".ic-app-header__logomark-container{display:none}";
    if (options.disable_color_overlay === true) style.textContent += ".ic-DashboardCard__header_hero{opacity: 0!important} .ic-DashboardCard__header-button-bg{opacity: 1!important}";
    if (options.full_width === true) style.textContent += "#wrapper,.ic-Layout-wrapper{max-width:100%!important}";
    if (options.center_cards === true) style.textContent += ".ic-DashboardCard__box__container{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;align-items:flex-start!important}";
    if (options.customCardStyles === true) {
        if (options.imageSize !== undefined && options.imageSize !== 100) style.textContent += `.ic-DashboardCard__header_image {transform: scale(${options.imageSize / 100})!important; }`;
        if (options.cardRoundness !== undefined && options.cardRoundness !== 5) style.textContent += `.ic-DashboardCard {border-radius: ${options.cardRoundness}px!important;}`;
        // Rounds the header image band. The photo is the background of
        // .ic-DashboardCard__header_image, and .ic-DashboardCard__header_hero (a
        // child that covers the full photo with its colored overlay + 1px
        // border) sits on top of it. border-radius only clips the element it's
        // on — rounding the parent alone leaves the hero's square overlay
        // covering the corners, and rounding the hero alone leaves the photo's
        // square corners behind it — so both elements need the same radius.
        // Default 0; guard skips the default so stock cards keep square corners.
        if (options.imageRoundness !== undefined && options.imageRoundness !== 0) style.textContent += `.ic-DashboardCard__header_image, .ic-DashboardCard__header_hero {border-radius: ${options.imageRoundness}px!important;}`;
        if (options.cardSpacing !== undefined && options.cardSpacing !== 0) style.textContent += `.ic-DashboardCard {margin-right: ${options.cardSpacing / 2}px!important; margin-bottom: ${options.cardSpacing / 2}px!important;}`;
        if (options.cardWidth !== undefined && options.cardWidth !== 262) style.textContent += `.ic-DashboardCard {width: ${options.cardWidth}px!important;}`;
        // Card height sizes the image band via .ic-DashboardCard__header_hero —
        // the element Canvas pins at 146px that actually drives the header image
        // height (both .ic-DashboardCard and .ic-DashboardCard__header are
        // content-sized, so a height on either just clips or adds dead space).
        // Everything else — title, actions, and the appended
        // .canvasrefined-card-assignment rows — flows below the hero, so the card
        // grows with the assignment list and nothing gets clipped. Skipped when
        // condensed cards is on, since that mode pins the hero at 60px.
        if (options.condensed_cards !== true && options.cardHeight !== undefined && options.cardHeight !== null && options.cardHeight !== "") {
            style.textContent += `.ic-DashboardCard__header_hero {height: ${options.cardHeight}px!important;}`;
        }
        // Inner card padding. Applied to the whole .ic-DashboardCard box so the
        // hero header, title, and action buttons all get breathing room from the
        // card's edges. Canvas sizes the card with border-box + a fixed width,
        // so padding alone squishes the content area (narrower image/rows)
        // instead of expanding the card — switch to content-box so the padding
        // grows the card outward and the content keeps its full width.
        // Guarded by > 0 (default).
        if (options.cardPadding !== undefined && Number(options.cardPadding) > 0) {
            style.textContent += `.ic-DashboardCard {padding: ${options.cardPadding}px!important; box-sizing: content-box!important;}`;
        }
    }

    style.textContent += ".ic-app-nav-toggle-and-crumbs{display:none!important}";
    if (options.custom_styles !== "") style.textContent += options.custom_styles;
    document.documentElement.appendChild(style);
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
    // Only inject into a real Canvas content container — never <body>, which
    // would place the banner outside the content area if it renders too early.
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
            textContent: "Canvas Refined — Quiz Safe Mode",
        });

        makeElement("p", banner, {
            className: "canvasrefined-quiz-safe-info",
            textContent: "This extension hasn't been 100% approved by all teachers. Quiz Safe Mode turns off most Canvas Refined features that could interfere with this quiz page, giving you the default Canvas quiz experience.",
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
            textContent: "Enable Quiz Safe Mode",
        });

        const dismissBtn = makeElement("button", toggleRow, {
            className: "canvasrefined-quiz-safe-dismiss",
 type: "button",
            textContent: "Don't show again",
            title: "Hides this reminder permanently. You can still toggle Quiz Safe Mode in the extension popup.",
        });
        dismissBtn.addEventListener("click", () => {
            chrome.storage.local.set({ quiz_safe_mode_reminder_dismissed: true });
            banner.remove();
        });

        return true;
    };

    if (insertInto(findContainer())) return;

    // Content container not ready yet; wait for it (never fall back to <body>).
    const obs = new MutationObserver(() => {
        if (insertInto(findContainer())) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
}



// =============================================================================
// Global Canvas Search
// Search across all of the user's courses for modules, module items, and
// assignments, then jump straight to them. Triggered by a floating search
// button (bottom-right) or Ctrl/Cmd+K.
// =============================================================================

let globalSearchIndex = null;            // [{type,title,course,courseId,url}]
let globalSearchIndexPromise = null;     // in-flight build so concurrent opens share one fetch
let globalSearchIndexAt = 0;             // ms timestamp of last successful build
const GLOBAL_SEARCH_INDEX_TTL = 10 * 60 * 1000; // 10 minutes
const GLOBAL_SEARCH_STORAGE_KEY = "canvasrefined_global_search_index";
let _gsShortcutBound = false;

function setupGlobalSearch() {
    if (options.global_search !== true) return;
    // Rebuild the index fresh on every page load so newly-concluded/hidden
    // courses never linger from a previous session's cache.
    invalidateGlobalSearchIndex();
    ensureGlobalSearchButton();
    ensureGlobalSearchShortcut();
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

// Shared search icon used by the sidebar + header triggers.
const GLOBAL_SEARCH_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><circle cx="11" cy="11" r="7" stroke="var(--bcsidebar-text)" stroke-width="2" fill="none"/><path d="m20 20-3.2-3.2" stroke="var(--bcsidebar-text)" stroke-width="2" stroke-linecap="round"/></g></svg>`;

// Placement: a search trigger is injected into whichever left sidebar is
// active — the Better Sidebar (when enabled) or Canvas' native global nav —
// and, on the dashboard, a button is also placed in the header actions row.
// There is no floating button. A rAF-debounced MutationObserver re-evaluates
// placement as Canvas renders/SPA-navigates/rebuilds the sidebar.
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

    // Native global nav (the slim icon bar) — always present, so always add.
    ensureGlobalSearchNativeSidebarButton();

    // Better Sidebar (extra column when the option is enabled) — add when present.
    const betterSidebar = document.getElementById("better-sidebar-container");
    if (betterSidebar) {
        ensureGlobalSearchBetterSidebarButton(betterSidebar);
    } else {
        removeGlobalSearchBetterSidebarButton();
    }

    // Dashboard header button (in addition to the sidebar triggers).
    const headerActions = document.querySelector(".ic-Dashboard-header__actions");
    if (isDashboardPage() && headerActions) {
        ensureGlobalSearchHeaderButton(headerActions);
    } else {
        document.getElementById("canvasrefined-global-search-header-btn")?.remove();
    }
}

// --- Better Sidebar trigger --------------------------------------------------

function ensureGlobalSearchBetterSidebarButton(betterSidebar) {
    // The first child of #better-sidebar-container is the button list.
    const sidebarContent = betterSidebar.querySelector("div");
    if (!sidebarContent) return;
    if (sidebarContent.querySelector("#canvasrefined-gs-sidebar-btn")) return;
    const btn = document.createElement("a");
    btn.id = "canvasrefined-gs-sidebar-btn";
    btn.className = "canvasrefined-custom-btn better-sidebar-btn canvasrefined-gs-sidebar-btn";
    btn.href = "#";
    btn.title = "Search Canvas (Ctrl+K)";
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Search Canvas");
    btn.style.cssText = "width:40%;height:var(--bc-sidebar-btn-height,30px);cursor:pointer;text-align:center;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:var(--bc-sidebar-btn-gap,8px);color:var(--bcsidebar-text) !important;font-weight:bold;position:relative;";
    btn.innerHTML = `${GLOBAL_SEARCH_ICON_SVG}<span class="better-sidebar-label" style="font-size:var(--bc-sidebar-label-size,14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">Search</span>`;
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openGlobalSearchModal(); });
    // Append so it sits at the bottom of the sidebar item list.
    sidebarContent.appendChild(btn);
    // Match the sidebar's current expanded/collapsed mode immediately so the
    // button doesn't briefly render in the wrong state (e.g. label visible while
    // collapsed) until the next toggle calls updateSidebar().
    applyGlobalSearchSidebarButtonMode(btn, betterSidebar.dataset.expanded === "true");
}

function removeGlobalSearchBetterSidebarButton() {
    document.getElementById("canvasrefined-gs-sidebar-btn")?.remove();
}

// Apply the Better Sidebar's current expanded/collapsed styling to the search
// button, mirroring updateSidebar()'s button/label/svg rules so the button is
// correct the moment it's inserted (and whenever the sidebar re-renders).
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

// --- Native global-nav trigger ----------------------------------------------

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
    link.title = "Search Canvas (Ctrl+K)";
    link.setAttribute("aria-label", "Search Canvas");
    link.innerHTML = `<span class="menu-item-icon-container" aria-hidden="true">${GLOBAL_SEARCH_ICON_SVG}</span><span class="menu-item__text">Search</span>`;
    link.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openGlobalSearchModal(); });
    li.appendChild(link);
    // Append so the search item appears at the bottom of the global nav.
    navMenu.appendChild(li);
}

function removeGlobalSearchNativeSidebarButton() {
    document.getElementById("canvasrefined-gs-nav-item")?.remove();
}

// --- Dashboard header trigger -----------------------------------------------

function ensureGlobalSearchHeaderButton(headerActions) {
    if (headerActions.querySelector("#canvasrefined-global-search-header-btn")) return;
    const btn = document.createElement("button");
    btn.id = "canvasrefined-global-search-header-btn";
    btn.type = "button";
    btn.className = "canvasrefined-gs-header-btn";
    btn.title = "Search Canvas (Ctrl+K)";
    btn.setAttribute("aria-label", "Search Canvas");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="canvasrefined-gs-header-btn-label">Search</span>`;
    btn.addEventListener("click", openGlobalSearchModal);
    // Insert as the first child of the actions row so it sits just to the left
    // of the "Dashboard Options" (⋯) button, right-aligned with it.
    headerActions.insertBefore(btn, headerActions.firstChild);
}

function ensureGlobalSearchShortcut() {
    if (_gsShortcutBound) return;
    document.addEventListener("keydown", onGlobalSearchShortcut, true);
    _gsShortcutBound = true;
}

function onGlobalSearchShortcut(e) {
    // Ctrl/Cmd+K toggles the search modal. Ignore when a modal is already open
    // and the user is typing in its input (handled by the modal's own listener).
    if (!(e.ctrlKey || e.metaKey) || !(e.key === "k" || e.key === "K")) return;

    // Never activate on quiz pages (intro or take) so we don't interfere with
    // the quiz experience or the browser's native Ctrl+K. Read the URL live
    // because current_page can be stale after Canvas' client-side navigation.
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

    // Show the platform-appropriate modifier in keybind hints (⌘ on Mac).
    const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "\u2318" : "Ctrl";
    const modal = document.createElement("div");
    modal.id = "canvasrefined-global-search-modal";
    modal.className = "canvasrefined-gs-modal";
    modal.dataset.open = "true";
    modal.innerHTML = `
        <div class="canvasrefined-gs-card" role="dialog" aria-modal="true" aria-label="Search Canvas">
            <div class="canvasrefined-gs-input-row">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="canvasrefined-gs-input-icon"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <input id="canvasrefined-gs-input" class="canvasrefined-gs-input" type="text" placeholder="Search modules & assignments\u2026" autocomplete="off" spellcheck="false" />
                <button id="canvasrefined-gs-close" class="canvasrefined-gs-close" type="button" title="Close (Esc)">Esc</button>
            </div>
            <div id="canvasrefined-gs-results" class="canvasrefined-gs-results"></div>
            <div class="canvasrefined-gs-footer">
                <span><kbd>\u2191</kbd><kbd>\u2193</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>${modKey}</kbd>+<kbd>Enter</kbd> new tab</span>
                <span><kbd>${modKey}</kbd>+<kbd>K</kbd> toggle search</span>
                <span><kbd>Esc</kbd> close</span>
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

    // Escape closes; arrows + enter navigate. Bound on capture so we win over
    // the global Ctrl+K toggle.
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
    // Stop the global Ctrl+K handler from closing the modal while typing.
    input.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) e.stopPropagation();
    });

    let debounce = null;
    input.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => runGlobalSearch(input.value.trim(), resultsEl).then(res => {
            currentResults = res;
            selected = res.length ? 0 : -1;
            renderGlobalSearchSelection(resultsEl, selected);
        }), 120);
    });

    requestAnimationFrame(() => input.focus());
    // Kick off indexing immediately so the first keystroke is fast.
    ensureGlobalSearchIndex();
    // Render an initial hint.
    resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">Start typing to search your modules and assignments.</div>`;
}

function closeGlobalSearchModal() {
    const modal = document.getElementById("canvasrefined-global-search-modal");
    if (!modal) return;
    modal.remove();
}

function openGlobalSearchResult(item, newTab) {
    if (!item || !item.url) return;
    if (newTab) {
        // Opening in a new tab keeps the search menu open so the user can keep
        // searching. Refocus the input for the next keystroke.
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

// --- Indexing ---------------------------------------------------------------

// Drop any cached index so the next access rebuilds it from the API. Called
// at setup time so every page load starts fresh.
function invalidateGlobalSearchIndex() {
    globalSearchIndex = null;
    globalSearchIndexAt = 0;
    globalSearchIndexPromise = null;
    try { chrome.storage.local.remove(GLOBAL_SEARCH_STORAGE_KEY); } catch (_) { /* ignore */ }
}

async function ensureGlobalSearchIndex() {
    // A per-session in-memory build is shared across opens so we don't refetch
    // on every keystroke, but we never serve a persisted cache across reloads.
    if (globalSearchIndex && (Date.now() - globalSearchIndexAt) < GLOBAL_SEARCH_INDEX_TTL) {
        return globalSearchIndex;
    }
    if (globalSearchIndexPromise) return globalSearchIndexPromise;

    globalSearchIndexPromise = (async () => {
        const index = await buildGlobalSearchIndex();
        globalSearchIndex = index;
        globalSearchIndexAt = Date.now();
        return index;
    })();

    try {
        return await globalSearchIndexPromise;
    } finally {
        globalSearchIndexPromise = null;
    }
}

async function buildGlobalSearchIndex() {
    let courses = [];
    try {
        // enrollment_state=active excludes concluded/inactive enrollments at the
        // source so we never index (or waste requests on) past-term courses.
        courses = await getData(`${domain}/api/v1/courses?enrollment_state=active&per_page=100`);
    } catch (e) {
        console.warn("[CanvasRefined] global search: failed to load courses", e);
        return [];
    }
    if (!Array.isArray(courses) || !courses.length) return [];

    // Skip inactive/concluded/hidden courses. `enrollment_state=active`
    // already filters at the source, but some institutions return past-term
    // courses as "active", so we double-check here:
    //   - access_restricted_by_date (locked courses)
    //   - concluded === true (Canvas marks concluded courses)
    //   - term end_date in the past (when the API exposes it)
    //   - courses the user hid from their dashboard (custom_cards.hidden)
    const now = Date.now();
    courses = courses.filter(c => {
        if (!c || !c.name) return false;
        if (c.access_restricted_by_date === true) return false;
        if (c.concluded === true) return false;
        // term end date check (API may return term.end_at)
        const endAt = c?.term?.end_at || c?.end_at;
        if (endAt) {
            const end = new Date(endAt).getTime();
            if (!isNaN(end) && end < now) return false;
        }
        if (isCourseHidden(c.id)) return false;
        return true;
    });
    // Cap to keep request volume sane.
    courses = courses.slice(0, 60);

    // Canvas can return the same course more than once (multi-role enrollments,
    // cross-listed sections). Dedupe by id so we don't double-index or double-fetch.
    const seenCourseIds = new Set();
    courses = courses.filter(c => {
        if (seenCourseIds.has(c.id)) return false;
        seenCourseIds.add(c.id);
        return true;
    });

    const index = [];
    // Shared dedup state. Keys identify a piece of *content* regardless of where
    // it surfaced, so the same assignment (which Canvas exposes both as a module
    // item AND a standalone assignment) collapses to a single result.
    //   - standalone assignment:  `asn:<courseId>:<assignmentId>`
    //   - module item with content_id: `<type>:<courseId>:<contentId>`
    //       (for type "assignment" this becomes `asn:<courseId>:<contentId>` —
    //        the SAME key as the standalone assignment, so whichever is added
    //        first wins; we add assignments first to keep the direct URL)
    //   - module item without content_id (external url/tool): `url:<normalizedUrl>`
    //   - module itself: `module:<courseId>:<moduleId>`
    const seenContent = new Set();

    await Promise.all(courses.map(async (course) => {
        const courseId = course.id;
        const courseName = course.name;
        const courseCode = course.course_code || courseName;

        // Assignments first so their direct URLs win over the module-item
        // versions of the same assignment.
        try {
            const assignments = await getData(`${domain}/api/v1/courses/${courseId}/assignments?per_page=100`);
            if (Array.isArray(assignments)) {
                for (const a of assignments) {
                    if (!a || !a.name || !a.html_url) continue;
                    const key = `asn:${courseId}:${a.id}`;
                    if (seenContent.has(key)) continue;
                    seenContent.add(key);
                    index.push({
                        type: "Assignment",
                        title: a.name,
                        course: courseName,
                        courseCode,
                        courseId,
                        url: a.html_url
                    });
                }
            }
        } catch (_) { /* non-fatal */ }

        // Modules + their items.
        try {
            const modules = await getData(`${domain}/api/v1/courses/${courseId}/modules?per_page=100`);
            if (Array.isArray(modules)) {
                for (const m of modules) {
                    if (!m || !m.name) continue;
                    const modKey = `module:${courseId}:${m.id}`;
                    if (!seenContent.has(modKey)) {
                        seenContent.add(modKey);
                        index.push({
                            type: "Module",
                            title: m.name,
                            course: courseName,
                            courseCode,
                            courseId,
                            url: `${domain}/courses/${courseId}/modules`
                        });
                    }
                    try {
                        const items = await getData(`${domain}/api/v1/courses/${courseId}/modules/${m.id}/items?per_page=100`);
                        if (Array.isArray(items)) {
                            for (const it of items) {
                                if (!it || !it.title) continue;
                                // Skip text headers / dividers — no destination page.
                                const itype = (it.type || "").toLowerCase();
                                if (itype === "subheader") continue;
                                // Prefer the real page link (html_url). External
                                // URL items expose external_url instead; the bare
                                // `url` field is the API endpoint, never use it.
                                const url = it.html_url || it.external_url;
                                if (!url) continue;

                                // Build a content-identity key so the same item
                                // appearing in multiple modules (or mirroring a
                                // standalone assignment) only produces one result.
                                let key;
                                if (itype === "assignment" && it.content_id) {
                                    key = `asn:${courseId}:${it.content_id}`;
                                } else if (it.content_id) {
                                    key = `${itype}:${courseId}:${it.content_id}`;
                                } else {
                                    key = `url:${normalizeGlobalSearchUrl(url)}`;
                                }
                                if (seenContent.has(key)) continue;
                                seenContent.add(key);

                                index.push({
                                    type: prettyModuleItemType(it.type),
                                    title: it.title,
                                    course: courseName,
                                    courseCode,
                                    courseId,
                                    url
                                });
                            }
                        }
                    } catch (_) { /* per-module failure is non-fatal */ }
                }
            }
        } catch (_) { /* per-course failure is non-fatal */ }
    }));

    // Final safety net: collapse any remaining normalized-URL duplicates (e.g.
    // external links whose content_id differed but resolve to the same page).
    const seen = new Set();
    return index.filter(item => {
        const key = normalizeGlobalSearchUrl(item.url);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeGlobalSearchUrl(url) {
    if (!url) return "";
    try {
        const u = new URL(url, domain);
        let path = u.pathname.replace(/\/+$/, ""); // strip trailing slashes
        // Ignore case + fragment/query for matching purposes.
        return (u.host.toLowerCase() + path).toLowerCase();
    } catch (_) {
        // Non-absolute (shouldn't happen, but be safe) — normalize as-is.
        return String(url).replace(/\/+$/, "").toLowerCase();
    }
}

function prettyModuleItemType(type) {
    switch ((type || "").toLowerCase()) {
        case "assignment": return "Assignment";
        case "quiz": return "Quiz";
        case "discussion": case "discussion_topic": return "Discussion";
        case "externalurl": return "Link";
        case "externaltool": return "External Tool";
        case "file": return "File";
        case "page": return "Page";
        case "subheader": return "Section";
        default: return type || "Item";
    }
}

// --- Searching --------------------------------------------------------------

async function runGlobalSearch(query, resultsEl) {
    if (!globalSearchIndex && globalSearchIndexPromise) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-loading">Building search index\u2026</div>`;
    }
    const index = await ensureGlobalSearchIndex();
    if (!query) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">Start typing to search your modules and assignments.</div>`;
        return [];
    }
    if (!index || !index.length) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">No modules or assignments found. Open the search again later if your courses are still loading.</div>`;
        return [];
    }

    const q = query.toLowerCase();
    const matches = [];
    for (const item of index) {
        // Re-check hidden status at search time so a card hidden after the index
        // was cached (10-min TTL) never surfaces in results.
        if (isCourseHidden(item.courseId)) continue;
        const t = (item.title || "").toLowerCase();
        const c = (item.course || "").toLowerCase();
        let score = -1;
        if (t.startsWith(q)) score = 100 - t.indexOf(q);
        else if (t.includes(q)) score = 60 - t.indexOf(q);
        else if (c.includes(q)) score = 20;
        if (score >= 0) { item._score = score + (t === q ? 50 : 0); matches.push(item); }
    }
    matches.sort((a, b) => b._score - a._score);
    const top = matches.slice(0, 50);

    if (!top.length) {
        resultsEl.innerHTML = `<div class="canvasrefined-gs-hint">No results for \u201c${escapeGlobalSearchHtml(query)}\u201d.</div>`;
        return [];
    }

    resultsEl.innerHTML = top.map((item, i) => `
        <div class="canvasrefined-gs-row" data-i="${i}" data-url="${escapeGlobalSearchAttr(item.url)}">
            <div class="canvasrefined-gs-row-main">
                <span class="canvasrefined-gs-type canvasrefined-gs-type-${escapeGlobalSearchAttr((item.type || "").toLowerCase().replace(/\s+/g, "-"))}">${escapeGlobalSearchHtml(item.type || "")}</span>
                <span class="canvasrefined-gs-title">${escapeGlobalSearchHtml(item.title || "")}</span>
            </div>
            <span class="canvasrefined-gs-course">${escapeGlobalSearchHtml(item.course || "")}</span>
        </div>`).join("");

    resultsEl.querySelectorAll(".canvasrefined-gs-row").forEach((row) => {
        // Plain click / Ctrl+click: honor modifier for new-tab behavior.
        row.addEventListener("click", (e) => {
            const url = row.getAttribute("data-url");
            const item = top.find(x => x.url === url);
            if (item) openGlobalSearchResult(item, e.ctrlKey || e.metaKey || (e.button === 1));
        });
        // Middle-click opens in a new tab without closing the search.
        row.addEventListener("auxclick", (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            const url = row.getAttribute("data-url");
            const item = top.find(x => x.url === url);
            if (item) openGlobalSearchResult(item, true);
        });
    });
    return top;
}

function escapeGlobalSearchHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function escapeGlobalSearchAttr(s) {
    return escapeGlobalSearchHtml(s).replace(/`/g, "&#96;");
}

function changeGradientCards() {
    if (options.gradient_cards === true) {
        let cardheads = document.querySelectorAll('.ic-DashboardCard__header_hero');

        // Create the style once; re-appending triggers the MutationObserver and re-runs this function.
        let cardcss = document.querySelector("#gradientcss");
        if (!cardcss) {
            cardcss = document.createElement('style');
            cardcss.id = "gradientcss";
            document.documentElement.appendChild(cardcss);
        }

        // Build CSS into a string and only touch the DOM if it changed.
        let css = "";
        for (let i = 0; i < cardheads.length; i++) {
            let colorone = cardheads[i].style.backgroundColor.split(',');
            let [r, g, b] = [parseInt(colorone[0].split('(')[1]), parseInt(colorone[1]), parseInt(colorone[2])];
            let [h, s, l] = [rgbToHsl(r, g, b)[0], rgbToHsl(r, g, b)[1], rgbToHsl(r, g, b)[2]];
            let degree = ((h % 60) / 60) >= .66 ? 30 : ((h % 60) / 60) <= .33 ? -30 : 15;
            let newh = h > 300 ? (360 - (h + 65)) + (65 + degree) : h + 65 + degree;
            css += ".ic-DashboardCard:nth-of-type(" + (i + 1) + ") .ic-DashboardCard__header_hero{background: linear-gradient(115deg, hsl(" + h + "deg," + s + "%," + l + "%) 5%, hsl(" + newh + "deg," + s + "%," + l + "%) 100%)!important}";
        }

        if (cardcss.textContent !== css) {
            cardcss.textContent = css;
        }

    } else {
        let cardcss = document.querySelector("#gradientcss");
        if (cardcss && cardcss.textContent !== "") {
            cardcss.textContent = "";
        }
    }
}

function showUpdateMsg() {
    // dont run if not on dashboard
    const el = document.getElementById("announcementWrapper");
    if (!el) return;

    // option off or div already created
    let div = document.getElementById("canvasrefined-update-msg");
    if (options.show_updates !== true || options.update_msg === "") {
        if (div) div.style.display = "none";
        return;
    } else if (div) {
        div.style.display = "flex";
        return;
    }

    // first creation
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

/*
Other functions 
*/

function combineAssignments(data) {
    let combined = data;
    try {
        options.custom_assignments_overflow.forEach(overflow => {
            combined = combined.concat(options[overflow]);
        });
    } catch (e) {
        logError(e);
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

function setupCustomURL() {
    //let test = getData(`${domain}/api/v1/dashboard/dashboard_cards?include[]=concluded&include[]=term`);
    let test = getData(`${domain}/api/v1/courses?${/*enrollment_state=active&*/""}per_page=100`);
    test.then(res => {
        if (res.length) {
            getCards(res).then(() => {
                setTimeout(() => {
                    console.log("Canvas Refined - setting custom domain to " + domain);
                    chrome.storage.sync.set({ custom_domain: [domain] }).then(location.reload());
                }, 100);
            });
        } else {
            console.log("Canvas Refined - this url doesn't seem to be a canvas url (1)");
        }
    }).catch(err => {
        console.log("Canvas Refined - this url doesn't seem to be a canvas url (2)");
    });
}

function getGrades() {
    if (options.gpa_calc === true || options.dashboard_grades === true) {
        grades = getData(`${domain}/api/v1/courses?${/*enrollment_state=active&*/""}include[]=concluded&include[]=total_scores&include[]=computed_current_score&include[]=current_grading_period_scores&per_page=100`);
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
        // Fetch planner items from as far back as possible so overdue tasks
        // always appear, no matter how long ago they were due. The planner
        // API defaults start_date to "now" (which would hide every overdue
        // item), so a far-past start date is required. Canvas returns planner
        // items oldest-first in pages, so every page must be followed — a
        // single request would only return the oldest page and silently drop
        // all recent items.
        assignments = getAllPlannerItems();
        cardAssignments = preloadAssignmentEls();
    }
}

// Far-past start date for the planner items fetch. Concluded courses are
// excluded by the API by default, so this only pulls history from the user's
// currently active courses, which keeps the payload bounded.
const PLANNER_START_DATE = "2000-01-01";
// Hard cap on pages fetched (50 pages * 100 items = 5000 items) as a safety
// net against a malformed/misbehaving next link.
const PLANNER_MAX_PAGES = 50;

// Fetches every page of /api/v1/planner/items since PLANNER_START_DATE.
// Uses the same session/headers as getData but follows the Link "next"
// headers until exhausted.
async function getAllPlannerItems() {
    const allItems = [];
    let url = `${domain}/api/v1/planner/items?start_date=${PLANNER_START_DATE}&per_page=100`;
    for (let page = 0; page < PLANNER_MAX_PAGES && url; page++) {
        let response;
        let data;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            data = await response.json();
        } catch (e) {
            break;
        }
        if (!response.ok || !Array.isArray(data)) break;
        // Deep-clone via JSON to unwrap Firefox Xray objects so nested props
        // are mutable (same as getData).
        try {
            data = JSON.parse(JSON.stringify(data));
        } catch (_) { /* keep original */ }
        allItems.push(...data);
        url = getNextPageUrl(response.headers.get("Link"));
    }
    return allItems;
}

// Extracts the rel="next" URL from a Canvas pagination Link header, or
// returns null when on the last page.
function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
}

// ===================== Grade Analytics =====================
// On course grades pages, adds an "Analytics" toggle on the left side (in the
// Better Sidebar when enabled, otherwise in the native course nav) that shows
// a panel with a score-distribution doughnut, an overall-grade-over-time
// line chart, a GitHub-style grade heatmap, and a final-grade calculator.
// Data comes from the Canvas API with the user's session, so it
// matches the numbers on the page. Charts are hand-drawn on <canvas> so the
// extension needs no CDN/library and no chart library dependency.

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
// 5%-wide zone colors for the line chart background: the doughnut's bucket
// colors interpolated at 5% steps (dark red at 0 → green at 100), so every
// 5% band gets its own shade. Each band is sampled at its LOWER edge so
// every decade starts on its pure bucket color — a 70 is exactly yellow,
// not a yellow-green blend.
const GA_ZONE_COLORS = (() => {
    const stops = GA_BUCKETS.slice().reverse(); // 0-9 (dark red) → 90+ (green)
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    return Array.from({ length: 20 }, (_, i) => {
        const m = i * 5; // band's lower edge (70, 75, …) — see comment above
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

// Final-grade calculator settings, stored per course so each course's final
// weight and goal survive reloads: { weight, target, show }. The needed
// score itself is never stored — it's always recomputed against the live
// current grade.
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
let gaImagineIf = false;    // "Imagine-If mode" enabled on this page view (never persisted — always off on load)
let gaScenario = null;      // imagine-if working copy of groups + assignments
let gaIfCounter = 0;         // unique ids for user-added groups/assignments
let gaOriginalFinalHtml = null; // Total row's original grade span innerHTML, for restore
let gaTab = "overview";     // active panel tab: "overview" | "calc" | "heatmap"
let gaCalc = null;           // final-grade calculator settings for this course
let gaCourseId = null;       // course whose data is cached
let gaData = null;           // computed data for the current course
let gaLoading = false;

function gradeAnalyticsActive() {
    return options.grade_analytics === true && isGradesPage() && !quizSafeModeActive();
}

// Grades data is read straight from the #grades_summary table the page
// already rendered — no API round trips, so even courses with hundreds of
// assignments populate instantly, and the numbers always match what the user
// sees (grading periods, unposted grades, etc.). Waits briefly for the table
// to appear on SPA navigations.
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

// Entry point: called at init, on SPA navigation, and when the option changes.
function watchGradeAnalytics() {
    if (!gradeAnalyticsActive()) {
        removeGradeAnalyticsPanel();
        if (gaObserver) { gaObserver.disconnect(); gaObserver = null; }
        return;
    }
    // SPA navigation between courses: drop cached data so the panel never
    // shows the previous course's charts.
    const courseId = getCurrentCourseId();
    if (gaCourseId !== null && gaCourseId !== courseId) {
        gaData = null;
        gaCourseId = null;
        gaCalc = null; // per-course final-calculator settings
        removeGradeAnalyticsPanel();
    }
    if (!gaObserver) {
        // Canvas re-renders the left nav and content area during SPA
        // navigation; the observer keeps the panel placed.
        gaObserver = new MutationObserver(() => scheduleGradeAnalyticsSync());
        gaObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    scheduleGradeAnalyticsSync();
    // Restore the open/closed state and Y-axis preference the user last
    // chose, then inject the panel below the Print Grades header.
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
    // Imagine-If: Canvas re-renders can wipe the overwritten Total block or
    // swap in a new grades table (grading-period switch) — reapply, and
    // rebuild the scenario when the table's rows changed.
    if (gaImagineIf) {
        gaRenderImagineIf();
        gaApplyImagineTotal();
    }
    // Self-heal: the one-shot render after data loads can be a no-op when the
    // panel was created before Canvas finished laying out the page (zero-size
    // canvases) or while the body was still hidden. gaSetupCanvas leaves the
    // canvas backing store at width 0 in that case, so a 0-width canvas means
    // "never drawn" — redraw now that layout is real.
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
    // Never leave a hypothetical Total or inline editors behind when the
    // panel goes away.
    gaClearImagineUI();
    gaRestoreImagineTotal();
    document.getElementById("canvasrefined-grade-analytics")?.remove();
}

// Applies the in-memory open/closed state (restored from storage) to the panel
// DOM. Called both at panel creation and whenever an already-attached panel
// is reused, so a stored preference is never lost to a creation race (the DOM
// observer can build the panel before the storage read resolves).
function applyGradeAnalyticsOpenState(panel) {
    const body = panel.querySelector("#canvasrefined-ga-body");
    const btn = panel.querySelector("#canvasrefined-ga-toggle");
    if (!body || !btn) return;
    body.style.display = gaOpen ? "" : "none";
    const svg = btn.querySelector("svg");
    if (svg) svg.style.transform = gaOpen ? "rotate(180deg)" : "rotate(0deg)";
    btn.setAttribute("aria-expanded", String(gaOpen));
}

// Syncs the "Imagine-If mode" button's DOM to the in-memory state.
// Called at panel creation and whenever an already-attached panel is
// reused, mirroring applyGradeAnalyticsOpenState.
function applyGradeAnalyticsImagineState(panel) {
    const btn = panel.querySelector("#canvasrefined-ga-imagine");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(gaImagineIf));
    btn.style.borderColor = gaImagineIf ? "#2563eb" : "var(--bcborders)";
    btn.style.color = gaImagineIf ? "#2563eb" : "var(--bctext-0)";
    btn.style.fontWeight = gaImagineIf ? "600" : "";
}

// Panel is injected directly below the "Print Grades" action header on the
// grades page. Returns null (and retries via the DOM observer) if the anchor
// hasn't rendered yet.
function ensureGradeAnalyticsPanel() {
    let panel = document.getElementById("canvasrefined-grade-analytics");
    const anchor = document.getElementById("print-grades-container");
    if (panel && panel.isConnected) {
        // Canvas re-renders can shift the anchor or our position; keep the
        // panel directly after #print-grades-container at all times.
        if (anchor && panel.previousElementSibling !== anchor) {
            anchor.insertAdjacentElement("afterend", panel);
        }
        // Re-apply the open/closed state in case it was restored from storage
        // after this panel was first created.
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
        // Fallback: top of the content container until the anchor renders.
        container.insertBefore(panel, container.firstChild);
    }
    panel.style.cssText = `margin:18px 0;padding:16px;border:1px solid color-mix(in srgb, var(--bcborders) 75%, transparent);border-radius:10px;background-color:var(--bcbackground-0);color:var(--bctext-0);font-family:"Lato","Helvetica Neue",Helvetica,Arial,sans-serif;box-sizing:border-box;`;
    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <h2 style="margin:0;font-size:18px;color:var(--bctext-0);">Grade Analytics</h2>
            <button id="canvasrefined-ga-imagine" type="button" aria-pressed="false" title="Toggle Imagine-If mode" style="margin-left:auto;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:8px;padding:4px 12px;font-size:14px;line-height:1.4;cursor:pointer;">Imagine-If mode</button>
            <button id="canvasrefined-ga-toggle" type="button" aria-expanded="true" title="Toggle Grade Analytics" style="background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:8px;padding:4px 12px;font-size:14px;line-height:1.4;cursor:pointer;"><svg style="transform:rotate(180deg);display:block;" fill="currentColor" width="16px" height="16px" viewBox="-6.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.6"><g stroke-width="0"/><g stroke-linecap="round" stroke-linejoin="round"/><path d="M18.813 11.406l-7.906 9.906c-0.75 0.906-1.906 0.906-2.625 0l-7.906-9.906c-0.75-0.938-0.375-1.656 0.781-1.656h16.875c1.188 0 1.531 0.719 0.781 1.656z"/></svg></button>
        </div>
        <div id="canvasrefined-ga-body">
        <p id="canvasrefined-ga-status" style="margin:0 0 10px;color:var(--bctext-1);font-size:13px;">Loading grade data…</p>
        <div id="canvasrefined-ga-tabs" style="display:flex;gap:4px;border-bottom:1px solid color-mix(in srgb, var(--bcborders) 75%, transparent);margin-bottom:14px;">
            <button type="button" data-ga-tab="overview" style="${gaTabStyle(true)}">Overview</button>
            <button type="button" data-ga-tab="calc" style="${gaTabStyle(false)}">Final Calculator</button>
            <button type="button" data-ga-tab="heatmap" style="${gaTabStyle(false)}">Heatmap</button>
        </div>
        <div id="canvasrefined-ga-tab-overview">
        <div id="canvasrefined-ga-stats" style="display:none;flex-wrap:wrap;gap:10px;margin-bottom:14px;"></div>
        <div id="canvasrefined-ga-charts" style="display:none;gap:24px;flex-wrap:wrap;">
            <div id="canvasrefined-ga-box-pie" style="flex:1 1 calc(33.333% - 8px);min-width:0;">
                <h3 style="margin:0 0 8px;font-size:14px;color:var(--bctext-0);">Score distribution (graded assignments)</h3>
                <div style="position:relative;height:280px;"><canvas id="canvasrefined-ga-pie"></canvas><div id="canvasrefined-ga-pie-tip" style="position:absolute;display:none;pointer-events:none;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:6px;padding:6px 10px;font-size:12px;z-index:10;white-space:nowrap;"></div></div>
            </div>
            <div id="canvasrefined-ga-box-line" style="flex:1 1 calc(66.666% - 16px);min-width:0;">
                <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;">
                    <h3 style="margin:0;font-size:14px;color:var(--bctext-0);">Overall grade over time</h3>
                    <label for="canvasrefined-ga-fity" style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--bctext-1);cursor:pointer;user-select:none;"><input type="checkbox" id="canvasrefined-ga-fity"> Fit Y axis</label>
                </div>
                <div style="position:relative;height:280px;"><canvas id="canvasrefined-ga-line"></canvas><div id="canvasrefined-ga-line-tip" style="position:absolute;display:none;pointer-events:none;background:var(--bcbackground-1);color:var(--bctext-0);border:1px solid var(--bcborders);border-radius:6px;padding:8px 10px;font-size:12px;z-index:20;max-width:260px;box-shadow:0 4px 14px rgba(0,0,0,0.25);"></div></div>
            </div>
        </div>
        </div>
        <div id="canvasrefined-ga-tab-calc" style="display:none;">
            <div style="max-width:620px;">
                <p style="margin:0 0 14px;color:var(--bctext-1);font-size:13px;">Enter how much your final is worth and the overall grade you want to show see what grade you need on the final.</p>
                <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
                    <label style="flex:1 1 200px;font-size:12px;color:var(--bctext-1);">Final exam weight (% of grade)
                        <input id="canvasrefined-ga-calc-weight" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="20" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:15px;">
                    </label>
                    <label style="flex:1 1 200px;font-size:12px;color:var(--bctext-1);">Target overall grade (%)
                        <input id="canvasrefined-ga-calc-target" type="number" min="0" step="0.1" inputmode="decimal" placeholder="90" style="display:block;width:100%;margin-top:4px;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:15px;">
                    </label>
                </div>
                <label for="canvasrefined-ga-calc-show" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--bctext-0);cursor:pointer;user-select:none;margin-bottom:14px;"><input type="checkbox" id="canvasrefined-ga-calc-show"> Show grade goal on the overview</label>
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
                <span style="margin-left:12px;display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;display:inline-block;background:color-mix(in srgb, var(--bctext-1) 20%, transparent);"></span>No grade/assignment</span>
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
    // "Imagine-If mode" button on the right side of the panel header. The
    // toggle is per-page-view only (always off on load); the active style
    // highlights the button while the mode is on.
    imagineBtn.addEventListener("click", () => {
        gaImagineIf = !gaImagineIf;
        applyGradeAnalyticsImagineState(panel);
        if (gaImagineIf) gaEnterImagineIf();
        else gaExitImagineIf();
    });
    // "Fit Y axis" scales the line chart's Y axis to the data instead of a
    // fixed 0-100; the choice is remembered across pages via chrome.storage.
    fitYCheckbox.checked = gaFitY;
    fitYCheckbox.addEventListener("change", () => {
        gaFitY = fitYCheckbox.checked;
        setGradeAnalyticsFitY(gaFitY);
        if (gaData) {
            gaDrawLine(panel.querySelector("#canvasrefined-ga-line"), panel.querySelector("#canvasrefined-ga-line-tip"));
        }
    });
    // Tab switching between the charts overview and the final calculator.
    panel.querySelectorAll("[data-ga-tab]").forEach(btn => {
        btn.addEventListener("click", () => gaSetTab(btn.dataset.gaTab));
    });
    // Final-grade calculator inputs persist per course; every change re-saves
    // and recomputes the result against the live current grade.
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
    // If the data finished loading before this panel was created (or before
    // the stored open state was restored), the earlier render call found no
    // panel — draw the charts now that it exists.
    if (gaOpen && gaData) renderGradeAnalytics();
    return panel;
}

async function loadGradeAnalytics() {
    const courseId = getCurrentCourseId();
    if (courseId == null) return;
    gaLoading = true;
    const status = document.getElementById("canvasrefined-ga-status");
    if (status) status.textContent = "Reading grade data…";
    try {
        // Parse the grades table the page already rendered instead of hitting
        // the paginated API — instant even for courses with hundreds of
        // assignments, and always in sync with what the page shows.
        const table = await gaWaitForGradesTable();
        gaCourseId = courseId;
        gaData = computeGradeAnalyticsFromPage(table);
        gaLoading = false;
        // renderGradeAnalytics self-guards on panel existence and canvas
        // size; if the panel isn't ready yet, the retry in
        // ensureGradeAnalyticsPanel / syncGradeAnalyticsUI draws once it is.
        renderGradeAnalytics();
    } catch (err) {
        logError(err);
        const s = document.getElementById("canvasrefined-ga-status");
        if (s) s.textContent = "Grade Analytics failed to load: " + (err && err.message ? err.message : err);
    } finally {
        gaLoading = false;
    }
}

// Parses one assignment row of #grades_summary into a plain record. The row
// stashes the original posted score in a hidden "original_score" span (the
// "original_points" span holds points EARNED, not possible), while points
// possible is only in the "/ 15" span displayed after the grade.
function gaParseNum(t) {
    if (!t) return null;
    let s = String(t).replace(/\s+/g, "");
    if (s === "" || !/\d/.test(s)) return null;
    // Normalize "1,234.5" (thousands grouping) and "9,5" (comma decimal).
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
        // Rows the page lists as unsubmitted/unposted carry no score; only
        // "graded" rows have one.
        status: (q(".submission_status")?.textContent || "").trim(),
        gid: (q(".assignment_group_id")?.textContent || "").trim(),
        due: (q("td.due")?.textContent || "").replace(/\s+/g, " ").trim(),
    };
}

function computeGradeAnalyticsFromPage(table) {
    // Assignment group weights come from the "group total" summary rows
    // (e.g. "Summative Assessment — 86.67%, weight 85").
    const groupWeight = {};
    for (const tr of table.querySelectorAll("tr.group_total")) {
        const gid = tr.querySelector(".assignment_group_id")?.textContent.trim();
        const w = parseFloat((tr.querySelector(".group_weight")?.textContent || "").trim());
        if (gid) groupWeight[gid] = isFinite(w) ? w : 0;
    }
    const totalWeight = Object.values(groupWeight).reduce((s, w) => s + w, 0);

    // The page's own computed Total (e.g. "91.1%") — use it directly so the
    // "Overall grade" stat always matches the page.
    let pageTotal = null;
    const totalText = table.querySelector("tr.final_grade .grade")?.textContent || "";
    const totalMatch = totalText.match(/-?\d+(?:\.\d+)?/);
    if (totalMatch) pageTotal = parseFloat(totalMatch[0]);

    // Rows are already listed in due-date order; skip the summary rows (they
    // carry the student_assignment class too).
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

    // Running overall grade, in the page's row order, using Canvas's own
    // weighting algorithm (GradeCalculator): sum each group's pct × weight
    // over groups that have graded work, then scale up to 100% only when
    // those weights total less than 100 (weights over 100 are used raw and
    // can push the grade past 100). Verified to reproduce the Total shown
    // on the page. Point-based courses (no group weights) use points
    // earned / points possible.
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
            // Only zero-weighted groups have graded work — fall back to
            // points so the chart still has a line.
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
    // Trend: change in the running overall grade over the last 5 graded
    // assignments (or since the first, if fewer). Positive = climbing.
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

// Stat cards row on the Overview tab. The optional "Grade goal" card appears
// when the final calculator's "show" checkbox is on; it recomputes against
// the live current grade so it stays accurate as new grades come in.
function renderGaStats() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel || !gaData) return;
    const stats = panel.querySelector("#canvasrefined-ga-stats");
    if (!stats) return;
    stats.style.display = "flex";
    const stat = (cap, val, color) =>
        `<div style="padding:8px 14px;border-radius:8px;background:var(--bcbackground-1);"><div style="font-size:18px;font-weight:700;color:${color || "var(--bctext-0)"};">${val}</div><div style="font-size:11px;text-transform:uppercase;color:var(--bctext-1);">${cap}</div></div>`;
    // Trend card: arrow + colored delta of the overall grade over the last 5
    // graded assignments (green climbing, red falling, grey steady).
    let trendVal = "-", trendColor = "var(--bctext-0)";
    if (gaData.trend != null) {
        if (gaData.trend > 0.05) { trendVal = "\u25B2 +" + gaData.trend.toFixed(1) + "%"; trendColor = "#16a34a"; }
        else if (gaData.trend < -0.05) { trendVal = "\u25BC " + gaData.trend.toFixed(1) + "%"; trendColor = "#dc2626"; }
        else { trendVal = "\u25BA " + gaData.trend.toFixed(1) + "%"; trendColor = "var(--bctext-1)"; }
    }
    // Grade goal card from the Final Calculator tab: the score needed on the
    // final to hit the stored target grade.
    let goalStat = "";
    if (gaCalc && gaCalc.show && gaCalc.weight > 0 && gaCalc.target != null && gaData.current != null) {
        const w = gaCalc.weight / 100;
        const needed = (gaCalc.target - gaData.current * (1 - w)) / w;
        let val, color;
        if (needed <= 0) { val = "\u2713 Secured"; color = "#16a34a"; }
        else if (needed > 100) { val = "Out of reach"; color = "#dc2626"; }
        else { val = "\u2265 " + needed.toFixed(1) + "%"; color = gaNeededColor(needed); }
        goalStat = stat("Final Exam", val, color);
    }
    stats.innerHTML =
        stat("Overall grade", gaData.current == null ? "-" : gaData.current.toFixed(1) + "%") +
        stat("Grade trend (last 5)", trendVal, trendColor) +
        stat("Graded", gaData.graded) +
        stat("Ungraded", gaData.ungraded) +
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

// --- Final Calculator tab --------------------------------------------------

// Inline style for one panel tab button; the active tab gets the accent
// underline, matching how the rest of the panel is styled inline.
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
        // The canvases were zero-size while the tab was hidden; redraw now
        // that it's visible again.
        if (gaOpen && gaData) renderGradeAnalytics();
    } else if (tab === "heatmap") {
        renderGaHeatmap();
    } else {
        renderGaCalculator();
    }
}

// Severity color for an arbitrary score percentage — the same palette the
// doughnut / zone charts use, so a 70 renders yellow, an 85 green, etc.
function gaSeverityColor(pct) {
    if (pct == null || !isFinite(pct)) return "var(--bctext-0)";
    const b = GA_BUCKETS.find(b => pct >= b.min && pct < b.max);
    return (b || GA_BUCKETS[GA_BUCKETS.length - 1]).color;
}

// Inverted severity for the final calculator: a LOW required score is good
// (needing only 10% on the final is comfortably green), a high one is bad.
// Own scale, independent of the grade chart palette: needing ≥95% on the
// final is red, 75–94% yellow, and ≤74% green.
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

// Pushes the stored calculator settings into the tab's inputs without
// clobbering a field the user is actively typing in.
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

// Renders the calculator result: needed = (target − current·(1−w)) / w, where
// w is the final's weight. Always recomputed from the live current grade so
// stored goals stay accurate after reloads and as new grades post.
function renderGaCalculator() {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (!panel) return;
    const box = panel.querySelector("#canvasrefined-ga-calc-result");
    if (!box) return;
    if (!gaCalc || gaCalc.weight == null || !(gaCalc.weight > 0) || gaCalc.target == null) {
        box.innerHTML = `<span style="color:var(--bctext-1);">Enter your final's weight and your target grade to see what you need on the final.</span>`;
        return;
    }
    const w = gaCalc.weight / 100;
    const target = gaCalc.target;
    const current = gaData ? gaData.current : null;
    if (current == null) {
        box.innerHTML = `<span style="color:var(--bctext-1);">Waiting for grade data…</span>`;
        return;
    }
    const needed = (target - current * (1 - w)) / w;
    const withZero = current * (1 - w);
    const withPerfect = withZero + 100 * w;
    let head, sub;
    if (needed <= 0) {
        head = `<span style="font-size:20px;font-weight:700;color:#16a34a;">You're already there!</span>`;
        sub = `Even a 0 on the final leaves you at <b>${withZero.toFixed(1)}%</b>, which is above your <b>${target}%</b> goal.`;
    } else if (needed > 100) {
        head = `<span style="font-size:20px;font-weight:700;color:#dc2626;">Out of reach</span>`;
        sub = `Even a perfect final only gets you to <b>${withPerfect.toFixed(1)}%</b>, which is below your <b>${target}%</b> goal.`;
    } else {
        head = `<span style="font-size:20px;font-weight:700;color:${gaNeededColor(needed)};">You need ≥ ${needed.toFixed(1)}% on the final</span>`;
        sub = `You got this!`;
    }
    box.innerHTML = head + `<div style="margin-top:6px;color:var(--bctext-1);font-size:13px;">${sub}</div>`;
}

// --- Heatmap tab ----------------------------------------------------------

// One week cell in the heatmap strip: one square per Sunday–Saturday week,
// laid out left to right — 16px squares with 4px gaps. Weekly (not daily)
// buckets keep a whole semester compact instead of a sparse daily grid.
// One day cell in the calendar heatmap: 13px squares with 3px gaps,
// GitHub-style columns of Sunday–Saturday weeks.
const GA_HM_CELL = 13;
const GA_HM_GAP = 3;
const GA_HM_MONTH_H = 16; // vertical room for the month labels above the grid
let gaHeatmapToken = null; // identifies the data the grid was last built from

// Color for a day's average score — the same 5%-banded red→green palette
// the line chart's zones use, so an 84% day matches an 84% zone.
function gaHeatmapColor(avg) {
    return GA_ZONE_COLORS[Math.max(0, Math.min(GA_ZONE_COLORS.length - 1, Math.floor(avg / 5)))];
}

// Minimal HTML escaping for assignment titles that go into tooltips.
function gaEscHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Groups the graded assignments by due DATE. The grades table only renders
// "Sep 23"-style due dates (no year), so years are reconstructed: the table
// rows are in chronological order, so a month that steps backwards means the
// calendar wrapped into a new year; the base year is then chosen so the last
// due date isn't more than ~6 weeks in the future. Returns null when no
// graded assignment has a parseable due date.
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
    // Reconstruct years WITHOUT assuming the rows are in due-date order —
    // the table isn't sorted by date when Canvas arranges it by assignment
    // group, and the old "month stepped backwards ⇒ new year" detection
    // snowballed on that, landing dates decades off. A course spans at most
    // ~12 months, so instead: find the month rotation that packs every due
    // month into the shortest window (months before the rotation wrap into
    // the following year), then pick the base year whose window actually
    // contains today — or, failing that, the latest window entirely in the
    // past.
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
    // Bucket by calendar day; multiple assignments due the same day pool into
    // one cell colored by their average score.
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

// Tooltip anchored beside the hovered day cell. Positioning is relative to
// the heatmap tab (the tip's offsetParent), NOT the viewport: position:fixed
// is unreliable here because ancestors with transforms/backdrop-filters
// (Better Sidebar's glass panels, Canvas layout) redefine the containing
// block, which sent a fixed-position tooltip to the wrong part of the page.
function gaHeatmapShowTip(tip, e, cell, avg) {
    const d = cell.date;
    const rows = cell.items.map(p =>
        `<div style="margin-top:2px;color:var(--bctext-1);">${gaEscHtml(p.title)} — <b style="color:${gaHeatmapColor(p.pct)};">${p.pct.toFixed(1)}%</b></div>`).join("");
    tip.innerHTML = `<b>${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</b> — avg <b style="color:${gaHeatmapColor(avg)};">${avg.toFixed(1)}%</b><div style="margin-top:4px;font-size:11px;color:var(--bctext-1);">${cell.items.length} assignment${cell.items.length === 1 ? "" : "s"}:</div>${rows}`;
    tip.style.display = "block";
    const host = tip.offsetParent || tip.parentNode;
    const hostRect = host.getBoundingClientRect();
    const cellRect = e.target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    // Beside the cell, vertically centered on it; flip to the left when the
    // right edge is tight, and clamp inside the tab's box.
    let left = cellRect.right - hostRect.left + 6;
    if (left + tw > host.clientWidth - 4) left = Math.max(4, cellRect.left - hostRect.left - tw - 6);
    let top = cellRect.top - hostRect.top + (cellRect.height - th) / 2;
    top = Math.min(Math.max(4, top), Math.max(4, host.clientHeight - th - 4));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
}

// Builds the GitHub-style calendar: weekday labels down the left (Mon/Wed/
// Fri only), one column per Sunday–Saturday week, month labels across the
// top, one colored square per day (that day's average score). Pure DOM (no
// canvas) so it needs no redraw on resize; a token guards against rebuilds
// when renderGradeAnalytics re-fires for the same data.
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
        note.textContent = "No graded assignments with due dates yet.";
        return;
    }
    note.textContent = data.undated > 0
        ? `${data.undated} graded assignment${data.undated === 1 ? "" : "s"} without a due date not shown.`
        : "";
    // Align the range out to full Sunday–Saturday weeks so columns never
    // start mid-week.
    const start = new Date(data.min);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(data.max);
    end.setDate(end.getDate() + (6 - end.getDay()));
    // Left weekday labels — sparse like GitHub's (Mon/Wed/Fri).
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
        // Month label across the top when this week's Thursday enters a new
        // month (every month owns at least one Thursday, so none are
        // skipped).
        const thursday = new Date(cursor);
        thursday.setDate(thursday.getDate() + 4);
        if (prevMonth == null || thursday.getMonth() !== prevMonth) {
            prevMonth = thursday.getMonth();
            const lab = document.createElement("div");
            lab.textContent = months[prevMonth];
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

// --- Canvas-drawn charts --------------------------------------------------

function gaSetupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentNode.clientWidth, h = canvas.parentNode.clientHeight;
    // Zero size means the panel isn't visible/attached yet, so skip drawing;
    // the DOM observer / resize handler redraws once it has real dimensions.
    if (w <= 0 || h <= 0) return null;
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
    // Place the tooltip beside the cursor/point so it never covers the chart
    // underneath; flip to the left side when the right edge is tight.
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
        ctx.fillText("No graded assignments yet", cx, cy);
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
        if (hit) gaShowTooltip(tooltip, e.clientX - rect.left, e.clientY - rect.top, `<b>${hit.label}</b>: ${hit.value} assignment${hit.value === 1 ? "" : "s"}`);
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
    // Y axis: fixed 0-100 by default, or scaled to fit the data when the user
    // toggled "Fit Y axis" (persisted in chrome.storage.local).
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
    // Y grid: 5 evenly spaced lines across the current range.
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const decimals = (yMax - yMin) <= 10 ? 1 : 0;
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
        ctx.fillText("No graded assignments yet", w / 2, h / 2);
        return;
    }
    const X = (i) => pad.l + (pts.length === 1 ? (w - pad.l - pad.r) / 2 : (i / (pts.length - 1)) * (w - pad.l - pad.r));
    const Y = (v) => pad.t + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    // Full chart draw, parameterized by the hovered point index so mousemove
    // can cheaply redraw with a highlight on the active dot.
    const draw = (hover) => {
        ctx.clearRect(0, 0, w, h);
        // Optional colored 5% zones behind the plot ("Colored grade zones"
        // popup option), tinted red→green. With Fit Y axis on, bands are
        // clipped to the visible range.
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
        // Y grid: 5 evenly spaced lines across the current range.
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
        // Line + area fill.
        ctx.beginPath();
        pts.forEach((p, i) => { const x = X(i), y = Y(p.grade); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
        ctx.lineTo(X(pts.length - 1), h - pad.b); ctx.lineTo(X(0), h - pad.b); ctx.closePath();
        ctx.fillStyle = "rgba(37,99,235,0.12)"; ctx.fill();
        // Points.
        pts.forEach((p, i) => {
            ctx.beginPath(); ctx.arc(X(i), Y(p.grade), 3, 0, Math.PI * 2);
            ctx.fillStyle = "#2563eb"; ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        });
        // X axis: tick marks plus one label per calendar month. Points are
        // already in chronological order, so a walking month counter (wrapping
        // across Dec -> Jan) maps each point to an absolute month; the first
        // point of each month gets the tick + label.
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.strokeStyle = "rgba(128,128,128,0.55)";
        ctx.lineWidth = 1;
        const tick = (x) => {
            ctx.beginPath(); ctx.moveTo(x, h - pad.b); ctx.lineTo(x, h - pad.b + 4); ctx.stroke();
        };
        // Subtle tick under every data point on sparse charts.
        if (pts.length <= 25) pts.forEach((_, i) => tick(X(i)));
        // Month boundaries: the first point of each calendar month. Points are
        // already in chronological order, so a walking month counter (wrapping
        // across Dec → Jan) maps each point to an absolute month.
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
        // Collision-aware labels: greedily keep a month label only if it fits
        // after the previous kept one (labels are centered, so compare against
        // half-widths plus a 6px gap). The first boundary always gets a label;
        // so does the last — if it doesn't fit, earlier labels are dropped to
        // make room, so the axis ends on a real month instead of mid-run.
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
            // Anchor the edge labels inward so they don't clip.
            ctx.textAlign = k === 0 ? "left" : (b.i === pts.length - 1 ? "right" : "center");
            ctx.fillStyle = text;
            ctx.fillText(b.label, b.x, h - pad.b + 6);
        });
        // Hover indicator: dashed vertical guide plus a halo ring around the
        // hovered dot so it's obvious which point the tooltip describes.
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
            `<b>${p.title}</b><br>Overall: ${p.grade == null ? "-" : p.grade.toFixed(1) + "%"}<br>This: ${p.score}/${p.points} (${p.pct.toFixed(1)}%)${p.due ? `<br>Due: ${p.due}` : ""}`);
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

// Redraw open charts when the window is resized.
window.addEventListener("resize", () => {
    const panel = document.getElementById("canvasrefined-grade-analytics");
    if (panel && gaOpen && gaData) renderGradeAnalytics();
});

// --- Imagine-If mode ---------------------------------------------------------
//
// A hypothetical-grade sandbox rendered directly on the grades table (never
// inside the Grade Analytics panel): each assignment row gets inline
// score / points-possible inputs plus a group selector and remove button,
// each group-total row gets a weight input and remove button, the "+ Add
// assignment" button sits at the top of the table (above the first
// assignment), and the "+ Add group" button sits above the Total row. The
// hypothetical total is computed here — Canvas's weighting algorithm
// (groups with counted work contribute pct × weight, scaled up to 100% when
// the used weights total less than 100; point-based totals when no group has
// weight) — and previewed by overwriting the table's Total row (the
// tr.final_grade percentage span) with an obvious Imagine-If badge. Nothing is ever sent to Canvas; the page is
// restored to the pixel the moment the mode is turned off.

// Standard grading scheme for the hypothetical letter grade (a course's
// actual scheme isn't exposed on this page). 80.5% → B− matches Canvas's
// default cutoffs.
const GA_LETTER_SCALE = [
    ["A", 93], ["A−", 90], ["B+", 87], ["B", 83], ["B−", 80],
    ["C+", 77], ["C", 73], ["C−", 70], ["D+", 67], ["D", 63], ["D−", 60],
];

function gaLetterFor(pct) {
    if (pct == null || !isFinite(pct)) return null;
    for (const [letter, min] of GA_LETTER_SCALE) if (pct >= min) return letter;
    return "F";
}

// The table's Total row (tr.final_grade) — the recalculated grade
// overwrites its percentage span while Imagine-If mode is on.
function gaFindTotalGradeSpan() {
    const row = document.querySelector("#grades_summary tr.final_grade");
    return row ? row.querySelector("td.assignment_score .tooltip .grade") : null;
}

function gaFindTotalTitleCell() {
    const row = document.querySelector("#grades_summary tr.final_grade");
    return row ? row.querySelector("th.title") : null;
}

// Signature of the page's grades table (row ids). When it changes (grading
// period switch, SPA navigation) the scenario is rebuilt from the new table.
function gaImagineTableSig() {
    const table = document.querySelector("#grades_summary");
    return table ? [...table.querySelectorAll("tr.student_assignment")].map(tr => tr.id).join(",") : "";
}

// Snapshot of the page's groups and assignments the scenario starts from.
// Scores come from the hidden "original_score" spans (immune to Canvas's own
// What-If edits); ungraded rows keep score: null so they only count once the
// user types a score for them.
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

// Hypothetical total for the scenario, computed from scratch (never read
// from the page's Total). Only assignments with a score, a positive
// denominator, and a group that still exists count. Weighted when any
// group has weight (Canvas's GradeCalculator: sum pct × weight over groups
// with counted work, scale up to 100% when the used weights total < 100,
// use raw when ≥ 100), otherwise points earned / points possible.
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
    // With every group removed the total falls back to plain points, so all
    // assignments count regardless of their (dangling) group id.
    const noGroups = groups.size === 0;
    const stats = new Map(); // gid -> {score, pts}
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
        // Only zero-weighted groups have counted work — fall back to points.
    }
    let score = 0, pts = 0;
    for (const s of stats.values()) { score += s.score; pts += s.pts; }
    return pts > 0 ? (score / pts) * 100 : null;
}

// Total-row content for the hypothetical grade — clearly not the real
// grade: a purple Imagine-If badge and the hypothetical total (with letter)
// replace the percentage span, and an italic note under the "Total" label
// restates the real grade.
function gaImagineTotalHtml(pct) {
    const letter = gaLetterFor(pct);
    const pctText = pct == null || !isFinite(pct) ? "—" : pct.toFixed(1) + "%";
    // The wrapper is an inline-flex row with align-items:center so the
    // badge pill sits vertically centered with the grade text. No
    // flex-wrap: the narrow score cell would stack the items instead.
    return `<span style="display:inline-flex;align-items:center;gap:6px;">`
        + `<span style="background:#7c3aed;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.5px;padding:1px 6px;border-radius:999px;text-transform:uppercase;white-space:nowrap;">Imagine-If</span>`
        + `<span style="font-weight:700;color:#7c3aed;">${pctText}</span>`
        + (letter ? `<span style="color:#7c3aed;">(${letter})</span>` : "")
        + `</span>`;
}


// Overwrites (or restores) the table's Total row. Writes are guarded so the
// GA DOM observer never loops: the last written HTML is cached on the
// element and identical writes are skipped.
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
    // Italic note under the "Total" label restating the real grade.
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
            note.textContent = "Imagine-If scenario; not your actual grade.";
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

// Compact inline styles for controls injected into the grades table.
// Canvas's table CSS gives selects/inputs an 11px bottom margin and a tall
// native select box, which made our rows taller than the page's own —
// margin:0 and a fixed select height keep the rows even.
const GA_IF_TD_INPUT = "box-sizing:border-box;padding:3px 6px;border-radius:5px;border:1px solid var(--bcborders);background:var(--bcbackground-1);color:var(--bctext-0);font-size:12px;margin:0;";
const GA_IF_TD_NUM = GA_IF_TD_INPUT + "width:58px;";
const GA_IF_TD_SEL = GA_IF_TD_INPUT + "max-width:170px;height:26px;padding:2px 4px;";
const GA_IF_TD_BTN = GA_IF_TD_INPUT + "cursor:pointer;white-space:nowrap;";

// <select> of the scenario's live groups for one assignment row. A group
// that was removed leaves its assignments on "— not counted —" until the
// user reassigns them.
function gaIfSelectHtml(gid) {
    const groups = gaScenario ? gaScenario.groups.filter(g => !g.deleted) : [];
    return `<select data-ga-if-groupsel title="Imagine-If assignment group" style="${GA_IF_TD_SEL}">`
        + `<option value="">— not counted —</option>`
        + groups.map(g => `<option value="${gaEscHtml(g.gid)}"${String(gid) === String(g.gid) ? " selected" : ""}>${gaEscHtml(g.name)}</option>`).join("")
        + `</select>`;
}

// Re-renders every group <select>'s options (e.g. after a group was added or
// removed), preserving the current selection when it still exists. Skips the
// select the user is interacting with.
function gaIfRefreshSelects(table) {
    for (const sel of table.querySelectorAll("select[data-ga-if-groupsel]")) {
        if (document.activeElement === sel) continue;
        const cur = sel.value;
        const groups = gaScenario ? gaScenario.groups.filter(g => !g.deleted) : [];
        sel.innerHTML = `<option value="">— not counted —</option>`
            + groups.map(g => `<option value="${gaEscHtml(g.gid)}"${String(cur) === String(g.gid) ? " selected" : ""}>${gaEscHtml(g.name)}</option>`).join("");
        sel.value = groups.some(g => String(g.gid) === cur) ? cur : "";
    }
}

// Icon-only remove button (✕) for a row's last cell.
function gaIfDelButton(attr, title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(attr, "");
    btn.title = title;
    btn.textContent = "✕";
    btn.style.cssText = GA_IF_TD_BTN + "padding:3px 8px;";
    return btn;
}

// Injects the scenario controls into one assignment row: score (numerator)
// and points possible (denominator) inputs replace the read-only "5 / 5"
// display in the score cell, a group <select> replaces the group-name
// context line under the title, and an icon-only remove button goes in the
// row's last cell.
function gaIfBuildAssignmentControls(tr, a) {
    if (tr.querySelector(".canvasrefined-ga-if-edit")) return;
    const scoreTd = tr.querySelector("td.assignment_score");
    if (!scoreTd) return;
    const tooltip = scoreTd.querySelector("span.tooltip");
    if (tooltip) { tooltip.style.display = "none"; tooltip.dataset.gaIfHidden = "1"; }
    const edit = document.createElement("span");
    edit.className = "canvasrefined-ga-if-edit";
    edit.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    edit.innerHTML = `<input data-ga-if-score type="number" step="any" placeholder="—" value="${a.score == null ? "" : a.score}" title="Imagine-If score (numerator); blank = not counted" style="${GA_IF_TD_NUM}">`
        + ` <span style="color:var(--bctext-1);">/</span> `
        + `<input data-ga-if-pts type="number" step="any" min="0" placeholder="—" value="${a.points == null ? "" : a.points}" title="Imagine-If points possible (denominator)" style="${GA_IF_TD_NUM}">`;
    (scoreTd.querySelector(".score_holder") || scoreTd).appendChild(edit);
    const th = tr.querySelector("th.title");
    const ctx = th?.querySelector("div.context");
    if (ctx) { ctx.style.display = "none"; ctx.dataset.gaIfHidden = "1"; }
    const ctl = document.createElement("div");
    ctl.className = "canvasrefined-ga-if-ctl";
    ctl.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;";
    ctl.innerHTML = gaIfSelectHtml(a.gid);
    (th || tr).appendChild(ctl);
    // Icon-only remove button in the row's last cell.
    const lastTd = tr.cells[tr.cells.length - 1];
    if (lastTd && !lastTd.querySelector("[data-ga-if-adel]")) {
        lastTd.appendChild(gaIfDelButton("data-ga-if-adel", "Remove this assignment from the scenario"));
    }
}

// Injects the scenario controls into one group-total row: a weight input in
// the score cell (next to the group percentage, which shows the hypothetical
// value — see gaIfUpdateGroupPcts) and an icon-only remove button in the
// row's last cell.
function gaIfBuildGroupControls(tr, g) {
    if (tr.querySelector(".canvasrefined-ga-if-edit")) return;
    const scoreTd = tr.querySelector("td.assignment_score");
    if (!scoreTd) return;
    const edit = document.createElement("span");
    edit.className = "canvasrefined-ga-if-edit";
    edit.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-left:8px;";
    edit.innerHTML = `<input data-ga-if-gweight type="number" min="0" max="100" step="0.1" value="${g.weight}" title="Imagine-If group weight (% of grade)" style="${GA_IF_TD_NUM}">`
        + ` <span style="color:var(--bctext-1);">%</span>`;
    (scoreTd.querySelector(".score_holder") || scoreTd).appendChild(edit);
    // Icon-only remove button in the row's last cell.
    const lastTd = tr.cells[tr.cells.length - 1];
    if (lastTd && !lastTd.querySelector("[data-ga-if-gdel]")) {
        lastTd.appendChild(gaIfDelButton("data-ga-if-gdel", "Remove this group from the scenario (its assignments stop counting until reassigned)"));
    }
}

// A brand-new assignment row (user-added): same 8-cell shape as the page's
// own rows, with an editable title. Custom class only — never
// "student_assignment", so the table signature and the page parsers ignore
// our rows.
function gaIfMakeAssignmentRow(a) {
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-newrow";
    tr.innerHTML = `
        <th class="title" scope="row"><input data-ga-if-title type="text" value="${gaEscHtml(a.title)}" title="Assignment name" style="${GA_IF_TD_INPUT}width:100%;max-width:260px;"></th>
        <td class="due"></td><td class="submitted"></td><td class="status"></td>
        <td class="assignment_score"><div class="score_holder" style="position:relative;"></div></td>
        <td class="asset_processors_cell"></td><td class="details"></td><td></td>`;
    // Row separators matching the page's own rows. Two things make this
    // subtle: the dark-mode CSS paints every .ic-Table td border dark with
    // !important (which beats a normal inline style), and in the
    // collapsed-borders model CELL borders beat ROW borders — so the
    // separator must be set on the cells, with !important (an inline
    // !important beats the stylesheet's), to win the edge conflicts and
    // paint the white line the custom background shows on real rows.
    for (const cell of tr.cells) {
        cell.style.setProperty("border-top", "1px solid var(--bctext-1,#e2e2e2)", "important");
        cell.style.setProperty("border-bottom", "1px solid var(--bctext-1,#e2e2e2)", "important");
    }
    return tr;
}

// A brand-new group-total row (user-added), with an editable name.
function gaIfMakeGroupRow(g) {
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-newrow";
    tr.innerHTML = `
        <th class="title" scope="row"><input data-ga-if-gname type="text" value="${gaEscHtml(g.name)}" title="Group name" style="${GA_IF_TD_INPUT}width:100%;max-width:260px;"></th>
        <td class="due"></td><td class="submitted"></td><td class="status"></td>
        <td class="assignment_score"><div class="score_holder" style="position:relative;"><span class="tooltip"><span class="grade">—</span></span></div></td>
        <td class="asset_processors_cell"></td><td class="details"></td><td></td>`;
    // Same cell-level separators as gaIfMakeAssignmentRow.
    for (const cell of tr.cells) {
        cell.style.setProperty("border-top", "1px solid var(--bctext-1,#e2e2e2)", "important");
        cell.style.setProperty("border-bottom", "1px solid var(--bctext-1,#e2e2e2)", "important");
    }
    return tr;
}

// New assignments go right below the table header, above the first real
// assignment (stacking in add order).
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

// The "+ Add assignment" button sits on its own row at the top of the
// table — right below the header, above the first (or first user-added)
// assignment — so new assignments are created right where they appear.
function gaIfEnsureAddAssignmentRow(table) {
    if (table.querySelector("#canvasrefined-ga-if-add-asg")) return;
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-addrow";
    tr.innerHTML = `<td colspan="8" style="border:none!important;padding:6px 8px;">`
        + `<button type="button" id="canvasrefined-ga-if-add-asg" style="${GA_IF_TD_BTN}padding:4px 10px;">+ Add assignment</button>`
        + `</td>`;
    const firstNew = table.querySelector("tr.canvasrefined-ga-if-newrow[data-ga-if-key]");
    const firstReal = [...table.querySelectorAll("tr.student_assignment")]
        .find(r => !r.classList.contains("group_total") && !r.classList.contains("final_grade"));
    const anchor = firstNew || firstReal;
    if (anchor) anchor.before(tr);
    else (table.querySelector("tr.group_total") || table.querySelector("tr.final_grade") || table.lastElementChild).before(tr);
}

// The "+ Add group" button sits on its own row right above the table's
// Total row, where the group totals live.
function gaIfEnsureAddGroupRow(table) {
    if (table.querySelector("#canvasrefined-ga-if-add-group")) return;
    const tr = document.createElement("tr");
    tr.className = "canvasrefined-ga-if-addrow";
    tr.innerHTML = `<td colspan="8" style="border:none!important;padding:10px 8px;">`
        + `<button type="button" id="canvasrefined-ga-if-add-group" style="${GA_IF_TD_BTN}padding:6px 12px;">+ Add group</button>`
        + `</td>`;
    (table.querySelector("tr.final_grade") || table.lastElementChild).before(tr);
}

// Rewrites each group row's percentage to the hypothetical value for the
// current scenario (original text is stashed for restore). A dash means the
// group has no counted work.
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

// Removes every trace of the inline UI: injected controls and rows, hidden
// originals, hidden deleted rows, and the rewritten group percentages.
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

// One delegated listener set on the grades table handles every scenario
// edit, so rows can be injected/rebuilt freely without detaching handlers.
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
            const a = { key: "new-asg-" + (++gaIfCounter), title: "New assignment", score: null, points: 100, gid: groups[0] ? String(groups[0].gid) : "", _new: true };
            gaScenario.assignments.push(a);
            const tr = gaIfMakeAssignmentRow(a);
            gaIfInsertAssignmentRow(table, tr);
            tr.dataset.gaIfKey = a.key;
            gaIfBuildAssignmentControls(tr, a);
            tr.scrollIntoView({ block: "nearest" });
            tr.querySelector("[data-ga-if-title]")?.focus();
            gaApplyImagineTotal();
        } else if (btn.id === "canvasrefined-ga-if-add-group") {
            const g = { gid: "new-group-" + (++gaIfCounter), name: "New group", weight: 0, _new: true };
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

// Builds the inline UI on the grades table itself. The scenario is rebuilt
// from the page when the table's rows change (grading-period switch, SPA
// navigation); otherwise the already-built UI is left alone so typing is
// never clobbered. If Canvas wiped our controls (row re-render), the built
// count no longer matches and the UI is rebuilt from the scenario.
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

// Enters/leaves the mode: builds/removes the inline table UI and
// overwrites/restores the sidebar Total block.
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


async function getData(url) {
    let response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
    let data = await response.json();
    // Deep-clone via JSON to unwrap Firefox Xray objects so nested props are mutable.
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

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatTodoDate(date, submissions, hr24) {
    let { time, ms } = getRelativeDate(date);
    let fromNow = ms < 0 ? "in " + time : time + " ago";
    let dueSoon = false;
    if (submissions && submissions.submitted === false && ms >= -21600000) {
        dueSoon = true;
    }
    return { "dueSoon": dueSoon, "date": months[date.getMonth()] + " " + date.getDate() + " at " + (date.getHours() - (hr24 ? "" : date.getHours() > 12 ? 12 : 0)) + ":" + (date.getMinutes() < 10 ? "0" : "") + date.getMinutes() + (hr24 ? "" : date.getHours() >= 12 ? "pm" : "am") + " (" + fromNow + ")" };
}

function formatCardDue(date) {
    let due = new Date(date);
    if (options.relative_dues === true) {
        let relative = getRelativeDate(due, true);
        return relative.ms > 0 ? relative.time + " ago" : "in " + relative.time;
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
