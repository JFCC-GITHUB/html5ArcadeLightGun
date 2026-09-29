import { PixelAssets } from './assets.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.internalWidth = 1024;
    this.internalHeight = 768;

    this.assets = new PixelAssets();
  }

  clear() {
    this.ctx.fillStyle = '#110803';
    this.ctx.fillRect(0, 0, this.internalWidth, this.internalHeight);
  }

  render(gameState) {
    this.clear();
    this.renderBackground(gameState.bgType || 'saloon');
    this.renderTargets(gameState.activeTargets);
    this.renderBulletHoles(gameState.bulletHoles);
    this.renderGunOverlay(gameState.recoilOffset, gameState.crosshairX, gameState.crosshairY);
    if (gameState.muzzleFlashTimer > 0) {
      this.renderMuzzleFlash(gameState.crosshairX, gameState.crosshairY);
    }
    this.renderCrosshair(gameState.crosshairX, gameState.crosshairY);
    this.renderHUD(gameState);
  }

  renderBackground(bgType = 'saloon') {
    if (bgType === 'bank') {
      this.renderBankBackground();
    } else if (bgType === 'train') {
      this.renderTrainBackground();
    } else if (bgType === 'hideout') {
      this.renderHideoutBackground();
    } else {
      this.renderSaloonBackground();
    }
  }

  renderSaloonBackground() {
    const ctx = this.ctx;

    // Sunset Sky
    const skyGradient = ctx.createLinearGradient(0, 0, 0, 280);
    skyGradient.addColorStop(0, '#d35400');
    skyGradient.addColorStop(0.6, '#e67e22');
    skyGradient.addColorStop(1, '#f39c12');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, this.internalWidth, 280);

    // Sun
    ctx.fillStyle = '#f39c12';
    ctx.beginPath();
    ctx.arc(512, 220, 60, 0, Math.PI * 2);
    ctx.fill();

    // Red Canyon Mountains
    ctx.fillStyle = '#78281f';
    ctx.beginPath();
    ctx.moveTo(0, 280);
    ctx.lineTo(120, 180);
    ctx.lineTo(280, 240);
    ctx.lineTo(450, 160);
    ctx.lineTo(650, 220);
    ctx.lineTo(850, 150);
    ctx.lineTo(1024, 260);
    ctx.lineTo(1024, 280);
    ctx.closePath();
    ctx.fill();

    // Dusty Ground
    ctx.fillStyle = '#8c4e2b';
    ctx.fillRect(0, 280, this.internalWidth, 488);

    // Wooden Saloon Building
    ctx.fillStyle = '#4a2511';
    ctx.fillRect(160, 100, 704, 480);

    ctx.strokeStyle = '#2d160a';
    ctx.lineWidth = 2;
    for (let py = 120; py < 580; py += 18) {
      ctx.beginPath();
      ctx.moveTo(160, py);
      ctx.lineTo(864, py);
      ctx.stroke();
    }

    // Roof Trim & Signboard
    ctx.fillStyle = '#271207';
    ctx.fillRect(145, 80, 734, 24);
    ctx.fillStyle = '#d68910';
    ctx.fillRect(340, 50, 344, 48);
    ctx.strokeStyle = '#271207';
    ctx.lineWidth = 4;
    ctx.strokeRect(340, 50, 344, 48);

    ctx.fillStyle = '#271207';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ RED CANYON SALOON ★', 512, 82);

    // Balcony Railing
    ctx.fillStyle = '#2d160a';
    ctx.fillRect(160, 275, 704, 16);
    ctx.fillStyle = '#5c2c16';
    for (let rx = 175; rx < 860; rx += 28) {
      ctx.fillRect(rx, 235, 6, 40);
    }

    // Doors & Windows
    ctx.fillStyle = '#120803';
    ctx.fillRect(235, 190, 70, 90);
    ctx.fillRect(715, 190, 70, 90);
    ctx.fillRect(472, 250, 80, 100);
    ctx.fillRect(195, 430, 80, 120);
    ctx.fillRect(749, 430, 80, 120);

    // Barrels & Wagon Wheel
    this.renderBarrel(370, 470);
    this.renderBarrel(580, 470);
  }

  renderBankBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#243342';
    ctx.fillRect(0, 0, this.internalWidth, this.internalHeight);

    // Steel Pillars
    ctx.fillStyle = '#34495e';
    ctx.fillRect(100, 80, 80, 580);
    ctx.fillRect(844, 80, 80, 580);

    // Vault Door Frame
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(180, 100, 664, 480);
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 4;
    ctx.strokeRect(180, 100, 664, 480);

    // Iron Vault Door
    ctx.fillStyle = '#7f8c8d';
    ctx.beginPath(); ctx.arc(512, 340, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34495e';
    ctx.beginPath(); ctx.arc(512, 340, 110, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.arc(512, 340, 32, 0, Math.PI * 2); ctx.fill();

    // Gold Stacks
    for (let gx = 300; gx < 420; gx += 35) {
      for (let gy = 500; gy < 550; gy += 15) {
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(gx, gy, 30, 12);
      }
    }

    // Cover Openings
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(235, 190, 70, 90);
    ctx.fillRect(715, 190, 70, 90);
    ctx.fillRect(472, 250, 80, 100);
    ctx.fillRect(195, 430, 80, 120);
    ctx.fillRect(749, 430, 80, 120);
  }

  renderTrainBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(0, 0, this.internalWidth, 250);
    ctx.fillStyle = '#d35400';
    ctx.fillRect(0, 250, this.internalWidth, 150);

    // Prairie Ground
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(0, 400, this.internalWidth, 368);

    // Iron Tracks
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(0, 530, this.internalWidth, 16);
    ctx.fillRect(0, 560, this.internalWidth, 16);

    // Train Car Interior
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(140, 100, 744, 440);
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(120, 80, 784, 30);

    ctx.fillStyle = '#1a0e07';
    ctx.fillRect(235, 190, 70, 90);
    ctx.fillRect(715, 190, 70, 90);
    ctx.fillRect(472, 250, 80, 100);
    ctx.fillRect(195, 430, 80, 120);
    ctx.fillRect(749, 430, 80, 120);
  }

  renderHideoutBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0914';
    ctx.fillRect(0, 0, this.internalWidth, this.internalHeight);

    ctx.fillStyle = '#f4f6f7';
    ctx.beginPath(); ctx.arc(850, 120, 40, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#2e1a12';
    ctx.fillRect(160, 120, 704, 460);

    // Campfire
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(512, 510, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(512, 510, 12, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#06040a';
    ctx.fillRect(235, 190, 70, 90);
    ctx.fillRect(715, 190, 70, 90);
    ctx.fillRect(472, 250, 80, 100);
    ctx.fillRect(195, 430, 80, 120);
    ctx.fillRect(749, 430, 80, 120);
  }

  renderBarrel(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#6e3c1b';
    ctx.fillRect(x, y, 50, 70);
    ctx.fillStyle = '#3a539b'; // Iron bands
    ctx.fillRect(x, y + 10, 50, 6);
    ctx.fillRect(x, y + 54, 50, 6);
    ctx.strokeStyle = '#271207';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 50, 70);
  }

  renderTargets(targets) {
    const ctx = this.ctx;

    targets.forEach((target) => {
      let sprite;
      if (target.type === 'outlaw') {
        sprite = this.assets.outlawCanvas;
      } else if (target.type === 'fast_outlaw') {
        sprite = this.assets.fastOutlawCanvas;
      } else {
        sprite = this.assets.civilianCanvas;
      }

      // Calculate emergence animation position
      const popRatio = Math.min(1, target.animTimer / target.animDuration);
      const renderY = target.y + target.height * (1 - popRatio);
      const visibleHeight = target.height * popRatio;

      ctx.save();
      // Clip to cover box bounds so targets pop up out of doors/windows/balcony
      ctx.beginPath();
      ctx.rect(target.x - 5, target.y - 10, target.width + 10, target.height + 15);
      ctx.clip();

      ctx.drawImage(
        sprite,
        0, 0, sprite.width, Math.max(1, (sprite.height * visibleHeight) / target.height),
        target.x, renderY, target.width, visibleHeight
      );

      ctx.restore();
    });
  }

  renderBulletHoles(bulletHoles) {
    const ctx = this.ctx;
    const holeSprite = this.assets.bulletHoleCanvas;

    bulletHoles.forEach((hole) => {
      ctx.drawImage(holeSprite, hole.x - 8, hole.y - 8);
    });
  }

  renderGunOverlay(recoilOffset, crosshairX, crosshairY) {
    const ctx = this.ctx;
    const targetX = crosshairX !== null && crosshairX !== undefined ? crosshairX : 512;
    const targetY = crosshairY !== null && crosshairY !== undefined ? crosshairY : 384;

    const baseX = 512 + (targetX - 512) * 0.35;
    const baseY = 750 + recoilOffset * 0.5;

    const dx = targetX - baseX;
    const dy = targetY - baseY;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    const maxAngle = (40 * Math.PI) / 180;
    angle = Math.max(-maxAngle, Math.min(maxAngle, angle));
    const recoilTilt = -((recoilOffset * 0.8) * Math.PI) / 180;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(angle + recoilTilt);
    ctx.scale(1.1, 1.1);

    // Revolver Shadow
    ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
    ctx.fillRect(-22, -185, 44, 150);

    // Metallic Steel Barrel
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-18, -180, 36, 140);
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(-12, -180, 8, 140);
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(-4, -180, 4, 140);

    // Front Sight & Fiber Optic Tip
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(-5, -192, 10, 14);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-3, -190, 6, 8);

    // Cylinder Frame & Ejector
    ctx.fillStyle = '#34495e';
    ctx.fillRect(-20, -50, 40, 10);
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(-34, -40, 68, 55);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-30, -36, 60, 47);
    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-30, -36, 60, 47);

    // Chambers
    for (let i = 0; i < 5; i++) {
      const cx = -22 + i * 11;
      ctx.fillStyle = '#111827';
      ctx.fillRect(cx - 3, -32, 6, 39);
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(cx, -12, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Polished Wooden Grip
    ctx.fillStyle = '#6e3c1b';
    ctx.beginPath();
    ctx.moveTo(-24, 25);
    ctx.lineTo(24, 25);
    ctx.lineTo(32, 95);
    ctx.lineTo(-32, 95);
    ctx.closePath();
    ctx.fill();

    // Brass Star Medallion
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(0, 58, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderMuzzleFlash(x, y) {
    const ctx = this.ctx;

    // Flash Starburst at crosshair location
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(x, y, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  renderCrosshair(x, y) {
    if (x === null || y === null) return;
    const ctx = this.ctx;
    const sprite = this.assets.crosshairCanvas;
    ctx.drawImage(sprite, x - 16, y - 16);
  }

  renderHUD(gameState) {
    const ctx = this.ctx;

    // Top HUD Bar Background
    ctx.fillStyle = 'rgba(26, 12, 2, 0.85)';
    ctx.fillRect(0, 0, this.internalWidth, 54);
    ctx.strokeStyle = '#c85a17';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, this.internalWidth, 54);

    // Score & High Score
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${gameState.score || 0}`, 15, 34);
    ctx.fillText(`HIGH: ${gameState.highScore || 0}`, 160, 34);

    // Round / Wave Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${gameState.waveName || 'WAVE 1'}`, this.internalWidth / 2, 34);

    // Health / Lives
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'right';
    let livesText = 'HP: ';
    for (let i = 0; i < (gameState.lives || 0); i++) livesText += '♥ ';
    ctx.fillText(livesText, this.internalWidth - 150, 34);

    // Timer
    ctx.textAlign = 'right';
    ctx.fillStyle = gameState.timeLeft <= 5 ? '#e74c3c' : '#2ecc71';
    ctx.fillText(`TIME: ${gameState.timeLeft || 0}s`, this.internalWidth - 15, 34);

    // Bottom Ammo UI Bar & Reload Prompt
    const ammoY = this.internalHeight - 45;
    ctx.fillStyle = 'rgba(26, 12, 2, 0.85)';
    ctx.fillRect(10, ammoY, 220, 36);
    ctx.strokeStyle = '#c85a17';
    ctx.strokeRect(10, ammoY, 220, 36);

    // Bullet Icons
    ctx.fillStyle = '#f39c12';
    for (let i = 0; i < gameState.clipSize; i++) {
      if (i < gameState.ammo) {
        ctx.fillRect(20 + i * 28, ammoY + 6, 14, 22); // Bullet chamber filled
      } else {
        ctx.strokeStyle = '#7f8c8d'; // Empty slot outline
        ctx.strokeRect(20 + i * 28, ammoY + 6, 14, 22);
      }
    }

    if (gameState.isReloading) {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RELOADING...', this.internalWidth / 2, this.internalHeight - 190);
    } else if (gameState.ammo === 0) {
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS SPACE OR TAP HERE TO RELOAD!', this.internalWidth / 2, this.internalHeight - 190);
    }

    // Touch Screen Reload Button Box (for Mobile / Touch)
    ctx.fillStyle = 'rgba(192, 57, 43, 0.85)';
    ctx.fillRect(this.internalWidth - 160, this.internalHeight - 60, 150, 50);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.internalWidth - 160, this.internalHeight - 60, 150, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RELOAD ⟳', this.internalWidth - 85, this.internalHeight - 28);
  }
}
