// ============================================================
// Auth seam - single entry point for sign in / up / out.
// API mode (VITE_API_BASE set): validates against the Flask
// backend (flask-login session cookie) and mirrors the returned
// user into the local session record, so the rest of the app's
// synchronous getDemoSession() reads keep working unchanged.
// Local mode (default): validates against the bundled demo
// accounts exactly as before.
// ============================================================

import { isApiMode, api } from './apiClient.js';
import {
  DEMO_ACCOUNTS,
  credentialsMatch,
  saveDemoSession,
  getDemoSession,
  clearDemoSession,
} from './demoAccounts.js';

const initialsFrom = (first = '', last = '') =>
  ((first[0] || '') + (last[0] || '')).toUpperCase() || 'RX';

// Map the backend user_json into the session shape the app reads.
const toSession = (user = {}, roleHint = 'user') => {
  const first = user.first_name || user.firstName || '';
  const last = user.last_name || user.lastName || '';
  return {
    role: (user.role && (user.role.name || user.role)) || roleHint,
    email: user.email,
    firstName: first,
    lastName: last,
    initials: user.initials || initialsFrom(first, last),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    directPermissions: Array.isArray(user.direct_permissions) ? user.direct_permissions : [],
  };
};

export const syncSessionFromApi = async () => {
  if (!isApiMode()) return getDemoSession();
  try {
    const { user } = await api.me();
    if (!user) {
      clearDemoSession();
      return null;
    }
    const session = toSession(user, user?.role?.name || user?.role || 'user');
    saveDemoSession(session);
    return session;
  } catch {
    return getDemoSession();
  }
};

const invalidCredentials = (role) => {
  const err = new Error(
    role === 'admin'
      ? 'Invalid admin credentials for this local build.'
      : 'Invalid email or password for this local build.',
  );
  err.code = 'invalid_credentials';
  return err;
};

// role: 'admin' | 'user'
export const signIn = async ({ email, password, role = 'user', remember = false }) => {
  if (isApiMode()) {
    const { user } = await api.login({ email, password, remember });
    const actualRole = user?.role?.name || user?.role;
    const adminRoles = new Set(['admin', 'staff']);
    if (role === 'admin' && !adminRoles.has(actualRole)) {
      try { await api.logout(); } catch { /* ignore cleanup errors */ }
      clearDemoSession();
      throw invalidCredentials(role);
    }
    if (role === 'user' && actualRole && actualRole !== 'user') {
      try { await api.logout(); } catch { /* ignore cleanup errors */ }
      clearDemoSession();
      throw invalidCredentials(role);
    }
    const session = toSession(user, actualRole || role);
    saveDemoSession(session);
    return session;
  }
  const account = DEMO_ACCOUNTS[role];
  if (!account || !credentialsMatch(account, email, password)) {
    throw invalidCredentials(role);
  }
  saveDemoSession(account);
  return getDemoSession();
};

export const signUp = async ({ email, password, firstName, lastName, acceptedTerms = false, turnstileToken = '' }) => {
  if (isApiMode()) {
    const result = await api.signup({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      accepted_terms: acceptedTerms,
      turnstile_token: turnstileToken,
    });
    return {
      ...result,
      user: result.user ? toSession(result.user, 'user') : undefined,
    };
  }
  // Local build has no real registration; nothing is persisted here.
  // the page shows its "verify your email" confirmation as before.
  return { email, firstName, lastName, role: 'user' };
};

export const verifyEmailOtp = async ({ email, otp }) => {
  if (isApiMode()) return api.verifyEmailOtp({ email, otp });
  return { message: 'Email verified for the local demo account.' };
};

export const resendVerificationOtp = async (email) => {
  if (isApiMode()) return api.resendVerificationOtp({ email });
  return { message: 'A fresh local demo verification code has been sent.' };
};

export const requestPasswordReset = async (email) => {
  if (isApiMode()) return api.requestPasswordReset({ email });
  return { message: 'If an account exists for that email, you will receive a reset link shortly.' };
};

export const signOut = async () => {
  if (isApiMode()) {
    try { await api.logout(); } catch { /* ignore network/logout errors */ }
  }
  clearDemoSession();
};

export const currentSession = getDemoSession;
