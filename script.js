// Simple Pong game with WebAudio sound effects
// Left paddle: mouse/touch control
// Right paddle: simple AI
// Collision detection, scoring, sound effects, controls

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const aiRange = document.getElementById('aiRange');
const sfxToggle = document.getElementById('sfxToggle');
const sfxVol = document.getElementById('sfxVol');

const leftScoreEl = document.getElementById('leftScore');
const rightScoreEl = document.getElementById('rightScore');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 14;
const WIN_SCORE = 10;

let running = false;
let rafId = null;

const leftPaddle = {
  x: 10,
  y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
  w: PADDLE_WIDTH,
  h: PADDLE_HEIGHT,
  color: '#39a1ff'
};

const rightPaddle = {
  x: WIDTH - PADDLE_WIDTH - 10,
  y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
  w: PADDLE_WIDTH,
  h: PADDLE_HEIGHT,
  color: '#ff8c42'
};

const ball = {
  x: WIDTH / 2 - BALL_SIZE / 2,
  y: HEIGHT / 2 - BALL_SIZE / 2,
  size: BALL_SIZE,
  speed: 5,
  dx: 0,
  dy: 0
};

let scores = { left: 0, right: 0 };

// WebAudio setup (created/resumed on first user interaction)
let audioCtx = null;
let masterGain = null;
let audioEnabled = true;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = Number(sfxVol.value) || 0.5;
    masterGain.connect(audioCtx.destination);
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

sfxVol.addEventListener('input', () => {
  if (masterGain) masterGain.gain.value = Number(sfxVol.value);
});

sfxToggle.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  sfxToggle.classList.toggle('active', audioEnabled);
  sfxToggle.textContent = audioEnabled ? 'On' : 'Off';
  if (audioEnabled) ensureAudio();
});

// play a short tone with ADSR envelope
function playTone(freq = 440, type = 'sine', duration = 0.08, when = 0) {
  if (!audioEnabled) return;
  ensureAudio();
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// small blip for paddle hit
function sfxPaddle() {
  playTone(880, 'sawtooth', 0.06);
}

// lower blip for wall bounce
function sfxWall() {
  playTone(440, 'sine', 0.07);
}

// scoring chime (two tones)
function sfxScore() {
  playTone(660, 'triangle', 0.12, 0);
  playTone(880, 'triangle', 0.12, 0.12);
}

// win fanfare (short sequence)
function sfxWin() {
  playTone(880, 'sawtooth', 0.1, 0);
  playTone(990, 'sawtooth', 0.1, 0.11);
  playTone(1320, 'sawtooth', 0.18, 0.22);
}

// Utility
function randSign() { return Math.random() > 0.5 ? 1 : -1; }

function resetBall(servingToLeft = true) {
  ball.x = WIDTH / 2 - ball.size / 2;
  ball.y = HEIGHT / 2 - ball.size / 2;
  ball.speed = 5;
  const angle = (Math.random() * Math.PI / 4) - (Math.PI / 8); // slight angle
  const dir = servingToLeft ? -1 : 1;
  ball.dx = Math.cos(angle) * ball.speed * dir;
  ball.dy = Math.sin(angle) * ball.speed * randSign();
}

// Draw helpers
function clear() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawBall() {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ball.x + ball.size/2, ball.y + ball.size/2, ball.size/2, 0, Math.PI*2);
  ctx.fill();
}

function drawNet() {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  const seg = 12;
  for (let y = 10; y < HEIGHT; y += seg * 2) {
    ctx.fillRect(WIDTH / 2 - 2, y, 4, seg);
  }
}

function draw() {
  clear();
  drawNet();
  drawRect(leftPaddle.x, leftPaddle.y, leftPaddle.w, leftPaddle.h, leftPaddle.color);
  drawRect(rightPaddle.x, rightPaddle.y, rightPaddle.w, rightPaddle.h, rightPaddle.color);
  drawBall();
}

// Keep paddles inside canvas
function clampPaddle(p) {
  if (p.y < 0) p.y = 0;
  if (p.y + p.h > HEIGHT) p.y = HEIGHT - p.h;
}

