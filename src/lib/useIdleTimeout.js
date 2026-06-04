/**
 * useIdleTimeout — shows a warning after IDLE_MINUTES of inactivity,
 * then auto-logs-out after WARN_SECONDS if the user does nothing.
 *
 * Usage:
 *   const { countdown, keepAlive } = useIdleTimeout({ onTimeout });
 *   - countdown: null (no warning) or integer seconds remaining
 *   - keepAlive: call this to dismiss the warning and reset the idle clock
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_MS   = 10 * 60 * 1000;  // 10 minutes before warning appears
const WARN_SECS = 5 * 60;          // 5-minute countdown once warning shows
const WARN_MS   = WARN_SECS * 1000;
const EVENTS    = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

export function useIdleTimeout({ onTimeout, enabled = true }) {
  const [countdown, setCountdown]   = useState(null); // null = hidden, number = secs left
  const idleRef      = useRef(null);
  const intervalRef  = useRef(null);
  const timeoutRef   = useRef(null);
  const deadlineRef  = useRef(0);
  const warningUpRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearAll = useCallback(() => {
    clearTimeout(idleRef.current);
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    idleRef.current = null;
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  const finishTimeout = useCallback(() => {
    clearAll();
    setCountdown(null);
    warningUpRef.current = false;
    onTimeoutRef.current?.();
  }, [clearAll]);

  const syncCountdown = useCallback(() => {
    const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      finishTimeout();
      return;
    }
    setCountdown(current => (current === remaining ? current : remaining));
  }, [finishTimeout]);

  const startCountdown = useCallback(() => {
    clearAll();
    warningUpRef.current = true;
    deadlineRef.current = Date.now() + WARN_MS;
    setCountdown(WARN_SECS);
    intervalRef.current = setInterval(syncCountdown, 250);
    timeoutRef.current = setTimeout(finishTimeout, WARN_MS + 250);
  }, [clearAll, finishTimeout, syncCountdown]);

  // Reset the idle clock (and dismiss the warning if showing)
  const keepAlive = useCallback(() => {
    clearAll();
    setCountdown(null);
    warningUpRef.current = false;
    if (enabled) {
      idleRef.current = setTimeout(startCountdown, IDLE_MS);
    }
  }, [clearAll, enabled, startCountdown]);

  // Activity handler — only resets if the warning isn't showing yet
  const onActivity = useCallback(() => {
    if (!warningUpRef.current) keepAlive();
  }, [keepAlive]);

  useEffect(() => {
    if (!enabled) { clearAll(); setCountdown(null); return; }

    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    idleRef.current = setTimeout(startCountdown, IDLE_MS);

    return () => {
      clearAll();
      EVENTS.forEach(e => window.removeEventListener(e, onActivity));
    };
  }, [enabled, onActivity, startCountdown, clearAll]);

  return { countdown, keepAlive };
}

export const fmtCountdown = (secs) => {
  if (secs == null) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
