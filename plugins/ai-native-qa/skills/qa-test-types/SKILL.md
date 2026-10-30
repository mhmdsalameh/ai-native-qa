---
name: qa-test-types
description: Catalog of every test type the QA harness handles - functional, smoke, regression, integration/end-to-end, API, UI/usability, accessibility (WCAG 2.2), performance, compatibility/responsive, basic security, localization/RTL/Arabic, data migration, installation/upgrade, mobile, desktop, exploratory, UAT support, recovery - each with its oracle, checklist, tools per surface, evidence and what is NOT a bug. Use in /qa-plan to choose types by risk, in /qa-check for one type, and whenever the user asks for a kind of testing. Read only the reference file for the type in use.
---

# Test types

Pick types by risk in `/qa-plan`; run special checks with `/qa-check <type>`. Each type has one
reference file under `references/`. Read the one you need, not all of them.

| Type | When | Oracle | Reference |
|------|------|--------|-----------|
| Functional | always | requirement cards | `references/functional.md` |
| Smoke / sanity | every new build, before anything else | the main flows work at all | `references/smoke-sanity.md` |
| Regression | every build after the first | earlier PASS results | `references/regression.md` |
| Integration / end-to-end | flows that cross systems (payment gateway, SSO, email, core banking) | cards + interface specs | `references/integration-e2e.md` |
| API | the system has documented endpoints | API spec / cards | `references/api.md` |
| UI / usability | new or changed screens | design + cards + consistency | `references/usability-ui.md` |
| Accessibility | any public or regulated UI | WCAG 2.2 AA success criteria | `references/accessibility.md` |
| Performance | money flows, peak periods, NFRs with numbers | the NFR numbers; Core Web Vitals | `references/performance.md` |
| Compatibility / responsive | supported browsers/devices are listed | the support matrix | `references/compatibility.md` |
| Security (basic, black-box) | login, roles, personal data, money | OWASP items, access rules in cards | `references/security.md` |
| Localization / RTL | Arabic or bilingual clients | language cards, glossary, RTL rules | `references/localization-rtl.md` |
| Data migration | data moves from an old system | migration mapping, record counts | `references/data-migration.md` |
| Installation / upgrade | desktop or on-premise delivery | install guide, release notes | `references/installation-upgrade.md` |
| Mobile | iOS/Android apps or mobile web | cards + platform rules | `references/mobile.md` |
| Desktop | Windows/macOS applications | cards | `references/desktop.md` |
| Exploratory | new features, unclear areas, app-only projects | named standards, consistency | `references/exploratory.md` |
| UAT support | the client tests before go-live | the client's acceptance criteria | `references/uat-support.md` |
| Recovery / resilience | sessions, network loss, timeouts, retries | cards + named standards | `references/recovery.md` |

## Rules for every type

- A finding becomes a bug only through the validity gate (`qa-validity-gate`).
- Without an oracle (card or named standard), a surprising behaviour is a question.
- Record what the type could NOT cover on this surface in the check report (for example: no
  load generation in the Chrome side panel). A silent gap reads as a pass.
- Load, stress and penetration testing need dedicated tools and written permission; the harness
  does not run them. Note them as out of scope in the plan.
