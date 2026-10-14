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
  const superBtn = document.getElementById("superBtn");

  const W = 1280, H = 720, FLOOR = 610;
  const images = { fan: new Image(), yan: new Image(), blob: new Image(), rabbit: new Image() };
  const spriteCache = {};
  let backgroundCache = null;
  images.fan.src = "dafanfan-fight-sprites.png";
  images.yan.src = "xiaoyanyan-fight-sprites.png";
  images.blob.src = "huangtuantuan-fight-sprites.png";
  images.rabbit.src = "mengmiantu-fight-sprites.png";

  // Each 3D-rendered sheet is a 4x2 grid: idle, walk, punch, kick,
  // uppercut, sweep, airborne axe kick and guard. Keeping the fighter
  // camera side-on makes every attack silhouette match its hit box.
  const poseFrame = {
    idle: 0, walk: 1, punch: 2, body: 2, kick: 3,
    uppercut: 4, sweep: 5, axe: 6, dash: 3, guard: 7
  };

  const roster = {
    fan: { name: "大帆帆", color: "#ff4f7b", accent: "#ffd84d", speed: 280, power: 1.08, scale: 1.03, effect: "thunder", ultimate: "雷霆曼巴升龙", ultimatePose: "uppercut" },
    yan: { name: "小颜颜", color: "#59e8ff", accent: "#8d4dff", speed: 320, power: .96, scale: .98, effect: "rotor", ultimate: "旋翼风暴", ultimatePose: "axe" },
    blob: { name: "奶蛙", color: "#ffc93d", accent: "#ff7a26", speed: 245, power: 1.15, scale: 1.04, effect: "goo", ultimate: "熔金陨星", ultimatePose: "axe" },
    rabbit: { name: "美团鼠", color: "#ffe458", accent: "#1b102e", speed: 335, power: .94, scale: .97, effect: "moon", ultimate: "暗月连舞", ultimatePose: "kick" }
  };

  const moves = {
    punch: { label: "疾风拳", duration: .42, hitAt: .19, reach: 155, damage: 7, knock: 34, color: "#fff4b0" },
    body: { label: "碎甲重拳", duration: .55, hitAt: .29, reach: 138, damage: 10, knock: 24, color: "#ff9a5c" },
    uppercut: { label: "超级上勾拳", duration: .78, hitAt: .37, reach: 142, damage: 15, knock: 58, launch: 170, color: "#ffd84d", special: true },
    kick: { label: "旋身踢", duration: .55, hitAt: .28, reach: 185, damage: 10, knock: 46, color: "#67eeff" },
    sweep: { label: "雷霆扫堂腿", duration: .82, hitAt: .46, reach: 205, damage: 14, knock: 72, color: "#8d6cff", special: true },
    axe: { label: "螺旋大跳下劈腿", duration: 1.08, hitAt: .67, reach: 178, damage: 18, knock: 84, launch: 105, color: "#ff4fca", special: true },
    dash: { label: "流星飞踢", duration: .76, hitAt: .39, reach: 235, damage: 13, knock: 82, color: "#59e8ff", special: true },
    ultimate: { label: "大招", duration: 1.58, hitAt: .86, reach: 410, damage: 32, knock: 125, launch: 180, color: "#ffd84d", special: true, ultimate: true }
  };

  let player, enemy, mode = "select", paused = false, last = performance.now();
  let timer = 60, shake = 0, freeze = 0, announce = null, aiClock = 0, ultimateFX = null, impactFlash = 0;
  const particles = [], hitBursts = [], damageTexts = [];
  const input = { x: 0, y: 0, guard: false, keys: new Set() };

  function buildSpriteCache(id) {
    const img = images[id];
    if (!img || !img.complete || !img.naturalWidth || !roster[id]) return;
    const cellW = img.naturalWidth / 4, cellH = img.naturalHeight / 2;
    const height = ({ fan: 500, yan: 470, blob: 475, rabbit: 465 }[id] || 470) * roster[id].scale;
    const width = height * (cellW / cellH), pad = 42;
    const frames = [];
    for (let frame = 0; frame < 8; frame++) {
      const layer = document.createElement("canvas");
      layer.width = Math.ceil(width + pad * 2); layer.height = Math.ceil(height + pad * 2);
      const layerCtx = layer.getContext("2d", { alpha: true });
      const col = frame % 4, row = Math.floor(frame / 4);
      layerCtx.save(); layerCtx.globalAlpha = .42;
      layerCtx.filter = `blur(9px) drop-shadow(0 0 18px ${roster[id].color})`;
      layerCtx.drawImage(img, col * cellW, row * cellH, cellW, cellH, pad + 4, pad + 7, width, height);
      layerCtx.restore();
      layerCtx.filter = "drop-shadow(0 15px 11px rgba(0,0,0,.5))";
      layerCtx.drawImage(img, col * cellW, row * cellH, cellW, cellH, pad, pad, width, height);
      layerCtx.filter = "none";
      frames.push(layer);
    }
    spriteCache[id] = { frames, width, height, pad, filtered: new Map() };
    images[id] = null;
  }

  function filteredFrame(cache, frame, key, filter) {
    const cacheKey = `${frame}:${key}`;
    if (cache.filtered.has(cacheKey)) return cache.filtered.get(cacheKey);
    const source = cache.frames[frame], layer = document.createElement("canvas");
    layer.width = source.width; layer.height = source.height;
    const layerCtx = layer.getContext("2d", { alpha: true });
    layerCtx.filter = filter; layerCtx.drawImage(source, 0, 0); layerCtx.filter = "none";
    cache.filtered.set(cacheKey, layer);
    return layer;
  }

  Object.entries(images).forEach(([id, img]) => {
    img.addEventListener("load", () => buildSpriteCache(id), { once: true });
    if (img.complete && img.naturalWidth) buildSpriteCache(id);
  });

  function buildBackgroundCache() {
    const base = document.createElement("canvas"), front = document.createElement("canvas");
    base.width = front.width = W; base.height = front.height = H;
    const b = base.getContext("2d"), f = front.getContext("2d");
    const g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#160c32"); g.addColorStop(.56, "#492068"); g.addColorStop(1, "#0a0712");
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    b.fillStyle = "rgba(255,255,255,.045)"; for (let i = 0; i < 22; i++) b.fillRect((i * 71 + 30) % W, 58 + (i * 83) % 330, 3, 3);
    f.strokeStyle = "rgba(255,216,77,.14)"; f.lineWidth = 2;
    for (let y = 335; y < FLOOR; y += 48) { f.beginPath(); f.moveTo(0, y); f.lineTo(W, y); f.stroke(); }
    for (let x = -100; x < W + 100; x += 120) { f.beginPath(); f.moveTo(W / 2, 300); f.lineTo(x, FLOOR); f.stroke(); }
    f.fillStyle = "#0b0713"; f.fillRect(0, FLOOR, W, H - FLOOR);
    const floorG = f.createLinearGradient(0, FLOOR, 0, H); floorG.addColorStop(0, "rgba(141,77,255,.35)"); floorG.addColorStop(1, "rgba(0,0,0,0)"); f.fillStyle = floorG; f.fillRect(0, FLOOR, W, H - FLOOR);
    f.fillStyle = "rgba(255,216,77,.82)"; f.fillRect(0, FLOOR - 8, W, 4);
    backgroundCache = { base, front };
  }

  class Fighter {
    constructor(id, x, isPlayer) {
      Object.assign(this, roster[id]);
      this.id = id; this.x = x; this.y = FLOOR; this.isPlayer = isPlayer;
      this.vx = 0; this.vy = 0; this.hp = 100; this.displayHp = 100; this.energy = isPlayer ? 100 : 35;
      this.facing = isPlayer ? 1 : -1; this.action = "idle"; this.actionTime = 0;
      this.hitDone = false; this.guard = false; this.hitFlash = 0; this.hitReact = 0; this.hitReactMax = 0; this.hitDir = 0; this.stun = 0;
      this.aiX = 0; this.aiGuard = false;
    }
    startAttack(name) {
      if (this.stun > 0 || this.action !== "idle" || this.guard || mode !== "fight") return;
      if (name === "ultimate") {
        if (this.energy < 100) return;
        this.energy = 0;
        ultimateFX = { owner: this, type: this.effect, life: moves.ultimate.duration, max: moves.ultimate.duration };
      }
      this.action = name; this.actionTime = 0; this.hitDone = false;
      announce = { text: name === "ultimate" ? this.ultimate : moves[name].label, color: name === "ultimate" ? this.accent : moves[name].color, life: name === "ultimate" ? 1.35 : .82, owner: this, big: name === "ultimate" };
    }
  }

  function startGame(chosen) {
    player = new Fighter(chosen, 330, true);
    const rivals = Object.keys(roster).filter(id => id !== chosen);
    enemy = new Fighter(rivals[Math.floor(Math.random() * rivals.length)], 950, false);
    selectScreen.classList.add("hidden"); resultScreen.classList.add("hidden");
    touchControls.classList.remove("hidden"); pauseBtn.classList.remove("hidden");
    mode = "countdown"; paused = false; timer = 60; shake = 0; impactFlash = 0; ultimateFX = null; particles.length = 0; hitBursts.length = 0; damageTexts.length = 0;
    superBtn.classList.remove("ready");
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
    f.hitReact = Math.max(0, f.hitReact - dt);
    if (f.displayHp > f.hp) f.displayHp = Math.max(f.hp, f.displayHp - dt * 22);
    f.stun = Math.max(0, f.stun - dt);
    if (mode === "fight" && f.action !== "ultimate") f.energy = Math.min(100, f.energy + dt * 8);
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
      if (f.action === "ultimate") {
        const up = Math.min(1, f.actionTime / m.hitAt);
        if (f.effect === "thunder") f.y = FLOOR - Math.sin(up * Math.PI) * 145;
        if (f.effect === "rotor") { f.y = FLOOR - Math.sin(up * Math.PI) * 120; f.x += f.facing * 170 * dt; }
        if (f.effect === "goo") f.y = FLOOR - Math.sin(up * Math.PI) * 230;
        if (f.effect === "moon") f.x += f.facing * 360 * dt;
      }
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
    target.hitReactMax = blocked ? .18 : move.ultimate ? .62 : move.special ? .42 : .3;
    target.hitReact = target.hitReactMax;
    target.hitDir = attacker.facing;
    target.vx = attacker.facing * move.knock * (blocked ? 2.2 : 4.1);
    if (!blocked) {
      target.stun = move.ultimate ? .62 : move.special ? .4 : .22;
      target.vy = -(move.launch || 34);
      if (target.action !== "ultimate") { target.action = "idle"; target.actionTime = 0; target.hitDone = false; }
    }
    if (!move.ultimate) attacker.energy = Math.min(100, attacker.energy + (blocked ? 10 : move.damage * 2.2));
    target.energy = Math.min(100, target.energy + damage * 1.25);
    shake = blocked ? 5 : (move.ultimate ? 28 : move.special ? 17 : 10); freeze = blocked ? .025 : move.ultimate ? .12 : .055;
    impactFlash = Math.max(impactFlash, blocked ? .12 : move.ultimate ? .62 : move.special ? .38 : .24);
    const strikeY = attacker.action === "sweep" ? attacker.y - 72
      : attacker.action === "uppercut" ? attacker.y - 285
      : attacker.action === "axe" ? attacker.y - 135
      : attacker.action === "kick" || attacker.action === "dash" ? attacker.y - 210
      : attacker.y - 245;
    const strikeX = attacker.x + attacker.facing * Math.min(move.reach * .72, Math.abs(target.x - attacker.x) * .58);
    burst(strikeX, strikeY, attacker.accent, blocked ? 8 : move.ultimate ? 48 : 18, attacker.effect);
    damageTexts.push({ x: target.x, y: target.y - 330, value: Math.max(1, Math.round(damage)), blocked, color: blocked ? "#67eeff" : move.ultimate ? "#ffd84d" : "#ffffff", life: .82, max: .82 });
    announce = { text: blocked ? "格挡！" : move.ultimate ? attacker.ultimate : move.label, color: blocked ? "#59e8ff" : attacker.accent, life: move.ultimate ? 1.05 : .72, owner: attacker };
    if (target.hp <= 0) finish(attacker);
  }

  function updateAI(dt) {
    aiClock -= dt;
    if (aiClock > 0 || !enemy || mode !== "fight") return;
    aiClock = .12 + Math.random() * .2;
    const dist = Math.abs(player.x - enemy.x);
    enemy.aiGuard = player.action !== "idle" && Math.random() < .44;
    if (enemy.stun > 0 || enemy.action !== "idle") { enemy.aiX = 0; return; }
    if (enemy.energy >= 100 && dist < 410 && !enemy.aiGuard) { enemy.startAttack("ultimate"); return; }
    if (dist > 260) enemy.aiX = Math.sign(player.x - enemy.x);
    else if (dist < 115) enemy.aiX = -Math.sign(player.x - enemy.x) * (Math.random() < .35 ? 1 : 0);
    else enemy.aiX = 0;
    if (dist < 245 && !enemy.aiGuard && Math.random() < .56) {
      const r = Math.random();
      enemy.startAttack(r < .2 ? "punch" : r < .39 ? "kick" : r < .57 ? "uppercut" : r < .75 ? "sweep" : r < .9 ? "dash" : "axe");
    }
  }

  function burst(x, y, color, count, kind = "thunder") {
    hitBursts.push({ x, y, color, kind, life: kind === "goo" ? .42 : .28, max: kind === "goo" ? .42 : .28 });
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 560, vy: (Math.random() - .72) * 470, life: .38 + Math.random() * .42, color, kind, size: 3 + Math.random() * 9, spin: Math.random() * Math.PI * 2 });
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
    if (!backgroundCache) buildBackgroundCache();
    ctx.drawImage(backgroundCache.base, 0, 0);
    ctx.save(); ctx.globalAlpha = .22;
    for (let i = 0; i < 9; i++) { const x = (i * 173 + t * 10) % (W + 180) - 90; const h = 120 + (i % 4) * 55; ctx.fillStyle = i % 2 ? "#7147a6" : "#352050"; ctx.fillRect(x, FLOOR - h, 125, h); }
    ctx.restore();
    ctx.drawImage(backgroundCache.front, 0, 0);
  }

  function drawFighter(f, t) {
    const source = images[f.id];
    if (!spriteCache[f.id] && source && source.complete && source.naturalWidth) buildSpriteCache(f.id);
    const cached = spriteCache[f.id];
    if (!cached) return;

    let pose = f.guard ? "guard" : f.action === "ultimate" ? f.ultimatePose : f.action;
    if (f.hitReact > 0 && !f.guard) pose = "idle";
    if (pose === "idle" && (Math.abs(f.vx) > 22 || Math.abs(f.isPlayer ? input.x : f.aiX) > .2)) pose = "walk";
    const frame = poseFrame[pose] ?? 0;
    const frameCanvas = cached.frames[frame], height = cached.height, width = cached.width, pad = cached.pad;

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
      if (f.action === "ultimate") {
        if (f.effect === "thunder") { sy = 1 + .08 * snap; angle = f.facing * .08 * snap; }
        if (f.effect === "rotor") angle = f.facing * p * Math.PI * 2.4;
        if (f.effect === "goo") { sx = 1 + .13 * snap; sy = 1 - .09 * snap; }
        if (f.effect === "moon") { dx = f.facing * 34 * snap; angle = f.facing * -.16 * snap; }
      }
    } else {
      dy = Math.sin(t * 4.8 + (f.isPlayer ? 0 : 2.4)) * 3;
      if (pose === "walk") dx = Math.sin(t * 11) * 4;
    }

    if (f.hitReact > 0) {
      const hitP = 1 - f.hitReact / Math.max(.001, f.hitReactMax);
      const recoil = Math.sin(hitP * Math.PI);
      dx += f.hitDir * 34 * recoil;
      dy += 8 * recoil;
      angle += f.hitDir * .13 * recoil;
      sx *= 1 + .055 * recoil;
      sy *= 1 - .075 * recoil;
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

    const flashing = f.hitFlash > 0 && Math.floor(f.hitFlash * 14) % 2 === 0;
    const mainFrame = flashing ? filteredFrame(cached, frame, "flash", "brightness(2.6) saturate(.25) contrast(1.25)") : frameCanvas;
    ctx.drawImage(mainFrame, -width / 2 - pad, -height - pad, mainFrame.width, mainFrame.height);

    if (f.hitReact > 0) {
      const hitAlpha = Math.min(.58, f.hitReact / Math.max(.001, f.hitReactMax));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = hitAlpha;
      const redFrame = filteredFrame(cached, frame, "hurt", "sepia(1) saturate(10) hue-rotate(320deg) brightness(1.8)");
      ctx.drawImage(redFrame, -width / 2 - pad, -height - pad, redFrame.width, redFrame.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    if (f.action !== "idle" && snap > .45) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = .13 * snap;
      const trailColor = f.action === "ultimate" ? f.accent : moves[f.action].color;
      const trailFrame = filteredFrame(cached, frame, `trail:${trailColor}`, `blur(3px) drop-shadow(0 0 12px ${trailColor})`);
      ctx.drawImage(trailFrame, -width / 2 - pad - f.facing * 20, -height - pad, trailFrame.width, trailFrame.height);
    }
    ctx.restore(); ctx.filter = "none"; ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    if (f.hitReact > 0) {
      const k = f.hitReact / Math.max(.001, f.hitReactMax);
      ctx.save(); ctx.translate(f.x, f.y - 225); ctx.globalAlpha = k * .7;
      ctx.strokeStyle = "#ff365f"; ctx.lineWidth = 8 * k; ctx.shadowColor = "#ff365f"; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(0, 0, 94 + (1 - k) * 70, 0, Math.PI * 2); ctx.stroke();
      for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 74, Math.sin(a) * 110); ctx.lineTo(Math.cos(a) * (112 + (1 - k) * 70), Math.sin(a) * (158 + (1 - k) * 70)); ctx.stroke(); }
      ctx.restore();
    }

    if (f.guard) {
      ctx.save(); ctx.strokeStyle = f.accent; ctx.globalAlpha = .86; ctx.lineWidth = 8;
      ctx.shadowColor = f.accent; ctx.shadowBlur = 18;
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
    superBtn.classList.toggle("ready", player.energy >= 100 && mode === "fight");
  }

  function healthBar(x, y, width, amount, f, reverse) {
    ctx.save(); ctx.fillStyle = "rgba(5,3,12,.72)"; roundRect(x, y, width, 30, 12); ctx.fill();
    const chip = Math.max(0, (width - 8) * f.displayHp / 100); ctx.fillStyle = "rgba(255,65,92,.78)";
    roundRect(reverse ? x + width - 4 - chip : x + 4, y + 4, chip, 22, 8); ctx.fill();
    const inner = Math.max(0, (width - 8) * amount); ctx.fillStyle = f.color;
    roundRect(reverse ? x + width - 4 - inner : x + 4, y + 4, inner, 22, 8); ctx.fill();
    ctx.fillStyle = "rgba(5,3,12,.82)"; roundRect(x, y + 34, width, 9, 5); ctx.fill();
    const energyW = Math.max(0, width * f.energy / 100); ctx.fillStyle = f.accent;
    roundRect(reverse ? x + width - energyW : x, y + 34, energyW, 9, 5); ctx.fill();
    ctx.font = "1000 20px system-ui"; ctx.textAlign = reverse ? "right" : "left"; ctx.fillStyle = "white"; ctx.fillText(f.name, reverse ? x + width : x, y + 58);
    ctx.font = "800 11px system-ui"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(f.isPlayer ? "PLAYER" : "CPU", reverse ? x + width : x, y + 77);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), h, r); }

  function drawUltimateFX(dt) {
    if (!ultimateFX) return;
    ultimateFX.life -= dt;
    const a = ultimateFX.owner, k = 1 - ultimateFX.life / ultimateFX.max;
    ctx.save();
    if (ultimateFX.type === "thunder") {
      ctx.fillStyle = `rgba(37,4,57,${.24 * Math.sin(k * Math.PI)})`; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = a.accent; ctx.shadowColor = a.color; ctx.shadowBlur = 26; ctx.lineWidth = 8;
      for (let n = -2; n <= 2; n++) { ctx.beginPath(); ctx.moveTo(a.x + n * 34, 0); for (let y = 0; y < FLOOR; y += 58) ctx.lineTo(a.x + n * 34 + (Math.random() - .5) * 54, y); ctx.stroke(); }
    } else if (ultimateFX.type === "rotor") {
      ctx.translate(a.x, a.y - 225); ctx.strokeStyle = a.accent; ctx.shadowColor = a.color; ctx.shadowBlur = 24;
      for (let n = 0; n < 7; n++) { ctx.globalAlpha = .8 - n * .08; ctx.lineWidth = 13 - n; ctx.beginPath(); ctx.ellipse(0, 0, 70 + n * 32 + k * 70, 28 + n * 14, k * 7 + n, 0, Math.PI * 1.65); ctx.stroke(); }
    } else if (ultimateFX.type === "goo") {
      const g = ctx.createRadialGradient(a.x, a.y - 120, 10, a.x, a.y - 120, 360); g.addColorStop(0, "rgba(255,245,145,.8)"); g.addColorStop(.35, "rgba(255,164,25,.4)"); g.addColorStop(1, "rgba(255,95,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = a.accent; ctx.globalAlpha = .65; for (let n = 0; n < 14; n++) { const ang = n / 14 * Math.PI * 2; const r = 80 + k * 300; ctx.beginPath(); ctx.arc(a.x + Math.cos(ang) * r, a.y - 120 + Math.sin(ang) * r * .48, 6 + n % 4 * 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (ultimateFX.type === "moon") {
      ctx.fillStyle = `rgba(3,1,12,${.56 * Math.sin(k * Math.PI)})`; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#ffe35d"; ctx.shadowColor = "#ffe35d"; ctx.shadowBlur = 20; ctx.lineWidth = 11;
      for (let n = 0; n < 5; n++) { ctx.globalAlpha = .78 - n * .1; ctx.beginPath(); ctx.arc(a.x + a.facing * (60 + n * 58), a.y - 210 + Math.sin(n * 2) * 50, 60 + n * 14, -.95, .95); ctx.stroke(); }
    }
    ctx.restore();
    if (ultimateFX.life <= 0) ultimateFX = null;
  }

  function drawEffects(dt) {
    drawUltimateFX(dt);
    if (impactFlash > 0) {
      ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = Math.min(.5, impactFlash); ctx.fillStyle = "#ff294f"; ctx.fillRect(0, 0, W, H); ctx.restore();
      impactFlash = Math.max(0, impactFlash - dt * 2.8);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 650 * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin + p.life * 4); ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(2, p.size * .42);
      if (p.kind === "thunder") { ctx.rotate(Math.PI / 4); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); }
      else if (p.kind === "rotor") { ctx.beginPath(); ctx.moveTo(-p.size * 2.4, 0); ctx.lineTo(p.size * 2.4, 0); ctx.stroke(); }
      else if (p.kind === "goo") { ctx.beginPath(); ctx.arc(0, 0, p.size * .72, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.size, -.9, .9); ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = hitBursts.length - 1; i >= 0; i--) {
      const b = hitBursts[i]; b.life -= dt; if (b.life <= 0) { hitBursts.splice(i, 1); continue; }
      const k = 1 - b.life / b.max; ctx.save(); ctx.translate(b.x, b.y); ctx.strokeStyle = b.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 12 * (1 - k);
      if (b.kind === "thunder") { for (let n = 0; n < 6; n++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(62 + k * 90, 0); ctx.stroke(); } }
      else if (b.kind === "rotor") { for (let n = 0; n < 3; n++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.ellipse(50 + k * 55, 0, 62, 13, 0, 0, Math.PI * 2); ctx.stroke(); } }
      else if (b.kind === "goo") { ctx.fillStyle = b.color; for (let n = 0; n < 9; n++) { const q = n / 9 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(q) * (28 + k * 120), Math.sin(q) * (18 + k * 72), 12 * (1 - k), 0, Math.PI * 2); ctx.fill(); } }
      else { for (let n = 0; n < 4; n++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 34 + k * 108 + n * 8, -.7, .7); ctx.stroke(); } }
      ctx.restore();
    }
    for (let i = damageTexts.length - 1; i >= 0; i--) {
      const d = damageTexts[i]; d.life -= dt; d.y -= dt * 74;
      if (d.life <= 0) { damageTexts.splice(i, 1); continue; }
      const k = d.life / d.max; ctx.save(); ctx.globalAlpha = Math.min(1, k * 2.6); ctx.textAlign = "center";
      ctx.font = `1000 ${d.blocked ? 25 : 36}px system-ui`; ctx.fillStyle = d.color; ctx.strokeStyle = "rgba(20,3,14,.9)"; ctx.lineWidth = 8;
      const text = d.blocked ? `格挡 -${d.value}` : `-${d.value}`; ctx.strokeText(text, d.x, d.y); ctx.fillText(text, d.x, d.y); ctx.restore();
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
  superBtn.addEventListener("pointerdown", e => { e.preventDefault(); superBtn.classList.add("pressed"); if (player) player.startAttack("ultimate"); });
  ["pointerup","pointercancel","pointerleave"].forEach(n => superBtn.addEventListener(n, () => superBtn.classList.remove("pressed")));
  guardBtn.addEventListener("pointerdown", e => { e.preventDefault(); input.guard = true; guardBtn.classList.add("pressed"); });
  ["pointerup","pointercancel","pointerleave"].forEach(n => guardBtn.addEventListener(n, () => { input.guard = false; guardBtn.classList.remove("pressed"); }));

  document.addEventListener("keydown", e => {
    input.keys.add(e.code); if (["ArrowLeft","KeyA"].includes(e.code)) input.x = -1; if (["ArrowRight","KeyD"].includes(e.code)) input.x = 1; if (["ArrowUp","KeyW"].includes(e.code)) input.y = -1; if (["ArrowDown","KeyS"].includes(e.code)) input.y = 1;
    if (e.code === "KeyJ") chooseMove("punch"); if (e.code === "KeyK") chooseMove("kick"); if (e.code === "KeyL") input.guard = true; if (e.code === "KeyU" && player) player.startAttack("ultimate");
  });
  document.addEventListener("keyup", e => { input.keys.delete(e.code); if (![...input.keys].some(k => ["ArrowLeft","KeyA","ArrowRight","KeyD"].includes(k))) input.x = 0; if (![...input.keys].some(k => ["ArrowUp","KeyW","ArrowDown","KeyS"].includes(k))) input.y = 0; if (e.code === "KeyL") input.guard = false; });
  document.querySelectorAll("[data-fighter]").forEach(b => b.addEventListener("click", () => startGame(b.dataset.fighter)));
  document.getElementById("rematchBtn").addEventListener("click", () => startGame(player.id));
  document.getElementById("changeBtn").addEventListener("click", () => { mode = "select"; player = enemy = null; resultScreen.classList.add("hidden"); selectScreen.classList.remove("hidden"); });
  pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.textContent = paused ? "▶" : "Ⅱ"; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "fight") paused = true; });

  requestAnimationFrame(loop);
})();
