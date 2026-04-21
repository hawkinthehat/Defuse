// CPI: five correct tasks per session; pool shuffled so each run picks five random, distinct tasks.
let cpiProgress = 0;
const TOTAL_STAGES = 5;
let currentActiveTask = null;
let sessionTasks = [];

/** Simple word games + easy animal facts — one clear answer each. */
const taskPool = [
    { inst: 'WORD GAME · REVERSE:', q: 'STAR', a: 'RATS' },
    { inst: 'ANIMAL FACT:', q: 'A baby dog is a', a: 'PUPPY' },
    { inst: 'WORD GAME · OPPOSITE:', q: 'NIGHT', a: 'DAY' },
    { inst: 'ANIMAL FACT:', q: 'Birds use these to fly', a: 'WINGS' },
    { inst: 'WORD GAME · ODD ONE OUT:', q: 'ROSE · DAISY · TREE · TULIP', a: 'TREE' },
    { inst: 'WORD GAME · REVERSE:', q: 'WOLF', a: 'FLOW' },
    { inst: 'ANIMAL FACT:', q: 'Pet cats often say', a: 'MEOW' },
    { inst: 'WORD GAME · OPPOSITE:', q: 'BIG', a: 'SMALL' },
    { inst: 'ANIMAL FACT:', q: 'Pet goldfish live in a bowl of', a: 'WATER' },
    { inst: 'WORD GAME · REVERSE:', q: 'PART', a: 'TRAP' },
    { inst: 'ANIMAL FACT:', q: 'Cows on a farm eat', a: 'GRASS' },
    { inst: 'WORD GAME · ODD ONE OUT:', q: 'EAGLE · ROBIN · TRAIN · CROW', a: 'TRAIN' },
    { inst: 'ANIMAL FACT:', q: 'Many fish swim together in a', a: 'SCHOOL' },
    { inst: 'WORD GAME · REVERSE:', q: 'LOOP', a: 'POOL' },
    { inst: 'ANIMAL FACT:', q: 'An elephant has a long', a: 'TRUNK' }
];

function shuffleSessionTasks() {
    const copy = [...taskPool];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    sessionTasks = copy.slice(0, TOTAL_STAGES);
}

function normalizeAnswer(value) {
    return String(value).toUpperCase().trim();
}

function launchCPI() {
    cpiProgress = 0;
    currentActiveTask = null;
    shuffleSessionTasks();
    openSession('STABILIZATION ENGAGED: 1 / ' + TOTAL_STAGES);
    renderCPITask();
}

function renderCPITask() {
    const stage = document.getElementById('protocol-stage');

    currentActiveTask = sessionTasks[cpiProgress];

    stage.innerHTML = `
        <div class="cpi-container" id="cpi-box">
            <p class="cpi-inst">${currentActiveTask.inst}</p>
            <h2 class="cpi-content">${currentActiveTask.q}</h2>
            <input type="text" class="cpi-input" id="cpi-input" autocomplete="off" placeholder="INPUT DATA..." autofocus>
            <div id="cpi-progress">SEQUENCE: ${cpiProgress + 1} / ${TOTAL_STAGES}</div>
        </div>
    `;

    const input = document.getElementById('cpi-input');
    input.focus();

    const handleKey = (e) => {
        if (e.key !== 'Enter') return;

        if (normalizeAnswer(input.value) === normalizeAnswer(currentActiveTask.a)) {
            cpiProgress++;
            input.removeEventListener('keypress', handleKey);

            if (cpiProgress >= TOTAL_STAGES) {
                renderCPIExitPrompt();
            } else {
                const inst = document.getElementById('inst');
                if (inst) {
                    inst.innerText = 'STABILIZATION ENGAGED: ' + (cpiProgress + 1) + ' / ' + TOTAL_STAGES;
                }
                renderCPITask();
            }
        } else {
            const box = document.getElementById('cpi-box');
            if (box) {
                box.classList.add('cpi-error');
                setTimeout(() => box.classList.remove('cpi-error'), 500);
            }
        }
    };
    input.addEventListener('keypress', handleKey);
}

function renderCPIExitPrompt() {
    const stage = document.getElementById('protocol-stage');
    const inst = document.getElementById('inst');
    if (inst) inst.innerText = 'STABILIZATION COMPLETE';
    stage.innerHTML = `
        <div class="cpi-container">
            <h2 class="cpi-content" style="color:var(--neon-teal)">NEURAL ALIGNMENT: 100%</h2>
            <button type="button" class="cpi-btn" onclick="exitProtocol()">TERMINATE SESSION</button>
        </div>
    `;
}
