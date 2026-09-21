const page = (key, slug, label, icon) => ({ key, slug, label, icon });

export const ADMIN_WORKSPACES = [
  {
    key: 'overview',
    slug: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    icon: 'grid',
    defaultPage: 'dashboard',
    pages: [
      page('dashboard', 'dashboard', 'Dashboard', 'grid'),
      page('analytics', 'analytics', 'Analytics', 'chart'),
    ],
  },
  {
    key: 'recruitment',
    slug: 'recruitment',
    label: 'Recruitment',
    shortLabel: 'Recruit',
    icon: 'users',
    defaultPage: 'jobs',
    pages: [
      page('jobs', 'jobs', 'Jobs', 'briefcase'),
      page('applications', 'applications', 'Applications', 'clipboard'),
      page('alerts', 'job-alerts', 'Job Alerts', 'bell'),
      page('teachers', 'active-teachers', 'Active Teachers', 'teacher'),
      page('teacherReview', 'teacher-review', 'Teacher Review', 'clipboard'),
    ],
  },
  {
    key: 'bookshop',
    slug: 'bookshop',
    label: 'Bookshop',
    shortLabel: 'Bookshop',
    icon: 'book',
    defaultPage: 'products',
    pages: [
      page('products', 'products', 'Products', 'book'),
      page('productReviews', 'product-reviews', 'Product Reviews', 'award'),
      page('categories', 'categories', 'Categories', 'package'),
      page('flyers', 'flyers', 'Flyers', 'image'),
      page('deliveryZones', 'delivery-prices', 'Delivery Prices', 'money'),
      page('deliveryCompanies', 'delivery-companies', 'Delivery Companies', 'briefcase'),
      page('deliverySettlements', 'delivery-settlements', 'Delivery Settlements', 'money'),
      page('priceAdjustment', 'price-adjustment', 'Price Adjustment', 'money'),
      page('orders', 'orders', 'Orders', 'clipboard'),
      page('bookshopCustomers', 'customers', 'Customers', 'users'),
      page('receiptsInvoices', 'receipts-invoices', 'Receipts & Invoices', 'receipt'),
      page('orderReviews', 'order-reviews', 'Order Reviews', 'message'),
    ],
  },
  {
    key: 'content',
    slug: 'content',
    label: 'Content',
    shortLabel: 'Content',
    icon: 'file',
    defaultPage: 'services',
    pages: [
      page('services', 'services', 'Services', 'consulting'),
      page('partners', 'partners', 'Partners', 'users'),
      page('people', 'people', 'The People', 'users'),
      page('testimonials', 'testimonials', 'Testimonials', 'message'),
      page('homeHeroSlides', 'home-hero', 'Home Hero', 'image'),
      page('donationSlides', 'donation-slides', 'Donation Slides', 'image'),
      page('siteCopy', 'page-text', 'Page Text', 'file'),
      page('news', 'news', 'News', 'newspaper'),
      page('gallery', 'gallery', 'Gallery', 'image'),
      page('resources', 'resources', 'Resources', 'file'),
      page('settings', 'contact-site-details', 'Contact & Site Details', 'settings'),
    ],
  },
  {
    key: 'comms',
    slug: 'communications',
    label: 'Communications',
    shortLabel: 'Comms',
    icon: 'message',
    defaultPage: 'messages',
    pages: [
      page('messages', 'tickets', 'Tickets', 'message'),
      page('newsletters', 'newsletters', 'Newsletters', 'mail'),
    ],
  },
  {
    key: 'system',
    slug: 'system',
    label: 'People & System',
    shortLabel: 'System',
    icon: 'settings',
    defaultPage: 'admins',
    pages: [
      page('admins', 'admin-accounts', 'Admin Accounts', 'shield'),
      page('staff', 'staff-accounts', 'Staff Accounts', 'shield'),
      page('whatsappDiagnostics', 'whatsapp-logs', 'WhatsApp Logs', 'whatsapp'),
      page('auditLogs', 'audit-log', 'Audit Log', 'clipboard'),
      page('account', 'my-account', 'My Account', 'user'),
    ],
  },
];

