const syncedSwitches = ['remind', 'tab_icons', 'hide_feedback', 'dark_mode', 'remlogo', 'full_width', 'auto_dark', 'assignments_due', 'gpa_calc', 'gradient_cards', 'disable_color_overlay', 'dashboard_grades', 'dashboard_notes', 'better_todo', 'better_sidebar', 'condensed_cards'];
const syncedSubOptions = [
	"todo_hide_feedback",
	"todo_full_height",
    "todo_confetti",
	"device_dark",
	"relative_dues",
	"card_overdues",
	// "todo_overdues",
	"gpa_calc_prepend",
	"auto_dark",
	"auto_dark_start",
	"auto_dark_end",
	"num_assignments",
	"assignment_date_format",
	"todo_hr24",
	"todo_separate_scrollbar",
	"grade_hover",
	// "hide_completed",
	"num_todo_items",
	"hover_preview",
	// "scheduledReminder",
	// "scheduledReminderTime",
	"customCardStyles",
	"imageSize",
	"cardRoundness",
	"cardSpacing",
	"cardWidth",
	"cardHeight",
	"customBackgroundLink",
    "customBackgroundScale",
    "sidebar_scale",
];
const localSwitches = [];
const fontsDropdownStateKey = "fonts_dropdown_open";

//const apiurl = "http://localhost:3000";
// const apiurl = "https://canvasrefined.diditupe.dev";
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
        "better_todo": false,
        "better_sidebar": false,
        "sidebar_scale": 100,
        "todo_hr24": false,
		"todo_separate_scrollbar": false,
        "condensed_cards": false,
        "custom_cards": {},
        "custom_cards_2": {},
        "custom_cards_3": {},
        "custom_assignments": [],
        "custom_assignments_overflow": ["custom_assignments"],
        "grade_hover": false,
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
        "hide_feedback": false,
        "dark_mode_fix": [],
        "assignment_states": {},
        "tab_icons": false,
        "todo_hide_feedback": false,
		"todo_full_height": false,
        "todo_progress_rings": true,
		"todo_confetti": true,
        "device_dark": false,
        "cumulative_gpa": { "name": "Cumulative GPA", "hidden": false, "weight": "dnc", "credits": 999, "gr": 3.21 },
        // "show_updates": false,
        "card_method_date": false,
        "card_method_dashboard": true,
        "card_limit": 25,
        // "scheduledReminder": false,
        // "scheduledReminderTime": { "hour": "09", "minute": "00" },
        "imageSize": 100,
        "cardRoundness": 5,
        "cardSpacing": 0,
        "cardWidth": 262,
        "cardHeight": 250,
        "customCardStyles": false,
        "customBackgroundLink": "",
        "customBackgroundScale": 100,
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

function setupAutoDarkInput(initial, time) {
    let el = document.querySelector('#' + time);
    el.value = initial.hour + ":" + initial.minute;
    el.addEventListener('change', function () {
        let timeinput = { "hour": this.value.split(':')[0], "minute": this.value.split(':')[1] };
        time === "auto_dark_start" ? chrome.storage.sync.set({ auto_dark_start: timeinput }) : chrome.storage.sync.set({ auto_dark_end: timeinput });
    });
}

// function setupScheduledReminderInput(initial) {
//     let el = document.querySelector('#scheduledReminderTime');
//     el.value = initial.hour + ":" + initial.minute;
//     el.addEventListener('change', function () {
//         let timeinput = { "hour": this.value.split(':')[0], "minute": this.value.split(':')[1] };
//         chrome.storage.sync.set({ scheduledReminderTime: timeinput });
//     });
// }

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

function setupImageSizeInput(initial) {
    let el = document.querySelector("#imageSize");
    el.value = initial;
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "imageSize": e.target.value });
    });
}

function setupCardRoundnessInput(initial) {
    let el = document.querySelector("#cardRoundness");
    el.value = initial;
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "cardRoundness": e.target.value });
    });
}

function setupCardSpacingInput(initial) {
    let el = document.querySelector("#cardSpacing");
    el.value = initial;
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "cardSpacing": e.target.value });
    });
}

function setupCardWidthInput(initial) {
    let el = document.querySelector("#cardWidth");
    el.value = initial;
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "cardWidth": e.target.value });
    });
}

