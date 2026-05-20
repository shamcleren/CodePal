# Provider Gateway Handoff - 2026-05-07

## Summary

CodePal now has a local Provider Gateway path for using third-party MiMo models from desktop AI clients while keeping the real provider token inside CodePal.

The current implementation is intentionally centered on MiMo as the first provider profile:

- local gateway default: `http://127.0.0.1:15721`
- upstream MiMo Anthropic-compatible base URL: `https://token-plan-cn.xiaomimimo.com/anthropic`
- real token source: CodePal local secret store first, `MIMO_GATEWAY_TOKEN` fallback
- client-facing auth: dummy local bearer value such as `local-proxy`

## Implemented Surfaces

### Claude Desktop

Claude Desktop can point at CodePal's local Anthropic-compatible gateway.

CodePal exposes Anthropic-style model names that pass Claude Desktop local validation:

- `anthropic/MiMo-V2.5-Pro`
- `anthropic/MiMo-V2.5`
- `anthropic/MiMo-V2-Pro`
- `anthropic/MiMo-V2-Omni`

CodePal rewrites those names to upstream MiMo IDs before forwarding:

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`

Supported endpoints:

- `GET /v1/models`
- `POST /v1/messages`
- `POST /v1/messages/count_tokens` pass-through when upstream supports it

Streaming `/v1/messages` responses are passed through as SSE without buffering.

### Codex Desktop

Codex Desktop can be configured as a Codex custom model provider pointing at CodePal:

```toml
[model_providers.codepal]
name = "CodePal Gateway"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
requires_openai_auth = false
http_headers = { Authorization = "Bearer local-proxy" }

[profiles.codepal-mimo]
model = "anthropic/MiMo-V2.5-Pro"
model_provider = "codepal"
```

Codex Desktop does not currently expose a reliable in-app model/provider picker for this path. CodePal therefore keeps the `codepal-mimo` profile available, and uses an explicit reversible switch action when the user wants Codex Desktop to use MiMo as the current default. That switch temporarily writes root-level `model` / `model_provider` to CodePal and saves the previous root defaults in `~/.codex/codepal-provider-gateway-state.json`.

CodePal implements `POST /v1/responses` as a Codex/OpenAI Responses-compatible adapter. It translates the request to upstream Anthropic-compatible `/v1/messages`, maps the model through the active provider profile, and converts non-streaming plus streaming responses back to Responses-style JSON/SSE.

Known limitation: this is a protocol bridge. Advanced Codex tool-call parity depends on what the upstream provider exposes through Anthropic-compatible messages and still needs real Codex session calibration.

## Settings UI

`Provider Gateway` is now a top-level settings section.

It shows:

- active provider/profile
- provider base URL
- token configured/missing state without revealing token content
- model mappings and health result per mapping
- Claude Desktop setup
- Codex Desktop setup

It supports:

- saving/replacing provider token in CodePal local secrets
- running health checks against every configured upstream model
- automatically adding/updating and activating a Claude Desktop `CodePal Gateway` config-library entry without deleting existing entries
- automatically adding/updating a Codex Desktop `codepal-mimo` provider profile
- explicitly switching Codex Desktop to CodePal Gateway by writing root-level `model` / `model_provider`, with restore state saved first
- copying manual setup values

Client auto-configuration is backed up before changing existing config files and is idempotent.

Claude Desktop does not merge Anthropic first-party Opus/Sonnet models into a third-party Gateway model list. When the active Claude Desktop provider is Gateway, the picker shows the gateway's exposed models only. CodePal settings therefore make the active/inactive state explicit:

- configured but inactive: show a switch-to-CodePal action
- active: show a disabled active state plus a restore action when a previous provider selection is saved
- every switch/restore action should tell the user to restart Claude Desktop

Codex Desktop profile configuration alone is not enough for one-click switching. Restore uses the saved state to put the previous Codex defaults back. Every switch/restore action should tell the user to restart Codex Desktop and start a new session.

CodePal main-process logging must never crash the gateway. The file logger catches stdout/stderr `EPIPE`, and the gateway logger resolves `console.*` dynamically so requests do not use stale console references captured before logging is installed.

## Security Boundary

- Do not put the MiMo token in `config/settings.template.yaml`.
- Do not put the MiMo token in Claude Desktop config.
- Do not put the MiMo token in Codex config.
- Logs should include method/path, client model, upstream model, status, duration, and stream mode.
- Logs must not include `Authorization`, `x-api-key`, cookies, token refs, or request bodies.

## Key Files

- `config/settings.template.yaml`
- `src/shared/appSettings.ts`
- `src/shared/providerGatewayTypes.ts`
- `src/main/gateway/claudeDesktopGateway.ts`
- `src/main/gateway/gatewaySecrets.ts`
- `src/main/gateway/providerGatewayStatus.ts`
- `src/main/gateway/providerGatewayClientSetup.ts`
- `src/renderer/components/ProviderGatewayPanel.tsx`
- `src/renderer/App.tsx`

## Validation

Focused validation used during implementation:

```bash
npm test -- src/main/gateway/claudeDesktopGateway.test.ts src/main/gateway/providerGatewayClientSetup.test.ts src/main/gateway/providerGatewayStatus.test.ts src/main/preload/index.test.ts src/renderer/components/ProviderGatewayPanel.test.tsx src/renderer/App.test.tsx
npm run build
npm run lint
```

Manual gateway smoke:

```bash
curl -sS http://127.0.0.1:15721/v1/models
curl -sS http://127.0.0.1:15721/v1/responses \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer local-proxy' \
  -d '{"model":"anthropic/MiMo-V2.5-Pro","input":"Say ok only","max_output_tokens":2}'
```

## Next Work

- Continue calibrating real Codex Desktop sessions against MiMo through `POST /v1/responses`, especially streaming and tool-call behavior.
- Decide whether Codex should use Responses or Chat wire API long-term once tool-call behavior is observed.
- Generalize provider profiles beyond MiMo only when a second provider is being added.
- Add HTTPS local endpoint support if a client refuses `http://127.0.0.1`.
