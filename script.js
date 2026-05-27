"use strict";
console.clear();

// ─── Block colour themes ─────────────────────────────────────────────────
window.TBtheme = localStorage.getItem("TBtheme") || "classic";

const BLOCK_THEMES = {
  classic: (i, o) => new THREE.Color(
    (Math.sin(0.3*(i+o))*55+200)/255,
    (Math.sin(0.3*(i+o)+2)*55+200)/255,
    (Math.sin(0.3*(i+o)+4)*55+200)/255),
  bigben:  i => new THREE.Color([0xd4b896,0xc4a870,0x8b7355,0xe8d5b7,0xb8904a,0xcaa060][i%6]),
  eiffel:  i => new THREE.Color([0x3a3a3a,0x4d4d4d,0x5c5c5c,0x2a2a2a,0x666666,0x444444][i%6]),
  pisa:    i => new THREE.Color([0xf4edd8,0xfff8ee,0xddd2b0,0xf0ead6,0xe8dfc0,0xfaf0da][i%6]),
  burj:    i => new THREE.Color([0x9bc4e2,0x7badd4,0xb8d8ea,0x6a9cbf,0xadd0e8,0x8bbddc][i%6]),
  empire:  i => new THREE.Color([0xaaaaaa,0x888888,0xcccccc,0x666666,0xbbbbbb,0x999999][i%6]),
};

// ─── Sound ───────────────────────────────────────────────────────────────
class SoundEngine {
  constructor() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.ctx = null; }
  }
  _play(freq, type, duration, gain = 0.25, t = 0) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.connect(g); g.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + t);
    g.gain.setValueAtTime(gain, this.ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + t + duration);
    osc.start(this.ctx.currentTime + t);
    osc.stop(this.ctx.currentTime + t + duration);
  }
  place()    { this._play(200,"square",0.08,0.18); this._play(320,"square",0.07,0.12,0.05); }
  perfect()  { [523,659,784,1047].forEach((f,i)=>this._play(f,"sine",0.18,0.28,i*0.07)); }
  combo(n)   { const b=350+n*60; this._play(b,"sine",0.13,0.3); this._play(b*1.5,"sine",0.13,0.25,0.09); }
  chop()     { this._play(130,"sawtooth",0.15,0.2); this._play(90,"sawtooth",0.12,0.15,0.06); }
  bump()     { this._play(180,"triangle",0.1,0.3); }
  gameOver() { [380,280,190,110].forEach((f,i)=>this._play(f,"sawtooth",0.22,0.28,i*0.13)); }
  milestone(){ [523,784,1047,1319].forEach((f,i)=>this._play(f,"sine",0.22,0.32,i*0.09)); }
  warning()  { this._play(440,"square",0.07,0.2); this._play(550,"square",0.07,0.2,0.1); }
}

// ─── Stage ───────────────────────────────────────────────────────────────
class Stage {
  constructor() {
    this.render = function() { this.renderer.render(this.scene, this.camera); };
    this.add    = function(e) { this.scene.add(e); };
    this.remove = function(e) { this.scene.remove(e); };

    this.container = document.getElementById("game");
    this.renderer  = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor("#D0CBC7", 1);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    let d = 20, aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, -100, 1000);
    this.camera.position.set(2, 2, 2);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 499, 0);
    this.scene.add(dirLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
    this._shaking = false;
  }
  setCamera(y, speed = 0.3) {
    TweenLite.to(this.camera.position, speed, { y: y + 4, ease: Power1.easeInOut });
    TweenLite.to(this.camera.lookAt,   speed, { y: y,     ease: Power1.easeInOut });
  }
  shake() {
    if (this._shaking) return;
    this._shaking = true;
    let n = 0; const ox = this.camera.position.x, oz = this.camera.position.z;
    const iv = setInterval(() => {
      this.camera.position.x = ox + (Math.random()-.5)*.7;
      this.camera.position.z = oz + (Math.random()-.5)*.7;
      if (++n > 14) { clearInterval(iv); this.camera.position.x = ox; this.camera.position.z = oz; this._shaking = false; }
    }, 35);
  }
  onResize() {
    const s = 30;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.left   = window.innerWidth  / -s;
    this.camera.right  = window.innerWidth  /  s;
    this.camera.top    = window.innerHeight /  s;
    this.camera.bottom = window.innerHeight / -s;
    this.camera.updateProjectionMatrix();
  }
}

