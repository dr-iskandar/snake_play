const GAME_W = 450;
const GAME_H = 800;
const TILE = 64;
const COLS = 60;
const ROWS = 50;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;
const SESSION_MS = 120000;
const PLAYER_STEP_MS = 180;
const BOT_STEP_MS = 195;
const COMBO_WINDOW_MS = 10000; // prototype tuning; GDD only states "nearby time"
const STAR_SPAWN_MODE = 'viewport'; // easy to switch to 'world' later

const FRAME = {
  beige: { body: 0, head: 1, tail: 2 },
  green: { body: 3, head: 4, tail: 5 },
  red: { body: 6, head: 7, tail: 8 },
  tongue: 9,
  white: { body: 10, head: 11, tail: 12 }
};
const SKINS = ['beige', 'white', 'green', 'red'];
const DIRS = [
  { x: 0, y: -1, name: 'up' },
  { x: 1, y: 0, name: 'right' },
  { x: 0, y: 1, name: 'down' },
  { x: -1, y: 0, name: 'left' }
];
const QUIZ_BANK = [
  { q: 'What is the snake’s main food?', options: ['Apple', 'Clock', 'Diamond'], answer: 0 },
  { q: 'How many apples trigger a combo?', options: ['3', '5', '10'], answer: 1 },
  { q: 'Which combo item adds +2 length?', options: ['Star', 'Apple', 'Wall'], answer: 0 }
];
const SKILLS = ['Slow', 'Fire', 'Grapple Tongue', 'Venom Trail', 'Spike Skin'];

