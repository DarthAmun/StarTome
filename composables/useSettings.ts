import { lsKey } from '~/utils/appNamespace'

export type ThemeId = 'dark' | 'light' | 'void' | 'parchment' | 'forest'

export interface ThemeInfo {
  id: ThemeId
  name: string
  bg: string
  surface: string
  dark: boolean
}

export const THEMES: ThemeInfo[] = [
  { id: 'dark',      name: 'Dark',      bg: '#16162a', surface: '#2a2a42', dark: true  },
  { id: 'void',      name: 'Void',      bg: '#080808', surface: '#141414', dark: true  },
  { id: 'forest',    name: 'Forest',    bg: '#0d1f14', surface: '#162a1c', dark: true  },
  { id: 'light',     name: 'Light',     bg: '#f0eff5', surface: '#ffffff', dark: false },
  { id: 'parchment', name: 'Parchment', bg: '#ede0c8', surface: '#f7f0e0', dark: false },
]

export interface AccentPreset {
  id: string
  name: string
  color: string
  main: string; light: string; dark: string; bg: string; bhi: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'arcane',  name: 'Arcane',  color: '#7c3aed', main: 'oklch(58% 0.24 295)', light: 'oklch(72% 0.2 295)',  dark: 'oklch(44% 0.2 295)',  bg: 'oklch(58% 0.24 295 / 0.1)',  bhi: 'oklch(58% 0.24 295 / 0.18)' },
  { id: 'crimson', name: 'Crimson', color: '#dc2626', main: 'oklch(54% 0.24 22)',  light: 'oklch(68% 0.2 22)',   dark: 'oklch(40% 0.2 22)',   bg: 'oklch(54% 0.24 22 / 0.1)',   bhi: 'oklch(54% 0.24 22 / 0.18)' },
  { id: 'gold',    name: 'Gold',    color: '#d97706', main: 'oklch(68% 0.18 75)',  light: 'oklch(80% 0.15 75)',  dark: 'oklch(54% 0.16 75)',  bg: 'oklch(68% 0.18 75 / 0.1)',  bhi: 'oklch(68% 0.18 75 / 0.18)' },
  { id: 'forest',  name: 'Forest',  color: '#16a34a', main: 'oklch(58% 0.18 158)', light: 'oklch(72% 0.15 158)', dark: 'oklch(44% 0.16 158)', bg: 'oklch(58% 0.18 158 / 0.1)', bhi: 'oklch(58% 0.18 158 / 0.18)' },
  { id: 'ocean',   name: 'Ocean',   color: '#2563eb', main: 'oklch(55% 0.22 235)', light: 'oklch(69% 0.18 235)', dark: 'oklch(41% 0.2 235)',  bg: 'oklch(55% 0.22 235 / 0.1)', bhi: 'oklch(55% 0.22 235 / 0.18)' },
  { id: 'rose',    name: 'Rose',    color: '#e11d48', main: 'oklch(56% 0.24 10)',  light: 'oklch(70% 0.2 10)',   dark: 'oklch(42% 0.22 10)',  bg: 'oklch(56% 0.24 10 / 0.1)',  bhi: 'oklch(56% 0.24 10 / 0.18)' },
  { id: 'teal',    name: 'Teal',    color: '#0d9488', main: 'oklch(58% 0.16 195)', light: 'oklch(72% 0.13 195)', dark: 'oklch(44% 0.14 195)', bg: 'oklch(58% 0.16 195 / 0.1)', bhi: 'oklch(58% 0.16 195 / 0.18)' },
  { id: 'ember',   name: 'Ember',   color: '#ea580c', main: 'oklch(62% 0.2 45)',   light: 'oklch(76% 0.17 45)',  dark: 'oklch(48% 0.18 45)',  bg: 'oklch(62% 0.2 45 / 0.1)',   bhi: 'oklch(62% 0.2 45 / 0.18)' },
]

export interface AppSettings {
  theme: ThemeId
  accentPreset: string
  accentCustom: string
  fontSize: 'compact' | 'normal' | 'large'
  uiFont: 'dm-sans' | 'im-fell' | 'system'
  pageAnimations: boolean
  sparkEffects: boolean
  inkWrite: boolean
  paperTexture: boolean
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  accentPreset: 'arcane',
  accentCustom: '#7c3aed',
  fontSize: 'normal',
  uiFont: 'dm-sans',
  pageAnimations: true,
  sparkEffects: true,
  inkWrite: false,
  paperTexture: false,
}

const settings = ref<AppSettings>({ ...DEFAULTS })

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function applyAccent(root: HTMLElement) {
  const preset = ACCENT_PRESETS.find(p => p.id === settings.value.accentPreset)
  if (preset) {
    root.style.setProperty('--accent', preset.main)
    root.style.setProperty('--accent-l', preset.light)
    root.style.setProperty('--accent-d', preset.dark)
    root.style.setProperty('--accent-bg', preset.bg)
    root.style.setProperty('--accent-bhi', preset.bhi)
  } else if (settings.value.accentPreset === 'custom' && settings.value.accentCustom) {
    const [h, s, l] = hexToHsl(settings.value.accentCustom)
    root.style.setProperty('--accent', `hsl(${h} ${s}% ${l}%)`)
    root.style.setProperty('--accent-l', `hsl(${h} ${s}% ${Math.min(l + 15, 90)}%)`)
    root.style.setProperty('--accent-d', `hsl(${h} ${s}% ${Math.max(l - 15, 10)}%)`)
    root.style.setProperty('--accent-bg', `hsl(${h} ${s}% ${l}% / 0.1)`)
    root.style.setProperty('--accent-bhi', `hsl(${h} ${s}% ${l}% / 0.18)`)
  }
}

function applySettings() {
  if (!import.meta.client) return
  const root = document.documentElement
  root.setAttribute('data-theme', settings.value.theme)
  root.setAttribute('data-font-size', settings.value.fontSize ?? 'normal')
  root.setAttribute('data-ui-font', settings.value.uiFont ?? 'dm-sans')
  root.classList.toggle('no-animations', !settings.value.pageAnimations)
  applyAccent(root)
}

if (import.meta.client) {
  try {
    const stored = localStorage.getItem(lsKey('settings'))
    if (stored) Object.assign(settings.value, JSON.parse(stored))
  } catch {}
  applySettings()
}

export function useSettings() {
  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    settings.value[key] = value
    if (import.meta.client) {
      localStorage.setItem(lsKey('settings'), JSON.stringify(settings.value))
      applySettings()
    }
  }
  return { settings, update }
}
