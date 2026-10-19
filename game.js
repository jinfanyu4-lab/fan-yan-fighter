(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const selectScreen = document.getElementById("selectScreen");
  const touchControls = document.getElementById("touchControls");
  const resultScreen = document.getElementById("resultScreen");
  const resultTitle = document.getElementById("resultTitle");
  const resultDetail = document.getElementById("resultDetail");
  const resultStats = document.getElementById("resultStats");
  const pauseBtn = document.getElementById("pauseBtn");
  const exitBtn = document.getElementById("exitBtn");
  const loadingScreen = document.getElementById("loadingScreen");
  const modeSelect = document.getElementById("modeSelect");
  const difficultySelect = document.getElementById("difficultySelect");
  const joystick = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  const punchBtn = document.getElementById("punchBtn");
  const kickBtn = document.getElementById("kickBtn");
  const guardBtn = document.getElementById("guardBtn");
  const superBtn = document.getElementById("superBtn");

  const W = 1280, H = 720, FLOOR = 610;
  const STEP = 1 / 60;
  const images = {}, knockdownImages = {}, assetPromises = {};
  const assetSources = {
    fan: ["dafanfan-fight-sprites.png", "dafanfan-knockdown-sprites.png"],
    yan: ["xiaoyanyan-fight-sprites.png", "xiaoyanyan-knockdown-sprites.png"],
    blob: ["huangtuantuan-fight-sprites.png", "huangtuantuan-knockdown-sprites.png"],
    rabbit: ["mengmiantu-fight-sprites.png", "mengmiantu-knockdown-sprites.png"],
    heartfrog: ["xindongwa-fight-sprites.png", "xindongwa-knockdown-sprites.png"]
  };
  const spriteCache = {};
  const knockdownCache = {};
  let backgroundCache = null;

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
    rabbit: { name: "美团鼠", color: "#ffe458", accent: "#1b102e", speed: 335, power: .94, scale: .97, effect: "moon", ultimate: "暗月连舞", ultimatePose: "kick" },
    heartfrog: { name: "心动蛙", color: "#ff4d87", accent: "#ff9ac0", speed: 265, power: 1.07, scale: 1.01, renderAspect: .94, effect: "heart", ultimate: "万箭穿心", ultimatePose: "punch" }
  };

  const moves = {
    punch: { label: "疾风拳", duration: .42, hitAt: .18, active: .08, reach: 205, damage: 7, knock: 34, priority: 1, color: "#fff4b0", hitbox: { x: 105, y: -245, w: 105, h: 145 } },
    body: { label: "碎甲重拳", duration: .55, hitAt: .28, active: .1, reach: 205, damage: 10, knock: 24, priority: 2, color: "#ff9a5c", hitbox: { x: 95, y: -175, w: 112, h: 150 } },
    uppercut: { label: "超级上勾拳", duration: .78, hitAt: .36, active: .12, reach: 220, damage: 15, knock: 58, launch: 170, priority: 3, color: "#ffd84d", special: true, hitbox: { x: 105, y: -235, w: 120, h: 245 } },
    kick: { label: "旋身踢", duration: .55, hitAt: .27, active: .11, reach: 285, damage: 10, knock: 46, priority: 2, color: "#67eeff", hitbox: { x: 155, y: -225, w: 150, h: 145 } },
    sweep: { label: "雷霆扫堂腿", duration: .82, hitAt: .44, active: .14, reach: 315, damage: 14, knock: 72, priority: 3, color: "#8d6cff", special: true, hitbox: { x: 165, y: -78, w: 190, h: 92 } },
    axe: { label: "螺旋大跳下劈腿", duration: 1.08, hitAt: .65, active: .15, reach: 265, damage: 18, knock: 84, launch: 105, priority: 4, color: "#ff4fca", special: true, hitbox: { x: 130, y: -210, w: 165, h: 260 } },
    dash: { label: "流星飞踢", duration: .76, hitAt: .37, active: .14, reach: 340, damage: 13, knock: 82, priority: 3, color: "#59e8ff", special: true, hitbox: { x: 195, y: -215, w: 180, h: 155 } },
    ultimate: { label: "大招", duration: 1.58, hitAt: .84, active: .2, reach: 500, damage: 32, knock: 125, launch: 180, priority: 9, color: "#ffd84d", special: true, ultimate: true, hitbox: { x: 230, y: -220, w: 430, h: 310 } }
  };

  let player, enemy, mode = "select", paused = false, last = performance.now(), accumulator = 0;
  let timer = 60, shake = 0, freeze = 0, slowMotion = 0, announce = null, aiClock = 0, ultimateFX = null, impactFlash = 0;
  const particles = [], hitBursts = [], damageTexts = [], pendingHits = [];
  const input = { x: 0, y: 0, guard: false, keys: new Set() };
  const match = { type: "versus", difficulty: "standard", playerId: null, enemyId: null, playerWins: 0, enemyWins: 0, round: 1, stats: null };
  const difficulty = {
    casual: { thinkMin: .25, thinkJitter: .28, guard: .22, attack: .38, perfect: .08 },
    standard: { thinkMin: .13, thinkJitter: .18, guard: .42, attack: .57, perfect: .2 },
    mamba: { thinkMin: .07, thinkJitter: .11, guard: .6, attack: .74, perfect: .34 }
  };

  function buildSpriteCache(id) {
    const img = images[id];
    if (!img || !img.complete || !img.naturalWidth || !roster[id]) return;
    const cellW = img.naturalWidth / 4, cellH = img.naturalHeight / 2;
    const height = ({ fan: 500, yan: 470, blob: 475, rabbit: 465, heartfrog: 475 }[id] || 470) * roster[id].scale;
    const width = height * (roster[id].renderAspect || cellW / cellH), pad = 42;
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

  function buildKnockdownCache(id) {
    const img = knockdownImages[id];
    if (!img || !img.complete || !img.naturalWidth || !roster[id]) return;
    const cellW = img.naturalWidth / 3, cellH = img.naturalHeight;
    const height = ({ fan: 500, yan: 470, blob: 475, rabbit: 465, heartfrog: 475 }[id] || 470) * roster[id].scale;
    const width = height * (cellW / cellH), pad = 42, frames = [];
    for (let frame = 0; frame < 3; frame++) {
      const layer = document.createElement("canvas");
      layer.width = Math.ceil(width + pad * 2); layer.height = Math.ceil(height + pad * 2);
      const layerCtx = layer.getContext("2d", { alpha: true });
      layerCtx.save(); layerCtx.globalAlpha = .42;
      layerCtx.filter = `blur(9px) drop-shadow(0 0 18px ${roster[id].color})`;
      layerCtx.drawImage(img, frame * cellW, 0, cellW, cellH, pad + 4, pad + 7, width, height);
      layerCtx.restore(); layerCtx.filter = "drop-shadow(0 15px 11px rgba(0,0,0,.5))";
      layerCtx.drawImage(img, frame * cellW, 0, cellW, cellH, pad, pad, width, height);
      layerCtx.filter = "none"; frames.push(layer);
    }
    knockdownCache[id] = { frames, width, height, pad, filtered: new Map() };
    knockdownImages[id] = null;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`无法加载角色素材：${src}`));
      img.src = src;
    });
  }

  function ensureFighterAssets(id) {
    if (spriteCache[id] && knockdownCache[id]) return Promise.resolve();
    if (assetPromises[id]) return assetPromises[id];
    const [fightSrc, knockSrc] = assetSources[id];
    assetPromises[id] = Promise.all([loadImage(fightSrc), loadImage(knockSrc)]).then(([fight, knock]) => {
      images[id] = fight; knockdownImages[id] = knock;
      buildSpriteCache(id); buildKnockdownCache(id);
      if (!spriteCache[id] || !knockdownCache[id]) throw new Error(`角色素材处理失败：${id}`);
    });
    return assetPromises[id];
  }

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

  function freshStats() {
    return { attacks: 0, hits: 0, blocked: 0, damageDealt: 0, damageTaken: 0, perfectGuards: 0, maxCombo: 0 };
  }

  function saveRecord() {
    if (!match.stats) return;
    const previous = JSON.parse(localStorage.getItem("mambaRecords") || "{}");
    previous.maxCombo = Math.max(previous.maxCombo || 0, match.stats.maxCombo);
    previous.totalWins = (previous.totalWins || 0) + (match.playerWins >= 2 ? 1 : 0);
    previous.bestDamage = Math.max(previous.bestDamage || 0, Math.round(match.stats.damageDealt));
    localStorage.setItem("mambaRecords", JSON.stringify(previous));
  }

  class Fighter {
    constructor(id, x, isPlayer) {
      Object.assign(this, roster[id]);
      this.id = id; this.x = x; this.y = FLOOR; this.isPlayer = isPlayer;
      this.vx = 0; this.vy = 0; this.hp = 100; this.displayHp = 100; this.energy = 35;
      this.facing = isPlayer ? 1 : -1; this.action = "idle"; this.actionTime = 0;
      this.hitDone = false; this.guard = false; this.hitFlash = 0; this.hitReact = 0; this.hitReactMax = 0; this.hitDir = 0; this.stun = 0;
      this.aiX = 0; this.aiGuard = false; this.guardMeter = 100; this.guardDelay = 0; this.guardAge = 99;
      this.combo = 0; this.comboTimer = 0; this.comboDamage = 0; this.bufferedAttack = null;
      this.thunderMarks = 0; this.markTimer = 0; this.armorReady = id === "blob"; this.armorCooldown = 0;
      this.knockdown = null; this.knockTimer = 0; this.invulnerable = 0;
      this.wakeRoll = 0;
    }
    startAttack(name) {
      if (this.stun > 0 || this.action !== "idle" || this.guard || mode !== "fight") return false;
      if (name === "ultimate") {
        if (this.energy < 100) return false;
        this.energy = 0;
        ultimateFX = { owner: this, type: this.effect, life: moves.ultimate.duration, max: moves.ultimate.duration };
      }
      this.action = name; this.actionTime = 0; this.hitDone = false;
      if (this.isPlayer && match.stats) match.stats.attacks += 1;
      announce = { text: name === "ultimate" ? this.ultimate : moves[name].label, color: name === "ultimate" ? this.accent : moves[name].color, life: name === "ultimate" ? 1.35 : .82, owner: this, big: name === "ultimate" };
      return true;
    }
  }

  async function startGame(chosen) {
    if (mode === "loading") return;
    mode = "loading";
    match.type = modeSelect.value;
    match.difficulty = difficultySelect.value;
    match.playerId = chosen;
    const rivals = Object.keys(roster).filter(id => id !== chosen);
    match.enemyId = rivals[Math.floor(Math.random() * rivals.length)];
    match.playerWins = 0; match.enemyWins = 0; match.round = 1; match.stats = freshStats();
    loadingScreen.classList.remove("hidden");
    selectScreen.classList.add("hidden"); resultScreen.classList.add("hidden");
    try {
      await Promise.all([ensureFighterAssets(match.playerId), ensureFighterAssets(match.enemyId)]);
    } catch (error) {
      loadingScreen.classList.add("hidden"); selectScreen.classList.remove("hidden"); mode = "select";
      announce = null; alert(error.message); return;
    }
    loadingScreen.classList.add("hidden");
    beginRound();
  }

  function beginRound() {
    player = new Fighter(match.playerId, 330, true);
    enemy = new Fighter(match.enemyId, 950, false);
    if (match.type === "training") { player.energy = 100; enemy.energy = 0; }
    touchControls.classList.remove("hidden"); pauseBtn.classList.remove("hidden");
    exitBtn.classList.remove("hidden"); resultScreen.classList.add("hidden");
    mode = "countdown"; paused = false; timer = match.type === "training" ? Infinity : 60; aiClock = 0; shake = 0; slowMotion = 0; impactFlash = 0; ultimateFX = null; particles.length = 0; hitBursts.length = 0; damageTexts.length = 0; pendingHits.length = 0;
    input.x = input.y = 0; input.guard = false; stick.style.transform = "translate(0,0)";
    pauseBtn.textContent = "Ⅱ"; pauseBtn.setAttribute("aria-pressed", "false");
    superBtn.classList.remove("ready");
    announce = { text: match.type === "training" ? "训练开始" : `第 ${match.round} 回合`, color: "#ffd84d", life: 1.05, big: true };
    match.countdown = 1.05;
  }

  function resolveMove(kind, actor) {
    const ix = actor.isPlayer ? input.x : actor.aiX;
    const iy = actor.isPlayer ? input.y : 0;
    if (kind === "punch") {
      if (iy < -.46) return "uppercut";
      if (iy > .46) return "body";
      return "punch";
    } else {
      if (iy < -.46) return "axe";
      if (iy > .46) return "sweep";
      if (Math.abs(ix) > .62 && Math.sign(ix) === actor.facing) return "dash";
      return "kick";
    }
  }

  function chooseMove(kind, actor = player) {
    if (!actor) return;
    const name = resolveMove(kind, actor);
    if (!actor.startAttack(name) && actor.isPlayer && mode === "fight") actor.bufferedAttack = { name, life: .13 };
  }

  function beginKnockdown(f, direction, force = false) {
    if (f.knockdown && !force) return;
    f.knockdown = "fall"; f.knockTimer = 0; f.guard = false; f.action = "idle"; f.actionTime = 0; f.hitDone = false;
    f.stun = Math.max(f.stun, .45); f.vx = direction * Math.max(250, Math.abs(f.vx)); f.vy = Math.min(f.vy, -185);
  }

  function moveConnects(attacker, target, move) {
    if (target.invulnerable > 0 || target.knockdown) return false;
    const box = move.hitbox;
    const localX = (target.x - attacker.x) * attacker.facing;
    const attackLeft = box.x - box.w / 2, attackRight = box.x + box.w / 2;
    const targetRadius = target.id === "fan" ? 54 : target.id === "yan" ? 66 : target.id === "heartfrog" ? 68 : 62;
    if (localX + targetRadius < attackLeft || localX - targetRadius > attackRight) return false;
    const attackTop = attacker.y + box.y - box.h / 2, attackBottom = attacker.y + box.y + box.h / 2;
    const targetTop = target.y - (target.id === "fan" ? 420 : target.id === "heartfrog" ? 400 : 390), targetBottom = target.y - 24;
    return attackBottom >= targetTop && attackTop <= targetBottom;
  }

  function updateFighter(f, other, dt) {
    f.hitFlash = Math.max(0, f.hitFlash - dt * 4);
    f.hitReact = Math.max(0, f.hitReact - dt);
    f.invulnerable = Math.max(0, f.invulnerable - dt);
    f.comboTimer = Math.max(0, f.comboTimer - dt);
    if (f.comboTimer <= 0) { f.combo = 0; f.comboDamage = 0; }
    f.markTimer = Math.max(0, f.markTimer - dt);
    if (f.markTimer <= 0) f.thunderMarks = 0;
    f.guardDelay = Math.max(0, f.guardDelay - dt);
    if (f.armorCooldown > 0) {
      f.armorCooldown = Math.max(0, f.armorCooldown - dt);
      if (f.armorCooldown <= 0 && f.id === "blob") f.armorReady = true;
    }
    if (!f.guard && f.guardDelay <= 0) f.guardMeter = Math.min(100, f.guardMeter + dt * 20);
    if (f.bufferedAttack) {
      f.bufferedAttack.life -= dt;
      if (f.bufferedAttack.life <= 0) f.bufferedAttack = null;
    }
    if (f.displayHp > f.hp) f.displayHp = Math.max(f.hp, f.displayHp - dt * 22);
    f.stun = Math.max(0, f.stun - dt);
    if (mode === "fight" && f.action !== "ultimate") f.energy = Math.min(100, f.energy + dt * 8);
    const moveX = f.isPlayer ? input.x : f.aiX;
    if (f.knockdown) {
      f.guard = false; f.action = "idle"; f.bufferedAttack = null;
      if (f.knockdown === "fall") {
        f.vx *= Math.pow(.018, dt); f.vy += 1150 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        f.x = Math.max(260, Math.min(W - 260, f.x));
        if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; f.vx = 0; f.knockdown = "down"; f.knockTimer = .68; f.invulnerable = 1.35; shake = Math.max(shake, 9); }
      } else {
        f.y = FLOOR; f.vx = 0; f.vy = 0; f.knockTimer -= dt;
        if (f.knockdown === "down") {
          const rollInput = f.isPlayer ? input.x : f.aiX;
          if (Math.abs(rollInput) > .55) f.wakeRoll = Math.sign(rollInput);
          if (f.knockTimer <= 0) { f.knockdown = "getup"; f.knockTimer = .62; if (!f.isPlayer && Math.random() < .45) f.wakeRoll = Math.random() < .5 ? -1 : 1; }
        }
        if (f.knockdown === "getup" && f.wakeRoll) {
          f.x += f.wakeRoll * 145 * dt;
          f.x = Math.max(260, Math.min(W - 260, f.x));
        }
        if (f.knockdown === "getup" && f.knockTimer <= 0) { f.knockdown = null; f.stun = 0; f.invulnerable = .24; f.wakeRoll = 0; }
      }
      return;
    }
    const wantsGuard = f.isPlayer ? input.guard : f.aiGuard;
    const wasGuarding = f.guard;
    f.guard = f.stun <= 0 && f.action === "idle" && f.guardMeter > 0 && wantsGuard;
    if (f.guard && !wasGuarding) f.guardAge = 0;
    else if (f.guard) f.guardAge += dt;
    else f.guardAge = 99;
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
        if (f.effect === "heart") { f.y = FLOOR - Math.sin(up * Math.PI) * 72; f.x += f.facing * 245 * dt; }
      }
      const activeEnd = m.hitAt + (m.active || STEP);
      if (!f.hitDone && f.actionTime >= m.hitAt && f.actionTime <= activeEnd && moveConnects(f, other, m)) {
        f.hitDone = true; pendingHits.push({ attacker: f, target: other, move: m, action: f.action });
      } else if (!f.hitDone && f.actionTime > activeEnd) f.hitDone = true;
      const duration = f.id === "yan" && m.special ? m.duration * .88 : m.duration;
      const canCancel = f.bufferedAttack && f.actionTime >= duration * .78 && !m.ultimate;
      if (f.actionTime >= duration || canCancel) {
        f.action = "idle"; f.actionTime = 0; f.y = Math.min(f.y, FLOOR);
        if (f.bufferedAttack) { const queued = f.bufferedAttack.name; f.bufferedAttack = null; f.startAttack(queued); }
      }
    }
    if (f.action === "idle" && f.bufferedAttack && f.stun <= 0 && !f.guard) { const queued = f.bufferedAttack.name; f.bufferedAttack = null; f.startAttack(queued); }
  }

  function landHit(attacker, target, move, actionName = attacker.action, deferFinish = false) {
    let blocked = target.guard && target.facing === -attacker.facing;
    const aiPerfectChance = difficulty[match.difficulty]?.perfect ?? .2;
    const perfect = blocked && target.guardAge <= .14 && (target.isPlayer || Math.random() < aiPerfectChance);
    let guardBreak = false;
    if (blocked && !perfect) {
      target.guardMeter = Math.max(0, target.guardMeter - (move.damage * (move.ultimate ? 3.7 : move.special ? 3.15 : 2.65)));
      target.guardDelay = 1.15;
      if (target.guardMeter <= 0) { guardBreak = true; blocked = false; target.guard = false; target.stun = .88; target.guardDelay = 1.65; }
    }
    const chainScale = Math.max(.72, 1 - attacker.combo * .055);
    const passiveScale = attacker.id === "yan" && move.special ? 1.14 : 1;
    let damage = move.damage * attacker.power * chainScale * passiveScale * (perfect ? 0 : blocked ? .2 : guardBreak ? .58 : 1);
    let armored = false;
    if (!blocked && !guardBreak && !move.ultimate && target.id === "blob" && target.armorReady) {
      armored = true; target.armorReady = false; target.armorCooldown = 9; damage *= .5;
    }
    target.hp = Math.max(0, target.hp - damage);
    if (match.stats) {
      if (attacker.isPlayer) {
        if (blocked || perfect) match.stats.blocked += 1; else match.stats.hits += 1;
        match.stats.damageDealt += damage;
      }
      if (target.isPlayer) match.stats.damageTaken += damage;
      if (perfect && target.isPlayer) match.stats.perfectGuards += 1;
    }
    target.hitFlash = 1;
    target.hitReactMax = perfect ? .12 : blocked ? .18 : armored ? .2 : move.ultimate ? .62 : move.special ? .42 : .3;
    target.hitReact = target.hitReactMax;
    target.hitDir = attacker.facing;
    target.vx = attacker.facing * move.knock * (perfect ? .65 : blocked ? 2.2 : armored ? 1.3 : 4.1);
    if (perfect) {
      slowMotion = .24; attacker.stun = Math.max(attacker.stun, .24); target.energy = Math.min(100, target.energy + 18);
      if (target.id === "rabbit") { attacker.hp = Math.max(0, attacker.hp - 4); attacker.hitFlash = 1; attacker.hitReact = attacker.hitReactMax = .24; attacker.hitDir = -attacker.facing; target.energy = Math.min(100, target.energy + 20); }
    } else if (!blocked && !armored) {
      target.stun = Math.max(target.stun, guardBreak ? .88 : move.ultimate ? .62 : move.special ? .4 : .22);
      target.vy = guardBreak ? -55 : -(move.launch || 34);
      if (target.action !== "ultimate") { target.action = "idle"; target.actionTime = 0; target.hitDone = false; }
      if (guardBreak || move.ultimate || (move.launch || 0) >= 100) beginKnockdown(target, attacker.facing);
    }
    if (!blocked && !perfect) {
      attacker.combo = attacker.comboTimer > 0 ? attacker.combo + 1 : 1;
      attacker.comboTimer = 1.05; attacker.comboDamage += damage;
      if (attacker.isPlayer && match.stats) match.stats.maxCombo = Math.max(match.stats.maxCombo, attacker.combo);
      target.combo = 0; target.comboTimer = 0; target.comboDamage = 0;
    }
    if (!blocked && !perfect && attacker.id === "heartfrog" && damage > 0) {
      const healing = Math.min(100 - attacker.hp, Math.max(1, Math.round(damage * .22)));
      if (healing > 0) {
        attacker.hp += healing; attacker.displayHp = Math.max(attacker.displayHp, attacker.hp);
        damageTexts.push({ x: attacker.x, y: attacker.y - 365, value: 0, blocked: false, label: `心动汲取 +${healing}`, color: "#ff9ac0", life: .9, max: .9 });
        burst(attacker.x, attacker.y - 250, "#ff5d9b", 9, "heart");
      }
    }
    if (!move.ultimate) attacker.energy = Math.min(100, attacker.energy + (blocked ? 10 : move.damage * 2.2));
    target.energy = Math.min(100, target.energy + damage * 1.25);
    shake = perfect ? 12 : guardBreak ? 21 : blocked ? 5 : (move.ultimate ? 28 : move.special ? 17 : 10); freeze = perfect ? .035 : guardBreak ? .09 : blocked ? .025 : move.ultimate ? .12 : .055;
    impactFlash = Math.max(impactFlash, perfect ? .32 : guardBreak ? .48 : blocked ? .12 : move.ultimate ? .62 : move.special ? .38 : .24);
    const strikeY = actionName === "sweep" ? attacker.y - 72
      : actionName === "uppercut" ? attacker.y - 285
      : actionName === "axe" ? attacker.y - 135
      : actionName === "kick" || actionName === "dash" ? attacker.y - 210
      : attacker.y - 245;
    const strikeX = attacker.x + attacker.facing * Math.min(move.hitbox.x + move.hitbox.w * .28, Math.abs(target.x - attacker.x) * .72);
    burst(strikeX, strikeY, perfect ? "#ffffff" : attacker.accent, perfect ? 28 : guardBreak ? 34 : blocked ? 8 : move.ultimate ? 48 : 18, attacker.effect);
    const hitLabel = perfect ? "精准格挡" : guardBreak ? "破防" : armored ? "霸体" : blocked ? "格挡" : "";
    damageTexts.push({ x: target.x, y: target.y - 330, value: Math.max(0, Math.round(damage)), blocked: blocked || perfect, label: hitLabel, color: perfect ? "#ffffff" : guardBreak ? "#ff365f" : blocked ? "#67eeff" : move.ultimate ? "#ffd84d" : "#ffffff", life: .82, max: .82 });
    announce = { text: perfect ? "精准格挡！" : guardBreak ? "破防！" : armored ? "熔金霸体！" : blocked ? "格挡！" : move.ultimate ? attacker.ultimate : move.label, color: perfect ? "#ffffff" : guardBreak ? "#ff365f" : blocked ? "#59e8ff" : attacker.accent, life: perfect || guardBreak ? .92 : move.ultimate ? 1.05 : .72, owner: perfect || guardBreak ? target : attacker, big: perfect || guardBreak };
    if (!blocked && !perfect && attacker.id === "fan") {
      target.thunderMarks += 1; target.markTimer = 4;
      if (target.thunderMarks >= 3) {
        target.thunderMarks = 0; target.hp = Math.max(0, target.hp - 8); target.hitFlash = 1; target.stun = Math.max(target.stun, .34); attacker.energy = Math.min(100, attacker.energy + 18);
        if (attacker.isPlayer && match.stats) match.stats.damageDealt += 8;
        if (target.isPlayer && match.stats) match.stats.damageTaken += 8;
        burst(target.x, target.y - 220, "#ffd84d", 34, "thunder"); shake = Math.max(shake, 18); impactFlash = Math.max(impactFlash, .42);
        damageTexts.push({ x: target.x, y: target.y - 385, value: 8, blocked: false, label: "雷印爆发", color: "#ffd84d", life: 1, max: 1 });
        announce = { text: "三重雷印爆发！", color: "#ffd84d", life: 1, owner: attacker, big: true };
      }
    }
    if (perfect && target.id === "rabbit") burst(attacker.x, attacker.y - 220, "#ffe458", 24, "moon");
    if (!deferFinish) {
      if (target.hp <= 0) { beginKnockdown(target, attacker.facing, true); finish(attacker, target); }
      else if (attacker.hp <= 0) { beginKnockdown(attacker, -attacker.facing, true); finish(target, attacker); }
    }
  }

  function resolvePendingHits() {
    if (!pendingHits.length) return;
    const hits = pendingHits.splice(0, pendingHits.length);
    for (const hit of hits) landHit(hit.attacker, hit.target, hit.move, hit.action, true);
    if (match.type === "training") {
      if (enemy.hp <= 0) { beginKnockdown(enemy, player.facing, true); mode = "training-reset"; match.finishTimer = 1.25; announce = { text: "训练击倒！", color: "#ffd84d", life: 1, big: true }; }
      if (player.hp <= 0) { player.hp = 100; player.displayHp = 100; player.invulnerable = .5; }
      return;
    }
    if (player.hp <= 0 && enemy.hp <= 0) { beginKnockdown(player, -player.facing, true); beginKnockdown(enemy, player.facing, true); finish(null, null); }
    else if (enemy.hp <= 0) { beginKnockdown(enemy, player.facing, true); finish(player, enemy); }
    else if (player.hp <= 0) { beginKnockdown(player, enemy.facing, true); finish(enemy, player); }
  }

  function updateAI(dt) {
    if (match.type === "training") { enemy.aiX = 0; enemy.aiGuard = false; return; }
    aiClock -= dt;
    if (aiClock > 0 || !enemy || mode !== "fight") return;
    const cfg = difficulty[match.difficulty] || difficulty.standard;
    aiClock = cfg.thinkMin + Math.random() * cfg.thinkJitter;
    const dist = Math.abs(player.x - enemy.x);
    const playerThreat = player.action !== "idle" && dist <= (moves[player.action]?.reach || 230) + 55;
    enemy.aiGuard = enemy.guardMeter > 14 && playerThreat && Math.random() < cfg.guard;
    if (enemy.stun > 0 || enemy.action !== "idle") { enemy.aiX = 0; return; }
    if (enemy.energy >= 100 && dist < 410 && !enemy.aiGuard) { enemy.startAttack("ultimate"); return; }
    if (enemy.guardMeter < 24 || enemy.hp < 22 && player.hp > enemy.hp) enemy.aiX = -Math.sign(player.x - enemy.x);
    else if (dist > 300) enemy.aiX = Math.sign(player.x - enemy.x);
    else if (dist < 110) enemy.aiX = -Math.sign(player.x - enemy.x) * (Math.random() < .55 ? 1 : 0);
    else enemy.aiX = 0;
    if (!enemy.aiGuard && Math.random() < cfg.attack) {
      const r = Math.random();
      let move = null;
      if (player.y < FLOOR - 80 && dist < 235) move = "uppercut";
      else if (dist > 245 && dist < 355) move = "dash";
      else if (dist < 135 && player.guard && r < .55) move = "body";
      else if (dist < 220) move = r < .22 ? "punch" : r < .46 ? "kick" : r < .68 ? "sweep" : r < .86 ? "uppercut" : "axe";
      else if (dist < 285) move = r < .62 ? "kick" : "dash";
      if (move) enemy.startAttack(move);
    }
  }

  function burst(x, y, color, count, kind = "thunder") {
    hitBursts.push({ x, y, color, kind, life: kind === "goo" ? .42 : .28, max: kind === "goo" ? .42 : .28 });
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 560, vy: (Math.random() - .72) * 470, life: .38 + Math.random() * .42, color, kind, size: 3 + Math.random() * 9, spin: Math.random() * Math.PI * 2 });
  }

  function finish(winner, loser = null) {
    if (mode === "finishing" || mode === "over") return;
    mode = "finishing"; input.guard = false; touchControls.classList.add("hidden"); pauseBtn.classList.add("hidden");
    if (loser && !loser.knockdown) beginKnockdown(loser, winner.facing, true);
    if (winner?.isPlayer) match.playerWins += 1;
    else if (winner) match.enemyWins += 1;
    match.roundWinner = winner;
    match.finishTimer = 1.45;
    announce = { text: winner ? "K.O." : "双重 K.O.", color: "#ffd84d", life: 1.25, big: true };
  }

  function showResult() {
    mode = "over";
    const winner = match.roundWinner;
    const matchOver = match.playerWins >= 2 || match.enemyWins >= 2;
    resultTitle.textContent = winner ? `${winner.name}胜利` : "双方战平";
    resultDetail.textContent = matchOver
      ? `${match.playerWins} : ${match.enemyWins} · ${match.playerWins >= 2 ? "你赢得整场对决！" : "电脑赢得整场对决"}`
      : `${match.playerWins} : ${match.enemyWins} · ${winner?.isPlayer ? "漂亮的一局！" : winner ? "调整节奏，下一局扳回来" : "下一局继续决胜"}`;
    const s = match.stats || freshStats();
    resultStats.innerHTML = [
      [s.maxCombo, "最高连击"], [Math.round(s.damageDealt), "造成伤害"],
      [s.perfectGuards, "精准格挡"], [s.attacks ? `${Math.round(s.hits / s.attacks * 100)}%` : "0%", "命中率"]
    ].map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
    document.getElementById("rematchBtn").textContent = matchOver ? "再战一场" : "下一回合";
    if (matchOver) saveRecord();
    resultScreen.classList.remove("hidden");
  }

  function continueMatch() {
    const matchOver = match.playerWins >= 2 || match.enemyWins >= 2;
    if (matchOver) { match.playerWins = 0; match.enemyWins = 0; match.round = 1; match.stats = freshStats(); }
    else match.round += 1;
    beginRound();
  }

  function returnToSelection() {
    mode = "select"; paused = false; player = enemy = null; accumulator = 0;
    input.x = input.y = 0; input.guard = false; input.keys.clear();
    touchControls.classList.add("hidden"); pauseBtn.classList.add("hidden"); exitBtn.classList.add("hidden");
    resultScreen.classList.add("hidden"); loadingScreen.classList.add("hidden"); selectScreen.classList.remove("hidden");
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
    const source = images[f.id], downSource = knockdownImages[f.id];
    if (!spriteCache[f.id] && source && source.complete && source.naturalWidth) buildSpriteCache(f.id);
    if (!knockdownCache[f.id] && downSource && downSource.complete && downSource.naturalWidth) buildKnockdownCache(f.id);
    const isDown = Boolean(f.knockdown), cached = isDown ? knockdownCache[f.id] : spriteCache[f.id];
    if (!cached) return;

    let pose = f.guard ? "guard" : f.action === "ultimate" ? f.ultimatePose : f.action;
    if (f.hitReact > 0 && !f.guard) pose = "idle";
    if (pose === "idle" && (Math.abs(f.vx) > 22 || Math.abs(f.isPlayer ? input.x : f.aiX) > .2)) pose = "walk";
    const frame = isDown ? (f.knockdown === "fall" ? 0 : f.knockdown === "down" ? 1 : 2) : (poseFrame[pose] ?? 0);
    const frameCanvas = cached.frames[frame], height = cached.height, width = cached.width, pad = cached.pad;

    let p = 0, snap = 0, dx = 0, dy = 0, angle = 0, sx = 1, sy = 1;
    if (!isDown && f.action !== "idle") {
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
        if (f.effect === "heart") { dx = f.facing * 38 * snap; sx = 1 + .1 * snap; sy = 1 - .05 * snap; }
      }
    } else if (!isDown) {
      dy = Math.sin(t * 4.8 + (f.isPlayer ? 0 : 2.4)) * 3;
      if (pose === "walk") dx = Math.sin(t * 11) * 4;
    }

    if (f.hitReact > 0 && !isDown) {
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

    if (!isDown && f.action !== "idle" && snap > .45) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = .13 * snap;
      const trailColor = f.action === "ultimate" ? f.accent : moves[f.action].color;
      const trailFrame = filteredFrame(cached, frame, `trail:${trailColor}`, `blur(3px) drop-shadow(0 0 12px ${trailColor})`);
      ctx.drawImage(trailFrame, -width / 2 - pad - f.facing * 20, -height - pad, trailFrame.width, trailFrame.height);
    }
    ctx.restore(); ctx.filter = "none"; ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;

    if (f.hitReact > 0 && !isDown) {
      const k = f.hitReact / Math.max(.001, f.hitReactMax);
      ctx.save(); ctx.translate(f.x, f.y - 225); ctx.globalAlpha = k * .7;
      ctx.strokeStyle = "#ff365f"; ctx.lineWidth = 8 * k; ctx.shadowColor = "#ff365f"; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(0, 0, 94 + (1 - k) * 70, 0, Math.PI * 2); ctx.stroke();
      for (let n = 0; n < 6; n++) { const a = n / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 74, Math.sin(a) * 110); ctx.lineTo(Math.cos(a) * (112 + (1 - k) * 70), Math.sin(a) * (158 + (1 - k) * 70)); ctx.stroke(); }
      ctx.restore();
    }

    if (!isDown && f.guard) {
      ctx.save(); ctx.strokeStyle = f.accent; ctx.globalAlpha = .86; ctx.lineWidth = 8;
      ctx.shadowColor = f.accent; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(f.x + f.facing * 32, f.y - 235, 112, -1.28, 1.28); ctx.stroke(); ctx.restore();
    }
    if (f.thunderMarks > 0) {
      ctx.save(); ctx.translate(f.x, f.y - 440); ctx.shadowColor = "#ffd84d"; ctx.shadowBlur = 16;
      for (let n = 0; n < f.thunderMarks; n++) { ctx.fillStyle = "#ffd84d"; ctx.beginPath(); ctx.arc((n - 1) * 28, 0, 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (f.id === "blob" && f.armorReady) {
      ctx.save(); ctx.strokeStyle = "rgba(255,201,61,.72)"; ctx.lineWidth = 5; ctx.shadowColor = "#ff7a26"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 215, 132, 205, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  function drawHUD() {
    if (!player || !enemy || mode === "select") return;
    const pad = 34, barW = 420, y = 32;
    healthBar(pad, y, barW, player.hp / 100, player, false);
    healthBar(W - pad - barW, y, barW, enemy.hp / 100, enemy, true);
    ctx.textAlign = "center"; ctx.font = "1000 42px system-ui"; ctx.fillStyle = "#fff";
    ctx.fillText(match.type === "training" ? "∞" : Math.max(0, Math.ceil(timer)).toString().padStart(2, "0"), W / 2, 70);
    ctx.font = "800 13px system-ui"; ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText(match.type === "training" ? "TRAINING" : `ROUND ${match.round} · ${match.playerWins} - ${match.enemyWins}`, W / 2, 91);
    drawCombo(player, 248, 168, false); drawCombo(enemy, W - 248, 168, true);
    superBtn.classList.toggle("ready", player.energy >= 100 && mode === "fight");
  }

  function drawCombo(f, x, y, reverse) {
    if (f.combo < 2 || f.comboTimer <= 0) return;
    ctx.save(); ctx.textAlign = reverse ? "right" : "left"; ctx.globalAlpha = Math.min(1, f.comboTimer * 2.4);
    ctx.font = "1000 52px system-ui"; ctx.fillStyle = f.accent; ctx.shadowColor = f.color; ctx.shadowBlur = 20; ctx.fillText(`${f.combo} HIT`, x, y);
    ctx.font = "900 16px system-ui"; ctx.fillStyle = "white"; ctx.fillText(`${Math.round(f.comboDamage)} DAMAGE · COMBO`, x, y + 25); ctx.restore();
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
    ctx.fillStyle = "rgba(5,3,12,.82)"; roundRect(x, y + 48, width, 7, 4); ctx.fill();
    const guardW = Math.max(0, width * f.guardMeter / 100); ctx.fillStyle = f.guardMeter < 28 ? "#ff365f" : "#67eeff";
    roundRect(reverse ? x + width - guardW : x, y + 48, guardW, 7, 4); ctx.fill();
    ctx.font = "1000 20px system-ui"; ctx.textAlign = reverse ? "right" : "left"; ctx.fillStyle = "white"; ctx.fillText(f.name, reverse ? x + width : x, y + 75);
    ctx.font = "800 11px system-ui"; ctx.fillStyle = "rgba(255,255,255,.58)"; ctx.fillText(`${f.isPlayer ? "PLAYER" : "CPU"} · ${passiveStatus(f)}`, reverse ? x + width : x, y + 94);
    ctx.restore();
  }

  function passiveStatus(f) {
    if (f.id === "fan") return "雷印引爆";
    if (f.id === "yan") return "旋翼迅击";
    if (f.id === "blob") return f.armorReady ? "熔金霸体 READY" : `霸体 ${Math.ceil(f.armorCooldown)}s`;
    if (f.id === "rabbit") return "暗月反击";
    return "心动汲取 22%";
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
    } else if (ultimateFX.type === "heart") {
      ctx.fillStyle = `rgba(77,2,39,${.42 * Math.sin(k * Math.PI)})`; ctx.fillRect(0, 0, W, H);
      ctx.translate(a.x + a.facing * 105, a.y - 235); ctx.strokeStyle = a.accent; ctx.fillStyle = a.color; ctx.shadowColor = "#ff2e77"; ctx.shadowBlur = 28;
      for (let n = 0; n < 6; n++) { const size = 22 + n * 20 + k * 95; ctx.globalAlpha = .8 - n * .09; ctx.lineWidth = Math.max(3, 11 - n); drawHeartPath(ctx, a.facing * (n * 48 + k * 95), Math.sin(n * 1.8) * 42, size); ctx.stroke(); }
    }
    ctx.restore();
    if (ultimateFX.life <= 0) ultimateFX = null;
  }

  function drawHeartPath(target, x, y, size) {
    target.beginPath(); target.moveTo(x, y + size * .3);
    target.bezierCurveTo(x - size * .95, y - size * .3, x - size * .42, y - size, x, y - size * .42);
    target.bezierCurveTo(x + size * .42, y - size, x + size * .95, y - size * .3, x, y + size * .3);
    target.closePath();
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
      else if (p.kind === "heart") { drawHeartPath(ctx, 0, 0, p.size * 1.35); ctx.fill(); }
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
      else if (b.kind === "heart") { for (let n = 0; n < 4; n++) { const q = n / 4 * Math.PI * 2; drawHeartPath(ctx, Math.cos(q) * (20 + k * 125), Math.sin(q) * (14 + k * 78), 30 * (1 - k)); ctx.stroke(); } }
      else { for (let n = 0; n < 4; n++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 34 + k * 108 + n * 8, -.7, .7); ctx.stroke(); } }
      ctx.restore();
    }
    for (let i = damageTexts.length - 1; i >= 0; i--) {
      const d = damageTexts[i]; d.life -= dt; d.y -= dt * 74;
      if (d.life <= 0) { damageTexts.splice(i, 1); continue; }
      const k = d.life / d.max; ctx.save(); ctx.globalAlpha = Math.min(1, k * 2.6); ctx.textAlign = "center";
      ctx.font = `1000 ${d.blocked ? 25 : 36}px system-ui`; ctx.fillStyle = d.color; ctx.strokeStyle = "rgba(20,3,14,.9)"; ctx.lineWidth = 8;
      const text = d.label ? `${d.label}${d.value ? ` -${d.value}` : ""}` : `-${d.value}`; ctx.strokeText(text, d.x, d.y); ctx.fillText(text, d.x, d.y); ctx.restore();
    }
    if (announce) {
      announce.life -= dt; if (announce.life <= 0) announce = null; else {
        const a = Math.min(1, announce.life * 3); ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.font = `1000 ${announce.big ? 96 : 34}px system-ui`; ctx.fillStyle = announce.color; ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 18;
        const x = announce.owner ? announce.owner.x : W / 2, y = announce.big ? H * .45 : 150;
        ctx.fillText(announce.text, x, y); ctx.restore();
      }
    }
  }

  function stepGame(realStep) {
    if (paused) return;
    let simStep = realStep;
    if (slowMotion > 0) { slowMotion = Math.max(0, slowMotion - realStep); simStep *= .24; }
    if (freeze > 0) { freeze = Math.max(0, freeze - realStep); simStep = 0; }
    if (!player || !enemy) return;
    if (mode === "countdown") {
      match.countdown -= realStep;
      if (simStep > 0) { updateFighter(player, enemy, simStep); updateFighter(enemy, player, simStep); resolvePendingHits(); }
      if (match.countdown <= 0) { mode = "fight"; announce = { text: match.type === "training" ? "自由训练" : "开打！", color: "#ffffff", life: .85, big: true }; }
    } else if (mode === "fight") {
      if (Number.isFinite(timer)) timer -= realStep;
      if (simStep > 0) { updateAI(simStep); updateFighter(player, enemy, simStep); updateFighter(enemy, player, simStep); resolvePendingHits(); }
      if (timer <= 0 && mode === "fight") {
        if (Math.abs(player.hp - enemy.hp) < .01) finish(null, null);
        else { const winner = player.hp > enemy.hp ? player : enemy; finish(winner, winner === player ? enemy : player); }
      }
    } else if (mode === "finishing") {
      if (simStep > 0) { updateFighter(player, enemy, simStep); updateFighter(enemy, player, simStep); }
      match.finishTimer -= realStep;
      if (match.finishTimer <= 0) showResult();
    } else if (mode === "training-reset") {
      if (simStep > 0) { updateFighter(player, enemy, simStep); updateFighter(enemy, player, simStep); }
      match.finishTimer -= realStep;
      if (match.finishTimer <= 0) beginRound();
    }
  }

  function loop(now) {
    const realDt = Math.min(.1, (now - last) / 1000); last = now;
    accumulator = Math.min(.25, accumulator + realDt);
    while (accumulator >= STEP) { stepGame(STEP); accumulator -= STEP; }
    const visualDt = paused || freeze > 0 ? 0 : realDt * (slowMotion > 0 ? .24 : 1);
    ctx.save(); if (shake > .2) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .82; }
    drawBackground(now / 1000); if (player && enemy) { const order = player.x < enemy.x ? [player, enemy] : [enemy, player]; drawFighter(order[0], now / 1000); drawFighter(order[1], now / 1000); } drawEffects(visualDt); drawHUD();
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
  function triggerUltimate() {
    if (!player) return;
    if (!player.startAttack("ultimate") && mode === "fight" && player.energy >= 100) player.bufferedAttack = { name: "ultimate", life: .16 };
  }
  superBtn.addEventListener("pointerdown", e => { e.preventDefault(); superBtn.classList.add("pressed"); triggerUltimate(); });
  ["pointerup","pointercancel","pointerleave"].forEach(n => superBtn.addEventListener(n, () => superBtn.classList.remove("pressed")));
  guardBtn.addEventListener("pointerdown", e => { e.preventDefault(); input.guard = true; guardBtn.classList.add("pressed"); });
  ["pointerup","pointercancel","pointerleave"].forEach(n => guardBtn.addEventListener(n, () => { input.guard = false; guardBtn.classList.remove("pressed"); }));

  document.addEventListener("keydown", e => {
    input.keys.add(e.code); if (["ArrowLeft","KeyA"].includes(e.code)) input.x = -1; if (["ArrowRight","KeyD"].includes(e.code)) input.x = 1; if (["ArrowUp","KeyW"].includes(e.code)) input.y = -1; if (["ArrowDown","KeyS"].includes(e.code)) input.y = 1;
    if (!e.repeat && e.code === "KeyJ") chooseMove("punch"); if (!e.repeat && e.code === "KeyK") chooseMove("kick"); if (e.code === "KeyL") input.guard = true; if (!e.repeat && e.code === "KeyU") triggerUltimate();
  });
  document.addEventListener("keyup", e => { input.keys.delete(e.code); if (![...input.keys].some(k => ["ArrowLeft","KeyA","ArrowRight","KeyD"].includes(k))) input.x = 0; if (![...input.keys].some(k => ["ArrowUp","KeyW","ArrowDown","KeyS"].includes(k))) input.y = 0; if (e.code === "KeyL") input.guard = false; });
  document.querySelectorAll("[data-fighter]").forEach(b => b.addEventListener("click", () => startGame(b.dataset.fighter)));
  document.getElementById("rematchBtn").addEventListener("click", continueMatch);
  document.getElementById("changeBtn").addEventListener("click", returnToSelection);
  exitBtn.addEventListener("click", returnToSelection);
  pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.textContent = paused ? "▶" : "Ⅱ"; pauseBtn.setAttribute("aria-pressed", String(paused)); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && ["fight","countdown","finishing","training-reset"].includes(mode)) { paused = true; pauseBtn.textContent = "▶"; pauseBtn.setAttribute("aria-pressed", "true"); } });

  requestAnimationFrame(loop);
})();
