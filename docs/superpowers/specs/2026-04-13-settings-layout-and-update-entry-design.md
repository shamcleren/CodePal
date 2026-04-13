# Settings Layout And Update Entry Design

## Context

CodePal 1.0.2 is stable enough to shift the next 1.x increment from release plumbing to product clarity. Two user-visible gaps remain:

- Settings pages have uneven density. Some pages repeat explanatory copy and feel crowded; others are sparse enough to feel unfinished.
- Update state is only visible inside Settings > Maintenance, so users can miss available updates or update failures while using the main monitoring panel.

This design keeps Phase 1 focused on monitoring and status visibility. It does not introduce a settings home page, background auto-install, or a new monitoring information architecture.

## Goals

- Make every settings section feel like part of the same system.
- Reduce explanatory text in settings without hiding important status.
- Keep detailed paths, diagnostics, release notes, and repair instructions available through explicit detail areas.
- Surface update state in the main panel only when the state needs attention.
- Preserve the existing Maintenance update panel as the detailed update control surface.

## Non-Goals

- Do not add a settings overview dashboard.
- Do not add automatic background update installation.
- Do not change the core session/activity layout in the main panel.
- Do not add Phase 2 text input behavior.
- Do not redesign release note generation or GitHub release automation.

## Main Update Entry

The main panel gets an update status button in the existing top action area. The button is conditional:

- Hidden when update checking is idle, unsupported, or up to date.
- Shown when an update is available.
- Shown while an update is downloading.
- Shown when an update is downloaded and ready to install.
- Shown when update checking or downloading fails.

Suggested button labels:

- Available: `Update 1.0.3`
- Downloading: `Downloading 42%`
- Downloaded: `Install update`
- Error: `Update failed`

Click behavior:

- For `available`, `downloading`, and `error`, open Settings > Maintenance and focus the update panel.
- For `downloaded`, trigger the same install path as the Maintenance update panel, preserving any existing confirmation behavior.

The button should not permanently occupy main panel space. Its job is to make actionable update state visible, not to become a general "check updates" control.

## Settings Information Structure

Settings should use a consistent "status first, details on demand" structure.

Left navigation:

- Keep category labels.
- Remove long descriptions from visible nav rows.
- Add small status badges only where useful, such as update available or integration needs attention.

Section header:

- Keep one clear title.
- Keep one short status summary line.
- Remove duplicated explanatory copy that repeats the left navigation description.

Section body:

- Use compact cards for current state and primary actions.
- Keep copy short and task-oriented.
- Move low-frequency details into `Details`, `Advanced`, or equivalent collapsible areas.

This should apply consistently to Integrations, Display, Usage, Maintenance, and Support.

## Page-Specific Direction

### Integrations

Integrations should lead with operational status:

- Listener active/inactive.
- Connected agents.
- Agents needing repair.
- One primary repair/install action when relevant.

Detailed hook paths, wrapper commands, socket paths, and diagnostic explanations should move behind expandable detail controls. Healthy integrations should be represented as concise status cards rather than long explanatory blocks.

### Display

Display preferences should stay lightweight but not empty. Group controls into compact cards:

- Panel visibility and behavior.
- Agent visibility.
- Density and language.

Each card should have a short label and direct controls. Extra explanatory text should be removed unless it prevents user confusion.

### Usage

Usage settings should group providers consistently:

- Claude usage.
- CodeBuddy usage.
- Cursor dashboard.

Each provider should expose connection state, last refresh or availability, and one primary action. Detailed authentication or troubleshooting copy belongs behind detail areas.

### Maintenance

Maintenance remains the detailed update and local configuration area:

- Update panel first.
- Current app version and update source.
- Release notes when available.
- YAML configuration and history cleanup below the update area.

The update panel should share state and actions with the main update button, so both surfaces describe the same update phase.

### Support

Support should emphasize actions over explanation:

- Export diagnostics.
- Open logs or reveal relevant folders.
- Troubleshooting references.

Long diagnostic text should stay available but not dominate the default view.

## State And Data Flow

The existing update state should remain the source of truth. The renderer should derive the main update button visibility from the same update phase used by `UpdatePanel`.

Expected renderer flow:

1. App receives or requests update status from the main process.
2. Shared update state is available to both the Maintenance update panel and the main panel action area.
3. The main panel renders no update button for idle/up-to-date states.
4. The main panel renders one compact update button for available/downloading/downloaded/error states.
5. Button actions dispatch through existing update handlers or navigate to Settings > Maintenance.

Settings layout changes should stay in renderer components and styles. Main process update behavior should not change unless the existing renderer contract cannot support the new button.

## Error Handling

- Update errors should show a compact `Update failed` state in the main panel.
- The detailed error message should remain in Maintenance.
- If update state is unknown during startup, do not show a main panel update button until a meaningful state is available.
- If update support is unavailable for the current environment, keep that detail inside Maintenance.

## Testing

Add or update focused renderer tests:

- Main update button is hidden when update state is idle/up to date/unsupported.
- Main update button appears for available, downloading, downloaded, and error states.
- Clicking available/error states opens or selects Settings > Maintenance.
- Downloaded state uses the same install handler as the Maintenance update panel.
- Settings navigation no longer exposes long repeated descriptions.
- Representative settings sections render compact status-first content.

Keep existing update service tests for release note parsing and updater metadata behavior. This design does not require new GitHub Actions tests.

## Acceptance Criteria

- Main panel clearly exposes actionable update states without showing a permanent update button.
- Settings pages have visibly more balanced density across all sections.
- Explanatory copy is reduced, not merely moved around.
- Advanced diagnostics and paths remain accessible.
- Existing update installation and release note behavior continue to work.
- Existing lint, unit tests, build, and E2E tests pass after implementation.
