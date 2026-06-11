import React from 'react';
import ReactDOM from 'react-dom';
import { Icon, DatePickerField } from '../assets/components.jsx';
import { resetManagedContent, JOB_LEVELS, JOB_SUBJECTS, JOB_TYPES } from '../../src/lib/managedContent.js';
import { useAdminContent, publicItems } from '../../src/lib/useAdminContent.js';
import { API_BASE, api, isApiMode } from '../../src/lib/apiClient.js';
import { clearDemoSession, getDemoSession, saveDemoSession } from '../../src/lib/demoAccounts.js';
import logoWhite from '../assets/logo-white.png';
import ImageCropModal from '../../src/lib/ImageCropModal.jsx';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', icon: 'grid' },
  { key: 'jobs', label: 'Jobs', group: 'Jobs', icon: 'briefcase' },
  { key: 'applications', label: 'Applications', group: 'Jobs', icon: 'clipboard' },
  { key: 'products', label: 'Products', group: 'Bookshop', icon: 'book' },
  { key: 'productReviews', label: 'Product Reviews', group: 'Bookshop', icon: 'award' },
  { key: 'categories', label: 'Categories', group: 'Bookshop', icon: 'package' },
  { key: 'flyers', label: 'Flyers', group: 'Bookshop', icon: 'image' },
  { key: 'priceAdjustment', label: 'Price Adjustment', group: 'Bookshop', icon: 'money' },
  { key: 'orders', label: 'Orders', group: 'Bookshop', icon: 'clipboard' },
  { key: 'services', label: 'Services', group: 'Content', icon: 'consulting' },
  { key: 'partners', label: 'Partners', group: 'Content', icon: 'users' },
  { key: 'people', label: 'The People', group: 'Content', icon: 'users' },
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
  { key: 'teachers', label: 'Registered Teachers', group: 'System', icon: 'teacher' },
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

const EXPORTABLE_PERMISSION_KEYS = new Set(['jobs', 'applications', 'products', 'orders', 'newsletters', 'gallery', 'resources', 'auditLogs']);
const PERMISSION_GROUPS = NAV
  .filter(item => item.key !== 'dashboard' && item.key !== 'admins' && item.key !== 'auditLogs')
  .map(item => {
    const actions = item.key === 'auditLogs'
      ? ['view']
      : item.key === 'alerts'
        ? ['view', 'edit']
        : item.key === 'staff'
          ? ['view', 'create', 'edit', 'delete']
          : ['view', 'create', 'edit', 'delete', ...(EXPORTABLE_PERMISSION_KEYS.has(item.key) ? ['export'] : [])];
    return { ...item, actions };
  });
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
  if ([...selected].some(key => ['products.', 'productReviews.', 'categories.', 'flyers.'].some(prefix => key.startsWith(prefix)))) selected.add('manage_products');
  if ([...selected].some(key => key.startsWith('orders.'))) selected.add('manage_orders');
  if ([...selected].some(key => key.startsWith('news.'))) selected.add('manage_news');
  if ([...selected].some(key => key.startsWith('gallery.'))) selected.add('manage_gallery');
  if ([...selected].some(key => key.startsWith('resources.'))) selected.add('manage_resources');
  if ([...selected].some(key => key.startsWith('messages.'))) selected.add('view_messages');
  if ([...selected].some(key => key.startsWith('newsletters.'))) selected.add('manage_newsletters');
  if ([...selected].some(key => ['services.', 'partners.', 'people.', 'homeHeroSlides.', 'donationSlides.', 'siteCopy.', 'settings.'].some(prefix => key.startsWith(prefix)))) selected.add('manage_settings');
  if ([...selected].some(key => key.startsWith('staff.'))) selected.add('manage_admins');
  return [...selected];
};

const PUBLISHABLE_COLLECTIONS = new Set(['jobs', 'products', 'categories', 'flyers', 'services', 'partners', 'people', 'homeHeroSlides', 'donationSlides', 'siteCopy', 'news', 'gallery', 'resources']);

