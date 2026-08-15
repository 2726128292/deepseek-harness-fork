/**
 * Skill Plaza: browse, search, and install popular skills from GitHub.
 *
 * This package owns the Settings → Skill Plaza surface's host half. It merges
 * two catalogs:
 *
 * - **Curated** — a bilingual (zh/en) index of known-good popular skills. The
 *   authoritative copy lives on GitHub (`skill-plaza/plaza.json`, fetched and
 *   cached with a TTL); an embedded fallback keeps the plaza usable offline.
 * - **Discovered** — skills auto-discovered from GitHub: well-known skill
 *   repositories plus repositories found through the search API, enumerated
 *   via the git-trees endpoint and ranked by stars. This is the "hundreds of
 *   skills, always fresh" layer.
 *
 * `install()` downloads one skill's directory (SKILL.md plus resources) into
 * the user skill root, where the skill-filesystem watcher picks it up
 * immediately — no restart needed.
 *
 * The service is the plugin: the loader mounts the default export as a class
 * plugin with `static Config`.
 *
 * @module @deepseek-ai/dsh-skill-plaza
 */

import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { CURATED_FALLBACK, type CuratedSkill } from './curated.ts'

/** One plaza entry rendered by the Settings surface. */
export interface PlazaSkillEntry {
  /** Stable unique key for this skill across curated/discovered layers. */
  readonly id: string
  /** Kebab-case skill name; also the install directory name. */
  readonly name: string
  /** Optional Chinese display name. */
  readonly nameZh?: string
  /** Routing description (English when the index has no zh field). */
  readonly description: string
  /** Optional Chinese description. */
  readonly descriptionZh?: string
  /** Source GitHub repository (`owner/name`). */
  readonly repo: string
  /** Repository-relative skill directory (contains SKILL.md). */
  readonly path: string
  /** Git ref (branch/tag) to fetch from. */
  readonly ref: string
  /** Source repository star count, when known. */
  readonly stars?: number
  /** Whether the entry comes from the curated index or auto-discovery. */
  readonly source: 'curated' | 'discovered'
  /** Whether this skill is already installed in the user skill root. */
  readonly installed: boolean
}

/** Skill plaza configuration. */
export interface Config {
  /** DeepSeek Harness config root. Defaults to `$DSH_HOME` or `~/.dsh`. */
  readonly dshHome?: string
  /** Install root. Defaults to `<dshHome>/skills`. */
  readonly skillRoot?: string
  /** Curated index URL. Defaults to the deepseek-harness-fork plaza.json. */
  readonly indexUrl?: string
  /** Catalog cache TTL. Defaults to one hour. */
  readonly cacheTtlMs?: number
  /** Optional GitHub token (also read from `$DSH_GITHUB_TOKEN`) to lift API limits. */
  readonly githubToken?: string
}

const DEFAULT_INDEX_URL = 'https://raw.githubusercontent.com/2726128292/deepseek-harness-fork/master/skill-plaza/plaza.json'
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000
const SEARCH_QUERIES = ['claude skills', 'agent skills', 'skill pack', 'agentic skills']
const SEED_REPOS = [
  { repo: 'anthropics/skills', ref: 'main' },
  { repo: 'obra/superpowers', ref: 'main' },
]

interface TreeBlob {
  readonly path: string
  readonly type: string
}

interface DiscoveredSkill {
  readonly id: string
  readonly name: string
  readonly repo: string
  readonly path: string
  readonly ref: string
  readonly stars?: number
  readonly description: string
}

/**
 * The Skill Plaza service. Registered as `ctx.plaza`; the api-proxy `plaza`
 * domain delegates its read/write to this instance.
 */
export class SkillPlazaService extends Service {
  static Config: Schema<Config> = z.object({
    dshHome: z.string(),
    skillRoot: z.string(),
    indexUrl: z.string(),
    cacheTtlMs: z.natural().min(1000),
    githubToken: z.string(),
  })

