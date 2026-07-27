// ============================================================
// Auth seam - single entry point for sign in / up / out.
// API mode (VITE_API_BASE set): validates against the Flask
// backend (flask-login session cookie) and mirrors the returned
// user into the local session record, so the rest of the app's
// synchronous getDemoSession() reads keep working unchanged.
// Local mode (default): validates against the bundled demo
// accounts exactly as before.
//
// SAFETY: The local demo-fallback MUST NOT activate on
// production domains. If VITE_API_BASE_URL is absent on a
// non-local hostname, callers receive a configuration error
// rather than silently checking against bundled demo accounts.
// ============================================================

import { isApiMode, api } from './apiClient.js';
import {
  DEMO_ACCOUNTS,
  credentialsMatch,
  saveDemoSession,
  getDemoSession,
  clearDemoSession,
} from './demoAccounts.js';
import { dashboardPathForRole } from './sessionRoutes.js';
import { isInstalledApp } from './InstallAppPrompt.jsx';

const initialsFrom = (first = '', last = '') =>
  ((first[0] || '') + (last[0] || '')).toUpperCase() || 'RX';

// Map the backend user_json into the session shape the app reads.
const toSession = (user = {}, roleHint = 'user') => {
  const first = user.first_name || user.firstName || '';
  const last = user.last_name || user.lastName || '';
  const avatarUrl = user.profile_picture_url || user.avatar_url || user.picture || user.photo_url || null;
  return {
    role: (user.role && (user.role.name || user.role)) || roleHint,
    email: user.email,
    phone: user.phone || '',
    phoneVerified: Boolean(user.phone_verified),
    whatsappPhoneVerificationAllowed: Boolean(user.whatsapp_phone_verification_allowed ?? user.whatsappPhoneVerificationAllowed),
    emailVerified: Boolean(user.is_verified),
    firstName: first,
    lastName: last,
    initials: user.initials || initialsFrom(first, last),
    avatarUrl,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    directPermissions: Array.isArray(user.direct_permissions) ? user.direct_permissions : [],
    mustChangePassword: Boolean(user.must_change_password ?? user.mustChangePassword),
    twoFactorEnabled: Boolean(user.two_factor_enabled ?? user.twoFactorEnabled),
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
    // A locally mirrored identity is never proof of a live API session.
    // Clear it whenever verification fails so protected or auth-related UI
    // cannot briefly render stale user details.
    clearDemoSession();
    return null;
  }
};

const invalidCredentials = (role) => {
  const err = new Error(
    role === 'admin'
      ? 'Invalid admin credentials for this local build.'
      : role === 'staff'
        ? 'Invalid staff credentials for this portal.'
      : 'Invalid email or password for this local build.',
  );
  err.code = 'invalid_credentials';
  return err;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const guardProductionFallback = () => {
  if (typeof window === 'undefined') return;
  if (LOCAL_HOSTNAMES.has(window.location.hostname)) return;
  throw new Error(
    'Authentication is unavailable — the server configuration is incomplete. '
    + 'Please contact RealMindX support.'
  );
};

// role: 'admin' | 'user'
export const signIn = async ({ email, password, role = 'user', remember = false, surface = '' }) => {
  if (isApiMode()) {
    const result = await api.login({ email, password, remember: remember || isInstalledApp(), surface });
    if (result?.requires_two_factor) {
      const error = new Error(result.message || 'Enter the security code sent to your email.');
      error.code = 'requires_two_factor';
      error.data = result;
      throw error;
    }
    const { user } = result;
    const actualRole = user?.role?.name || user?.role;
    if (role === 'admin' && actualRole !== 'admin') {
      try { await api.logout(); } catch { /* ignore cleanup errors */ }
      clearDemoSession();
      throw invalidCredentials(role);
    }
    if (role === 'staff' && actualRole !== 'staff') {
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
  guardProductionFallback();
  const account = DEMO_ACCOUNTS[role];
  if (!account || !credentialsMatch(account, email, password)) {
    throw invalidCredentials(role);
  }
  saveDemoSession(account);
  return getDemoSession();
};

export const signInWithPhone = async ({ phone, password, role, remember = false }) => {
  if (!isApiMode()) {
    guardProductionFallback();
    throw invalidCredentials(role);
  }
  const login = role === 'delivery_company_user'
    ? api.deliveryCompanyLogin
    : role === 'delivery_rider'
      ? api.deliveryRiderLogin
      : null;
  if (!login) throw invalidCredentials(role);
  const result = await login({ phone, password, remember: remember || isInstalledApp() });
  const user = result.user;
  const actualRole = user?.role?.name || user?.role;
  if (actualRole !== role) {
    try { await api.deliveryLogout(); } catch { /* ignore cleanup errors */ }
    clearDemoSession();
    throw invalidCredentials(role);
  }
  const session = toSession(user, role);
  saveDemoSession(session);
  return session;
};

export const completeTwoFactorLogin = async ({ otp, role = 'user' }) => {
  if (!isApiMode()) {
    guardProductionFallback();
    return getDemoSession();
  }
  const { user } = await api.completeTwoFactorLogin({ otp });
  const actualRole = user?.role?.name || user?.role;
  if (role === 'user' && actualRole && actualRole !== 'user') {
    try { await api.logout(); } catch { /* ignore cleanup errors */ }
    clearDemoSession();
    throw invalidCredentials(role);
  }
  const session = toSession(user, actualRole || role);
  saveDemoSession(session);
  return session;
};

export const signUp = async ({ email, phone = '', password, firstName, lastName, sex = '', ageRange = '', acceptedTerms = false, turnstileToken = '', surface = 'teacher' }) => {
  if (isApiMode()) {
    const result = await api.signup({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      phone,
      sex,
      age_range: ageRange,
      accepted_terms: acceptedTerms,
      turnstile_token: turnstileToken,
      surface,
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

export const requestPasswordReset = async (email, { surface = 'main', purpose = '' } = {}) => {
  if (isApiMode()) return api.requestPasswordReset({ email, surface, purpose });
  return { message: 'If an account exists for that email, you will receive a reset link shortly.' };
};

export const confirmPasswordReset = async ({ token, password }) => {
  if (isApiMode()) return api.confirmPasswordReset({ token, password });
  if (!token) throw new Error('This password reset link is invalid or incomplete.');
  return { message: 'Password updated for the local preview.' };
};

export const signOut = async () => {
  if (isApiMode()) {
    try { await api.logout(); } catch { /* ignore network/logout errors */ }
  }
  clearDemoSession();
};

export const currentSession = getDemoSession;
export const dashboardRouteForSession = dashboardPathForRole;
