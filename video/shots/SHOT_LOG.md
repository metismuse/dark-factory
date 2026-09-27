# SHOT LOG — Dark Factory demo video captures (2026-09-27 ~09:35 CDT run)

## Captured shots (video/shots/)

| Shot | File | Duration | Res/FPS | Content |
|---|---|---|---|---|
| 1 — Title (0:00–0:15) | [shot-1.mp4](shot-1.mp4) | 15.0 s | 1280x720 @ 30 | Title card: "pocketful / a software factory in BAND Desktop / Dark Factory · lablab.ai hackathon" |
| 4 — Live API demo (1:20–2:20) | [shot-4.mp4](shot-4.mp4) | 34.9 s | 1280x720 @ 30 | Real session: `node app/server.js` boot on 127.0.0.1:8080, create wallets alice+bob, deposit 100000 (key dep-1), transfer 25000 (key xfer-1), SAME key replayed → same transfer id (money moved once), conservation check → `{'alice': 75000, 'bob': 25000} TOTAL = 100000`, server stopped |
| 5 — Money invariants (2:20–2:50) | [shot-5.mp4](shot-5.mp4) | 24.7 s | 1280x720 @ 30 | Real run: `node --test tests/golden.test.js` → 14 pass / 0 fail, incl. 500-transfer conservation storm (9.28 s) |
| 7 — Close (3:20–3:40) | [shot-7.mp4](shot-7.mp4) | 20.0 s | 1280x720 @ 30 | Close card: "Every seat mandate is generic -- hand them a different problem and they still make sense. / The factory is the entry." |

## Capture method (IMPORTANT — read before assembly)

- The sandbox has **no terminal emulator** (`xterm`, `rxvt`, `gnome-terminal`, `xdotool`
  all absent; network installs prohibited by the $0/local-only boundary). So the
  "terminal" shots were NOT live x11grab recordings.
- Instead: the commands were run **for real** and their genuine stdout/stderr captured
  to transcripts (`/tmp/shots/shot4.transcript`, `/tmp/shots/shot5.transcript`).
  A PIL renderer (`/tmp/shots/render.py`, DejaVu Sans Mono 20px) then typed the
  commands typewriter-style and streamed the captured output into a terminal-chrome
  frame (1280x720, 12 fps), encoded to 30 fps H.264. **Every byte of output shown
  is from the real runs; only the presentation is rendered, not captured.**
- Shots 1 and 7 are static ffmpeg title cards (drawtext), as is standard.
- Spot-checked frames visually: terminal frame, title card, close card all clean.

## Failures / caveats

- **None blocking.** Shot-7 first render showed a tofu box for the em-dash
  (ffmpeg drawtext font fallback); re-rendered with `--` — verified clean.
- One transient `image2` muxer error extracting a PNG preview (retry succeeded;
  no MP4 was affected).
- Shot 4 runs 34.9 s vs the 60 s script slot — narration pacing will need trims
  or holds at assembly. Shot 5 is 24.7 s vs its 30 s slot — near fit.
- Per script, shots 2/3 (BAND room) and 6 (stage-2 UI) remain BLOCKED and were not touched.

## Narration timings for assembly

- 0:00–0:15 — shot-1.mp4 (15.0 s)
- 1:20–2:20 — shot-4.mp4 (34.9 s; pad/trim to narration)
- 2:20–2:50 — shot-5.mp4 (24.7 s)
- 3:20–3:40 — shot-7.mp4 (20.0 s)
- Voiceover still human-gated; room shots still blocked (DQ item).

## Repro commands (exact)

```bash
cd ~/workspace/metis-autonomous-wealth-os/dark-factory
# shot 4 demo (real server + curl, transcript for renderer)
/tmp/shots/run_shot4.sh                                   # writes /tmp/shots/shot4.transcript
# shot 5 output
node --test tests/golden.test.js > /tmp/shots/shot5.output 2>&1
# render frames (12 fps PNGs) + encode
python3 /tmp/shots/render.py /tmp/shots/shot4.transcript /tmp/shots/f4 --endhold 3.0
ffmpeg -y -loglevel error -framerate 12 -i /tmp/shots/f4/f%05d.png -r 30 \
  -c:v libx264 -pix_fmt yuv420p -crf 20 video/shots/shot-4.mp4
python3 /tmp/shots/render_slow.py /tmp/shots/shot5.transcript /tmp/shots/f5 --endhold 4.0
#   render_slow.py = render.py with TYPE_CPS, OUT_LPS = 90.0, 1.2 (slow output stream)
ffmpeg -y -loglevel error -framerate 12 -i /tmp/shots/f5/f%05d.png -r 30 \
  -c:v libx264 -pix_fmt yuv420p -crf 20 video/shots/shot-5.mp4
# title / close cards
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf; F2=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0d1117:s=1280x720:r=30:d=15" -vf \
"drawtext=fontfile=$F:text='pocketful':fontsize=96:fontcolor=0x3fb950:x=(w-text_w)/2:y=250,drawtext=fontfile=$F2:text='a software factory in BAND Desktop':fontsize=44:fontcolor=0xe6e6e6:x=(w-text_w)/2:y=380,drawtext=fontfile=$F2:text='Dark Factory  ·  lablab.ai hackathon':fontsize=28:fontcolor=0x8b949e:x=(w-text_w)/2:y=460" \
-c:v libx264 -pix_fmt yuv420p -crf 20 video/shots/shot-1.mp4
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0d1117:s=1280x720:r=30:d=20" -vf \
"drawtext=fontfile=$F2:text='Every seat mandate is generic --':fontsize=48:fontcolor=0xe6e6e6:x=(w-text_w)/2:y=220,drawtext=fontfile=$F2:text='hand them a different problem and they still make sense.':fontsize=40:fontcolor=0x8b949e:x=(w-text_w)/2:y=310,drawtext=fontfile=$F:text='The factory is the entry.':fontsize=64:fontcolor=0x3fb950:x=(w-text_w)/2:y=400,drawtext=fontfile=$F2:text='pocketful  ·  metis-scout factory  ·  \$0 spend':fontsize=26:fontcolor=0x8b949e:x=(w-text_w)/2:y=520" \
-c:v libx264 -pix_fmt yuv420p -crf 20 video/shots/shot-7.mp4
```

## Server notes

- `node app/server.js` defaults to PORT 8080 (free at capture time); binds
  127.0.0.1 only. Started fresh for shot 4, killed after — no server left running.
- BUILD_PLAN.md / SPEC.json / FACTORY.md were NOT modified (read-only per task).
- Spend: $0.00.
