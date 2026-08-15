/**
 * Settings → Skills section: browse every skill the host resolves (global
 * registry layer plus each installed agent preset's standing scope layer),
 * inspect its invocation surfaces and provenance, and toggle the persisted
 * host-level enable/disable override. Disabling takes effect immediately on
 * the model catalog, the `skill` loader tool, and user invocation.
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import type { SkillManagerEntry } from '@deepseek-ai/dsh-client-connection/client'
import {
  IconChevronDownOutline14,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillManagerSection.module.css'

/** Registration-side business face used by the section. */
export interface SkillManagerSectionInjected {
  /** Read the merged skill catalog with current disabled flags. */
  list: () => Promise<readonly SkillManagerEntry[]>
  /** Set or clear the persisted disable override for one skill. */
  setEnabled: (name: string, enabled: boolean) => Promise<void>
  /** Uninstall a user skill-root skill. */
  remove: (name: string) => Promise<void>
}

/** Full component props assembled by the Settings tab renderer. */
export type SkillManagerSectionProps =
  PropsRuntime<'settings.skill.tab'>
  & PropsLocale<'settings.skillManager'>
  & InjectFace<SkillManagerSectionInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: readonly SkillManagerEntry[] }

/** Whether one skill row matches the local catalog query. */
function matches(entry: SkillManagerEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.name, entry.description, entry.provider, entry.source]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Read a string field from skill frontmatter metadata, tolerating missing or mistyped values. */
function localized(metadata: SkillManagerEntry['metadata'], key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Render the Skill management section. */
export function SkillManagerSection({ t, list, setEnabled, remove }: SkillManagerSectionProps): ReactNode {
  const detailIdBase = useId()
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [actionError, setActionError] = useState(false)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (entries) => { if (current) setState({ status: 'ready', entries }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const refresh = (): void => {
    setActionError(false)
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.entries.filter(entry => matches(entry, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )

  useEffect(() => {
    if (expanded !== null && !filteredEntries.some(entry => entry.name === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filteredEntries])

  const toggle = async (entry: SkillManagerEntry): Promise<void> => {
    const enable = entry.disabled
    setActionError(false)
    setBusy(previous => new Set([...previous, entry.name]))
    // Optimistic flip; roll back on failure so the switch always mirrors the host.
    setState(current => current.status === 'ready'
      ? { status: 'ready', entries: current.entries.map(item => item.name === entry.name ? { ...item, disabled: !item.disabled } : item) }
      : current)
    try {
      await setEnabled(entry.name, enable)
    } catch {
      setState(current => current.status === 'ready'
        ? { status: 'ready', entries: current.entries.map(item => item.name === entry.name ? { ...item, disabled: !item.disabled } : item) }
        : current)
      setActionError(true)
    } finally {
      setBusy((previous) => {
        const next = new Set(previous)
        next.delete(entry.name)
        return next
      })
    }
  }

  const handleRemove = async (entry: SkillManagerEntry): Promise<void> => {
    if (!globalThis.confirm(`${t('removeConfirm')}「${entry.name}」？`)) return
    setActionError(false)
    setBusy(previous => new Set([...previous, entry.name]))
    try {
      await remove(entry.name)
      setState(current => current.status === 'ready'
        ? { status: 'ready', entries: current.entries.filter(item => item.name !== entry.name) }
        : current)
    } catch {
      setActionError(true)
    } finally {
      setBusy((previous) => {
        const next = new Set(previous)
        next.delete(entry.name)
        return next
      })
    }
  }

  /** Whether the entry can be uninstalled from the user skill root. */
  function removable(entry: SkillManagerEntry): boolean {
    return entry.source === 'user-dsh' || entry.source === 'user-agents'
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {actionError ? <p className={css.failure} role="alert">{t('actionError')}</p> : null}
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <div className={css.toolbar}>
            <label className={css.search}>
              <IconSearchOutline16 aria-hidden="true" />
              <span className={css.visuallyHidden}>{t('search')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('search')}
                aria-label={t('search')}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
            </label>
            <button className={css.refresh} type="button" onClick={refresh}>{t('refresh')}</button>
          </div>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span>{t('count').replace('{count}', String(filteredEntries.length))}</span>
          </div>
          {state.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.entries.length > 0 && filteredEntries.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filteredEntries.length > 0 ? (
            <ul className={css.cards}>
              {filteredEntries.map((entry) => {
                const open = expanded === entry.name
                const pending = busy.has(entry.name)
                const detailId = `${detailIdBase}-details-${encodeURIComponent(entry.name)}`
                const nameZh = localized(entry.metadata, 'nameZh')
                const descriptionZh = localized(entry.metadata, 'descriptionZh')
                const displayName = nameZh ?? entry.name
                return (
                  <li
                    className={css.card}
                    key={entry.name}
                    data-skill={entry.name}
                    data-open={open ? 'true' : undefined}
                  >
                    <div className={css.cardMain}>
                      <button
                        className={css.cardContent}
                        type="button"
                        aria-expanded={open}
                        aria-controls={detailId}
                        onClick={() => { setExpanded(current => current === entry.name ? null : entry.name) }}
                      >
                        <strong className={css.cardTitle} title={entry.name}>{displayName}</strong>
                        <span className={css.cardTrailing}>
                          <span className={css.configTag} data-disabled={entry.disabled ? 'true' : 'false'}>
                            {entry.disabled ? t('disabled') : t('enabled')}
                          </span>
                          <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                        </span>
                      </button>
                      <button
                        className={css.switch}
                        type="button"
                        role="switch"
                        aria-checked={!entry.disabled}
                        aria-label={`${displayName}: ${entry.disabled ? t('enable') : t('disable')}`}
                        disabled={pending}
                        onClick={() => { void toggle(entry) }}
                      >
                        <span className={css.switchKnob} aria-hidden="true" />
                        <span className={css.switchText}>
                          {pending
                            ? (entry.disabled ? t('enabling') : t('disabling'))
                            : (entry.disabled ? t('enable') : t('disable'))}
                        </span>
                      </button>
                      {removable(entry) ? (
                        <button
                          className={css.remove}
                          type="button"
                          disabled={pending}
                          onClick={() => { void handleRemove(entry) }}
                        >
                          {t('remove')}
                        </button>
                      ) : null}
                    </div>
                    <p className={css.cardDescription}>{descriptionZh ?? entry.description}</p>
                    {open ? (
                      <div className={css.cardDetails} id={detailId}>
                        <div className={css.surfaceTags}>
                          <span className={css.surfaceTag} data-surface={entry.modelInvocable ? 'model' : 'user-only'}>
                            {entry.modelInvocable ? t('modelSurface') : t('onlyUser')}
                          </span>
                          <span className={css.surfaceTag} data-surface={entry.userInvocable ? 'user' : 'none'}>
                            {t('userSurface')}
                          </span>
                        </div>
                        <dl className={css.details}>
                          <div>
                            <dt>{t('source')}</dt>
                            <dd>{entry.source}</dd>
                          </div>
                          <div>
                            <dt>{t('provider')}</dt>
                            <dd>{entry.provider}</dd>
                          </div>
                          {entry.whenToUse !== undefined ? (
                            <div>
                              <dt>{t('whenToUse')}</dt>
                              <dd>{entry.whenToUse}</dd>
                            </div>
                          ) : null}
                          {descriptionZh !== undefined ? (
                            <div>
                              <dt>{t('original')}</dt>
                              <dd>{entry.description}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
