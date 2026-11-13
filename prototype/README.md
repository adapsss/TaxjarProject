# Tax Jar prototype

Clickable desktop prototype of the Tax Jar, running on the real backend (`../backend`, FastAPI on :8000).
Vite proxies `/api` to it, and live updates (toast, work question) come from its event stream, `/api/events`.
The API client in `src/data/api.ts` mirrors the frozen `frontend/src/api/client.ts`.
Design: `../docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

Start the backend first (from `../backend`: `.venv/bin/uvicorn app.main:app --reload --port 8000`), then:

```bash
npm install
npx playwright install chromium   # once, for the screenshot scripts
npm run dev                       # http://localhost:5199
npm run shots                     # every screen and state → screenshots/  (dev server must be running)
npm run golden                    # golden path end to end with assertions (resets the backend first)
```

The dark **Demo controls** box in the sidebar sends incoming payments (Acme, Mari, John) to the backend,
and sets the screen state. **Not set up**, **Empty** and **Filled** reset the backend to that state;
**Live** shows it as it is; **Loading** and **Error** only change what the screen shows.
**Next action fails** makes the next action fail without calling the backend.
Payments sent from anywhere else (another tab, `curl`) show up live too.
