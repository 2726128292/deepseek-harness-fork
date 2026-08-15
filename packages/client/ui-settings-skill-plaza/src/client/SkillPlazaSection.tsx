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
import { zh as zhDict, type SkillPlazaLocaleKey } from './locales.ts'
import css from './SkillPlazaSection.module.css'

/** Plaza display language: English shows the original text; Chinese shows
 * translations when the index provides them (untranslated entries stay as-is). */
type PlazaLang = 'zh' | 'en'

const LANG_STORAGE_KEY = 'dsh-plaza-lang'

function readLang(): PlazaLang {
  if (typeof localStorage === 'undefined') return 'en'
  const stored = localStorage.getItem(LANG_STORAGE_KEY)
  return stored === 'zh' || stored === 'en' ? stored : 'en'
}

/** Deterministic daily pick from a pool, seeded by the calendar date. */
function dailyPick(entries: readonly PlazaSkillEntry[], count: number, seedDate: string): PlazaSkillEntry[] {
  const pool = entries.filter(entry => entry.source === 'curated')
  if (pool.length === 0) return []
  let hash = 0
  for (const char of seedDate) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const picked: PlazaSkillEntry[] = []
  const used = new Set<number>()
  while (picked.length < Math.min(count, pool.length)) {
    hash = (hash * 1103515245 + 12345) >>> 0
    const index = hash % pool.length
    if (used.has(index)) continue
    used.add(index)
    const entry = pool[index]
    if (entry !== undefined) picked.push(entry)
  }
  return picked
}

/** Registration-side business face used by the section. */
export interface SkillPlazaSectionInjected {
  /** Read the merged plaza catalog. */
  list: () => Promise<readonly PlazaSkillEntry[]>
  /** Live GitHub search for repositories matching the query. */
  search: (query: string) => Promise<readonly PlazaSkillEntry[]>
  /** Install one plaza skill into the user skill root. */
  install: (id: string) => Promise<void>
  /** Uninstall a user skill-root skill. */
  remove: (name: string) => Promise<void>
  /** Force a catalog refresh (re-fetch index, re-discover GitHub skills). */
  refresh: () => Promise<void>
}

/** Full component props assembled by the Settings tab renderer. */
export type SkillPlazaSectionProps =
  PropsRuntime<'settings.skill.tab'>
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

/** Display name in the active language: Chinese prefers the zh field, English the original. */
function localizedName(entry: PlazaSkillEntry, lang: PlazaLang): string {
  return lang === 'zh' ? entry.nameZh ?? entry.name : entry.name
}

/** Display description in the active language: Chinese prefers the zh field, English the original. */
function localizedDescription(entry: PlazaSkillEntry, lang: PlazaLang): string {
  return lang === 'zh' ? entry.descriptionZh ?? entry.description : entry.description
}

