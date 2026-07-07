// Keyboard + pointer-lock mouse input. In test mode the pointer lock is
// skipped and keys/look can be driven programmatically.
const KEYMAP = {
  KeyW: 'w', ArrowUp: 'w',
  KeyA: 'a', ArrowLeft: 'a',
  KeyS: 's', ArrowDown: 's',
  KeyD: 'd', ArrowRight: 'd',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  Space: 'space',
  KeyE: 'e', KeyF: 'f', KeyQ: 'q', KeyH: 'h', KeyV: 'v', KeyJ: 'j', KeyR: 'r', Tab: 'j', F3: 'f3',
  Escape: 'esc'
};

export class Input {
  constructor(testMode) {
    this.testMode = testMode;
    this.keys = new Set();
    this.edge = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.locked = false;
    this.wantLock = false;
    this.onLockChange = null;
    this.onLockError = null;
    this.lockErrors = 0;
    this.dragLook = false;      // fallback when the browser refuses pointer lock
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      if (e.code === 'F3' || e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(k)) this.edge.add(k);
      this.keys.add(k);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (this.locked || this.testMode) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      } else if (this.dragLook && this._dragging) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (this.dragLook && e.button === 0) this._dragging = true;
    });
    addEventListener('mouseup', () => { this._dragging = false; });
    addEventListener('blur', () => { this._dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      this._pending = false;
      if (this.locked) {
        this.everLocked = true;
        this.lockErrors = 0;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this._pending = false;
      // browsers with the promise API already report failures there
      if (!this._promiseApi) this._softFail('event');
    });
  }

  _softFail(stage, msg = '') {
    this.lockErrors++;
    if (this.diag) this.diag('lock-fail', { stage, err: msg });
    if (this.onLockError) this.onLockError(this.lockErrors, !!this.everLocked);
  }

  _request(el, withOpts) {
    this._pending = true;
    if (this.diag) this.diag('lock-attempt', { withOpts });
    const done = () => { this._pending = false; };
    const onErr = (err) => {
      done();
      const msg = String((err && err.message) || err || '');
      if (/pending/i.test(msg)) return;                    // benign double-request race
      if (withOpts && /unadjusted|support/i.test(msg)) {   // retry without raw input
        this._request(el, false);
        return;
      }
      this._softFail(withOpts ? 'opt' : 'plain', msg);
    };
    try {
      const p = withOpts ? el.requestPointerLock({ unadjustedMovement: true }) : el.requestPointerLock();
      if (p && p.then) {
        this._promiseApi = true;
        p.then(done, onErr);
      } else {
        done();
      }
    } catch (err) {
      onErr(err);
    }
  }

  lock(el) {
    if (this.testMode || this.dragLook) return;
    this.wantLock = true;
    this._lockEl = el;
    if (this.locked || this._pending) return;   // single-flight: never race requests
    this._request(el, true);
    // Chrome enforces a ~1.3s cooldown after ESC releases the pointer;
    // retry once past it so RESUME always works.
    clearTimeout(this._lockRetry);
    this._lockRetry = setTimeout(() => {
      if (!this.locked && this.wantLock && !this.dragLook && !this._pending) this._request(el, true);
    }, 1600);
  }

  unlockIntent() { this.wantLock = false; }

  held(k) { return this.keys.has(k); }
  pressed(k) { return this.edge.has(k); }

  consumeMouse() {
    const r = [this.mdx, this.mdy];
    this.mdx = 0; this.mdy = 0;
    return r;
  }

  endFrame() { this.edge.clear(); }

  // --- test hooks ---
  testSetKeys(map) {
    for (const [k, v] of Object.entries(map)) {
      if (v) { if (!this.keys.has(k)) this.edge.add(k); this.keys.add(k); }
      else this.keys.delete(k);
    }
  }
  testPress(k) { this.edge.add(k); this.keys.add(k); setTimeout(() => this.keys.delete(k), 50); }
}
