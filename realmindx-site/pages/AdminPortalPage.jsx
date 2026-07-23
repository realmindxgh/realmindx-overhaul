import React from 'react';
import ReactDOM from 'react-dom';
import { Icon, DatePickerField } from '../assets/components.jsx';
import { resetManagedContent, JOB_LEVELS, JOB_SUBJECTS, JOB_TYPES } from '../../src/lib/managedContent.js';
import { useAdminContent, publicItems } from '../../src/lib/useAdminContent.js';
import { usePublicServicesState } from '../../src/lib/siteContent.js';
import { API_BASE, api, isApiMode } from '../../src/lib/apiClient.js';
import { clearDemoSession, getDemoSession, saveDemoSession } from '../../src/lib/demoAccounts.js';
import { signOut } from '../../src/lib/authClient.js';
import { dashboardPathForRole, loginPathForRole } from '../../src/lib/sessionRoutes.js';
import AnalyticsView from '../../src/admin/AnalyticsView.jsx';
import logoWhite from '../assets/logo-white.png';
import ImageCropModal from '../../src/lib/ImageCropModal.jsx';
import { TEACHING_CURRICULA } from '../../src/lib/teachingOptions.js';
import { PRODUCT_CURRICULUM_OPTIONS, PRODUCT_LEVEL_OPTIONS, PRODUCT_SUBJECT_OPTIONS } from '../../src/lib/bookshopTaxonomy.js';
import AuthLoadingScreen from '../../src/lib/AuthLoadingScreen.jsx';
import { copyTextToClipboard } from '../../src/lib/clipboard.js';
import { rankByFuzzyMatch } from '../../src/lib/fuzzySearch.js';
import globalToast from '../../src/lib/toast.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', icon: 'grid' },
  { key: 'analytics', label: 'Analytics', group: 'Overview', icon: 'chart' },
  { key: 'jobs', label: 'Jobs', group: 'Jobs', icon: 'briefcase' },
  { key: 'applications', label: 'Applications', group: 'Jobs', icon: 'clipboard' },
  { key: 'products', label: 'Products', group: 'Bookshop', icon: 'book' },
  { key: 'productReviews', label: 'Product Reviews', group: 'Bookshop', icon: 'award' },
  { key: 'categories', label: 'Categories', group: 'Bookshop', icon: 'package' },
  { key: 'flyers', label: 'Flyers', group: 'Bookshop', icon: 'image' },
  { key: 'deliveryZones', label: 'Delivery Prices', group: 'Bookshop', icon: 'money' },
  { key: 'deliveryCompanies', label: 'Delivery Companies', group: 'Bookshop', icon: 'briefcase' },
  { key: 'deliverySettlements', label: 'Delivery Settlements', group: 'Bookshop', icon: 'money' },
  { key: 'priceAdjustment', label: 'Price Adjustment', group: 'Bookshop', icon: 'money' },
  { key: 'orders', label: 'Orders', group: 'Bookshop', icon: 'clipboard' },
  { key: 'bookshopCustomers', label: 'Bookshop Customers', group: 'Bookshop', icon: 'users' },
  { key: 'receiptsInvoices', label: 'Receipts & Invoices', group: 'Bookshop', icon: 'receipt' },
  { key: 'orderReviews', label: 'Order Reviews', group: 'Bookshop', icon: 'message' },
  { key: 'services', label: 'Services', group: 'Content', icon: 'consulting' },
  { key: 'partners', label: 'Partners', group: 'Content', icon: 'users' },
  { key: 'people', label: 'The People', group: 'Content', icon: 'users' },
  { key: 'testimonials', label: 'Testimonials', group: 'Content', icon: 'message' },
  { key: 'homeHeroSlides', label: 'Home Hero', group: 'Content', icon: 'image' },
  { key: 'donationSlides', label: 'Donation Slides', group: 'Content', icon: 'image' },
  { key: 'siteCopy', label: 'Page Text', group: 'Content', icon: 'file' },
  { key: 'news', label: 'News', group: 'Content', icon: 'newspaper' },
  { key: 'gallery', label: 'Gallery', group: 'Content', icon: 'image' },
  { key: 'resources', label: 'Resources', group: 'Content', icon: 'file' },
  { key: 'messages', label: 'Tickets', group: 'Comms', icon: 'message' },
  { key: 'newsletters', label: 'Newsletters', group: 'Comms', icon: 'mail' },
  { key: 'alerts', label: 'Job Alerts', group: 'Comms', icon: 'bell' },
  { key: 'settings', label: 'Contact & Site Details', group: 'System', icon: 'settings' },
  { key: 'admins', label: 'Admin Accounts', group: 'System', icon: 'shield' },
  { key: 'staff', label: 'Staff Accounts', group: 'System', icon: 'shield' },
  { key: 'teachers', label: 'Active Teachers', group: 'System', icon: 'teacher' },
  { key: 'whatsappDiagnostics', label: 'WhatsApp Logs', group: 'System', icon: 'whatsapp' },
  { key: 'auditLogs', label: 'Audit Log', group: 'System', icon: 'clipboard' },
  { key: 'account', label: 'My Account', group: 'System', icon: 'user' },
];

const field = (name, label, type = 'text', options = {}) => ({ name, label, type, ...options });

const FALLBACK_IMAGE_OPTIONS = [
  { value: 'recruitment', label: 'Teacher / classroom image' },
  { value: 'school', label: 'School systems image' },
  { value: 'bookshop', label: 'Books and stationery image' },
  { value: 'tutoring', label: 'Home learning image' },
  { value: 'research', label: 'Research support image' },
  { value: 'secretarial', label: 'Admin documents image' },
  { value: 'special', label: 'Inclusive education image' },
  { value: 'consulting', label: 'Consulting image' },
  { value: 'schoolms', label: 'SchoolMS image' },
];

const PARTNER_ICON_OPTIONS = [
  { value: 'pBuilding', label: 'School building' },
  { value: 'pBook', label: 'Book' },
  { value: 'pStar', label: 'Star' },
  { value: 'pColumn', label: 'Institution' },
  { value: 'pLeaf', label: 'Growth' },
  { value: 'pShield', label: 'Shield' },
];

const SERVICE_ICON_OPTIONS = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'growth', label: 'Growth' },
  { value: 'school', label: 'School' },
  { value: 'book', label: 'Book' },
  { value: 'tutor', label: 'Tutoring' },
  { value: 'research', label: 'Search' },
  { value: 'secretarial', label: 'Documents' },
  { value: 'special', label: 'Heart' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'extra', label: 'Activities' },
  { value: 'home', label: 'Home' },
  { value: 'schoolms', label: 'SchoolMS' },
];

const OTP_OVERRIDE_OPTIONS = [
  { value: 'customer_phone_unreachable_confirmed', label: 'Customer phone unreachable but delivery confirmed' },
  { value: 'authorized_person_received', label: 'Package received by authorized person' },
  { value: 'sms_failed', label: 'SMS failed' },
  { value: 'customer_unable_to_provide_otp', label: 'Customer unable to provide OTP' },
  { value: 'manual_realmindx_confirmation', label: 'Manual confirmation by RealMindX staff' },
  { value: 'other', label: 'Other' },
];

const EXPORTABLE_PERMISSION_KEYS = new Set(['jobs', 'applications', 'products', 'orders']);
const NAV_PERMISSION_GROUPS = NAV
  .filter(item => !['dashboard', 'admins', 'auditLogs', 'account', 'deliveryCompanies', 'deliverySettlements', 'bookshopCustomers'].includes(item.key))
  .map(item => {
    const actions = item.key === 'analytics'
      ? ['view', 'export']
      : item.key === 'alerts'
        ? ['view', 'edit']
        : item.key === 'receiptsInvoices'
          ? ['view']
        : item.key === 'staff'
          ? ['view', 'create', 'edit', 'delete']
          : item.key === 'whatsappDiagnostics'
            ? ['view']
          : item.key === 'teachers'
            ? ['view', 'edit', 'export']
            : item.key === 'priceAdjustment'
              ? ['view', 'edit']
          : ['view', 'create', 'edit', 'delete', ...(EXPORTABLE_PERMISSION_KEYS.has(item.key) ? ['export'] : [])];
    return { ...item, actions };
  });
const EXTRA_PERMISSION_GROUPS = [
  { key: 'delivery', label: 'Delivery System', group: 'Bookshop', icon: 'briefcase', actions: ['view', 'assign', 'companies.manage', 'audit.view', 'override_otp', 'settlements.view', 'settlements.manage', 'settlements.export', 'settlements.adjust', 'settlements.mark_paid', 'settlements.dispute_resolve'] },
  { key: 'uploads', label: 'File Uploads', group: 'System', icon: 'image', actions: ['create'] },
];
const PERMISSION_GROUPS = [...NAV_PERMISSION_GROUPS, ...EXTRA_PERMISSION_GROUPS];
const PERMISSION_OPTIONS = PERMISSION_GROUPS.flatMap(group => group.actions.map(action => `${group.key}.${action}`));
const LEGACY_PERMISSION_OPTIONS = [
  'manage_jobs',
  'view_applications',
  'manage_applications',
  'manage_users',
  'manage_products',
  'manage_orders',
  'manage_news',
  'manage_gallery',
  'manage_resources',
  'view_messages',
  'manage_newsletters',
  'manage_settings',
  'manage_admins',
];
const permissionSetFor = session => new Set(session?.permissions || []);
const hasSessionPermission = (session, permissionKey) => {
  if (session?.role === 'admin') return true;
  return permissionSetFor(session).has(permissionKey);
};
const expandPermissionsForSave = permissions => {
  const selected = new Set(Array.isArray(permissions) ? permissions : []);
  const addLegacy = (group, legacyKey) => {
    if (PERMISSION_OPTIONS.some(key => key.startsWith(`${group}.`) && selected.has(key))) {
      selected.add(legacyKey);
    }
  };
  addLegacy('jobs', 'manage_jobs');
  addLegacy('applications', 'view_applications');
  if (selected.has('applications.edit')) selected.add('manage_applications');
  if ([...selected].some(key => ['products.', 'productReviews.', 'categories.', 'flyers.', 'deliveryZones.'].some(prefix => key.startsWith(prefix)))) selected.add('manage_products');
  if ([...selected].some(key => ['orders.', 'receiptsInvoices.', 'orderReviews.'].some(prefix => key.startsWith(prefix)))) selected.add('manage_orders');
  if ([...selected].some(key => key.startsWith('delivery.'))) selected.add('manage_orders');
  if ([...selected].some(key => key.startsWith('news.'))) selected.add('manage_news');
  if ([...selected].some(key => key.startsWith('gallery.'))) selected.add('manage_gallery');
  if ([...selected].some(key => key.startsWith('resources.'))) selected.add('manage_resources');
  if ([...selected].some(key => key.startsWith('messages.'))) selected.add('view_messages');
  if ([...selected].some(key => key.startsWith('newsletters.'))) selected.add('manage_newsletters');
  if ([...selected].some(key => ['services.', 'partners.', 'people.', 'testimonials.', 'homeHeroSlides.', 'donationSlides.', 'siteCopy.', 'settings.'].some(prefix => key.startsWith(prefix)))) selected.add('manage_settings');
  if ([...selected].some(key => key.startsWith('staff.'))) selected.add('manage_admins');
  return [...selected];
};

const PUBLISHABLE_COLLECTIONS = new Set(['jobs', 'products', 'categories', 'flyers', 'services', 'partners', 'people', 'testimonials', 'homeHeroSlides', 'donationSlides', 'siteCopy', 'news', 'gallery', 'resources']);

const canAccessAdminItem = (item, session) => {
  const role = session?.role;
  if (role === 'admin') return true;
  if (item.key === 'dashboard' || item.key === 'account') return ['admin', 'staff'].includes(role);
  if (item.key === 'admins' || item.key === 'auditLogs') return false;
  if (item.key === 'receiptsInvoices') return hasSessionPermission(session, 'orders.view') || hasSessionPermission(session, 'receiptsInvoices.view');
  if (item.key === 'bookshopCustomers') return hasSessionPermission(session, 'orders.view');
  if (item.key === 'deliveryCompanies') return hasSessionPermission(session, 'delivery.view') || hasSessionPermission(session, 'delivery.companies.manage');
  if (item.key === 'deliverySettlements') return hasSessionPermission(session, 'delivery.settlements.view');
  return hasSessionPermission(session, `${item.key}.view`);
};

