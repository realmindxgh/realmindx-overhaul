export const isInternalRole = (role) => role === 'admin' || role === 'staff';

const deliveryHost = () => typeof window !== 'undefined' && window.location.hostname === 'delivery.realmindxgh.com';

export const dashboardPathForRole = (role) => {
  if (role === 'delivery_company_user') return deliveryHost() ? '/manager/' : '/delivery-company/';
  if (role === 'delivery_rider') return deliveryHost() ? '/rider/' : '/delivery/';
  if (role === 'staff') return '/staff/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/portal';
};

export const loginPathForRole = (role) => {
  if (role === 'delivery_company_user') return deliveryHost() ? '/manager/login' : '/delivery-company/login';
  if (role === 'delivery_rider') return deliveryHost() ? '/rider/login' : '/delivery/login';
  if (role === 'staff') return '/staff/login';
  if (role === 'admin') return '/admin/login';
  return '/login';
};