const canAccessAdminItem = (item, session) => {
  const role = session?.role;
  if (role === 'admin') return true;
  if (item.key === 'dashboard') return true;
  if (item.key === 'admins' || item.key === 'auditLogs') return false;
  const permissions = new Set(session?.permissions || []);
  return permissions.has(`${item.key}.view`);
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
      field('location', 'Location'),
      field('subject', 'Subject', 'select', { options: JOB_SUBJECTS }),
      field('level', 'Level', 'select', { options: JOB_LEVELS }),
      field('employment_type', 'Employment Type', 'select', { options: JOB_TYPES }),
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
      field('category_id', 'Product Category', 'category-select', { help: 'Choose an existing category.' }),
      field('category_name', 'New Category (Optional)', 'text', { help: 'If the category is not listed, type it here and it will be created automatically.' }),
      field('short_description', 'Short Description'),
      field('price', 'Price (GHS)', 'number'),
      field('old_price', 'Old Price (GHS)', 'number'),
      field('source', 'Supplier / Source', 'text', { help: 'Admin-only supplier, vendor, or source note. This is never shown in the public bookshop.' }),
      field('stock_status', 'Stock', 'select', { options: ['in_stock', 'low_stock', 'out_of_stock'] }),
      field('curriculum', 'Curriculum Name', 'text', { help: 'Optional: e.g. Cambridge, IB, Montessori, GES, Pearson Edexcel, WAEC.' }),
      field('author', 'Author'),
      field('publisher', 'Publisher'),
      field('level', 'Level', 'text', { help: 'e.g. JHS 1, SHS, Primary 4' }),
      field('subject', 'Subject'),
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
    description: 'Create and manage discount codes for products and/or delivery. Codes are validated in real-time at checkout.',
    collection: 'promoCodes',
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
    ],
    columns: ['code', 'discount_type', 'discount_value', 'applies_to', 'is_active'],
    columnLabels: { discount_type: 'Type', discount_value: 'Value', applies_to: 'Applies To' },
  },
  flyers: {
    title: 'Bookshop Flyers',
    description: 'Hero flyers shown in the bookshop homepage slideshow. Published flyers appear in order; drafts are hidden.',
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
      field('image_fit', 'Image Fit', 'select', { options: ['cover', 'contain'] }),
      field('image_position', 'Image Position', 'select', { options: ['center', 'top', 'bottom', 'left', 'right'] }),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['image_url', 'headline', 'accent', 'badge', 'status'],
    columnLabels: { image_url: 'Image' },
  },
  categories: {
    title: 'Product Categories',
    description: 'These appear in the bookshop category menu. Set a bulk discount to automatically reduce the price when a customer orders 10+ units of any product in that category.',
    collection: 'categories',
    createLabel: 'Add Category',
    fields: [
      field('name', 'Category Name'),
      field('slug', 'Slug', 'text', { help: 'URL-friendly identifier, e.g. textbooks' }),
      field('description', 'Description', 'textarea'),
      field('sort_order', 'Sort Order', 'number'),
      field('is_active', 'Active / Visible', 'checkbox'),
      field('bulk_discount_percent', 'Bulk Discount %', 'number', { help: 'Discount applied when a customer orders 10+ units of any product in this category. Set to 0 to disable. e.g. 10 = 10% off.' }),
      field('bulk_min_qty', 'Bulk Min. Quantity', 'number', { help: 'Minimum quantity to trigger the bulk discount. Default is 10.' }),
    ],
    columns: ['name', 'slug', 'bulk_discount_percent', 'is_active'],
    columnLabels: { bulk_discount_percent: 'Bulk Discount %' },
  },
  services: {
    title: 'Services',
    description: 'Every service shown on the homepage strip and services page can be edited, reordered, published, or deleted here.',
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
      field('icon', 'Service Icon', 'select', { options: SERVICE_ICON_OPTIONS }),
      field('image_file_id', 'Service Image', 'image', { aspectRatio: 16/9, cropTitle: 'Crop Service Image (16:9)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:9. This is the standard widescreen format used on the services detail page.' },
        { icon: 'image',    text: 'Crop tip: use a real photo showing the service in action. A teacher in a classroom, students studying, or a school setting works well. Avoid generic stock photos.' },
        { icon: 'camera',   text: 'Minimum size: 1200 x 675 px.' },
        { icon: 'check',    text: 'This image appears alongside the service description and feature list. Pick one that immediately communicates what the service delivers.' },
      ] }),
      field('image_key', 'Default Image if no upload', 'select', { options: FALLBACK_IMAGE_OPTIONS }),
      field('badge', 'Badge'),
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
      field('summary', 'Summary', 'textarea'),
      field('body', 'Intro / Fallback Body', 'textarea', { help: 'Shown before the sections, or used as the full article if no sections are added.' }),
      field('sections', 'Article Sections', 'article-sections', { help: 'Add headings, body text, images, and captions for the full news article.' }),
      field('image_file_id', 'Post Image', 'image', { aspectRatio: 16/9, cropTitle: 'Crop News Image (16:9)', guide: [
        { icon: 'target',   text: 'Ideal ratio: 16:9. Standard widescreen format used on news cards and the article header.' },
        { icon: 'image',    text: 'Crop tip: pick an image that visually summarises the story. For events, show attendees. For announcements, use the relevant product, person, or location.' },
        { icon: 'camera',   text: 'Minimum size: 1200 x 675 px. A strong header image is the biggest driver of people clicking through to read the article.' },
        { icon: 'check',    text: 'This image also appears in newsletters when the post is reused. Make it recognisable and eye-catching at small sizes.' },
      ] }),
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
    title: 'Resources',
    description: 'Downloadable or linked resources for the public resources route.',
    collection: 'resources',
    createLabel: 'Add Resource',
    fields: [
      field('title', 'Title'),
      field('description', 'Description', 'textarea'),
      field('url', 'URL'),
      field('status', 'Status', 'select', { options: ['draft', 'published'] }),
    ],
    columns: ['title', 'description', 'url', 'status'],
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
    statusOptions: ['received', 'shipped', 'complete', 'cancelled'],
    requireCancelReason: true,
    emptyTitle: 'No Bookshop Orders Yet',
    emptyBody: 'Customer orders from the bookshop will appear here.',
    fields: [],             // no edit form fields
    columns: ['order_reference', 'customer_name', 'total_amount', 'status'],
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
    description: 'Edit contact email, phone numbers, address, and basic details used across the public website.',
    collection: 'settings',
    createLabel: 'Add Contact Detail',
    idField: 'key',   // use the key string as the update/delete identifier
    fields: [
      field('key', 'Detail Name', 'text', { help: 'Example: contact_email, main_phone, office_address.' }),
      field('value', 'Value', 'textarea'),
      field('public', 'Show on website', 'checkbox'),
    ],
    columns: ['key', 'value', 'public'],
    columnLabels: { key: 'Detail', public: 'Visible' },
  },
  staff: {
    title: 'Staff Accounts',
    description: 'Create staff accounts and assign exactly the permissions each person should access.',
    collection: 'staff',
    createLabel: 'Create Staff Account',
    fields: [
      field('email', 'Email Address', 'email'),
      field('password', 'Password', 'password', { help: 'Required for new staff. Leave blank when editing to keep the current password.' }),
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
      field('password', 'Temporary Password', 'password', { help: 'Required for new admins. Leave blank when editing to keep the current password.' }),
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
    columns: ['actor', 'action', 'entity_type', 'entity_id', 'ip_address'],
    columnLabels: { entity_type: 'Area', entity_id: 'Record', ip_address: 'IP Address' },
  },
};

const statusLabel = value => String(value || 'draft').replace(/_/g, ' ');

const optionValue = option => (typeof option === 'object' ? option.value : option);
const optionLabel = option => (typeof option === 'object' ? option.label : statusLabel(option));
const columnLabel = (config, column) =>
  config.columnLabels?.[column]
  || column.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const adminAssetUrl = value => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  try {
    return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
  } catch {
    return value;
  }
};