function setupCardHeightInput(initial) {
	let el = document.querySelector("#cardHeight");
	el.value = initial;
	el.addEventListener("input", (e) => {
		chrome.storage.sync.set({ "cardHeight": e.target.value });
	});
}

function setupCustomBackgroundLink(initial) {
    let el = document.querySelector("#customBackgroundLink");
    el.value = initial || "";
    el.addEventListener("input", (e) => {
        chrome.storage.sync.set({ "customBackgroundLink": e.target.value });
        renderBackgroundPresetSelection();
    })
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

function renderBackgroundPresetSelection() {
    const currentLink = document.querySelector("#customBackgroundLink")?.value || "";
    const currentScale = String(document.querySelector("#customBackgroundScale")?.value || "100");
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
        });
    });
    renderBackgroundPresetSelection();
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
            "todo_progress_rings",
            "todo_confetti",
			"todo_full_height",
			"device_dark",
			"relative_dues",
			"card_overdues",
			// "todo_overdues",
			"gpa_calc_prepend",
			"auto_dark",
			"assignment_date_format",
			"todo_hr24",
			"todo_separate_scrollbar",
			"grade_hover",
			// "hide_completed",
			"hover_preview",
			// "scheduledReminder",
			"customCardStyles",
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
			// {
			// 	identifier: "scheduledReminderTime",
			// 	setup: (initial) => setupScheduledReminderInput(initial),
			// },
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
				identifier: "customBackgroundLink",
				setup: (initial) => setupCustomBackgroundLink(initial),
			},
            {
                identifier: "customBackgroundScale",
                setup: (initial) => setupCustomBackgroundScale(initial),
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
            });
        });
    });

    chrome.storage.sync.get(menu.checkboxes, sync => {
        menu.checkboxes.forEach(option => {
			const checkbox = document.querySelector("#" + option);
			if (!checkbox) {console.log(option); return;}
            checkbox.addEventListener("change", function (e) {
                let status = this.checked;
                chrome.storage.sync.set(JSON.parse(`{"${option}": ${status}}`));
            });
            const value = sync[option] !== undefined ? sync[option] : defaultOptions.sync[option];
            document.querySelector("#" + option).checked = value;
        });
        /*
        document.querySelector('#autodark_start').value = result.auto_dark_start["hour"] + ":" + result.auto_dark_start["minute"];
        document.querySelector('#autodark_end').value = result.auto_dark_end["hour"] + ":" + result.auto_dark_end["minute"];
        document.querySelector("#assignment_date_format").checked = result.assignment_date_format == true;
        document.querySelector("#todo_hr24").checked = result.todo_hr24 == true;
        */
        toggleDarkModeDisable(sync.auto_dark);
        displayBackgroundPresets();
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

    /*
    // checkboxes
    menu.checkboxes.forEach(checkbox => {
        document.querySelector("#" + checkbox).addEventListener('change', function () {
            let status = this.checked;
            chrome.storage.sync.set(JSON.parse(`{"${checkbox}": ${status}}`));
        });
    });
    */

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
        text.innerText = chrome.i18n.getMessage(text.dataset.i18n);
    });

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

    // activate export checkbox
    document.querySelectorAll(".export-details input").forEach(input => {
        input.addEventListener("change", () => {
            chrome.storage.sync.get(syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds"]), async storage => {
                //chrome.storage.local.get(["dark_preset"], async local => {
                let final = {};
                for await (item of document.querySelectorAll(".export-details input")) {
                    if (item.checked) {
                        switch (item.id) {
                            case "export-toggles":
                                final = { ...final, ...(await getExport(storage, syncedSwitches.concat(syncedSubOptions))) };
                                break;
                            case "export-dark":
                                final = { ...final, ...(await getExport(storage, ["dark_preset"])) };
                                break;
                            case "export-cards":
                                final = { ...final, ...(await getExport(storage, ["custom_cards"])) };
                                break;
                            case "export-font":
                                final = { ...final, ...(await getExport(storage, ["custom_font"])) };
                                break;
                            case "export-colors":
                                final = { ...final, ...(await getExport(storage, ["card_colors"])) }
                                break;
                            case "export-gpa":
                                final = { ...final, ...(await getExport(storage, ["gpa_calc_bounds"])) }
                                break;
							case "export-customStyles":
								final = { ...final, ...(await getExport(storage, ["custom_styles"])) };
								break;
							case "export-background":
                                final = { ...final, ...(await getExport(storage, ["customBackgroundLink", "customBackgroundScale"])) };
								break;
                        }
                    }
                }
                document.querySelector("#export-output").value = JSON.stringify(final);
                //});
            });
        });
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
            if (local["previous_colors"] !== null) {
                sendFromPopup("setcolors", local["previous_colors"].colors);
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

    /*
    ['autodark_start', 'autodark_end'].forEach(function (timeset) {
        document.querySelector('#' + timeset).addEventListener('change', function () {
            let timeinput = { "hour": this.value.split(':')[0], "minute": this.value.split(':')[1] };
            timeset === "autodark_start" ? chrome.storage.sync.set({ auto_dark_start: timeinput }) : chrome.storage.sync.set({ auto_dark_end: timeinput });
        });
    });
    */

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
        // current_page_num = 1;
        // displayThemeList(0);
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
    // document.getElementById("submit-theme-btn").addEventListener("click", submitTheme);

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
    // document.getElementById("new_browser_out").addEventListener("click", () => {
        chrome.storage.sync.set({ "new_browser": false });
        current_page_num = 1;
        displayThemeList(0);
        // displayAlert(false, "Success! You are now viewing the old theme browser. This one will no longer recieve updates, but there is still plenty to choose from.");
    // });

    // activate theme browser opt in
    // document.getElementById("new_browser_in").addEventListener("click", registerUser);

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

    // document.getElementById("reset-optin").addEventListener("click", () => {
    //     chrome.storage.sync.set({ "new_browser": null });
    //     document.getElementById("opt-in").style.display = "block";
    // });

    // document.getElementById("view-submissions-btn").addEventListener("click", displayMySubmissions);
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
    
    document.getElementById("imageSize").addEventListener("input", (e) => {
        const value = e.target.value;
        chrome.storage.sync.set({ "imageSize": value });
        document.querySelector("#imageSizeValue").textContent = value + "%";
    })
    document.getElementById("cardRoundness").addEventListener("input", (e) => {
        const value = e.target.value;
        chrome.storage.sync.set({ "cardRoundness": value });
        document.querySelector("#cardRoundnessValue").textContent = value + "px";
    })
    document.getElementById("cardSpacing").addEventListener("input", (e) => {
        const value = e.target.value;
        chrome.storage.sync.set({ "cardSpacing": value });
        document.querySelector("#cardSpacingValue").textContent = value + "px";
    })
    document.getElementById("cardWidth").addEventListener("input", (e) => {
        const value = e.target.value;
        chrome.storage.sync.set({ "cardWidth": value });
        document.querySelector("#cardWidthValue").textContent = value + "%";
    });
    document.getElementById("cardHeight").addEventListener("input", (e) => {
		const value = e.target.value;
		chrome.storage.sync.set({ "cardHeight": value });
		document.querySelector("#cardHeightValue").textContent = value + "%";
	});

    document.getElementById("clearCustomBackground").addEventListener("click", () => {
                chrome.storage.sync.set({ "customBackgroundLink": "", "customBackgroundScale": 100 });
        document.querySelector("#customBackgroundLink").value = "";
		document.querySelector("#customBackgroundScale").value = 100;
		document.querySelector("#customBackgroundScaleValue").textContent = "100%";
		renderBackgroundPresetSelection();
		sendFromPopup("updateBackground");
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

async function displayMySubmissions() { //TODO: remake
    const sync = await chrome.storage.sync.get("id");
    const res = await fetch(`${apiurl}/api/themes/submissions?id=${sync["id"]}`);
    const data = await res.json();

    //if (data?.errors !== false) return;

    document.getElementById("submit-form").style.display = "none";
    document.getElementById("view-submissions").style.display = "block";
    document.getElementById("submit-form-btn").classList.remove("active");
    document.getElementById("view-submissions-btn").classList.add("active");

    const el = document.getElementById("latest-submissions");
    el.textContent = "";

    if (data.message.length === 0) {
        el.textContent = "You haven't submitted any themes yet.";
    }

    data.message.forEach(theme => {
        const container = makeElement("div", el, {"className": "submitted-theme" });
        const btn = makeElement("button", container, { "className": "theme-button clickable customization-button", "style": `min-width:105px;max-width:105px;background-image:linear-gradient(rgba(0, 0, 0, 0.44), rgba(0, 0, 0, 0.44)), url(${theme.preview})` });
        const title = makeElement("p", btn, { "className": "theme-button-title clickable", "textContent": theme.title });
        const credits = makeElement("p", btn, { "className": "theme-button-creator clickable", "textContent": theme.credits });
        const details = makeElement("div", container, { "className": "submitted-theme-details" });
        const top = makeElement("div", details, { "style": "display:flex;justify-content:space-between;align-items:center" });
        const tag = makeElement("span", top, { "className": "submitted-theme-tag", "textContent": theme.approved === 1 ? "Approved" : theme.approved === 0 ? "Pending" : "Rejected", "style": `background: ${theme.approved === 1 ? "#ad3a74" : theme.approved === 0 ? "#514e4e": "#000"}` });
        const msg = makeElement("p", details, { "textContent": theme.approved === 1 ? "Looks great! Thanks for submitting" : theme.approved === 0 ? "Your theme is still awaiting approval." : `Your theme was rejected${theme.reason ? (": " + theme.reason) : " because it did not meet the theme guidelines."}`});
        const ago = makeElement("span", top, { "className": "submitted-theme-time", "textContent": `${getRelativeDate(new Date(parseInt(theme.time))).time} ago` });
    });
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
				final["customCardStyles"] = storage["customCardStyles"];
				final["imageSize"] = storage["imageSize"];
				final["cardRoundness"] = storage["cardRoundness"];
				final["cardSpacing"] = storage["cardSpacing"];
				final["cardWidth"] = storage["cardWidth"];
				final["cardHeight"] = storage["cardHeight"];
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
                //return (colorValues[a.color] || 88) - (colorValues[b.color] || 88)
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

//sortThemes(current_sort);

function shortScore(score) {
    if (score >= 1400) {
        return (Math.floor(score / 1000) + "." +  Math.round((score % 1000) / 100)) + "k";
    }
    return score;
}

let fallback = false;

async function submitTheme() { //TODO: remake

    const sync = await chrome.storage.sync.get(null);

    // if (sync["new_browser"] !== true) {
    //     displayAlert(true, "You'll need to opt in to the new browser if you want to submit your theme. If you've opted out and want to opt in, you can scroll down to the bottom of this page and opt back in.");
    //     return;
    // }

    const theme = await getExport(sync, [
        ...syncedSwitches,
        ...syncedSubOptions,
        "custom_cards",
        "card_colors",
        "dark_preset",
        "custom_font",
        "gradient_cards",
        "disable_color_overlay",
    ]);
    const title = document.getElementById("submit-title");
    const credits = document.getElementById("submit-credits");

    if (title.value === "") {
        displayAlert(true, "The title of your theme can't be empty");
        return;
    }

    if (credits.value === "") {
        displayAlert(true, "The credits for your theme can't be empty");
        return;
    }
    const body = JSON.stringify({
        "identity": sync["id"],
        "title": title.value,
        "credits": credits.value,
        "theme": JSON.stringify(theme)
    });

    fetch(`${apiurl}/api/themes/submit`, { //
        "method": "POST",
        "body": body,
        "headers": {
            "Content-Type": "application/json",
          },
    }).then(res => res.json())
    .then(data => {
        console.log(data);
        if (data.errors === false) {
            displayAlert(false, "Thanks for submitting your theme! I will try to approve it soon, but not every theme may be accepted.");
            document.getElementById("submit-popup").classList.remove("open");
        } else {
            displayAlert(true, `Submission error: ${data.message} Please contact sandlerguy5@gmail.com if you believe this is incorrect.`);
        }
    });
}

async function registerUser() { // TODO: remake
    try {
        let id;

        const sync = await chrome.storage.sync.get("id");

        if (sync["id"] && sync["id"] !== "") {
            id = sync["id"]
        } else {
            const res = await fetch(`${apiurl}/api/register`);
            const data = await res.json();
            id = data.id;
        }

        chrome.storage.sync.set({ "id": id }).then(async () => {
            // test to see if the id was set correctly
            // don't know why this is happening ??
            const test = await chrome.storage.sync.get("id");
            if (test["id"] === undefined || test["id"] === "") throw new Error();

            // show the new browser
            chrome.storage.sync.set({ "new_browser": true }).then(() => {
                document.getElementById("opt-in").style.display = "none";
                current_page_num = 1;
                displayThemeList(0);
                displayAlert(false, "Success! You should be able to see the new themes browser now. Enjoy!");
            });

        }).catch(e => {
            displayAlert(true, "There was an error connecting an ID to your account. Please try again, and if this error persists, contact sandlerguy5@gmail.com!");
        });

    } catch (e) {
        console.log(e);
        displayAlert(true, "There was an error opting in. Please contact sandlerguy5@gmail.com if this error persists!");
    }
}

function saveCurrentTheme() {
    const allOptions = syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "card_colors"]);
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
                "todo_hr24": current["todo_hr24"],
                "todo_separate_scrollbar": current["todo_separate_scrollbar"],
                "num_todo_items": current["num_todo_items"],
                "hover_preview": current["hover_preview"],
                "better_sidebar": current["better_sidebar"],
                "sidebar_scale": current["sidebar_scale"],
				"imageSize": current["imageSize"],
				"cardRoundness": current["cardRoundness"],
				"cardSpacing": current["cardSpacing"],
				"cardWidth": current["cardWidth"],
				"cardHeight": current["cardHeight"],
				"customBackgroundLink": current["customBackgroundLink"],
				"customBackgroundScale": current["customBackgroundScale"],
            }
            const now = new Date();
            local["saved_themes"][now.getTime()] = trimmed;
            chrome.storage.local.set({ "saved_themes": local["saved_themes"] }).then(() => {
                displaySavedThemes();
            });
        });        
    });
}


