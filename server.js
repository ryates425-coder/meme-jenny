/**
 * Meme Generator - Express API Server
 * Serves static files, React build (if dist exists), and API routes:
 * - /api/suggest: AI meme text via Claude
 * - /api/send-email: Email meme image
 * - /api/send-sms: SMS/MMS meme image (Twilio)
 * - /meme/:id: Temporary image URL for MMS (expires in 10 min)
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk').default;
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// --- In-memory store for MMS images (Twilio needs public URL) ---
const memeStore = new Map();
const MEME_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupExpiredMemes() {
    const now = Date.now();
    for (const [id, entry] of memeStore.entries()) {
        if (now > entry.expires) memeStore.delete(id);
    }
}
setInterval(cleanupExpiredMemes, 60 * 1000);

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));

// Serve React app from dist/ if built; then fallback to project root
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}
app.use(express.static(path.join(__dirname)));

// --- Routes ---

/** Serves temporarily stored meme image for MMS. Used by /api/send-sms. */
app.get('/meme/:id', (req, res) => {
    const entry = memeStore.get(req.params.id);
    if (!entry || Date.now() > entry.expires) {
        return res.status(404).send('Meme not found or expired');
    }
    const base64 = entry.imageDataUrl.includes(',') ? entry.imageDataUrl.split(',')[1] : entry.imageDataUrl;
    const match = entry.imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
    const contentType = match ? match[1] : 'image/png';
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(base64, 'base64'));
});

/**
 * AI meme text suggestion using Claude. Sends resized image, returns topText + bottomText.
 * Requires ANTHROPIC_API_KEY in .env.
 */