// ─── Block ───────────────────────────────────────────────────────────────
class Block {
  constructor(block) {
    this.STATES = { ACTIVE:"active", STOPPED:"stopped", MISSED:"missed" };
    this.MOVE_AMOUNT = 12;
    this.dimension = { width:0, height:0, depth:0 };
    this.position  = { x:0, y:0, z:0 };
    this.targetBlock = block;
    this.index = (this.targetBlock ? this.targetBlock.index : 0) + 1;
    this.workingPlane     = this.index % 2 ? "x" : "z";
    this.workingDimension = this.index % 2 ? "width" : "depth";

    this.dimension.width  = this.targetBlock ? this.targetBlock.dimension.width  : 10;
    this.dimension.height = this.targetBlock ? this.targetBlock.dimension.height : 2;
    this.dimension.depth  = this.targetBlock ? this.targetBlock.dimension.depth  : 10;
    this.position.x = this.targetBlock ? this.targetBlock.position.x : 0;
    this.position.y = this.dimension.height * this.index;
    this.position.z = this.targetBlock ? this.targetBlock.position.z : 0;
    this.colorOffset = this.targetBlock ? this.targetBlock.colorOffset : Math.round(Math.random()*100);

    if (!this.targetBlock) {
      this.color = 0x333344;
    } else {
      const fn = BLOCK_THEMES[window.TBtheme] || BLOCK_THEMES.classic;
      this.color = fn(this.index, this.colorOffset);
    }

    this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;
    this.speed = -(0.04 + this.index * 0.002);
    if (this.speed < -0.5) this.speed = -0.5;
    this.direction = this.speed;

    let geo = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    geo.applyMatrix(new THREE.Matrix4().makeTranslation(
      this.dimension.width/2, this.dimension.height/2, this.dimension.depth/2));
    this.material = new THREE.MeshToonMaterial({ color: this.color, shading: THREE.FlatShading });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    if (this.state == this.STATES.ACTIVE)
      this.position[this.workingPlane] = Math.random() > 0.5 ? -this.MOVE_AMOUNT : this.MOVE_AMOUNT;
  }
  reverseDirection() {
    this.direction = this.direction > 0 ? this.speed : Math.abs(this.speed);
  }
  place() {
    this.state = this.STATES.STOPPED;
    let overlap = this.targetBlock.dimension[this.workingDimension] -
      Math.abs(this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane]);
    let result = { plane: this.workingPlane, direction: this.direction };

    if (this.dimension[this.workingDimension] - overlap < 0.3) {
      overlap = this.dimension[this.workingDimension];
      result.bonus = true;
      this.position.x = this.targetBlock.position.x;
      this.position.z = this.targetBlock.position.z;
      this.dimension.width = this.targetBlock.dimension.width;
      this.dimension.depth = this.targetBlock.dimension.depth;
    }
    if (overlap > 0) {
      let ch = { width:this.dimension.width, height:this.dimension.height, depth:this.dimension.depth };
      ch[this.workingDimension] -= overlap;
      this.dimension[this.workingDimension] = overlap;

      let pg = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
      pg.applyMatrix(new THREE.Matrix4().makeTranslation(this.dimension.width/2, this.dimension.height/2, this.dimension.depth/2));
      result.placed = new THREE.Mesh(pg, this.material);

      let cg = new THREE.BoxGeometry(ch.width, ch.height, ch.depth);
      cg.applyMatrix(new THREE.Matrix4().makeTranslation(ch.width/2, ch.height/2, ch.depth/2));
      result.chopped = new THREE.Mesh(cg, this.material);

      let cp = { x:this.position.x, y:this.position.y, z:this.position.z };
      if (this.position[this.workingPlane] < this.targetBlock.position[this.workingPlane])
        this.position[this.workingPlane] = this.targetBlock.position[this.workingPlane];
      else
        cp[this.workingPlane] += overlap;

      result.placed.position.set(this.position.x, this.position.y, this.position.z);
      result.chopped.position.set(cp.x, cp.y, cp.z);
      if (result.bonus) delete result.chopped;
    } else {
      this.state = this.STATES.MISSED;
    }
    this.dimension[this.workingDimension] = overlap;
    return result;
  }
  tick() {
    if (this.state == this.STATES.ACTIVE) {
      const v = this.position[this.workingPlane];
      if (v > this.MOVE_AMOUNT || v < -this.MOVE_AMOUNT) this.reverseDirection();
      this.position[this.workingPlane] += this.direction;
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
    }
  }
}

