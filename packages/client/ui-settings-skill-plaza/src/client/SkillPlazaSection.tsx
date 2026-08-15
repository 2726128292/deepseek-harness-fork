/**
 * Settings → Skill Plaza section: browse the merged curated +
 * auto-discovered catalog of GitHub skills, search by zh/en/repo, and install
 * skills with one click. Installed skills appear in Skill Management
 * immediately (the filesystem watcher discovers them).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PlazaSkillEntry } from '@deepseek-ai/dsh-client-connection/client'
import { IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillPlazaSection.module.css'

/** Registration-side business face used by the section. */
export interface SkillPlazaSectionInjected {
  /** Read the merged plaza catalog. */
  list: () => Promise<readonly PlazaSkillEntry[]>
  /** Install one plaza skill into the user skill root. */
  install: (id: string) => Promise<void>
  /** Force a catalog refresh (re-fetch index, re-discover GitHub skills). */
  refresh: () => Promise<void>
}

/** Full component props assembled by the Settings slot renderer. */
export type SkillPlazaSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skillPlaza'>
  & InjectFace<SkillPlazaSectionInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: readonly PlazaSkillEntry[] }

/** Whether one plaza row matches the local query. */
function matches(entry: PlazaSkillEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.name, entry.nameZh, entry.description, entry.descriptionZh, entry.repo]
    .filter((value): value is string => value !== undefined)
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Read a string field from entry metadata safely. */
function displayName(entry: PlazaSkillEntry): string {
  return entry.nameZh ?? entry.name
}

function displayDescription(entry: PlazaSkillEntry): string {
  return entry.descriptionZh ?? entry.description
}

/** Render the Skill Plaza section. */
export function SkillPlazaSection({ t, list, install, refresh }: SkillPlazaSectionProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>()
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (entries) => { if (current) setState({ status: 'ready', entries }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const reload = (): void => {
    setActionError(undefined)
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const handleRefresh = async (): Promise<void> => {
    setActionError(undefined)
    setRefreshing(true)
    try {
      await refresh()
      reload()
    } catch {
      setActionError(t('actionError'))
    } finally {
      setRefreshing(false)
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.entries.filter(entry => matches(entry, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )

  const handleInstall = async (entry: PlazaSkillEntry): Promise<void> => {
    setActionError(undefined)
    setBusy(previous => new Set([...previous, entry.id]))
    try {
      await install(entry.id)
      setState(current => current.status === 'ready'
        ? { status: 'ready', entries: current.entries.map(item => item.id === entry.id ? { ...item, installed: true } : item) }
        : current)
    } catch {
      setActionError(`${t('installFailed')}: ${displayName(entry)}`)
    } finally {
      setBusy((previous) => {
        const next = new Set(previous)
        next.delete(entry.id)
        return next
      })
    }
  }

  return (
    <div className={css.section} aria-busy={state.status === 'loading' || refreshing}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {actionError !== undefined ? <p className={css.failure} role="alert">{actionError}</p> : null}
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={reload}>{t('retry')}</button>
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
            <button className={css.refresh} type="button" disabled={refreshing} onClick={() => { void handleRefresh() }}>
              {refreshing ? t('refreshing') : t('refresh')}
            </button>
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
                const pending = busy.has(entry.id)
                const name = displayName(entry)
                return (
                  <li className={css.card} key={entry.id} data-skill={entry.id}>
                    <div className={css.cardMain}>
                      <div className={css.cardInfo}>
                        <div className={css.cardTitleRow}>
                          <strong className={css.cardTitle}>{name}</strong>
                          <span className={css.sourceTag} data-source={entry.source}>
                            {entry.source === 'curated' ? t('curatedTag') : t('discoveredTag')}
                          </span>
                        </div>
                        <p className={css.cardDescription}>{displayDescription(entry)}</p>
                        <div className={css.cardMeta}>
                          <span>{t('fromRepo').replace('{repo}', entry.repo)}</span>
                          {entry.stars !== undefined ? (
                            <span>{t('stars').replace('{count}', String(entry.stars))}</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        className={css.install}
                        type="button"
                        data-installed={entry.installed ? 'true' : 'false'}
                        disabled={pending || entry.installed}
                        onClick={() => { void handleInstall(entry) }}
                      >
                        {pending ? t('installing') : entry.installed ? t('installed') : t('install')}
                      </button>
                    </div>
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
