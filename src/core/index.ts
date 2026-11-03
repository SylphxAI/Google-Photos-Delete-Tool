export { type Config, DEFAULT_CONFIG } from './config'
export {
  SELECTOR_DEFS,
  queryOne,
  queryAll,
  queryAllUnion,
  queryScrollable,
  type SelectorDef,
  DELETE_KEYWORDS,
  CANCEL_KEYWORDS,
  CONTEXTUAL_REMOVE_KEYWORDS,
  EMPTY_TRASH_PHRASES,
  TRASH_EMPTY_SIGNALS,
  TOOLBAR_DELETE_CANDIDATES,
  EMPTY_TRASH_CANDIDATES,
  normalizeText,
  containsAnyKeyword,
  getButtonTextCandidates,
  scoreActionButton,
  findDeleteToolbarButton,
  findConfirmDialog,
  findConfirmButton,
  findEmptyTrashButton,
  isTrashEmpty,
} from './selectors'
export { PACK_VERSION, PACK, type SelectorPack, type SelectorDef as SelectorPackSelectorDef } from './selector-pack'
export {
  DeleteEngine,
  StopRequested,
  type Progress,
  type EngineOptions,
  type DateDryRunReport,
} from './delete-engine'
export {
  RunInProgressError,
  RUN_IN_PROGRESS_MESSAGE,
  isRunOccupied,
  waitUntilAbortable,
} from './run-occupancy'
export { sleep, waitUntil, formatElapsed, formatEta, describeButton } from './utils'
export { DeletionLog, type DeletionEntry } from './deletion-log'
export type { EngineDom, ClickTarget, ScrollTarget, PhotoTile } from './dom-adapter'
export { browserDom } from './browser-dom'
export type { RunStatus } from './status'
export { ACTIVE_STATUSES, TERMINAL_STATUSES } from './status'
export {
  diagnostics,
  type DiagnosticBlob,
  type SelectorMatch,
  type EngineSnapshot,
} from './diagnostics'
export {
  PHOTO_TYPES,
  classifyLabel,
  shouldSelectTile,
  tileMatchesFilter,
  describeFilter,
  labelTypeToken,
  parseLabelDay,
  inputDayKey,
  dayInRange,
  filterRequiresPro,
  buildFilterFromControls,
  type DateRange,
  type PhotoType,
  type PhotoFilter,
} from './photo-filter'
export {
  PRESETS_KEY,
  MAX_PRESETS,
  MAX_PRESET_NAME,
  sanitizePresets,
  createPresetManager,
  createLocalStoragePresetStore,
  presetViewHint,
  type CleanupPreset,
  type PresetControls,
  type PresetManager,
  type PresetStore,
} from './presets'
export {
  verifyLicense,
  verifyLicenseForEnvironment,
  importProPublicKey,
  encodeBase64Url,
  decodeBase64Url,
  PRO_PUBLIC_KEY_BASE64URL,
  PRO_PUBLIC_KEYS_BASE64URL,
  type ProLicensePayload,
  type LicenseResult,
} from './license'
export { LICENSE_ENVIRONMENT, type LicenseEnvironment } from './license-trust'
export {
  PENDING_EMPTY_TTL_MS,
  TRASH_PATH,
  evaluatePendingEmptyTrash,
  createLocalStorageBaton,
  type EmptyTrashBaton,
  type PendingEval,
} from './empty-trash-baton'

export {
  SUPPORTED_HOST,
  SUPPORTED_ORIGIN,
  SUPPORTED_MATCH_PATTERN,
  isSupportedPhotosUrl,
  identifyPhotosView,
  admitSurface,
  activateLocalSurface,
  describePhotosView,
  type PhotosView,
  type PhotosViewKind,
  type SurfaceAdmission,
} from './surface'

export {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  LOCAL_ACK_VALUE,
  EXTENSION_ADMISSION_ERROR,
  RUN_IN_PROGRESS_ERROR,
  admitDestructiveRun,
  shouldNavigateToEmptyTrash,
  admitConcurrentStart,
  readLocalAcknowledgement,
  writeLocalAcknowledgement,
  throwForDestructiveRefusal,
  ConsentRequiredError,
  PermanentActionRequiredError,
  type Acknowledgement,
  type DestructiveAdmission,
  type DestructiveRefuseReason,
  type OccupancyAdmission,
} from './consent'
