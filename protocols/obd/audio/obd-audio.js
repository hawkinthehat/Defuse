/**
 * dᶻix̌ʷ (OBD) — gunwale strike audio + offline babbling-creek synthesis.
 */
(function () {
    const GUNWALE_SRC = 'protocols/obd/audio/gunwale-strike.wav';
    const STRIKE_GAIN = 0.72;
    const CREEK_GAIN = 0.38;
    const CREEK_FADE_IN_SEC = 1.5;
    const CREEK_FADE_OUT_SEC = 0.12;
    const CREEK_LFO_MIN_HZ = 0.2;
    const CREEK_LFO_MAX_HZ = 1.5;
    const CREEK_FILTER_BASE_HZ = 680;
    const CREEK_FILTER_DEPTH_HZ = 520;
    const PINK_NOISE_BUFFER_SIZE = 4096;

    let audioCtx = null;
    let strikeBuffer = null;
    let loadPromise = null;
    let activeSources = [];
    let creekNodes = null;
    let creekStopping = false;
    let creekSink = null;

    function isGlobalAcousticEnabled() {
        return typeof window.GlobalBinauralEngine !== 'undefined' && window.GlobalBinauralEngine.isThetaEnabled;
    }

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

    function createPinkNoiseSource(ctx) {
        const buffer = ctx.createBuffer(1, PINK_NOISE_BUFFER_SIZE, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let b3 = 0;
        let b4 = 0;
        let b5 = 0;
        let b6 = 0;

        for (let i = 0; i < PINK_NOISE_BUFFER_SIZE; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.969 * b2 + white * 0.153852;
            b3 = 0.8665 * b3 + white * 0.3104856;
            b4 = 0.55 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.016898;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        return source;
    }

    function randomLfoHz() {
        return CREEK_LFO_MIN_HZ + Math.random() * (CREEK_LFO_MAX_HZ - CREEK_LFO_MIN_HZ);
    }

    function teardownCreekNodes() {
        if (!creekNodes) return;

        const { noise, lfo, gain, filter } = creekNodes;
        [noise, lfo].forEach((node) => {
            try {
                node.stop();
            } catch {
                /* ignore */
            }
        });
        [noise, lfo, gain, filter].forEach((node) => {
            try {
                node.disconnect();
            } catch {
                /* ignore */
            }
        });

        creekNodes = null;
        creekStopping = false;
    }

    function startBabblingCreek() {
        if (!isGlobalAcousticEnabled()) return Promise.resolve(false);
        if (creekNodes || creekStopping) return resumeAudio();

        return resumeAudio().then((ready) => {
            if (!ready || creekNodes || creekStopping) return;

            const ctx = getAudioContext();
            if (!ctx) return;

            const noise = createPinkNoiseSource(ctx);
            const filter = ctx.createBiquadFilter();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            const gain = ctx.createGain();
            const now = ctx.currentTime;

            filter.type = 'lowpass';
            filter.Q.value = 0.85;
            filter.frequency.setValueAtTime(CREEK_FILTER_BASE_HZ, now);

            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(randomLfoHz(), now);

            lfoGain.gain.setValueAtTime(CREEK_FILTER_DEPTH_HZ, now);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(CREEK_GAIN, now + CREEK_FADE_IN_SEC);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(creekSink || ctx.destination);
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            noise.start(now);
            lfo.start(now);

            creekNodes = { noise, filter, lfo, lfoGain, gain };
        });
    }

    function syncCreekLfoToWavePhase(phase) {
        if (!creekNodes) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const normalized = 0.5 + 0.5 * Math.sin(phase);
        const hz = CREEK_LFO_MIN_HZ + normalized * (CREEK_LFO_MAX_HZ - CREEK_LFO_MIN_HZ);
        creekNodes.lfo.frequency.setTargetAtTime(hz, ctx.currentTime, 0.08);
    }

    function setCreekSink(node) {
        creekSink = node || null;
    }

    function reconnectCreekOutput() {
        if (!creekNodes) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const { gain } = creekNodes;
        try {
            gain.disconnect();
        } catch {
            /* ignore */
        }
        gain.connect(creekSink || ctx.destination);
    }

    function stopBabblingCreek() {
        if (!creekNodes || creekStopping) return;

        const ctx = getAudioContext();
        if (!ctx) {
            teardownCreekNodes();
            return;
        }

        creekStopping = true;
        const { noise, lfo, gain } = creekNodes;
        const now = ctx.currentTime;

        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + CREEK_FADE_OUT_SEC);

        window.setTimeout(() => {
            [noise, lfo].forEach((node) => {
                try {
                    node.stop();
                } catch {
                    /* ignore */
                }
            });
            teardownCreekNodes();
        }, Math.ceil(CREEK_FADE_OUT_SEC * 1000) + 30);
    }

    function playGunwaleStrike() {
        if (!isGlobalAcousticEnabled()) return;

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
        if (!isGlobalAcousticEnabled()) return Promise.resolve(false);
        return resumeAudio().then(() => loadStrikeBuffer());
    }

    function stopOBDAudio() {
        stopBabblingCreek();
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
        creekNodes = null;
        creekStopping = false;
    }

    window.OBDAudio = {
        prime: primeOBDAudio,
        getAudioContext,
        playGunwaleStrike,
        startBabblingCreek,
        stopBabblingCreek,
        setCreekSink,
        reconnectCreekOutput,
        syncCreekLfoToWavePhase,
        stop: stopOBDAudio
    };
})();
