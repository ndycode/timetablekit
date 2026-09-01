# Vercel Open Source Program application answers

Status: prepared, not submitted. Verified 2026-09-01. The public repository and the exact candidate Vercel preview below are independently verified. The production URL remains live on the pre-release deployment. npm publication and the GitHub release are pending their external gates.

## Applicant-owned fields

The applicant must enter their own first name, last name, email address, preferred social link, and optional company. These identity fields are intentionally not stored in this repository.

## Current live-form mapping

The live form checked on 2026-09-01 contains the following fields. Applicant-owned identity fields stay out of this repository.

### 1. About you

Enter the applicant's own first name, last name, email address, and optional company.

### 2. Preferred social link

Enter the applicant's own public social or professional profile URL.

### 3. Project name

TimetableKit

### 4. Live URL

https://timetablekit.vercel.app/

### 5. GitHub link

https://github.com/ndycode/timetablekit

### 6. Role

Project owner.

### 7. Project

TimetableKit is a privacy-first open-source TypeScript toolkit and Vercel-hosted playground that converts timetable text, images, and PDFs into validated calendar events with human correction and JSON, CSV, and iCalendar exports.

### 8. What distinguishes the project

TimetableKit keeps the default parse and review path local and in memory. It combines deterministic parsing, field-level confidence, source evidence, conflict detection, bounded OCR and PDF adapters, correction, and standards-compatible exports in a framework-independent package. The hosted playground works without an account or AI key. Optional remote recovery is disabled until the user gives consent, and the public repository includes synthetic fixture and privacy tests.

### 9. Anything else

The public repository includes an MIT license, Code of Conduct, security and contribution guidance, a fixture-driven test suite, a public roadmap, and ten scoped maintainer issues. The pre-release production deployment and exact candidate preview are live. A focused MySched adapter pull request is open as an integration proposal. It does not claim production adoption. The npm package archive installs cleanly in a fresh consumer, but publication is waiting for npm authentication on the release machine. Evidence and exact limits are recorded in the repository claims ledger.

### 10. Is the project fully open source and will it remain so?

Yes. TimetableKit is released under the MIT License and the project will keep the public toolkit, documentation, fixtures, and tests open source.

### 11. Is the project hosted on or intended to be hosted on Vercel and will it remain there?

Yes. The public playground, documentation, serverless validation route, and preview deployments are hosted on Vercel.

### 12. Vercel Team ID

team_5xidpACRcych6R88RSuvQ8qK

### 13. Code of Conduct

Yes. I agree to Vercel's Code of Conduct. The repository also includes a project Code of Conduct.

### 14. Program terms

Review the current program terms and accept them only in the live form as the applicant. This draft does not submit the application.

## Project name

TimetableKit

## Project URL

https://timetablekit.vercel.app/

## GitHub repository

https://github.com/ndycode/timetablekit

## Role

Project owner.

## One-sentence description

TimetableKit is a privacy-first open-source TypeScript toolkit and Vercel-hosted playground that converts timetable text, images, and PDFs into validated calendar events with human correction and JSON, CSV, and iCalendar exports.

## Problem

Timetable data is often trapped in screenshots, PDFs, or copied text. People and products need a way to convert it into structured calendar events without sending private schedules to a remote service by default.

## Solution and current status

TimetableKit provides a framework-independent TypeScript core with deterministic parsing, validation, field confidence, source evidence, correction, and export. Separate adapters support bounded local OCR and PDF extraction. The web playground keeps the default workflow in memory, requires no account, and lets a reviewer correct warnings before downloading JSON, CSV, or ICS. The repository also includes a CLI, synthetic fixtures, provider contract tests, privacy controls, and contributor documentation. Public publication and deployment evidence are recorded below after verification.

## Impact and growth potential

TimetableKit is new and makes no unsupported claim about users, downloads, stars, forks, contributors, or adoption. Its problem provenance comes from recurring timetable-import work in MySched, while the implementation is independent and uses no private schedules. The growth path is fixture-driven contribution for new layouts, locales, exporters, accessibility improvements, OCR preprocessing, and provider adapters.

## Community engagement

Contributors can submit synthetic or properly licensed fixtures, parser rules, locale aliases, exporters, provider adapters, documentation, and accessibility fixes through focused pull requests. The repository includes contribution, governance, support, security, issue-template, and Code of Conduct surfaces. Add only verified issue, pull request, tester, or contributor evidence to the evidence map.

## Open-source fit

TimetableKit is released under the MIT License. Its public repository includes a Code of Conduct, security policy, support guidance, governance policy, claims ledger, and privacy documentation. The project keeps the parser usable without a paid AI dependency.

## Why Vercel

Vercel provides the public surface for the browser playground, documentation, serverless validation route, and preview deployments. Preview deployments make parser and UI changes reviewable in a real environment. The official Vercel Open Source Program page was checked on 2026-09-01 and states that the Summer cohort is open until September 13, 2026. It describes $3,600 in Vercel platform credits over 3 years for selected projects. This project does not claim selection.

## Credit use

If selected, credits will be used only for the public TimetableKit project. Proposed uses are the Vercel-hosted playground, documentation, preview deployments, the bounded parse route, public examples, bandwidth, and privacy-safe aggregate observability. Credits will not be used for MySched production traffic, private commercial workloads, unrelated repositories, or provider charges outside the program.

## Maintenance commitment

The maintainer will prioritize a small tested core, honest release notes, synthetic public fixtures, timely security response, and clear contributor guidance. The public roadmap and claims ledger will be updated as external evidence changes. Parser regressions must be reproducible without exposing user data.

## Evidence to attach

See [evidence.md](evidence.md), [reviewer-checklist.md](reviewer-checklist.md), [demo-script.md](demo-script.md), [credit-usage.md](credit-usage.md), and [the claims ledger](../docs/claims.md). Do not submit until every factual field is backed by a current public source and the live form has been checked again.
