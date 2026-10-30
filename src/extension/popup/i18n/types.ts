/**
 * Shape of a locale's translations. French is the reference locale —
 * every locale file must export an object that conforms to this type.
 * TypeScript will fail compilation if a translation is missing.
 *
 * Keep keys grouped by UI section so the popup.ts code stays readable.
 */
export interface Translations {
  header: {
    title: string
    subtitle: string
  }
  status: {
    ready: string
    selecting: string
    deleting: string
    scrolling: string
    paused: string
    done: string
    error: string
    idle: string
    navigatingTrash: string
    emptyingTrash: string
    consentRequired: string
    /** A real run ended with nothing selected or moved; points at Report issue. */
    nothingMoved: string
  }
  stats: {
    /** Accessible label for the stats `<section>`. */
    sectionLabel: string
    deleted: string
    rate: string
    elapsed: string
    eta: string
  }
  settings: {
    sectionLabel: string
    maxCount: { label: string; hint: string }
    dryRun: { label: string; hint: string }
    emptyTrash: { label: string; hint: string }
    dateFilter: { label: string; hint: string; off: string; before: string; after: string; between: string; pro: string; report: string; reportSkipped: string }
    presets: { label: string; hint: string; pro: string; none: string; namePlaceholder: string; save: string; apply: string; rename: string; delete: string; viewHint: string }
    filter: { label: string; hint: string; all: string; screenshot: string; video: string; photo: string; animation: string; collage: string }
    license: { label: string; hint: string; placeholder: string; activate: string; getPro: string; active: string; malformed: string; wrongPlan: string; badSignature: string }
    language: { label: string; trigger: string }
  }
  /** Pro conversion copy: the dry-run teaser and its A/B variants. */
  pro: {
    teaser: {
      /** "This view has {list}." */
      counts: string
      /** "This view has {n} items." */
      total: string
      /** Separator between per-type counts. */
      sep: string
      dismiss: string
      ctaA: string
      ctaB: string
      linkA: string
      linkB: string
    }
    /** "{n} photo" / "{n} photos"; locales without plural forms repeat one form. */
    types: {
      photoOne: string; photoMany: string
      videoOne: string; videoMany: string
      screenshotOne: string; screenshotMany: string
      animationOne: string; animationMany: string
      collageOne: string; collageMany: string
    }
  }
  /** The one-time card after a successful real run. */
  postRun: {
    /** "Done: {count} photos moved to Trash. ..." */
    donePhotos: string
    doneDuplicates: string
    rate: string
    share: string
    dismiss: string
    copied: string
    /** "... {url}" */
    copyFailed: string
  }
  /** Pro review tools of the duplicate finder. */
  finder: {
    proTag: string
    keep: string
    keepAria: string
    ruleDefault: string
    ruleNewest: string
    ruleOldest: string
    /** "Auto-accept groups at {pct}%+ similarity" */
    autoAccept: string
    exportCsv: string
    proNote: string
    /** "{n} groups auto-accepted (show)" */
    autoShowOne: string
    autoShowMany: string
    autoHideOne: string
    autoHideMany: string
    /** "{n} need your review: ..." */
    reviewNote: string
    approveAll: string
    approveGroup: string
    approved: string
    appliedAll: string
    appliedPartial: string
    backDefault: string
  }
  actions: {
    start: string
    pause: string
    resume: string
    stop: string
    report: string
    copySummary: string
    exportCsv: string
    viewTrash: string
    findDuplicates: string
  }
  consent: {
    title: string
    trashNote: string
    permanentNote: string
    check: string
    confirm: string
    cancel: string
  }
  notes: {
    navigateFirst: string
  }
  scope: {
    /** "Action scope: {view}" */
    actingOn: string
    library: string
    albums: string
    album: string
    search: string
    trash: string
    photo: string
    memory: string
    share: string
    places: string
    collections: string
    /** "This view ({path})" */
    other: string
  }
}

/** Browser-language → locale-code mapping for first-run auto-detect. */
export type LocaleCode = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh'

/** A locale option shown in the language picker. */
export interface LocaleEntry {
  code: LocaleCode
  /** Native name of the language ("Français", "English", "日本語"…) */
  label: string
  translations: Translations
}
