export class InputManager {
  constructor(canvas, internalWidth, internalHeight, callbacks) {
    this.canvas = canvas;
    this.internalWidth = internalWidth;
    this.internalHeight = internalHeight;
    this.callbacks = callbacks; // { onShoot, onReload, onMove }

    this.mouseX = internalWidth / 2;
    this.mouseY = internalHeight / 2;

    this.initEvents();
  }

  getScaledCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.internalWidth / rect.width;
    const scaleY = this.internalHeight / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
  }

  initEvents() {
    // Mouse movement
    window.addEventListener('mousemove', (e) => {
      const { x, y } = this.getScaledCoords(e.clientX, e.clientY);
      this.mouseX = x;
      this.mouseY = y;
      if (this.callbacks.onMove) this.callbacks.onMove(x, y);
    });

    // Mouse shoot click
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const { x, y } = this.getScaledCoords(e.clientX, e.clientY);

      // Check if clicked touch reload button area
      if (x >= this.internalWidth - 160 && y >= this.internalHeight - 60) {
        if (this.callbacks.onReload) this.callbacks.onReload();
      } else {
        if (this.callbacks.onShoot) this.callbacks.onShoot(x, y);
      }
    });

    // Touch screen tap / shoot / reload
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const { x, y } = this.getScaledCoords(touch.clientX, touch.clientY);
        this.mouseX = x;
        this.mouseY = y;

        if (x >= this.internalWidth - 160 && y >= this.internalHeight - 60) {
          if (this.callbacks.onReload) this.callbacks.onReload();
        } else {
          if (this.callbacks.onShoot) this.callbacks.onShoot(x, y);
        }
      }
    }, { passive: false });

    // Keyboard Spacebar Reload
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (this.callbacks.onReload) this.callbacks.onReload();
      }
    });
  }
}