const rowImageUrl = row => adminAssetUrl(row.image_url || row.image || row.logo_url || row.cover_url);

const normalizeFormValue = (value, itemField) => {
  if (itemField.type === 'number') return value === '' ? null : Number(value);
  if (itemField.type === 'checkbox') return Boolean(value);
  if (itemField.type === 'tags') return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean);
  if (itemField.type === 'image') return value ? Number(value) : null; // stored as file ID (number)
  if (itemField.type === 'category-select') return value ? Number(value) : null;
  if (itemField.type === 'permission-list') return expandPermissionsForSave(value);
  if (itemField.type === 'article-sections') return Array.isArray(value) ? value : [];
  return value;
};

const valueForInput = (value, itemField) => {
  if (itemField.type === 'tags') return Array.isArray(value) ? value.join(', ') : value || '';
  if (itemField.type === 'checkbox') return Boolean(value);
  if (itemField.type === 'image') return value ?? ''; // stores file ID
  if (itemField.type === 'category-select') return value ?? '';
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
    source: 'Supplier, publisher contact, or where this stock came from',
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

const AdminSidebar = ({ active, setActive, open, setOpen, session }) => {
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
          <span className="admin-logo-tag">Admin</span>
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

const DashboardView = ({ content, setActive }) => {
  const [liveSummary, setLiveSummary] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    api.adminDashboard()
      .then(data => setLiveSummary(data.summary || null))
      .catch(() => {});
  }, []);

  // In API mode use the live summary; in local mode derive from content arrays.
  const s = liveSummary || {};
  const stats = isApiMode() ? [
    ['Total Users',           s.total_users            ?? 0, 'registered accounts',     'users'],
    ['Job Applications',      s.total_job_applications ?? 0, `${s.pending_applications ?? 0} pending`, 'clipboard'],
    ['New Orders',            s.new_orders             ?? 0, 'awaiting confirmation',    'package'],
    ['New Tickets',           s.new_contact_messages   ?? 0, 'need attention',           'message'],
    ['Products',              s.total_products         ?? 0, 'in the bookshop',          'book'],
    ['Newsletter Subscribers',s.newsletter_subscribers ?? 0, 'active subscriptions',     'mail'],
  ] : [
    ['Total Users', 142, 'seeded demo users', 'users'],
    ['Job Applications', 38, `${(content.jobs||[]).length} active job records`, 'clipboard'],
    ['New Orders', (content.orders||[]).filter(o => o.status === 'new').length, 'from bookshop', 'package'],
    ['New Tickets', (content.messages||[]).filter(m => m.status === 'new').length, 'need attention', 'message'],
    ['Products', (content.products||[]).length, `${publicItems(content.products||[]).length} published`, 'book'],
    ['Newsletter Subscribers', (content.newsletters||[]).length, 'managed list', 'mail'],
  ];

  const recentJobs   = (content.jobs   || []).slice(0, 5);
  const recentOrders = (content.orders || []).slice(0, 5);

  return (
    <div>
      <div className="admin-stats-row">
        {stats.map(([label, value, note, icon]) => (
          <button key={label} className="admin-stat" onClick={() => {
            if (label === 'Products') setActive('products');
            if (label === 'New Orders') setActive('orders');
            if (label === 'New Tickets') setActive('messages');
            if (label === 'Newsletter Subscribers') setActive('newsletters');
          }}>
            <div className="admin-stat-icon asi-navy"><Icon name={icon} size={22} stroke={1.9} /></div>
            <div className="admin-stat-info">
              <div className="ast-value">{value}</div>
              <div className="ast-label">{label}</div>
              <div className="ast-change ast-up">{note}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="quick-actions-row">
        {[
          ['Post Job', 'jobs', 'briefcase'],
          ['Add Product', 'products', 'book'],
          ['Add Flyer', 'flyers', 'image'],
          ['Write News', 'news', 'newspaper'],
        ].map(([label, key, icon]) => (
          <button key={label} className="quick-action-btn" onClick={() => setActive(key)}>
            <div className="qab-icon"><Icon name={icon} size={20} stroke={2} /></div>
            <div className="qab-label">{label}</div>
          </button>
        ))}
      </div>

      <div className="admin-grid-2">
        <div className="admin-table-card">
          <div className="atc-header"><h3>Recent Job Posts</h3><button className="btn btn-sm btn-outline-navy" onClick={() => setActive('jobs')}>Manage</button></div>
          <MiniTable rows={recentJobs} columns={['title', 'organisation', 'status']} />
        </div>
        <div className="admin-table-card">
          <div className="atc-header"><h3>Recent Orders</h3><button className="btn btn-sm btn-outline-navy" onClick={() => setActive('orders')}>Manage</button></div>
          <MiniTable rows={recentOrders} columns={['order_reference', 'customer_name', 'status']} />
        </div>
      </div>
    </div>
  );
};

const MiniTable = ({ rows, columns }) => (
  <table className="admin-table">
    <thead><tr>{columns.map(col => <th key={col}>{col.replace(/_/g, ' ')}</th>)}</tr></thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id}>{columns.map(col => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>
      ))}
    </tbody>
  </table>
);

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

const ArticleSectionsField = ({ sections, onChange }) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  const updateSection = (index, patch) => {
    onChange(safeSections.map((section, currentIndex) => (
      currentIndex === index ? { ...section, ...patch } : section
    )));
  };
  const addSection = () => {
    onChange([...safeSections, { heading: '', body: '', caption: '', image_file_id: '', image_url: '' }]);
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
            <label className="form-group" style={{ gridColumn: '1 / -1' }}>
              <span className="form-label">Section Body</span>
              <textarea
                className="form-textarea"
                rows={5}
                value={section.body || ''}
                onChange={event => updateSection(index, { body: event.target.value })}
                placeholder="Write this part of the article. Use blank lines for separate paragraphs."
              />
            </label>
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
      <p className="admin-image-help">Readers will see the sections as one polished article, with natural spacing between sections and no divider lines.</p>
    </div>
  );
};

