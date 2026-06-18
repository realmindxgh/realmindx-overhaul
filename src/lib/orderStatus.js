const ORDER_STATUS_ALIASES = {
  received: 'confirmed',
  processing: 'confirmed',
  packed: 'shipped',
  ready: 'shipped',
  out_for_delivery: 'shipped',
  dispatched: 'shipped',
  delivered: 'complete',
  completed: 'complete',
};

export const normalizeOrderStatus = (status, fallback = 'new') => {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return fallback;
  return ORDER_STATUS_ALIASES[value] || value;
};

export const orderStatusLabel = (status) => {
  const normalized = normalizeOrderStatus(status);
  switch (normalized) {
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'new':
      return 'Placed';
    case 'confirmed':
      return 'Confirmed';
    case 'shipped':
      return 'Shipped';
    case 'complete':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'archived':
      return 'Archived';
    default:
      return normalized.replace(/_/g, ' ');
  }
};