const CONFIG = {
  jobs: {
    title: 'Job Posts',
    description: 'Every public job on the jobs page is controlled here.',
    collection: 'jobs',
    createLabel: 'Post Job',
    fields: [
      field('title', 'Job Title'),
      field('organisation', 'School / Organisation'),
      field('delivery_zone_id', 'Location', 'delivery-zone-select', { help: 'Uses the same canonical area list as bookshop delivery and teacher alerts.' }),
      field('subject', 'Subject', 'select', { options: JOB_SUBJECTS }),
      field('level', 'Level', 'select', { options: JOB_LEVELS }),
      field('curriculum', 'Curriculum', 'select', { options: TEACHING_CURRICULA }),
      field('employment_type', 'Employment Type', 'select', { options: JOB_TYPES }),
      field('preferred_sex', 'Preferred Sex', 'select', { options: ['any', 'female', 'male', 'other'], help: 'Use Any unless the school has a lawful role-specific requirement.' }),
      field('preferred_age_range', 'Preferred Age Range', 'select', { options: ['any', '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'] }),
      field('salary_min', 'Minimum Salary (GHS)', 'number', { help: 'Monthly salary range shown to applicants. Leave both blank to show "Available on request".' }),
      field('salary_max', 'Maximum Salary (GHS)', 'number'),
      field('deadline', 'Deadline', 'date', { placeholder: 'No application deadline' }),
      field('description', 'Description', 'textarea'),
      field('requirements', 'Requirements', 'textarea', { help: 'One requirement per line. Shown as a bullet list to applicants.' }),
      field('responsibilities', 'Responsibilities', 'textarea', { help: 'One responsibility per line. Shown as a bullet list to applicants.' }),
      field('status', 'Status', 'select', { options: ['draft', 'published', 'closed'] }),
    ],
    columns: ['title', 'organisation', 'location', 'subject', 'status'],
  },
  products: {
    title: 'Bookshop Products',
    description: 'Books, stationery, and learning materials shown in the public bookshop.',
    collection: 'products',
    createLabel: 'Add Product',
    fields: [
      field('name', 'Product Name'),
      field('category_id', 'Item Type', 'category-select', { help: 'Choose an existing item type.' }),
      field('category_name', 'New Item Type (Optional)', 'text', { help: 'If the item type is not listed, type it here and it will be created automatically.' }),
      field('short_description', 'Short Description'),
      field('price', 'Price (GHS)', 'number'),
      field('old_price', 'Old Price (GHS)', 'number'),
      field('source', 'Supplier / Source', 'text', { help: 'Admin-only supplier, vendor, or source note. This is never shown in the public bookshop.' }),
      field('stock_status', 'Stock', 'select', { options: ['in_stock', 'low_stock', 'out_of_stock'] }),
      field('curriculum', 'Curriculum', 'select', { options: PRODUCT_CURRICULUM_OPTIONS, help: 'Choose a curriculum, All Curricula, or Other Curricula for neutral items.' }),
      field('author', 'Author'),
      field('publisher', 'Publisher'),
      field('level', 'Level', 'select', { options: PRODUCT_LEVEL_OPTIONS, help: 'Choose a level, All Levels, or Other Levels for neutral items.' }),
      field('subject', 'Subject', 'select', { options: PRODUCT_SUBJECT_OPTIONS, help: 'Choose a subject, All Subjects, or Other Subjects for neutral items.' }),
      field('image_file_id', 'Product Image', 'image', { aspectRatio: 3/4, cropTitle: 'Crop Product Cover (3:4)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 3:4 portrait, matching the proportions of a standard book cover.' },
        { icon: 'image',    text: 'Crop tip: centre the title and author name. Do not cut off the spine or barcode area at the bottom.' },
        { icon: 'camera',   text: 'Minimum size: 600 x 800 px. Higher resolution is sharper in the product detail view.' },
        { icon: 'check',    text: 'After cropping, the image fills product cards and the detail page uniformly, regardless of the original file dimensions.' },
      ] }),
      field('tags', 'Tags', 'tags', { help: 'Comma-separated: popular,new,sale' }),
      field('featured', 'Featured', 'checkbox'),
      field('is_active', 'Published / Visible', 'checkbox'),
    ],
    columns: ['image_url', 'name', 'category', 'curriculum', 'publisher', 'price', 'stock_status'],
    columnLabels: { image_url: 'Image', stock_status: 'Stock' },
  },
  productReviews: {
    title: 'Product Reviews',
    description: 'Approve, reject, or delete customer ratings before they appear in the public bookshop.',
    collection: 'productReviews',
    createLabel: '',
    allowCreate: false,
    allowEdit: false,         // moderation only — no editing reviews
    moderationOnly: true,
    statusOptions: ['pending', 'approved', 'rejected'],
    emptyTitle: 'No Product Reviews Yet',
    emptyBody: 'When customers rate purchased products, their reviews will wait here for approval.',
    fields: [],               // no edit form
    columns: ['product_name', 'customer_name', 'rating', 'status'],
    columnLabels: { product_name: 'Product', customer_name: 'Customer', rating: 'Rating' },
  },
  promoCodes: {
    title: 'Promo Codes',
    description: 'Create discount codes and optional affiliate commissions. Affiliate commission is earned only after an order is marked complete.',
    collection: 'promoCodes',
    permissionKey: 'priceAdjustment',
    createLabel: 'Add Promo Code',
    fields: [
      field('code', 'Code', 'text', { help: 'Uppercase, no spaces. e.g. SCHOOL25 or FREESHIP' }),
      field('description', 'Description', 'text', { help: 'Shown to the customer at checkout when code is applied.' }),
      field('discount_type', 'Discount Type', 'select', { options: ['percentage', 'fixed'] }),
      field('discount_value', 'Discount Value', 'number', { help: 'For percentage: enter e.g. 15 (= 15%). For fixed: enter the GH₵ amount.' }),
      field('applies_to', 'Applies To', 'select', { options: ['products', 'delivery', 'all'] }),
      field('min_order_amount', 'Minimum Order Amount (GH₵)', 'number', { help: 'Leave 0 for no minimum.' }),
      field('max_uses', 'Maximum Uses', 'number', { help: 'Leave blank for unlimited.' }),
      field('valid_from', 'Valid From', 'date', { placeholder: 'No start restriction', help: 'Leave blank for this code to be valid immediately.', max: form => form.valid_until || undefined }),
      field('valid_until', 'Valid Until', 'date', { placeholder: 'No expiry', help: 'Leave blank for this code to never expire.', min: form => form.valid_from || undefined }),
      field('is_active', 'Active', 'checkbox'),
      field('affiliate_name', 'Affiliate / Owner Name', 'text', { help: 'Person or organisation assigned to this promo code.' }),
      field('affiliate_email', 'Affiliate Email', 'email', { help: 'Receives completed-sale notices and monthly statements.' }),
      field('affiliate_phone', 'Affiliate Phone', 'text'),
      field('affiliate_commission_percent', 'Commission %', 'number', { help: 'Percentage of completed merchandise sales, excluding delivery fees. Set 0 for no commission.' }),
      field('affiliate_notify_on_use', 'Email on Completed Sale', 'checkbox', { defaultValue: true }),
    ],
    columns: ['code', 'discount_type', 'discount_value', 'applies_to', 'affiliate_name', 'affiliate_commission_percent', 'is_active'],
    columnLabels: { discount_type: 'Type', discount_value: 'Value', applies_to: 'Applies To', affiliate_name: 'Affiliate', affiliate_commission_percent: 'Commission %' },
  },
  flyers: {
    title: 'Bookshop Flyers',
    description: 'Published flyers rotate in the bookshop hero. One flyer can also be the Flyer of Focus, including a draft.',
    collection: 'flyers',
    createLabel: 'Add Flyer',
    fields: [
      field('headline', 'Headline'),
      field('accent', 'Accent Text', 'text', { help: 'The gold highlighted line under the headline.' }),
      field('subline', 'Subline', 'textarea'),
      field('badge', 'Badge / CTA Label', 'text', { help: 'Leave blank if the flyer image already includes the call to action.' }),
      field('sort_order', 'Order', 'number', { help: 'Lower numbers appear first.' }),
      field('image_file_id', 'Hero Image', 'image', { aspectRatio: 16/6, cropTitle: 'Crop Flyer / Hero Banner (16:6)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:6. This is a wide landscape banner used in the bookshop homepage carousel.' },
        { icon: 'image',    text: 'Crop tip: keep important text and focal points within the centre 60% of the frame. Edges can be clipped on smaller screens.' },
        { icon: 'camera',   text: 'Minimum size: 1280 x 480 px. Use a high-contrast image because the headline text is overlaid on this.' },
        { icon: 'check',    text: 'Flyers rotate automatically in the hero section. Upload at least 3 for a good scrolling experience.' },
      ] }),
      field('show_overlay', 'Dark / Stripe Overlay', 'checkbox'),
      field('is_focus', 'Flyer of Focus', 'checkbox', { help: 'Show this flyer to visitors in a dismissible modal at most once every 12 hours. Selecting it replaces the previous Flyer of Focus.' }),
      field('image_fit', 'Image Fit', 'select', { options: ['cover', 'contain'] }),
      field('image_position', 'Image Position', 'select', { options: ['center', 'top', 'bottom', 'left', 'right'] }),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'headline', 'accent', 'badge', 'is_focus', 'status'],
    columnLabels: { image_url: 'Image', is_focus: 'Focus' },
  },
  categories: {
    title: 'Product Categories',
    description: 'These appear in the bookshop category menu. Set a bulk discount to automatically reduce the price when a customer orders the configured quantity of any product in that category.',
    collection: 'categories',
    createLabel: 'Add Category',
    fields: [
      field('name', 'Category Name'),
      field('slug', 'Slug', 'text', { help: 'URL-friendly identifier, e.g. textbooks' }),
      field('description', 'Description', 'textarea'),
      field('sort_order', 'Sort Order', 'number'),
      field('is_active', 'Active / Visible', 'checkbox'),
      field('bulk_discount_percent', 'Bulk Discount %', 'number', { help: 'Discount applied when a customer reaches the bulk minimum quantity for this category. Set to 0 to disable. e.g. 10 = 10% off.' }),
      field('bulk_min_qty', 'Bulk Min. Quantity', 'number', { help: 'Minimum quantity to trigger the bulk discount. Default is 10.' }),
    ],
    columns: ['name', 'slug', 'bulk_discount_percent', 'is_active'],
    columnLabels: { bulk_discount_percent: 'Bulk Discount %' },
  },
  deliveryZones: {
    title: 'Delivery Prices',
    description: 'Set checkout delivery areas, searchable aliases, and the delivery fee from Dome Pillar 2.',
    collection: 'deliveryZones',
    createLabel: 'Add Location',
    fields: [
      field('name', 'Display Location', 'text', { help: 'The clean location name customers see at checkout.' }),
      field('aliases_text', 'Search Aliases', 'textarea', { help: 'Comma-separated or one per line. Examples: Sarpeiman, Kitasi, Kwadjo Ashong.' }),
      field('fee', 'Delivery Fee (GHS)', 'number', { help: 'Use multiples of 5. Pickup at Dome Pillar 2 should remain 0 and not be a delivery area.' }),
      field('region', 'Region'),
      field('district_or_municipality', 'District / Municipality'),
      field('nearby_major_town', 'Nearby Major Town'),
      field('delivery_zone_label', 'Delivery Belt'),
      field('description', 'Checkout / Admin Note', 'textarea'),
      field('sort_order', 'Sort Order', 'number'),
      field('is_active', 'Active', 'checkbox', { toggleLabel: 'Available in admin and checkout' }),
      field('is_delivery_area', 'Show at checkout', 'checkbox', { toggleLabel: 'Show this location in checkout search' }),
      field('is_search_alias_only', 'Alias Only', 'checkbox', { toggleLabel: 'Use only as a hidden search alias' }),
    ],
    columns: ['name', 'fee', 'region', 'nearby_major_town', 'delivery_zone_label', 'is_active'],
    columnLabels: { nearby_major_town: 'Nearby Town', delivery_zone_label: 'Delivery Belt', is_active: 'Active' },
  },
  deliveryCompanies: {
    title: 'Delivery Companies',
    description: 'Create delivery partners, manage company access, and review delivery performance.',
    collection: 'deliveryCompanies',
    createLabel: 'Create Delivery Company',
    permissionKey: 'delivery',
    allowDelete: false,
    fields: [
      field('name', 'Company Name'),
      field('contact_name', 'Contact Name'),
      field('contact_phone', 'Contact Phone'),
      field('contact_email', 'Contact Email', 'email'),
      field('default_delivery_payable', 'Default Company Payable (GHS)', 'number', { help: 'The amount this company earns per successful delivery unless overridden during assignment.' }),
      field('notes', 'Internal Notes', 'textarea'),
      field('manager_name', 'First Manager Name', 'text', { help: 'Used when creating the first company manager.' }),
      field('manager_phone', 'First Manager Phone', 'text', { help: 'Creates portal access with temporary password 12345678 and requires a first-login password change.' }),
      field('is_active', 'Active', 'checkbox'),
    ],
    columns: ['name', 'contact_phone', 'contact_email', 'active_deliveries', 'completed_deliveries', 'status'],
    columnLabels: { contact_phone: 'Phone', contact_email: 'Email', active_deliveries: 'Active', completed_deliveries: 'Delivered' },
  },
  deliverySettlements: {
    title: 'Delivery Settlements',
    description: 'Daily external delivery collections, company payables, balances, payments, and disputes.',
    collection: 'deliverySettlements',
    permissionKey: 'delivery.settlements',
    readOnly: true,
    allowCreate: false,
    allowDelete: false,
    columns: ['reference', 'company_name', 'settlement_date', 'delivery_count', 'due_realmindx', 'due_company', 'net_balance', 'status'],
    columnLabels: { company_name: 'Company', settlement_date: 'Date', delivery_count: 'Deliveries', due_realmindx: 'Due RealMindX', due_company: 'Due Company', net_balance: 'Net' },
  },
  services: {
    title: 'Services',
    description: 'Every service shown on the homepage strip, services page, and dedicated service routes can be edited, reordered, published, or deleted here.',
    collection: 'services',
    createLabel: 'Add Service',
    fields: [
      field('id', 'Anchor ID', 'text', { help: 'Stable URL anchor, e.g. teacher-recruitment. Avoid changing after publishing.' }),
      field('label', 'Service Label'),
      field('tag', 'Eyebrow / Category'),
      field('title', 'Section Title'),
      field('summary', 'Short Summary', 'textarea'),
      field('body', 'Body Copy', 'textarea', { help: 'Separate paragraphs with a blank line.' }),
      field('features', 'Feature List', 'textarea', { help: 'One feature per line.' }),
      field('primary_cta_label', 'Primary CTA Label'),
      field('primary_cta_href', 'Primary CTA Link'),
      field('secondary_cta_label', 'Secondary CTA Label'),
      field('secondary_cta_href', 'Secondary CTA Link'),
      field('detail_tag', 'Dedicated Page Eyebrow', 'text', { help: 'Optional. Falls back to the listing eyebrow above.' }),
      field('detail_title', 'Dedicated Page Title', 'textarea', { help: 'Optional. Leave blank to reuse the listing title.' }),
      field('detail_summary', 'Dedicated Page Summary', 'textarea', { help: 'Optional. Leave blank to reuse the listing summary.' }),
      field('detail_body', 'Dedicated Page Body', 'textarea', { help: 'Optional. Separate paragraphs with a blank line. Falls back to the listing body.' }),
      field('detail_features', 'Dedicated Page Feature List', 'textarea', { help: 'Optional. One feature per line. Falls back to the listing features.' }),
      field('detail_primary_cta_label', 'Dedicated Page Primary CTA Label'),
      field('detail_primary_cta_href', 'Dedicated Page Primary CTA Link'),
      field('detail_secondary_cta_label', 'Dedicated Page Secondary CTA Label'),
      field('detail_secondary_cta_href', 'Dedicated Page Secondary CTA Link'),
      field('icon', 'Service Icon', 'select', { options: SERVICE_ICON_OPTIONS }),
      field('image_file_id', 'Service Image', 'image', { aspectRatio: 16/9, cropTitle: 'Crop Service Image (16:9)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:9. This is the standard widescreen format used on the services detail page.' },
        { icon: 'image',    text: 'Crop tip: use a real photo showing the service in action. A teacher in a classroom, students studying, or a school setting works well. Avoid generic stock photos.' },
        { icon: 'camera',   text: 'Minimum size: 1200 x 675 px.' },
        { icon: 'check',    text: 'This image appears alongside the service description and feature list. Pick one that immediately communicates what the service delivers.' },
      ] }),
      field('detail_image_file_id', 'Dedicated Page Image', 'image', { aspectRatio: 16/9, cropTitle: 'Crop Dedicated Service Image (16:9)', guide: [
        { icon: 'target',   text: 'Optional. Use this when the dedicated page needs a richer, more specific hero image than the services listing.' },
        { icon: 'image',    text: 'If left blank, the dedicated page automatically reuses the main service image.' },
        { icon: 'camera',   text: 'Minimum size: 1200 x 675 px.' },
        { icon: 'check',    text: 'Choose an image that gives the dedicated page its own story while staying true to the service.' },
      ] }),
      field('image_key', 'Default Image if no upload', 'select', { options: FALLBACK_IMAGE_OPTIONS }),
      field('badge', 'Badge'),
      field('detail_badge', 'Dedicated Page Badge'),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'label', 'tag', 'sort_order', 'status'],
    columnLabels: { image_url: 'Image', sort_order: 'Order' },
  },
  partners: {
    title: 'Partner Logos',
    description: 'Schools and organisations displayed on the homepage partners section. After five items, the public section becomes a logo marquee.',
    collection: 'partners',
    createLabel: 'Add Partner',
    idField: 'id',
    fields: [
      field('id', 'Anchor ID', 'text', { help: 'Stable identifier, e.g. bright-minds-school.' }),
      field('name', 'Partner Name'),
      field('icon', 'Fallback Icon', 'select', { options: PARTNER_ICON_OPTIONS }),
      field('image_file_id', 'Logo Image', 'image', { aspectRatio: 1, cropTitle: 'Crop Partner Logo (square)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 1:1 square. Partner logos are displayed in a uniform grid.' },
        { icon: 'image',    text: 'Crop tip: centre the logo mark with equal padding on all sides. Avoid cropping into the wordmark or tagline.' },
        { icon: 'camera',   text: 'Best format: PNG with a transparent background. If transparent is unavailable, use white. Minimum 300 x 300 px.' },
        { icon: 'check',    text: 'Logos appear in the scrolling partner marquee on the homepage. Keep the crop tight so the logo stays legible at small sizes.' },
      ] }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'name', 'sort_order', 'status'],
    columnLabels: { image_url: 'Logo', sort_order: 'Order' },
  },
  people: {
    title: 'The People',
    description: 'Leadership and team cards shown on the About page. Add photos, roles, and short bios here.',
    collection: 'people',
    createLabel: 'Add Person',
    idField: 'id',
    fields: [
      field('id', 'Person ID', 'text', { help: 'Stable identifier, e.g. founder-chief-executive.' }),
      field('name', 'Full Name'),
      field('position', 'Position / Role'),
      field('bio', 'Short Bio', 'textarea'),
      field('initials', 'Fallback Initials', 'text', { help: 'Shown only if no profile photo is uploaded.' }),
      field('image_file_id', 'Profile Photo', 'image', { aspectRatio: 3/4, cropTitle: 'Crop Profile Photo (3:4)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 3:4 portrait. Used in the Leadership Team section on the About page.' },
        { icon: 'image',    text: 'Crop tip: frame from the shoulders up with a small margin above the head. Good lighting and a neutral or branded background works best.' },
        { icon: 'camera',   text: 'Minimum size: 400 x 533 px. Smiling, professional headshots build trust with visitors.' },
        { icon: 'check',    text: 'If no photo is provided, the system displays the initials as a fallback. A photo always looks more professional.' },
      ] }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'name', 'position', 'sort_order', 'status'],
    columnLabels: { image_url: 'Photo', sort_order: 'Order' },
  },
  testimonials: {
    title: 'Testimonials',
    description: 'Client quotes shown in the rotating "What clients are saying" section on the homepage.',
    collection: 'testimonials',
    createLabel: 'Add Testimonial',
    idField: 'id',
    fields: [
      field('id', 'Testimonial ID', 'text', { help: 'Stable identifier, e.g. mr-james-bright-minds. Leave blank to generate from the name.' }),
      field('quote', 'Quote', 'textarea', { help: 'The client\'s words, shown as the large quote. Keep it to one or two sentences.' }),
      field('name', 'Client Name', 'text', { help: 'E.g. Mrs. Grace. The avatar initials are generated from this name.' }),
      field('role', 'Role / Organisation', 'text', { help: 'E.g. Principal, Elite High School.' }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['name', 'role', 'quote', 'sort_order', 'status'],
    columnLabels: { sort_order: 'Order' },
  },
  homeHeroSlides: {
    title: 'Homepage Hero Slides',
    description: 'Published slides control the rotating hero images on the homepage.',
    collection: 'homeHeroSlides',
    createLabel: 'Add Hero Slide',
    idField: 'id',
    fields: [
      field('id', 'Slide ID', 'text', { help: 'Stable identifier, e.g. homepage-teacher-recruitment.' }),
      field('label', 'Admin Label'),
      field('alt', 'Image Alt Text'),
      field('image_file_id', 'Hero Image', 'image', { aspectRatio: 16/7, cropTitle: 'Crop Homepage Hero (16:7)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:7. This is an ultra-wide cinematic banner used in the homepage hero slideshow.' },
        { icon: 'image',    text: 'Crop tip: the headline text overlays the left half of the image. Keep the focal point (a classroom, a student, a teacher) on the right half. Avoid busy patterns in the centre.' },
        { icon: 'camera',   text: 'Minimum size: 1400 x 612 px. High-resolution landscape photos of RealMindX in action work best.' },
        { icon: 'check',    text: 'Up to 5 slides cycle automatically. Each slide should tell a different story: recruitment, bookshop, tutoring, school support, community.' },
      ] }),
      field('image_key', 'Default Image if no upload', 'select', { options: FALLBACK_IMAGE_OPTIONS }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'label', 'sort_order', 'status'],
    columnLabels: { image_url: 'Image', sort_order: 'Order' },
  },
  donationSlides: {
    title: 'Donation Page Slides',
    description: 'Published slides control the donation page impact slideshow.',
    collection: 'donationSlides',
    createLabel: 'Add Donation Slide',
    idField: 'id',
    fields: [
      field('id', 'Slide ID', 'text', { help: 'Stable identifier, e.g. donation-books-for-learners.' }),
      field('label', 'Slide Label'),
      field('alt', 'Image Alt Text'),
      field('image_file_id', 'Slide Image', 'image', { aspectRatio: 16/7, cropTitle: 'Crop Donation Slide (16:7)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:7. Wide slide used in the donation page impact gallery.' },
        { icon: 'image',    text: 'Crop tip: use real, emotional photos from the field. Students in class, teachers at CPD sessions, and school transformations are ideal. Authenticity drives donations.' },
        { icon: 'camera',   text: 'Minimum size: 1400 x 612 px. Avoid watermarked stock photos. Real photos from RealMindX activities are far more compelling.' },
        { icon: 'check',    text: 'These slides sit above the donation form and build trust. Aim for 5 to 8 diverse, impactful images.' },
      ] }),
      field('image_key', 'Default Image if no upload', 'select', { options: FALLBACK_IMAGE_OPTIONS }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'label', 'sort_order', 'status'],
    columnLabels: { image_url: 'Image', sort_order: 'Order' },
  },
  siteCopy: {
    title: 'Page Text',
    description: 'Edit headings, paragraphs, legal text, and other important wording across the public website.',
    collection: 'siteCopy',
    createLabel: 'Add Page Text',
    idField: 'id',
    fields: [
      field('id', 'Text ID', 'text', { help: 'Short unique name. Example: services_hero_title.' }),
      field('key', 'Text Key', 'text', { help: 'Use the same value as the Text ID.' }),
      field('label', 'Friendly Name'),
      field('area', 'Website Area', 'select', { options: ['home', 'about', 'services', 'legal', 'bookshop', 'jobs', 'contact'] }),
      field('value', 'Text', 'textarea'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['label', 'area', 'status'],
  },
  news: {
    title: 'News and Updates',
    description: 'News page content can be drafted, edited, published, or deleted here.',
    collection: 'news',
    createLabel: 'Write Post',
    fields: [
      field('title', 'Title'),
      field('category', 'Category'),
      field('image_file_id', 'Post Image', 'image', { aspectRatio: 16/9, cropTitle: 'Crop News Image (16:9)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:9. Standard widescreen format used on news cards and the article header.' },
        { icon: 'image',    text: 'Crop tip: pick an image that visually summarises the story. For events, show attendees. For announcements, use the relevant product, person, or location.' },
        { icon: 'camera',   text: 'Minimum size: 1200 x 675 px. A strong header image is the biggest driver of people clicking through to read the article.' },
        { icon: 'check',    text: 'This image also appears in newsletters when the post is reused. Make it recognisable and eye-catching at small sizes.' },
      ] }),
      field('summary', 'Summary', 'textarea'),
      field('body', 'Intro / Fallback Body', 'textarea', { help: 'Shown before the sections, or used as the full article if no sections are added.' }),
      field('sections', 'Article Sections', 'article-sections', { help: 'Add headings, body text, images, and captions for the full news article.' }),
      field('date', 'Display Date', 'date', { placeholder: 'No display date set' }),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'title', 'category', 'date', 'status'],
    columnLabels: { image_url: 'Image' },
  },
  gallery: {
    title: 'Gallery',
    description: 'Gallery entries shown on the public gallery route.',
    collection: 'gallery',
    createLabel: 'Add Gallery Item',
    fields: [
      field('title', 'Title'),
      field('description', 'Description', 'textarea'),
      field('image_file_id', 'Image', 'image', { aspectRatio: 4/3, cropTitle: 'Crop Gallery Image (4:3)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 4:3. Standard photo format used in the public gallery grid.' },
        { icon: 'image',    text: 'Crop tip: keep the main subject centred. Avoid blurry or overexposed shots. The gallery is public-facing and directly reflects the brand.' },
        { icon: 'camera',   text: 'Minimum size: 800 x 600 px. Landscape photos from RealMindX events, classroom visits, and community activities work best.' },
        { icon: 'check',    text: 'The gallery is often the first place potential school partners look to assess the quality and scale of RealMindX work. Choose impactful, well-lit photos.' },
      ] }),
      field('sort_order', 'Sort Order', 'number'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'title', 'sort_order', 'status'],
    columnLabels: { image_url: 'Image', sort_order: 'Order' },
  },
  resources: {
    title: 'Education Resources',
    description: 'Official policies, syllabi, guides, templates, and learning resources in the public library.',
    collection: 'resources',
    createLabel: 'Add Resource',
    fields: [
      field('title', 'Title', 'text', { required: true }),
      field('category', 'Category', 'select', { required: true, options: ['Official Policies', 'Curriculum and Syllabi', 'Teacher Resources', 'Inclusive Education', 'Assessment and Exams', 'School Management', 'Parents and Learners', 'Research and Reports', 'RealMindX Originals'] }),
      field('description', 'Description (optional, recommended)', 'textarea'),
      field('resource_file_id', 'Document File', 'file', {
        category: 'resources',
        accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv',
        help: 'Upload the actual education document. PDF is preferred; Word, PowerPoint, Excel, and CSV files are also accepted.',
      }),
      field('url', 'External URL', 'text', { help: 'Optional. Use this only when the document must live outside RealMindX; uploaded files take priority when no external URL is supplied.' }),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
      field('level', 'Level', 'select', { advanced: true, options: ['', 'Early Years', 'Kindergarten', 'Lower Primary', 'Upper Primary', 'JHS', 'SHS', 'TVET', 'Tertiary', 'Teacher Education', 'Whole School', 'Parents', 'General'] }),
      field('subject', 'Subject', 'text', { advanced: true }),
      field('curriculum', 'Curriculum', 'text', { advanced: true }),
      field('source', 'Source / Publisher', 'text', { advanced: true, help: 'Ministry, agency, publisher, institution, or original source of this document. Shown publicly when available.' }),
      field('publication_year', 'Year', 'number', { advanced: true }),
      field('tags', 'Tags', 'text', { advanced: true, help: 'Comma-separated search terms.' }),
      field('audience', 'Audience', 'text', { advanced: true }),
      field('official_source_url', 'Official Source URL', 'text', { advanced: true }),
      field('copyright_status', 'Copyright / Publication Status', 'select', { advanced: true, options: ['', 'Official public document', 'Linked only', 'Uploaded with permission', 'RealMindX original', 'Open access', 'Internal/private', 'Do not publish'] }),
      field('document_type', 'Document Type', 'select', { advanced: true, options: ['', 'Policy', 'Curriculum', 'Syllabus', 'Framework', 'Guide', 'Template', 'Checklist', 'Form', 'Report', 'Research paper', 'Lesson material', 'Scheme of work', 'Assessment tool', 'Parent guide', 'Other'] }),
      field('featured', 'Featured Resource', 'checkbox', { advanced: true }),
      field('last_verified_at', 'Last Verified Date', 'date', { advanced: true }),
    ],
    columns: ['title', 'category', 'level', 'subject', 'source', 'publication_year', 'status'],
    columnLabels: { publication_year: 'Year' },
  },
  messages: {
    title: 'Tickets',
    description: 'All enquiries and contact submissions across the main site and bookshop.',
    collection: 'messages',
    createLabel: '',
    allowCreate: false,
    emptyTitle: 'No Tickets Yet',
    emptyBody: 'Contact form submissions and bookshop enquiries will appear here once received.',
    fields: [
      field('name', 'Name'),
      field('email', 'Email'),
      field('phone', 'Phone'),
      field('subject', 'Subject'),
      field('service', 'Source'),
      field('message', 'Message', 'textarea'),
      field('status', 'Status', 'select', { options: ['new', 'read', 'replied', 'resolved', 'archived'] }),
      field('notes', 'Admin Notes', 'textarea', { help: 'Internal notes. Not visible to the customer.' }),
    ],
    columns: ['ticket_reference', 'name', 'email', 'subject', 'service', 'status'],
  },
  orders: {
    title: 'Bookshop Orders',
    description: 'Bookshop order requests and order-status handling.',
    collection: 'orders',
    createLabel: '',        // no manual order creation from admin
    allowCreate: false,
    allowEdit: false,       // orders are view-only; use status actions only
    statusOnly: true,       // only status changes and archiving allowed
    allowArchive: true,
    statusOptions: ['new', 'confirmed', 'shipped', 'complete', 'cancelled'],
    requireCancelReason: true,
    emptyTitle: 'No Bookshop Orders Yet',
    emptyBody: 'Customer orders from the bookshop will appear here.',
    fields: [],             // no edit form fields
    columns: ['order_reference', 'customer_name', 'total_amount', 'status', 'delivery_company', 'delivery_rider', 'delivery_status', 'otp_status'],
    columnLabels: { delivery_company: 'Company', delivery_rider: 'Rider', delivery_status: 'Delivery', otp_status: 'OTP' },
  },
  orderReviews: {
    title: 'Order Reviews',
    description: 'Order-level customer feedback collected after delivery so the team can spot fulfilment issues and follow up quickly.',
    collection: 'orderReviews',
    createLabel: '',
    allowCreate: false,
    allowEdit: false,
    statusOnly: true,
    allowArchive: true,
    statusOptions: ['new', 'reviewed', 'follow_up'],
    emptyTitle: 'No Order Reviews Yet',
    emptyBody: 'Delivered-order feedback will appear here after customers rate their experience.',
    fields: [],
    columns: ['order_reference', 'customer_name', 'score', 'status'],
    columnLabels: { order_reference: 'Order', customer_name: 'Customer', score: 'NPS Score' },
  },
  newsletters: {
    title: 'Newsletter Subscribers',
    description: 'Newsletter subscribers from public and bookshop signups.',
    collection: 'newsletters',
    createLabel: 'Add Subscriber',
    fields: [
      field('email', 'Email'),
      field('source', 'Source'),
      field('status', 'Status', 'select', { options: ['active', 'unsubscribed'] }),
    ],
    columns: ['email', 'source', 'status'],
  },
  settings: {
    title: 'Contact & Site Details',
    description: 'Manage contact details and opening hours for both public sites together or for either site separately.',
    collection: 'settings',
    createLabel: 'Add Site Detail',
    idField: 'id',
    fields: [
      field('key', 'Detail Name', 'text', { help: 'Examples: contact_phone_1, contact_email, contact_address, working_hours_weekday, or working_hours_saturday.' }),
      field('site_scope', 'Applies To', 'select', { options: [
        { value: 'all', label: 'Both sites' },
        { value: 'main', label: 'Main website only' },
        { value: 'bookshop', label: 'Bookshop only' },
      ] }),
      field('value', 'Website Value', 'textarea', { help: 'A site-specific value overrides the shared value only on that site.' }),
      field('public', 'Show on website', 'checkbox'),
    ],
    columns: ['key', 'site_scope', 'value', 'public'],
    columnLabels: { key: 'Detail', site_scope: 'Applies To', public: 'Visible' },
  },
  staff: {
    title: 'Staff Accounts',
    description: 'Create staff accounts and assign exactly the permissions each person should access.',
    collection: 'staff',
    createLabel: 'Create Staff Account',
    fields: [
      field('email', 'Email Address', 'email'),
      field('first_name', 'First Name'),
      field('last_name', 'Last Name'),
      field('permissions', 'Permissions', 'permission-list', { options: PERMISSION_OPTIONS, groups: PERMISSION_GROUPS }),
      field('status', 'Status', 'select', { options: ['active', 'inactive'] }),
    ],
    columns: ['full_name', 'email', 'role', 'status'],
  },
  admins: {
    title: 'Admin Accounts',
    description: 'Create and manage full admin accounts. Admin accounts are internal only and do not use public OTP verification.',
    collection: 'admins',
    createLabel: 'Create Admin Account',
    fields: [
      field('email', 'Email Address', 'email', { help: 'Use an official RealMindX admin email where possible.' }),
      field('first_name', 'First Name'),
      field('last_name', 'Last Name'),
      field('status', 'Status', 'select', { options: ['active', 'inactive'] }),
    ],
    columns: ['full_name', 'email', 'role', 'status'],
  },
  auditLogs: {
    title: 'Audit Log',
    description: 'A protected record of admin and staff actions across the system. Only full admins can view this.',
    collection: 'auditLogs',
    createLabel: '',
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    readOnly: true,
    note: false,
    emptyTitle: 'No Audit Entries Yet',
    emptyBody: 'Admin actions will appear here automatically once changes are made.',
    fields: [],
    columns: ['actor', 'actor_role', 'summary', 'entity_type'],
    columnLabels: { actor_role: 'Account Type', summary: 'What Happened', entity_type: 'Area' },
  },
};

const statusLabel = value => String(value || 'draft').replace(/_/g, ' ');
const orderStatusBadgeClass = status => {
  const value = String(status || '').toLowerCase();
  if (['complete', 'delivered'].includes(value)) return 'badge-success order-state-pill';
  if (['cancelled', 'failed', 'returned', 'rejected_by_company'].includes(value)) return 'badge-danger order-state-pill';
  return 'badge-warning order-state-pill';
};
const formatActivityDate = value => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-';

const optionValue = option => (typeof option === 'object' ? option.value : option);
const optionLabel = option => (typeof option === 'object' ? option.label : statusLabel(option));
const columnLabel = (config, column) =>
  config.columnLabels?.[column]
  || column.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const SITE_SETTING_LABELS = {
  contact_address: 'Office address',
  contact_email: 'Contact email',
  contact_map_embed: 'Map embed link',
  contact_phone_1: 'Primary phone',
  contact_phone_2: 'Secondary phone',
  contact_phone_3: 'Third phone',
  working_hours_weekday: 'Weekday opening hours',
  working_hours_saturday: 'Saturday opening hours',
};

const SITE_SCOPE_LABELS = {
  all: 'Both sites',
  main: 'Main website only',
  bookshop: 'Bookshop only',
};

const adminAssetUrl = value => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  try {
    return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
  } catch {
    return value;
  }
};

const rowImageUrl = row => adminAssetUrl(row.image_url_thumb || row.image_url_medium || row.image_url || row.image || row.logo_url || row.cover_url);

const insertMarkdownLink = (value, selectionStart, selectionEnd, href, label) => {
  const text = String(value || '');
  const safeStart = Math.max(0, Math.min(Number(selectionStart) || 0, text.length));
  const safeEnd = Math.max(safeStart, Math.min(Number(selectionEnd) || safeStart, text.length));
  const selectedText = text.slice(safeStart, safeEnd);
  const leadingWhitespace = selectedText.match(/^\s*/)?.[0].length || 0;
  const trailingWhitespace = selectedText.match(/\s*$/)?.[0].length || 0;
  const coreStart = safeStart + leadingWhitespace;
  const coreEnd = safeEnd - trailingWhitespace;
  const linkLabel = text.slice(coreStart, coreEnd) || label || 'Service';
  const link = `[${linkLabel}](${href})`;
  return {
    nextValue: `${text.slice(0, coreStart)}${link}${text.slice(coreEnd)}`,
    cursor: coreStart + link.length,
  };
};

const ServiceLinkTextarea = ({ value, onChange, rows = 5, placeholder, textareaClassName = 'form-textarea' }) => {
  const { items: services } = usePublicServicesState();
  const textareaRef = React.useRef(null);
  const selectionRef = React.useRef({ start: 0, end: 0 });
  const [selectedHref, setSelectedHref] = React.useState('');

  React.useEffect(() => {
    if (!services.length) return;
    setSelectedHref(current => {
      if (current && services.some(service => service.href === current)) return current;
      return services[0]?.href || '';
    });
  }, [services]);

  const rememberSelection = event => {
    const target = event.target;
    selectionRef.current = {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
    };
  };

  const insertServiceLink = () => {
    const service = services.find(item => item.href === selectedHref) || services[0];
    if (!service) return;
    const { nextValue, cursor } = insertMarkdownLink(
      value,
      selectionRef.current.start,
      selectionRef.current.end,
      service.href,
      service.label,
    );
    onChange(nextValue);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="markdown-service-editor">
      <div className="markdown-service-toolbar">
        <label className="markdown-service-select">
          <span>Service</span>
          <select
            className="form-select markdown-service-select-control"
            value={selectedHref}
            onChange={event => setSelectedHref(event.target.value)}
            disabled={!services.length}
          >
            {services.length ? (
              services.map(service => (
                <option key={service.href || service.id} value={service.href}>
                  {service.label}
                </option>
              ))
            ) : (
              <option value="">No services available</option>
            )}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-outline-navy btn-sm markdown-service-button"
          onMouseDown={event => event.preventDefault()}
          onClick={insertServiceLink}
          disabled={!services.length}
          title="Insert the selected service link at the cursor"
        >
          <Icon name="paperclip" size={14} stroke={2} />
          <span>Insert service link</span>
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className={textareaClassName}
        rows={rows}
        value={value}
        onChange={event => {
          rememberSelection(event);
          onChange(event.target.value);
        }}
        onSelect={rememberSelection}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onClick={rememberSelection}
        onFocus={rememberSelection}
        placeholder={placeholder}
      />
    </div>
  );
};

const normalizeFormValue = (value, itemField) => {
  if (itemField.type === 'number') return value === '' ? null : Number(value);
  if (itemField.type === 'checkbox') return Boolean(value);
  if (itemField.type === 'tags') return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean);
  if (itemField.type === 'image') return value ? Number(value) : null; // stored as file ID (number)
  if (itemField.type === 'file') return value ? Number(value) : null; // stored as file ID (number)
  if (itemField.type === 'category-select' || itemField.type === 'delivery-zone-select') return value ? Number(value) : null;
  if (itemField.type === 'permission-list') return expandPermissionsForSave(value);
  if (itemField.type === 'article-sections') return Array.isArray(value) ? value : [];
  return value;
};

const valueForInput = (value, itemField) => {
  if (itemField.type === 'tags') return Array.isArray(value) ? value.join(', ') : value || '';
  if (itemField.type === 'textarea') return Array.isArray(value) ? value.join('\n') : value || '';
  if (itemField.type === 'checkbox') return Boolean(value);
  if (itemField.type === 'image') return value ?? ''; // stores file ID
  if (itemField.type === 'file') return value ?? ''; // stores file ID
  if (itemField.type === 'category-select' || itemField.type === 'delivery-zone-select') return value ?? '';
  if (itemField.type === 'permission-list') return Array.isArray(value) ? value : [];
  if (itemField.type === 'article-sections') return Array.isArray(value) ? value : [];
  if (itemField.type === 'select' && (value === null || value === undefined || value === '') && itemField.options?.length) {
    // A <select> always shows its first <option> when value doesn't match any option, so make
    // that the real default too - otherwise an untouched dropdown silently submits ''.
    return optionValue(itemField.options[0]);
  }
  return value ?? '';
};

const fieldPlaceholder = (itemField, config) => {
  if (itemField.placeholder) return itemField.placeholder;
  const name = itemField.name;
  const byName = {
    title: 'Clear public title, e.g. Teacher Development Workshop',
    name: 'Full name or item name',
    label: 'Short display label',
    email: 'name@example.com',
    password: 'Temporary secure password',
    first_name: 'First name',
    last_name: 'Last name',
    key: 'Stable name, e.g. contact_email',
    id: 'Stable ID, e.g. teacher-recruitment',
    value: 'Enter the text or contact detail that should appear on the site',
    description: 'Briefly explain what this item is for',
    summary: 'One or two lines visitors will see',
    body: 'Write the main content. Use blank lines for paragraphs.',
    features: 'One feature per line',
    price: 'Example: 55.00',
    old_price: 'Optional previous price',
    source: config?.collection === 'resources'
      ? 'Ministry, agency, publisher, institution, or original source'
      : 'Supplier, publisher contact, or where this stock came from',
    curriculum: 'Example: Cambridge Primary, Montessori, IB, WAEC, GES',
    author: 'Author name, if applicable',
    publisher: 'Publisher name, if applicable',
    level: 'Example: Primary 4, JHS 1, SHS',
    subject: 'Example: Mathematics, English, Science',
    tags: 'Comma-separated, e.g. new,bestseller,primary',
    headline: 'Main flyer headline',
    accent: 'Gold-highlighted flyer text',
    subline: 'Short flyer supporting text',
    badge: 'Optional button or badge text',
    order_reference: 'Leave blank for an automatic reference if unsure',
    customer_name: 'Customer full name',
    phone: '+233 XX XXX XXXX',
    location: 'City, region or school address',
    message: 'Full message or internal note',
    url: 'https://... or /resources/...',
    organisation: 'School, company, or organisation name',
    employment_type: 'Example: Full-time, Part-time, Contract',
    salary_min: 'Example: 1500',
    salary_max: 'Example: 2500',
    position: 'Role or job title',
    initials: 'Two-letter fallback, e.g. RM',
    sections: 'Add article sections with headings, paragraphs, images, and captions',
  };
  if (byName[name]) return byName[name];
  return `Enter ${itemField.label.toLowerCase()}${config?.title ? ` for ${config.title.toLowerCase()}` : ''}`;
};

