import { loadConfig } from './config.js';
import { Renderer } from './renderer.js';
import { InputManager } from './input.js';
import { SoundEffects } from './audio.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.sfx = new SoundEffects();

    this.state = 'START_SCREEN'; // START_SCREEN | PLAYING | WAVE_CLEAR | GAME_OVER
    this.config = null;

    this.currentWaveIndex = 0;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('lightgun_highscore') || '0', 10);
    this.lives = 3;
    this.ammo = 6;
    this.clipSize = 6;
    this.isReloading = false;

    this.crosshairX = 512;
    this.crosshairY = 384;

    this.activeTargets = [];
    this.bulletHoles = [];
    this.recoilOffset = 0;
    this.muzzleFlashTimer = 0;

    this.lastTime = performance.now();
    this.spawnTimer = 0;
    this.waveTimeLeft = 30;
    this.secondAccumulator = 0;

    this.input = new InputManager(this.canvas, 1024, 768, {
      onMove: (x, y) => this.handleMove(x, y),
      onShoot: (x, y) => this.handleShoot(x, y),
      onReload: () => this.handleReload()
    });
  }

  async init() {
    this.config = await loadConfig();
    this.clipSize = this.config.game.clip_size || 6;
    this.ammo = this.clipSize;
    this.lives = this.config.game.starting_lives || 3;

    this.registerServiceWorker();

    requestAnimationFrame((t) => this.loop(t));
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('ServiceWorker registered for offline play'))
        .catch((err) => console.log('ServiceWorker registration failed:', err));
    }
  }

  startNewGame() {
    this.score = 0;
    this.lives = this.config.game.starting_lives || 3;
    this.currentWaveIndex = 0;
    this.startWave(0);
  }

  startWave(waveIdx) {
    this.currentWaveIndex = waveIdx;
    const wave = this.config.waves[waveIdx] || this.config.waves[0];
    this.waveTimeLeft = wave.duration_sec || 30;
    this.secondAccumulator = 0;
    this.spawnTimer = 0;
    this.ammo = this.clipSize;
    this.isReloading = false;
    this.activeTargets = [];
    this.bulletHoles = [];
    this.state = 'PLAYING';
  }

  handleMove(x, y) {
    this.crosshairX = x;
    this.crosshairY = y;
  }

  handleShoot(x, y) {
    if (this.state === 'START_SCREEN' || this.state === 'GAME_OVER' || this.state === 'WAVE_CLEAR') {
      if (this.state === 'GAME_OVER' || this.state === 'START_SCREEN') {
        this.startNewGame();
      } else if (this.state === 'WAVE_CLEAR') {
        this.startWave(this.currentWaveIndex + 1);
      }
      return;
    }

    if (this.state !== 'PLAYING') return;

    if (this.isReloading) {
      this.sfx.playDryFire();
      return;
    }

    if (this.ammo <= 0) {
      this.sfx.playDryFire();
      return;
    }

    // Shoot gun
    this.ammo--;
    this.sfx.playGunshot();
    this.recoilOffset = this.config.mechanics.recoil_distance_px || 18;
    this.muzzleFlashTimer = this.config.mechanics.muzzle_flash_ms || 70;

    // Record bullet hole decal
    this.bulletHoles.push({
      x,
      y,
      spawnTime: performance.now()
    });

    // Check target hits
    let hitSomething = false;
    for (let i = this.activeTargets.length - 1; i >= 0; i--) {
      const target = this.activeTargets[i];
      if (
        x >= target.x &&
        x <= target.x + target.width &&
        y >= target.y &&
        y <= target.y + target.height
      ) {
        hitSomething = true;
        const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];

        if (target.type === 'outlaw' || target.type === 'fast_outlaw') {
          const bonus = target.type === 'fast_outlaw' ? 50 : 0;
          this.score += (wave.points_outlaw || 100) + bonus;
          if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('lightgun_highscore', this.highScore.toString());
          }
          this.sfx.playHitOutlaw();
        } else if (target.type === 'civilian') {
          this.score = Math.max(0, this.score - (wave.points_civilian_penalty || 200));
          this.sfx.playHitCivilian();
        }

        this.activeTargets.splice(i, 1);
        break;
      }
    }
  }

  handleReload() {
    if (this.state !== 'PLAYING' || this.isReloading || this.ammo === this.clipSize) return;

    this.isReloading = true;
    this.sfx.playReload();
    setTimeout(() => {
      this.ammo = this.clipSize;
      this.isReloading = false;
    }, 400);
  }

  spawnTarget() {
    if (this.activeTargets.length >= 3) return;

    const covers = this.config.covers || [];
    const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];

    // Filter available covers not currently occupied
    const occupiedCovers = new Set(this.activeTargets.map(t => t.coverId));
    const availableCovers = covers.filter(c => !occupiedCovers.has(c.id));

    if (availableCovers.length === 0) return;

    const selectedCover = availableCovers[Math.floor(Math.random() * availableCovers.length)];
    const isOutlaw = Math.random() < (wave.outlaw_ratio || 0.75);

    let type = 'civilian';
    if (isOutlaw) {
      type = Math.random() < 0.3 ? 'fast_outlaw' : 'outlaw';
    }

    this.activeTargets.push({
      coverId: selectedCover.id,
      x: selectedCover.x,
      y: selectedCover.y,
      width: selectedCover.width,
      height: selectedCover.height,
      type: type,
      timer: wave.target_visible_duration_ms || 2000,
      animTimer: 0,
      animDuration: 150
    });
  }

  update(dt) {
    if (this.recoilOffset > 0) {
      this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.15);
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    }

    // Clean up old bullet holes
    const now = performance.now();
    const maxHoleAge = this.config.mechanics.bullet_hole_duration_ms || 5000;
    this.bulletHoles = this.bulletHoles.filter(h => now - h.spawnTime < maxHoleAge);

    if (this.state !== 'PLAYING') return;

    const wave = this.config.waves[this.currentWaveIndex] || this.config.waves[0];

    // Wave countdown
    this.secondAccumulator += dt;
    if (this.secondAccumulator >= 1000) {
      this.secondAccumulator -= 1000;
      this.waveTimeLeft--;

      if (this.waveTimeLeft <= 0) {
        if (this.currentWaveIndex + 1 < this.config.waves.length) {
          this.state = 'WAVE_CLEAR';
        } else {
          // All waves completed!
          this.state = 'WAVE_CLEAR';
        }
      }
    }

    // Spawning targets
    this.spawnTimer += dt;
    if (this.spawnTimer >= wave.spawn_interval_ms) {
      this.spawnTimer = 0;
      this.spawnTarget();
    }

    // Update targets state
    for (let i = this.activeTargets.length - 1; i >= 0; i--) {
      const target = this.activeTargets[i];
      target.animTimer += dt;
      target.timer -= dt;

      if (target.timer <= 0) {
        // Target escaped/timed out
        if (target.type === 'outlaw' || target.type === 'fast_outlaw') {
          this.lives--;
          this.sfx.playHurt();
          if (this.lives <= 0) {
            this.state = 'GAME_OVER';
          }
        }
        this.activeTargets.splice(i, 1);
      }
    }
  }

  renderOverlayScreens() {
    const ctx = this.renderer.ctx;

    if (this.state === 'START_SCREEN') {
      ctx.fillStyle = 'rgba(13, 6, 3, 0.85)';
      ctx.fillRect(0, 0, 1024, 768);

      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 36px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WILD WEST LIGHT GUN ARCADE', 512, 280);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText('AIM & SHOOT OUTLAWS | SPARE CIVILIANS', 512, 360);
      ctx.fillText('SPACE OR ON-SCREEN BUTTON TO RELOAD', 512, 400);

      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.fillText('CLICK / TAP TO START GAME', 512, 500);
    } else if (this.state === 'WAVE_CLEAR') {
      ctx.fillStyle = 'rgba(13, 6, 3, 0.85)';
      ctx.fillRect(0, 0, 1024, 768);

      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 42px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WAVE CLEARED!', 512, 300);

      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.fillText(`CURRENT SCORE: ${this.score}`, 512, 380);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText('CLICK / TAP FOR NEXT WAVE', 512, 480);
    } else if (this.state === 'GAME_OVER') {
      ctx.fillStyle = 'rgba(13, 6, 3, 0.88)';
      ctx.fillRect(0, 0, 1024, 768);

      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 48px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 512, 280);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillText(`FINAL SCORE: ${this.score}`, 512, 360);
      ctx.fillText(`HIGH SCORE: ${this.highScore}`, 512, 400);

      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillText('CLICK / TAP TO RESTART', 512, 500);
    }
  }

  loop(timestamp) {
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    const wave = this.config ? (this.config.waves[this.currentWaveIndex] || this.config.waves[0]) : null;

    this.update(dt);

    this.renderer.render({
      score: this.score,
      highScore: this.highScore,
      lives: this.lives,
      ammo: this.ammo,
      clipSize: this.clipSize,
      isReloading: this.isReloading,
      waveName: wave ? wave.name : 'Wave 1',
      timeLeft: this.waveTimeLeft,
      crosshairX: this.crosshairX,
      crosshairY: this.crosshairY,
      activeTargets: this.activeTargets,
      bulletHoles: this.bulletHoles,
      recoilOffset: this.recoilOffset,
      muzzleFlashTimer: this.muzzleFlashTimer
    });

    this.renderOverlayScreens();

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.init();
});
