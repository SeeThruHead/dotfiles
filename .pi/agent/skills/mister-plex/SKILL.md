---
name: mister-plex
description: Cast Plex media to MiSTer FPGA via groovy-cli. Browse anime/TV/movies on the Plex server, find what was playing last, and stream video with burned-in subtitles to MiSTer's CRT output via the Groovy protocol. Use when the user wants to watch something on MiSTer, cast Plex to CRT, play anime, continue watching, or control playback.
---

# MiSTer Plex Casting

Stream Plex media to a PVM/CRT via MiSTer FPGA using `groovy-cli` + Groovy core.

## Architecture

```
Plex Server → direct play URL
  ↓
groovy-cli (on Mac):
  - FFmpeg decodes video + burns subtitles → raw BGR24 frames
  - FFmpeg decodes audio → PCM s16le 48kHz stereo
  - Splits interlaced fields, sends via Groovy UDP protocol
  ↓
MiSTer FPGA (Groovy core) → analog out → PVM/CRT
```

## Prerequisites

1. **Groovy core** loaded on MiSTer (_Utility → Groovy)
2. **groovy-cli** built: `cd ~/code/groovy-cli && cargo build --release`
3. **FFmpeg** installed: `brew install ffmpeg`
4. **Plex authenticated**: `groovy-cli auth` (first time only — opens browser, saves token)

## CLI Location

```
~/code/groovy-cli/target/release/groovy-cli
```

## Config

Stored at `~/.config/groovy-cli/config.toml`:
```toml
mister = "192.168.0.115"
server = "192.168.0.29"
port = 32400
token = "auto-saved-by-auth"
modeline = "640x480i NTSC"
```

Settings can also come from CLI flags or env vars (`PLEX_TOKEN`, `GROOVY_MISTER`, `GROOVY_PLEX_SERVER`).

## Commands

```bash
# What was I watching? (On Deck / continue watching)
groovy-cli continue

# Search all libraries (anime, TV, movies)
groovy-cli search "Gundam"

# List episodes with watch status
groovy-cli episodes "Gundam Wing"

# Play next unwatched episode
groovy-cli play "Gundam Wing"

# Play specific episode
groovy-cli play "Gundam Wing" -s 1 -e 4

# Play by Plex rating key
groovy-cli play-key 70844

# List libraries on the server
groovy-cli libraries

# List available modelines
groovy-cli modelines

# Stop playback (sends close to MiSTer)
groovy-cli stop

# Show config
groovy-cli config

# First-time auth (opens browser for Plex OAuth)
groovy-cli auth
```

## Common Workflows

### 1. "What was I watching?" / "Continue watching"
```bash
groovy-cli continue
```
Shows On Deck items with show name, episode, and how far in. Pick one and play by key.

### 2. "Play Gundam Wing"
```bash
groovy-cli play "Gundam Wing"
```
Searches all libraries, finds the show, picks first unwatched episode, streams with subtitles.

### 3. "Play next episode"
Current playback must be stopped first, then:
```bash
groovy-cli play "Show Name"
```
It auto-picks the next unwatched.

### 4. "Stop"
```bash
groovy-cli stop
```

### 5. "What's in my anime library?"
```bash
groovy-cli search ""
```
Or check libraries first: `groovy-cli libraries`

## Adjusting Image Position/Size

If the image doesn't fit the CRT properly (cut off edges, too wide/narrow), add a `[custom_modeline]` section to the config. Start from the preset values and tweak:

```toml
[custom_modeline]
p_clock = 6.700
h_active = 320    # horizontal resolution
h_begin = 336     # increase to shift image LEFT
h_end = 367       # sync pulse end
h_total = 426     # total horizontal pixels (including blanking)
v_active = 240    # vertical resolution
v_begin = 244     # increase to shift image UP
v_end = 247       # sync pulse end
v_total = 262     # total vertical lines (including blanking)
interlace = false
```

Common tweaks:
- **Image too far right**: decrease `h_begin` and `h_end` by same amount
- **Image too far left**: increase `h_begin` and `h_end` by same amount
- **Image too low**: decrease `v_begin` and `v_end` by same amount
- **Image too high**: increase `v_begin` and `v_end` by same amount
- **Image too wide**: decrease `h_active` (will add black border)
- **Image too tall**: decrease `v_active` (will add black border)

Preset modeline values for reference:
- 320x240 NTSC: pclock=6.700 h=320/336/367/426 v=240/244/247/262
- 640x480i NTSC: pclock=12.336 h=640/662/720/784 v=480/488/494/525
- 720x480i NTSC: pclock=13.846 h=720/744/809/880 v=480/488/494/525

## Network & Remote Execution

**WiFi causes flickering and audio pops.** Groovy streaming requires ethernet.

Before running `groovy-cli play`, check if the current machine is on WiFi:
```bash
# Check if on WiFi
networksetup -getairportnetwork en0 2>/dev/null | grep -q "Current Wi-Fi Network"
```

If on WiFi, **run groovy-cli on the hardwired Mac** via SSH + tmux:
```bash
# Remote host (hardwired ethernet)
GROOVY_HOST="shanekeulen@192.168.0.25"

# Start playback in persistent tmux session
ssh $GROOVY_HOST "source ~/.zshrc; tmux kill-session -t groovy 2>/dev/null; groovy-cli stop 2>/dev/null; sleep 1; tmux new-session -d -s groovy 'source ~/.zshrc; groovy-cli play \"SHOW NAME\" -a jpn 2>&1 | tee /tmp/groovy-play.log'"

# Check status
ssh $GROOVY_HOST "tail -5 /tmp/groovy-play.log"

# Stop playback
ssh $GROOVY_HOST "source ~/.zshrc; groovy-cli stop; tmux kill-session -t groovy"
```

If on ethernet, run locally as normal.

- **MiSTer:** `192.168.0.115` (ethernet)
- **Hardwired Mac:** `shanekeulen@192.168.0.25` (ethernet, has groovy-cli + ffmpeg installed)
- **Plex server:** configured in `~/.config/groovy-cli/config.toml`
- **MiSTer SSH:** `sshpass -p '1' ssh -o StrictHostKeyChecking=no root@192.168.0.115`

## MiSTer INI Notes

- `[Groovy]` section has `main=MiSTer_groovy`
- `composite_sync=1` for PVM
- `fb_terminal=1`