  private readonly skillRoot: string
  private readonly indexUrl: string
  private readonly cacheTtlMs: number
  private readonly token: string | undefined
  private curatedCache: { at: number; skills: CuratedSkill[] } | undefined
  private discoveredCache: { at: number; entries: DiscoveredSkill[] } | undefined
  private readonly treeCache = new Map<string, Promise<TreeBlob[]>>()
  private readonly starsCache = new Map<string, number | undefined>()
  private readonly installing = new Set<string>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'plaza')
    const dshHome = resolveDshHome(config.dshHome)
    this.skillRoot = resolve(config.skillRoot ?? join(dshHome, 'skills'))
    this.indexUrl = config.indexUrl ?? process.env.DSH_SKILL_PLAZA_INDEX ?? DEFAULT_INDEX_URL
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.token = config.githubToken ?? process.env.DSH_GITHUB_TOKEN
  }

  /**
   * The merged plaza catalog: curated first (bilingual), then auto-discovered
   * skills ranked by repository stars. `installed` reflects the current user
   * skill root, so the surface can render install state without a refresh.
   * @returns the sorted plaza entries.
   */
  async list(): Promise<PlazaSkillEntry[]> {
    const [curated, discovered] = await Promise.all([this.curated(), this.discovered()])
    const installed = await this.installedNames()
    const entries: PlazaSkillEntry[] = []
    const seen = new Set<string>()
    for (const skill of curated) {
      seen.add(skill.id)
      entries.push({ ...skill, source: 'curated', installed: installed.has(skill.name) })
    }
    for (const skill of discovered) {
      if (seen.has(skill.id)) continue
      seen.add(skill.id)
      entries.push({ ...skill, source: 'discovered', installed: installed.has(skill.name) })
    }
    return entries.sort((left, right) => {
      if (left.source !== right.source) return left.source === 'curated' ? -1 : 1
      return (right.stars ?? 0) - (left.stars ?? 0)
    })
  }

  /**
   * Install one plaza skill into the user skill root. Downloads every file of
   * the skill directory (SKILL.md plus resources) from its source repository;
   * the skill-filesystem watcher discovers it immediately.
   * @param id - the plaza entry id.
   * @returns the installed skill name.
   * @throws when the id is unknown, the skill is already installed, or the download fails.
   */
  async install(id: string): Promise<{ id: string; name: string }> {
    const all = await this.list()
    const entry = all.find(candidate => candidate.id === id)
    if (entry === undefined) {
      throw new Error(`skill-plaza: unknown skill "${id}"`)
    }
    if (this.installing.has(id)) {
      throw new Error(`skill-plaza: skill "${id}" is already being installed`)
    }
    if (!isSkillName(entry.name)) {
      throw new Error(`skill-plaza: invalid skill name "${entry.name}"`)
    }
    const target = join(this.skillRoot, entry.name)
    if (await pathExists(join(target, 'SKILL.md'))) {
      throw new Error(`skill-plaza: skill "${entry.name}" is already installed`)
    }
    this.installing.add(id)
    try {
      const tree = await this.tree(entry.repo, entry.ref)
      const prefix = `${entry.path.replace(/\/+$/, '')}/`
      const files = tree.filter(blob => blob.type === 'blob' && blob.path.startsWith(prefix))
      if (files.length === 0) {
        throw new Error(`skill-plaza: no files found for skill "${entry.name}"`)
      }
      await mkdir(target, { recursive: true })
      for (const file of files) {
        const relative = file.path.slice(prefix.length)
        const response = await fetch(`https://raw.githubusercontent.com/${entry.repo}/${entry.ref}/${file.path}`)
        if (!response.ok) {
          throw new Error(`skill-plaza: download failed (${response.status}) for ${file.path}`)
        }
        const out = join(target, relative)
        await mkdir(dirname(out), { recursive: true })
        await writeFile(out, await response.text(), 'utf8')
      }
      return { id, name: entry.name }
    } finally {
      this.installing.delete(id)
    }
  }

  /**
   * Force the next catalog read to refetch the curated index and rediscover
   * GitHub skills (TTL caches cleared).
   */
  async refresh(): Promise<void> {
    this.curatedCache = undefined
    this.discoveredCache = undefined
    this.treeCache.clear()
    this.starsCache.clear()
  }

  private async curated(): Promise<readonly CuratedSkill[]> {
    const cached = this.curatedCache
    if (cached !== undefined && Date.now() - cached.at < this.cacheTtlMs) return cached.skills
    try {
      const response = await fetch(this.indexUrl, { headers: { 'user-agent': 'dsh-skill-plaza' } })
      if (!response.ok) throw new Error(`index fetch failed (${response.status})`)
      const data = (await response.json()) as { skills?: unknown }
      const skills = Array.isArray(data.skills)
        ? data.skills.filter((value): value is CuratedSkill => validCurated(value))
        : []
      if (skills.length > 0) {
        this.curatedCache = { at: Date.now(), skills }
        return skills
      }
    } catch (error) {
      this.ctx.logger.warn(`skill-plaza: index fetch failed, using embedded fallback: ${errorMessage(error)}`)
    }
    return CURATED_FALLBACK
  }

  private async discovered(): Promise<readonly DiscoveredSkill[]> {
    const cached = this.discoveredCache
    if (cached !== undefined && Date.now() - cached.at < this.cacheTtlMs) return cached.entries
    try {
      const repos = new Map<string, string>()
      for (const seed of SEED_REPOS) repos.set(seed.repo, seed.ref)
      for (const query of SEARCH_QUERIES) {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`
        const data = (await this.githubJson(url)) as {
          items?: { full_name?: unknown; default_branch?: unknown }[]
        }
        for (const item of data.items ?? []) {
          if (typeof item.full_name === 'string' && typeof item.default_branch === 'string') {
            repos.set(item.full_name, item.default_branch)
          }
        }
      }
      const byName = new Map<string, DiscoveredSkill>()
      for (const [repo, ref] of repos) {
        try {
          const tree = await this.tree(repo, ref)
          const stars = await this.repoStars(repo)
          for (const blob of tree) {
            if (blob.type !== 'blob') continue
            const match = blob.path.match(/^(?:skills\/)?([^/]+)\/SKILL\.md$/)
            if (match === null) continue
            const name = match[1]
            if (name === undefined || !isSkillName(name)) continue
            const directory = blob.path.slice(0, -'SKILL.md'.length - 1)
            const existing = byName.get(name)
            if (existing !== undefined && (stars ?? 0) <= (existing.stars ?? 0)) continue
            byName.set(name, {
              id: `${repo}/${directory}`,
              name,
              repo,
              path: directory,
              ref,
              ...stars === undefined ? {} : { stars },
              description: `From ${repo}`,
            })
          }
        } catch (error) {
          this.ctx.logger.warn(`skill-plaza: scanning ${repo} failed: ${errorMessage(error)}`)
        }
      }
      const entries = [...byName.values()]
      this.discoveredCache = { at: Date.now(), entries }
      return entries
    } catch (error) {
      this.ctx.logger.warn(`skill-plaza: discovery failed: ${errorMessage(error)}`)
      return cached?.entries ?? []
    }
  }

  private async installedNames(): Promise<Set<string>> {
    const names = new Set<string>()
    let entries
    try {
      entries = await readdir(this.skillRoot, { withFileTypes: true })
    } catch {
      return names
    }
    for (const entry of entries) {
      if (entry.isDirectory() && await pathExists(join(this.skillRoot, entry.name, 'SKILL.md'))) {
        names.add(entry.name)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        names.add(entry.name.slice(0, -3))
      }
    }
    return names
  }

  private tree(repo: string, ref: string): Promise<TreeBlob[]> {
    const key = `${repo}@${ref}`
    let pending = this.treeCache.get(key)
    if (pending === undefined) {
      pending = this.fetchTree(repo, ref)
      this.treeCache.set(key, pending)
    }
    return pending
  }

  private async fetchTree(repo: string, ref: string): Promise<TreeBlob[]> {
    const data = (await this.githubJson(
      `https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`,
    )) as { tree?: unknown }
    if (!Array.isArray(data.tree)) return []
    const blobs: TreeBlob[] = []
    for (const value of data.tree) {
      if (typeof value !== 'object' || value === null) continue
      const { path, type } = value as { path?: unknown; type?: unknown }
      if (typeof path === 'string' && typeof type === 'string') blobs.push({ path, type })
    }
    return blobs
  }

  private async repoStars(repo: string): Promise<number | undefined> {
    const cached = this.starsCache.get(repo)
    if (cached !== undefined) return cached
    let stars: number | undefined
    try {
      const data = (await this.githubJson(`https://api.github.com/repos/${repo}`)) as {
        stargazers_count?: unknown
      }
      stars = typeof data.stargazers_count === 'number' ? data.stargazers_count : undefined
    } catch {
      stars = undefined
    }
    this.starsCache.set(repo, stars)
    return stars
  }

  private async githubJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'dsh-skill-plaza',
        ...this.token === undefined ? {} : { authorization: `Bearer ${this.token}` },
      },
    })
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status}): ${url}`)
    }
    return await response.json()
  }
}

function validCurated(value: unknown): value is CuratedSkill {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.repo === 'string'
    && typeof candidate.path === 'string'
    && typeof candidate.ref === 'string'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return String(error)
}

export default SkillPlazaService
