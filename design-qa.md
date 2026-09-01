# TimetableKit design QA

## Comparison target

- Source visual truth: `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/paykit-desktop.png` and `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/paykit-mobile.png`
- Source prototype state: `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/paykit-motion-start.png`
- Earlier typography comparisons: `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/design-qa-comparison.png` and `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/design-qa-comparison-mobile.png`
- Rendered implementation: `http://127.0.0.1:4174/`
- Light landing desktop: `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/timetablekit-home-production-desktop.png`
- Light landing full page: `/Users/neil/Documents/ChatGPT/timetablekit/output/playwright/timetablekit-home-production-full.png`
- Crowded demo desktop: `/Users/neil/Documents/ChatGPT/timetablekit/.playwright-cli/page-2026-09-01T14-42-13-235Z.png`
- Crowded demo mobile: `/Users/neil/Documents/ChatGPT/timetablekit/.playwright-cli/page-2026-09-01T14-43-02-486Z.png`

The current landing review uses a 1200 x 855 CSS viewport on desktop and 390 x 844 on mobile. The source and implementation have different content and page heights because TimetableKit remains original. The comparison focuses on the observed light rail, hairline rules, browser-shell prototype, staged messages, parser trace, typewriter input, and compact mono metadata.

## Review

- Fonts and typography: Passed. Live PayKit computed styles were measured and applied. Desktop H1 is Geist regular at 40.8px, 51px line height, and -1.02px tracking. Mobile H1 is 30px, 37.5px, and -0.75px. H2 is 24px, 500 weight, 32px line height, and -0.6px tracking. Body text is 16px with 24px line height. Code is Geist Mono at 14px with 20px line height. TimetableKit uses the local `geist` package and its local font faces.
- Spacing and layout rhythm: Passed. The implementation uses the same centered rail, thin rules, compact header, two-column hero, framed code/data surface, section separators, and dense footer rhythm. The prototype uses the same browser-window and backend-panel relationship as the observed PayKit section. The playground and docs extend the same rail system without horizontal overflow.
- Colors and visual tokens: Passed. The landing route uses one light palette from header through footer and prototype. The implementation keeps TimetableKit cobalt-derived blue accents, its existing icon, and original content. Docs and playground routes remain light.
- Prototype motion: Passed. The landing demo stages six fictional parsing and export states every 2.1 seconds. It types the current status at 30ms per character, enters only new chat and trace rows with transform and opacity, includes a restrained plan-card shake, and exposes a Pause or Play control. The visible chat and trace windows are bounded to the latest four rows. Reduced-motion mode renders the final bounded state with no animation and keeps the stage fixed.
- Image quality and asset fidelity: Passed. No PayKit logo, wordmark, screenshot, illustration, or source asset was copied. The implementation retains the existing TimetableKit icon as a local asset.
- Copy and content: Passed with an intentional product difference. TimetableKit product copy, privacy wording, navigation, and fictional schedule data remain original and are not copied from PayKit.

## Findings

No actionable P0, P1, or P2 visual findings remain.

The initial review found that the implementation used Geist without PayKit's measured role metrics. The fix added the local `geist` package and applied the measured family, weight, size, tracking, and line-height values across the shared shell, landing page, docs, playground, buttons, and code surfaces. The next review found that the prototype layout was fighting the requested light-only surface. The fix applied one light palette across the landing shell and retained the light treatment on every route. The latest review found that a fully populated demo stretched the trace column and re-entered existing rows. Stable keys, a bounded latest-entry window, fixed desktop panel geometry, and explicit overflow rules resolve that state.

P3 follow-up only: the two products retain different brand colors, icons, and content. This is intentional to preserve TimetableKit identity and avoid copying third-party branding or content.

## Manual QA evidence

- Clicked the home `Try a sample` link and observed navigation to `/playground`.
- Opened and closed the mobile `Menu` control and observed all navigation links.
- Observed `Parsed 6 events.` in the rendered playground.
- Observed the sample review table, warnings, conflicts, agenda, and normalized JSON.
- Confirmed desktop and mobile pages have no horizontal overflow.
- Checked the production browser console. It reported zero errors and zero warnings.
- Observed the local production prototype advance through stages `01/06`, `02/06`, `04/06`, `05/06`, and `06/06` with messages and parser trace entries appearing.
- Paused the prototype and confirmed the stage remained fixed after three seconds. Resumed it and confirmed the stage advanced.
- Ran a direct Playwright context with `prefers-reduced-motion: reduce`. It rendered stage `5`, four messages, four logs, `animation: none`, and remained paused at stage `5`.
- Confirmed the desktop final state uses 480px browser and backend panels. All four visible chat rows and all four visible trace rows stayed inside their containers with zero overlaps.
- Confirmed the mobile final state has zero chat or trace row overlaps and zero horizontal overflow. Document and body widths stayed at 390px.
- Sampled the stage `03` to `04` transition for 350ms. The chat and trace stacks reported zero overlaps and zero rows outside their containers across 23 frames.
- Ran the full cross-browser web suite in Chromium, Firefox, and WebKit.

## Comparison history

1. Initial typography review. The visible system was close, but the live PayKit font metrics had not been measured. The implementation was treated as not ready for typography handoff.
2. Fix. Measured PayKit with Playwright, wired the local Geist faces, applied the exact observed values, rebuilt, and recaptured desktop, mobile, playground, and docs states.
3. Post-fix comparison. The combined desktop and mobile comparisons show no actionable P0, P1, or P2 differences. Functional and accessibility checks remained green after the fix.
4. Prototype correction. Added the original staged TimetableKit browser and parser-trace demo after the live PayKit section showed that the missing behavior was progressive state, typing, and backend feedback.
5. Theme correction. Applied one light-only landing theme after manual QA showed the prototype was fighting the page surface. Rebuilt, reran the 21-test web suite, and recaptured light landing and motion states.
6. Crowded-state correction. Bounded the staged rows, preserved keys for existing entries, fixed the desktop panel height, and verified the final and transition states at desktop, mobile, and reduced-motion settings.

## Implementation checklist

- [x] Shared Geist and Geist Mono font faces loaded locally.
- [x] PayKit desktop and mobile typography metrics applied.
- [x] PayKit-inspired rail, border, CTA, code, and section rhythm applied.
- [x] Original TimetableKit branding and product content preserved.
- [x] Original PayKit-inspired prototype animation added with pause and reduced-motion behavior.
- [x] Landing route uses one light palette without changing other route themes.
- [x] Crowded chat and parser-trace states stay bounded without overlap or layout expansion.
- [x] Mobile menu and responsive layout manually checked.
- [x] Browser console checked.
- [x] Production build, web tests, lint, formatting, and production smoke passed after the crowded-state patch.
- [x] Manual desktop, mobile, transition, reduced-motion, and console checks passed after the crowded-state patch.

final result: passed
