/**
 * WLED Status Light — ncSender plugin
 *
 * Watches machine state and drives a WLED device via JSON API.
 * Features:
 *   - Per-state RGB colour + brightness + animation effect (180+ WLED effects)
 *   - Live job progress bar using WLED's built-in Percent effect (fx:98)
 *   - Config dialog accessible from the tool menu
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Stable WLED effect IDs (consistent across all WLED versions ≥ 0.12)
const FX = { SOLID: 0, BLINK: 1, BREATHE: 2, SCAN: 10, FIRE_FLICKER: 43, COLORTWINKLES: 72, PERCENT: 98 }

// ── Default state map ──────────────────────────────────────────────────────────
// r/g/b   = primary colour (col[0])
// r2/g2/b2 = secondary colour (col[1]) — used as bg by Percent effect, accent by others
// fx      = WLED effect ID
// sx      = speed  (0–255)
// ix      = intensity (0–255); overridden by job progress % when key === 'Run'
const DEFAULT_STATE_MAP = {
  disconnected: { r:   0, g:   0, b:   0, r2: 0, g2: 0, b2: 0, brightness:   0, fx: FX.SOLID,         sx: 128, ix: 128 },
  Idle:         { r:   0, g: 200, b:   0, r2: 0, g2: 0, b2: 0, brightness: 180, fx: FX.COLORTWINKLES,  sx: 128, ix: 128 },
  Run:          { r:   0, g:  80, b: 255, r2: 5, g2: 5, b2: 5, brightness: 220, fx: FX.PERCENT,         sx: 128, ix:   0 },
  Hold:         { r: 255, g: 200, b:   0, r2: 0, g2: 0, b2: 0, brightness: 200, fx: FX.BREATHE,         sx: 100, ix: 128 },
  Jog:          { r:   0, g: 160, b: 255, r2: 0, g2: 0, b2: 0, brightness: 180, fx: FX.SCAN,            sx: 160, ix: 128 },
  Home:         { r: 160, g:   0, b: 255, r2: 0, g2: 0, b2: 0, brightness: 200, fx: FX.SCAN,            sx: 200, ix: 128 },
  Check:        { r:   0, g: 220, b: 220, r2: 0, g2: 0, b2: 0, brightness: 180, fx: FX.SOLID,           sx: 128, ix: 128 },
  Door:         { r: 255, g: 100, b:   0, r2: 0, g2: 0, b2: 0, brightness: 200, fx: FX.BREATHE,         sx: 160, ix: 128 },
  Sleep:        { r:  20, g:  20, b:  20, r2: 0, g2: 0, b2: 0, brightness:  40, fx: FX.SOLID,           sx: 128, ix: 128 },
  Alarm:        { r: 255, g:   0, b:   0, r2: 0, g2: 0, b2: 0, brightness: 255, fx: FX.BLINK,           sx: 230, ix: 128 },
  toolchange:   { r: 255, g: 255, b:   0, r2: 0, g2: 0, b2: 0, brightness: 200, fx: FX.FIRE_FLICKER,    sx: 128, ix: 200 },
}

const DEFAULT_SETTINGS = {
  espHost:          '192.168.1.100',
  transitionMs:     500,
  progressUpdateMs: 500,
  stateMap:         DEFAULT_STATE_MAP,
}

// ── Plugin entry point ─────────────────────────────────────────────────────────

export async function onLoad(ctx) {
  ctx.registerToolMenu('WLED Status Light', async () => {
    const stored      = ctx.getSettings()    || {}
    const appSettings = ctx.getAppSettings() || {}
    const port        = resolveServerPort(stored, appSettings)

    let html = readFileSync(join(__dirname, 'config.html'), 'utf-8')
    html = html.replace('__SERVER_PORT__', String(port))

    ctx.showDialog('WLED Status Light Settings', html, {
      closable: true,
      width:    '960px',
    })
  }, { icon: 'icon.svg' })

  // Runtime state
  let settings        = mergeSettings(ctx.getSettings())
  let lastKey         = null
  let lastProgressPct = -1
  let pollCount       = 0

  const RESEND_EVERY = 20  // every ~10 s

  // Shared state-change handler — called by event (with payload) and poll (without)
  function checkState(eventState) {
    const serverState = eventState ?? ctx.getServerState?.() ?? ctx.getMachineState?.() ?? null
    const key         = resolveStateKey(serverState)
    if (key === lastKey) return
    lastKey         = key
    lastProgressPct = -1
    settings        = mergeSettings(ctx.getSettings())
    ctx.log(`[WLED Status] State → ${key}`)
    sendState(settings, key).catch(err =>
      ctx.log(`[WLED Status] LED send failed: ${err.message}`)
    )
  }

  // Immediate detection — event passes new state as first argument
  ctx.registerEventHandler('server-state-updated', (eventState) => {
    ctx.log('[WLED Status] server-state-updated event fired')
    checkState(eventState)
  })

  // Poll — state detection fallback + progress updates during Run + periodic heartbeat
  setInterval(() => {
    pollCount++
    const serverState = ctx.getServerState?.() ?? ctx.getMachineState?.() ?? null

    // Always check for state change (fallback if event doesn't fire)
    checkState(serverState)

    // Update progress while cutting (only when Percent effect is active)
    if (lastKey === 'Run' && settings.stateMap.Run.fx === FX.PERCENT) {
      const pct = serverState?.jobLoaded?.progressPercent ?? 0
      if (pct !== lastProgressPct) {
        lastProgressPct = pct
        settings        = mergeSettings(ctx.getSettings())
        sendProgress(settings, pct).catch(err =>
          ctx.log(`[WLED Status] Progress update failed: ${err.message}`)
        )
      }
    }

    // Periodic heartbeat — recovers from dropped commands
    if (pollCount % RESEND_EVERY === 0) {
      settings = mergeSettings(ctx.getSettings())
      sendState(settings, lastKey).catch(() => {})
    }
  }, 500)

  ctx.registerEventHandler('onAfterJobEnd', () => {
    lastProgressPct = -1
    sendProgress(settings, 0).catch(() => {})
  })

  ctx.log(`[WLED Status] Loaded — targeting http://${settings.espHost}`)
}

export function onUnload() {}

// ── WLED API ───────────────────────────────────────────────────────────────────

async function sendState(settings, stateKey) {
  const s = settings.stateMap[stateKey] ?? settings.stateMap.Idle

  if (s.brightness === 0) {
    return wledPost(settings.espHost, { on: false })
  }

  return wledPost(settings.espHost, {
    on:  true,
    bri: s.brightness,
    seg: [{
      col: [[s.r, s.g, s.b], [s.r2 ?? 0, s.g2 ?? 0, s.b2 ?? 0]],
      fx:  s.fx,
      sx:  s.sx ?? 128,
      ix:  (stateKey === 'Run' && s.fx === FX.PERCENT) ? 0 : (s.ix ?? 128),
    }],
  })
}

async function sendProgress(settings, pct) {
  const s  = settings.stateMap.Run ?? settings.stateMap.Idle
  const ix = Math.round(Math.max(0, Math.min(100, pct)) * 2.55)

  return wledPost(settings.espHost, {
    seg: [{
      col: [[s.r, s.g, s.b], [s.r2 ?? 0, s.g2 ?? 0, s.b2 ?? 0]],
      fx:  FX.PERCENT,
      sx:  s.sx ?? 128,
      ix,
    }],
  })
}

async function wledPost(host, body, timeoutMs = 4000) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://${host}/json/state`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveStateKey(serverState) {
  const ms = serverState?.machineState ?? serverState
  if (!ms?.connected)     return 'disconnected'
  if (ms?.isToolChanging) return 'toolchange'
  const raw = ms?.status ?? 'Idle'
  return raw.includes(':') ? raw.split(':')[0] : raw
}

function resolveServerPort(stored, app) {
  return stored.serverPort || app?.server?.port || app?.port || 8090
}

function mergeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS, ...(saved ?? {}), stateMap: {} }
  for (const key of Object.keys(DEFAULT_STATE_MAP)) {
    out.stateMap[key] = { ...DEFAULT_STATE_MAP[key], ...(saved?.stateMap?.[key] ?? {}) }
  }
  return out
}
