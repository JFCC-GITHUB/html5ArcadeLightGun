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
    this.renderBackground();
    this.renderTargets(gameState.activeTargets);
    this.renderBulletHoles(gameState.bulletHoles);
    this.renderGunOverlay(gameState.recoilOffset);
    if (gameState.muzzleFlashTimer > 0) {
      this.renderMuzzleFlash(gameState.crosshairX, gameState.crosshairY);
    }
    this.renderCrosshair(gameState.crosshairX, gameState.crosshairY);
    this.renderHUD(gameState);
  }

  renderBackground() {
    const ctx = this.ctx;

    // Sky Gradient (Dusty Desert Sunset)
    const skyGradient = ctx.createLinearGradient(0, 0, 0, 350);
    skyGradient.addColorStop(0, '#d35400');
    skyGradient.addColorStop(0.6, '#e67e22');
    skyGradient.addColorStop(1, '#f39c12');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, this.internalWidth, 350);

    // Distant Red Rock Mesa / Mountains
    ctx.fillStyle = '#78281f';
    ctx.beginPath();
    ctx.moveTo(0, 350);
    ctx.lineTo(80, 280);
    ctx.lineTo(200, 280);
    ctx.lineTo(300, 350);
    ctx.lineTo(550, 310);
    ctx.lineTo(700, 310);
    ctx.lineTo(850, 350);
    ctx.lineTo(1024, 320);
    ctx.lineTo(1024, 350);
    ctx.closePath();
    ctx.fill();

    // Desert Dirt Ground
    ctx.fillStyle = '#5c2c16';
    ctx.fillRect(0, 350, this.internalWidth, this.internalHeight - 350);

    // Dirt trails / tracks
    ctx.strokeStyle = '#3e1d0e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 390); ctx.lineTo(900, 390);
    ctx.moveTo(50, 420); ctx.lineTo(950, 420);
    ctx.stroke();

    // Saloon Main Structure (2-Story Wooden Building)
    const saloonX = 180;
    const saloonY = 120;
    const saloonW = 664;
    const saloonH = 460;

    // Dark Wood Planks
    ctx.fillStyle = '#4a2511';
    ctx.fillRect(saloonX, saloonY, saloonW, saloonH);

    // Horizontal Plank Details
    ctx.strokeStyle = '#311709';
    ctx.lineWidth = 2;
    for (let py = saloonY + 20; py < saloonY + saloonH; py += 20) {
      ctx.beginPath();
      ctx.moveTo(saloonX, py);
      ctx.lineTo(saloonX + saloonW, py);
      ctx.stroke();
    }

    // Roof & Overhang Trim
    ctx.fillStyle = '#271207';
    ctx.fillRect(saloonX - 15, saloonY - 15, saloonW + 30, 20);

    // Saloon Signboard ("★ SALOON ★")
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(saloonX + 180, saloonY - 45, 304, 40);
    ctx.strokeStyle = '#271207';
    ctx.lineWidth = 4;
    ctx.strokeRect(saloonX + 180, saloonY - 45, 304, 40);

    ctx.fillStyle = '#271207';
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ SALOON ★', saloonX + saloonW / 2, saloonY - 18);

    // Balcony Floor / Porch Divider
    ctx.fillStyle = '#311709';
    ctx.fillRect(saloonX - 10, saloonY + 160, saloonW + 20, 16);

    // Balcony Railing Posts
    ctx.fillStyle = '#5c2c16';
    for (let rx = saloonX; rx <= saloonX + saloonW; rx += 30) {
      ctx.fillRect(rx, saloonY + 120, 6, 40);
    }
    ctx.fillRect(saloonX, saloonY + 120, saloonW, 6);

    // Windows Top (Top Left & Top Right Covers)
    ctx.fillStyle = '#170b04';
    ctx.fillRect(240, 200, 60, 80); // Left Top Window
    ctx.fillRect(724, 200, 60, 80); // Right Top Window
    ctx.strokeStyle = '#271207';
    ctx.lineWidth = 4;
    ctx.strokeRect(240, 200, 60, 80);
    ctx.strokeRect(724, 200, 60, 80);

    // Doors Bottom (Left & Right Swinging Doors)
    ctx.fillStyle = '#170b04';
    ctx.fillRect(200, 440, 70, 110);
    ctx.fillRect(754, 440, 70, 110);

    // Barrels in front for cover
    this.renderBarrel(380, 460);
    this.renderBarrel(590, 460);
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

  renderGunOverlay(recoilOffset) {
    const ctx = this.ctx;
    const gunX = this.internalWidth / 2;
    const gunY = this.internalHeight + recoilOffset;

    // Revolver Barrel (Pixelized Arcade Style)
    ctx.fillStyle = '#34495e';
    ctx.fillRect(gunX - 16, gunY - 140, 32, 120);

    // Sight Tip
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(gunX - 4, gunY - 150, 8, 12);

    // Cylinder Base
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(gunX - 28, gunY - 40, 56, 50);

    // Cylinder Details
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(gunX - 20, gunY - 30, 10, 30);
    ctx.fillRect(gunX - 5, gunY - 30, 10, 30);
    ctx.fillRect(gunX + 10, gunY - 30, 10, 30);

    // Wooden Grip Bottom
    ctx.fillStyle = '#6e3c1b';
    ctx.fillRect(gunX - 22, gunY + 10, 44, 40);
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
