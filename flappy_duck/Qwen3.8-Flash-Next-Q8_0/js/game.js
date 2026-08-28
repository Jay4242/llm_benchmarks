'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = 480;
const H = 640;
const GROUND_H = 96;
const PIPE_W = 74;
const CAP_H = 26;
const CAP_OVER = 5;
const GRAVITY = 1450;
const FLAP_V = -420;
const SPACING = 235;
const STEP = 1 / 60;
const BEST_KEY = 'flappyDuck.best';

let state, bird, pipes, clouds, groundX, spawnTimer;
let score, best, speed, gap, hitFlash, overTime, wingKick, newBest;
let t = 0, last = performance.now(), acc = 0;

best = Number(localStorage.getItem(BEST_KEY) || 0);

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function init() {
  state = 'ready';
  bird = { x: 150, y: H * 0.45, vy: 0, r: 15, angle: 0 };
  pipes = [];
  groundX = 0;
  spawnTimer = 0;
  score = 0;
  speed = 150;
  gap = 175;
  hitFlash = 0;
  overTime = 0;
  wingKick = 0;
  newBest = false;
  if (!clouds) {
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({ x: rand(0, W), y: rand(24, 260), s: rand(0.5, 1.3) });
    }
  }
}

let audioCtx = null;
let muted = false;

function ensureAudio() {
  if (muted) return;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, dur, type, vol, slideTo) {
  if (!audioCtx || muted) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, now);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + dur);
  g.gain.setValueAtTime(vol || 0.12, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(now);
  o.stop(now + dur + 0.02);
}

const flapSfx = () => tone(500, 0.12, 'triangle', 0.1, 180);
const scoreSfx = () => {
  tone(880, 0.09, 'square', 0.06);
  setTimeout(() => tone(1318, 0.12, 'square', 0.06), 90);
};
const hitSfx = () => tone(220, 0.18, 'sawtooth', 0.16, 60);
const thudSfx = () => tone(110, 0.2, 'sine', 0.16, 40);

function flap() {
  bird.vy = FLAP_V;
  wingKick = 1;
  flapSfx();
}

function startGame() {
  state = 'playing';
  flap();
}

function press() {
  ensureAudio();
  if (state === 'ready') {
    startGame();
  } else if (state === 'playing') {
    flap();
  } else if (state === 'over' && overTime > 0.6) {
    init();
    startGame();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    press();
  } else if (e.code === 'KeyM') {
    muted = !muted;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  press();
});

function spawnPipe() {
  const minTop = 60;
  const maxTop = H - GROUND_H - gap - 60;
  pipes.push({ x: W + 10, gapTop: rand(minTop, maxTop), scored: false });
}

function circleRect(cx, cy, r, x, y, w, h) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function die() {
  state = 'dying';
  hitFlash = 1;
  hitSfx();
  if (score > best) {
    best = score;
    newBest = true;
    localStorage.setItem(BEST_KEY, String(best));
  }
}

function update(dt) {
  t += dt;
  wingKick = Math.max(0, wingKick - dt * 3);
  hitFlash = Math.max(0, hitFlash - dt * 2.5);

  for (const c of clouds) {
    c.x -= (6 + c.s * 8) * dt;
    if (c.x < -90) {
      c.x = W + rand(20, 80);
      c.y = rand(24, 260);
    }
  }

  const groundY = H - GROUND_H;

  if (state === 'ready') {
    groundX = (groundX - speed * dt) % 26;
    bird.y = H * 0.45 + Math.sin(t * 3) * 10;
    bird.angle = 0;
    return;
  }

  if (state === 'playing') {
    groundX = (groundX - speed * dt) % 26;
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.angle = Math.max(-0.4, Math.min(1.35, bird.vy / 650));

    speed = 150 + Math.min(score * 3, 75);
    gap = 175 - Math.min(score * 2.5, 40);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnPipe();
      spawnTimer = SPACING / speed;
    }

    for (const p of pipes) {
      p.x -= speed * dt;
      if (!p.scored && p.x + PIPE_W < bird.x - bird.r) {
        p.scored = true;
        score++;
        scoreSfx();
      }
    }
    pipes = pipes.filter((p) => p.x + PIPE_W > -20);

    if (bird.y - bird.r < 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }

    for (const p of pipes) {
      if (circleRect(bird.x, bird.y, bird.r, p.x, 0, PIPE_W, p.gapTop) ||
          circleRect(bird.x, bird.y, bird.r, p.x, p.gapTop + gap, PIPE_W, groundY - (p.gapTop + gap))) {
        die();
        return;
      }
    }
    if (bird.y + bird.r >= groundY) {
      bird.y = groundY - bird.r;
      die();
    }
    return;
  }

  if (state === 'dying') {
    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.angle = Math.min(bird.angle + 5 * dt, 1.55);
    if (bird.y + bird.r >= groundY) {
      bird.y = groundY - bird.r;
      bird.vy = 0;
      state = 'over';
      thudSfx();
    }
    return;
  }

  if (state === 'over') overTime += dt;
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(str, x, y, size, opts) {
  const o = Object.assign({ align: 'center', fill: '#fff', stroke: 'rgba(0,0,0,0.65)', lineW: Math.max(3, size / 9) }, opts);
  ctx.font = 'bold ' + size + 'px "Trebuchet MS", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = o.align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (o.stroke) {
    ctx.lineWidth = o.lineW;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.fill;
  ctx.fillText(str, x, y);
}

