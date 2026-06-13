import { slugify } from './seoRoutes.js';
import { TEACHING_CURRICULA, TEACHING_LEVELS, TEACHING_SUBJECTS } from './teachingOptions.js';

const clean = (value = '') => String(value || '').trim();
const idFor = (value, fallback = 'other') => slugify(clean(value)) || fallback;
const asTitle = (value, fallback) => clean(value) || fallback;

const ALL_SUBJECTS = 'All Subjects';
const ALL_LEVELS = 'All Levels';
const ALL_CURRICULA = 'All Curricula';
const SUBJECT_OTHER = 'Other Subjects';
const LEVEL_OTHER = 'Other Levels';
const CURRICULUM_OTHER = 'Other Curricula';
const PUBLISHER_OTHER = 'Other Publishers';

const PRIORITY_SUBJECT_IDS = ['mathematics', 'science', 'english-language', 'english', 'other-subjects'];

const optionObjects = (values, allLabel, otherLabel) => ([
  { value: '', label: `Select ${allLabel.toLowerCase()} or leave blank` },
  { value: allLabel, label: allLabel },
  ...values.map((value) => ({ value, label: value })),
  { value: otherLabel, label: otherLabel },
]);

const countMatches = (books, matcher) => books.reduce((total, book) => total + (matcher(book) ? 1 : 0), 0);

const taxon = (taxonomy, label, count = 0, extras = {}) => ({
  id: idFor(extras.id || label),
  label: asTitle(label, extras.fallbackLabel || 'Other'),
  name: asTitle(label, extras.fallbackLabel || 'Other'),
  count,
  taxonomy,
  description: extras.description || '',
  icon: extras.icon || 'book',
  legacyId: extras.legacyId || null,
});

const previewItems = (items, preferredIds = [], limit = 4) => {
  const chosen = [];
  const used = new Set();
  preferredIds.forEach((id) => {
    const match = items.find((item) => item.id === id && !used.has(item.id));
    if (!match) return;
    chosen.push(match);
    used.add(match.id);
  });
  items.forEach((item) => {
    if (chosen.length >= limit || used.has(item.id)) return;
    chosen.push(item);
    used.add(item.id);
  });
  return chosen;
};

const taxonomyMap = (items) => new Map(items.map((item) => [item.id, item]));
const canonicalBySlug = (options) => new Map(options.map((option) => [idFor(option, ''), option]));

const SUBJECT_LOOKUP = canonicalBySlug([ALL_SUBJECTS, ...TEACHING_SUBJECTS, SUBJECT_OTHER]);
const LEVEL_LOOKUP = canonicalBySlug([ALL_LEVELS, ...TEACHING_LEVELS, LEVEL_OTHER]);
const CURRICULUM_LOOKUP = canonicalBySlug([ALL_CURRICULA, ...TEACHING_CURRICULA, CURRICULUM_OTHER]);

const subjectAliases = [
  { pattern: /\bmaths?\b/i, value: 'Mathematics' },
  { pattern: /\benglish\b/i, value: 'English Language' },
  { pattern: /\bict\b/i, value: 'ICT' },
  { pattern: /\brme\b/i, value: 'Religious and Moral Education' },
  { pattern: /stationery|art supplies|school supplies|general supplies/i, value: SUBJECT_OTHER },
];

const levelAliases = [
  { pattern: /early childhood|daycare|creche|cr[eè]che/i, value: 'Early Childhood / Daycare' },
  { pattern: /pre[-\s]?school|nursery/i, value: 'Pre-School / Nursery' },
  { pattern: /\bkg\b|kindergarten/i, value: 'Kindergarten' },
  { pattern: /lower primary|primary\s*[1-3]\b|\bp[1-3]\b|basic\s*[1-3]\b/i, value: 'Lower Primary' },
  { pattern: /upper primary|primary\s*[4-6]\b|\bp[4-6]\b|basic\s*[4-6]\b/i, value: 'Upper Primary' },
  { pattern: /\bjhs\b|junior high|lower secondary|basic\s*[7-9]\b|jss/i, value: 'Junior High / Lower Secondary' },
  { pattern: /\bshs\b|senior high|upper secondary|sss/i, value: 'Senior High / Upper Secondary' },
  { pattern: /sixth form|pre[-\s]?university|a[-\s]?level/i, value: 'Sixth Form / Pre-University' },
  { pattern: /tvet|vocational/i, value: 'TVET / Vocational' },
];

const curriculumAliases = [
  { pattern: /ges|nacca|waec/i, value: 'GES / NaCCA Curriculum' },
  { pattern: /tvet|ctvet/i, value: 'TVET / CTVET Curriculum' },
  { pattern: /cambridge/i, value: 'Cambridge International Curriculum' },
  { pattern: /british|english national/i, value: 'British / English National Curriculum' },
  { pattern: /pearson|edexcel/i, value: 'Pearson Edexcel Pathway' },
  { pattern: /\bib\b|baccalaureate/i, value: 'International Baccalaureate (IB) Curriculum' },
  { pattern: /american/i, value: 'American Curriculum' },
  { pattern: /montessori/i, value: 'Montessori Curriculum' },
  { pattern: /oxford/i, value: 'Oxford International Curriculum' },
];