const tileKey = (x, y) => `${x},${y}`;
const sameTile = (a, b) => a.x === b.x && a.y === b.y;
const centerOf = (p) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });
const opposite = (a, b) => a.x === -b.x && a.y === -b.y;
const headRotation = (d) => Math.atan2(d.y, d.x) + Math.PI / 2;
const tailRotation = (d) => Math.atan2(d.y, d.x) - Math.PI / 2;

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  preload() {
    this.load.spritesheet('snakeParts', './assets/snake-sprites.webp', {
      frameWidth: 96,
      frameHeight: 96,
      endFrame: 15
    });

    // Reference-style assets: low-poly rocks, wooden fences, glossy rewards.
    this.load.svg('obstacleRock', './assets/obstacle-rock.svg');
    this.load.svg('obstacleFence', './assets/obstacle-fence.svg');
    this.load.svg('apple', './assets/item-apple.svg');
    this.load.svg('star', './assets/item-star.svg');
    this.load.svg('blackbox', './assets/item-mystery.svg');
  }

  create() {
    this.gameStartedAt = this.time.now;
    this.gameEndsAt = this.gameStartedAt + SESSION_MS;
    this.gameOver = false;
    this.comboCount = 0;
    this.highestCombo = 0;
    this.comboDeadline = 0;
    this.starRushUntil = 0;
    this.quiz = null;
    this.activeSkillLabel = '';
    this.pendingSkill = null;
    this.pendingSkillExpiresAt = 0;
    this.pendingSkillOrigin = null;
    this.lastBlackBoxSpawn = this.time.now;
    this.blackBox = null;
    this.apple = null;
    this.stars = [];
    this.poisonTiles = [];
    this.swipeStart = null;

    this.makeItemTextures();
    this.buildWorld();
    this.buildSnakes();
    this.buildEffects();
    this.buildUI();
    this.bindInput();
    this.configureCamera();

    this.spawnApple();
    this.time.delayedCall(3000, () => this.spawnBlackBox());
  }

  makeItemTextures() {
    const make = (key, draw, w = 64, h = 64) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    make('apple', (g) => {
      g.fillStyle(0x000000, 0.13).fillCircle(34, 38, 18);
      g.fillStyle(0xe53935, 1).fillCircle(30, 32, 17);
      g.fillStyle(0xbe2727, 1).fillCircle(38, 34, 13);
      g.fillStyle(0x6d4024, 1).fillRect(30, 8, 4, 11);
      g.fillStyle(0x53a653, 1).fillEllipse(40, 14, 15, 7);
      g.fillStyle(0xffffff, 0.55).fillCircle(25, 26, 4);
    });

    make('star', (g) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 25 : 11;
        pts.push(new Phaser.Math.Vector2(32 + Math.cos(a) * r, 32 + Math.sin(a) * r));
      }
      g.fillStyle(0xffd84d, 1).fillPoints(pts, true);
      g.lineStyle(4, 0xe49d17, 1).strokePoints(pts, true);
      g.fillStyle(0xffffff, 0.5).fillCircle(26, 23, 4);
    });

    make('blackbox', (g) => {
      g.fillStyle(0x000000, 0.18).fillRoundedRect(8, 10, 50, 50, 10);
      g.fillStyle(0x151823, 1).fillRoundedRect(5, 5, 50, 50, 10);
      g.lineStyle(4, 0x6f5be8, 1).strokeRoundedRect(5, 5, 50, 50, 10);
    });

    make('poison', (g) => {
      g.fillStyle(0x7346a8, 0.34).fillCircle(32, 32, 24);
      g.lineStyle(3, 0x9d6ed2, 0.72).strokeCircle(32, 32, 21);
    });
  }

  buildWorld() {
    this.walls = new Set();
    this.wallSegments = [];

    const addSegment = (x, y, length, axis = 'h', kind = 'rock') => {
      this.wallSegments.push({ x, y, length, axis, kind });
      for (let i = 0; i < length; i++) {
        const tx = axis === 'h' ? x + i : x;
        const ty = axis === 'v' ? y + i : y;
        this.walls.add(tileKey(tx, ty));
      }
    };

    // Sparse obstacle course inspired by the provided floor-plan reference.
    addSegment(5, 6, 5, 'h', 'rock');
    addSegment(13, 7, 3, 'h', 'fence');
    addSegment(19, 5, 4, 'v', 'rock');
    addSegment(25, 10, 6, 'h', 'rock');
    addSegment(34, 7, 3, 'v', 'fence');
    addSegment(43, 6, 4, 'v', 'rock');
    addSegment(49, 12, 5, 'h', 'rock');
    addSegment(8, 18, 3, 'h', 'fence');
    addSegment(15, 20, 4, 'v', 'rock');
    addSegment(22, 24, 5, 'h', 'rock');
    addSegment(31, 23, 3, 'h', 'fence');
    addSegment(38, 20, 4, 'v', 'rock');
    addSegment(45, 28, 6, 'h', 'rock');
    addSegment(20, 35, 5, 'h', 'rock');
    addSegment(26, 33, 2, 'h', 'fence');
    addSegment(35, 34, 4, 'v', 'rock');
    addSegment(33, 42, 3, 'h', 'fence');
    addSegment(23, 45, 5, 'h', 'rock');
    addSegment(18, 38, 3, 'v', 'rock');
    addSegment(48, 41, 4, 'h', 'fence');

    this.bg = this.add.graphics().setDepth(-30);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        this.bg.fillStyle((x + y) % 2 ? 0xc4dbb5 : 0xe3d8b7, 1);
        this.bg.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    this.bg.lineStyle(2, 0x8ead66, 0.6);
    for (let x = 0; x <= COLS; x++) this.bg.lineBetween(x * TILE, 0, x * TILE, WORLD_H);
    for (let y = 0; y <= ROWS; y++) this.bg.lineBetween(0, y * TILE, WORLD_W, y * TILE);

    this.obstacleSprites = [];
    this.wallSegments.forEach(seg => {
      const cx = (seg.x + (seg.axis === 'h' ? seg.length / 2 : 0.5)) * TILE;
      const cy = (seg.y + (seg.axis === 'v' ? seg.length / 2 : 0.5)) * TILE;
      const key = seg.kind === 'fence' ? 'obstacleFence' : 'obstacleRock';
      const sprite = this.add.image(cx, cy, key).setDepth(-8);
      const thickness = seg.kind === 'fence' ? TILE * 0.78 : TILE * 0.92;
      sprite.setDisplaySize(seg.length * TILE, thickness);
      if (seg.axis === 'v') sprite.setRotation(Math.PI / 2);
      this.obstacleSprites.push(sprite);
    });
  }

  buildSnakes() {
    this.snakes = [];
    this.player = this.createSnake('You', 'beige', [{ x: 29, y: 39 }, { x: 29, y: 40 }], { x: 0, y: -1 }, true);
    this.snakes.push(this.player);
    this.snakes.push(this.createSnake('Bot Red', 'red', [{ x: 10, y: 11 }, { x: 9, y: 11 }], { x: 1, y: 0 }, false));
    this.snakes.push(this.createSnake('Bot Green', 'green', [{ x: 48, y: 30 }, { x: 48, y: 31 }], { x: 0, y: -1 }, false));
  }

  createSnake(name, skin, positions, dir, player) {
    const snake = {
      name, skin, positions: positions.map(p => ({ ...p })), prevPositions: positions.map(p => ({ ...p })),
      dir: { ...dir }, queuedDir: { ...dir }, isPlayer: player, score: 0, elapsed: 0,
      stepMs: player ? PLAYER_STEP_MS : BOT_STEP_MS, sprites: [], stunnedUntil: 0,
      slowedUntil: 0, invisibleUntil: 0, spikeUntil: 0, venomUntil: 0,
      collisionCooldownUntil: 0, ghostUntil: 0
    };
    this.syncSnakeSprites(snake);
    return snake;
  }

  syncSnakeSprites(snake) {
    while (snake.sprites.length < snake.positions.length) {
      const sprite = this.add.sprite(0, 0, 'snakeParts', FRAME[snake.skin].body).setDepth(snake.isPlayer ? 25 : 18);
      sprite.setDisplaySize(84, 84);
      snake.sprites.push(sprite);
    }
    while (snake.sprites.length > snake.positions.length) snake.sprites.pop().destroy();

    snake.sprites.forEach((s, i) => {
      if (i === 0) s.setFrame(FRAME[snake.skin].head);
      else if (i === snake.sprites.length - 1) s.setFrame(FRAME[snake.skin].tail);
      else s.setFrame(FRAME[snake.skin].body);
    });
    this.renderSnake(snake, 1);
  }

  buildEffects() {
    this.effectGfx = this.add.graphics().setDepth(40);
    this.quizOrb = this.add.circle(0, 0, 48, 0x17151f, 0.96).setStrokeStyle(5, 0x7864ff, 0.9).setDepth(45).setVisible(false);
    this.poisonSprites = [];
  }

  buildUI() {
    const hud = this.add.rectangle(GAME_W / 2, 48, GAME_W - 24, 72, 0x16341e, 0.88)
      .setStrokeStyle(2, 0xffffff, 0.12).setScrollFactor(0).setDepth(200);
    this.scoreText = this.add.text(26, 26, '🍎 0', { fontFamily: 'system-ui', fontSize: '22px', fontStyle: '800', color: '#fff' })
      .setScrollFactor(0).setDepth(201);
    this.timerText = this.add.text(GAME_W / 2, 26, '2:00', { fontFamily: 'system-ui', fontSize: '22px', fontStyle: '900', color: '#fff' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);
    this.rankText = this.add.text(GAME_W - 26, 28, '#1', { fontFamily: 'system-ui', fontSize: '18px', fontStyle: '900', color: '#fff' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(201);

    this.comboText = this.add.text(26, 58, 'COMBO 0/5', { fontFamily: 'system-ui', fontSize: '11px', fontStyle: '800', color: '#d9f99d' })
      .setScrollFactor(0).setDepth(201);
    this.skillText = this.add.text(GAME_W - 26, 58, '', { fontFamily: 'system-ui', fontSize: '11px', fontStyle: '800', color: '#ffd166' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(201);

    this.skinButton = this.add.text(GAME_W - 18, 102, 'BEIGE', {
      fontFamily: 'system-ui', fontSize: '11px', fontStyle: '900', color: '#1b2430',
      backgroundColor: '#f2eadc', padding: { x: 12, y: 8 }
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    this.skinButton.on('pointerdown', () => this.cycleSkin());

    this.skillButton = this.add.text(GAME_W - 18, GAME_H - 80, 'USE SKILL', {
      fontFamily: 'system-ui', fontSize: '13px', fontStyle: '900', color: '#111827',
      backgroundColor: '#ffd166', padding: { x: 16, y: 11 }
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(210).setInteractive({ useHandCursor: true }).setVisible(false);
    this.skillButton.on('pointerdown', () => {
      if (this.pendingSkill && !this.quiz && !this.gameOver) this.usePendingSkill();
    });

    this.toast = this.add.text(GAME_W / 2, 132, 'Swipe to turn', {
      fontFamily: 'system-ui', fontSize: '13px', color: '#fff', backgroundColor: '#111827cc', padding: { x: 13, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(205);
    this.time.delayedCall(2600, () => this.toast?.setVisible(false));

    this.buildQuizUI();
    this.buildGameOverUI();
  }

  buildQuizUI() {
    this.quizUI = [];
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x090b12, 0.68).setScrollFactor(0).setDepth(500).setVisible(false);
    const card = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W - 44, 420, 0x1b2030, 0.98).setStrokeStyle(2, 0x7c6cff, 0.85).setScrollFactor(0).setDepth(501).setVisible(false);
    this.quizTitle = this.add.text(GAME_W / 2, 226, 'BLACK BOX QUIZ', { fontFamily: 'system-ui', fontSize: '18px', fontStyle: '900', color: '#c5baff' }).setOrigin(0.5).setScrollFactor(0).setDepth(502).setVisible(false);
    this.quizTimer = this.add.text(GAME_W / 2, 260, '15', { fontFamily: 'system-ui', fontSize: '32px', fontStyle: '900', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(502).setVisible(false);
    this.quizQuestion = this.add.text(GAME_W / 2, 322, '', { fontFamily: 'system-ui', fontSize: '19px', fontStyle: '700', color: '#fff', align: 'center', wordWrap: { width: GAME_W - 90 } }).setOrigin(0.5).setScrollFactor(0).setDepth(502).setVisible(false);
    this.quizOptions = [];
    for (let i = 0; i < 3; i++) {
      const t = this.add.text(GAME_W / 2, 405 + i * 66, '', {
        fontFamily: 'system-ui', fontSize: '16px', fontStyle: '800', color: '#111827', backgroundColor: '#f4f0ff',
        padding: { x: 18, y: 13 }, align: 'center', fixedWidth: GAME_W - 92
      }).setOrigin(0.5).setScrollFactor(0).setDepth(503).setVisible(false).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.answerQuiz(i));
      this.quizOptions.push(t);
    }
    this.quizUI = [dim, card, this.quizTitle, this.quizTimer, this.quizQuestion, ...this.quizOptions];
  }

  buildGameOverUI() {
    this.overUI = [];
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x061007, 0.76).setScrollFactor(0).setDepth(700).setVisible(false);
    const card = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W - 54, 330, 0x17341e, 0.98).setStrokeStyle(2, 0xffffff, 0.15).setScrollFactor(0).setDepth(701).setVisible(false);
    this.overTitle = this.add.text(GAME_W / 2, 300, 'TIME!', { fontFamily: 'system-ui', fontSize: '34px', fontStyle: '900', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(702).setVisible(false);
    this.overScore = this.add.text(GAME_W / 2, 370, '', { fontFamily: 'system-ui', fontSize: '20px', fontStyle: '800', color: '#d9f99d', align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(702).setVisible(false);
    const btn = this.add.text(GAME_W / 2, 505, 'BACK TO HOME', { fontFamily: 'system-ui', fontSize: '15px', fontStyle: '900', color: '#17341e', backgroundColor: '#d9f99d', padding: { x: 22, y: 13 } }).setOrigin(0.5).setScrollFactor(0).setDepth(703).setVisible(false).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.scene.restart());
    this.overUI = [dim, card, this.overTitle, this.overScore, btn];
  }

  bindInput() {
    this.keys = this.input.keyboard.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' });
    this.input.on('pointerdown', p => {
      if (this.gameOver || this.quiz) return;
      if (this.skinButton.getBounds().contains(p.x, p.y)) return;
      if (this.skillButton?.visible && this.skillButton.getBounds().contains(p.x, p.y)) return;
      this.swipeStart = { x: p.x, y: p.y };
    });
    this.input.on('pointermove', p => {
      if (!p.isDown || !this.swipeStart || this.quiz || this.gameOver) return;
      const dx = p.x - this.swipeStart.x, dy = p.y - this.swipeStart.y;
      if (Math.hypot(dx, dy) < 12) return;
      this.queueSwipe(dx, dy);
      this.swipeStart = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', p => {
      if (this.swipeStart && !this.quiz && !this.gameOver) {
        const dx = p.x - this.swipeStart.x, dy = p.y - this.swipeStart.y;
        if (Math.hypot(dx, dy) >= 10) this.queueSwipe(dx, dy);
      }
      this.swipeStart = null;
    });
  }

  queueSwipe(dx, dy) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS[1] : DIRS[3]) : (dy > 0 ? DIRS[2] : DIRS[0]);
    this.queueDirection(this.player, dir);
  }

  queueDirection(snake, dir) {
    if (opposite(dir, snake.dir)) return;
    const changed = dir.x !== snake.queuedDir.x || dir.y !== snake.queuedDir.y;
    snake.queuedDir = { x: dir.x, y: dir.y };

    // Keep the slower overall pace, but make a requested turn happen quickly.
    if (changed && snake.isPlayer) snake.elapsed = Math.max(snake.elapsed, snake.stepMs * 0.80);
  }

  configureCamera() {
    this.cameraFocus = this.add.zone(centerOf(this.player.positions[0]).x, centerOf(this.player.positions[0]).y, 2, 2);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.cameraFocus, true, 0.12, 0.12).setZoom(1.02);
  }

  update(time, delta) {
    if (this.gameOver) return;
    if (time >= this.gameEndsAt) { this.finishGame(); return; }

    this.readKeyboard();
    this.updateQuiz(time);
    this.updatePendingSkill(time);
    this.updateSpawns(time);
    this.updatePoison(time);

    for (const snake of this.snakes) {
      if (snake.isPlayer && this.quiz) continue;
      if (time < snake.stunnedUntil) continue;
      snake.elapsed += delta;
      const interval = snake.stepMs * (time < snake.slowedUntil ? 1.7 : 1);
      if (snake.elapsed >= interval) {
        snake.elapsed -= interval;
        if (!snake.isPlayer) this.chooseBotDirection(snake);
        this.stepSnake(snake, time);
      }
      const t = Phaser.Math.Clamp(snake.elapsed / interval, 0, 1);
      this.renderSnake(snake, t, time);
    }

    this.updateCamera(time);
    this.updateHUD(time);
  }

  readKeyboard() {
    if (this.quiz) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.w)) this.queueDirection(this.player, DIRS[0]);
    if (Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.d)) this.queueDirection(this.player, DIRS[1]);
    if (Phaser.Input.Keyboard.JustDown(this.keys.down) || Phaser.Input.Keyboard.JustDown(this.keys.s)) this.queueDirection(this.player, DIRS[2]);
    if (Phaser.Input.Keyboard.JustDown(this.keys.left) || Phaser.Input.Keyboard.JustDown(this.keys.a)) this.queueDirection(this.player, DIRS[3]);
  }

  stepSnake(snake, time) {
    snake.dir = { ...snake.queuedDir };
    const head = snake.positions[0];
    const rawNext = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };
    const next = {
      x: (rawNext.x + COLS) % COLS,
      y: (rawNext.y + ROWS) % ROWS
    };
    const wrapped = rawNext.x !== next.x || rawNext.y !== next.y;

    const hitObstacle = this.walls.has(tileKey(next.x, next.y));
    const hitSelf = snake.positions.slice(1, -1).some(p => sameTile(p, next));
    const hitOther = time >= snake.ghostUntil
      ? this.snakes.find(s => s !== snake && s.positions.some(p => sameTile(p, next)))
      : null;

    if (hitObstacle || hitSelf || hitOther) {
      const hitSpike = !!(hitOther && time < hitOther.spikeUntil);
      if (hitSpike) {
        this.damageSnake(snake, 1, true);
        snake.stunnedUntil = Math.max(snake.stunnedUntil, time + 3000);
      }
      this.handleCollision(snake, time, hitOther, hitObstacle || hitSelf, hitSpike);
      return;
    }

    const old = snake.positions.map(p => ({ ...p }));
    snake.prevPositions = old;
    snake.positions.unshift(next);
    snake.positions.pop();

    // Avoid tweening across the full 60-tile map when wrapping to the opposite edge.
    if (wrapped) snake.prevPositions[0] = { ...next };

    if (snake.isPlayer && time < snake.venomUntil) this.addPoison(old[old.length - 1], time);
    if (!snake.isPlayer && this.isPoison(next)) {
      this.damageSnake(snake, 1, false);
      snake.stunnedUntil = time + 3000;
    }

    this.collectAt(snake, next, old, time);
    this.syncSnakeSprites(snake);
  }

  handleCollision(snake, time, hitOther = null, hitSolid = false, alreadyDamaged = false) {
    // One collision = at most one tail loss. A short ghost/grace window lets a trapped snake escape,
    // instead of both snakes repeatedly shrinking while heads are boxed in.
    if (!alreadyDamaged && time >= snake.collisionCooldownUntil) {
      this.damageSnake(snake, 1, false);
      snake.collisionCooldownUntil = time + 850;
    }

    const options = DIRS.filter(d => !opposite(d, snake.dir) && this.isSafeNext(snake, d, true));
    if (options.length) {
      const chosen = Phaser.Utils.Array.GetRandom(options);
      snake.queuedDir = { ...chosen };
      snake.dir = { ...chosen };
    }

    if (hitOther || !options.length) snake.ghostUntil = Math.max(snake.ghostUntil, time + 750);
    snake.stunnedUntil = Math.max(snake.stunnedUntil, time + (hitSolid ? 120 : 80));

    if (snake.isPlayer) {
      this.cameras.main.shake(90, 0.006);
      this.flash(hitOther ? 'BUMP! -1 tail · escape grace' : 'Obstacle! -1 tail');
    }
  }

  damageSnake(snake, count, bounce) {
    let removed = 0;
    while (count-- > 0 && snake.positions.length > 2) {
      snake.positions.pop();
      snake.prevPositions.pop();
      removed++;
    }
    if (removed) snake.score = Math.max(0, snake.score - removed * 10);
    this.syncSnakeSprites(snake);
    if (bounce) snake.stunnedUntil = this.time.now + 700;
  }

  isSafeNext(snake, dir, avoidOtherSnakes = false) {
    const h = snake.positions[0];
    const raw = { x: h.x + dir.x, y: h.y + dir.y };
    const n = { x: (raw.x + COLS) % COLS, y: (raw.y + ROWS) % ROWS };

    if (this.walls.has(tileKey(n.x, n.y))) return false;
    if (snake.positions.slice(1, -1).some(p => sameTile(p, n))) return false;
    if (avoidOtherSnakes && this.snakes.some(s => s !== snake && s.positions.some(p => sameTile(p, n)))) return false;
    return true;
  }

  chooseBotDirection(snake) {
    const targetItem = this.closestCollectible(snake.positions[0]);
    const candidates = DIRS.filter(d => !opposite(d, snake.dir) && this.isSafeNext(snake, d));
    if (!candidates.length) return;
    if (!targetItem || Math.random() < 0.16) {
      snake.queuedDir = { ...Phaser.Utils.Array.GetRandom(candidates) };
      return;
    }
    candidates.sort((a, b) => {
      const h = snake.positions[0];
      const da = Math.abs(h.x + a.x - targetItem.tile.x) + Math.abs(h.y + a.y - targetItem.tile.y);
      const db = Math.abs(h.x + b.x - targetItem.tile.x) + Math.abs(h.y + b.y - targetItem.tile.y);
      return da - db;
    });
    snake.queuedDir = { ...candidates[0] };
  }

  closestCollectible(tile) {
    const items = [];
    if (this.apple) items.push(this.apple);
    if (this.blackBox) items.push(this.blackBox);
    items.push(...this.stars);
    if (!items.length) return null;
    return items.reduce((best, item) => {
      const d = Math.abs(tile.x - item.tile.x) + Math.abs(tile.y - item.tile.y);
      return !best || d < best.d ? { ...item, d } : best;
    }, null);
  }

  renderSnake(snake, t, time = this.time.now) {
    const visibleAlpha = time < snake.invisibleUntil ? 0.36 : 1;
    const ease = Phaser.Math.Easing.Sine.InOut(Phaser.Math.Clamp(t, 0, 1));

    snake.sprites.forEach((sprite, i) => {
      const from = snake.prevPositions[Math.min(i, snake.prevPositions.length - 1)] || snake.positions[i];
      const to = snake.positions[i] || from;
      const a = centerOf(from), b = centerOf(to);
      const wrappedX = Math.abs(a.x - b.x) > WORLD_W / 2;
      const wrappedY = Math.abs(a.y - b.y) > WORLD_H / 2;
      sprite.setPosition(
        wrappedX ? b.x : Phaser.Math.Linear(a.x, b.x, ease),
        wrappedY ? b.y : Phaser.Math.Linear(a.y, b.y, ease)
      );
      sprite.setAlpha(this.quiz && snake.isPlayer ? 0 : visibleAlpha);
    });

    // Calculate rotation from the actually rendered chain, not from the next logical tick.
    // This removes the "late tail" / snapping feeling when turning several times quickly.
    snake.sprites.forEach((sprite, i) => {
      let targetRotation = sprite.rotation;
      if (i === 0) {
        targetRotation = headRotation(snake.dir);
      } else if (i === snake.sprites.length - 1) {
        const prev = snake.sprites[Math.max(0, i - 1)];
        targetRotation = tailRotation({ x: sprite.x - prev.x, y: sprite.y - prev.y });
      } else {
        const prev = snake.sprites[i - 1], next = snake.sprites[i + 1];
        targetRotation = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
      }

      if (!sprite.getData('rotationReady')) {
        sprite.setRotation(targetRotation);
        sprite.setData('rotationReady', true);
      } else {
        sprite.setRotation(Phaser.Math.Angle.RotateTo(sprite.rotation, targetRotation, 0.20));
      }

      if (i === 0 && time < snake.spikeUntil) sprite.setTint(0xffef7a);
      else sprite.clearTint();
    });
  }

  collectAt(snake, tile, oldPositions, time) {
    if (this.apple && sameTile(this.apple.tile, tile)) {
      this.destroyItem(this.apple); this.apple = null;
      this.growSnake(snake, 1, oldPositions);
      snake.score += 10;
      if (snake.isPlayer) this.appleCombo(time);
      this.time.delayedCall(2000, () => { if (!this.gameOver && !this.apple) this.spawnApple(); });
    }

    const star = this.stars.find(s => sameTile(s.tile, tile));
    if (star) {
      this.destroyItem(star);
      this.stars = this.stars.filter(s => s !== star);
      this.growSnake(snake, 2, oldPositions);
      snake.score += 20;
      if (snake.isPlayer) this.flash('★ +20 · +2 length');
    }

    if (this.blackBox && sameTile(this.blackBox.tile, tile)) {
      if (snake.isPlayer) this.startQuiz(time);
      else this.activateSkill(snake, Phaser.Utils.Array.GetRandom(SKILLS), time);
      this.destroyItem(this.blackBox); this.blackBox = null;
    }
  }

  growSnake(snake, count, oldPositions) {
    let tail = oldPositions[oldPositions.length - 1] || snake.positions[snake.positions.length - 1];
    while (count-- > 0) snake.positions.push({ ...tail });
    snake.prevPositions = snake.prevPositions.concat(Array(snake.positions.length - snake.prevPositions.length).fill(0).map(() => ({ ...tail })));
    this.syncSnakeSprites(snake);
  }

  appleCombo(time) {
    if (this.comboDeadline && time > this.comboDeadline) this.comboCount = 0;
    this.comboCount++;
    this.highestCombo = Math.max(this.highestCombo, this.comboCount);
    this.comboDeadline = time + COMBO_WINDOW_MS;
    if (this.comboCount >= 5) {
      this.comboCount = 0;
      this.comboDeadline = 0;
      this.startStarRush(time);
    } else this.flash(`Apple combo ${this.comboCount}/5`);
  }

  startStarRush(time) {
    this.starRushUntil = time + 30000;
    this.clearStars();

    for (let i = 0; i < 25; i++) {
      const tile = STAR_SPAWN_MODE === 'viewport' ? this.randomFreeTileInViewport() : null;
      this.spawnStar(tile);
    }

    this.flash('STAR RUSH! 25 stars · full screen · 30s', 1800);
    this.cameras.main.flash(220, 255, 226, 92, false);
  }

  updateSpawns(time) {
    if (this.comboDeadline && time > this.comboDeadline) { this.comboCount = 0; this.comboDeadline = 0; }
    if (this.starRushUntil && time > this.starRushUntil) { this.starRushUntil = 0; this.clearStars(); }
    if (!this.blackBox && time - this.lastBlackBoxSpawn >= 10000) this.spawnBlackBox();
  }

  spawnApple() {
    if (this.apple || this.gameOver) return;
    // Keep the core reward inside the player's current play space.
    this.apple = this.spawnItem('apple', this.randomFreeTileNearPlayer(3, 6, true));
    this.flash('🍎 Apple nearby', 650);
    this.apple.expireEvent = this.time.delayedCall(5000, () => {
      if (!this.apple) return;
      this.destroyItem(this.apple); this.apple = null;
      this.time.delayedCall(2000, () => this.spawnApple());
    });
  }

  spawnBlackBox() {
    if (this.blackBox || this.gameOver || this.quiz) return;
    this.lastBlackBoxSpawn = this.time.now;
    // Prefer directly in front of the player so the quiz is discoverable, not lost in a 60x50 world.
    this.blackBox = this.spawnItem('blackbox', this.randomFreeTileNearPlayer(4, 7, true));
    this.flash('❓ Mystery Box nearby — enter it for Quiz', 1350);
    const target = this.blackBox;
    target.expireEvent = this.time.delayedCall(8000, () => {
      if (this.blackBox !== target) return;
      this.destroyItem(target); this.blackBox = null;
    });
  }

  spawnStar(tile = null) { this.stars.push(this.spawnItem('star', tile)); }

  spawnItem(type, tileOverride = null) {
    const tile = tileOverride || this.randomFreeTile();
    const c = centerOf(tile);
    const sprite = this.add.sprite(c.x, c.y, type).setDepth(8);

    if (type === 'apple') sprite.setDisplaySize(54, 54);
    if (type === 'star') {
      sprite.setDisplaySize(62, 62);
      this.tweens.add({ targets: sprite, angle: 360, duration: 1500, repeat: -1 });
    }
    if (type === 'blackbox') {
      sprite.setDisplaySize(68, 68);
      this.tweens.add({ targets: sprite, scale: 1.10, duration: 520, yoyo: true, repeat: -1 });
      const q = this.add.text(c.x, c.y + 43, 'QUIZ', {
        fontFamily: 'system-ui', fontSize: '10px', fontStyle: '900', color: '#ffffff',
        backgroundColor: '#151823cc', padding: { x: 6, y: 3 }
      }).setOrigin(0.5).setDepth(9);
      return { type, tile, sprite, label: q };
    }
    return { type, tile, sprite };
  }

  destroyItem(item) {
    if (!item) return;
    if (item.expireEvent) item.expireEvent.remove(false);
    item.sprite?.destroy(); item.label?.destroy();
  }

  clearStars() { this.stars.forEach(s => this.destroyItem(s)); this.stars = []; }

  randomFreeTile() {
    for (let i = 0; i < 250; i++) {
      const tile = { x: Phaser.Math.Between(2, COLS - 3), y: Phaser.Math.Between(2, ROWS - 3) };
      if (this.isTileOccupied(tile)) continue;
      return tile;
    }
    return { x: 30, y: 20 };
  }

  isTileOccupied(tile) {
    if (tile.x < 1 || tile.y < 1 || tile.x >= COLS - 1 || tile.y >= ROWS - 1) return true;
    if (this.walls.has(tileKey(tile.x, tile.y))) return true;
    if (this.snakes?.some(s => s.positions.some(p => sameTile(p, tile)))) return true;
    if (this.apple && sameTile(this.apple.tile, tile)) return true;
    if (this.blackBox && sameTile(this.blackBox.tile, tile)) return true;
    if (this.stars?.some(s => sameTile(s.tile, tile))) return true;
    return false;
  }

  pathClear(from, to) {
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    let x = from.x, y = from.y;
    while (x !== to.x || y !== to.y) {
      x += dx; y += dy;
      if (this.walls.has(tileKey(x, y))) return false;
    }
    return true;
  }

  randomFreeTileNearPlayer(minDistance = 3, maxDistance = 7, preferAhead = false) {
    const head = this.player?.positions?.[0];
    if (!head) return this.randomFreeTile();

    if (preferAhead) {
      for (let d = minDistance; d <= maxDistance; d++) {
        const tile = { x: head.x + this.player.dir.x * d, y: head.y + this.player.dir.y * d };
        if (!this.isTileOccupied(tile) && this.pathClear(head, tile)) return tile;
      }
    }

    for (let i = 0; i < 100; i++) {
      const dx = Phaser.Math.Between(-maxDistance, maxDistance);
      const dy = Phaser.Math.Between(-maxDistance, maxDistance);
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < minDistance || dist > maxDistance) continue;
      const tile = { x: head.x + dx, y: head.y + dy };
      if (!this.isTileOccupied(tile)) return tile;
    }
    return this.randomFreeTile();
  }

  randomFreeTileInViewport() {
    const head = this.player.positions[0];
    const zoom = Math.max(0.68, this.cameras.main.zoom || 1);
    const halfCols = Math.max(3, Math.floor((GAME_W / zoom) / TILE / 2));
    const halfRows = Math.max(5, Math.floor((GAME_H / zoom) / TILE / 2));

    for (let i = 0; i < 160; i++) {
      const dx = Phaser.Math.Between(-halfCols, halfCols);
      const dy = Phaser.Math.Between(-halfRows, halfRows);
      const tile = {
        x: (head.x + dx + COLS) % COLS,
        y: (head.y + dy + ROWS) % ROWS
      };
      if (!this.isTileOccupied(tile)) return tile;
    }
    return this.randomFreeTileNearPlayer(2, 8, false);
  }

  startQuiz(time) {
    const q = Phaser.Utils.Array.GetRandom(QUIZ_BANK);
    this.quiz = { ...q, startedAt: time, endsAt: time + 15000 };
    this.quizOrb.setPosition(this.player.sprites[0].x, this.player.sprites[0].y).setVisible(true);
    this.quizUI.forEach(x => x.setVisible(true));
    this.quizQuestion.setText(q.q);
    q.options.forEach((o, i) => this.quizOptions[i].setText(o));
    this.quizTimer.setText('15');
  }

  updateQuiz(time) {
    if (!this.quiz) return;
    const left = Math.max(0, Math.ceil((this.quiz.endsAt - time) / 1000));
    this.quizTimer.setText(String(left));
    if (time >= this.quiz.endsAt) this.finishQuiz(false, time, true);
  }

  answerQuiz(index) {
    if (!this.quiz) return;
    this.finishQuiz(index === this.quiz.answer, this.time.now, false);
  }

  finishQuiz(correct, time, timedOut) {
    this.quiz = null;
    this.quizUI.forEach(x => x.setVisible(false));
    this.quizOrb.setVisible(false);
    this.player.invisibleUntil = time + 8000;

    if (correct) {
      const skill = Phaser.Utils.Array.GetRandom(SKILLS);
      this.pendingSkill = skill;
      this.pendingSkillExpiresAt = time + 8000;
      this.pendingSkillOrigin = { ...this.player.positions[0] };
      this.activeSkillLabel = `READY: ${skill.toUpperCase()}`;
      this.skillButton.setText(`USE ${skill.toUpperCase()}`).setVisible(true);
      this.flash(`${skill} ready · aim then tap USE`, 1800);
    } else {
      this.pendingSkill = null;
      this.pendingSkillExpiresAt = 0;
      this.pendingSkillOrigin = null;
      this.skillButton.setVisible(false);
      this.flash(timedOut ? 'Quiz time out · no power-up' : 'Wrong answer · no power-up', 1600);
    }
  }

  updatePendingSkill(time) {
    if (!this.pendingSkill) return;
    if (time < this.pendingSkillExpiresAt) return;
    this.flash(`${this.pendingSkill} expired`, 900);
    this.pendingSkill = null;
    this.pendingSkillExpiresAt = 0;
    this.pendingSkillOrigin = null;
    this.activeSkillLabel = '';
    this.skillButton.setVisible(false);
  }

  usePendingSkill() {
    if (!this.pendingSkill) return;
    const skill = this.pendingSkill;
    const origin = this.pendingSkillOrigin ? { ...this.pendingSkillOrigin } : { ...this.player.positions[0] };
    this.pendingSkill = null;
    this.pendingSkillExpiresAt = 0;
    this.pendingSkillOrigin = null;
    this.skillButton.setVisible(false);
    this.activateSkill(this.player, skill, this.time.now, origin);
  }

  activateSkill(snake, skill, time, skillOrigin = null) {
    if (snake.isPlayer) this.activeSkillLabel = skill.toUpperCase();

    if (skill === 'Slow') {
      const origin = skillOrigin || snake.positions[0];
      this.snakes.filter(s => s !== snake).forEach(target => {
        const h = target.positions[0];
        const dx = Math.min(Math.abs(h.x - origin.x), COLS - Math.abs(h.x - origin.x));
        const dy = Math.min(Math.abs(h.y - origin.y), ROWS - Math.abs(h.y - origin.y));
        if (dx + dy <= 7) target.slowedUntil = Math.max(target.slowedUntil, time + 8000);
      });
      if (snake.isPlayer) this.flash('SLOW AREA · radius 7 tiles', 1200);
    } else if (skill === 'Fire') {
      this.castFire(snake, time);
    } else if (skill === 'Grapple Tongue') {
      this.castGrapple(snake, time);
    } else if (skill === 'Venom Trail') {
      snake.venomUntil = time + 10000;
      if (snake.isPlayer) this.flash('VENOM TRAIL · 10s', 1100);
    } else if (skill === 'Spike Skin') {
      snake.spikeUntil = time + 8000;
      if (snake.isPlayer) this.flash('SPIKE SKIN · 8s', 1100);
    }

    this.time.delayedCall(8000, () => {
      if (snake.isPlayer && this.activeSkillLabel === skill.toUpperCase()) this.activeSkillLabel = '';
    });
  }

  castFire(snake, time) {
    const h = snake.positions[0];
    const fireTiles = [];

    // GDD v2 range = 6 tiles. Stop on an obstacle, and wrap at map edges.
    for (let i = 1; i <= 6; i++) {
      const tile = {
        x: (h.x + snake.dir.x * i + COLS) % COLS,
        y: (h.y + snake.dir.y * i + ROWS) % ROWS
      };
      if (this.walls.has(tileKey(tile.x, tile.y))) break;
      fireTiles.push(tile);
    }

    // Draw discrete flame bursts per tile so this reads as FIRE, not a laser beam.
    fireTiles.forEach((tile, i) => {
      const c = centerOf(tile);
      const r = Math.max(12, 24 - i * 1.7);
      this.effectGfx.fillStyle(i % 2 ? 0xff7a18 : 0xffb11b, 0.88).fillCircle(c.x, c.y, r);
      this.effectGfx.fillStyle(0xffe08a, 0.82).fillCircle(c.x - snake.dir.x * 5, c.y - snake.dir.y * 5, r * 0.45);
      const sideX = snake.dir.y * r * 0.7, sideY = -snake.dir.x * r * 0.7;
      this.effectGfx.fillStyle(0xf04420, 0.74).fillTriangle(
        c.x + sideX, c.y + sideY,
        c.x - sideX, c.y - sideY,
        c.x + snake.dir.x * (r * 1.7), c.y + snake.dir.y * (r * 1.7)
      );
    });
    this.time.delayedCall(650, () => this.effectGfx.clear());

    const fireKeys = new Set(fireTiles.map(t => tileKey(t.x, t.y)));
    this.snakes.filter(s => s !== snake).forEach(target => {
      const hit = target.positions.some(p => fireKeys.has(tileKey(p.x, p.y)));
      if (!hit) return;
      const before = target.positions.length;
      this.damageSnake(target, 3, true);
      snake.score += Math.max(0, before - target.positions.length) * 5;
    });

    if (snake.isPlayer) this.flash(`FIRE · range ${fireTiles.length}/6 tiles`, 900);
  }

  castGrapple(snake) {
    const h = snake.positions[0];
    const candidates = [];
    if (this.apple) candidates.push(this.apple);
    candidates.push(...this.stars);
    const target = candidates.map(item => ({ item, d: Math.abs(item.tile.x - h.x) + Math.abs(item.tile.y - h.y) }))
      .filter(x => x.d <= 5).sort((a, b) => a.d - b.d)[0];
    if (!target) return;
    const a = centerOf(h), b = centerOf(target.item.tile);
    const tongue = this.add.sprite(a.x, a.y, 'snakeParts', FRAME.tongue).setDepth(42).setDisplaySize(18, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y));
    tongue.setOrigin(0.5, 1).setRotation(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
    this.tweens.add({ targets: tongue, alpha: 0, duration: 420, onComplete: () => tongue.destroy() });
    if (target.item === this.apple) {
      this.destroyItem(this.apple); this.apple = null; this.growSnake(snake, 1, snake.positions); snake.score += 10;
      if (snake.isPlayer) this.appleCombo(this.time.now);
      this.time.delayedCall(2000, () => this.spawnApple());
    } else {
      this.destroyItem(target.item); this.stars = this.stars.filter(s => s !== target.item); this.growSnake(snake, 2, snake.positions); snake.score += 20;
    }
  }

  addPoison(tile, time) {
    if (this.poisonTiles.some(p => sameTile(p.tile, tile))) return;
    const c = centerOf(tile);
    const sprite = this.add.sprite(c.x, c.y, 'poison').setDepth(5);
    this.poisonTiles.push({ tile: { ...tile }, sprite, expires: time + 10000 });
    while (this.poisonTiles.length > 12) this.poisonTiles.shift().sprite.destroy();
  }

  isPoison(tile) { return this.poisonTiles.some(p => sameTile(p.tile, tile)); }
  updatePoison(time) {
    this.poisonTiles = this.poisonTiles.filter(p => { if (p.expires <= time) { p.sprite.destroy(); return false; } return true; });
  }

  cycleSkin() {
    const idx = (SKINS.indexOf(this.player.skin) + 1) % SKINS.length;
    this.player.skin = SKINS[idx];
    this.skinButton.setText(this.player.skin.toUpperCase());
    const colors = { beige: '#f2eadc', white: '#e9f7f8', green: '#66dc7a', red: '#ff7566' };
    this.skinButton.setBackgroundColor(colors[this.player.skin]);
    this.syncSnakeSprites(this.player);
  }

  updateCamera(time) {
    const sprite = this.player.sprites[0];
    const look = TILE * 1.55;
    const tx = sprite.x + this.player.dir.x * look;
    const ty = sprite.y + this.player.dir.y * look;

    if (Phaser.Math.Distance.Between(this.cameraFocus.x, this.cameraFocus.y, tx, ty) > TILE * 8) {
      this.cameraFocus.setPosition(tx, ty);
    } else {
      this.cameraFocus.x = Phaser.Math.Linear(this.cameraFocus.x, tx, 0.08);
      this.cameraFocus.y = Phaser.Math.Linear(this.cameraFocus.y, ty, 0.08);
    }

    let targetZoom = 1.05 - Math.max(0, this.player.positions.length - 2) * 0.018;
    if (this.starRushUntil > time) targetZoom -= 0.10;
    targetZoom = Phaser.Math.Clamp(targetZoom, 0.68, 1.05);
    this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.035));
  }

  updateHUD(time) {
    const remain = Math.max(0, this.gameEndsAt - time);
    const sec = Math.ceil(remain / 1000);
    this.timerText.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    this.scoreText.setText(`🍎 ${this.player.score}`);
    const sorted = [...this.snakes].sort((a, b) => b.score - a.score);
    this.rankText.setText(`#${sorted.indexOf(this.player) + 1}`);
    this.comboText.setText(this.starRushUntil > time
      ? `★ STAR RUSH ${Math.ceil((this.starRushUntil - time) / 1000)}s`
      : `COMBO ${this.comboCount}/5`);

    if (this.pendingSkill) {
      const left = Math.max(0, Math.ceil((this.pendingSkillExpiresAt - time) / 1000));
      this.skillText.setText(`READY ${this.pendingSkill.toUpperCase()} ${left}s`);
    } else {
      this.skillText.setText(this.activeSkillLabel);
    }
  }

  flash(text, duration = 1100) {
    this.toast.setText(text).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: duration, duration: 350, onComplete: () => this.toast.setVisible(false).setAlpha(1) });
  }

  finishGame() {
    this.gameOver = true;
    this.overScore.setText(`Score  ${this.player.score}\nHighest Combo  ${this.highestCombo}`);
    this.overUI.forEach(x => x.setVisible(true));
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#dbe9c5',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false },
  scene: [GameScene]
});
