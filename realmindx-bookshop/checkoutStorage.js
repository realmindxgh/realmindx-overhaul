const CHECKOUT_DRAFT_STORAGE_KEY = 'rmx.bookshop.checkoutDraft.v2';
const CHECKOUT_SUCCESS_STORAGE_KEY = 'rmx.bookshop.checkoutSuccess.v1';

const LEGACY_CHECKOUT_STORAGE_KEYS = [
  'rmx.bookshop.checkoutDraft.v1',
  'rmx.bookshop.checkoutDraft',
  'rmx.bookshop.checkout',
  'realmindx.bookshop.checkout',
  'bookshop.checkout',
];

const DRAFT_TTL_MS = 1000 * 60 * 60 * 24;
const SUCCESS_TTL_MS = 1000 * 60 * 60 * 6;

const session = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
};

const readJson = (key) => {
  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    store.removeItem(key);
    return null;
  }
};

const writeJson = (key, value) => {
  const store = session();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private contexts; checkout still works in memory.
  }
};

const removeKeys = (keys) => {
  const store = session();
  if (!store) return;
  keys.forEach((key) => {
    try {
      store.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  });
};

const freshEnough = (value, ttl) => {
  const updatedAt = Number(value?.updatedAt || 0);
  return updatedAt > 0 && Date.now() - updatedAt <= ttl;
};

export const readCheckoutDraft = () => {
  removeKeys(LEGACY_CHECKOUT_STORAGE_KEYS);
  const draft = readJson(CHECKOUT_DRAFT_STORAGE_KEY);
  if (!draft || draft.version !== 2 || !freshEnough(draft, DRAFT_TTL_MS)) {
    clearCheckoutDraft();
    return null;
  }
  return draft;
};

export const writeCheckoutDraft = (draft) => {
  writeJson(CHECKOUT_DRAFT_STORAGE_KEY, {
    ...draft,
    version: 2,
    updatedAt: Date.now(),
  });
};

export const clearCheckoutDraft = () => {
  removeKeys([CHECKOUT_DRAFT_STORAGE_KEY, ...LEGACY_CHECKOUT_STORAGE_KEYS]);
};

export const readCheckoutSuccess = () => {
  const success = readJson(CHECKOUT_SUCCESS_STORAGE_KEY);
  if (!success || success.version !== 1 || !freshEnough(success, SUCCESS_TTL_MS)) {
    clearCheckoutSuccess();
    return null;
  }
  return success;
};

export const writeCheckoutSuccess = (success) => {
  writeJson(CHECKOUT_SUCCESS_STORAGE_KEY, {
    ...success,
    version: 1,
    updatedAt: Date.now(),
  });
};

export const clearCheckoutSuccess = () => {
  removeKeys([CHECKOUT_SUCCESS_STORAGE_KEY]);
};

export const clearCheckoutStorage = () => {
  clearCheckoutDraft();
  clearCheckoutSuccess();
};