export const ADMIN_PAGES = ADMIN_WORKSPACES.flatMap(workspace =>
  workspace.pages.map(item => ({ ...item, workspaceKey: workspace.key, group: workspace.label })),
);

const WORKSPACE_BY_KEY = new Map(ADMIN_WORKSPACES.map(workspace => [workspace.key, workspace]));
const WORKSPACE_BY_SLUG = new Map(ADMIN_WORKSPACES.map(workspace => [workspace.slug, workspace]));
const PAGE_BY_KEY = new Map(ADMIN_PAGES.map(item => [item.key, item]));
const PAGE_BY_SLUG = new Map(ADMIN_PAGES.map(item => [item.slug, item]));

const portalSegment = portalRole => (portalRole === 'staff' ? 'staff' : 'admin');
const allowAll = () => true;

export const workspaceForPage = pageKey => WORKSPACE_BY_KEY.get(PAGE_BY_KEY.get(pageKey)?.workspaceKey) || ADMIN_WORKSPACES[0];

export const visibleAdminWorkspaces = (canAccess = allowAll) => ADMIN_WORKSPACES
  .map(workspace => ({
    ...workspace,
    pages: workspace.pages
      .map(item => ({ ...item, workspaceKey: workspace.key, group: workspace.label }))
      .filter(canAccess),
  }))
  .filter(workspace => workspace.pages.length > 0);

export const defaultPageForWorkspace = (workspaceKey, canAccess = allowAll) => {
  const workspace = WORKSPACE_BY_KEY.get(workspaceKey);
  if (!workspace) return null;
  const pages = workspace.pages
    .map(item => ({ ...item, workspaceKey: workspace.key, group: workspace.label }))
    .filter(canAccess);
  return pages.find(item => item.key === workspace.defaultPage) || pages[0] || null;
};

export const defaultAdminPage = (canAccess = allowAll) => {
  const preferred = defaultPageForWorkspace('overview', canAccess);
  if (preferred) return preferred;
  const firstWorkspace = visibleAdminWorkspaces(canAccess)[0];
  return firstWorkspace?.pages[0] || null;
};

export const adminPathFor = (portalRole, pageKey) => {
  const item = PAGE_BY_KEY.get(pageKey) || PAGE_BY_KEY.get('dashboard');
  const workspace = WORKSPACE_BY_KEY.get(item.workspaceKey) || ADMIN_WORKSPACES[0];
  return `/${portalSegment(portalRole)}/${workspace.slug}/${item.slug}`;
};

export const resolveAdminRoute = (pathname, portalRole, canAccess = allowAll) => {
  const expectedPortal = portalSegment(portalRole);
  const segments = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment).toLowerCase());

  let requestedPage = null;
  let recognized = segments[0] === expectedPortal;

  if (recognized && segments.length >= 3) {
    const workspace = WORKSPACE_BY_SLUG.get(segments[1]) || WORKSPACE_BY_KEY.get(segments[1]);
    const candidate = PAGE_BY_SLUG.get(segments[2]) || PAGE_BY_KEY.get(segments[2]);
    requestedPage = workspace && candidate?.workspaceKey === workspace.key ? candidate : null;
    recognized = Boolean(requestedPage);
  } else if (recognized && segments.length === 2) {
    requestedPage = PAGE_BY_SLUG.get(segments[1]) || PAGE_BY_KEY.get(segments[1]) || null;
    recognized = Boolean(requestedPage);
  } else {
    recognized = false;
  }

  const authorized = Boolean(requestedPage && canAccess(requestedPage));
  const page = authorized ? requestedPage : defaultAdminPage(canAccess);
  const workspace = page ? workspaceForPage(page.key) : null;

  return {
    page,
    workspace,
    recognized,
    authorized,
    needsRedirect: !recognized || !authorized,
    canonicalPath: page ? adminPathFor(portalRole, page.key) : `/${expectedPortal}/dashboard`,
  };
};

