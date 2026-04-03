---
name: mister-plex
description: Cast Plex media to MiSTer FPGA via MistGlow + Groovy core. Browse anime/TV/movies on the Plex server and send playback commands to MistGlow running on the Mac, which streams video to MiSTer's CRT output. Use when the user wants to watch something on MiSTer, cast Plex to CRT, play anime, or control MistGlow playback.
---

# MiSTer Plex Casting

Stream Plex media to a PVM/CRT via MiSTer FPGA using MistGlow + Groovy core.

## Architecture

```
Plex Server (192.168.0.29:32400)
  → transcodes video
  → sends to MistGlow (192.168.0.25:3005) on Mac
    → streams frames via Groovy UDP protocol
    → MiSTer FPGA (192.168.0.115) Groovy core
      → analog video out to PVM via Rondo HD15
```

## Prerequisites

Before casting, ensure:
1. **Groovy core** is loaded on MiSTer (_Utility → Groovy)
2. **MistGlow** is running on Mac with Plex Receiver started (Plex tab → Start Plex Receiver)
3. **GDM responder** is running: `mistglow-gdm` (at `/usr/local/bin/mistglow-gdm`)

### Starting everything
```bash
# Start GDM responder (if not already running)
pgrep -f mistglow-gdm || nohup python3 /usr/local/bin/mistglow-gdm > /tmp/mistglow-gdm.log 2>&1 &

# MistGlow must be started manually from /Applications/Mistglow.app
# Groovy core must be loaded manually on MiSTer OSD
```

## Credentials

- **Plex server:** `192.168.0.29:32400`
- **Plex token:** `eGyeubYVEQRyZqZynfRo`
- **MistGlow companion:** `192.168.0.25:3005`
- **MistGlow client ID:** `61638E9E-A709-4C10-8EBC-358171AAEAF6`
- **MiSTer IP:** `192.168.0.115` (ethernet, WiFi disabled)
- **MiSTer SSH:** root / 1

## Plex API Shortcuts

### List libraries
```bash
curl -s "http://192.168.0.29:32400/library/sections" \
  -H "X-Plex-Token: eGyeubYVEQRyZqZynfRo" \
  -H "Accept: application/json"
```

Libraries: Movies (key=2), Anime (key=3), TV Shows (key=1), Music (key=4)

### Search a library
```bash
# Search anime by title
curl -s "http://192.168.0.29:32400/library/sections/3/all?title=SEARCH_TERM" \
  -H "X-Plex-Token: eGyeubYVEQRyZqZynfRo" \
  -H "Accept: application/json"
```

### List episodes of a show
```bash
curl -s "http://192.168.0.29:32400/library/metadata/RATING_KEY/allLeaves" \
  -H "X-Plex-Token: eGyeubYVEQRyZqZynfRo" \
  -H "Accept: application/json"
```

### Cast to MistGlow
```bash
curl -s "http://192.168.0.25:3005/player/playback/playMedia?\
key=%2Flibrary%2Fmetadata%2FRATING_KEY\
&machineIdentifier=a92057788fca621bb0b7d221bbca8e1045adc095\
&address=192.168.0.29\
&port=32400\
&protocol=http\
&token=eGyeubYVEQRyZqZynfRo\
&type=video\
&commandID=1" \
  -H "X-Plex-Client-Identifier: pi-controller" \
  -H "X-Plex-Device-Name: pi"
```

### Playback controls
```bash
# Pause
curl -s "http://192.168.0.25:3005/player/playback/pause?commandID=2" \
  -H "X-Plex-Client-Identifier: pi-controller"

# Resume
curl -s "http://192.168.0.25:3005/player/playback/play?commandID=3" \
  -H "X-Plex-Client-Identifier: pi-controller"

# Stop
curl -s "http://192.168.0.25:3005/player/playback/stop?commandID=4" \
  -H "X-Plex-Client-Identifier: pi-controller"

# Skip next
curl -s "http://192.168.0.25:3005/player/playback/skipNext?commandID=5" \
  -H "X-Plex-Client-Identifier: pi-controller"

# Skip previous
curl -s "http://192.168.0.25:3005/player/playback/skipPrevious?commandID=6" \
  -H "X-Plex-Client-Identifier: pi-controller"

# Seek (milliseconds)
curl -s "http://192.168.0.25:3005/player/playback/seekTo?offset=60000&commandID=7" \
  -H "X-Plex-Client-Identifier: pi-controller"
```

## Common Workflows

### 1. "Play Gundam Wing"
1. Search anime library for the show
2. Get episode list
3. Find first unwatched episode (viewCount=0) or ask user
4. Send playMedia command to MistGlow

### 2. "Play next episode"
```bash
curl -s "http://192.168.0.25:3005/player/playback/skipNext?commandID=5" \
  -H "X-Plex-Client-Identifier: pi-controller"
```

### 3. "Pause" / "Resume"
Send pause/play commands as shown above.

### 4. "What's in my anime library?"
```bash
curl -s "http://192.168.0.29:32400/library/sections/3/all" \
  -H "X-Plex-Token: eGyeubYVEQRyZqZynfRo" \
  -H "Accept: application/json"
```
Parse and list show titles.

### 5. "Play a movie"
Same flow but use library key=2 (Movies) instead of key=3 (Anime).

## MiSTer Network Config

- **WiFi:** configured via wpa_supplicant
- **CIFS mount:** `//192.168.0.9/roms/mister` → `/media/fat/cifs/` (auto-mounts 30s after boot via user-startup.sh)
- **SSH:** `sshpass -p '1' ssh -o StrictHostKeyChecking=no root@192.168.0.115`
- **NAS (Unraid):** `192.168.0.9` user=sth pass=G3neral

## MiSTer INI Notes

- `vga_scaler=0` for games (native analog output)
- `[Menu]` section has `vga_scaler=1` with 320x240 modeline for CRT-visible menus/scripts
- `[Groovy]` section has `main=MiSTer_groovy` for the custom binary
- `composite_sync=1` for PVM
- `fb_terminal=1`
- Saves go to SD card at `/media/fat/saves/<CORE>/`
- Must hit F12 → Save Backup RAM to persist saves in most cores
