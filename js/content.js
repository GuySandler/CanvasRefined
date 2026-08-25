const domain = window.location.origin;
const current_page = window.location.pathname;

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

function getSubmissionAssignmentLink() {
    const match = current_page.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/(\d+)(?:\/|$)/);
    if (!match) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/`;
}

let submissionPageButtonObserver = null;
let profileLogoutButtonObserver = null;
let newCanvasButtonObserver = null;

function addSubmissionPageButton() {
    const assignmentLink = getSubmissionAssignmentLink();
    if (!assignmentLink) return;
    const content = document.getElementById("content");
    if (!content || content.querySelector("#canvasrefined-assignment-return")) return;

    makeElement("a", content, {
        id: "canvasrefined-assignment-return",
        className: "canvasrefined-custom-btn",
        href: assignmentLink,
        textContent: "Back to Assignment",
        style: "display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;margin:0 0 12px 0;padding:10px 14px;text-decoration:none;font-weight:700;",
    }, true);
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
    if (!isProfilePage()) return;
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

function ensureSubmissionPageButton() {
    const assignmentLink = getSubmissionAssignmentLink();
    if (!assignmentLink) return false;
    const content = document.getElementById("content");
    if (!content) return false;
    if (content.querySelector("#canvasrefined-assignment-return")) return true;
    addSubmissionPageButton();
    return Boolean(content.querySelector("#canvasrefined-assignment-return"));
}

function isAssignmentPage() {
    return /^\/courses\/\d+\/assignments(?:\/\d+)?(?:\/|$)/.test(current_page);
}

function removeSequenceFooter() {
    if (!isAssignmentPage()) return false;
    const sequenceFooter = document.getElementById("sequence_footer");
    if (!sequenceFooter) return false;
    sequenceFooter.remove();
    return true;
}

function watchSequenceFooter() {
    if (!isAssignmentPage()) return;
    if (removeSequenceFooter()) return;
    if (sequenceFooterObserver) return;

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

function watchSubmissionPageButton() {
    if (!getSubmissionAssignmentLink()) return;
    if (ensureSubmissionPageButton()) return;
    if (submissionPageButtonObserver) return;

    submissionPageButtonObserver = new MutationObserver(() => {
        if (ensureSubmissionPageButton() && submissionPageButtonObserver) {
            submissionPageButtonObserver.disconnect();
            submissionPageButtonObserver = null;
        }
    });

    submissionPageButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
        if (submissionPageButtonObserver) {
            submissionPageButtonObserver.disconnect();
            submissionPageButtonObserver = null;
        }
    }, 10000);
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
        watchSubmissionPageButton();
        watchProfileLogoutPageButton();

        setupQuizSafeModeBanner();

        
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
			case "hide_feedback":
			case "full_width":
			case "center_cards":
			case "custom_styles":
				applyAestheticChanges();
				break;
			case "hide_new_canvas":
				watchNewCanvasButton();
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
			case "cardSpacing":
			case "cardWidth":
			case "cardHeight":
			case "customCardStyles":
				applyAestheticChanges();
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
                                const scopedData = courseId
                                    ? data.filter(item => {
                                        const itemCourseId = parseInt(item.course_id || item.context_id || item?.plannable?.course_id);
                                        return itemCourseId === courseId;
                                    })
                                    : data;
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
        #right-side-wrapper {
            backdrop-filter: blur(${bgBlur}px) !important;
            -webkit-backdrop-filter: blur(${bgBlur}px) !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent ${bgTransparent}%);
            border-radius: 5px;
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
            background: var(--bcbackground-0) !important;
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
                getCardsFromDashboard();
            } else {
                getCards();
            }
            sendResponse(true);
            break;
        case ("setcolors"): changeColorPreset(request.options); sendResponse(true); break;
        case ("getcolors"): sendResponse(getCardColors()); break;
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

function getCardColors() {
    let cards = document.querySelectorAll(".ic-DashboardCard__header");
    let colors = [];
    cards.forEach(card => {
        let rgbColor = card.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor;
        colors.push({ "href": card.querySelector(".ic-DashboardCard__link").href, "color": rgbToHex(rgbColor) });
    });
    colors.sort((a, b) => a.href > b.href ? 1 : -1);
    colors = colors.map(x => x.color);
    return colors;
}

function getCardsFromDashboard() {
    console.log("getting cards from dashboard")
    const dashboard_cards = document.querySelectorAll(".ic-DashboardCard");
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
                    cards[id] = { "default": card.querySelector(".ic-DashboardCard__header-subtitle").textContent.substring(0, 20), "name": "", "code": "", "img": "", "hidden": false, "weight": "regular", "credits": 1, "eid": 100000 - count, "gr": null };
    
                    let links = [];
                    for (let i = 0; i < 4; i++) {
                        links.push({ "path": "default", "is_default": true });
                    }
                    cards_2[id] = { "links": links };
        
                    cards_3[id] = { "url": domain };
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
            if(newCards !== true) return;
            console.log(newCards ? "new cards found" : "");
            chrome.storage.sync.set({ "custom_cards": cards, "custom_cards_2": cards_2, "custom_cards_3": cards_3 });
        }
    });
}

async function getCards(api = null) {
    let dashboard_cards = api ? api : await getData(`${domain}/api/v1/courses?${/*enrollment_state=active&*/""}per_page=100`);
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
                    cards[id] = { "default": card.course_code.substring(0, 20), "name": "", "code": "", "img": "", "hidden": false, "weight": "regular", "credits": 1, "eid": card.enrollment_term_id || 0, "gr": null };
                } else if (cards && cards[id]) {
                    newCards = true;
                    cards[id].default = card.course_code.substring(0, 20);
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
            return chrome.storage.sync.set(newCards ? { "custom_cards": cards, "custom_cards_2": cards_2, "custom_cards_3": cards_3 } : {});
        }
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

// true when `courseId` is the dimmed-out class because another class is selected.
function progressFilterDim(courseId) {
    return betterTodoProgressFilter != null && String(courseId) !== String(betterTodoProgressFilter);
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
    const minCenterRadius = 28;
    const requiredSpace = (ringCount - 1) * decrement + stroke / 2 + minCenterRadius;
    let adjustFactor = 1;
    if (requiredSpace > startRadius) {
        adjustFactor = (startRadius - minCenterRadius - stroke / 2) / Math.max(1, (ringCount - 1) * decrement);
    }

    shown.forEach((entry, idx) => {
        const radius = startRadius - idx * Math.max(1, Math.floor(decrement * adjustFactor));
        if (radius <= 0) return;
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

    // shrink spacing if too many classes would overflow the inner radius
    const minInnerRadius = 14;
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
        overlay.innerHTML = `<div class='canvasrefined-progress-percent' style='font-weight:700;font-size:20px;line-height:1;color:var(--bctext-0);'></div><div class='canvasrefined-progress-count' style='font-size:12px;margin-top:3px;color:var(--bctext-0);'></div>`;
        wrapper.appendChild(overlay);
    } else {
        overlay.style.transform = `translateY(${nudge}px)`;
    }
    overlay.querySelector('.canvasrefined-progress-percent').textContent = `${percent}%`;
    overlay.querySelector('.canvasrefined-progress-count').textContent = `${completedAll}/${totalAll} done`;
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

    const allAssignments = scopedData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note"));

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

    // sort by total desc and limit to 6 courses
    entries.sort((a, b) => b.total - a.total);
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
        const scopedData = courseId
            ? data.filter(item => {
                const itemCourseId = parseInt(item.course_id || item.context_id || item?.plannable?.course_id);
                return itemCourseId === courseId;
            })
            : data;

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
        assignmentsDue = displayData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note") && !item.submissions?.submitted && !item.planner_override?.marked_complete);
        completed = displayData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note") && (item.submissions?.submitted || item.planner_override?.marked_complete));
        // The timeframe is a persisted Better Todo List sub-option set in the
        // popup. Read the current value each render so popup changes apply on
        // the next render. Keeps items due on/before now+range (overdue items
        // are before now, so they are kept too). Only the Tasks tab is affected.
        betterTodoTimeframe = (options.todo_timeframe && Object.prototype.hasOwnProperty.call(BETTER_TODO_TIMEFRAME_DAYS, options.todo_timeframe)) ? options.todo_timeframe : "all";
        if (betterTodoTimeframe !== "all") {
            const cutoff = Date.now() + (BETTER_TODO_TIMEFRAME_DAYS[betterTodoTimeframe] * 24 * 60 * 60 * 1000);
            assignmentsDue = assignmentsDue.filter(item => new Date(item.plannable_date).getTime() <= cutoff);
        }
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

        const isCustomTask = item.plannable_type == "planner_note" || item.planner_override?.custom === true;
        const taskHref = isCustomTask ? customTaskHref(item) : (domain + item.html_url);
        const editButtonSvg = isCustomTask
            ? `<svg class="better-todo-assignment-edit" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px;position:absolute;top:18px;right:5px;opacity:0.3;transition:all .3s ease;cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'" title="Edit this custom task"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
            : "";
        const iconSize = isCustomTask ? 26 : 20;
        const iconLeftOffset = isCustomTask ? 2 : 5;
        const taskIcon = isCustomTask
            ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <path d="M19.8201 14H15.6001C15.04 14 14.76 14 14.5461 14.109C14.3579 14.2049 14.2049 14.3578 14.1091 14.546C14.0001 14.7599 14.0001 15.0399 14.0001 15.6V19.82M20 12.7269V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H12.9496C13.4578 20 13.7118 20 13.9498 19.9407C14.1608 19.8882 14.3618 19.8016 14.5449 19.6844C14.7515 19.5522 14.926 19.3675 15.2751 18.9983L19.1254 14.9252C19.4486 14.5833 19.6101 14.4124 19.7255 14.2156C19.8278 14.041 19.903 13.8519 19.9486 13.6548C20 13.4325 20 13.1973 20 12.7269Z" stroke="var(--cr-todo-icon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>`
            : `<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <g id="SVGRepo_bgCarrier" stroke-width="1"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                    <path d="M1468.214 0v551.145L840.27 1179.089c-31.623 31.623-49.693 74.54-49.693 119.715v395.289h395.288c45.176 0 88.093-18.07 119.716-49.694l162.633-162.633v438.206H0V0h1468.214Zm129.428 581.3c22.137-22.136 57.825-22.136 79.962 0l225.879 225.879c22.023 22.023 22.023 57.712 0 79.848l-677.638 677.637c-10.616 10.503-24.96 16.49-39.98 16.49H903.516v-282.35c0-15.02 5.986-29.364 16.49-39.867Zm-920.005 548.095H338.82v112.94h338.818v-112.94Zm225.88-225.879H338.818v112.94h564.697v-112.94Zm734.106-202.5-89.561 89.56 146.03 146.031 89.562-89.56-146.031-146.031Zm-508.228-362.197H338.82v338.818h790.576V338.82Z" fill-rule="evenodd"></path>
                </g>
            </svg>`;

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
					<span style="color:${courseColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${item.context_name}</span>
					<a href="${taskHref}" style="color:inherit;text-decoration:none;font-weight:bold;text-overflow:ellipsis;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-5px;">${item.plannable.title}</a>
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

		let filter = "";
		if (item.plannable.read_state == "read") {
			filter = "filter: grayscale(40%);"
		}

		announcement.innerHTML = `
		<div style="display:flex;align-items:center;gap:5px;width:100%;height:60px;background:var(--bcbackground-2);border-radius:5px;${filter}">
			<div style="width:40px;display:flex;align-items:center;justify-content:center;background-color:${courseColor};height:100%;border-radius:5px 0 0 5px;">
				<div style="width:23px;height:23px;display:flex;margin-left:0px;">
					<svg fill="var(--cr-todo-icon)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier">
							<path d="M1587.162 31.278c11.52-23.491 37.27-35.689 63.473-29.816 25.525 6.099 43.483 28.8 43.483 55.002V570.46C1822.87 596.662 1920 710.733 1920 847.053c0 136.32-97.13 250.503-225.882 276.705v513.883c0 26.202-17.958 49.016-43.483 55.002a57.279 57.279 0 0 1-12.988 1.468c-21.12 0-40.772-11.745-50.485-31.171C1379.238 1247.203 964.18 1242.347 960 1242.347H564.706v564.706h87.755c-11.859-90.127-17.506-247.003 63.473-350.683 52.405-67.087 129.657-101.082 229.948-101.082v112.941c-64.49 0-110.57 18.861-140.837 57.487-68.781 87.868-45.064 263.83-30.269 324.254 4.18 16.828.34 34.673-10.277 48.34-10.73 13.665-27.219 21.684-44.499 21.684H508.235c-31.171 0-56.47-25.186-56.47-56.47v-621.177h-56.47c-155.747 0-282.354-126.607-282.354-282.353v-56.47h-56.47C25.299 903.523 0 878.336 0 847.052c0-31.172 25.299-56.471 56.47-56.471h56.471v-56.47c0-155.634 126.607-282.354 282.353-282.354h564.593c16.941-.112 420.48-7.002 627.275-420.48Zm-5.986 218.429c-194.71 242.371-452.216 298.164-564.705 311.04v572.724c112.489 12.876 369.995 68.556 564.705 311.04ZM903.53 564.7H395.294c-93.402 0-169.412 76.01-169.412 169.411v225.883c0 93.402 76.01 169.412 169.412 169.412H903.53V564.7Zm790.589 123.444v317.93c65.618-23.379 112.94-85.497 112.94-159.021 0-73.525-47.322-135.53-112.94-158.909Z" fill-rule="evenodd"></path>
						</g>
					</svg>
				</div>
			</div>
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:${courseColor};font-size:12px;margin-top:-2px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;padding-right:22px;">${item.context_name}</span>
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
            const scopedData = courseId
                ? data.map(d => Object.assign({}, d)) // shallow copy
                    .filter(d => {
                        const itemCourseId = parseInt(d.course_id || d.context_id || d?.plannable?.course_id);
                        return itemCourseId === courseId;
                    })
                : data.map(d => Object.assign({}, d));

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
        const sidebarParent = layoutMode === "course" && leftSide ? leftSide : mainWrapper;
        if (layoutMode === "course" && leftSide) {
            leftSide.style.display = "flex";
            leftSide.style.flexDirection = "row";
            leftSide.style.alignItems = "stretch";
            leftSide.style.minWidth = "0";
            leftSide.style.gap = "0";
        }
        document.querySelector(".ic-app-nav-toggle-and-crumbs")?.style.setProperty("display", "none");
        if (layoutMode !== "course") {
            document.getElementById("left-side")?.style.removeProperty("display");
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
            const button = createSidebarButton(text, href, sidebarContent, icon);
            if (itemId) button.dataset.navItemId = itemId;
            addSidebarButtonBadge(button, getNavBadgeCount(item));
        });
    }

    if (!hasDashboardButton) {
        createSidebarButton("Dashboard", `${domain}/`, sidebarContent, customIcons["global_nav_dashboard_link"]);
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
    let cards = document.querySelectorAll(".ic-DashboardCard__header");
    let sortedCards = [];
    cards.forEach(card => {
        sortedCards.push({ "href": card.querySelector(".ic-DashboardCard__link").href, "el": card });
    });
    sortedCards.sort((a, b) => a.href > b.href ? 1 : -1);

    // push each color change into a queue
    try {
        sortedCards.forEach((card, i) => {
            let previousColor = rgbToHex(card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor);
            previous.push(previousColor);

            // Object.keys(res.custom_colors).forEach(item => {
            //let item_id = item.split("_")[1];
            let course_id = card.href.split("courses/")[1];

            //if (card.href.includes(item_id)) {
            let cnum = i % colors.length;

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
                    }).then(() => {
                        card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor = colors[cnum];
                        card.el.querySelector(".ic-DashboardCard__header-title span").style.color = colors[cnum];
                        card.el.querySelector(".ic-DashboardCard__header-button-bg").style.backgroundColor = colors[cnum];
                    });
            }

            colorChanges.push(changeCardColor);

            card.el.querySelector(".ic-DashboardCard__header_hero").style.backgroundColor = colors[cnum];
            card.el.querySelector(".ic-DashboardCard__header-title span").style.color = colors[cnum];
            card.el.querySelector(".ic-DashboardCard__header-button-bg").style.backgroundColor = colors[cnum];
            //}
            // });
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
        if (local["previous_colors"] === null || now >= local["previous_colors"].expire) {
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
                            let gradeContainer = cards[i].querySelector(".canvasrefined-card-grade") || makeElement("a", cards[i].querySelector(".ic-DashboardCard__header"), { "className": "canvasrefined-card-grade", "textContent": percent });
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

function applyAestheticChanges() {
    // Quiz safe mode: don't inject custom layout/aesthetic CSS on quiz pages.
    if (quizSafeModeActive()) return;
    let style = document.querySelector("#canvasrefined-aesthetics") || document.createElement('style');
    style.id = "canvasrefined-aesthetics";
    style.textContent = "";
    if (options.condensed_cards === true) style.textContent += ".ic-DashboardCard__header_hero {height:60px!important}.ic-DashboardCard__header-subtitle, .ic-DashboardCard__header-term{display:none}";
    if (options.remlogo === true) style.textContent += ".ic-app-header__logomark-container{display:none}";
    if (options.disable_color_overlay === true) style.textContent += ".ic-DashboardCard__header_hero{opacity: 0!important} .ic-DashboardCard__header-button-bg{opacity: 1!important}";
    if (options.hide_feedback === true) style.textContent += ".recent_feedback {display: none}";
    if (options.full_width === true) style.textContent += "#wrapper,.ic-Layout-wrapper{max-width:100%!important}";
    if (options.center_cards === true) style.textContent += ".ic-DashboardCard__box__container{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;align-items:flex-start!important}";
    if (options.customCardStyles === true) {
        if (options.imageSize !== undefined && options.imageSize !== 100) style.textContent += `.ic-DashboardCard__header_image {transform: scale(${options.imageSize / 100})!important; }`;
        if (options.cardRoundness !== undefined && options.cardRoundness !== 5) style.textContent += `.ic-DashboardCard {border-radius: ${options.cardRoundness}px!important;}`;
        if (options.cardSpacing !== undefined && options.cardSpacing !== 0) style.textContent += `.ic-DashboardCard {margin-right: ${options.cardSpacing / 2}px!important; margin-bottom: ${options.cardSpacing / 2}px!important;}`;
        if (options.cardWidth !== undefined && options.cardWidth !== 262) style.textContent += `.ic-DashboardCard {width: ${options.cardWidth}px!important;}`;
        // Always emit a fixed card height when custom card styles are on. The old
        // `!== 250` guard silently dropped the height rule when cardHeight matched
        // the default, which is exactly what happens after importing a theme that
        // carries the default cardHeight (250) — leaving cards content-sized.
        // Content-sized cards plus the dashboard reflow loop trigger Firefox scroll
        // anchoring to yank the viewport back up while scrolling. A fixed height
        // (even the default 250px) keeps layout stable.
        if (options.cardHeight !== undefined && options.cardHeight !== null && options.cardHeight !== "") {
            style.textContent += `.ic-DashboardCard {height: ${options.cardHeight}px!important;}`;
            // Canvas sets overflow:hidden on .ic-DashboardCard. With a fixed
            // height that clips the appended .canvasrefined-card-assignment area
            // (the assignment rows live at the bottom of the card), making the
            // .canvasrefined-assignment-link anchors unclickable for users with
            // custom card styles enabled. Allow overflow so those rows stay
            // visible and interactive when card assignments are shown.
            if (options.assignments_due === true) style.textContent += `.ic-DashboardCard {overflow: visible!important;}`;
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
        let weekAgo = new Date(new Date() - 604800000);
        //let weekAgo = new Date(new Date() - (604800000 * 10));
        assignments = getData(`${domain}/api/v1/planner/items?start_date=${weekAgo.toISOString()}&per_page=75`);
        cardAssignments = preloadAssignmentEls();
    }
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
