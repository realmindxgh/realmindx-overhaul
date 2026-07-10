import React from 'react';

const AuthLoadingScreen = ({ className = '' }) => (
  <div
    className={`auth-route-loading${className ? ` ${className}` : ''}`}
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <span className="auth-route-loading-spinner" aria-hidden="true" />
    <span>Loading...</span>
  </div>
);

export default AuthLoadingScreen;
