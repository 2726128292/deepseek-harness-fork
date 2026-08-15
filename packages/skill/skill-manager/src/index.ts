/**
 * Host-side skill manager: the enable/disable switch behind the Settings →
 * Skills surface.
 *
 * This package owns the single persisted override list. It keeps a JSON file
 * of disabled skill names under the DeepSeek Harness config root
 * (`<dshHome>/skill-manager.json`), replays it into the `ctx.skills` registry
 * on boot, and applies every change immediately. The registry enforces the
 * override at every catalog and load boundary, so disabling a skill removes
 * it from the model-facing catalog, the `skill` loader tool, and user
 * invocation in one step; re-enabling restores it the same way.
 *
 * The manager also serves the merged catalog for the settings surface:
 * the global registry layer plus every installed agent preset's standing
 * scope layer, so a person manages one list of what their sessions actually
 * see.
 *
 * The service class is the plugin: the loader mounts the default export as a
 * class plugin, validates `static Config`, and runs `[Service.init]` after
 * construction to replay persisted overrides.
 *
 * @module @deepseek-ai/dsh-skill-manager
 */

import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import { isSkillName, type SkillRegistry, type SkillSummary } from '@deepseek-ai/dsh-skill'

/** One merged skill row the settings surface renders and toggles. */
export interface SkillManagerEntry {
  /** Kebab-case skill name; also the toggle key. */
  readonly name: string
  /** Short routing description. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Whether the model-facing catalog and loader currently include it. */
  readonly modelInvocable: boolean
  /** Whether human-facing invocation currently accepts it. */
  readonly userInvocable: boolean
  /** Discovery source bucket (`user-dsh`, `project-agents`, `bundled`, …). */
  readonly source: string
  /** Provider that owns the skill body. */
  readonly provider: string
  /** Whether the host-level override currently hides this skill. */
  readonly disabled: boolean
  /** Parsed optional metadata object from skill frontmatter (may carry localized names/descriptions). */
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** Skill manager configuration. */
export interface Config {
  /** DeepSeek Harness config root. Defaults to `$DSH_HOME` or `~/.dsh`. */
  readonly dshHome?: string
  /** Override persistence file. Defaults to `<dshHome>/skill-manager.json`. */
  readonly file?: string
  /** User skill install root. Defaults to `<dshHome>/skills`. */
  readonly skillRoot?: string
}

/** Minimal structural view of the agent-presets roster the manager reads. */
interface AgentPresetsLike {
  list(): Promise<readonly { readonly id: string }[]>
  standingKeyFor(id?: string): Promise<ScopeKey>
}

/**
 * The skill manager service. Registered as `ctx.skillManager`; the api-proxy
 * `skillManager` domain delegates its read and write to this instance.
 */
export class SkillManagerService extends Service {
  static Config: Schema<Config> = z.object({
    dshHome: z.string(),
    file: z.string(),
    skillRoot: z.string(),
  })

  static inject = ['skills']

  private readonly file: string
  private readonly skillRoot: string
  private readonly disabled = new Set<string>()
  private loaded: Promise<void> | undefined
  private writeChain: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillManager')
    const dshHome = resolveDshHome(config.dshHome)
    this.file = resolve(config.file ?? join(dshHome, 'skill-manager.json'))
    this.skillRoot = resolve(config.skillRoot ?? join(dshHome, 'skills'))
  }

  /** Replay persisted overrides into the registry after construction. */
  protected async [Service.init](): Promise<void> {
    await this.load()
  }

