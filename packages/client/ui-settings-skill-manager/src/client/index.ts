/**
 * Settings → Skills browser plugin: one nav section managing every skill the
 * host resolves. The section reads and toggles the host `skillManager` domain
 * through the connection API; disabling takes effect immediately on the model
 * catalog, the `skill` tool, and user invocation.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SkillManagerSection, type SkillManagerSectionInjected } from './SkillManagerSection.tsx'
import { en, zh, type SkillManagerLocaleKey } from './locales.ts'

export type { SkillManagerSectionInjected, SkillManagerSectionProps } from './SkillManagerSection.tsx'
export type { SkillManagerLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill management settings section copy. */
    'settings.skillManager': SkillManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillManager'

/** Services required by the Settings registration. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute the Skill management section to Settings navigation. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skill-manager: dictionaries')

  const t = ctx.locale.bind(NS)
  const api = (ctx.get('connection') as ConnectionHandle).api
  const injected = (): SkillManagerSectionInjected => ({
    list: async () => {
      const response = await api.skillManager.list({})
      if (!response.result.ok) {
        throw new Error(`skillManager.list failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
      return response.result.value.skills
    },
    setEnabled: async (name, enabled) => {
      const response = await api.skillManager.setEnabled({ name, enabled })
      if (!response.result.ok) {
        throw new Error(`skillManager.setEnabled failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillManagerSection))
}
