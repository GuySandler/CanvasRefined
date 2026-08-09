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

function isProfilePage() {
    return /^\/profile(?:\/|$)/.test(current_page);
}

function getSubmissionAssignmentLink() {
    const match = current_page.match(/^\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/(\d+)(?:\/|$)/);
    if (!match) return null;
    return `${domain}/courses/${match[1]}/assignments/${match[2]}/`;
}

let submissionPageButtonObserver = null;
let profileLogoutButtonObserver = null;

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

let sequenceFooterObserver = null;

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

function ensureSubmissionPageButton() {
    const assignmentLink = getSubmissionAssignmentLink();
    if (!assignmentLink) return false;
    const content = document.getElementById("content");
    if (!content) return false;
    if (content.querySelector("#canvasrefined-assignment-return")) return true;
    addSubmissionPageButton();
    return Boolean(content.querySelector("#canvasrefined-assignment-return"));
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
//let assignmentData = null;

/*
Start
*/

/*
// only works if a course has no quizzes...
function getClassAverages() {
    if (true) { // check if option is enabled
        let match = current_page.match(/courses\/(?<id>\d*)\/grades/);
        if (match) {
            let course_grades = getData(`${domain}/api/v1/courses/${match.groups.id}/assignments?include[]=score_statistics&include[]=submission`);
            let course_quizzes = getData(`${domain}/api/v1/courses/${match.groups.id}/quizzes`);
            let course_groups = getData(`${domain}/api/v1/courses/${match.groups.id}/assignment_groups`);
            course_grades.then(grades => {
                course_groups.then(groups => {
                    course_quizzes.then(quizzes => {
                        let total_weight = 0;
                        let total_points = 0;
                        let weights = {};
                        groups.forEach(group => {
                            weights[group.id] = group.group_weight;
                            total_weight += group.group_weight;
                        });
                        groups.forEach(group => {
                            weights[group.id] = total_weight === 0 ? 1 : weights[group.id] / total_weight;
                        });
                        let min = 0, lowq = 0, mean = 0, median = 0, upq = 0, max = 0, earned = 0;
                        grades.forEach(grade => {
                            if (!grade.score_statistics) return;
                            console.log("\nthis:", grade.name, grade.score_statistics.lower_q, grade.score_statistics.mean, grade.score_statistics.upper_q);
                            console.log("totals:", lowq, upq, total_points);
                            min += grade.score_statistics.min * weights[grade.assignment_group_id];
                            lowq += grade.score_statistics.lower_q * weights[grade.assignment_group_id];
                            mean += grade.score_statistics.mean * weights[grade.assignment_group_id];
                            median += grade.score_statistics.median * weights[grade.assignment_group_id];
                            upq += grade.score_statistics.upper_q * weights[grade.assignment_group_id];
                            max += grade.score_statistics.max * weights[grade.assignment_group_id];
                            total_points += grade.points_possible * weights[grade.assignment_group_id];
                            earned += grade.submission.score * weights[grade.assignment_group_id];
                        });

                        course_quizzes.forEach(quiz => {
                            // is it even possible to get quiz statistics?
                        });
                        // absolute minimum is if the same student got the lowest score on every assignment
                        // absolute maximum is if the same student got the highest score on every assignment
                        // it doesn't really tell you much because both are unlikely
                        console.log("\nabsolute minimum:", min / total_points, "\nabsolute maximum:", max / total_points, "\nlower quartile:", lowq / total_points, "\nmean:", mean / total_points, "\nupper quartile:", upq / total_points);

                        min = (min / total_points);
                        lowq = (lowq / total_points);
                        mean = (mean / total_points);
                        upq = (upq / total_points);
                        max = (max / total_points);
                        earned = (earned / total_points);

                        console.log(weights);

                        const width = 150;
                        let inner = `<td colspan="6" style="padding-bottom: 20px;"><table id="" class=""><thead><tr><th colspan="5">Class Averages</th><th></th></tr></thead><tbody><tr><td>Mean: ${(mean * 100).toFixed(2)}</td><td>Upper Quartile: ${(upq * 100).toFixed(2)}</td><td>Lower Quartile: ${(lowq * 100).toFixed(2)}</td><td colspan="3"><svg viewBox="-1 0 160 30" xmlns="http://www.w3.org/2000/svg" style="float: right; height: 30px; margin-20px; width: 161px; position: relative; margin-right: 30px;" aria-hidden="true"><line class="zero" x1="0" y1="3" x2="0" y2="27" stroke="#556572"></line><line class="possible" x1="150.0" y1="3" x2="150.0" y2="27" stroke="#556572"></line><line class="min" x1="${min * width}" y1="6" x2="${min * width}" y2="24" stroke="#556572" stroke-width="2"></line><line class="bottomQ" x1="${min * width}" y1="15" x2="${lowq * width}" y2="15" stroke="#556572" stroke-width="2"></line><line class="topQ" x1="${upq * width}" y1="15" x2="${max * width}" y2="15" stroke="#556572" stroke-width="2"></line><line class="max" x1="${max * width}" y1="6" x2="${max * width}" y2="24" stroke="#556572" stroke-width="2"></line><rect class="mid50" x="${lowq * width}" y="3" width="22.499999999999986" height="24" stroke="#556572" stroke-width="2" rx="3" fill="none"></rect><line class="median" x1="${mean * width}" y1="3" x2="${mean * width}" y2="27" stroke="#556572" stroke-width="2"></line><rect class="myScore" x="${(earned * width) - 7}" y="8" width="14" height="14" stroke="#224488" stroke-width="2" rx="3" fill="#aabbdd"></rect></svg></td></tr></tbody></table></td>`;

                        makeElement("tr", document.querySelector("#grades_summary tbody"), { "innerHTML": inner });
                    });
                });
            });

        }
    }
}
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

// async function ScheduledReminderCheck() {
//     let date = new Date();
//     let currentHour = date.getHours();
//     let currentMinute = date.getMinutes();
//     if (options.scheduledReminderTime) {
//         let [hour, minute] = options.scheduledReminderTime.split(":");
//         if (parseInt(hour) == currentHour && parseInt(minute) == currentMinute) {
//             const container = document.getElementById("canvasrefined-reminders") || makeElement("div", document.body, { "id": "canvasrefined-reminders" });
//             container.style.display = "flex";
//             container.textContent = "";
//             const storage = await chrome.storage.sync.get("reminders");
//             const now = (new Date()).getTime();
//             storage["reminders"].forEach(reminder => {
//                 if (reminder.d >= now) {
//                     createReminder(reminder, container);
//                 }
//             });
//         }
//     }
// }

// function toggleScheduledReminders() {
//     clearInterval(reminderCheck);
//     if (options.scheduledReminder !== true) return;
//     ScheduledReminderCheck();
//     reminderCheck = setInterval(ScheduledReminderCheck, 60000);
// }

isDomainCanvasPage();

function isDomainCanvasPage() {
    chrome.storage.sync.get(['custom_domain', 'dark_mode', 'dark_preset', 'device_dark', 'remind'/*, 'scheduledReminder', 'scheduledReminderTime'*/], result => {
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
            // toggleScheduledReminders();
            // turn the reminders on/off if the option is changed
            chrome.storage.onChanged.addListener((changes) => {
                Object.keys(changes).forEach(key => {
                    if (key === "remind") reminderWatch();
                    if (key === "scheduledReminder" || key === "scheduledReminderTime") {
                        options[key] = changes[key].newValue;
                        // toggleScheduledReminders();
                    }
                })
            })
        } else {
            setupCustomURL();
        }
    });
}

