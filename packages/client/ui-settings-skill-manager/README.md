# @deepseek-ai/dsh-client-ui-settings-skill-manager

English | [中文](README.zh.md)

Skill management section in Web Settings: browse every skill the host resolves, inspect its invocation surfaces and provenance, and toggle the persisted enable/disable override.

## Browser plugin

Requires `slots`, `locale`, and `connection`. Registers one `settings.section` navigation entry (`skills`, order 20) rendering the Skill management page.

### Injected face

- `list()` — the merged skill catalog (global registry layer plus every installed agent preset's standing scope layer) with current disabled flags, served by the host `skillManager.list` domain.
- `setEnabled(name, enabled)` — set or clear the persisted disable override through the host `skillManager.setEnabled` domain.

## Model Experience

The toggle talks to the host skill manager, which applies the override to the `ctx.skills` registry: a disabled skill disappears from the model-facing catalog, the `skill` loader tool, and user invocation immediately, and the section's switch always mirrors the registry state (optimistic update with rollback on failure).
