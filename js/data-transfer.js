/**
 * Data export and import.
 *
 * Free Bird has no account, so there is no server that could move your history
 * to another device for you. That is a deliberate trade: the price of nothing
 * leaving the device is that nothing arrives on a new one either.
 *
 * This module is the escape hatch. It writes a plain JSON file you can read in
 * a text editor, keep, or move to another browser, and reads one back. The
 * transfer happens entirely inside the page: the file is built in memory and
 * handed to the browser's own download mechanism, and an imported file is read
 * with FileReader. No request is made and no third party is involved.
 *
 * What is exported is exactly what is stored, and no more: preferences, the
 * current session, check-in history, and the conversation only if you had
 * chosen to save it. History has never contained the text you wrote.
 */
(function (FB) {
  'use strict';

  var FORMAT = 'freebird.export';
  var FORMAT_VERSION = 1;

  /* ------------------------------------------------------------------ */
  /* Export                                                              */
  /* ------------------------------------------------------------------ */

  function buildExport() {
    var state = FB.state.get();
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: FB.storage.PREFIX,
      note: 'Free Bird data, exported from your browser. This file was never uploaded anywhere.',
      prefs: state.prefs,
      session: FB.storage.getSession(),
      history: state.history,
      // Only present when the user turned on conversation saving.
      chat: state.prefs.saveChat ? FB.storage.getChat() : null
    };
  }

  function filename() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return 'free-bird-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
  }

  /**
   * Hand the file to the browser.
   *
   * Built as a Blob and released immediately afterwards, so the data never
   * outlives the click that asked for it.
   */
  function exportToFile() {
    var payload = JSON.stringify(buildExport(), null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return payload.length;
  }

  /* ------------------------------------------------------------------ */
  /* Import                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Validate before touching anything.
   *
   * An import replaces real data, so a malformed or foreign file must fail
   * loudly and change nothing rather than half-applying.
   */
  function validate(data) {
    if (!data || typeof data !== 'object') {
      return { ok: false, message: 'That file is not readable as Free Bird data.' };
    }
    if (data.format !== FORMAT) {
      return { ok: false, message: 'That file was not exported by Free Bird.' };
    }
    if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) {
      return { ok: false, message: 'That file was written by a newer version of Free Bird than this one.' };
    }
    if (data.history && !Array.isArray(data.history)) {
      return { ok: false, message: 'The history in that file is malformed, so nothing has been changed.' };
    }
    if (data.session && !data.session.profile) {
      return { ok: false, message: 'The session in that file is incomplete, so nothing has been changed.' };
    }
    return { ok: true, message: '' };
  }

  function summarise(data) {
    var history = Array.isArray(data.history) ? data.history.length : 0;
    var parts = [history + ' check-in' + (history === 1 ? '' : 's')];
    if (data.session && data.session.profile) parts.push('one stress check in progress');
    if (Array.isArray(data.chat) && data.chat.length) parts.push('a saved conversation');
    return parts.join(', ');
  }

  /**
   * Apply an import.
   *
   * `mode` is 'merge' or 'replace'. Merge keeps existing check-ins and adds any
   * whose id is not already present, which is what you want when moving
   * between two devices you have both used.
   */
  function applyImport(data, mode) {
    var state = FB.state.get();

    if (data.prefs && typeof data.prefs === 'object') {
      // Only keys the app actually defines are adopted, so a hand-edited or
      // hostile file cannot introduce settings this version does not know
      // about. Written in one call so preferences cannot end up half-applied.
      var clean = {};
      Object.keys(FB.storage.DEFAULT_PREFS).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(data.prefs, key)) {
          clean[key] = data.prefs[key];
        }
      });
      FB.storage.setPrefs(clean);
    }

    var history = Array.isArray(data.history) ? data.history : [];
    if (mode === 'replace') {
      FB.storage.setHistory(history);
      FB.storage.setSession(data.session || null);
      if (Array.isArray(data.chat)) FB.storage.setChat(data.chat);
      else FB.storage.clearChat();
    } else {
      var existing = state.history.slice();
      var seen = {};
      existing.forEach(function (entry) { seen[entry.id] = true; });
      history.forEach(function (entry) {
        if (entry && entry.id && !seen[entry.id]) existing.push(entry);
      });
      existing.sort(function (a, b) { return a.createdAt - b.createdAt; });
      FB.storage.setHistory(existing);
      // Only adopt an incoming session when there is not one already open,
      // so an import cannot silently discard work in progress.
      if (data.session && !FB.state.hasSession()) FB.storage.setSession(data.session);
    }

    FB.state.restore();
    return {
      history: history.length,
      mode: mode
    };
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file was chosen.')); return; }
      if (file.size > 5 * 1024 * 1024) { reject(new Error('That file is much larger than a Free Bird export.')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch (err) {
          reject(new Error('That file is not valid JSON.'));
        }
      };
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.readAsText(file);
    });
  }

  FB.dataTransfer = {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    buildExport: buildExport,
    exportToFile: exportToFile,
    validate: validate,
    summarise: summarise,
    applyImport: applyImport,
    readFile: readFile
  };
})(window.FB = window.FB || {});
