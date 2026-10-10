(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const selectScreen = document.getElementById("selectScreen");
  const touchControls = document.getElementById("touchControls");
  const resultScreen = document.getElementById("resultScreen");
  const resultTitle = document.getElementById("resultTitle");
  const resultDetail = document.getElementById("resultDetail");
  const pauseBtn = document.getElementById("pauseBtn");
  const joystick = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  const punchBtn = document.getElementById("punchBtn");
  const kickBtn = document.getElementById("kickBtn");
  const guardBtn = document.getElementById("guardBtn");

  const W = 1280, H = 720, FLOOR = 610;
  const images = { fan: new Image(), yan: new Image() };
  images.fan.src = "dafanfan-fight-sprites.png";
  images.yan.src = "xiaoyanyan-fight-sprites.png";

  // Each 3D-rendered sheet is a 4x2 grid: idle, walk, punch, kick,
  // uppercut, sweep, airborne axe kick and guard. Keeping the fighter
  // camera side-on makes every attack silhouette match its hit box.
  const poseFrame = {
    idle: 0, walk: 1, punch: 2, body: 2, kick: 3,
    uppercut: 4, sweep: 5, axe: 6, dash: 3, guard: 7
  };

  const roster = {
    fan: { name: "大帆帆", color: "#ff4f7b", accent: "#ffb13b", speed: 280, power: 1.08, scale: 1.03 },
    yan: { name: "小颜颜", color: "#59e8ff", accent: "#8d4dff", speed: 320, power: .96, scale: .98 }
  };

  const moves = {
    punch: { label: "疾风拳", duration: .42, hitAt: .19, reach: 155, damage: 7, knock: 34, color: "#fff4b0" },
    body: { label: "碎甲重拳", duration: .55, hitAt: .29, reach: 138, damage: 10, knock: 24, color: "#ff9a5c" },
    uppercut: { label: "超级上勾拳", duration: .78, hitAt: .37, reach: 142, damage: 15, knock: 58, launch: 170, color: "#ffd84d", special: true },
    kick: { label: "旋身踢", duration: .55, hitAt: .28, reach: 185, damage: 10, knock: 46, color: "#67eeff" },
    sweep: { label: "雷霆扫堂腿", duration: .82, hitAt: .46, reach: 205, damage: 14, knock: 72, color: "#8d6cff", special: true },
    axe: { label: "螺旋大跳下劈腿", duration: 1.08, hitAt: .67, reach: 178, damage: 18, knock: 84, launch: 105, color: "#ff4fca", special: true },
    dash: { label: "流星飞踢", duration: .76, hitAt: .39, reach: 235, damage: 13, knock: 82, color: "#59e8ff", special: true }
  };

  let player, enemy, mode = "select", paused = false, last = performance.now();
  let timer = 60, shake = 0, freeze = 0, announce = null, aiClock = 0;
  const particles = [], hitBursts = [];
  const input = { x: 0, y: 0, guard: false, keys: new Set() };

  class Fighter {
    constructor(id, x, isPlayer) {
      Object.assign(this, roster[id]);
      this.id = id; this.x = x; this.y = FLOOR; this.isPlayer = isPlayer;
      this.vx = 0; this.vy = 0; this.hp = 100; this.energy = 0;
      this.facing = isPlayer ? 1 : -1; this.action = "idle"; this.actionTime = 0;
      this.hitDone = false; this.guard = false; this.hitFlash = 0; this.stun = 0;
      this.aiX = 0; this.aiGuard = false;
    }
    startAttack(name) {
      if (this.stun > 0 || this.action !== "idle" || this.guard || mode !== "fight") return;
      this.action = name; this.actionTime = 0; this.hitDone = false;
      announce = { text: moves[name].label, color: moves[name].color, life: .82, owner: this };
    }
  }

  function startGame(chosen) {
    player = new Fighter(chosen, 330, true);
    enemy = new Fighter(chosen === "fan" ? "yan" : "fan", 950, false);
    selectScreen.classList.add("hidden"); resultScreen.classList.add("hidden");
    touchControls.classList.remove("hidden"); pauseBtn.classList.remove("hidden");
    mode = "countdown"; paused = false; timer = 60; shake = 0; particles.length = 0; hitBursts.length = 0;
    announce = { text: "准备！", color: "#ffd84d", life: 1.05, big: true };
    setTimeout(() => { if (mode === "countdown") { mode = "fight"; announce = { text: "开打！", color: "#ffffff", life: .85, big: true }; } }, 1050);
  }

  function chooseMove(kind, actor = player) {
    const ix = actor.isPlayer ? input.x : actor.aiX;
    const iy = actor.isPlayer ? input.y : 0;
    if (kind === "punch") {
      if (iy < -.46) actor.startAttack("uppercut");
      else if (iy > .46) actor.startAttack("body");
      else actor.startAttack("punch");
    } else {
      if (iy < -.46) actor.startAttack("axe");
      else if (iy > .46) actor.startAttack("sweep");
      else if (Math.abs(ix) > .62 && Math.sign(ix) === actor.facing) actor.startAttack("dash");
      else actor.startAttack("kick");
    }
  }

  function updateFighter(f, other, dt) {
    f.hitFlash = Math.max(0, f.hitFlash - dt * 4);
    f.stun = Math.max(0, f.stun - dt);
    const moveX = f.isPlayer ? input.x : f.aiX;
    f.guard = f.stun <= 0 && f.action === "idle" && (f.isPlayer ? input.guard : f.aiGuard);
    if (f.action === "idle" && f.stun <= 0 && !f.guard) {
      f.vx += moveX * f.speed * dt * 9;
      if ((f.isPlayer ? input.y : 0) < -.78 && Math.abs(f.vy) < 1 && f.y >= FLOOR - 1) f.vy = -480;
    }
    f.vx *= Math.pow(.0006, dt);
    f.vy += 1150 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y > FLOOR) { f.y = FLOOR; f.vy = 0; }
    f.x = Math.max(135, Math.min(W - 135, f.x));
    if (Math.abs(other.x - f.x) < 150 && f.y > FLOOR - 20 && other.y > FLOOR - 20) {
      const nudge = (150 - Math.abs(other.x - f.x)) * .5;
      f.x += f.x < other.x ? -nudge : nudge;
    }
    f.facing = other.x >= f.x ? 1 : -1;

    if (f.action !== "idle") {
      const m = moves[f.action];
      f.actionTime += dt;
      if ((f.action === "dash") && f.actionTime < m.hitAt) f.x += f.facing * 300 * dt;
      if ((f.action === "axe") && f.actionTime < .55) f.y = FLOOR - Math.sin(f.actionTime / .55 * Math.PI) * 175;
      if ((f.action === "uppercut") && f.actionTime < .58) f.y = FLOOR - Math.sin(f.actionTime / .58 * Math.PI) * 95;
      if (!f.hitDone && f.actionTime >= m.hitAt) {
        f.hitDone = true;
        const vertical = Math.abs((f.y - 110) - (other.y - 110));
        const inFront = (other.x - f.x) * f.facing > -20;
        if (Math.abs(other.x - f.x) < m.reach && vertical < 210 && inFront) landHit(f, other, m);
      }
      if (f.actionTime >= m.duration) { f.action = "idle"; f.actionTime = 0; f.y = Math.min(f.y, FLOOR); }
    }
  }

  function landHit(attacker, target, move) {
    const blocked = target.guard && target.facing === -attacker.facing;
    const damage = move.damage * attacker.power * (blocked ? .22 : 1);
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 1;
    target.vx = attacker.facing * move.knock * (blocked ? 2.2 : 4.1);
    if (!blocked) { target.stun = move.special ? .4 : .22; target.vy = -(move.launch || 34); }
    attacker.energy = Math.min(100, attacker.energy + (blocked ? 4 : move.damage * 1.35));
    shake = blocked ? 5 : (move.special ? 17 : 10); freeze = blocked ? .025 : .055;
    const strikeY = attacker.action === "sweep" ? attacker.y - 72
      : attacker.action === "uppercut" ? attacker.y - 285
      : attacker.action === "axe" ? attacker.y - 135
      : attacker.action === "kick" || attacker.action === "dash" ? attacker.y - 210
      : attacker.y - 245;
    const strikeX = attacker.x + attacker.facing * Math.min(move.reach * .72, Math.abs(target.x - attacker.x) * .58);
    burst(strikeX, strikeY, move.color, blocked ? 8 : 18);
    announce = { text: blocked ? "格挡！" : move.label, color: blocked ? "#59e8ff" : move.color, life: .72, owner: attacker };
    if (target.hp <= 0) finish(attacker);
  }

  function updateAI(dt) {
    aiClock -= dt;
    if (aiClock > 0 || !enemy || mode !== "fight") return;
    aiClock = .12 + Math.random() * .2;
    const dist = Math.abs(player.x - enemy.x);
    enemy.aiGuard = player.action !== "idle" && Math.random() < .44;
    if (enemy.stun > 0 || enemy.action !== "idle") { enemy.aiX = 0; return; }
    if (dist > 260) enemy.aiX = Math.sign(player.x - enemy.x);
    else if (dist < 115) enemy.aiX = -Math.sign(player.x - enemy.x) * (Math.random() < .35 ? 1 : 0);
    else enemy.aiX = 0;
    if (dist < 245 && !enemy.aiGuard && Math.random() < .56) {
      const r = Math.random();
      enemy.startAttack(r < .2 ? "punch" : r < .39 ? "kick" : r < .57 ? "uppercut" : r < .75 ? "sweep" : r < .9 ? "dash" : "axe");
    }
  }

  function burst(x, y, color, count) {
    hitBursts.push({ x, y, color, life: .24, max: .24 });
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 520, vy: (Math.random() - .7) * 430, life: .35 + Math.random() * .35, color, size: 3 + Math.random() * 8 });
  }

  function finish(winner) {
    mode = "over"; input.guard = false; touchControls.classList.add("hidden"); pauseBtn.classList.add("hidden");
    setTimeout(() => {
      resultTitle.textContent = `${winner.name}胜利`;
      resultDetail.textContent = winner.isPlayer ? "这套连招，漂亮！" : "电脑拿下一局，再战一次吧。";
      resultScreen.classList.remove("hidden");
    }, 650);
  }

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#160c32"); g.addColorStop(.56, "#492068"); g.addColorStop(1, "#0a0712");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = .22;
    for (let i = 0; i < 9; i++) { const x = (i * 173 + t * 10) % (W + 180) - 90; const h = 120 + (i % 4) * 55; ctx.fillStyle = i % 2 ? "#7147a6" : "#352050"; ctx.fillRect(x, FLOOR - h, 125, h); }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,216,77,.14)"; ctx.lineWidth = 2;
    for (let y = 335; y < FLOOR; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = -100; x < W + 100; x += 120) { ctx.beginPath(); ctx.moveTo(W / 2, 300); ctx.lineTo(x, FLOOR); ctx.stroke(); }
    ctx.fillStyle = "#0b0713"; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    const floorG = ctx.createLinearGradient(0, FLOOR, 0, H); floorG.addColorStop(0, "rgba(141,77,255,.35)"); floorG.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = floorG; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = "rgba(255,255,255,.045)"; for (let i = 0; i < 22; i++) ctx.fillRect((i * 71 + 30) % W, 58 + (i * 83) % 330, 3, 3);
    ctx.fillStyle = "rgba(255,216,77,.82)"; ctx.fillRect(0, FLOOR - 8, W, 4);
  }

  function drawFighter(f, t) {
    const img = images[f.id];
    if (!img.complete || !img.naturalWidth) return;

    let pose = f.guard ? "guard" : f.action;
    if (pose === "idle" && (Math.abs(f.vx) > 22 || Math.abs(f.isPlayer ? input.x : f.aiX) > .2)) pose = "walk";
    const frame = poseFrame[pose] ?? 0;
    const col = frame % 4, row = Math.floor(frame / 4);
    const cellW = img.naturalWidth / 4, cellH = img.naturalHeight / 2;
    const height = (f.id === "fan" ? 500 : 470) * f.scale;
    const width = height * (cellW / cellH);

    let p = 0, snap = 0, dx = 0, dy = 0, angle = 0, sx = 1, sy = 1;
    if (f.action !== "idle") {
      const m = moves[f.action];
      p = Math.min(1, f.actionTime / m.duration);
      snap = Math.sin(p * Math.PI);
      if (f.action === "punch" || f.action === "body") dx = f.facing * 24 * snap;
      if (f.action === "kick") dx = f.facing * 18 * snap;
      if (f.action === "sweep") { dx = f.facing * 10 * snap; sy = .97; }
      if (f.action === "uppercut") { dx = f.facing * 14 * snap; sy = 1.03; }
      if (f.action === "dash") { dx = f.facing * 28 * snap; angle = f.facing * -.035 * snap; }
      if (f.action === "axe") angle = f.facing * -.08 * Math.sin(p * Math.PI * 2);
    } else {
      dy = Math.sin(t * 4.8 + (f.isPlayer ? 0 : 2.4)) * 3;
      if (pose === "walk") dx = Math.sin(t * 11) * 4;
    }

    ctx.save();
    ctx.translate(f.x + dx, f.y + 6);
    ctx.scale(1, .32);
    const shadow = ctx.createRadialGradient(0, 0, 10, 0, 0, width * .48);
    shadow.addColorStop(0, "rgba(0,0,0,.62)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(0, 0, width * .52, 64, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x + dx, f.y + dy);
    ctx.scale(f.facing * sx, sy);
    ctx.rotate(angle);

    // A dark offset pass plus a colored rim gives the transparent 3D render
    // depth against the arena without changing the character artwork.
    ctx.save();
    ctx.globalAlpha = .42;
    ctx.filter = `blur(9px) drop-shadow(0 0 18px ${f.color})`;
    ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, -width / 2 + f.facing * 4, -height + 7, width, height);
    ctx.restore();

    if (f.hitFlash > 0 && Math.floor(f.hitFlash * 14) % 2 === 0) ctx.filter = "brightness(2.25) saturate(.35)";
    else ctx.filter = "drop-shadow(0 15px 11px rgba(0,0,0,.5))";
    ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, -width / 2, -height, width, height);

    if (f.action !== "idle" && snap > .45) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = .13 * snap;
      ctx.filter = `blur(3px) drop-shadow(0 0 12px ${moves[f.action].color})`;
      ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, -width / 2 - f.facing * 20, -height, width, height);
    }
    ctx.restore(); ctx.filter = "none"; ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    if (f.guard) {
      ctx.save(); ctx.strokeStyle = "rgba(89,232,255,.85)"; ctx.lineWidth = 8;
      ctx.shadowColor = "#59e8ff"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(f.x + f.facing * 32, f.y - 235, 112, -1.28, 1.28); ctx.stroke(); ctx.restore();
    }
  }

  function drawHUD() {
    if (!player || !enemy || mode === "select") return;
    const pad = 34, barW = 420, y = 32;
    healthBar(pad, y, barW, player.hp / 100, player, false);
    healthBar(W - pad - barW, y, barW, enemy.hp / 100, enemy, true);
    ctx.textAlign = "center"; ctx.font = "1000 42px system-ui"; ctx.fillStyle = "#fff"; ctx.fillText(Math.max(0, Math.ceil(timer)).toString().padStart(2, "0"), W / 2, 70);
    ctx.font = "800 13px system-ui"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("ROUND 1", W / 2, 91);
  }

  function healthBar(x, y, width, amount, f, reverse) {
    ctx.save(); ctx.fillStyle = "rgba(5,3,12,.72)"; roundRect(x, y, width, 30, 12); ctx.fill();
    const inner = Math.max(0, (width - 8) * amount); ctx.fillStyle = f.color;
    roundRect(reverse ? x + width - 4 - inner : x + 4, y + 4, inner, 22, 8); ctx.fill();
    ctx.font = "1000 20px system-ui"; ctx.textAlign = reverse ? "right" : "left"; ctx.fillStyle = "white"; ctx.fillText(f.name, reverse ? x + width : x, y + 58);
    ctx.font = "800 11px system-ui"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(f.isPlayer ? "PLAYER" : "CPU", reverse ? x + width : x, y + 77);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), h, r); }

  function drawEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 650 * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (let i = hitBursts.length - 1; i >= 0; i--) {
      const b = hitBursts[i]; b.life -= dt; if (b.life <= 0) { hitBursts.splice(i, 1); continue; }
      const k = 1 - b.life / b.max; ctx.save(); ctx.translate(b.x, b.y); ctx.strokeStyle = b.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 12 * (1 - k);
      ctx.beginPath(); ctx.arc(0, 0, 24 + k * 105, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (announce) {
      announce.life -= dt; if (announce.life <= 0) announce = null; else {
        const a = Math.min(1, announce.life * 3); ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.font = `1000 ${announce.big ? 96 : 34}px system-ui`; ctx.fillStyle = announce.color; ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 18;
        const x = announce.owner ? announce.owner.x : W / 2, y = announce.big ? H * .45 : 150;
        ctx.fillText(announce.text, x, y); ctx.restore();
      }
    }
  }

  function loop(now) {
    let dt = Math.min(.033, (now - last) / 1000); last = now;
    if (freeze > 0) { freeze -= dt; dt = 0; }
    if (!paused) {
      if (mode === "fight") { timer -= dt; updateAI(dt); updateFighter(player, enemy, dt); updateFighter(enemy, player, dt); if (timer <= 0) finish(player.hp >= enemy.hp ? player : enemy); }
      else if (mode === "countdown" && player) { updateFighter(player, enemy, dt); updateFighter(enemy, player, dt); }
    } else dt = 0;
    ctx.save(); if (shake > .2) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .82; }
    drawBackground(now / 1000); if (player && enemy) { const order = player.x < enemy.x ? [player, enemy] : [enemy, player]; drawFighter(order[0], now / 1000); drawFighter(order[1], now / 1000); } drawEffects(dt); drawHUD();
    if (paused) { ctx.fillStyle = "rgba(5,3,12,.58)"; ctx.fillRect(0,0,W,H); ctx.textAlign = "center"; ctx.font = "1000 72px system-ui"; ctx.fillStyle = "white"; ctx.fillText("暂停", W/2, H/2); }
    ctx.restore(); requestAnimationFrame(loop);
  }

  let stickPointer = null;
  function updateStick(e) {
    const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy, max = r.width * .29, d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    input.x = dx / max; input.y = dy / max; stick.style.transform = `translate(${dx}px,${dy}px)`;
  }
  joystick.addEventListener("pointerdown", e => { stickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); updateStick(e); });
  joystick.addEventListener("pointermove", e => { if (e.pointerId === stickPointer) updateStick(e); });
  const releaseStick = e => { if (e.pointerId !== stickPointer) return; stickPointer = null; input.x = input.y = 0; stick.style.transform = "translate(0,0)"; };
  joystick.addEventListener("pointerup", releaseStick); joystick.addEventListener("pointercancel", releaseStick);

  function tapButton(button, kind) { button.addEventListener("pointerdown", e => { e.preventDefault(); button.classList.add("pressed"); chooseMove(kind); }); ["pointerup","pointercancel","pointerleave"].forEach(n => button.addEventListener(n, () => button.classList.remove("pressed"))); }
  tapButton(punchBtn, "punch"); tapButton(kickBtn, "kick");
  guardBtn.addEventListener("pointerdown", e => { e.preventDefault(); input.guard = true; guardBtn.classList.add("pressed"); });
  ["pointerup","pointercancel","pointerleave"].forEach(n => guardBtn.addEventListener(n, () => { input.guard = false; guardBtn.classList.remove("pressed"); }));

  document.addEventListener("keydown", e => {
    input.keys.add(e.code); if (["ArrowLeft","KeyA"].includes(e.code)) input.x = -1; if (["ArrowRight","KeyD"].includes(e.code)) input.x = 1; if (["ArrowUp","KeyW"].includes(e.code)) input.y = -1; if (["ArrowDown","KeyS"].includes(e.code)) input.y = 1;
    if (e.code === "KeyJ") chooseMove("punch"); if (e.code === "KeyK") chooseMove("kick"); if (e.code === "KeyL") input.guard = true;
  });
  document.addEventListener("keyup", e => { input.keys.delete(e.code); if (![...input.keys].some(k => ["ArrowLeft","KeyA","ArrowRight","KeyD"].includes(k))) input.x = 0; if (![...input.keys].some(k => ["ArrowUp","KeyW","ArrowDown","KeyS"].includes(k))) input.y = 0; if (e.code === "KeyL") input.guard = false; });
  document.querySelectorAll("[data-fighter]").forEach(b => b.addEventListener("click", () => startGame(b.dataset.fighter)));
  document.getElementById("rematchBtn").addEventListener("click", () => startGame(player.id));
  document.getElementById("changeBtn").addEventListener("click", () => { mode = "select"; player = enemy = null; resultScreen.classList.add("hidden"); selectScreen.classList.remove("hidden"); });
  pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.textContent = paused ? "▶" : "Ⅱ"; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "fight") paused = true; });

  requestAnimationFrame(loop);
})();
