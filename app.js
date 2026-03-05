/**
 * Meme Generator - Vanilla JavaScript Editor
 * Used by index-editor.html. Provides image upload, text overlay, AI suggestions,
 * download, and share via email/SMS. Supports multiple text boxes with drag-to-position.
 */
(function () {
    // --- DOM References ---
    const imageInput = document.getElementById('image-upload');
    const textBoxesContainer = document.getElementById('text-boxes-container');
    const addTextBtn = document.getElementById('add-text-btn');
    const fontSizeInput = document.getElementById('font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    const colorBlocks = document.getElementById('color-blocks');
    const downloadBtn = document.getElementById('download-btn');
    const canvas = document.getElementById('meme-canvas');
    const placeholder = document.getElementById('placeholder');
    const ctx = canvas.getContext('2d');

    // --- State ---
    let currentImage = null;
    let lastImageDataUrl = null; // Cached for "Suggest again"
    let textBoxes = [
        { text: '', pos: { x: 0.5, y: 0.12 } },
        { text: '', pos: { x: 0.5, y: 0.88 } },
    ];
    let dragging = null;
    let dragOffset = { x: 0, y: 0 };
    let lastBounds = []; // Hit-test bounds for each text box
    const MAX_TEXT_WIDTH_RATIO = 0.9;

    // --- Text Box UI ---
    /** Rebuilds the text box inputs in the DOM from textBoxes state */
    function renderTextBoxInputs() {
        textBoxesContainer.innerHTML = '';
        textBoxes.forEach((box, i) => {
            const item = document.createElement('div');
            item.className = 'text-box-item';
            const textarea = document.createElement('textarea');
            textarea.rows = 2;
            textarea.placeholder = `Text box ${i + 1}...`;
            textarea.value = box.text;
            textarea.dataset.index = String(i);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-text-btn';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remove text box';
            removeBtn.dataset.index = String(i);
            removeBtn.disabled = textBoxes.length <= 1;

            textarea.addEventListener('input', () => {
                textBoxes[i].text = textarea.value;
                drawMeme();
            });
            removeBtn.addEventListener('click', () => {
                if (textBoxes.length <= 1) return;
                textBoxes.splice(i, 1);
                renderTextBoxInputs();
                drawMeme();
            });

            item.appendChild(textarea);
            item.appendChild(removeBtn);
            textBoxesContainer.appendChild(item);
        });
    }

    // --- Canvas Helpers ---
    /** Converts pointer/touch coords to canvas pixel coords */
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    /** Splits text by newlines, then word-wraps each paragraph to maxWidth */
    function wrapText(text, maxWidth) {
        const allLines = [];
        const paragraphs = text.split(/\r?\n/);
        for (const para of paragraphs) {
            const words = para.split(' ');
            let currentLine = '';
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && currentLine) {
                    allLines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) allLines.push(currentLine);
        }
        return allLines.length > 0 ? allLines : [text];
    }

    /** Draws stroke + fill text (Impact-style meme text) */
    function drawStrokeText(text, x, y) {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }

    // --- Canvas Rendering ---
    /** Main draw loop: draws image + text overlays, updates hit-test bounds */
    function drawMeme() {
        if (!currentImage) {
            canvas.classList.remove('visible');
            placeholder.classList.remove('hidden');
            downloadBtn.disabled = true;
            if (typeof updateShareButtonState === 'function') updateShareButtonState();
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
        if (typeof updateShareButtonState === 'function') updateShareButtonState();

        ctx.drawImage(currentImage, 0, 0, width, height);

        const fontSize = parseInt(fontSizeInput.value, 10);
        const hasAnyText = textBoxes.some((b) => b.text.trim());
        lastBounds = [];

        if (hasAnyText) {
            ctx.font = `${fontSize}px Impact, sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'black';
            ctx.fillStyle = colorBlocks.querySelector('.color-block.selected')?.dataset.color || '#ffffff';
            ctx.lineWidth = Math.max(2, fontSize / 10);
            const maxTextWidth = width * MAX_TEXT_WIDTH_RATIO;
            const lineHeight = fontSize * 1.2;

            textBoxes.forEach((box, idx) => {
                const text = box.text.trim();
                if (!text) {
                    lastBounds.push(null);
                    return;
                }
                const lines = wrapText(text, maxTextWidth);
                const centerX = width * box.pos.x;
                const anchorY = height * box.pos.y;
                const startY = anchorY - ((lines.length - 1) * lineHeight) / 2;
                const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
                lastBounds.push({
                    left: centerX - maxLineW / 2 - 16,
                    right: centerX + maxLineW / 2 + 16,
                    top: startY - 8,
                    bottom: startY + lines.length * lineHeight + 8,
                });
                lines.forEach((line, i) => {
                    const y = startY + i * lineHeight;
                    drawStrokeText(line, centerX, y);
                });
            });
        }
    }

    // --- AI Suggestion ---
    /** Calls /api/suggest (Claude) to suggest top/bottom meme text from the image */
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
                body: JSON.stringify({ imageDataUrl: resizedDataUrl }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.message || data.error || 'Request failed');

            const topText = String(data.topText || '').trim();
            const bottomText = String(data.bottomText || '').trim();
            while (textBoxes.length < 2) textBoxes.push({ text: '', pos: { x: 0.5, y: 0.5 } });
            textBoxes[0].text = topText;
            textBoxes[1].text = bottomText;
            renderTextBoxInputs();
            drawMeme();

            statusEl.textContent = 'Suggested!';
            statusEl.className = 'suggestion-status success';
            suggestAgainBtn.disabled = !lastImageDataUrl;
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'suggestion-status';
            }, 2000);
        } catch (err) {
            const msg = err.message || 'Suggestion failed';
            statusEl.textContent =
                msg.includes('fetch') || msg.includes('Failed to fetch')
                    ? 'Run server (npm start) for suggestions'
                    : 'Suggestion failed';
            statusEl.className = 'suggestion-status error';
            suggestAgainBtn.disabled = !lastImageDataUrl;
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'suggestion-status';
            }, 4000);
        }
    }

    /** Resize image to max 800px for API to reduce token usage */
    function resizeImageForApi(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const maxDim = 800;
                let w = img.width,
                    h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL('image/jpeg', 0.85));
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

    // --- Event Handlers ---
    function handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            currentImage = img;
            lastImageDataUrl = null;
            textBoxes.forEach((box, i) => {
                if (i === 0) box.pos = { x: 0.5, y: 0.12 };
                else if (i === 1) box.pos = { x: 0.5, y: 0.88 };
            });
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
        const name = `meme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const link = document.createElement('a');
        link.download = name;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /** Returns index of text box at (cx, cy) or null */
    function hitTest(cx, cy) {
        for (let i = lastBounds.length - 1; i >= 0; i--) {
            const b = lastBounds[i];
            if (b && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return i;
        }
        return null;
    }

    function handleCanvasPointerDown(e) {
        if (!currentImage || dragging !== null) return;
        const coords = getCanvasCoords(e);
        const hit = hitTest(coords.x, coords.y);
        if (hit !== null) {
            e.preventDefault();
            dragging = hit;
            canvas.style.cursor = 'grabbing';
            const pos = textBoxes[hit].pos;
            const anchorX = pos.x * canvas.width;
            const anchorY = pos.y * canvas.height;
            dragOffset = { x: anchorX - coords.x, y: anchorY - coords.y };
        }
    }

    function handleCanvasPointerMove(e) {
        const coords = getCanvasCoords(e);
        if (dragging !== null) {
            e.preventDefault();
            const pos = textBoxes[dragging].pos;
            const newX = Math.max(0.05, Math.min(0.95, (coords.x + dragOffset.x) / canvas.width));
            const newY = Math.max(0.05, Math.min(0.95, (coords.y + dragOffset.y) / canvas.height));
            pos.x = newX;
            pos.y = newY;
            drawMeme();
        } else if (currentImage) {
            const hit = hitTest(coords.x, coords.y);
            canvas.style.cursor = hit !== null ? 'grab' : 'default';
        }
    }

    function handleCanvasPointerUp(e) {
        if (dragging !== null) e.preventDefault();
        dragging = null;
        canvas.style.cursor = 'default';
    }

    // --- Share Section ---
    const shareTabs = document.querySelectorAll('.share-tab');
    const shareEmailGroup = document.querySelector('.share-email');
    const shareSmsGroup = document.querySelector('.share-sms');
    const shareEmailInput = document.getElementById('share-email');
    const sharePhoneInput = document.getElementById('share-phone');
    const sendEmailBtn = document.getElementById('send-email-btn');
    const sendSmsBtn = document.getElementById('send-sms-btn');
    const shareStatus = document.getElementById('share-status');

    shareTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            shareTabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.mode;
            shareEmailGroup.classList.toggle('hidden', mode !== 'email');
            shareSmsGroup.classList.toggle('hidden', mode !== 'sms');
            shareStatus.textContent = '';
        });
    });

    function updateShareButtonState() {
        const hasImage = !!currentImage;
        sendEmailBtn.disabled = !hasImage;
        sendSmsBtn.disabled = !hasImage;
    }

    function setShareStatus(text, className = '') {
        shareStatus.textContent = text;
        shareStatus.className = 'share-status ' + className;
        if (className) setTimeout(() => {
            shareStatus.textContent = '';
            shareStatus.className = 'share-status';
        }, 3000);
    }

    async function handleSendEmail() {
        if (!currentImage) return;
        const email = shareEmailInput.value.trim();
        if (!email) {
            setShareStatus('Enter an email address', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setShareStatus('Enter a valid email', 'error');
            return;
        }
        sendEmailBtn.disabled = true;
        shareStatus.textContent = 'Sending...';
        shareStatus.className = 'share-status loading';
        try {
            const res = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, imageDataUrl: canvas.toDataURL('image/png') }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || 'Failed to send');
            setShareStatus('Email sent! ✓', 'success');
        } catch (err) {
            setShareStatus(err.message || 'Failed to send email', 'error');
        } finally {
            sendEmailBtn.disabled = !currentImage;
        }
    }

    async function handleSendSms() {
        if (!currentImage) return;
        const phone = sharePhoneInput.value.trim();
        if (!phone) {
            setShareStatus('Enter a phone number', 'error');
            return;
        }
        sendSmsBtn.disabled = true;
        shareStatus.textContent = 'Sending...';
        shareStatus.className = 'share-status loading';
        try {
            const res = await fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, imageDataUrl: canvas.toDataURL('image/png') }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || 'Failed to send');
            setShareStatus('SMS sent! ✓', 'success');
        } catch (err) {
            setShareStatus(err.message || 'Failed to send SMS', 'error');
        } finally {
            sendSmsBtn.disabled = !currentImage;
        }
    }

    // --- Bind Events ---
    document.getElementById('suggest-again-btn').addEventListener('click', () => {
        if (lastImageDataUrl) suggestMemeText(lastImageDataUrl);
    });

    addTextBtn.addEventListener('click', () => {
        textBoxes.push({ text: '', pos: { x: 0.5, y: 0.5 } });
        renderTextBoxInputs();
        drawMeme();
    });

    imageInput.addEventListener('change', handleImageSelect);
    fontSizeInput.addEventListener('input', () => {
        fontSizeValue.textContent = fontSizeInput.value;
        drawMeme();
    });
    colorBlocks.addEventListener('click', (e) => {
        const block = e.target.closest('.color-block');
        if (!block) return;
        colorBlocks.querySelectorAll('.color-block').forEach((b) => b.classList.remove('selected'));
        block.classList.add('selected');
        drawMeme();
    });
    downloadBtn.addEventListener('click', handleDownload);
    sendEmailBtn.addEventListener('click', handleSendEmail);
    sendSmsBtn.addEventListener('click', handleSendSms);

    canvas.addEventListener('mousedown', handleCanvasPointerDown);
    canvas.addEventListener('mousemove', handleCanvasPointerMove);
    canvas.addEventListener('mouseup', handleCanvasPointerUp);
    canvas.addEventListener('mouseleave', handleCanvasPointerUp);
    canvas.addEventListener('touchstart', handleCanvasPointerDown, { passive: false });
    canvas.addEventListener('touchmove', handleCanvasPointerMove, { passive: false });
    canvas.addEventListener('touchend', handleCanvasPointerUp, { passive: false });

    // --- Init ---
    renderTextBoxInputs();
    fontSizeValue.textContent = fontSizeInput.value;
    updateShareButtonState();
})();