function startExtension() {
    toggleDarkMode();

    chrome.storage.sync.get(["better_sidebar", "sidebar_scale"], result => {
        options = { ...options, ...result };
        ensureBetterSidebar();
    });

    chrome.storage.sync.get(null, result => {
        options = { ...options, ...result };
        toggleAutoDarkMode();
        // toggleScheduledReminders();
        getApiData();
        checkDashboardReady();
        loadCustomFont();
        applyAestheticChanges();
        changeFavicon();
        updateReminders();
        applyCustomBackground();
        ensureBetterSidebar();
        watchSequenceFooter();
        watchSubmissionPageButton();
        watchProfileLogoutPageButton();

        //getClassAverages();
        
        setTimeout(() => document.getElementById("footer")?.remove(), 800);
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
        console.log(key + " changed");
        switch (key) {
			case "dark_mode":
			case "dark_preset":
			case "device_dark":
				toggleDarkMode();
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
				break;
			case "custom_assignments":
			case "assignment_date_format":
			case "card_overdues":
			case "relative_dues":
				cardAssignments = preloadAssignmentEls();
				loadCardAssignments();
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
			case "custom_styles":
				applyAestheticChanges();
				break;
            case "customBackgroundScale":
                applyCustomBackground();
                break;
			// case "show_updates":
			// 	showUpdateMsg();
			// 	break;
			case "remind":
				showExampleReminder();
				break;
			// case "scheduledReminder":
			// case "scheduledReminderTime":
			// 	toggleScheduledReminders();
				// break;
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
                    if (changes[key].newValue === true || changes[key].newValue === undefined) {
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
}

function ensureBetterSidebar() {
    if (!options.better_sidebar) return;
    if (document.querySelector("#better-sidebar-container")) return;
    if (!document.querySelector("#wrapper") || !document.querySelector(".ic-Layout-contentWrapper")) return;
    setupBetterSidebar(getSidebarLayoutMode());
}

function applyCustomBackground() {
    // let style = document.querySelector("#DashboardCard_Container")
    let style = document.querySelector("#canvasrefined-background") || document.createElement('style');
    style.id = "canvasrefined-background";
    
    if (options.customBackgroundLink && options.customBackgroundLink !== "") {
        const backgroundScale = Number(options.customBackgroundScale) || 100;
        style.textContent = `
        #wrapper {
            background-image: url('${options.customBackgroundLink}') !important;
            background-repeat: no-repeat !important;
            background-position: center center !important;
            background-attachment: fixed !important;
        }
        @media (orientation: landscape) {
            #wrapper { background-size: ${backgroundScale}% auto !important; }
        }
        @media (orientation: portrait) {
            #wrapper { background-size: cover !important; }
        }
        .ic-Dashboard-header__layout {
            background: none !important;
            /* backdrop-filter: blur(10px) !important; */
            border-radius: 5px;
        }
        #right-side-wrapper {
            // backdrop-filter: blur(10px) !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent 35%);
            border-radius: 5px;
        }
        .header-bar {
            background: none !important;
            padding: 0 !important;
            border: none !important;
        }
        .item-group-condensed,
        .item-group-container {
            background: transparent !important;
            /* backdrop-filter: blur(14px) saturate(120%) !important;
               -webkit-backdrop-filter: blur(14px) saturate(120%) !important; */
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
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent 35%) !important;
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
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent 35%) !important;
            border-radius: 5px !important;
            box-sizing: border-box !important;
        }
        ` : ""}
        ${isGroupsIndexPage() ? `
        #content {
            margin: 36px 48px 48px !important;
            padding: 10px !important;
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent 35%) !important;
            border-radius: 5px !important;
            box-sizing: border-box !important;
        }
        ` : ""}
        ${isConversationsPage() ? `
        .css-1nh4pc4-view-flexItem {
            background-color: color-mix(in srgb, var(--bcbackground-0), transparent 35%) !important;
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

        /* Apply backdrop blur only to module panels, not to all headers */
        .item-group-condensed.context_module,
        .item-group-condensed.context_module_item,
        .item-group-condensed.context_module:hover,
        .item-group-condensed.context_module_item:hover,
        .item-group-condensed.context_module.context_module_item_hover,
        .item-group-condensed.context_module_item.context_module_item_hover {
            backdrop-filter: blur(5px) !important;
            -webkit-backdrop-filter: blur(5px) !important;
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
    }
    
    document.documentElement.appendChild(style);
}
function clearCustomBackground() {
	let style = document.querySelector("#canvasrefined-background");
	if (style) style.remove();
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
    const callback = (mutationList) => {
        for (const mutation of mutationList) {
            if (mutation.type !== "childList") continue;
            if (current_page == "/" || current_page == "" || current_page.match(/^\/courses\/(\d+)(?:\/|$)/)) {
                if (dashboardReadyTimer) continue;

                const dashboardCards = document.querySelector("#DashboardCard_Container");
                if (dashboardCards) {
                }

                dashboardReadyTimer = setTimeout(() => {
                    dashboardReadyTimer = null;

                    const c = document.querySelector("#DashboardCard_Container");
                    if (c) {
                        let cards = document.querySelectorAll(".ic-DashboardCard");
                        changeGradientCards();
                        setupCardAssignments();
                        loadCardAssignments();
                        customizeCards(cards);
                        insertGrades();
                        loadDashboardNotes();
                        setupGPACalc();
                        showUpdateMsg();
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
            } else {
                console.log("I am outside", current_page);
                if (options.better_sidebar) {
                    ensureBetterSidebar();
                }
            }
        }
    };

    const observer = new MutationObserver(callback);
    observer.observe(document.querySelector('html'), { childList: true, subtree: true });
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
		case ("updateBackground"): clearCustomBackground(); sendResponse(true); break;
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
            /*
            if (el.classList.contains("no-touch")) {
                console.log({ "r": r, "g": g, "b": b }, { "r": r === bg0.r, "g": g === bg0.g, "b": b === bg0.b });
            }
            */
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

// function setAssignmentState(id, updates) {
//     let states = options.assignment_states;
//     let length = JSON.stringify(states).length;
//     // remove the oldest states if the size is approaching the storage limit
//     if (length > 7400) {
//         let keys = Object.keys(states).sort((a, b) => states[b].expire - states[a].expire);
//         keys.splice(-5);
//         let newStates = {};
//         keys.forEach(key => {
//             newStates[key] = states[key];
//         });
//         states = newStates;
//     }
//     states[id] = states[id] ? { ...states[id], ...updates } : updates;
//     chrome.storage.sync.set({ assignment_states: states }).then(() => { cardAssignments = preloadAssignmentEls(); loadBetterTodo(); loadCardAssignments(); });
// }

function createTodoCreateBtn(location) {
    let confirmButton = makeElement("button", location, { "className": "canvasrefined-custom-btn", "textContent": "Create" });
    confirmButton.addEventListener("click", () => {
        chrome.storage.sync.get("custom_assignments_overflow", overflow => {
            chrome.storage.sync.get(overflow["custom_assignments_overflow"], storage => {
                let course_id = parseInt(location.querySelector("#canvasrefined-custom-course").value);

                const assignment = {
                    "plannable_id": new Date().getTime(),
                    "context_name": options.custom_cards[location.querySelector("#canvasrefined-custom-course").value].default,
                    "plannable": { "title": location.querySelector("#canvasrefined-custom-name").value },
                    "plannable_date": location.querySelector("#canvasrefined-custom-date").value + "T" + location.querySelector("#canvasrefined-custom-time").value + ":00",
                    "planner_override": { "marked_complete": false, "custom": true },
                    "plannable_type": "assignment",
                    "submissions": { "submitted": false },
                    "course_id": course_id,
                    "html_url": `/courses/${course_id}/assignments`
                };

                /* handling overflow since the limit is 8kb per key */

                let found = false;
                let reload = () => {
                    location.classList.toggle("canvasrefined-custom-open");
                    loadBetterTodo();
                    loadCardAssignments();
                }

                /* find the first available overflow with space */
                /* or create a new one if all are full */
                let findOpenOverflow = (num) => {
                    let current_overflow = overflow["custom_assignments_overflow"][num];
                    storage[current_overflow].push(assignment);
                    chrome.storage.sync.set({ [current_overflow]: storage[current_overflow] }, () => {
                        /* assuming any error is because the limit is exceeded */
                        if (chrome.runtime.lastError) {
                            if (num === overflow["custom_assignments_overflow"].length - 1) {
                                console.log("all overflows are full! creating new overflow " + (overflow["custom_assignments_overflow"].length + 1));
                                let new_overflow = "custom_assignments_" + (overflow["custom_assignments_overflow"].length + 1);
                                overflow["custom_assignments_overflow"].push(new_overflow);
                                chrome.storage.sync.set({ [new_overflow]: [assignment], "custom_assignments_overflow": overflow["custom_assignments_overflow"] }).then(reload);
                            } else {
                                console.log("overflow " + (num + 1) + " full...");
                                findOpenOverflow(num + 1);
                            }
                        } else {
                            console.log("overflow " + (num + 1) + " has space!");
                            reload();
                        }
                    });
                }

                findOpenOverflow(0);

            });
        })
    });
}

// better todo html layer 1
// function createTodoHeader(location) {
//     let todoHeader = makeElement("h2", location, { "className": "todo-list-header", "style": "display: flex; align-items:center; justify-content:space-between;" });
//     //todoHeader.style = "display: flex; align-items:center; justify-content:space-between;";
//     if (!options.custom_cards || Object.keys(options.custom_cards).length === 0) return;
//     let addFillout = makeElement("div", location, { "className": "canvasrefined-add-assignment" });
//     let now = new Date();
//     let year = now.getFullYear();
//     let month = now.getMonth() + 1;
//     let day = now.getDate();
//     month = month < 10 ? "0" + month : month;
//     day = day < 10 ? "0" + day : day;
//     addFillout.innerHTML = '<input type="text" placeholder="Name" id="canvasrefined-custom-name" class="canvasrefined-custom-input"></input><select id="canvasrefined-custom-course" class="canvasrefined-custom-input"><option value="" disabled selected>Select course</option></select><div style="display: flex;gap:5px"><input type="date" id="canvasrefined-custom-date"  class="canvasrefined-custom-input"></input><input type="time" id="canvasrefined-custom-time"  class="canvasrefined-custom-input" value="23:59"></input></div>';
//     addFillout.querySelector("#canvasrefined-custom-date").value = year + "-" + month + "-" + day;
//     let selectCourse = document.querySelector("#canvasrefined-custom-course");
//     Object.keys(options.custom_cards).forEach(id => {
//         let card = options.custom_cards[id];
//         let courseName = makeElement("option", selectCourse, { "className": "canvasrefined-select-course-option", "textContent": card.default });
//         courseName.value = id;
//     });

//     createTodoCreateBtn(addFillout);
//     let headerText = makeElement("span", todoHeader, { "className": "canvasrefined-todo-header", "textContent": "To Do" });
//     let addButton = makeElement("button", todoHeader, { "className": "canvasrefined-custom-btn", "textContent": "+ Add" });
//     addButton.addEventListener("click", () => {
//         addFillout.classList.toggle("canvasrefined-custom-open");
//     });

//     headerText.addEventListener("click", () => {
//         if (filter === "todo") {
//             filter = "done";
//             headerText.textContent = "Done";
//         } else {
//             filter = "todo";
//             headerText.textContent = "To Do";
//         }
//         moreAssignmentCount = 0;
//         moreAnnouncementCount = 0;
//         loadBetterTodo();
//     });
// }

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
let domContainers = {};

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

function renderProgressRings(container, scopedData) {
    const allAssignments = scopedData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note"));

    // exclude items older than one month
    const oneMonthAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
    const recentAssignments = allAssignments.filter(item => {
        const dateStr = item.plannable_date || item.todo_date || item.plannable?.due_at || item.plannable?.plannable_date;
        if (!dateStr) return true; // keep items without a date
        const ts = Date.parse(dateStr);
        if (Number.isNaN(ts)) return true;
        return ts >= oneMonthAgo;
    });
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

    if (!entries.length) {
        container.innerHTML = "";
        return;
    }

    // sort by total desc and limit rings to 6
    entries.sort((a, b) => b.total - a.total);
    const shown = entries.slice(0, 6);

    const totalAll = shown.reduce((s, e) => s + e.total, 0);
    const completedAll = shown.reduce((s, e) => s + e.completed, 0);
    const percent = totalAll === 0 ? 0 : Math.round((completedAll / totalAll) * 100);

    // build SVG rings with visible gaps and a larger central hole.
    // calculate available width from the container so the outer ring is slightly inset
    const containerWidth = (container.clientWidth || 240);
    const maxSize = Math.min(280, Math.floor(containerWidth * 0.99));
    const size = maxSize; // svg square size
    const cx = size / 2;
    const cy = size / 2;
    let svgInner = "";

    const ringCount = shown.length;
    const stroke = 8; // ring thickness (thinner)
    const gap = 4; // visible gap between rings (reduced)
    const decrement = stroke + gap; // radius difference per ring ensures gap

    // make outer ring extend closer to container edges by using a small padding
    const padding = 2;
    const startRadius = Math.floor((size / 2) - padding - (stroke / 2));

    // ensure radii stay positive; if too small, reduce stroke/gap
    const minCenterRadius = 28; // minimum desired central hole radius
    const requiredSpace = (ringCount - 1) * decrement + stroke / 2 + minCenterRadius;
    let adjustFactor = 1;
    if (requiredSpace > startRadius) {
        // scale down decrement to fit
        adjustFactor = (startRadius - minCenterRadius - stroke / 2) / Math.max(1, (ringCount - 1) * decrement);
    }

    shown.forEach((entry, idx) => {
        const effectiveDecrement = Math.max(1, Math.floor(decrement * adjustFactor));
        const radius = startRadius - idx * effectiveDecrement;
        if (radius <= 0) return;
        const circumference = 2 * Math.PI * radius;
        const prog = entry.total === 0 ? 0 : (entry.completed / entry.total);
        const color = options.custom_cards_3?.[String(entry.courseId)]?.color || options.custom_cards_3?.[entry.courseId]?.color || `hsl(${(idx * 60) % 360} 70% 50%)`;

        // background ring (faded course color)
        svgInner += `<circle cx='${cx}' cy='${cy}' r='${radius}' stroke='${color}' stroke-opacity='0.25' stroke-width='${stroke}' fill='none'></circle>`;
        // progress ring (rotate -90 to start at top) - initialize empty and animate to target
        const dasharrayVal = circumference.toFixed(3);
        const dashoffsetTarget = (circumference * (1 - prog)).toFixed(3);
        // start with full offset (empty) and store target in data attribute; we'll animate after inserting into DOM
        svgInner += `<circle class='canvasrefined-progress-ring' cx='${cx}' cy='${cy}' r='${radius}' stroke='${color}' stroke-width='${stroke}' fill='none' stroke-linecap='round' transform='rotate(-90 ${cx} ${cy})' stroke-dasharray='${dasharrayVal}' stroke-dashoffset='${dasharrayVal}' data-target='${dashoffsetTarget}' style='transition: stroke-dashoffset .8s cubic-bezier(.2,.9,.2,1), opacity .3s ease;'></circle>`;
    });

    // center overlay text positioned inside the hole
    // Reuse existing elements when possible to avoid DOM replacement flicker
    let wrapper = container.querySelector('.canvasrefined-progress-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'canvasrefined-progress-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.position = 'relative';
        container.appendChild(wrapper);
    }

    // svg container
    let svg = wrapper.querySelector('svg.canvasrefined-progress-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'canvasrefined-progress-svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.style.display = 'block';
        wrapper.appendChild(svg);
    } else {
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    }

    // ensure overlay text exists
    let overlay = wrapper.querySelector('.canvasrefined-progress-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'canvasrefined-progress-overlay';
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.pointerEvents = 'none';
        const textWrap = document.createElement('div');
        textWrap.style.textAlign = 'center';
        textWrap.style.color = 'var(--bctext-0)';
        textWrap.innerHTML = `<div class='canvasrefined-progress-percent' style='font-weight:700;font-size:20px;line-height:1;'>${percent}%</div><div class='canvasrefined-progress-count' style='font-size:12px;margin-top:4px;'>${completedAll}/${totalAll} done</div>`;
        overlay.appendChild(textWrap);
        wrapper.appendChild(overlay);
    } else {
        const pc = overlay.querySelector('.canvasrefined-progress-percent');
        const cnt = overlay.querySelector('.canvasrefined-progress-count');
        if (pc) pc.textContent = `${percent}%`;
        if (cnt) cnt.textContent = `${completedAll}/${totalAll} done`;
    }

    // Update or create rings in-place
    const existingBg = svg.querySelectorAll('circle.canvasrefined-ring-bg');
    const existingFg = svg.querySelectorAll('circle.canvasrefined-progress-ring');

    // reuse or create circles per shown entry
    shown.forEach((entry, idx) => {
        const radius = startRadius - idx * Math.max(1, Math.floor(decrement * adjustFactor));
        const circumference = 2 * Math.PI * radius;
        const prog = entry.total === 0 ? 0 : (entry.completed / entry.total);
        const color = options.custom_cards_3?.[String(entry.courseId)]?.color || options.custom_cards_3?.[entry.courseId]?.color || `hsl(${(idx * 60) % 360} 70% 50%)`;

        // background circle
        let bg = svg.querySelector(`circle.canvasrefined-ring-bg[data-idx='${idx}']`);
        if (!bg) {
            bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bg.classList.add('canvasrefined-ring-bg');
            bg.setAttribute('data-idx', String(idx));
            svg.appendChild(bg);
        }
        bg.setAttribute('cx', String(cx));
        bg.setAttribute('cy', String(cy));
        bg.setAttribute('r', String(radius));
        bg.setAttribute('stroke', color);
        bg.setAttribute('stroke-opacity', '0.25');
        bg.setAttribute('stroke-width', String(stroke));
        bg.setAttribute('fill', 'none');

        // foreground (progress) circle
        let fg = svg.querySelector(`circle.canvasrefined-progress-ring[data-idx='${idx}']`);
        const dasharrayVal = circumference.toFixed(3);
        const dashoffsetTarget = (circumference * (1 - prog)).toFixed(3);
        if (!fg) {
            fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            fg.classList.add('canvasrefined-progress-ring');
            fg.setAttribute('data-idx', String(idx));
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
        fg.setAttribute('data-target', dashoffsetTarget);

        // request animation frame to set dashoffset to target (triggers transition)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fg.setAttribute('stroke-dashoffset', dashoffsetTarget);
            });
        });
    });

    // remove any extra existing circles
    const maxIdx = shown.length - 1;
    svg.querySelectorAll('circle.canvasrefined-ring-bg, circle.canvasrefined-progress-ring').forEach(c => {
        const idx = parseInt(c.getAttribute('data-idx'));
        if (Number.isNaN(idx) || idx > maxIdx) c.remove();
    });
}

function buildPlannerNotePayload(form) {
    const title = form.querySelector("#better-todo-new-task-title")?.value?.trim();
    const details = form.querySelector("#better-todo-new-task-details")?.value?.trim();
    const courseIdRaw = form.querySelector("#better-todo-new-task-course")?.value;
    const dateValue = form.querySelector("#better-todo-new-task-date")?.value;
    const timeValue = form.querySelector("#better-todo-new-task-time")?.value;

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

function fillTaskCourseOptions(courseSelect) {
    const cards = options.custom_cards || {};
    const courseColors = options.custom_cards_3 || {};
    const currentCourseId = getCurrentCourseId();
    const entries = Object.entries(cards)
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
            <div style="display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid #c7cdd1;border-radius:6px;background:var(--bcbackground-2);">
                <input type="text" id="better-todo-new-task-title" class="canvasrefined-custom-input" placeholder="Task title" maxlength="255">
                <textarea id="better-todo-new-task-details" class="canvasrefined-custom-input" placeholder="Details (optional)" style="min-height:70px;resize:vertical;padding-top:6px;padding-bottom:6px;"></textarea>
                <select id="better-todo-new-task-course" class="canvasrefined-custom-input"></select>
                <div style="display:flex;gap:6px;">
                    <input type="date" id="better-todo-new-task-date" class="canvasrefined-custom-input">
                    <input type="time" id="better-todo-new-task-time" class="canvasrefined-custom-input">
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span id="better-todo-add-task-status" style="font-size:12px;color:var(--bctext-0);"></span>
                    <button id="better-todo-add-task-submit" class="canvasrefined-custom-btn" style="padding:4px 10px;cursor:pointer;" type="button">Create</button>
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
            menu.classList.toggle("canvasrefined-custom-open");
        });

        menu.querySelector("#better-todo-add-task-submit").addEventListener("click", async () => {
            const status = menu.querySelector("#better-todo-add-task-status");
            const submitButton = menu.querySelector("#better-todo-add-task-submit");
            status.textContent = "";
            submitButton.disabled = true;

            try {
                const payload = buildPlannerNotePayload(menu);
                await createCanvasPlannerNote(payload);
                status.textContent = "Task created.";
                status.style.color = "#198754";
                menu.querySelector("#better-todo-new-task-title").value = "";
                menu.querySelector("#better-todo-new-task-details").value = "";
                menu.classList.remove("canvasrefined-custom-open");

                getAssignments();
                clearTodoList();
                createTodoSections(location);
            } catch (e) {
                status.textContent = e?.message || "Could not create task.";
                status.style.color = "#db3754";
            } finally {
                submitButton.disabled = false;
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

        announcements = scopedData.filter(item => item.plannable_type == "announcement");
        assignmentsDue = scopedData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note") && !item.submissions?.submitted && !item.planner_override?.marked_complete);
        completed = scopedData.filter(item => (item.plannable_type == "assignment" || item.plannable_type == "planner_note") && (item.submissions?.submitted || item.planner_override?.marked_complete));
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
            else if (key == "1") label = "Due <strong>Tommorow</strong>";
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
            if (options.todo_progress_rings === undefined || options.todo_progress_rings === true) {
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
        const iconSize = isCustomTask ? 26 : 20;
        const iconLeftOffset = isCustomTask ? 2 : 5;
        const taskIcon = isCustomTask
            ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
                <path d="M19.8201 14H15.6001C15.04 14 14.76 14 14.5461 14.109C14.3579 14.2049 14.2049 14.3578 14.1091 14.546C14.0001 14.7599 14.0001 15.0399 14.0001 15.6V19.82M20 12.7269V7.2C20 6.0799 20 5.51984 19.782 5.09202C19.5903 4.71569 19.2843 4.40973 18.908 4.21799C18.4802 4 17.9201 4 16.8 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H12.9496C13.4578 20 13.7118 20 13.9498 19.9407C14.1608 19.8882 14.3618 19.8016 14.5449 19.6844C14.7515 19.5522 14.926 19.3675 15.2751 18.9983L19.1254 14.9252C19.4486 14.5833 19.6101 14.4124 19.7255 14.2156C19.8278 14.041 19.903 13.8519 19.9486 13.6548C20 13.4325 20 13.1973 20 12.7269Z" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>`
            : `<svg fill="var(--bctext-0)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
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
					<span style="color:${courseColor};font-size:12px;margin-top:-2px;">${item.context_name}</span>
					<a href="${domain + item.html_url}" style="color:inherit;text-decoration:none;font-weight:bold;text-overflow:ellipsis;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-5px;">${item.plannable.title}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}</span>
				</div>
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
					<svg fill="var(--bctext-0)" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg" style="transition:all .3s ease;">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
						<g id="SVGRepo_iconCarrier">
							<path d="M1587.162 31.278c11.52-23.491 37.27-35.689 63.473-29.816 25.525 6.099 43.483 28.8 43.483 55.002V570.46C1822.87 596.662 1920 710.733 1920 847.053c0 136.32-97.13 250.503-225.882 276.705v513.883c0 26.202-17.958 49.016-43.483 55.002a57.279 57.279 0 0 1-12.988 1.468c-21.12 0-40.772-11.745-50.485-31.171C1379.238 1247.203 964.18 1242.347 960 1242.347H564.706v564.706h87.755c-11.859-90.127-17.506-247.003 63.473-350.683 52.405-67.087 129.657-101.082 229.948-101.082v112.941c-64.49 0-110.57 18.861-140.837 57.487-68.781 87.868-45.064 263.83-30.269 324.254 4.18 16.828.34 34.673-10.277 48.34-10.73 13.665-27.219 21.684-44.499 21.684H508.235c-31.171 0-56.47-25.186-56.47-56.47v-621.177h-56.47c-155.747 0-282.354-126.607-282.354-282.353v-56.47h-56.47C25.299 903.523 0 878.336 0 847.052c0-31.172 25.299-56.471 56.47-56.471h56.471v-56.47c0-155.634 126.607-282.354 282.353-282.354h564.593c16.941-.112 420.48-7.002 627.275-420.48Zm-5.986 218.429c-194.71 242.371-452.216 298.164-564.705 311.04v572.724c112.489 12.876 369.995 68.556 564.705 311.04ZM903.53 564.7H395.294c-93.402 0-169.412 76.01-169.412 169.411v225.883c0 93.402 76.01 169.412 169.412 169.412H903.53V564.7Zm790.589 123.444v317.93c65.618-23.379 112.94-85.497 112.94-159.021 0-73.525-47.322-135.53-112.94-158.909Z" fill-rule="evenodd"></path>
						</g>
					</svg>
				</div>
			</div>
			<div style="width:calc(100% - 40px);height:80%;display:flex;flex-direction:column;gap:5px;padding-left:2px;box-sizing:border-box;overflow:hidden;">
				<div style="display:flex;flex-direction:column;gap:3px;">
					<span style="color:${courseColor};font-size:12px;margin-top:-2px;">${item.context_name}</span>
					<a href="${domain + item.html_url}" style="color:inherit;text-decoration:none;font-weight:bold;text-overflow:ellipsis;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:-5px;">${item.plannable.title}</a>
					<span style="color:var(--bctext-0);font-size:12px;margin-top:-5px;">${convertToDueDate(item.plannable_date)}</span>
				</div>
			</div>
		</div>
		`;
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
    fetch(domain + "/api/v1/planner/overrides" + (item.planner_override ? "/" + item.planner_override.id : ""), {
		method: item.planner_override ? "PUT" : "POST",
		headers: {
			"content-type":"application/json",
			"accept":"application/json",
			"X-CSRF-Token": csrfToken
		},
		body: JSON.stringify({
			id: item.planner_override ? item.planner_override.id : null,
			marked_complete: completeState,
			plannable_id: item.plannable_id,
			plannable_type: item.plannable_type
		})
	})
	.then(resp => {
        if (resp.status == 200 || resp.status == 201 || resp.status == 204) {
			console.log("marked as complete");
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
        if (progressPlaceholder && typeof assignments?.then === 'function' && (options.todo_progress_rings === undefined || options.todo_progress_rings === true)) {
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
        if (layoutMode === "course" && leftSide) {
            const notRightSide = document.getElementById("not_right_side");
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
            contentMain?.style.setProperty("background", "color-mix(in srgb, var(--bcbackground-0) 45%, transparent)", "important");
            contentMain?.style.setProperty("backdrop-filter", "blur(5px)", "important");
            contentMain?.style.setProperty("-webkit-backdrop-filter", "blur(5px)", "important");
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
            style: `display:flex;flex-direction:column;width:50px;justify-content:center;align-items:center;box-sizing:border-box;position:relative;background-color:var(--bcbackground-0);height:100vh;position:sticky;top:0;left:0;`
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
                    <path d="M20 4V20M4 12H16M16 12L12 8M16 12L12 16" stroke="var(--bctext-0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </g>
            </svg>
        `
        sidebarList.dataset.expanded = expanded ? "true" : "false";
        updateSidebar(expanded, sidebarList, expander);
        setSidebarExpandedState(layoutMode, expanded);
        requestAnimationFrame(() => {
            populateSidebarFromNav(sidebarContent);
            updateSidebar(expanded, sidebarList, expander);
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
        style: "width:40%;height:var(--bc-sidebar-btn-height,30px);cursor:pointer;text-align:center;text-decoration:none;display:inline-flex;justify-content:center;align-items:center;gap:var(--bc-sidebar-btn-gap,8px);color:var(--bctext-0) !important;font-weight:bold;position:relative;",
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
    if (!button || !count) return;
    button.querySelector(".better-sidebar-badge")?.remove();
    makeElement("div", button, {
        className: "better-sidebar-badge",
        style: "position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background-color:#ff0000;color:white;font-size:11px;line-height:16px;display:flex;justify-content:center;align-items:center;box-sizing:border-box;pointer-events:none;",
        textContent: String(count),
    });
}
function populateSidebarFromNav(sidebarContent) {
	const excludeIds = ["global_nav_help_link", "global_nav_history_link"];
	const customIcons = {
		"global_nav_profile_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="white"></path></g></svg>`,
		"global_nav_dashboard_link": `<svg fill="white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><rect x="2" y="2" width="9" height="11" rx="2"></rect><rect x="13" y="2" width="9" height="7" rx="2"></rect><rect x="2" y="15" width="9" height="7" rx="2"></rect><rect x="13" y="11" width="9" height="11" rx="2"></rect></g></svg>`,
		"global_nav_conversations_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M4 18L9 12M20 18L15 12M3 8L10.225 12.8166C10.8665 13.2443 11.1872 13.4582 11.5339 13.5412C11.8403 13.6147 12.1597 13.6147 12.4661 13.5412C12.8128 13.4582 13.1335 13.2443 13.775 12.8166L21 8M6.2 19H17.8C18.9201 19 19.4802 19 19.908 18.782C20.2843 18.5903 20.5903 18.2843 20.782 17.908C21 17.4802 21 16.9201 21 15.8V8.2C21 7.0799 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V15.8C3 16.9201 3 17.4802 3.21799 17.908C3.40973 18.2843 3.71569 18.5903 4.09202 18.782C4.51984 19 5.07989 19 6.2 19Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>`,
		"global_nav_calendar_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M3 9H21M7 3V5M17 3V5M6 12H8M11 12H13M16 12H18M6 15H8M11 15H13M16 15H18M6 18H8M11 18H13M16 18H18M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" stroke="white" stroke-width="2" stroke-linecap="round"></path></g></svg>`,
		"global_nav_courses_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M20 12V4C20 2.89543 19.1046 2 18 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V18.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M13 2V14L16.8182 11L20 14V5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>`,
		"global_nav_groups_link": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M16 6C14.3432 6 13 7.34315 13 9C13 10.6569 14.3432 12 16 12C17.6569 12 19 10.6569 19 9C19 7.34315 17.6569 6 16 6ZM11 9C11 6.23858 13.2386 4 16 4C18.7614 4 21 6.23858 21 9C21 10.3193 20.489 11.5193 19.6542 12.4128C21.4951 13.0124 22.9176 14.1993 23.8264 15.5329C24.1374 15.9893 24.0195 16.6114 23.5631 16.9224C23.1068 17.2334 22.4846 17.1155 22.1736 16.6591C21.1979 15.2273 19.4178 14 17 14C13.166 14 11 17.0742 11 19C11 19.5523 10.5523 20 10 20C9.44773 20 9.00001 19.5523 9.00001 19C9.00001 18.308 9.15848 17.57 9.46082 16.8425C9.38379 16.7931 9.3123 16.7323 9.24889 16.6602C8.42804 15.7262 7.15417 15 5.50001 15C3.84585 15 2.57199 15.7262 1.75114 16.6602C1.38655 17.075 0.754692 17.1157 0.339855 16.7511C-0.0749807 16.3865 -0.115709 15.7547 0.248886 15.3398C0.809035 14.7025 1.51784 14.1364 2.35725 13.7207C1.51989 12.9035 1.00001 11.7625 1.00001 10.5C1.00001 8.01472 3.01473 6 5.50001 6C7.98529 6 10 8.01472 10 10.5C10 11.7625 9.48013 12.9035 8.64278 13.7207C9.36518 14.0785 9.99085 14.5476 10.5083 15.0777C11.152 14.2659 11.9886 13.5382 12.9922 12.9945C11.7822 12.0819 11 10.6323 11 9ZM3.00001 10.5C3.00001 9.11929 4.1193 8 5.50001 8C6.88072 8 8.00001 9.11929 8.00001 10.5C8.00001 11.8807 6.88072 13 5.50001 13C4.1193 13 3.00001 11.8807 3.00001 10.5Z" fill="white"></path></g></svg>`,
		"globalNavExternalTool-69": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 1C4.34315 1 3 2.34315 3 4V17V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V17V4C21 2.34315 19.6569 1 18 1H6ZM5 20V17C5 16.4477 5.44772 16 6 16H18C18.5523 16 19 16.4477 19 17V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20ZM18 14C18.3506 14 18.6872 14.0602 19 14.1707V4C19 3.44772 18.5523 3 18 3H6C5.44772 3 5 3.44772 5 4V14.1707C5.31278 14.0602 5.64936 14 6 14H18ZM14.5 19.25C15.1904 19.25 15.75 18.6904 15.75 18C15.75 17.3096 15.1904 16.75 14.5 16.75C13.8096 16.75 13.25 17.3096 13.25 18C13.25 18.6904 13.8096 19.25 14.5 19.25Z" fill="white"></path></g></svg>`,
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
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 width:20px;height:20px;flex-shrink:0;fill:white;stroke:white;"`);
                            } else {
                                // Add new style attribute
                                icon = icon.replace("<svg", '<svg style="width:20px;height:20px;flex-shrink:0;fill:white;stroke:white;"');
                            }
                        } else {
                            // Smaller SVG - just add colors
                            if (icon.includes('style="')) {
                                icon = icon.replace(/style="([^"]*)"/, `style="$1 fill:white;stroke:white;flex-shrink:0;"`);
                            } else {
                                icon = icon.replace("<svg", '<svg style="fill:white;stroke:white;flex-shrink:0;"');
                            }
                        }
                    } else {
                        // No viewBox - just add colors
                        if (icon.includes('style="')) {
                            icon = icon.replace(/style="([^"]*)"/, `style="$1 fill:white;stroke:white;"`);
                        } else {
                            icon = icon.replace("<svg", '<svg style="fill:white;stroke:white;"');
                        }
                    }
                }
            }

            if (itemId === "global_nav_dashboard_link") hasDashboardButton = true;
            const button = createSidebarButton(text, href, sidebarContent, icon);
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
function getCourseLinks() {
	const linkList = document.getElementById("section-tabs");
	if (!linkList) return [];
	const links = linkList.querySelectorAll("a");
	const courseLinks = [];
	links.forEach(link => {
		const url = new URL(link.href).pathname;
		courseLinks.push({
			name: link.textContent.trim(),
			url: url
		});
	})
	return courseLinks;
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
                                    // custom assignment
                                    if (customItem) {
                                        previewText.textContent = "Custom assignment";
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
                        } /*else {
                            // set the item as complete through api
                            fetch(domain + '/api/v1/planner/overrides' + (item.planner_override ? "/" + item.planner_override.id : ""),
                                {
                                    method: item.planner_override ? "PUT" : "POST",
                                    headers: {
                                        "content-type": "application/json",
                                        'accept': 'application/json',
                                        'X-CSRF-Token': csrfToken,
                                    },
                                    body: JSON.stringify({ id: item.planner_override ? item.planner_override.id : null, marked_complete: true, plannable_id: item.plannable_id, plannable_type: item.plannable_type })
                                }).then(resp => {
                                    if (resp.status === 200 || resp.status === 201) {
                                        
                                        let container = listItemContainer.parentElement;
                                        container.removeChild(listItemContainer);
                                        assignments.forEach(assignment => {
                                            if (assignment.plannable_id === item.plannable_id) {
                                                item.planner_override = { "marked_complete": true };
                                            }
                                        });
                                        
                                        loadBetterTodo();
                                        loadCardAssignments();
                                    }
                                });
                        }*/
                    });
                    /*
                    // remove item button
                    listItemContainer.querySelector(".canvasrefined-todo-complete-btn").addEventListener('click', function () {
                        if (item.planner_override && item.planner_override.custom && item.planner_override.custom === true) {
                            // set item as complete locally
                            chrome.storage.sync.get("custom_assignments_overflow", overflow => {
                                chrome.storage.sync.get(overflow["custom_assignments_overflow"], storage => {
                                    overflow["custom_assignments_overflow"].forEach(overflow => {
                                        for (let i = 0; i < storage[overflow].length; i++) {
                                            if (storage[overflow][i].plannable_id === item.plannable_id) {
                                                storage[overflow].splice(i, 1);
                                                chrome.storage.sync.set({ [overflow]: storage[overflow] }).then(() => {
                                                    let container = listItemContainer.parentElement;
                                                    container.removeChild(listItemContainer);
                                                    loadBetterTodo();
                                                    loadCardAssignments();
                                                });
                                                break;
                                            }
                                        }
                                    });
                                });
                            });
                        } else {
                            // set the item as complete through api
                            fetch(domain + '/api/v1/planner/overrides' + (item.planner_override ? "/" + item.planner_override.id : ""),
                                {
                                    method: item.planner_override ? "PUT" : "POST",
                                    headers: {
                                        "content-type": "application/json",
                                        'accept': 'application/json',
                                        'X-CSRF-Token': csrfToken,
                                    },
                                    body: JSON.stringify({ id: item.planner_override ? item.planner_override.id : null, marked_complete: true, plannable_id: item.plannable_id, plannable_type: item.plannable_type })
                                }).then(resp => {
                                    if (resp.status === 200 || resp.status === 201) {
                                        let container = listItemContainer.parentElement;
                                        container.removeChild(listItemContainer);
                                        assignmentData.forEach(assignment => {
                                            if (assignment.plannable_id === item.plannable_id) {
                                                item.planner_override = { "marked_complete": true };
                                            }
                                        });
                                        loadBetterTodo();
                                        loadCardAssignments();
                                    }
                                });
                        }
                    });
*/

                    if (item.plannable_type === "announcement") {
                        announcementsToInsert.push(listItemContainer);
                    } else {
                        assignmentsToInsert.push(listItemContainer);
                        if (item.submissions && item.submissions.submitted) {
                            listItemContainer.classList.add("canvasrefined-todo-item-completed");
                        }
                    }
                    //}
                    //}


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

function generateDarkModeCSS() {
    let css =
		(options.device_dark === true
			? "@media (prefers-color-scheme: dark) {\n"
			: "") + ":root{\n";
	if (options.dark_preset) {
		Object.keys(options.dark_preset).forEach((key) => {
			css += "    --bc" + key + ": " + options.dark_preset[key] + ";\n";
		});
	}
	css += "}\n\n";
	css += DARKMODE_CSS;
	css += options.device_dark === true ? "\n}" : "";
	return css;
}

let darkStyleInserted = false;
function toggleDarkMode() {
    const css = generateDarkModeCSS();
    if ((options.dark_mode === true || options.device_dark === true) && !darkStyleInserted) {
        let style = document.createElement('style');
        style.textContent = css;
        document.documentElement.append(style);
        style.id = 'darkcss';
        style.className = "canvasrefined-darkmode-enabled";
        darkStyleInserted = true;
    } else if (darkStyleInserted) {
        let style = document.querySelector("#darkcss");
        style.textContent = options.dark_mode === true || options.device_dark ? css : "";
        style.className = options.dark_mode === true || options.device_dark ? "canvasrefined-darkmode-enabled" : "";
    }
    /*
    if (options.dark_mode === true || options.device_dark) {
        document.body.classList.add("canvasrefined--darkmode--enabled");
    } else {
        document.body.classList.remove("canvasrefined--darkmode--enabled");
    }
    */
    runiframeChecker();
}

function runDarkModeFixer(override = false) {
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
        options.dark_mode = status;
        chrome.storage.sync.set({ "dark_mode": status }, toggleDarkMode);
    }
}

// async function ScheduledReminderCheck() {
// 	let date = new Date();
// 	let currentHour = date.getHours();
// 	let currentMinute = date.getMinutes();
// 	if (options.scheduledReminderTime) {
// 		let [hour, minute] = options.scheduledReminderTime.split(":");
// 		if (parseInt(hour) == currentHour && parseInt(minute) == currentMinute) {
// 			const container = document.getElementById("canvasrefined-reminders") || makeElement("div", document.body, { "id": "canvasrefined-reminders" });
// 			container.style.display = "flex";
// 			container.textContent = "";
// 			const storage = await chrome.storage.sync.get("reminders");
// 			const now = (new Date()).getTime();
// 			storage["reminders"].forEach(reminder => {
// 				if (reminder.d >= now) {
// 					createReminder(reminder, container);
// 				}
// 			});
// 		}
// 	}

// }

function toggleAutoDarkMode() {
    clearInterval(timeCheck);
    if (options.auto_dark && options.auto_dark === false) return;
    autoDarkModeCheck();
    timeCheck = setInterval(autoDarkModeCheck, 60000);
}

// function toggleScheduledReminders() {
// 	clearInterval(reminderCheck);
// 	if (options.scheduled_reminders === false) return; //TODO: add it to the options thing
// 	ScheduledReminderCheck();
// 	reminderCheck = setInterval(ScheduledReminderCheck, 60000);
// }

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
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0 && mutation.addedNodes[0].nodeName == "IFRAME") {
                const frame = mutation.addedNodes[0];
                const new_style_element = document.createElement("style");
                new_style_element.textContent = generateDarkModeCSS();
                new_style_element.id = "darkcss";
                frame.contentDocument.body.classList.add("canvasrefined--darkmode--enabled");
                frame.contentDocument.documentElement.prepend(new_style_element);
            }
        }
    };

    iframeObserver = new MutationObserver(callback);
    iframeObserver.observe(document.querySelector('html'), { childList: true, subtree: true });
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

