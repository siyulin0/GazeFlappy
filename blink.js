'use strict';

// Blink detector tuning. MediaPipe blendshape scores are normalized to 0..1.
const BLINK_CLOSE_THRESHOLD = 0.55;
const BLINK_OPEN_THRESHOLD = 0.32;
const BLINK_MIN_CLOSED_MS = 50;
const BLINK_COOLDOWN_MS = 180;
const BLINK_INFERENCE_HZ = 20;
const BLINK_TRACKING_LOSS_MS = 1200;

class BlinkController {
  constructor({onBlink, onUpdate}) {
    this.onBlink = onBlink;
    this.onUpdate = onUpdate;
    this.landmarker = null;
    this.video = null;
    this.active = false;
    this.loopId = 0;
    this.lastInferenceAt = 0;
    this.lastVideoTime = -1;
    this.lastFaceAt = 0;
    this.closedSince = 0;
    this.lastBlinkAt = -Infinity;
    this.state = 'OPEN';
    this.armed = false;
    this.blinkCount = 0;
    this.left = null;
    this.right = null;
  }

  async initialize() {
    if (this.landmarker) return;
    const {FaceLandmarker, FilesetResolver} = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm');
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    const options = {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch (error) {
      console.warn('MediaPipe GPU setup failed; falling back to CPU.', error);
      options.baseOptions.delegate = 'CPU';
      this.landmarker = await FaceLandmarker.createFromOptions(vision, options);
    }
  }

  async start(video) {
    await this.initialize();
    this.video = video;
    if (!this.video?.srcObject) throw new Error('The shared webcam stream is not available.');
    this.reset(false);
    if (this.active) return;
    this.active = true;
    this.loopId = requestAnimationFrame((now) => this.tick(now));
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.loopId);
    this.loopId = 0;
    this.reset(false);
  }

  reset(resetCount=true) {
    this.state = 'OPEN';
    this.armed = false;
    this.closedSince = 0;
    this.lastBlinkAt = -Infinity;
    this.lastInferenceAt = 0;
    this.lastVideoTime = -1;
    this.lastFaceAt = 0;
    this.left = null;
    this.right = null;
    if (resetCount) this.blinkCount = 0;
    this.emitUpdate(performance.now());
  }

  tick(now) {
    if (!this.active) return;
    if (now-this.lastInferenceAt >= 1000/BLINK_INFERENCE_HZ && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastInferenceAt = now;
      this.lastVideoTime = this.video.currentTime;
      try {
        this.processResult(this.landmarker.detectForVideo(this.video, now), now);
      } catch (error) {
        console.error('Blink inference failed:', error);
        this.processTrackingLoss(now);
      }
    }
    this.emitUpdate(now);
    this.loopId = requestAnimationFrame((next) => this.tick(next));
  }

  processResult(result, now) {
    const categories = result?.faceBlendshapes?.[0]?.categories;
    if (!categories?.length) {
      this.processTrackingLoss(now);
      return;
    }
    const scores = Object.fromEntries(categories.map(({categoryName, score}) => [categoryName, score]));
    const left = scores.eyeBlinkLeft;
    const right = scores.eyeBlinkRight;
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      this.processTrackingLoss(now);
      return;
    }

    this.left = left;
    this.right = right;
    this.lastFaceAt = now;
    const bothClosed = left >= BLINK_CLOSE_THRESHOLD && right >= BLINK_CLOSE_THRESHOLD;
    const bothOpen = left <= BLINK_OPEN_THRESHOLD && right <= BLINK_OPEN_THRESHOLD;

    if (!this.armed) {
      if (bothOpen) this.armed = true;
      return;
    }

    if (this.state === 'OPEN') {
      if (bothClosed) {
        this.state = 'CLOSING';
        this.closedSince = now;
      }
    } else if (this.state === 'CLOSING') {
      if (!bothClosed) {
        this.state = 'OPEN';
        this.closedSince = 0;
      } else if (now-this.closedSince >= BLINK_MIN_CLOSED_MS) {
        this.state = 'CLOSED';
        if (now-this.lastBlinkAt >= BLINK_COOLDOWN_MS) {
          this.lastBlinkAt = now;
          this.blinkCount++;
          this.onBlink?.(this.blinkCount);
        }
      }
    } else if (this.state === 'CLOSED' && bothOpen) {
      this.state = 'OPEN';
      this.closedSince = 0;
      this.armed = true;
    }
  }

  processTrackingLoss(now) {
    this.left = null;
    this.right = null;
    this.state = 'OPEN';
    this.armed = false;
    this.closedSince = 0;
    this.emitUpdate(now);
  }

  isFresh(maxAgeMs=BLINK_TRACKING_LOSS_MS) {
    return this.active && this.lastFaceAt > 0 && performance.now()-this.lastFaceAt < maxAgeMs;
  }

  emitUpdate(now) {
    this.onUpdate?.({left:this.left,right:this.right,state:this.state,displayState:this.state==='CLOSED'?'CLOSED':'OPEN',closedMs:this.closedSince?Math.max(0,now-this.closedSince):0,blinkCount:this.blinkCount,tracking:this.isFresh()});
  }
}

window.BlinkController = BlinkController;
window.BLINK_TUNING = Object.freeze({BLINK_CLOSE_THRESHOLD,BLINK_OPEN_THRESHOLD,BLINK_MIN_CLOSED_MS,BLINK_COOLDOWN_MS,BLINK_INFERENCE_HZ,BLINK_TRACKING_LOSS_MS});
if (typeof module !== 'undefined') module.exports = {BlinkController, BLINK_CLOSE_THRESHOLD, BLINK_OPEN_THRESHOLD, BLINK_MIN_CLOSED_MS, BLINK_COOLDOWN_MS};
