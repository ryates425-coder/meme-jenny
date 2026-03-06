/**
 * Meme creation editor. Image upload, text boxes (with line breaks), font/color,
 * AI suggestions, drag-to-position, download, and post to feed (Instant Storage + DB).
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { id } from '@instantdb/react';
import { db } from '../../lib/db';
import type { TextBox } from '../../instant.schema';

/** Available text colors for meme overlay */
const COLORS = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#ffff00', name: 'Yellow' },
  { hex: '#ff0000', name: 'Red' },
  { hex: '#ff6600', name: 'Orange' },
  { hex: '#00ff00', name: 'Green' },
  { hex: '#00ffff', name: 'Cyan' },
  { hex: '#0066ff', name: 'Blue' },
  { hex: '#ff00ff', name: 'Magenta' },
];

const MAX_TEXT_WIDTH_RATIO = 0.9;
const MAX_CANVAS_WIDTH = 700;

interface CreateMemeProps {
  user: { id: string; email?: string } | null;
  onPostSuccess?: () => void;
}

export default function CreateMeme({ user, onPostSuccess }: CreateMemeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([
    { text: '', pos: { x: 0.5, y: 0.12 } },
    { text: '', pos: { x: 0.5, y: 0.88 } },
  ]);
  const [fontSize, setFontSize] = useState(48);
  const [selectedColor, setSelectedColor] = useState('#ffffff');
  const [suggestStatus, setSuggestStatus] = useState('');
  const [postStatus, setPostStatus] = useState('');
  const [lastImageDataUrl, setLastImageDataUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lastBounds, setLastBounds] = useState<Array<{ left: number; right: number; top: number; bottom: number } | null>>([]);

  /** Split by newlines, then word-wrap each paragraph. Respects Enter key line breaks. */
  const wrapText = useCallback((ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const allLines: string[] = [];
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
  }, []);

  const drawMeme = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImage;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxWidth = Math.min(img.width, MAX_CANVAS_WIDTH);
    const scale = maxWidth / img.width;
    const width = img.width * scale;
    const height = img.height * scale;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const hasAnyText = textBoxes.some((b) => b.text.trim());
    const bounds: typeof lastBounds = [];

    if (hasAnyText) {
      ctx.font = `${fontSize}px Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'black';
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = Math.max(2, fontSize / 10);
      const maxTextWidth = width * MAX_TEXT_WIDTH_RATIO;
      const lineHeight = fontSize * 1.2;

      textBoxes.forEach((box, idx) => {
        const text = box.text.trim();
        if (!text) {
          bounds.push(null);
          return;
        }
        const lines = wrapText(ctx, text, maxTextWidth);
        const centerX = width * box.pos.x;
        const anchorY = height * box.pos.y;
        const startY = anchorY - ((lines.length - 1) * lineHeight) / 2;
        const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        bounds.push({
          left: centerX - maxLineW / 2 - 16,
          right: centerX + maxLineW / 2 + 16,
          top: startY - 8,
          bottom: startY + lines.length * lineHeight + 8,
        });
        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.strokeText(line, centerX, y);
          ctx.fillText(line, centerX, y);
        });
      });
    }
    setLastBounds(bounds);
  }, [textBoxes, fontSize, selectedColor, wrapText, loadedImage]);

  useEffect(() => {
    if (loadedImage) drawMeme();
  }, [drawMeme, loadedImage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setLoadedImage(img);
      setTextBoxes((prev) => {
        const next = [...prev];
        if (next[0]) next[0].pos = { x: 0.5, y: 0.12 };
        if (next[1]) next[1].pos = { x: 0.5, y: 0.88 };
        return next;
      });
      suggestMemeText(file);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const suggestMemeText = async (fileOrDataUrl: File | string) => {
    setSuggestStatus('Suggesting...');
    try {
      let dataUrl: string;
      if (typeof fileOrDataUrl === 'string') {
        dataUrl = fileOrDataUrl;
      } else {
        dataUrl = await fileToDataUrl(fileOrDataUrl);
        const resized = await resizeImageForApi(dataUrl);
        dataUrl = resized;
        setLastImageDataUrl(resized);
      }
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
      const topText = String(data.topText || '').trim();
      const bottomText = String(data.bottomText || '').trim();
      setTextBoxes((prev) => {
        const next = [...prev];
        while (next.length < 2) next.push({ text: '', pos: { x: 0.5, y: 0.5 } });
        next[0].text = topText;
        next[1].text = bottomText;
        return next;
      });
      setSuggestStatus('Suggested!');
      setTimeout(() => setSuggestStatus(''), 2000);
    } catch (err) {
      const msg = (err as Error).message;
      setSuggestStatus(
        msg.includes('fetch') ? 'Run server (npm start) for suggestions' : msg || 'Suggestion failed'
      );
      setTimeout(() => setSuggestStatus(''), 4000);
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const resizeImageForApi = (dataUrl: string) =>
    new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
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
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  /** Convert pointer/touch coords to canvas pixel coords */
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ev = 'touches' in e ? e.touches[0] : e;
    const clientX = 'clientX' in ev ? ev.clientX : 0;
    const clientY = 'clientY' in ev ? ev.clientY : 0;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const hitTest = (cx: number, cy: number) => {
    for (let i = lastBounds.length - 1; i >= 0; i--) {
      const b = lastBounds[i];
      if (b && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return i;
    }
    return null;
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!loadedImage || dragging !== null) return;
    const coords = getCanvasCoords(e);
    const hit = hitTest(coords.x, coords.y);
    if (hit !== null) {
      e.preventDefault();
      const box = textBoxes[hit];
      const canvas = canvasRef.current!;
      const anchorX = box.pos.x * canvas.width;
      const anchorY = box.pos.y * canvas.height;
      setDragging(hit);
      setDragOffset({ x: anchorX - coords.x, y: anchorY - coords.y });
    }
  };

  const handleCanvasPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoords(e);
    if (dragging !== null) {
      e.preventDefault();
      const canvas = canvasRef.current!;
      const newX = Math.max(0.05, Math.min(0.95, (coords.x + dragOffset.x) / canvas.width));
      const newY = Math.max(0.05, Math.min(0.95, (coords.y + dragOffset.y) / canvas.height));
      setTextBoxes((prev) => {
        const next = [...prev];
        if (next[dragging]) next[dragging] = { ...next[dragging], pos: { x: newX, y: newY } };
        return next;
      });
    }
  };

  const handleCanvasPointerUp = () => {
    setDragging(null);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) return;
    const link = document.createElement('a');
    link.download = `meme-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  /** Upload canvas to Instant Storage, create meme record, link file + user */
  const handlePostToFeed = async () => {
    if (!user || !loadedImage) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setPostStatus('Posting...');
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const file = new File([blob], `meme-${Date.now()}.png`, { type: 'image/png' });
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

      const { data: uploadData } = await db.storage.uploadFile(path, file, {
        contentType: 'image/png',
      });
      const fileId = uploadData?.id;
      if (!fileId) throw new Error('Upload failed');

      const memeId = id();
      await db.transact([
        db.tx.memes[memeId]
          .update({
            textBoxes: JSON.parse(JSON.stringify(textBoxes)),
            createdAt: Date.now(),
            voteCount: 0,
          })
          .link({ $file: fileId, $user: user.id }),
      ]);

      setPostStatus('Posted!');
      setTimeout(() => setPostStatus(''), 2000);
      onPostSuccess?.();
    } catch (err) {
      setPostStatus((err as Error).message || 'Failed to post');
      setTimeout(() => setPostStatus(''), 4000);
    }
  };

  const hasImage = !!loadedImage;

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="meme-image-upload"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#e94560',
              color: 'white',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Choose Image
          </label>
          <input
            id="meme-image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <span style={{ marginLeft: 12, fontSize: 14, color: '#888' }}>{suggestStatus}</span>
        </div>

        <button
          type="button"
          onClick={() => lastImageDataUrl && suggestMemeText(lastImageDataUrl)}
          disabled={!lastImageDataUrl}
          style={{
            width: '100%',
            padding: '8px 16px',
            marginBottom: 16,
            background: 'transparent',
            color: '#e94560',
            border: '1px solid rgba(233,69,96,0.5)',
            borderRadius: 8,
            cursor: lastImageDataUrl ? 'pointer' : 'not-allowed',
            opacity: lastImageDataUrl ? 1 : 0.5,
          }}
        >
          Suggest meme text
        </button>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 14, fontWeight: 500 }}>Text Boxes</label>
            <button
              type="button"
              onClick={() => setTextBoxes((p) => [...p, { text: '', pos: { x: 0.5, y: 0.5 } }])}
              style={{
                padding: '4px 12px',
                background: 'rgba(78,204,163,0.2)',
                color: '#4ecca3',
                border: '1px solid #4ecca3',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              + Add text box
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {textBoxes.map((box, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <textarea
                  value={box.text}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTextBoxes((p) => {
                      const n = [...p];
                      n[i] = { ...n[i], text: v };
                      return n;
                    });
                  }}
                  placeholder={`Text box ${i + 1}...`}
                  rows={2}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    color: '#e8e8e8',
                    fontSize: 16,
                  }}
                />
                <button
                  type="button"
                  onClick={() => textBoxes.length > 1 && setTextBoxes((p) => p.filter((_, j) => j !== i))}
                  disabled={textBoxes.length <= 1}
                  style={{
                    width: 32,
                    height: 32,
                    padding: 0,
                    background: 'rgba(233,69,96,0.2)',
                    color: '#e94560',
                    border: '1px solid rgba(233,69,96,0.5)',
                    borderRadius: 6,
                    cursor: textBoxes.length > 1 ? 'pointer' : 'not-allowed',
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
            Font Size: {fontSize}px
          </label>
          <input
            type="range"
            min={16}
            max={120}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: '#e94560' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
            Text Color
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
                style={{
                  width: 32,
                  height: 32,
                  padding: 0,
                  background: c.hex,
                  border: selectedColor === c.hex ? '3px solid #e94560' : '2px solid rgba(255,255,255,0.3)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 300,
          marginBottom: 24,
          position: 'relative',
        }}
      >
        {hasImage ? (
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasPointerDown}
            onMouseMove={handleCanvasPointerMove}
            onMouseUp={handleCanvasPointerUp}
            onMouseLeave={handleCanvasPointerUp}
            onTouchStart={handleCanvasPointerDown}
            onTouchMove={handleCanvasPointerMove}
            onTouchEnd={handleCanvasPointerUp}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 8,
              cursor: dragging !== null ? 'grabbing' : 'default',
            }}
          />
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Upload an image to get started</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={handleDownload}
          disabled={!hasImage}
          style={{
            padding: '10px 20px',
            background: '#4ecca3',
            color: '#1a1a2e',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: hasImage ? 'pointer' : 'not-allowed',
            opacity: hasImage ? 1 : 0.5,
          }}
        >
          Download Meme
        </button>
        <button
          onClick={handlePostToFeed}
          disabled={!user || !hasImage}
          title={!user ? 'Sign in to post' : ''}
          style={{
            padding: '10px 20px',
            background: user && hasImage ? '#e94560' : '#444',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: user && hasImage ? 'pointer' : 'not-allowed',
            opacity: user && hasImage ? 1 : 0.6,
          }}
        >
          Post to Feed
        </button>
        <span style={{ fontSize: 14, color: postStatus.includes('!') ? '#4ecca3' : postStatus ? '#e94560' : '#888' }}>
          {postStatus}
        </span>
      </div>
      {!user && (
        <p style={{ marginTop: 12, fontSize: 14, color: '#888' }}>Sign in to post memes to the feed.</p>
      )}
    </main>
  );
}
