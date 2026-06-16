/**
 * dᶻix̌ʷ (OBD) — organic gunwale strike audio, synced to path apex.
 */
(function () {
    const GUNWALE_SRC = 'protocols/obd/audio/gunwale-strike.wav';
    const STRIKE_GAIN = 0.72;

    let audioCtx = null;
    let strikeBuffer = null;
    let loadPromise = null;
    let activeSources = [];

    function getAudioContext() {
        if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try {
            audioCtx = new Ctx();
        } catch {
            audioCtx = null;
        }
        return audioCtx;
    }

    function resumeAudio() {
        const ctx = getAudioContext();
        if (!ctx) return Promise.resolve(false);
        if (ctx.state === 'suspended') {
            return ctx.resume().then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
    }

    function loadStrikeBuffer() {
        if (strikeBuffer) return Promise.resolve(strikeBuffer);
        if (loadPromise) return loadPromise;

        loadPromise = fetch(GUNWALE_SRC)
            .then((res) => {
                if (!res.ok) throw new Error('gunwale fetch failed');
                return res.arrayBuffer();
            })
            .then((buf) => {
                const ctx = getAudioContext();
                if (!ctx) return null;
                return ctx.decodeAudioData(buf.slice(0));
            })
            .then((decoded) => {
                strikeBuffer = decoded;
                return decoded;
            })
            .catch(() => null);

        return loadPromise;
    }

    function playGunwaleStrike() {
        const ctx = getAudioContext();
        if (!ctx || !strikeBuffer) return;

        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = strikeBuffer;
        gain.gain.value = STRIKE_GAIN;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
            activeSources = activeSources.filter((s) => s !== source);
            try {
                source.disconnect();
                gain.disconnect();
            } catch {
                /* ignore */
            }
        };
        activeSources.push(source);
        source.start(ctx.currentTime);
    }

    function primeOBDAudio() {
        return resumeAudio().then(() => loadStrikeBuffer());
    }

    function stopOBDAudio() {
        activeSources.forEach((source) => {
            try {
                source.stop();
            } catch {
                /* ignore */
            }
        });
        activeSources = [];
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => {});
        }
        audioCtx = null;
        strikeBuffer = null;
        loadPromise = null;
    }

    window.OBDAudio = {
        prime: primeOBDAudio,
        playGunwaleStrike,
        stop: stopOBDAudio
    };
})();
