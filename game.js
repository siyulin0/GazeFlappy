'use strict';

// Primary tuning controls: increase smoothing/follow speed for responsiveness;
// increase dead zone for stability. Values are in viewport pixels except speed.
const GAZE_SMOOTHING = 0.11;
const GAZE_DEAD_ZONE = 28;
const BIRD_FOLLOW_SPEED = 5.2;
const GAZE_CONTROL_HZ = 10;
const TRACKING_LOSS_MS = 1600;
const CALIBRATION_CLICKS = 3;
const BLINK_GRAVITY = 520;
const BLINK_FLAP_VELOCITY = -390;
const BLINK_MAX_FALL_SPEED = 330;
const BLINK_TEST_REQUIRED = 3;

const STATES = Object.freeze({WELCOME:'WELCOME',CAMERA_SETUP:'CAMERA_SETUP',CALIBRATION:'CALIBRATION',BLINK_TEST:'BLINK_TEST',READY:'READY',PLAYING:'PLAYING',PAUSED:'PAUSED',GAME_OVER:'GAME_OVER'});
const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const screens = {WELCOME:$('welcomeScreen'),CAMERA_SETUP:$('cameraScreen'),CALIBRATION:$('calibrationScreen'),BLINK_TEST:$('blinkTestScreen'),READY:$('readyScreen'),PAUSED:$('pauseScreen'),GAME_OVER:$('gameOverScreen')};

let state = STATES.WELCOME;
let previousState = null;
let controlMode = 'gaze';
let smoothedViewportY = innerHeight / 2;
let targetViewportY = smoothedViewportY;
let lastFrame = performance.now();
let fps = 60;
let keyDirection = 0;
let calibrationCounts = Array(9).fill(0);
let validationTimer = null;
let autoPausedForGaze = false;
let gazeYSamples = [];
let latestMedianControlY = null;
let lastGazeControlAt = performance.now();
let gazeCalibrated = false;
let flapEventCount = 0;
let blinkTelemetry = {left:null,right:null,state:'OPEN',displayState:'OPEN',closedMs:0,blinkCount:0,tracking:false};

const game = {width:1280,height:720,bird:{x:270,y:360,r:24,targetY:360},pipes:[],score:0,best:Number(localStorage.getItem('gazeFlappyBest')||0),elapsed:0,spawnTimer:0};
const gaze = new window.GazeController(({x,y}) => {
  if (state === STATES.PLAYING && controlMode === 'gaze') gazeYSamples.push(y);
  if (!Number.isFinite(smoothedViewportY)) smoothedViewportY = y;
  $('gazeCursor').style.left = `${x}px`;
  $('gazeCursor').style.top = `${y}px`;
});
const blink = new window.BlinkController({
  onBlink(count) {
    if (state === STATES.BLINK_TEST) updateBlinkTest(count);
    if (state === STATES.PLAYING && controlMode === 'blink') {
      game.bird.vy = BLINK_FLAP_VELOCITY;
      flapEventCount++;
    }
  },
  onUpdate(data) {
    blinkTelemetry = data;
    if (state === STATES.BLINK_TEST) {
      $('blinkTestEyes').textContent = `Eyes: ${data.displayState}`;
      $('blinkTestStatus').textContent = data.blinkCount>=BLINK_TEST_REQUIRED ? 'Blink detection is ready.' : data.tracking ? 'Face tracking ready.' : 'Finding your face…';
    }
  }
});

function resetGazeControlWindow(now=performance.now()) {
  gazeYSamples = [];
  lastGazeControlAt = now;
}

function updateGazeControlTarget(now) {
  if (now-lastGazeControlAt < 1000/GAZE_CONTROL_HZ) return;
  lastGazeControlAt = now;
  if (!gazeYSamples.length) return;
  const sorted = gazeYSamples.slice().sort((a,b)=>a-b);
  const middle = Math.floor(sorted.length/2);
  latestMedianControlY = sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
  targetViewportY = latestMedianControlY;
  gazeYSamples = [];
}

function setState(next) {
  state = next;
  Object.entries(screens).forEach(([name,el]) => el.classList.toggle('hidden', name !== next));
  $('hud').classList.toggle('hidden', ![STATES.PLAYING,STATES.PAUSED,STATES.GAME_OVER].includes(next));
  $('pauseButton').classList.toggle('hidden', ![STATES.PLAYING,STATES.PAUSED].includes(next));
  if (next !== STATES.CALIBRATION) clearInterval(validationTimer);
}

