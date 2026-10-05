(function () {
  'use strict';

  /* ── Configuration ─────────────────────────────────────────────── */
  var DEFAULT_THRESHOLD = 0.8;
  var SNAPSHOT_FILENAME = 'guild-recovery-snapshot.json';

  /* ── Helpers ───────────────────────────────────────────────────── */

  /**
   * Count meaningful task entries in a fairytail-tasks-v2 JSON string.
   * Returns 0 when the value is not a valid array.
   */
  function taskCount(raw) {
    try {
      var value = JSON.parse(raw || '[]');
      if (!Array.isArray(value)) return 0;
      return value.filter(function (t) {
        return t && typeof t === 'object' && !Array.isArray(t.value) && t.id;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Read a URL search-parameter (works in both regular pages and bookmarklets).
   */
  function urlParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  /**
   * Resolve the configurable threshold from ?recovery-threshold=…
   */
  function resolveThreshold() {
    var raw = urlParam('recovery-threshold');
    if (raw === null || raw === undefined || raw === '') return DEFAULT_THRESHOLD;
    var parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed <= 0 || parsed > 1) return DEFAULT_THRESHOLD;
    return parsed;
  }

  /**
   * Attempt to fetch the snapshot file from the same origin/path.
   * Returns a Promise that resolves with the parsed object or rejects.
   */
  function fetchSnapshot() {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', SNAPSHOT_FILENAME, true);
      xhr.overrideMimeType('application/json');
      xhr.onload = function () {
        if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 400)) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('Snapshot JSON parse error: ' + e.message));
          }
        } else {
          reject(new Error('Snapshot fetch failed: HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () {
        reject(new Error('Snapshot fetch network error'));
      };
      xhr.send();
    });
  }

  /**
   * Prompt the user to pick a JSON file via <input type="file">.
   * Returns a Promise that resolves with the parsed object.
   */
  function promptFileSelect() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'z-index:2147483647;padding:12px;background:#fff;border:2px solid #888;' +
        'border-radius:8px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.3);';
      var cancelled = false;

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file || cancelled) return;
        cancelled = true;
        cleanup();
        var reader = new FileReader();
        reader.onload = function () {
          try {
            resolve(JSON.parse(reader.result));
          } catch (e) {
            reject(new Error('Selected file JSON parse error: ' + e.message));
          }
        };
        reader.onerror = function () {
          reject(new Error('File read error'));
        };
        reader.readAsText(file);
      });

      function cleanup() {
        if (input.parentNode) input.parentNode.removeChild(input);
      }

      /* Auto-remove after 5 minutes to avoid orphaned DOM elements */
      setTimeout(function () {
        if (!cancelled) {
          cancelled = true;
          cleanup();
          reject(new Error('File selection timed out'));
        }
      }, 300000);

      document.body.appendChild(input);
      input.focus();
    });
  }

  /**
   * Create a downloadable JSON backup of current localStorage data and
   * trigger a browser download.  Returns the backup object.
   */
  function downloadBackup(keys) {
    var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    var filename = 'guild-recovery-backup-' + timestamp + '.json';
    var data = {};
    for (var i = 0; i < keys.length; i++) {
      var v = localStorage.getItem(keys[i]);
      if (v !== null) data[keys[i]] = v;
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 3000);
    return data;
  }

  /**
   * Write recovered data into localStorage, preserving the existing
   * lsSet-style key-by-key iteration and __guild_cloud_meta__ bookkeeping.
   */
  function applyRecovery(snapshot) {
    var keys = Object.keys(snapshot);
    for (var i = 0; i < keys.length; i++) {
      localStorage.setItem(keys[i], snapshot[keys[i]]);
    }

    /* Update cloud-meta timestamps (same logic as original) */
    try {
      var meta = JSON.parse(localStorage.getItem('__guild_cloud_meta__') || '{}');
      var stamp = Date.now();
      for (var j = 0; j < keys.length; j++) {
        meta[keys[j]] = stamp;
      }
      localStorage.setItem('__guild_cloud_meta__', JSON.stringify(meta));
    } catch (_) { /* non-critical */ }
  }

  /* ── Main flow ─────────────────────────────────────────────────── */

  function run() {
    var threshold = resolveThreshold();
    var wantManual = urlParam('recovery') === '1';

    /* Step 1 – obtain snapshot data */
    var snapshotPromise = fetchSnapshot().catch(function (fetchErr) {
      if (!wantManual) {
        console.warn('[guild-recovery] Snapshot file not found; recovery skipped (open with ?recovery=1 to choose a file manually).');
        return null;
      }
      console.warn('[guild-recovery] Snapshot file not found, prompting file selection.');
      return promptFileSelect();
    });

    snapshotPromise
      .then(async function (snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
          console.warn('[guild-recovery] Invalid snapshot data, aborting.');
          return;
        }

        /* Step 2 – compare current data with snapshot */
        var currentTaskCount = taskCount(localStorage.getItem('fairytail-tasks-v2'));
        var snapshotTaskCount = taskCount(
          typeof snapshot['fairytail-tasks-v2'] === 'string'
            ? snapshot['fairytail-tasks-v2']
            : JSON.stringify(snapshot['fairytail-tasks-v2'] || [])
        );

        if (snapshotTaskCount === 0) {
          console.warn('[guild-recovery] Snapshot contains no tasks, aborting.');
          return;
        }

        var ratio = currentTaskCount / snapshotTaskCount;
        if (ratio >= threshold) {
          console.info(
            '[guild-recovery] Data intact (' + currentTaskCount + '/' + snapshotTaskCount +
            ' = ' + (ratio * 100).toFixed(1) + '% >= ' + (threshold * 100).toFixed(0) + '%). No recovery needed.'
          );
          return;
        }

        /* Step 3 – data loss detected; ask user (every time, no one-shot marker) */
        var msg =
          '检测到本地数据可能不完整（' + currentTaskCount + '/' + snapshotTaskCount +
          ' = ' + (ratio * 100).toFixed(1) + '% < ' + (threshold * 100).toFixed(0) +
          '% 阈值），是否从快照恢复？';

        if (!await guildConfirmDialog({ text: msg })) {
          console.info('[guild-recovery] User declined recovery.');
          return;
        }

        /* Step 4 – auto-backup current data as downloadable JSON */
        var allKeys = [];
        for (var k = 0; k < localStorage.length; k++) {
          var key = localStorage.key(k);
          if (key) allKeys.push(key);
        }
        downloadBackup(allKeys);

        /* Step 5 – apply recovery */
        applyRecovery(snapshot);

        console.info('[guild-recovery] Recovery complete. Backup downloaded.');
      })
      .catch(function (err) {
        console.error('[guild-recovery] Recovery aborted:', err.message || err);
      });
  }

  /* Non-blocking entry: defer to next event-loop tick */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 0); });
  } else {
    setTimeout(run, 0);
  }
})();
