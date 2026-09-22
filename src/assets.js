export class PixelAssets {
  constructor() {
    this.outlawCanvas = this.createOutlawSprite();
    this.fastOutlawCanvas = this.createFastOutlawSprite();
    this.civilianCanvas = this.createCivilianSprite();
    this.crosshairCanvas = this.createCrosshairSprite();
    this.bulletHoleCanvas = this.createBulletHoleSprite();
  }

  createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  createOutlawSprite() {
    const { canvas, ctx } = this.createCanvas(60, 80);
    // Cowboy Hat (Brown/Dark Red)
    ctx.fillStyle = '#4a2511';
    ctx.fillRect(10, 8, 40, 8); // Hat brim
    ctx.fillRect(18, 0, 24, 10); // Hat crown
    ctx.fillStyle = '#b03a2e';
    ctx.fillRect(18, 7, 24, 3); // Hat band

    // Head
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(20, 16, 20, 16);

    // Sinister Eyes & Mask/Bandana
    ctx.fillStyle = '#1b2631';
    ctx.fillRect(23, 20, 4, 3);
    ctx.fillRect(33, 20, 4, 3);

    // Red Bandana over mouth
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(18, 26, 24, 10);
    ctx.fillRect(22, 36, 16, 6);

    // Vest & Shirt
    ctx.fillStyle = '#78281f';
    ctx.fillRect(14, 40, 32, 28); // Vest
    ctx.fillStyle = '#283747';
    ctx.fillRect(22, 42, 16, 26); // Shirt

    // Gun in hand
    ctx.fillStyle = '#515a5a';
    ctx.fillRect(44, 46, 14, 6); // Barrel
    ctx.fillRect(42, 50, 6, 10); // Grip

    return canvas;
  }

  createFastOutlawSprite() {
    const { canvas, ctx } = this.createCanvas(60, 80);
    // Black Hat
    ctx.fillStyle = '#1c2833';
    ctx.fillRect(8, 8, 44, 8);
    ctx.fillRect(16, 0, 28, 10);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(16, 7, 28, 3); // Gold band

    // Face
    ctx.fillStyle = '#edbb99';
    ctx.fillRect(20, 16, 20, 16);

    // Eyepatch & Angry Eyebrow
    ctx.fillStyle = '#17202a';
    ctx.fillRect(22, 18, 7, 7); // Patch
    ctx.fillRect(20, 20, 20, 2); // Strap
    ctx.fillRect(32, 19, 5, 3); // Right Eye

    // Mustache
    ctx.fillStyle = '#422517';
    ctx.fillRect(21, 28, 18, 4);

    // Coat (Dark Blue)
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(12, 38, 36, 32);

    // Guns (Dual guns)
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(2, 46, 12, 5); // Left gun
    ctx.fillRect(46, 46, 12, 5); // Right gun

    return canvas;
  }

  createCivilianSprite() {
    const { canvas, ctx } = this.createCanvas(60, 80);
    // Blonde Hair / Bonnet
    ctx.fillStyle = '#f4d03f';
    ctx.fillRect(16, 8, 28, 12);

    // Surprised Face
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(20, 18, 20, 16);

    // Big Surprised Eyes & Open Mouth
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(23, 21, 4, 4);
    ctx.fillRect(33, 21, 4, 4);
    ctx.fillStyle = '#78281f';
    ctx.fillRect(27, 28, 6, 5); // Open mouth 'O'

    // Dress / Apron
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(14, 38, 32, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 42, 20, 28); // White apron

    // Surrendered raised hands ("DON'T SHOOT!")
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(6, 16, 8, 22); // Left hand up
    ctx.fillRect(46, 16, 8, 22); // Right hand up

    return canvas;
  }

  createCrosshairSprite() {
    const { canvas, ctx } = this.createCanvas(32, 32);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;

    // Outer Circle
    ctx.beginPath();
    ctx.arc(16, 16, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair Lines
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(16, 8);
    ctx.moveTo(16, 24); ctx.lineTo(16, 32);
    ctx.moveTo(0, 16); ctx.lineTo(8, 16);
    ctx.moveTo(24, 16); ctx.lineTo(32, 16);
    ctx.stroke();

    // Center Dot
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(15, 15, 2, 2);

    return canvas;
  }

  createBulletHoleSprite() {
    const { canvas, ctx } = this.createCanvas(16, 16);
    ctx.fillStyle = '#17202a';
    ctx.beginPath();
    ctx.arc(8, 8, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#7f8c8d';
    ctx.lineWidth = 1;
    // Cracks
    ctx.beginPath();
    ctx.moveTo(8, 4); ctx.lineTo(8, 1);
    ctx.moveTo(8, 12); ctx.lineTo(8, 15);
    ctx.moveTo(4, 8); ctx.lineTo(1, 8);
    ctx.moveTo(12, 8); ctx.lineTo(15, 8);
    ctx.stroke();

    return canvas;
  }
}
