import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPSMQe3UfPqTY1d7sOttsSWGZqyXIO3gU",
  authDomain: "adij79.firebaseapp.com",
  databaseURL: "https://adij79-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "adij79",
  storageBucket: "adij79.firebasestorage.app",
  messagingSenderId: "784456560131",
  appId: "1:784456560131:web:89712935e548c6839b2836"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const uid = "p_" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
let mode = "ai", room = "", score = [0, 0], ball = { x: 600, y: 300, vx: 4, vy: 2 }, rods = [180, 300, 420, 280, 320, 180, 300, 420];
const rodXs = [145, 275, 405, 535, 665, 795, 925, 1055];
const playerOffsets = [[-48, 0, 48], [-36, 36], [-72, -36, 0, 36, 72], [-48, 48], [-48, 48], [-72, -36, 0, 36, 72], [-36, 36], [-48, 0, 48]];
let raf = 0, dragging = false, lastY = 0, remoteGame = null, gameOver = false, lastFrame = 0;

const root = document.querySelector("#app");
root.innerHTML = `<main><header><div class="brand"><span class="mark">✦</span><div><b>FOOSBALL</b><small>ARENA</small></div></div><div class="status"><i></i><span id="net">CONNECTING…</span></div></header><section class="hero"><div><p class="eyebrow">ARCADE TABLE // 01</p><h1>Own the<br><em>table.</em></h1><p class="sub">Play locally, or share a room code<br>to challenge a friend.</p></div><div class="ball-art">⚽</div></section><section class="cards"><button class="mode active" data-mode="ai"><span>◈</span><strong>VS AI</strong><small>Play instantly</small></button><button class="mode" data-mode="online"><span>◎</span><strong>ONLINE</strong><small>Create or join a room</small></button><button class="mode" data-mode="practice"><span>△</span><strong>PRACTICE</strong><small>No opponent</small></button></section><section class="match"><div><label>WIN CONDITION</label><div class="goals"><button data-goals="3">3</button><button class="selected" data-goals="5">5</button><button data-goals="7">7</button></div></div><div class="online-box" id="onlineBox"><input id="room" placeholder="ENTER CODE" maxlength="6" aria-label="Room code"><button id="create">CREATE ROOM</button><button id="join">JOIN ROOM</button></div><button class="play" id="play">PLAY NOW <span>→</span></button></section><p class="hint" id="roomHint">Choose ONLINE to create a room or join with a code.</p></main><div class="game hidden"><canvas id="canvas"></canvas><div class="hud"><button id="back">← MENU</button><div class="score"><span id="blue">0</span><small>—</small><span id="red">0</span></div><div class="round">FIRST TO <b id="target">5</b></div></div><div class="game-tip" id="gameTip">DRAG TO MOVE • TAP TO KICK</div></div>`;

const $ = s => document.querySelector(s);
let target = 5;
const setNet = text => $("#net").textContent = text;
onValue(ref(db, ".info/connected"), s => setNet(s.val() ? "FIREBASE CONNECTED" : "OFFLINE — LOCAL PLAY"), () => setNet("FIREBASE RULES BLOCKED"));
addEventListener("offline", () => setNet("OFFLINE — LOCAL PLAY"));

document.querySelectorAll(".mode").forEach(button => button.onclick = () => {
  document.querySelectorAll(".mode").forEach(x => x.classList.remove("active"));
  button.classList.add("active"); mode = button.dataset.mode;
  $("#onlineBox").classList.toggle("show", mode === "online");
});
document.querySelectorAll("[data-goals]").forEach(button => button.onclick = () => {
  document.querySelectorAll("[data-goals]").forEach(x => x.classList.remove("selected"));
  button.classList.add("selected"); target = Number(button.dataset.goals); $("#target").textContent = target;
});
const cleanRoomCode = () => $("#room").value.trim().replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
$("#create").onclick = () => {
  room = Math.random().toString(36).slice(2, 8).toUpperCase(); $("#room").value = room;
  setNet("ROOM " + room); $("#roomHint").textContent = `Room ${room} created — share this code with your friend.`;
  set(ref(db, `rooms/${room}/meta`), { status: "lobby", createdAt: Date.now(), maxScore: target }).catch(() => { $("#roomHint").textContent = `Room ${room} ready locally — Firebase write is unavailable.`; });
};
$("#join").onclick = () => {
  room = cleanRoomCode();
  if (room.length < 4) { $("#roomHint").textContent = "Enter a room code with at least 4 letters or numbers."; $("#room").focus(); return; }
  setNet("ROOM " + room); $("#roomHint").textContent = `Joined room ${room} — press PLAY NOW.`;
};
$("#play").onclick = start;
$("#back").onclick = () => { cancelAnimationFrame(raf); $(".game").classList.add("hidden"); $("main").classList.remove("hidden"); };

