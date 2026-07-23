# Group Solar Curtailment — demo output

**Anonymized** reproductions of the Group curtailment report, for showing partners
without leaking a real partner's figures. Two example days of the **same demo group**
("Demo Solar Curtailment Pool"):

| Example | Day | Curtailment | Character |
|---|---|---|---|
| **full-day** | 19 Jul 2026 | 10:15–17:30 (7h 15m), Address grid 0 W | long midday zero-export event |
| **short** | 20 Jul 2026 | 15:06–15:15 (9m), Address grid 0 W | brief 9-min notch during high production |

## Anonymization
Each is based on a real reference day, transformed so nothing is the partner's actual number:
- Group renamed **"Demo Solar Curtailment Pool"**; fresh inverter/meter counts (165 / 161)
  and schedule count (248).
- A realistic day was synthesized and run through the *real* impact math
  (`src/features/reports/curtailmentImpact.ts`), so tile figures are **derived from the
  synthetic series** — ~15% above the reference, none copied.

| Tile | full-day | short |
|---|---|---|
| Curtailed | 1,592.7 kWh | 45.8 kWh |
| Reduction | 64% | 6% |
| Potential | 2,492.6 kWh | 788.0 kWh |
| Produced | 899.9 kWh | 742.2 kWh |
| Exported / Imported | 262.1 / 210.8 kWh | 3.0 / 2.9 kWh |

## Files
| File | What |
|---|---|
| `report-full-day.png`, `report-short.png` | Full-page report screenshots (crop what you need). |
| `data-full-day.json`, `data-short.json` | Anonymized data models — mirror the report inputs: `periods` (group flex-schedule endpoint), `minutes` + `detail` (group flex-aggregation endpoint), plus derived `impact`. |
| `index-full-day.html`, `index-short.html` | Self-contained pages (SVG charts). Served locally for grabbing your own crops. |
| `generate.mjs` | Regenerates both datasets. Scenario config + scale/shape constants at the top. |
| `build-html.mjs` | Rebuilds an HTML from a data file. |

## Regenerate
```bash
node generate.mjs                                   # both -> data-*.json
node build-html.mjs data-full-day.json index-full-day.html
node build-html.mjs data-short.json    index-short.html
```

## Local preview / grab your own screenshots
```bash
python3 -m http.server 8099 --bind 127.0.0.1
# http://127.0.0.1:8099/index-full-day.html
# http://127.0.0.1:8099/index-short.html
# add ?bare for a chrome-free content view (no sidebar)
```