  /**
   * The merged catalog for the settings surface: global layer first, then
   * every installed preset's standing scope layer (nearest layer wins a
   * duplicate name), sorted by name.
   * @returns the merged skill rows with current disabled flags.
   */
  async list(): Promise<SkillManagerEntry[]> {
    await this.loaded
    const registry = this.ctx.get('skills')
    if (registry === undefined) return []
    const merged = new Map<string, SkillManagerEntry>()
    const adopt = (summary: SkillSummary): void => {
      merged.set(summary.name, {
        name: summary.name,
        description: summary.description,
        ...summary.whenToUse === undefined ? {} : { whenToUse: summary.whenToUse },
        modelInvocable: summary.invocation.modelInvocable,
        userInvocable: summary.invocation.userInvocable,
        source: summary.source,
        provider: summary.provider,
        disabled: this.disabled.has(summary.name),
        ...summary.metadata !== undefined ? { metadata: summary.metadata } : {},
      })
    }
    for (const skill of (await registry.snapshot({ includeDisabled: true })).skills) adopt(skill)
    const presets = this.ctx.get('agentPresets') as AgentPresetsLike | undefined
    if (presets !== undefined) {
      try {
        for (const preset of await presets.list()) {
          const scope = await presets.standingKeyFor(preset.id)
          for (const skill of (await registry.snapshot({ scope, includeDisabled: true })).skills) adopt(skill)
        }
      } catch (error) {
        this.ctx.logger.warn(`skill-manager: preset layer listing failed: ${errorMessage(error)}`)
      }
    }
    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
  }

  /**
   * Set or clear the disable override for one skill, persist it, and apply
   * it to the registry immediately.
   * @param name - kebab-case skill name.
   * @param enabled - `false` disables, `true` re-enables.
   * @throws when the name is not a valid skill name.
   */
  async setEnabled(name: string, enabled: boolean): Promise<void> {
    await this.loaded
    if (!isSkillName(name)) {
      throw new Error(`skill-manager: invalid skill name "${name}"`)
    }
    const registry = this.ctx.get('skills') as SkillRegistry | undefined
    if (enabled) {
      this.disabled.delete(name)
      registry?.setSkillEnabled(name, true)
    } else {
      this.disabled.add(name)
      registry?.setSkillEnabled(name, false)
    }
    await this.persist()
  }

  /**
   * Uninstall a skill from the user skill root. Only skills living under the
   * user root (`<dshHome>/skills`) can be removed — bundled, project, and
   * preset skills are read-only here. The skill-filesystem watcher observes
   * the removal immediately, and any disable override for the name is
   * cleared so a later reinstall starts enabled.
   * @param name - kebab-case skill name.
   * @throws when the name is invalid or the skill is not installed in the user root.
   */
  async remove(name: string): Promise<void> {
    await this.loaded
    if (!isSkillName(name)) {
      throw new Error(`skill-manager: invalid skill name "${name}"`)
    }
    const target = join(this.skillRoot, name)
    if (!(await pathExists(join(target, 'SKILL.md')))) {
      throw new Error(`skill-manager: skill "${name}" is not installed in the user skill root`)
    }
    await rm(target, { recursive: true, force: true })
    this.disabled.delete(name)
    const registry = this.ctx.get('skills') as SkillRegistry | undefined
    registry?.setSkillEnabled(name, true)
    await this.persist()
  }

  /**
   * Read the persisted override list and apply it to the registry. Runs once
   * at boot through {@link SkillManagerService.init}; a missing or malformed
   * file is treated as an empty list (nothing disabled) and only logs a
   * warning.
   */
  async load(): Promise<void> {
    this.loaded ??= this.loadFromDisk()
    await this.loaded
  }

  private async loadFromDisk(): Promise<void> {
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch (error) {
      if (isAbsentError(error)) return
      this.ctx.logger.warn(`skill-manager: failed to read ${this.file}: ${errorMessage(error)}`)
      return
    }
    let parsed: { disabled?: unknown }
    try {
      parsed = JSON.parse(raw) as { disabled?: unknown }
    } catch (error) {
      this.ctx.logger.warn(`skill-manager: ignoring unparsable ${this.file}: ${errorMessage(error)}`)
      return
    }
    if (!Array.isArray(parsed.disabled)) return
    const registry = this.ctx.get('skills') as SkillRegistry | undefined
    for (const value of parsed.disabled) {
      if (typeof value !== 'string' || !isSkillName(value)) continue
      this.disabled.add(value)
      registry?.setSkillEnabled(value, false)
    }
  }

  /** Persist the current disabled list with an atomic temp-file rename. */
  private persist(): Promise<void> {
    const payload = `${JSON.stringify({ version: 1, disabled: [...this.disabled] }, null, 2)}\n`
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const temporary = `${this.file}.tmp`
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, this.file)
    })
    return this.writeChain
  }
}

function isAbsentError(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function errorMessage(error: unknown): string {
  return String(error)
}

export default SkillManagerService
