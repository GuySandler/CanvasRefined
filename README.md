![Canvas Refined](/icon/NEWtitle.png)

# Canvas Refined

I don't like the direction bettercanvas (bettercampus) is heading so I forked it

They tried to change license but forgot to rebase so this is based on the MIT licensed version and fully legal 🙃

There is a dev branch for active alpha if you really want

# Get it now!

1. get it on the [chrome web store](https://chromewebstore.google.com/detail/canvasrefined/ihienfbdfdamhmhhiokjnjmpjgbenedg)! 
2. get it on the [firefox addon store](https://addons.mozilla.org/en-US/firefox/addon/canvas-refined/)!

## Inquiries

To contact me, please email sandlerguy5@gmail.com, or you can open an issue within the "Issues" tab on GitHub.

## Table of Contents

- [Features](#features)
- [Dev Installation](#dev-installation)
- [Version Notes](#version-notes)
- [Color Reference](#color-reference)
- [Contributing](#contributing)
- [Authors](#authors)

## Features

The original introduces improvements to the Canvas user interface:

- Fully customizable dark mode (choose from premade options or manually edit dark mode)
- Automatic scheduling for dark mode
- Dashboard card color palletes
- Themes created by users (broken due to fork)
- Assignments due list
- Dashboard notes
- Custom fonts
- Condensed cards
- Dashboard grades
- Remove sidebar logo
- Customizable card links
- Gradient dashboard cards
- Advanced card customization
- GPA calculator (college and highschool)
- Browser wide popup assignment reminder
- Preview assignments and announcements from the dashboard 

## Newly added features

Canvas Refined adds more with more to come!

- GPA presets
- backend stuff:
	- Searching themes (the original didn't actually impliment that)
	- made the dark mode into a css file instead of a reallllllly long string
- Card Styles (image size, card roundness, card spacing, width, height, theme compatible)
- Custom Background (by URL, theme compatible)
- Popup UI revamp
- NEW Better todo list
- Better sidebar
- Simplified UI

## Planned Features (by priority)
- widgets (music, timer)
- auto rotate theme + theme history + fix theme submissions
- mail assistent + ui revamp
- better calender (+ calender sync)
- better what if grade
- global search
- fix darkmode fixer
- grade history with graph

## Extra features that might be added:
- card grade position, card outline
- theme copy button
- revamp cards page UI
- streaks
- caching pages for faster loading
- liquid glass theme?
- animated backgrounds, rotating background, time/weather reactive backgrounds, maybe chache if it becomes an issue
- custom side logo
- transcribe lecture (if there is demand for it)
- flashcards
- goals
- Scheduled Reminder Popups
- preview font
- button to remove all card images and undo

## Community suggestions (maybe will be done at some point)
- when opening assignments it will show you "if you get a 0 on this your grade will be _"
- quick modules button on cards
- module sorting (newest, oldest) (maybe grid view)
- grade leaderboard per class (opt in)
- GPA preset by school name maybe

## Dev Installation

To install, run, and build with this repository locally,

- Clone the repository locally
- Visit `chrome://extensions` in your browser. (replace chrome with your version of chromium)
- Enable developer mode by toggling the switch in the upper right corner of the viewport.
- Click the "Load upacked" button in the header.
- When prompted to open a file, select the root directory of this repository.

### How to use

- Once the extension is installed, navigate to your institution's Canvas homepage.
- To edit the available options, click on the "Extensions" button in the upper right corner of the viewport.
- When the menu opens, click on the Canvas Refined extension.
  - A menu will appear with configuration options for your Canvas homepage.

<!-- ## Color Reference

| Color      | Hex                                                              |
| ---------- | ---------------------------------------------------------------- |
| Background | ![#161616](https://via.placeholder.com/10/0a192f?text=+) #161616 |
| Text       | ![#ffffff](https://via.placeholder.com/10/ffffff?text=+) #ffffff |
| Accent 01  | ![#ff002e](https://via.placeholder.com/10/ff002e?text=+) #ff002e |
| Accent 02  | ![#ff5200](https://via.placeholder.com/10/ff5200?text=+) #ff5200 |
| Accent 03  | ![#ff47ad](https://via.placeholder.com/10/ff47ad?text=+) #ff47ad | -->

## Contributing

### Add a new feature

To add a new feature, please follow these guidelines.

#### Identifier

- Should be a unqiue one/two word storage identifier to indicate its status. (ie "dark_mode" or "dashboard_grades")
- If it has sub options (options that are specific to the main feature) these will also each need a unique identifier.
- All options are synced and have a 8kb storage limit, so if your feature needs more than this please contact me.

#### Changes to html/popup.html

- Add the appropriate HTML into this file. The corresponding id and name (see below) should be the identifier.
- If it has no sub options, it should be put in the same container as the other options with no sub options:

```
<div class="option" id="<identifier>">
    <input type="radio" id="off" name="<identifier>">
    <input type="radio" id="on" name="<identifier>">
    <div class="slider">
        <div class="sliderknob"></div>
        <div class="sliderbg"></div>
    </div>
    <span class="option-name"><option name></span>
</div>
```

- If it does have sub options it becomes it's own container:

```
<div class="option-container">
  <div class="option" id="<identifier>">
    <input type="radio" id="off" name="<identifier>">
    <input type="radio" id="on" name="<identifier>">
    <div class="slider">
      <div class="sliderknob"></div>
      <div class="sliderbg"></div>
    </div>
    <span class="option-name"><option name></span>
  </div>
  <div class="sub-options">
    <div class="sub-option">
      <input type="checkbox" id="<sub identifier>" name="<sub identifier>">
      <label for="<sub identifier>" class="sub-text"><option name></label>
    </div>
  </div>
</div>
```

#### Changes to js/popup.js

- Add the main identifier into the `syncedSwitches` array.
- If you have sub-options:
  - Add these identifiers to the array found under the comment that says `//checkboxes`.

#### Changes to js/background.js

- Add all identifiers into the `syncedOptions` array.
- Add a default value for your option to the `default_options` array.
  - Preferably this value should be `false` for booleans or ` ""` for strings (`null` can also be used if Canvas has a default for this option already)

#### Changes to js/content.js

- There should be a function(s) included in the this file that does the work. The name should clearly indicate it's purpose.
- Under `applyOptionsChanges()`, add a switch case to call this function when the menu toggle is changed.
- Depending on what your feature does, it needs to be told when to fire.
  - If the function changes any aspect of the dashboard, it should be put inside `checkDashboardReady()`.
  - If the function only adds css, it should be added to `applyAestheticChanges()`, and in this case should not be a separate function, instead add the css to the existing styles found in this function.
  - Anything else should be put under `startExtension()` and should be placed no higher than the `checkDashboardReady` function found here.

## Star History

<a href="https://www.star-history.com/?repos=GuySandler%2FCanvasRefined&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=GuySandler/CanvasRefined&type=date&theme=dark&legend=top-left&sealed_token=PPR8AZSTXJAWskYPcyVUafz4OZ5giutqwV8w3P8alGNMcyQG2Lo7T_Y074Z6kokTomyzK253AWTnF2tyF6ShnECZxoFhFpIEXWMgv88r48nqXNI988bEHOqMmM7r3Kcbja4mHL-IrXq4QkIOCdrLOn8trIxUKgU3iglA3WAQFT3NJgrNNgYPvm-boaTF" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=GuySandler/CanvasRefined&type=date&legend=top-left&sealed_token=PPR8AZSTXJAWskYPcyVUafz4OZ5giutqwV8w3P8alGNMcyQG2Lo7T_Y074Z6kokTomyzK253AWTnF2tyF6ShnECZxoFhFpIEXWMgv88r48nqXNI988bEHOqMmM7r3Kcbja4mHL-IrXq4QkIOCdrLOn8trIxUKgU3iglA3WAQFT3NJgrNNgYPvm-boaTF" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=GuySandler/CanvasRefined&type=date&legend=top-left&sealed_token=PPR8AZSTXJAWskYPcyVUafz4OZ5giutqwV8w3P8alGNMcyQG2Lo7T_Y074Z6kokTomyzK253AWTnF2tyF6ShnECZxoFhFpIEXWMgv88r48nqXNI988bEHOqMmM7r3Kcbja4mHL-IrXq4QkIOCdrLOn8trIxUKgU3iglA3WAQFT3NJgrNNgYPvm-boaTF" />
 </picture>
</a>

## Authors

#### Fork Owner

- [Guy](https://github.com/guysandler)

#### Original Owner

- [ksucpea](https://github.com/ksucpea)

#### Original Contributors

- [fudgeu](https://github.com/fudgeu)
- [Tibo Geeraerts](https://github.com/tibogeeraerts)
- [Jacob Mungle](https://github.com/Jelgnum)
- [FireIsGood](https://github.com/FireIsGood)

## License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

You can fork, modify, and use this code however you like with attributes.

![Canvas Refined](/icon/icon-48.png)

Copyright (c) 2024 ksucpea

Copyright (c) 2026 Guy Sandler

