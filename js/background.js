chrome.runtime.onInstalled.addListener(function () {

    let default_options = {
        "local": {
            "previous_colors": null,
            "previous_theme": null,
            "errors": [],
            "saved_themes": {},
            "liked_themes": [],
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
            "gpa_calc": true,
            "dark_mode": true,
            "gradent_cards": false,
            "disable_color_overlay": false,
            "auto_dark": false,
            "auto_dark_start": { "hour": "20", "minute": "00" },
            "auto_dark_end": { "hour": "08", "minute": "00" },
            "num_assignments": 4,
            "custom_domain": [""],
            "assignments_done": [],
            "dashboard_grades": true,
            "assignment_date_format": false,
            "dashboard_notes": false,
            "dashboard_notes_text": "",
            "dashboard_notes_mode": "edit",
            "better_todo": true,
            "todo_hr24": false,
			"todo_separate_scrollbar": false,
            "better_sidebar": false,
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
            "equal_height_cards": false,
            "hide_new_canvas": true,
            "quiz_safe_mode": false,
            "dark_mode_fix": [],
            "assignment_states": {},
            "tab_icons": false,
            "todo_hide_feedback": false,
            "todo_full_height": true,
            "todo_progress_rings": "rings",
            "todo_confetti": true,
            "device_dark": false,
            "cumulative_gpa": { "name": "Cumulative GPA", "hidden": false, "weight": "dnc", "credits": 999, "gr": 3.21 },
            // "show_updates": false,
            "card_method_date": false,
            "card_method_dashboard": true,
            "card_limit": 25,
            "remind": false,
            "reminders": [],
            "reminder_count": 1,
            "multi_remind": false,
            "id": "",
            "new_browser": null,
            "gpa_calc_cumulative": false,
            "gpa_calc_weighted": true,
            "browser_show_likes": false,
            "custom_styles": "",
            "imageSize": 100,
            "cardRoundness": 5,
            'cardSpacing': 0,
            "cardWidth": 262,
            "cardHeight": 250,
            "customCardStyles": false,
            "customBackgroundLink": "",
            "customBackgroundScale": 100,
            "customBackgroundDaily": false,
            "customBackgroundNasaDaily": false,
            "nasaInfoOverlay": false,
            "fitImageToScreen": false,
            "bg_opacity": 65,
            "sidebar_opacity": 100,
            "bg_blur": 8,
            "sidebar_blur": 0,
        }
    };

    const updateMsg = "Canvas Refined was just updated!\nThis version added new themes, cumulative GPA into the GPA calculator, and a new sorting function for themes.";

    chrome.storage.local.get(null, local => {
        chrome.storage.sync.get(null, async sync => {
            let newSyncOptions = {"update_msg": updateMsg};
            let newLocalOptions = {};
            Object.keys(default_options["sync"]).forEach(option => {
                if (sync[option] !== undefined) return;
                newSyncOptions[option] = default_options["sync"][option];
            });
            Object.keys(default_options["local"]).forEach(option => {
                if (local[option] !== undefined) return;
                newLocalOptions[option] = default_options["local"][option];
            })

            // migrate old setting name
            if (sync["nasaFitToScreen"] !== undefined && sync["fitImageToScreen"] === undefined) {
                newSyncOptions["fitImageToScreen"] = sync["nasaFitToScreen"];
            }

            if (Object.keys(newLocalOptions).length > 0) {
                chrome.storage.local.set(newLocalOptions);
            }

            if (Object.keys(newSyncOptions).length > 0) {
                chrome.storage.sync.set(newSyncOptions).then(() => {
                    console.log(newSyncOptions);
                    if (newSyncOptions.new_install === true) {
                        chrome.runtime.openOptionsPage();
                        chrome.storage.sync.set({ new_install: false });
                    }
                });
            }
        });
    });
});

// The NASA APOD API with the demo key is limited to 30 requests/hour and 50/day.
// Calls are serialized through this worker; the API's own 429 responses handle limiting.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "getNasaBackground") {
        getNasaBackground().then(sendResponse);
        return true;
    }
});

let nasaRequestQueue = Promise.resolve();
function queuedNasaTask(task) {
    const run = nasaRequestQueue.then(task, task);
    nasaRequestQueue = run.catch(() => {});
    return run;
}

async function getNasaBackground() {
    return queuedNasaTask(async () => {
        const date = new Date();
        for (let i = 0; i < 7; i++) {
            const dateStr = date.toISOString().slice(0, 10);
            const cacheKey = `nasa_apod_${dateStr}`;
            const metadataKey = `nasa_apod_meta_${dateStr}`;
            const cached = await chrome.storage.local.get([cacheKey, metadataKey]);
            if (cached[cacheKey]) return cached[cacheKey];

            // Don't re-probe dates the API already told us don't exist
            const missingKey = `nasa_apod_missing_${dateStr}`;
            const missing = await chrome.storage.local.get(missingKey);
            if (missing[missingKey]) {
                date.setDate(date.getDate() - 1);
                continue;
            }

            const data = await callNasaApi(dateStr);
            if (data === "ratelimited" || data === null) return null;
            if (data === "missing") {
                await chrome.storage.local.set({ [missingKey]: true });
                date.setDate(date.getDate() - 1);
                continue;
            }

            const url = data.thumbnail_url || data.hdurl || data.url;
            if (!url) return null;
            const result = { url, scale: 100, date: dateStr };
            const meta = { title: data.title || "", date: data.date || dateStr, copyright: data.copyright || "", explanation: data.explanation || "" };
            // Write image + metadata atomically so the info overlay never sees a
            // cached image with missing metadata.
            await chrome.storage.local.set({ [cacheKey]: result, [metadataKey]: meta });
            return result;
        }
        return null;
    });
}

async function callNasaApi(dateStr) {
    let response;
    try {
        response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true&date=${dateStr}`);
    } catch (error) {
        console.error("[CanvasRefined] Failed to fetch NASA APOD:", error);
        return null;
    }

    if (response.status === 429) return "ratelimited";
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 404 && (errorData.msg || "").toLowerCase().includes("no data available")) {
            return "missing";
        }
        return null;
    }

    return await response.json().catch(() => null);
}