/*
function setAssignmentStatus(id, status, assignments_done = []) {
    if (assignments_done.length > 50) assignments_done = [];
    if (status === true) {
        assignments_done.push(id);
    } else {
        const pos = assignments_done.indexOf(id);
        if (pos > -1) assignments_done.splice(pos, 1);
    }
    chrome.storage.sync.set({ assignments_done: assignments_done });
}
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
        } catch (e) {
            logError(e);
        }
    });
}

/*
function loadCardAssignments2(c = null) {
    if (options.assignments_due === true) {
        try {
            assignments.then(data => {
                //assignmentData = assignmentData === null ? data : assignmentData; ????
                let items = combineAssignments(data);
                let cards = c ? c : document.querySelectorAll('.ic-DashboardCard');
                const now = new Date();

                cards.forEach(card => {
                    let count = 0;
                    let course_id = parseInt(card.querySelector(".ic-DashboardCard__link").href.split("courses/")[1]);
                    let cardContainer = card.querySelector('.canvasrefined-card-container');
                    cardContainer.textContent = "";
                    cardContainer.parentElement.style.display = "block";

                    items.forEach(assignment => {
                        let due = new Date(assignment.plannable_date);
                        // lots of checks to make
                        // 1. item belongs to card
                        // 2. haven't exceeded item limit
                        // 3. assignment hasn't been submitted (if hide completed option is on)
                        // 4. disallow overdue and item not past due/allow overdue and item hasn't been submitted
                        // 5. correct item type
                        // 6. no planner override marking item complete
                        if (course_id !== assignment.course_id) return;
                        if (count >= options.num_assignments) return;
                        if (options.hide_completed === true && assignment.submissions.submitted === true) return;
                        if ((options.card_overdues !== true && now >= due) || (options.card_overdues === true && assignment.submissions.submitted === true)) return;
                        if ((assignment.plannable_type !== "assignment" && assignment.plannable_type !== "quiz" && assignment.plannable_type !== "discussion_topic")) return;
                        if (assignment.planner_override && assignment.planner_override.marked_complete === true) return;

                        createCardAssignment(cardContainer, assignment, now >= due);
                        count++;
                    });

                    if (count === 0) {
                        let assignmentContainer = makeElement("div", "canvasrefined-assignment-container", cardContainer);
                        let assignmentDivLink = makeElement("a", "canvasrefined-assignment-link", assignmentContainer, "None");
                    }
                });
            });
        } catch (e) {
            logError(e);
        }
    } else {
        document.querySelectorAll(".canvasrefined-card-assignment").forEach(card => {
            card.style.display = "none";
        });
    }
}
*/

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
        /*
        if (course.id === "cumulative-gpa") {
            //gpa = parseFloat(options["cumulative_gpa"]["gr"]);
            gpa = 0;
            cumulativePoints += parseFloat(options["cumulative_gpa"]["gr"]) * credits;
            cumulativeCredits = credits;
        } else {
            */
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
        //}



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
            const dashboardContainer = document.querySelector("#DashboardCard_Container");
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
                const firstCard = shouldPrepend ? container : container2;
                const secondCard = shouldPrepend ? container2 : container;

                if (firstCard.parentElement !== dashboardContainer) {
                    dashboardContainer.prepend(firstCard);
                }
                if (secondCard.parentElement !== dashboardContainer) {
                    if (shouldPrepend) {
                        dashboardContainer.prepend(secondCard);
                    } else {
                        dashboardContainer.appendChild(secondCard);
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
let dashboardNotesResizeFrame;
function delayDashboardNotesStorage(text) {
    clearTimeout(dashboardNotesTimer);
    dashboardNotesTimer = setTimeout(() => {
        chrome.storage.sync.set({ dashboard_notes_text: text });
    }, 250);
}

function resizeDashboardNotes(notes) {
    if (!notes) return;
    notes.style.height = "auto";
    notes.style.height = `${notes.scrollHeight + 5}px`;
}

function scheduleDashboardNotesResize(notes) {
    if (dashboardNotesResizeFrame) cancelAnimationFrame(dashboardNotesResizeFrame);
    dashboardNotesResizeFrame = requestAnimationFrame(() => {
        dashboardNotesResizeFrame = null;
        resizeDashboardNotes(notes);
    });
}

function loadDashboardNotes() {
    if (options.dashboard_notes === true) {
        let notes = document.querySelector('.canvasrefined-dashboard-notes');
        if (!notes) {
            notes = document.createElement("textarea");
            notes.classList.add("canvasrefined-dashboard-notes");
            notes.placeholder = "Enter notes here";
            document.querySelector("#DashboardCard_Container").prepend(notes);
            notes.value = options.dashboard_notes_text;
            notes.style.display = "block";
            resizeDashboardNotes(notes);
            notes.addEventListener('input', function () {
                options.dashboard_notes_text = this.value;
                delayDashboardNotesStorage(this.value);
                scheduleDashboardNotesResize(this);
            });
        } else {
            notes.style.display = "block";
            resizeDashboardNotes(notes);
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
    let style = document.querySelector("#canvasrefined-aesthetics") || document.createElement('style');
    style.id = "canvasrefined-aesthetics";
    style.textContent = "";
    if (options.condensed_cards === true) style.textContent += ".ic-DashboardCard__header_hero {height:60px!important}.ic-DashboardCard__header-subtitle, .ic-DashboardCard__header-term{display:none}";
    if (options.remlogo === true) style.textContent += ".ic-app-header__logomark-container{display:none}";
    if (options.disable_color_overlay === true) style.textContent += ".ic-DashboardCard__header_hero{opacity: 0!important} .ic-DashboardCard__header-button-bg{opacity: 1!important}";
    if (options.hide_feedback === true) style.textContent += ".recent_feedback {display: none}";
    if (options.full_width === true) style.textContent += "#wrapper,.ic-Layout-wrapper{max-width:100%!important}";

    if (options.customCardStyles === true) {
        if (options.imageSize !== undefined && options.imageSize !== 100) style.textContent += `.ic-DashboardCard__header_image {transform: scale(${options.imageSize / 100})!important; }`;
        if (options.cardRoundness !== undefined && options.cardRoundness !== 5) style.textContent += `.ic-DashboardCard {border-radius: ${options.cardRoundness}px!important;}`;
        if (options.cardSpacing !== undefined && options.cardSpacing !== 0) style.textContent += `.ic-DashboardCard {margin-right: ${options.cardSpacing / 2}px!important; margin-bottom: ${options.cardSpacing / 2}px!important;}`;
        if (options.cardWidth !== undefined && options.cardWidth !== 262) style.textContent += `.ic-DashboardCard {width: ${options.cardWidth}px!important;}`;
        if (options.cardHeight !== undefined && options.cardHeight !== 250) style.textContent += `.ic-DashboardCard {height: ${options.cardHeight}px!important;}`;
    }

    style.textContent += ".ic-app-nav-toggle-and-crumbs{display:none!important}";
    if (options.custom_styles !== "") style.textContent += options.custom_styles;
    document.documentElement.appendChild(style);
}

/*
function changeFullWidth() {
    if (options.full_width == null) return;
    if (options.full_width === true) {
        document.body.classList.add("full-width");
    } else {
        document.body.classList.remove("full-width");
    }
}
*/

function changeGradientCards() {
    if (options.gradient_cards === true) {
        let cardheads = document.querySelectorAll('.ic-DashboardCard__header_hero');
        let cardcss = document.querySelector("#gradientcss") || document.createElement('style');
        cardcss.id = "gradientcss";
        cardcss.textContent = "";
        document.documentElement.appendChild(cardcss);

        for (let i = 0; i < cardheads.length; i++) {
            let colorone = cardheads[i].style.backgroundColor.split(',');
            let [r, g, b] = [parseInt(colorone[0].split('(')[1]), parseInt(colorone[1]), parseInt(colorone[2])];
            let [h, s, l] = [rgbToHsl(r, g, b)[0], rgbToHsl(r, g, b)[1], rgbToHsl(r, g, b)[2]];
            let degree = ((h % 60) / 60) >= .66 ? 30 : ((h % 60) / 60) <= .33 ? -30 : 15;
            let newh = h > 300 ? (360 - (h + 65)) + (65 + degree) : h + 65 + degree;
            cardcss.textContent += ".ic-DashboardCard:nth-of-type(" + (i + 1) + ") .ic-DashboardCard__header_hero{background: linear-gradient(115deg, hsl(" + h + "deg," + s + "%," + l + "%) 5%, hsl(" + newh + "deg," + s + "%," + l + "%) 100%)!important}";
        }

    } else {
        let cardcss = document.querySelector("#gradientcss");
        if (cardcss) cardcss.textContent = "";
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


function makeElement2(element, elclass, location, text) {
    let creation = document.createElement(element);
    creation.classList.add(elclass);
    creation.textContent = text;
    location.appendChild(creation);
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
    return data
}

function hexToHsl(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return rgbToHsl(parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16));
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