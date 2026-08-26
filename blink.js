'use strict';

// Blink detector tuning. MediaPipe blendshape scores are normalized to 0..1.
const BLINK_CLOSE_THRESHOLD = 0.45;
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
    this.rawClosed = false;
    this.partialClosed = false;
    this.trackingWasAvailable = false;
    this.lastOpenAt = performance.now();
    this.lastClosedAt = 0;
    this.rawCandidateCount = 0;
    this.acceptedBlinkCount = 0;
    this.flapCount = 0;
    this.mediaPipeFrames = 0;
    this.inferenceTimes = [];
    this.diagnosticInferenceIntervalTotal = 0;
    this.diagnosticInferenceIntervalCount = 0;
    this.lastDiagnosticInferenceAt = 0;
    this.videoFrameTimes = [];
    this.lastObservedVideoTime = -1;
    this.events = [];
    this.rejectionCounts = {};
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
          this.recordInference(performance.now());
          this.processScores(data.left,data.right,data.timestamp,data.status);
          return;
        }
        if (data.type === 'frame-error') {
          if (data.sessionId !== this.sessionId) return;
          this.processing=false;
          this.recordInference(performance.now());
          const wasTracking = this.trackingWasAvailable;
          if (this.active) this.processTrackingLoss(data.timestamp);
          if (wasTracking) this.logEvent('rejected: invalid MediaPipe result',data.timestamp);
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
    this.rawClosed = false;
    this.partialClosed = false;
    this.trackingWasAvailable = false;
    this.lastObservedVideoTime = -1;
    this.left = null;
    this.right = null;
    if (resetCount) this.blinkCount = 0;
    this.emitUpdate(performance.now());
  }

  async tick(now) {
    if (!this.active) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastObservedVideoTime) {
      this.lastObservedVideoTime = this.video.currentTime;
      this.videoFrameTimes.push(now);
      this.trimTimes(this.videoFrameTimes,now);
    }
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
      this.processScores(null,null,now,'face-unavailable');
      return;
    }
    const scores = Object.fromEntries(categories.map(({categoryName, score}) => [categoryName, score]));
    this.processScores(scores.eyeBlinkLeft,scores.eyeBlinkRight,now);
  }

  processScores(left, right, now, status='valid') {
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      const label=status==='face-unavailable'?'face tracking unavailable':'invalid MediaPipe result';
      if (this.trackingWasAvailable) this.logEvent(`rejected: ${label}`,now);
      this.processTrackingLoss(now);
      return;
    }

    this.left = left;
    this.right = right;
    this.lastFaceAt = now;
    this.trackingWasAvailable = true;
    const bothClosed = left >= BLINK_CLOSE_THRESHOLD && right >= BLINK_CLOSE_THRESHOLD;
    const bothOpen = left <= BLINK_OPEN_THRESHOLD && right <= BLINK_OPEN_THRESHOLD;
    const eitherClosed = left >= BLINK_CLOSE_THRESHOLD || right >= BLINK_CLOSE_THRESHOLD;

    if (bothClosed && !this.rawClosed) {
      this.rawClosed = true;
      this.rawCandidateCount++;
      this.logEvent('RAW CLOSED candidate',now);
      if (!this.armed) this.logEvent('rejected: detector not re-armed',now);
    } else if (!bothClosed) {
      this.rawClosed = false;
    }
    if (eitherClosed && !bothClosed && !this.partialClosed) {
      this.partialClosed = true;
      this.logEvent('rejected: eyes not both closed enough',now);
    } else if (!eitherClosed || bothClosed) {
      this.partialClosed = false;
    }

    if (!this.armed) {
      if (bothOpen) {
        this.armed = true;
        this.lastOpenAt = now;
        this.logEvent('OPEN — detector armed',now);
      }
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
        this.lastOpenAt = now;
        this.logEvent('rejected: closure duration too short',now);
        this.logEvent('OPEN',now);
      } else if (now-this.closedSince >= BLINK_MIN_CLOSED_MS) {
        this.state = 'CLOSED';
        this.lastClosedAt = now;
        this.logEvent('CLOSED confirmed',now);
        if (now-this.lastBlinkAt >= BLINK_COOLDOWN_MS) {
          this.lastBlinkAt = now;
          this.blinkCount++;
          this.acceptedBlinkCount++;
          this.logEvent('BLINK ACCEPTED',now);
          this.onBlink?.(this.blinkCount);
        } else {
          this.logEvent('rejected: cooldown active',now);
        }
      }
    } else if (this.state === 'CLOSED' && bothOpen) {
      this.state = 'OPEN';
      this.closedSince = 0;
      this.armed = true;
      this.lastOpenAt = now;
      this.logEvent('OPEN — detector re-armed',now);
    }
  }

  processTrackingLoss(now) {
    this.left = null;
    this.right = null;
    this.state = 'OPEN';
    this.armed = false;
    this.rawClosed = false;
    this.partialClosed = false;
    this.trackingWasAvailable = false;
    this.closedSince = 0;
    this.emitUpdate(now);
  }

  recordInference(now) {
    if(this.lastDiagnosticInferenceAt){
      this.diagnosticInferenceIntervalTotal += now-this.lastDiagnosticInferenceAt;
      this.diagnosticInferenceIntervalCount++;
    }
    this.lastDiagnosticInferenceAt=now;
    this.mediaPipeFrames++;
    this.inferenceTimes.push(now);
    this.trimTimes(this.inferenceTimes,now);
  }

  trimTimes(times,now) {
    while(times.length && times[0] < now-2000) times.shift();
  }

  rate(times) {
    return times.length>1 ? (times.length-1)*1000/(times[times.length-1]-times[0]) : 0;
  }

  logEvent(label,now=performance.now()) {
    this.events.push({time:now,label});
    if(this.events.length>25)this.events.shift();
    if(label.startsWith('rejected: ')){
      const reason=label.slice(10);
      this.rejectionCounts[reason]=(this.rejectionCounts[reason]||0)+1;
    }
  }

  recordFlap(now=performance.now()) {
    this.flapCount++;
    this.logEvent('FLAP EMITTED',now);
  }

  recordGameRejection(now=performance.now()) {
    this.logEvent('rejected: game not in Blink Mode',now);
  }

  resetDiagnostics(now=performance.now()) {
    this.rawCandidateCount=0;
    this.acceptedBlinkCount=0;
    this.flapCount=0;
    this.mediaPipeFrames=0;
    this.inferenceTimes=[];
    this.diagnosticInferenceIntervalTotal=0;
    this.diagnosticInferenceIntervalCount=0;
    this.lastDiagnosticInferenceAt=0;
    this.videoFrameTimes=[];
    this.events=[];
    this.rejectionCounts={};
    this.logEvent('DIAGNOSTICS RESET',now);
    this.emitUpdate(now);
  }

  isFresh(maxAgeMs=BLINK_TRACKING_LOSS_MS) {
    return this.active && this.lastFaceAt > 0 && performance.now()-this.lastFaceAt < maxAgeMs;
  }

  emitUpdate(now) {
    this.trimTimes(this.inferenceTimes,now);
    this.trimTimes(this.videoFrameTimes,now);
    this.onUpdate?.({left:this.left,right:this.right,state:this.state,displayState:this.state==='CLOSED'?'CLOSED':'OPEN',closedMs:this.closedSince?Math.max(0,now-this.closedSince):0,blinkCount:this.blinkCount,tracking:this.isFresh(),diagnostics:{cooldownActive:now-this.lastBlinkAt<BLINK_COOLDOWN_MS,sinceLastBlink:Number.isFinite(this.lastBlinkAt)?Math.max(0,now-this.lastBlinkAt):null,sinceOpen:this.lastOpenAt?Math.max(0,now-this.lastOpenAt):null,sinceClosed:this.lastClosedAt?Math.max(0,now-this.lastClosedAt):null,videoFps:this.rate(this.videoFrameTimes),mediaPipeFps:this.rate(this.inferenceTimes),averageMediaPipeFps:this.diagnosticInferenceIntervalTotal?this.diagnosticInferenceIntervalCount*1000/this.diagnosticInferenceIntervalTotal:0,mediaPipeFrames:this.mediaPipeFrames,rawCandidates:this.rawCandidateCount,acceptedBlinks:this.acceptedBlinkCount,flaps:this.flapCount,rejections:{...this.rejectionCounts},events:this.events.slice()}});
  }
}

window.BlinkController = BlinkController;
window.BLINK_TUNING = Object.freeze({BLINK_CLOSE_THRESHOLD,BLINK_OPEN_THRESHOLD,BLINK_MIN_CLOSED_MS,BLINK_COOLDOWN_MS,BLINK_INFERENCE_HZ,BLINK_TRACKING_LOSS_MS});
if (typeof module !== 'undefined') module.exports = {BlinkController, BLINK_CLOSE_THRESHOLD, BLINK_OPEN_THRESHOLD, BLINK_MIN_CLOSED_MS, BLINK_COOLDOWN_MS};
