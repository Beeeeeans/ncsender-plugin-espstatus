/**
 * ESP Status Light — ncSender plugin
 *
 * Watches machine state and drives an ESP32 running ESPHome via REST API.
 * Features:
 *   - Per-state RGB colour + brightness + animation effect
 *   - Live job progress bar across the LED strip
 *   - Config dialog accessible from the tool menu
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Default state map ──────────────────────────────────────────────────────────
// Keys match grblHAL status strings (or special: 'disconnected', 'toolchange').
// Effect names must match those defined in cnc-status-light.yaml exactly.
const DEFAULT_STATE_MAP = {
  disconnected: { r: 0,   g: 0,   b: 0,   brightness: 0,   effect: '' },
  Idle:         { r: 0,   g: 200, b: 0,   brightness: 180, effect: '' },
  Run:          { r: 0,   g: 80,  b: 255, brightness: 220, effect: 'Progress Bar' },
  Hold:         { r: 255, g: 200, b: 0,   brightness: 200, effect: 'Pulse' },
  Jog:          { r: 0,   g: 160, b: 255, brightness: 180, effect: 'Scan' },
  Home:         { r: 160, g: 0,   b: 255, brightness: 200, effect: 'Scan' },
  Check:        { r: 0,   g: 220, b: 220, brightness: 180, effect: '' },
  Door:         { r: 255, g: 100, b: 0,   brightness: 200, effect: 'Pulse' },
  Sleep:        { r: 20,  g: 20,  b: 20,  brightness: 40,  effect: '' },
  Alarm:        { r: 255, g: 0,   b: 0,   brightness: 255, effect: 'Fast Pulse' },
  toolchange:   { r: 255, g: 255, b: 255, brightness: 200, effect: 'Flicker' },
}

const DEFAULT_SETTINGS = {
  espHost:          '192.168.1.100',
  lightEntityId:    'cnc_status',
  progressEntityId: 'cnc_progress',
  transitionMs:     300,
  progressUpdateMs: 500,
  progressInvert:   false,
  stateMap:         DEFAULT_STATE_MAP,
  progressColors: {
    fill: { r: 0, g: 80, b: 255 },
    bg:   { r: 5, g: 5,  b: 5 },
    head: { r: 255, g: 255, b: 255 },
  },
}

// ── Plugin entry point ─────────────────────────────────────────────────────────

export async function onLoad(ctx) {
  // Register the tool-menu entry that opens the settings dialog
  ctx.registerToolMenu('ESP Status Light', async () => {
    const stored     = ctx.getSettings() || {}
    const appSettings = ctx.getAppSettings() || {}
    const port = resolveServerPort(stored, appSettings)

    let html = readFileSync(join(__dirname, 'config.html'), 'utf-8')
    html = html.replace('__SERVER_PORT__', String(port))

    ctx.showDialog('ESP Status Light Settings', html, {
      closable: true,
      width: '760px',
    })
  }, { icon: 'icon.svg' })

  // Runtime state
  let settings        = mergeSettings(ctx.getSettings())
  let lastKey         = null
  let lastProgressPct = -1
  let pollCount       = 0

  // ── Poll machine state every 500 ms ─────────────────────────────────────────
  // ncSender's plugin event bus does not expose server-state-updated to plugins,
  // so we poll ctx.getServerState() instead.
  // Every 20 polls (~10 s) we resend the current LED state as a heartbeat so
  // that any dropped HTTP command self-corrects without waiting for a state change.
  const RESEND_EVERY = 20

  const pollInterval = setInterval(async () => {
    const serverState = ctx.getServerState?.() ?? ctx.getMachineState?.() ?? null
    const key = resolveStateKey(serverState)
    pollCount++

    if (key === lastKey) {
      // State unchanged — still update progress if a job is running
      if (key === 'Run') {
        const pct = serverState?.jobLoaded?.progressPercent ?? 0
        if (pct !== lastProgressPct) {
          lastProgressPct = pct
          settings = mergeSettings(ctx.getSettings())
          const led = settings.stateMap.Run ?? settings.stateMap.Idle
          if (led.effect === 'Progress Bar') {
            sendProgress(settings, pct).catch(err =>
              ctx.log(`[ESP Status Light] Progress update failed: ${err.message}`)
            )
          }
        }
      }
      // Periodic heartbeat resend — recovers from dropped HTTP commands
      if (pollCount % RESEND_EVERY === 0) {
        settings = mergeSettings(ctx.getSettings())
        const led = settings.stateMap[key] ?? settings.stateMap.Idle
        sendLED(settings, led, ctx).catch(() => {})
        sendProgressColors(settings).catch(() => {})
      }
      return
    }

    // State changed
    lastKey = key
    lastProgressPct = -1
    settings = mergeSettings(ctx.getSettings())
    const led = settings.stateMap[key] ?? settings.stateMap.Idle

    ctx.log(`[ESP Status Light] State → ${key}`)

    // Reset progress counter when leaving Run
    if (key !== 'Run') {
      sendProgress(settings, 0).catch(() => {})
    } else {
      // Entering Run — push latest progress colours to the ESP32
      sendProgressColors(settings).catch(() => {})
    }

    sendLED(settings, led, ctx).catch(err =>
      ctx.log(`[ESP Status Light] LED send failed: ${err.message}`)
    )
  }, 500)

  // ── Job-end: reset progress bar to zero ──────────────────────────────────────
  ctx.registerEventHandler('onAfterJobEnd', () => {
    lastProgressPct = -1
    sendProgress(settings, 0).catch(err =>
      ctx.log(`[ESP Status Light] Progress reset failed: ${err.message}`)
    )
  })

  ctx.log(`[ESP Status Light] Loaded — targeting http://${settings.espHost}`)

  // Send progress colours once on startup so the ESP32 has the latest values
  sendProgressColors(settings).catch(err =>
    ctx.log(`[ESP Status Light] Initial progress colour send failed: ${err.message}`)
  )
}

export function onUnload() {}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve a single state key from the full server state object.
 * Priority: disconnected → toolchange → grblHAL status string
 */
