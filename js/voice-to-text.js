/**
 * Voice-to-Text Utility
 * Reusable speech recognition for any text input/textarea.
 * Uses the Web Speech API (SpeechRecognition).
 *
 * Usage:
 *   VoiceToText.attachMic(inputElement, micButton)
 *   — or call VoiceToText.toggle(inputElement, micButton) manually
 */
(function () {
    'use strict';

    const isIOS = () =>
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    // Track active recognition instance globally so only one mic is active at a time
    let activeRecognition = null;
    let activeButton = null;

    function stopActive() {
        if (activeRecognition) {
            try { activeRecognition.abort(); } catch (_) {}
            activeRecognition = null;
        }
        if (activeButton) {
            activeButton.classList.remove('vtt-recording');
            activeButton = null;
        }
    }

    async function startRecognition(inputEl, micBtn) {
        // Stop any other active recording first
        stopActive();

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice input is not supported in this browser. Please try Chrome or Safari.');
            return;
        }

        // iOS warmup — activate mic permission
        if (isIOS() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
            } catch (err) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    alert('Microphone access denied. Please allow microphone access in your device settings.');
                } else {
                    alert('Could not access microphone. Please check permissions.');
                }
                return;
            }
        }

        // Store text before voice starts so we can append
        const preVoiceText = inputEl.value || '';

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            micBtn.classList.add('vtt-recording');
            activeButton = micBtn;
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += t;
                } else {
                    interimTranscript += t;
                }
            }
            const separator = preVoiceText && !preVoiceText.endsWith(' ') ? ' ' : '';
            if (finalTranscript) {
                inputEl.value = preVoiceText + separator + finalTranscript;
            } else if (interimTranscript) {
                inputEl.value = preVoiceText + separator + interimTranscript;
            }
            // Trigger input event so any listeners pick up the change
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        };

        recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please allow microphone access.');
            }
            cleanup();
        };

        recognition.onend = () => {
            cleanup();
        };

        function cleanup() {
            micBtn.classList.remove('vtt-recording');
            if (activeRecognition === recognition) {
                activeRecognition = null;
                activeButton = null;
            }
        }

        activeRecognition = recognition;

        try {
            recognition.start();
        } catch (err) {
            console.error('Failed to start speech recognition:', err);
            cleanup();
        }
    }

    function toggle(inputEl, micBtn) {
        if (activeRecognition && activeButton === micBtn) {
            stopActive();
        } else {
            startRecognition(inputEl, micBtn);
        }
    }

    /**
     * Create and insert a mic button next to an input/textarea.
     * Returns the created button element.
     *
     * @param {HTMLElement} inputEl - The input or textarea
     * @param {object} opts - Options: { position: 'after'|'before', className: '' }
     */
    function attachMic(inputEl, opts) {
        if (!supported) return null;
        opts = opts || {};

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vtt-mic-btn ' + (opts.className || '');
        btn.title = 'Voice input';
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(inputEl, btn);
        });

        if (opts.position === 'before') {
            inputEl.parentNode.insertBefore(btn, inputEl);
        } else {
            // Insert after
            inputEl.parentNode.insertBefore(btn, inputEl.nextSibling);
        }

        return btn;
    }

    /**
     * Create a mic button element (does not insert into DOM).
     * Caller is responsible for placement.
     */
    function createMicButton(inputEl, opts) {
        if (!supported) return null;
        opts = opts || {};

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vtt-mic-btn ' + (opts.className || '');
        btn.title = 'Voice input';
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(inputEl, btn);
        });

        return btn;
    }

    // Expose
    window.VoiceToText = {
        supported: supported,
        toggle: toggle,
        attachMic: attachMic,
        createMicButton: createMicButton,
        stopActive: stopActive
    };
})();
