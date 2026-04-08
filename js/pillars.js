(() => {
    const views = Array.from(document.querySelectorAll(".view"));
    const state = {
        current: "home",
        still: {
            tasks: [],
            index: 0,
            complete: false
        },
        spark: {
            orbitId: null,
            mode: "idle",
            startTime: 0
        },
        weave: {
            dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
            points: [],
            links: [],
            activePointId: null,
            rafId: null,
            dirty: true,
            assetsFound: true
        },
        halt: {
            cues: [
                "Name 1 object directly in front of you.",
                "Press both feet to the ground for 5 seconds.",
                "Name 1 color you can see right now.",
                "Take one long exhale and relax shoulders.",
                "Name 1 sound in the room."
            ],
            cueIndex: 0,
            timer: 30,
            tickingId: null
        }
    };

    const totemAssetCandidates = [
        "assets/totems/raven.svg",
        "assets/totems/wolf.svg",
        "assets/raven.svg",
        "assets/wolf.svg"
    ];

    function byId(id) {
        return document.getElementById(id);
    }

    function showView(id) {
        const previous = state.current;
        if (previous === "spark" && id !== "spark") {
            stopSparkOrbit();
            byId("sparkMode").textContent = "Mode: idle";
        }
        if (previous === "halt" && id !== "halt") {
            stopHaltTimer();
            byId("haltRing").classList.remove("pulse-active");
            byId("haltTimer").textContent = "30";
        }

        views.forEach((view) => {
            const active = view.id === id;
            view.hidden = !active;
        });
        state.current = id;
        if (id === "weave") {
            queueWeaveRender();
        }
    }

    function installNavigation() {
        document.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const next = target.dataset.go;
            if (!next) return;
            showView(next);
        });
    }

    function shuffle(list) {
        const clone = list.slice();
        for (let i = clone.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [clone[i], clone[j]] = [clone[j], clone[i]];
        }
        return clone;
    }

    function buildStillTasks() {
        const mathPool = [
            { prompt: "Math: 15 - 7", answer: "8" },
            { prompt: "Math: 9 + 13", answer: "22" },
            { prompt: "Math: 24 - 9", answer: "15" },
            { prompt: "Math: 6 + 17", answer: "23" }
        ];
        const reversePool = [
            { prompt: "Reverse: WOLF", answer: "FLOW" },
            { prompt: "Reverse: RAVEN", answer: "NEVAR" },
            { prompt: "Reverse: STILL", answer: "LLITS" }
        ];
        const dotPool = [
            { prompt: "Dot count: ● ● ● ● ● ● ●", answer: "7" },
            { prompt: "Dot count: ● ● ● ●", answer: "4" },
            { prompt: "Dot count: ● ● ● ● ● ●", answer: "6" }
        ];

        const core = [
            mathPool[Math.floor(Math.random() * mathPool.length)],
            reversePool[Math.floor(Math.random() * reversePool.length)],
            dotPool[Math.floor(Math.random() * dotPool.length)]
        ];

        const extra = shuffle([...mathPool, ...reversePool, ...dotPool])
            .filter((item) => !core.includes(item))
            .slice(0, 2);

        return shuffle([...core, ...extra]).slice(0, 5);
    }

    function setStillPrompt() {
        const progress = byId("stillProgress");
        const prompt = byId("stillPrompt");
        const feedback = byId("stillFeedback");

        if (state.still.complete) {
            progress.textContent = "5/5";
            prompt.textContent = "Sequence complete. Prefrontal control restored.";
            feedback.textContent = "Transition to another pillar or return home.";
            return;
        }

        const current = state.still.tasks[state.still.index];
        progress.textContent = `${state.still.index + 1}/5`;
        prompt.textContent = current.prompt;
        feedback.textContent = "";
    }

    function startStillSequence() {
        state.still.tasks = buildStillTasks();
        state.still.index = 0;
        state.still.complete = false;
        byId("stillInput").value = "";
        setStillPrompt();
        byId("stillInput").focus();
    }

    function handleStillSubmit(event) {
        event.preventDefault();
        if (state.still.complete || !state.still.tasks.length) return;

        const input = byId("stillInput");
        const feedback = byId("stillFeedback");
        const expected = String(state.still.tasks[state.still.index].answer).trim().toUpperCase();
        const actual = input.value.trim().toUpperCase();
        if (!actual) return;

        if (actual === expected) {
            state.still.index += 1;
            if (state.still.index >= 5) {
                state.still.complete = true;
            }
            input.value = "";
            setStillPrompt();
        } else {
            feedback.textContent = "Try again and keep eyes with the feather.";
        }
    }

    function startStillFeather() {
        const feather = byId("stillFeather");
        let direction = 1;
        let x = 0;

        function tick() {
            x += direction * 2.7;
            if (x > 86) direction = -1;
            if (x < 0) direction = 1;
            feather.style.transform = `translateX(${x}%)`;
            window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(tick);
    }

    function splitWord(word) {
        return word.trim().split("").join(" ");
    }

    function startSparkOrbit(mode) {
        const stage = byId("sparkStage");
        const feather = byId("sparkFeather");
        state.spark.mode = mode;
        state.spark.startTime = performance.now();
        byId("sparkMode").textContent = `Mode: ${mode}`;

        if (state.spark.orbitId) {
            cancelAnimationFrame(state.spark.orbitId);
            state.spark.orbitId = null;
        }

        function animate(now) {
            const t = (now - state.spark.startTime) / 1000;
            const bounds = stage.getBoundingClientRect();
            const radius = Math.max(30, Math.min(bounds.width, bounds.height) * 0.28);

            let x = 0;
            let y = 0;

            if (mode === "circular") {
                x = Math.cos(t * 2.2) * radius;
                y = Math.sin(t * 2.2) * radius;
            } else {
                // Falling mode: cycle vertical drops while shifting horizontally.
                const cycle = (t * 0.7) % 1;
                x = Math.sin(t * 1.8) * radius * 0.65;
                y = (cycle * 2 - 1) * radius;
            }

            feather.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0)`;
            state.spark.orbitId = requestAnimationFrame(animate);
        }

        state.spark.orbitId = requestAnimationFrame(animate);
    }

    function stopSparkOrbit() {
        if (state.spark.orbitId) {
            cancelAnimationFrame(state.spark.orbitId);
            state.spark.orbitId = null;
        }
    }

    function handleSparkSubmit(event) {
        event.preventDefault();
        const input = byId("sparkInput");
        const word = input.value.trim();
        if (!word) return;

        const wordEl = byId("sparkWord");
        const distancing = byId("sparkDistancing");
        wordEl.textContent = word.toUpperCase();
        wordEl.classList.remove("explode");
        wordEl.classList.add("active");
        // Force restart when users submit multiple words quickly.
        void wordEl.offsetWidth;
        wordEl.classList.add("explode");
        distancing.textContent = `Distancing: "${word}" is a thought, not a command.`;

        setTimeout(() => {
            wordEl.textContent = splitWord(word.toUpperCase());
            wordEl.classList.remove("explode");
            startSparkOrbit("circular");
        }, 280);

        setTimeout(() => {
            startSparkOrbit("falling");
        }, 4200);
        input.value = "";
    }

    function setupWeavePoints() {
        const raven = [
            { id: "r1", group: "raven", x: 0.2, y: 0.2 },
            { id: "r2", group: "raven", x: 0.28, y: 0.52 },
            { id: "r3", group: "raven", x: 0.18, y: 0.78 }
        ];
        const wolf = [
            { id: "w1", group: "wolf", x: 0.78, y: 0.23 },
            { id: "w2", group: "wolf", x: 0.72, y: 0.53 },
            { id: "w3", group: "wolf", x: 0.82, y: 0.78 }
        ];
        state.weave.points = [...raven, ...wolf];
        state.weave.links = [];
        state.weave.activePointId = null;
        state.weave.dirty = true;
    }

    function getWeaveDimensions() {
        const shell = byId("weaveShell");
        const canvas = byId("weaveCanvas");
        const rect = shell.getBoundingClientRect();
        const width = Math.max(280, Math.floor(rect.width));
        const height = Math.max(220, Math.floor(rect.height));
        const dpr = state.weave.dpr;
        if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            state.weave.dirty = true;
        }
        return { width, height, dpr };
    }

    function pointToPx(point, width, height) {
        return { x: point.x * width, y: point.y * height };
    }

    function findHitPoint(clientX, clientY) {
        const canvas = byId("weaveCanvas");
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const { width, height } = getWeaveDimensions();
        const radius = 18;
        for (const point of state.weave.points) {
            const px = pointToPx(point, width, height);
            const dx = x - px.x;
            const dy = y - px.y;
            if (Math.sqrt(dx * dx + dy * dy) <= radius) return point;
        }
        return null;
    }

    function drawWeave() {
        const canvas = byId("weaveCanvas");
        const ctx = canvas.getContext("2d");
        const { width, height, dpr } = getWeaveDimensions();
        if (!ctx) return;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "#0b0f1d";
        ctx.fillRect(0, 0, width, height);

        // Midline guide for visual split between totems.
        ctx.strokeStyle = "rgba(196, 209, 255, 0.15)";
        ctx.setLineDash([6, 10]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 2, 10);
        ctx.lineTo(width / 2, height - 10);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const link of state.weave.links) {
            const from = state.weave.points.find((p) => p.id === link.from);
            const to = state.weave.points.find((p) => p.id === link.to);
            if (!from || !to) continue;
            const p1 = pointToPx(from, width, height);
            const p2 = pointToPx(to, width, height);

            ctx.strokeStyle = "#f4d03f";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        for (const point of state.weave.points) {
            const p = pointToPx(point, width, height);
            const active = point.id === state.weave.activePointId;
            ctx.fillStyle = point.group === "raven" ? "#70d4ff" : "#ffb36b";
            ctx.beginPath();
            ctx.arc(p.x, p.y, active ? 10 : 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = active ? "#fff" : "rgba(255,255,255,0.5)";
            ctx.lineWidth = active ? 2 : 1;
            ctx.stroke();
        }

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillText("RAVEN", 14, 20);
        ctx.fillText("WOLF", width - 52, 20);
        ctx.restore();
    }

    function queueWeaveRender() {
        state.weave.dirty = true;
        if (state.weave.rafId) return;

        const renderFrame = () => {
            state.weave.rafId = null;
            if (!state.weave.dirty) return;
            drawWeave();
            state.weave.dirty = false;
        };
        state.weave.rafId = requestAnimationFrame(renderFrame);
    }

    function attemptLink(point) {
        const hint = byId("weaveHint");
        if (!state.weave.activePointId) {
            state.weave.activePointId = point.id;
            hint.textContent = "Select opposite totem point to link.";
            return;
        }

        if (state.weave.activePointId === point.id) {
            return;
        }

        const from = state.weave.points.find((p) => p.id === state.weave.activePointId);
        const to = point;
        if (!from || !to) return;

        if (from.group === to.group) {
            hint.textContent = "Link across totems: Raven -> Wolf or Wolf -> Raven.";
            state.weave.activePointId = point.id;
            return;
        }

        const exists = state.weave.links.some((link) => {
            return (link.from === from.id && link.to === to.id) || (link.from === to.id && link.to === from.id);
        });
        if (!exists) {
            state.weave.links.push({ from: from.id, to: to.id });
            hint.textContent = `Thread count: ${state.weave.links.length}`;
        }
        state.weave.activePointId = null;
    }

    function bindWeaveEvents() {
        const canvas = byId("weaveCanvas");
        canvas.addEventListener("pointerdown", (event) => {
            const hit = findHitPoint(event.clientX, event.clientY);
            if (!hit) return;
            attemptLink(hit);
            state.weave.dirty = true;
            queueWeaveRender();
        });

        byId("weaveReset").addEventListener("click", () => {
            state.weave.links = [];
            state.weave.activePointId = null;
            byId("weaveHint").textContent = "Connect across totems to complete a thread.";
            state.weave.dirty = true;
            queueWeaveRender();
        });
    }

    function checkTotemAssets() {
        const checks = totemAssetCandidates.map((url) => {
            return fetch(url, { cache: "no-store" })
                .then((response) => ({ url, ok: response.ok }))
                .catch(() => ({ url, ok: false }));
        });

        Promise.all(checks).then((results) => {
            const found = results.filter((item) => item.ok).map((item) => item.url);
            state.weave.assetsFound = found.length >= 2;
            const notice = byId("totemAssetNotice");
            if (!state.weave.assetsFound) {
                notice.hidden = false;
                notice.textContent = "Missing totem assets: move Raven/Wolf icons into /assets/totems/ (raven.svg, wolf.svg).";
            } else {
                notice.hidden = false;
                notice.textContent = `Totem assets detected: ${found.join(", ")}`;
            }
        });
    }

    function updateHaltCue() {
        const cue = state.halt.cues[state.halt.cueIndex] || "Complete.";
        byId("haltCue").textContent = cue;
    }

    function stopHaltTimer() {
        if (state.halt.tickingId) {
            clearInterval(state.halt.tickingId);
            state.halt.tickingId = null;
        }
    }

    function startHalt() {
        stopHaltTimer();
        state.halt.cueIndex = 0;
        state.halt.timer = 30;
        byId("haltTimer").textContent = String(state.halt.timer);
        updateHaltCue();
        byId("haltRing").classList.add("pulse-active");

        state.halt.tickingId = setInterval(() => {
            state.halt.timer -= 1;
            byId("haltTimer").textContent = String(Math.max(0, state.halt.timer));
            if (state.halt.timer <= 0) {
                stopHaltTimer();
                byId("haltCue").textContent = "Sequence complete. Hold focus and return to baseline.";
                byId("haltRing").classList.remove("pulse-active");
            }
        }, 1000);
    }

    function nextHaltCue() {
        state.halt.cueIndex = (state.halt.cueIndex + 1) % state.halt.cues.length;
        updateHaltCue();
    }

    function bindEvents() {
        byId("stillStart").addEventListener("click", startStillSequence);
        byId("stillForm").addEventListener("submit", handleStillSubmit);
        byId("sparkForm").addEventListener("submit", handleSparkSubmit);
        byId("haltStart").addEventListener("click", startHalt);
        byId("haltNext").addEventListener("click", nextHaltCue);

        window.addEventListener("resize", () => {
            state.weave.dirty = true;
            queueWeaveRender();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopSparkOrbit();
            }
        });
    }

    function init() {
        installNavigation();
        bindEvents();
        setupWeavePoints();
        bindWeaveEvents();
        checkTotemAssets();
        startStillFeather();
        showView("home");
    }

    init();
})();
