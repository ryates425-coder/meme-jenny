(function () {
    const imageInput = document.getElementById('image-upload');
    const topTextInput = document.getElementById('top-text');
    const bottomTextInput = document.getElementById('bottom-text');
    const fontSizeInput = document.getElementById('font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    const colorBlocks = document.getElementById('color-blocks');
    const downloadBtn = document.getElementById('download-btn');
    const canvas = document.getElementById('meme-canvas');
    const placeholder = document.getElementById('placeholder');
    const ctx = canvas.getContext('2d');

    let currentImage = null;
    let lastImageDataUrl = null;
    let topTextPos = { x: 0.5, y: 0.12 };
    let bottomTextPos = { x: 0.5, y: 0.88 };
    let dragging = null;
    let dragOffset = { x: 0, y: 0 };
    let lastTopBounds = null;
    let lastBottomBounds = null;
    const PADDING = 24;
    const MAX_TEXT_WIDTH_RATIO = 0.9;

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function drawMeme() {
        if (!currentImage) {
            canvas.classList.remove('visible');
            placeholder.classList.remove('hidden');
            downloadBtn.disabled = true;
            return;
        }

        const maxWidth = Math.min(currentImage.width, 700);
        const scale = maxWidth / currentImage.width;
        const width = currentImage.width * scale;
        const height = currentImage.height * scale;

        canvas.width = width;
        canvas.height = height;
        canvas.classList.add('visible');
        placeholder.classList.add('hidden');
        downloadBtn.disabled = false;

        ctx.drawImage(currentImage, 0, 0, width, height);

        const fontSize = parseInt(fontSizeInput.value, 10);
        const topText = topTextInput.value.trim();
        const bottomText = bottomTextInput.value.trim();

        if (topText || bottomText) {
            ctx.font = `${fontSize}px Impact, sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'black';
            ctx.fillStyle = colorBlocks.querySelector('.color-block.selected')?.dataset.color || '#ffffff';
            ctx.lineWidth = Math.max(2, fontSize / 10);

            const maxTextWidth = width * MAX_TEXT_WIDTH_RATIO;

            if (topText) {
                const lines = wrapText(topText, maxTextWidth);
                const lineHeight = fontSize * 1.2;
                const centerX = width * topTextPos.x;
                const startY = height * topTextPos.y;
                const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
                lastTopBounds = {
                    left: centerX - maxLineW / 2 - 16,
                    right: centerX + maxLineW / 2 + 16,
                    top: startY - fontSize * 0.8,
                    bottom: startY + lines.length * lineHeight + 8
                };
                lines.forEach((line, i) => {
                    const y = startY + i * lineHeight;
                    drawStrokeText(line, centerX, y);
                });
            } else {
                lastTopBounds = null;
            }

            if (bottomText) {
                const lines = wrapText(bottomText, maxTextWidth);
                const lineHeight = fontSize * 1.2;
                const centerX = width * bottomTextPos.x;
                const lastLineY = height * bottomTextPos.y;
                const startY = lastLineY - (lines.length - 1) * lineHeight;
                const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
                lastBottomBounds = {
                    left: centerX - maxLineW / 2 - 16,
                    right: centerX + maxLineW / 2 + 16,
                    top: startY - 8,
                    bottom: lastLineY + fontSize * 0.3
                };
                lines.forEach((line, i) => {
                    const y = startY + i * lineHeight;
                    drawStrokeText(line, centerX, y);
                });
            } else {
                lastBottomBounds = null;
            }
        }
    }

    function drawStrokeText(text, x, y) {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }

    function wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        return lines.length > 0 ? lines : [text];
    }

    async function suggestMemeText(fileOrDataUrl) {
        const statusEl = document.getElementById('suggestion-status');
        const suggestAgainBtn = document.getElementById('suggest-again-btn');
        statusEl.textContent = 'Suggesting meme text...';
        statusEl.className = 'suggestion-status loading';
        suggestAgainBtn.disabled = true;

        try {
            let resizedDataUrl;
            if (typeof fileOrDataUrl === 'string') {
                resizedDataUrl = fileOrDataUrl;
            } else {
                const imageDataUrl = await fileToDataUrl(fileOrDataUrl);
                resizedDataUrl = await resizeImageForApi(imageDataUrl);
                lastImageDataUrl = resizedDataUrl;
            }
            const res = await fetch('/api/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageDataUrl: resizedDataUrl })
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || data.error || 'Request failed');
            }
            const topText = String(data.topText || '').trim();
            const bottomText = String(data.bottomText || '').trim();
            topTextInput.value = topText;
            bottomTextInput.value = bottomText;
            drawMeme();
            statusEl.textContent = 'Suggested!';
            statusEl.className = 'suggestion-status success';
            suggestAgainBtn.disabled = !lastImageDataUrl;
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'suggestion-status'; }, 2000);
        } catch (err) {
            const msg = err.message || 'Suggestion failed';
            statusEl.textContent = msg.includes('fetch') || msg.includes('Failed to fetch')
                ? 'Run server (npm start) for suggestions'
                : 'Suggestion failed';
            statusEl.className = 'suggestion-status error';
            suggestAgainBtn.disabled = !lastImageDataUrl;
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'suggestion-status'; }, 4000);
        }
    }

    function resizeImageForApi(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const maxDim = 800;
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * maxDim / w);
                        w = maxDim;
                    } else {
                        w = Math.round(w * maxDim / h);
                        h = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            currentImage = img;
            lastImageDataUrl = null;
            topTextPos = { x: 0.5, y: 0.12 };
            bottomTextPos = { x: 0.5, y: 0.88 };
            drawMeme();
            suggestMemeText(file);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            console.error('Failed to load image');
        };
        img.src = url;
    }

    function handleDownload() {
        if (!currentImage) return;
        const link = document.createElement('a');
        link.download = 'meme.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function updateFontSizeLabel() {
        fontSizeValue.textContent = fontSizeInput.value;
    }

    document.getElementById('suggest-again-btn').addEventListener('click', () => {
        if (lastImageDataUrl) suggestMemeText(lastImageDataUrl);
    });

    imageInput.addEventListener('change', handleImageSelect);
    topTextInput.addEventListener('input', drawMeme);
    bottomTextInput.addEventListener('input', drawMeme);
    fontSizeInput.addEventListener('input', () => {
        updateFontSizeLabel();
        drawMeme();
    });
    colorBlocks.addEventListener('click', (e) => {
        const block = e.target.closest('.color-block');
        if (!block) return;
        colorBlocks.querySelectorAll('.color-block').forEach(b => b.classList.remove('selected'));
        block.classList.add('selected');
        drawMeme();
    });
    downloadBtn.addEventListener('click', handleDownload);

    function hitTest(cx, cy) {
        if (lastTopBounds && cx >= lastTopBounds.left && cx <= lastTopBounds.right &&
            cy >= lastTopBounds.top && cy <= lastTopBounds.bottom) return 'top';
        if (lastBottomBounds && cx >= lastBottomBounds.left && cx <= lastBottomBounds.right &&
            cy >= lastBottomBounds.top && cy <= lastBottomBounds.bottom) return 'bottom';
        return null;
    }

    function handleCanvasPointerDown(e) {
        if (!currentImage || dragging) return;
        const coords = getCanvasCoords(e);
        const hit = hitTest(coords.x, coords.y);
        if (hit) {
            e.preventDefault();
            dragging = hit;
            canvas.style.cursor = 'grabbing';
            const anchorX = (hit === 'top' ? topTextPos : bottomTextPos).x * canvas.width;
            const anchorY = (hit === 'top' ? topTextPos.y : bottomTextPos.y) * canvas.height;
            dragOffset = { x: anchorX - coords.x, y: anchorY - coords.y };
        }
    }

    function handleCanvasPointerMove(e) {
        const coords = getCanvasCoords(e);
        if (dragging) {
            e.preventDefault();
            const pos = dragging === 'top' ? topTextPos : bottomTextPos;
            const newX = Math.max(0.05, Math.min(0.95, (coords.x + dragOffset.x) / canvas.width));
            const newY = Math.max(0.05, Math.min(0.95, (coords.y + dragOffset.y) / canvas.height));
            pos.x = newX;
            pos.y = newY;
            drawMeme();
        } else if (currentImage) {
            const hit = hitTest(coords.x, coords.y);
            canvas.style.cursor = hit ? 'grab' : 'default';
        }
    }

    function handleCanvasPointerUp(e) {
        if (dragging) e.preventDefault();
        dragging = null;
        canvas.style.cursor = 'default';
    }

    canvas.addEventListener('mousedown', handleCanvasPointerDown);
    canvas.addEventListener('mousemove', handleCanvasPointerMove);
    canvas.addEventListener('mouseup', handleCanvasPointerUp);
    canvas.addEventListener('mouseleave', handleCanvasPointerUp);
    canvas.addEventListener('touchstart', handleCanvasPointerDown, { passive: false });
    canvas.addEventListener('touchmove', handleCanvasPointerMove, { passive: false });
    canvas.addEventListener('touchend', handleCanvasPointerUp, { passive: false });

    updateFontSizeLabel();
})();
