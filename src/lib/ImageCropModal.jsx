import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const initialCrop = (width, height, aspect) => {
  if (!width || !height) return undefined;
  if (!aspect) return { unit: '%', x: 5, y: 5, width: 90, height: 90 };
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
    width,
    height,
  );
};

const ratioLabel = aspect => {
  if (Math.abs(aspect - 16 / 9) < 0.001) return '16:9';
  if (Math.abs(aspect - 16 / 7) < 0.001) return '16:7';
  if (Math.abs(aspect - 1) < 0.001) return '1:1';
  return `${aspect.toFixed(2)}:1`;
};

export default function ImageCropModal({
  src,
  aspectRatio = 1,
  title = 'Crop Image',
  onCrop,
  onCancel,
}) {
  const imageRef = useRef(null);
  const [crop, setCrop] = useState(undefined);
  const [completedCrop, setCompletedCrop] = useState(undefined);
  const [ratioLocked, setRatioLocked] = useState(true);

  useEffect(() => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRatioLocked(true);
  }, [src, aspectRatio]);

  const setDefaultCrop = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    setCrop(initialCrop(image.width, image.height, ratioLocked ? aspectRatio : undefined));
    setCompletedCrop(undefined);
  }, [aspectRatio, ratioLocked]);

  const handleImageLoad = event => {
    imageRef.current = event.currentTarget;
    setCrop(initialCrop(event.currentTarget.width, event.currentTarget.height, aspectRatio));
  };

  const toggleRatio = () => {
    const nextLocked = !ratioLocked;
    setRatioLocked(nextLocked);
    const image = imageRef.current;
    if (image) {
      setCrop(initialCrop(image.width, image.height, nextLocked ? aspectRatio : undefined));
      setCompletedCrop(undefined);
    }
  };

  const useFullImage = () => {
    setRatioLocked(false);
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setCompletedCrop(undefined);
  };

  const applyCrop = () => {
    const image = imageRef.current;
    if (!image || !crop) return;

    const pixelCrop = completedCrop || {
      x: image.width * (crop.x || 0) / 100,
      y: image.height * (crop.y || 0) / 100,
      width: image.width * (crop.width || 100) / 100,
      height: image.height * (crop.height || 100) / 100,
    };
    if (!pixelCrop.width || !pixelCrop.height) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const sourceX = Math.max(0, Math.round(pixelCrop.x * scaleX));
    const sourceY = Math.max(0, Math.round(pixelCrop.y * scaleY));
    const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.round(pixelCrop.width * scaleX));
    const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.round(pixelCrop.height * scaleY));

    const output = document.createElement('canvas');
    output.width = sourceWidth;
    output.height = sourceHeight;
    const context = output.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    const dataUrl = output.toDataURL('image/jpeg', 0.95);
    output.toBlob(blob => {
      if (blob) onCrop(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }), dataUrl);
    }, 'image/jpeg', 0.95);
  };

  const dimensions = completedCrop?.width && completedCrop?.height
    ? `${Math.round(completedCrop.width * (imageRef.current?.naturalWidth || 1) / (imageRef.current?.width || 1))} × ${Math.round(completedCrop.height * (imageRef.current?.naturalHeight || 1) / (imageRef.current?.height || 1))} px`
    : '';

  return (
    <div className="image-crop-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <div className="image-crop-modal" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
        <div className="image-crop-modal-header">
          <div>
            <h3 id="image-crop-title">{title}</h3>
            <p>Drag the crop area or resize it using any edge or corner.</p>
          </div>
          <button type="button" className="image-crop-close" onClick={onCancel} aria-label="Close image cropper">&times;</button>
        </div>

        <div className="image-crop-toolbar">
          <button type="button" className={`btn btn-sm ${ratioLocked ? 'btn-primary' : 'btn-outline-navy'}`} onClick={toggleRatio}>
            {ratioLocked ? `Ratio locked (${ratioLabel(aspectRatio)})` : 'Free crop'}
          </button>
          <button type="button" className="btn btn-outline-navy btn-sm" onClick={setDefaultCrop}>Reset crop</button>
          <button type="button" className="btn btn-outline-navy btn-sm" onClick={useFullImage}>Use full image</button>
          {dimensions ? <span className="image-crop-dimensions">Output: {dimensions}</span> : null}
        </div>

        <div className="image-crop-stage">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
            aspect={ratioLocked ? aspectRatio : undefined}
            minWidth={32}
            minHeight={32}
            keepSelection
            ruleOfThirds
          >
            <img ref={imageRef} src={src} onLoad={handleImageLoad} alt="Crop preview" />
          </ReactCrop>
        </div>

        <div className="image-crop-modal-actions">
          <button type="button" className="btn btn-primary" onClick={applyCrop} disabled={!crop}>Apply crop</button>
          <button type="button" className="btn btn-outline-navy" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
