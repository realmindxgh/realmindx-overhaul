/**
 * useCropUpload — wraps a file <input> with the crop modal flow.
 *
 * Usage:
 *   const { inputProps, cropModal } = useCropUpload({
 *     aspectRatio: 1,          // 1 = square, 16/9 = landscape, etc.
 *     title: 'Crop profile picture',
 *     onFile: (file, dataUrl) => { ... upload file ... },
 *   });
 *
 *   return <>
 *     <input type="file" accept="image/*" {...inputProps} />
 *     {cropModal}
 *   </>;
 */

import React, { useState, useCallback } from 'react';
import ImageCropModal from './ImageCropModal.jsx';

export function useCropUpload({ aspectRatio = 1, title = 'Crop Image', onFile } = {}) {
  const [cropSrc, setCropSrc] = useState(null);

  const handleChange = useCallback(e => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleCrop = useCallback((croppedFile, dataUrl) => {
    setCropSrc(null);
    onFile?.(croppedFile, dataUrl);
  }, [onFile]);

  const handleCancel = useCallback(() => setCropSrc(null), []);

  const cropModal = cropSrc ? (
    <ImageCropModal
      src={cropSrc}
      aspectRatio={aspectRatio}
      title={title}
      onCrop={handleCrop}
      onCancel={handleCancel}
    />
  ) : null;

  return {
    inputProps: { onChange: handleChange },
    cropModal,
    isOpen: Boolean(cropSrc),
  };
}