function resolveStateKey(serverState) {
  const ms = serverState?.machineState ?? serverState
  if (!ms?.connected)      return 'disconnected'
  if (ms?.isToolChanging)  return 'toolchange'
  const raw = ms?.status ?? 'Idle'
  // grblHAL can report "Hold:0" or "Alarm:1" — strip the sub-code
  return raw.includes(':') ? raw.split(':')[0] : raw
}

/** Send colour/effect command to the ESPHome light REST API */
async function sendLED(settings, led, ctx) {
  const { espHost, lightEntityId, transitionMs } = settings
  const base = `http://${espHost}/light/${lightEntityId}`

  if (led.brightness === 0) {
    await request(`${base}/turn_off`, 'POST')
    return
  }

  const p = new URLSearchParams({
    r:          led.r,
    g:          led.g,
    b:          led.b,
    brightness: led.brightness,
    transition: (transitionMs / 1000).toFixed(2),
  })
  // Always send effect — 'None' explicitly stops any running animation.
  // Omitting it would leave the previous effect (e.g. Pulse) still running.
  p.set('effect', led.effect || 'None')

  ctx.log(`[ESP Status Light] → ${base}/turn_on?${p}`)
  await request(`${base}/turn_on?${p}`, 'POST')
}

/** Push progress percentage (0–100) to the ESPHome number entity */
async function sendProgress(settings, pct) {
  const { espHost, progressEntityId } = settings
  const url = `http://${espHost}/number/${progressEntityId}/set?value=${pct.toFixed(1)}`
  await request(url, 'POST')
}

async function request(url, method, timeoutMs = 4000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

/** Push progress bar colours + invert state to the ESP32 */
async function sendProgressColors(settings) {
  const { espHost, progressColors, progressInvert } = settings
  const pc = progressColors ?? DEFAULT_SETTINGS.progressColors
  const invertAction = progressInvert ? 'turn_on' : 'turn_off'

  // For a colour that is pure black, turn the virtual light off rather than
  // sending turn_on with r=0&g=0&b=0.  The lambda treats an off virtual light
  // as black via the fallback, avoiding any ambiguity in ESPHome's handling of
  // all-zero RGB values (which can restore a stale white from flash).
  const setColor = (name, c) => c.r === 0 && c.g === 0 && c.b === 0
    ? request(`http://${espHost}/light/${name}/turn_off`, 'POST')
    : request(`http://${espHost}/light/${name}/turn_on?r=${c.r}&g=${c.g}&b=${c.b}&brightness=255`, 'POST')

  await Promise.allSettled([
    setColor('prog_fill', pc.fill),
    setColor('prog_bg',   pc.bg),
    setColor('prog_head', pc.head),
    request(`http://${espHost}/switch/prog_invert/${invertAction}`, 'POST'),
  ])
}

function resolveServerPort(stored, app) {
  return stored.serverPort
    || app?.server?.port
    || app?.port
    || 8090
}

function mergeSettings(saved) {
  return {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    progressInvert: saved?.progressInvert ?? false,
    stateMap: Object.assign({}, DEFAULT_STATE_MAP, saved?.stateMap ?? {}),
    progressColors: {
      fill: { ...DEFAULT_SETTINGS.progressColors.fill, ...(saved?.progressColors?.fill ?? {}) },
      bg:   { ...DEFAULT_SETTINGS.progressColors.bg,   ...(saved?.progressColors?.bg ?? {}) },
      head: { ...DEFAULT_SETTINGS.progressColors.head, ...(saved?.progressColors?.head ?? {}) },
    },
  }
}