function drawCloud(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.s, c.s);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.arc(18, 4, 12, 0, Math.PI * 2);
  ctx.arc(-18, 5, 12, 0, Math.PI * 2);
  ctx.arc(6, -9, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hillsLayer(offset, color, radius, yBase, step) {
  const off = ((offset % step) + step) % step;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = -off - radius; x < W + radius; x += step) {
    ctx.moveTo(x + radius, yBase);
    ctx.arc(x, yBase, radius, Math.PI, Math.PI * 2);
  }
  ctx.fill();
}

function drawPipePart(x, y, w, h) {
  if (h <= 0) return;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#5c9e24');
  g.addColorStop(0.3, '#8ed544');
  g.addColorStop(0.55, '#73bf2e');
  g.addColorStop(1, '#4c8a1c');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a6b16';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function drawPipe(p) {
  const groundY = H - GROUND_H;
  drawPipePart(p.x, -2, PIPE_W, p.gapTop + 2);
  drawPipePart(p.x - CAP_OVER, p.gapTop - CAP_H, PIPE_W + CAP_OVER * 2, CAP_H);
  drawPipePart(p.x, p.gapTop + gap, PIPE_W, groundY - (p.gapTop + gap));
  drawPipePart(p.x - CAP_OVER, p.gapTop + gap, PIPE_W + CAP_OVER * 2, CAP_H);
}

function drawGround() {
  const groundY = H - GROUND_H;
  ctx.fillStyle = '#5ec93f';
  ctx.fillRect(0, groundY, W, 16);
  ctx.fillStyle = '#4aa832';
  ctx.fillRect(0, groundY, W, 4);
  ctx.fillStyle = '#e0d6a0';
  ctx.fillRect(0, groundY + 16, W, GROUND_H - 16);

  ctx.strokeStyle = '#d1c47f';
  ctx.lineWidth = 10;
  const off = ((groundX % 26) + 26) % 26 - 26;
  ctx.beginPath();
  for (let x = off; x < W + 26; x += 26) {
    ctx.moveTo(x + 14, groundY + 18);
    ctx.lineTo(x - 4, H);
  }
  ctx.stroke();
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.angle);

  ctx.fillStyle = '#f2b21c';
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(-24, -9);
  ctx.lineTo(-21, 5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.ellipse(0, 2, 17, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11, -9, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffe98a';
  ctx.beginPath();
  ctx.ellipse(-1, 8, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff971f';
  ctx.beginPath();
  ctx.moveTo(19, -12);
  ctx.lineTo(30, -8);
  ctx.lineTo(19, -7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e07b0a';
  ctx.beginPath();
  ctx.moveTo(19, -7);
  ctx.lineTo(29, -6.5);
  ctx.lineTo(19, -3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(14, -11, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(15.5, -11, 1.8, 0, Math.PI * 2);
  ctx.fill();

  const wa = Math.sin(t * (10 + 22 * wingKick)) * (0.35 + 0.65 * wingKick) - 0.2;
  ctx.save();
  ctx.translate(-3, 1);
  ctx.rotate(wa);
  ctx.fillStyle = '#ffbf1f';
  ctx.strokeStyle = '#e3a516';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 10, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawReady() {
  text('FLAPPY DUCK', W / 2, 140, 52, { fill: '#ffe14d', stroke: '#7a4f00', lineW: 8 });
  text('Tap, click or press Space to flap', W / 2, H * 0.68, 20);
  text('Best: ' + best, W / 2, H * 0.68 + 36, 18, { fill: '#eafbff' });
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
  text('M to mute', W / 2, H * 0.68 + 70, 14, { stroke: 'rgba(0,0,0,0.35)', lineW: 2 });
  ctx.globalAlpha = 1;
}

function drawOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H);

  text('GAME OVER', W / 2, 158, 46, { fill: '#ff6b5e', stroke: '#7a1f12', lineW: 8 });

  ctx.fillStyle = '#f7f0d8';
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 3;
  rr(W / 2 - 130, 200, 260, 200, 14);
  ctx.fill();
  ctx.stroke();

  text('SCORE', W / 2, 235, 16, { fill: '#8a733f', stroke: null });
  text(String(score), W / 2, 270, 40, { fill: '#4a3a12', stroke: null });

  ctx.strokeStyle = '#e2d5ae';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, 302);
  ctx.lineTo(W / 2 + 100, 302);
  ctx.stroke();

  text('BEST', W / 2, 326, 16, { fill: '#8a733f', stroke: null });
  text(String(best), W / 2, 360, 40, { fill: '#4a3a12', stroke: null });

  if (newBest) {
    text('NEW!', W / 2 + 88, 360, 16, { fill: '#ffcf33', stroke: '#a06b00', lineW: 4 });
  }

  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
  text('Click to play again', W / 2, 452, 18);
  ctx.globalAlpha = 1;
}

function draw() {
  const groundY = H - GROUND_H;

  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#66c4d4');
  sky.addColorStop(1, '#bfeaf2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,243,168,0.9)';
  ctx.beginPath();
  ctx.arc(72, 84, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,243,168,0.35)';
  ctx.beginPath();
  ctx.arc(72, 84, 48, 0, Math.PI * 2);
  ctx.fill();

  for (const c of clouds) drawCloud(c);

  hillsLayer(t * -4, '#a9dc9a', 70, groundY, 150);
  hillsLayer(t * -10, '#8fce7f', 50, groundY, 110);

  for (const p of pipes) drawPipe(p);

  drawGround();
  drawBird();

  if (state !== 'ready') {
    text(String(score), W / 2, 72, 52);
  }

  text(muted ? '🔇' : '🔊', W - 14, 24, 18, { align: 'right', stroke: null });

  if (hitFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (hitFlash * 0.75) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'ready') drawReady();
  if (state === 'over') drawOver();
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.12);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.98;
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);

init();
resize();
requestAnimationFrame(frame);