// ─── Airplane obstacles ───────────────────────────────────────────────────
class Obstacle {
  constructor(scene, score) {
    this.scene = scene;
    this.bumpCooldown = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.bobSpeed = 0.022 + Math.random() * 0.018;

    // Random orbit radius — close planes are faster + potentially collide
    this.radius   = 9 + Math.random() * 91;
    this.maxSpeed = 0.08 + this.radius * 0.0008 + score * 0.0005;
    this.jitter   = 0.004;
    this.vx = (Math.random()-.5) * 0.06;
    this.vz = (Math.random()-.5) * 0.06;

    // Scale: distant planes look smaller
    const sc = Math.max(0.3, 1 - (this.radius - 9) / 110);
    this.mesh = new THREE.Object3D();
    const startA = Math.random() * Math.PI * 2;
    this.mesh.position.set(Math.cos(startA)*this.radius, 0, Math.sin(startA)*this.radius);
    this.mesh.scale.set(sc, sc, sc);

    this.waypointTimer = 0; this.wpX = 0; this.wpZ = 0;
    this._pickWaypoint();

    const types = ['jet','fighter','prop','biplane'];
    this.planeType = types[Math.floor(Math.random() * types.length)];
    this['_build_' + this.planeType]();

    scene.add(this.mesh);
  }

