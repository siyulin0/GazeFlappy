# Gaze Flappy

Gaze Flappy is a browser-based webcam gaze-controlled game prototype built with vanilla HTML, CSS, JavaScript, Canvas, and [WebGazer.js](https://webgazer.cs.brown.edu/). Look vertically around the screen to guide an original geometric bird through generous moving obstacles.

Once deployed, friends can play from a normal link—no installation or local server required. They should use a laptop or desktop with a webcam and allow camera access when prompted.

It is an experimental visual-break game that encourages users to vary their gaze direction after prolonged screen work. It is not a medical device and makes no claim to treat eye strain or improve vision.

## Requirements

- A laptop or desktop with a front-facing webcam
- A current Chromium-based browser or Firefox (Chrome/Edge are recommended)
- Camera permission
- Internet access is optional; only the Nunito web font uses a remote host and has a system-font fallback
- HTTPS in production, or local development at `http://localhost` or `http://127.0.0.1`. Browsers treat these loopback origins as secure contexts for webcam access.

## How to run

Do not open `index.html` directly as a `file://` URL. HTTPS is **not required for local development**. Start a local HTTP server in this folder instead.

### Option 1: Python

```sh
python -m http.server 8000
```

Then open exactly:

[http://localhost:8000](http://localhost:8000)

Allow camera access when the browser prompts you. You may also use `http://127.0.0.1:8000`; both loopback addresses are accepted by the application.

On systems where Python 3 uses a separate command:

```sh
python3 -m http.server 8000
```

### Option 2: VS Code Live Server

1. Open this project folder in VS Code.
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Allow camera access when prompted.

The project is entirely static and can also be deployed to an HTTPS host such as GitHub Pages.

## Publish on GitHub Pages

This repository includes a no-build GitHub Pages workflow. It publishes the static files exactly as they appear in the repository; Node, React, Vite, and package installation are not involved.

1. Create a new GitHub repository, for example `gaze-flappy`. A public repository works with GitHub Free.
2. Push this entire project, including the hidden `.github` directory and the `mediapipe` directory.
3. On GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open the repository's **Actions** tab. The **Deploy Gaze Flappy to GitHub Pages** workflow runs automatically after a push; you can also run it manually.
6. When deployment finishes, share:

   ```text
   https://YOUR-USERNAME.github.io/gaze-flappy/
   ```

GitHub Pages serves the game over HTTPS, so webcam permission works without a local server. In **Settings → Pages**, keep **Enforce HTTPS** enabled. The first deployment can take a few minutes.

### Upload with Git commands

From this project folder, replace the example URL with the repository URL GitHub gives you:

```sh
git add .
git commit -m "Publish Gaze Flappy"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/gaze-flappy.git
git push -u origin main
```

If you upload through GitHub's website instead, make sure the large `.wasm` and `.data` files inside `mediapipe/face_mesh/` are included. None exceeds GitHub's individual file-size limit.

## Controls and flow

1. Click **Enable Eye Tracking**. Camera permission is requested only after this click.
2. Look directly at each of the nine calibration targets and click it three times.
3. In validation, follow the mint target; the optional orange gaze cursor shows WebGazer's estimate.
4. Start the game and look higher or lower on the screen to guide the bird.

- **Pause** freezes the round. Hiding the tab also pauses it.
- If gaze samples disappear for 1.6 seconds, the round pauses and resumes when tracking returns.
- **Show gaze cursor** displays the estimated gaze point during gameplay (off by default).
- **Debug** displays raw gaze values, filtered Y, bird Y, FPS, and tracking state.
- **Use keyboard** switches to the fallback: hold **Arrow Up** or **Arrow Down**.
- **Recalibrate** clears the current model and repeats all nine targets.
- **Play Again** resets the existing round without adding another animation loop.

## Privacy

Camera images are processed locally in the browser by WebGazer for gaze estimation. Gaze Flappy does not intentionally record, store, or upload camera images. Calibration data persistence is disabled. The official WebGazer 3.5.3 browser bundle is vendored as `webgazer.js`; only the optional Google font is fetched remotely.

## Tuning

The first constants in `game.js` are the main controls:

- `GAZE_SMOOTHING` — higher is more responsive; lower is steadier. Start around `0.08–0.15`.
- `GAZE_DEAD_ZONE` — higher suppresses more small gaze changes. Start around `20–40` pixels.
- `BIRD_FOLLOW_SPEED` — higher makes the bird catch the filtered target faster.
- `TRACKING_LOSS_MS` — delay before an eye-tracking pause.
- `CALIBRATION_CLICKS` — samples collected at each calibration point.

Tune smoothing first, then dead zone, then follow speed. Change one value at a time.

## Known limitations

- Accuracy varies with lighting, webcam quality, glasses, reflections, head position, calibration quality, browser, and screen size.
- Webcam gaze tracking is much less accurate than a laboratory eye tracker.
- Resizing the browser after calibration can reduce accuracy; recalibrate after a substantial resize.
- The vendored WebGazer bundle is large, so its first parse can take a moment on slower laptops.
- The app is optimized for laptop and desktop displays, not phones.
- This prototype is not a medical device.

## Architecture and future extensions

- `index.html` — UI, screens, canvas, controls, and WebGazer script loading
- `style.css` — responsive visual design and interface states
- `gaze.js` — WebGazer lifecycle, samples, calibration recording, and freshness checks
- `webgazer.js` — vendored official WebGazer 3.5.3 distribution bundle, with its legacy HTTPS warning adjusted to recognize both localhost loopback forms
- `mediapipe/face_mesh/` — matching MediaPipe 0.4.1633559619 model, loader, and WASM runtime files required by WebGazer
- `.github/workflows/pages.yml` — no-build automatic GitHub Pages deployment
- `.nojekyll` — tells GitHub Pages to serve the repository as a plain static site
- `THIRD_PARTY_NOTICES.md` and `LICENSES/` — licenses for vendored browser dependencies

### If camera setup appears stuck

After updating the project, hard-refresh the page with **Ctrl+Shift+R** so Chrome does not reuse an older cached script. The camera preview can appear before the face-landmark model is ready; once the local MediaPipe assets load, the app automatically advances to calibration. If it still does not advance, confirm that `http://localhost:8000/mediapipe/face_mesh/face_mesh.binarypb` opens without a 404 error.
- `game.js` — state machine, input filtering, game simulation, collision, rendering, and UI wiring

Game timing is isolated in `game.elapsed`, leaving a clear place for a future 60–90 second look-away break. Gaze input is behind `GazeController`, so a future MediaPipe blink detector can be added without changing collision or rendering logic. Pipe generation is also isolated in `spawnPipe()`, ready for intentional high/low or diagonal gaze-pattern levels.
