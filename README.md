# SightFlight | 视控飞鸟

## English

SightFlight is a browser-based experimental game in which players guide a flying bird using webcam-based eye interaction. Choose precise vertical gaze control or classic blink-to-flap gameplay, avoid moving obstacles, and score by flying safely through each gap.

The game uses original, simple visual assets and does not use copyrighted Flappy Bird artwork.

## Live site

[Play SightFlight on GitHub Pages](https://siyulin0.github.io/SightFlight/)

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

Blink Mode follows the familiar Flappy Bird-style gameplay loop, with eye blinks replacing button presses or screen taps: each blink makes the bird flap upward while gravity pulls it downward.

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

---

## 中文（简体）

### 项目简介

**视控飞鸟（SightFlight）** 是一款浏览器端实验性游戏。玩家可以通过摄像头捕捉的眼部交互来控制飞鸟，在移动障碍之间穿行，并通过成功穿越障碍获得分数。

游戏提供两种控制方式：通过上下移动视线控制飞鸟高度，或通过双眼眨眼让飞鸟向上拍动。游戏使用原创的简洁视觉素材，不使用受版权保护的 Flappy Bird 美术资源。

### 在线体验

[通过 GitHub Pages 体验视控飞鸟](https://siyulin0.github.io/SightFlight/)

本项目是无需构建步骤的静态网站。GitHub Pages 通过 HTTPS 提供页面，因此浏览器可以安全地请求摄像头权限。

### 游戏模式

打开页面后，玩家可以选择 **视线模式（Gaze Mode）** 或 **眨眼模式（Blink Mode）**。两种模式默认具有相同的浅色视觉权重；鼠标悬停时选项会变深并上浮，点击时则呈现按下效果。

#### 视线模式

视线模式使用 WebGazer.js 估计玩家在屏幕上的注视位置。游戏只使用视线的 **Y 坐标** 控制飞鸟；X 坐标仅用于光标显示和调试。飞鸟的水平位置保持固定。

控制流程为：

`高频视线采样 → 短时间窗口聚合 → 10 Hz 控制决策 → 连续平滑移动`

WebGazer 的卡尔曼滤波已启用。视控飞鸟还会对近期 Y 坐标样本取中位数，进行指数平滑，通过死区忽略微小目标变化，最后让飞鸟持续跟随处理后的目标位置。

#### 眨眼模式

眨眼模式采用类似《Flappy Bird》的经典玩法循环，但以眨眼取代按键或点击屏幕：每次眨眼都会让飞鸟向上拍动，而重力会使它持续下落。

眨眼模式使用 MediaPipe Tasks Vision Face Landmarker 的面部表情系数。飞鸟受重力影响持续下落，每次被接受的双眼眨眼都会产生一次向上的拍动冲量。

检测器遵循 `睁眼 → 闭眼 → 睁眼` 状态循环。双眼必须同时满足检测条件，并且必须重新睁眼才能再次触发，因此持续闭眼不会产生连续拍动。

当前游戏调节参数为：

- `BLINK_CLOSE_THRESHOLD = 0.45`
- `BLINK_OPEN_THRESHOLD = 0.32`
- `BLINK_MIN_CLOSED_MS = 50 ms`
- `BLINK_COOLDOWN_MS = 180 ms`
- `BLINK_INFERENCE_HZ = 20 Hz`

这些数值只是当前实验性游戏参数，并未经过科学或医疗验证。

### 操作与设置流程

#### 视线模式

1. 选择 **Gaze Mode**。
2. 授予浏览器摄像头权限。
3. 注视九个校准点，并分别点击每个点三次。
4. 完成简短的视线验证步骤。
5. 开始游戏，注视屏幕较高或较低的位置来引导飞鸟。

安全返回主菜单后，已有的视线校准会尽可能保留。设置阶段也提供重新校准功能。

#### 眨眼模式

1. 选择 **Blink Mode**。
2. 如果尚未授权，请授予摄像头权限。
3. 完成眨眼测试；开始游戏前需要成功检测三次眨眼。
4. 开始游戏。
5. 自然眨眼以使飞鸟向上拍动。

#### 其他操作

- **Pause** 暂停当前回合；隐藏浏览器标签页也会自动暂停。
- 追踪丢失时，回合会暂停并等待追踪恢复。
- **Back to Menu** 可从设置、暂停、追踪丢失和游戏结束页面返回主菜单。
- **Play Again** 使用当前控制模式开始新回合。
- 键盘备用控制使用方向键 **↑** 和 **↓**。

### 使用技术

- HTML 与 CSS
- 原生 JavaScript
- HTML5 Canvas
- 浏览器摄像头和媒体 API
- WebGazer.js 3.5.3
- MediaPipe Tasks Vision 1.0.1 与 Face Landmarker
- MediaPipe 面部表情系数 `eyeBlinkLeft` 和 `eyeBlinkRight`
- GitHub Actions 与 GitHub Pages

项目内置了 WebGazer 及其所需的旧版 Face Mesh 资源。眨眼检测所使用的新版 MediaPipe Tasks Vision 在隔离的隐藏 iframe 中运行，并复用现有摄像头视频帧，从而避免两套 MediaPipe/Emscripten 运行时在同一个 JavaScript 全局环境中发生冲突。

### 本地运行

摄像头相关的浏览器 API 通常需要安全上下文。现代浏览器会将 `localhost` 和 `127.0.0.1` 视为可用于开发的安全来源。请勿通过 `file://` 直接打开 `index.html` 进行摄像头测试。

在项目目录中运行：

```sh
python -m http.server 8000
```

然后打开 [http://localhost:8000](http://localhost:8000)。也可以使用 VS Code 的 **Live Server** 扩展。

### 部署

视控飞鸟可以直接作为静态网站部署到 GitHub Pages。仓库内的 GitHub Actions 工作流无需 Node、前端框架或构建系统即可发布网站。

在仓库设置中，将 **Pages → Build and deployment → Source** 设置为 **GitHub Actions**。请保持 HTTPS 开启，以便部署后的页面能够请求摄像头权限。

### 隐私说明

视线模式和眨眼模式都需要摄像头权限，用户必须通过浏览器明确授权。

摄像头画面在浏览器本地用于视线与面部特征估计。视控飞鸟不会有意录制、存储或上传摄像头视频。部分运行库、字体和 Face Landmarker 模型会从代码中配置的外部地址下载，但应用不会有意将摄像头图像发送到这些服务。

### 调试与诊断

游戏内的 Debug 面板提供可选的开发诊断功能，正常游玩并不需要使用这些工具。诊断内容包括：

- 原始视线 X、Y 坐标和过滤后的控制值
- `eyeBlinkLeft` 与 `eyeBlinkRight` 数值
- 眨眼状态、阈值、冷却和状态时间
- 摄像头帧率与 MediaPipe 推理帧率
- 原始眨眼候选、已接受眨眼和拍动事件
- 有长度限制的眨眼事件与拒绝原因日志
- 分开的普通与快速眨眼测试历史，以及可复制的诊断摘要

### 已知限制

- 普通摄像头视线追踪的精度远低于实验室专用眼动仪。
- 效果会受到光线、摄像头质量、面部位置、眼镜反光、校准质量、浏览器行为和设备性能影响。
- 摄像头预测存在噪声，因此视线控制可能具有一定难度。
- 快速、短促或不明显的眨眼可能偶尔被漏检或误判。
- MediaPipe 推理频率会因设备而异，并可能低于摄像头帧率。
- 大幅调整浏览器窗口尺寸可能降低视线精度；重新校准可能有所帮助。
- 性能较低的设备可能需要数秒才能完成初始模型加载。
- 本项目主要面向配有摄像头的桌面和笔记本浏览器，不同浏览器的兼容性可能不同。

### 健康声明

> 视控飞鸟是一款实验性交互与游戏原型，并非医疗设备。它不用于诊断、治疗、预防或治愈眼疲劳、视力问题或任何其他医疗状况。

### 项目状态

视控飞鸟目前是一个可运行的原型，已实现：

- 视线模式与眨眼模式
- 九点视线校准与验证
- 视线聚合、平滑、死区和连续跟随控制
- 三次眨眼准备测试与眨眼拍动玩法
- 障碍生成、碰撞检测、计分、暂停和重新开始
- 设置流程和游戏结束流程中的返回主菜单功能
- 摄像头共享，避免重复权限提示
- 可选的视线与眨眼诊断工具
- 无需构建的 GitHub Pages 静态部署

### 项目结构

- `index.html` — 页面、Canvas 和界面控件
- `style.css` 与 `mode-selection.css` — 响应式外观和交互样式
- `game.js` — 应用状态、控制、游戏模拟、碰撞、计分与绘制
- `gaze.js` — WebGazer 生命周期、校准与追踪状态
- `blink.js` — 眨眼追踪、状态机与诊断
- `blink-runtime.html` — 隔离的 MediaPipe Tasks Vision 推理环境
- `blink.test.js` — 确定性的眨眼状态机与诊断测试
- `webgazer.js` — 项目内置的 WebGazer 浏览器版本
- `mediapipe/face_mesh/` — WebGazer 所需的旧版 Face Mesh 资源
- `.github/workflows/pages.yml` — GitHub Pages 静态部署
- `THIRD_PARTY_NOTICES.md` 与 `LICENSES/` — 第三方声明和许可证

### 未来设想

以下内容是未来可能探索的方向，目前尚未实现：

- 对不同眼部行为作出反应的特殊障碍
- 远眺或暂时移开视线的休息机制
- 长时间闭眼交互
- 更多样的眼控玩法
- 改进视线控制参数
- 个性化眨眼校准
- 更多关卡和障碍模式
