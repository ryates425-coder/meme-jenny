# Meme Generator

A simple web app for creating memes. Upload an image, add top and bottom text with custom sizing, and download your meme as a PNG. Optionally use AI-powered suggestions to generate meme text from your image.

## Features

- Upload any image as a template
- Add top and bottom text (classic meme format)
- Resize text with a slider (16px–120px)
- White text with black outline
- Download as PNG
- **AI meme suggestions** – When you upload an image, the app can suggest top and bottom text based on the image content (requires Anthropic API key)

## How to Run

**Option 1:** Open `index.html` directly in a modern web browser. Meme creation works, but AI suggestions will not be available.

**Option 2:** Run the app with the built-in server for AI suggestions:

```bash
npm install
npm start
```

Then open http://localhost:3000.

### Enabling AI Suggestions

To enable meme text suggestions when you upload an image:

1. Create an [Anthropic API key](https://console.anthropic.com/)
2. Copy `.env.example` to `.env` and add your key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
   Or set the environment variable when starting the server (see `.env.example`).

Without the API key, the app still works for creating memes; suggestions are simply skipped.

## Usage

1. Click **Choose Image** to select a template image from your device
2. If the server is running with an API key, suggested text will appear automatically
3. Enter or edit text in the **Top Text** and/or **Bottom Text** fields
4. Adjust **Font Size** with the slider
5. Click **Download Meme** to save your meme as a PNG file
