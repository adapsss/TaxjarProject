# Finishing pass: tax breakdown in the app, setup, cleanup, polish (short design)

**Intent.** Close everything left before the demo except role D's human tasks, and show judges what a reserve is made of. The backend half of the tax breakdown is already in `main` (skurbro, `feat(engine): exact tax breakdown wired into the backend`); this pass puts it on screen and fixes what the 80-country engine made awkward.

## Approaches (tax breakdown)

1. Split every payment proportionally, FIE by the 22:33 ratio labelled "estimate". Rejected: it shows euro amounts the law doesn't define.
2. **Chosen by nisabu: split only where it's exact.** The entrepreneur account shows money per tax (€276 = €110.40 income tax + €165.60 social tax). FIE and the other regimes show the rule in words ("22% income tax on profit + 33% social tax") and no amounts.

The backend already follows option 2: `TaxReservation.breakdown`, `TaxSummary.breakdown` and `breakdownRule`, `Regime.breakdownRule`. A reservation made under a regime with no exact split has `breakdown: null`.

## What gets built

The app is `prototype/` (wired to the backend); `frontend/` is unused.

1. **Breakdown on screen.** Mostly done by skurbro in `feat(fe): show the exact tax breakdown`: the toast ("€110.40 income tax · €165.60 social tax"), the reservation drawer, and the Tax Jar page ("Of which …", or "How it's taxed: …" with the rule in words); setup step 2 shows each regime's rule under its name. Left:
   - Home panel: the same split, or the rule in words, under the total.
   - Setup step 2: the long engine reasoning moves behind a "How we got this" toggle, so the rule is what a user reads first.
2. **CSV export:** add `income_tax` and `social_tax` columns (major units); empty when the reservation has no breakdown.
3. **Setup country step:** a search field that filters by country name or code; Estonia listed first; the list scrolls inside the step.
4. **Estonian spellings:** restore the accents in the Estonian regime names in `countries.json` (ettevõtluskonto, füüsilisest isikust ettevõtja). Other countries are left as the engine has them.
5. **Emoji:** country flags become text badges ("EE"), so nothing depends on an emoji font. Emoji in payment references stay as typed.
6. **Polish:** the demo controls' "Screen state" picker shows "Live" after setup; past income in the seed gets the "Income" tag when it has no reservation (it predates the Tax Jar).
7. **Payer history:** the pipeline passes `payer_history` and `owner_context` to the classifier, as the engine guide describes, but only if the golden path still passes; John must still get the question.
8. **Cleanup and docs:** delete `frontend/` and `backend/app/stubs.py`; the README runs the backend plus `prototype/` on port 5199 with Node 24; the shared plan's ownership table points role A at `prototype/`.

## Constraints

- The golden path (`prototype/scripts/golden.mjs`) must pass after every step, extended with assertions for the breakdown line and the FIE rule.
- No contract changes beyond what is already in `main`.
- Nothing loads from the network; disclaimer and "Hackathon prototype" label stay.

## Non-goals

Verifying tax figures against official sources, the pitch, Q&A, rehearsals and the backup video (role D). Per-tax totals when reservations under different regimes are mixed (the summary then shows the current regime's rule only).

## My calls

Everything in "What gets built" beyond option 2 itself is my call from the earlier review, which nobody has corrected: search plus Estonia first, text badges for flags, accents for Estonia only, deleting `frontend/`, the CSV columns, and wiring history only if the golden path still passes.