const canonicalOrAlias = (value, lookup, aliases = [], fallback = '') => {
  const raw = clean(value);
  if (!raw) return fallback;
  const slug = idFor(raw, '');
  if (lookup.has(slug)) return lookup.get(slug);
  const alias = aliases.find((entry) => entry.pattern.test(raw));
  if (alias) return alias.value;
  return raw;
};

export const normalizeBookshopTaxonomyValue = (taxonomy, value) => {
  switch (taxonomy) {
    case 'subject':
      return canonicalOrAlias(value, SUBJECT_LOOKUP, subjectAliases, '');
    case 'level':
      return canonicalOrAlias(value, LEVEL_LOOKUP, levelAliases, '');
    case 'curriculum':
      return canonicalOrAlias(value, CURRICULUM_LOOKUP, curriculumAliases, '');
    case 'publisher':
    case 'category':
      return clean(value) || '';
    default:
      return clean(value) || '';
  }
};

const buildDynamicTaxonomy = (books, taxonomy, getValue, options = {}) => {
  const counts = new Map();
  const labels = new Map();
  const otherLabel = options.otherLabel || 'Other';

  books.forEach((book) => {
    const raw = clean(getValue(book));
    if (!raw) return;
    const normalized = normalizeBookshopTaxonomyValue(taxonomy, raw);
    const label = /^other$/i.test(normalized) ? otherLabel : normalized || raw;
    const id = idFor(label);
    counts.set(id, (counts.get(id) || 0) + 1);
    if (!labels.has(id)) labels.set(id, label);
  });

  return Array.from(counts.entries())
    .map(([id, count]) => taxon(taxonomy, labels.get(id), count, { id, icon: options.icon, fallbackLabel: otherLabel }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

const buildCategoryTaxonomy = (books, categories) => categories
  .filter((category) => category?.id && category.id !== 'all')
  .map((category) => taxon('category', category.name, countMatches(books, (book) => book.cat === category.id), {
    id: category.id,
    icon: category.icon || 'book',
    description: category.description || '',
    legacyId: category.id,
  }))
  .filter((category) => category.count > 0);

export const PRODUCT_SUBJECT_OPTIONS = optionObjects(TEACHING_SUBJECTS, ALL_SUBJECTS, SUBJECT_OTHER);
export const PRODUCT_LEVEL_OPTIONS = optionObjects(TEACHING_LEVELS, ALL_LEVELS, LEVEL_OTHER);
export const PRODUCT_CURRICULUM_OPTIONS = optionObjects(TEACHING_CURRICULA, ALL_CURRICULA, CURRICULUM_OTHER);

export const buildBookshopTaxonomies = (books = [], categories = []) => {
  const itemTypes = buildCategoryTaxonomy(books, categories);
  const subjects = buildDynamicTaxonomy(books, 'subject', (book) => book.subject, {
    icon: 'book',
    otherLabel: SUBJECT_OTHER,
  });
  const levels = buildDynamicTaxonomy(books, 'level', (book) => book.levelName || book.grade || book.level, {
    icon: 'cap',
    otherLabel: LEVEL_OTHER,
  });
  const curricula = buildDynamicTaxonomy(books, 'curriculum', (book) => book.curriculumName || book.curriculum, {
    icon: 'cap',
    otherLabel: CURRICULUM_OTHER,
  });
  const publishers = buildDynamicTaxonomy(books, 'publisher', (book) => book.publisher, {
    icon: 'files',
    otherLabel: PUBLISHER_OTHER,
  });

  return {
    categories: itemTypes,
    subjects,
    levels,
    curricula,
    publishers,
    preview: {
      subjects: previewItems(subjects, PRIORITY_SUBJECT_IDS, 4),
      levels: previewItems(levels, [], 5),
      curricula: previewItems(curricula, [], 5),
      itemTypes: previewItems(itemTypes, [], 6),
      publishers: previewItems(publishers, [], 5),
    },
    lookup: {
      category: taxonomyMap(itemTypes),
      subject: taxonomyMap(subjects),
      level: taxonomyMap(levels),
      curriculum: taxonomyMap(curricula),
      publisher: taxonomyMap(publishers),
    },
  };
};

export const matchesTaxonomy = (book, taxonomy, id) => {
  const candidate = idFor(id, '');
  if (!candidate || candidate === 'all') return true;
  switch (taxonomy) {
    case 'category':
      return idFor(book.cat, '') === candidate;
    case 'subject':
      return idFor(normalizeBookshopTaxonomyValue('subject', book.subject), '') === candidate;
    case 'level':
      return idFor(normalizeBookshopTaxonomyValue('level', book.levelName || book.grade || book.level), '') === candidate;
    case 'curriculum':
      return idFor(normalizeBookshopTaxonomyValue('curriculum', book.curriculumName || book.curriculum), '') === candidate;
    case 'publisher':
      return idFor(book.publisher, '') === candidate;
    default:
      return true;
  }
};

export const findTaxonomyItem = (taxonomies, taxonomy, id) => {
  if (!taxonomy || !id) return null;
  return taxonomies?.lookup?.[taxonomy]?.get(idFor(id, '')) || null;
};

export const taxonomyLabel = (taxonomy) => {
  switch (taxonomy) {
    case 'category':
      return 'Item Type';
    case 'subject':
      return 'Subject';
    case 'level':
      return 'Level';
    case 'curriculum':
      return 'Curriculum';
    case 'publisher':
      return 'Publisher';
    default:
      return 'Catalogue';
  }
};
