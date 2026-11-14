import { TUNING, CAB_FROM_X, clamp } from '../constants.js';
import { STATIONS, REST_SPOTS } from '../train/stations.js';
import { Affordances } from './affordances.js';

// Stepping up into the cab swings the camera to the forward driving view on
// its own — no button. Hysteresis keeps it from flapping at the threshold:
// you cross ENTER walking in, and must fall back past the lower EXIT (just
// outside the rear doorway, well ahead of the camera eye) to drop back to
// the travelling cutaway.
const CABIN_ENTER_X = CAB_FROM_X + 0.9; // ~13.5: just inside the cab doorway
const CABIN_EXIT_X = CAB_FROM_X - 0.6; // ~12.0: back out onto the rooftop walk

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
    this.toldCabinView = false;
    player.camera = rig.camera;
    this.affordances = new Affordances(train, rig.camera);
  }

  #findStation() {
    if (this.player.climbing) return null;
    for (const s of STATIONS) {
      if (s.level === this.player.level && Math.abs(this.player.x - s.x) < s.radius) return s;
    }
    return null;
  }

  update(dt, input) {
    this.#act(dt, input);
    const { rig, player } = this;
    const walking = (rig.mode === 'inhabit' || rig.mode === 'cabin') && !rig.busy && !rig.soft;
    const active = rig.mode === 'cabin' ? STATIONS[0] : this.activeStation;
    this.affordances.update(dt, walking, walking ? active : null, player);
  }

  #ladderHint() {
    const { player, ui } = this;
    const ladder = player.climbing ? null : player.nearestLadder();
    const at = ladder ? ladder.levels.indexOf(player.level) : -1;
    if (at < 0) {
      ui.hidePrompt();
      return;
    }
    const up = at < ladder.levels.length - 1;
    const down = at > 0;
    if (this.hintUp !== up || this.hintDown !== down) {
      this.hintUp = up;
      this.hintDown = down;
      const way = up && down ? 'up or down' : up ? 'up' : 'down';
      const how = ui.isTouch
        ? `tap ${up && down ? 'top or bottom' : up ? 'top' : 'bottom'} centre`
        : up && down ? 'W / S' : up ? 'W' : 'S';
      this.hint = `ladder — ${how} to climb ${way}`;
    }
    ui.showPrompt(this.hint, null, true);
  }

  #act(dt, input) {
    const { rig, train, player, ui } = this;
    player.action = null;

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

    if (rig.mode === 'cabin') {
      // walking back out the rear doorway returns to the travelling cutaway
      if (player.level !== 'roof' || player.x < CABIN_EXIT_X || input.pressed('Escape')) {
        rig.exitCabin();
        ui.hidePrompt();
        return;
      }
      if (!this.toldCabinView) {
        this.toldCabinView = true;
        ui.toast(
          ui.isTouch
            ? 'ride up front — hold left to step back out of the cab'
            : 'ride up front — walk left to step out of the cab',
          4800
        );
      }
      ui.showPrompt(train.route.length ? 're-plot the route' : 'plot the route', null);
      if (input.pressed('KeyE') && rig.enterMap()) {
        player.takeWheel();
        this.audio.chime('rise');
      }
      return;
    }

    // --- inhabit mode ---
    // walking up into the cab swings the camera into the forward driving view
    if (player.level === 'roof' && !player.climbing && player.x >= CABIN_ENTER_X && rig.enterCabin()) {
      this.audio.chime('rise');
      return;
    }

    const s = this.#findStation();
    if (!s) {
      this.activeStation = null;
      this.#ladderHint();
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
          player.takeWheel();
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
          player.sit(spot.pose, s.id);
          this.restExit = spot.exit;
          ui.setReadingLine(spot.line);
          this.audio.chime('soft');
          ui.toast(
            ui.isTouch
              ? 'drag to look around · orbit & exit wait top-right'
              : 'drag to look · scroll to drift closer · O for gentle orbit',
            5200
          );
        }
        break;
      }
      case 'engine': {
        const full = train.eff >= 99.5;
        if (full) {
          ui.showPrompt('the engine hums, content', null, true);
        } else {
          if (holding) {
            player.action = s.id;
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
            player.action = s.id;
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
            player.action = s.id;
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
