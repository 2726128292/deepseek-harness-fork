# @deepseek-ai/dsh-skill-plaza

English | [中文](README.zh.md)

Skill Plaza: browse, search, and install popular skills from GitHub, surfaced in Settings.

This package owns the host half of the Settings → Skill Plaza surface. It merges two catalogs:

- **Curated** — a bilingual (zh/en) index of known-good popular skills. The authoritative copy lives on GitHub (`skill-plaza/plaza.json`, fetched and cached with a TTL); an embedded fallback keeps the plaza usable offline.
- **Discovered** — skills auto-discovered from GitHub: well-known skill repositories plus repositories found through the search API, enumerated via the git-trees endpoint and ranked by stars.

## Plugin

Provides `ctx.plaza`. No required injects — the install root is resolved from the config (`<dshHome>/skills` by default).

### Config

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME` or `~/.dsh` | DeepSeek Harness config root. |
| `skillRoot` | `<dshHome>/skills` | Install root for downloaded skills. |
| `indexUrl` | `https://raw.githubusercontent.com/2726128292/deepseek-harness-fork/master/skill-plaza/plaza.json` | Curated index URL (also `$DSH_SKILL_PLAZA_INDEX`). |
| `cacheTtlMs` | `3600000` | Catalog cache TTL before re-fetching. |
| `githubToken` | `$DSH_GITHUB_TOKEN` | Optional token to lift GitHub API rate limits. |

## Service

- `list()` — the merged catalog: curated entries first (bilingual), then auto-discovered skills ranked by repository stars; every entry carries its current `installed` flag.
- `install(id)` — download one skill's directory (SKILL.md plus resources) from its source repository into the skill root. The skill-filesystem watcher discovers it immediately; no restart needed.
- `refresh()` — clear TTL caches so the next read re-fetches the index and re-discovers GitHub skills ("real-time" refresh).

## Installation

Installation uses the GitHub git-trees API (per-repository, cached) to list the skill directory, then downloads each file from `raw.githubusercontent.com`. Directory conflicts are rejected when `SKILL.md` already exists in the target.

## Known Limitations and Deferred Work

- **Discovered descriptions are minimal** — auto-discovered entries show their source repository until installed; the skill manager surface then shows the real `SKILL.md` frontmatter.
- **Anonymous GitHub limits** — without a token, repository search and trees endpoints are rate-limited; the hourly TTL keeps the plaza usable, and `DSH_GITHUB_TOKEN` lifts the limits.
- **Name-keyed installs** — two discovered sources sharing a skill name keep the higher-starred one; installing a same-named skill already present in the skill root is rejected.
