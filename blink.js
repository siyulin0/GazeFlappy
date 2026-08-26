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
    this.runtimeFrame = null;
    this.runtimeReady = null;
    this.runtimeMessageHandler = null;
    this.processing = false;
    this.sessionId = 0;
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
    if (this.runtimeReady) return this.runtimeReady;
    this.runtimeReady = new Promise((resolve,reject) => {
      this.runtimeFrame = document.createElement('iframe');
      this.runtimeFrame.hidden = true;
      this.runtimeFrame.setAttribute('aria-hidden','true');
      this.runtimeFrame.src = new URL('blink-runtime.html',document.baseURI);
      let ready = false;
      this.runtimeMessageHandler = ({data,source,origin}) => {
        if (source !== this.runtimeFrame?.contentWindow || origin !== location.origin || data.source !== 'blink-runtime') return;
        if (data.type === 'ready') { ready=true; resolve(); return; }
        if (data.type === 'error') {
          if (!ready) reject(new Error(data.message));
          else console.error('Blink worker failed:', data.message);
          return;
        }
        if (data.type === 'scores') {
          if (data.sessionId !== this.sessionId) return;
          this.processing=false;
          if (!this.active) return;
          this.processScores(data.left,data.right,data.timestamp);
          return;
        }
        if (data.type === 'frame-error') {
          if (data.sessionId !== this.sessionId) return;
          this.processing=false;
          if (this.active) this.processTrackingLoss(data.timestamp);
          console.error('Blink inference failed:', data.message);
        }
      };
      addEventListener('message',this.runtimeMessageHandler);
      this.runtimeFrame.addEventListener('load',()=>this.runtimeFrame.contentWindow.postMessage({type:'init'},location.origin),{once:true});
      this.runtimeFrame.addEventListener('error',()=>reject(new Error('Blink runtime failed to load.')),{once:true});
      document.body.appendChild(this.runtimeFrame);
    });
    try {
      return await this.runtimeReady;
    } catch (error) {
      removeEventListener('message',this.runtimeMessageHandler);
      this.runtimeFrame?.remove();
      this.runtimeFrame=null;
      this.runtimeReady=null;
      this.runtimeMessageHandler=null;
      throw error;
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
    this.sessionId++;
    this.state = 'OPEN';
    this.armed = false;
    this.closedSince = 0;
    this.lastBlinkAt = -Infinity;
    this.lastInferenceAt = 0;
    this.lastVideoTime = -1;
    this.lastFaceAt = 0;
    this.processing = false;
    this.left = null;
    this.right = null;
    if (resetCount) this.blinkCount = 0;
    this.emitUpdate(performance.now());
  }

  async tick(now) {
    if (!this.active) return;
    if (!this.processing && now-this.lastInferenceAt >= 1000/BLINK_INFERENCE_HZ && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastInferenceAt = now;
      this.lastVideoTime = this.video.currentTime;
      this.processing = true;
      try {
        const frame = await createImageBitmap(this.video);
        if (this.active) this.runtimeFrame.contentWindow.postMessage({type:'frame',frame,timestamp:now,sessionId:this.sessionId},location.origin,[frame]);
        else { frame.close(); this.processing=false; }
      } catch (error) {
        this.processing=false;
        console.error('Blink frame capture failed:', error);
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
    this.processScores(scores.eyeBlinkLeft,scores.eyeBlinkRight,now);
  }

  processScores(left, right, now) {
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
