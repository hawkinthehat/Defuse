function launchCPI() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    const tasks = [
        { type: 'Reverse', text: 'SXT\'EKW' },
        { type: 'Reverse', text: 'DEFUSE' },
        { type: 'Math', text: '18 + 24 - 7' },
        { type: 'Anomaly', text: '1 1 1 1<br>1 0 1 1<br>1 1 1 1' }
    ];

    const active = tasks[Math.floor(Math.random() * tasks.length)];
    
    stage.innerHTML = `
        <div class="cpi-container">
            <p class="cpi-label">${active.type} TASK</p>
            <h2 class="cpi-content">${active.text}</h2>
        </div>
    `;
}
