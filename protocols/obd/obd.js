function launchOBD() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    // Instructions for the user
    const inst = document.getElementById('inst');
    inst.innerText = 'FOLLOW THE FEATHER WITH YOUR EYES';

    stage.innerHTML = `
        <div id="obd-track">
            <div id="feather" class="sweep-standard"></div>
        </div>
    `;

    const feather = document.getElementById('feather');

    // After 30 seconds, shift to high-speed saccadic movement
    setTimeout(() => {
        if (feather) {
            feather.classList.remove('sweep-standard');
            feather.classList.add('sweep-saccadic');
            inst.innerText = 'INCREASED TRACKING SPEED';
        }
    }, 30000);

    // Auto-exit at 60 seconds
    setTimeout(exitProtocol, 60000);
}
