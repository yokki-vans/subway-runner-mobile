# Subway Runner 3D (mobile)

Endless runner in the spirit of Subway Surfers: Three.js, mobile-first, no external assets.

- Radial track bend via vertex shader (`uCurve * z^2`) — smooth "running around the corner" feel, no corners; gameplay axis stays straight.
- 6 biomes with day/night and weather: DAY_CITY → SUNSET → NIGHT_CITY → RAIN → STORM → SNOW_DAY.
- Procedural everything: Canvas textures (asphalt/rails/bricks/trains), WebAudio music + rain/wind/SFX, low-poly character rig with run/jump/roll animations, particle FX.
- 120 FPS target: fixed-step physics (1/120) + dynamic resolution scaling.
- Controls: swipe left/right/up/down; WASD/arrows/Space on desktop.

## Run
Serve the directory statically and open `index.html` (e.g. `python3 -m http.server`).

## QA API
`window.gameApi`: `start()`, `advance(m)`, `freeze(v)`, `input('left'|'right'|'jump'|'roll')`, `setBiome(i)`, `sceneInfo()`.
Query params: `?fps=1` (FPS readout), `?ghost=1`.

MIT-style; all assets generated at runtime.
