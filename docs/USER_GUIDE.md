# ESP Status Light — User Guide

## Contents

1. [Overview](#overview)
2. [What requires a re-flash vs what's live](#what-requires-a-re-flash-vs-whats-live)
3. [Requirements](#requirements)
4. [Wiring](#wiring)
5. [Installing ESPHome](#installing-esphome)
6. [ESPHome Setup](#esphome-setup)
7. [Plugin Installation](#plugin-installation)
8. [Plugin Configuration](#plugin-configuration)
9. [Effects Reference](#effects-reference)
10. [Progress Bar](#progress-bar)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This plugin bridges ncSender and an ESP32 running ESPHome. When the machine state changes — Idle, cutting, hold, alarm, homing, tool change — the plugin sends an HTTP command to the ESP32 which immediately updates the LED strip colour and animation. During a job, a progress bar spreads across the strip proportionally to completion.

Communication is plain HTTP on port 80 — no MQTT, no Home Assistant, no cloud.

---

## What requires a re-flash vs what's live

| Setting | How to change |
|---|---|
| Per-state colour, brightness, effect | Live — plugin settings dialog |
| Progress bar colours (fill, background, tip) | Live — Progress Bar tab colour pickers |
| LED strip type / colour order | Re-flash — use the YAML Generator tab |
| Data pin | Re-flash — use the YAML Generator tab |
| LED count | Re-flash — use the YAML Generator tab |

Hardware settings (strip type, pin, LED count) are compiled into the firmware binary. They cannot be changed at runtime. The **YAML Generator** tab in the plugin settings builds the correct `substitutions:` block for your hardware — copy it, paste into your YAML, and re-flash once.

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
DIN (data in) →   GPIO16  (or whichever pin you set as data_pin)
```

> **Power note:** An ESP32's 5 V pin can safely drive around 10–15 LEDs at moderate brightness.
> For longer strips use a separate 5 V supply and connect its GND to the ESP32 GND.
> Each WS2812B draws up to 60 mA at full white — a 30-LED strip at max ≈ 1.8 A.

### APA102 / SK9822 (4-wire, SPI)

```
LED strip          ESP32
─────────────────────────────
5 V  (VCC)    →   5 V PSU
GND           →   GND
DAT / DI      →   GPIO16 (data_pin)
CLK / CI      →   GPIO18 (clock_pin — add to YAML)
```

See the [APA102 section in ESPHome Setup](#apa102--sk9822-spi-strips) for the YAML changes needed.

---

## Installing ESPHome

You only need ESPHome for flashing. After the first USB flash, all future updates are wireless (OTA).

### Linux

```bash
# Install uv (manages its own Python — avoids system version conflicts)
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.local/share/../bin/env   # or restart terminal

uv tool install esphome --python 3.12
esphome version
```

**Serial port permissions:**

```bash
sudo usermod -a -G uucp $USER    # Arch Linux
sudo usermod -a -G dialout $USER # Ubuntu / Debian / Raspberry Pi OS
```

Log out and back in (or run `newgrp uucp` / `newgrp dialout`) to apply.

### Windows

```powershell
pip install esphome
esphome version
```

**Serial drivers:** check Device Manager after plugging in. If the COM port doesn't appear:
- **CP210x** (most WROOM/WROVER boards): [Silicon Labs driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
- **CH340 / CH341** (cheap clones): [WCH driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
- **ESP32-S3 / C3**: native USB, usually no driver needed on Windows 10/11.

### macOS

```bash
brew install uv
uv tool install esphome --python 3.12
esphome version
```

### Home Assistant Add-on

If you already run Home Assistant, the ESPHome add-on is the easiest route — no command line needed.

1. **Settings → Add-ons → Add-on store** → search ESPHome → install and start
2. Open the ESPHome Dashboard → **+ New device**
3. Once created, click **Edit** and replace the generated YAML with the contents of `cnc-status-light.yaml`
4. Add your secrets via the **Secrets** button
5. **Install → Plug into this computer** for first flash, then **Wirelessly** for OTA

### Docker

```bash
# First flash (USB)
docker run --rm -v "${PWD}":/config --device /dev/ttyACM0 \
  ghcr.io/esphome/esphome run cnc-status-light.yaml

# OTA (no USB)
docker run --rm -v "${PWD}":/config \
  ghcr.io/esphome/esphome run cnc-status-light.yaml
```

---

## ESPHome Setup

### Step 1 — Create secrets.yaml

```bash
cd path/to/ncsender-plugin-espstatus/esphome/
cp secrets.yaml.example secrets.yaml
```

Fill in your WiFi credentials and an OTA password.

### Step 2 — Configure your hardware

**Option A — Use the YAML Generator tab** (recommended)

Open the ncSender plugin settings dialog (tool menu → ESP Status Light) and go to the **YAML Generator** tab. Fill in your board, IP, strip type, pin, and LED count. Click **Copy to clipboard**, then paste it into the `substitutions:` and `esp32:` sections of `cnc-status-light.yaml`.

**Option B — Edit manually**

Open `cnc-status-light.yaml` and update the substitutions at the top:

```yaml
substitutions:
  static_ip:   "192.168.1.100"   # Pick an IP outside your router's DHCP range
  gateway:     "192.168.1.1"
  data_pin:    GPIO16            # GPIO pin wired to LED strip DIN
  num_leds:    "30"              # Number of LEDs on your strip
  led_type:    GRB               # GRB for WS2812B | GRBW for SK6812
  led_variant: WS2812            # WS2812B hardware → use WS2812 here, not WS2812B

esp32:
  board: esp32dev                # See board table below
```

Common board values:

| Module | board value |
|---|---|
| Generic ESP32 / WROOM / WROVER | `esp32dev` |
| ESP32-S3 DevKit | `esp32-s3-devkitc-1` |
| ESP32-C3 DevKit | `esp32-c3-devkitm-1` |
| LOLIN S2 Mini | `lolin_s2_mini` |
| NodeMCU-32S | `nodemcu-32s` |

### Step 3 — First flash (USB)

The very first flash must be done over USB so the OTA credentials get written to the device.

```bash
cd esphome/
esphome run cnc-status-light.yaml
```

Select your serial port when prompted. The first compile takes a few minutes. After that, all future updates can be done wirelessly.

### Step 4 — Verify

Open `http://192.168.1.100` in a browser. You should see the ESPHome web interface listing the `cnc_status` light and progress/colour entities. If the page loads, the ESP32 is ready.

---

## OTA Updates (after first flash)

Once the device is on your network you never need USB again.

### Option A — ESPHome CLI (simplest)

```bash
cd esphome/
esphome run cnc-status-light.yaml
```

ESPHome detects the device is reachable and uploads wirelessly automatically. No serial port needed.

### Option B — Compile only, then flash via web UI

Use this when you want to build the firmware on one machine and upload it from a browser, or keep a `.bin` alongside the plugin for easy re-flashing.

**1. Compile to a `.bin`:**

```bash
cd esphome/
esphome compile cnc-status-light.yaml
```

The compiled binary is written to:

```
esphome/.esphome/build/cnc-status-light/.pioenvs/cnc-status-light/firmware.bin
```

**2. Copy it to the plugin root** (optional — keeps it easy to find):

```bash
# Linux / macOS
cp .esphome/build/cnc-status-light/.pioenvs/cnc-status-light/firmware.bin ../firmware.bin

# Windows (PowerShell)
Copy-Item .esphome\build\cnc-status-light\.pioenvs\cnc-status-light\firmware.bin ..\firmware.bin
```

**3. Upload via the ESP32 web interface:**

Open `http://<esp32-ip>` in a browser, scroll to the **OTA Update** section, choose the `.bin` file, and click **Update**.

> The `firmware.bin` file is listed in `.gitignore` so it won't be committed to the repo.

### APA102 / SK9822 (SPI strips)

APA102 uses a different ESPHome platform. Replace the `light:` block in the YAML:

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

Safe data pins: GPIO16, GPIO17, GPIO18, GPIO19, GPIO21, GPIO22, GPIO23. Avoid strapping pins (GPIO0, GPIO2, GPIO5, GPIO12, GPIO15) and UART pins (GPIO1, GPIO3).

---

## Plugin Installation

Copy the entire `ncsender-plugin-espstatus/` directory into ncSender's plugins directory:

| Platform | Path |
|---|---|
| Linux | `~/.config/ncSender/plugins/` |
| macOS | `~/Library/Application Support/ncSender/plugins/` |
| Windows | `%APPDATA%\ncSender\plugins\` |

Restart ncSender, go to **Settings → Plugins**, and enable **ESP Status Light**.

---

## Plugin Configuration

Open the plugin from the ncSender tool menu.

### Connection tab

| Field | Description |
|---|---|
| **ESP32 Host / IP** | The static IP from your YAML. Hostnames (e.g. `cnc-status-light.local`) work if your network supports mDNS. |
| **Light Entity ID** | Matches the `name:` of the light in the YAML, lowercased. Default: `cnc_status`. |
| **Progress Entity ID** | Matches the `name:` of the number entity. Default: `cnc_progress`. |
| **Transition (ms)** | LED fade time between states. 0 = instant. |
| **Progress poll interval (ms)** | How often the plugin reads job progress. Default: 500 ms. |

Click **Test** to verify the ESP32 is reachable. A green dot confirms it.

### Machine States tab

| Column | Description |
|---|---|
| **Colour** | Click the swatch to open the colour picker. |
| **Brightness** | 0 = off, 255 = maximum. |
| **Effect** | Animation effect — see [Effects Reference](#effects-reference). |
| **Send** | Preview that state on the LEDs immediately without saving. |

Click **Save** to apply. Settings take effect within one poll cycle (500 ms).

### Progress Bar tab

Use the three colour pickers to configure progress bar colours live — no re-flash needed:

| Picker | Description |
|---|---|
| **Fill colour** | Colour of the completed portion. Default: blue. |
| **Background colour** | Colour of the unfilled portion. Default: near-black. |
| **Head (tip) colour** | Bright LED at the leading edge. Default: white. |

The preview at the bottom updates in real time. Colours are pushed to the ESP32 on save and whenever a job starts.

### YAML Generator tab

Generates the `substitutions:` and `esp32:` block for your `cnc-status-light.yaml`. Fill in your hardware details and click **Copy to clipboard**, then paste into the YAML and re-flash.

> Hardware settings (strip type, colour order, data pin, LED count) are compiled into the firmware and cannot be changed at runtime. You only need to re-flash when your physical hardware changes.

### Effects Reference tab

Quick-reference for all built-in effects.

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

### Adding custom effects

Add any ESPHome effect to `cnc-status-light.yaml` under the `effects:` key with a unique `name:`, then re-flash. The plugin sends whatever string you type into the effect dropdown, so custom effect names work automatically.

---

## Progress Bar

When **Run** uses the **Progress Bar** effect, the LED strip becomes a live job indicator.

### How it works

1. Every poll cycle (default 500 ms) the plugin reads job completion % from ncSender.
2. It posts the value to the ESP32: `POST http://<ip>/number/cnc_progress/set?value=45.5`
3. A lambda renders the bar in real time:
   - LEDs 0 to N−1 → fill colour
   - LED N (tip) → head colour
   - Remaining LEDs → background colour

Progress resets to 0 when the job ends.

### Changing colours

Use the colour pickers on the **Progress Bar** tab — changes take effect immediately without re-flashing. The ESP32 stores the colours in flash so they survive reboots.

---

## Troubleshooting

**LEDs don't light up**
- Check `data_pin` matches your wiring and re-flash.
- Confirm the strip has 5 V power.
- Add a 300–500 Ω resistor in series with the data line if the first LED flickers.

**Plugin says "Cannot reach X.X.X.X"**
- Ping the ESP32: `ping 192.168.1.100`
- Check logs: `esphome logs cnc-status-light.yaml`
- Ensure `static_ip` doesn't clash with your router's DHCP range.

**LEDs don't change with machine state**
- Restart ncSender after installing or updating the plugin.
- Check ncSender's log for `[ESP Status Light]` lines.
- The Disconnected state is off (brightness 0) by default — connect your CNC controller to trigger the Idle colour.

**Progress bar doesn't move**
- Confirm a job is actively running.
- Browse to `http://<esp32-ip>/number/cnc_progress` — the value should update while cutting.
- Check the **Progress Entity ID** in plugin settings matches the `name:` in your YAML exactly.

**"HTTP 404" from the ESP32**
- Entity IDs are the `name:` field lowercased, spaces → underscores.
- `name: "cnc_status"` → entity ID `cnc_status`

**Effects don't animate / wrong effect shown**
- Effect names are case-sensitive and must match the YAML `name:` exactly.
- Re-flash after adding new effects.

**OTA update fails**
- Confirm `ota_password` in `secrets.yaml` matches what was flashed.
- Do one USB flash to set the password, then OTA works from then on.

**Home Assistant integration**
- Uncomment the `api:` block in `cnc-status-light.yaml`, add `api_encryption_key` to `secrets.yaml`, and re-flash.

---

*For issues or feature requests, open a GitHub issue on the plugin repository.*
