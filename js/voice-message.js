// Shared voice-message recorder for the coach-facing pages
// (dashboard.html reply rows + coach-messages.html chat composer).
//
// Records mic audio with MediaRecorder, preferring audio/mp4 (AAC) because
// it plays back everywhere — clients are mostly on iPhone Safari, which
// can't reliably play webm/opus. Falls back to webm/opus (Firefox).
//
// Usage:
//   await VoiceMessage.start({ onTick: s => ... , onAutoStop: rec => ... })
//   const rec = await VoiceMessage.stop();   // { blob, mimeType, extension, durationMs }
//   VoiceMessage.cancel();                    // discard without a result
//   const { mediaUrl, mediaType } = await VoiceMessage.uploadToChat({ coachId, clientId, recording: rec, authToken });
(function () {
  'use strict';

  // Only one recording at a time across the whole page — matches how the
  // reply rows and the chat composer are actually used.
  let active = null;

  var MAX_DURATION_MS = 5 * 60 * 1000; // hard stop at 5 minutes

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    var candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function extensionFor(mime) {
    if (!mime) return 'webm';
    if (mime.indexOf('mp4') !== -1) return 'm4a';
    if (mime.indexOf('ogg') !== -1) return 'ogg';
    return 'webm';
  }

  var VoiceMessage = {
    isSupported: function () {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
    },

    isRecording: function () {
      return !!(active && active.recorder && active.recorder.state === 'recording');
    },

    // Starts a recording. Throws if the mic is unavailable/denied.
    // onTick(elapsedSeconds) fires once a second for a timer display.
    // onAutoStop(recording) fires if the 5-minute cap stops it automatically.
    start: async function (opts) {
      opts = opts || {};
      if (this.isRecording()) this.cancel();

      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mimeType = pickMimeType();
      var recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      var entry = {
        recorder: recorder,
        stream: stream,
        chunks: [],
        startedAt: Date.now(),
        timerInterval: null,
        stopResolve: null,
        cancelled: false,
        autoStopped: false
      };

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) entry.chunks.push(e.data);
      };

      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (entry.timerInterval) clearInterval(entry.timerInterval);
        if (active === entry) active = null;

        if (entry.cancelled) {
          if (entry.stopResolve) entry.stopResolve(null);
          return;
        }

        var type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
        var recording = {
          blob: new Blob(entry.chunks, { type: type }),
          mimeType: type,
          extension: extensionFor(recorder.mimeType || mimeType),
          durationMs: Date.now() - entry.startedAt
        };

        if (entry.stopResolve) {
          entry.stopResolve(recording);
        } else if (entry.autoStopped && typeof opts.onAutoStop === 'function') {
          opts.onAutoStop(recording);
        }
      };

      entry.timerInterval = setInterval(function () {
        var elapsedMs = Date.now() - entry.startedAt;
        if (typeof opts.onTick === 'function') {
          opts.onTick(Math.floor(elapsedMs / 1000));
        }
        if (elapsedMs >= MAX_DURATION_MS && recorder.state === 'recording') {
          entry.autoStopped = true;
          recorder.stop();
        }
      }, 1000);

      // Collect data progressively so nothing is lost if the tab dies.
      recorder.start(250);
      active = entry;
      return true;
    },

    // Stops the active recording and resolves with
    // { blob, mimeType, extension, durationMs }, or null if nothing active.
    stop: function () {
      var entry = active;
      if (!entry || entry.recorder.state !== 'recording') return Promise.resolve(null);
      return new Promise(function (resolve) {
        entry.stopResolve = resolve;
        entry.recorder.stop();
      });
    },

    // Discards the active recording (mic released, no result delivered).
    cancel: function () {
      var entry = active;
      if (!entry) return;
      entry.cancelled = true;
      if (entry.recorder.state === 'recording') {
        entry.recorder.stop();
      } else {
        entry.stream.getTracks().forEach(function (t) { t.stop(); });
        if (entry.timerInterval) clearInterval(entry.timerInterval);
        if (active === entry) active = null;
      }
    },

    // Uploads a finished recording to chat storage (same signed-URL flow as
    // photo/video attachments) and returns { mediaUrl, mediaType }.
    uploadToChat: async function (params) {
      var headers = { 'Content-Type': 'application/json' };
      if (params.authToken) headers['Authorization'] = 'Bearer ' + params.authToken;

      var res = await fetch('/.netlify/functions/get-chat-upload-url', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          coachId: params.coachId,
          clientId: params.clientId,
          contentType: params.recording.mimeType,
          fileExtension: params.recording.extension
        })
      });
      var data = await res.json();
      if (!data.success || !data.uploadUrl) {
        throw new Error(data.error || 'Failed to get upload URL');
      }

      var up = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': params.recording.mimeType },
        body: params.recording.blob
      });
      if (!up.ok) throw new Error('Failed to upload voice message to storage');

      return { mediaUrl: data.publicUrl, mediaType: data.mediaType || 'audio' };
    },

    formatElapsed: function (seconds) {
      var m = Math.floor(seconds / 60);
      var s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }
  };

  window.VoiceMessage = VoiceMessage;
})();
