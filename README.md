# Gaze Flappy | 视线飞鸟

[Play online / 在线体验](https://siyulin0.github.io/GazeFlappy/)

## English

### About

Gaze Flappy is an experimental browser game that explores webcam-based eye tracking as a playful interaction method. Using [WebGazer.js](https://webgazer.cs.brown.edu/), it estimates the player’s gaze locally in the browser and translates vertical gaze movement into smooth bird control. Look up or down to guide the bird through obstacles—no click-to-flap controls are used.

Friends can play from the hosted link without installing anything or running a local server. Gaze Flappy is an interaction prototype, not a medical device, and makes no claim to treat eye strain or improve vision.

### Requirements

- Laptop or desktop with a front-facing webcam
- Current Chrome or Edge recommended; Firefox is also supported by WebGazer
- Camera permission
- HTTPS when hosted, or `http://localhost` / `http://127.0.0.1` during local development
- Phones are not a priority for this prototype

### Play online

Open [https://siyulin0.github.io/GazeFlappy/](https://siyulin0.github.io/GazeFlappy/), click **Enable Eye Tracking**, and allow camera access.

### Run locally

Do not open `index.html` directly with a `file://` URL. From the project folder, run:

```sh
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). HTTPS is not required on localhost.

Alternatively, use the VS Code **Live Server** extension and choose **Open with Live Server** on `index.html`.

### Controls and game flow

1. Click **Enable Eye Tracking**. Camera permission is requested only after this click.
2. Look directly at each of the nine calibration targets and click each target three times.
3. During validation, follow the mint target. The orange cursor shows the estimated gaze location.
4. Start the game and look higher or lower on the screen to guide the bird.

- **Pause** freezes the round. Hiding the browser tab also pauses it.
- Tracking loss longer than 1.6 seconds pauses the game; it resumes when tracking returns.
- **Show gaze cursor** displays the estimate during gameplay and is off by default.
- **Debug** shows gaze coordinates, filtered Y, bird Y, FPS, and tracking status.
- **Use keyboard** enables the fallback controls: hold **Arrow Up** or **Arrow Down**.
- **Recalibrate** clears the gaze model and repeats calibration.
- **Play Again** restarts without refreshing the page.

### Privacy

Camera images are processed locally in the browser for gaze estimation. Gaze Flappy does not intentionally record, store, or upload camera images. Calibration persistence is disabled. WebGazer and the required MediaPipe model files are bundled with this repository; only the optional Google font is fetched remotely.

### Publish on GitHub Pages

This repository includes a no-build deployment workflow. Node, React, Vite, and package installation are not required.

1. Push the complete project, including `.github`, `mediapipe`, and all `.wasm` and `.data` files.
2. Open the repository’s **Settings → Pages**.
3. Set **Build and deployment → Source** to **GitHub Actions**.
4. Open **Actions** and wait for **Deploy Gaze Flappy to GitHub Pages** to complete.
5. Keep **Enforce HTTPS** enabled so webcam permission works on the hosted site.

### Tuning

The main tuning constants are near the top of `game.js`:

- `GAZE_SMOOTHING` — higher is more responsive; lower is steadier. Try `0.08–0.15`.
- `GAZE_DEAD_ZONE` — higher ignores more small gaze changes. Try `20–40` pixels.
- `BIRD_FOLLOW_SPEED` — controls how quickly the bird catches its filtered target.
- `TRACKING_LOSS_MS` — delay before tracking loss pauses the game.
- `CALIBRATION_CLICKS` — samples collected at each calibration point.

Tune smoothing first, then the dead zone, and finally the follow speed.

### Known limitations

- Accuracy varies with lighting, webcam quality, glasses, reflections, head position, calibration quality, browser, and screen size.
- Webcam tracking is much less accurate than a laboratory eye tracker.
- A substantial browser resize can reduce accuracy; recalibrate afterward.
- Initial model loading may take several seconds on slower laptops.
- The application is designed primarily for laptop and desktop displays.
- This prototype is not a medical device.

### Troubleshooting

If camera setup appears stuck, hard-refresh Chrome with **Ctrl+Shift+R**. The video can appear before the face-landmark model finishes loading. If calibration still does not appear, confirm that `http://localhost:8000/mediapipe/face_mesh/face_mesh.binarypb` opens without a 404 error.

### Project structure

- `index.html` — screens, Canvas, and interface controls
- `style.css` — responsive visual design
- `game.js` — state machine, gaze filtering, simulation, collision, and rendering
- `gaze.js` — WebGazer lifecycle, calibration, and tracking status
- `webgazer.js` — vendored WebGazer 3.5.3 browser bundle
- `mediapipe/face_mesh/` — matching MediaPipe model and WASM runtime
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment
- `.nojekyll` — plain static-site configuration
- `THIRD_PARTY_NOTICES.md` and `LICENSES/` — third-party notices and licenses

Future extensions can add timed look-away breaks, intentional blink mechanics, and obstacle patterns designed around different gaze movements.

---

## 中文（简体）

### 项目简介

Gaze Flappy（视线飞鸟）是一款实验性浏览器游戏，用于探索将摄像头眼动追踪作为趣味交互方式的可行性。游戏通过 [WebGazer.js](https://webgazer.cs.brown.edu/) 在浏览器本地估计玩家的视线位置，并把垂直方向的视线移动转换为小鸟的平滑移动。玩家向上或向下看即可引导小鸟穿越障碍；本游戏不使用传统的点击拍翅操作。

朋友可以直接通过在线链接游玩，无需安装软件或启动本地服务器。Gaze Flappy 仅为交互原型，并非医疗设备，也不宣称能够治疗眼疲劳或改善视力。

### 使用要求

- 配有前置摄像头的笔记本电脑或台式电脑
- 推荐使用最新版 Chrome 或 Edge；WebGazer 也支持 Firefox
- 授予浏览器摄像头权限
- 在线部署时使用 HTTPS；本地开发可使用 `http://localhost` 或 `http://127.0.0.1`
- 当前原型不以手机为主要支持平台

### 在线体验

打开 [https://siyulin0.github.io/GazeFlappy/](https://siyulin0.github.io/GazeFlappy/)，点击 **Enable Eye Tracking（启用眼动追踪）**，然后允许浏览器使用摄像头。

### 本地运行

请勿通过 `file://` 直接打开 `index.html`。在项目文件夹中运行：

```sh
python -m http.server 8000
```

然后打开 [http://localhost:8000](http://localhost:8000)。在 localhost 上进行本地开发不需要 HTTPS。也可以使用 VS Code 的 **Live Server** 扩展打开 `index.html`。

### 操作与游戏流程

1. 点击 **Enable Eye Tracking**。只有点击后，浏览器才会请求摄像头权限。
2. 直视九个校准点，并在每个点上点击三次。
3. 在验证阶段，用视线跟随薄荷绿色目标；橙色光标表示系统估计的视线位置。
4. 开始游戏后，向屏幕上方或下方看，控制小鸟垂直移动。

- **Pause（暂停）** 会冻结当前回合；隐藏浏览器标签页也会自动暂停。
- 如果超过 1.6 秒没有收到视线数据，游戏会暂停；恢复追踪后会自动继续。
- **Show gaze cursor（显示视线光标）** 可在游戏中显示估计位置，默认关闭。
- **Debug（调试）** 显示视线坐标、滤波后的 Y 值、小鸟位置、帧率和追踪状态。
- **Use keyboard（使用键盘）** 启用备用控制：按住方向键 **↑** 或 **↓**。
- **Recalibrate（重新校准）** 清除当前模型并重新进行九点校准。
- **Play Again（再玩一次）** 无需刷新页面即可重新开始。

### 隐私说明

摄像头画面仅在浏览器本地用于视线估计。Gaze Flappy 不会有意录制、存储或上传摄像头图像，校准数据持久化功能也已关闭。WebGazer 和所需的 MediaPipe 模型文件均包含在本仓库中；只有可选的 Google 字体会从外部加载。

### 发布到 GitHub Pages

本仓库已包含无需构建的部署工作流，不需要 Node、React、Vite 或任何软件包安装步骤。

1. 推送完整项目，包括 `.github`、`mediapipe` 以及所有 `.wasm` 和 `.data` 文件。
2. 打开仓库的 **Settings → Pages**。
3. 将 **Build and deployment → Source** 设置为 **GitHub Actions**。
4. 打开 **Actions**，等待 **Deploy Gaze Flappy to GitHub Pages** 工作流完成。
5. 保持 **Enforce HTTPS** 开启，以确保在线页面可以请求摄像头权限。

### 参数调节

主要参数位于 `game.js` 文件顶部：

- `GAZE_SMOOTHING` — 数值越高响应越快，越低则更稳定；建议范围为 `0.08–0.15`。
- `GAZE_DEAD_ZONE` — 数值越高，忽略的小幅视线变化越多；建议范围为 `20–40` 像素。
- `BIRD_FOLLOW_SPEED` — 控制小鸟追随滤波目标位置的速度。
- `TRACKING_LOSS_MS` — 眼动追踪丢失后自动暂停前的等待时间。
- `CALIBRATION_CLICKS` — 每个校准点采集的样本次数。

建议依次调节平滑系数、死区大小和跟随速度，并且每次只修改一个参数。

### 已知限制

- 准确度会受到光线、摄像头质量、眼镜反光、头部位置、校准质量、浏览器和屏幕尺寸的影响。
- 普通摄像头眼动追踪的准确度远低于实验室级眼动仪。
- 大幅调整浏览器窗口尺寸可能降低准确度；调整后应重新校准。
- 在性能较低的笔记本电脑上，首次加载模型可能需要数秒。
- 本应用主要针对笔记本电脑和台式电脑设计。
- 本原型并非医疗设备。

### 故障排除

如果摄像头设置界面一直停留，请在 Chrome 中按 **Ctrl+Shift+R** 强制刷新。视频画面可能先于人脸特征模型完成加载。如果仍未进入校准界面，请确认 `http://localhost:8000/mediapipe/face_mesh/face_mesh.binarypb` 可以打开且没有出现 404 错误。

### 项目结构

- `index.html` — 页面、Canvas 画布和界面控件
- `style.css` — 响应式视觉设计
- `game.js` — 状态管理、视线滤波、游戏模拟、碰撞检测和绘制
- `gaze.js` — WebGazer 生命周期、校准和追踪状态
- `webgazer.js` — 项目内置的 WebGazer 3.5.3 浏览器版本
- `mediapipe/face_mesh/` — 匹配的 MediaPipe 模型和 WASM 运行文件
- `.github/workflows/pages.yml` — 自动部署到 GitHub Pages
- `.nojekyll` — 纯静态网站配置
- `THIRD_PARTY_NOTICES.md` 和 `LICENSES/` — 第三方声明与许可证

未来版本可以加入定时远眺休息、主动眨眼机制，以及针对不同视线移动模式设计的障碍布局。
