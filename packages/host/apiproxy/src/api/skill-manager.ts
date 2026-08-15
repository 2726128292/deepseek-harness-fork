/**
 * skillManager domain contract: the Settings → Skills management surface.
 * Read and write are both addressed host-side without a session: `list`
 * merges the global skill registry layer with every installed agent preset's
 * standing scope layer, and `setEnabled` flips the persisted host-level
 * override that every catalog and loader consults.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One merged skill row the settings surface renders and toggles (wire projection of the host SkillManagerEntry). */
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

/**
 * SkillManager-domain unary methods (the map key skillManager.* of
 * RpcMethodMap). All methods are session-free: the settings panel has no
 * current session by design, and the host resolves the merged catalog, the
 * persisted override list, and the user skill root itself.
 */
export interface SkillManagerApi {
  /** Lists the merged skill catalog with current enabled/disabled flags. */
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ skills: readonly SkillManagerEntry[] }>>
  /** Sets or clears the persisted disable override for one skill. */
  setEnabled(request: RpcRequest<{ name: string; enabled: boolean }>): Promise<RpcResponse<{}>>
  /** Uninstalls a user skill-root skill (bundled/project/preset skills are read-only). */
  remove(request: RpcRequest<{ name: string }>): Promise<RpcResponse<{}>>
}
