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
import { TEACHING_CURRICULA, TEACHING_SUBJECTS } from '../../src/lib/teachingOptions.js';
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
  { key: 'teacherReview', label: 'Teacher Review', group: 'System', icon: 'clipboard' },
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
        : item.key === 'contacts'
          ? ['view', 'create', 'edit', 'email']
        : item.key === 'receiptsInvoices'
          ? ['view']
        : item.key === 'staff'
          ? ['view', 'create', 'edit', 'delete']
          : item.key === 'whatsappDiagnostics' || item.key === 'teacherReview'
            ? ['view']
          : item.key === 'teachers'
            ? ['view', 'edit', 'export', 'account.manage', 'documents.manage', 'verification.manage']
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
  if (item.key === 'teacherReview') return hasSessionPermission(session, 'teachers.view');
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
      field('manager_phone', 'First Manager Phone', 'text', { help: 'Creates portal access with a unique temporary password and requires a first-login password change.' }),
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

const RICH_TEXT_TAGS = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'H4']);
const richTextHtml = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.split(/\n\s*\n/).map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
  }
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  [...doc.body.querySelectorAll('*')].forEach(node => {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT'].includes(node.tagName)) { node.remove(); return; }
    if (!RICH_TEXT_TAGS.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (node.tagName === 'A' && ['href', 'target', 'rel'].includes(name)) return;
      if (name === 'style' && /^text-align:\s*(left|center|right|justify);?$/i.test(attribute.value)) return;
      node.removeAttribute(attribute.name);
    });
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (!/^(https?:|mailto:|tel:|\/|#)/i.test(href)) node.removeAttribute('href');
      else { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    }
  });
  return doc.body.firstElementChild?.innerHTML || '';
};

const RichTextEditor = ({ value, onChange, placeholder = 'Write here…' }) => {
  const { items: services } = usePublicServicesState();
  const editorRef = React.useRef(null);
  const selectionRef = React.useRef(null);
  const [serviceHref, setServiceHref] = React.useState('');
  React.useEffect(() => {
    if (!serviceHref && services.length) setServiceHref(services[0]?.href || '');
  }, [serviceHref, services]);
  React.useEffect(() => {
    const editor = editorRef.current;
    const next = richTextHtml(value);
    if (editor && editor.innerHTML !== next && document.activeElement !== editor) editor.innerHTML = next;
  }, [value]);
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) selectionRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(selectionRef.current);
  };
  const run = (command, argument = null) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, argument);
    onChange(richTextHtml(editorRef.current?.innerHTML || ''));
    rememberSelection();
  };
  const addLink = () => {
    const url = window.prompt('Paste the link URL');
    if (url) run('createLink', url.trim());
  };
  const insertServiceLink = () => {
    const service = services.find(item => item.href === serviceHref) || services[0];
    if (!service) return;
    editorRef.current?.focus(); restoreSelection();
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) document.execCommand('createLink', false, service.href);
    else document.execCommand('insertHTML', false, `<a href="${service.href}">${service.label}</a>`);
    onChange(richTextHtml(editorRef.current?.innerHTML || '')); rememberSelection();
  };
  const button = (label, command, title, argument = null) => (
    <button type="button" className="rich-editor-button" title={title} aria-label={title} onMouseDown={event => event.preventDefault()} onClick={() => run(command, argument)}>{label}</button>
  );
  return <div className="rich-editor">
    <div className="rich-editor-toolbar" role="toolbar" aria-label="Text formatting">
      <select className="rich-editor-format" aria-label="Text style" defaultValue="p" onChange={event => { run('formatBlock', event.target.value); event.target.value = 'p'; }}>
        <option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option>
      </select>
      <span className="rich-editor-divider" />
      {button(<strong>B</strong>, 'bold', 'Bold')}{button(<em>I</em>, 'italic', 'Italic')}{button(<u>U</u>, 'underline', 'Underline')}{button(<s>S</s>, 'strikeThrough', 'Strikethrough')}
      <button type="button" className="rich-editor-button" title="Insert link" aria-label="Insert link" onMouseDown={event => event.preventDefault()} onClick={addLink}>↗</button>
      <button type="button" className="rich-editor-button" title="Remove link" aria-label="Remove link" onMouseDown={event => event.preventDefault()} onClick={() => run('unlink')}>×↗</button>
      <span className="rich-editor-divider" />
      {button('• List', 'insertUnorderedList', 'Bulleted list')}{button('1. List', 'insertOrderedList', 'Numbered list')}
      <span className="rich-editor-divider" />
      {button('≡', 'justifyLeft', 'Align left')}{button('≡', 'justifyCenter', 'Align centre')}{button('≡', 'justifyRight', 'Align right')}{button('☰', 'justifyFull', 'Justify')}
      <span className="rich-editor-divider" />
      {button('↶', 'undo', 'Undo')}{button('↷', 'redo', 'Redo')}{button('Tx', 'removeFormat', 'Clear formatting')}
      {services.length ? <><span className="rich-editor-divider" /><select className="rich-editor-service" aria-label="Service link" value={serviceHref} onChange={event => setServiceHref(event.target.value)}>{services.map(service => <option key={service.href || service.id} value={service.href}>{service.label}</option>)}</select><button type="button" className="rich-editor-service-button" onMouseDown={event => event.preventDefault()} onClick={insertServiceLink}>Insert service link</button></> : null}
    </div>
    <div ref={editorRef} className="rich-editor-content" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={event => { rememberSelection(); onChange(richTextHtml(event.currentTarget.innerHTML)); }} onMouseUp={rememberSelection} onKeyUp={rememberSelection} onFocus={rememberSelection} />
  </div>;
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
        <Icon name={visible ? 'eyeOff' : 'eye'} size={15} />
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
      image_position: 'top',
      image_size: 'medium',
      image_file_id: '',
      image_url: '',
    }]);
  };
  const removeSection = index => {
    onChange(safeSections.filter((_, currentIndex) => currentIndex !== index));
  };
  const insertAfter = index => {
    const blank = { heading: '', body: '', caption: '', image_position: 'top', image_size: 'medium', image_file_id: '', image_url: '' };
    const next = safeSections.slice();
    next.splice(index + 1, 0, blank);
    onChange(next);
  };
  const moveSection = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= safeSections.length) return;
    const next = safeSections.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="article-sections-field">
      {safeSections.map((section, index) => (
        <React.Fragment key={`section-${index}`}>
        <section className="article-section-editor">
          <div className="article-section-editor-head">
            <div className="article-section-editor-head-left">
              <span className="article-section-move-buttons">
                <button type="button" className="article-section-move-btn" disabled={index === 0} onClick={() => moveSection(index, -1)} aria-label="Move section up">&#9650;</button>
                <button type="button" className="article-section-move-btn" disabled={index === safeSections.length - 1} onClick={() => moveSection(index, 1)} aria-label="Move section down">&#9660;</button>
              </span>
              <strong>Section {index + 1}</strong>
            </div>
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
            <div className="form-group article-section-image-group" style={{ gridColumn: '1 / -1' }}>
              <span className="form-label">Section Image</span>
              <ImageUploadField
                fieldName={`section_image_${index}`}
                currentFileId={section.image_file_id || ''}
                currentUrl={section.image_url || ''}
                aspectRatio={16/9}
                cropTitle="Crop Article Section Image (16:9)"
                guide={[
                  { icon: 'target',   text: 'Default ratio: 16:9. Unlock the ratio in the cropper when the source image needs a different shape.' },
                  { icon: 'image',    text: 'Drag the crop box, its edges, or its corners to choose the exact part of the image to keep.' },
                  { icon: 'camera',   text: 'Recommended source size: at least 900 x 506 px. The image caption and placement controls are directly below.' },
                ]}
                onChange={(fileId, fileUrl) => updateSection(index, { image_file_id: fileId, image_url: fileUrl })}
              />
            </div>
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
              <span className="form-label">Image Placement</span>
              <select
                className="form-select"
                value={section.image_position === 'full' ? 'top' : (section.image_position || 'top')}
                onChange={event => updateSection(index, { image_position: event.target.value })}
              >
                <option value="top">Above section text</option>
                <option value="bottom">Below section text</option>
                <option value="left">Left of text</option>
                <option value="right">Right of text</option>
                <option value="auto">Alternate left and right</option>
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
              <RichTextEditor
                value={section.body || ''}
                onChange={body => updateSection(index, { body })}
                placeholder="Write and format this section."
              />
            </div>
          </div>
        </section>
        <button type="button" className="article-section-insert-btn" onClick={() => insertAfter(index)}>
          <span aria-hidden="true">+</span> Insert section here
        </button>
        </React.Fragment>
      ))}
      <button type="button" className="btn btn-outline-navy btn-sm" onClick={addSection}>
        Add Article Section
      </button>
      <p className="admin-image-help">Images can appear above, below, or beside section text. On phones, every section image remains full width for readability.</p>
    </div>
  );
};

