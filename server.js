require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.post('/api/suggest', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'Suggestions disabled',
            message: 'Set ANTHROPIC_API_KEY environment variable to enable AI meme suggestions.'
        });
    }

    const { imageBase64, imageDataUrl } = req.body;
    let base64Data = imageBase64 || (imageDataUrl && imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : null);
    let mediaType = 'image/jpeg';

    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
        const match = imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
        if (match) mediaType = match[1];
    }

    if (!base64Data) {
        return res.status(400).json({ error: 'Missing imageBase64 or imageDataUrl in request body' });
    }

    const anthropic = new Anthropic({ apiKey });

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
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
Keep each under 50 chars. Output ONLY the two lines, nothing else. No numbering, no quotes, no explanation.`
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ]
        });

        const textBlock = message.content && Array.isArray(message.content)
            ? message.content.find(block => block && block.type === 'text')
            : null;
        let text = (textBlock?.text || '').trim();
        if (!text && typeof message.content === 'string') {
            text = message.content.trim();
        }
        const lines = text.split('\n')
            .map(s => s.replace(/^\d+[.)]\s*/, '').replace(/^[-*]\s*/, '').trim())
            .filter(Boolean);
        const topText = lines[0] || '';
        const bottomText = lines[1] || '';

        if (!topText && !bottomText && text) {
            console.log('Claude raw response:', JSON.stringify(text));
        }
        res.json({ topText, bottomText });
    } catch (err) {
        console.error('Claude API error:', err.message);
        res.status(500).json({
            error: 'Suggestion failed',
            message: err.message || 'Failed to get AI suggestions.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Meme Generator running at http://localhost:${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Tip: Set ANTHROPIC_API_KEY to enable AI meme suggestions.');
    }
});
