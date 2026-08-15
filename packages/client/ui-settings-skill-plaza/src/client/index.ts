/**
 * Settings → Skill Plaza browser plugin: one nav section browsing and
 * installing popular GitHub skills. The section talks to the host `plaza`
 * domain through the connection API; installed skills appear in Skill
 * Management immediately via the filesystem watcher.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SkillPlazaSection, type SkillPlazaSectionInjected } from './SkillPlazaSection.tsx'
import { en, zh, type SkillPlazaLocaleKey } from './locales.ts'

export type { SkillPlazaSectionInjected, SkillPlazaSectionProps } from './SkillPlazaSection.tsx'
export type { SkillPlazaLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skill plaza settings section copy. */
    'settings.skillPlaza': SkillPlazaLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skillPlaza'

/** Services required by the Settings registration. */
export const inject = ['slots', 'locale', 'connection']

/** Contribute the Skill Plaza section to Settings navigation. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skill-plaza: dictionaries')

  const t = ctx.locale.bind(NS)
  const api = (ctx.get('connection') as ConnectionHandle).api
  const injected = (): SkillPlazaSectionInjected => ({
    list: async () => {
      const response = await api.plaza.list({})
      if (!response.result.ok) {
        throw new Error(`plaza.list failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
      return response.result.value.skills
    },
    install: async (id) => {
      const response = await api.plaza.install({ id })
      if (!response.result.ok) {
        throw new Error(`plaza.install failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
    },
    refresh: async () => {
      const response = await api.plaza.refresh({})
      if (!response.result.ok) {
        throw new Error(`plaza.refresh failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'plaza',
    order: 25,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillPlazaSection))
}