// Update logic
function update() {
  if (!running) return;

  // Move ball
  ball.x += ball.dx;
  ball.y += ball.dy;

  // Top/bottom collision
  if (ball.y <= 0) {
    ball.y = 0;
    ball.dy *= -1;
    sfxWall();
  } else if (ball.y + ball.size >= HEIGHT) {
    ball.y = HEIGHT - ball.size;
    ball.dy *= -1;
    sfxWall();
  }

  // Left paddle collision
  if (ball.x <= leftPaddle.x + leftPaddle.w &&
      ball.y + ball.size >= leftPaddle.y &&
      ball.y <= leftPaddle.y + leftPaddle.h) {

    ball.x = leftPaddle.x + leftPaddle.w;
    ball.dx = Math.abs(ball.dx); // ensure going right
    // add spin based on hit position
    const relativeY = (leftPaddle.y + leftPaddle.h / 2) - (ball.y + ball.size / 2);
    const norm = relativeY / (leftPaddle.h / 2);
    const maxBounce = Math.PI / 3; // 60deg
    const bounceAngle = norm * maxBounce;
    const speed = Math.min(ball.speed + 0.3, 12);
    ball.speed = speed;
    ball.dx = Math.cos(bounceAngle) * speed;
    ball.dy = -Math.sin(bounceAngle) * speed;
    sfxPaddle();
  }

  // Right paddle collision
  if (ball.x + ball.size >= rightPaddle.x &&
      ball.y + ball.size >= rightPaddle.y &&
      ball.y <= rightPaddle.y + rightPaddle.h) {

    ball.x = rightPaddle.x - ball.size;
    ball.dx = -Math.abs(ball.dx); // ensure going left
    const relativeY = (rightPaddle.y + rightPaddle.h / 2) - (ball.y + ball.size / 2);
    const norm = relativeY / (rightPaddle.h / 2);
    const maxBounce = Math.PI / 3;
    const bounceAngle = norm * maxBounce;
    const speed = Math.min(ball.speed + 0.3, 12);
    ball.speed = speed;
    ball.dx = -Math.cos(bounceAngle) * speed;
    ball.dy = -Math.sin(bounceAngle) * speed;
    sfxPaddle();
  }

  // Score check
  if (ball.x + ball.size < 0) {
    scores.right += 1;
    rightScoreEl.textContent = scores.right;
    sfxScore();
    if (scores.right >= WIN_SCORE) {
      endGame('Right (AI) wins!');
      return;
    }
    resetBall(false); // serve to right
  } else if (ball.x > WIDTH) {
    scores.left += 1;
    leftScoreEl.textContent = scores.left;
    sfxScore();
    if (scores.left >= WIN_SCORE) {
      endGame('You win!');
      return;
    }
    resetBall(true); // serve to left
  }

  // Basic AI movement for right paddle
  const aiSpeed = Number(aiRange.value); // adjustable
  const paddleCenter = rightPaddle.y + rightPaddle.h / 2;
  const ballCenter = ball.y + ball.size / 2;
  if (paddleCenter < ballCenter - 10) {
    rightPaddle.y += aiSpeed * 0.6;
  } else if (paddleCenter > ballCenter + 10) {
    rightPaddle.y -= aiSpeed * 0.6;
  }
  clampPaddle(rightPaddle);
}

// Game loop
function loop() {
  update();
  draw();
  rafId = requestAnimationFrame(loop);
}

// Controls
function initUserInteractionForAudio() {
  // Resume/create AudioContext on first meaningful interaction
  function once() {
    ensureAudio();
    window.removeEventListener('mousedown', once);
    window.removeEventListener('touchstart', once);
    window.removeEventListener('keydown', once);
  }
  window.addEventListener('mousedown', once, {passive: true});
  window.addEventListener('touchstart', once, {passive: true});
  window.addEventListener('keydown', once, {passive: true});
}

initUserInteractionForAudio();

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  leftPaddle.y = y - leftPaddle.h / 2;
  clampPaddle(leftPaddle);
});

canvas.addEventListener('touchmove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  const y = t.clientY - rect.top;
  leftPaddle.y = y - leftPaddle.h / 2;
  clampPaddle(leftPaddle);
  e.preventDefault();
}, {passive:false});

startBtn.addEventListener('click', () => {
  if (!running) {
    running = true;
    if (!rafId) loop();
  }
});

pauseBtn.addEventListener('click', () => {
  running = !running;
});

resetBtn.addEventListener('click', () => {
  resetGame();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    running = !running;
  } else if (e.key === 'r' || e.key === 'R') {
    resetGame();
  }
});

// Game helper functions
function resetGame() {
  scores.left = 0;
  scores.right = 0;
  leftScoreEl.textContent = '0';
  rightScoreEl.textContent = '0';
  leftPaddle.y = HEIGHT / 2 - leftPaddle.h / 2;
  rightPaddle.y = HEIGHT / 2 - rightPaddle.h / 2;
  resetBall(true);
  running = false;
}

function endGame(message) {
  running = false;
  if (audioEnabled) sfxWin();
  setTimeout(() => alert(message), 80);
  resetGame();
}

// Initialize
resetBall(true);
draw();