/** Render the Skill Plaza section. */
export function SkillPlazaSection({
  list, search, install, remove, refresh,
}: SkillPlazaSectionProps): ReactNode {
  const [lang, setLang] = useState<PlazaLang>(readLang)
  // UI copy stays Chinese; the language toggle only translates skill content.
  const t = (key: SkillPlazaLocaleKey): string => zhDict[key]
  const [fullscreen, setFullscreen] = useState(false)
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'curated' | 'discovered' | 'hot' | 'daily'>('all')
  const [uninstalledOnly, setUninstalledOnly] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [online, setOnline] = useState<{ query: string; entries: readonly PlazaSkillEntry[] } | undefined>()
  const [actionError, setActionError] = useState<string | undefined>()
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  const switchLang = (next: PlazaLang): void => {
    setLang(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, next)
  }

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
  const filteredEntries = useMemo(() => {
    if (state.status !== 'ready') return []
    const base = state.entries.filter(entry =>
      (filter === 'all' || filter === 'hot' || filter === 'daily' || entry.source === filter)
      && (!uninstalledOnly || !entry.installed)
      && matches(entry, normalizedQuery))
    if (filter === 'hot') {
      return base
        .filter(entry => entry.stars !== undefined)
        .sort((left, right) => (right.stars ?? 0) - (left.stars ?? 0))
        .slice(0, 30)
    }
    if (filter === 'daily') {
      return dailyPick(state.entries, 10, new Date().toISOString().slice(0, 10))
    }
    return base
  }, [filter, normalizedQuery, state, uninstalledOnly, lang])

  // Local-first search: when the query matches nothing in the local catalog
  // (and is long enough to be meaningful), auto-search GitHub for matching
  // projects after a short debounce; the result renders as an online block.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setOnline(undefined)
      return
    }
    if (filteredEntries.length > 0) return
    let current = true
    const timer = setTimeout(() => {
      setSearching(true)
      void search(trimmed).then(
        (entries) => { if (current) setOnline({ query: trimmed, entries }) },
        () => { if (current) setOnline({ query: trimmed, entries: [] }) },
      ).finally(() => { if (current) setSearching(false) })
    }, 400)
    return () => { current = false; clearTimeout(timer) }
  }, [filteredEntries.length, query, search])

  const handleGithubSearch = async (): Promise<void> => {
    const trimmed = query.trim()
    if (trimmed.length === 0) return
    setActionError(undefined)
    setSearching(true)
    try {
      const entries = await search(trimmed)
      setOnline({ query: trimmed, entries })
    } catch {
      setActionError(t('actionError'))
    } finally {
      setSearching(false)
    }
  }

  const handleInstall = async (entry: PlazaSkillEntry): Promise<void> => {
    setActionError(undefined)
    setNotice(undefined)
    setBusy(previous => new Set([...previous, entry.id]))
    try {
      await install(entry.id)
      setState(current => current.status === 'ready'
        ? { status: 'ready', entries: current.entries.map(item => item.id === entry.id ? { ...item, installed: true } : item) }
        : current)
      setNotice(t('installedNotice').replace('{name}', localizedName(entry, lang)))
    } catch {
      setActionError(`${t('installFailed')}: ${localizedName(entry, lang)}`)
    } finally {
      setBusy((previous) => {
        const next = new Set(previous)
        next.delete(entry.id)
        return next
      })
    }
  }

  const handleRemove = async (entry: PlazaSkillEntry): Promise<void> => {
    if (!globalThis.confirm(`${t('uninstallConfirm')}「${localizedName(entry, lang)}」？`)) return
    setActionError(undefined)
    setNotice(undefined)
    setBusy(previous => new Set([...previous, entry.id]))
    try {
      await remove(entry.name)
      setState(current => current.status === 'ready'
        ? { status: 'ready', entries: current.entries.map(item => item.id === entry.id ? { ...item, installed: false } : item) }
        : current)
    } catch {
      setActionError(`${t('installFailed')}: ${localizedName(entry, lang)}`)
    } finally {
      setBusy((previous) => {
        const next = new Set(previous)
        next.delete(entry.id)
        return next
      })
    }
  }

  const body = (
    <div className={css.section} aria-busy={state.status === 'loading' || refreshing}>
      <div className={css.sectionHeader}>
        <div>
          <h2 className={css.heading}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <button
          className={css.fullscreenButton}
          type="button"
          onClick={() => { setFullscreen(true) }}
        >
          {t('fullscreen')}
        </button>
      </div>
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
          {notice !== undefined ? <p className={css.notice} role="status">{notice}</p> : null}
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleGithubSearch()
                }}
              />
            </label>
            <button
              className={css.githubSearch}
              type="button"
              disabled={searching || query.trim().length === 0}
              onClick={() => { void handleGithubSearch() }}
            >
              {searching ? t('searching') : t('searchGithub')}
            </button>
            <button className={css.refresh} type="button" disabled={refreshing} onClick={() => { void handleRefresh() }}>
              {refreshing ? t('refreshing') : t('refresh')}
            </button>
            <div className={css.langSwitch} role="group" aria-label="Language">
              <button
                type="button"
                className={css.langButton}
                data-active={lang === 'zh' ? 'true' : undefined}
                onClick={() => { switchLang('zh') }}
              >
                中文
              </button>
              <button
                type="button"
                className={css.langButton}
                data-active={lang === 'en' ? 'true' : undefined}
                onClick={() => { switchLang('en') }}
              >
                EN
              </button>
            </div>
          </div>
          <div className={css.filterRow}>
            <div className={css.tabs} role="group" aria-label={t('catalog')}>
              {(['all', 'curated', 'discovered', 'hot', 'daily'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={css.tab}
                  data-active={filter === mode ? 'true' : undefined}
                  aria-pressed={filter === mode}
                  onClick={() => { setFilter(mode) }}
                >
                  {t(mode === 'all' ? 'allTab'
                    : mode === 'curated' ? 'curatedTab'
                      : mode === 'discovered' ? 'discoveredTab'
                        : mode === 'hot' ? 'hotTab' : 'dailyTab')}
                </button>
              ))}
            </div>
            <label className={css.uninstalledOnly}>
              <input
                type="checkbox"
                checked={uninstalledOnly}
                onChange={(event) => { setUninstalledOnly(event.currentTarget.checked) }}
              />
              {t('uninstalledOnly')}
            </label>
          </div>
          <div className={css.catalogHeading}>
            <h3>{t('catalog')}</h3>
            <span>{t('count').replace('{count}', String(filteredEntries.length))}</span>
          </div>
          {state.entries.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.entries.length > 0 && filteredEntries.length === 0 && online === undefined
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {online !== undefined ? (
            <div className={css.onlineBlock}>
              <div className={css.onlineHeading}>
                <h3>{t('onlineResults')}</h3>
                <span>{t('onlineQuery').replace('{query}', online.query)}</span>
              </div>
              {online.entries.length === 0 ? (
                <p className={css.status}>{t('noOnlineResults')}</p>
              ) : (
                renderCards(online.entries, lang, busy, t, handleInstall, handleRemove)
              )}
            </div>
          ) : null}
          {filteredEntries.length > 0
            ? renderCards(filteredEntries, lang, busy, t, handleInstall, handleRemove)
            : null}
        </div>
      ) : null}
    </div>
  )

  if (!fullscreen) return body

  return (
    <div className={css.fullscreenOverlay} role="dialog" aria-label={t('title')}>
      <div className={css.fullscreenHeader}>
        <h2>{t('title')}</h2>
        <button
          className={css.fullscreenButton}
          type="button"
          onClick={() => { setFullscreen(false) }}
        >
          {t('exitFullscreen')}
        </button>
      </div>
      <div className={css.fullscreenBody}>{body}</div>
    </div>
  )
}

/** Render one plaza card list; shared by the local catalog and GitHub online results. */
function renderCards(
  entries: readonly PlazaSkillEntry[],
  lang: PlazaLang,
  busy: ReadonlySet<string>,
  t: (key: SkillPlazaLocaleKey) => string,
  handleInstall: (entry: PlazaSkillEntry) => void,
  handleRemove: (entry: PlazaSkillEntry) => void,
): ReactNode {
  return (
    <ul className={css.cards}>
      {entries.map((entry) => {
        const pending = busy.has(entry.id)
        const name = localizedName(entry, lang)
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
                <p className={css.cardDescription}>{localizedDescription(entry, lang)}</p>
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
                disabled={pending}
                onClick={() => { void (entry.installed ? handleRemove(entry) : handleInstall(entry)) }}
              >
                {pending
                  ? (entry.installed ? t('uninstalling') : t('installing'))
                  : entry.installed ? t('uninstall') : t('install')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
