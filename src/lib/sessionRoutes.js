export const isInternalRole = (role) => role === 'admin' || role === 'staff';

export const dashboardPathForRole = (role) => {
  if (role === 'staff') return '/staff/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/portal';
};

export const loginPathForRole = (role) => {
  if (role === 'staff') return '/staff/login';
  if (role === 'admin') return '/admin/login';
  return '/login';
};
