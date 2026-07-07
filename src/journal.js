// The Parish Journal: quests, collectibles, achievements — and the ledger
// that persists them.
const ACHIEVEMENTS = {
  firstlight: 'FIRST LIGHT',
  halfparish: 'HALF THE PARISH',
  thirteenth: 'THE THIRTEENTH HOUR',
  bellringer: 'BELLRINGER',
  gravefriend: 'THE GRAVEKEEPER’S FRIEND',
  wellshod: 'WELL SHOD',
  outrun: 'OUTRUN THE DEAD',
  whisperer: 'HORSE WHISPERER',
  reader: 'LATE READER',
  oldrites: 'OLD RITES',
  sexton: 'THE SEXTON’S SECRET',
  bones: 'KEEPER OF BONES',
  sixravens: 'SIX SILVER RAVENS'
};

export class Journal {
  constructor(ui, audio, persist) {
    this.ui = ui;
    this.audio = audio;
    this.persist = persist;
    this.ach = new Set();
    this.flags = {};
    this.ravens = new Set();
    this.counters = { epitaphs: 0, pets: 0 };
    this.petted = new Set();
    if (persist) {
      try {
        const d = JSON.parse(localStorage.getItem('ravenmoor.journal') || '{}');
        (d.ach || []).forEach(a => this.ach.add(a));
        this.flags = d.flags || {};
        (d.ravens || []).forEach(r => this.ravens.add(r));
        this.counters = Object.assign(this.counters, d.counters || {});
        (d.petted || []).forEach(p => this.petted.add(p));
      } catch { /* fresh book */ }
    }
  }

  award(id) {
    if (this.ach.has(id) || !ACHIEVEMENTS[id]) return false;
    this.ach.add(id);
    this.ui.achievement(ACHIEVEMENTS[id]);
    this.audio.achievement();
    this._save();
    return true;
  }

  setFlag(k, v = true) { this.flags[k] = v; this._save(); }
  getFlag(k) { return !!this.flags[k]; }

  readEpitaph() {
    this.counters.epitaphs++;
    if (this.counters.epitaphs >= 10) this.award('reader');
    this._save();
  }

  pet(name) {
    this.petted.add(name);
    if (this.petted.size >= 3) this.award('whisperer');
    this._save();
  }

  foundRaven(id) {
    if (this.ravens.has(id)) return false;
    this.ravens.add(id);
    if (this.ravens.size >= 6) this.award('sixravens');
    this._save();
    return true;
  }

  html(state) {
    const q = (done, text) => `<div class="q ${done ? 'done' : ''}">${done ? '✓' : '◦'} &nbsp;${text}</div>`;
    let h = '<h4>THE TALE</h4>';
    h += q(state.souls >= 13, `Gather the thirteen lost souls — <b>${state.souls} / 13</b>`);
    h += q(state.finaleDone, 'Ring the bell of Ravenmoor and send them home');
    h += '<h4>THE PARISH ASKS</h4>';
    h += q(this.getFlag('shovelDone'), 'Mordecai the gravekeeper misses his shovel (last seen near the well)');
    h += q(this.getFlag('shoeDone'), 'Elke needs Ashfall’s horseshoe, lost on the east road');
    h += q(this.getFlag('raceWon'), 'Outrun Wraith from the gravegate to the cathedral (speak to Elke)');
    h += q(this.getFlag('ritualDone'), 'Light all five braziers of the stone circle, southwest, and see what comes');
    h += q(this.getFlag('cryptOpen'), 'The Bone Chapel behind the cathedral answers only to the Sexton’s Locket');
    h += '<h4>COLLECTIONS</h4>';
    h += q(this.ravens.size >= 6, `Silver ravens — <b>${this.ravens.size} / 6</b> &nbsp;<span style="color:#6e6754">(rafters, rooftops, and other places crows admire)</span>`);
    h += q(this.counters.epitaphs >= 10, `Epitaphs read — <b>${Math.min(this.counters.epitaphs, 15)} / 15</b>`);
    h += q(this.petted.size >= 3, `Horses befriended — <b>${this.petted.size} / 3</b>`);
    h += '<h4>ACHIEVEMENTS</h4><div>';
    for (const [id, name] of Object.entries(ACHIEVEMENTS)) {
      h += `<span class="ach ${this.ach.has(id) ? 'got' : ''}">${name}</span>`;
    }
    h += '</div>';
    return h;
  }

  _save() {
    if (!this.persist) return;
    try {
      localStorage.setItem('ravenmoor.journal', JSON.stringify({
        ach: [...this.ach],
        flags: this.flags,
        ravens: [...this.ravens],
        counters: this.counters,
        petted: [...this.petted]
      }));
    } catch { /* private mode */ }
  }
}
