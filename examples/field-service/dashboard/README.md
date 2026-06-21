# Field Service Dashboard Example

This static dashboard is a small proof-of-value surface for generated field-service data. It uses deterministic synthetic output created from:

```bash
dds generate --spec examples/specs/field-service.simulator.spec.json --seed 42 --out examples/field-service/dashboard/data
```

The dashboard reads:

- `data/events.jsonl`
- `data/metrics_daily.csv`
- `data/manifest.json`

Run the local smoke proof to verify the dashboard assets and deterministic data
load from a loopback-only server:

```bash
npm run smoke:field-service-dashboard
```

Serve it from the repo root to preview:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/examples/field-service/dashboard/`.

All data in this example is synthetic. It is not derived from private dogfood, customer, or production records.

The committed fixture is covered by the test suite; `npm test` regenerates the field-service output with seed 42 and compares it against these dashboard files.
