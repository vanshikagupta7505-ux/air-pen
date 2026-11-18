const video = document.getElementById('video');
const draw  = document.getElementById('draw');
const cur   = document.getElementById('cursor');
const msg   = document.getElementById('msg');
const dctx  = draw.getContext('2d');
const cctx  = cur.getContext('2d');

let color = '#ff4d4d';
let size = 6;
let last = null;     // last drawn point
let smooth = null;   // smoothed fingertip position

/* ---------- canvas sizing ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const snap = document.createElement('canvas');   // keep drawing on resize
  snap.width = draw.width;
  snap.height = draw.height;
  snap.getContext('2d').drawImage(draw, 0, 0);
  draw.width = cur.width = w;
  draw.height = cur.height = h;
  dctx.drawImage(snap, 0, 0, w, h);
}
window.addEventListener('resize', resize);
resize();

/* ---------- toolbar ---------- */
document.querySelectorAll('.sw').forEach(el => {
  el.onclick = () => {
    document.querySelectorAll('.sw').forEach(s => s.classList.remove('on'));
    el.classList.add('on');
    color = el.dataset.c;
  };
});

document.getElementById('size').oninput = e => (size = +e.target.value);

document.getElementById('clear').onclick = () =>
  dctx.clearRect(0, 0, draw.width, draw.height);

document.getElementById('save').onclick = () => {
  const out = document.createElement('canvas');
  out.width = draw.width;
  out.height = draw.height;
  const o = out.getContext('2d');
  o.fillStyle = '#0d1117';
  o.fillRect(0, 0, out.width, out.height);
  if (facing === 'user') { o.translate(out.width, 0); o.scale(-1, 1); }
  o.drawImage(draw, 0, 0);
  const a = document.createElement('a');
  a.download = 'air-pen.png';
  a.href = out.toDataURL('image/png');
  a.click();
};

/* ---------- gestures ---------- */
// A finger is "up" when its tip is higher (smaller y) than its middle joint.
function fingersUp(lm) {
  return {
    index:  lm[8].y  < lm[6].y,
    middle: lm[12].y < lm[10].y,
    ring:   lm[16].y < lm[14].y,
    pinky:  lm[20].y < lm[18].y,
  };
}

function onResults(res) {
  cctx.clearRect(0, 0, cur.width, cur.height);

  if (!res.multiHandLandmarks || !res.multiHandLandmarks.length) {
    last = null;
    smooth = null;
    msg.textContent = 'Haath dikhao 🖐';
    return;
  }

  const lm = res.multiHandLandmarks[0];
  const f = fingersUp(lm);

  // index fingertip (landmark 8), smoothed to reduce jitter
  const x = lm[8].x * draw.width;
  const y = lm[8].y * draw.height;
  smooth = smooth
    ? { x: smooth.x + (x - smooth.x) * 0.5, y: smooth.y + (y - smooth.y) * 0.5 }
    : { x, y };

  const drawing = f.index && !f.middle && !f.ring && !f.pinky; // 1 finger  -> draw
  const erasing = f.index && f.middle && f.ring && f.pinky;     // open palm -> erase

  if (drawing) {
    msg.textContent = 'Drawing ✍️';
    if (last) {
      dctx.strokeStyle = color;
      dctx.lineWidth = size;
      dctx.lineCap = 'round';
      dctx.lineJoin = 'round';
      dctx.shadowColor = color;
      dctx.shadowBlur = 18;
      dctx.beginPath();
      dctx.moveTo(last.x, last.y);
      dctx.lineTo(smooth.x, smooth.y);
      dctx.stroke();
    }
    last = { ...smooth };
  } else if (erasing) {
    msg.textContent = 'Erasing 🧽';
    const c = {
      x: ((lm[0].x + lm[9].x) / 2) * draw.width,
      y: ((lm[0].y + lm[9].y) / 2) * draw.height,
    };
    dctx.save();
    dctx.globalCompositeOperation = 'destination-out';
    dctx.beginPath();
    dctx.arc(c.x, c.y, 45, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();

    cctx.strokeStyle = '#fff';
    cctx.lineWidth = 2;
    cctx.beginPath();
    cctx.arc(c.x, c.y, 45, 0, Math.PI * 2);
    cctx.stroke();
    last = null;
  } else {
    msg.textContent = 'Pen up (2 ungli) ✌️';
    last = null;
  }

  // fingertip cursor
  cctx.fillStyle = drawing ? color : 'rgba(255,255,255,.7)';
  cctx.beginPath();
  cctx.arc(smooth.x, smooth.y, drawing ? size / 2 + 3 : 8, 0, Math.PI * 2);
  cctx.fill();
}

/* ---------- MediaPipe + camera ---------- */
const hands = new Hands({
  locateFile: f =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6,
});
hands.onResults(onResults);

let facing = 'user';   // 'user' = front camera, 'environment' = back camera
let stream = null;
let running = false;

async function startCam() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: 1280, height: 720 },
  });
  video.srcObject = stream;
  await video.play();
  document.getElementById('stage').classList.toggle('mirror', facing === 'user');
  last = null;
  smooth = null;
  if (!running) { running = true; loop(); }
}

async function loop() {
  if (video.readyState >= 2) await hands.send({ image: video });
  requestAnimationFrame(loop);
}

document.getElementById('flip').onclick = () => {
  facing = facing === 'user' ? 'environment' : 'user';
  startCam().catch(() => {
    facing = 'user';
    msg.textContent = 'Back camera nahi mila, front camera par wapas.';
    startCam();
  });
};

startCam().catch(() => {
  msg.textContent = 'Camera permission chahiye. Page ko https ya localhost se kholo.';
});

/* ---------- dark mode, torch, screen wake lock ---------- */
const stage = document.getElementById('stage');

document.getElementById('dark').onclick = () => {
  stage.classList.toggle('dark');
};

let torchOn = false;
document.getElementById('torch').onclick = async () => {
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) { msg.textContent = 'Is camera mein torch nahi hai (back camera par Flip karo).'; return; }
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
  } catch (e) {
    msg.textContent = 'Torch on nahi ho paayi.';
  }
};

// keep the phone screen awake while drawing
async function keepAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (e) {}
}
keepAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});