/**
 * Settings → Skills browser plugin: one nav section with two tabs — "My
 * Skills" (manage every skill the host resolves) and "Skill Plaza" (browse,
 * search, and install GitHub skills, contributed by ui-settings-skill-plaza).
 * The manager tab talks to the host `skillManager` domain; disabling takes
 * effect immediately on the model catalog, the `skill` tool, and user
 * invocation.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SkillManagerSection, type SkillManagerSectionInjected } from './SkillManagerSection.tsx'
import { SkillsSection, type SkillsSectionInjected, type SkillsTabEntry } from './SkillsSection.tsx'
import { en, zh, type SkillManagerLocaleKey } from './locales.ts'

export type { SkillManagerSectionInjected, SkillManagerSectionProps } from './SkillManagerSection.tsx'
export type { SkillsSectionInjected, SkillsSectionProps, SkillsTabEntry } from './SkillsSection.tsx'
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

/** Contribute the Skills section and its "My Skills" tab to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skill-manager: dictionaries')

  const t = ctx.locale.bind(NS)
  const api = (ctx.get('connection') as ConnectionHandle).api
  const managerInjected = (): SkillManagerSectionInjected => ({
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
    remove: async (name) => {
      const response = await api.skillManager.remove({ name })
      if (!response.result.ok) {
        throw new Error(`skillManager.remove failed: ${response.result.error.code}: ${response.result.error.message}`)
      }
    },
  })

  // The tab ledger projection: ordered, locale-aware entries of the
  // settings.skill.tab slot, re-projected when either ledger or locale moves.
  let tabsVersion = -1
  let tabsRevision = -1
  let tabs: readonly SkillsTabEntry[] = []
  const sectionInjected = (): SkillsSectionInjected => ({
    hooks: {
      tabs: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.skill.tab')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== tabsVersion || revision !== tabsRevision) {
            tabsVersion = version
            tabsRevision = revision
            tabs = ctx.slots.entries('settings.skill.tab')
              .map(entry => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: entry.options.id ?? '',
                order: entry.options.order ?? 0,
                label: resolveSlotLabel(entry.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return tabs
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.skill.tab', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
    },
  })

  // This package owns the one Skills navigation entry and the tab chrome;
  // the plaza plugin contributes its page without competing for nav rows.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: sectionInjected,
    children: { 'settings.skill.tab': { kind: 'list', scope: 'root' } },
  }, SkillsSection))

  // The "My Skills" page is one ordinary tab of the Skills section.
  ctx.slots.inject('settings.skill.tab', () => ctx.slots.register({
    name: 'settings.skill.tab',
    id: 'mine',
    order: 0,
    label: () => t('tabMine'),
    locale: NS,
    inject: managerInjected,
  }, SkillManagerSection))
}