async function displayThemeList(direction = 0) {
    // const sync = await chrome.storage.sync.get("new_browser");
    // if (sync["new_browser"] === true && fallback === false) {
        // displayThemeListNew(direction);
    // } else {
        displayThemeListOld(direction);
    // }
    // remove the opt-in notice
    // if (sync["new_browser"] !== null && document.getElementById("opt-in")) document.getElementById("opt-in").style.display = "none";
}

function createThemeButton(location, theme) {
    let themeBtn = makeElement("button", location, { "className": "theme-button clickable" });
    themeBtn.classList.add("customization-button");
    if (!themeBtn.style.background) themeBtn.style.backgroundImage = "linear-gradient(#00000070, #00000070), url(" + theme.preview + ")";
    if (theme.title) makeElement("p", themeBtn, { "className": "theme-button-title clickable", "textContent": theme.title.replaceAll(" ", "") });
    if (theme.credits) makeElement("p", themeBtn, { "className": "theme-button-creator clickable", "textContent": theme.credits });
    return themeBtn;
}

function createThemeLikeBtn(location, initial, score, show) {
    const likeBtn = makeElement("div", location, {"className": "theme-button-like"});
    if (initial === true) {
        likeBtn.classList.add("theme-liked");
        score += 1;
    }
    const amount = makeElement("span", likeBtn, { "className": "theme-button-like-amount", "textContent": shortScore(score) });
    if (show === true) amount.classList.add("showalways");
    likeBtn.innerHTML += `<svg  xmlns="http://www.w3.org/2000/svg"  width="12"  height="12"  viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6.979 3.074a6 6 0 0 1 4.988 1.425l.037 .033l.034 -.03a6 6 0 0 1 4.733 -1.44l.246 .036a6 6 0 0 1 3.364 10.008l-.18 .185l-.048 .041l-7.45 7.379a1 1 0 0 1 -1.313 .082l-.094 -.082l-7.493 -7.422a6 6 0 0 1 3.176 -10.215z" /></svg>`;
    return likeBtn;
}

