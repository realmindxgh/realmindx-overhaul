/**
 * IdleWarning — the overlay countdown modal shown before auto-logout.
 * Rendered by the root App components; invisible when countdown is null.
 */

import React from 'react';
import { fmtCountdown } from './useIdleTimeout.js';

// Danger threshold: turn the ring red in the last 60 seconds
const DANGER = 60;

export const IdleWarning = ({ countdown, onKeepAlive, onLogout }) => {
  if (countdown == null) return null;

  const danger  = countdown <= DANGER;
  const pct     = countdown / (5 * 60);          // 0–1 progress remaining
  const r       = 44;
  const circ    = 2 * Math.PI * r;
  const dash    = pct * circ;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(10,28,60,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      backdropFilter: 'blur(4px)',
      animation: 'rmxFadeIn .25s ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20,
        padding: '48px 40px 40px',
        maxWidth: 400, width: '100%',
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.28)',
      }}>
        {/* Circular countdown ring */}
        <div style={{ position: 'relative', width: 112, height: 112, margin: '0 auto 28px' }}>
          <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
            {/* Track */}
            <circle cx="56" cy="56" r={r} fill="none"
              stroke={danger ? '#fee2e2' : '#e8edf6'} strokeWidth="8" />
            {/* Progress */}
            <circle cx="56" cy="56" r={r} fill="none"
              stroke={danger ? '#dc2626' : '#143670'} strokeWidth="8"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.5s' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'Montserrat, Arial, sans-serif',
              fontWeight: 900, fontSize: 28,
              color: danger ? '#dc2626' : '#143670',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}>
              {fmtCountdown(countdown)}
            </span>
            <span style={{ fontSize: 10, color: '#6b7a99', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
              remaining
            </span>
          </div>
        </div>

        {/* Text */}
        <h2 style={{
          fontFamily: 'Montserrat, Arial, sans-serif',
          fontWeight: 900, fontSize: 20,
          color: '#0d1b3e', margin: '0 0 10px',
        }}>
          Still there?
        </h2>
        <p style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: 14, color: '#4a5568',
          lineHeight: 1.6, margin: '0 0 32px',
        }}>
          You have been inactive for 10 minutes.
          For your security, you will be signed out automatically
          {countdown <= DANGER
            ? <strong style={{ color: '#dc2626' }}> in {fmtCountdown(countdown)}.</strong>
            : ` in ${fmtCountdown(countdown)}.`}
        </p>

        {/* Buttons */}
        <button
          onClick={onKeepAlive}
          autoFocus
          style={{
            display: 'block', width: '100%',
            padding: '14px 24px', marginBottom: 12,
            background: '#143670', color: '#fff',
            border: 'none', borderRadius: 10,
            fontFamily: 'Montserrat, Arial, sans-serif',
            fontWeight: 800, fontSize: 15,
            cursor: 'pointer', letterSpacing: '0.02em',
          }}
        >
          Stay Signed In
        </button>
        <button
          onClick={onLogout}
          style={{
            display: 'block', width: '100%',
            padding: '12px 24px',
            background: 'none', color: '#6b7a99',
            border: '1.5px solid #e2e8f0', borderRadius: 10,
            fontFamily: 'Montserrat, Arial, sans-serif',
            fontWeight: 700, fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Sign Out Now
        </button>
      </div>
      <style>{`@keyframes rmxFadeIn { from { opacity:0; } to { opacity:1; } }`}</style>
    </div>
  );
};
