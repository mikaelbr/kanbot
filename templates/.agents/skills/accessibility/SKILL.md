---

name: accessibility
description: "Practical WCAG 2.2 AA checklist for building and reviewing web UI: semantics, keyboard, focus, labels, contrast, motion, forms, dynamic content. Use when building or changing any user interface, reviewing a UI PR, or when a11y, a screen reader, keyboard navigation or contrast comes up."
---

# Accessibility (WCAG 2.2 AA)

Build it in while writing the markup; retrofitting costs more. Native HTML elements get most of this right for free.

## Structure and semantics

- [ ] One `<h1>` per page; headings in order without skipped levels; headings describe the section.
- [ ] Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`; one `<main>`.
- [ ] Buttons are `<button>` (actions), links are `<a href>` (navigation). No clickable `<div>`/`<span>`.
- [ ] Lists are `<ul>/<ol>`, tabular data is `<table>` with `<th scope>`.
- [ ] `lang` set on `<html>`. Page `<title>` describes the page.
- [ ] ARIA only when no native element fits; a wrong role is worse than none.

## Keyboard and focus

- [ ] Every interactive element is reachable and operable with Tab, Shift+Tab, Enter, Space, and arrow keys where the pattern expects them (menus, tabs, radios).
- [ ] Focus order follows the visual order. No positive `tabindex`.
- [ ] Focus is always visible, with at least 3:1 contrast against its background. Never `outline: none` without a replacement.
- [ ] Focused elements are not hidden behind sticky headers or footers (2.4.11).
- [ ] Dialogs: focus moves in on open, is trapped inside, Escape closes, focus returns to the trigger. Prefer `<dialog>`.
- [ ] No keyboard traps. A "Skip to content" link when there is repeated navigation.

## Names, labels and images

- [ ] Every control has an accessible name: visible `<label for>`, or `aria-label` for icon-only buttons.
- [ ] The accessible name contains the visible label text (2.5.3).
- [ ] Informative images have `alt` describing their purpose; decorative ones have `alt=""`. Icon SVGs inside labelled buttons get `aria-hidden="true"`.
- [ ] Link text makes sense out of context: "View invoice 1042", not "Click here".

## Colour and contrast

- [ ] Body text at least 4.5:1; large text (24px, or 18.7px bold) at least 3:1.
- [ ] UI component boundaries and meaningful icons at least 3:1.
- [ ] Colour is never the only signal: errors also have text or an icon; links in text are underlined or otherwise distinct.
- [ ] Check both light and dark themes if the app has them.

## Layout and input

- [ ] Works at 320px wide without horizontal scrolling (except tables, maps, code), and at 200% zoom.
- [ ] Text spacing can be increased without clipping; no fixed heights on text containers.
- [ ] Target size at least 24x24 CSS px, or enough spacing around it (2.5.8). Aim for 44x44 on touch.
- [ ] Drag-only interactions have a single-pointer alternative (2.5.7).
- [ ] Nothing depends on hover alone; tooltips are reachable by keyboard and dismissable.

## Forms

- [ ] Labels are visible and persistent (placeholders are not labels).
- [ ] Required fields are marked in text, not only with colour or `*` without explanation.
- [ ] Errors identify the field and say how to fix it; linked via `aria-describedby`; focus or summary on submit.
- [ ] Correct `type` and `autocomplete` (`email`, `name`, `one-time-code`, …).
- [ ] Don't ask for information already given in the same flow (3.3.7); allow paste in password and code fields (3.3.8).

## Dynamic content and motion

- [ ] Status changes that don't move focus (saved, count updated, results loaded) are announced via `role="status"` / `aria-live="polite"`. Errors that need attention: `role="alert"`.
- [ ] Loading states are announced, or the busy region has `aria-busy="true"`.
- [ ] Respect `prefers-reduced-motion`: disable non-essential animation and parallax.
- [ ] No content flashes more than 3 times per second. Auto-playing or moving content can be paused.
- [ ] Session timeouts warn and allow extension.

## How to check quickly

1. Tab through the changed UI from the top without a mouse. Can you do the whole task? Can you always see where focus is?
2. Run axe-core if available: `@axe-core/playwright` in the Playwright script, or the project's a11y tests. Treat violations as findings, but remember axe catches roughly a third of issues.
3. Inspect accessible names in Playwright: `page.getByRole("button", { name: "Save" })` should find the control. If role-based locators cannot find it, neither can a screen reader user.
4. Zoom to 200% and resize to 320px.

## Severity when reviewing

`blocker`: keyboard trap, primary action unreachable by keyboard or unlabelled. `major`: any other AA failure in the changed UI. `minor`: best-practice gaps beyond AA.