  _b(w,h,d, x,y,z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); this.mesh.add(m); return m;
  }

  _build_jet() {
    const W = new THREE.MeshToonMaterial({color:0xf5f5f5});
    const S = new THREE.MeshToonMaterial({color:0xdddddd});
    const D = new THREE.MeshToonMaterial({color:0xaaaaaa});
    this._b(0.45,0.45,3.2,  0,   0,    0,   W); // fuselage
    this._b(0.28,0.28,0.6,  0,   0,    1.9, W); // nose
    this._b(4.0, 0.1, 0.9,  0,   0,    0.2, S); // wings
    this._b(0.38,0.32,1.0, -1.2,-0.22, 0.3, D); // engine L
    this._b(0.38,0.32,1.0,  1.2,-0.22, 0.3, D); // engine R
    this._b(0.1, 0.9, 0.55, 0,   0.42,-1.3, S); // v-tail
    this._b(1.6, 0.08,0.42, 0,   0,   -1.3, S); // h-tail
  }

  _build_fighter() {
    const G = new THREE.MeshToonMaterial({color:0x445533});
    const D = new THREE.MeshToonMaterial({color:0x222222});
    const C = new THREE.MeshToonMaterial({color:0x88aacc});
    const F = new THREE.MeshToonMaterial({color:0xff7700});
    this._b(0.32,0.32,4.0, 0,0,0,    G); // fuselage
    this._b(0.16,0.16,0.9, 0,0,2.4,  D); // nose
    // swept wings
    const wL = this._b(1.9,0.08,1.3, -1.1,0,-0.2, D); wL.rotation.y = -0.38;
    const wR = this._b(1.9,0.08,1.3,  1.1,0,-0.2, D); wR.rotation.y =  0.38;
    this._b(0.26,0.22,0.55,0,0.25,0.5, C); // canopy
    this._b(0.08,0.65,0.48,0,0.32,-1.7,D); // v-tail
    this._b(0.08,0.08,0.28,0,0,-2.2,   F); // afterburner
  }

  _build_prop() {
    const R  = new THREE.MeshToonMaterial({color:0xdd3333});
    const Y  = new THREE.MeshToonMaterial({color:0xffcc00});
    const WH = new THREE.MeshToonMaterial({color:0xffffff});
    const BK = new THREE.MeshToonMaterial({color:0x222222});
    this._b(0.55,0.5,2.2,  0,0, 0,   R);  // fuselage
    this._b(3.2, 0.1,0.65, 0,0.1,0.1,Y);  // wings
    this._b(0.08,0.6,0.4,  0,0.28,-0.9,R);// v-tail
    this._b(1.0, 0.08,0.35,0,0,-0.9,  R); // h-tail
    this._b(0.65,0.62,0.5, 0,0,1.35,  WH);// engine cowl
    // propeller group (spins)
    this.propGroup = new THREE.Object3D();
    this.propGroup.position.z = 1.75;
    const bl1 = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.07,0.1), BK);
    const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.1,1.5,0.07), BK);
    this.propGroup.add(bl1); this.propGroup.add(bl2);
    this.mesh.add(this.propGroup);
  }

  _build_biplane() {
    const R  = new THREE.MeshToonMaterial({color:0xcc2233});
    const CR = new THREE.MeshToonMaterial({color:0xf5e6c8});
    const BK = new THREE.MeshToonMaterial({color:0x333333});
    this._b(0.5, 0.5, 2.5,  0,0,   0,   CR); // fuselage
    this._b(3.5, 0.1, 0.7,  0,-0.28,0.2, R); // lower wing
    this._b(3.5, 0.1, 0.7,  0, 0.38,0.2, R); // upper wing
    this._b(0.08,0.65,0.1, -1.2,0.05,0.2,BK);// strut L
    this._b(0.08,0.65,0.1,  1.2,0.05,0.2,BK);// strut R
    this._b(0.08,0.6, 0.4,  0,0.28,-1.0, CR);// v-tail
    this._b(1.2, 0.08,0.38, 0,0,-1.0,    CR);// h-tail
    // propeller
    this.propGroup = new THREE.Object3D();
    this.propGroup.position.z = 1.4;
    const bl1 = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.06,0.08), BK);
    const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.08,1.3,0.06), BK);
    this.propGroup.add(bl1); this.propGroup.add(bl2);
    this.mesh.add(this.propGroup);
  }

  _pickWaypoint() {
    const a = Math.random() * Math.PI * 2;
    const r = this.radius * (0.75 + Math.random() * 0.5);
    this.wpX = Math.cos(a) * r;
    this.wpZ = Math.sin(a) * r;
    this.waypointTimer = 55 + Math.floor(Math.random() * 75);
  }

  tick(targetY) {
    if (--this.waypointTimer <= 0) this._pickWaypoint();

    const dx = this.wpX - this.mesh.position.x;
    const dz = this.wpZ - this.mesh.position.z;
    const len = Math.sqrt(dx*dx + dz*dz) || 1;
    this.vx += (dx/len) * 0.022; this.vz += (dz/len) * 0.022;
    this.vx += (Math.random()-.5)*this.jitter; this.vz += (Math.random()-.5)*this.jitter;
    this.vx *= 0.94; this.vz *= 0.94;
    const spd = Math.sqrt(this.vx*this.vx + this.vz*this.vz);
    if (spd > this.maxSpeed) { this.vx *= this.maxSpeed/spd; this.vz *= this.maxSpeed/spd; }

    this.mesh.position.x += this.vx;
    this.mesh.position.z += this.vz;
    this.bobPhase += this.bobSpeed;
    this.mesh.position.y = targetY + Math.sin(this.bobPhase) * 1.5 + 2.5;

    if (spd > 0.004) this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
    this.mesh.rotation.z = -this.vx * 2.5;
    this.mesh.rotation.x =  this.vz * 1.5;

    if (this.propGroup) this.propGroup.rotation.z += 0.3;
    if (this.bumpCooldown > 0) this.bumpCooldown--;
  }

  remove() { this.scene.remove(this.mesh); }
}

