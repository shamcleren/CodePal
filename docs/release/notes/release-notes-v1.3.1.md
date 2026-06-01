## CodePal v1.3.1

This patch release tightens the V1 monitoring surfaces after the Daily Work Review rollout. It removes low-value session noise, makes token and cost numbers consistent across pages, and fixes daily usage alignment between Analytics and Work Review.

### Highlights

- **Cleaner session list**: transient Claude lifecycle-only sessions are filtered out so the session view stays focused on real work.
- **Unified usage numbers**: session history, status strip, Analytics, and Work Review now share token and cost formatting.
- **Analytics simplification**: removed the low-value small agent trend cards and kept the main daily trend plus breakdown table as the primary analysis path.
- **Work Review range parity**: Work Review now preloads the full 30-day natural-day range and remembers the selected 7 / 14 / 30 day window.
- **Daily cost alignment**: Analytics and Work Review use the same trend cost estimator, including model alias handling that prefers exact and more specific model pricing.

### Validation

- `npm run lint` - clean
- `npm test` - 992 tests across 107 files, all passing
- `npm run build` - successful