const readableCellValue = value => {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return '';
    if (value.every(item => item == null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.map(readableCellValue).join(', ');
    }
    return `${value.length} managed item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    return value.label || value.name || value.title || value.email || JSON.stringify(value);
  }
  return String(value);
};

const EmptySection = ({ title, body, action, onAction }) => (
  <div style={{ textAlign: 'center', padding: '56px 24px' }}>
    <div style={{ width: 54, height: 54, borderRadius: 12, background: 'var(--gray-100)', margin: '0 auto 14px', display: 'grid', placeItems: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 900, color: 'var(--navy)' }}>RMX</div>
    <h4 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8 }}>{title}</h4>
    <p style={{ color: 'var(--gray-700)', maxWidth: 460, margin: '0 auto 18px', fontSize: '0.88rem' }}>{body}</p>
    {action && <button className="btn btn-primary btn-sm" onClick={onAction}>{action}</button>}
  </div>
);

const AdminSidebar = ({ active, setActive, open, setOpen, session, portalLabel }) => {
  const visibleNav = NAV.filter(item => canAccessAdminItem(item, session));
  const groups = visibleNav.reduce((acc, item) => {
    acc[item.group] = [...(acc[item.group] || []), item];
    return acc;
  }, {});

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
          className="sidebar-overlay"
        />
      )}
      <aside className={`admin-sidebar${open ? ' open' : ''}`}>
      <div className="admin-sidebar-logo">
        <img src={logoWhite} alt="RealMindX Education" className="admin-sidebar-logo-img" />
        <div>
          <span className="admin-logo-tag">{portalLabel}</span>
        </div>
      </div>
      <nav className="admin-nav">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="admin-nav-group">
            <div className="admin-nav-group-label">{group}</div>
            {items.map(item => (
              <button
                key={item.key}
                className={`admin-nav-item${active === item.key ? ' active' : ''}`}
                onClick={() => { setActive(item.key); setOpen(false); }}
              >
                <span className="ani-icon"><Icon name={item.icon} size={16} stroke={2} /></span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <a href="/" className="admin-nav-item" style={{ textDecoration: 'none' }}><span className="ani-icon"><Icon name="arrow" size={16} stroke={2} /></span> View Site</a>
      </div>
    </aside>
    </>
  );
};

const DashboardView = ({ content, setActive, session }) => {
  // Keep the WHOLE dashboard payload — summary feeds the stat cards and
  // recent_jobs/recent_orders feed the tables (they were being thrown
  // away, leaving "Recent Job Posts"/"Recent Orders" permanently empty).
  const [liveData, setLiveData] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    api.adminDashboard()
      .then(data => setLiveData(data || null))
      .catch(() => {});
  }, []);

  // In API mode use the live summary; in local mode derive from content arrays.
  const s = liveData?.summary || {};
  const stats = (isApiMode() ? [
    { label: 'Active Teachers', value: s.total_users ?? 0, note: 'currently active teacher accounts', icon: 'users', target: 'teachers', permission: 'teachers.view' },
    { label: 'Job Applications', value: s.total_job_applications ?? 0, note: `${s.pending_applications ?? 0} pending`, icon: 'clipboard', target: 'applications', permission: 'applications.view' },
    { label: 'New Orders', value: s.new_orders ?? 0, note: 'awaiting confirmation', icon: 'package', target: 'orders', permission: 'orders.view' },
    { label: 'New Tickets', value: s.new_contact_messages ?? 0, note: 'need attention', icon: 'message', target: 'messages', permission: 'messages.view' },
    { label: 'Products', value: s.total_products ?? 0, note: 'in the bookshop', icon: 'book', target: 'products', permission: 'products.view' },
    { label: 'Newsletter Subscribers', value: s.newsletter_subscribers ?? 0, note: 'active subscriptions', icon: 'mail', target: 'newsletters', permission: 'newsletters.view' },
  ] : [
    { label: 'Active Teachers', value: 142, note: 'seeded active teacher accounts', icon: 'users', target: 'teachers', permission: 'teachers.view' },
    { label: 'Job Applications', value: 38, note: `${(content.jobs || []).length} active job records`, icon: 'clipboard', target: 'applications', permission: 'applications.view' },
    { label: 'New Orders', value: (content.orders || []).filter(o => o.status === 'new').length, note: 'from bookshop', icon: 'package', target: 'orders', permission: 'orders.view' },
    { label: 'New Tickets', value: (content.messages || []).filter(m => m.status === 'new').length, note: 'need attention', icon: 'message', target: 'messages', permission: 'messages.view' },
    { label: 'Products', value: (content.products || []).length, note: `${publicItems(content.products || []).length} published`, icon: 'book', target: 'products', permission: 'products.view' },
    { label: 'Newsletter Subscribers', value: (content.newsletters || []).length, note: 'managed list', icon: 'mail', target: 'newsletters', permission: 'newsletters.view' },
  ]).filter(item => hasSessionPermission(session, item.permission));

  const recentJobs   = (isApiMode() ? (liveData?.recent_jobs   || []) : (content.jobs   || [])).slice(0, 5);
  const recentOrders = (isApiMode() ? (liveData?.recent_orders || []) : (content.orders || [])).slice(0, 5);
  const quickActions = [
    ['Post Job', 'jobs', 'briefcase'],
    ['Add Product', 'products', 'book'],
    ['Add Flyer', 'flyers', 'image'],
    ['Write News', 'news', 'newspaper'],
  ].filter(([, key]) => hasSessionPermission(session, `${key}.create`));
  const canSeeRecentJobs = hasSessionPermission(session, 'jobs.view');
  const canSeeRecentOrders = hasSessionPermission(session, 'orders.view');
  const hasVisibleDashboardContent = stats.length || quickActions.length || canSeeRecentJobs || canSeeRecentOrders;

  if (!hasVisibleDashboardContent) {
    return (
      <EmptySection
        title="Portal Ready"
        body="This internal account is active, but there are no dashboard widgets assigned yet. Grant a section permission to surface related cards, actions, and tables here."
      />
    );
  }

  return (
    <div>
      <div className="admin-stats-row">
        {stats.map(({ label, value, note, icon, target }) => (
          <button key={label} className="admin-stat" onClick={() => setActive(target)}>
            <div className="admin-stat-icon asi-navy"><Icon name={icon} size={22} stroke={1.9} /></div>
            <div className="admin-stat-info">
              <div className="ast-value">{value}</div>
              <div className="ast-label">{label}</div>
              <div className="ast-change ast-up">{note}</div>
            </div>
          </button>
        ))}
      </div>

      {quickActions.length ? (
      <div className="quick-actions-row">
        {quickActions.map(([label, key, icon]) => (
          <button key={label} className="quick-action-btn" onClick={() => setActive(key)}>
            <div className="qab-icon"><Icon name={icon} size={20} stroke={2} /></div>
            <div className="qab-label">{label}</div>
          </button>
        ))}
      </div>
      ) : null}

      <div className="admin-grid-2">
        {canSeeRecentJobs ? (
          <div className="admin-table-card">
            <div className="atc-header"><h3>Recent Job Posts</h3><button className="btn btn-sm btn-outline-navy" onClick={() => setActive('jobs')}>Manage</button></div>
            <MiniTable rows={recentJobs} columns={['title', 'organisation', 'status']} />
          </div>
        ) : null}
        {canSeeRecentOrders ? (
          <div className="admin-table-card">
            <div className="atc-header"><h3>Recent Orders</h3><button className="btn btn-sm btn-outline-navy" onClick={() => setActive('orders')}>Manage</button></div>
            <MiniTable rows={recentOrders} columns={['order_reference', 'customer_name', 'status']} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const whatsappStatusMeta = {
  verified: {
    label: 'Verified',
    className: 'badge-success',
    help: 'Correct prepared message came from the phone number being verified.',
  },
  wrong_number: {
    label: 'Wrong number',
    className: 'badge-danger',
    help: 'The challenge code was correct, but it came from a different WhatsApp number.',
  },
  wrong_message: {
    label: 'Wrong message',
    className: 'badge-warning',
    help: 'The sender matched, but the message was edited or did not match the prepared challenge.',
  },
  invalid_code: {
    label: 'Invalid code',
    className: 'badge-warning',
    help: 'The message looked like a verification command, but no recent challenge matched that code.',
  },
  expired: {
    label: 'Expired',
    className: 'badge-warning',
    help: 'The challenge code was recognised, but that verification request had expired.',
  },
  already_used: {
    label: 'Already used',
    className: 'badge-warning',
    help: 'The challenge code was recognised, but it had already been used or replaced by a newer request.',
  },
  non_verification_text: {
    label: 'Non-verification text',
    className: 'badge-info',
    help: 'The sender sent ordinary text, so RealMindX replied that this number is only for verification.',
  },
  missing_message_id: {
    label: 'Missing message ID',
    className: 'badge-danger',
    help: 'Meta delivered a message without an incoming message ID, so RealMindX did not reply because idempotency could not be guaranteed.',
  },
  no_matching_challenge: {
    label: 'No active challenge',
    className: 'badge-warning',
    help: 'Meta delivered a message, but RealMindX could not match it to a live challenge.',
  },
  ignored: {
    label: 'Ignored',
    className: 'badge-navy',
    help: 'The webhook arrived, but it had no usable text message or sender.',
  },
  user_missing: {
    label: 'User missing',
    className: 'badge-danger',
    help: 'The challenge matched, but the linked user account no longer exists.',
  },
};

const whatsappEventMeta = status => whatsappStatusMeta[status] || {
  label: statusLabel(status || 'unknown'),
  className: 'badge-info',
  help: 'The backend recorded this event with an uncommon status.',
};

const formatWhatsAppEventTime = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const maskWhatsAppSender = value => {
  const raw = String(value || '').trim();
  if (!raw) return 'Not provided';
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return raw;
  const prefix = raw.startsWith('+') ? `+${digits.slice(0, Math.min(3, digits.length - 4))}` : digits.slice(0, Math.min(3, digits.length - 4));
  return `${prefix} *** ${digits.slice(-4)}`;
};

const WhatsAppDiagnosticsView = () => {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [loadedAt, setLoadedAt] = React.useState(null);

  const loadEvents = React.useCallback(() => {
    setLoading(true);
    setError('');
    return api.adminWhatsAppWebhookEvents()
      .then(data => {
        setEvents(Array.isArray(data.events) ? data.events : []);
        setLoadedAt(new Date());
      })
      .catch(err => {
        setError(err.message || 'Could not load WhatsApp webhook logs.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const latest = events[0];

  return (
    <div className="whatsapp-diagnostics-page">
      <div className="admin-table-card whatsapp-diagnostics-hero">
        <div className="whatsapp-diagnostics-hero-icon" aria-hidden="true">
          <Icon name="whatsapp" size={24} stroke={2} />
        </div>
        <div>
          <p className="overline">WhatsApp Verification</p>
          <h2 className="admin-page-title">Webhook Diagnostics</h2>
          <p className="whatsapp-diagnostics-copy">
            Use this when a phone verification challenge keeps waiting. If the table is empty after a user sends the WhatsApp challenge, Meta did not deliver a webhook to RealMindX. If a row appears, the status explains exactly what the backend saw.
          </p>
        </div>
        <button type="button" className="btn btn-outline-navy btn-sm" onClick={loadEvents} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="whatsapp-diagnostics-grid">
        <div className="admin-table-card whatsapp-diagnostics-card">
          <span className="whatsapp-diagnostics-label">Latest event</span>
          <strong>{latest ? formatWhatsAppEventTime(latest.created_at) : 'No webhook events yet'}</strong>
          <p>{latest ? whatsappEventMeta(latest.status).help : 'Try sending a new challenge, wait a few seconds, then refresh this view.'}</p>
        </div>
        <div className="admin-table-card whatsapp-diagnostics-card">
          <span className="whatsapp-diagnostics-label">Rows shown</span>
          <strong>{events.length}</strong>
          <p>RealMindX keeps the latest 50 WhatsApp webhook events for quick troubleshooting.</p>
        </div>
        <div className="admin-table-card whatsapp-diagnostics-card">
          <span className="whatsapp-diagnostics-label">Last refreshed</span>
          <strong>{loadedAt ? loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}</strong>
          <p>Refresh immediately after testing if you want to catch the newest Meta delivery.</p>
        </div>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <div className="admin-table-card">
        <div className="atc-header">
          <div>
            <h3>Recent WhatsApp webhooks</h3>
            <p className="whatsapp-diagnostics-copy is-compact">Statuses are created by the backend after reading Meta’s incoming WhatsApp message payload.</p>
          </div>
        </div>
        <AdminTableScroll>
          <table className="admin-table whatsapp-diagnostics-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Sender</th>
                <th>Message preview</th>
                <th>Challenge</th>
                <th>Phone number ID</th>
              </tr>
            </thead>
            <tbody>
              {loading && !events.length ? (
                <tr><td colSpan={6}>Loading WhatsApp webhook events...</td></tr>
              ) : events.length ? events.map(event => {
                const meta = whatsappEventMeta(event.status);
                return (
                  <tr key={event.id}>
                    <td>{formatWhatsAppEventTime(event.created_at)}</td>
                    <td>
                      <span className={`badge ${meta.className}`} title={meta.help}>{meta.label}</span>
                    </td>
                    <td>{maskWhatsAppSender(event.sender)}</td>
                    <td>{event.text_preview || 'No text captured'}</td>
                    <td>{event.challenge_id || 'None'}</td>
                    <td>{event.phone_number_id || 'Not provided'}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6}>
                    No WhatsApp webhooks have reached RealMindX yet. If you have just sent a challenge and this stays empty, check Meta webhook delivery, app publish status, subscribed fields, and the callback URL/token.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminTableScroll>
      </div>
    </div>
  );
};

const AdminTableScroll = ({ children }) => <div className="admin-table-scroll">{children}</div>;

const MiniTable = ({ rows, columns }) => (
  <AdminTableScroll>
    <table className="admin-table">
      <thead><tr>{columns.map(col => <th key={col}>{col.replace(/_/g, ' ')}</th>)}</tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>{columns.map(col => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </AdminTableScroll>
);

const ledgerMoney = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 });

const ledgerDate = (value) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ledgerMoneyValue = (value) => ledgerMoney.format(Number(value || 0));
const ledgerStatusLabel = (value) => String(value || 'unknown').replace(/_/g, ' ');

const localReceiptRows = (orders = []) => orders.map(order => ({
  id: `receipt-${order.id}`,
  document_type: 'receipt',
  document_label: 'Receipt',
  document_id: order.invoice_id || order.order_reference || '',
  lookup_id: order.order_reference || order.invoice_id || '',
  order_reference: order.order_reference || '',
  customer_name: order.customer_name || order.name || '',
  email: order.email || '',
  recipients: order.email ? [order.email] : [],
  source: 'bookshop_order',
  status: order.status || 'new',
  payment_status: order.payment_status || '',
  total_amount: Number(order.total_amount || order.total || 0),
  created_at: order.created_at || order.date || '',
  issued_at: order.created_at || order.date || '',
  converted_at: order.created_at || order.date || '',
  item_count: Array.isArray(order.items) ? order.items.length : 0,
  pdf_document: 'receipt',
}));

const ReceiptsInvoicesView = ({ content }) => {
  const [rows, setRows] = React.useState([]);
  const [summary, setSummary] = React.useState({ total: 0, receipts: 0, cart_invoices: 0, converted: 0, emailed: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!isApiMode()) {
      const localRows = localReceiptRows(content.orders || []);
      if (!cancelled) {
        setRows(localRows);
        setSummary({
          total: localRows.length,
          receipts: localRows.length,
          cart_invoices: 0,
          converted: 0,
          emailed: 0,
        });
        setLoading(false);
      }
      return () => { cancelled = true; };
    }
    api.adminReceiptsInvoices()
      .then(data => {
        if (cancelled) return;
        setRows(data.items || []);
        setSummary(data.summary || {});
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Could not load receipts and invoices.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [content.orders]);

  const statusOptions = React.useMemo(() => (
    [...new Set(rows.map(row => row.status).filter(Boolean))].sort()
  ), [rows]);

  const filteredRows = React.useMemo(() => {
    const eligible = rows.filter(row => {
      if (typeFilter !== 'all' && row.document_type !== typeFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
    return rankByFuzzyMatch(eligible, query, row => [
        row.document_id,
        row.order_reference,
        row.customer_name,
        row.email,
        row.source,
        row.status,
        ...(row.recipients || []),
      ].join(' '));
  }, [query, rows, statusFilter, typeFilter]);

  const linkFor = (row, download = false) => {
    if (!row.lookup_id || !isApiMode()) return '';
    const options = row.pdf_document ? { document: row.pdf_document, download } : { download };
    return api.invoicePdfUrl(row.lookup_id, options);
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section className="admin-table-card" style={{ padding: 24 }}>
        <div className="atc-header" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div>
            <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Bookshop documents</span>
            <h3 style={{ marginTop: 8 }}>Receipts & Invoices Database</h3>
            <p style={{ margin: '8px 0 0', color: 'var(--gray-700)', maxWidth: 760 }}>
              Track generated cart invoices, issued order receipts, recipients, conversion status, and totals from one control surface.
            </p>
          </div>
        </div>
        <div className="admin-stats-row" style={{ marginTop: 20 }}>
          {[
            ['Total documents', summary.total || rows.length],
            ['Receipts', summary.receipts || 0],
            ['Cart invoices', summary.cart_invoices || 0],
            ['Converted', summary.converted || 0],
            ['Emailed', summary.emailed || 0],
          ].map(([label, value]) => (
            <div className="admin-stat" key={label} style={{ cursor: 'default' }}>
              <div className="admin-stat-info">
                <div className="ast-value">{value}</div>
                <div className="ast-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-table-card" style={{ padding: 22 }}>
        <div className="admin-ledger-controls">
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--gray-700)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Search</span>
            <input className="form-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Invoice ID, order reference, recipient, customer..." />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--gray-700)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Type</span>
            <select className="form-input" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              <option value="all">All documents</option>
              <option value="receipt">Receipts</option>
              <option value="cart_invoice">Cart invoices</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--gray-700)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</span>
            <select className="form-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map(status => <option key={status} value={status}>{ledgerStatusLabel(status)}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div style={{ padding: 30, color: 'var(--navy)', fontWeight: 800 }}>Loading receipts and invoices...</div>
        ) : error ? (
          <div style={{ padding: 30, color: '#b42318', fontWeight: 800 }}>{error}</div>
        ) : filteredRows.length ? (
          <AdminTableScroll>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Customer / Recipient</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issued</th>
                  <th>Conversion</th>
                  <th className="admin-actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const previewUrl = linkFor(row);
                  const downloadUrl = linkFor(row, true);
                  return (
                    <tr key={row.id}>
                      <td className="admin-actions-column">
                        <strong>{row.document_id || row.lookup_id}</strong>
                        <div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>{row.document_label} · {row.source}</div>
                      </td>
                      <td>
                        <strong>{row.customer_name || 'Cart invoice'}</strong>
                        <div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>{(row.recipients || []).join(', ') || row.email || 'No recipient recorded'}</div>
                      </td>
                      <td>{ledgerStatusLabel(row.status)}<div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>{ledgerStatusLabel(row.payment_status)}</div></td>
                      <td>{ledgerMoneyValue(row.total_amount)}<div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>{row.item_count || 0} item(s)</div></td>
                      <td>{ledgerDate(row.issued_at || row.created_at)}<div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>Created {ledgerDate(row.created_at)}</div></td>
                      <td>
                        {row.converted_at ? ledgerDate(row.converted_at) : 'Not converted'}
                        {row.linked_cart_invoice_id ? <div style={{ color: 'var(--gray-600)', fontSize: 12, marginTop: 4 }}>Linked {row.linked_cart_invoice_id}</div> : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {previewUrl ? <a className="btn btn-sm btn-outline-navy" href={previewUrl} target="_blank" rel="noreferrer">View</a> : null}
                          {downloadUrl ? <a className="btn btn-sm btn-primary" href={downloadUrl} target="_blank" rel="noreferrer">PDF</a> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableScroll>
        ) : (
          <EmptySection title="No Receipts or Invoices Found" body="Generated cart invoices and issued order receipts will appear here once available." />
        )}
      </section>
    </div>
  );
};

// ---------- Image upload field (with crop) ----------
const ImageUploadField = ({ fieldName, currentFileId, currentUrl, onChange, aspectRatio, cropTitle, guide }) => {
  const [uploading, setUploading] = React.useState(false);
  const [preview, setPreview]     = React.useState(currentUrl || null);
  const [cropSrc, setCropSrc]     = React.useState(null);
  const [error, setError]         = React.useState('');
  const [staged, setStaged]       = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    setPreview(currentUrl || null);
    setStaged(false);
    setError('');
  }, [currentFileId, currentUrl]);

  // Step 1: file selected → open crop modal
  const handleSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Step 2: crop confirmed → upload
  const handleCrop = async (croppedFile, dataUrl) => {
    setCropSrc(null);
    const previousPreview = preview;
    setUploading(true); setError('');
    try {
      const { api } = await import('../../src/lib/apiClient.js');
      const uploaded = await api.uploadFile(croppedFile, 'images');
      setPreview(uploaded.url);
      setStaged(true);
      onChange(uploaded.id, uploaded.url);
    } catch (err) {
      setPreview(previousPreview);
      setStaged(false);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspectRatio={aspectRatio || 16 / 9}
          title={cropTitle || 'Crop Image'}
          onCrop={handleCrop}
          onCancel={() => setCropSrc(null)}
        />
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {preview && (
          <img src={preview} alt="preview"
            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--gray-200)' }} />
        )}
        <div>
          <button type="button" className="btn btn-outline-navy btn-sm"
            onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : preview ? 'Replace image' : 'Upload image'}
          </button>
          {(preview || currentFileId) && (
            <button
              type="button"
              className="btn btn-outline-navy btn-sm"
              disabled={uploading}
              onClick={() => {
                setPreview(null);
                setStaged(true);
                onChange('', '');
              }}
            >
              Remove image
            </button>
          )}
          {currentFileId && !preview && (
            <p style={{ fontSize: '0.75rem', color: 'var(--gray-700)', marginTop: 4 }}>Existing image on file</p>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSelect} />
      </div>
      {staged && (
        <p style={{ color: 'var(--gray-600)', fontSize: '0.75rem', marginTop: 4 }}>
          Image uploaded. Save changes to apply it to this record.
        </p>
      )}
      {guide && (
        <div className="admin-image-guide">
          {guide.map((item, i) => (
            <div key={i} className="admin-ig-row">
              <span className="admin-ig-icon"><Icon name={item.icon} size={14} stroke={2} /></span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{error}</p>}
    </div>
  );
};

const FileUploadField = ({ currentFileId, currentUrl, currentName, onChange, accept, category = 'resources', visibility = 'public', help }) => {
  const [uploading, setUploading] = React.useState(false);
  const [fileName, setFileName] = React.useState(currentName || '');
  const [fileUrl, setFileUrl] = React.useState(currentUrl || '');
  const [error, setError] = React.useState('');
  const [staged, setStaged] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    setFileName(currentName || '');
    setFileUrl(currentUrl || '');
    setError('');
    setStaged(false);
  }, [currentFileId, currentName, currentUrl]);

  const handleSelect = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setUploading(true);
    setError('');
    try {
      const { api } = await import('../../src/lib/apiClient.js');
      const uploaded = await api.uploadFile(file, category, { visibility });
      setFileName(uploaded.original_filename || file.name);
      setFileUrl(uploaded.url || '');
      setStaged(true);
      onChange(uploaded.id, uploaded.url, uploaded.original_filename || file.name);
    } catch (err) {
      setError(err.message || 'Upload failed');
      setStaged(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-file-upload">
      <div className="admin-file-upload-row">
        <span className="admin-file-upload-icon"><Icon name="file" size={18} stroke={2} /></span>
        <div className="admin-file-upload-copy">
          <strong>{fileName || (currentFileId ? 'Existing file on record' : 'No document uploaded yet')}</strong>
          {fileUrl ? <a href={fileUrl} target="_blank" rel="noreferrer">Open uploaded file</a> : null}
          {help ? <p>{help}</p> : null}
        </div>
        <button type="button" className="btn btn-outline-navy btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : fileName || currentFileId ? 'Replace file' : 'Upload file'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleSelect} />
      {staged && <p className="admin-image-help">File uploaded. Save changes to attach it to this resource.</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{error}</p>}
    </div>
  );
};

const PasswordRevealInput = ({ value, onChange, name, autoComplete, required, minLength, placeholder, className = 'form-input', style }) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="password-field">
      <input
        className={className}
        style={{ ...(style || {}), paddingRight: 44 }}
        type={visible ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
};

const ArticleSectionsField = ({ sections, onChange }) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  const updateSection = (index, patch) => {
    onChange(safeSections.map((section, currentIndex) => (
      currentIndex === index ? { ...section, ...patch } : section
    )));
  };
  const addSection = () => {
    onChange([...safeSections, {
      heading: '',
      body: '',
      caption: '',
      image_position: 'auto',
      image_size: 'medium',
      image_file_id: '',
      image_url: '',
    }]);
  };
  const removeSection = index => {
    onChange(safeSections.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="article-sections-field">
      {safeSections.map((section, index) => (
        <section className="article-section-editor" key={`section-${index}`}>
          <div className="article-section-editor-head">
            <strong>Section {index + 1}</strong>
            <button type="button" className="table-action-btn danger" onClick={() => removeSection(index)}>Remove</button>
          </div>
          <div className="admin-form-grid">
            <label className="form-group">
              <span className="form-label">Section Heading</span>
              <input
                className="form-input"
                value={section.heading || ''}
                onChange={event => updateSection(index, { heading: event.target.value })}
                placeholder="Example: Why this programme matters"
              />
            </label>
            <label className="form-group">
              <span className="form-label">Image Caption</span>
              <input
                className="form-input"
                value={section.caption || ''}
                onChange={event => updateSection(index, { caption: event.target.value })}
                placeholder="Optional caption for this section image"
              />
            </label>
            <label className="form-group">
              <span className="form-label">Desktop Image Position</span>
              <select
                className="form-select"
                value={section.image_position || 'auto'}
                onChange={event => updateSection(index, { image_position: event.target.value })}
              >
                <option value="auto">Alternate right and left</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="full">Full width</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">Desktop Image Size</span>
              <select
                className="form-select"
                value={section.image_size || 'medium'}
                onChange={event => updateSection(index, { image_size: event.target.value })}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
            <div className="form-group article-section-body-group" style={{ gridColumn: '1 / -1' }}>
              <span className="form-label">Section Body</span>
              <ServiceLinkTextarea
                value={section.body || ''}
                onChange={body => updateSection(index, { body })}
                rows={5}
                placeholder="Write this part of the article. Use blank lines for separate paragraphs."
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <span className="form-label">Section Image</span>
              <ImageUploadField
                fieldName={`section_image_${index}`}
                currentFileId={section.image_file_id || ''}
                currentUrl={section.image_url || ''}
                aspectRatio={16/9}
                cropTitle="Crop Article Section Image (16:9)"
                guide={[
                  { icon: 'target',   text: 'Ideal ratio: 16:9. Used inline within the article body.' },
                  { icon: 'image',    text: 'Crop tip: pick an image directly relevant to this section\'s heading and text. Inline images should illustrate the content, not just decorate it.' },
                  { icon: 'camera',   text: 'Minimum size: 900 x 506 px. Add a caption in the field below the image to give readers context.' },
                ]}
                onChange={(fileId, fileUrl) => updateSection(index, { image_file_id: fileId, image_url: fileUrl })}
              />
            </div>
          </div>
        </section>
      ))}
      <button type="button" className="btn btn-outline-navy btn-sm" onClick={addSection}>
        Add Article Section
      </button>
      <p className="admin-image-help">Desktop images can sit beside the section text. On phones, every section image remains full width for readability.</p>
    </div>
  );
};

const ManagedForm = ({ config, initialItem, onCancel, onCreate, onUpdate }) => {
  const [form, setForm] = React.useState(() =>
    config.fields.reduce((acc, itemField) => {
      const rawValue = initialItem ? initialItem[itemField.name] : itemField.defaultValue;
      acc[itemField.name] = valueForInput(rawValue, itemField);
      return acc;
    }, {}),
  );
  // Track upload preview URLs separately (not sent in payload, only the file ID is)
  const [uploadMeta, setUploadMeta] = React.useState(() => {
    const urls = {};
    config.fields.forEach(f => {
      if (f.type === 'image') {
        const fieldUrl = initialItem?.[`${String(f.name).replace(/_file_id$/, '')}_url`] || initialItem?.image_url;
        if (fieldUrl) urls[f.name] = { url: fieldUrl };
      }
      if (f.type === 'file') {
        const baseName = String(f.name).replace(/_file_id$/, '');
        urls[f.name] = {
          url: initialItem?.[`${baseName}_url`] || initialItem?.file_url || '',
          name: initialItem?.[`${baseName}_name`] || initialItem?.resource_file_name || '',
        };
      }
    });
    return urls;
  });
  const [saving, setSaving] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [categoryOptions, setCategoryOptions] = React.useState([]);
  const [deliveryZoneOptions, setDeliveryZoneOptions] = React.useState([]);
  const [formError, setFormError] = React.useState('');

  React.useEffect(() => {
    if (!config.fields.some(itemField => itemField.type === 'category-select')) return;
    let alive = true;
    if (!isApiMode()) {
      setCategoryOptions([]);
      return;
    }
    api.adminList('categories')
      .then(data => {
        if (alive) setCategoryOptions(data.items || []);
      })
      .catch(() => {
        if (alive) setCategoryOptions([]);
      });
    return () => { alive = false; };
  }, [config.fields]);

  React.useEffect(() => {
    if (!config.fields.some(itemField => itemField.type === 'delivery-zone-select')) return;
    let alive = true;
    api.fetchDeliveryZones()
      .then(data => {
        if (alive) {
          setDeliveryZoneOptions(
            (data.items || []).filter(zone => zone.is_active !== false && !/pickup/i.test(zone.name || '')),
          );
        }
      })
      .catch(() => {
        if (alive) setDeliveryZoneOptions([]);
      });
    return () => { alive = false; };
  }, [config.fields]);

  const submit = async event => {
    event.preventDefault();
    const payload = config.fields.reduce((acc, itemField) => {
      acc[itemField.name] = normalizeFormValue(form[itemField.name], itemField);
      return acc;
    }, {});

    setSaving(true);
    setFormError('');
    try {
      if (initialItem) await (onUpdate ? onUpdate(initialItem.id, payload) : Promise.resolve());
      else await (onCreate ? onCreate(payload) : Promise.resolve());
      onCancel();
    } catch (err) {
      setFormError(err?.message || 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-table-card" style={{ padding: 24, marginBottom: 20 }} onSubmit={submit}>
      <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 18 }}>
        {initialItem ? `Edit ${config.title}` : config.createLabel}
      </h3>
      <div className="admin-form-grid">
        {config.fields.some(itemField => itemField.advanced) ? (
          <button className="resource-more-details-toggle" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(current => !current)}>
            <span><strong>More Details</strong><small>Optional metadata improves filtering and search.</small></span>
            <Icon name={showAdvanced ? 'chevUp' : 'chevDown'} size={18} />
          </button>
        ) : null}
        {config.fields.map(itemField => (
          itemField.advanced && !showAdvanced ? null :
          <div key={itemField.name} className="form-group" style={(itemField.type === 'textarea' || itemField.type === 'image' || itemField.type === 'file' || itemField.type === 'permission-list' || itemField.type === 'article-sections') ? { gridColumn: '1 / -1' } : null}>
            <label className="form-label">{itemField.label}</label>
            {itemField.type === 'image' ? (
              <ImageUploadField
                fieldName={itemField.name}
                currentFileId={form[itemField.name]}
                currentUrl={uploadMeta[itemField.name]?.url}
                aspectRatio={itemField.aspectRatio}
                cropTitle={itemField.cropTitle}
                guide={itemField.guide}
                onChange={(fileId, fileUrl) => {
                  setForm(prev => ({ ...prev, [itemField.name]: fileId }));
                  setUploadMeta(prev => ({ ...prev, [itemField.name]: { url: fileUrl } }));
                }}
              />
            ) : itemField.type === 'file' ? (
              <FileUploadField
                currentFileId={form[itemField.name]}
                currentUrl={uploadMeta[itemField.name]?.url}
                currentName={uploadMeta[itemField.name]?.name}
                accept={itemField.accept}
                category={itemField.category || 'resources'}
                visibility={itemField.visibility || 'public'}
                onChange={(fileId, fileUrl, fileName) => {
                  setForm(prev => {
                    const next = { ...prev, [itemField.name]: fileId };
                    if (config.collection === 'resources' && !String(prev.title || '').trim() && fileName) {
                      next.title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                    }
                    return next;
                  });
                  setUploadMeta(prev => ({ ...prev, [itemField.name]: { url: fileUrl, name: fileName } }));
                }}
              />
            ) : itemField.type === 'permission-list' ? (
              <div className="permission-matrix">
                {(itemField.groups || []).map(group => (
                  <section className="permission-group-card" key={group.key}>
                    <div className="permission-group-head">
                      <span className="ani-icon"><Icon name={group.icon} size={15} stroke={2} /></span>
                      <strong>{group.label}</strong>
                    </div>
                    <div className="permission-action-row">
                      {group.actions.map(action => {
                        const option = `${group.key}.${action}`;
                        return (
                          <label className="permission-action" key={option}>
                            <input
                              type="checkbox"
                              checked={(form[itemField.name] || []).includes(option)}
                              onChange={event => setForm(prev => {
                                const current = prev[itemField.name] || [];
                                return {
                                  ...prev,
                                  [itemField.name]: event.target.checked
                                    ? [...new Set([...current, option])]
                                    : current.filter(item => item !== option),
                                };
                              })}
                            />
                            <span>{statusLabel(action)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : itemField.type === 'article-sections' ? (
              <ArticleSectionsField
                sections={form[itemField.name]}
                onChange={sections => setForm(prev => ({ ...prev, [itemField.name]: sections }))}
              />
            ) : itemField.type === 'textarea' ? (
              config.collection === 'news' && itemField.name === 'body' ? (
                <ServiceLinkTextarea
                  value={form[itemField.name]}
                  onChange={value => setForm(prev => ({ ...prev, [itemField.name]: value }))}
                  rows={4}
                  placeholder={fieldPlaceholder(itemField, config)}
                />
              ) : (
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder={fieldPlaceholder(itemField, config)}
                  value={form[itemField.name]}
                  onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.value }))}
                />
              )
            ) : (itemField.type === 'select' || itemField.type === 'category-select' || itemField.type === 'delivery-zone-select') ? (
              <select
                className="form-select"
                value={form[itemField.name]}
                onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.value }))}
              >
                {(itemField.type === 'category-select'
                  ? [
                      { value: '', label: categoryOptions.length ? 'Select a category, or type a new one below' : 'No categories yet - type a new one below' },
                      ...categoryOptions.map(category => ({ value: category.id, label: category.name })),
                    ]
                  : itemField.type === 'delivery-zone-select'
                    ? [
                        { value: '', label: deliveryZoneOptions.length ? 'Select the exact teaching location' : 'No active delivery areas available' },
                        ...deliveryZoneOptions.map(zone => ({ value: zone.id, label: zone.name })),
                      ]
                  : itemField.options
                ).map(option => (
                  <option key={optionValue(option)} value={optionValue(option)}>
                    {optionLabel(option)}
                  </option>
                ))}
              </select>
            ) : itemField.type === 'checkbox' ? (
              <label className="permission-item" style={{ maxWidth: 240 }}>
                <span className="perm-label">{itemField.toggleLabel || itemField.label}</span>
                <span className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={form[itemField.name]}
                    onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </span>
              </label>
            ) : itemField.type === 'date' ? (
              <DatePickerField
                value={form[itemField.name]}
                onChange={nextValue => setForm(prev => ({ ...prev, [itemField.name]: nextValue }))}
                placeholder={fieldPlaceholder(itemField, config)}
                min={typeof itemField.min === 'function' ? itemField.min(form) : itemField.min}
                max={typeof itemField.max === 'function' ? itemField.max(form) : itemField.max}
                ariaLabel={itemField.label}
              />
            ) : itemField.type === 'password' ? (
              <PasswordRevealInput
                value={form[itemField.name]}
                onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.value }))}
                autoComplete="new-password"
                placeholder={fieldPlaceholder(itemField, config)}
              />
            ) : (
              <input
                className="form-input"
                type={itemField.type === 'number' ? 'number' : itemField.type === 'email' ? 'email' : 'text'}
                step={itemField.type === 'number' ? '0.01' : undefined}
                placeholder={fieldPlaceholder(itemField, config)}
                value={form[itemField.name]}
                onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.value }))}
              />
            )}
            {itemField.help && <p style={{ color: 'var(--gray-600)', fontSize: '0.75rem', marginTop: 4 }}>{itemField.help}</p>}
          </div>
        ))}
      </div>
      <div className="admin-modal-actions-sticky" style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : (initialItem ? 'Save Changes' : config.createLabel)}</button>
        <button className="btn btn-outline-navy" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {formError && <p className="form-error" style={{ marginTop: 10 }}>{formError}</p>}
    </form>
  );
};

const PRODUCT_IMPORT_PREVIEW_COLUMNS = [
  'name',
  'category',
  'price',
  'subject',
  'level',
  'curriculum',
  'image_filename',
];

const PRODUCT_IMPORT_PRIMARY_FIELDS = new Set([
  'name',
  'category',
  'price',
  'stock_status',
  'quantity_available',
  'subject',
  'level',
  'curriculum',
  'author',
  'publisher',
  'image_filename',
]);

const formatImportBytes = value => {
  const bytes = Number(value || 0);
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
};

const ProductImportPanel = ({ onImported, onClose }) => {
  const maxZipBytes = 100 * 1024 * 1024;
  const [catalogFile, setCatalogFile] = React.useState(null);
  const [imagesZip, setImagesZip] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [status, setStatus] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [overwriteSlugs, setOverwriteSlugs] = React.useState(new Set());

  const reviewCatalog = async file => {
    setCatalogFile(file);
    setPreview(null);
    setMapping({});
    setProgress(null);
    setOverwriteSlugs(new Set());
    if (!file) {
      setStatus(null);
      return;
    }
    setPreviewing(true);
    setStatus({ type: 'info', message: 'Reviewing catalogue columns...' });
    try {
      const result = await api.adminPreviewProductImport(file);
      setPreview(result);
      setMapping(result.mapping || {});
      setStatus({
        type: result.warnings?.length ? 'warning' : 'success',
        message: `${result.row_count} product rows detected. Review the matched columns before importing.`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Catalogue review failed.' });
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (!catalogFile) {
      setStatus({ type: 'error', message: 'Upload a CSV or XLSX catalogue first.' });
      return;
    }
    if (!preview) {
      setStatus({ type: 'error', message: 'Wait for the catalogue review to finish.' });
      return;
    }
    if (!mapping.name) {
      setStatus({ type: 'error', message: 'Choose the column containing the product name.' });
      return;
    }
    setImporting(true);
    setProgress({ stage: 'uploading', percent: 0, loaded: 0, total: 0 });
    setStatus({ type: 'info', message: 'Preparing the files for upload...' });
    try {
      const result = await api.adminImportProducts({
        catalogFile,
        imagesZip,
        columnMapping: mapping,
        overwriteSlugs: Array.from(overwriteSlugs),
        onProgress: nextProgress => setProgress(nextProgress),
      });
      const details = [
        `${result.imported || 0} added`,
        `${result.updated || 0} updated`,
        `${result.images_saved || 0} images saved`,
      ];
      if (result.skipped?.length) details.push(`${result.skipped.length} rows skipped`);
      if (result.missing_images?.length) details.push(`${result.missing_images.length} image files not found`);
      setStatus({ type: 'success', message: `Import complete: ${details.join(', ')}.` });
      onImported?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Import failed.' });
    } finally {
      setImporting(false);
    }
  };

  const chooseImageZip = event => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > maxZipBytes) {
      event.target.value = '';
      setImagesZip(null);
      setStatus({ type: 'error', message: 'Image ZIP must be 100 MB or smaller.' });
      return;
    }
    setStatus(preview ? {
      type: preview.warnings?.length ? 'warning' : 'success',
      message: `${preview.row_count} product rows are ready for review.`,
    } : null);
    setImagesZip(file);
  };

  const updateMapping = (field, source) => {
    setMapping(current => ({ ...current, [field]: source }));
  };

  const renderMappingField = field => (
    <label className="product-import-map-field" key={field.key}>
      <span>
        {field.label}
        {field.required ? <strong aria-label="required"> *</strong> : null}
      </span>
      <select
        className="form-input"
        value={mapping[field.key] || ''}
        onChange={event => updateMapping(field.key, event.target.value)}
        disabled={importing}
      >
        <option value="">Do not import</option>
        {preview.headers.map(header => (
          <option key={header} value={header}>{header}</option>
        ))}
      </select>
    </label>
  );

  const primaryFields = preview?.fields?.filter(field => PRODUCT_IMPORT_PRIMARY_FIELDS.has(field.key)) || [];
  const additionalFields = preview?.fields?.filter(field => !PRODUCT_IMPORT_PRIMARY_FIELDS.has(field.key)) || [];
  const previewRows = (preview?.sample_rows || []).map((row, index) => ({
    id: index,
    values: Object.fromEntries(
      PRODUCT_IMPORT_PREVIEW_COLUMNS.map(field => [field, mapping[field] ? row[mapping[field]] : '']),
    ),
  }));
  const fieldLabels = Object.fromEntries((preview?.fields || []).map(field => [field.key, field.label]));
  const progressLabel = progress?.stage === 'processing'
    ? 'Upload complete. The server is validating images and saving products.'
    : progress?.stage === 'complete'
      ? 'Import complete'
      : `Uploading catalogue and images: ${progress?.percent || 0}%`;

  return (
    <form className="admin-reply-panel product-import-panel" onSubmit={submit}>
      <div>
        <p className="overline">Batch Product Import</p>
        <h3>Upload, review, then import</h3>
        <p>
          Select the catalogue first. RealMindX will match its columns and show a sample before any products are changed.
          Cover images should use the filenames in the mapped image column.
        </p>
      </div>
      <div className="admin-form-grid product-import-files">
        <label className="form-group">
          <span className="form-label">1. Catalogue CSV/XLSX</span>
          <input
            className="form-input"
            type="file"
            accept=".csv,.xlsx"
            disabled={importing}
            onChange={event => reviewCatalog(event.target.files?.[0] || null)}
          />
          <small>{previewing ? 'Reading columns...' : catalogFile ? `${catalogFile.name} / ${formatImportBytes(catalogFile.size)}` : 'Choose the product catalogue.'}</small>
        </label>
        <label className="form-group">
          <span className="form-label">2. Image ZIP</span>
          <input className="form-input" type="file" accept=".zip" disabled={importing} onChange={chooseImageZip} />
          <small>{imagesZip ? `${imagesZip.name} / ${formatImportBytes(imagesZip.size)}` : 'Optional, up to 100 MB.'}</small>
        </label>
      </div>

      {preview ? (
        <section className="product-import-review" aria-label="Catalogue review">
          <div className="product-import-review-heading">
            <div>
              <p className="overline">Column Matcher</p>
              <h4>{preview.row_count} rows / {preview.headers.length} source columns</h4>
            </div>
            <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={() => setMapping(preview.mapping || {})}>
              Reset matches
            </button>
          </div>
          <p className="product-import-helper">Confirm what each source column means. Required fields are marked with an asterisk.</p>
          <div className="product-import-mapping-grid">
            {primaryFields.map(renderMappingField)}
          </div>
          {additionalFields.length ? (
            <details className="product-import-more-fields">
              <summary>Map additional product fields</summary>
              <div className="product-import-mapping-grid">
                {additionalFields.map(renderMappingField)}
              </div>
            </details>
          ) : null}

          <div className="product-import-preview">
            <div>
              <p className="overline">Sample Preview</p>
              <h4>How the first {previewRows.length} rows will import</h4>
            </div>
            <div className="product-import-preview-scroll">
              <table>
                <thead>
                  <tr>
                    {PRODUCT_IMPORT_PREVIEW_COLUMNS.map(field => <th key={field}>{fieldLabels[field] || field}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(row => (
                    <tr key={row.id}>
                      {PRODUCT_IMPORT_PREVIEW_COLUMNS.map(field => (
                        <td key={field}>{String(row.values[field] ?? '') || <span className="product-import-empty">Not set</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.warnings?.map(warning => (
            <p className="product-import-warning" key={warning}>{warning}</p>
          ))}

          {preview.conflicts?.length > 0 ? (
            <div className="product-import-preview" style={{ marginTop: 20 }}>
              <div>
                <p className="overline">Conflicts Detected</p>
                <h4>{preview.conflicts.length} products already exist with the same name and category.</h4>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--gray-600)', marginBottom: 10 }}>
                Select the products below to overwrite their details and images with the new upload. Unselected products will be skipped.
              </p>
              <div className="product-import-preview-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Overwrite</th>
                      <th>Import Name</th>
                      <th>Existing Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.conflicts.map(conflict => (
                      <tr key={conflict.slug}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={overwriteSlugs.has(conflict.slug)}
                            onChange={(e) => {
                              setOverwriteSlugs(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(conflict.slug);
                                else next.delete(conflict.slug);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>{conflict.import_name}</td>
                        <td>{conflict.existing_name} <small>({conflict.existing_category})</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {progress ? (
        <div className="product-import-progress" data-stage={progress.stage}>
          <div className="product-import-progress-copy">
            <strong>{progressLabel}</strong>
            {progress.stage === 'uploading' && progress.total ? (
              <span>{formatImportBytes(progress.loaded)} of {formatImportBytes(progress.total)}</span>
            ) : null}
          </div>
          <div
            className="product-import-progress-track"
            role="progressbar"
            aria-label="Product import progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress.percent || 0}
          >
            <span style={{ width: `${progress.percent || 0}%` }} />
          </div>
        </div>
      ) : null}

      {status ? <p className="product-import-status" data-type={status.type}>{status.message}</p> : null}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={importing || previewing || !preview || !mapping.name}>
          {importing ? (progress?.stage === 'processing' ? 'Processing...' : `Uploading ${progress?.percent || 0}%`) : 'Import Products'}
        </button>
        <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={onClose}>Close</button>
      </div>
    </form>
  );
};

const NewsletterComposer = ({ onSent }) => {
  const [form, setForm] = React.useState({
    brand: 'realmindx',
    sender: 'news',
    subject: '',
    title: '',
    preheader: '',
    sections: [],
    cta_label: '',
    cta_url: '',
    image_file_id: '',
    manual_recipients: '',
  });
  const [audienceFilters, setAudienceFilters] = React.useState({ q: '', source: '', status: '' });
  const [contacts, setContacts] = React.useState([]);
  const [selectedContacts, setSelectedContacts] = React.useState(new Set());
  const [loadingAudience, setLoadingAudience] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const setFilter = key => event => setAudienceFilters(prev => ({ ...prev, [key]: event.target.value }));

  const fetchAudience = React.useCallback(async () => {
    if (!isApiMode()) return;
    setLoadingAudience(true);
    try {
      const sp = new URLSearchParams();
      Object.entries(audienceFilters).forEach(([key, value]) => {
        if (value) sp.set(key, value);
      });
      const data = await api.adminListWithQuery('newsletters', sp.toString());
      setContacts(data.items || []);
    } catch (err) {
      setStatus(err.message || 'Could not load contacts.');
    } finally {
      setLoadingAudience(false);
    }
  }, [audienceFilters]);

  React.useEffect(() => {
    fetchAudience();
  }, [fetchAudience]);

  const toggleContact = id => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      contacts.forEach(contact => {
        if (contact.communication_status !== 'unsubscribed' && contact.is_active !== false) next.add(contact.id);
      });
      return next;
    });
  };

  const submit = async event => {
    event.preventDefault();
    setStatus('');
    const hasSectionContent = (form.sections || []).some(section => (
      (section.heading || '').trim() || (section.body || '').trim() || section.image_file_id
    ));
    if (!form.subject.trim() || !hasSectionContent) {
      setStatus('Add a subject and at least one newsletter section before sending.');
      return;
    }
    if (!isApiMode()) {
      setStatus('Newsletter sending is available when the Flask API backend is enabled.');
      return;
    }
    setSending(true);
    try {
      const result = await api.adminSendNewsletter({
        ...form,
        title: form.title || form.subject,
        recipient_ids: Array.from(selectedContacts),
        recipient_emails: form.manual_recipients,
        image_file_id: form.image_file_id ? Number(form.image_file_id) : null,
        sections: (form.sections || []).map(section => ({
          ...section,
          image_file_id: section.image_file_id ? Number(section.image_file_id) : null,
        })),
      });
      setStatus(result.message || 'Newsletter sent.');
      setForm({ brand: 'realmindx', sender: 'news', subject: '', title: '', preheader: '', sections: [], cta_label: '', cta_url: '', image_file_id: '', manual_recipients: '' });
      setImageUrl('');
      setSelectedContacts(new Set());
      onSent?.();
    } catch (err) {
      setStatus(err.message || 'Newsletter could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="admin-reply-panel newsletter-composer" onSubmit={submit}>
      <div>
        <p className="overline">Newsletter Campaign</p>
        <h3>Compose a branded RealMindX email</h3>
        <p>Choose sender identity, build sections, then select the audience independently.</p>
      </div>
      <div className="admin-form-grid">
        <label className="form-group">
          <span className="form-label">Branding</span>
          <select className="form-select" value={form.brand} onChange={set('brand')}>
            <option value="realmindx">RealMindX Education</option>
            <option value="bookshop">RealMindX Bookshop</option>
          </select>
        </label>
        <label className="form-group">
          <span className="form-label">Sender Identity</span>
          <select className="form-select" value={form.sender} onChange={set('sender')}>
            <option value="news">news@send.realmindxgh.com</option>
            <option value="sales">sales@send.realmindxgh.com</option>
            <option value="bookshop">Bookshop sender</option>
            <option value="default">Default RealMindX sender</option>
          </select>
        </label>
        <label className="form-group">
          <span className="form-label">Subject</span>
          <input className="form-input" value={form.subject} onChange={set('subject')} placeholder="June learning updates" />
        </label>
        <label className="form-group">
          <span className="form-label">Email Title</span>
          <input className="form-input" value={form.title} onChange={set('title')} placeholder="What's new at RealMindX" />
        </label>
        <label className="form-group">
          <span className="form-label">Preheader</span>
          <input className="form-input" value={form.preheader} onChange={set('preheader')} placeholder="A short inbox preview line" />
        </label>
        <label className="form-group">
          <span className="form-label">CTA Label</span>
          <input className="form-input" value={form.cta_label} onChange={set('cta_label')} placeholder="Read more" />
        </label>
        <label className="form-group">
          <span className="form-label">CTA URL</span>
          <input className="form-input" value={form.cta_url} onChange={set('cta_url')} placeholder="/news or https://..." />
        </label>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <span className="form-label">Hero Image</span>
          <ImageUploadField
            fieldName="newsletter_image_file_id"
            currentFileId={form.image_file_id}
            currentUrl={imageUrl}
            onChange={(fileId, fileUrl) => {
              setForm(prev => ({ ...prev, image_file_id: fileId }));
              setImageUrl(fileUrl);
            }}
            aspectRatio={16/7}
            cropTitle="Crop Newsletter Hero Image (16:7)"
            guide={[
              { icon: 'target', text: 'Ideal ratio: 16:7. This gives the email header a polished banner shape without becoming too tall.' },
              { icon: 'camera', text: 'Recommended size: 1400 x 612 px or larger. Keep important faces, text, and logos away from the extreme edges.' },
              { icon: 'check', text: 'Use a clear photo or campaign visual. Avoid small text inside the image because many email clients shrink banners.' },
            ]}
          />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <span className="form-label">Newsletter Sections</span>
          <ArticleSectionsField
            sections={form.sections}
            onChange={sections => setForm(prev => ({ ...prev, sections }))}
          />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <span className="form-label">Audience</span>
          <div className="newsletter-audience-panel">
            <div className="newsletter-audience-filters">
              <input className="form-input" value={audienceFilters.q} onChange={setFilter('q')} placeholder="Search emails" />
              <input className="form-input" value={audienceFilters.source} onChange={setFilter('source')} placeholder="Source e.g. cart_invoice" />
              <select className="form-select" value={audienceFilters.status} onChange={setFilter('status')}>
                <option value="">Any status</option>
                <option value="marketing_active">Marketing active</option>
                <option value="transactional_only">Transactional only</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
              <button type="button" className="btn btn-outline-navy btn-sm" onClick={selectVisible}>Select visible</button>
            </div>
            <div className="newsletter-contact-list">
              {loadingAudience ? <p>Loading contacts...</p> : contacts.slice(0, 80).map(contact => (
                <label key={contact.id} className="newsletter-contact-row">
                  <input
                    type="checkbox"
                    checked={selectedContacts.has(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    disabled={contact.communication_status === 'unsubscribed' || contact.is_active === false}
                  />
                  <span>
                    <strong>{contact.email}</strong>
                    <small>{(contact.sources || [contact.source]).join(', ')} · {contact.communication_status}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="form-group" style={{ marginTop: 12 }}>
              <span className="form-label">Manual recipients</span>
              <textarea className="form-textarea" rows={3} value={form.manual_recipients} onChange={set('manual_recipients')} placeholder="Paste additional public school or institution emails, separated by commas or new lines." />
            </label>
            <p className="admin-image-help">{selectedContacts.size} saved contact(s) selected. Manual recipients will be added to contacts with campaign source metadata.</p>
          </div>
        </div>
      </div>
      {status && <p style={{ color: status.includes('could not') || status.includes('Add ') ? 'var(--danger)' : 'var(--navy)', fontWeight: 700 }}>{status}</p>}
      <button className="btn btn-primary btn-sm" disabled={sending}>{sending ? 'Sending...' : 'Send Newsletter'}</button>
    </form>
  );
};

// Inline order status selector — default is current status or 'received'
const OrderStatusSelector = ({ row, options, requireCancelReason, onSave }) => {
  const optionValues = React.useMemo(() => {
    const current = String(row.status || '').trim();
    const base = Array.isArray(options) ? options.filter(Boolean) : [];
    return current && !base.includes(current) ? [current, ...base] : base;
  }, [options, row.status]);
  const [val, setVal] = React.useState(row.status || optionValues[0] || 'new');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setVal(row.status || optionValues[0] || 'new');
    setDirty(false);
    setReason('');
    setError('');
  }, [optionValues, row.id, row.status]);

  const handleChange = (e) => {
    setVal(e.target.value);
    setDirty(true);
    setReason('');
    setError('');
  };

  const save = async () => {
    if (val === 'cancelled' && requireCancelReason && !reason.trim()) {
      setError('Add a cancellation reason before saving.');
      return;
    }
    setSaving(true);
    const patch = { status: val };
    if (val === 'cancelled' && reason.trim()) patch.cancel_reason = reason.trim();
    try {
      await onSave(patch);
      setDirty(false);
      setError('');
    } catch (err) {
      setError(err?.message || 'Could not save this status change.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="order-status-control">
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <select
          className="form-select"
          style={{ fontSize:'0.78rem', height:30, padding:'0 8px' }}
          value={val}
          onChange={handleChange}
        >
          {optionValues.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        {dirty && (
          <button className="btn btn-primary btn-sm" style={{ padding:'3px 10px', fontSize:'0.75rem', height:30 }} disabled={saving} onClick={save}>
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>
      {val === 'cancelled' && dirty && (
        <input
          className="form-input"
          style={{ fontSize:'0.78rem', height:28 }}
          placeholder="Cancellation reason (required) *"
          value={reason}
          onChange={e => { setReason(e.target.value); setError(''); }}
        />
      )}
      {error ? <p className="form-error" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
};

const BookRequestsModal = ({ open, onClose, session, onToast, onPendingCount }) => {
  const canManage = hasSessionPermission(session, 'bookRequests.manage');
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('pending');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [pages, setPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [productUrl, setProductUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirmAvailable, setConfirmAvailable] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (status) params.set('status', status);
      if (query.trim()) params.set('q', query.trim());
      const response = await api.adminBookRequests(params.toString());
      setItems(response.items || []);
      setPages(Math.max(1, response.pages || 1));
      setTotal(response.total || 0);
      setPendingCount(response.pending_count || 0);
      onPendingCount?.(response.pending_count || 0);
    } catch (err) { setError(err?.message || 'Could not load book requests.'); }
    finally { setLoading(false); }
  }, [open, onPendingCount, page, pageSize, query, status]);

  React.useEffect(() => { const timer = setTimeout(load, query ? 250 : 0); return () => clearTimeout(timer); }, [load, query]);
  React.useEffect(() => { setPage(1); }, [query, status, pageSize]);
  React.useEffect(() => { if (!open) { setSelected(null); setProductUrl(''); setError(''); setConfirmAvailable(false); } }, [open]);
  if (!open) return null;

  const openDetail = async row => {
    setLoading(true); setError('');
    try { setSelected((await api.adminBookRequest(row.id)).request); setProductUrl(row.product_url || ''); setConfirmAvailable(false); }
    catch (err) { setError(err?.message || 'Could not open this request.'); }
    finally { setLoading(false); }
  };
  const markAvailable = async () => {
    if (!productUrl.trim()) { setError('Paste the published RealMindX Bookshop product link.'); return; }
    setBusy(true); setError('');
    try {
      const response = await api.adminMarkBookRequestAvailable(selected.id, { product_url: productUrl.trim() });
      setSelected((await api.adminBookRequest(response.request.id)).request);
      setConfirmAvailable(false);
      await load();
      onToast({ type: 'success', message: `The client for ${response.request.reference} was notified that the book is available.` });
    } catch (err) { setError(err?.message || 'Could not mark this request available.'); }
    finally { setBusy(false); }
  };
  const retryNotification = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.adminRetryBookRequestNotification(selected.id);
      setSelected((await api.adminBookRequest(response.request.id)).request);
      onToast({ type: 'success', message: 'The failed notification channel was retried.' });
    } catch (err) { setError(err?.message || 'Could not retry the notification.'); }
    finally { setBusy(false); }
  };
  const channelLabel = value => ({ sent: 'Sent', failed: 'Failed', unavailable: 'Not supplied' }[value] || 'Pending');

  return ReactDOM.createPortal(
    <div className="admin-modal-backdrop book-requests-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-modal-panel book-requests-modal" role="dialog" aria-modal="true" aria-label="Book requests">
        <button className="admin-modal-close" type="button" onClick={onClose}><Icon name="x" size={16} /><span>Close</span></button>
        <div className="book-requests-heading">
          <div><p className="overline">Bookshop sourcing</p><h2>{selected ? selected.reference : 'Book Requests'}</h2><p>{selected ? selected.requested_title : 'Requests from clients who could not find a book.'}</p></div>
          {!selected && <span className="book-request-count">{pendingCount} pending</span>}
        </div>
        {error && <p className="form-error book-request-admin-error">{error}</p>}
        {selected ? (
          <div className="book-request-detail">
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => { setSelected(null); setProductUrl(''); }}>Back to requests</button>
            <div className="book-request-facts">
              {[['Status', selected.status], ['Client', selected.customer_name], ['Email', selected.email || 'Not supplied'], ['Phone', selected.phone || 'Not supplied'], ['Author', selected.author || 'Not supplied'], ['Publisher', selected.publisher || 'Not supplied'], ['Level / class', selected.level || 'Not supplied'], ['Requested', selected.created_at ? new Date(selected.created_at).toLocaleString() : '-']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            {selected.notes && <div className="book-request-note"><span>Client notes</span><p>{selected.notes}</p></div>}
            <div className="book-request-notifications">
              <h3>Notifications</h3>
              <span>Acknowledgement email: <strong>{channelLabel(selected.acknowledgement?.email)}</strong></span>
              <span>Acknowledgement SMS: <strong>{channelLabel(selected.acknowledgement?.sms)}</strong></span>
              <span>Availability email: <strong>{channelLabel(selected.availability_notification?.email)}</strong></span>
              <span>Availability SMS: <strong>{channelLabel(selected.availability_notification?.sms)}</strong></span>
            </div>
            {selected.history?.length > 0 && <div className="book-request-history"><h3>Request history</h3>{selected.history.map(event => <div key={event.id}><span>{event.action}</span><time>{new Date(event.created_at).toLocaleString()}</time></div>)}</div>}
            {selected.status === 'pending' && canManage && <div className="book-request-available"><label><span>Published product link</span><input value={productUrl} onChange={event => { setProductUrl(event.target.value); setConfirmAvailable(false); }} placeholder="https://bookshop.realmindxgh.com/products/..." /></label>{confirmAvailable ? <div className="book-request-confirm"><strong>Notify this client now?</strong><span>Email and SMS will use this product link.</span><div><button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={markAvailable}>{busy ? 'Notifying...' : 'Confirm and notify'}</button><button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setConfirmAvailable(false)}>Cancel</button></div></div> : <button className="btn btn-primary" type="button" onClick={() => { if (!productUrl.trim()) setError('Paste the published RealMindX Bookshop product link.'); else { setError(''); setConfirmAvailable(true); } }}>Available Now</button>}</div>}
            {selected.status === 'available' && canManage && ['failed'].some(value => [selected.availability_notification?.email, selected.availability_notification?.sms].includes(value)) && <button className="btn btn-primary" type="button" disabled={busy} onClick={retryNotification}>{busy ? 'Retrying...' : 'Retry failed notification'}</button>}
          </div>
        ) : (
          <>
            <div className="book-request-tools"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reference, title, or client" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="available">Available</option></select><label>Rows <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[5, 10, 20, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label></div>
            <div className="book-request-list" aria-busy={loading}>
              {loading && items.length === 0 ? <p className="book-request-empty">Loading requests...</p> : items.map(row => <button type="button" className="book-request-row" key={row.id} onClick={() => openDetail(row)}><span><strong>{row.requested_title}</strong><small>{row.reference} · {row.customer_name}</small></span><span><strong>{row.status === 'available' ? 'Available' : 'Pending'}</strong><small>{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</small></span></button>)}
              {!loading && items.length === 0 && <p className="book-request-empty">No book requests match this view.</p>}
            </div>
            <div className="book-request-pagination"><span>{total} request{total === 1 ? '' : 's'}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><strong>Page {page} of {pages}</strong><button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
          </>
        )}
      </section>
    </div>, document.body,
  );
};

const ManagedTableView = ({ config, rows: rowsProp, session }) => {
  const { content, fetchCollection, createItem, updateItem, deleteItem, togglePublish: apiToggle, loading, errors } = useAdminContent();
  const [editing, setEditing] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [replying, setReplying] = React.useState(null);
  const [replyText, setReplyText] = React.useState('');
  const [replyError, setReplyError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [resourceCategory, setResourceCategory] = React.useState('');
  const [resourceLevel, setResourceLevel] = React.useState('');
  const [resourceSubject, setResourceSubject] = React.useState('');
  const [settlementCompany, setSettlementCompany] = React.useState('');
  const [settlementPayment, setSettlementPayment] = React.useState('');
  const [settlementStart, setSettlementStart] = React.useState('');
  const [settlementEnd, setSettlementEnd] = React.useState('');
  const [sortCol, setSortCol] = React.useState(null);
  const [sortDir, setSortDir] = React.useState('asc');
  const [localRows, setLocalRows] = React.useState(null);
  const [showProductImport, setShowProductImport] = React.useState(false);
  const [showProductActions, setShowProductActions] = React.useState(false);
  const [showBookRequests, setShowBookRequests] = React.useState(false);
  const [pendingBookRequests, setPendingBookRequests] = React.useState(0);
  const [actionStatus, setActionStatus] = React.useState(null);
  const [missingImageStats, setMissingImageStats] = React.useState(null);
  const [showMissingImageConfirm, setShowMissingImageConfirm] = React.useState(false);
  const [bulkUnpublishing, setBulkUnpublishing] = React.useState(false);
  const [deliveryAssign, setDeliveryAssign] = React.useState(null);
  const [deliveryAssignCompany, setDeliveryAssignCompany] = React.useState('');
  const [deliveryAssignNote, setDeliveryAssignNote] = React.useState('');
  const [deliveryPayable, setDeliveryPayable] = React.useState('');
  const [deliveryPromotionPayer, setDeliveryPromotionPayer] = React.useState('none');
  const [deliveryPromotionAmount, setDeliveryPromotionAmount] = React.useState('0');
  const [deliveryAssignError, setDeliveryAssignError] = React.useState('');
  const [deliveryAssignBusy, setDeliveryAssignBusy] = React.useState(false);
  const [deliveryDetail, setDeliveryDetail] = React.useState(null);
  const [deliveryDetailError, setDeliveryDetailError] = React.useState('');
  const [deliveryDetailBusy, setDeliveryDetailBusy] = React.useState(false);
  const [deliveryCancelReason, setDeliveryCancelReason] = React.useState('');
  const [otpOverrideReason, setOtpOverrideReason] = React.useState('');
  const [otpOverrideNote, setOtpOverrideNote] = React.useState('');
  const [companyDetail, setCompanyDetail] = React.useState(null);
  const [companyDetailError, setCompanyDetailError] = React.useState('');
  const [companyDetailBusy, setCompanyDetailBusy] = React.useState(false);
  const [companyManagerForm, setCompanyManagerForm] = React.useState({ name: '', phone: '' });
  const [companyDetailTab, setCompanyDetailTab] = React.useState('overview');
  const [companyRiderDetail, setCompanyRiderDetail] = React.useState(null);
  const [companyRiderDetailBusy, setCompanyRiderDetailBusy] = React.useState(false);

  // In API mode: fetch on mount; in local mode: use rowsProp from parent.
  React.useEffect(() => {
    if (isApiMode()) {
      fetchCollection(config.collection).then(() => {});
    }
    setActionStatus(null);
  }, [config.collection, fetchCollection]);

  React.useEffect(() => {
    if (config.collection !== 'products' || !isApiMode() || !hasSessionPermission(session, 'bookRequests.view')) return;
    api.adminBookRequests('page=1&page_size=5&status=pending')
      .then(response => setPendingBookRequests(response.pending_count || 0))
      .catch(() => {});
  }, [config.collection, session]);

  // In API mode the hook owns the data; in local mode the parent passes rows.
  const rows = isApiMode() ? (localRows || rowsProp || []) : (rowsProp || []);

  React.useEffect(() => {
    if (!isApiMode() || config.collection !== 'orders') return undefined;
    const hasActiveOrders = rows.some(row => !['complete', 'cancelled', 'archived'].includes(row.status));
    if (!hasActiveOrders) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        fetchCollection(config.collection, { force: true, silent: true }).then(() => {});
      }
    };
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [config.collection, fetchCollection, rows]);

  // Subscribe to content updates from the hook (API mode).
  React.useEffect(() => {
    if (isApiMode() && content[config.collection]) {
      setLocalRows(content[config.collection]);
    }
  }, [content, config.collection]);

  const [tablePage, setTablePage] = React.useState(1);
  const [tablePageSize, setTablePageSize] = React.useState(10);

  // Reset to page 1 when search or filter changes
  React.useEffect(() => { setTablePage(1); }, [search, filterStatus, tablePageSize, settlementCompany, settlementPayment, settlementStart, settlementEnd, resourceCategory, resourceLevel, resourceSubject]);

  const filteredByStatus = rows.filter(row => {
    if (filterStatus && row.status !== filterStatus) return false;
    if (config.collection === 'resources') {
      if (resourceCategory && row.category !== resourceCategory) return false;
      if (resourceLevel && row.level !== resourceLevel) return false;
      if (resourceSubject && row.subject !== resourceSubject) return false;
    }
    if (config.collection !== 'deliverySettlements') return true;
    if (settlementCompany && String(row.company_id) !== settlementCompany) return false;
    if (settlementStart && row.settlement_date < settlementStart) return false;
    if (settlementEnd && row.settlement_date > settlementEnd) return false;
    if (settlementPayment === 'online' && !row.online_count) return false;
    if (settlementPayment === 'pay_on_delivery' && !row.pay_on_delivery_count) return false;
    return true;
  });
  const filtered = rankByFuzzyMatch(filteredByStatus, search, row => Object.values(row));

  // Column sort — clicking a header cycles asc → desc → off
  const toggleSort = (col) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(null); setSortDir('asc'); }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sorted = sortCol
    ? [...filtered].sort((a, b) => {
        const av = String(a[sortCol] ?? '').toLowerCase();
        const bv = String(b[sortCol] ?? '').toLowerCase();
        const n = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === 'asc' ? n : -n;
      })
    : filtered;

  const totalTablePages = Math.max(1, Math.ceil(sorted.length / tablePageSize));
  const paginatedRows = sorted.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);

  React.useEffect(() => {
    setTablePage(current => Math.min(current, totalTablePages));
  }, [totalTablePages]);

  const handleCreate = async (payload) => {
    const result = await createItem(config.collection, payload);
    const temporaryPassword = result?.temporary_password;
    const copied = temporaryPassword ? await copyTextToClipboard(temporaryPassword) : false;
    const credentialMessage = temporaryPassword
      ? ` Temporary password ${temporaryPassword}${copied ? ' was copied to the clipboard' : ' is ready to share'}. A first-login change is required.`
      : '';
    setActionStatus({ type: 'success', message: `${config.title} record created.${credentialMessage}` });
    setCreating(false);
  };

  const resetInternalAccountPassword = async (row) => {
    setActionStatus(null);
    try {
      const result = await api.adminResetInternalPassword(config.collection, getItemId(row));
      const temporaryPassword = result?.temporary_password || '12345678';
      const copied = await copyTextToClipboard(temporaryPassword);
      await fetchCollection(config.collection, { force: true });
      setActionStatus({
        type: 'success',
        message: `Temporary password ${temporaryPassword}${copied ? ' was copied to the clipboard' : ' is ready to share'}. The account must change it on next sign-in.`,
      });
    } catch (err) {
      setActionStatus({ type: 'error', message: err?.message || 'Could not reset the account password.' });
    }
  };

  const getItemId = (row) => config.idField ? row[config.idField] : row.id;

  const handleUpdate = async (_rawId, payload) => {
    // Editing state holds the full row, so use getItemId to get the correct key.
    const id = editing ? getItemId(editing) : _rawId;
    await updateItem(config.collection, id, payload);
    setActionStatus({ type: 'success', message: `${config.title} record saved.` });
    setEditing(null);
  };

  const labelForRow = (row) => row.name || row.label || row.title || row.email || row.order_reference || 'this record';

  // Auto-dismiss the action-status toast after 2.5 s
  React.useEffect(() => {
    if (!actionStatus) return undefined;
    const t = setTimeout(() => setActionStatus(null), 2500);
    return () => clearTimeout(t);
  }, [actionStatus]);

  const [confirmModal, setConfirmModal] = React.useState(null); // { row, onConfirm }

  const handleDelete = (row, onConfirm) => {
    setConfirmModal({ row, onConfirm });
  };

  const executeDelete = async () => {
    if (!confirmModal) return;
    const { row, onConfirm } = confirmModal;
    const label = labelForRow(row);
    setConfirmModal(null);
    setActionStatus(null);
    try {
      if (onConfirm) {
        await onConfirm();
      } else {
        await deleteItem(config.collection, getItemId(row));
      }
      setActionStatus({ type: 'success', message: `Deleted ${label}.` });
    } catch (err) {
      setActionStatus({ type: 'error', message: err?.message || `Could not delete ${label}.` });
    }
  };

  const togglePublish = (row) => {
    apiToggle(config.collection, row);
  };

  const handleReply = async () => {
    if (!replying || !replyText.trim()) {
      setReplyError('Write a reply before sending.');
      return;
    }
    setReplyError('');
    if (isApiMode()) {
      await api.adminReplyMessage(replying.id, replyText.trim());
      await fetchCollection(config.collection);
    } else {
      await updateItem(config.collection, getItemId(replying), { status: 'replied', reply: replyText.trim() });
    }
    setReplying(null);
    setReplyText('');
  };

  const isLoading = isApiMode() && loading[config.collection];
  const loadError = isApiMode() && errors?.[config.collection];
  const reloginPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/staff')
    ? loginPathForRole('staff')
    : loginPathForRole('admin');
  const permissionKey = config.permissionKey || config.collection;
  const isDeliveryCompanies = config.collection === 'deliveryCompanies';
  const canManageDeliveryCompanies = hasSessionPermission(session, 'delivery.companies.manage');
  const canViewDeliveryCompanies = isDeliveryCompanies && (hasSessionPermission(session, 'delivery.view') || canManageDeliveryCompanies);
  const canCreate = config.allowCreate !== false && Boolean(config.createLabel) && (isDeliveryCompanies ? canManageDeliveryCompanies : hasSessionPermission(session, `${permissionKey}.create`));
  const canUpdate = config.allowEdit !== false && config.allowUpdate !== false && !config.readOnly && !config.statusOnly && !config.moderationOnly && (isDeliveryCompanies ? canManageDeliveryCompanies : hasSessionPermission(session, `${permissionKey}.edit`));
  const canDelete = config.allowDelete !== false && !config.readOnly && hasSessionPermission(session, `${permissionKey}.delete`);
  const canReply = config.collection === 'messages' && !config.readOnly && hasSessionPermission(session, `${permissionKey}.edit`);
  const canPublish = PUBLISHABLE_COLLECTIONS.has(config.collection) && !config.readOnly && !config.statusOnly && hasSessionPermission(session, `${permissionKey}.edit`);
  const isStatusOnly = Boolean(config.statusOnly);          // orders: status + archive only
  const isModerationOnly = Boolean(config.moderationOnly);  // reviews: approve/reject/delete
  const allowArchive = Boolean(config.allowArchive);
  const canStatusEdit = isStatusOnly && hasSessionPermission(session, `${permissionKey}.edit`);
  const canModerate = isModerationOnly && hasSessionPermission(session, `${permissionKey}.edit`);
  const canAssignDelivery = config.collection === 'orders'
    && hasSessionPermission(session, 'delivery.assign')
    && hasSessionPermission(session, 'orders.edit');
  const canViewDelivery = config.collection === 'orders' && hasSessionPermission(session, 'delivery.view');
  const canOverrideOtp = config.collection === 'orders'
    && hasSessionPermission(session, 'delivery.override_otp')
    && hasSessionPermission(session, 'orders.edit');
  const canViewSettlements = config.collection === 'deliverySettlements' && hasSessionPermission(session, 'delivery.settlements.view');
  const hasActions = canUpdate || canDelete || canReply || canPublish || canStatusEdit || canModerate || canAssignDelivery || canViewDelivery || canOverrideOtp || canViewDeliveryCompanies || canViewSettlements;

  const refreshMissingImageStats = React.useCallback(async () => {
    if (config.collection !== 'products' || !isApiMode()) return;
    try {
      setMissingImageStats(await api.adminProductMissingImages());
    } catch {
      setMissingImageStats(null);
    }
  }, [config.collection]);

  React.useEffect(() => {
    if (config.collection !== 'products' || !canUpdate || !isApiMode()) return;
    refreshMissingImageStats();
  }, [canUpdate, config.collection, refreshMissingImageStats]);

  React.useEffect(() => {
    if (config.collection !== 'orders' || !canAssignDelivery || !isApiMode()) return;
    fetchCollection('deliveryCompanies').then(() => {});
  }, [canAssignDelivery, config.collection, fetchCollection]);

  const executeBulkMissingImageUnpublish = async () => {
    setBulkUnpublishing(true);
    setActionStatus(null);
    try {
      const result = await api.adminUnpublishProductsMissingImages();
      await fetchCollection(config.collection);
      await refreshMissingImageStats();
      setShowMissingImageConfirm(false);
      setActionStatus({
        type: 'success',
        message: result.unpublished
          ? `Unpublished ${result.unpublished} product${result.unpublished === 1 ? '' : 's'} without images.`
          : 'No published products without images were found.',
      });
    } catch (err) {
      setActionStatus({ type: 'error', message: err?.message || 'Could not unpublish products without images.' });
    } finally {
      setBulkUnpublishing(false);
    }
  };

  // Status modal for orders
  const [statusModal, setStatusModal] = React.useState(null); // { row }
  const [orderDetail, setOrderDetail] = React.useState(null);
  const [statusChoice, setStatusChoice] = React.useState('');
  const [cancelReason, setCancelReason] = React.useState('');
  const [statusError, setStatusError] = React.useState('');
  const [settlementDetail, setSettlementDetail] = React.useState(null);
  const [settlementForm, setSettlementForm] = React.useState({ adjustment_amount: '', adjustment_reason: '', payment_reference: '', payment_date: '', payment_proof_url: '', resolution_note: '' });

  const openSettlementDetail = async row => {
    try { setSettlementDetail((await api.adminDeliverySettlement(row.id)).settlement); }
    catch (err) { setActionStatus({ type: 'error', message: err?.message || 'Could not open settlement.' }); }
  };
  const updateSettlementAction = async action => {
    try {
      let result;
      if (action === 'adjust') result = await api.adminAdjustDeliverySettlement(settlementDetail.id, { amount: settlementForm.adjustment_amount, reason: settlementForm.adjustment_reason });
      if (action === 'paid') result = await api.adminMarkDeliverySettlementPaid(settlementDetail.id, { payment_reference: settlementForm.payment_reference, payment_date: settlementForm.payment_date, payment_proof_url: settlementForm.payment_proof_url || undefined });
      if (action === 'resolve') result = await api.adminResolveDeliverySettlementDispute(settlementDetail.id, { note: settlementForm.resolution_note });
      setSettlementDetail(result.settlement);
      await fetchCollection('deliverySettlements', { force: true, silent: true });
      setActionStatus({ type: 'success', message: 'Settlement updated.' });
    } catch (err) { setActionStatus({ type: 'error', message: err?.message || 'Could not update settlement.' }); }
  };

  const openStatusModal = (row) => {
    setStatusModal({ row });
    setStatusChoice(row.status || '');
    setCancelReason('');
    setStatusError('');
  };

  const submitStatusChange = async () => {
    if (!statusChoice) { setStatusError('Select a status.'); return; }
    if (statusChoice === 'cancelled' && config.requireCancelReason && !cancelReason.trim()) {
      setStatusError('A reason is required for cancellation.'); return;
    }
    const patch = { status: statusChoice };
    if (statusChoice === 'cancelled' && cancelReason.trim()) patch.cancel_reason = cancelReason.trim();
    await updateItem(config.collection, getItemId(statusModal.row), patch);
    setStatusModal(null);
  };

  const handleArchive = async (row) => {
    try {
      await updateItem(config.collection, getItemId(row), { archived: true, status: 'archived' });
      setActionStatus({ type: 'success', message: `Archived ${labelForRow(row)}.` });
    } catch (err) {
      setActionStatus({ type: 'error', message: err?.message || `Could not archive ${labelForRow(row)}.` });
    }
  };

  // Moderation shortcut for reviews
  const handleModerate = async (row, decision) => {
    try {
      await updateItem(config.collection, getItemId(row), { status: decision });
      setActionStatus({ type: 'success', message: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${labelForRow(row)}.` });
    } catch (err) {
      setActionStatus({ type: 'error', message: err?.message || `Could not update ${labelForRow(row)}.` });
    }
  };

  const openDeliveryAssign = (row) => {
    setDeliveryAssign(row);
    setDeliveryAssignCompany(row.delivery?.company_id ? String(row.delivery.company_id) : '');
    setDeliveryPayable(String(row.delivery?.company_payable_amount ?? row.delivery_fee ?? ''));
    setDeliveryPromotionPayer(row.delivery?.promotion_payer || 'none');
    setDeliveryPromotionAmount(String(row.delivery?.promotion_amount || 0));
    setDeliveryAssignNote('');
    setDeliveryAssignError('');
  };

  const submitDeliveryAssign = async () => {
    if (!deliveryAssignCompany) {
      setDeliveryAssignError('Choose a delivery company.');
      return;
    }
    setDeliveryAssignBusy(true);
    setDeliveryAssignError('');
    try {
      const result = await api.adminAssignDeliveryCompany(getItemId(deliveryAssign), {
        company_id: Number(deliveryAssignCompany),
        note: deliveryAssignNote.trim() || undefined,
        company_payable_amount: deliveryPayable === '' ? undefined : Number(deliveryPayable),
        promotion_payer: deliveryPromotionPayer,
        promotion_amount: Number(deliveryPromotionAmount || 0),
      });
      await fetchCollection(config.collection, { force: true });
      setDeliveryAssign(null);
      setActionStatus({
        type: 'success',
        message: result?.contact_warning
          ? `Assigned ${labelForRow(deliveryAssign)}. ${result.contact_warning}`
          : `Assigned ${labelForRow(deliveryAssign)} for delivery.`,
      });
    } catch (err) {
      setDeliveryAssignError(err?.message || 'Could not assign delivery.');
    } finally {
      setDeliveryAssignBusy(false);
    }
  };

  const openDeliveryDetail = async (row) => {
    setDeliveryDetail({ order: row, delivery: row.delivery || null });
    setDeliveryDetailError('');
    setDeliveryDetailBusy(true);
    setOtpOverrideReason('');
    setOtpOverrideNote('');
    try {
      const data = await api.adminOrderDelivery(getItemId(row));
      setDeliveryDetail(data);
    } catch (err) {
      setDeliveryDetailError(err?.message || 'Could not load delivery details.');
    } finally {
      setDeliveryDetailBusy(false);
    }
  };

  const refreshDeliveryDetail = async () => {
    if (!deliveryDetail?.order?.id) return;
    try {
      const data = await api.adminOrderDelivery(deliveryDetail.order.id);
      setDeliveryDetail(data);
    } catch (err) {
      setDeliveryDetailError(err?.message || 'Could not refresh delivery details.');
    }
  };

  const resendDeliveryOtp = async () => {
    const deliveryId = deliveryDetail?.delivery?.id;
    if (!deliveryId) return;
    setDeliveryDetailBusy(true);
    setDeliveryDetailError('');
    try {
      await api.adminDeliveryOtpResend(deliveryId);
      await Promise.all([refreshDeliveryDetail(), fetchCollection(config.collection, { force: true })]);
      setActionStatus({ type: 'success', message: 'Delivery OTP resent to the customer.' });
    } catch (err) {
      setDeliveryDetailError(err?.message || 'Could not resend OTP.');
    } finally {
      setDeliveryDetailBusy(false);
    }
  };

  const submitOtpOverride = async () => {
    const deliveryId = deliveryDetail?.delivery?.id;
    if (!deliveryId) return;
    if (!otpOverrideReason) {
      setDeliveryDetailError('Choose an OTP override reason.');
      return;
    }
    setDeliveryDetailBusy(true);
    setDeliveryDetailError('');
    try {
      await api.adminDeliveryOtpOverride(deliveryId, {
        reason: otpOverrideReason,
        note: otpOverrideNote.trim() || undefined,
      });
      await Promise.all([refreshDeliveryDetail(), fetchCollection(config.collection, { force: true })]);
      setOtpOverrideReason('');
      setOtpOverrideNote('');
      setActionStatus({ type: 'success', message: 'OTP override recorded and delivery completed.' });
    } catch (err) {
      setDeliveryDetailError(err?.message || 'Could not override OTP.');
    } finally {
      setDeliveryDetailBusy(false);
    }
  };

  const cancelExternalDelivery = async () => {
    const deliveryId = deliveryDetail?.delivery?.id;
    if (!deliveryId || !deliveryCancelReason.trim()) {
      setDeliveryDetailError('A cancellation reason is required.');
      return;
    }
    setDeliveryDetailBusy(true);
    setDeliveryDetailError('');
    try {
      await api.adminCancelDelivery(deliveryId, { reason: deliveryCancelReason.trim() });
      await Promise.all([refreshDeliveryDetail(), fetchCollection(config.collection, { force: true })]);
      setDeliveryCancelReason('');
      setActionStatus({ type: 'success', message: 'External delivery assignment cancelled.' });
    } catch (err) {
      setDeliveryDetailError(err?.message || 'Could not cancel the delivery assignment.');
    } finally {
      setDeliveryDetailBusy(false);
    }
  };

  const openCompanyDetail = async (row) => {
    setCompanyDetail({ company: row, managers: [], riders: [], deliveries: [] });
    setCompanyDetailError('');
    setCompanyDetailBusy(true);
    setCompanyManagerForm({ name: '', phone: '' });
    setCompanyDetailTab('overview');
    setCompanyRiderDetail(null);
    try {
      setCompanyDetail(await api.adminDeliveryCompanyDetail(getItemId(row)));
    } catch (err) {
      setCompanyDetailError(err?.message || 'Could not load delivery company details.');
    } finally {
      setCompanyDetailBusy(false);
    }
  };

  const refreshCompanyDetail = async () => {
    if (!companyDetail?.company?.id) return;
    setCompanyDetail(await api.adminDeliveryCompanyDetail(companyDetail.company.id));
  };

  const createCompanyManager = async () => {
    if (!companyManagerForm.name.trim() || !companyManagerForm.phone.trim()) {
      setCompanyDetailError('Manager name and phone are required.');
      return;
    }
    setCompanyDetailBusy(true);
    setCompanyDetailError('');
    try {
      const result = await api.adminCreateDeliveryCompanyManager(companyDetail.company.id, companyManagerForm);
      const temporaryPassword = result?.temporary_password || '12345678';
      const copied = await copyTextToClipboard(temporaryPassword);
      await refreshCompanyDetail();
      setCompanyManagerForm({ name: '', phone: '' });
      setActionStatus({ type: 'success', message: `Company manager created. Temporary password ${temporaryPassword}${copied ? ' was copied to the clipboard' : ' is ready to share'}.` });
    } catch (err) {
      setCompanyDetailError(err?.message || 'Could not create company manager.');
    } finally {
      setCompanyDetailBusy(false);
    }
  };

  const resetCompanyManagerPassword = async (managerId) => {
    setCompanyDetailBusy(true);
    setCompanyDetailError('');
    try {
      const result = await api.adminResetCompanyUserPassword(managerId);
      const temporaryPassword = result?.temporary_password || '12345678';
      const copied = await copyTextToClipboard(temporaryPassword);
      await refreshCompanyDetail();
      setActionStatus({ type: 'success', message: `Company manager password reset to ${temporaryPassword}${copied ? ' and copied to the clipboard' : ''}.` });
    } catch (err) {
      setCompanyDetailError(err?.message || 'Could not reset company manager password.');
    } finally {
      setCompanyDetailBusy(false);
    }
  };

  const openCompanyRiderDetail = async (rider) => {
    setCompanyRiderDetail({ rider, deliveries: [] });
    setCompanyRiderDetailBusy(true);
    setCompanyDetailError('');
    try {
      setCompanyRiderDetail(await api.adminDeliveryRiderDetail(rider.id));
    } catch (err) {
      setCompanyDetailError(err?.message || 'Could not load rider details.');
      setCompanyRiderDetail(null);
    } finally {
      setCompanyRiderDetailBusy(false);
    }
  };

  const activeDeliveryCompanies = (content.deliveryCompanies || []).filter(company => company.is_active !== false);
  const createAction = canCreate ? config.createLabel : '';
  const closeFormModal = () => { setCreating(false); setEditing(null); };

  React.useEffect(() => {
    const modalOpen = creating || editing;
    if (!modalOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => {
      if (event.key === 'Escape') closeFormModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [creating, editing]);

  const renderCell = (row, column, isPrimary) => {
    if (config.collection === 'settings' && column === 'key') {
      return <span className={isPrimary ? 'td-primary' : ''}>{SITE_SETTING_LABELS[row.key] || readableCellValue(row.key)}</span>;
    }
    if (config.collection === 'settings' && column === 'site_scope') {
      return <span>{SITE_SCOPE_LABELS[row.site_scope] || 'Both sites'}</span>;
    }
    if (config.collection === 'applications') {
      if (column === 'name') {
        return <span className={isPrimary ? 'td-primary' : ''}>{row.user?.full_name || row.user?.email || 'Unknown applicant'}</span>;
      }
      if (column === 'email') {
        return <span>{row.user?.email || '-'}</span>;
      }
      if (column === 'job') {
        return <span>{row.job?.title || '-'}</span>;
      }
    }

    if (column === 'image_url' || column === 'image') {
      const src = rowImageUrl(row);
      return src ? (
        <img
          className="admin-thumb"
          src={src}
          alt={row.title || row.label || row.name || 'Uploaded image'}
          loading="lazy"
          decoding="async"
          width="72"
          height="72"
        />
      ) : (
        <span className="td-muted">{row.image_key ? 'Default image' : 'No image yet'}</span>
      );
    }

    if (column === 'status') {
      const displayStatus = config.collection === 'orders' && row.delivery?.company_id && row[column] === 'shipped'
        ? 'Out for delivery'
        : statusLabel(row[column]);
      return (
        <span className={`badge ${config.collection === 'orders' ? orderStatusBadgeClass(row[column]) : row[column] === 'published' || row[column] === 'active' || row[column] === 'new' ? 'badge-success' : 'badge-navy'}`}>
          {displayStatus}
        </span>
      );
    }

    if (config.collection === 'orders') {
      if (column === 'order_reference') return <button className="admin-order-reference" type="button" onClick={() => setOrderDetail(row)}>{row.order_reference}</button>;
      if (column === 'delivery_company') return <span>{row.delivery?.company_name || 'Unassigned'}</span>;
      if (column === 'delivery_rider') return <span>{row.delivery?.rider_name || '-'}</span>;
      if (column === 'delivery_status') {
        return <span className={`badge ${orderStatusBadgeClass(row.delivery?.status || 'not_assigned')}`}>{statusLabel(row.delivery?.status || 'not_assigned')}</span>;
      }
      if (column === 'otp_status') {
        const otp = row.delivery?.otp;
        return <span>{otp?.blocked ? 'Blocked' : statusLabel(otp?.status || 'not_generated')}</span>;
      }
    }

    if (config.collection === 'deliverySettlements' && ['due_realmindx', 'due_company', 'net_balance'].includes(column)) {
      return <span className={column === 'net_balance' ? 'td-primary' : ''}>GHS {Number(row[column] || 0).toFixed(2)}</span>;
    }

    const value = row[column];
    return <span className={isPrimary ? 'td-primary' : ''}>{readableCellValue(value)}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h2 className="admin-page-title">{config.title}</h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--gray-600)', marginTop: 4 }}>{config.description}</p>
          {config.note !== false && (
            <p style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: 6 }}>
              {config.note || 'Changes saved here update the live website once published.'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {config.collection === 'products' && hasSessionPermission(session, 'bookRequests.view') && (
            <button className="btn btn-primary btn-sm book-requests-button" type="button" onClick={() => setShowBookRequests(true)}>Book Requests{pendingBookRequests ? ` (${pendingBookRequests})` : ''}</button>
          )}
          {EXPORTABLE_PERMISSION_KEYS.has(config.collection) && isApiMode() && (
            <>
              {config.collection === 'products' && (
                <>
                  <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setShowProductActions(true)}>Actions</button>
                </>
              )}
              {config.collection !== 'products' && (
                ['csv', 'xlsx'].map(format => (
                  <a className="btn btn-outline-navy btn-sm" key={format} href={api.adminExportUrl(config.collection, format)}>
                    Export {format.toUpperCase()}
                  </a>
                ))
              )}
            </>
          )}
          {canCreate && (
            <button className="btn btn-primary btn-sm" style={config.collection === 'products' ? { marginLeft: 12 } : undefined} onClick={() => { setCreating(true); setEditing(null); }}>{config.createLabel}</button>
          )}
        </div>
      </div>

      {config.collection === 'products' && showProductImport && (
        <ProductImportPanel
          onImported={() => fetchCollection(config.collection)}
          onClose={() => setShowProductImport(false)}
        />
      )}
      {config.collection === 'products' && showProductActions && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowProductActions(false); }}>
          <div className="admin-modal-panel" role="dialog" aria-modal="true" aria-label="Product actions" style={{ width:'min(520px, 100%)', padding:'32px' }}>
            <button className="admin-modal-close" type="button" onClick={() => setShowProductActions(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            <h3>Product actions</h3>
            <p className="modal-subtitle">Run catalogue-wide tasks without crowding the product toolbar.</p>
            <div style={{ display:'grid', gap:12, marginTop:22 }}>
              <button className="btn btn-outline-navy" type="button" onClick={() => { setShowProductActions(false); setShowProductImport(true); }}>
                Batch import catalogue
              </button>
              {canUpdate && (
                <button
                  className="btn btn-outline-navy"
                  type="button"
                  disabled={!missingImageStats?.published}
                  onClick={() => { setShowProductActions(false); setShowMissingImageConfirm(true); }}
                >
                  Unpublish missing-image products{missingImageStats ? ` (${missingImageStats.published})` : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <BookRequestsModal open={config.collection === 'products' && showBookRequests} onClose={() => setShowBookRequests(false)} session={session} onToast={setActionStatus} onPendingCount={setPendingBookRequests} />

      {config.collection === 'newsletters' && (
        <NewsletterComposer onSent={() => fetchCollection(config.collection)} />
      )}

      {actionStatus && ReactDOM.createPortal(
        <div className="admin-toast" data-type={actionStatus.type}>
          <span className="admin-toast-icon">{actionStatus.type === 'error' ? '✕' : '✓'}</span>
          <span className="admin-toast-msg">{actionStatus.message}</span>
          <button className="admin-toast-close" type="button" onClick={() => setActionStatus(null)} aria-label="Dismiss">✕</button>
        </div>,
        document.body,
      )}

      {(creating || editing) && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeFormModal();
          }}
        >
          <div className="admin-modal-panel" role="dialog" aria-modal="true" aria-label={`${editing ? 'Edit' : 'Add'} ${config.title}`}>
            <button className="admin-modal-close" type="button" onClick={closeFormModal}>
              <Icon name="x" size={16} stroke={2.1} />
              <span>Close</span>
            </button>
            <ManagedForm
              config={config}
              initialItem={editing}
              onCancel={closeFormModal}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      )}

      {config.collection === 'messages' && replying && (
        <div className="admin-reply-panel">
          <div>
            <p className="overline">{replying.ticket_reference || `RMX-${String(replying.id).padStart(6, '0')}`}</p>
            <h3>Reply to {replying.name}</h3>
            <p>{replying.email} - {replying.subject}</p>
          </div>
          <textarea
            className="form-textarea"
            value={replyText}
            onChange={event => setReplyText(event.target.value)}
            placeholder="Write the reply that should be emailed to this contact."
            rows={5}
          />
          {replyError && <p className="form-error">{replyError}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={handleReply}>Send Reply</button>
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => { setReplying(null); setReplyText(''); setReplyError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="admin-table-card">
        <div className="atc-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3>{sorted.length} Record{sorted.length !== 1 ? 's' : ''}{sorted.length > tablePageSize ? ` (page ${tablePage} of ${totalTablePages})` : ''}</h3>
          <div className="admin-table-tools">
            {config.collection === 'resources' && <>
              <select value={resourceCategory} onChange={event => setResourceCategory(event.target.value)}><option value="">All categories</option>{[...new Set(rows.map(row => row.category).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
              <select value={resourceLevel} onChange={event => setResourceLevel(event.target.value)}><option value="">All levels</option>{[...new Set(rows.map(row => row.level).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
              <select value={resourceSubject} onChange={event => setResourceSubject(event.target.value)}><option value="">All subjects</option>{[...new Set(rows.map(row => row.subject).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select>
            </>}
            {config.collection === 'deliverySettlements' && <>
              <select value={settlementCompany} onChange={event => setSettlementCompany(event.target.value)}>
                <option value="">All companies</option>
                {[...new Map(rows.map(row => [row.company_id, row.company_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select value={settlementPayment} onChange={event => setSettlementPayment(event.target.value)}><option value="">All payment methods</option><option value="online">Online</option><option value="pay_on_delivery">Pay on delivery</option></select>
              <input type="date" aria-label="Settlement start date" value={settlementStart} onChange={event => setSettlementStart(event.target.value)} />
              <input type="date" aria-label="Settlement end date" value={settlementEnd} onChange={event => setSettlementEnd(event.target.value)} />
            </>}
            {/* Status filter — shown whenever rows have a status column */}
            <label className="admin-page-size">
              <span>Rows</span>
              <select value={tablePageSize} onChange={event => setTablePageSize(Number(event.target.value))}>
                {[5, 10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            {rows.some(r => 'status' in r) && (
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-light,#e2e8f0)', background: '#fff', color: filterStatus ? 'var(--navy)' : 'var(--gray-500)', fontWeight: filterStatus ? 700 : 400 }}
              >
                <option value="">All statuses</option>
                {[...new Set(rows.map(r => r.status).filter(Boolean))].sort().map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            )}
            <div className="atc-search"><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" /></div>
            {config.collection === 'products' && isApiMode() && (
              <a className="btn btn-outline-navy btn-sm" href={api.adminExportUrl('products', 'zip')}>Export ZIP</a>
            )}
          </div>
        </div>
        {loadError ? (
          <EmptySection
            title="This section could not load"
            body="Please sign in again with the correct internal account. If it still fails, the account may not have permission for this section."
            action="Open Sign In"
            onAction={() => { window.location.href = reloginPath; }}
          />
        ) : isLoading ? (
          <EmptySection title={`Loading ${config.title}`} body="One moment while the latest records load." />
        ) : filtered.length === 0 ? (
          <EmptySection
            title={config.emptyTitle || `No ${config.title} Yet`}
            body={config.emptyBody || `Nothing has been added here yet. Use ${config.createLabel || 'the controls above'} to add content when you are ready.`}
            action={createAction}
            onAction={canCreate ? () => setCreating(true) : undefined}
          />
        ) : (
          <AdminTableScroll>
            <table className="admin-table">
            <thead>
              <tr>
                {config.columns.map(column => (
                  <th
                    key={column}
                    onClick={() => toggleSort(column)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    title={`Sort by ${columnLabel(config, column)}`}
                  >
                    {columnLabel(config, column)}
                    <span style={{ marginLeft: 4, opacity: sortCol === column ? 1 : 0.3, fontSize: '0.75em' }}>
                      {sortCol === column ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                ))}
                <th
                  onClick={() => toggleSort('updated_at')}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  title="Sort by last recorded order activity"
                >
                  Last activity
                  <span style={{ marginLeft: 4, opacity: sortCol === 'updated_at' ? 1 : 0.3, fontSize: '0.75em' }}>
                    {sortCol === 'updated_at' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </th>
                {hasActions && <th className="admin-actions-column">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map(row => (
                <tr key={row.id}>
                  {config.columns.map(column => (
                    <td key={column}>
                      {renderCell(row, column, column === config.columns[0] || column === 'title' || column === 'name' || column === 'label')}
                    </td>
                  ))}
                  <td className="admin-activity-date">{formatActivityDate(row.updated_at || row.created_at)}</td>
                  {hasActions && (
                    <td className="admin-actions-column">
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* Standard edit/publish */}
                        {canUpdate && <button className="table-action-btn" onClick={() => { setEditing(row); setCreating(false); }}>Edit</button>}
                        {canViewDeliveryCompanies && (
                          <button className="table-action-btn" onClick={() => openCompanyDetail(row)}>View Company</button>
                        )}
                        {canViewSettlements && <button className="table-action-btn" onClick={() => openSettlementDetail(row)}>View Settlement</button>}
                        {['admins', 'staff'].includes(config.collection) && canUpdate && (
                          <button className="table-action-btn" onClick={() => resetInternalAccountPassword(row)}>Reset Password</button>
                        )}
                        {canReply && <button className="table-action-btn" onClick={() => { setReplying(row); setReplyText(''); setReplyError(''); setEditing(null); setCreating(false); }}>Reply</button>}
                        {'status' in row && canPublish && <button className="table-action-btn" onClick={() => togglePublish(row)}>{row.status === 'published' || row.status === 'active' ? 'Unpublish' : 'Publish'}</button>}

                        {/* Status-only tables: inline status selector, with archive where enabled */}
                        {canStatusEdit && !row.delivery?.company_id && row.status !== 'archived' && (
                          <OrderStatusSelector
                            row={row}
                            options={config.statusOptions || ['new', 'confirmed', 'shipped', 'complete', 'cancelled']}
                            requireCancelReason={config.requireCancelReason}
                            onSave={(patch) => updateItem(config.collection, getItemId(row), patch)}
                          />
                        )}
                        {canStatusEdit && allowArchive && row.status !== 'archived' && (
                          <button className="table-action-btn" onClick={() => handleArchive(row)}>Archive</button>
                        )}
                        {canAssignDelivery && !['complete', 'cancelled', 'archived'].includes(row.status) && (
                          <button className="table-action-btn" onClick={() => openDeliveryAssign(row)}>
                            {row.delivery?.company_id ? 'Reassign Delivery' : 'Assign Delivery'}
                          </button>
                        )}
                        {canViewDelivery && row.delivery && (
                          <button className="table-action-btn" onClick={() => openDeliveryDetail(row)}>Delivery Details</button>
                        )}

                        {/* Product reviews: moderation only */}
                        {canModerate && row.status !== 'approved' && (
                          <button className="table-action-btn" style={{ background:'#e6f4ea', color:'#1a6e33' }} onClick={() => handleModerate(row, 'approved')}>Approve</button>
                        )}
                        {canModerate && row.status !== 'rejected' && (
                          <button className="table-action-btn" style={{ background:'#fdf0f0', color:'#a63030' }} onClick={() => handleModerate(row, 'rejected')}>Reject</button>
                        )}

                        {canDelete && <button className="table-action-btn danger" onClick={() => handleDelete(row)}>Delete</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            </table>
          </AdminTableScroll>
        )}
      {/* Table pagination */}
      {sorted.length > 0 && (
        <div className="admin-table-pagination">
          <button className="btn btn-outline-navy btn-sm" disabled={tablePage === 1} onClick={() => setTablePage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize:'0.82rem', color:'var(--gray-600)' }}>Page {tablePage} of {totalTablePages}</span>
          <button className="btn btn-outline-navy btn-sm" disabled={tablePage === totalTablePages} onClick={() => setTablePage(p => p + 1)}>Next →</button>
        </div>
      )}
      </div>

      {orderDetail && (
        <div className="admin-receipt-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setOrderDetail(null)}>
          <article className="admin-order-receipt" role="dialog" aria-modal="true" aria-label={`Order receipt ${orderDetail.order_reference}`}>
            <button className="admin-modal-close" type="button" onClick={() => setOrderDetail(null)} aria-label="Close"><Icon name="x" size={17} /></button>
            <header><div className="admin-order-receipt-brand"><Icon name="receipt" size={26} /><div><span>RealMindX Bookshop</span><h2>Order Receipt</h2></div></div><div><strong>{orderDetail.order_reference}</strong><span>{orderDetail.created_at ? new Date(orderDetail.created_at).toLocaleString() : '-'}</span></div></header>
            <section className="admin-order-receipt-summary">
              <div><span>Order status</span><strong>{statusLabel(orderDetail.status)}</strong></div>
              <div><span>Payment</span><strong>{statusLabel(orderDetail.payment_status || 'unknown')}</strong></div>
              <div><span>Fulfilment</span><strong>{statusLabel(orderDetail.delivery_method || 'pickup')}</strong></div>
              <div><span>Total</span><strong>GHS {Number(orderDetail.total_amount || 0).toFixed(2)}</strong></div>
            </section>
            <section className="admin-order-receipt-parties"><div><h3>Customer</h3><p><strong>{orderDetail.customer_name || '-'}</strong></p>{orderDetail.phone ? <p>{orderDetail.phone}</p> : null}{orderDetail.email ? <p>{orderDetail.email}</p> : null}{orderDetail.customer_sex ? <p>{statusLabel(orderDetail.customer_sex)} | {statusLabel(orderDetail.customer_age_range)}</p> : null}</div><div><h3>Fulfilment Details</h3><p><strong>{statusLabel(orderDetail.delivery_method || 'pickup')}</strong></p>{orderDetail.delivery_zone_name ? <p>{orderDetail.delivery_zone_name}</p> : null}{orderDetail.location ? <p>{orderDetail.location}</p> : null}{orderDetail.delivery_region ? <p>{orderDetail.delivery_region}</p> : null}{orderDetail.delivery?.company_name ? <p>{orderDetail.delivery.company_name}{orderDetail.delivery.rider_name ? ` | ${orderDetail.delivery.rider_name}` : ''}</p> : null}</div></section>
            <section><h3>Items</h3><div className="admin-order-receipt-items"><div className="head"><span>Item</span><span>Qty</span><span>Price</span><span>Amount</span></div>{(orderDetail.items || []).map((item, index) => <div key={`${item.product_id || index}-${item.product_name}`}><span>{item.product_name}</span><span>{item.quantity}</span><span>GHS {Number(item.unit_price || 0).toFixed(2)}</span><strong>GHS {(Number(item.unit_price || 0) * Number(item.quantity || 0)).toFixed(2)}</strong></div>)}</div></section>
            <section className="admin-order-receipt-bottom"><div><h3>Payment Details</h3><p>Method: <strong>{statusLabel(orderDetail.payment_method || 'unknown')}</strong></p>{orderDetail.payment_provider ? <p>Provider: <strong>{statusLabel(orderDetail.payment_provider)}</strong></p> : null}{orderDetail.payment_reference ? <p>Reference: <strong>{orderDetail.payment_reference}</strong></p> : null}{orderDetail.invoice_id ? <p>Invoice: <strong>{orderDetail.invoice_id}</strong></p> : null}</div><dl><div><dt>Subtotal</dt><dd>GHS {Number(orderDetail.subtotal_amount != null ? orderDetail.subtotal_amount : Number(orderDetail.total_amount || 0) - Number(orderDetail.delivery_fee || 0)).toFixed(2)}</dd></div>{Number(orderDetail.bulk_discount_amount || 0) ? <div><dt>Bulk discount</dt><dd>- GHS {Number(orderDetail.bulk_discount_amount).toFixed(2)}</dd></div> : null}{Number(orderDetail.promo_discount_amount || 0) ? <div><dt>Promo {orderDetail.promo_code ? `(${orderDetail.promo_code})` : ''}</dt><dd>- GHS {Number(orderDetail.promo_discount_amount).toFixed(2)}</dd></div> : null}<div><dt>Delivery</dt><dd>GHS {Number(orderDetail.delivery_fee || 0).toFixed(2)}</dd></div><div className="total"><dt>Total</dt><dd>GHS {Number(orderDetail.total_amount || 0).toFixed(2)}</dd></div></dl></section>
            <footer><span>Last activity: {orderDetail.updated_at ? new Date(orderDetail.updated_at).toLocaleString() : '-'}</span><button className="btn btn-outline-navy" type="button" onClick={() => setOrderDetail(null)}>Close</button></footer>
          </article>
        </div>
      )}

      {/* Order status modal */}
      {statusModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div role="dialog" aria-modal="true" aria-label="Change order status" style={{ position:'relative', background:'#fff', borderRadius:12, padding:32, width:'100%', maxWidth:440, boxShadow:'0 12px 48px rgba(0,0,0,0.2)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setStatusModal(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:8 }}>Change Order Status</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:20 }}>
              Order: <strong>{statusModal.row.order_reference}</strong> for {statusModal.row.customer_name}
            </p>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">New Status</label>
              <select className="form-select" value={statusChoice} onChange={e => setStatusChoice(e.target.value)}>
                <option value="">Select status</option>
                {(config.statusOptions || ['new', 'confirmed', 'shipped', 'complete', 'cancelled']).map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                ))}
              </select>
            </div>
            {statusChoice === 'cancelled' && (
              <div className="form-group" style={{ marginBottom:16 }}>
                <label className="form-label">Cancellation Reason *</label>
                <textarea className="form-textarea" rows={3} value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation (required)…" />
              </div>
            )}
            {statusError && <p style={{ color:'var(--danger)', fontSize:'0.8rem', marginBottom:12 }}>{statusError}</p>}
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" onClick={submitStatusChange}>Save Status</button>
              <button className="btn btn-outline-navy" onClick={() => setStatusModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal — replaces window.confirm */}
      {settlementDetail && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSettlementDetail(null); }}>
          <section className="admin-modal-panel settlement-detail-modal" role="dialog" aria-modal="true">
            <button className="admin-modal-close" type="button" onClick={() => setSettlementDetail(null)}><Icon name="x" size={16} /><span>Close</span></button>
            <p className="overline">Delivery Settlement</p><h2 className="admin-page-title">{settlementDetail.reference}</h2><p>{settlementDetail.company_name} | {settlementDetail.settlement_date} | {statusLabel(settlementDetail.status)}</p>
            <div className="delivery-kpi-strip"><div><span>Book value</span><strong>GHS {Number(settlementDetail.book_subtotal || 0).toFixed(2)}</strong></div><div><span>Company payable</span><strong>GHS {Number(settlementDetail.company_payable || 0).toFixed(2)}</strong></div><div><span>Net</span><strong>GHS {Number(settlementDetail.net_balance || 0).toFixed(2)}</strong></div></div>
            <div className="settlement-line-list">{(settlementDetail.lines || []).map(line => <div key={line.id}><strong>{line.order_reference}</strong><span>{line.rider_name || '-'}</span><span>{line.delivery_location || '-'}</span><span>{statusLabel(line.payment_method)}</span><b>GHS {Number(line.net_balance || 0).toFixed(2)}</b></div>)}</div>
            <div className="delivery-modal-actions">{['csv','xlsx','pdf'].map(format => <a key={format} className="btn btn-outline-navy" href={api.adminDeliverySettlementExportUrl(settlementDetail.id, format)}>{format.toUpperCase()}</a>)}</div>
            {hasSessionPermission(session, 'delivery.settlements.adjust') && settlementDetail.status !== 'settled' ? <div className="delivery-company-create-row"><input className="form-input" type="number" step="0.01" placeholder="Adjustment amount" value={settlementForm.adjustment_amount} onChange={event => setSettlementForm(current => ({ ...current, adjustment_amount: event.target.value }))} /><input className="form-input" placeholder="Required adjustment reason" value={settlementForm.adjustment_reason} onChange={event => setSettlementForm(current => ({ ...current, adjustment_reason: event.target.value }))} /><button className="btn btn-outline-navy" type="button" onClick={() => updateSettlementAction('adjust')}>Apply Adjustment</button></div> : null}
            {hasSessionPermission(session, 'delivery.settlements.mark_paid') && settlementDetail.status !== 'settled' ? <div className="delivery-company-create-row"><input className="form-input" placeholder="Payment reference" value={settlementForm.payment_reference} onChange={event => setSettlementForm(current => ({ ...current, payment_reference: event.target.value }))} /><input className="form-input" type="date" value={settlementForm.payment_date} onChange={event => setSettlementForm(current => ({ ...current, payment_date: event.target.value }))} /><input className="form-input" type="url" placeholder="Payment proof link (optional)" value={settlementForm.payment_proof_url} onChange={event => setSettlementForm(current => ({ ...current, payment_proof_url: event.target.value }))} /><button className="btn btn-primary" type="button" onClick={() => updateSettlementAction('paid')}>Mark Settled</button></div> : null}
            {settlementDetail.dispute_status === 'open' && hasSessionPermission(session, 'delivery.settlements.dispute_resolve') ? <div className="delivery-company-create-row"><input className="form-input" placeholder="Resolution notes" value={settlementForm.resolution_note} onChange={event => setSettlementForm(current => ({ ...current, resolution_note: event.target.value }))} /><button className="btn btn-primary" type="button" onClick={() => updateSettlementAction('resolve')}>Resolve Dispute</button></div> : null}
          </section>
        </div>
      )}

      {companyDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:520, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div role="dialog" aria-modal="true" aria-label="Delivery company access" style={{ position:'relative', background:'#fff', borderRadius:12, padding:28, width:'100%', maxWidth:820, maxHeight:'88vh', overflow:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.2)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setCompanyDetail(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:8 }}>Delivery Company Details</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:16 }}>{companyDetail.company?.name}</p>
            {companyDetailError ? <p className="form-error">{companyDetailError}</p> : null}
            <div className="delivery-company-summary-grid">
              {[
                ['Status', companyDetail.company?.is_active ? 'Active' : 'Inactive'],
                ['Contact', companyDetail.company?.contact_name || '-'],
                ['Phone', companyDetail.company?.contact_phone || '-'],
                ['Email', companyDetail.company?.contact_email || '-'],
                ['Active Deliveries', companyDetail.company?.active_deliveries ?? 0],
                ['Delivered', companyDetail.company?.completed_deliveries ?? 0],
                ['Company Terms', (companyDetail.managers || []).some(manager => manager.terms?.accepted) ? 'Accepted' : 'Pending'],
                ['Terms Version', (companyDetail.managers || []).find(manager => manager.terms?.accepted)?.terms?.version || '-'],
              ].map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            <div className="delivery-company-tabs" role="tablist" aria-label="Delivery company details">
              {['overview', 'managers', 'riders', 'deliveries'].map(tab => (
                <button key={tab} type="button" className={companyDetailTab === tab ? 'active' : ''} onClick={() => { setCompanyDetailTab(tab); setCompanyRiderDetail(null); }}>
                  {statusLabel(tab)}
                </button>
              ))}
            </div>

            {companyDetailTab === 'overview' && (
              <div className="delivery-company-overview">
                {!(companyDetail.managers || []).some(manager => manager.terms?.accepted) ? (
                  <p className="form-warning">No active company manager has accepted the current Delivery Company Platform Terms. Confirm acceptance before assigning live orders.</p>
                ) : null}
                <h4>Company Notes</h4>
                <p>{companyDetail.company?.notes || 'No internal notes have been added.'}</p>
                <h4>Operational Summary</h4>
                <p>{(companyDetail.riders || []).length} rider{(companyDetail.riders || []).length === 1 ? '' : 's'}, {(companyDetail.managers || []).length} manager{(companyDetail.managers || []).length === 1 ? '' : 's'}, and {(companyDetail.deliveries || []).length} recorded deliver{(companyDetail.deliveries || []).length === 1 ? 'y' : 'ies'}.</p>
              </div>
            )}

            {companyDetailTab === 'managers' && (
              <div>
                {canManageDeliveryCompanies && (
                  <div className="delivery-company-create-row">
                    <div><h4>Create Company Manager</h4><p>Temporary password 12345678 is copied after creation and must be changed on first login.</p></div>
                    <input className="form-input" placeholder="Manager name" value={companyManagerForm.name} onChange={e => setCompanyManagerForm(prev => ({ ...prev, name: e.target.value }))} />
                    <input className="form-input" placeholder="Phone number" value={companyManagerForm.phone} onChange={e => setCompanyManagerForm(prev => ({ ...prev, phone: e.target.value }))} />
                    <button className="btn btn-primary btn-sm" type="button" disabled={companyDetailBusy} onClick={createCompanyManager}>Create Manager</button>
                  </div>
                )}
                <div className="delivery-company-list">
                  {(companyDetail.managers || []).length === 0 ? <p>No company managers yet.</p> : null}
                  {(companyDetail.managers || []).map(manager => (
                    <div className="delivery-company-person-row" key={manager.id}>
                      <div><strong>{manager.name}</strong><span>{manager.phone} | {manager.is_active ? 'Active' : 'Inactive'}{manager.must_change_password ? ' | Password change required' : ''} | Terms {manager.terms?.accepted ? `accepted ${manager.terms.accepted_at ? new Date(manager.terms.accepted_at).toLocaleString() : ''}` : 'pending'}</span></div>
                      {canManageDeliveryCompanies && <button className="btn btn-outline-navy btn-sm" type="button" disabled={companyDetailBusy} onClick={() => resetCompanyManagerPassword(manager.id)}>Reset to 12345678</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {companyDetailTab === 'riders' && (
              <div className="delivery-company-list">
                {(companyDetail.riders || []).length === 0 ? <p>Riders are created by the company manager in the company portal.</p> : null}
                {(companyDetail.riders || []).map(rider => (
                  <button className="delivery-company-rider-row" type="button" key={rider.id} onClick={() => openCompanyRiderDetail(rider)}>
                    <span><strong>{rider.name}</strong><small>{rider.phone} | {rider.is_active ? 'Active' : 'Inactive'} | Terms {rider.terms?.accepted ? 'accepted' : 'pending'}</small></span>
                    <span>{rider.active_deliveries || 0} active</span>
                    <span>{rider.completed_deliveries || 0} delivered</span>
                    <Icon name="chevR" size={16} />
                  </button>
                ))}
              </div>
            )}

            {companyDetailTab === 'deliveries' && (
              <div className="delivery-company-deliveries">
                {(companyDetail.deliveries || []).length === 0 ? <p>No delivery history yet.</p> : null}
                {(companyDetail.deliveries || []).map(delivery => (
                  <div key={delivery.id}>
                    <span><strong>{delivery.order_reference}</strong><small>{delivery.customer_name || 'Customer'}</small></span>
                    <span>{delivery.rider_name || 'Unassigned'}</span>
                    <span>{statusLabel(delivery.status)}</span>
                    <span>{delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString() : delivery.picked_up_at ? `Picked up ${new Date(delivery.picked_up_at).toLocaleString()}` : '-'}</span>
                  </div>
                ))}
              </div>
            )}

            {companyRiderDetail && (
              <section className="delivery-company-rider-detail">
                <div className="delivery-company-rider-detail-head">
                  <div><span>Rider Details</span><h4>{companyRiderDetail.rider?.name}</h4><p>{companyRiderDetail.rider?.phone} | {companyRiderDetail.rider?.is_active ? 'Active' : 'Inactive'} | Terms {companyRiderDetail.rider?.terms?.accepted ? `accepted (${companyRiderDetail.rider.terms.version})${companyRiderDetail.rider.terms.accepted_at ? ` on ${new Date(companyRiderDetail.rider.terms.accepted_at).toLocaleString()}` : ''}` : 'pending'}</p></div>
                  <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setCompanyRiderDetail(null)}>Back to Riders</button>
                </div>
                {companyRiderDetailBusy ? <p>Loading rider history...</p> : (
                  <div className="delivery-company-deliveries">
                    {(companyRiderDetail.deliveries || []).length === 0 ? <p>No deliveries have been assigned to this rider.</p> : null}
                    {(companyRiderDetail.deliveries || []).map(delivery => (
                      <div key={delivery.id}>
                        <span><strong>{delivery.order_reference}</strong><small>{delivery.customer_name || 'Customer'}</small></span>
                        <span>{statusLabel(delivery.status)}</span>
                        <span>{delivery.delivery_location || '-'}</span>
                        <span>{delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString() : delivery.updated_at ? new Date(delivery.updated_at).toLocaleString() : '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {deliveryAssign && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-label="Assign order to delivery company" style={{ position:'relative', background:'#fff', borderRadius:12, padding:32, width:'100%', maxWidth:480, boxShadow:'0 12px 48px rgba(0,0,0,0.2)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setDeliveryAssign(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:8 }}>{deliveryAssign.delivery?.company_id ? 'Reassign Delivery Company' : 'Assign Delivery'}</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:20 }}>
              Order: <strong>{deliveryAssign.order_reference}</strong> for {deliveryAssign.customer_name}
            </p>
            {deliveryAssign.delivery?.status === 'rejected_by_company' && (
              <p className="form-error" style={{ marginBottom:12 }}>
                The previous delivery company rejected this order. Assign it to another company for staff action.
              </p>
            )}
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">Delivery Company</label>
              <select className="form-select" value={deliveryAssignCompany} onChange={e => setDeliveryAssignCompany(e.target.value)}>
                <option value="">Choose company</option>
                {activeDeliveryCompanies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Delivery company payable (GHS)</label><input className="form-input" type="number" min="0" step="0.01" value={deliveryPayable} onChange={event => setDeliveryPayable(event.target.value)} /></div>
              <div className="form-group"><label className="form-label">Promotion payer</label><select className="form-select" value={deliveryPromotionPayer} onChange={event => setDeliveryPromotionPayer(event.target.value)}><option value="none">None</option><option value="realmindx">RealMindX</option><option value="delivery_company">Delivery company</option><option value="shared">Shared</option></select></div>
            </div>
            <div className="form-group"><label className="form-label">Promotion amount (GHS)</label><input className="form-input" type="number" min="0" step="0.01" value={deliveryPromotionAmount} onChange={event => setDeliveryPromotionAmount(event.target.value)} /></div>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">Assignment Note</label>
              <textarea className="form-textarea" rows={3} value={deliveryAssignNote}
                onChange={e => setDeliveryAssignNote(e.target.value)}
                placeholder="Optional note for dispatch context." />
            </div>
            {deliveryAssignError && <p style={{ color:'var(--danger)', fontSize:'0.8rem', marginBottom:12 }}>{deliveryAssignError}</p>}
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" disabled={deliveryAssignBusy} onClick={submitDeliveryAssign}>
                {deliveryAssignBusy ? 'Saving...' : deliveryAssign.delivery?.company_id ? 'Reassign Company' : 'Assign Company'}
              </button>
              <button className="btn btn-outline-navy" onClick={() => setDeliveryAssign(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deliveryDetail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:520, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div className={`admin-delivery-detail-modal tone-${deliveryDetail.delivery?.status === 'delivered' ? 'complete' : ['cancelled', 'failed', 'returned', 'rejected_by_company'].includes(deliveryDetail.delivery?.status) ? 'problem' : deliveryDetail.delivery?.status === 'picked_up' ? 'progress' : 'attention'}`} role="dialog" aria-modal="true" aria-label="Delivery details">
            <button className="admin-modal-close" type="button" onClick={() => setDeliveryDetail(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:8 }}>Delivery Details</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:16 }}>
              Order: <strong>{deliveryDetail.order?.order_reference}</strong> for {deliveryDetail.order?.customer_name}
            </p>
            {deliveryDetailError ? <p className="form-error">{deliveryDetailError}</p> : null}
            {deliveryDetail.contact_warning ? <p className="form-error">{deliveryDetail.contact_warning}</p> : null}
            {deliveryDetail.delivery ? (
              <>
                <div className="admin-detail-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:18 }}>
                  {[
                    ['Company', deliveryDetail.delivery.company_name || 'Unassigned'],
                    ['Rider', deliveryDetail.delivery.rider_name || 'Unassigned'],
                    ['Delivery Status', statusLabel(deliveryDetail.delivery.status)],
                    ['OTP Status', deliveryDetail.delivery.otp?.blocked ? 'Blocked' : statusLabel(deliveryDetail.delivery.otp?.status || 'not_generated')],
                    ['Picked Up', deliveryDetail.delivery.picked_up_at ? new Date(deliveryDetail.delivery.picked_up_at).toLocaleString() : '-'],
                    ['Delivered', deliveryDetail.delivery.delivered_at ? new Date(deliveryDetail.delivery.delivered_at).toLocaleString() : '-'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border:'1px solid var(--border-light,#e2e8f0)', borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ fontSize:'0.7rem', color:'var(--gray-600)', fontWeight:800, textTransform:'uppercase' }}>{label}</div>
                      <div style={{ color:'var(--navy)', fontWeight:700, marginTop:3 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:18 }}>
                  {canAssignDelivery && !['delivered', 'cancelled', 'returned'].includes(deliveryDetail.delivery.status) && (
                    <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => {
                      const row = items.find(item => String(getItemId(item)) === String(deliveryDetail.order?.id));
                      if (row) { setDeliveryDetail(null); openDeliveryAssign(row); }
                      else setDeliveryDetailError('The order list changed. Close this window and open Delivery Details again.');
                    }} title="Choose a different delivery company while preserving the delivery audit trail">Reassign Company</button>
                  )}
                  {canAssignDelivery && deliveryDetail.delivery.status === 'picked_up' && (
                    <button className="btn btn-outline-navy btn-sm" type="button" disabled={deliveryDetailBusy} onClick={resendDeliveryOtp}>Resend OTP</button>
                  )}
                </div>
                {canAssignDelivery && !['delivered', 'cancelled', 'returned'].includes(deliveryDetail.delivery.status) && (
                  <div className="admin-delivery-cancel-row">
                    <input className="form-input" value={deliveryCancelReason} onChange={event => setDeliveryCancelReason(event.target.value)} placeholder="Required cancellation reason" />
                    <button className="btn btn-outline-navy btn-sm" type="button" disabled={deliveryDetailBusy} onClick={cancelExternalDelivery}>Cancel Delivery Assignment</button>
                  </div>
                )}
                {canOverrideOtp && ['picked_up', 'issue_reported'].includes(deliveryDetail.delivery.status) && (
                  <div style={{ border:'1px solid var(--border-light,#e2e8f0)', borderRadius:10, padding:14, marginBottom:18 }}>
                    <h4 style={{ margin:'0 0 10px', color:'var(--navy)' }}>OTP Override</h4>
                    <div className="form-group" style={{ marginBottom:10 }}>
                      <label className="form-label">Reason</label>
                      <select className="form-select" value={otpOverrideReason} onChange={e => setOtpOverrideReason(e.target.value)}>
                        <option value="">Choose reason</option>
                        {OTP_OVERRIDE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom:10 }}>
                      <label className="form-label">Note</label>
                      <textarea className="form-textarea" rows={3} value={otpOverrideNote} onChange={e => setOtpOverrideNote(e.target.value)} placeholder="Required context for the audit trail." />
                    </div>
                    <button className="btn btn-primary btn-sm" type="button" disabled={deliveryDetailBusy} onClick={submitOtpOverride}>Record Override</button>
                  </div>
                )}
                <h4 style={{ margin:'0 0 10px', color:'var(--navy)' }}>Audit Trail</h4>
                <div style={{ display:'grid', gap:8 }}>
                  {(deliveryDetail.delivery.events || []).length === 0 ? (
                    <p style={{ color:'var(--gray-600)', margin:0 }}>No delivery events recorded yet.</p>
                  ) : deliveryDetail.delivery.events.map(event => (
                    <div key={event.id} style={{ border:'1px solid var(--border-light,#e2e8f0)', borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                        <strong style={{ color:'var(--navy)' }}>{statusLabel(event.event_type)}</strong>
                        <span style={{ fontSize:'0.78rem', color:'var(--gray-600)' }}>{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span>
                      </div>
                      <div style={{ fontSize:'0.8rem', color:'var(--gray-600)', marginTop:4 }}>
                        Actor: {statusLabel(event.actor_type)}{event.reason ? ` | Reason: ${statusLabel(event.reason)}` : ''}
                      </div>
                      {event.note ? <p style={{ margin:'6px 0 0', color:'var(--gray-700)' }}>{event.note}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptySection title="No Delivery Assigned" body="Assign this order to a delivery company to start delivery tracking." />
            )}
          </div>
        </div>
      )}

      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-label="Confirm permanent deletion" style={{ position:'relative', background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:420, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setConfirmModal(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef2f2', border:'2px solid #fca5a5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:26, color:'#dc2626' }}>⚠</div>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', textAlign:'center', marginBottom:10, fontSize:'1.1rem' }}>
              Permanently delete?
            </h3>
            <p style={{ fontSize:'0.875rem', color:'var(--gray-600)', textAlign:'center', marginBottom:28, lineHeight:1.6 }}>
              <strong style={{ color:'var(--navy)' }}>{labelForRow(confirmModal.row)}</strong> will be removed and cannot be recovered.
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-outline-navy" style={{ flex:1 }} onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, background:'#dc2626', borderColor:'#dc2626' }} onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showMissingImageConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-label="Confirm unpublishing products without images" style={{ position:'relative', background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:460, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setShowMissingImageConfirm(false)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#fff8dc', border:'2px solid var(--yellow)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', color:'var(--navy)' }}>
              <Icon name="image" size={24} />
            </div>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', textAlign:'center', marginBottom:10, fontSize:'1.1rem' }}>
              Unpublish products without images?
            </h3>
            <p style={{ fontSize:'0.875rem', color:'var(--gray-600)', textAlign:'center', marginBottom:28, lineHeight:1.6 }}>
              <strong style={{ color:'var(--navy)' }}>{missingImageStats?.published || 0} published product{missingImageStats?.published === 1 ? '' : 's'}</strong> without a valid uploaded image will be hidden from the bookshop. Nothing will be deleted.
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-outline-navy" style={{ flex:1 }} disabled={bulkUnpublishing} onClick={() => setShowMissingImageConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1 }} disabled={bulkUnpublishing} onClick={executeBulkMissingImageUnpublish}>
                {bulkUnpublishing ? 'Unpublishing...' : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ApplicationsView = ({ content, session }) => (
  <ManagedTableView
    config={{
      title: 'Job Applications',
      description: 'Applications submitted by users from the jobs portal appear here for review.',
      collection: 'applications',
      createLabel: '',
      allowCreate: false,
      allowEdit: false,
      statusOnly: true,
      allowArchive: false,
      statusOptions: ['pending', 'reviewed', 'shortlisted', 'accepted', 'rejected'],
      note: false,
      emptyTitle: 'No Applications Yet',
      emptyBody: 'When users apply for jobs, their submissions will appear here for review, shortlisting, and status updates.',
      fields: [],
      columns: ['name', 'email', 'job', 'status'],
    }}
    rows={content.applications || (isApiMode() ? [] : [
      { id: 1, name: 'Kwame Mensah', email: 'kwame@gmail.com', job: 'Mathematics Teacher (JHS)', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ])}
    session={session}
  />
);

const AlertsView = () => {
  const [alerts, setAlerts] = React.useState([]);
  const [loading, setLoading] = React.useState(isApiMode());
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    setLoading(true);
    api.adminList('job-alerts')
      .then(data => {
        if (alive) {
          setAlerts(data.items || []);
          setError('');
        }
      })
      .catch(err => {
        if (alive) setError(err?.message || 'Could not load job alerts.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const formatWhen = value => {
    if (!value) return 'Not sent yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not sent yet' : date.toLocaleString();
  };

  return (
    <div>
      <h2 className="admin-page-title" style={{ marginBottom: 24 }}>Job Alerts</h2>
      {loading ? (
        <div className="admin-table-card" style={{ padding: 28, color: 'var(--navy)', fontWeight: 800 }}>Loading saved job alerts...</div>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : alerts.length === 0 ? (
        <EmptySection
          title="No Job Alerts to Review Yet"
          body="When users save alert preferences, they will appear here for monitoring. New job posts can then be matched against subject, location, level, and employment type."
        />
      ) : (
        <div className="admin-table-card">
          <AdminTableScroll>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Email</th>
                  <th>Subject</th>
                  <th>Location</th>
                  <th>Level</th>
                  <th>Employment</th>
                  <th>Email Alerts</th>
                  <th>Last Sent</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr key={alert.id}>
                    <td><strong>{alert.teacher_name || 'Teacher'}</strong>{alert.is_default ? <div className="td-muted">Default alert</div> : null}</td>
                    <td>{alert.email}</td>
                    <td>{alert.subject || 'Any subject'}</td>
                    <td>{alert.location || 'Any location'}</td>
                    <td>{alert.preferred_level || 'Any level'}</td>
                    <td>{alert.employment_type || 'Any type'}</td>
                    <td><span className={`badge ${alert.alert_by_email ? 'badge-success' : 'badge-navy'}`}>{alert.alert_by_email ? 'On' : 'Off'}</span></td>
                    <td>{formatWhen(alert.last_sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        </div>
      )}
    </div>
  );
};

// ─── Bulk adjuster widget ─────────────────────────────────────────────────────
const BulkAdjuster = ({ title, description, onApply }) => {
  const [adjType, setAdjType] = React.useState('percentage');
  const [value, setValue] = React.useState('');
  const [direction, setDirection] = React.useState('decrease');
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const apply = async () => {
    const v = parseFloat(value);
    if (!v || v <= 0) { setMsg('Enter a valid value greater than zero.'); return; }
    setSaving(true); setMsg('');
    try {
      const result = await onApply(adjType, v, direction);
      setMsg(result?.message || 'Done.');
      setValue('');
    } catch (err) {
      setMsg(err?.message || 'Failed. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background:'#f5f8fc', borderRadius:12, padding:'20px 24px', marginBottom:24 }}>
      <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:6 }}>{title}</h3>
      <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:16 }}>{description}</p>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div className="form-group" style={{ marginBottom:0, minWidth:130 }}>
          <label className="form-label">Direction</label>
          <select className="form-select" value={direction} onChange={e => setDirection(e.target.value)}>
            <option value="decrease">Decrease / Discount</option>
            <option value="increase">Increase</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0, minWidth:130 }}>
          <label className="form-label">Type</label>
          <select className="form-select" value={adjType} onChange={e => setAdjType(e.target.value)}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (GH₵)</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom:0, minWidth:100 }}>
          <label className="form-label">Value</label>
          <input className="form-input" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder={adjType === 'percentage' ? 'e.g. 10' : 'e.g. 5'} />
        </div>
        <button className="btn btn-primary" style={{ marginBottom:2 }} disabled={saving || !isApiMode()} onClick={apply}>
          {saving ? 'Applying…' : `Apply ${direction === 'decrease' ? 'Discount' : 'Increase'}`}
        </button>
      </div>
      {msg && <p style={{ marginTop:10, fontSize:'0.82rem', color: msg.includes('Done') || msg.includes('Updated') ? 'var(--success)' : 'var(--danger)' }}>{msg}</p>}
      {!isApiMode() && <p style={{ marginTop:8, fontSize:'0.78rem', color:'var(--gray-600)' }}>Connect the Flask backend to use this tool.</p>}
    </div>
  );
};

const PriceAdjustmentView = ({ content, session }) => {
  const [tab, setTab] = React.useState('promo');
  const canEditPriceTools = hasSessionPermission(session, 'priceAdjustment.edit');
  const tabStyle = (t) => ({
    padding: '9px 22px', borderRadius: 8, fontFamily: 'Montserrat,sans-serif',
    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: 'none',
    background: tab === t ? 'var(--navy)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--gray-600)',
    transition: 'all .2s',
  });
  return (
    <div>
      <h2 className="admin-page-title" style={{ marginBottom: 16 }}>Price Adjustment</h2>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 10, padding: 5, marginBottom: 28, width: 'fit-content' }}>
        <button style={tabStyle('promo')} onClick={() => setTab('promo')}>Promo Codes</button>
        <button style={tabStyle('bulk')} onClick={() => setTab('bulk')}>Bulk Adjustments</button>
      </div>

      {tab === 'promo' && (
        <ManagedTableView config={CONFIG['promoCodes']} rows={content[CONFIG['promoCodes'].collection] || []} session={session} />
      )}

      {tab === 'bulk' && (
        <div>
          <p style={{ fontSize:'0.86rem', color:'var(--gray-600)', marginBottom:28 }}>
            Apply a single discount or increase to all product prices or delivery fees at once. Changes are permanent.
          </p>
          {canEditPriceTools ? (
            <>
              <BulkAdjuster
                title="Adjust All Product Prices"
                description="Applies the adjustment to every active product in the bookshop. Useful for a site-wide sale or price correction."
                onApply={(t, v, d) => api.bulkPriceAdjust(t, v, d)}
              />
              <BulkAdjuster
                title="Adjust All Delivery Fees"
                description="Applies the adjustment to every active delivery zone. Zones with zero fee are skipped."
                onApply={(t, v, d) => api.bulkDeliveryAdjust(t, v, d)}
              />
            </>
          ) : (
            <EmptySection
              title="View-only access"
              body="This account can review pricing tools, but bulk adjustments require the price adjustment edit permission."
            />
          )}
          <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:10, padding:'14px 18px', fontSize:'0.82rem', color:'#664d03', marginTop:24 }}>
            <strong>Tip:</strong> To discount a specific product, set its <em>Old Price</em> (original), then lower its <em>Price</em>. The bookshop shows the crossed-out original automatically.
          </div>
        </div>
      )}
    </div>
  );
};

const VerifiedContactValue = ({ value, verified, type }) => {
  const label = `${type} ${verified ? 'verified' : 'not verified'}`;
  return (
    <span className="admin-verified-contact">
      <span>{value || 'N/A'}</span>
      <span
        className={`admin-contact-check ${verified ? 'is-verified' : 'is-unverified'}`}
        title={label}
        aria-label={label}
      >
        {verified ? '✓' : '×'}
      </span>
    </span>
  );
};

const BookshopCustomersView = () => {
  const [customers, setCustomers] = React.useState(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (!isApiMode()) return;
    fetch('/api/admin/bookshop-accounts', { credentials: 'include' })
      .then(response => response.ok ? response.json() : { items: [] })
      .then(data => setCustomers(data.items || []))
      .catch(() => setCustomers([]));
  }, []);

  const ranked = rankByFuzzyMatch(customers || [], search, customer =>
    `${customer.first_name || ''} ${customer.last_name || ''} ${customer.email || ''} ${customer.phone || ''}`
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 className="admin-page-title">Bookshop Customers</h2>
        <p style={{ fontSize:'0.86rem', color:'var(--gray-600)', marginTop:4 }}>
          Customers use the same RealMindX identity as every other service. This view only shows people who have used the bookshop.
        </p>
      </div>
      <div className="admin-table-card">
        <div className="atc-header">
          <h3>{ranked.length} Customer{ranked.length !== 1 ? 's' : ''}</h3>
          <div className="atc-search"><span>Search</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or email" />
          </div>
        </div>
        {!isApiMode() ? (
          <EmptySection title="API mode required" body="Connect the Flask backend to see bookshop customers." />
        ) : customers === null ? (
          <EmptySection title="Loading…" body="" />
        ) : ranked.length === 0 ? (
          <EmptySection title="No Bookshop Customers Yet" body="Customers appear here after registering through or signing into the bookshop." />
        ) : (
          <AdminTableScroll>
            <table className="admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Status</th><th>Registered</th></tr></thead>
              <tbody>
                {ranked.map(customer => (
                  <tr key={customer.id} style={{ opacity: customer.is_active === false ? 0.55 : 1 }}>
                    <td className="td-primary">{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Unknown'}</td>
                    <td><VerifiedContactValue value={customer.email} verified={customer.is_verified} type="Email" /></td>
                    <td><VerifiedContactValue value={customer.phone} verified={customer.phone_verified} type="Phone" /></td>
                    <td>{customer.order_count || 0}</td>
                    <td><span className={`badge ${customer.is_active !== false ? 'badge-success' : 'badge-danger'}`}>{customer.is_active !== false ? 'Active' : 'Disabled'}</span></td>
                    <td style={{ fontSize:'0.76rem', color:'var(--gray-600)', whiteSpace:'nowrap' }}>{customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        )}
      </div>
    </div>
  );
};

const emptyDisplay = value => {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not set';
  return String(value);
};

const yesNo = value => value ? 'Yes' : 'No';

const dateDisplay = value => value ? new Date(value).toLocaleDateString() : 'Not set';

const experienceDisplay = value => {
  if (value === null || value === undefined || value === '') return 'Not set';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric === 0) return 'Less than 1 year';
  if (numeric <= 2) return '1 - 2 years';
  if (numeric <= 5) return '3 - 5 years';
  if (numeric <= 10) return '6 - 10 years';
  if (numeric <= 15) return '11 - 15 years';
  if (numeric <= 20) return '16 - 20 years';
  return 'More than 20 years';
};

const DetailField = ({ label, value, wide = false }) => (
  <div className={`teacher-detail-field${wide ? ' is-wide' : ''}`}>
    <div>{label}</div>
    <span>{React.isValidElement(value) ? value : emptyDisplay(value)}</span>
  </div>
);

const DetailSection = ({ title, children }) => (
  <section className="teacher-detail-section">
    <h4>{title}</h4>
    {children}
  </section>
);

const TeachersView = ({ session }) => {
  const [teachers, setTeachers] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [detail, setDetail] = React.useState(null); // full profile object for the modal
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [toggling, setToggling] = React.useState(null); // user id currently being toggled
  const emptyPayoutForm = React.useMemo(() => ({
    payout_method: '',
    payout_momo_network: '',
    payout_momo_number: '',
    payout_bank_name: '',
    payout_bank_account_name: '',
    payout_bank_account_number: '',
    payout_notes: '',
  }), []);
  const [payoutForm, setPayoutForm] = React.useState(emptyPayoutForm);
  const [payoutSaving, setPayoutSaving] = React.useState(false);
  const [payoutError, setPayoutError] = React.useState('');
  const [deleting, setDeleting] = React.useState(null);
  const [reminding, setReminding] = React.useState(null);
  const [batchReminding, setBatchReminding] = React.useState(false);
  const [batchReminderConfirm, setBatchReminderConfirm] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState(null);
  const canEditTeachers = hasSessionPermission(session, 'teachers.edit');
  const canDeleteTeachers = hasSessionPermission(session, 'teachers.delete');
  const canExportTeachers = hasSessionPermission(session, 'teachers.export');

  const reload = React.useCallback(() => {
    if (!isApiMode()) return;
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setTeachers(data.items || []))
      .catch(() => setTeachers([]));
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  React.useEffect(() => {
    const payout = detail?.profile?.payout || {};
    setPayoutForm({
      ...emptyPayoutForm,
      ...Object.fromEntries(Object.entries(payout).map(([key, value]) => [key, value || ''])),
    });
    setPayoutError('');
  }, [detail?.id, detail?.profile?.payout, emptyPayoutForm]);

  // Only regular users (role === 'user') — admins/staff are filtered out server-side too,
  // but this guards against any future changes.
  const filtered = (teachers || [])
    .filter(t => t.role === 'user' || !t.role);
  const rankedTeachers = rankByFuzzyMatch(filtered, search, t => `${t.first_name} ${t.last_name} ${t.email} ${t.phone || ''}`);
  const reminderEligibleCount = (teachers || [])
    .filter(t => (t.role === 'user' || !t.role) && ((t.profile_completion ?? 0) < 100 || !t.phone_verified))
    .length;

  const openDetail = async (t) => {
    setDetailLoading(true);
    setDetail({ ...t, _loading: true });
    try {
      const r = await fetch(`/api/admin/users/${t.id}`, { credentials: 'include' });
      const data = r.ok ? await r.json() : t;
      setDetail(data);
    } catch { setDetail(t); }
    finally { setDetailLoading(false); }
  };

  const toggleActive = async (t) => {
    setToggling(t.id);
    try {
      const newStatus = t.is_active ? 'inactive' : 'active';
      await api.adminPatch('users', t.id, { status: newStatus });
      setTeachers(prev => prev.map(u => u.id === t.id ? { ...u, is_active: !t.is_active } : u));
      if (detail && detail.id === t.id) setDetail(d => ({ ...d, is_active: !t.is_active }));
    } catch { /* noop */ }
    finally { setToggling(null); }
  };

  const deleteTeacher = async (t) => {
    setDeleteConfirm({ teacher: t });
  };

  const executeDeleteTeacher = async () => {
    if (!deleteConfirm) return;
    const { teacher: t } = deleteConfirm;
    setDeleteConfirm(null);
    setDeleting(t.id);
    try {
      await api.adminDelete('users', t.id);
      setTeachers(prev => prev.filter(u => u.id !== t.id));
      if (detail?.id === t.id) setDetail(null);
    } catch (err) {
      console.error(err);
      globalToast.error(err?.message || 'Could not delete teacher account.');
    } finally {
      setDeleting(null);
    }
  };

  const sendProfileReminder = async (t) => {
    setReminding(t.id);
    try {
      const result = await api.adminCreate(`users/${t.id}/profile-reminder`, {});
      globalToast.success(result?.message || `Profile reminder sent to ${t.email}.`);
    } catch (err) {
      globalToast.error(err?.message || 'Could not send the profile reminder.');
    } finally {
      setReminding(null);
    }
  };

  const openBatchProfileReminderConfirm = () => {
    if (!reminderEligibleCount) {
      globalToast.info('Every active teacher has a complete profile and verified phone number.');
      return;
    }
    setBatchReminderConfirm(true);
  };

  const sendBatchProfileReminders = async () => {
    setBatchReminderConfirm(false);
    setBatchReminding(true);
    try {
      const result = await api.adminCreate('users/profile-reminders', {});
      const failed = Number(result?.failed_count || 0);
      if (failed > 0) {
        globalToast.warning(result?.message || `Reminders sent, but ${failed} could not be delivered.`);
      } else {
        globalToast.success(result?.message || 'Profile reminders sent.');
      }
    } catch (err) {
      globalToast.error(err?.message || 'Could not send batch profile reminders.');
    } finally {
      setBatchReminding(false);
    }
  };

  const updatePayoutField = (fieldName) => (event) => {
    setPayoutForm(form => ({ ...form, [fieldName]: event.target.value }));
  };

  const savePayout = async () => {
    if (!detail?.id) return;
    setPayoutSaving(true);
    setPayoutError('');
    try {
      await api.adminPatch('users', detail.id, { payout: payoutForm });
      setDetail(prev => ({
        ...prev,
        profile: {
          ...(prev?.profile || {}),
          payout: { ...payoutForm },
        },
      }));
    } catch (err) {
      setPayoutError(err?.message || 'Could not save payout details.');
    } finally {
      setPayoutSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:24, flexWrap:'wrap' }}>
        <div>
          <h2 className="admin-page-title">Active Teachers</h2>
          <p style={{ fontSize:'0.86rem', color:'var(--gray-600)', marginTop:4 }}>
            Only enabled teacher accounts with verified email addresses are shown. Admin, staff, unverified, and disabled accounts are excluded.
          </p>
        </div>
        {isApiMode() && canExportTeachers && (
          <div style={{ display:'flex', gap:10 }}>
            <a className="btn btn-outline-navy btn-sm" href={api.adminExportUrl('users','csv')}>Export CSV</a>
            <a className="btn btn-outline-navy btn-sm" href={api.adminExportUrl('users','xlsx')}>Export Excel</a>
          </div>
        )}
      </div>
      <div className="admin-table-card">
        <div className="atc-header teachers-toolbar">
          <h3>{rankedTeachers.length} Teacher{rankedTeachers.length !== 1 ? 's' : ''}</h3>
          <div className="atc-search"><span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" />
          </div>
          {canEditTeachers ? (
            <button
              type="button"
              className="btn btn-outline-navy btn-sm teachers-batch-reminder"
              disabled={batchReminding || reminderEligibleCount === 0}
              onClick={openBatchProfileReminderConfirm}
              title={reminderEligibleCount === 0 ? 'All active teachers have complete profiles and verified phone numbers.' : 'Send one profile reminder email to every teacher who still has profile or phone verification items outstanding.'}
            >
              {batchReminding ? 'Sending reminders…' : `Remind incomplete teachers${reminderEligibleCount ? ` (${reminderEligibleCount})` : ''}`}
            </button>
          ) : null}
        </div>
        {!isApiMode() ? (
          <EmptySection title="API mode required" body="Connect the Flask backend to see registered teachers." />
        ) : teachers === null ? (
          <EmptySection title="Loading…" body="" />
        ) : rankedTeachers.length === 0 ? (
          <EmptySection title="No Active Teachers Yet" body="Teacher accounts appear here after email verification and activation." />
        ) : (
          <AdminTableScroll>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Phone</th>
                  <th>Profile</th><th>Status</th><th>Registered</th><th className="admin-actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rankedTeachers.map(t => (
                  <tr key={t.id} style={{ opacity: t.is_active === false ? 0.55 : 1 }}>
                    <td className="td-primary">{[t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unknown'}</td>
                    <td><VerifiedContactValue value={t.email} verified={t.is_verified} type="Email" /></td>
                    <td><VerifiedContactValue value={t.phone} verified={t.phone_verified} type="Phone" /></td>
                    <td><span className={`badge ${t.profile_completion === 100 ? 'badge-success' : 'badge-navy'}`}>{t.profile_completion ?? 0}%</span></td>
                    <td>
                      <span className={`badge ${t.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                        {t.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ fontSize:'0.76rem', color:'var(--gray-600)', whiteSpace:'nowrap' }}>
                      {t.created_at ? new Date(t.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="admin-actions-column">
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button className="table-action-btn" onClick={() => openDetail(t)}>View Profile</button>
                        {canEditTeachers ? (
                          <button
                            className="table-action-btn"
                            style={{ background: t.is_active !== false ? '#fff8e1' : '#f0fdf4', color: t.is_active !== false ? '#92400e' : '#166534' }}
                            disabled={toggling === t.id}
                            onClick={() => toggleActive(t)}
                          >
                            {toggling === t.id ? '…' : t.is_active !== false ? 'Disable' : 'Enable'}
                          </button>
                        ) : null}
                        {canEditTeachers && ((t.profile_completion ?? 0) < 100 || !t.phone_verified) ? (
                          <button
                            className="table-action-btn"
                            style={{ background:'#e8f1ff', color:'var(--navy)' }}
                            disabled={reminding === t.id || t.is_active === false}
                            onClick={() => sendProfileReminder(t)}
                            title={t.is_active === false ? 'Enable this account before sending a reminder' : `Missing: ${[...(t.profile_missing_fields || []), ...(!t.phone_verified ? ['Verify your phone number'] : [])].join(', ')}`}
                          >
                            {reminding === t.id ? 'Sending…' : 'Send Profile Reminder'}
                          </button>
                        ) : null}
                        {canDeleteTeachers ? (
                          <button
                            className="table-action-btn"
                            style={{ background: '#fee2e2', color: '#991b1b' }}
                            disabled={deleting === t.id}
                            onClick={() => deleteTeacher(t)}
                          >
                            {deleting === t.id ? 'Deleting…' : 'Delete'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>
        )}
      </div>

      {batchReminderConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="batch-profile-reminder-title" style={{ position:'relative', background:'#fff', borderRadius:18, padding:'34px 32px 30px', width:'100%', maxWidth:520, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setBatchReminderConfirm(false)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <div style={{ width:58, height:58, borderRadius:'50%', background:'#eff6ff', border:'2px solid #bfdbfe', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', color:'var(--navy)' }}>
              <Icon name="mail" size={24} />
            </div>
            <p style={{ margin:'0 0 8px', textAlign:'center', color:'#b88900', fontWeight:900, letterSpacing:'0.16em', textTransform:'uppercase', fontSize:'0.72rem' }}>
              Profile reminders
            </p>
            <h3 id="batch-profile-reminder-title" style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', textAlign:'center', marginBottom:10, fontSize:'1.2rem' }}>
              Send reminder emails?
            </h3>
            <p style={{ fontSize:'0.9rem', color:'var(--gray-600)', textAlign:'center', marginBottom:18, lineHeight:1.6 }}>
              RealMindX will email <strong style={{ color:'var(--navy)' }}>{reminderEligibleCount}</strong> active teacher{reminderEligibleCount === 1 ? '' : 's'} who still need to complete profile details or verify a phone number.
            </p>
            <div style={{ background:'#f8fafc', border:'1px solid #dbe4f0', borderRadius:14, padding:'14px 16px', marginBottom:24, color:'var(--gray-600)', fontSize:'0.84rem', lineHeight:1.55 }}>
              The email will include the missing profile sections and phone-number verification when it is still outstanding.
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-outline-navy" style={{ flex:1 }} type="button" onClick={() => setBatchReminderConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1 }} type="button" onClick={sendBatchProfileReminders} disabled={batchReminding}>
                {batchReminding ? 'Sending...' : 'Send reminders'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-label="Confirm permanent deletion" style={{ position:'relative', background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:420, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setDeleteConfirm(null)} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef2f2', border:'2px solid #fca5a5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:26, color:'#dc2626' }}>⚠</div>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', textAlign:'center', marginBottom:10, fontSize:'1.1rem' }}>
              Permanently delete?
            </h3>
            <p style={{ fontSize:'0.875rem', color:'var(--gray-600)', textAlign:'center', marginBottom:28, lineHeight:1.6 }}>
              <strong style={{ color:'var(--navy)' }}>{deleteConfirm.teacher.email || 'This teacher account'}</strong> will be removed and cannot be recovered.
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-outline-navy" style={{ flex:1 }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:1, background:'#dc2626', borderColor:'#dc2626' }} onClick={executeDeleteTeacher}>
                {deleting === deleteConfirm.teacher.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher detail modal */}
      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto' }}>
          <div className="teacher-detail-modal" style={{ background:'#fff', borderRadius:16, padding:0, width:'100%', maxWidth:900, boxShadow:'0 24px 72px rgba(0,0,0,0.28)', overflow:'hidden' }}>
            {/* Modal header */}
            <div style={{ background:'var(--navy)', padding:'24px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                {detail.profile_picture_url ? (
                  <img src={detail.profile_picture_url} alt="" style={{ width:76, height:76, borderRadius:'50%', objectFit:'cover', border:'3px solid rgba(255,255,255,0.35)' }} />
                ) : (
                  <div style={{ width:76, height:76, borderRadius:'50%', background:'var(--yellow)', color:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:22 }}>
                    {([detail.first_name?.[0], detail.last_name?.[0]].filter(Boolean).join('').toUpperCase()) || 'T'}
                  </div>
                )}
                <div>
                  <div style={{ fontFamily:"'Montserrat',sans-serif", fontWeight:800, color:'#fff', fontSize:'1.05rem' }}>
                    {[detail.first_name, detail.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </div>
                  <div style={{ fontSize:'0.82rem', color:'rgba(255,255,255,0.7)', marginTop:2 }}>{detail.email}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span className={`badge ${detail.is_active !== false ? 'badge-success' : 'badge-danger'}`} style={{ fontSize:'0.72rem' }}>
                  {detail.is_active !== false ? 'Active' : 'Disabled'}
                </span>
                <button onClick={() => setDetail(null)} aria-label="Close teacher details" style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.4)', color:'#fff', width:34, height:34, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding:'24px 28px' }}>
              {detailLoading ? (
                <p style={{ color:'var(--gray-600)', textAlign:'center', padding:'20px 0' }}>Loading profile…</p>
              ) : (
                <>
                  <DetailSection title="Account Snapshot">
                    <div className="teacher-detail-grid">
                      <DetailField label="Full Name" value={[detail.first_name, detail.last_name].filter(Boolean).join(' ')} />
                      <DetailField label="Email" value={<VerifiedContactValue value={detail.email} verified={detail.is_verified} type="Email" />} />
                      <DetailField label="Phone" value={<VerifiedContactValue value={detail.phone} verified={detail.phone_verified} type="Phone" />} />
                      <DetailField label="Status" value={detail.is_active !== false ? 'Active' : 'Disabled'} />
                      <DetailField label="Registered" value={dateDisplay(detail.created_at)} />
                      <DetailField label="Last Login" value={dateDisplay(detail.last_login_at)} />
                      <DetailField label="Email Verified" value={yesNo(detail.is_verified)} />
                      <DetailField label="Phone Verified" value={yesNo(detail.phone_verified)} />
                      <DetailField label="Sex" value={detail.sex} />
                      <DetailField label="Age Range" value={detail.age_range} />
                      <DetailField label="Two-step Login" value={detail.two_factor_enabled ? 'Enabled' : 'Off'} />
                      <DetailField label="Services" value={[
                        detail.teacher_service_enabled ? 'Teacher' : null,
                        detail.bookshop_service_enabled ? 'Bookshop' : null,
                      ].filter(Boolean).join(', ')} />
                      <DetailField label="Profile Completion" value={`${detail.profile_completion ?? 0}%`} />
                      <DetailField label="Missing Profile Fields" value={(detail.profile_missing_fields || []).join(', ')} wide />
                    </div>
                  </DetailSection>

                  {/* Profile details */}
                  {detail.profile && (
                    <>
                      <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>Teaching Profile</h4>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', marginBottom:20 }}>
                        {[
                          ['Subject', detail.profile.teaching_subject],
                          ['Level', detail.profile.preferred_level],
                          ['Employment Type', detail.profile.preferred_employment_type],
                          ['Available From', detail.profile.available_from],
                          ['Location', detail.profile.location],
                          ['Preferred Locations', detail.profile.preferred_locations],
                          ['Curriculum Experience', detail.profile.curriculum_experience],
                          ['Teaching Experience', detail.profile.years_of_experience !== null && detail.profile.years_of_experience !== undefined ? (() => { const v = detail.profile.years_of_experience; if (v === 0) return 'Less than 1 year'; if (v <= 2) return '1 – 2 years'; if (v <= 5) return '3 – 5 years'; if (v <= 10) return '6 – 10 years'; if (v <= 15) return '11 – 15 years'; if (v <= 20) return '16 – 20 years'; return 'More than 20 years'; })() : null],
                          ['Age', detail.profile.age != null ? `${detail.profile.age} years old` : null],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--gray-500)', marginBottom:2 }}>{k}</div>
                            <div style={{ fontSize:'0.875rem', color:'var(--navy)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {detail.profile.bio && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--gray-500)', marginBottom:6 }}>Bio</div>
                          <p style={{ fontSize:'0.875rem', color:'var(--navy)', lineHeight:1.6, margin:0 }}>{detail.profile.bio}</p>
                        </div>
                      )}
                      {/* Documents */}
                      {(detail.profile.cv_url || detail.profile.certificate_url) && (
                        <div style={{ marginBottom:20 }}>
                          <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>Documents</h4>
                          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                            {detail.profile.cv_url && (
                              <a href={detail.profile.cv_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-navy btn-sm">📄 View CV</a>
                            )}
                            {detail.profile.certificate_url && (
                              <a href={detail.profile.certificate_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-navy btn-sm">🎓 View Certificate</a>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Next of kin */}
                      {(detail.profile.next_of_kin_name || detail.profile.next_of_kin_phone || detail.profile.next_of_kin_relationship || detail.profile.next_of_kin_email) && (
                        <div style={{ marginBottom:20 }}>
                          <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>Next of Kin</h4>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                            {[['Name', detail.profile.next_of_kin_name], ['Phone', detail.profile.next_of_kin_phone], ['Relationship', detail.profile.next_of_kin_relationship], ['Email', detail.profile.next_of_kin_email]].filter(([, v]) => v).map(([k, v]) => (
                              <div key={k}>
                                <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--gray-500)', marginBottom:2 }}>{k}</div>
                                <div style={{ fontSize:'0.875rem', color:'var(--navy)' }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {!detail.profile && <p style={{ color:'var(--gray-600)', fontSize:'0.85rem' }}>No additional profile information submitted yet.</p>}

                  <DetailSection title="Saved Placement Preferences">
                    {(detail.job_alert_preferences || []).length === 0 ? (
                      <p className="teacher-detail-empty">No saved placement or job-alert preferences yet.</p>
                    ) : (
                      <div className="teacher-detail-card-grid">
                        {(detail.job_alert_preferences || []).map(preference => (
                          <div className="teacher-detail-mini-card" key={preference.id}>
                            <div className="teacher-detail-mini-title">
                              {preference.is_default ? 'Default Preferences' : `Preference #${preference.id}`}
                              <span className={`badge ${preference.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{preference.status}</span>
                            </div>
                            <div className="teacher-detail-grid is-compact">
                              <DetailField label="Subjects" value={preference.subject} />
                              <DetailField label="Locations" value={preference.location} />
                              <DetailField label="Location IDs" value={preference.location_ids} />
                              <DetailField label="Levels" value={preference.preferred_level} />
                              <DetailField label="Curriculum" value={preference.curriculum} />
                              <DetailField label="Employment Type" value={preference.employment_type} />
                              <DetailField label="Frequency" value={preference.frequency} />
                              <DetailField label="Email Alerts" value={yesNo(preference.alert_by_email)} />
                              <DetailField label="Last Sent" value={dateDisplay(preference.last_sent_at)} />
                              <DetailField label="Updated" value={dateDisplay(preference.updated_at)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>

                  <DetailSection title="Job Applications">
                    {(detail.applications || []).length === 0 ? (
                      <p className="teacher-detail-empty">No job applications submitted yet.</p>
                    ) : (
                      <div className="teacher-detail-card-grid">
                        {(detail.applications || []).map(application => (
                          <div className="teacher-detail-mini-card" key={application.id}>
                            <div className="teacher-detail-mini-title">
                              {application.job_title || 'Job application'}
                              <span className="badge badge-navy">{application.status}</span>
                            </div>
                            <div className="teacher-detail-grid is-compact">
                              <DetailField label="School / Organisation" value={application.organisation} />
                              <DetailField label="Location" value={application.location} />
                              <DetailField label="Subject" value={application.subject} />
                              <DetailField label="Level" value={application.level} />
                              <DetailField label="Employment Type" value={application.employment_type} />
                              <DetailField label="Applied" value={dateDisplay(application.created_at)} />
                              <DetailField label="Updated" value={dateDisplay(application.updated_at)} />
                              <DetailField label="Cover Note" value={application.cover_note} wide />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>

                  <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--border)' }}>
                    <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>Payout Details</h4>
                    {canEditTeachers ? (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 14px' }}>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Method</label>
                            <select className="form-select" value={payoutForm.payout_method} onChange={updatePayoutField('payout_method')}>
                              <option value="">Not set</option>
                              <option value="momo">Mobile Money</option>
                              <option value="bank">Bank Account</option>
                              <option value="cash">Cash / Manual</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">MoMo Network</label>
                            <input className="form-input" value={payoutForm.payout_momo_network} onChange={updatePayoutField('payout_momo_network')} placeholder="MTN, Telecel, AT" />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">MoMo Number</label>
                            <input className="form-input" value={payoutForm.payout_momo_number} onChange={updatePayoutField('payout_momo_number')} placeholder="024..." />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Bank Name</label>
                            <input className="form-input" value={payoutForm.payout_bank_name} onChange={updatePayoutField('payout_bank_name')} placeholder="Bank name" />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Account Name</label>
                            <input className="form-input" value={payoutForm.payout_bank_account_name} onChange={updatePayoutField('payout_bank_account_name')} placeholder="Account holder" />
                          </div>
                          <div className="form-group" style={{ margin:0 }}>
                            <label className="form-label">Account Number</label>
                            <input className="form-input" value={payoutForm.payout_bank_account_number} onChange={updatePayoutField('payout_bank_account_number')} placeholder="Account number" />
                          </div>
                        </div>
                        <div className="form-group" style={{ margin:'12px 0 0' }}>
                          <label className="form-label">Payout Notes</label>
                          <textarea className="form-textarea" rows={3} value={payoutForm.payout_notes} onChange={updatePayoutField('payout_notes')} placeholder="Manual payment notes, verification notes, or payout preferences." />
                        </div>
                        {payoutError && <p style={{ color:'var(--danger)', fontSize:'0.8rem', margin:'8px 0 0' }}>{payoutError}</p>}
                        <button className="btn btn-outline-navy btn-sm" style={{ marginTop:12 }} type="button" disabled={payoutSaving} onClick={savePayout}>
                          {payoutSaving ? 'Saving...' : 'Save Payout Details'}
                        </button>
                      </>
                    ) : (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                        {[
                          ['Method', detail.profile?.payout?.payout_method],
                          ['MoMo Network', detail.profile?.payout?.payout_momo_network],
                          ['MoMo Number', detail.profile?.payout?.payout_momo_number],
                          ['Bank', detail.profile?.payout?.payout_bank_name],
                          ['Account Name', detail.profile?.payout?.payout_bank_account_name],
                          ['Account Number', detail.profile?.payout?.payout_bank_account_number],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--gray-500)', marginBottom:2 }}>{k}</div>
                            <div style={{ fontSize:'0.875rem', color:'var(--navy)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--border)' }}>
                    <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>School Placements</h4>
                    {(detail.placements || []).length === 0 ? (
                      <p style={{ color:'var(--gray-600)', fontSize:'0.85rem', margin:0 }}>No school placements recorded yet.</p>
                    ) : (
                      <div style={{ display:'grid', gap:10 }}>
                        {(detail.placements || []).map(placement => (
                          <div key={placement.id} style={{ border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', background:'#f8fafc' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                              <strong style={{ color:'var(--navy)', fontSize:'0.9rem' }}>{placement.school_name}</strong>
                              <span className="badge badge-success">{placement.status}</span>
                            </div>
                            <div style={{ color:'var(--gray-600)', fontSize:'0.8rem', marginTop:4 }}>{placement.job_title || 'Teaching placement'}</div>
                            {placement.accepted_at && (
                              <div style={{ color:'var(--gray-500)', fontSize:'0.74rem', marginTop:6 }}>Accepted {new Date(placement.accepted_at).toLocaleDateString()}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding:'16px 28px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap' }}>
              {canDeleteTeachers ? (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={deleting === detail.id}
                  onClick={() => deleteTeacher(detail)}
                >
                  {deleting === detail.id ? 'Deleting…' : 'Delete Account'}
                </button>
              ) : null}
              {canEditTeachers ? (
                <button
                  className="btn btn-outline-navy btn-sm"
                  style={detail.is_active !== false ? { color:'#92400e', borderColor:'#d97706' } : { color:'#166534', borderColor:'#16a34a' }}
                  disabled={toggling === detail.id}
                  onClick={() => toggleActive(detail)}
                >
                  {toggling === detail.id ? 'Saving…' : detail.is_active !== false ? 'Disable Account' : 'Enable Account'}
                </button>
              ) : null}
              <button className="btn btn-outline-navy btn-sm" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const buildInternalSession = (user, fallbackLabel = 'Admin') => {
  const role = user?.role?.name || user?.role || 'admin';
  return {
    role,
    email: user.email,
    firstName: user.first_name || user.firstName || (role === 'staff' ? 'Staff' : fallbackLabel),
    lastName: user.last_name || user.lastName || '',
    initials: user.initials || `${user.first_name?.[0] || (role === 'staff' ? 'S' : 'A')}${user.last_name?.[0] || (role === 'staff' ? 'T' : 'D')}`.toUpperCase(),
    permissions: user.permissions || [],
    directPermissions: user.direct_permissions || [],
    mustChangePassword: Boolean(user.must_change_password ?? user.mustChangePassword),
  };
};

const AccountView = ({ session, onPasswordChanged }) => {
  const [form, setForm] = React.useState({ current_password: '', new_password: '', confirm_password: '' });
  const [status, setStatus] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setStatus(null);
    if (form.new_password !== form.confirm_password) {
      setStatus({ error: 'New passwords do not match.' });
      return;
    }
    if (form.new_password.length < 8) {
      setStatus({ error: 'New password must be at least 8 characters.' });
      return;
    }
    setSaving(true);
    try {
      const data = await api.changePassword({ current_password: form.current_password, new_password: form.new_password });
      setStatus({ success: data.message || 'Password updated successfully.' });
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      onPasswordChanged?.();
    } catch (err) {
      setStatus({ error: err?.message || 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '32px 28px' }}>
      <div className="admin-table-card" style={{ maxWidth: 520, padding: '32px 36px' }}>
        <h3 style={{ margin: '0 0 4px' }}>My Account</h3>
        <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', margin: '0 0 28px' }}>
          Signed in as <strong>{session?.firstName} {session?.lastName}</strong>{session?.email ? ` (${session.email})` : ''}
        </p>
        <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700 }}>Change Password</h4>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>
            Current Password
            <PasswordRevealInput name="current_password" value={form.current_password} onChange={handleChange} autoComplete="current-password" required style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>
            New Password
            <PasswordRevealInput name="new_password" value={form.new_password} onChange={handleChange} autoComplete="new-password" required minLength={8} style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>
            Confirm New Password
            <PasswordRevealInput name="confirm_password" value={form.confirm_password} onChange={handleChange} autoComplete="new-password" required style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
          </label>
          {status?.error && <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: 0 }}>{status.error}</p>}
          {status?.success && <p style={{ color: '#1a7f4a', fontSize: '0.85rem', margin: 0 }}>{status.success}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ForcedPasswordChangeModal = ({ session, loginPath, onPasswordChanged }) => {
  const [form, setForm] = React.useState({ current_password: '', new_password: '', confirm_password: '' });
  const [status, setStatus] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const isStaff = session?.role === 'staff';

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setStatus(null);
    if (form.new_password !== form.confirm_password) {
      setStatus({ error: 'New passwords do not match.' });
      return;
    }
    if (form.new_password.length < 8) {
      setStatus({ error: 'New password must be at least 8 characters.' });
      return;
    }
    setSaving(true);
    try {
      const data = await api.changePassword({ current_password: form.current_password, new_password: form.new_password });
      setStatus({ success: data.message || 'Password updated successfully.' });
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      onPasswordChanged?.();
    } catch (err) {
      setStatus({ error: err?.message || 'Could not update the password right now.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = loginPath;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12, 22, 46, 0.62)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="admin-table-card" style={{ width: '100%', maxWidth: 560, padding: '32px 32px 28px', borderRadius: 20, boxShadow: '0 28px 80px rgba(9, 20, 43, 0.24)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <div>
            <span className="auth-badge" style={{ display: 'inline-flex', marginBottom: 12 }}>{isStaff ? 'Staff Password Update' : 'Admin Password Update'}</span>
            <h3 style={{ margin: '0 0 8px', color: 'var(--navy)', fontFamily: "'Montserrat', sans-serif" }}>Change your temporary password to continue</h3>
            <p style={{ margin: 0, color: 'var(--gray-600)', fontSize: '0.9rem', lineHeight: 1.7 }}>
              This {isStaff ? 'staff' : 'internal'} account is marked for first-login password rotation. Update the password now before using the portal.
            </p>
          </div>
          <button type="button" className="btn btn-outline-navy btn-sm" onClick={handleSignOut}>Sign out</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)' }}>
            Current Password
            <PasswordRevealInput name="current_password" value={form.current_password} onChange={handleChange} autoComplete="current-password" required />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)' }}>
            New Password
            <PasswordRevealInput name="new_password" value={form.new_password} onChange={handleChange} autoComplete="new-password" minLength={8} required />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)' }}>
            Confirm New Password
            <PasswordRevealInput name="confirm_password" value={form.confirm_password} onChange={handleChange} autoComplete="new-password" required />
          </label>
          {status?.error ? <p style={{ margin: 0, color: '#b42318', fontSize: '0.84rem' }}>{status.error}</p> : null}
          {status?.success ? <p style={{ margin: 0, color: '#027a48', fontSize: '0.84rem' }}>{status.success}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ justifySelf: 'flex-start', marginTop: 4 }}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

const AdminPortalPage = ({ portalRole = 'admin' }) => {
  const { content } = useAdminContent();
  const requiredRole = portalRole === 'staff' ? 'staff' : 'admin';
  const portalLabel = requiredRole === 'staff' ? 'Staff' : 'Admin';
  const loginPath = loginPathForRole(requiredRole);
  const [activeView, setActiveView] = React.useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  const [sessionChecked, setSessionChecked] = React.useState(!isApiMode());
  const isInternalSession = ['admin', 'staff'].includes(session?.role);
  const adminName = isInternalSession ? (session.firstName || portalLabel) : portalLabel;
  const adminInitials = isInternalSession ? (session.initials || (requiredRole === 'staff' ? 'ST' : 'AD')) : (requiredRole === 'staff' ? 'ST' : 'AD');

  const redirectToCorrectPortal = React.useCallback((role) => {
    if (role === 'admin' || role === 'staff') {
      window.location.href = dashboardPathForRole(role);
      return;
    }
    window.location.href = loginPath;
  }, [loginPath]);

  const clearPasswordRotationFlag = React.useCallback(() => {
    if (!session) return;
    const nextSession = { ...session, mustChangePassword: false };
    saveDemoSession(nextSession);
    setSession(nextSession);
  }, [session]);

  const canViewActive = React.useCallback((key, nextSession = session) => {
    const item = NAV.find(entry => entry.key === key);
    return !item || canAccessAdminItem(item, nextSession);
  }, [session]);

  React.useEffect(() => {
    if (!isApiMode()) {
      if (!session || !['admin', 'staff'].includes(session.role)) {
        window.location.href = loginPath;
      } else if (session.role !== requiredRole) {
        window.location.href = dashboardPathForRole(session.role);
      }
      return undefined;
    }

    let cancelled = false;
    api.me()
      .then(({ user }) => {
        if (cancelled) return;
        const role = user?.role?.name || user?.role;
        if (!user || !['admin', 'staff'].includes(role)) {
          clearDemoSession();
          window.location.href = loginPath;
          return;
        }
        const freshSession = buildInternalSession(user, portalLabel);
        saveDemoSession(freshSession);
        if (role !== requiredRole) {
          redirectToCorrectPortal(role);
          return;
        }
        setSession(freshSession);
        setSessionChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearDemoSession();
        window.location.href = loginPath;
      });
    return () => {
      cancelled = true;
    };
  }, [loginPath, portalLabel, redirectToCorrectPortal, requiredRole]);

  React.useEffect(() => {
    if (sessionChecked && !canViewActive(activeView)) {
      setActiveView('dashboard');
    }
  }, [activeView, canViewActive, sessionChecked]);

  React.useEffect(() => {
    const handler = () => {
      const fresh = getDemoSession();
      setSession(fresh);
      if (!fresh || !['admin', 'staff'].includes(fresh.role)) {
        window.location.href = loginPath;
        return;
      }
      if (fresh.role !== requiredRole) {
        redirectToCorrectPortal(fresh.role);
      }
    };
    window.addEventListener('rmx-session-sync', handler);
    return () => window.removeEventListener('rmx-session-sync', handler);
  }, [loginPath, redirectToCorrectPortal, requiredRole]);

  React.useEffect(() => {
    if (isApiMode() || sessionChecked) return;
    if (!session || !['admin', 'staff'].includes(session.role)) {
      window.location.href = loginPath;
      return;
    }
    if (session.role !== requiredRole) {
      window.location.href = dashboardPathForRole(session.role);
    }
  }, [loginPath, requiredRole, session, sessionChecked]);

  if (!sessionChecked) return <AuthLoadingScreen />;

  const view = activeView === 'dashboard'
    ? <DashboardView content={content} setActive={setActiveView} session={session} />
    : activeView === 'analytics'
      ? <AnalyticsView session={session} />
    : activeView === 'receiptsInvoices'
      ? <ReceiptsInvoicesView content={content} />
    : activeView === 'applications'
      ? <ApplicationsView content={content} session={session} />
      : activeView === 'alerts'
        ? <AlertsView />
        : activeView === 'priceAdjustment' || activeView === 'promoCodes' || activeView === 'priceTools'
          ? <PriceAdjustmentView content={content} session={session} />
          : activeView === 'teachers'
          ? <TeachersView session={session} />
          : activeView === 'bookshopCustomers'
          ? <BookshopCustomersView />
          : activeView === 'whatsappDiagnostics'
          ? <WhatsAppDiagnosticsView />
          : activeView === 'account'
          ? <AccountView session={session} onPasswordChanged={clearPasswordRotationFlag} />
          : CONFIG[activeView]
            ? <ManagedTableView config={CONFIG[activeView]} rows={content[CONFIG[activeView].collection] || []} session={session} />
            : null;

  return (
    <div className="admin-portal-layout">
      <AdminSidebar active={activeView} setActive={setActiveView} open={sidebarOpen} setOpen={setSidebarOpen} session={session} portalLabel={portalLabel} />
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {/* Desktop-only back button: visible on non-dashboard views */}
            {activeView !== 'dashboard' && (
              <button
                type="button"
                className="portal-desktop-back-btn"
                onClick={() => setActiveView('dashboard')}
                aria-label="Back to dashboard"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span>Dashboard</span>
              </button>
            )}
            {/* Mobile-only SchoolMS-style back button on subpages; the hamburger
                stays available at the far right of the topbar */}
            {activeView !== 'dashboard' && (
              <button
                onClick={() => setActiveView('dashboard')}
                className="mobile-menu-toggle"
                style={{ display: 'none', background: 'none', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                aria-label="Back to dashboard"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            <h2 className="admin-topbar-title">
              {(NAV.find(n => n.key === activeView) || { label: 'Dashboard' }).label}
            </h2>
          </div>
          <div className="admin-topbar-right">
            {!isApiMode() && (
              <button className="table-action-btn" onClick={resetManagedContent}>Restore Local Demo Data</button>
            )}
            <div className="admin-user-chip">
              <div className="admin-chip-avatar">{adminInitials}</div>
              <span className="admin-chip-name">{adminName}</span>
            </div>
            {/* Mobile-only hamburger at the far right corner; pushes the chip left */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mobile-menu-toggle"
              style={{ display: 'none', background: 'none', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
        {view}
      </main>
      {session?.mustChangePassword ? (
        <ForcedPasswordChangeModal
          session={session}
          loginPath={loginPath}
          onPasswordChanged={clearPasswordRotationFlag}
        />
      ) : null}
      <style>{`
        .admin-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .admin-image-help { color: var(--gray-700); font-size: 0.74rem; line-height: 1.5; margin-top: 8px; max-width: 760px; }
        .admin-image-guide { background: #f0f4fa; border-left: 3px solid var(--navy); border-radius: 0 8px 8px 0; padding: 12px 16px; margin-top: 12px; max-width: 680px; display: flex; flex-direction: column; gap: 8px; }
        .admin-ig-row { display: flex; align-items: flex-start; gap: 9px; font-size: 0.78rem; color: #1a2a40; line-height: 1.55; }
        .admin-ig-icon { flex-shrink: 0; color: var(--navy); margin-top: 1px; opacity: 0.75; }
        .admin-file-upload { border: 1px solid var(--gray-200); border-radius: 10px; padding: 14px; background: #f8fafc; }
        .admin-file-upload-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .admin-file-upload-icon { width: 42px; height: 42px; border-radius: 8px; background: #eaf1fb; color: var(--navy); display: grid; place-items: center; flex: 0 0 auto; }
        .admin-file-upload-copy { flex: 1 1 280px; min-width: 0; display: grid; gap: 3px; }
        .admin-file-upload-copy strong { color: var(--navy); font-size: 0.9rem; overflow-wrap: anywhere; }
        .admin-file-upload-copy a { color: var(--navy); font-size: 0.78rem; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
        .admin-file-upload-copy p { color: var(--gray-600); font-size: 0.76rem; line-height: 1.45; margin: 0; }
        .password-field .form-input { width: 100%; }
        .admin-stat { border: 0; text-align: left; cursor: pointer; }
        .admin-thumb { width: 72px; height: 54px; object-fit: cover; border-radius: 6px; border: 1px solid var(--gray-200); display: block; }
        .td-muted { color: var(--gray-600); font-size: 0.78rem; font-weight: 700; }
        .admin-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 3000;
          background: rgba(1, 17, 38, 0.62);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 28px 18px;
          overflow-y: auto;
        }
        .admin-modal-panel {
          width: min(1040px, 100%);
          position: relative;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 30px 90px rgba(1, 17, 38, 0.32);
        }
        .admin-modal-panel .admin-table-card {
          margin: 0 !important;
          border-radius: 12px;
          box-shadow: none;
        }
        .markdown-service-editor { display: grid; gap: 10px; }
        .markdown-service-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--gray-200);
          border-radius: 10px;
          background: #fbfcfe;
        }
        .markdown-service-select {
          display: grid;
          gap: 6px;
          flex: 1 1 220px;
          min-width: 220px;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--navy);
        }
        .markdown-service-select-control {
          height: 40px;
          min-height: 40px;
          padding: 0 12px;
        }
        .markdown-service-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          min-height: 40px;
          white-space: nowrap;
        }
        .article-section-body-group .markdown-service-editor { margin-top: 8px; }
        .admin-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border: 1px solid var(--gray-200);
          background: #fff;
          color: var(--navy);
          border-radius: 50%;
          padding: 0;
          cursor: pointer;
        }
        .admin-modal-close span { display: none; }
        @media (max-width: 768px) {
          .mobile-menu-toggle { display: flex !important; }
          .admin-form-grid { grid-template-columns: 1fr; }
          .admin-modal-backdrop { padding: 12px; }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalPage;
