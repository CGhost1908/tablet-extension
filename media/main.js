(function() {
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('draw');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearBtn');
    const recognizeBtn = document.getElementById('recognizeBtn');
    const startCalibrationBtn = document.getElementById('startCalibrationBtn');
    const confirmCalibrationBtn = document.getElementById('confirmCalibration');
    const skipCharBtn = document.getElementById('skipChar');
    const instructions = document.getElementById('instructions');
    const normalButtons = document.getElementById('normalButtons');
    const calibrationButtons = document.getElementById('calibrationButtons');

    let calibrationMode = false;
    let currentCalibrationChar = '';

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = '100vw';
        canvas.style.height = 'calc(100% - 50px)';
        
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let drawing = false;

    canvas.addEventListener('mousedown', (e) => {
        drawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('mouseup', () => {
        drawing = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
    });

    canvas.addEventListener('mouseleave', () => {
        drawing = false;
    });

    clearBtn.addEventListener('click', () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    recognizeBtn.addEventListener('click', () => {
        performOCR();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    startCalibrationBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'startCalibration' });
    });

    confirmCalibrationBtn.addEventListener('click', () => {
        if (!calibrationMode) return;
        
        const imageData = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        vscode.postMessage({
            type: 'calibrationData',
            char: currentCalibrationChar,
            image: imageData
        });
    });

    skipCharBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'nextCalibrationChar' });
    });

    document.getElementById('deleteButton').addEventListener('click', () => {
        vscode.postMessage({ type: 'editorAction', action: 'delete' });
    });

    document.getElementById('enterButton').addEventListener('click', () => {
        vscode.postMessage({ type: 'editorAction', action: 'enter' });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'e' || e.key === 'E' || e.key === 'b') {
            performOCR();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        
        if (message.type === 'startCalibration') {
            calibrationMode = true;
            currentCalibrationChar = message.char;
            instructions.textContent = `Lütfen "${currentCalibrationChar}" karakterini çizin ve "Onayla" butonuna basın`;
            
            normalButtons.style.display = 'none';
            calibrationButtons.style.display = 'flex';
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        else if (message.type === 'calibrationComplete') {
            calibrationMode = false;
            instructions.textContent = 'Kalibrasyon tamamlandı! Model eğitiliyor...';
            
            normalButtons.style.display = 'flex';
            calibrationButtons.style.display = 'none';
        }
    });

    function performOCR() {
        const base64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        vscode.postMessage({ type: 'saveAndOCR', data: base64 });
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
})();