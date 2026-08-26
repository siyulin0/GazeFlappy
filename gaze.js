/* Gaze tracking adapter. Gameplay never touches WebGazer directly. */
class GazeController {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.initialized = false;
    this.available = false;
    this.lastSampleAt = 0;
    this.raw = { x: null, y: null };
  }

  async start() {
    const isAllowedCameraOrigin =
      window.location.protocol === 'https:' ||
      (window.location.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname));
    if (!isAllowedCameraOrigin) {
      throw new Error('Camera access requires HTTPS, http://localhost, or http://127.0.0.1.');
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support webcam access.');
    if (!window.webgazer) throw new Error('WebGazer could not be loaded. Check your internet connection.');
    if (this.initialized) {
      await window.webgazer.resume();
      this.available = true;
      return;
    }

    const wg = window.webgazer;
    wg
      .saveDataAcrossSessions(false)
      .setRegression('ridge')
      .applyKalmanFilter(true)
      .setGazeListener((data) => {
        if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
        this.raw = { x: data.x, y: data.y };
        this.lastSampleAt = performance.now();
        this.onUpdate(this.raw);
      });

    this.setWebGazerVisibility(true);
    await wg.begin();
    this.initialized = true;
    this.available = true;
  }

  recordPoint(x, y) {
    if (this.initialized && window.webgazer?.recordScreenPosition) {
      window.webgazer.recordScreenPosition(x, y, 'click');
    }
  }

  recalibrate() {
    if (this.initialized) window.webgazer?.clearData();
    this.lastSampleAt = 0;
  }

  setPreview(visible) {
    if (!this.initialized) return;
    this.setWebGazerVisibility(visible);
  }

  async pause() {
    if (this.initialized) await window.webgazer?.pause();
  }

  getVideoElement() {
    return document.getElementById('webgazerVideoFeed');
  }

  setWebGazerVisibility(visible) {
    const wg = window.webgazer;
    // showVideo is the official API; showVideoPreview exists in some builds.
    if (typeof wg.showVideo === 'function') wg.showVideo(visible);
    else if (typeof wg.showVideoPreview === 'function') wg.showVideoPreview(visible);
    if (typeof wg.showFaceOverlay === 'function') wg.showFaceOverlay(visible);
    if (typeof wg.showFaceFeedbackBox === 'function') wg.showFaceFeedbackBox(visible);
    if (typeof wg.showPredictionPoints === 'function') wg.showPredictionPoints(false);
  }

  isFresh(maxAgeMs = 1500) {
    return this.available && performance.now() - this.lastSampleAt < maxAgeMs;
  }
}

window.GazeController = GazeController;
