 function launchCPI() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    const tasks = [
        { q: 'REVERSE & TYPE:<br>"SXT\'EKW"', a: 'WKE\'TXS' },
        { q: 'REVERSE & TYPE:<br>"DEFUSE"', a: 'ESUFED' },
        { q: 'CALCULATE:<br>22 + 18 - 5', a: '35' },
        { q: 'FIND THE 0 & TYPE POS:<br>11111<br>11011<br>11111', a: '8' }
    ];

    const active = tasks[Math.floor(Math.random() * tasks.length)];
    
    stage.innerHTML = `
        <div class="cpi-container" id="cpi-box">
            <p class="cpi-label">LOGIC ENGAGEMENT REQUIRED</p>
            <h2 class="cpi-content">${active.q}</h2>
            <input type="text" id="cpi-input" autocomplete="off" autofocus placeholder="ENTER DATA...">
        </div>
    `;

    const input = document.getElementById('cpi-input');
    input.focus();

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (input.value.toUpperCase() === active.a) {
                // SUCCESS: Flash Teal and Exit
                document.getElementById('cpi-box').style.borderColor = 'var(--teal)';
                setTimeout(exitProtocol, 400);
            } else {
                // ERROR: Shake and Flash Red (No grey boxes)
                const box = document.getElementById('cpi-box');
                box.classList.add('cpi-error');
                input.value = '';
                setTimeout(() => box.classList.remove('cpi-error'), 500);
            }
        }
    });
}
