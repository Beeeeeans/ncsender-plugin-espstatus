# ncSender WLED Status Light

An [ncSender](https://github.com/siganberg/ncSender) plugin that drives addressable LEDs on a [WLED](https://kno.wled.ge) device — one colour and animation effect per machine state, plus a live job progress bar.

No custom firmware, no YAML, no compilation. Just flash standard WLED.

## Features

- Per-state colour, brightness, effect, speed, and intensity (Idle, Run, Hold, Alarm, Homing, Tool Change, etc.)
- Full access to **180+ WLED effects** — effect dropdowns populated live from your device
- Live progress bar — LEDs fill proportionally to job completion using WLED's built-in **Percent effect**
- Secondary colour (col[1]) configurable per state — used as background by the progress bar and as accent by dual-colour effects
- Preview any state instantly on the LEDs from the settings dialog
- Everything configurable at runtime — no re-flash ever needed

## Quick Start

### 1. Flash WLED

Flash standard [WLED](https://install.wled.me) to your ESP32 or ESP8266. Configure a static IP in WLED's WiFi settings so the plugin can reliably reach it.

### 2. Install the plugin

Copy the plugin folder into ncSender's plugins directory:

| Platform | Path |
|---|---|
| Linux / macOS | `~/.config/ncSender/plugins/` |
| Windows | `%APPDATA%\ncSender\plugins\` |

Restart ncSender and enable the plugin in **Settings → Plugins**.

### 3. Configure

Open **WLED Status Light** from the ncSender tool menu:

1. Enter your WLED device's IP address
2. Click **Test & Load Effects** — this verifies the connection and fetches all 180+ effects from your device
3. Switch to **Machine States** and customise colours, effects, speed, and intensity per state
4. Click **Save**

## Default State → LED Mapping

| State | Primary Colour | Effect |
|---|---|---|
| Disconnected | Off | — |
| Idle | Green | Colortwinkles |
| Run | Blue fill / dark bg | Percent (progress bar) |
| Hold | Yellow | Breathe |
| Jog | Blue | Scan |
| Homing | Purple | Scan |
| Check Mode | Cyan | Solid |
| Door Open | Orange | Breathe |
| Sleep | Dim white | Solid |
| Alarm | Red | Blink |
| Tool Change | Yellow | Fire Flicker |

All mappings are fully configurable from the settings dialog.

## How the progress bar works

During a cut (Run state), the plugin sends the current job completion percentage to WLED every 500 ms (configurable). WLED's **Percent effect** (fx:98) fills LEDs proportionally:

- **Primary colour** (col[0]) = filled portion
- **Secondary colour** (col[1]) = unfilled background
- **Intensity** is set automatically from the job percentage — no manual control needed

## Requirements

- ncSender (any current version)
- Any ESP32 or ESP8266 running **WLED ≥ 0.12**
- Addressable LED strip (WS2812B, SK6812, APA102, etc.)

## License

MIT — see [LICENSE](LICENSE)
