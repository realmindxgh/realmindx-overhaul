/**
 * ImageCropModal — drag/zoom/pinch crop before upload.
 * No dependencies beyond React. Uses Canvas API.
 *
 * Props:
 *   src         – data URL of the image to crop
 *   aspectRatio – width/height ratio of crop frame (default 1 = square)
 *   title       – modal heading
 *   onCrop(file, dataUrl) – called with the cropped File + preview URL
 *   onCancel()  – called when user dismisses
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';

const FRAME = 520; // crop frame long edge in CSS px

export default function ImageCropModal({
  src,
  aspectRatio = 1,
  title = 'Crop Image',
  onCrop,
  onCancel,
}) {
  const canvasRef  = useRef(null);
  const imgRef     = useRef(null);
  const drag       = useRef({ on: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const lastTouches = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [scale,  setScale]  = useState(1);
  const [minSc,  setMinSc]  = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Crop frame size
  const CW = aspectRatio >= 1 ? FRAME : Math.round(FRAME * aspectRatio);
  const CH = aspectRatio >= 1 ? Math.round(FRAME / aspectRatio) : FRAME;
  // Canvas size (crop frame + padding)
  const PAD = 40;
  const VW = CW + PAD * 2;
  const VH = CH + PAD * 2;
  const cropX = PAD;
  const cropY = PAD;

  // ── Clamp offset so image always covers crop frame ──────────────
  const clamp = useCallback((ox, oy, sc) => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const dw = img.naturalWidth  * sc;
    const dh = img.naturalHeight * sc;
    const imgX = (VW - dw) / 2 + ox;
    const imgY = (VH - dh) / 2 + oy;
    const maxOx = ox - Math.min(0, imgX - cropX);
    const minOx = ox - Math.max(0, imgX + dw - (cropX + CW));
    const maxOy = oy - Math.min(0, imgY - cropY);
    const minOy = oy - Math.max(0, imgY + dh - (cropY + CH));
    return {
      x: Math.max(minOx, Math.min(maxOx, ox)),
      y: Math.max(minOy, Math.min(maxOy, oy)),
    };
  }, [VW, VH, cropX, cropY, CW, CH]);

  // ── Draw ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, VW, VH);

    // Image
    const dw = img.naturalWidth  * scale;
    const dh = img.naturalHeight * scale;
    const ix = (VW - dw) / 2 + offset.x;
    const iy = (VH - dh) / 2 + offset.y;
    ctx.drawImage(img, ix, iy, dw, dh);

    // Dark vignette outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0,           VW,      cropY);           // top
    ctx.fillRect(0, cropY + CH,  VW,      VH);              // bottom
    ctx.fillRect(0, cropY,       cropX,   CH);              // left
    ctx.fillRect(cropX + CW, cropY, PAD,  CH);              // right

    // Gold crop border
    ctx.strokeStyle = '#ffcc01';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cropX, cropY, CW, CH);

    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,204,1,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cropX + CW * i / 3, cropY);
      ctx.lineTo(cropX + CW * i / 3, cropY + CH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cropX, cropY + CH * i / 3);
      ctx.lineTo(cropX + CW, cropY + CH * i / 3);
      ctx.stroke();
    }

    // Corner handles
    const hs = 14;
    ctx.strokeStyle = '#ffcc01';
    ctx.lineWidth = 3;
    [[cropX, cropY, 1, 1], [cropX+CW, cropY, -1, 1],
     [cropX, cropY+CH, 1, -1], [cropX+CW, cropY+CH, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + dy * hs); ctx.lineTo(x, y); ctx.lineTo(x + dx * hs, y); ctx.stroke();
    });
  }, [loaded, scale, offset, VW, VH, cropX, cropY, CW, CH, PAD]);

  useEffect(() => { draw(); }, [draw]);

  // ── Image load ───────────────────────────────────────────────────
  const onLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const ms = Math.max(CW / img.naturalWidth, CH / img.naturalHeight);
    setMinSc(ms);
    setScale(ms * 1.01); // tiny zoom so image fully covers frame
    setOffset({ x: 0, y: 0 });
    setLoaded(true);
  }, [CW, CH]);

  // ── Mouse drag ───────────────────────────────────────────────────
  const onMouseDown  = e => { drag.current = { on: true, sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }; };
  const onMouseMove  = useCallback(e => {
    if (!drag.current.on) return;
    setOffset(clamp(drag.current.ox + e.clientX - drag.current.sx, drag.current.oy + e.clientY - drag.current.sy, scale));
  }, [clamp, scale]);
  const onMouseUp    = () => { drag.current.on = false; };

  // ── Scroll zoom ──────────────────────────────────────────────────
  const onWheel = useCallback(e => {
    e.preventDefault();
    const ns = Math.max(minSc, Math.min(scale * (e.deltaY < 0 ? 1.12 : 0.9), minSc * 6));
    setScale(ns);
    setOffset(o => clamp(o.x, o.y, ns));
  }, [scale, minSc, clamp]);

  // ── Touch ────────────────────────────────────────────────────────
  const onTouchStart = e => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      drag.current = { on: true, sx: t.clientX, sy: t.clientY, ox: offset.x, oy: offset.y };
    }
    lastTouches.current = Array.from(e.touches);
  };
  const onTouchMove = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current.on) {
      const t = e.touches[0];
      setOffset(clamp(drag.current.ox + t.clientX - drag.current.sx, drag.current.oy + t.clientY - drag.current.sy, scale));
    } else if (e.touches.length === 2 && lastTouches.current?.length === 2) {
      const d = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const prev = d(lastTouches.current[0], lastTouches.current[1]);
      const curr = d(e.touches[0], e.touches[1]);
      const ns = Math.max(minSc, Math.min(scale * (curr / prev), minSc * 6));
      setScale(ns);
      setOffset(o => clamp(o.x, o.y, ns));
    }
    lastTouches.current = Array.from(e.touches);
  }, [scale, minSc, clamp]);
  const onTouchEnd = () => { drag.current.on = false; };

  // ── Export crop at FULL source resolution ────────────────────────
  // Map the crop frame back to native image pixels so no quality is lost.
  const applyCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    // Image position in canvas space
    const dw = img.naturalWidth  * scale;
    const dh = img.naturalHeight * scale;
    const ix = (VW - dw) / 2 + offset.x;
    const iy = (VH - dh) / 2 + offset.y;

    // Convert crop frame to source image coordinates (pixels in the original file)
    const srcX = (cropX - ix) / scale;
    const srcY = (cropY - iy) / scale;
    const srcW = CW / scale;
    const srcH = CH / scale;

    // Output at the true source resolution — preserves every pixel from the original
    const outW = Math.round(srcW);
    const outH = Math.round(srcH);

    const out = document.createElement('canvas');
    out.width  = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled  = true;
    ctx.imageSmoothingQuality  = 'high';
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    const dataUrl = out.toDataURL('image/jpeg', 0.95);
    out.toBlob(blob => {
      onCrop(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }), dataUrl);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      background: 'rgba(10,22,55,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, backdropFilter: 'blur(6px)',
    }}>
      <div style={{ position: 'relative', background: '#fff', borderRadius: 18, padding: '24px 24px 20px', maxWidth: `min(${VW + 80}px, 95vw)`, width: '100%', maxHeight: 'calc(100svh - 32px)', overflowY: 'auto' }}>
        <button type="button" onClick={onCancel} aria-label="Close image cropper" style={{
          position: 'sticky', top: 0, zIndex: 3, float: 'right', marginBottom: -38,
          width: 38, height: 38, display: 'grid', placeItems: 'center',
          border: '1.5px solid #d9e1ee', borderRadius: '50%',
          background: '#fff', color: '#143670', fontSize: 23,
          lineHeight: 1, cursor: 'pointer',
        }}>&times;</button>
        <h3 style={{ margin: '0 0 4px', fontFamily: 'Montserrat,sans-serif', fontWeight: 900, fontSize: 17, color: '#143670' }}>{title}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#6b7a99' }}>Drag to reposition · Scroll or pinch to zoom</p>

        <canvas
          ref={canvasRef} width={VW} height={VH}
          style={{ display: 'block', borderRadius: 10, cursor: 'grab', touchAction: 'none', width: '100%' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        />

        <img ref={imgRef} src={src} onLoad={onLoad} style={{ display: 'none' }} alt="" crossOrigin="anonymous" />

        <div style={{
          position: 'sticky', bottom: -20, zIndex: 3,
          display: 'flex', gap: 10, margin: '14px -24px -20px',
          padding: '14px 24px 20px', borderTop: '1px solid #e2e8f0',
          background: '#fff', boxShadow: '0 -12px 24px rgba(13,39,82,.06)',
        }}>
          <button type="button" onClick={applyCrop} style={{
            flex: 1, padding: '12px', background: '#143670', color: '#fff',
            border: 'none', borderRadius: 9, fontFamily: 'Montserrat,sans-serif',
            fontWeight: 800, fontSize: 14, cursor: 'pointer',
          }}>
            Apply Crop
          </button>
          <button type="button" onClick={onCancel} style={{
            padding: '12px 18px', background: 'none', color: '#6b7a99',
            border: '1.5px solid #e2e8f0', borderRadius: 9,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
