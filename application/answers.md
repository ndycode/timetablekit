# Vercel Open Source Program application answers

Status: prepared, not submitted. Verified 2026-09-01. Public repository, deployment, package, and release URLs are added to this file only after each external surface is independently verified.

## Applicant-owned fields

The applicant must enter their own first name, last name, email address, preferred social link, and optional company. These identity fields are intentionally not stored in this repository.

## Project name

TimetableKit

## Project URL

Record the verified production Vercel URL here after deployment.

## GitHub repository

Record the verified public repository URL here after publication.

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
