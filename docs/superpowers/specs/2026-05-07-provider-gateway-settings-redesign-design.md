# Provider Gateway Settings Redesign

## Context

CodePal now has the backend pieces needed to act as a local Claude Desktop provider gateway:

- local Anthropic-compatible endpoint at `http://127.0.0.1:15721`
- provider/profile settings under `providerGateway`
- MiMo model mappings from Claude Desktop-safe names to upstream model ids
- local secret resolution through `provider-gateway-secrets.json` with environment fallback
- health-check logic for mapped upstream models

The missing product layer is a maintainable settings surface. Today, gateway maintenance requires editing local files, while the existing settings drawer already feels crowded because hook diagnostics, usage login, display controls, notifications, update controls, history, YAML access, and support diagnostics are all peers in the same navigation.

## Goals

1. Make Provider Gateway a first-class settings area for Claude Desktop gateway operation.
2. Keep the settings drawer operational and compact instead of growing another crowded section.
3. Preserve existing low-frequency controls, but move them behind an Advanced area rather than deleting them.
4. Keep secrets out of renderer state, logs, exports, support diagnostics, and visible UI.
5. Give users copyable Claude Desktop setup values so Claude Desktop can stay fixed on CodePal.

## Non-Goals

- Do not add freeform chat or `text_input`.
- Do not build a general provider marketplace.
- Do not implement HTTPS local gateway in this pass.
- Do not make model mappings fully editable in the first UI pass; show them read-only from settings.
- Do not remove existing maintenance/support functionality from code.

## Recommended Information Architecture

Use an "Operational Console" structure with fewer, clearer top-level sections:

1. **Overview**
   - Readiness snapshot for CodePal local services.
   - Shows whether the session listener is running.
   - Shows whether Provider Gateway is listening and whether token is configured.
   - Shows counts for integrations needing attention.

2. **Provider Gateway**
   - Main place to maintain Claude Desktop / MiMo gateway behavior.
   - Shows active provider, base URL, local Gateway URL, token state, model mappings, and last health check.
   - Provides token update and health-check actions.
   - Provides copyable Claude Desktop setup values.

3. **Agent Integrations**
   - Existing hook/listener diagnostics and repair actions.
   - Keep the current "attention first, healthy agents collapsed" behavior.

4. **Usage Accounts**
   - Cursor Dashboard usage.
   - Claude Code quota snapshots.
   - CodeBuddy usage.
   - Hide disabled enterprise CodeBuddy controls unless enabled or explicitly expanded.

5. **Preferences**
   - Merge display and notifications.
   - Keep commonly changed preferences visible: top usage strip, visible agents, density, locale, notification toggles.

6. **Advanced**
   - YAML open/reload.
   - update detail panel.
   - history retention and clear actions.
   - support links and diagnostics preview.

This preserves all existing capabilities but makes the normal path calmer: most users should spend time in Overview, Provider Gateway, Agent Integrations, and Usage Accounts.

## Provider Gateway Page

The Provider Gateway section should be dense but not crowded. It should answer four operational questions without requiring file editing:

1. **Is the local gateway running?**
   - Show local URL: `http://127.0.0.1:15721` or the configured/overridden port.
   - Show listening status.
   - Provide a copy button for the local URL.

2. **Which provider is active?**
   - Show provider display name, type, upstream base URL, and auth scheme.
   - For this pass, active provider selection can be read-only if only one provider exists.
   - The structure should allow a future provider selector.

3. **Is the token configured and valid?**
   - Show token state only as `configured` / `missing`.
   - Provide a password-style replacement input.
   - On save, send the token only to main process IPC, write it to the local secrets file, clear the renderer input, and refresh status.
   - Never echo the saved token back into UI state.

4. **Do model mappings work?**
   - Show a table with:
     - Claude Desktop model id
     - upstream model id
     - health result for that mapping
   - Provide a "Run health check" action that calls the backend health-check logic.
   - Health-check errors should show status/message without headers or token.

## Claude Desktop Setup Block

Include a compact setup block inside Provider Gateway:

