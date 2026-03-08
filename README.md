# ncSender ESP Status Light

An [ncSender](https://github.com/siganberg/ncSender) plugin that drives addressable LEDs on an ESP32 running [ESPHome](https://esphome.io) — one colour and animation effect per machine state, plus a live job progress bar.

## Features

- Per-state RGB colour, brightness, and effect (Idle, Run, Hold, Alarm, Homing, Tool Change, etc.)
- Live progress bar — LEDs fill proportionally to job completion during a cut
- 11 built-in effects: Solid, Pulse, Fast Pulse, Strobe, Flicker, Scan, Twinkle, Fireworks, Color Wipe, Rainbow, Progress Bar
- Progress bar colours (fill, background, tip) configurable live — no re-flash needed
- Preview any state instantly on the LEDs from the settings dialog
- YAML generator tab builds your firmware config block ready to paste and flash

## What requires a re-flash vs what's live

| Setting | Live (no re-flash) | Requires re-flash |
|---|---|---|
| Per-state colour / brightness / effect | ✅ | |
| Progress bar colours | ✅ | |
| LED strip type / colour order | | ✅ |
| Data pin | | ✅ |
| LED count | | ✅ |

Hardware settings are compiled into the firmware. Use the **YAML Generator** tab in the plugin settings to build the correct config block, then re-flash once.

## Quick Start

### 1. Flash the ESP32

```bash
cd esphome/
cp secrets.yaml.example secrets.yaml   # add WiFi credentials + OTA password
esphome run cnc-status-light.yaml
```

The default config targets an ESP32-S3 DevKitC with its onboard RGB LED (1 LED, GPIO48). Edit the `substitutions:` block in `cnc-status-light.yaml` before flashing — or use the **YAML Generator** tab in the plugin to build the right block for your hardware.

### 2. Install the plugin

Copy the `ncsender-plugin-espstatus/` folder into ncSender's plugins directory:

| Platform | Path |
|---|---|
| Linux / macOS | `~/.config/ncSender/plugins/` |
| Windows | `%APPDATA%\ncSender\plugins\` |

Restart ncSender and enable the plugin in **Settings → Plugins**.

### 3. Configure

Open **ESP Status Light** from the ncSender tool menu. Set your ESP32's static IP and click **Test**, then **Save**.

## Default State → LED Mapping

| State | Colour | Effect |
|---|---|---|
| Disconnected | Off | — |
| Idle | Green | Solid |
| Run | Blue | Progress Bar |
| Hold | Yellow | Pulse |
| Homing | Purple | Scan |
| Check Mode | Cyan | Solid |
| Door Open | Orange | Pulse |
| Sleep | Dim white | Solid |
| Alarm | Red | Fast Pulse |
| Tool Change | White | Flicker |

All mappings are fully configurable from the plugin settings dialog.

## Requirements

- ncSender (any current version)
- ESP32 with WiFi (ESP32, ESP32-S3, ESP32-C3, ESP32-S2)
- ESPHome ≥ 2024.1
- Addressable LED strip compatible with NeoPixelBus (WS2812B recommended)

## Documentation

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for full wiring, ESPHome setup, effect descriptions, troubleshooting, and more.

## License

MIT — see [LICENSE](LICENSE)
