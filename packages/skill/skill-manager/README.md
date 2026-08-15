# @deepseek-ai/dsh-skill-manager

English | [中文](README.zh.md)

Host-side skill enable/disable manager for the DeepSeek Harness.

This package owns the single switch behind the Settings → Skills surface. It keeps a JSON list of disabled skill names under the DeepSeek Harness config root (`<dshHome>/skill-manager.json`), replays it into the `ctx.skills` registry on boot, and applies every change immediately. The registry itself enforces the override at every catalog and load boundary, so disabling a skill removes it from the model-facing catalog, the `skill` loader tool, and user invocation in one step; re-enabling restores it the same way.

## Plugin

Requires `ctx.skills` (`inject: ['skills']`).

### Config

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME` or `~/.dsh` | DeepSeek Harness config root resolved by [`@deepseek-ai/dsh-home-paths`](../../util/home-paths/README.md). |
| `file` | `<dshHome>/skill-manager.json` | Override persistence file. |

## Service

Provides `ctx.skillManager`:

- `list()` — the merged catalog for the settings surface: the global registry layer plus every installed agent preset's standing scope layer (nearest layer wins a duplicate name), sorted by name, each row carrying the current `disabled` flag alongside invocation and provenance.
- `setEnabled(name, enabled)` — update the override, persist it, and apply it to the registry immediately. A disabled name is hidden from every catalog snapshot and loads as `undefined`, so the model catalog, the `skill` tool, and user invocation all stop seeing it at once.

## Persistence

The disabled list is stored as `{ "version": 1, "disabled": ["name", ...] }` in `<dshHome>/skill-manager.json`, written atomically (temp file + rename). A missing file means nothing is disabled; a malformed file is ignored with a warning so a broken override list cannot hide every skill.

## Model Experience

Indirectly, through `dsh-skill` and `dsh-tool-skill`, which consult the registry: a disabled skill disappears from the durable session catalog and the `skill` loader tool without any per-skill prose, and the settings surface reports the same disabled flag.

## Known Limitations and Deferred Work

- **The override is keyed by skill name alone** — two providers contributing the same name share one switch, matching the registry's name-merged catalog.
- **Project skills are listed only through preset layers** — the merged catalog reads the standing scope of every installed preset; a project root with no live preset contributes no cwd to scan.
- **No external-file watching** — editing `skill-manager.json` by hand takes effect on the next process boot (or after the next `setEnabled` write).