let likeThemeTimeout = false;

function setLikeTimeout() {
    if (likeThemeTimeout === true) return;
    likeThemeTimeout = true;
    setTimeout(() => {
        likeThemeTimeout = false;
    }, 1000);
}

async function likeTheme(location, code, score) { // TODO: remake

    if (likeThemeTimeout === true) return;

    const sync = await chrome.storage.sync.get("id");
    const local = await chrome.storage.local.get("liked_themes");

    const setLikeStatus = (direction) => {

        let output = local;
    
        if (direction === -1) {
            location.classList.remove("theme-liked");
            location.querySelector(".theme-button-like-amount").textContent = shortScore(score);
            output = local["liked_themes"].filter(x => x !== code);
        } else if (direction === 1) {
            location.classList += (" theme-liked animate-like");
            location.querySelector(".theme-button-like-amount").textContent = shortScore(score + 1);
            output = [...local["liked_themes"], code];
        }
    
        return output;
    }

    // show the updated like status immediately
    setLikeStatus(location.classList.contains("theme-liked") ? -1 : 1);

    const res = await fetch(`${apiurl}/api/themes/theme/${code}/like`, { 
        "method": "POST", 
        "body": JSON.stringify({ "id": sync["id"] }), 
        "headers": {
            "Content-Type": "application/json"
        },
    });

    const data = await res.json();

    if (data.errors === false) {
        const direction = parseInt(data.message);
        // update the like status if there is some disagreement with the server
        const update = setLikeStatus(direction);
        chrome.storage.local.set({ "liked_themes": update }).then(setLikeTimeout);
    } else {
        setLikeTimeout();
    }
}

