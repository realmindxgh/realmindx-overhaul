export const DEMO_ACCOUNTS = {
  admin: {
    role: 'admin',
    email: 'admin@realmindxgh.com',
    password: 'Admin@12345',
    firstName: 'RealMindX',
    lastName: 'Admin',
    initials: 'RA',
  },
  user: {
    role: 'user',
    email: 'teacher@realmindxgh.com',
    password: 'Teacher@12345',
    firstName: 'Kwame',
    lastName: 'Mensah',
    initials: 'KM',
    phone: '+233 24 567 8901',
    location: 'Accra, Ghana',
    subject: 'Mathematics',
    level: 'JHS / SHS',
  },
};

const SESSION_KEY = 'realmindx.demoSession';

const notifySessionChange = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('rmx-session-sync'));
};

export const saveDemoSession = account => {
  if (typeof window === 'undefined') return;
  const { password, ...session } = account;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({
    ...session,
    signedInAt: new Date().toISOString(),
  }));
  notifySessionChange();
};

export const getDemoSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
};

export const clearDemoSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
  notifySessionChange();
};

export const credentialsMatch = (account, email, password) =>
  account.email.toLowerCase() === String(email || '').trim().toLowerCase()
  && account.password === password;
