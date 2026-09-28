import { THEME_PACKS } from './themes.js';

const GAME_W = 450;
const GAME_H = 800;
const WORLD_W = 1400;
const WORLD_H = 2400;
const GRID = 80;

class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.themeId = 'snake';
    this.theme = THEME_PACKS[this.themeId];
    this.score = 0;
    this.baseSpeed = 225;
    this.boostUntil = 0;
    this.shield = 0;
    this.invulnerableUntil = 0;
    this.isGameOver = false;

    this.direction = new Phaser.Math.Vector2(0, -1);
    this.targetDirection = this.direction.clone();
    this.pointerDirection = new Phaser.Math.Vector2();
    this.joystickActive = false;
    this.joystickPointerId = null;
    this.joystickOrigin = new Phaser.Math.Vector2();

    this.makeTextures();
    this.buildWorld();
    this.buildPlayer();
    this.buildCollectibles();
    this.buildUI();
    this.bindInput();
    this.configureCamera();
  }

  update(time, delta) {
    if (this.isGameOver) return;

    const dt = Math.min(delta / 1000, 0.04);
    this.readDirectionInput();
    this.movePlayer(time, dt);
    this.updateChain();
    this.handleCollectibles(time);
    this.handleObstacleCollision(time);
    this.updateCamera(time);
    this.updateUI(time);
  }

  makeTextures() {
    const circle = (key, radius, fill, stroke, strokeWidth) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ add: false });
      g.fillStyle(fill, 1);
      g.lineStyle(strokeWidth, stroke, 1);
      g.fillCircle(radius, radius, radius - strokeWidth / 2);
      g.strokeCircle(radius, radius, radius - strokeWidth / 2);
      g.generateTexture(key, radius * 2, radius * 2);
      g.destroy();
    };

    Object.values(THEME_PACKS).forEach((theme) => {
      circle(theme.id + '-head', 24, theme.head.fill, theme.head.stroke, 4);
      theme.bodyPalette.forEach((color, i) => {
        circle(theme.id + '-body-' + i, 18, color, theme.head.stroke, 2);
      });
    });

    if (!this.textures.exists('item-apple')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xd92f2f, 1).fillCircle(18, 19, 14);
      g.fillStyle(0x6b3e26, 1).fillRect(17, 1, 4, 9);
      g.fillStyle(0x4d9b51, 1).fillEllipse(24, 6, 11, 6);
      g.generateTexture('item-apple', 36, 38);
      g.destroy();
    }

    if (!this.textures.exists('item-star')) {
      const g = this.make.graphics({ add: false });
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 17 : 8;
        pts.push(new Phaser.Math.Vector2(20 + Math.cos(a) * r, 20 + Math.sin(a) * r));
      }
      g.fillStyle(0xffd54a, 1);
      g.lineStyle(3, 0xb48417, 1);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      g.generateTexture('item-star', 40, 40);
      g.destroy();
    }

    if (!this.textures.exists('item-coin')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffd166, 1).fillCircle(18, 18, 16);
      g.lineStyle(3, 0xb98211, 1).strokeCircle(18, 18, 15);
      g.generateTexture('item-coin', 36, 36);
      g.destroy();
    }

    if (!this.textures.exists('item-coupon')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xff7a8a, 1).fillRoundedRect(2, 5, 40, 30, 7);
      g.lineStyle(3, 0x8f3948, 1).strokeRoundedRect(2, 5, 40, 30, 7);
      g.generateTexture('item-coupon', 44, 40);
      g.destroy();
    }

    if (!this.textures.exists('item-mystery')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0x1f2937, 1).fillRoundedRect(2, 2, 38, 38, 8);
      g.lineStyle(3, 0x94a3b8, 1).strokeRoundedRect(2, 2, 38, 38, 8);
      g.generateTexture('item-mystery', 42, 42);
      g.destroy();
    }
  }

  buildWorld() {
    this.backgroundGraphics = this.add.graphics().setDepth(-20);
    this.obstacleGraphics = this.add.graphics().setDepth(-5);
    this.obstacles = [
      new Phaser.Geom.Rectangle(140, 220, 300, 60),
      new Phaser.Geom.Rectangle(760, 180, 290, 66),
      new Phaser.Geom.Rectangle(1100, 410, 80, 260),
      new Phaser.Geom.Rectangle(360, 620, 280, 72),
      new Phaser.Geom.Rectangle(860, 760, 320, 68),
      new Phaser.Geom.Rectangle(150, 920, 92, 300),
      new Phaser.Geom.Rectangle(520, 1080, 330, 76),
      new Phaser.Geom.Rectangle(1020, 1190, 92, 340),
      new Phaser.Geom.Rectangle(230, 1460, 340, 74),
      new Phaser.Geom.Rectangle(720, 1580, 290, 72),
      new Phaser.Geom.Rectangle(1160, 1700, 82, 280),
      new Phaser.Geom.Rectangle(370, 1970, 300, 72),
      new Phaser.Geom.Rectangle(870, 2140, 350, 70)
    ];
    this.redrawWorld();
  }

  redrawWorld() {
    const g = this.backgroundGraphics;
    g.clear();

    for (let y = 0; y < WORLD_H; y += GRID) {
      for (let x = 0; x < WORLD_W; x += GRID) {
        const alt = ((x / GRID) + (y / GRID)) % 2 === 0;
        g.fillStyle(alt ? this.theme.backgroundA : this.theme.backgroundB, 1);
        g.fillRect(x, y, GRID, GRID);
      }
    }

    g.lineStyle(2, this.theme.gridLine, 0.48);
    for (let x = 0; x <= WORLD_W; x += GRID) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += GRID) g.lineBetween(0, y, WORLD_W, y);

    this.obstacleGraphics.clear();
    this.obstacles.forEach((rect, i) => this.drawObstacle(rect, i));
  }

  drawObstacle(rect, index) {
    const g = this.obstacleGraphics;
    const radius = Math.min(22, rect.height / 3);
    g.fillStyle(0x000000, 0.10).fillRoundedRect(rect.x + 8, rect.y + 10, rect.width, rect.height, radius);
    g.fillStyle(this.theme.obstacle.fill, 1).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
    g.lineStyle(4, this.theme.obstacle.stroke, 0.85).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
    g.lineStyle(2, 0xffffff, 0.08);

    const lines = Math.max(2, Math.floor(rect.width / 90));
    for (let i = 1; i < lines; i++) {
      const lx = rect.x + rect.width / lines * i;
      g.lineBetween(lx, rect.y + 8, lx - 10, rect.y + rect.height - 8);
    }

    if (index % 3 === 0) {
      g.fillStyle(this.theme.obstacle.stroke, 0.55);
      g.fillCircle(rect.x + rect.width * 0.22, rect.y + rect.height * 0.48, 7);
    }
  }

  buildPlayer() {
    const startX = WORLD_W / 2;
    const startY = WORLD_H * 0.78;

    this.head = this.add.sprite(startX, startY, this.theme.id + '-head').setDepth(20);
    this.headDecoration = this.add.text(startX, startY, '••', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: '700'
    }).setOrigin(0.5).setDepth(21);

    this.trail = [];
    for (let i = 0; i < 700; i++) this.trail.push({ x: startX, y: startY + i * 1.8 });

    this.segments = [];
    for (let i = 0; i < 5; i++) this.addSegment();
  }

  addSegment() {
    const i = this.segments.length;
    const texture = this.theme.id + '-body-' + (i % this.theme.bodyPalette.length);
    const sprite = this.add.sprite(this.head.x, this.head.y + 50 + i * 26, texture).setDepth(10 - i * 0.01);
    let label = null;

    if (this.theme.id === 'shopping') {
      label = this.makeSegmentLabel(sprite, i);
    }

    this.segments.push({ sprite, label });
  }

  makeSegmentLabel(sprite, i) {
    return this.add.text(sprite.x, sprite.y, this.theme.segmentLabels[i % this.theme.segmentLabels.length], {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '8px',
      color: '#2d2130',
      fontStyle: '800'
    }).setOrigin(0.5).setDepth(11);
  }

  removeSegments(count) {
    for (let i = 0; i < count && this.segments.length > 2; i++) {
      const seg = this.segments.pop();
      seg.sprite.destroy();
      if (seg.label) seg.label.destroy();
    }
  }

  buildCollectibles() {
    this.collectibles = [];
    for (let i = 0; i < 12; i++) this.spawnCollectible('common');
    for (let i = 0; i < 4; i++) this.spawnCollectible('power');
    this.spawnCollectible('mystery');
  }

  safePoint() {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = Phaser.Math.Between(80, WORLD_W - 80);
      const y = Phaser.Math.Between(100, WORLD_H - 100);
      const nearPlayer = Phaser.Math.Distance.Between(x, y, this.head.x, this.head.y) < 180;
      const blocked = this.obstacles.some((r) => {
        const padded = new Phaser.Geom.Rectangle(r.x - 50, r.y - 50, r.width + 100, r.height + 100);
        return Phaser.Geom.Rectangle.Contains(padded, x, y);
      });
      if (!nearPlayer && !blocked) return { x, y };
    }
    return { x: WORLD_W / 2, y: 220 };
  }

  spawnCollectible(kind, existing) {
    const p = this.safePoint();
    const type = this.theme.collectible[kind];
    const texture = 'item-' + type;

    if (existing) {
      existing.kind = kind;
      existing.type = type;
      existing.sprite.setTexture(texture).setPosition(p.x, p.y).setVisible(true);
      if (existing.label) existing.label.setPosition(p.x, p.y);
      return;
    }

    const sprite = this.add.sprite(p.x, p.y, texture).setDepth(2);
    let label = null;

    if (kind === 'mystery') {
      label = this.add.text(p.x, p.y, '?', { fontSize: '22px', color: '#ffffff', fontStyle: '900' }).setOrigin(0.5).setDepth(3);
    }

    this.collectibles.push({ kind, type, sprite, label });
  }

  buildUI() {
    const panel = this.add.graphics().setScrollFactor(0).setDepth(100);
    panel.fillStyle(0x111827, 0.82).fillRoundedRect(18, 18, 178, 66, 18);
    panel.lineStyle(1, 0xffffff, 0.10).strokeRoundedRect(18, 18, 178, 66, 18);

    this.scoreText = this.add.text(34, 30, 'Score 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: '800'
    }).setScrollFactor(0).setDepth(101);

    this.statusText = this.add.text(34, 57, 'Length 5', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#cbd5e1'
    }).setScrollFactor(0).setDepth(101);

    this.themeButton = this.add.text(GAME_W - 18, 24, 'SHOPPING', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#111827',
      backgroundColor: '#ffd166',
      padding: { x: 12, y: 9 },
      fontStyle: '900'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });

    this.themeButton.on('pointerdown', () => this.switchTheme());

    this.messageText = this.add.text(GAME_W / 2, 118, 'Drag anywhere to steer', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#111827bb',
      padding: { x: 14, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);

    this.time.delayedCall(3000, () => {
      if (this.messageText) this.messageText.setVisible(false);
    });

    this.joystickGraphics = this.add.graphics().setScrollFactor(0).setDepth(103);
  }

  bindInput() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D
    });

    this.input.on('pointerdown', (pointer) => {
      if (this.themeButton && this.themeButton.getBounds().contains(pointer.x, pointer.y)) return;

      if (this.isGameOver) {
        this.scene.restart();
        return;
      }

      this.joystickActive = true;
      this.joystickPointerId = pointer.id;
      this.joystickOrigin.set(pointer.x, pointer.y);
      this.updateJoystick(pointer.x, pointer.y);
    });

    this.input.on('pointermove', (pointer) => {
      if (this.joystickActive && pointer.id === this.joystickPointerId && pointer.isDown) {
        this.updateJoystick(pointer.x, pointer.y);
      }
    });

    const release = (pointer) => {
      if (pointer.id !== this.joystickPointerId) return;
      this.joystickActive = false;
      this.joystickPointerId = null;
      this.pointerDirection.set(0, 0);
      this.joystickGraphics.clear();
    };

    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  updateJoystick(x, y) {
    const dx = x - this.joystickOrigin.x;
    const dy = y - this.joystickOrigin.y;
    const max = 58;
    const len = Math.hypot(dx, dy);

    if (len > 7) this.pointerDirection.set(dx / len, dy / len);

    const scale = len > max ? max / len : 1;
    const kx = this.joystickOrigin.x + dx * scale;
    const ky = this.joystickOrigin.y + dy * scale;

    this.joystickGraphics.clear();
    this.joystickGraphics.fillStyle(0x111827, 0.20).fillCircle(this.joystickOrigin.x, this.joystickOrigin.y, 42);
    this.joystickGraphics.lineStyle(2, 0xffffff, 0.28).strokeCircle(this.joystickOrigin.x, this.joystickOrigin.y, 42);
    this.joystickGraphics.fillStyle(0xffffff, 0.72).fillCircle(kx, ky, 18);
  }

  readDirectionInput() {
    const v = new Phaser.Math.Vector2(0, 0);
    if (this.keys.left.isDown || this.keys.a.isDown) v.x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) v.x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) v.y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) v.y += 1;

    if (v.lengthSq() > 0) {
      this.targetDirection.copy(v.normalize());
    } else if (this.joystickActive && this.pointerDirection.lengthSq() > 0.01) {
      this.targetDirection.copy(this.pointerDirection);
    }
  }

  movePlayer(time, dt) {
    const blend = 1 - Math.exp(-7.5 * dt);
    this.direction.x = Phaser.Math.Linear(this.direction.x, this.targetDirection.x, blend);
    this.direction.y = Phaser.Math.Linear(this.direction.y, this.targetDirection.y, blend);
    if (this.direction.lengthSq() < 0.01) this.direction.set(0, -1);
    this.direction.normalize();

    const boosting = time < this.boostUntil;
    const speed = this.baseSpeed * (boosting ? 1.35 : 1);

    this.head.x += this.direction.x * speed * dt;
    this.head.y += this.direction.y * speed * dt;

    if (this.head.x < 34 || this.head.x > WORLD_W - 34) this.targetDirection.x *= -1;
    if (this.head.y < 34 || this.head.y > WORLD_H - 34) this.targetDirection.y *= -1;

    this.head.x = Phaser.Math.Clamp(this.head.x, 34, WORLD_W - 34);
    this.head.y = Phaser.Math.Clamp(this.head.y, 34, WORLD_H - 34);
    this.head.rotation = Math.atan2(this.direction.y, this.direction.x) + Math.PI / 2;

    this.headDecoration.setPosition(this.head.x, this.head.y);
    this.headDecoration.setRotation(this.theme.id === 'snake' ? this.head.rotation : 0);

    const last = this.trail[0];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, this.head.x, this.head.y) > 4) {
      this.trail.unshift({ x: this.head.x, y: this.head.y });
      if (this.trail.length > 1200) this.trail.pop();
    }
  }

  updateChain() {
    const spacing = this.theme.id === 'shopping' ? 31 : 27;

    this.segments.forEach((seg, index) => {
      const p = this.sampleTrail((index + 1) * spacing);
      if (!p) return;
      seg.sprite.x = Phaser.Math.Linear(seg.sprite.x, p.x, 0.56);
      seg.sprite.y = Phaser.Math.Linear(seg.sprite.y, p.y, 0.56);
      if (seg.label) seg.label.setPosition(seg.sprite.x, seg.sprite.y);
    });
  }

  sampleTrail(distance) {
    let walked = 0;

    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

      if (walked + d >= distance) {
        const t = (distance - walked) / Math.max(d, 0.001);
        return {
          x: Phaser.Math.Linear(a.x, b.x, t),
          y: Phaser.Math.Linear(a.y, b.y, t)
        };
      }

      walked += d;
    }

    return this.trail[this.trail.length - 1];
  }

  handleCollectibles(time) {
    this.collectibles.forEach((item) => {
      if (Phaser.Math.Distance.Between(this.head.x, this.head.y, item.sprite.x, item.sprite.y) > 38) return;

      if (item.kind === 'common') {
        this.score += 10;
        this.addSegment();
        this.flashMessage('+10 · chain grew');
      } else if (item.kind === 'power') {
        this.score += 50;
        this.addSegment();
        this.boostUntil = time + 4500;
        this.flashMessage('Speed boost!');
      } else {
        const roll = Phaser.Math.Between(0, 2);

        if (roll === 0) {
          this.shield = 1;
          this.flashMessage('Mystery: shield');
        } else if (roll === 1) {
          this.score += 120;
          this.flashMessage('Mystery: +120');
        } else {
          this.addSegment();
          this.addSegment();
          this.flashMessage('Mystery: +2 chain');
        }
      }

      this.spawnCollectible(item.kind, item);
    });
  }

  handleObstacleCollision(time) {
    if (time < this.invulnerableUntil) return;

    const circle = new Phaser.Geom.Circle(this.head.x, this.head.y, 19);
    const hit = this.obstacles.some((rect) => Phaser.Geom.Intersects.CircleToRectangle(circle, rect));
    if (!hit) return;

    this.invulnerableUntil = time + 950;
    this.head.setAlpha(0.45);
    this.time.delayedCall(900, () => {
      if (this.head) this.head.setAlpha(1);
    });

    this.head.x -= this.direction.x * 46;
    this.head.y -= this.direction.y * 46;
    this.targetDirection.scale(-1);

    if (this.shield > 0) {
      this.shield = 0;
      this.flashMessage('Shield saved you');
      return;
    }

    if (this.segments.length > 2) {
      this.removeSegments(2);
      this.score = Math.max(0, this.score - 20);
      this.flashMessage('Hit! -2 chain');
    } else {
      this.gameOver();
    }
  }

  configureCamera() {
    this.focusTarget = this.add.zone(this.head.x, this.head.y, 2, 2);
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_W, WORLD_H);
    camera.startFollow(this.focusTarget, true, 0.11, 0.11);
    camera.setZoom(0.98);
  }

  updateCamera(time) {
    const lookAhead = time < this.boostUntil ? 155 : 118;
    const desiredX = this.head.x + this.direction.x * lookAhead;
    const desiredY = this.head.y + this.direction.y * lookAhead;

    this.focusTarget.x = Phaser.Math.Linear(this.focusTarget.x, desiredX, 0.085);
    this.focusTarget.y = Phaser.Math.Linear(this.focusTarget.y, desiredY, 0.085);

    let targetZoom = 1.03 - Math.max(0, this.segments.length - 4) * 0.018;
    if (time < this.boostUntil) targetZoom -= 0.08;
    targetZoom = Phaser.Math.Clamp(targetZoom, 0.70, 1.04);

    this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.035));
  }

  updateUI(time) {
    this.scoreText.setText('Score ' + this.score);
    const boost = time < this.boostUntil ? ' · BOOST' : '';
    const shield = this.shield ? ' · SHIELD' : '';
    this.statusText.setText('Length ' + this.segments.length + boost + shield);
  }

  switchTheme() {
    this.themeId = this.themeId === 'snake' ? 'shopping' : 'snake';
    this.theme = THEME_PACKS[this.themeId];
    this.redrawWorld();

    this.head.setTexture(this.theme.id + '-head');
    this.headDecoration.setText(this.theme.id === 'snake' ? '••' : '👩');
    this.headDecoration.setFontSize(this.theme.id === 'snake' ? 15 : 25);
    this.headDecoration.setColor(this.theme.id === 'snake' ? '#ffffff' : '#3f2a35');

    this.segments.forEach((seg, i) => {
      seg.sprite.setTexture(this.theme.id + '-body-' + (i % this.theme.bodyPalette.length));

      if (this.theme.id === 'shopping') {
        if (!seg.label) seg.label = this.makeSegmentLabel(seg.sprite, i);
        seg.label.setText(this.theme.segmentLabels[i % this.theme.segmentLabels.length]);
      } else if (seg.label) {
        seg.label.destroy();
        seg.label = null;
      }
    });

    this.collectibles.forEach((item) => {
      item.type = this.theme.collectible[item.kind];
      item.sprite.setTexture('item-' + item.type);
    });

    this.themeButton.setText(this.theme.id === 'snake' ? 'SHOPPING' : 'SNAKE');
    this.themeButton.setBackgroundColor(this.theme.id === 'snake' ? '#ffd166' : '#a7e8bd');
    this.flashMessage(this.theme.name);
  }

  flashMessage(text) {
    this.messageText.setText(text).setPosition(GAME_W / 2, 118).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.messageText);
    this.tweens.add({
      targets: this.messageText,
      alpha: 0,
      delay: 900,
      duration: 450,
      onComplete: () => this.messageText.setVisible(false).setAlpha(1)
    });
  }

  gameOver() {
    this.isGameOver = true;
    this.joystickGraphics.clear();
    this.messageText
      .setText('Game over · Score ' + this.score + '\nTap to restart')
      .setStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        align: 'center',
        color: '#ffffff',
        backgroundColor: '#111827dd',
        padding: { x: 22, y: 18 }
      })
      .setPosition(GAME_W / 2, GAME_H / 2)
      .setOrigin(0.5)
      .setVisible(true)
      .setAlpha(1);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#111827',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    pixelArt: false
  },
  scene: [GameScene]
});
