export const SETTINGS_KEY = 'forge_settings'

// Retired: the xAI key now comes only from VITE_XAI_API_KEY.
const LEGACY_XAI_KEY_STORAGE = 'forge_xai_key'

export const MATERIALS = ['Aluminum', 'Steel', 'Wood', 'Plastic', 'Carbon Fiber']
export const FINISHES = ['Raw', 'Anodized', 'Powder Coated', 'Painted']
export const EXPORT_FORMATS = ['STL', 'DXF', 'STEP']

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  units: 'metric',
  material: 'Aluminum',
  loadCapacity: 100,
  finish: 'Raw',
  exportFormat: 'STL',
}

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    // Merge over defaults so a settings blob written by an older build still works.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch (error) {
    console.log('[settings] could not read localStorage:', error.message)
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.log('[settings] could not write localStorage:', error.message)
  }
}

// Clears the key older builds let users type into Settings, so it does not
// linger in localStorage now that nothing reads it.
export function purgeLegacyXaiKey() {
  try {
    window.localStorage.removeItem(LEGACY_XAI_KEY_STORAGE)
  } catch {
    /* private mode or blocked storage - nothing to clean up */
  }
}
