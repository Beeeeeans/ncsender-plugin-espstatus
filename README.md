# ncSender ESP Status Light

An [ncSender](https://github.com/siganberg/ncSender) plugin that sends CNC machine state to an ESP32 running [ESPHome](https://esphome.io), driving addressable LEDs with colour and animation effects — including a live job **progress bar** across the strip.

## Features

- One colour + animation effect per machine state (Idle, Run, Hold, Alarm, Homing, Tool Change, etc.)
- Live job progress bar — LEDs fill proportionally to completion percentage during a cut
- 11 built-in effects: Solid, Pulse, Fast Pulse, Strobe, Flicker, Scan, Twinkle, Fireworks, Color Wipe, Rainbow, Progress Bar
- Configuration dialog inside ncSender with per-state colour pickers, brightness sliders, and effect dropdowns
- Preview any state instantly on the LED strip without saving
- Test connection button
- Works with WS2812B, SK6812, WS2811, APA102, and any NeoPixelBus-compatible strip

## Quick Start

### 1. Flash the ESP32

```bash
cd esphome/
cp secrets.yaml.example secrets.yaml
# Edit secrets.yaml — add your WiFi credentials
# Edit cnc-status-light.yaml — set static_ip, data_pin, num_leds, board, led_type
esphome run cnc-status-light.yaml
```

### 2. Install the plugin

Copy the entire `ncsender-plugin-espstatus/` folder into ncSender's plugins directory:

- **Linux / macOS:** `~/.config/ncSender/plugins/`
- **Windows:** `%APPDATA%\ncSender\plugins\`

Restart ncSender, then enable the plugin in **Settings → Plugins**.

### 3. Configure

Open the tool menu in ncSender and click **ESP Status Light**. Set:

- **ESP32 Host / IP** — the static IP you set in `cnc-status-light.yaml`
- **Light Entity ID** — `cnc_status` (default)
- **Progress Entity ID** — `cnc_progress` (default)

Click **Test** to verify the connection, then **Save**.

## Default State → LED Mapping

| State       | Colour | Effect       |
|-------------|--------|--------------|
| Disconnected | Off   | —            |
| Idle        | Green  | Solid        |
| Run         | Blue   | Progress Bar |
| Hold        | Yellow | Pulse        |
| Homing      | Purple | Scan         |
| Check Mode  | Cyan   | Solid        |
| Door Open   | Orange | Pulse        |
| Sleep       | Dim white | Solid     |
| Alarm       | Red    | Fast Pulse   |
| Tool Change | White  | Flicker      |

All mappings are fully configurable from the plugin settings dialog.

## Requirements

- ncSender
- ESP32 (any variant with WiFi)
- ESPHome ≥ 2024.1
- Addressable LED strip compatible with NeoPixelBus (WS2812B recommended)

## Full Documentation

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for:
- Detailed installation instructions
- Wiring guide
- All effects explained
- Progress bar configuration
- Troubleshooting

## License

MIT — see [LICENSE](LICENSE)
