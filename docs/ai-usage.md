# AI usage

The organisers ask us to disclose where and how AI was used. Add one line per piece of work: who, which tool, what for.

| Who | Tool | What for |
|---|---|---|
| nisabu | Claude Code | Turning the roadmap into the implementation plans in `docs/superpowers/plans/`; the scaffold and frozen contract (Task S0); the FX module (Task B1) |
| germanritt | Claude Code | The backend behind the frozen contract: tables, seed loading, read API, tax profile and error format (B2), event bus and SSE (B3), payment pipeline, undo and tax payment (B4–B6), with first versions of the classifier, tax rules, summary, CSV export and demo data for roles C and D to review |
| myfern | Claude Code | Frontend (role A): the desktop design and a clickable prototype (since merged into `frontend/` and removed), and the app in `frontend/` on the real API (Home, transaction detail, onboarding, live toast and work question, Tax Jar, Undo, pay, CSV export), the simulator page, unit tests and the Playwright golden-path and screenshot scripts |