const ManagedForm = ({ config, initialItem, onCancel, onCreate, onUpdate, onAutoSave }) => {
  const [form, setForm] = React.useState(() =>
    config.fields.reduce((acc, itemField) => {
      const rawValue = initialItem ? initialItem[itemField.name] : itemField.defaultValue;
      acc[itemField.name] = valueForInput(rawValue, itemField);
      return acc;
    }, {}),
  );
  const [autoSaveId, setAutoSaveId] = React.useState(initialItem?.id || null);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  const autoSaveTimer = React.useRef(null);
  const latestForm = React.useRef(form);
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

  React.useEffect(() => {
    latestForm.current = form;
  }, [form]);

  const [formVersion, setFormVersion] = React.useState(0);
  const prevForm = React.useRef(form);
  React.useEffect(() => {
    if (form !== prevForm.current) {
      prevForm.current = form;
      setFormVersion(v => v + 1);
    }
  }, [form]);

  const doAutoSave = React.useCallback(async () => {
    if (!onAutoSave) return;
    const current = latestForm.current;
    const hasContent = config.fields.some(f => {
      const v = current[f.name];
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v);
    });
    if (!hasContent) return;
    setAutoSaveStatus('saving');
    try {
      const payload = config.fields.reduce((acc, itemField) => {
        acc[itemField.name] = normalizeFormValue(current[itemField.name], itemField);
        return acc;
      }, {});
      const result = await onAutoSave(payload, autoSaveId);
      if (result?.id) setAutoSaveId(result.id);
      setLastSavedAt(new Date());
      setAutoSaveStatus('saved');
    } catch {
      setAutoSaveStatus('error');
    }
  }, [onAutoSave, autoSaveId, config.fields]);

  React.useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  React.useEffect(() => {
    if (!onAutoSave || formVersion === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('unsaved');
    autoSaveTimer.current = setTimeout(doAutoSave, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [formVersion, onAutoSave, doAutoSave]);

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
                <label className="permission-action" style={{ marginBottom: 12, fontWeight: 800 }}>
                  <input type="checkbox" checked={(itemField.groups || []).flatMap(group => group.actions.map(action => `${group.key}.${action}`)).every(option => (form[itemField.name] || []).includes(option))} onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.checked ? [...new Set([...(prev[itemField.name] || []), ...(itemField.groups || []).flatMap(group => group.actions.map(action => `${group.key}.${action}`))])] : (prev[itemField.name] || []).filter(option => !(itemField.groups || []).some(group => option.startsWith(`${group.key}.`))) }))} />
                  <span>Select all permissions</span>
                </label>
                {(itemField.groups || []).map(group => (
                  <section className="permission-group-card" key={group.key}>
                    <div className="permission-group-head">
                      <span className="ani-icon"><Icon name={group.icon} size={15} stroke={2} /></span>
                      <strong>{group.label}</strong>
                      <label className="permission-action" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={group.actions.every(action => (form[itemField.name] || []).includes(`${group.key}.${action}`))} onChange={event => setForm(prev => { const options = group.actions.map(action => `${group.key}.${action}`); const current = prev[itemField.name] || []; return { ...prev, [itemField.name]: event.target.checked ? [...new Set([...current, ...options])] : current.filter(option => !options.includes(option)) }; })} /><span>Select all</span></label>
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
                <RichTextEditor
                  value={form[itemField.name]}
                  onChange={value => setForm(prev => ({ ...prev, [itemField.name]: value }))}
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
      <div className="admin-modal-actions-sticky" style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : (initialItem ? 'Save Changes' : config.createLabel)}</button>
        <button className="btn btn-outline-navy" type="button" onClick={onCancel}>Cancel</button>
        {onAutoSave && <span className="managed-form-autosave-indicator" aria-live="polite">
          {autoSaveStatus === 'saving' && <span>Saving draft…</span>}
          {autoSaveStatus === 'saved' && lastSavedAt && <span>Draft saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          {autoSaveStatus === 'unsaved' && <span className="unsaved">Editing</span>}
          {autoSaveStatus === 'error' && <span className="autosave-error">Draft save failed</span>}
        </span>}
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

const SelectionHeaderCheckbox = ({ checked, indeterminate, onChange, disabled }) => (
  <input
    type="checkbox"
    ref={el => {
      if (el) el.indeterminate = Boolean(indeterminate);
    }}
    checked={checked}
    disabled={disabled}
    onChange={event => onChange(event.target.checked)}
    aria-label="Select all rows"
  />
);

const ProductImportPanel = ({ onImported, onClose }) => {
  const maxZipBytes = 100 * 1024 * 1024;
  const [importMode, setImportMode] = React.useState('catalogue'); // 'catalogue' or 'images'
  const [catalogFile, setCatalogFile] = React.useState(null);
  const [imagesZip, setImagesZip] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [status, setStatus] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [overwriteSlugs, setOverwriteSlugs] = React.useState(new Set());
  const [imagesPreview, setImagesPreview] = React.useState(null);
  const [imagesPreviewing, setImagesPreviewing] = React.useState(false);
  const [selectedImageMatches, setSelectedImageMatches] = React.useState(new Set());

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

  const reviewImages = async file => {
    setImagesZip(file);
    setImagesPreview(null);
    setSelectedImageMatches(new Set());
    if (!file) {
      setStatus(null);
      return;
    }
    setImagesPreviewing(true);
    setStatus({ type: 'info', message: 'Reviewing image ZIP...' });
    try {
      const result = await api.adminPreviewProductImagesImport(file);
      setImagesPreview(result);
      setSelectedImageMatches(new Set(result.matched.map(m => m.product_id)));
      const msg = `${result.matched_count} images matched, ${result.unmatched_count} unmatched, ${result.invalid_count} invalid`;
      setStatus({
        type: result.warnings?.length ? 'warning' : 'success',
        message: `${result.matched_count} of ${result.total_images} images matched to existing products. ${result.unmatched_count} unmatched, ${result.invalid_count} invalid. ${result.duplicate_count} duplicate matches ignored.`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Image preview failed.' });
    } finally {
      setImagesPreviewing(false);
    }
  };

  const submitImages = async event => {
    event.preventDefault();
    if (!imagesZip) {
      setStatus({ type: 'error', message: 'Upload an image ZIP file.' });
      return;
    }
    if (!imagesPreview) {
      setStatus({ type: 'error', message: 'Wait for the image preview to finish.' });
      return;
    }
    const selectedIds = Array.from(selectedImageMatches);
    if (selectedIds.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one product image to update.' });
      return;
    }
    setImporting(true);
    setProgress({ stage: 'uploading', percent: 0, loaded: 0, total: 0 });
    setStatus({ type: 'info', message: 'Updating product images...' });
    try {
      const result = await api.adminImportProductImages({
        imagesZip,
        productIds: selectedIds,
        onProgress: nextProgress => setProgress(nextProgress),
      });
      const details = [
        `${result.updated || 0} images updated`,
        `${result.skipped?.length || 0} skipped`,
      ];
      setStatus({ type: 'success', message: `Image update complete: ${details.join(', ')}.` });
      onImported?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Image update failed.' });
    } finally {
      setImporting(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (importMode === 'images') {
      return submitImages(event);
    }
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
    if (importMode === 'images') {
      reviewImages(file);
    } else {
      setStatus(preview ? {
        type: preview.warnings?.length ? 'warning' : 'success',
        message: `${preview.row_count} product rows are ready for review.`,
      } : null);
      setImagesZip(file);
    }
  };

  const handleConflictSelectAll = (checked) => {
    if (checked) {
      const allIds = new Set();
      preview.conflicts.forEach(c => allIds.add(c.slug));
      setOverwriteSlugs(allIds);
    } else {
      setOverwriteSlugs(new Set());
    }
  };

  const handleImageMatchSelectAll = (checked) => {
    if (checked) {
      const allIds = new Set(imagesPreview.matched.map(m => m.product_id));
      setSelectedImageMatches(allIds);
    } else {
      setSelectedImageMatches(new Set());
    }
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

  const imagesProgressLabel = progress?.stage === 'processing'
    ? 'Upload complete. The server is updating product images.'
    : progress?.stage === 'complete'
      ? 'Image update complete'
      : `Uploading images: ${progress?.percent || 0}%`;

  const totalConflicts = preview?.conflicts?.length || 0;
  const selectedConflictCount = overwriteSlugs.size;
  const conflictAllSelected = totalConflicts > 0 && selectedConflictCount === totalConflicts;
  const conflictIndeterminate = selectedConflictCount > 0 && selectedConflictCount < totalConflicts;

  const totalImageMatches = imagesPreview?.matched?.length || 0;
  const selectedImageMatchCount = selectedImageMatches.size;
  const imagesAllSelected = totalImageMatches > 0 && selectedImageMatchCount === totalImageMatches;
  const imagesIndeterminate = selectedImageMatchCount > 0 && selectedImageMatchCount < totalImageMatches;

  return (
    <form className="admin-reply-panel product-import-panel" onSubmit={submit}>
      <div>
        <p className="overline">Batch Product Import</p>
        <h3>Upload, review, then import</h3>
        {importMode === 'images' ? (
          <p>
            Upload an image ZIP to replace the cover images of existing products. RealMindX will match each file to a
            product, show a preview, and only change images after you confirm. Catalogue fields are never touched in
            this mode.
          </p>
        ) : (
          <p>
            Select the catalogue first. RealMindX will match its columns and show a sample before any products are changed.
            Cover images should use the filenames in the mapped image column.
          </p>
        )}
      </div>

      {/* Mode selector */}
      <div className="product-import-mode-selector" style={{ marginBottom: 20 }}>
        <span style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--navy)', marginRight: 8 }}>Import mode:</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 16px', border: '2px solid var(--navy)', borderRadius: 8, background: importMode === 'catalogue' ? 'var(--navy)' : 'transparent', color: importMode === 'catalogue' ? '#fff' : 'var(--navy)', transition: 'all 0.2s' }}>
            <input type="radio" name="importMode" value="catalogue" checked={importMode === 'catalogue'} onChange={() => setImportMode('catalogue')} disabled={importing} style={{ accentColor: 'var(--gold)' }} />
            <span style={{ fontWeight: 600 }}>Import or update product details</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 16px', border: '2px solid var(--navy)', borderRadius: 8, background: importMode === 'images' ? 'var(--navy)' : 'transparent', color: importMode === 'images' ? '#fff' : 'var(--navy)', transition: 'all 0.2s' }}>
            <input type="radio" name="importMode" value="images" checked={importMode === 'images'} onChange={() => setImportMode('images')} disabled={importing} style={{ accentColor: 'var(--gold)' }} />
            <span style={{ fontWeight: 600 }}>Update existing product images only</span>
          </label>
        </span>
        {importMode === 'images' && (
          <p className="product-import-helper" style={{ marginTop: 8, fontSize: '0.86rem', color: 'var(--gray-600)' }}>
            Upload a ZIP of product images. Each image is matched to the product whose current cover uses the same
            original filename, for example <code>978-1-2345-6789-0.jpg</code>. Matching ignores case, converts spaces
            and encoded characters (e.g. <code>%20</code>) to the stored filename, and ignores folders inside the ZIP,
            so the product export ZIP can be re-uploaded as-is to replace covers. Only existing products with an image
            are updated; no new products are created and no catalogue fields change.
          </p>
        )}
      </div>

      <div className="admin-form-grid product-import-files">
        {importMode === 'catalogue' ? (
          <>
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
              <span className="form-label">2. Image ZIP (optional)</span>
              <input className="form-input" type="file" accept=".zip" disabled={importing} onChange={chooseImageZip} />
              <small>{imagesZip ? `${imagesZip.name} / ${formatImportBytes(imagesZip.size)}` : 'Optional, up to 100 MB.'}</small>
            </label>
          </>
        ) : (
          <>
            <label className="form-group">
              <span className="form-label">Image ZIP</span>
              <input
                className="form-input"
                type="file"
                accept=".zip"
                disabled={importing || imagesPreviewing}
                onChange={event => chooseImageZip(event)}
              />
              <small>{imagesPreviewing ? 'Reviewing image ZIP...' : imagesZip ? `${imagesZip.name} / ${formatImportBytes(imagesZip.size)}` : 'Choose an image ZIP (up to 100 MB, 500 files max).'}</small>
            </label>
          </>
        )}
      </div>

      {importMode === 'catalogue' && preview ? (
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
              <div className="product-import-selection-toolbar">
                <span className="product-import-selection-count" data-testid="conflict-selection-count">
                  {selectedConflictCount} of {totalConflicts} products selected for overwrite
                </span>
                <span className="product-import-selection-actions">
                  <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={() => handleConflictSelectAll(true)}>
                    Select all {totalConflicts}
                  </button>
                  <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={() => handleConflictSelectAll(false)}>
                    Clear selection
                  </button>
                </span>
              </div>
              <div className="product-import-preview-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <SelectionHeaderCheckbox
                          checked={conflictAllSelected}
                          indeterminate={conflictIndeterminate}
                          disabled={importing}
                          onChange={handleConflictSelectAll}
                        />
                      </th>
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

      {importMode === 'images' && imagesPreview ? (
        <section className="product-import-review" aria-label="Image update review">
          <div className="product-import-review-heading">
            <div>
              <p className="overline">Image Update Review</p>
              <h4>{imagesPreview.matched_count} of {imagesPreview.total_images} images matched to existing products</h4>
            </div>
          </div>
          <p className="product-import-helper">
            Select the matched images to replace. Only the selected products&apos; images change:
            product names, categories, prices, stock and other catalogue fields stay untouched.
          </p>

          {imagesPreview.matched?.length > 0 ? (
            <div className="product-import-preview">
              <div className="product-import-selection-toolbar">
                <span className="product-import-selection-count" data-testid="image-selection-count">
                  {selectedImageMatchCount} of {totalImageMatches} products selected for image update
                </span>
                <span className="product-import-selection-actions">
                  <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={() => handleImageMatchSelectAll(true)}>
                    Select all {totalImageMatches}
                  </button>
                  <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={() => handleImageMatchSelectAll(false)}>
                    Clear selection
                  </button>
                </span>
              </div>
              <div className="product-import-preview-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <SelectionHeaderCheckbox
                          checked={imagesAllSelected}
                          indeterminate={imagesIndeterminate}
                          disabled={importing}
                          onChange={handleImageMatchSelectAll}
                        />
                      </th>
                      <th style={{ width: 90 }}>Current Image</th>
                      <th>New Image</th>
                      <th>Product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imagesPreview.matched.map(match => (
                      <tr key={match.product_id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedImageMatches.has(match.product_id)}
                            onChange={(e) => {
                              setSelectedImageMatches(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(match.product_id);
                                else next.delete(match.product_id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>
                          {match.existing_image_url ? (
                            <img
                              className="product-import-match-thumb"
                              src={adminAssetUrl(match.existing_image_url)}
                              alt={match.current_image_filename || 'Current image'}
                              loading="lazy"
                            />
                          ) : <span className="product-import-empty">No image</span>}
                          <small style={{ display: 'block', color: 'var(--gray-600)' }}>{match.current_image_filename}</small>
                        </td>
                        <td>
                          <strong>{match.filename}</strong>
                          {match.file_size ? <small style={{ display: 'block', color: 'var(--gray-600)' }}>{formatImportBytes(match.file_size)}</small> : null}
                        </td>
                        <td>
                          {match.product_name}
                          {match.product_category ? <small style={{ display: 'block', color: 'var(--gray-600)' }}>{match.product_category}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {imagesPreview.unmatched?.length > 0 ? (
            <div className="product-import-preview" style={{ marginTop: 20 }}>
              <div>
                <p className="overline">Unmatched Files</p>
                <h4>{imagesPreview.unmatched_count} image(s) did not match any existing product.</h4>
              </div>
              <ul className="product-import-file-notes">
                {imagesPreview.unmatched.map(item => (
                  <li key={item.filename}>{item.filename} - {item.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {imagesPreview.invalid_files?.length > 0 ? (
            <div className="product-import-preview" style={{ marginTop: 20 }}>
              <div>
                <p className="overline">Invalid Files</p>
                <h4>{imagesPreview.invalid_count} file(s) were ignored.</h4>
              </div>
              <ul className="product-import-file-notes">
                {imagesPreview.invalid_files.map(item => (
                  <li key={item.filename}>{item.filename} - {item.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {imagesPreview.duplicate_matches?.length > 0 ? (
            <div className="product-import-preview" style={{ marginTop: 20 }}>
              <div>
                <p className="overline">Ambiguous Images</p>
                <h4>{imagesPreview.duplicate_count} file(s) could not be matched safely.</h4>
              </div>
              <ul className="product-import-file-notes">
                {imagesPreview.duplicate_matches.map((item, index) => (
                  <li key={`${item.filename}-${index}`}>{item.filename} - {item.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {imagesPreview.warnings?.map(warning => (
            <p className="product-import-warning" key={warning}>{warning}</p>
          ))}
        </section>
      ) : null}

      {progress ? (
        <div className="product-import-progress" data-stage={progress.stage}>
          <div className="product-import-progress-copy">
            <strong>{importMode === 'images' ? imagesProgressLabel : progressLabel}</strong>
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
        {importMode === 'images' ? (
          imagesPreview ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={importing || imagesPreviewing || selectedImageMatchCount === 0}
            >
              {importing
                ? (progress?.stage === 'processing' ? 'Processing...' : `Uploading ${progress?.percent || 0}%`)
                : (selectedImageMatchCount > 0
                  ? `Replace ${selectedImageMatchCount} Product ${selectedImageMatchCount === 1 ? 'Image' : 'Images'}`
                  : 'Update Product Images')}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={importing || imagesPreviewing || !imagesZip}
              onClick={() => reviewImages(imagesZip)}
            >
              Review Image Updates
            </button>
          )
        ) : (
          <button
            className="btn btn-primary btn-sm"
            disabled={importing || previewing || !preview || !mapping.name || (preview.conflicts?.length > 0 && selectedConflictCount === 0)}
          >
            {importing ? (progress?.stage === 'processing' ? 'Processing...' : `Uploading ${progress?.percent || 0}%`) : (selectedConflictCount > 0 ? `Overwrite ${selectedConflictCount} Products` : 'Import Products')}
          </button>
        )}
        <button className="btn btn-outline-navy btn-sm" type="button" disabled={importing} onClick={onClose}>Close</button>
      </div>
    </form>
  );
};

const ContactsView = ({ session }) => {
  const [filters, setFilters] = React.useState({ q: '', source: '', page: 1, page_size: 25 });
  const [data, setData] = React.useState({ items: [], summary: {}, pagination: {} });
  const [selected, setSelected] = React.useState(null);
  const [draft, setDraft] = React.useState({ full_name: '', email: '', phone: '' });
  const [emailDraft, setEmailDraft] = React.useState({ subject: '', message: '' });
  const [loading, setLoading] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const canCreate = hasSessionPermission(session, 'contacts.create');
  const canEdit = hasSessionPermission(session, 'contacts.edit');
  const canEmail = hasSessionPermission(session, 'contacts.email');
  const canCampaign = hasSessionPermission(session, 'newsletters.create');

  const load = React.useCallback(async () => {
    if (!isApiMode()) return;
    setLoading(true);
    try { setData(await api.adminContacts(filters)); }
    catch (err) { setNotice(err.message || 'Could not load contacts.'); }
    finally { setLoading(false); }
  }, [filters]);
  React.useEffect(() => { load(); }, [load]);

  const openContact = async id => {
    try {
      const result = await api.adminContact(id);
      setSelected(result.item);
      setDraft({ full_name: result.item.full_name || '', email: result.item.email, phone: result.item.phone || '' });
    } catch (err) { setNotice(err.message || 'Could not load this contact.'); }
  };
  const save = async event => {
    event.preventDefault();
    try {
      if (selected?.id) await api.adminUpdateContact(selected.id, draft);
      else await api.adminCreateContact(draft);
      setSelected(null); setNotice('Contact saved.'); await load();
    } catch (err) { setNotice(err.message || 'Could not save the contact.'); }
  };
  const send = async event => {
    event.preventDefault();
    try {
      await api.adminSendContactEmail(selected.id, { ...emailDraft, idempotency_key: crypto.randomUUID() });
      setEmailDraft({ subject: '', message: '' }); setNotice('Email accepted for delivery.'); await openContact(selected.id);
    } catch (err) { setNotice(err.message || 'Could not send the email.'); }
  };
  const summary = data.summary || {};
  return <div className="admin-view">
    <div className="admin-page-header">
      <div><p className="overline">Audience directory</p><h1>Contacts</h1><p>One deduplicated view of teachers, customers, subscribers, schools, and enquiries.</p></div>
      {canCreate && <button className="btn btn-primary btn-sm" onClick={() => { setSelected({}); setDraft({ full_name: '', email: '', phone: '' }); }}>Add contact</button>}
    </div>
    <div className="admin-stats-grid">
      {[['All contacts', summary.total_contacts], ['Teachers', summary.teachers], ['Bookshop clients', summary.bookshop], ['Newsletter', summary.newsletter], ['Schools', summary.schools]].map(([label, value]) => <div className="admin-stat-card" key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>)}
    </div>
    <div className="newsletter-audience-filters" style={{ margin: '18px 0' }}>
      <input className="form-input" value={filters.q} onChange={e => setFilters(p => ({ ...p, q: e.target.value, page: 1 }))} placeholder="Search name, email, or phone" />
      <select className="form-select" value={filters.source} onChange={e => setFilters(p => ({ ...p, source: e.target.value, page: 1 }))}><option value="">All sources</option>{['teacher','bookshop','newsletter','school','enquiry','client','admin_added'].map(x => <option key={x}>{x}</option>)}</select>
    </div>
    {notice && <p className="admin-image-help">{notice}</p>}
    <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Contact</th><th>Phone</th><th>Sources</th><th>Last activity</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="4">Loading contacts…</td></tr> : data.items.map(row => <tr key={row.id} onClick={() => openContact(row.id)} style={{ cursor: 'pointer' }}><td><strong>{row.full_name || 'Unnamed contact'}</strong><br/><small>{row.email}</small></td><td>{row.phone || '-'}</td><td>{row.sources.map(x => x.source).join(', ')}</td><td>{row.last_activity_at ? new Date(row.last_activity_at).toLocaleDateString() : '-'}</td></tr>)}
    </tbody></table></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}><button className="btn btn-outline-navy btn-sm" disabled={!data.pagination?.has_prev} onClick={() => setFilters(p => ({ ...p, page: p.page - 1 }))}>Previous</button><span>Page {data.pagination?.page || 1} of {data.pagination?.pages || 1}</span><button className="btn btn-outline-navy btn-sm" disabled={!data.pagination?.has_next} onClick={() => setFilters(p => ({ ...p, page: p.page + 1 }))}>Next</button></div>
    {canCampaign && <NewsletterComposer onSent={load} />}
    {selected && ReactDOM.createPortal(<div className="admin-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}><div className="admin-modal"><div className="admin-modal-header"><h2>{selected.id ? 'Contact details' : 'Add contact'}</h2><button onClick={() => setSelected(null)}>×</button></div><form className="admin-form-grid" onSubmit={save}>
      <label className="form-group"><span className="form-label">Name</span><input className="form-input" value={draft.full_name} disabled={selected.id && !canEdit} onChange={e => setDraft(p => ({ ...p, full_name: e.target.value }))}/></label>
      <label className="form-group"><span className="form-label">Email</span><input className="form-input" type="email" value={draft.email} disabled={Boolean(selected.id)} onChange={e => setDraft(p => ({ ...p, email: e.target.value }))}/></label>
      <label className="form-group"><span className="form-label">Phone</span><input className="form-input" value={draft.phone} disabled={selected.id && !canEdit} onChange={e => setDraft(p => ({ ...p, phone: e.target.value }))}/></label>
      {(!selected.id || canEdit) && <button className="btn btn-primary btn-sm">Save</button>}
    </form>{selected.id && <><p><strong>Sources:</strong> {(selected.sources || []).map(x => x.source).join(', ') || 'None'}</p>
      {canEmail && <form className="admin-reply-panel" onSubmit={send}><h3>Send an official RealMindX email</h3><p>This operational message uses the platform's branded letterhead.</p><input className="form-input" required placeholder="Subject" value={emailDraft.subject} onChange={e => setEmailDraft(p => ({ ...p, subject: e.target.value }))}/><textarea className="form-textarea" required rows="5" placeholder="Message" value={emailDraft.message} onChange={e => setEmailDraft(p => ({ ...p, message: e.target.value }))}/><button className="btn btn-primary btn-sm">Send email</button></form>}
      <h3>Email history</h3>{(selected.emails || []).map(item => <p key={item.id}><strong>{item.subject}</strong> - {item.status}<br/><small>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</small></p>)}</>}
    </div></div>, document.body)}
  </div>;
};

const GSM7_BASIC_CHARACTERS = new Set(Array.from(
  "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u001b\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0"
));
const GSM7_EXTENSION_CHARACTERS = new Set(Array.from('^{}\\[~]|\u20ac'));
const APPROVED_SMS_SENDER_IDS = ['RealMindX'];
const smsCharacterMetrics = message => {
  const characters = Array.from(message || '');
  const isGsm7 = characters.every(character => GSM7_BASIC_CHARACTERS.has(character) || GSM7_EXTENSION_CHARACTERS.has(character));
  const units = isGsm7
    ? characters.reduce((total, character) => total + (GSM7_EXTENSION_CHARACTERS.has(character) ? 2 : 1), 0)
    : String(message || '').length;
  const singleLimit = isGsm7 ? 160 : 70;
  const multipartLimit = isGsm7 ? 153 : 67;
  const segments = units ? (units <= singleLimit ? 1 : Math.ceil(units / multipartLimit)) : 0;
  const segmentLimit = units > singleLimit ? multipartLimit : singleLimit;
  return {
    characters: characters.length,
    units,
    encoding: isGsm7 ? 'GSM-7' : 'Unicode',
    segments,
    remaining: segments ? (segments * segmentLimit) - units : singleLimit,
  };
};
const normaliseGhanaPhone = value => {
  let phone = String(value || '').trim().replaceAll(' ', '').replaceAll('-', '');
  if (phone.startsWith('+233')) phone = `233${phone.slice(4)}`;
  else if (phone.startsWith('00')) phone = phone.slice(2);
  else if (phone.startsWith('0') && phone.length === 10) phone = `233${phone.slice(1)}`;
  if (!phone.startsWith('233') || phone.length !== 12 || !/^\d+$/.test(phone)) return null;
  return `+${phone}`;
};
const splitSmsNumbers = value => String(value || '').split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);

const NewsletterWorkspace = ({ onSent }) => {
  const emptySection = () => ({ heading: '', body: '', caption: '', image_position: 'top', image_size: 'medium', image_file_id: '', image_url: '' });
  const emptyForm = { channel: 'email', brand: 'realmindx', sender: 'news', sms_sender_id: 'RealMindX', subject: '', title: '', preheader: '', sections: [emptySection()], sms_message: '', cta_label: '', cta_url: '', image_file_id: '', manual_recipients: '', manual_numbers: '' };
  const [tab, setTab] = React.useState('compose');
  const [form, setForm] = React.useState(emptyForm);
  const [contacts, setContacts] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [filters, setFilters] = React.useState({ q: '', source: '' });
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [smsPreview, setSmsPreview] = React.useState(null);
  const [deletingCampaign, setDeletingCampaign] = React.useState(null);
  const [deleting, setDeleting] = React.useState(false);
  const [recipientCampaign, setRecipientCampaign] = React.useState(null);
  const [recipientDetails, setRecipientDetails] = React.useState(null);
  const [recipientSearch, setRecipientSearch] = React.useState('');
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  const [resendingRecipient, setResendingRecipient] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [sendingCampaign, setSendingCampaign] = React.useState(null);
  const [sendingProgress, setSendingProgress] = React.useState([]);
  const [draftStatus, setDraftStatus] = React.useState('idle');
  const [lastDraftAt, setLastDraftAt] = React.useState(null);
  const [recoveryDraft, setRecoveryDraft] = React.useState(null);
  const [showRecovery, setShowRecovery] = React.useState(false);
  const draftTimer = React.useRef(null);
  const draftVersion = React.useRef(0);
  const latestFormRef = React.useRef(form);
  const latestSelectedRef = React.useRef(selected);
  const DRAFT_STORAGE_KEY = 'realmindx_newsletter_draft';

  React.useEffect(() => { latestFormRef.current = form; }, [form]);
  React.useEffect(() => { latestSelectedRef.current = selected; }, [selected]);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.adminGetNewsletterDraft().then(data => {
      if (!alive || !data?.draft) return;
      const content = data.draft.content || {};
      const hasContent = (data.draft.subject || '').trim() || (data.draft.sms_sender_id || '').trim() || (content.message || '').trim() || (content.sections || []).some(s => (s.heading || '').trim() || (s.body || '').trim());
      if (hasContent) setRecoveryDraft(data.draft);
    }).catch(() => {});
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.subject || cached?.sms_message) {
          if (!alive) return;
          setRecoveryDraft(prev => prev || cached);
        }
      }
    } catch {}
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (recoveryDraft && !showRecovery) setShowRecovery(true);
  }, [recoveryDraft]);

  const clearDraft = React.useCallback(() => {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
    api.adminDeleteNewsletterDraft().catch(() => {});
    setRecoveryDraft(null);
    setShowRecovery(false);
    setLastDraftAt(null);
  }, []);

  const loadRecoveryDraft = React.useCallback(() => {
    if (!recoveryDraft) return;
    const content = recoveryDraft.content || {};
    if ((recoveryDraft.channel || 'email') === 'sms') {
      setForm({
        ...emptyForm,
        channel: 'sms',
        subject: recoveryDraft.subject || '',
        sms_sender_id: APPROVED_SMS_SENDER_IDS.includes(recoveryDraft.sms_sender_id) ? recoveryDraft.sms_sender_id : APPROVED_SMS_SENDER_IDS[0],
        sms_message: content.message || '',
        manual_numbers: (recoveryDraft.audience?.recipient_phones || []).join('\n'),
      });
      if (recoveryDraft.audience?.contact_ids) setSelected(new Set(recoveryDraft.audience.contact_ids));
    } else {
      setForm({
        ...emptyForm,
        ...content,
        channel: 'email',
        subject: recoveryDraft.subject || '',
        title: recoveryDraft.title || content.title || '',
        brand: recoveryDraft.brand || 'realmindx',
        sender: recoveryDraft.sender || 'news',
        sections: content.sections?.length ? content.sections : [emptySection()],
        manual_recipients: (recoveryDraft.audience?.recipient_emails || []).join('\n'),
      });
      if (recoveryDraft.audience?.contact_ids) setSelected(new Set(recoveryDraft.audience.contact_ids));
    }
    setShowRecovery(false);
    globalToast.success('Draft restored. Continue editing where you left off.');
  }, [recoveryDraft, emptySection]);

  const autoSaveDraft = React.useCallback(async () => {
    const current = latestFormRef.current;
    const currentSelected = latestSelectedRef.current;
    const isSms = current.channel === 'sms';
    const hasContent = (current.subject || '').trim() || (isSms ? (current.sms_message || '').trim() : (current.sections || []).some(s => (s.heading || '').trim() || (s.body || '').trim()));
    if (!hasContent) return;
    const payload = {
      channel: current.channel,
      subject: current.subject,
      title: current.title || current.subject,
      brand: current.brand,
      sender: current.sender,
      sms_sender_id: current.sms_sender_id,
      content: isSms
        ? { message: current.sms_message }
        : {
            sections: current.sections,
            title: current.title || current.subject,
            preheader: current.preheader,
            cta_label: current.cta_label,
            cta_url: current.cta_url,
            image_file_id: current.image_file_id,
          },
      audience: {
        contact_ids: [...currentSelected],
        recipient_emails: isSms ? [] : (current.manual_recipients || '').split(/[\s,;]+/).filter(Boolean),
        recipient_phones: isSms ? (current.manual_numbers || '').split(/[\s,]+/).filter(Boolean) : [],
      },
    };
    setDraftStatus('saving');
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...current, selectedIds: [...currentSelected] }));
      const result = await api.adminSaveNewsletterDraft(payload);
      if (result?.draft) setLastDraftAt(new Date(result.draft.updated_at));
      setDraftStatus('saved');
    } catch {
      setDraftStatus('error');
    }
  }, []);

  React.useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current); }, []);

  React.useEffect(() => {
    draftVersion.current += 1;
    const version = draftVersion.current;
    setDraftStatus('unsaved');
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (draftVersion.current === version) autoSaveDraft();
    }, 2500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [form, selected]);

  const loadAudience = React.useCallback(async () => {
    if (!isApiMode()) return;
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    try { setContacts((await api.adminListWithQuery('newsletters/audience', query)).items || []); }
    catch (err) { setError(err.message || 'Could not load contacts.'); }
  }, [filters]);
  const loadHistory = React.useCallback(async () => {
    if (!isApiMode()) return;
    try { setHistory((await api.adminList('newsletters/campaigns')).items || []); }
    catch (err) { setError(err.message || 'Could not load newsletter history.'); }
  }, []);
  const [contactGroups, setContactGroups] = React.useState([]);
  const [groupName, setGroupName] = React.useState('');
  const [savingGroup, setSavingGroup] = React.useState(false);
  const loadGroups = React.useCallback(async () => {
    if (!isApiMode()) return;
    try { setContactGroups((await api.adminListContactGroups()).items || []); }
    catch { /* ignore */ }
  }, []);
  React.useEffect(() => { loadAudience(); loadHistory(); loadGroups(); }, [loadAudience, loadHistory, loadGroups]);
  React.useEffect(() => {
    if (!sendingCampaign || sendingCampaign.status !== 'sending') return;
    let active = true;
    const poll = async () => {
      try {
        const data = await api.adminNewsletterCampaignRecipients(sendingCampaign.id);
        if (!active) return;
        if (data.campaign) setSendingCampaign(prev => prev ? { ...prev, ...data.campaign } : prev);
        setSendingProgress(data.recipients || []);
      } catch { /* retry next tick */ }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [sendingCampaign?.id, sendingCampaign?.status]);

  const toggle = id => setSelected(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectChannel = channel => {
    setForm(previous => ({ ...previous, channel }));
    setSelected(new Set());
    setResult(null);
    setError('');
    setTab('compose');
  };
  const selectBrand = brand => setForm(previous => ({
    ...previous,
    brand,
    sender: brand === 'bookshop' ? 'bookshop' : 'news',
  }));
  const loadCampaign = campaign => {
    const content = campaign.content || {};
    if ((campaign.channel || 'email') === 'sms') {
      setForm({
        ...emptyForm,
        channel: 'sms',
        subject: campaign.subject || '',
        sms_sender_id: APPROVED_SMS_SENDER_IDS.includes(campaign.sender) ? campaign.sender : APPROVED_SMS_SENDER_IDS[0],
        sms_message: content.message || '',
        manual_numbers: (campaign.audience?.recipient_phones || []).join('\n'),
      });
    } else {
      setForm({ ...emptyForm, ...content, channel: 'email', sections: content.sections?.length ? content.sections : [emptySection()], manual_recipients: (campaign.audience?.recipient_emails || []).join('\n') });
    }
    setSelected(new Set(campaign.audience?.contact_ids || []));
    setResult(null); setError(''); setTab('compose');
    globalToast.success(`Past ${campaign.channel === 'sms' ? 'SMS campaign' : 'newsletter'} loaded. Review it, then send when ready.`);
  };
  const campaignPayload = () => form.channel === 'sms' ? {
    channel: 'sms',
    subject: form.subject,
    message: form.sms_message,
    sender_id: form.sms_sender_id,
    contact_ids: [...selected],
    recipient_phones: form.manual_numbers,
  } : {
    ...form,
    channel: 'email',
    title: form.title || form.subject,
    contact_ids: [...selected],
    recipient_emails: form.manual_recipients,
    image_file_id: form.image_file_id ? Number(form.image_file_id) : null,
    sections: (form.sections || []).map(section => ({ ...section, image_file_id: section.image_file_id ? Number(section.image_file_id) : null })),
  };
  const generatePreview = async (payload, device) => {
    setError(''); setPreviewing(true);
    try {
      const response = await api.adminPreviewNewsletter(payload);
      setPreview({ ...response, device });
    } catch (err) { setError(err.message || 'Newsletter preview could not be generated.'); }
    finally { setPreviewing(false); }
  };
  const openPreview = device => generatePreview(campaignPayload(), device);
  const viewCampaign = campaign => {
    if ((campaign.channel || 'email') === 'sms') setSmsPreview(campaign);
    else generatePreview({ ...(campaign.content || {}), subject: campaign.subject, title: campaign.title || campaign.subject }, 'desktop');
  };
  const deleteCampaign = async () => {
    if (!deletingCampaign) return;
    setDeleting(true); setError('');
    try {
      await api.adminDeleteNewsletterCampaign(deletingCampaign.id);
      setDeletingCampaign(null); await loadHistory();
      globalToast.success('Newsletter history record deleted.');
    } catch (err) { setError(err.message || 'Newsletter history could not be deleted.'); }
    finally { setDeleting(false); }
  };
  const loadCampaignRecipients = async campaign => {
    setRecipientCampaign(campaign); setRecipientDetails(null); setRecipientSearch(''); setLoadingRecipients(true); setError('');
    try { setRecipientDetails(await api.adminNewsletterCampaignRecipients(campaign.id)); }
    catch (err) { setError(err.message || 'Recipient details could not be loaded.'); setRecipientCampaign(null); }
    finally { setLoadingRecipients(false); }
  };
  const refreshCampaignRecipients = async campaign => {
    const details = await api.adminNewsletterCampaignRecipients(campaign.id);
    setRecipientDetails(details);
    if (details.campaign) setRecipientCampaign(previous => ({ ...(previous || campaign), ...details.campaign }));
    await loadHistory();
  };
  const resendRecipient = async recipientId => {
    if (!recipientCampaign) return;
    setResendingRecipient(recipientId); setError('');
    try {
      await api.adminResendNewsletterRecipient(recipientCampaign.id, recipientId);
      await refreshCampaignRecipients(recipientCampaign);
      globalToast.success('Recipient resend completed.');
    } catch (err) { globalToast.error(err.message || 'Recipient could not be resent.'); }
    finally { setResendingRecipient(null); }
  };
  const resendAllFailed = async () => {
    if (!recipientCampaign) return;
    setResendingRecipient('all'); setError('');
    try {
      await api.adminResendFailedNewsletterRecipients(recipientCampaign.id);
      await refreshCampaignRecipients(recipientCampaign);
      globalToast.success('All failed recipients were retried.');
    } catch (err) { globalToast.error(err.message || 'Failed recipients could not be resent.'); }
    finally { setResendingRecipient(null); }
  };
  const dismissSendingCampaign = async () => {
    setSendingCampaign(null);
    setSendingProgress([]);
    await loadHistory();
    setTab('history');
  };
  const saveSelectionAsGroup = async () => {
    if (!selected.size || !groupName.trim()) return;
    setSavingGroup(true); setError('');
    try {
      await api.adminCreateContactGroup({ name: groupName.trim(), contact_ids: [...selected] });
      setGroupName('');
      await loadGroups();
      globalToast.success('Contact group saved.');
    } catch (err) { setError(err.message || 'Could not save group.'); }
    finally { setSavingGroup(false); }
  };
  const loadGroupIntoSelection = async groupId => {
    if (!groupId) return;
    try {
      const data = await api.adminContactGroupContacts(groupId);
      const groupContactIds = (data.contacts || []).map(c => c.id);
      setSelected(previous => {
        const next = new Set(previous);
        groupContactIds.forEach(id => next.add(id));
        return next;
      });
      globalToast.success(`Loaded ${(data.group || {}).name || 'group'} contacts.`);
    } catch (err) { setError(err.message || 'Could not load group.'); }
  };
  const submit = async event => {
    event.preventDefault(); setError(''); setResult(null);
    if (form.channel === 'sms') {
      if (!form.subject.trim() || !form.sms_message.trim()) {
        setError('Add a campaign name and SMS message.'); return;
      }
      if (!APPROVED_SMS_SENDER_IDS.includes(form.sms_sender_id)) {
        setError('Select an approved sender ID.'); return;
      }
      const invalidNumbers = splitSmsNumbers(form.manual_numbers).filter(number => !normaliseGhanaPhone(number));
      if (invalidNumbers.length) {
        setError(`${invalidNumbers.length} pasted number${invalidNumbers.length === 1 ? ' is' : 's are'} invalid. Use Ghana numbers such as 0541234567 or +233541234567.`); return;
      }
    } else if (!form.subject.trim() || !(form.sections || []).some(section => (section.heading || '').trim() || (section.body || '').trim() || section.image_file_id)) {
      setError('Add a subject and at least one newsletter section.'); return;
    }
    setSending(true);
    try {
      const response = await api.adminSendNewsletter(campaignPayload());
      if (response.sending) {
        setSendingCampaign(response.campaign);
        setSendingProgress([]);
        clearDraft();
        setForm({ ...emptyForm, channel: form.channel }); setSelected(new Set());
        globalToast.success(response.message || 'SMS campaign is being sent.');
        onSent?.();
      } else {
        setResult(response); clearDraft(); setForm({ ...emptyForm, channel: form.channel }); setSelected(new Set());
        globalToast.success(response.message || 'Newsletter sent successfully.');
        await loadHistory(); onSent?.(); setTab('history');
      }
    } catch (err) {
      const message = err.status === 504
        ? 'The request timed out. The campaign may still be processing. Refresh the history before resending.'
        : (err.message || `${form.channel === 'sms' ? 'SMS campaign' : 'Newsletter'} could not be sent.`);
      setError(message); globalToast.error(message);
    }
    finally { setSending(false); }
  };

  const tabs = [['compose', 'Compose'], ['audience', `Audience (${selected.size})`], ['history', `History (${history.length})`]];
  const recipientRows = recipientDetails?.recipients || [];
  const normalizedRecipientSearch = recipientSearch.trim().toLowerCase();
  const matchesRecipientSearch = recipient => !normalizedRecipientSearch || (recipient.destination || recipient.email || recipient.phone || '').toLowerCase().includes(normalizedRecipientSearch);
  const successfulRecipientTotal = recipientRows.filter(recipient => recipient.successful).length;
  const uncertainRecipientTotal = recipientRows.filter(recipient => recipient.uncertain).length;
  const failedRecipientTotal = recipientRows.filter(recipient => !recipient.successful && !recipient.uncertain).length;
  const successfulRecipients = recipientRows.filter(recipient => recipient.successful && matchesRecipientSearch(recipient));
  const uncertainRecipients = recipientRows.filter(recipient => recipient.uncertain && matchesRecipientSearch(recipient));
  const failedRecipients = recipientRows.filter(recipient => !recipient.successful && !recipient.uncertain && matchesRecipientSearch(recipient));
  const isSms = form.channel === 'sms';
  const smsMetrics = smsCharacterMetrics(form.sms_message);
  const eligibleContacts = contacts.filter(contact => isSms ? Boolean(normaliseGhanaPhone(contact.phone)) : contact.newsletter_status !== 'unsubscribed');
  const selectedSmsPhones = new Set(contacts.filter(contact => selected.has(contact.id)).map(contact => normaliseGhanaPhone(contact.phone)).filter(Boolean));
  const manualSmsRecipientCount = new Set(splitSmsNumbers(form.manual_numbers).map(normaliseGhanaPhone).filter(phone => phone && !selectedSmsPhones.has(phone))).size;
  return <form className="newsletter-workspace" onSubmit={submit}>
    <div className="newsletter-workspace-head"><div><p className="overline">Newsletter</p><h2>Campaign workspace</h2><p>Send targeted email newsletters or SMS broadcasts from one place.</p></div><div className="newsletter-channel-switch" aria-label="Campaign channel"><button type="button" className={!isSms ? 'active' : ''} onClick={() => selectChannel('email')}><Icon name="mail" size={16}/> Email</button><button type="button" className={isSms ? 'active' : ''} onClick={() => selectChannel('sms')}><Icon name="mobile" size={16}/> SMS</button></div></div>
    <div className="newsletter-tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
    {showRecovery && recoveryDraft && <div className="newsletter-draft-recovery" role="alert"><div><strong>Draft found</strong><small>You have an unsaved newsletter draft{recoveryDraft.updated_at ? ` from ${new Date(recoveryDraft.updated_at).toLocaleString()}` : ''}.</small></div><div className="newsletter-draft-recovery-actions"><button type="button" className="btn btn-primary btn-sm" onClick={loadRecoveryDraft}>Load draft</button><button type="button" className="btn btn-ghost btn-sm" onClick={clearDraft}>Discard</button></div></div>}
    {draftStatus !== 'idle' && draftStatus !== 'unsaved' && !showRecovery && <div className="newsletter-draft-status" aria-live="polite"><span className={`newsletter-draft-dot is-${draftStatus}`} /><span>{draftStatus === 'saving' ? 'Saving draft…' : draftStatus === 'saved' && lastDraftAt ? `Draft saved ${lastDraftAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : draftStatus === 'error' ? 'Draft save failed' : ''}</span></div>}
    {result && ReactDOM.createPortal(
      <div className="admin-modal-backdrop newsletter-success-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setResult(null); }}>
        <section className="admin-modal-panel newsletter-success-modal" role="dialog" aria-modal="true" aria-labelledby="newsletter-success-title">
          <div className="newsletter-success-mark" aria-hidden="true"><Icon name="check" size={28} /></div>
          <p className="overline">Send complete</p>
          <h2 id="newsletter-success-title">{result.campaign?.channel === 'sms' ? 'SMS campaign complete' : 'Newsletter sent successfully'}</h2>
          <p>{result.message || 'The campaign has been accepted for delivery.'}</p>
          <div className="newsletter-success-counts">
            <div><strong>{result.sent || 0}</strong><span>{result.campaign?.channel === 'sms' ? 'Accepted' : 'Sent'}</span></div>
            <div><strong>{result.mocked || 0}</strong><span>Test mode</span></div>
            <div><strong>{result.failed || 0}</strong><span>Failed</span></div>
          </div>
          <p className="newsletter-success-note">This campaign and every recipient result are now saved in campaign history.</p>
          <button type="button" className="btn btn-primary" onClick={() => setResult(null)}>View campaign history</button>
        </section>
      </div>,
      document.body
    )}
    {error && <div className="newsletter-error">{error}</div>}

    {sendingCampaign ? <div className="newsletter-sending-progress">
      <div className="newsletter-sending-head">
        <div>
          {sendingCampaign.status === 'sending' && <span className="newsletter-sending-spinner" aria-hidden="true" />}
          <h3>{sendingCampaign.status === 'sending' ? 'Sending campaign…' : sendingCampaign.status === 'completed' ? 'Campaign complete' : sendingCampaign.status === 'partial' ? 'Campaign partially complete' : 'Campaign failed'}</h3>
          <p>{sendingCampaign.subject} · {sendingCampaign.recipient_count} recipient{sendingCampaign.recipient_count === 1 ? '' : 's'}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={dismissSendingCampaign}><Icon name="arrow" size={14}/> Back to History</button>
      </div>
      <div className="newsletter-sending-counts">
        <div className="is-success"><strong>{sendingCampaign.sent_count + sendingCampaign.mocked_count}</strong><span>Sent</span></div>
        {sendingCampaign.unknown_count > 0 && <div className="is-uncertain"><strong>{sendingCampaign.unknown_count}</strong><span>Unknown</span></div>}
        {sendingCampaign.failed_count > 0 && <div className="is-failed"><strong>{sendingCampaign.failed_count}</strong><span>Failed</span></div>}
        <div><strong>{sendingProgress.filter(r => r.status === 'pending').length}</strong><span>Pending</span></div>
      </div>
      <div className="newsletter-sending-list" role="table" aria-label="Sending progress">
        {sendingProgress.length ? sendingProgress.map(recipient => <div className="newsletter-sending-row" role="row" key={recipient.id}>
          <span className={`newsletter-sending-dot is-${recipient.status}`} aria-hidden="true" />
          <span className="newsletter-sending-dest">{recipient.destination}</span>
          <span className={`newsletter-sending-label is-${recipient.status}`}>{recipient.status === 'pending' ? 'Waiting…' : recipient.status === 'sent' || recipient.status === 'accepted' || recipient.status === 'delivered' ? 'Sent' : recipient.status === 'mocked' ? 'Mocked' : recipient.status === 'unknown' ? 'Unknown' : recipient.status === 'failed' || recipient.status === 'rejected' ? 'Failed' : recipient.status}</span>
        </div>) : <p className="newsletter-sending-empty">Preparing recipients…</p>}
      </div>
    </div> : <>

    {tab === 'compose' && <div className="newsletter-panel newsletter-compose-panel">
      {!isSms ? <>
        <div className="newsletter-compact-grid">
          <label className="form-group"><span className="form-label">Sender address</span><select className="form-select" value={form.sender} onChange={e => setForm(p => ({ ...p, sender: e.target.value }))}><option value="news">news@send.realmindxgh.com</option><option value="sales">sales@send.realmindxgh.com</option><option value="bookshop">Bookshop sender</option><option value="default">Default RealMindX sender</option></select></label>
          <label className="form-group"><span className="form-label">Letterhead</span><select className="form-select" value={form.brand} onChange={e => selectBrand(e.target.value)}><option value="realmindx">RealMindX Education</option><option value="bookshop">RealMindX Bookshop</option></select></label>
          <label className="form-group newsletter-subject"><span className="form-label">Subject</span><input className="form-input" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="What should recipients see in their inbox?" /></label>
        </div>
        <div className="newsletter-options newsletter-options-visible"><div className="newsletter-options-heading"><span className="form-label">Email details</span><small>Optional inbox and call-to-action details.</small></div><div className="newsletter-compact-grid"><label className="form-group"><span className="form-label">Email title</span><input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></label><label className="form-group"><span className="form-label">Preheader</span><input className="form-input" value={form.preheader} onChange={e => setForm(p => ({ ...p, preheader: e.target.value }))} /></label><label className="form-group"><span className="form-label">Button label</span><input className="form-input" value={form.cta_label} onChange={e => setForm(p => ({ ...p, cta_label: e.target.value }))} /></label><label className="form-group"><span className="form-label">Button URL</span><input className="form-input" value={form.cta_url} onChange={e => setForm(p => ({ ...p, cta_url: e.target.value }))} /></label></div></div>
        <div className="newsletter-section-editor"><div className="newsletter-section-heading"><div><span className="form-label">Content</span><small>Add only the sections you need.</small></div></div><ArticleSectionsField sections={form.sections} onChange={sections => setForm(p => ({ ...p, sections }))} /></div>
        <div className="newsletter-compose-actions"><div className="newsletter-preview-actions"><span>Preview</span><button type="button" className="btn btn-outline-navy btn-sm" disabled={previewing} onClick={() => openPreview('mobile')}><Icon name="mobile" size={17}/> Phone</button><button type="button" className="btn btn-outline-navy btn-sm" disabled={previewing} onClick={() => openPreview('desktop')}><Icon name="monitor" size={17}/> Desktop</button></div><button type="button" className="btn btn-primary" onClick={() => setTab('audience')}>Select audience <Icon name="arrow" size={16}/></button></div>
      </> : <div className="newsletter-sms-composer">
        <div className="newsletter-sms-fields">
          <label className="form-group"><span className="form-label">Campaign name</span><input className="form-input" maxLength="255" value={form.subject} onChange={event => setForm(previous => ({ ...previous, subject: event.target.value }))} placeholder="Internal name, e.g. Teacher workshop reminder" /><small>Used in history only; recipients will not see it.</small></label>
          <label className="form-group"><span className="form-label">Approved sender ID</span><select className="form-select" value={form.sms_sender_id} onChange={event => setForm(previous => ({ ...previous, sms_sender_id: event.target.value }))}>{APPROVED_SMS_SENDER_IDS.map(senderId => <option key={senderId} value={senderId}>{senderId}</option>)}</select><small>Only sender IDs registered and approved for RealMindX appear here.</small></label>
        </div>
        <label className="form-group newsletter-sms-message"><span className="form-label">SMS message</span><textarea className="form-textarea" rows="8" value={form.sms_message} onChange={event => setForm(previous => ({ ...previous, sms_message: event.target.value }))} placeholder="Write the text recipients should receive…" /></label>
        <div className="newsletter-sms-metrics" aria-live="polite">
          <div><strong>{smsMetrics.characters}</strong><span>Characters</span></div>
          <div><strong>{smsMetrics.encoding}</strong><span>Encoding</span></div>
          <div><strong>{smsMetrics.segments}</strong><span>SMS part{smsMetrics.segments === 1 ? '' : 's'} / recipient</span></div>
          <div><strong>{smsMetrics.remaining}</strong><span>Units left in this part</span></div>
        </div>
        {smsMetrics.encoding === 'Unicode' && <p className="newsletter-sms-warning">This message contains Unicode characters, so each SMS part holds fewer characters. Emojis usually trigger Unicode encoding.</p>}
        <div className="newsletter-sms-phone-preview"><div className="newsletter-sms-phone-head"><span>{form.sms_sender_id.trim() || 'Sender ID'}</span><small>{smsMetrics.segments || 0} SMS part{smsMetrics.segments === 1 ? '' : 's'}</small></div><p>{form.sms_message || 'Your SMS preview will appear here.'}</p></div>
        <div className="newsletter-compose-actions"><p className="newsletter-sms-consent-note">Send only to people you are permitted to contact. Each SMS part is billed per recipient.</p><button type="button" className="btn btn-primary" onClick={() => setTab('audience')}>Select phone numbers <Icon name="arrow" size={16}/></button></div>
      </div>}
    </div>}

    {tab === 'audience' && <div className="newsletter-panel newsletter-audience-panel-new">
      <div className="newsletter-audience-toolbar">
        <div className="newsletter-audience-search"><Icon name="search" size={16}/><input value={filters.q} onChange={event => setFilters(previous => ({ ...previous, q: event.target.value }))} placeholder="Search name, email, or phone"/></div>
        <select className="form-select" value={filters.source} onChange={event => setFilters(previous => ({ ...previous, source: event.target.value }))}><option value="">All contact sources</option>{['teacher','bookshop','newsletter','enquiry','school','client','admin_added'].map(source => <option key={source} value={source}>{statusLabel(source)}</option>)}</select>
        <div className="newsletter-audience-actions"><button type="button" className="btn btn-outline-navy btn-sm" onClick={() => setSelected(new Set(eligibleContacts.map(contact => contact.id)))}>Select all eligible</button><button type="button" className="btn btn-ghost btn-sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear</button></div>
      </div>
      <div className="newsletter-groups-bar">
        <div className="newsletter-group-load"><span className="form-label">Groups</span><select className="form-select" value="" onChange={event => { const val = event.target.value; if (val) loadGroupIntoSelection(Number(val)); }}><option value="">Load a saved group…</option>{contactGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>)}</select></div>
        {selected.size > 0 && <div className="newsletter-group-save"><input className="form-input" value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Group name" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveSelectionAsGroup(); } }} /><button type="button" className="btn btn-outline-navy btn-sm" disabled={savingGroup || !groupName.trim()} onClick={saveSelectionAsGroup}>{savingGroup ? 'Saving…' : `Save ${selected.size} as group`}</button></div>}
      </div>
      <div className="newsletter-audience-meta"><span><strong>{contacts.length}</strong> contacts shown · <strong>{eligibleContacts.length}</strong> {isSms ? 'with valid phone numbers' : 'eligible'}</span><span className={selected.size ? 'has-selection' : ''}><strong>{selected.size}</strong> selected</span></div>
      <div className="newsletter-contact-grid">{contacts.map(contact => {
        const source = (contact.sources || [])[0]?.source || 'contact';
        const name = contact.full_name || contact.email;
        const initials = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
        const isSelected = selected.has(contact.id);
        const isDisabled = isSms ? !normaliseGhanaPhone(contact.phone) : contact.newsletter_status === 'unsubscribed';
        const detail = isSms ? (contact.phone || 'No phone number') : (contact.full_name ? contact.email : 'Email contact');
        return <label key={contact.id} className={`newsletter-contact-chip${isSelected ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}`}><input type="checkbox" checked={isSelected} disabled={isDisabled} onChange={() => toggle(contact.id)}/><span className="newsletter-contact-avatar" aria-hidden="true">{initials}</span><span className="newsletter-contact-copy"><strong>{name}</strong><small>{detail}</small></span><span className="newsletter-contact-source">{statusLabel(source)}</span><span className="newsletter-contact-check" aria-hidden="true">{isSelected ? '✓' : ''}</span></label>;
      })}</div>
      {isSms ? <label className="form-group newsletter-manual"><span className="form-label">Add any Ghana phone numbers</span><textarea className="form-textarea" rows="4" value={form.manual_numbers} onChange={event => setForm(previous => ({ ...previous, manual_numbers: event.target.value }))} placeholder={"One number per line\n0541234567\n+233541234568"}/><small>These can be new numbers that are not yet in Contacts. Duplicates are removed automatically.</small></label> : <label className="form-group newsletter-manual"><span className="form-label">Paste gathered contact emails</span><textarea className="form-textarea" rows="3" value={form.manual_recipients} onChange={event => setForm(previous => ({ ...previous, manual_recipients: event.target.value }))} placeholder="Only addresses already in the contacts directory will be used."/></label>}
    </div>}

    {tab === 'history' && <div className="newsletter-panel"><div className="newsletter-history-head"><div><h3>Campaign history</h3><p>Email and SMS delivery results with reusable campaign content.</p></div><button type="button" className="btn btn-outline-navy btn-sm" onClick={loadHistory}>Refresh</button></div>{history.length ? <div className="newsletter-history-list">{history.map(campaign => <article key={campaign.id} className="newsletter-history-card"><div><div className="newsletter-history-badges"><span className={`newsletter-status ${campaign.status}`}>{campaign.status}</span><span className={`newsletter-channel-badge is-${campaign.channel || 'email'}`}>{campaign.channel === 'sms' ? 'SMS' : 'Email'}</span></div><h4>{campaign.subject}</h4><p>{campaign.channel === 'sms' ? `Sender ID: ${campaign.sender}` : campaign.sender} · {campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : ''}</p></div><div className="newsletter-history-counts"><div className="newsletter-recipient-total"><strong>{campaign.recipient_count}</strong><small>recipient{campaign.recipient_count === 1 ? '' : 's'}</small></div><div className="newsletter-history-result-line"><button type="button" className="newsletter-view-recipients" onClick={() => loadCampaignRecipients(campaign)}>View recipients</button><span>{campaign.sent_count + campaign.mocked_count} successful{campaign.unknown_count ? `, ${campaign.unknown_count} unknown` : ''} · {campaign.failed_count} failed</span></div></div><div className="newsletter-history-actions"><button type="button" className="btn btn-outline-navy btn-sm" disabled={previewing} onClick={() => viewCampaign(campaign)}><Icon name="eye" size={15}/> View</button><button type="button" className="btn btn-outline-navy btn-sm" onClick={() => loadCampaign(campaign)}><Icon name="edit" size={15}/> Edit & resend</button><button type="button" className="btn btn-sm newsletter-history-delete" onClick={() => setDeletingCampaign(campaign)}><Icon name="trash" size={15}/> Delete</button></div></article>)}</div> : <div className="newsletter-empty"><h3>No campaign history yet</h3><p>Your next email or SMS send will appear here with its recipient-level results.</p></div>}</div>}
    {recipientCampaign && ReactDOM.createPortal(
      <div
        className="admin-modal-backdrop newsletter-recipients-backdrop"
        role="presentation"
        onMouseDown={event => {
          if (!resendingRecipient && event.target === event.currentTarget) {
            setRecipientCampaign(null);
            setRecipientSearch('');
          }
        }}
      >
        <section className="admin-modal-panel newsletter-recipients-modal" role="dialog" aria-modal="true" aria-labelledby="newsletter-recipients-title">
          <button className="admin-modal-close" type="button" disabled={Boolean(resendingRecipient)} onClick={() => { setRecipientCampaign(null); setRecipientSearch(''); }} aria-label="Close"><Icon name="x" size={16}/></button>
          <header className="newsletter-recipients-head">
            <p className="overline">Campaign recipients</p>
            <h2 id="newsletter-recipients-title">{recipientCampaign.subject}</h2>
            <p>{recipientCampaign.recipient_count} recipient{recipientCampaign.recipient_count === 1 ? '' : 's'} · {recipientCampaign.sent_count + recipientCampaign.mocked_count} successful · {recipientCampaign.failed_count} failed</p>
          </header>
          {!loadingRecipients && recipientDetails?.details_available && <label className="newsletter-recipient-search">
            <Icon name="search" size={16}/>
            <input type="search" value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} placeholder={recipientCampaign.channel === 'sms' ? 'Search recipient phone' : 'Search recipient email'} aria-label={recipientCampaign.channel === 'sms' ? 'Search recipient phone' : 'Search recipient email'} autoComplete="off" />
          </label>}
          {loadingRecipients ? <div className="newsletter-recipients-loading">Loading recipient results…</div> : !recipientDetails?.details_available ? <div className="newsletter-recipients-unavailable"><h3>Recipient-level results unavailable</h3><p>This historical campaign predates recipient-level tracking, and its aggregate outcome cannot be mapped safely to individual addresses.</p></div> : <div className="newsletter-recipient-columns">
            <section className="newsletter-recipient-column is-success">
              <div className="newsletter-recipient-column-head"><div><h3>Successful</h3><span>{normalizedRecipientSearch ? `${successfulRecipients.length}/${successfulRecipientTotal}` : successfulRecipientTotal}</span></div></div>
              <div className="newsletter-recipient-table" role="table" aria-label="Successful campaign recipients">{successfulRecipients.length ? successfulRecipients.map(recipient => <div className="newsletter-recipient-row" role="row" key={recipient.id}><div role="cell"><strong>{recipient.destination || recipient.email || recipient.phone}</strong><small>{statusLabel(recipient.status)} · {recipient.attempt_count} attempt{recipient.attempt_count === 1 ? '' : 's'}</small></div></div>) : <p className="newsletter-recipient-empty">{normalizedRecipientSearch ? 'No successful recipients match your search.' : 'No successful recipients.'}</p>}</div>
            </section>
            {uncertainRecipientTotal > 0 && <section className="newsletter-recipient-column is-uncertain">
              <div className="newsletter-recipient-column-head"><div><h3>Uncertain</h3><span>{normalizedRecipientSearch ? `${uncertainRecipients.length}/${uncertainRecipientTotal}` : uncertainRecipientTotal}</span></div><button type="button" className="btn btn-sm newsletter-resend-all" disabled={Boolean(resendingRecipient)} onClick={resendAllFailed}>{resendingRecipient === 'all' ? 'Resending…' : 'Resend all'}</button></div>
              <div className="newsletter-recipient-table" role="table" aria-label="Uncertain campaign recipients">{uncertainRecipients.length ? uncertainRecipients.map(recipient => <div className="newsletter-recipient-row" role="row" key={recipient.id}><div role="cell"><strong>{recipient.destination || recipient.email || recipient.phone}</strong><small>{recipient.error_message || statusLabel(recipient.status)} · {recipient.attempt_count} attempt{recipient.attempt_count === 1 ? '' : 's'}</small></div><button type="button" className="btn btn-outline-navy btn-sm" disabled={Boolean(resendingRecipient)} onClick={() => resendRecipient(recipient.id)}>{resendingRecipient === recipient.id ? 'Resending…' : 'Resend'}</button></div>) : <p className="newsletter-recipient-empty">{normalizedRecipientSearch ? 'No uncertain recipients match your search.' : 'No uncertain recipients.'}</p>}</div>
            </section>}
            <section className="newsletter-recipient-column is-failed">
              <div className="newsletter-recipient-column-head"><div><h3>Failed</h3><span>{normalizedRecipientSearch ? `${failedRecipients.length}/${failedRecipientTotal}` : failedRecipientTotal}</span></div>{uncertainRecipientTotal === 0 && <button type="button" className="btn btn-sm newsletter-resend-all" disabled={!recipientRows.some(recipient => !recipient.successful && ['disabled','failed','rejected','expired'].includes(recipient.status)) || Boolean(resendingRecipient)} onClick={resendAllFailed}>{resendingRecipient === 'all' ? 'Resending…' : 'Resend all'}</button>}</div>
              <div className="newsletter-recipient-table" role="table" aria-label="Failed campaign recipients">{failedRecipients.length ? failedRecipients.map(recipient => <div className="newsletter-recipient-row" role="row" key={recipient.id}><div role="cell"><strong>{recipient.destination || recipient.email || recipient.phone}</strong><small>{recipient.error_message || statusLabel(recipient.status)} · {recipient.attempt_count} attempt{recipient.attempt_count === 1 ? '' : 's'}</small></div><button type="button" className="btn btn-outline-navy btn-sm" disabled={!['disabled','failed','rejected','expired'].includes(recipient.status) || Boolean(resendingRecipient)} onClick={() => resendRecipient(recipient.id)}>{resendingRecipient === recipient.id ? 'Resending…' : 'Resend'}</button></div>) : <p className="newsletter-recipient-empty">{normalizedRecipientSearch ? 'No failed recipients match your search.' : 'No failed recipients.'}</p>}</div>
            </section>
          </div>}
        </section>
      </div>,
      document.body
    )}
    </>}
    {preview && ReactDOM.createPortal(<div className="admin-modal-backdrop newsletter-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><section className={`admin-modal-panel newsletter-preview-modal is-${preview.device}`} role="dialog" aria-modal="true" aria-label={`${preview.device} newsletter preview`}><button className="admin-modal-close" type="button" onClick={() => setPreview(null)} aria-label="Close"><Icon name="x" size={16}/></button><header className="newsletter-preview-head"><div><p className="overline">{preview.device} preview</p><h2>{preview.subject || 'Newsletter preview'}</h2><p>{preview.brand === 'bookshop' ? 'RealMindX Bookshop letterhead' : 'RealMindX Education letterhead'}</p></div><div className="newsletter-preview-switch"><button type="button" className={preview.device === 'mobile' ? 'active' : ''} onClick={() => setPreview(p => ({ ...p, device: 'mobile' }))}><Icon name="mobile" size={17}/> Phone</button><button type="button" className={preview.device === 'desktop' ? 'active' : ''} onClick={() => setPreview(p => ({ ...p, device: 'desktop' }))}><Icon name="monitor" size={17}/> Desktop</button></div></header><div className="newsletter-preview-stage"><iframe title="Newsletter email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html}/></div></section></div>, document.body)}
    {smsPreview && ReactDOM.createPortal(<div className="admin-modal-backdrop newsletter-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSmsPreview(null); }}><section className="admin-modal-panel newsletter-sms-preview-modal" role="dialog" aria-modal="true" aria-label="SMS campaign preview"><button className="admin-modal-close" type="button" onClick={() => setSmsPreview(null)} aria-label="Close"><Icon name="x" size={16}/></button><p className="overline">SMS campaign</p><h2>{smsPreview.subject}</h2><div className="newsletter-sms-phone-preview"><div className="newsletter-sms-phone-head"><span>{smsPreview.sender}</span><small>{smsCharacterMetrics(smsPreview.content?.message || '').segments} SMS part{smsCharacterMetrics(smsPreview.content?.message || '').segments === 1 ? '' : 's'}</small></div><p>{smsPreview.content?.message}</p></div><div className="newsletter-sms-preview-meta"><span>{smsCharacterMetrics(smsPreview.content?.message || '').characters} characters</span><span>{smsCharacterMetrics(smsPreview.content?.message || '').encoding}</span><span>{smsPreview.recipient_count} recipients</span></div></section></div>, document.body)}
    {deletingCampaign && ReactDOM.createPortal(<div className="admin-modal-backdrop newsletter-delete-backdrop" role="presentation" onMouseDown={event => { if (!deleting && event.target === event.currentTarget) setDeletingCampaign(null); }}><section className="admin-modal-panel newsletter-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="newsletter-delete-title"><div className="newsletter-delete-icon"><Icon name="trash" size={22}/></div><p className="overline">Delete history record</p><h2 id="newsletter-delete-title">Delete this campaign?</h2><p><strong>{deletingCampaign.subject}</strong> will be removed from campaign history. Contacts, subscribers, communication attempts, uploaded images, and audit records will not be deleted.</p><div className="newsletter-delete-actions"><button type="button" className="btn btn-outline-navy" disabled={deleting} onClick={() => setDeletingCampaign(null)}>Keep campaign</button><button type="button" className="btn newsletter-delete-confirm" disabled={deleting} onClick={deleteCampaign}>{deleting ? 'Deleting…' : 'Delete campaign'}</button></div></section></div>, document.body)}
    {!sendingCampaign && tab === 'audience' && <div className="newsletter-sendbar"><div><strong>{isSms ? selected.size + manualSmsRecipientCount : selected.size || 'No'} recipient{(isSms ? selected.size + manualSmsRecipientCount : selected.size) === 1 ? '' : 's'} selected</strong><small>{isSms ? `${smsMetrics.segments || 0} SMS part${smsMetrics.segments === 1 ? '' : 's'} per recipient · provider acceptance will be tracked` : 'Review this audience before sending.'}</small></div><button className="btn btn-primary" disabled={sending}>{sending ? 'Sending…' : isSms ? 'Send SMS campaign' : 'Send newsletter'}</button></div>}
  </form>;
};

const LegacyNewsletterComposer = ({ onSent }) => {
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
  const [audienceFilters, setAudienceFilters] = React.useState({ q: '', source: '' });
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
      const data = await api.adminListWithQuery('newsletters/audience', sp.toString());
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
        if (contact.newsletter_status !== 'unsubscribed') next.add(contact.id);
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
        contact_ids: Array.from(selectedContacts),
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
              <input className="form-input" value={audienceFilters.source} onChange={setFilter('source')} placeholder="Source e.g. teacher, bookshop, enquiry" />
              <button type="button" className="btn btn-outline-navy btn-sm" onClick={selectVisible}>Select visible</button>
            </div>
            <div className="newsletter-contact-list">
              {loadingAudience ? <p>Loading contacts...</p> : contacts.slice(0, 80).map(contact => (
                <label key={contact.id} className="newsletter-contact-row">
                  <input
                    type="checkbox"
                    checked={selectedContacts.has(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    disabled={contact.newsletter_status === 'unsubscribed'}
                  />
                  <span>
                    <strong>{contact.email}</strong>
                    <small>{(contact.sources || []).map(source => source.source || source).join(', ') || 'contact'}{contact.newsletter_status === 'unsubscribed' ? ' · newsletter unsubscribed' : ''}</small>
                  </span>
                </label>
              ))}
            </div>
            <label className="form-group" style={{ marginTop: 12 }}>
              <span className="form-label">Other gathered contacts by email</span>
              <textarea className="form-textarea" rows={3} value={form.manual_recipients} onChange={set('manual_recipients')} placeholder="Paste emails already present in the RealMindX contacts directory, separated by commas or new lines." />
            </label>
            <p className="admin-image-help">{selectedContacts.size} gathered contact(s) selected. Choose the sender address above before sending.</p>
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
  const [addressedNote, setAddressedNote] = React.useState('');
  const [confirmAddressed, setConfirmAddressed] = React.useState(false);
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
  React.useEffect(() => { if (!open) { setSelected(null); setProductUrl(''); setError(''); setConfirmAvailable(false); setAddressedNote(''); setConfirmAddressed(false); } }, [open]);
  if (!open) return null;

  const openDetail = async row => {
    setLoading(true); setError('');
    try { setSelected((await api.adminBookRequest(row.id)).request); setProductUrl(row.product_url || ''); setConfirmAvailable(false); setAddressedNote(row.addressed_note || ''); setConfirmAddressed(false); }
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
  const markAddressed = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.adminMarkBookRequestAddressed(selected.id, { note: addressedNote.trim() || undefined });
      setSelected((await api.adminBookRequest(response.request.id)).request);
      setConfirmAddressed(false);
      await load();
      onToast({ type: 'success', message: `${response.request.reference} was marked addressed.` });
    } catch (err) { setError(err?.message || 'Could not mark this request addressed.'); }
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
              {[['Status', { pending: 'Pending', available: 'Available', addressed: 'Addressed' }[selected.status] || selected.status], ['Client', selected.customer_name], ['Email', selected.email || 'Not supplied'], ['Phone', selected.phone || 'Not supplied'], ['Author', selected.author || 'Not supplied'], ['Publisher', selected.publisher || 'Not supplied'], ['Level / class', selected.level || 'Not supplied'], ['Requested', selected.created_at ? new Date(selected.created_at).toLocaleString() : '-']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
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
            {selected.status === 'pending' && canManage && <div className="book-request-addressed"><label><span>Addressed note (optional)</span><textarea value={addressedNote} onChange={event => { setAddressedNote(event.target.value); setConfirmAddressed(false); }} placeholder="How was this request handled? (e.g. sourced privately, client declined, out of print)"></textarea></label>{confirmAddressed ? <div className="book-request-confirm"><strong>Mark this request addressed?</strong><span>It will be removed from the pending queue and the daily stale digest.</span><div><button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={markAddressed}>{busy ? 'Saving...' : 'Mark addressed'}</button><button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setConfirmAddressed(false)}>Cancel</button></div></div> : <button className="btn btn-outline-navy" type="button" onClick={() => { setConfirmAddressed(true); setError(''); }}>Mark addressed</button>}</div>}
            {selected.status === 'addressed' && selected.addressed_note && <div className="book-request-note"><span>Addressed note</span><p>{selected.addressed_note}</p></div>}
            {selected.status === 'available' && canManage && ['failed'].some(value => [selected.availability_notification?.email, selected.availability_notification?.sms].includes(value)) && <button className="btn btn-primary" type="button" disabled={busy} onClick={retryNotification}>{busy ? 'Retrying...' : 'Retry failed notification'}</button>}
          </div>
        ) : (
          <>
            <div className="book-request-tools"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reference, title, or client" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="available">Available</option><option value="addressed">Addressed</option></select><label>Rows <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[5, 10, 20, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label></div>
            <div className="book-request-list" aria-busy={loading}>
              {loading && items.length === 0 ? <p className="book-request-empty">Loading requests...</p> : items.map(row => <button type="button" className="book-request-row" key={row.id} onClick={() => openDetail(row)}><span><strong>{row.requested_title}</strong><small>{row.reference} · {row.customer_name}</small></span><span><strong>{({ pending: 'Pending', available: 'Available', addressed: 'Addressed' })[row.status] || 'Pending'}</strong><small>{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</small></span></button>)}
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
  const [productCategory, setProductCategory] = React.useState('');
  const [showProductFilters, setShowProductFilters] = React.useState(true);
  const [productExportOpen, setProductExportOpen] = React.useState(false);
  const [productMenuId, setProductMenuId] = React.useState(null);
  const [selectedProductIds, setSelectedProductIds] = React.useState(() => new Set());
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
  const [showNewsletterSubscribers, setShowNewsletterSubscribers] = React.useState(false);
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
  React.useEffect(() => { setTablePage(1); }, [search, filterStatus, productCategory, tablePageSize, settlementCompany, settlementPayment, settlementStart, settlementEnd, resourceCategory, resourceLevel, resourceSubject]);

  const filteredByStatus = rows.filter(row => {
    if (filterStatus && row.status !== filterStatus) return false;
    if (config.collection === 'products' && productCategory && row.category !== productCategory) return false;
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
      const temporaryPassword = result?.temporary_password || '';
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

  const handleAutoSave = React.useCallback(async (payload, existingId) => {
    if (config.collection !== 'news') return null;
    if (existingId) {
      await api.adminUpdate('news', existingId, { ...payload, status: 'draft' });
      return { id: existingId };
    }
    const result = await api.adminCreate('news', { ...payload, status: 'draft' });
    if (result?.id) {
      await fetchCollection(config.collection, { force: true });
      return { id: result.id };
    }
    return null;
  }, [config.collection, fetchCollection]);

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
      const temporaryPassword = result?.temporary_password || '';
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
      const temporaryPassword = result?.temporary_password || '';
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

  const productCategories = [...new Set(rows.map(row => row.category).filter(Boolean))].sort();
  const allVisibleProductsSelected = paginatedRows.length > 0 && paginatedRows.every(row => selectedProductIds.has(row.id));
  const toggleVisibleProducts = () => {
    setSelectedProductIds(current => {
      const next = new Set(current);
      if (allVisibleProductsSelected) paginatedRows.forEach(row => next.delete(row.id));
      else paginatedRows.forEach(row => next.add(row.id));
      return next;
    });
  };
  const toggleProductSelection = id => {
    setSelectedProductIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={config.collection === 'products' ? 'admin-redesign-page product-admin-page' : ''}>
      {config.collection === 'products' ? (
        <div className="product-page-heading">
          <div className="product-page-copy">
            <h2 className="admin-page-title">Bookshop Products</h2>
            <p>Manage books, stationery, and learning materials in the public bookshop.</p>
            <span className="product-save-note"><Icon name="check" size={13} stroke={2.4} /> Changes saved here update the live website once published.</span>
          </div>
          <div className="product-heading-actions">
            {hasSessionPermission(session, 'bookRequests.view') && (
              <button className="product-heading-action" type="button" onClick={() => setShowBookRequests(true)}>
                <span className="product-heading-icon"><Icon name="book" size={21} stroke={2} /></span>
                <span><strong>Book Requests{pendingBookRequests ? ` (${pendingBookRequests})` : ''}</strong><small>View requests</small></span>
              </button>
            )}
            <button className="product-heading-action" type="button" onClick={() => setShowProductActions(true)}>
              <span className="product-heading-icon"><Icon name="more" size={22} stroke={2.2} /></span>
              <span><strong>More Actions</strong><small>Bulk actions</small></span>
            </button>
            {canCreate && (
              <button className="product-heading-action is-add" type="button" onClick={() => { setCreating(true); setEditing(null); }}>
                <span className="product-heading-icon"><Icon name="plus" size={22} stroke={2.3} /></span>
                <span><strong>Add Product</strong><small>Create new product</small></span>
              </button>
            )}
          </div>
        </div>
      ) : (
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
          {config.collection === 'newsletters' && (
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setShowNewsletterSubscribers(true)}>View Subscribers ({rows.length})</button>
          )}
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
      )}

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
        <NewsletterWorkspace onSent={() => fetchCollection(config.collection)} />
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
              onAutoSave={config.collection === 'news' ? handleAutoSave : undefined}
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

      {config.collection === 'products' && (
        <section className="admin-table-card product-table-card">
          <div className="product-filter-bar">
            <label className="product-search-field"><Icon name="search" size={18} stroke={2} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products by title, author, ISBN..." /></label>
            <select aria-label="Product status" value={filterStatus} onChange={event => setFilterStatus(event.target.value)}><option value="">All Statuses</option><option value="published">Published</option><option value="draft">Draft</option></select>
            <select aria-label="Product category" value={productCategory} onChange={event => setProductCategory(event.target.value)}><option value="">All Categories</option>{productCategories.map(category => <option key={category} value={category}>{category}</option>)}</select>
            <label className="product-rows-field"><span>Rows</span><select value={tablePageSize} onChange={event => setTablePageSize(Number(event.target.value))}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <button className="product-filter-button" type="button" onClick={() => setShowProductFilters(value => !value)}><Icon name="filter" size={17} stroke={2} /> Filters</button>
            {isApiMode() && <div className="product-export-wrap">
              <button className="product-export-button" type="button" aria-haspopup="menu" aria-expanded={productExportOpen} onClick={() => setProductExportOpen(value => !value)}><Icon name="download" size={17} stroke={2} /> Export <Icon name="chevDown" size={14} stroke={2.2} /></button>
              {productExportOpen && <div className="product-export-menu" role="menu">
                <a role="menuitem" href={api.adminExportUrl('products', 'zip')} onClick={() => setProductExportOpen(false)}><strong>ZIP</strong><span>Catalogue with images</span></a>
                <a role="menuitem" href={api.adminExportUrl('products', 'csv')} onClick={() => setProductExportOpen(false)}><strong>CSV</strong><span>Spreadsheet data</span></a>
                <a role="menuitem" href={api.adminExportUrl('products', 'xlsx')} onClick={() => setProductExportOpen(false)}><strong>XLSX</strong><span>Excel workbook</span></a>
              </div>}
            </div>}
          </div>
          {showProductFilters && <div className="product-filter-chips">
            <button type="button" onClick={() => setFilterStatus('')}>Status: {filterStatus ? statusLabel(filterStatus) : 'All'} <Icon name="x" size={12} stroke={2} /></button>
            <button type="button" onClick={() => setProductCategory('')}>Category: {productCategory || 'All'} <Icon name="x" size={12} stroke={2} /></button>
            {(filterStatus || productCategory || search) && <button className="is-clear" type="button" onClick={() => { setFilterStatus(''); setProductCategory(''); setSearch(''); }}><Icon name="clock" size={13} stroke={2} /> Clear all</button>}
          </div>}
          {loadError ? <EmptySection title="This section could not load" body="Please sign in again with the correct internal account." action="Open Sign In" onAction={() => { window.location.href = reloginPath; }} />
            : isLoading ? <EmptySection title="Loading Bookshop Products" body="One moment while the latest catalogue loads." />
            : sorted.length === 0 ? <EmptySection title="No Bookshop Products Yet" body="Use Add Product to create the first catalogue item." action={createAction} onAction={canCreate ? () => setCreating(true) : undefined} />
            : <AdminTableScroll><table className="admin-table product-redesign-table">
              <thead><tr>
                <th className="product-check-cell"><input type="checkbox" checked={allVisibleProductsSelected} onChange={toggleVisibleProducts} aria-label="Select all products on this page" /></th>
                <th onClick={() => toggleSort('name')}>Product <span>⇅</span></th><th onClick={() => toggleSort('category')}>Category <span>⇅</span></th><th onClick={() => toggleSort('curriculum')}>Curriculum <span>⇅</span></th><th onClick={() => toggleSort('publisher')}>Publisher <span>⇅</span></th><th onClick={() => toggleSort('price')}>Price (GH₵) <span>⇅</span></th><th onClick={() => toggleSort('stock_status')}>Stock <span>⇅</span></th><th onClick={() => toggleSort('updated_at')}>Last activity <span>⇅</span></th><th className="admin-actions-column">Actions</th>
              </tr></thead>
              <tbody>{paginatedRows.map(row => <tr key={row.id}>
                <td className="product-check-cell"><input type="checkbox" checked={selectedProductIds.has(row.id)} onChange={() => toggleProductSelection(row.id)} aria-label={`Select ${row.name}`} /></td>
                <td><div className="product-name-cell">{rowImageUrl(row) ? <img src={rowImageUrl(row)} alt="" loading="lazy" decoding="async" /> : <span className="product-cover-placeholder"><Icon name="book" size={20} /></span>}<span><strong>{row.name}</strong><small>{row.author ? `Author: ${row.author}` : row.short_description || `Product ID: ${row.id}`}</small></span></div></td>
                <td>{row.category || 'Uncategorised'}</td><td>{row.curriculum || '-'}</td><td>{row.publisher || '-'}</td><td className="product-price-cell">GH₵{Number(row.price || 0).toFixed(2)}</td>
                <td><span className={`product-stock-badge is-${row.stock_status || 'out_of_stock'}`}>{statusLabel(row.stock_status || 'out_of_stock')}</span></td><td className="admin-activity-date">{formatActivityDate(row.updated_at || row.created_at)}</td>
                <td className="admin-actions-column"><div className="product-row-actions">{canUpdate && <button type="button" onClick={() => { setEditing(row); setCreating(false); }}><Icon name="edit" size={15} stroke={2} /> Edit</button>}<div className="product-row-menu-wrap"><button className="is-menu" type="button" aria-label={`More actions for ${row.name}`} onClick={() => setProductMenuId(current => current === row.id ? null : row.id)}><Icon name="more" size={18} /></button>{productMenuId === row.id && <div className="product-row-menu">{canPublish && <button type="button" onClick={() => { togglePublish(row); setProductMenuId(null); }}>{row.status === 'published' ? 'Unpublish' : 'Publish'}</button>}{canDelete && <button className="danger" type="button" onClick={() => { handleDelete(row); setProductMenuId(null); }}>Delete</button>}</div>}</div></div></td>
              </tr>)}</tbody>
            </table></AdminTableScroll>}
          {sorted.length > 0 && <footer className="product-table-footer"><span>Showing {(tablePage - 1) * tablePageSize + 1} to {Math.min(tablePage * tablePageSize, sorted.length)} of {sorted.length} results</span><div className="product-pagination"><button type="button" disabled={tablePage === 1} onClick={() => setTablePage(page => page - 1)}><Icon name="chevL" size={15} /></button>{Array.from({ length: totalTablePages }, (_, index) => index + 1).filter(page => totalTablePages <= 6 || page <= 4 || page === totalTablePages).map((page, index, pages) => <React.Fragment key={page}>{index > 0 && page - pages[index - 1] > 1 ? <span>…</span> : null}<button className={page === tablePage ? 'is-active' : ''} type="button" onClick={() => setTablePage(page)}>{page}</button></React.Fragment>)}<button type="button" disabled={tablePage === totalTablePages} onClick={() => setTablePage(page => page + 1)}><Icon name="chevR" size={15} /></button></div></footer>}
        </section>
      )}

      {config.collection !== 'products' && (config.collection !== 'newsletters' || showNewsletterSubscribers) && <div className={config.collection === 'newsletters' ? 'admin-modal-backdrop newsletter-subscribers-backdrop' : ''} role={config.collection === 'newsletters' ? 'presentation' : undefined} onMouseDown={event => { if (config.collection === 'newsletters' && event.target === event.currentTarget) setShowNewsletterSubscribers(false); }}><section className={config.collection === 'newsletters' ? 'admin-modal-panel newsletter-subscribers-modal' : ''} role={config.collection === 'newsletters' ? 'dialog' : undefined} aria-modal={config.collection === 'newsletters' ? 'true' : undefined} aria-label={config.collection === 'newsletters' ? 'Newsletter subscribers' : undefined}>{config.collection === 'newsletters' && <><button className="admin-modal-close" type="button" onClick={() => setShowNewsletterSubscribers(false)} aria-label="Close"><Icon name="x" size={16} /></button><div className="newsletter-subscribers-title"><p className="overline">Newsletter audience</p><h2>Subscribers</h2><p>Search, review, edit, or remove newsletter subscriber records.</p></div></>}<div className="admin-table-card">
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
      </div></section></div>}

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
            <p className="admin-order-bulk-notice">Buy 10+ copies of the same text book and enjoy 10% off.</p>
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
                    <div><h4>Create Company Manager</h4><p>A unique temporary password is copied after creation and must be changed on first login.</p></div>
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
                      {canManageDeliveryCompanies && <button className="btn btn-outline-navy btn-sm" type="button" disabled={companyDetailBusy} onClick={() => resetCompanyManagerPassword(manager.id)}>Reset password</button>}
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

const TeacherAccountManageModal = ({ detail, onClose, canManageAccount, canManageDocuments, canManageVerification, onSaved }) => {
  const source = detail?.review || detail?.profile || {};
  const [manageForm, setManageForm] = React.useState(() => ({
    first_name: detail?.first_name || '',
    last_name: detail?.last_name || '',
    email: detail?.email || '',
    phone: detail?.phone || '',
    location: source?.location || '',
    teaching_subject: source?.teaching_subject || '',
    preferred_level: source?.preferred_level || '',
    curriculum_experience: source?.curriculum_experience || '',
    preferred_employment_type: source?.preferred_employment_type || '',
    bio: source?.bio || '',
    email_verified: Boolean(detail?.is_verified),
    phone_verified: Boolean(detail?.phone_verified),
    reason: '',
    cv: null,
    certificate: null,
  }));
  const [manageSaving, setManageSaving] = React.useState(false);

  const saveManagedAccount = async event => {
    event.preventDefault();
    if (!detail?.id || manageSaving) return;
    setManageSaving(true);
    try {
      const accountChanged = canManageAccount && (
        manageForm.first_name !== (detail.first_name || '') || manageForm.last_name !== (detail.last_name || '') ||
        manageForm.email !== (detail.email || '') || manageForm.phone !== (detail.phone || '') ||
        manageForm.location !== (source?.location || '') || manageForm.teaching_subject !== (source?.teaching_subject || '') ||
        manageForm.preferred_level !== (source?.preferred_level || '') || manageForm.curriculum_experience !== (source?.curriculum_experience || '') ||
        manageForm.preferred_employment_type !== (source?.preferred_employment_type || '') || manageForm.bio !== (source?.bio || '')
      );
      if (accountChanged) {
        await api.adminUpdateTeacherAccount(detail.id, {
          first_name: manageForm.first_name, last_name: manageForm.last_name,
          email: manageForm.email, phone: manageForm.phone, location: manageForm.location,
          teaching_subject: manageForm.teaching_subject, preferred_level: manageForm.preferred_level,
          curriculum_experience: manageForm.curriculum_experience, preferred_employment_type: manageForm.preferred_employment_type,
          bio: manageForm.bio, reason: manageForm.reason,
        });
      }
      const verificationChanged = canManageVerification && (manageForm.email_verified !== Boolean(detail.is_verified) || manageForm.phone_verified !== Boolean(detail.phone_verified));
      if (verificationChanged) await api.adminUpdateTeacherVerification(detail.id, { email_verified: manageForm.email_verified, phone_verified: manageForm.phone_verified, reason: manageForm.reason });
      if (manageForm.cv && canManageDocuments) await api.adminUploadTeacherDocument(detail.id, manageForm.cv, 'cv', manageForm.reason);
      if (manageForm.certificate && canManageDocuments) await api.adminUploadTeacherDocument(detail.id, manageForm.certificate, 'certificate', manageForm.reason);
      if (!accountChanged && !verificationChanged && !manageForm.cv && !manageForm.certificate) throw new Error('Make at least one change before saving.');
      globalToast.success('Teacher account changes saved in company records.');
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      globalToast.error(err?.message || 'Could not save teacher account changes.');
    } finally {
      setManageSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="presentation" style={{ zIndex: 850 }} onMouseDown={event => { if (event.target === event.currentTarget && !manageSaving) onClose(); }}>
      <form className="admin-modal-panel" onSubmit={saveManagedAccount} role="dialog" aria-modal="true" aria-label="Manage teacher account" style={{ width: 'min(720px, 94vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" className="admin-modal-close" onClick={onClose} disabled={manageSaving}><Icon name="x" size={16} /></button>
        <h3>Manage teacher account</h3>
        <p className="portal-field-help">Authorised changes take effect immediately and are kept in company records.</p>
        {canManageAccount ? <div className="profile-sections-grid" style={{ marginTop: 18 }}>
          {[['first_name','First name'],['last_name','Last name'],['email','Email'],['phone','Phone']].map(([key,label]) => <label className="form-group" key={key}><span className="form-label">{label}</span><input className="form-input" value={manageForm[key] || ''} onChange={event => setManageForm(prev => ({ ...prev, [key]: event.target.value }))} /></label>)}
          {[['location','Location'],['teaching_subject','Teaching subjects'],['preferred_level','Preferred levels'],['curriculum_experience','Curriculum experience'],['preferred_employment_type','Employment types'],['bio','Professional bio']].map(([key,label]) => <label className="form-group" key={key}><span className="form-label">{label}</span><textarea className="form-textarea" rows={key === 'bio' ? 4 : 2} value={manageForm[key] || ''} onChange={event => setManageForm(prev => ({ ...prev, [key]: event.target.value }))} /></label>)}
        </div> : null}
        {canManageVerification ? <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '16px 0' }}>
          <label className="portal-checkbox-row"><input type="checkbox" checked={Boolean(manageForm.email_verified)} onChange={event => setManageForm(prev => ({ ...prev, email_verified: event.target.checked }))} /> Email verified by RealMindX</label>
          <label className="portal-checkbox-row"><input type="checkbox" checked={Boolean(manageForm.phone_verified)} onChange={event => setManageForm(prev => ({ ...prev, phone_verified: event.target.checked }))} /> Phone verified by RealMindX</label>
        </div> : null}
        {canManageDocuments ? <div className="profile-sections-grid" style={{ marginTop: 16 }}>
          <label className="form-group"><span className="form-label">Replace CV</span><input type="file" className="form-input" accept=".pdf,.docx" onChange={event => setManageForm(prev => ({ ...prev, cv: event.target.files?.[0] || null }))} /></label>
          <label className="form-group"><span className="form-label">Replace certificate</span><input type="file" className="form-input" accept=".pdf,.docx" onChange={event => setManageForm(prev => ({ ...prev, certificate: event.target.files?.[0] || null }))} /></label>
        </div> : null}
        <label className="form-group" style={{ marginTop: 18 }}><span className="form-label">Reason for this authorised change</span><textarea className="form-textarea" rows={3} required minLength={8} value={manageForm.reason || ''} onChange={event => setManageForm(prev => ({ ...prev, reason: event.target.value }))} placeholder="Explain the request and why this staff-assisted change is authorised." /></label>
        <div className="admin-modal-actions-sticky" style={{ display: 'flex', gap: 10, marginTop: 16 }}><button className="btn btn-primary" disabled={manageSaving}>{manageSaving ? 'Saving...' : 'Save and audit changes'}</button><button type="button" className="btn btn-outline-navy" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  );
};

const splitTeacherTaxonomy = value => String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const teacherTaxonomyKey = value => String(value || '').trim().toLocaleLowerCase();

const matchesTeacherTaxonomy = (value, selected) => {
  if (!selected.length) return true;
  const available = new Set(splitTeacherTaxonomy(value).map(teacherTaxonomyKey));
  return selected.some(item => available.has(teacherTaxonomyKey(item)));
};

const teacherTaxonomyOptions = (canonical, teachers, field) => {
  const labels = new Map();
  [...canonical, ...(teachers || []).flatMap(teacher => splitTeacherTaxonomy(teacher[field]))].forEach(label => {
    const key = teacherTaxonomyKey(label);
    if (key && !labels.has(key)) labels.set(key, label);
  });
  return Array.from(labels.values()).sort((left, right) => left.localeCompare(right));
};

const TeacherTaxonomyFilter = ({ label, options, selected, onChange }) => {
  const [query, setQuery] = React.useState('');
  const detailsRef = React.useRef(null);
  const visibleOptions = options.filter(option => teacherTaxonomyKey(option).includes(teacherTaxonomyKey(query)));
  const toggle = option => onChange(
    selected.some(item => teacherTaxonomyKey(item) === teacherTaxonomyKey(option))
      ? selected.filter(item => teacherTaxonomyKey(item) !== teacherTaxonomyKey(option))
      : [...selected, option],
  );

  React.useEffect(() => {
    const closeOnOutsideClick = event => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) {
        detailsRef.current.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  return (
    <details className="teacher-taxonomy-filter" ref={detailsRef} onKeyDown={event => {
      if (event.key === 'Escape') {
        detailsRef.current?.removeAttribute('open');
        detailsRef.current?.querySelector('summary')?.focus();
      }
    }}>
      <summary>
        <span>{label}:</span>
        <strong>{selected.length ? `${selected.length} selected` : 'All'}</strong>
        <Icon name="chevD" size={13} />
      </summary>
      <div className="teacher-taxonomy-menu">
        <div className="teacher-taxonomy-menu-head">
          <strong>Filter by {label.toLowerCase()}</strong>
          {selected.length ? <button type="button" onClick={() => onChange([])}>Clear</button> : null}
        </div>
        <label className="teacher-taxonomy-search">
          <Icon name="search" size={14} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} />
        </label>
        <div className="teacher-taxonomy-options">
          {visibleOptions.length ? visibleOptions.map(option => {
            const checked = selected.some(item => teacherTaxonomyKey(item) === teacherTaxonomyKey(option));
            return (
              <label key={option}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option)} />
                <span>{option}</span>
              </label>
            );
          }) : <p>No matching options.</p>}
        </div>
      </div>
    </details>
  );
};

const TeacherFilterChips = ({ subjects, curricula, location, onSubjectsChange, onCurriculaChange, onLocationChange, resultCount, noun = 'teacher' }) => {
  if (!subjects.length && !curricula.length && !location) return null;
  return (
    <div className="teacher-active-filter-row">
      <span>{resultCount} matching {noun}{resultCount === 1 ? '' : 's'}</span>
      {subjects.map(subject => (
        <button type="button" key={`subject-${subject}`} onClick={() => onSubjectsChange(subjects.filter(item => item !== subject))}>
          Subject: {subject} <span aria-hidden="true">×</span>
        </button>
      ))}
      {curricula.map(curriculum => (
        <button type="button" key={`curriculum-${curriculum}`} onClick={() => onCurriculaChange(curricula.filter(item => item !== curriculum))}>
          Curriculum: {curriculum} <span aria-hidden="true">×</span>
        </button>
      ))}
      {location ? (
        <button type="button" onClick={() => onLocationChange('')}>
          Location: {location} <span aria-hidden="true">{'\u00d7'}</span>
        </button>
      ) : null}
      <button className="is-clear" type="button" onClick={() => { onSubjectsChange([]); onCurriculaChange([]); onLocationChange(''); }}>Clear all</button>
    </div>
  );
};

const TeachersView = ({ session }) => {
  const [teachers, setTeachers] = React.useState(null);
  const [teacherSummary, setTeacherSummary] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('active');
  const [profileFilter, setProfileFilter] = React.useState('');
  const [registeredFilter, setRegisteredFilter] = React.useState('all');
  const [subjectFilters, setSubjectFilters] = React.useState([]);
  const [curriculumFilters, setCurriculumFilters] = React.useState([]);
  const [locationFilter, setLocationFilter] = React.useState('');
  const [teacherPage, setTeacherPage] = React.useState(1);
  const [teacherPageSize, setTeacherPageSize] = React.useState(10);
  const [selectedTeacherIds, setSelectedTeacherIds] = React.useState(() => new Set());
  const [teacherMenuId, setTeacherMenuId] = React.useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false);
  const [detail, setDetail] = React.useState(null); // full profile object for the modal
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [showManageModal, setShowManageModal] = React.useState(false);
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
  const canManageAccount = hasSessionPermission(session, 'teachers.account.manage');
  const canManageDocuments = hasSessionPermission(session, 'teachers.documents.manage');
  const canManageVerification = hasSessionPermission(session, 'teachers.verification.manage');

  const reload = React.useCallback(() => {
    if (!isApiMode()) return;
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => { setTeachers(data.items || []); setTeacherSummary(data.summary || null); })
      .catch(() => { setTeachers([]); setTeacherSummary(null); });
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
    .filter(t => t.role === 'user' || !t.role)
    .filter(t => statusFilter === 'active' ? t.is_active !== false : statusFilter === 'disabled' ? t.is_active === false : true)
    .filter(t => profileFilter === 'complete' ? (t.profile_completion ?? 0) >= 100 : profileFilter === 'incomplete' ? (t.profile_completion ?? 0) < 100 || !t.phone_verified : true)
    .filter(t => matchesTeacherTaxonomy(t.teaching_subject, subjectFilters))
    .filter(t => matchesTeacherTaxonomy(t.curriculum_experience, curriculumFilters))
    .filter(t => !locationFilter.trim() || `${t.location || ''} ${t.preferred_locations || ''}`.toLocaleLowerCase().includes(locationFilter.trim().toLocaleLowerCase()))
    .filter(t => {
      if (registeredFilter === 'all' || !t.created_at) return true;
      const days = Number(registeredFilter);
      return Date.now() - new Date(t.created_at).getTime() <= days * 86400000;
    });
  const rankedTeachers = rankByFuzzyMatch(filtered, search, t => `${t.first_name} ${t.last_name} ${t.email} ${t.phone || ''}`);
  const subjectOptions = React.useMemo(
    () => teacherTaxonomyOptions(TEACHING_SUBJECTS, teachers, 'teaching_subject'),
    [teachers],
  );
  const curriculumOptions = React.useMemo(
    () => teacherTaxonomyOptions(TEACHING_CURRICULA, teachers, 'curriculum_experience'),
    [teachers],
  );
  const teacherPageCount = Math.max(1, Math.ceil(rankedTeachers.length / teacherPageSize));
  const visibleTeachers = rankedTeachers.slice((teacherPage - 1) * teacherPageSize, teacherPage * teacherPageSize);
  const allVisibleTeachersSelected = visibleTeachers.length > 0 && visibleTeachers.every(t => selectedTeacherIds.has(t.id));
  const reminderEligibleCount = (teachers || [])
    .filter(t => (t.role === 'user' || !t.role) && t.is_active !== false && ((t.profile_completion ?? 0) < 100 || !t.phone_verified))
    .length;

  React.useEffect(() => { setTeacherPage(1); }, [search, statusFilter, profileFilter, registeredFilter, subjectFilters, curriculumFilters, locationFilter, teacherPageSize]);
  React.useEffect(() => { setTeacherPage(page => Math.min(page, teacherPageCount)); }, [teacherPageCount]);

  const toggleTeacherSelection = id => setSelectedTeacherIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisibleTeachers = () => setSelectedTeacherIds(current => {
    const next = new Set(current);
    if (allVisibleTeachersSelected) visibleTeachers.forEach(t => next.delete(t.id));
    else visibleTeachers.forEach(t => next.add(t.id));
    return next;
  });
  const selectedTeachers = (teachers || []).filter(t => selectedTeacherIds.has(t.id));
  const exportSelectedTeachers = () => {
    if (!selectedTeachers.length) return;
    const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      ['Name', 'Email', 'Phone', 'Profile completion', 'Status', 'Registered'],
      ...selectedTeachers.map(t => [[t.first_name, t.last_name].filter(Boolean).join(' '), t.email, t.phone || '', `${t.profile_completion ?? 0}%`, t.is_active === false ? 'Disabled' : 'Active', t.created_at || '']),
    ].map(row => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'realmindx-selected-teachers.csv'; link.click();
    URL.revokeObjectURL(url);
  };

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
      reload();
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
      reload();
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

  const sendSelectedProfileReminders = async () => {
    if (!selectedTeachers.length) return;
    setBatchReminding(true);
    const results = await Promise.allSettled(selectedTeachers.map(t => api.adminCreate(`users/${t.id}/profile-reminder`, {})));
    const sent = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - sent;
    if (sent) globalToast.success(`Sent ${sent} profile reminder${sent === 1 ? '' : 's'}.`);
    if (failed) globalToast.warning(`${failed} selected reminder${failed === 1 ? '' : 's'} could not be sent.`);
    setBatchReminding(false);
  };

  const disableSelectedTeachers = async () => {
    if (!selectedTeachers.length) return;
    setBatchReminding(true);
    const activeSelected = selectedTeachers.filter(t => t.is_active !== false);
    const results = await Promise.allSettled(activeSelected.map(t => api.adminPatch('users', t.id, { status: 'inactive' })));
    const disabledIds = new Set(activeSelected.filter((_, index) => results[index]?.status === 'fulfilled').map(t => t.id));
    setTeachers(current => (current || []).map(t => disabledIds.has(t.id) ? { ...t, is_active: false } : t));
    setSelectedTeacherIds(new Set());
    reload();
    setBatchReminding(false);
  };

  const deleteSelectedTeachers = async () => {
    setBulkDeleteConfirm(false);
    if (!selectedTeachers.length) return;
    setBatchReminding(true);
    const results = await Promise.allSettled(selectedTeachers.map(t => api.adminDelete('users', t.id)));
    const deletedIds = new Set(selectedTeachers.filter((_, index) => results[index]?.status === 'fulfilled').map(t => t.id));
    setTeachers(current => (current || []).filter(t => !deletedIds.has(t.id)));
    setSelectedTeacherIds(new Set());
    reload();
    setBatchReminding(false);
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

  const stats = teacherSummary || {
    total_teachers: (teachers || []).length,
    active_teachers: (teachers || []).filter(t => t.is_active !== false).length,
    incomplete_profiles: (teachers || []).filter(t => (t.profile_completion ?? 0) < 100 || !t.phone_verified).length,
    disabled_accounts: (teachers || []).filter(t => t.is_active === false).length,
    excluded_internal_accounts: 0,
  };

  return (
    <div className="admin-redesign-page teachers-admin-page">
      <div className="teachers-page-heading">
        <div><h2 className="admin-page-title">Active Teachers</h2><p>Manage verified teacher accounts. Use filters and bulk actions to keep your data clean and accurate.</p></div>
        <div className="teachers-heading-actions">
          {isApiMode() && canExportTeachers && <><a href={api.adminExportUrl('users','csv')}><Icon name="file" size={18} /> Export CSV</a><a href={api.adminExportUrl('users','xlsx')}><Icon name="file" size={18} /> Export Excel</a></>}
          {canEditTeachers && <button type="button" onClick={openBatchProfileReminderConfirm} disabled={batchReminding || reminderEligibleCount === 0}><Icon name="send" size={18} /> {batchReminding ? 'Sending…' : 'Remind Incomplete'}</button>}
        </div>
      </div>

      <div className="teacher-stat-grid">
        {[
          { label: 'Total Teachers', value: stats.total_teachers, icon: 'teacher', tone: 'blue' },
          { label: 'Active Teachers', value: stats.active_teachers, icon: 'teacher', tone: 'green' },
          { label: 'Incomplete Profiles', value: stats.incomplete_profiles, icon: 'teacher', tone: 'orange', progress: stats.total_teachers ? Math.round((stats.incomplete_profiles / stats.total_teachers) * 100) : 0 },
          { label: 'Disabled Accounts', value: stats.disabled_accounts, icon: 'teacher', tone: 'red' },
          { label: 'Admins & Staff Excluded', value: stats.excluded_internal_accounts, icon: 'users', tone: 'gray' },
        ].map(stat => <div className="teacher-stat-card" data-tone={stat.tone} key={stat.label}><span className="teacher-stat-icon"><Icon name={stat.icon} size={23} stroke={1.8} /></span><span><small>{stat.label}</small><strong>{stat.value ?? 0}</strong></span>{stat.progress != null && <span className="teacher-stat-progress" style={{ '--progress': `${stat.progress * 3.6}deg` }}>{stat.progress}%</span>}</div>)}
      </div>

      <section className="admin-table-card teacher-table-card">
        <div className="teacher-filter-bar">
          <label>Status: <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All</option><option value="active">Active</option><option value="disabled">Disabled</option></select><button type="button" aria-label="Clear status filter" onClick={() => setStatusFilter('')}>×</button></label>
          <label>Profile: <select value={profileFilter} onChange={event => setProfileFilter(event.target.value)}><option value="">All</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></select><button type="button" aria-label="Clear profile filter" onClick={() => setProfileFilter('')}>×</button></label>
          <label className="teacher-date-filter"><Icon name="calendar" size={15} /> Registered: <select value={registeredFilter} onChange={event => setRegisteredFilter(event.target.value)}><option value="all">All Time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option></select></label>
          <TeacherTaxonomyFilter label="Subject" options={subjectOptions} selected={subjectFilters} onChange={setSubjectFilters} />
          <TeacherTaxonomyFilter label="Curriculum" options={curriculumOptions} selected={curriculumFilters} onChange={setCurriculumFilters} />
          <label className="teacher-location-filter"><Icon name="search" size={15} /><input value={locationFilter} onChange={event => setLocationFilter(event.target.value)} placeholder="Current or preferred location..." aria-label="Search teachers by current or preferred location" />{locationFilter ? <button type="button" aria-label="Clear location filter" onClick={() => setLocationFilter('')}>{'\u00d7'}</button> : null}</label>
          <label className="teacher-search-field"><Icon name="search" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, email or phone..." /></label>
          <button className="teacher-filter-icon" type="button" aria-label="Clear all filters" onClick={() => { setStatusFilter('active'); setProfileFilter(''); setRegisteredFilter('all'); setSubjectFilters([]); setCurriculumFilters([]); setLocationFilter(''); setSearch(''); }}><Icon name="filter" size={17} /></button>
        </div>

        <TeacherFilterChips subjects={subjectFilters} curricula={curriculumFilters} location={locationFilter.trim()} onSubjectsChange={setSubjectFilters} onCurriculaChange={setCurriculumFilters} onLocationChange={setLocationFilter} resultCount={rankedTeachers.length} />

        {selectedTeachers.length > 0 && <div className="teacher-bulk-bar"><strong><button type="button" onClick={() => setSelectedTeacherIds(new Set())}>×</button>{selectedTeachers.length} teacher{selectedTeachers.length === 1 ? '' : 's'} selected</strong><div>{canEditTeachers && <><button type="button" onClick={sendSelectedProfileReminders}><Icon name="send" size={15} /> Send Reminder</button><button type="button" onClick={disableSelectedTeachers}><Icon name="ban" size={15} /> Disable</button></>}<button type="button" onClick={exportSelectedTeachers}><Icon name="download" size={15} /> Export Selected</button>{canDeleteTeachers && <button className="danger" type="button" onClick={() => setBulkDeleteConfirm(true)}><Icon name="trash" size={15} /> Delete</button>}</div></div>}

        {!isApiMode() ? <EmptySection title="API mode required" body="Connect the Flask backend to see registered teachers." />
          : teachers === null ? <EmptySection title="Loading…" body="" />
          : rankedTeachers.length === 0 ? <EmptySection title="No matching teachers" body="Try changing the filters or search term." />
          : <AdminTableScroll><table className="admin-table teacher-redesign-table">
            <thead><tr><th className="teacher-check-cell"><input type="checkbox" checked={allVisibleTeachersSelected} onChange={toggleVisibleTeachers} aria-label="Select all teachers on this page" /></th><th>Teacher <span>⌃</span></th><th>Email <span>⌃</span></th><th>Phone <span>⌃</span></th><th>Profile completion <span>⌃</span></th><th>Status <span>⌃</span></th><th>Registered <span>⌃</span></th><th>Actions</th></tr></thead>
            <tbody>{visibleTeachers.map((t, index) => {
              const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unknown';
              const initials = [t.first_name, t.last_name].filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'T';
              const completion = Math.max(0, Math.min(100, t.profile_completion ?? 0));
              return <tr key={t.id} className={selectedTeacherIds.has(t.id) ? 'is-selected' : ''}><td className="teacher-check-cell"><input type="checkbox" checked={selectedTeacherIds.has(t.id)} onChange={() => toggleTeacherSelection(t.id)} aria-label={`Select ${name}`} /></td>
                <td><div className="teacher-name-cell"><span className={`teacher-avatar tone-${(t.id || index) % 5}`}>{initials}</span><strong>{name}</strong></div></td>
                <td><VerifiedContactValue value={t.email} verified={t.is_verified} type="Email" /></td><td><VerifiedContactValue value={t.phone} verified={t.phone_verified} type="Phone" /></td>
                <td><span className={`teacher-completion-ring ${completion >= 100 ? 'is-complete' : ''}`} style={{ '--completion': `${completion * 3.6}deg` }}><b>{completion}%</b></span></td>
                <td><span className={`teacher-status-pill ${t.is_active === false ? 'is-disabled' : ''}`}>{t.is_active === false ? 'Disabled' : 'Active'}</span></td>
                <td>{t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                <td><div className="teacher-row-actions"><button type="button" onClick={() => openDetail(t)}>View Profile</button><div className="teacher-row-menu-wrap"><button className="is-menu" type="button" aria-label={`More actions for ${name}`} onClick={() => setTeacherMenuId(current => current === t.id ? null : t.id)}><Icon name="more" size={18} /></button>{teacherMenuId === t.id && <div className="teacher-row-menu">{canEditTeachers && <><button type="button" onClick={() => { sendProfileReminder(t); setTeacherMenuId(null); }}>Send Profile Reminder</button><button type="button" onClick={() => { toggleActive(t); setTeacherMenuId(null); }}>{t.is_active === false ? 'Enable' : 'Disable'}</button></>}{canDeleteTeachers && <button className="danger" type="button" onClick={() => { deleteTeacher(t); setTeacherMenuId(null); }}>Delete</button>}</div>}</div></div></td>
              </tr>;
            })}</tbody>
          </table></AdminTableScroll>}
        <footer className="teacher-table-footer"><span>Showing {rankedTeachers.length ? (teacherPage - 1) * teacherPageSize + 1 : 0} to {Math.min(teacherPage * teacherPageSize, rankedTeachers.length)} of {rankedTeachers.length} teachers</span><label><select value={teacherPageSize} onChange={event => setTeacherPageSize(Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size} per page</option>)}</select></label><div className="product-pagination"><button type="button" disabled={teacherPage === 1} onClick={() => setTeacherPage(page => page - 1)}><Icon name="chevL" size={15} /></button>{Array.from({ length: teacherPageCount }, (_, index) => index + 1).filter(page => teacherPageCount <= 5 || page <= 3 || page === teacherPageCount).map((page, index, pages) => <React.Fragment key={page}>{index > 0 && page - pages[index - 1] > 1 && <span>…</span>}<button type="button" className={teacherPage === page ? 'is-active' : ''} onClick={() => setTeacherPage(page)}>{page}</button></React.Fragment>)}<button type="button" disabled={teacherPage === teacherPageCount} onClick={() => setTeacherPage(page => page + 1)}><Icon name="chevR" size={15} /></button></div></footer>
      </section>


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

      {bulkDeleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-teacher-delete-title" style={{ position:'relative', background:'#fff', borderRadius:18, padding:'34px 32px 30px', width:'100%', maxWidth:500, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={() => setBulkDeleteConfirm(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            <div style={{ width:58, height:58, borderRadius:'50%', background:'#fff0f2', display:'grid', placeItems:'center', margin:'0 auto 20px', color:'#d62f43' }}><Icon name="trash" size={24} /></div>
            <h3 id="bulk-teacher-delete-title" style={{ color:'var(--navy)', textAlign:'center', marginBottom:10 }}>Delete selected teachers?</h3>
            <p style={{ color:'var(--gray-600)', textAlign:'center', lineHeight:1.6, marginBottom:24 }}>This permanently deletes {selectedTeachers.length} selected teacher account{selectedTeachers.length === 1 ? '' : 's'}. Accounts with placement history will be safely rejected by the server.</p>
            <div style={{ display:'flex', gap:12 }}><button className="btn btn-outline-navy" style={{ flex:1 }} type="button" onClick={() => setBulkDeleteConfirm(false)}>Cancel</button><button className="btn btn-primary" style={{ flex:1, background:'#d62f43', borderColor:'#d62f43' }} type="button" onClick={deleteSelectedTeachers}>Delete</button></div>
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
        <div className="admin-modal-backdrop teacher-detail-backdrop">
          <div className="teacher-detail-modal" role="dialog" aria-modal="true" aria-label="Teacher account details">
            {/* Modal header */}
            <header className="teacher-detail-modal-header">
              <div className="teacher-detail-identity">
                {detail.profile_picture_url ? (
                  <img src={detail.profile_picture_url} alt="" style={{ width:76, height:76, borderRadius:'50%', objectFit:'cover', border:'3px solid rgba(255,255,255,0.35)' }} />
                ) : (
                  <div className="teacher-detail-avatar">
                    {([detail.first_name?.[0], detail.last_name?.[0]].filter(Boolean).join('').toUpperCase()) || 'T'}
                  </div>
                )}
                <div className="teacher-detail-identity-copy">
                  <div>
                    {[detail.first_name, detail.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </div>
                  <span>{detail.email}</span>
                </div>
              </div>
              <div className="teacher-detail-header-actions">
                <span className={`badge ${detail.is_active !== false ? 'badge-success' : 'badge-danger'}`} style={{ fontSize:'0.72rem' }}>
                  {detail.is_active !== false ? 'Active' : 'Disabled'}
                </span>
                <button className="teacher-detail-close" type="button" onClick={() => setDetail(null)} aria-label="Close teacher details">
                  <Icon name="x" size={16} />
                </button>
              </div>
            </header>

            {/* Modal body */}
            <div className="teacher-detail-modal-body">
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
                      <div className="teacher-detail-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', marginBottom:20 }}>
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
                          <div className="teacher-detail-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
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
                        <div className="teacher-detail-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 14px' }}>
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
                      <div className="teacher-detail-form-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
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
            <footer className="teacher-detail-modal-footer">
              {(canManageAccount || canManageDocuments || canManageVerification) ? (
                <button
                  className="btn btn-outline-navy btn-sm teacher-detail-footer-action is-manage"
                  type="button"
                  onClick={() => setShowManageModal(true)}
                  aria-label="Manage teacher account"
                  title="Manage teacher account"
                >
                  <Icon name="edit" size={16} />
                  <span>Manage Account</span>
                </button>
              ) : null}
              {canDeleteTeachers ? (
                <button
                  className="btn btn-danger btn-sm teacher-detail-footer-action is-delete"
                  disabled={deleting === detail.id}
                  onClick={() => deleteTeacher(detail)}
                  aria-label={deleting === detail.id ? 'Deleting account' : 'Delete account'}
                  title={deleting === detail.id ? 'Deleting account' : 'Delete account'}
                >
                  <Icon name="trash" size={16} />
                  <span>{deleting === detail.id ? 'Deleting…' : 'Delete Account'}</span>
                </button>
              ) : null}
              {canEditTeachers ? (
                <button
                  className={`btn btn-outline-navy btn-sm teacher-detail-footer-action ${detail.is_active !== false ? 'is-disable' : 'is-enable'}`}
                  style={detail.is_active !== false ? { color:'#92400e', borderColor:'#d97706' } : { color:'#166534', borderColor:'#16a34a' }}
                  disabled={toggling === detail.id}
                  onClick={() => toggleActive(detail)}
                  aria-label={toggling === detail.id ? 'Saving account status' : detail.is_active !== false ? 'Disable account' : 'Enable account'}
                  title={toggling === detail.id ? 'Saving account status' : detail.is_active !== false ? 'Disable account' : 'Enable account'}
                >
                  <Icon name={detail.is_active !== false ? 'lock' : 'check'} size={16} />
                  <span>{toggling === detail.id ? 'Saving…' : detail.is_active !== false ? 'Disable Account' : 'Enable Account'}</span>
                </button>
              ) : null}
              <button className="btn btn-outline-navy btn-sm teacher-detail-footer-action is-close" type="button" onClick={() => setDetail(null)} aria-label="Close teacher details" title="Close teacher details">
                <Icon name="x" size={16} />
                <span>Close</span>
              </button>
            </footer>
          </div>
        </div>
      )}
      {showManageModal && detail ? (
        <TeacherAccountManageModal
          detail={detail}
          onClose={() => setShowManageModal(false)}
          canManageAccount={canManageAccount}
          canManageDocuments={canManageDocuments}
          canManageVerification={canManageVerification}
          onSaved={async () => { reload(); if (detail?.id) await openDetail(detail); }}
        />
      ) : null}
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
    twoFactorEnabled: Boolean(user.two_factor_enabled ?? user.twoFactorEnabled),
    mfaRecommended: Boolean(user.mfa_recommended ?? user.mfaRecommended),
  };
};

const AccountView = ({ session, onPasswordChanged, onTwoFactorChanged }) => {
  const [form, setForm] = React.useState({ current_password: '', new_password: '', confirm_password: '' });
  const [status, setStatus] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [security, setSecurity] = React.useState({
    enabled: Boolean(session?.twoFactorEnabled),
    recommended: false,
    loading: isApiMode(),
    error: '',
  });
  const [securityModal, setSecurityModal] = React.useState(false);
  const [twoFactorForm, setTwoFactorForm] = React.useState({
    step: 'password',
    currentPassword: '',
    otp: '',
    saving: false,
    message: '',
    error: '',
  });

  const loadSecurity = React.useCallback(async () => {
    if (!isApiMode()) {
      setSecurity(current => ({ ...current, loading: false }));
      return;
    }
    setSecurity(current => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.fetchSecurityStatus();
      setSecurity({
        enabled: Boolean(result.two_factor_enabled),
        recommended: Boolean(result.mfa_recommended),
        loading: false,
        error: '',
      });
    } catch (error) {
      setSecurity(current => ({
        ...current,
        loading: false,
        error: error?.message || 'Could not load two-factor settings. Try again.',
      }));
    }
  }, []);

  React.useEffect(() => {
    loadSecurity();
  }, [loadSecurity]);

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

  const openTwoFactorModal = async () => {
    setTwoFactorForm({ step: 'password', currentPassword: '', otp: '', saving: false, message: '', error: '' });
    setSecurityModal(true);
    await loadSecurity();
  };

  const requestTwoFactorChange = async event => {
    event.preventDefault();
    const action = security.enabled ? 'disable' : 'enable';
    setTwoFactorForm(current => ({ ...current, saving: true, error: '', message: '' }));
    try {
      const result = await api.requestTwoFactorChange({
        action,
        current_password: twoFactorForm.currentPassword,
      });
      setTwoFactorForm(current => ({
        ...current,
        step: 'code',
        saving: false,
        message: result.message || `A security code was sent to ${session?.email}.`,
      }));
    } catch (error) {
      setTwoFactorForm(current => ({
        ...current,
        saving: false,
        error: error?.message || 'Could not start that security change. Try again.',
      }));
    }
  };

  const confirmTwoFactorChange = async event => {
    event.preventDefault();
    const otp = twoFactorForm.otp.replace(/\D/g, '');
    if (otp.length !== 6) {
      setTwoFactorForm(current => ({ ...current, error: 'Enter the 6 digit code from your email.' }));
      return;
    }
    setTwoFactorForm(current => ({ ...current, saving: true, error: '' }));
    try {
      const result = await api.confirmTwoFactorChange({ otp });
      const enabled = Boolean(result.two_factor_enabled);
      setSecurity(current => ({ ...current, enabled, recommended: !enabled, error: '' }));
      onTwoFactorChanged?.(enabled, Boolean(result.mfa_recommended));
      setSecurityModal(false);
      globalToast.success(result.message || 'Two-factor authentication updated.');
    } catch (error) {
      setTwoFactorForm(current => ({
        ...current,
        saving: false,
        error: error?.message || 'Could not verify that code. Check it and try again.',
      }));
    }
  };

  return (
    <div style={{ padding: '32px 28px' }}>
      <div className="admin-table-card" style={{ maxWidth: 720, padding: '32px 36px', marginBottom: 20 }}>
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

      <div className="admin-table-card" style={{ maxWidth: 720, padding: '28px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: security.enabled ? '#ecfdf3' : '#fff7ed', color: security.enabled ? '#027a48' : '#b54708' }}>
                <Icon name={security.enabled ? 'check' : 'shield'} size={18} />
              </span>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--navy)' }}>Email two-factor authentication</h4>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: security.enabled ? '#027a48' : '#b54708' }}>
                  {security.loading ? 'Checking status...' : security.enabled ? 'On' : 'Recommended for internal accounts'}
                </span>
              </div>
            </div>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.86rem', lineHeight: 1.65, margin: 0 }}>
              {security.enabled
                ? 'Each sign-in requires a short-lived code sent to your verified email after your password.'
                : 'Add a second sign-in step to protect administrative access if a password is exposed. Setup takes about a minute and does not sign you out.'}
            </p>
            {security.error ? <p style={{ color: '#b42318', fontSize: '0.82rem', margin: '10px 0 0' }}>{security.error}</p> : null}
          </div>
          <button type="button" className={security.enabled ? 'btn btn-outline-navy' : 'btn btn-primary'} onClick={openTwoFactorModal} disabled={security.loading}>
            {security.enabled ? 'Manage 2FA' : 'Turn on 2FA'}
          </button>
        </div>
      </div>

      {securityModal ? (
        <div
          role="presentation"
          onMouseDown={event => { if (event.target === event.currentTarget && !twoFactorForm.saving) setSecurityModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(12, 22, 46, 0.62)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <form
            className="admin-table-card"
            onSubmit={twoFactorForm.step === 'code' ? confirmTwoFactorChange : requestTwoFactorChange}
            role="dialog"
            aria-modal="true"
            aria-labelledby="two-factor-modal-title"
            style={{ position: 'relative', width: '100%', maxWidth: 540, padding: '30px 32px 26px', borderRadius: 20, boxShadow: '0 28px 80px rgba(9, 20, 43, 0.24)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
              <div>
                <span className="auth-badge" style={{ display: 'inline-flex', marginBottom: 10 }}>Account security</span>
                <h3 id="two-factor-modal-title" style={{ margin: '0 0 7px', color: 'var(--navy)' }}>
                  {security.enabled ? 'Turn off two-factor authentication' : 'Turn on two-factor authentication'}
                </h3>
                <p style={{ margin: 0, color: 'var(--gray-600)', fontSize: '0.86rem', lineHeight: 1.6 }}>
                  {twoFactorForm.step === 'code'
                    ? <>Enter the 6 digit code sent to <strong>{session?.email}</strong>.</>
                    : <>Confirm with your current password. We will send a short-lived code to <strong>{session?.email}</strong>.</>}
                </p>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setSecurityModal(false)} disabled={twoFactorForm.saving} aria-label="Close two-factor settings"><Icon name="x" size={16} /></button>
            </div>

            {twoFactorForm.step === 'code' ? (
              <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)' }}>
                Security code
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={twoFactorForm.otp}
                  onChange={event => setTwoFactorForm(current => ({ ...current, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  required
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '1rem', letterSpacing: '0.16em' }}
                />
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)' }}>
                Current password
                <PasswordRevealInput autoFocus name="two_factor_password" value={twoFactorForm.currentPassword} onChange={event => setTwoFactorForm(current => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" required />
              </label>
            )}
            {twoFactorForm.message ? <p style={{ margin: '12px 0 0', color: '#027a48', fontSize: '0.83rem' }}>{twoFactorForm.message}</p> : null}
            {twoFactorForm.error ? <p style={{ margin: '12px 0 0', color: '#b42318', fontSize: '0.83rem' }}>{twoFactorForm.error}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              {twoFactorForm.step === 'code' ? (
                <button type="button" className="btn btn-outline-navy" disabled={twoFactorForm.saving} onClick={() => setTwoFactorForm(current => ({ ...current, step: 'password', otp: '', message: '', error: '' }))}>Start again</button>
              ) : (
                <button type="button" className="btn btn-outline-navy" disabled={twoFactorForm.saving} onClick={() => setSecurityModal(false)}>Cancel</button>
              )}
              <button type="submit" className={security.enabled && twoFactorForm.step === 'password' ? 'btn btn-outline-navy' : 'btn btn-primary'} disabled={twoFactorForm.saving}>
                {twoFactorForm.saving ? 'Please wait...' : twoFactorForm.step === 'code' ? 'Confirm code' : security.enabled ? 'Continue to disable' : 'Send security code'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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

const STATUS_LABELS = {
  submitted: 'Pending',
  under_review: 'Under review',
  revision_required: 'Revision required',
  verified: 'Visually verified',
  rejected: 'Rejected',
};
const STATUS_OPTIONS = ['', 'submitted', 'under_review', 'revision_required', 'verified', 'rejected'];

const statusBadgeClass = (s) => {
  const map = { submitted: 'badge-navy', under_review: 'badge-warning', revision_required: 'badge-warning', verified: 'badge-success', rejected: 'badge-danger' };
  return map[s] || 'badge-navy';
};

const TeacherReviewView = ({ session }) => {
  const [queue, setQueue] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [perPage] = React.useState(50);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [subjectFilters, setSubjectFilters] = React.useState([]);
  const [curriculumFilters, setCurriculumFilters] = React.useState([]);
  const [locationFilter, setLocationFilter] = React.useState('');
  const [debouncedLocationFilter, setDebouncedLocationFilter] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const queueReqRef = React.useRef(0);
  const detailReqRef = React.useRef(0);

  // action states
  const [startingReview, setStartingReview] = React.useState(false);
  const [showRevisionModal, setShowRevisionModal] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState('');
  const [revisionSaving, setRevisionSaving] = React.useState(false);
  const [showRejectModal, setShowRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejectSaving, setRejectSaving] = React.useState(false);
  const [showVerifyModal, setShowVerifyModal] = React.useState(false);
  const [checklist, setChecklist] = React.useState({
    required_documents_present: false,
    documents_readable: false,
    identity_details_consistent: false,
    qualifications_consistent: false,
    teaching_details_consistent: false,
    no_obvious_alteration_detected: false,
  });
  const [verifySaving, setVerifySaving] = React.useState(false);
  const [showVerifyConfirm, setShowVerifyConfirm] = React.useState(false);
  const [showReopenModal, setShowReopenModal] = React.useState(false);
  const [reopenNote, setReopenNote] = React.useState('');
  const [reopenSaving, setReopenSaving] = React.useState(false);
  const [viewerFile, setViewerFile] = React.useState(null);
  const [showManageModal, setShowManageModal] = React.useState(false);

  const closeDetail = React.useCallback(() => {
    detailReqRef.current += 1;
    setDetail(null);
    setDetailLoading(false);
    setStartingReview(false);
    setShowRevisionModal(false);
    setRevisionNote('');
    setRevisionSaving(false);
    setShowRejectModal(false);
    setRejectReason('');
    setRejectSaving(false);
    setShowVerifyModal(false);
    setChecklist({
      required_documents_present: false,
      documents_readable: false,
      identity_details_consistent: false,
      qualifications_consistent: false,
      teaching_details_consistent: false,
      no_obvious_alteration_detected: false,
    });
    setShowVerifyConfirm(false);
    setVerifySaving(false);
    setShowReopenModal(false);
    setReopenNote('');
    setReopenSaving(false);
  }, []);

  const fetchQueue = React.useCallback(async (p = page, s = statusFilter, q = debouncedSearch, location = debouncedLocationFilter) => {
    const seq = ++queueReqRef.current;
    setLoading(true);
    try {
      const params = { page: p, per_page: perPage };
      if (s) params.status = s;
      if (q) params.search = q;
      if (location) params.location = location;
      if (subjectFilters.length) params.subject = subjectFilters;
      if (curriculumFilters.length) params.curriculum = curriculumFilters;
      const data = await api.fetchTeacherReviewQueue(params);
      if (seq !== queueReqRef.current) return;
      setQueue(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setPage(data.page || 1);
    } catch (err) {
      if (seq !== queueReqRef.current) return;
      globalToast.error(err?.message || 'Could not load review queue.');
      setQueue([]);
    } finally {
      if (seq === queueReqRef.current) setLoading(false);
    }
  }, [page, perPage, statusFilter, debouncedSearch, debouncedLocationFilter, subjectFilters, curriculumFilters]);

  React.useEffect(() => { fetchQueue(); }, [fetchQueue]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedLocationFilter(locationFilter.trim()), 300);
    return () => clearTimeout(t);
  }, [locationFilter]);

  React.useEffect(() => {
    if (debouncedSearch !== undefined) {
      setPage(1);
    }
  }, [statusFilter, debouncedSearch, debouncedLocationFilter, subjectFilters, curriculumFilters]);

  const subjectOptions = React.useMemo(
    () => teacherTaxonomyOptions(TEACHING_SUBJECTS, queue, 'teaching_subject'),
    [queue],
  );
  const curriculumOptions = React.useMemo(
    () => teacherTaxonomyOptions(TEACHING_CURRICULA, queue, 'curriculum_experience'),
    [queue],
  );

  const canView = hasSessionPermission(session, 'teachers.view');
  const canEdit = hasSessionPermission(session, 'teachers.edit');
  const canManageAccount = hasSessionPermission(session, 'teachers.account.manage');
  const canManageDocuments = hasSessionPermission(session, 'teachers.documents.manage');
  const canManageVerification = hasSessionPermission(session, 'teachers.verification.manage');

  const openDetail = async (item) => {
    const seq = ++detailReqRef.current;
    setDetailLoading(true);
    setDetail({ ...item, _loading: true });
    try {
      const data = await api.fetchTeacherReviewDetail(item.id);
      if (seq !== detailReqRef.current) return;
      setDetail(data);
    } catch (err) {
      if (seq !== detailReqRef.current) return;
      globalToast.error(err?.message || 'Could not load review detail.');
    } finally {
      if (seq === detailReqRef.current) setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail?.id) return;
    const seq = ++detailReqRef.current;
    try {
      const data = await api.fetchTeacherReviewDetail(detail.id);
      if (seq !== detailReqRef.current) return;
      setDetail(data);
      return data;
    } catch { /* ignore */ }
  };

  const startReview = async () => {
    if (!detail?.id || startingReview) return;
    setStartingReview(true);
    try {
      const result = await api.startTeacherReview(detail.id);
      await refreshDetail();
      await fetchQueue();
      globalToast.success(result?.message || 'Review started successfully.');
    } catch (err) {
      globalToast.error(err?.message || 'Could not start review.');
    } finally {
      setStartingReview(false);
    }
  };

  const openRevisionModal = () => {
    setRevisionNote('');
    setShowRevisionModal(true);
  };

  const cancelRevision = () => {
    if (revisionSaving) return;
    setShowRevisionModal(false);
    setRevisionNote('');
  };

  const submitRevision = async () => {
    if (!detail?.id || !revisionNote.trim() || revisionSaving) return;
    setRevisionSaving(true);
    try {
      const result = await api.requestTeacherRevision(detail.id, revisionNote.trim());
      await refreshDetail();
      await fetchQueue();
      setShowRevisionModal(false);
      setRevisionNote('');
      globalToast.success(result?.message || 'Revision requested.');
    } catch (err) {
      globalToast.error(err?.message || 'Could not request revision.');
    } finally {
      setRevisionSaving(false);
    }
  };

  const openRejectModal = () => {
    setRejectReason('');
    setShowRejectModal(true);
  };

  const cancelReject = () => {
    if (rejectSaving) return;
    setShowRejectModal(false);
    setRejectReason('');
  };

  const submitReject = async () => {
    if (!detail?.id || !rejectReason.trim() || rejectSaving) return;
    setRejectSaving(true);
    try {
      const result = await api.rejectTeacherProfile(detail.id, rejectReason.trim());
      await refreshDetail();
      await fetchQueue();
      setShowRejectModal(false);
      setRejectReason('');
      globalToast.success(result?.message || 'Profile rejected.');
    } catch (err) {
      globalToast.error(err?.message || 'Could not reject profile.');
    } finally {
      setRejectSaving(false);
    }
  };

  const openReopenModal = () => {
    setReopenNote('');
    setShowReopenModal(true);
  };

  const cancelReopen = () => {
    if (reopenSaving) return;
    setShowReopenModal(false);
    setReopenNote('');
  };

  const submitReopen = async () => {
    if (!detail?.id || !reopenNote.trim() || reopenSaving) return;
    setReopenSaving(true);
    try {
      const result = await api.reopenTeacherReview(detail.id, reopenNote.trim());
      await refreshDetail();
      await fetchQueue();
      setShowReopenModal(false);
      setReopenNote('');
      globalToast.success(result?.message || 'Application reopened for review.');
    } catch (err) {
      globalToast.error(err?.message || 'Could not reopen application.');
    } finally {
      setReopenSaving(false);
    }
  };

  const openVerifyModal = () => {
    setChecklist({
      required_documents_present: false,
      documents_readable: false,
      identity_details_consistent: false,
      qualifications_consistent: false,
      teaching_details_consistent: false,
      no_obvious_alteration_detected: false,
    });
    setShowVerifyConfirm(false);
    setShowVerifyModal(true);
  };

  const cancelVerify = () => {
    if (verifySaving) return;
    setShowVerifyModal(false);
    setChecklist({
      required_documents_present: false,
      documents_readable: false,
      identity_details_consistent: false,
      qualifications_consistent: false,
      teaching_details_consistent: false,
      no_obvious_alteration_detected: false,
    });
    setShowVerifyConfirm(false);
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const openVerifyConfirm = () => {
    if (!allChecked || verifySaving) return;
    setShowVerifyConfirm(true);
  };

  const submitVerify = async () => {
    if (!detail?.id || verifySaving) return;
    setVerifySaving(true);
    try {
      const result = await api.verifyTeacherProfile(detail.id, checklist);
      await refreshDetail();
      await fetchQueue();
      setShowVerifyModal(false);
      setShowVerifyConfirm(false);
      globalToast.success('Visual verification complete. Teacher ID: ' + (result.teacher_id || 'issued.'));
    } catch (err) {
      if (err.status === 409) {
        globalToast.error(err?.message || 'Inconsistent state. Refreshing record...');
        await refreshDetail();
      } else {
        globalToast.error(err?.message || 'Verification failed.');
      }
    } finally {
      setVerifySaving(false);
    }
  };

  const reviewDetail = detail?.review || {};
  const profileStatus = detail?.profile_status || reviewDetail?.profile_status || '';
  const location = detail?.review?.location || detail?.location || '';
  const teachingSubject = detail?.review?.teaching_subject || '';
  const preferredLevel = detail?.review?.preferred_level || '';
  const preferredEmploymentType = detail?.review?.preferred_employment_type || '';
  const curriculumExperience = detail?.review?.curriculum_experience || '';
  const bio = detail?.review?.bio || '';

  const showDetailActions = () => {
    if (!canEdit) return null;
    if (profileStatus === 'submitted') {
      return (
        <button className="btn btn-primary" onClick={startReview} disabled={startingReview}>
          {startingReview ? 'Starting...' : 'Start Review'}
        </button>
      );
    }
    if (profileStatus === 'under_review') {
      return (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline-navy" onClick={openRevisionModal}>Request Revision</button>
          <button className="btn btn-outline-navy" style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }} onClick={openRejectModal}>Reject</button>
          <button className="btn btn-primary" onClick={openVerifyModal}>Visually Verify</button>
        </div>
      );
    }
    if (profileStatus === 'revision_required') {
      return (
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', margin: 0, fontStyle: 'italic' }}>
          Waiting for the teacher to resubmit their profile.
        </p>
      );
    }
    if (profileStatus === 'rejected') {
      return (
        <button className="btn btn-outline-navy" onClick={openReopenModal} disabled={reopenSaving}>
          <Icon name="refresh-cw" size={14} style={{ marginRight: 6 }} />Reopen for Review
        </button>
      );
    }
    return null;
  };

  const queueColumns = (item) => {
    const idDisplay = item.teacher_id || item.application_id || 'RMX ID pending';
    const secondaryId = item.teacher_id ? item.application_id : null;
    return (
      <tr key={item.id}>
        <td className="td-primary" style={{ whiteSpace: 'nowrap' }}>
          <div>{idDisplay}</div>
          {secondaryId ? <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>{secondaryId}</div> : null}
        </td>
        <td>
          <div style={{ fontWeight: 600 }}>{[item.first_name, item.last_name].filter(Boolean).join(' ')}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>{item.email}</div>
        </td>
        <td className="td-muted" style={{ fontSize: '0.84rem' }}>
          {item.teaching_subject ? <div>{item.teaching_subject}</div> : null}
          {item.preferred_level ? <div style={{ fontSize: '0.76rem', color: 'var(--gray-500)' }}>{item.preferred_level}</div> : null}
        </td>
        <td><span className={`badge ${statusBadgeClass(item.profile_status)}`}>{STATUS_LABELS[item.profile_status] || item.profile_status}</span></td>
        <td style={{ fontSize: '0.78rem', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
          {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '-'}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <span style={{ color: item.cv_present ? 'var(--green)' : 'var(--gray-400)', marginRight: 8 }} title={item.cv_present ? 'CV present' : 'No CV'}>
            {item.cv_present ? 'CV' : '-'}
          </span>
          <span style={{ color: item.certificate_present ? 'var(--green)' : 'var(--gray-400)' }} title={item.certificate_present ? 'Certificate present' : 'No certificate'}>
            {item.certificate_present ? 'Cert' : '-'}
          </span>
        </td>
        <td className="admin-actions-column">
          <button className="table-action-btn" onClick={() => openDetail(item)} disabled={detailLoading}>
            Review
          </button>
        </td>
      </tr>
    );
  };

  if (!canView) {
    return <EmptySection title="Access restricted" body="You do not have permission to view teacher reviews." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h2 className="admin-page-title">Teacher Review</h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--gray-600)', marginTop: 4 }}>
            Review and verify teacher profiles. {total > 0 && `${total} record${total !== 1 ? 's' : ''} found.`}
          </p>
        </div>
      </div>

      <div className="admin-table-card teacher-review-table-card">
        <div className="atc-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline-navy'}`}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {STATUS_LABELS[s] || 'All'}
              </button>
            ))}
          </div>
          <div className="teacher-review-taxonomy-filters">
            <TeacherTaxonomyFilter label="Subject" options={subjectOptions} selected={subjectFilters} onChange={setSubjectFilters} />
            <TeacherTaxonomyFilter label="Curriculum" options={curriculumOptions} selected={curriculumFilters} onChange={setCurriculumFilters} />
            <label className="teacher-location-filter"><Icon name="search" size={15} /><input value={locationFilter} onChange={event => setLocationFilter(event.target.value)} placeholder="Current or preferred location..." aria-label="Search teacher reviews by current or preferred location" />{locationFilter ? <button type="button" aria-label="Clear location filter" onClick={() => setLocationFilter('')}>{'\u00d7'}</button> : null}</label>
          </div>
          <div className="atc-search">
            <span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email, phone, or ID" aria-label="Search teacher reviews" />
          </div>
        </div>

        <TeacherFilterChips subjects={subjectFilters} curricula={curriculumFilters} location={locationFilter.trim()} onSubjectsChange={setSubjectFilters} onCurriculaChange={setCurriculumFilters} onLocationChange={setLocationFilter} resultCount={total} noun="application" />

        {!isApiMode() ? (
          <EmptySection title="API mode required" body="Connect the Flask backend to access the review queue." />
        ) : loading && queue === null ? (
          <EmptySection title="Loading…" body="" />
        ) : queue && queue.length === 0 ? (
          <EmptySection
            title={search ? 'No matching records' : statusFilter ? `No ${STATUS_LABELS[statusFilter]?.toLowerCase() || statusFilter} records` : 'No review records'}
            body={search ? 'Try a different search term.' : statusFilter ? 'Profiles with this status will appear here.' : 'Pending teacher profiles will appear here.'}
          />
        ) : queue ? (
          <>
            <AdminTableScroll>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Teacher</th><th>Teaching</th><th>Status</th><th>Submitted</th><th>Docs</th><th className="admin-actions-column">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(queueColumns)}
                </tbody>
              </table>
            </AdminTableScroll>
            {pages > 1 ? (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0', alignItems: 'center' }}>
                <button className="btn btn-sm btn-outline-navy" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
                <span style={{ fontSize: '0.84rem', color: 'var(--gray-600)' }}>Page {page} of {pages}</span>
                <button className="btn btn-sm btn-outline-navy" disabled={page >= pages || loading} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next</button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {detail ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="review-detail-title" style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 840, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 72px rgba(0,0,0,0.28)' }}>
            {/* Fixed header */}
            <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--gray-200)', background: '#fff', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                <h3 id="review-detail-title" style={{ fontFamily: "'Montserrat',sans-serif", color: 'var(--navy)', margin: 0, fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[detail.first_name, detail.last_name].filter(Boolean).join(' ')}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail.email}</p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                <span className={`badge ${statusBadgeClass(profileStatus)}`} style={{ fontSize: '0.82rem', padding: '4px 12px' }}>{STATUS_LABELS[profileStatus] || profileStatus}</span>
                <button type="button" onClick={closeDetail} aria-label="Close" style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--gray-200)', background: 'var(--gray-50)', color: 'var(--gray-600)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '24px 32px 30px' }}>
                {detail._loading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}><p>Loading detail...</p></div>
                ) : (
                  <>
                    <div className="teacher-detail-section">
                      <h4>Identity</h4>
                      <div className="teacher-detail-grid">
                        <DetailField label="Application ID" value={detail.application_id} />
                        {detail.teacher_id ? <DetailField label="Teacher ID" value={detail.teacher_id} wide /> : null}
                        <DetailField label="Full name" value={[detail.first_name, detail.last_name].filter(Boolean).join(' ')} />
                        <DetailField label="Email" value={detail.email} />
                        <DetailField label="Phone" value={detail.phone} />
                      </div>
                    </div>

                    <div className="teacher-detail-section">
                      <h4>Teaching Profile</h4>
                      <div className="teacher-detail-grid">
                        <DetailField label="Teaching subject" value={teachingSubject} />
                        <DetailField label="Preferred level" value={preferredLevel} />
                        <DetailField label="Employment type" value={preferredEmploymentType} />
                        <DetailField label="Curriculum experience" value={curriculumExperience} wide />
                        <DetailField label="Location" value={location} />
                        {bio ? <DetailField label="Bio" value={bio} wide /> : null}
                      </div>
                    </div>

                    <div className="teacher-detail-section">
                      <h4>Review Status</h4>
                      <div className="teacher-detail-grid">
                        <DetailField label="Profile status" value={STATUS_LABELS[profileStatus] || profileStatus} />
                        <DetailField label="Completion" value={detail.profile_completion != null ? `${detail.profile_completion}%` : '-'} />
                        {detail.profile_missing_fields?.length ? (
                          <DetailField label="Missing fields" value={detail.profile_missing_fields.join(', ')} wide />
                        ) : null}
                        <DetailField label="Submitted" value={detail.submitted_at ? new Date(detail.submitted_at).toLocaleDateString() : '-'} />
                        <DetailField label="Reviewed" value={detail.reviewed_at ? new Date(detail.reviewed_at).toLocaleDateString() : '-'} />
                        {detail.review_notes ? (
                          <div className="teacher-detail-field is-wide">
                            <div>Review notes</div>
                            <span style={{ whiteSpace: 'pre-wrap' }}>{detail.review_notes}</span>
                          </div>
                        ) : null}
                        {detail.teacher_id_issued_at ? <DetailField label="Teacher ID issued" value={new Date(detail.teacher_id_issued_at).toLocaleDateString()} /> : null}
                      </div>
                    </div>

                    <div className="teacher-detail-section">
                      <h4>Documents</h4>
                      <div className="teacher-detail-grid">
                        {reviewDetail.cv_url ? (
                          <div className="teacher-detail-field is-wide">
                            <label>CV</label>
                            <span>{reviewDetail.cv_filename || 'CV'}</span>
                            <button type="button" onClick={() => setViewerFile({ id: reviewDetail.cv_file_id, name: reviewDetail.cv_filename || 'CV' })} className="btn btn-sm btn-outline-navy" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="eye" size={14} /> View CV
                            </button>
                          </div>
                        ) : <DetailField label="CV" value="Not uploaded" />}
                        {reviewDetail.certificate_url ? (
                          <div className="teacher-detail-field is-wide">
                            <label>Certificate</label>
                            <span>{reviewDetail.certificate_filename || 'Certificate'}</span>
                            <button type="button" onClick={() => setViewerFile({ id: reviewDetail.certificate_file_id, name: reviewDetail.certificate_filename || 'Certificate' })} className="btn btn-sm btn-outline-navy" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="eye" size={14} /> View Certificate
                            </button>
                          </div>
                        ) : <DetailField label="Certificate" value="Not uploaded" />}
                      </div>
                    </div>

                    {detail.applications?.length ? (
                      <div className="teacher-detail-section">
                        <h4>Job Applications</h4>
                        <div className="teacher-detail-grid">
                          {detail.applications.map(app => (
                            <DetailField key={app.id} label={app.job_title || `Application #${app.id}`} value={`${app.organisation || ''} - ${app.status}`} wide />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {detail.placements?.length ? (
                      <div className="teacher-detail-section">
                        <h4>Placements</h4>
                        <div className="teacher-detail-grid">
                          {detail.placements.map(pl => (
                            <DetailField key={pl.id} label={pl.job_title || 'Placement'} value={`${pl.school_name} - ${pl.status}`} wide />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 20, marginTop: 8 }}>
                      {(canManageAccount || canManageDocuments || canManageVerification) ? (
                        <button type="button" className="btn btn-outline-navy" onClick={() => setShowManageModal(true)} style={{ marginBottom: 12 }}>
                          <Icon name="edit" size={15} /> Manage teacher account
                        </button>
                      ) : null}
                      {showDetailActions()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewerFile ? (
        <div className="admin-modal-backdrop" role="presentation" style={{ zIndex: 900 }}>
          <div role="dialog" aria-modal="true" aria-label={`Preview ${viewerFile.name}`} style={{ background: '#fff', borderRadius: 18, width: 'min(1100px, 94vw)', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 72px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--gray-200)' }}>
              <strong style={{ color: 'var(--navy)' }}>{viewerFile.name}</strong>
              <div style={{ display: 'flex', gap: 10 }}>
                <a className="btn btn-sm btn-primary" href={api.teacherFileDownloadUrl(viewerFile.id)}><Icon name="download" size={14} /> Download</a>
                <button type="button" className="btn btn-sm btn-outline-navy" onClick={() => setViewerFile(null)}>Close</button>
              </div>
            </div>
            <iframe title={viewerFile.name} src={api.teacherFilePreviewUrl(viewerFile.id)} style={{ border: 0, width: '100%', flex: 1, background: '#eef2f7' }} />
          </div>
        </div>
      ) : null}

      {showManageModal && detail ? (
        <TeacherAccountManageModal
          detail={detail}
          onClose={() => setShowManageModal(false)}
          canManageAccount={canManageAccount}
          canManageDocuments={canManageDocuments}
          canManageVerification={canManageVerification}
          onSaved={async () => { await refreshDetail(); await fetchQueue(); }}
        />
      ) : null}

      {showRevisionModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="revision-modal-title" style={{ background: '#fff', borderRadius: 18, padding: '34px 32px 30px', width: '100%', maxWidth: 520, boxShadow: '0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={cancelRevision} aria-label="Close" disabled={revisionSaving}><Icon name="x" size={16} /></button>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#fff8e1', border: '2px solid #ffe082', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#f59e0b' }}>
              <Icon name="file" size={24} />
            </div>
            <p style={{ margin: '0 0 8px', textAlign: 'center', color: '#b88900', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
              Revision required
            </p>
            <h3 id="revision-modal-title" style={{ fontFamily: "'Montserrat',sans-serif", color: 'var(--navy)', textAlign: 'center', marginBottom: 10, fontSize: '1.2rem' }}>
              Request profile revision
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', textAlign: 'center', marginBottom: 18, lineHeight: 1.6 }}>
              {detail ? `${detail.first_name} ${detail.last_name} (${detail.application_id || 'RMX ID pending'})` : ''}
            </p>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)', marginBottom: 20 }}>
              Revision notes
              <textarea className="form-textarea" rows={4} value={revisionNote} onChange={e => setRevisionNote(e.target.value)} placeholder="Explain what the teacher needs to correct..." aria-label="Revision notes" />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-outline-navy" style={{ flex: 1 }} type="button" onClick={cancelRevision} disabled={revisionSaving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} type="button" disabled={!revisionNote.trim() || revisionSaving} onClick={submitRevision}>
                {revisionSaving ? 'Saving...' : 'Request Revision'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRejectModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="reject-modal-title" style={{ background: '#fff', borderRadius: 18, padding: '34px 32px 30px', width: '100%', maxWidth: 520, boxShadow: '0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={cancelReject} aria-label="Close" disabled={rejectSaving}><Icon name="x" size={16} /></button>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#dc2626' }}>
              <Icon name="warning" size={24} />
            </div>
            <p style={{ margin: '0 0 8px', textAlign: 'center', color: '#991b1b', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
              Reject application
            </p>
            <h3 id="reject-modal-title" style={{ fontFamily: "'Montserrat',sans-serif", color: 'var(--navy)', textAlign: 'center', marginBottom: 10, fontSize: '1.2rem' }}>
              Reject this application?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--gray-600)', textAlign: 'center', marginBottom: 18, lineHeight: 1.6 }}>
              <strong>{detail ? `${detail.first_name} ${detail.last_name}` : ''}</strong><br />
              {detail ? (detail.application_id || 'RMX ID pending') : ''}<br />
              This teacher will be notified that their application was rejected. Ordinary resubmission will not be possible.
            </p>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.86rem', fontWeight: 600, color: 'var(--navy)', marginBottom: 20 }}>
              Rejection reason
              <textarea className="form-textarea" rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain the reason for rejection..." aria-label="Rejection reason" />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-outline-navy" style={{ flex: 1 }} type="button" onClick={cancelReject} disabled={rejectSaving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, background: '#dc2626', borderColor: '#dc2626' }} type="button" disabled={!rejectReason.trim() || rejectSaving} onClick={submitReject}>
                {rejectSaving ? 'Rejecting...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showVerifyModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="verify-modal-title" style={{ position: 'relative', background: '#fff', borderRadius: 18, padding: '34px 32px 30px', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={cancelVerify} aria-label="Close" disabled={verifySaving}><Icon name="x" size={16} /></button>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#16a34a' }}>
              <Icon name="check" size={24} />
            </div>
            <p style={{ margin: '0 0 8px', textAlign: 'center', color: '#15803d', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
              Visual verification
            </p>
            <h3 id="verify-modal-title" style={{ fontFamily: "'Montserrat',sans-serif", color: 'var(--navy)', textAlign: 'center', marginBottom: 10, fontSize: '1.2rem' }}>
              Visual verification checklist
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--gray-600)', textAlign: 'center', marginBottom: 18, lineHeight: 1.5, padding: '0 8px' }}>
              Confirm that you have visually inspected the submitted profile and documents.
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--gray-500)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5, fontStyle: 'italic', padding: '0 8px' }}>
              Visual verification confirms that RealMindX has reviewed the submitted profile and documents for presence, readability, and reasonable consistency. It does not mean that the issuing institutions independently authenticated the documents.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', borderBottom: '1px solid var(--gray-200)', color: 'var(--navy)' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={event => setChecklist(Object.fromEntries(Object.keys(checklist).map(key => [key, event.target.checked])))}
                  aria-label="Select all verification checks"
                />
                <span>Select all verification checks</span>
              </label>
              {[
                { key: 'required_documents_present', label: 'The required CV and certificate are present' },
                { key: 'documents_readable', label: 'The submitted documents are readable' },
                { key: 'identity_details_consistent', label: 'The teacher\'s identity details are reasonably consistent' },
                { key: 'qualifications_consistent', label: 'The qualifications are consistent with the profile' },
                { key: 'teaching_details_consistent', label: 'The teaching details are consistent with the submitted qualifications' },
                { key: 'no_obvious_alteration_detected', label: 'No obvious signs of document alteration were noticed during visual review' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', fontSize: '0.88rem', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}>
                  <input type="checkbox" checked={checklist[key]} onChange={() => setChecklist(prev => ({ ...prev, [key]: !prev[key] }))} style={{ marginTop: 3 }} aria-label={label} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {!showVerifyConfirm ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-outline-navy" style={{ flex: 1 }} type="button" onClick={cancelVerify} disabled={verifySaving}>
                  Back to review
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} type="button" disabled={!allChecked} onClick={openVerifyConfirm}>
                  Continue
                </button>
              </div>
            ) : (
              <div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '14px 16px', marginBottom: 20, fontSize: '0.84rem', color: '#166534', lineHeight: 1.55 }}>
                  <strong>Confirm visual verification</strong><br />
                  Teacher: {detail ? `${detail.first_name} ${detail.last_name}` : ''}<br />
                  Application ID: {detail ? (detail.application_id || 'RMX ID pending') : ''}<br /><br />
                  A permanent Teacher ID will be issued upon verification. This action should only be completed after human visual inspection.
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-outline-navy" style={{ flex: 1 }} type="button" onClick={() => setShowVerifyConfirm(false)} disabled={verifySaving}>Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} type="button" disabled={verifySaving} onClick={submitVerify}>
                    {verifySaving ? 'Verifying...' : 'Confirm & Issue Teacher ID'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showReopenModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="reopen-modal-title" style={{ background: '#fff', borderRadius: 18, padding: '34px 32px 30px', width: '100%', maxWidth: 540, boxShadow: '0 24px 72px rgba(0,0,0,0.28)' }}>
            <button className="admin-modal-close" type="button" onClick={cancelReopen} aria-label="Close" disabled={reopenSaving}><Icon name="x" size={16} /></button>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#f0f0f0', border: '2px solid #d0d0d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#666' }}>
              <Icon name="refresh-cw" size={24} />
            </div>
            <h3 id="reopen-modal-title" style={{ fontFamily: "'Montserrat',sans-serif", color: 'var(--navy)', textAlign: 'center', marginBottom: 4, fontSize: '1.15rem' }}>
              Reopen for Review
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--gray-600)', textAlign: 'center', marginBottom: 16, lineHeight: 1.5 }}>
              Teacher: {detail ? `${detail.first_name} ${detail.last_name}` : ''}<br />
              Application ID: {detail ? (detail.application_id || 'RMX ID pending') : ''}
            </p>
            {detail?.review_notes ? (
              <div style={{ background: '#f9f9f9', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.82rem' }}>
                <strong style={{ color: 'var(--gray-700)' }}>Previous rejection reason</strong>
                <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: 'var(--gray-600)', lineHeight: 1.5 }}>{detail.review_notes}</p>
              </div>
            ) : null}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.82rem', color: '#9a3412', lineHeight: 1.55 }}>
              <strong>This does not approve the application.</strong><br />
              The application will be returned to <strong>Under review</strong> for reassessment. After reopening, you may request corrections, verify, or reject as usual.
            </div>
            <label style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
              Reason for reopening
              <textarea className="form-textarea" rows={4} value={reopenNote} onChange={e => setReopenNote(e.target.value)} placeholder="Explain why this application is being reopened..." />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-outline-navy" style={{ flex: 1 }} type="button" onClick={cancelReopen} disabled={reopenSaving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} type="button" disabled={!reopenNote.trim() || reopenSaving} onClick={submitReopen}>
                {reopenSaving ? 'Reopening...' : 'Reopen for Review'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

  const updateTwoFactorFlag = React.useCallback((enabled, recommended) => {
    setSession(current => {
      if (!current) return current;
      const nextSession = { ...current, twoFactorEnabled: Boolean(enabled), mfaRecommended: Boolean(recommended) };
      saveDemoSession(nextSession);
      return nextSession;
    });
  }, []);

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
          : activeView === 'teacherReview'
          ? <TeacherReviewView session={session} />
          : activeView === 'bookshopCustomers'
          ? <BookshopCustomersView />
          : activeView === 'whatsappDiagnostics'
          ? <WhatsAppDiagnosticsView />
          : activeView === 'account'
          ? <AccountView session={session} onPasswordChanged={clearPasswordRotationFlag} onTwoFactorChanged={updateTwoFactorFlag} />
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
        {session?.mfaRecommended === true && activeView !== 'account' ? (
          <div
            role="status"
            style={{ margin: '18px 28px 0', padding: '14px 16px', border: '1px solid #fed7aa', borderRadius: 12, background: '#fff7ed', color: '#9a3412', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: '1 1 360px' }}>
              <Icon name="shield" size={19} />
              <span style={{ fontSize: '0.84rem', lineHeight: 1.55 }}><strong>Protect this internal account.</strong> Add an emailed security code to sign-in; setup takes about a minute and will not interrupt this session.</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveView('account')}>Set up 2FA</button>
          </div>
        ) : null}
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
        .admin-file-upload-copy a { color: #1976c9; font-size: 0.78rem; font-weight: 800; text-decoration: none; }
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
