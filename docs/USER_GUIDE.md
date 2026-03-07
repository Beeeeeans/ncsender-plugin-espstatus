# ESP Status Light — User Guide

## Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Wiring](#wiring)
4. [Installing ESPHome](#installing-esphome)
5. [ESPHome Setup](#esphome-setup)
6. [Plugin Installation](#plugin-installation)
7. [Plugin Configuration](#plugin-configuration)
8. [Effects Reference](#effects-reference)
9. [Progress Bar](#progress-bar)
10. [Changing LED Strip Hardware](#changing-led-strip-hardware)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This plugin bridges ncSender (your CNC control software) and an ESP32 running ESPHome. When the machine state changes — Idle, cutting, hold, alarm, homing, tool change — the plugin sends an HTTP command to the ESP32 which immediately updates the LED strip colour and animation. During a job, a progress bar spreads across the strip proportionally to completion.

Communication is plain HTTP on port 80 — no MQTT broker, no Home Assistant, and no cloud connectivity required.

---

## Requirements

| Component | Notes |
|---|---|
| ncSender | Any current version |
| ESP32 | Any variant with WiFi (ESP32, ESP32-S3, ESP32-C3, ESP32-S2) |
| ESPHome | 2024.1 or newer |
| LED strip | Any NeoPixelBus-compatible addressable strip (WS2812B, SK6812, etc.) |

---

## Wiring

### WS2812B / SK6812 (3-wire, most common)

```
LED strip          ESP32
─────────────────────────────
5 V  (VCC)    →   5 V or external 5 V PSU *
GND           →   GND  (shared with ESP32 GND)
DIN (data in) →   GPIO16  (or whichever pin you set in data_pin)
```

> **Power note:** An ESP32's 5 V pin can safely drive around 10–15 LEDs at moderate brightness.
> For longer strips use a separate 5 V supply and connect its GND to the ESP32 GND.
> Each WS2812B LED draws up to 60 mA at full white — a 30-LED strip at max ≈ 1.8 A.

### APA102 / SK9822 (4-wire, SPI)

```
LED strip          ESP32
─────────────────────────────
5 V  (VCC)    →   5 V PSU
GND           →   GND
DAT / DI      →   GPIO16 (data_pin)
CLK / CI      →   GPIO18 (clock_pin — add to YAML)
```

See [Changing LED Strip Hardware](#changing-led-strip-hardware) for the matching YAML changes.

---

## Installing ESPHome

Choose the method that suits your setup. You only need ESPHome for flashing — after the first USB flash, all future updates are wireless (OTA).

---

### Linux

The recommended approach is `uv`, which manages its own Python version so system Python conflicts (e.g. Python 3.14 being too new) don't matter.

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/share/../bin/env   # or restart terminal

# Install ESPHome on Python 3.12
uv tool install esphome --python 3.12

# Verify
esphome version
```

**Serial port permissions:**

```bash
# Arch Linux
sudo usermod -a -G uucp $USER

# Ubuntu / Debian / Raspberry Pi OS
sudo usermod -a -G dialout $USER
```

Log out and back in, or run `newgrp uucp` / `newgrp dialout` to apply immediately.

---

### Windows

**Option A — Python + pip (simplest)**

1. Install Python 3.12 from [python.org](https://www.python.org/downloads/) — tick **"Add to PATH"** during install.
2. Open PowerShell or Command Prompt:

```powershell
pip install esphome
esphome version
```

**Option B — pipx (cleaner isolated install)**

```powershell
pip install pipx
pipx install esphome
esphome version
```

**Serial drivers:** Windows may need a driver for your board's USB chip. Check Device Manager after plugging in — if the COM port doesn't appear, install the appropriate driver:

- **CP210x** (Silicon Labs) — most WROOM / WROVER boards: [download](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
- **CH340 / CH341** — many cheap clones: [download](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
- **ESP32-S3 / C3** — these use native USB and usually don't need a driver on Windows 10/11.

When ESPHome asks which port to use, pick the COM port that appeared in Device Manager after plugging in (e.g. `COM3`).

**Option C — ESPHome Web Installer (no install at all)**

For a one-off first flash, visit [web.esphome.io](https://web.esphome.io) in Chrome or Edge. You can paste your YAML and flash directly from the browser. OTA updates can be done from the command line afterward.

---

### macOS

```bash
# Install Homebrew if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install uv and then ESPHome
brew install uv
uv tool install esphome --python 3.12

esphome version
```

---

### Home Assistant Add-on (no Python needed)

If you already run Home Assistant, the ESPHome add-on is the easiest route — browser-based, no command line required.

1. In Home Assistant: **Settings → Add-ons → Add-on store**
2. Search for **ESPHome** and install it, then start it
3. Open the **ESPHome Dashboard**
4. Click **+ New device**, name it `cnc-status-light`, and select your board type
5. Once created, click **Edit** on the device card
6. Replace the generated YAML with the full contents of `cnc-status-light.yaml` from this repo
7. Click the **Secrets** button to add your WiFi credentials and OTA password (matching `secrets.yaml.example`)
8. Click **Install → Plug into this computer** for the first flash, or **Wirelessly** if the device is already on the network

> The ESP32 and the machine running ncSender must be on the same local network.

---

### Docker (any platform)

```bash
# First flash via USB
# Find your port first: ls /dev/ttyACM* /dev/ttyUSB*   (Linux/macOS)
docker run --rm -v "${PWD}":/config \
  --device /dev/ttyACM0 \
  ghcr.io/esphome/esphome run cnc-status-light.yaml

# OTA update (no USB needed after first flash)
docker run --rm -v "${PWD}":/config \
  ghcr.io/esphome/esphome run cnc-status-light.yaml
```

On Windows with Docker Desktop, either use WSL2 (recommended) or pass the COM port using `--device //./COM3`.

---

## ESPHome Setup

### Step 1 — Create secrets.yaml

```bash
cd path/to/ncsender-plugin-espstatus/esphome/
cp secrets.yaml.example secrets.yaml
```

Edit `secrets.yaml` and fill in your WiFi credentials and an OTA password. The `api_encryption_key` line is commented out — you do not need it for this plugin.

### Step 2 — Edit cnc-status-light.yaml

Open `cnc-status-light.yaml` and update the substitutions at the top:

```yaml
substitutions:
  static_ip:   "192.168.1.100"   # Pick an IP outside your router's DHCP range
  gateway:     "192.168.1.1"     # Your router's IP
  data_pin:    GPIO16            # Data pin wired to LED strip DIN
  num_leds:    "30"              # Exact number of LEDs on your strip
  led_type:    GRB               # GRB for WS2812B | GRBW for SK6812
  led_variant: WS2812            # WS2812 | WS2812B | SK6812
```

Common board values:

| Module | board value |
|---|---|
| Generic ESP32 / WROOM / WROVER | `esp32dev` |
| ESP32-S3 DevKit | `esp32-s3-devkitc-1` |
| ESP32-C3 DevKit | `esp32-c3-devkitm-1` |
| LOLIN S2 Mini | `lolin_s2_mini` |
| NodeMCU-32S | `nodemcu-32s` |

### Step 3 — Flash

```bash
cd esphome/
esphome run cnc-status-light.yaml
```

Select your serial port when prompted. The first compile takes a few minutes. After that, all updates can be pushed over WiFi — no USB needed.

### Step 4 — Verify

Open `http://192.168.1.100` (your static IP) in a browser. You should see the ESPHome web interface listing the `cnc_status` light and `cnc_progress` number entity. If the page loads, the ESP32 is ready.

---

## Plugin Installation

Copy the entire `ncsender-plugin-espstatus/` directory into ncSender's plugins directory:

| Platform | Path |
|---|---|
| Linux | `~/.config/ncSender/plugins/` |
| macOS | `~/Library/Application Support/ncSender/plugins/` |
| Windows | `%APPDATA%\ncSender\plugins\` |

```
plugins/
└── ncsender-plugin-espstatus/
    ├── manifest.json
    ├── index.js
    ├── config.html
    ├── icon.svg
    └── ...
```

Restart ncSender, go to **Settings → Plugins**, find **ESP Status Light** and enable it.

---

## Plugin Configuration

Click **ESP Status Light** in the ncSender tool menu to open the settings dialog.

### Connection tab

| Field | Description |
|---|---|
| **ESP32 Host / IP** | The static IP from `cnc-status-light.yaml`. Hostnames (e.g. `cnc-status-light.local`) work if your network supports mDNS. |
| **Light Entity ID** | Matches the `name:` of the light in the YAML, lowercased. Default: `cnc_status`. |
| **Progress Entity ID** | Matches the `name:` of the number entity. Default: `cnc_progress`. |
| **Transition (ms)** | LED fade time between states. 0 = instant. |
| **Progress poll interval (ms)** | How often the plugin reads job progress. Lower = smoother, more requests. Default: 500 ms. |

Click **Test** to verify the ESP32 is reachable. A green dot confirms it.

### Machine States tab

| Column | Description |
|---|---|
| **Colour** | Click the swatch to open the colour picker. |
| **Brightness** | 0 = off, 255 = maximum. |
| **Effect** | Animation effect — see [Effects Reference](#effects-reference). |
| **Send** | Preview that state on the LEDs immediately without saving. |

Click **Save** to apply. The plugin picks up new settings within one poll cycle (500 ms).

### Progress Bar tab

Controls the poll timing. Progress bar colours are baked into the ESP32 firmware — see [Progress Bar](#progress-bar) to change them.

### Effects Reference tab

Built-in quick-reference for all available effects.

---

## Effects Reference

All effects must be defined in `cnc-status-light.yaml`. The bundled YAML includes every effect below. Names are case-sensitive.

### Works on any strip type

| Effect | Description | Best for |
|---|---|---|
| *(none / Solid)* | Steady colour, no animation | Idle, Check |
| `Pulse` | Gentle breathe — slow fade in/out (700 ms cycle) | Hold, Door, Tool Change |
| `Fast Pulse` | Rapid flash — conveys urgency (140 ms cycle) | Alarm |
| `Strobe` | Hard on/off: 60 ms on, 120 ms off | Alarm, Door |
| `Flicker` | Random candle-like intensity flicker | Tool Change |

### Addressable strips only (WS2812B, SK6812, etc.)

| Effect | Description | Best for |
|---|---|---|
| `Scan` | Bright segment bounces end to end | Homing, Jog |
| `Twinkle` | Random pixels sparkle and fade | Idle, Check |
| `Fireworks` | Sparks shoot from random positions and fade | Idle (festive) |
| `Color Wipe` | Colour band sweeps continuously across strip | Homing, Check |
| `Rainbow` | Full rainbow scrolls across all LEDs (ignores colour setting) | Decorative |
| `Progress Bar` | LEDs fill left-to-right with job completion % | Run (cutting) |

### Activating an effect

1. Open the tool menu → **ESP Status Light → Machine States** tab
2. Choose an effect from the **Effect** dropdown
3. Click **Send** to preview it live on the strip
4. Click **Save** to make it permanent

### Adding custom effects

Add any ESPHome effect to `cnc-status-light.yaml` under the `effects:` key with a unique `name:`, then re-flash. Type that name exactly into the effect field in the plugin UI — it will send whatever string you enter, even if it's not in the dropdown list.

---

## Progress Bar

When **Run** uses the **Progress Bar** effect, the LED strip becomes a live job indicator.

### How it works

1. Every poll cycle (default 500 ms) the plugin reads the current job completion percentage from ncSender.
2. It posts the value to the ESP32: `POST http://<ip>/number/cnc_progress/set?value=45.5`
3. The ESP32's lambda effect renders the bar in real time:
   - LEDs 0 to N−1 → fill colour (default: blue)
   - LED N (tip) → head colour (default: bright white)
   - Remaining LEDs → background (default: near-black)

Progress resets to 0 automatically when the job ends.

### Changing progress bar colours

Edit the substitution variables in `cnc-status-light.yaml` and re-flash:

```yaml
substitutions:
  prog_r:      "0"     # Fill colour (default: blue)
  prog_g:      "80"
  prog_b:      "255"

  prog_bg_r:   "5"     # Background / unfilled (default: near-black)
  prog_bg_g:   "5"
  prog_bg_b:   "5"

  prog_head_r: "255"   # Tip LED (default: bright white)
  prog_head_g: "255"
  prog_head_b: "255"
```

```bash
esphome run cnc-status-light.yaml
```

---

## Changing LED Strip Hardware

### Different LED count

Update `num_leds` in the substitutions and re-flash. The progress bar uses `it.size()` internally and adapts automatically.

### Different chipset

| Strip | led_type | led_variant |
|---|---|---|
| WS2812B | `GRB` | `WS2812` |
| SK6812 (RGBW) | `GRBW` | `SK6812` |
| WS2811 | `RGB` | `WS2811` |

### APA102 / SK9822 (SPI strips)

Replace the `light:` platform block in the YAML:

```yaml
light:
  - platform: fastled_spi
    chipset:   APA102
    data_pin:  ${data_pin}
    clock_pin: GPIO18
    num_leds:  ${num_leds}
    rgb_order: BGR
    name: "cnc_status"
    id:   cnc_status
    restore_mode: ALWAYS_OFF
    effects:
      # ... same effects block as the neopixelbus version ...
```

### Safe data pins

GPIO16, GPIO17, GPIO18, GPIO19, GPIO21, GPIO22, GPIO23 are generally safe. Avoid strapping pins (GPIO0, GPIO2, GPIO5, GPIO12, GPIO15) and UART pins (GPIO1, GPIO3).

---

## Troubleshooting

### LEDs don't light up at all

- Check `data_pin` matches your actual wiring.
- Confirm the strip has 5 V power.
- Try a short data wire and add a 300–500 Ω resistor in series with the data line if the first LED flickers.

### Plugin says "Cannot reach X.X.X.X"

- Ping the ESP32 from the ncSender machine: `ping 192.168.1.100`
- View ESP32 logs: `esphome logs cnc-status-light.yaml`
- Make sure `static_ip` doesn't clash with your router's DHCP range — set a reservation in your router's settings.

### LED doesn't change with machine state

- Restart ncSender after installing or updating the plugin.
- Check ncSender's log output for `[ESP Status Light]` lines confirming the plugin is polling.
- The **Disconnected** state is off (brightness 0) by default — connect your CNC controller to trigger the **Idle** colour.

### Progress bar doesn't move

- Confirm a job is loaded and actively running.
- Browse to `http://<esp32-ip>/number/cnc_progress` — the value should update while cutting.
- Check the **Progress Entity ID** in plugin settings matches the `name:` in your YAML exactly.

### "HTTP 404" from the ESP32

Entity IDs are the `name:` field from the YAML, lowercased, spaces replaced with underscores:
- `name: "cnc_status"` → entity ID `cnc_status`
- `name: "CNC Status"` → entity ID `cnc_status`

### Effects don't animate / wrong effect shown

- Effect names are case-sensitive and must match the YAML `name:` exactly.
- Re-flash after adding new effects to the YAML.

### OTA update fails

- Confirm `ota_password` in `secrets.yaml` matches what was flashed.
- Do one USB flash to set the password if you haven't already, then OTA works from then on.

### Home Assistant integration

The native ESPHome API is commented out by default — the ncSender plugin doesn't use it. To also integrate with Home Assistant:

1. Uncomment the `api:` block in `cnc-status-light.yaml`
2. Add `api_encryption_key` to `secrets.yaml` (generate with `esphome generate-api-key`)
3. Re-flash

---

*For issues or feature requests, open a GitHub issue on the plugin repository.*