const canvas = $("#canvas"), ctx = canvas.getContext("2d");
function start() {
  if (mode === "online" && !room) { $("#roomHint").textContent = "Create a room or enter a room code before playing online."; $("#room").focus(); return; }
  $("main").classList.add("hidden"); $(".game").classList.remove("hidden");
  score = [0, 0]; gameOver = false; lastFrame = performance.now(); ball = { x: 600, y: 300, vx: 4, vy: 2 }; resize(); $("#gameTip").textContent = "DRAG TO MOVE • TAP TO KICK";
  if (mode === "online") connectRoom();
  cancelAnimationFrame(raf); loop();
}
function connectRoom() {
  const gameRef = ref(db, `rooms/${room}/game`), playerRef = ref(db, `rooms/${room}/players/${uid}`);
  set(playerRef, { joinedAt: Date.now(), connected: true }).catch(() => { $("#gameTip").textContent = "Room is running locally — Firebase permissions blocked"; }); onDisconnect(playerRef).remove().catch(() => {});
  onValue(gameRef, snapshot => { remoteGame = snapshot.val(); if (remoteGame?.score) score = remoteGame.score; }, () => $("#gameTip").textContent = "Connection lost — continuing locally");
}
function resize() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px"; }
function publish() { if (mode === "online" && room && navigator.onLine) update(ref(db, `rooms/${room}/game`), { score, ball: { x: ball.x / 1200, y: ball.y / 600 }, updatedAt: Date.now() }); }
function loop(now = performance.now()) {
  if (gameOver) return;
  const dt = Math.min(2, Math.max(.5, (now - lastFrame) / 16.67)); lastFrame = now;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= Math.pow(.998, dt); ball.vy *= Math.pow(.998, dt);
  if (ball.y < 92) { ball.y = 92; ball.vy = Math.abs(ball.vy); }
  if (ball.y > 508) { ball.y = 508; ball.vy = -Math.abs(ball.vy); }
  collideWithPlayers();
  if (ball.x < 45) goal(1); else if (ball.x > 1155) goal(0);
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 13) { ball.vx *= 13 / speed; ball.vy *= 13 / speed; }
  if (mode === "ai") { rods[5] += (ball.y - rods[5]) * .025; rods[6] += (ball.y - rods[6]) * .018; rods[7] += (ball.y - rods[7]) * .018; }
  $("#blue").textContent = score[0]; $("#red").textContent = score[1]; draw(); publish(); raf = requestAnimationFrame(loop);
}
function collideWithPlayers() {
  rodXs.forEach((x, i) => playerOffsets[i].forEach(offset => {
    const py = rods[i] + offset, dx = ball.x - x, dy = ball.y - py, distance = Math.hypot(dx, dy), minDistance = 25;
    if (distance > 0 && distance < minDistance) {
      const nx = dx / distance, ny = dy / distance, dot = ball.vx * nx + ball.vy * ny;
      ball.x = x + nx * minDistance; ball.y = py + ny * minDistance;
      if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny; ball.vx += i < 4 ? .35 : -.35; }
    }
  }));
}
function goal(team) {
  score[team] = Math.min(target, score[team] + 1);
  if (score[team] >= target) { gameOver = true; $("#gameTip").textContent = `${team ? "RED" : "BLUE"} WINS! TAP MENU FOR A REMATCH`; publish(); return; }
  ball = { x: 600, y: 300, vx: team ? 4 : -4, vy: (Math.random() - .5) * 4 };
  $("#gameTip").textContent = `${team ? "RED" : "BLUE"} SCORES!`;
  setTimeout(() => { if (!gameOver) $("#gameTip").textContent = "DRAG TO MOVE • TAP TO KICK"; }, 900);
}
function draw() {
  const sx = canvas.width / 1200, sy = canvas.height / 600; ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.fillStyle = "#07131a"; ctx.fillRect(0, 0, 1200, 600);
  const wood = ctx.createLinearGradient(0, 0, 0, 600); wood.addColorStop(0, "#c47a3d"); wood.addColorStop(.5, "#8c4c28"); wood.addColorStop(1, "#c47a3d"); ctx.fillStyle = wood; ctx.fillRect(18, 30, 1164, 540);
  ctx.fillStyle = "#252b2b"; ctx.fillRect(33, 48, 1134, 504);
  const pitch = ctx.createLinearGradient(55, 78, 1145, 522); pitch.addColorStop(0, "#2a9b5f"); pitch.addColorStop(.5, "#146441"); pitch.addColorStop(1, "#2a9b5f"); ctx.fillStyle = pitch; ctx.fillRect(55, 78, 1090, 444);
  ctx.globalAlpha = .08; for (let x = 55; x < 1145; x += 42) { ctx.fillStyle = "#d8ffd8"; ctx.fillRect(x, 78, 21, 444); } ctx.globalAlpha = 1;
  ctx.strokeStyle = "#e8f7e9"; ctx.lineWidth = 4; ctx.strokeRect(55, 78, 1090, 444); ctx.beginPath(); ctx.moveTo(600, 78); ctx.lineTo(600, 522); ctx.arc(600, 300, 80, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(55, 205, 120, 190); ctx.strokeRect(1025, 205, 120, 190);
  [[40, 220, 28, 160], [1132, 220, 28, 160]].forEach(([x, y, w, h]) => { ctx.fillStyle = "#101719"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#d9b77d"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); ctx.globalAlpha = .25; for (let n = 0; n < 8; n++) { ctx.beginPath(); ctx.moveTo(x, y + n * 22); ctx.lineTo(x + w, y + n * 22 + 20); ctx.stroke(); } ctx.globalAlpha = 1; });
  rodXs.forEach((x, i) => { const y = rods[i], color = i < 4 ? "#3992ff" : "#ef565a"; if (i === selectedRod) { ctx.strokeStyle = color; ctx.globalAlpha = .3; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(x, 78); ctx.lineTo(x, 522); ctx.stroke(); ctx.globalAlpha = 1; } ctx.strokeStyle = "#263336"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x + 2, 58); ctx.lineTo(x + 2, 542); ctx.stroke(); ctx.strokeStyle = "#dbe5e0"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, 58); ctx.lineTo(x, 542); ctx.stroke(); playerOffsets[i].forEach(offset => { const py = y + offset; ctx.fillStyle = "#0005"; ctx.beginPath(); ctx.ellipse(x + 5, py + 20, 22, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, py + 9, 15, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 13, py - 8, 26, 24); ctx.beginPath(); ctx.arc(x, py - 22, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffffff66"; ctx.beginPath(); ctx.arc(x - 4, py - 26, 4, 0, Math.PI * 2); ctx.fill(); }); ctx.fillStyle = "#1c2526"; ctx.fillRect(x - 10, 44, 20, 14); ctx.fillRect(x - 10, 542, 20, 14); });
  ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 12; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ball.x, ball.y, 14, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#19262b"; ctx.beginPath(); ctx.arc(ball.x - 4, ball.y - 3, 4, 0, Math.PI * 2); ctx.fill();
}
let selectedRod = 1;
canvas.onpointerdown = e => { const x = e.offsetX * 1200 / canvas.clientWidth; selectedRod = rodXs.reduce((best, value, index) => Math.abs(value - x) < Math.abs(rodXs[best] - x) ? index : best, 0); dragging = true; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
canvas.onpointermove = e => { if (dragging) { const dy = (e.clientY - lastY) * 1.5; rods[selectedRod] = Math.max(140, Math.min(460, rods[selectedRod] + dy)); lastY = e.clientY; } };
canvas.onpointerup = () => dragging = false;
canvas.onclick = () => { ball.vx += ball.vx > 0 ? 3 : -3; ball.vy += (Math.random() - .5) * 5; };
addEventListener("keydown", e => {
  if ($(".game").classList.contains("hidden")) return;
  const amount = e.shiftKey ? 18 : 9;
  if (e.key === "w" || e.key === "ArrowUp") rods[selectedRod] -= amount;
  if (e.key === "s" || e.key === "ArrowDown") rods[selectedRod] += amount;
  rods[selectedRod] = Math.max(140, Math.min(460, rods[selectedRod]));
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); canvas.click(); }
});
addEventListener("resize", resize);
