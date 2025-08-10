'use strict';

const Homey = require('homey');

class HaleyRuterApp extends Homey.App {
  async onInit() {
    // this.log('com.haleyproductions.ruter started');
    await this.#normalizeDefaults();
    const { stopId, stopName, lines } = this.getDefaults();
    // this.log('Defaults ->', { stopId, stopName, lines });
  }

  getDefaults() {
    const stopId = this.homey.settings.get('defaultStopId') || '';
    const stopName = this.homey.settings.get('defaultStopName') || '';
    const lines = this.#asStringArray(this.homey.settings.get('defaultLines'));
    return { stopId, stopName, lines };
  }

  async #normalizeDefaults() {
    const stopId = this.homey.settings.get('defaultStopId');
    const stopName = this.homey.settings.get('defaultStopName');
    const lines = this.#asStringArray(this.homey.settings.get('defaultLines'));

    let dirty = false;

    if (typeof stopId !== 'string') {
      this.homey.settings.set('defaultStopId', '');
      dirty = true;
    }
    if (typeof stopName !== 'string') {
      this.homey.settings.set('defaultStopName', '');
      dirty = true;
    }
    const uniqueSorted = Array.from(new Set(lines.map(String))).sort((a, b) =>
        a.localeCompare(b, 'nb', { numeric: true, sensitivity: 'base' })
    );
    if (JSON.stringify(uniqueSorted) !== JSON.stringify(lines)) {
      this.homey.settings.set('defaultLines', uniqueSorted);
      dirty = true;
    }

    // Initialize display defaults if missing
    if (this.homey.settings.get('defaultMaxResults') == null) {
      this.homey.settings.set('defaultMaxResults', 50);
      dirty = true;
    }
    if (this.homey.settings.get('defaultMinutesAhead') == null) {
      this.homey.settings.set('defaultMinutesAhead', 120);
      dirty = true;
    }
    if (!this.homey.settings.get('defaultDirection')) {
      this.homey.settings.set('defaultDirection', 'any');
      dirty = true;
    }
    if (!this.homey.settings.get('defaultTimeFormat')) {
      this.homey.settings.set('defaultTimeFormat', 'auto');
      dirty = true;
    }

    // if (dirty) this.log('Normalized default settings');
  }

  #asStringArray(val) {
    if (!Array.isArray(val)) return [];
    return val.map(v => String(v).trim()).filter(Boolean);
  }
}

module.exports = HaleyRuterApp;
