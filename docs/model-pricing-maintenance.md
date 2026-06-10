# Model Pricing Maintenance

`docs/model-pricing.json` is the source manifest served from GitHub Pages:

`https://shamcleren.github.io/CodePal/model-pricing.json`

The app imports this manifest on startup and every 8 hours, then upserts rows into the
local `model_pricing` table. Prices are stored as USD per 1M tokens. The remote manifest
only lists currently available models; installed clients maintain their own append-only
`model_pricing_history` snapshots when a model first appears or its price changes.

## Update Flow

When asked to update model pricing:

1. Check the default supported model set.
   - Provider Gateway defaults: `defaultProviderGatewaySettings.providers[*].modelMappings`
   - Agent-specific models: `REQUIRED_MODEL_IDS` in `src/main/pricing/modelPricingCatalog.test.ts`
   - Newly observed agent models from local history when relevant, especially CodeBuddy `extra.modelId`
2. Keep only currently available models in `pricing`.
   - Remove stale / retired / dated snapshot rows from `pricing`.
   - Do not add a remote `pricingHistory` section for routine updates; clients derive history locally.
   - If a default Provider Gateway mapping still points at an old model, update the mapping to the provider's current model.
3. Prefer official provider pricing pages. If a provider publishes tiered prices, use the default short-context interactive tier unless the model ID itself encodes a long-context variant.
4. Keep every `modelId` unique and exactly equal to the model string written into `token_usage.model`.
5. Run:

```bash
npm run pricing:check
npm test -- src/main/pricing/modelPricingSync.test.ts src/shared/appSettings.test.ts
```

6. After merge, publish the updated `docs/model-pricing.json` through GitHub Pages.

## Notes

- `Hy3 preview` is the CodeBuddy Hy3 preview model name and is intentionally priced at `0`.
- Cache creation is `0` when the provider says cache writes are free or does not publish a separate cache-write price.
- Custom user providers cannot be pre-enumerated; add those rows only when a stable default needs current cost estimates.