app.post('/api/suggest', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'Suggestions disabled',
            message: 'Set ANTHROPIC_API_KEY environment variable to enable AI meme suggestions.',
        });
    }

    const { imageBase64, imageDataUrl } = req.body;
    const base64Data =
        imageBase64 || (imageDataUrl && imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : null);
    let mediaType = 'image/jpeg';
    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
        const match = imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
        if (match) mediaType = match[1];
    }

    if (!base64Data) {
        return res.status(400).json({ error: 'Missing imageBase64 or imageDataUrl in request body' });
    }

    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

    try {
        const message = await anthropic.messages.create({
            model,
            max_tokens: 150,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Look at this image and suggest meme text. Reply with exactly 2 lines separated by a single newline.
Line 1 (top): Short funny caption for the top.
Line 2 (bottom): Punchline for the bottom.
Keep each under 50 chars. Output ONLY the two lines, nothing else. No numbering, no quotes, no explanation.`,
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Data,
                            },
                        },
                    ],
                },
            ],
        });

        const textBlock =
            message.content && Array.isArray(message.content)
                ? message.content.find((block) => block && block.type === 'text')
                : null;
        let text = (textBlock?.text || '').trim();
        if (!text && typeof message.content === 'string') {
            text = message.content.trim();
        }
        const lines = text
            .split('\n')
            .map((s) => s.replace(/^\d+[.)]\s*/, '').replace(/^[-*]\s*/, '').trim())
            .filter(Boolean);
        const topText = lines[0] || '';
        const bottomText = lines[1] || '';

        res.json({ topText, bottomText });
    } catch (err) {
        const msg = err?.message || String(err);
        const status = err?.status;
        const type = err?.type;
        console.error('Claude API error:', { message: msg, status, type, model });
        const userMsg =
            status === 401
                ? 'Invalid API key. Check ANTHROPIC_API_KEY in Railway variables.'
                : status === 429
                  ? 'Rate limit exceeded. Try again in a moment.'
                  : status === 400
                    ? 'Invalid request (check image size < 5MB).'
                    : msg || 'Failed to get AI suggestions.';
        res.status(500).json({
            error: 'Suggestion failed',
            message: userMsg,
        });
    }
});

/**
 * Sends meme image via email. Requires GMAIL_* or MAIL_* env vars.
 */
app.post('/api/send-email', async (req, res) => {
    const { email, imageDataUrl } = req.body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Valid email address required' });
    }
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'Image data required' });
    }

    const transporterConfig = {};
    if (process.env.MAIL_HOST) {
        transporterConfig.host = process.env.MAIL_HOST;
        transporterConfig.port = parseInt(process.env.MAIL_PORT || '587', 10);
        transporterConfig.secure = process.env.MAIL_SECURE === 'true';
        transporterConfig.auth = {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        };
    } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        transporterConfig.service = 'gmail';
        transporterConfig.auth = {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        };
    } else {
        return res.status(503).json({
            error: 'Email not configured',
            message: 'Set MAIL_HOST/MAIL_USER/MAIL_PASS or GMAIL_USER/GMAIL_APP_PASSWORD in .env',
        });
    }

    const transporter = nodemailer.createTransport(transporterConfig);
    const base64Data = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
    const contentTypeMatch = imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
    const contentType = contentTypeMatch ? contentTypeMatch[1] : 'image/png';
    const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';

    try {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || process.env.GMAIL_USER || process.env.MAIL_USER,
            to: email.trim(),
            subject: 'Your Meme 🎉',
            text: 'Check out the meme you created! See the attached image.',
            attachments: [
                {
                    filename: `meme.${ext}`,
                    content: Buffer.from(base64Data, 'base64'),
                    contentType,
                },
            ],
        });
        res.json({ success: true, message: 'Email sent!' });
    } catch (err) {
        console.error('Email error:', err.message);
        res.status(500).json({ error: 'Failed to send email', message: err.message });
    }
});

/**
 * Sends meme image via SMS/MMS (Twilio). Stores image temporarily for public URL.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER. Use ngrok + PUBLIC_URL for localhost.
 */
app.post('/api/send-sms', async (req, res) => {
    const { phone, imageDataUrl } = req.body;
    if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ error: 'Phone number required' });
    }
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'Image data required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
        return res.status(503).json({
            error: 'SMS not configured',
            message: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env',
        });
    }

    const id = crypto.randomBytes(8).toString('hex');
    memeStore.set(id, { imageDataUrl, expires: Date.now() + MEME_TTL_MS });

    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const mediaUrl = `${baseUrl}/meme/${id}`;

    try {
        const client = twilio(accountSid, authToken);
        const toPhone = phone.trim().replace(/\D/g, '');
        const e164 =
            toPhone.length === 10 ? '+1' + toPhone : toPhone.startsWith('1') ? '+' + toPhone : '+' + toPhone;
        await client.messages.create({
            body: 'Your meme is ready! 🎉',
            from: fromNumber,
            to: e164,
            mediaUrl: [mediaUrl],
        });
        res.json({ success: true, message: 'SMS sent!' });
    } catch (err) {
        memeStore.delete(id);
        console.error('SMS error:', err.message);
        const hint =
            mediaUrl.includes('localhost') || mediaUrl.includes('127.0.0.1')
                ? ' For local dev, use ngrok (ngrok http 3000) and set PUBLIC_URL in .env'
                : '';
        res.status(500).json({ error: 'Failed to send SMS', message: err.message + hint });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Meme Generator running at http://localhost:${PORT}`);
    if (fs.existsSync(distPath)) {
        console.log('Serving React app from dist/');
    } else {
        console.log('Tip: Run "npm run build:feed" then restart to serve the React feed app.');
    }
    if (!process.env.ANTHROPIC_API_KEY)
        console.log('Tip: Set ANTHROPIC_API_KEY to enable AI meme suggestions.');
    if (!process.env.GMAIL_USER && !process.env.MAIL_HOST)
        console.log('Tip: Set GMAIL_* or MAIL_* in .env to enable email sharing.');
    if (!process.env.TWILIO_ACCOUNT_SID)
        console.log('Tip: Set TWILIO_* in .env to enable SMS sharing (use ngrok + PUBLIC_URL for local dev).');
});