const ManagedForm = ({ config, initialItem, onCancel, onCreate, onUpdate }) => {
  const [form, setForm] = React.useState(() =>
    config.fields.reduce((acc, itemField) => {
      acc[itemField.name] = valueForInput(initialItem?.[itemField.name], itemField);
      return acc;
    }, {}),
  );
  // Track image preview URLs separately (not sent in payload, only the file ID is)
  const [imageUrls, setImageUrls] = React.useState(() => {
    const urls = {};
    config.fields.forEach(f => {
      if (f.type === 'image' && initialItem?.image_url) urls[f.name] = initialItem.image_url;
    });
    return urls;
  });
  const [saving, setSaving] = React.useState(false);
  const [categoryOptions, setCategoryOptions] = React.useState([]);
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
        {config.fields.map(itemField => (
          <div key={itemField.name} className="form-group" style={(itemField.type === 'textarea' || itemField.type === 'image' || itemField.type === 'permission-list' || itemField.type === 'article-sections') ? { gridColumn: '1 / -1' } : null}>
            <label className="form-label">{itemField.label}</label>
            {itemField.type === 'image' ? (
              <ImageUploadField
                fieldName={itemField.name}
                currentFileId={form[itemField.name]}
                currentUrl={imageUrls[itemField.name]}
                aspectRatio={itemField.aspectRatio}
                cropTitle={itemField.cropTitle}
                guide={itemField.guide}
                onChange={(fileId, fileUrl) => {
                  setForm(prev => ({ ...prev, [itemField.name]: fileId }));
                  setImageUrls(prev => ({ ...prev, [itemField.name]: fileUrl }));
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
              <textarea
                className="form-textarea"
                rows={4}
                placeholder={fieldPlaceholder(itemField, config)}
                value={form[itemField.name]}
                onChange={event => setForm(prev => ({ ...prev, [itemField.name]: event.target.value }))}
              />
            ) : (itemField.type === 'select' || itemField.type === 'category-select') ? (
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
                  : itemField.options
                ).map(option => (
                  <option key={optionValue(option)} value={optionValue(option)}>
                    {optionLabel(option)}
                  </option>
                ))}
              </select>
            ) : itemField.type === 'checkbox' ? (
              <label className="permission-item" style={{ maxWidth: 240 }}>
                <span className="perm-label">Visible publicly</span>
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
            ) : (
              <input
                className="form-input"
                type={itemField.type === 'number' ? 'number' : itemField.type === 'password' ? 'password' : itemField.type === 'email' ? 'email' : 'text'}
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
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : (initialItem ? 'Save Changes' : config.createLabel)}</button>
        <button className="btn btn-outline-navy" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {formError && <p className="form-error" style={{ marginTop: 10 }}>{formError}</p>}
    </form>
  );
};

const ProductImportPanel = ({ onDone }) => {
  const [catalogFile, setCatalogFile] = React.useState(null);
  const [imagesZip, setImagesZip] = React.useState(null);
  const [status, setStatus] = React.useState('');
  const [importing, setImporting] = React.useState(false);

  const submit = async event => {
    event.preventDefault();
    setStatus('');
    if (!catalogFile) {
      setStatus('Upload a CSV or XLSX catalogue first.');
      return;
    }
    setImporting(true);
    try {
      const result = await api.adminImportProducts({ catalogFile, imagesZip });
      setStatus(`Imported ${result.imported || 0}, updated ${result.updated || 0}. ${result.skipped?.length ? `${result.skipped.length} rows skipped.` : ''}`);
      onDone?.();
    } catch (err) {
      setStatus(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <form className="admin-reply-panel" onSubmit={submit}>
      <div>
        <p className="overline">Batch Product Import</p>
        <h3>Upload books and stationery in one pass</h3>
        <p>
          Use columns such as name, category, curriculum, author, publisher, price, stock_status, quantity, subject, level, source, tags, and image_filename.
          Put matching cover images in a ZIP using the exact same image_filename values. The importer creates missing categories automatically.
        </p>
      </div>
      <div className="admin-form-grid">
        <label className="form-group">
          <span className="form-label">Catalogue CSV/XLSX</span>
          <input className="form-input" type="file" accept=".csv,.xlsx" onChange={event => setCatalogFile(event.target.files?.[0] || null)} />
        </label>
        <label className="form-group">
          <span className="form-label">Image ZIP</span>
          <input className="form-input" type="file" accept=".zip" onChange={event => setImagesZip(event.target.files?.[0] || null)} />
        </label>
      </div>
      {status && <p style={{ color: status.includes('failed') || status.includes('Upload') ? 'var(--danger)' : 'var(--navy)', fontWeight: 700 }}>{status}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={importing}>{importing ? 'Importing...' : 'Import Products'}</button>
        <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onDone?.()}>Close</button>
      </div>
    </form>
  );
};

const NewsletterComposer = ({ onSent }) => {
  const [form, setForm] = React.useState({
    subject: '',
    title: '',
    preheader: '',
    body: '',
    cta_label: '',
    cta_url: '',
    image_file_id: '',
  });
  const [imageUrl, setImageUrl] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    setStatus('');
    if (!form.subject.trim() || !form.body.trim()) {
      setStatus('Add a subject and message body before sending.');
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
        image_file_id: form.image_file_id ? Number(form.image_file_id) : null,
      });
      setStatus(result.message || 'Newsletter sent.');
      setForm({ subject: '', title: '', preheader: '', body: '', cta_label: '', cta_url: '', image_file_id: '' });
      setImageUrl('');
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
        <p>Add an optional hero image, CTA, and message body. The email uses the same RealMindX branded template as system triggers.</p>
      </div>
      <div className="admin-form-grid">
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
          />
        </div>
        <label className="form-group" style={{ gridColumn: '1 / -1' }}>
          <span className="form-label">Message Body</span>
          <textarea className="form-textarea" rows={7} value={form.body} onChange={set('body')} placeholder="Write the newsletter body. Use blank lines for paragraphs." />
        </label>
      </div>
      {status && <p style={{ color: status.includes('could not') || status.includes('Add ') ? 'var(--danger)' : 'var(--navy)', fontWeight: 700 }}>{status}</p>}
      <button className="btn btn-primary btn-sm" disabled={sending}>{sending ? 'Sending...' : 'Send Newsletter'}</button>
    </form>
  );
};

// Inline order status selector — default is current status or 'received'
const OrderStatusSelector = ({ row, options, requireCancelReason, onSave }) => {
  const [val, setVal] = React.useState(row.status || 'received');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const handleChange = (e) => { setVal(e.target.value); setDirty(true); setReason(''); };

  const save = async () => {
    if (val === 'cancelled' && requireCancelReason && !reason.trim()) return;
    setSaving(true);
    const patch = { status: val };
    if (val === 'cancelled' && reason.trim()) patch.cancel_reason = reason.trim();
    await onSave(patch);
    setSaving(false);
    setDirty(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:160 }}>
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <select
          className="form-select"
          style={{ fontSize:'0.78rem', height:30, padding:'0 8px', flex:1 }}
          value={val}
          onChange={handleChange}
        >
          {options.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
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
          onChange={e => setReason(e.target.value)}
        />
      )}
    </div>
  );
};

const ManagedTableView = ({ config, rows: rowsProp }) => {
  const { content, fetchCollection, createItem, updateItem, deleteItem, togglePublish: apiToggle, loading, errors } = useAdminContent();
  const [editing, setEditing] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [replying, setReplying] = React.useState(null);
  const [replyText, setReplyText] = React.useState('');
  const [replyError, setReplyError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [sortCol, setSortCol] = React.useState(null);
  const [sortDir, setSortDir] = React.useState('asc');
  const [localRows, setLocalRows] = React.useState(null);
  const [showProductImport, setShowProductImport] = React.useState(false);
  const [actionStatus, setActionStatus] = React.useState(null);

  // In API mode: fetch on mount; in local mode: use rowsProp from parent.
  React.useEffect(() => {
    if (isApiMode()) {
      fetchCollection(config.collection).then(() => {});
    }
    setActionStatus(null);
  }, [config.collection, fetchCollection]);

  // In API mode the hook owns the data; in local mode the parent passes rows.
  const rows = isApiMode() ? (localRows || rowsProp || []) : (rowsProp || []);

  // Subscribe to content updates from the hook (API mode).
  React.useEffect(() => {
    if (isApiMode() && content[config.collection]) {
      setLocalRows(content[config.collection]);
    }
  }, [content, config.collection]);

  const TABLE_PAGE_SIZE = 20;
  const [tablePage, setTablePage] = React.useState(1);

  // Reset to page 1 when search or filter changes
  React.useEffect(() => { setTablePage(1); }, [search, filterStatus]);

  const filtered = rows.filter(row => {
    if (filterStatus && row.status !== filterStatus) return false;
    return !search.trim() || Object.values(row).join(' ').toLowerCase().includes(search.toLowerCase());
  });

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

  const totalTablePages = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const paginatedRows = sorted.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

  const handleCreate = async (payload) => {
    await createItem(config.collection, payload);
    setActionStatus({ type: 'success', message: `${config.title} record created.` });
    setCreating(false);
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

  const [confirmModal, setConfirmModal] = React.useState(null); // { row }

  const handleDelete = (row) => {
    setConfirmModal({ row });
  };

  const executeDelete = async () => {
    if (!confirmModal) return;
    const row = confirmModal.row;
    const label = labelForRow(row);
    setConfirmModal(null);
    setActionStatus(null);
    try {
      await deleteItem(config.collection, getItemId(row));
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
  const canCreate = config.allowCreate !== false && Boolean(config.createLabel);
  const canUpdate = config.allowCreate !== false && config.allowEdit !== false && config.allowUpdate !== false && !config.readOnly && !config.statusOnly && !config.moderationOnly;
  const canDelete = config.allowDelete !== false && !config.readOnly;
  const canReply = config.collection === 'messages' && !config.readOnly;
  const canPublish = PUBLISHABLE_COLLECTIONS.has(config.collection) && !config.readOnly && !config.statusOnly;
  const isStatusOnly = Boolean(config.statusOnly);          // orders: status + archive only
  const isModerationOnly = Boolean(config.moderationOnly);  // reviews: approve/reject/delete
  const hasActions = canUpdate || canDelete || canReply || canPublish || isStatusOnly || isModerationOnly;

  // Status modal for orders
  const [statusModal, setStatusModal] = React.useState(null); // { row }
  const [statusChoice, setStatusChoice] = React.useState('');
  const [cancelReason, setCancelReason] = React.useState('');
  const [statusError, setStatusError] = React.useState('');

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

  const handleArchive = (row) => {
    updateItem(config.collection, getItemId(row), { archived: true, status: 'archived' });
  };

  // Moderation shortcut for reviews
  const handleModerate = (row, decision) => {
    updateItem(config.collection, getItemId(row), { status: decision });
  };
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
    if (column === 'image_url' || column === 'image') {
      const src = rowImageUrl(row);
      return src ? (
        <img className="admin-thumb" src={src} alt={row.title || row.label || row.name || 'Uploaded image'} />
      ) : (
        <span className="td-muted">{row.image_key ? 'Default image' : 'No image yet'}</span>
      );
    }

    if (column === 'status') {
      return (
        <span className={`badge ${row[column] === 'published' || row[column] === 'active' || row[column] === 'new' ? 'badge-success' : 'badge-navy'}`}>
          {statusLabel(row[column])}
        </span>
      );
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
          {EXPORTABLE_PERMISSION_KEYS.has(config.collection) && isApiMode() && (
            <>
              {config.collection === 'products' && (
                <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setShowProductImport(value => !value)}>Batch Import</button>
              )}
              {['csv', 'xlsx', 'pdf'].map(format => (
                <a className="btn btn-outline-navy btn-sm" key={format} href={api.adminExportUrl(config.collection, format)}>
                  Export {format.toUpperCase()}
                </a>
              ))}
            </>
          )}
          {canCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => { setCreating(true); setEditing(null); }}>{config.createLabel}</button>
          )}
        </div>
      </div>

      {config.collection === 'products' && showProductImport && (
        <ProductImportPanel onDone={() => { setShowProductImport(false); fetchCollection(config.collection); }} />
      )}

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
          <h3>{sorted.length} Record{sorted.length !== 1 ? 's' : ''}{sorted.length > TABLE_PAGE_SIZE ? ` (page ${tablePage} of ${totalTablePages})` : ''}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
            {/* Status filter — shown whenever rows have a status column */}
            {rows.some(r => 'status' in r) && (
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-light,#e2e8f0)', background: '#fff', color: filterStatus ? 'var(--navy)' : 'var(--gray-500)', fontWeight: filterStatus ? 700 : 400 }}
              >
                <option value="">Any status</option>
                {[...new Set(rows.map(r => r.status).filter(Boolean))].sort().map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            )}
            <div className="atc-search"><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search records" /></div>
          </div>
        </div>
        {loadError ? (
          <EmptySection
            title="This section could not load"
            body="Please sign in again with an admin account. If it still fails, the account may not have permission for this section."
            action="Open Admin Login"
            onAction={() => { window.location.href = '/admin/login'; }}
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
                  title="Sort by date updated"
                >
                  Updated
                  <span style={{ marginLeft: 4, opacity: sortCol === 'updated_at' ? 1 : 0.3, fontSize: '0.75em' }}>
                    {sortCol === 'updated_at' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </th>
                {hasActions && <th>Actions</th>}
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
                  <td style={{ fontSize: '0.76rem', color: 'var(--gray-600)' }}>{new Date(row.updated_at || row.created_at || Date.now()).toLocaleDateString()}</td>
                  {hasActions && (
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* Standard edit/publish */}
                        {canUpdate && <button className="table-action-btn" onClick={() => { setEditing(row); setCreating(false); }}>Edit</button>}
                        {canReply && <button className="table-action-btn" onClick={() => { setReplying(row); setReplyText(''); setReplyError(''); setEditing(null); setCreating(false); }}>Reply</button>}
                        {'status' in row && canPublish && <button className="table-action-btn" onClick={() => togglePublish(row)}>{row.status === 'published' || row.status === 'active' ? 'Unpublish' : 'Publish'}</button>}

                        {/* Orders: inline status selector + archive */}
                        {isStatusOnly && row.status !== 'archived' && (
                          <OrderStatusSelector
                            row={row}
                            options={config.statusOptions || ['received','shipped','complete','cancelled']}
                            requireCancelReason={config.requireCancelReason}
                            onSave={(patch) => updateItem(config.collection, getItemId(row), patch)}
                          />
                        )}
                        {isStatusOnly && row.status !== 'archived' && (
                          <button className="table-action-btn" onClick={() => handleArchive(row)}>Archive</button>
                        )}

                        {/* Product reviews: moderation only */}
                        {isModerationOnly && row.status !== 'approved' && (
                          <button className="table-action-btn" style={{ background:'#e6f4ea', color:'#1a6e33' }} onClick={() => handleModerate(row, 'approved')}>Approve</button>
                        )}
                        {isModerationOnly && row.status !== 'rejected' && (
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
        )}
      {/* Table pagination */}
      {totalTablePages > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:'18px 0 4px' }}>
          <button className="btn btn-outline-navy btn-sm" disabled={tablePage === 1} onClick={() => setTablePage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize:'0.82rem', color:'var(--gray-600)' }}>Page {tablePage} of {totalTablePages}</span>
          <button className="btn btn-outline-navy btn-sm" disabled={tablePage === totalTablePages} onClick={() => setTablePage(p => p + 1)}>Next →</button>
        </div>
      )}
      </div>

      {/* Order status modal */}
      {statusModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:12, padding:32, width:'100%', maxWidth:440, boxShadow:'0 12px 48px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily:"'Montserrat',sans-serif", color:'var(--navy)', marginBottom:8 }}>Change Order Status</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--gray-600)', marginBottom:20 }}>
              Order: <strong>{statusModal.row.order_reference}</strong> for {statusModal.row.customer_name}
            </p>
            <div className="form-group" style={{ marginBottom:16 }}>
              <label className="form-label">New Status</label>
              <select className="form-select" value={statusChoice} onChange={e => setStatusChoice(e.target.value)}>
                <option value="">Select status</option>
                {(config.statusOptions || ['received','shipped','complete','cancelled']).map(s => (
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
      {confirmModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 20px' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:420, boxShadow:'0 24px 72px rgba(0,0,0,0.28)' }}>
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
    </div>
  );
};

const ApplicationsView = ({ content }) => (
  <ManagedTableView
    config={{
      title: 'Job Applications',
      description: 'Applications submitted by users from the jobs portal appear here for review.',
      collection: 'applications',
      createLabel: '',
      allowCreate: false,
      note: false,
      emptyTitle: 'No Applications Yet',
      emptyBody: 'When users apply for jobs, their submissions will appear here for review, shortlisting, and status updates.',
      fields: [
        field('name', 'Applicant Name'),
        field('email', 'Email'),
        field('job', 'Job'),
        field('status', 'Status', 'select', { options: ['pending', 'reviewed', 'shortlisted', 'accepted', 'rejected'] }),
      ],
      columns: ['name', 'email', 'job', 'status'],
    }}
    rows={content.applications || (isApiMode() ? [] : [
      { id: 1, name: 'Kwame Mensah', email: 'kwame@gmail.com', job: 'Mathematics Teacher (JHS)', status: 'pending', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ])}
  />
);

const AlertsView = () => (
  <div>
    <h2 className="admin-page-title" style={{ marginBottom: 24 }}>Job Alerts</h2>
    <EmptySection
      title="No Job Alerts to Review Yet"
      body="When users save alert preferences, they will appear here for monitoring. New job posts can then be matched against subject, location, level, and employment type."
    />
  </div>
);

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

const PriceAdjustmentView = ({ content }) => {
  const [tab, setTab] = React.useState('promo');
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
        <ManagedTableView config={CONFIG['promoCodes']} rows={content[CONFIG['promoCodes'].collection] || []} />
      )}

      {tab === 'bulk' && (
        <div>
          <p style={{ fontSize:'0.86rem', color:'var(--gray-600)', marginBottom:28 }}>
            Apply a single discount or increase to all product prices or delivery fees at once. Changes are permanent.
          </p>
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
          <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:10, padding:'14px 18px', fontSize:'0.82rem', color:'#664d03', marginTop:24 }}>
            <strong>Tip:</strong> To discount a specific product, set its <em>Old Price</em> (original), then lower its <em>Price</em>. The bookshop shows the crossed-out original automatically.
          </div>
        </div>
      )}
    </div>
  );
};

const TeachersView = () => {
  const [teachers, setTeachers] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [detail, setDetail] = React.useState(null); // full profile object for the modal
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [toggling, setToggling] = React.useState(null); // user id currently being toggled

  const reload = React.useCallback(() => {
    if (!isApiMode()) return;
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setTeachers(data.items || []))
      .catch(() => setTeachers([]));
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  // Only regular users (role === 'user') — admins/staff are filtered out server-side too,
  // but this guards against any future changes.
  const filtered = (teachers || [])
    .filter(t => t.role === 'user' || !t.role)
    .filter(t => !search.trim() || `${t.first_name} ${t.last_name} ${t.email}`.toLowerCase().includes(search.toLowerCase()));

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
      await fetch(`/api/admin/users/${t.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setTeachers(prev => prev.map(u => u.id === t.id ? { ...u, is_active: !t.is_active } : u));
      if (detail && detail.id === t.id) setDetail(d => ({ ...d, is_active: !t.is_active }));
    } catch { /* noop */ }
    finally { setToggling(null); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:24, flexWrap:'wrap' }}>
        <div>
          <h2 className="admin-page-title">Registered Teachers</h2>
          <p style={{ fontSize:'0.86rem', color:'var(--gray-600)', marginTop:4 }}>
            Only teacher accounts are shown. Admin and staff accounts are excluded. Use the export buttons for records.
          </p>
        </div>
        {isApiMode() && (
          <div style={{ display:'flex', gap:10 }}>
            <a className="btn btn-outline-navy btn-sm" href={api.adminExportUrl('users','csv')}>Export CSV</a>
            <a className="btn btn-outline-navy btn-sm" href={api.adminExportUrl('users','xlsx')}>Export Excel</a>
          </div>
        )}
      </div>
      <div className="admin-table-card">
        <div className="atc-header">
          <h3>{filtered.length} Teacher{filtered.length !== 1 ? 's' : ''}</h3>
          <div className="atc-search"><span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email" />
          </div>
        </div>
        {!isApiMode() ? (
          <EmptySection title="API mode required" body="Connect the Flask backend to see registered teachers." />
        ) : teachers === null ? (
          <EmptySection title="Loading…" body="" />
        ) : filtered.length === 0 ? (
          <EmptySection title="No Registered Teachers Yet" body="Teachers who sign up on the portal will appear here." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Phone</th>
                  <th>Verified</th><th>Status</th><th>Registered</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} style={{ opacity: t.is_active === false ? 0.55 : 1 }}>
                    <td className="td-primary">{[t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unknown'}</td>
                    <td>{t.email}</td>
                    <td>{t.phone || 'N/A'}</td>
                    <td><span className={`badge ${t.is_verified ? 'badge-success' : 'badge-navy'}`}>{t.is_verified ? 'Verified' : 'Pending'}</span></td>
                    <td>
                      <span className={`badge ${t.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                        {t.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ fontSize:'0.76rem', color:'var(--gray-600)', whiteSpace:'nowrap' }}>
                      {t.created_at ? new Date(t.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="table-action-btn" onClick={() => openDetail(t)}>View Profile</button>
                        <button
                          className="table-action-btn"
                          style={{ background: t.is_active !== false ? '#fff8e1' : '#f0fdf4', color: t.is_active !== false ? '#92400e' : '#166534' }}
                          disabled={toggling === t.id}
                          onClick={() => toggleActive(t)}
                        >
                          {toggling === t.id ? '…' : t.is_active !== false ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teacher detail modal */}
      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:0, width:'100%', maxWidth:600, boxShadow:'0 24px 72px rgba(0,0,0,0.28)', overflow:'hidden' }}>
            {/* Modal header */}
            <div style={{ background:'var(--navy)', padding:'24px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                {detail.profile_picture_url ? (
                  <img src={detail.profile_picture_url} alt="" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(255,255,255,0.3)' }} />
                ) : (
                  <div style={{ width:52, height:52, borderRadius:'50%', background:'var(--yellow)', color:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18 }}>
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
                <button onClick={() => setDetail(null)} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding:'24px 28px' }}>
              {detailLoading ? (
                <p style={{ color:'var(--gray-600)', textAlign:'center', padding:'20px 0' }}>Loading profile…</p>
              ) : (
                <>
                  {/* Contact info */}
                  <h4 style={{ fontFamily:"'Montserrat',sans-serif", fontSize:'0.78rem', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--gray-600)', marginBottom:12 }}>Contact</h4>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', marginBottom:24 }}>
                    {[['Email', detail.email], ['Phone', detail.phone || 'Not set'], ['Registered', detail.created_at ? new Date(detail.created_at).toLocaleDateString() : 'N/A'], ['Verified', detail.is_verified ? 'Yes ✓' : 'Pending']].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:'var(--gray-500)', marginBottom:2 }}>{k}</div>
                        <div style={{ fontSize:'0.875rem', color:'var(--navy)' }}>{v}</div>
                      </div>
                    ))}
                  </div>

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
                      {(detail.profile.next_of_kin_name || detail.profile.next_of_kin_email) && (
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
                </>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding:'16px 28px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button
                className="btn btn-outline-navy btn-sm"
                style={detail.is_active !== false ? { color:'#92400e', borderColor:'#d97706' } : { color:'#166534', borderColor:'#16a34a' }}
                disabled={toggling === detail.id}
                onClick={() => toggleActive(detail)}
              >
                {toggling === detail.id ? 'Saving…' : detail.is_active !== false ? 'Disable Account' : 'Enable Account'}
              </button>
              <button className="btn btn-outline-navy btn-sm" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AccountView = ({ session }) => {
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
      const res = await fetch(`${API_BASE}/admin/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ error: data.error || 'Failed to update password.' });
      } else {
        setStatus({ success: data.message || 'Password updated successfully.' });
        setForm({ current_password: '', new_password: '', confirm_password: '' });
      }
    } catch {
      setStatus({ error: 'Network error. Please try again.' });
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
            <input type="password" name="current_password" value={form.current_password} onChange={handleChange} autoComplete="current-password" required style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>
            New Password
            <input type="password" name="new_password" value={form.new_password} onChange={handleChange} autoComplete="new-password" required minLength={8} style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>
            Confirm New Password
            <input type="password" name="confirm_password" value={form.confirm_password} onChange={handleChange} autoComplete="new-password" required style={{ fontWeight: 400, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--gray-300)', fontSize: '0.9rem' }} />
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

const AdminPortalPage = () => {
  const { content } = useAdminContent();
  const [activeView, setActiveView] = React.useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [session, setSession] = React.useState(() => getDemoSession());
  const [sessionChecked, setSessionChecked] = React.useState(!isApiMode());
  const isAdminSession = ['admin', 'staff'].includes(session?.role);
  const adminName = isAdminSession ? (session.firstName || 'Admin') : 'Admin';
  const adminInitials = isAdminSession ? (session.initials || 'AD') : 'AD';

  const canViewActive = React.useCallback((key, nextSession = session) => {
    const item = NAV.find(entry => entry.key === key);
    return !item || canAccessAdminItem(item, nextSession);
  }, [session]);

  React.useEffect(() => {
    if (!isApiMode()) {
      if (!session || !['admin', 'staff'].includes(session.role)) {
        window.location.href = '/admin/login';
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
          window.location.href = '/admin/login';
          return;
        }
        const freshSession = {
          role,
          email: user.email,
          firstName: user.first_name || user.firstName || 'Admin',
          lastName: user.last_name || user.lastName || '',
          initials: user.initials || `${user.first_name?.[0] || 'A'}${user.last_name?.[0] || 'D'}`.toUpperCase(),
          permissions: user.permissions || [],
          directPermissions: user.direct_permissions || [],
        };
        saveDemoSession(freshSession);
        setSession(freshSession);
        setSessionChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearDemoSession();
        window.location.href = '/admin/login';
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        window.location.href = '/admin/login';
      }
    };
    window.addEventListener('rmx-session-sync', handler);
    return () => window.removeEventListener('rmx-session-sync', handler);
  }, []);

  React.useEffect(() => {
    if (isApiMode() || sessionChecked) return;
    if (!session || !['admin', 'staff'].includes(session.role)) {
      window.location.href = '/admin/login';
    }
  }, [session, sessionChecked]);

  if (!sessionChecked) return null;

  const view = activeView === 'dashboard'
    ? <DashboardView content={content} setActive={setActiveView} />
    : activeView === 'applications'
      ? <ApplicationsView content={content} />
      : activeView === 'alerts'
        ? <AlertsView />
        : activeView === 'priceAdjustment' || activeView === 'promoCodes' || activeView === 'priceTools'
          ? <PriceAdjustmentView content={content} />
          : activeView === 'teachers'
          ? <TeachersView />
          : activeView === 'account'
          ? <AccountView session={session} />
          : CONFIG[activeView]
            ? <ManagedTableView config={CONFIG[activeView]} rows={content[CONFIG[activeView].collection] || []} />
            : null;

  return (
    <div className="admin-portal-layout">
      <AdminSidebar active={activeView} setActive={setActiveView} open={sidebarOpen} setOpen={setSidebarOpen} session={session} />
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
            {/* Mobile-only hamburger */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mobile-menu-toggle"
              style={{ display: 'none', background: 'none', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
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
          </div>
        </div>
        {view}
      </main>
      <style>{`
        .admin-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .admin-image-help { color: var(--gray-700); font-size: 0.74rem; line-height: 1.5; margin-top: 8px; max-width: 760px; }
        .admin-image-guide { background: #f0f4fa; border-left: 3px solid var(--navy); border-radius: 0 8px 8px 0; padding: 12px 16px; margin-top: 12px; max-width: 680px; display: flex; flex-direction: column; gap: 8px; }
        .admin-ig-row { display: flex; align-items: flex-start; gap: 9px; font-size: 0.78rem; color: #1a2a40; line-height: 1.55; }
        .admin-ig-icon { flex-shrink: 0; color: var(--navy); margin-top: 1px; opacity: 0.75; }
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
        .admin-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--gray-200);
          background: #fff;
          color: var(--navy);
          border-radius: 999px;
          padding: 8px 12px;
          font-family: 'Montserrat', sans-serif;
          font-weight: 800;
          font-size: 0.74rem;
          cursor: pointer;
        }
        @media (max-width: 768px) {
          .mobile-menu-toggle { display: flex !important; }
          .admin-form-grid { grid-template-columns: 1fr; }
          .admin-modal-backdrop { padding: 12px; }
          .admin-modal-close span { display: none; }
        }
      `}</style>
    </div>
  );
};

export default AdminPortalPage;
