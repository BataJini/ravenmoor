// All DOM overlay work: title, HUD, prompts, toasts, panels, pause menu.
const $ = (id) => document.getElementById(id);

const QUALITY_NAMES = ['LOW', 'MEDIUM', 'HIGH'];

export class UI {
  constructor() {
    this.hud = $('hud');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.whisperEl = $('whisper');
    this.soulEl = $('soulcount');
    this.panelEl = $('panel');
    this.panelTitle = $('panel-title');
    this.panelBody = $('panel-body');
    this.titleEl = $('title');
    this.pauseEl = $('pause');
    this.fadeEl = $('fade');
    this.fpsEl = $('fps');
    this.rideEl = $('ridehint');
    this.compassTape = document.querySelector('#compass .tape');

    this._toastTimer = null;
    this._whisperTimer = null;
    this._buildCompass();

    this.panelEl.addEventListener('click', () => this.closePanel());

    // pause menu buttons
    this.onResume = null;
    this.onQuality = null;   // returns new quality index
    this.onSound = null;     // returns muted?
    this.onBob = null;       // returns bob on?
    this.onFullscreen = null;
    $('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    $('btn-fullscreen').addEventListener('click', () => this.onFullscreen && this.onFullscreen());
    $('btn-quality').addEventListener('click', () => {
      if (!this.onQuality) return;
      const q = this.onQuality();
      $('btn-quality').textContent = `QUALITY — ${QUALITY_NAMES[q]}`;
    });
    $('btn-sound').addEventListener('click', () => {
      if (!this.onSound) return;
      const muted = this.onSound();
      $('btn-sound').textContent = `SOUND — ${muted ? 'OFF' : 'ON'}`;
    });
    $('btn-bob').addEventListener('click', () => {
      if (!this.onBob) return;
      const on = this.onBob();
      $('btn-bob').textContent = `VIEW SWAY — ${on ? 'ON' : 'OFF'}`;
    });
    this.onMouseMode = null;
    $('btn-mouse').addEventListener('click', () => {
      if (!this.onMouseMode) return;
      const drag = this.onMouseMode();
      $('btn-mouse').textContent = `MOUSE — ${drag ? 'DRAG TO LOOK' : 'CAPTURED'}`;
    });
    let resetArmed = false;
    $('btn-reset').addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        $('btn-reset').textContent = 'FORGET EVERYTHING? CLICK AGAIN';
        setTimeout(() => {
          resetArmed = false;
          $('btn-reset').textContent = 'BEGIN THE TALE ANEW';
        }, 3500);
        return;
      }
      try {
        localStorage.removeItem('ravenmoor.souls');
        localStorage.removeItem('ravenmoor.rest');
        localStorage.removeItem('ravenmoor.journal');
      } catch { /* nothing to forget */ }
      location.reload();
    });
  }

  _buildCompass() {
    const marks = ['N', '·', 'E', '·', 'S', '·', 'W', '·'];
    let html = '';
    for (let rep = 0; rep < 3; rep++) {
      for (const m of marks) {
        html += `<span style="display:inline-block;width:90px;text-align:center;">${m === '·' ? m : `<b>${m}</b>`}</span>`;
      }
    }
    this.compassTape.innerHTML = html;
  }

  setCompass(yaw) {
    let deg = (-yaw * 180 / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const x = 170 - 45 - (deg / 45) * 90 - 720;
    this.compassTape.style.transform = `translateX(${x}px)`;
  }

  setQualityLabel(q) {
    $('btn-quality').textContent = `QUALITY — ${QUALITY_NAMES[q]}`;
  }

  showTitle(onStart) {
    const handler = () => {
      this.titleEl.removeEventListener('click', handler);
      onStart();
    };
    this.titleEl.addEventListener('click', handler);
  }

  begin() {
    this.titleEl.classList.add('off');
    // dramatic entrance: snap to black, then fade into the moor
    const f = this.fadeEl;
    f.style.transition = 'none';
    f.style.opacity = '1';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 1.6s ease';
      f.style.opacity = '0';
    });
    this.hud.classList.add('on');
  }

  prompt(primary, secondary) {
    if (!primary && !secondary) {
      if (this.promptEl.innerHTML) this.promptEl.innerHTML = '';
      return;
    }
    let html = '';
    if (primary) html += `<span class="key">E</span> ${primary}`;
    if (secondary) html += `${primary ? ' &nbsp;·&nbsp; ' : ''}<span class="key">F</span> ${secondary}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
  }

  toast(msg, dur = 3600) {
    clearTimeout(this._toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, dur);
  }

  whisper(text) {
    clearTimeout(this._whisperTimer);
    this.whisperEl.textContent = text;
    this.whisperEl.style.color = 'rgba(165,175,195,0.85)';
    this._whisperTimer = setTimeout(() => {
      this.whisperEl.style.color = 'rgba(165,175,195,0)';
    }, 2600);
  }

  setSouls(n, total) {
    this.soulEl.textContent = `✦ ${n} / ${total}`;
    this.soulEl.style.transition = 'none';
    this.soulEl.style.textShadow = '0 0 22px rgba(159,212,255,0.95), 0 1px 3px #000';
    requestAnimationFrame(() => {
      this.soulEl.style.transition = 'text-shadow 1.2s ease';
      this.soulEl.style.textShadow = '0 0 10px rgba(120,180,230,0.5), 0 1px 3px #000';
    });
  }

  panel(title, body) {
    this._dlg = null;
    this.panelTitle.textContent = title;
    this.panelBody.textContent = body;
    this.panelEl.classList.add('on');
  }

  // Sequential dialogue: E advances through lines, then closes.
  dialogue(name, lines, onDone) {
    this._dlg = { name, lines, i: 0, onDone };
    this.panelTitle.textContent = name;
    this.panelBody.textContent = lines[0];
    this.panelEl.classList.add('on');
  }

  advancePanel() {
    if (this._dlg) {
      this._dlg.i++;
      if (this._dlg.i < this._dlg.lines.length) {
        this.panelBody.textContent = this._dlg.lines[this._dlg.i];
        return;
      }
      const done = this._dlg.onDone;
      this._dlg = null;
      this.closePanel();
      if (done) done();
      return;
    }
    this.closePanel();
  }

  isPanelOpen() { return this.panelEl.classList.contains('on'); }
  closePanel() { this.panelEl.classList.remove('on'); this._dlg = null; }

  // ---- juice ----
  flash(strength = 1) {
    const f = $('flash');
    f.style.transition = 'none';
    f.style.opacity = String(Math.min(1, strength));
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.9s ease';
      f.style.opacity = '0';
    });
  }

  achievement(text) {
    const a = $('achv');
    a.innerHTML = `❧ &nbsp;ACHIEVEMENT · <b>${text}</b>`;
    a.classList.add('on');
    clearTimeout(this._achvT);
    this._achvT = setTimeout(() => a.classList.remove('on'), 4600);
  }

  raceHud(show, time = 0, gates = 0, total = 5) {
    const r = $('race');
    r.style.display = show ? 'block' : 'none';
    if (show) {
      $('race-time').textContent = time.toFixed(1) + 's';
      $('race-gates').textContent = `GATES ${gates} / ${total}`;
    }
  }

  toggleJournal(html) {
    const j = $('journal');
    const on = j.classList.toggle('on');
    if (on && html) $('journal-body').innerHTML = html;
    return on;
  }
  isJournalOpen() { return $('journal').classList.contains('on'); }
  closeJournal() { $('journal').classList.remove('on'); }

  rideHint(show) { this.rideEl.style.display = show ? 'block' : 'none'; }

  clickHint(show, dragMode = false) {
    const el = $('clicklock');
    const want = show ? 'block' : 'none';
    if (el.style.display !== want) el.style.display = want;
    if (show) {
      const text = dragMode ? 'HOLD THE MOUSE AND DRAG TO LOOK' : 'CLICK TO TAKE THE REINS';
      if (el.textContent !== text) el.textContent = text;
    }
  }

  setMouseModeLabel(drag) {
    $('btn-mouse').textContent = `MOUSE — ${drag ? 'DRAG TO LOOK' : 'CAPTURED'}`;
  }

  showPause() { this.pauseEl.classList.add('on'); }
  hidePause() { this.pauseEl.classList.remove('on'); }
  isPaused() { return this.pauseEl.classList.contains('on'); }

  setFps(text) {
    if (this.fpsEl.style.display !== 'none') this.fpsEl.textContent = text;
  }
  toggleFps() {
    const on = this.fpsEl.style.display === 'block';
    this.fpsEl.style.display = on ? 'none' : 'block';
    return !on;
  }
  showFps() { this.fpsEl.style.display = 'block'; }
}
