import { TUNING, clamp } from './constants.js';

// Stations live at train-local X positions on a given storey. One verb: E.
// Cab and book are taps; engine / treads / plants are gentle hold-to-tend.
const STATIONS = [
  { id: 'cab', x: 20.5, level: 'roof', radius: 3.0, label: 'take the wheel & plot the route' },
  { id: 'engine', x: -0.8, level: 'deck', radius: 3.2, label: 'tend the engine' },
  { id: 'plants', x: -12.4, level: 'deck', radius: 2.6, label: 'water the plants' },
  { id: 'book', x: -20.2, level: 'deck', radius: 2.6, label: 'sit & read awhile' },
  { id: 'rest', x: 20.1, level: 'deck', radius: 2.6, label: 'rest in the bunk' },
  { id: 'tread', x: 16.6, level: 'under', radius: 5.2, label: 'repair the treads' },
  { id: 'tread2', x: -16.6, level: 'under', radius: 5.2, label: 'repair the treads' },
];

// Both rest spots share the outside view; each has its own pose and verse.
const REST_SPOTS = {
  book: {
    pose: null, // player default: the reading chair
    line: '… the plains roll by, page after page …',
    exit: 'set the book down',
  },
  rest: {
    pose: { x: 20.1, y: 2.5, z: -1.05 },
    line: '… the carriages rumble on, somewhere beneath sleep …',
    exit: 'rise from the bunk',
  },
};

export class Interactions {
  constructor({ train, player, rig, ui, audio }) {
    this.train = train;
    this.player = player;
    this.rig = rig;
    this.ui = ui;
    this.audio = audio;
    this.activeStation = null;
    this.holdChimed = false;
    this.restExit = 'set the book down';
  }

  #findStation() {
    if (this.player.climbing) return null;
    for (const s of STATIONS) {
      if (s.level === this.player.level && Math.abs(this.player.x - s.x) < s.radius) return s;
    }
    return null;
  }

  update(dt, input) {
    const { rig, train, player, ui } = this;

    if (rig.busy) {
      ui.hidePrompt();
      return;
    }

    if (rig.mode === 'map') {
      ui.showPrompt('leave the cab — the train sets off', null);
      if (input.pressed('KeyE') || input.pressed('Escape')) {
        rig.exitMap();
        this.audio.chime('soft');
      }
      return;
    }

    if (rig.mode === 'book') {
      ui.showPrompt(this.restExit, null);
      if (input.pressed('KeyE') || input.pressed('Escape')) {
        player.stand();
        rig.exitBook();
      }
      return;
    }

    // --- inhabit mode ---
    const s = this.#findStation();
    if (!s) {
      this.activeStation = null;
      ui.hidePrompt();
      return;
    }
    if (this.activeStation !== s) {
      this.activeStation = s;
      this.holdChimed = false;
    }

    const holding = input.down('KeyE');
    const tapped = input.pressed('KeyE');

    switch (s.id) {
      case 'cab': {
        ui.showPrompt(s.label, null);
        if (tapped && rig.enterMap()) {
          this.audio.chime('rise');
          ui.firstCabVisit();
        }
        break;
      }
      case 'book':
      case 'rest': {
        ui.showPrompt(s.label, null);
        if (tapped && rig.enterBook()) {
          const spot = REST_SPOTS[s.id];
          player.sit(spot.pose);
          this.restExit = spot.exit;
          ui.setReadingLine(spot.line);
          this.audio.chime('soft');
          ui.toast('drag to look · scroll to drift closer · O for gentle orbit', 5200);
        }
        break;
      }
      case 'engine': {
        const full = train.eff >= 99.5;
        if (full) {
          ui.showPrompt('the engine hums, content', null, true);
        } else {
          if (holding) {
            train.eff = clamp(train.eff + TUNING.serviceRate * dt, 0, 100);
            this.audio.tendTick(dt);
            if (train.eff >= 99.5 && !this.holdChimed) {
              this.holdChimed = true;
              this.audio.chime('done');
              ui.toast('The engine glows — the train will glide now.');
            }
          }
          ui.showPrompt('hold — ' + s.label, train.eff / 100, false, holding);
        }
        break;
      }
      case 'tread':
      case 'tread2': {
        const full = train.wear <= 0.5;
        if (full) {
          ui.showPrompt('the treads are freshly trued', null, true);
        } else {
          if (holding) {
            train.wear = clamp(train.wear - TUNING.repairRate * dt, 0, 100);
            this.audio.tendTick(dt);
            if (train.wear <= 0.5 && !this.holdChimed) {
              this.holdChimed = true;
              this.audio.chime('done');
              ui.toast('Treads trued — she rolls easy again.');
            }
          }
          ui.showPrompt('hold — ' + s.label, (100 - train.wear) / 100, false, holding);
        }
        break;
      }
      case 'plants': {
        const full = train.plants >= 99.5;
        if (full) {
          ui.showPrompt('the plants are perky and pleased', null, true);
        } else {
          if (holding) {
            train.plants = clamp(train.plants + TUNING.waterRate * dt, 0, 100);
            this.audio.waterTick(dt);
            if (train.plants >= 99.5 && !this.holdChimed) {
              this.holdChimed = true;
              this.audio.chime('done');
              ui.toast('The leaves lift toward the window light.');
            }
          }
          ui.showPrompt('hold — ' + s.label, train.plants / 100, false, holding);
        }
        break;
      }
    }
  }
}