function resizeCanvas() {
  const rect = $('stage').getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
  canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
  game.width = rect.width; game.height = rect.height;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function resetGame() {
  game.bird = {x:Math.max(120,game.width*.22),y:game.height*.5,r:22,targetY:game.height*.5,vy:0};
  game.pipes=[]; game.score=0; game.elapsed=0; game.spawnTimer=0.8;
  smoothedViewportY = innerHeight/2; targetViewportY=smoothedViewportY;
  latestMedianControlY=null; resetGazeControlWindow();
  $('scoreValue').textContent='0'; autoPausedForGaze=false; flapEventCount=0;
}

function startRound() { gaze.setPreview(false); resetGame(); lastFrame=performance.now(); setState(STATES.PLAYING); }

async function enableTracking() {
  controlMode='gaze'; blink.stop();
  $('controlBadge').textContent='Control: Gaze Mode'; $('modeButton').textContent='Use Blink Mode';
  setState(STATES.CAMERA_SETUP); $('cameraStatus').textContent='Allow camera access in your browser when prompted.'; $('cameraErrorActions').classList.add('hidden');
  try { await gaze.start(); gaze.setPreview(true); if(gazeCalibrated){gaze.setPreview(false);setState(STATES.READY)}else beginCalibration(true); }
  catch (error) { $('cameraStatus').textContent = friendlyCameraError(error); $('cameraErrorActions').classList.remove('hidden'); }
}

async function enableBlinkMode() {
  controlMode='blink'; resetGazeControlWindow();
  $('controlBadge').textContent='Control: Blink Mode'; $('modeButton').textContent='Use Gaze Mode';
  setState(STATES.CAMERA_SETUP); $('cameraStatus').textContent='Preparing Blink Mode with the existing webcam…'; $('cameraErrorActions').classList.add('hidden');
  try {
    await gaze.start();
    gaze.setPreview(false);
    await gaze.pause();
    await blink.start(gaze.getVideoElement());
    beginBlinkTest();
  } catch (error) {
    $('cameraStatus').textContent=`Blink tracking could not start. ${error?.message||'Please try again.'}`;
    $('cameraErrorActions').classList.remove('hidden');
  }
}

function beginBlinkTest() {
  controlMode='blink'; blink.reset(true); setState(STATES.BLINK_TEST);
  $('blinkTestEyes').textContent='Eyes: WAITING';
  $('blinkTestCount').textContent=`Blinks detected: 0 / ${BLINK_TEST_REQUIRED}`;
  $('blinkTestStatus').textContent='Finding your face…';
  $('startBlinkButton').disabled=true;
}

function updateBlinkTest(count) {
  const ready=count>=BLINK_TEST_REQUIRED;
  $('blinkTestCount').textContent=`Blinks detected: ${Math.min(count,BLINK_TEST_REQUIRED)} / ${BLINK_TEST_REQUIRED}`;
  $('startBlinkButton').disabled=!ready;
  if(ready)$('blinkTestStatus').textContent='Blink detection is ready.';
}

function friendlyCameraError(error) {
  const denied = error?.name === 'NotAllowedError' || /denied|permission/i.test(error?.message||'');
  return denied ? 'Camera permission was denied. You can allow it in your browser settings, then try again—or use keyboard mode.' : `Eye tracking could not start. ${error?.message || 'Please try again.'}`;
}

function beginCalibration(clear=true) {
  controlMode='gaze'; blink.stop();
  if (clear) gaze.recalibrate();
  resetGazeControlWindow(); latestMedianControlY=null;
  calibrationCounts=Array(9).fill(0); setState(STATES.CALIBRATION); gaze.setPreview(true);
  $('calibrationTitle').textContent='Look at each dot and click'; $('calibrationHint').classList.remove('hidden');
  $('calibrationPoints').classList.remove('hidden'); $('validationPanel').classList.add('hidden');
  const host=$('calibrationPoints'); host.replaceChildren();
  for(let i=0;i<9;i++){const b=document.createElement('button');b.className='cal-point';b.type='button';b.textContent=CALIBRATION_CLICKS;b.setAttribute('aria-label',`Calibration point ${i+1}`);b.addEventListener('click',(e)=>calibrationClick(i,e,b));host.appendChild(b)}
  updateCalibrationProgress();
}

function calibrationClick(index,event,button) {
  event.stopPropagation(); const rect=button.getBoundingClientRect();
  gaze.recordPoint(rect.left+rect.width/2,rect.top+rect.height/2);
  calibrationCounts[index]++; const left=CALIBRATION_CLICKS-calibrationCounts[index];
  button.textContent=left||'✓'; if(!left)button.classList.add('done'); updateCalibrationProgress();
  if(calibrationCounts.every(v=>v>=CALIBRATION_CLICKS)) startValidation();
}

function updateCalibrationProgress(){const done=calibrationCounts.filter(v=>v>=CALIBRATION_CLICKS).length;$('calibrationProgress').textContent=`Calibration: ${done} / 9`;$('calibrationBar').style.width=`${done/9*100}%`}
function startValidation(){
  $('calibrationTitle').textContent='Quick accuracy check'; $('calibrationHint').classList.add('hidden'); $('calibrationPoints').classList.add('hidden'); $('validationPanel').classList.remove('hidden');
  const positions=[[15,18],[72,20],[48,47],[20,70],[78,68]];let i=0;const move=()=>{const [x,y]=positions[i++%positions.length];$('validationTarget').style.left=`${x}%`;$('validationTarget').style.top=`${y}%`};move();validationTimer=setInterval(move,1400);
}

function setKeyboardMode(start=true){controlMode='keyboard';blink.stop();resetGazeControlWindow();$('controlBadge').textContent='Control: Keyboard';$('modeButton').textContent='Use Gaze Mode';gaze.setPreview(false);if(start)startRound()}
function toggleMode(){if(controlMode==='gaze')enableBlinkMode();else enableTracking()}

function spawnPipe(){const gap=Math.max(205,game.height*(.38-Math.min(game.elapsed/240,.07)));const margin=90;const center=margin+gap/2+Math.random()*(game.height-2*margin-gap);game.pipes.push({x:game.width+45,w:78,gapTop:center-gap/2,gapBottom:center+gap/2,scored:false})}
function update(dt){
  if(state!==STATES.PLAYING)return;
  game.elapsed+=dt;
  if(controlMode==='gaze'){
    updateGazeControlTarget(performance.now());
    const fresh=gaze.isFresh(TRACKING_LOSS_MS);$('debugStatus').textContent=fresh?'tracking':'lost';
    if(!fresh && gaze.lastSampleAt){autoPausedForGaze=true;pauseGame('Eye tracking lost','Look toward the screen. The round will resume automatically when tracking returns.');return}
    smoothedViewportY=GAZE_SMOOTHING*targetViewportY+(1-GAZE_SMOOTHING)*smoothedViewportY;
    const stageRect=$('stage').getBoundingClientRect();const normalized=(smoothedViewportY-stageRect.top)/stageRect.height;const proposed=Math.max(35,Math.min(game.height-35,normalized*game.height));
    if(Math.abs(proposed-game.bird.targetY)>GAZE_DEAD_ZONE)game.bird.targetY=proposed;
    game.bird.y+=(game.bird.targetY-game.bird.y)*Math.min(1,BIRD_FOLLOW_SPEED*dt);
  }else if(controlMode==='blink'){
    const fresh=blink.isFresh();$('debugStatus').textContent=fresh?'tracking':'lost';
    if(!fresh){autoPausedForGaze=true;pauseGame('Blink tracking lost','Face the camera. The round will resume automatically when tracking returns.');return}
    game.bird.vy=Math.min(BLINK_MAX_FALL_SPEED,game.bird.vy+BLINK_GRAVITY*dt);
    game.bird.y+=game.bird.vy*dt;
    game.bird.targetY=game.bird.y;
  }else{
    game.bird.targetY=Math.max(35,Math.min(game.height-35,game.bird.targetY+keyDirection*310*dt));
    game.bird.y+=(game.bird.targetY-game.bird.y)*Math.min(1,BIRD_FOLLOW_SPEED*dt);
  }
  game.spawnTimer-=dt;if(game.spawnTimer<=0){spawnPipe();game.spawnTimer=Math.max(1.65,2.25-game.elapsed*.006)}
  const speed=Math.min(235,150+game.elapsed*.65);for(const p of game.pipes){p.x-=speed*dt;if(!p.scored&&p.x+p.w<game.bird.x){p.scored=true;game.score++;$('scoreValue').textContent=game.score}}
  game.pipes=game.pipes.filter(p=>p.x+p.w>-20);
  if(collides())endGame();
}

function collides(){const b=game.bird;const forgivingR=b.r*.72;if(b.y-forgivingR<0||b.y+forgivingR>game.height)return true;return game.pipes.some(p=>b.x+forgivingR>p.x&&b.x-forgivingR<p.x+p.w&&(b.y-forgivingR<p.gapTop||b.y+forgivingR>p.gapBottom))}
function pauseGame(title='Round paused',message='Your score and obstacles are frozen.'){if(state!==STATES.PLAYING)return;previousState=state;resetGazeControlWindow();$('pauseTitle').textContent=title;$('pauseMessage').textContent=message;setState(STATES.PAUSED)}
function resumeGame(){if(state!==STATES.PAUSED)return;if(controlMode==='gaze'&&!gaze.isFresh(TRACKING_LOSS_MS))return;if(controlMode==='blink'&&!blink.isFresh())return;autoPausedForGaze=false;lastFrame=performance.now();resetGazeControlWindow(lastFrame);setState(STATES.PLAYING)}
function endGame(){game.best=Math.max(game.best,game.score);localStorage.setItem('gazeFlappyBest',game.best);$('finalScore').textContent=game.score;$('bestScore').textContent=`Best: ${game.best}`;$('gameRecalibrateButton').textContent=controlMode==='blink'?'Retry Blink Test':'Recalibrate';setState(STATES.GAME_OVER)}

function drawBackground(t){
  const g=ctx.createLinearGradient(0,0,0,game.height);g.addColorStop(0,'#d9f6f2');g.addColorStop(.72,'#b9ebe0');g.addColorStop(.72,'#b7dfa7');g.addColorStop(.8,'#8dcf91');g.addColorStop(.8,'#f5d895');ctx.fillStyle=g;ctx.fillRect(0,0,game.width,game.height);
  ctx.fillStyle='#ffffffb5';for(let i=0;i<5;i++){const x=((i*330-t*.012)%(game.width+300))-120,y=85+(i%3)*95;cloud(x,y,1+(i%2)*.35)}
  ctx.fillStyle='#7ac98a';ctx.beginPath();ctx.moveTo(0,game.height*.79);for(let x=0;x<=game.width;x+=90)ctx.quadraticCurveTo(x+45,game.height*.69+(x%180)*.04,x+90,game.height*.79);ctx.lineTo(game.width,game.height);ctx.lineTo(0,game.height);ctx.fill();
  ctx.fillStyle='#f4d58d';ctx.fillRect(0,game.height*.84,game.width,game.height*.16);ctx.strokeStyle='#d9b977';ctx.lineWidth=2;for(let x=-(t*.04%55);x<game.width;x+=55){ctx.beginPath();ctx.moveTo(x,game.height*.9);ctx.lineTo(x+25,game.height*.9);ctx.stroke()}
}
function cloud(x,y,s){ctx.beginPath();ctx.arc(x,y,27*s,0,7);ctx.arc(x+35*s,y-15*s,35*s,0,7);ctx.arc(x+80*s,y,29*s,0,7);ctx.fill()}
function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke()}
function drawPipe(p){ctx.lineWidth=4;ctx.strokeStyle='#17343d';ctx.fillStyle='#55c88b';roundedRect(p.x,-10,p.w,p.gapTop+10,6);roundedRect(p.x,p.gapBottom,p.w,game.height-p.gapBottom+15,6);ctx.fillStyle='#83dda3';ctx.fillRect(p.x+10,0,12,p.gapTop-4);ctx.fillRect(p.x+10,p.gapBottom+4,12,game.height-p.gapBottom);ctx.fillStyle='#5ed091';roundedRect(p.x-10,p.gapTop-28,p.w+20,28,5);roundedRect(p.x-10,p.gapBottom,p.w+20,28,5)}
function drawBird(){const b=game.bird;const tilt=controlMode==='blink'?b.vy*.0007:(b.targetY-b.y)*.004;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.max(-.18,Math.min(.18,tilt)));ctx.lineWidth=4;ctx.strokeStyle='#17343d';ctx.fillStyle='#ffd762';ctx.beginPath();ctx.ellipse(0,0,31,24,0,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#f09a64';ctx.beginPath();ctx.ellipse(-15,12,20,11,-.45,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(14,-7,10,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#17343d';ctx.beginPath();ctx.arc(17,-7,3,0,7);ctx.fill();ctx.fillStyle='#ff806f';ctx.beginPath();ctx.roundRect(25,-1,18,8,3);ctx.fill();ctx.stroke();ctx.restore()}
function render(now){drawBackground(now);game.pipes.forEach(drawPipe);drawBird()}
function updateDebug(){const r=gaze.raw,t=window.BLINK_TUNING;$('debugRawX').textContent=Number.isFinite(r.x)?r.x.toFixed(0):'—';$('debugRawY').textContent=Number.isFinite(r.y)?r.y.toFixed(0):'—';$('debugGazeSamples').textContent=gazeYSamples.length;$('debugMedianY').textContent=Number.isFinite(latestMedianControlY)?latestMedianControlY.toFixed(0):'—';$('debugControlHz').textContent=GAZE_CONTROL_HZ;$('debugSmoothY').textContent=Number.isFinite(smoothedViewportY)?smoothedViewportY.toFixed(0):'—';$('debugTargetY').textContent=game.bird.targetY.toFixed(0);$('debugBlinkLeft').textContent=Number.isFinite(blinkTelemetry.left)?blinkTelemetry.left.toFixed(2):'—';$('debugBlinkRight').textContent=Number.isFinite(blinkTelemetry.right)?blinkTelemetry.right.toFixed(2):'—';$('debugBlinkState').textContent=blinkTelemetry.state;$('debugBlinkThresholds').textContent=`${t.BLINK_CLOSE_THRESHOLD.toFixed(2)} / ${t.BLINK_OPEN_THRESHOLD.toFixed(2)}`;$('debugClosedMs').textContent=blinkTelemetry.closedMs.toFixed(0);$('debugBlinkCounts').textContent=`${blinkTelemetry.blinkCount} / ${flapEventCount}`;$('debugBirdY').textContent=game.bird.y.toFixed(0);$('debugBirdVelocity').textContent=(game.bird.vy||0).toFixed(0);$('debugFps').textContent=fps.toFixed(0)}
function loop(now){const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;fps=fps*.92+(1/Math.max(dt,.001))*.08;update(dt);render(now);updateDebug();const trackingReturned=controlMode==='blink'?blink.isFresh(500):gaze.isFresh(500);if(autoPausedForGaze&&state===STATES.PAUSED&&trackingReturned)resumeGame();requestAnimationFrame(loop)}

$('enableTrackingButton').addEventListener('click',enableTracking);$('enableBlinkButton').addEventListener('click',enableBlinkMode);$('retryCameraButton').addEventListener('click',()=>controlMode==='blink'?enableBlinkMode():enableTracking());$('keyboardDemoButton').addEventListener('click',()=>setKeyboardMode());$('cameraKeyboardButton').addEventListener('click',()=>setKeyboardMode());
$('howButton').addEventListener('click',()=>$('howDialog').showModal());$('closeHowButton').addEventListener('click',()=>$('howDialog').close());
$('startGameButton').addEventListener('click',()=>{gazeCalibrated=true;gaze.setPreview(false);setState(STATES.READY)});$('readyStartButton').addEventListener('click',startRound);$('startBlinkButton').addEventListener('click',startRound);$('retryBlinkButton').addEventListener('click',beginBlinkTest);$('recalibrateButton').addEventListener('click',()=>beginCalibration(true));$('gameRecalibrateButton').addEventListener('click',()=>controlMode==='blink'?beginBlinkTest():beginCalibration(true));$('restartButton').addEventListener('click',startRound);
$('pauseButton').addEventListener('click',()=>state===STATES.PLAYING?pauseGame():resumeGame());$('resumeButton').addEventListener('click',resumeGame);$('modeButton').addEventListener('click',toggleMode);
$('gazeToggle').addEventListener('change',e=>$('gazeCursor').classList.toggle('hidden',!e.target.checked));$('debugToggle').addEventListener('change',e=>$('debugPanel').classList.toggle('hidden',!e.target.checked));
addEventListener('keydown',e=>{if(e.key==='ArrowUp'){keyDirection=-1;e.preventDefault()}if(e.key==='ArrowDown'){keyDirection=1;e.preventDefault()}if(e.key==='Escape'&&state===STATES.PLAYING)pauseGame()});addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.key))keyDirection=0});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state===STATES.PLAYING)pauseGame('Paused while you were away','The tab became hidden, so the round was frozen.')});addEventListener('resize',resizeCanvas);
resizeCanvas();resetGame();requestAnimationFrame(loop);
