import React from 'react';

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const LAYER_SELECTOR = [
  '[data-modal-layer]',
  '[class*="modal-backdrop"]',
  '[class*="modal-overlay"]',
  '[class*="modal-scrim"]',
  '.focus-flyer-backdrop',
].join(', ');
const FOCUSABLE_SELECTOR = [
  '[autofocus]',
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const isVisible = element => {
  if (!element?.isConnected || element.closest('[hidden]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
};

const resolveModalLayer = dialog => {
  const namedLayer = dialog.closest(LAYER_SELECTOR);
  if (namedLayer) return namedLayer;

  let node = dialog;
  let fixedLayer = null;
  while (node && node !== document.body) {
    if (window.getComputedStyle(node).position === 'fixed') fixedLayer = node;
    node = node.parentElement;
  }
  return fixedLayer || dialog;
};

const focusableElements = dialog => Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);

/**
 * Applies one consistent, opening-order modal stack across the application.
 * Existing dialogs do not need to coordinate z-index values with each other:
 * the most recently opened aria-modal dialog is always the interactive layer.
 */
export default function ModalStackManager() {
  React.useEffect(() => {
    const openedAt = new Map();
    const originalLayerState = new Map();
    let nextOrder = 1;
    let currentTop = null;
    let scheduled = false;

    const rememberLayer = layer => {
      if (originalLayerState.has(layer)) return;
      originalLayerState.set(layer, {
        zIndex: layer.style.getPropertyValue('z-index'),
        zIndexPriority: layer.style.getPropertyPriority('z-index'),
        ariaHidden: layer.getAttribute('aria-hidden'),
        inert: layer.hasAttribute('inert'),
      });
    };

    const restoreLayer = layer => {
      const original = originalLayerState.get(layer);
      if (!original) return;
      if (original.zIndex) layer.style.setProperty('z-index', original.zIndex, original.zIndexPriority);
      else layer.style.removeProperty('z-index');
      if (original.ariaHidden == null) layer.removeAttribute('aria-hidden');
      else layer.setAttribute('aria-hidden', original.ariaHidden);
      if (original.inert) layer.setAttribute('inert', '');
      else layer.removeAttribute('inert');
      layer.removeAttribute('data-modal-stack-index');
      originalLayerState.delete(layer);
    };

    const scan = () => {
      scheduled = false;
      const dialogs = Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(isVisible);
      const activeSet = new Set(dialogs);

      for (const dialog of openedAt.keys()) {
        if (!activeSet.has(dialog)) openedAt.delete(dialog);
      }
      dialogs.forEach(dialog => {
        if (!openedAt.has(dialog)) openedAt.set(dialog, nextOrder++);
      });
      dialogs.sort((left, right) => openedAt.get(left) - openedAt.get(right));

      const layerEntries = [];
      dialogs.forEach(dialog => {
        const layer = resolveModalLayer(dialog);
        const existing = layerEntries.find(entry => entry.layer === layer);
        if (existing) existing.dialog = dialog;
        else layerEntries.push({ layer, dialog });
      });
      const activeLayers = new Set(layerEntries.map(entry => entry.layer));
      for (const layer of originalLayerState.keys()) {
        if (!activeLayers.has(layer)) restoreLayer(layer);
      }

      const topDialog = dialogs.at(-1) || null;
      const topLayer = topDialog ? resolveModalLayer(topDialog) : null;
      layerEntries.forEach(({ layer }, index) => {
        rememberLayer(layer);
        layer.style.setProperty('z-index', String(20000 + index * 20), 'important');
        layer.setAttribute('data-modal-stack-index', String(index));
        const isBehindTop = layer !== topLayer && !layer.contains(topLayer);
        if (isBehindTop) {
          layer.setAttribute('aria-hidden', 'true');
          layer.setAttribute('inert', '');
        } else {
          layer.removeAttribute('aria-hidden');
          layer.removeAttribute('inert');
        }
      });

      if (topDialog !== currentTop) {
        currentTop = topDialog;
        if (topDialog && !topDialog.contains(document.activeElement)) {
          window.requestAnimationFrame(() => {
            if (currentTop !== topDialog || !topDialog.isConnected) return;
            (focusableElements(topDialog)[0] || topDialog).focus({ preventScroll: true });
          });
        }
      }
    };

    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    };

    const onKeyDown = event => {
      if (!currentTop || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        const closeButton = currentTop.querySelector(
          '[data-modal-close], .admin-modal-close, button[aria-label^="Close" i]',
        );
        if (closeButton && !closeButton.disabled) {
          event.preventDefault();
          event.stopPropagation();
          closeButton.click();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(currentTop);
      if (!focusable.length) {
        event.preventDefault();
        currentTop.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = event => {
      if (!currentTop || currentTop.contains(event.target)) return;
      (focusableElements(currentTop)[0] || currentTop).focus({ preventScroll: true });
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'role', 'hidden', 'class'],
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    scan();

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      for (const layer of originalLayerState.keys()) restoreLayer(layer);
    };
  }, []);

  return null;
}
