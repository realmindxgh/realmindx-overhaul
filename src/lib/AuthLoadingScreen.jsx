import React from 'react';
import { Spinner, useDelayedPending } from './AsyncUI.jsx';

const AuthLoadingScreen = ({ className = '', label = 'Checking your session…' }) => {
  const showSpinner = useDelayedPending(true, 260);
  return (
    <div
      className={`auth-route-loading${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {showSpinner ? <Spinner size="lg" /> : <span className="auth-route-loading-reserve" aria-hidden="true" />}
      <span>{label}</span>
    </div>
  );
};

export default AuthLoadingScreen;