- Gateway base URL: local gateway URL
- Gateway API key: `local-proxy`
- Gateway auth scheme: `bearer`
- inferenceModels: the Claude-side model names from `modelMappings`

The block should provide copy actions for:

- base URL
- API key
- model list

It should not ask Claude Desktop to store the real MiMo token.

## Main Process API

Add IPC handlers owned by main process:

- `codepal:get-provider-gateway-status`
  - Returns enabled/listening diagnostics, local URL, active provider metadata, token configured boolean, model mappings, and last health check.
  - Does not return token contents.

- `codepal:update-provider-gateway-token`
  - Accepts `{ providerId, token }`.
  - Validates provider id and non-empty token.
  - Writes to `provider-gateway-secrets.json` using `tokenRef`.
  - Uses file permissions equivalent to `0600` where supported.
  - Returns status with token configured boolean, not the token.

- `codepal:run-provider-gateway-health-check`
  - Runs the existing per-model minimal `/v1/messages` health check.
  - Stores last result in memory for display.
  - Returns sanitized status only.

Optional later:

- `codepal:clear-provider-gateway-token`
- `codepal:switch-provider-gateway-provider`
- `codepal:update-provider-gateway-profile`

## Shared Types

Add shared renderer-safe gateway types, separate from secret-bearing implementation:

- `ProviderGatewayStatus`
- `ProviderGatewayProviderSummary`
- `ProviderGatewayModelMappingStatus`
- `ProviderGatewayHealthCheckSummary`
- `ProviderGatewayTokenUpdateResult`

These types should contain provider ids, URLs, booleans, timestamps, statuses, and model ids only.

## Renderer Components

Add a new `ProviderGatewayPanel` component.

Responsibilities:

- Render the status strip.
- Render provider profile summary.
- Render token state and token update form.
- Render model mapping table.
- Render health-check results.
- Render Claude Desktop setup copy block.

Keep it independent from agent hook diagnostics. Provider Gateway is adjacent to integrations, not part of the hook repair grid.

Refactor settings composition in `App.tsx` so the new navigation labels map to clearer sections:

- `overview`
- `providerGateway`
- `integrations`
- `usage`
- `preferences`
- `advanced`

The first implementation can keep existing child panels and move them under the new sections rather than rewriting every panel.

## UI Direction

CodePal is an operational desktop tool, so the design should stay quiet, compact, and scan-friendly:

- restrained color accents
- table/list layouts for mappings and diagnostics
- no marketing-style hero sections
- no nested cards
- small status badges for `ready`, `missing`, `error`, and `checking`
- one primary action per panel row where possible

The drawer should feel more like a control room than a documentation page.

## Error Handling

- Missing token: show `Token not configured`.
- Gateway disabled: show disabled state and where to enable it.
- Port conflict: show local gateway unavailable with the attempted host/port.
- Unsupported provider: show active provider missing or invalid.
- Health-check failures: show per-model status and a short sanitized error.

No UI error may include:

- token
- `Authorization`
- `x-api-key`
- `Cookie`
- full request body

## Testing Plan

Unit tests:

- settings normalization still preserves provider profiles and strips sensitive headers.
- gateway secret update writes token to secret store and does not return token.
- gateway status reports token presence without token contents.
- health check maps every configured Claude-side model to the upstream model id.
- ProviderGatewayPanel renders missing/configured token states.
- ProviderGatewayPanel clears token input after save.
- settings navigation renders the new six-section IA.

Focused integration:

- start local gateway and verify `/v1/models`.
- with a test token resolver/fetch mock, verify health check display state.

Manual verification:

- update token through UI.
- run health check.
- confirm Claude Desktop config remains `local-proxy`.
- confirm support diagnostics and app logs contain no token.

## Rollout

Implement in two phases:

1. Main IPC + Provider Gateway UI.
2. Settings drawer reorganization into the new navigation structure.

This keeps the gateway management feature testable before broad UI movement.

## Open Decisions

- HTTPS local endpoint remains out of scope unless Claude Desktop rejects `http://127.0.0.1`.
- Model mappings remain read-only in the first UI pass. Editing mappings should be a follow-up after provider switching is productized.