// ─── Game ─────────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.STATES = { LOADING:"loading", PLAYING:"playing", READY:"ready", ENDED:"ended", RESETTING:"resetting" };
    this.blocks = []; this.state = this.STATES.LOADING;
    this.stage  = new Stage();
    this.sound  = new SoundEngine();

    this.mainContainer  = document.getElementById("container");
    this.scoreContainer = document.getElementById("score");
    this.startButton    = document.getElementById("start-button");
    this.instructions   = document.getElementById("instructions");
    this.comboDisplay   = document.getElementById("combo-display");
    this.highScoreEl    = document.getElementById("high-score");
    this.finalScoreEl   = document.getElementById("final-score");
    this.bestScoreEl    = document.getElementById("best-score");

    this.score = 0; this.combo = 0;
    this.highScore = parseInt(localStorage.getItem("towerBloxxHigh") || "0");
    this.obstacles = []; this.bumpCooldown = 0;
    this.scoreContainer.innerHTML = "0";
    this._refreshHigh();

    this.newBlocks     = new THREE.Group();
    this.placedBlocks  = new THREE.Group();
    this.choppedBlocks = new THREE.Group();
    this.stage.add(this.newBlocks);
    this.stage.add(this.placedBlocks);
    this.stage.add(this.choppedBlocks);

    this.addBlock(); this.tick(); this.updateState(this.STATES.READY);

    document.addEventListener("keydown", e => { if (e.keyCode==32) this.onAction(); });
    document.addEventListener("click",   ()  => this.onAction());
    document.addEventListener("touchstart", e => { e.preventDefault(); this.onAction(); });

    // Theme picker
    document.querySelectorAll(".theme-btn").forEach(btn => {
      if (btn.dataset.theme === window.TBtheme) btn.classList.add("active");
      btn.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        window.TBtheme = btn.dataset.theme;
        localStorage.setItem("TBtheme", window.TBtheme);
      });
    });
  }

  _refreshHigh() {
    if (this.highScoreEl) this.highScoreEl.textContent = this.highScore > 0 ? `Best: ${this.highScore}` : "";
  }
  showFloat(text, cls) {
    const el = document.createElement("div");
    el.className = "floating-text " + cls;
    el.textContent = text;
    this.mainContainer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  updateState(s) {
    for (let k in this.STATES) this.mainContainer.classList.remove(this.STATES[k]);
    this.mainContainer.classList.add(s); this.state = s;
  }
  onAction() {
    switch (this.state) {
      case this.STATES.READY:   this.startGame();   break;
      case this.STATES.PLAYING: this.placeBlock();  break;
      case this.STATES.ENDED:   this.restartGame(); break;
    }
  }
  _clearObstacles() {
    this.obstacles.forEach(o => o.remove()); this.obstacles = []; this.bumpCooldown = 0;
  }
  startGame() {
    if (this.state != this.STATES.PLAYING) {
      this.score = 0; this.combo = 0;
      this.scoreContainer.innerHTML = "0";
      this._clearObstacles(); this._setComboDisplay();
      this.updateState(this.STATES.PLAYING);
      this.addBlock();
    }
  }
  restartGame() {
    this.updateState(this.STATES.RESETTING);
    this._clearObstacles();
    let old = this.placedBlocks.children;
    const rs = 0.2, dl = 0.02;
    for (let i = 0; i < old.length; i++) {
      TweenLite.to(old[i].scale, rs, { x:0,y:0,z:0, delay:(old.length-i)*dl, ease:Power1.easeIn, onComplete:()=>this.placedBlocks.remove(old[i]) });
      TweenLite.to(old[i].rotation, rs, { y:0.5, delay:(old.length-i)*dl, ease:Power1.easeIn });
    }
    const cs = rs*2 + old.length*dl;
    this.stage.setCamera(2, cs);
    const cd = { value: this.blocks.length-1 };
    TweenLite.to(cd, cs, { value:0, onUpdate:()=>{ this.scoreContainer.innerHTML = String(Math.round(cd.value)); } });
    this.blocks = this.blocks.slice(0,1);
    setTimeout(() => this.startGame(), cs*1000);
  }
  _setComboDisplay() {
    if (!this.comboDisplay) return;
    if (this.combo >= 2) {
      this.comboDisplay.textContent = `${this.combo}x COMBO`;
      this.comboDisplay.className = "combo-active";
    } else {
      this.comboDisplay.textContent = ""; this.comboDisplay.className = "";
    }
  }
  placeBlock() {
    const cur = this.blocks[this.blocks.length-1];
    const res = cur.place();
    this.newBlocks.remove(cur.mesh);
    if (res.placed) this.placedBlocks.add(res.placed);

    if (res.bonus) {
      this.combo++;
      this.sound.perfect();
      this.showFloat("PERFECT!", "ft-perfect");
      if (this.combo >= 3) { setTimeout(()=>this.showFloat(`${this.combo}x COMBO!`,"ft-combo"),180); this.sound.combo(this.combo); }
      this.mainContainer.classList.add("flash-perfect");
      setTimeout(()=>this.mainContainer.classList.remove("flash-perfect"), 280);
    } else if (res.chopped) {
      if (this.combo > 0) { this.combo = 0; this._setComboDisplay(); }
      this.sound.chop();
      this.choppedBlocks.add(res.chopped);
      const pp = { y:"-=30", ease:Power1.easeIn, onComplete:()=>this.choppedBlocks.remove(res.chopped) };
      const rr = 10;
      const rp = { delay:0.05, x:res.plane=="z"?Math.random()*rr-rr/2:0.1, z:res.plane=="x"?Math.random()*rr-rr/2:0.1, y:Math.random()*0.1 };
      pp[res.plane] = (res.chopped.position[res.plane] > res.placed.position[res.plane] ? "+=" : "-=") + 40*Math.abs(res.direction);
      TweenLite.to(res.chopped.position, 1, pp);
      TweenLite.to(res.chopped.rotation, 1, rp);
    }
    this._setComboDisplay();
    this.addBlock();
  }
  addBlock() {
    const last = this.blocks[this.blocks.length-1];
    if (last && last.state == last.STATES.MISSED) return this.endGame();

    this.score = this.blocks.length - 1;
    this.scoreContainer.innerHTML = String(this.score);

    const milestones = { 10:"Nice!", 20:"Great!", 30:"Awesome!", 50:"Incredible!", 75:"Legendary!", 100:"GODLIKE!" };
    if (milestones[this.score]) { this.showFloat(milestones[this.score],"ft-milestone"); this.sound.milestone(); }

    // Spawn airplane obstacles (all types)
    const obsThresholds = [15, 25, 40, 60, 85];
    if (obsThresholds.includes(this.score)) {
      const obs = new Obstacle(this.stage.scene, this.score);
      this.obstacles.push(obs);
      if (obs.radius < 30) { this.showFloat("PLANE!", "ft-warning"); this.sound.warning(); }
    }

    const nb = new Block(last);
    this.newBlocks.add(nb.mesh);
    this.blocks.push(nb);
    this.stage.setCamera(this.blocks.length * 2);
    if (this.blocks.length >= 5) this.instructions.classList.add("hide");
  }
  endGame() {
    this.sound.gameOver(); this.stage.shake();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("towerBloxxHigh", this.highScore);
      this._refreshHigh();
      setTimeout(()=>this.showFloat("NEW BEST!","ft-milestone"), 500);
    }
    if (this.finalScoreEl) this.finalScoreEl.textContent = this.score;
    if (this.bestScoreEl)  this.bestScoreEl.textContent  = `Best: ${this.highScore}`;
    this.updateState(this.STATES.ENDED);
  }
  tick() {
    const cur = this.blocks[this.blocks.length-1];
    cur.tick();

    if (this.state === this.STATES.PLAYING && cur.state === cur.STATES.ACTIVE) {
      if (this.bumpCooldown > 0) this.bumpCooldown--;
      for (const obs of this.obstacles) {
        obs.tick(cur.position.y);
        // Only close planes (radius < 22) can bump
        if (obs.radius >= 22 || obs.bumpCooldown > 0 || this.bumpCooldown > 0) continue;
        const bx = cur.mesh.position.x + cur.dimension.width  / 2;
        const bz = cur.mesh.position.z + cur.dimension.depth   / 2;
        const dx = obs.mesh.position.x - bx, dz = obs.mesh.position.z - bz;
        if (dx*dx + dz*dz < 7) {
          cur.reverseDirection();
          obs.bumpCooldown = 55; this.bumpCooldown = 15;
          this.sound.bump();
          this.showFloat("BUMPED!", "ft-warning");
        }
      }
    } else {
      for (const obs of this.obstacles) obs.tick(cur.position.y);
    }

    this.stage.render();
    requestAnimationFrame(() => this.tick());
  }
}

let game = new Game();
