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

console.log('Blink state-machine tests passed.');
