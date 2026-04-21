const CAS_LAYER_MS = 5000;

/** Fixed order: Circle → Triangle → Square → Pentagon → Hexagon; healing blue per slot. */
const CAS_SEQUENCE = [
    { key: 'circle', label: 'Circle' },
    { key: 'triangle', label: 'Triangle' },
    { key: 'square', label: 'Square' },
    { key: 'pentagon', label: 'Pentagon' },
    { key: 'hexagon', label: 'Hexagon' }
];

let casSessionId = 0;
let casTimerIds = [];

function clearCasTimers() {
    casTimerIds.forEach((id) => clearTimeout(id));
    casTimerIds = [];
}

function appendCasLayer(stackEl, index, session) {
    if (session !== casSessionId || !stackEl?.isConnected) return;

    const def = CAS_SEQUENCE[index];
    if (!def) return;

    const layer = document.createElement('div');
    layer.className = `cas-layer cas-layer--${def.key}`;
    layer.setAttribute('data-cas-shape', def.label);
    layer.style.zIndex = String(index + 1);
    stackEl.appendChild(layer);
}

function scheduleCasLayers(stackEl, session) {
    appendCasLayer(stackEl, 0, session);

    for (let i = 1; i < CAS_SEQUENCE.length; i++) {
        const delay = i * CAS_LAYER_MS;
        const id = setTimeout(() => {
            appendCasLayer(stackEl, i, session);
        }, delay);
        casTimerIds.push(id);
    }
}

function launchCAS() {
    clearCasTimers();
    casSessionId += 1;
    const session = casSessionId;

    showProtocolViewport();

    const stage = document.getElementById('protocol-stage');
    if (!stage) return;

    stage.innerHTML = `
        <div class="cas-root" role="img" aria-label="Centripetal healing blue shapes, progressive layers">
            <div class="cas-stack" id="cas-stack"></div>
        </div>
    `;

    const stack = document.getElementById('cas-stack');
    if (!stack) return;

    scheduleCasLayers(stack, session);
}
