# SightFlight

SightFlight is a browser-based experimental game in which players guide a flying bird using webcam-based eye interaction. Choose precise vertical gaze control or classic blink-to-flap gameplay, avoid moving obstacles, and score by flying safely through each gap.

The game uses original, simple visual assets and does not use copyrighted Flappy Bird artwork.

## Live site

[Play SightFlight on GitHub Pages](https://siyulin0.github.io/GazeFlappy/)

The repository is a static site with no build step. GitHub Pages serves it over HTTPS, which allows browsers to request webcam access.

## How it works

SightFlight offers two equally weighted choices on the opening screen: **Gaze Mode** and **Blink Mode**. The mode cards use a light default state, a raised dark hover state, and a pressed selected state.

During a round, guide the bird through moving obstacles, avoid collisions, and earn points by passing obstacles. After Game Over, you can play again with the current control mode or return to the main menu and choose another mode. Setup, pause, and tracking-loss screens also provide a route back to the menu.

### Gaze Mode

Gaze Mode uses WebGazer.js to estimate where the player is looking. Only the gaze **Y coordinate** controls gameplay; gaze X is retained for cursor visualization and debugging. The bird's horizontal position remains fixed.

The control pipeline is:

`high-frequency gaze sensing → short-window aggregation → 10 Hz gaze-control decisions → continuous smooth bird movement`

WebGazer's Kalman filter is enabled. SightFlight then aggregates recent gaze-Y samples, selects their median, applies exponential smoothing, uses a dead zone to reject small target changes, and continuously moves the bird toward the resulting target.

### Blink Mode

Blink Mode uses MediaPipe Tasks Vision Face Landmarker blendshapes. The bird falls under gravity, and each accepted binocular blink applies one upward flap impulse.

The detector follows an `OPEN → CLOSED → OPEN` cycle. Both eyes must satisfy the blink conditions, and reopening re-arms the detector, so holding the eyes closed does not repeatedly flap.

Current gameplay tuning values are:

- `BLINK_CLOSE_THRESHOLD = 0.45`
- `BLINK_OPEN_THRESHOLD = 0.32`
- `BLINK_MIN_CLOSED_MS = 50 ms`
- `BLINK_COOLDOWN_MS = 180 ms`
- `BLINK_INFERENCE_HZ = 20 Hz`

These are experimental gameplay settings, not scientifically or medically validated parameters.

## Controls and setup

### Gaze Mode

1. Choose **Gaze Mode**.
2. Grant camera permission.
3. Look at and click each of the nine calibration points three times.
4. Complete the short gaze-validation step.
5. Start the game and look higher or lower on the screen to guide the bird.

An existing calibration is preserved when safely returning to the menu and selecting Gaze Mode again. A recalibration control is available during setup.

### Blink Mode

1. Choose **Blink Mode**.
2. Grant camera permission if it has not already been granted.
3. Complete the Blink Test by producing three successfully detected blinks.
4. Start the game.
5. Blink naturally to flap while gravity pulls the bird downward.

### Other controls

- **Pause** freezes the current round.
- Hiding the browser tab automatically pauses gameplay.
- Tracking loss pauses the round until tracking returns.
- **Back to Menu** returns to mode selection from setup, pause/tracking-loss, and Game Over screens.
- **Play Again** starts a fresh round with the current control mode.
- Keyboard fallback uses **Arrow Up** and **Arrow Down**.

## Technologies

- HTML and CSS
- Vanilla JavaScript
- HTML5 Canvas
- Browser webcam and media APIs
- WebGazer.js 3.5.3
- MediaPipe Tasks Vision 1.0.1 and Face Landmarker
- MediaPipe face blendshapes (`eyeBlinkLeft` and `eyeBlinkRight`)
- GitHub Actions and GitHub Pages

WebGazer is vendored with its required legacy Face Mesh assets. Blink detection runs the newer MediaPipe Tasks Vision runtime in an isolated hidden iframe while reusing frames from the existing webcam video source. This prevents the two MediaPipe/Emscripten runtimes from sharing a conflicting JavaScript global context.

## Running locally

Camera-based browser APIs generally require a secure context. Modern browsers treat `localhost` and `127.0.0.1` as acceptable development origins, but opening `index.html` directly through a `file://` URL is not supported for camera testing.

From the project directory, run:

```sh
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

The VS Code **Live Server** extension is another suitable option.

## Deployment

SightFlight can be deployed directly as a static GitHub Pages website. The included GitHub Actions workflow publishes the repository without Node, a framework, or a build system.

In the repository settings, configure **Pages → Build and deployment → Source** to use **GitHub Actions**. Keep HTTPS enabled so the deployed site can request camera permission.

## Privacy

Webcam access is required for Gaze Mode and Blink Mode. Users must grant camera permission through their browser.

Camera frames are processed locally in the browser for gaze and face-landmark estimation. SightFlight does not intentionally record, store, or upload webcam video. Some runtime libraries, fonts, and the Face Landmarker model are downloaded from their configured external hosts, but camera images are not intentionally sent to those services by the application.

## Debugging and diagnostics

Optional development tools are available from the in-game Debug panel. They are not required for normal gameplay.

Diagnostics include:

- Raw gaze X and Y coordinates and filtered gaze-control values
- `eyeBlinkLeft` and `eyeBlinkRight` blendshape scores
- Blink state, thresholds, cooldown, and state timing
- Webcam and MediaPipe inference FPS
- Raw blink candidates, accepted blink events, and emitted flaps
- A bounded blink-event and rejection log
- Separate Normal and Fast diagnostic-run history with a copyable summary

## Known limitations

- Webcam gaze tracking is substantially less precise than a dedicated laboratory eye tracker.
- Results depend on lighting, webcam quality, face position, glasses and reflections, calibration quality, browser behavior, and device performance.
- Gaze control can feel difficult because webcam predictions are noisy.
- Rapid, brief, or subtle blinks may occasionally be missed or misclassified.
- MediaPipe inference frequency varies by device and may be lower than the camera frame rate.
- Significant browser-window resizing can reduce gaze accuracy; recalibration may help.
- Initial model loading can take several seconds.
- SightFlight is primarily designed for desktop and laptop browsers with webcams. Browser compatibility varies.

## Health disclaimer

> SightFlight is an experimental interaction/game prototype, not a medical device. It is not intended to diagnose, treat, prevent, or cure eye strain, vision problems, or any other medical condition.

## Project status

SightFlight is a working prototype. Current implemented features include:

- Gaze Mode and Blink Mode
- Nine-point gaze calibration and validation
- Gaze aggregation, smoothing, dead zone, and continuous bird following
- Three-blink readiness test and blink-to-flap gameplay
- Obstacle generation, collision detection, scoring, pause, and restart
- Back-to-menu navigation throughout setup and post-game flows
- Shared webcam use without duplicate permission prompts
- Optional gaze and blink diagnostics
- Static, build-free GitHub Pages deployment

## Project structure

- `index.html` — screens, Canvas, and interface controls
- `style.css` and `mode-selection.css` — responsive presentation and interaction styling
- `game.js` — application state, controls, simulation, collision, scoring, and rendering
- `gaze.js` — WebGazer lifecycle, calibration, and tracking status
- `blink.js` — blink tracking, state machine, and diagnostics
- `blink-runtime.html` — isolated MediaPipe Tasks Vision inference
- `blink.test.js` — deterministic blink state-machine and diagnostics tests
- `webgazer.js` — vendored WebGazer browser bundle
- `mediapipe/face_mesh/` — WebGazer's matching legacy Face Mesh assets
- `.github/workflows/pages.yml` — static GitHub Pages deployment
- `THIRD_PARTY_NOTICES.md` and `LICENSES/` — third-party notices and licenses

## Future ideas

Possible future experiments—not currently implemented—include:

- Special obstacles that respond to different eye behaviors
- Look-away or distance-viewing breaks
- Long-eye-closure interactions
- More varied eye-controlled gameplay
- Improved gaze-control tuning
- Personalized blink calibration
- Additional levels and obstacle patterns
