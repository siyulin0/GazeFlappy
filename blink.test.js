'use strict';

global.window = {};
const {BlinkController} = require('./blink.js');

function result(left, right) {
  return {faceBlendshapes:[{categories:[{categoryName:'eyeBlinkLeft',score:left},{categoryName:'eyeBlinkRight',score:right}]}]};
}

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

let flaps = 0;
const detector = new BlinkController({onBlink:()=>flaps++});

// Establish a visible open state, then confirm one normal blink.
detector.processResult(result(.05,.06), 0);
detector.processResult(result(.8,.78), 100);
detector.processResult(result(.82,.8), 155);
expect(flaps, 1, 'normal blink');

// Holding both eyes closed must not repeat the flap.
detector.processResult(result(.9,.9), 400);
detector.processResult(result(.92,.91), 800);
expect(flaps, 1, 'held closure');

// Reopen, then two sufficiently separated blinks produce two more flaps.
detector.processResult(result(.05,.04), 900);
detector.processResult(result(.8,.8), 1000);
detector.processResult(result(.8,.8), 1055);
detector.processResult(result(.04,.05), 1100);
detector.processResult(result(.8,.8), 1250);
detector.processResult(result(.8,.8), 1305);
expect(flaps, 3, 'two rapid blinks');

// A single-frame closure is rejected.
detector.processResult(result(.04,.04), 1400);
detector.processResult(result(.8,.8), 1500);
detector.processResult(result(.05,.05), 1520);
expect(flaps, 3, 'noisy closure');

// Tracking loss disarms detection; returning closed cannot create a blink.
detector.processTrackingLoss(1600);
detector.processResult(result(.9,.9), 1700);
detector.processResult(result(.9,.9), 1800);
expect(flaps, 3, 'tracking-loss safety');
detector.processResult(result(.04,.04), 1900);

// Reset/restart also requires a visible open frame before the next blink.
detector.reset(false);
detector.processResult(result(.9,.9), 2000);
detector.processResult(result(.9,.9), 2100);
expect(flaps, 3, 'restart safety');
detector.processResult(result(.04,.04), 2200);
detector.processResult(result(.8,.8), 2300);
detector.processResult(result(.8,.8), 2355);
expect(flaps, 4, 'post-restart blink');

// Diagnostics count threshold crossings before acceptance filters.
const diagnostics = new BlinkController({onBlink:()=>{}});
diagnostics.processResult(result(.05,.05), 0);
diagnostics.processResult(result(.8,.8), 100);
diagnostics.processResult(result(.8,.8), 155);
diagnostics.processResult(result(.05,.05), 170);
diagnostics.processResult(result(.8,.8), 200);
diagnostics.processResult(result(.8,.8), 255);
expect(diagnostics.rawCandidateCount, 2, 'raw candidate diagnostics');
expect(diagnostics.acceptedBlinkCount, 1, 'accepted blink diagnostics');
expect(diagnostics.events.some(({label})=>label === 'rejected: cooldown active'), true, 'cooldown rejection log');
expect(diagnostics.rejectionCounts['cooldown active'], 1, 'cooldown rejection count');
diagnostics.recordFlap(260);
expect(diagnostics.flapCount, 1, 'flap diagnostics');
diagnostics.resetDiagnostics(300);
expect(diagnostics.rawCandidateCount, 0, 'reset raw candidates');
expect(diagnostics.acceptedBlinkCount, 0, 'reset accepted blinks');
expect(diagnostics.flapCount, 0, 'reset flaps');
expect(Object.keys(diagnostics.rejectionCounts).length, 0, 'reset rejection counts');
expect(diagnostics.events.at(-1).label, 'DIAGNOSTICS RESET', 'reset log');

diagnostics.recordInference(1000);
diagnostics.recordInference(1050);
diagnostics.recordInference(1100);
expect(Math.round(diagnostics.diagnosticInferenceIntervalCount*1000/diagnostics.diagnosticInferenceIntervalTotal), 20, 'average inference FPS');

console.log('Blink state-machine tests passed.');