async function getAndLoadTheme(code) { // todo: remake
    const key = `themes/${code}`;
    let output = {};
    if (cache[key]) {
        output = cache[key];
        console.log("got this theme from the cache.");
    } else {
        const res = await fetch(`${apiurl}/api/themes/theme/${code}`);
        const data = await res.json();
        output = JSON.parse(data.message.exports);
        cache[key] = output;
    }
    importTheme(output);
}

async function displayThemeListNew(direction) { // TODO: remake
    
    document.getElementById("theme-current-sort").textContent = current_sort;
    if (direction === -1 && current_page_num > 1) current_page_num--;
    if (direction === 1 && current_page_num < maxPage) current_page_num++;

    let themes = [];
    let apiLink = `${current_sort.toLowerCase()}?page=${current_page_num}` + (searchFor === "" ? "" : `&searchFor=${searchFor}`);
    if (current_sort === "Liked") {
        const sync = await chrome.storage.sync.get("id");
        const local = await chrome.storage.local.get("liked_themes");
        if (sync["id"] && sync["id"] !== "") {
            apiLink += `&id=${sync["id"]}`;
            maxPage = Math.ceil(local["liked_themes"].length / 28);
        } else { // fallback if there is no id
            current_page_num = 1;
            apiLink = `popular?page=${current_page_num}` + (searchFor === "" ? "" : `&searchFor=${searchFor}`);
        }
    }

    // fetch api, fallback if necessary
    if (cache[apiLink]) {
        themes = cache[apiLink]["themes"];
        maxPage = cache[apiLink]["pages"] || maxPage;
    } else {
        try {
            const res = await fetch(`${apiurl}/api/themes/${apiLink}`, {
                method: "get",
                headers: {
                    "Content-Type": "application/json"
               },
            });
            const data = await res.json();
            if (data.errors === true) throw new Error(data.message);
            themes = data.message.themes;
            cache[apiLink] = data.message;
            if (data?.message?.pages) {
                maxPage = data.message.pages;
            }
        } catch (e) {
            console.log(e);
            current_page_num = 1;
            fallback = true;
            displayAlert(true, "there is no server you should not be seeing this. There was a problem getting themes from the Canvas Refined server, so the old themes browser is being displayed for now.");
            displayThemeListOld(0);
            return;
        }
    }

    let container = document.getElementById("premade-themes");
    container.textContent = "";

    const local = await chrome.storage.local.get("liked_themes");
    const sync = await chrome.storage.sync.get("browser_show_likes");

    themes.forEach(theme => {

        const themeBtn = createThemeButton(container, theme);
        themeBtn.addEventListener("click", (e) => {
            if (!e.target.classList.contains("clickable")) return;
            // getAndLoadTheme(theme.code)
        }); 

        const liked = local["liked_themes"].includes(theme.code);
        // TODO: remake
        const likeBtn = createThemeLikeBtn(themeBtn, liked, theme.score, sync["browser_show_likes"]);
        // likeBtn.addEventListener("click" , (e) => likeTheme(likeBtn, theme.code, theme.score));

    });

    if (themes.length === 0) {
        container.innerHTML = `<div id="themes-empty">Nothing here</div>`;
    }

    document.getElementById("premade-themes-pagenum").textContent = current_page_num + " of " + maxPage;

    // set the submit theme button to the first custom card image

    try {
        const sync = await chrome.storage.sync.get("custom_cards");
        const exports = await getExport(sync, ["custom_cards"]);
        document.getElementById("theme-button-img").style.background = `linear-gradient(#00000070, #00000070), url(${exports["custom_cards"][0]}) no-repeat center center / cover`;
    } catch (e) {
        console.log(e);
    }

    displaySavedThemes();

}

