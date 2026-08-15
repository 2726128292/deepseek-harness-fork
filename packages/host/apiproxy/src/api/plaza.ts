/**
 * plaza domain contract: the Settings → Skill Plaza surface.
 * `list` returns the merged curated + auto-discovered catalog with install
 * state; `install` downloads one skill into the user skill root; `refresh`
 * forces the next read to re-fetch the index and re-discover GitHub skills.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One plaza row the settings surface renders (wire projection of the host PlazaSkillEntry). */
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

/**
 * Plaza-domain unary methods (the map key plaza.* of RpcMethodMap).
 * Session-free like the skillManager domain: the host resolves the catalog
 * and the user skill root itself.
 */
export interface PlazaApi {
  /** Lists the merged plaza catalog with current install state. */
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ skills: readonly PlazaSkillEntry[] }>>
  /** Installs one plaza skill into the user skill root. */
  install(request: RpcRequest<{ id: string }>): Promise<RpcResponse<{ id: string; name: string }>>
  /** Forces a catalog refresh (re-fetch index, re-discover GitHub skills). */
  refresh(request: RpcRequest<{}>): Promise<RpcResponse<{}>>
}
