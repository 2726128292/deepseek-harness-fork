# @deepseek-ai/dsh-client-ui-settings-skill-plaza

English | [中文](README.zh.md)

Skill Plaza settings section: browse, search, and install popular GitHub skills with one click.

## Browser plugin

Requires `slots`, `locale`, and `connection`. Registers one `settings.section` navigation entry (`plaza`, order 25) rendering the Skill Plaza page.

### Injected face

- `list()` — the merged plaza catalog (curated bilingual index + auto-discovered GitHub skills), served by the host `plaza.list` domain.
- `install(id)` — download one skill into the user skill root through the host `plaza.install` domain; the filesystem watcher discovers it immediately.
- `refresh()` — force a catalog refresh through the host `plaza.refresh` domain.

## Model Experience

Installed skills appear in Skill Management immediately and behave like any local skill: the model catalog, the `skill` tool, and `/name` invocation pick them up without a restart. Skill display follows the interface language (Chinese names/descriptions from the index when available).