function displayThemeListOld(pageDir = 0) {
    //const keys = Object.keys(themes);
    document.getElementById("theme-current-sort").textContent = current_sort;
    const perPage = 24;
    const maxPage = Math.ceil(allThemes.length / perPage);
    if (pageDir === -1 && current_page_num > 1) current_page_num--;
    if (pageDir === 1 && current_page_num < maxPage) current_page_num++;
    let container = document.getElementById("premade-themes");
    container.textContent = "";
    let start = (current_page_num - 1) * perPage, end = start + perPage;
    allThemes.forEach((theme, index) => {
        if (index < start || index >= end) return;
        let themeBtn = makeElement("button", container, { "className": "theme-button" });
        themeBtn.classList.add("customization-button");
        if (!themeBtn.style.background) themeBtn.style.backgroundImage = "linear-gradient(#00000070, #00000070), url(" + theme.preview + ")";
        let split = theme.title.split(" by ");
        makeElement("p", themeBtn, {"className": "theme-button-title", "textContent":  split[0] });
        makeElement("p", themeBtn, {"className": "theme-button-creator", "textContent": split[1] });
        themeBtn.addEventListener("click", () => {

            const allOptions = syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "card_colors"]);
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
    });
    document.getElementById("premade-themes-pagenum").textContent = current_page_num + " of " + maxPage;
    displaySavedThemes();
}

function displayThemeSearchList(themesToShow, pageDir = 0) {
    document.getElementById("theme-current-sort").textContent = current_sort;
    const perPage = 24;
    const maxPage = Math.ceil(themesToShow.length / perPage);
    if (pageDir == -1 && current_page_num > 1) current_page_num--;
    if (pageDir == 1 && curren_page_num < maxPage) current_page_num++;
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
                const allOptions = syncedSwitches.concat(syncedSubOptions).concat(["dark_preset", "custom_cards", "custom_font", "gpa_calc_bounds", "card_colors"]);
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

function displayAdvancedCards() {
    sendFromPopup("getCards");
    chrome.storage.sync.get(["custom_cards", "custom_cards_2"], storage => {
        // document.querySelector(".advanced-cards").innerHTML = '<div id="advanced-current"></div><div id="advanced-past"><h2>Past Courses</h2></div>';
        // const keys = storage["custom_cards"] ? Object.keys(storage["custom_cards"]) : [];
        // if (keys.length > 0) {
        //     let currentEnrollment = keys.reduce((max, key) => storage["custom_cards"][key]?.eid > max ? storage["custom_cards"][key].eid : max, -1);
        //     keys.forEach(key => {
        //         let term = document.querySelector("#advanced-past");
        //         if (storage["custom_cards"][key].eid === currentEnrollment) {
        //             term = document.querySelector("#advanced-current");
        //         }
        //         let card = storage["custom_cards"][key];
        //         let card_2 = storage["custom_cards_2"][key] || {};
        //         if (!card || !card_2 || !card_2["links"] || card_2["links"]["custom"]) {
        //             console.log(key + " error...");
        //             console.log("card = ", card, "card_2", card_2, "links", card_2["links"]);
        //         } else {
        //             let container = makeElement("div", term, { "className": "custom-card" });
        //             container.classList.add("option-container");
        //             container.innerHTML = '<div class="custom-card-header"><p class="custom-card-title"></p><div class="custom-card-hide"><p class="custom-key">Hide</p></div></div><div class="custom-card-inputs"><div class="custom-card-left"><div class="custom-card-image"><span class="custom-key">Image</span></div><div class="custom-card-name"><span class="custom-key">Name</span></div><div class="custom-card-code"><span class="custom-key">Code</span></div></div><div class="custom-links-container"><p class="custom-key">Links</p><div class="custom-links"></div></div></div>';
        //             let imgInput = makeElement("input", container.querySelector(".custom-card-image"), { "className": "card-input" });
        //             let nameInput = makeElement("input",  container.querySelector(".custom-card-name"), { "className": "card-input" });
        //             let codeInput = makeElement("input", container.querySelector(".custom-card-code"), { "className": "card-input" });
        //             let hideInput = makeElement("input", container.querySelector(".custom-card-hide"), { "className": "card-input-checkbox" });
        //             imgInput.placeholder = "Image url";
        //             nameInput.placeholder = "Custom name";
        //             codeInput.placeholder = "Custom code";
        //             hideInput.type = "checkbox";
        //             imgInput.value = card.img;
        //             nameInput.value = card.name;
        //             codeInput.value = card.code;
        //             hideInput.checked = card.hidden;
        //             if (card.img && card.img !== "") container.style.background = "linear-gradient(155deg, #1e1e1eeb 20%, #1e1e1ecc), url(\"" + card.img + "\") center / cover no-repeat";
        //             imgInput.addEventListener("change", e => {
        //                 setCustomImage(key, e.target.value);
        //                 container.style.background = e.target.value === "" ? "var(--containerbg)" : "linear-gradient(155deg, #1e1e1eeb 20%, #1e1e1ecc), url(\"" + e.target.value + "\") center / cover no-repeat";
        //             });
        //             nameInput.addEventListener("change", function (e) { updateCards(key, { "name": e.target.value }) });
        //             codeInput.addEventListener("change", function (e) { updateCards(key, { "code": e.target.value }) });
        //             hideInput.addEventListener("change", function (e) { updateCards(key, { "hidden": e.target.checked }) });
        //             container.querySelector(".custom-card-title").textContent = card.default;

        //             for (let i = 0; i < 4; i++) {
        //                 let customLink = makeElement("input", container.querySelector(".custom-links"), { "className": "card-input" });
        //                 customLink.value = card_2.links[i].is_default ? "default" : card_2.links[i].path;
        //                 customLink.addEventListener("change", function (e) {
        //                     chrome.storage.sync.get("custom_cards_2", storage => {
        //                         let newLinks = storage.custom_cards_2[key].links;
        //                         if (e.target.value === "" || e.target.value === "default") {
        //                             console.log("this value is empty....")
        //                             //newLinks[i] = { "type": storage.custom_cards_2[key].links.default[i].type, "default": true };
        //                             newLinks[i] = { "default": newLinks[i].default, "is_default": true, "path": newLinks[i].default };
        //                             customLink.value = "default";
        //                         } else {
        //                             //newLinks[i] = { "type": getLinkType(e.target.value), "path": e.target.value, "default": false };
        //                             let val = e.target.value;
        //                             if (!e.target.value.includes("https://") && e.target.value !== "none") val = "https://" + val;
        //                             newLinks[i] = { "default": newLinks[i].default, "is_default": false, "path": val };
        //                             customLink.value = val;
        //                         }
        //                         chrome.storage.sync.set({ "custom_cards_2": { ...storage.custom_cards_2, [key]: { ...storage.custom_cards_2[key], "links": newLinks } } })
        //                     });
        //                 });
        //             }
        //         };
        //     });
        // } else {
        //     document.querySelector(".advanced-cards").innerHTML = `<div class="option-container"><h3>Couldn't find your cards!<br/>You may need to refresh your Canvas page and/or this menu page.<br/><br/>If you're having issues please contact me - sandlerguy5@gmail.com</h3></div>`;
        // }

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

        const editMenu = document.getElementById("card-edit-menu");
        if (editMenu) {
            editMenu.style.display = "none";
        }
    });
	sendFromPopup("getCards");
}

function createCourseButton(courseId, courseData) {
	const button = document.createElement("button");
	button.className = "course-card-button";
	const displayName =
		courseData.name ||
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