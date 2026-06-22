import { slugify } from './seoRoutes.js';
import { TEACHING_CURRICULA, TEACHING_LEVELS, TEACHING_SUBJECTS } from './teachingOptions.js';
import SEARCH_ALIAS_GROUPS from './bookshopSearchAliases.json';

const clean = (value = '') => String(value || '').trim();
const idFor = (value, fallback = 'other') => slugify(clean(value)) || fallback;
const asTitle = (value, fallback) => clean(value) || fallback;
export const normalizeBookshopSearchText = (value = '') => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(?:[a-zA-Z]\.){2,}[a-zA-Z]?\.?/g, match => match.replace(/\./g, ''))
  .replace(/&/g, ' and ')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const uniqueClean = (values = []) => {
  const result = [];
  const seen = new Set();
  values.flat().forEach((value) => {
    const text = clean(value);
    const key = normalizeBookshopSearchText(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
};

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
  aliases: extras.aliases || [],
  popularSearches: extras.popularSearches || [],
  seoTitle: extras.seoTitle || '',
  seoDescription: extras.seoDescription || '',
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
const aliasGroupsFor = (taxonomy) => SEARCH_ALIAS_GROUPS[taxonomy] || [];
const aliasGroupValues = (entry = {}) => uniqueClean([
  entry.id,
  entry.canonical,
  entry.displayName,
  entry.aliases || [],
  entry.popularSearches || [],
]);
const findAliasGroup = (taxonomy, value = '', explicitId = '') => {
  const keys = new Set([
    idFor(explicitId, ''),
    idFor(value, ''),
    normalizeBookshopSearchText(value),
  ].filter(Boolean));
  return aliasGroupsFor(taxonomy).find((entry) => aliasGroupValues(entry).some((candidate) => (
    keys.has(idFor(candidate, '')) || keys.has(normalizeBookshopSearchText(candidate))
  ))) || null;
};
const canonicalFromAliasGroup = (taxonomy, value) => findAliasGroup(taxonomy, value)?.canonical || '';
const displayLabelFor = (taxonomy, label, id = '') => findAliasGroup(taxonomy, label, id)?.displayName || label;
const LEVEL_SPECIFIC_SEARCH_TERM = /\b(?:jhs|shs|jss|sss|junior high|senior high|lower secondary|upper secondary|basic\s*[1-9]|primary\s*[1-6]|p[1-6]|kg\s*[12]?|kindergarten|bece|wassce)\b/i;
const CURRICULUM_SPECIFIC_SEARCH_TERM = /\b(?:ges|nacca|waec|cambridge|igcse|british curriculum|english national curriculum|uk curriculum|tvet|ctvet|ghana curriculum|basic school|ghana education service|standards based curriculum|common core programme|ccp)\b/i;
const filterBookSearchAliasTerms = (taxonomy, normalizedValue, values = []) => values.filter((value) => {
  const text = normalizeBookshopSearchText(value);
  const categoryPastPaperTerm = taxonomy === 'category'
    && /\bpast\b/.test(normalizedValue)
    && /\b(bece|wassce)\b/.test(text);
  if (taxonomy !== 'level' && LEVEL_SPECIFIC_SEARCH_TERM.test(text) && !categoryPastPaperTerm) return false;
  if (taxonomy !== 'curriculum' && CURRICULUM_SPECIFIC_SEARCH_TERM.test(text)) return false;
  if (!/\b(bece|wassce)\b/.test(text)) return true;
  return taxonomy === 'level' || categoryPastPaperTerm;
});

const SUBJECT_LOOKUP = canonicalBySlug([ALL_SUBJECTS, ...TEACHING_SUBJECTS, SUBJECT_OTHER]);
const LEVEL_LOOKUP = canonicalBySlug([ALL_LEVELS, ...TEACHING_LEVELS, LEVEL_OTHER]);
const CURRICULUM_LOOKUP = canonicalBySlug([ALL_CURRICULA, ...TEACHING_CURRICULA, CURRICULUM_OTHER]);

const subjectAliases = [
  { pattern: /\bmaths?\b/i, value: 'Mathematics' },
  { pattern: /\benglish\b/i, value: 'English Language' },
  { pattern: /\bict\b|computer studies|coding/i, value: 'Computing' },
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

const SEO_PROFILES = {
  subject: {
    mathematics: {
      title: 'Mathematics Books in Ghana | Maths Textbooks, BECE & WASSCE | RealMindX Bookshop',
      description: 'Shop Mathematics books in Ghana, including maths textbooks, Cambridge maths books, GES/NaCCA Mathematics, BECE and WASSCE revision books, workbooks and classroom materials.',
      intro: 'Find Mathematics books for learners, parents, teachers and schools. This section includes GES/NaCCA Mathematics textbooks, Cambridge maths books, BECE and WASSCE revision books, workbooks, practice books and classroom materials.',
      aliases: ['maths books', 'math books', 'mathematics textbooks', 'BECE maths books', 'WASSCE maths books', 'Cambridge maths books', 'GES Mathematics books'],
      popularSearches: ['BECE maths books', 'WASSCE maths books', 'Cambridge maths books', 'GES Mathematics textbooks'],
    },
    'english-language': {
      title: 'English Language Books in Ghana | Grammar, Reading, BECE & WASSCE | RealMindX Bookshop',
      description: 'Shop English Language books in Ghana, including English textbooks, grammar books, reading books, composition books, BECE English and WASSCE English materials.',
      intro: 'Browse English Language books for reading, grammar, comprehension, composition and exam preparation. This section supports learners, parents, teachers and schools looking for classroom-ready English textbooks and practice materials.',
      aliases: ['English books', 'English textbooks', 'grammar books', 'reading books', 'composition books', 'BECE English', 'WASSCE English'],
      popularSearches: ['grammar books', 'reading books', 'BECE English', 'WASSCE English'],
    },
    computing: {
      title: 'Computing and ICT Books in Ghana | Computer Studies Textbooks | RealMindX Bookshop',
      description: 'Shop Computing and ICT books in Ghana, including computer studies textbooks, JHS ICT books, coding books for students and classroom technology materials.',
      intro: 'Find Computing and ICT books for learners and schools, including computer studies textbooks, JHS ICT books, coding introductions and practical classroom materials.',
      aliases: ['ICT books', 'computing textbooks', 'computer studies books', 'JHS ICT books', 'coding books for students'],
      popularSearches: ['ICT books', 'JHS ICT books', 'computer studies books', 'coding books for students'],
    },
    science: {
      title: 'Science Books in Ghana | Integrated Science, BECE & WASSCE | RealMindX Bookshop',
      description: 'Shop Science books in Ghana, including Integrated Science textbooks, BECE Science books, WASSCE Science revision books, workbooks and classroom materials.',
      intro: 'Browse Science books for school learners, teachers and parents, including Integrated Science textbooks, exam revision books, workbooks and practical learning materials.',
      aliases: ['science books', 'science textbooks', 'Integrated Science books', 'BECE Science', 'WASSCE Science'],
      popularSearches: ['Integrated Science books', 'BECE Science books', 'WASSCE Science books'],
    },
  },
  level: {
    'junior-high-lower-secondary': {
      title: 'JHS Books in Ghana | Basic 7, 8 & 9 Textbooks and BECE Books | RealMindX Bookshop',
      description: 'Shop Junior High and lower secondary books in Ghana, including Basic 7, 8 and 9 textbooks, BECE revision books, workbooks and classroom materials.',
      intro: 'Find Junior High School books for Basic 7, 8 and 9 learners, including textbooks, BECE revision books, workbooks, practice books and classroom materials.',
      aliases: ['JHS books', 'Basic 7 books', 'Basic 8 books', 'Basic 9 books', 'lower secondary textbooks', 'BECE books'],
      popularSearches: ['BECE books', 'Basic 7 textbooks', 'Basic 8 textbooks', 'Basic 9 textbooks'],
    },
    'senior-high-upper-secondary': {
      title: 'SHS Books in Ghana | Senior High Textbooks and WASSCE Books | RealMindX Bookshop',
      description: 'Shop Senior High School books in Ghana, including SHS textbooks, WASSCE revision books, workbooks and classroom materials.',
      intro: 'Browse Senior High School books for classroom study and WASSCE preparation, including textbooks, revision guides, workbooks and practice materials.',
      aliases: ['SHS books', 'Senior High textbooks', 'WASSCE books', 'upper secondary textbooks'],
      popularSearches: ['WASSCE books', 'SHS textbooks', 'Senior High revision books'],
    },
    'upper-primary': {
      title: 'Upper Primary Books in Ghana | Basic 4, 5 & 6 Textbooks | RealMindX Bookshop',
      description: 'Shop Upper Primary books in Ghana, including Basic 4, 5 and 6 textbooks, workbooks, practice books and classroom materials.',
      intro: 'Find Upper Primary textbooks, workbooks and learning materials for Basic 4, 5 and 6 learners.',
      aliases: ['Upper Primary books', 'Basic 4 books', 'Basic 5 books', 'Basic 6 books', 'primary textbooks'],
      popularSearches: ['Basic 4 books', 'Basic 5 books', 'Basic 6 books'],
    },
    'lower-primary': {
      title: 'Lower Primary Books in Ghana | Basic 1, 2 & 3 Textbooks | RealMindX Bookshop',
      description: 'Shop Lower Primary books in Ghana, including Basic 1, 2 and 3 textbooks, workbooks, practice books and classroom materials.',
      intro: 'Find Lower Primary textbooks and workbooks for early foundational learning in Basic 1, 2 and 3.',
      aliases: ['Lower Primary books', 'Basic 1 books', 'Basic 2 books', 'Basic 3 books', 'primary workbooks'],
      popularSearches: ['Basic 1 books', 'Basic 2 books', 'Basic 3 books'],
    },
  },
  curriculum: {
    'ges-nacca-curriculum': {
      title: 'GES/NaCCA Curriculum Books in Ghana | Textbooks and Revision Books | RealMindX Bookshop',
      description: 'Shop GES and NaCCA curriculum books in Ghana, including textbooks, BECE books, WASSCE materials, workbooks and classroom resources.',
      intro: 'Browse books aligned with the GES/NaCCA curriculum, including school textbooks, revision materials, workbooks and classroom resources for Ghanaian learners.',
      aliases: ['GES books', 'NaCCA books', 'GES textbooks', 'NaCCA curriculum books', 'BECE books', 'WASSCE books'],
      popularSearches: ['GES textbooks', 'NaCCA curriculum books', 'BECE books', 'WASSCE books'],
    },
    'cambridge-international-curriculum': {
      title: 'Cambridge Books in Ghana | Cambridge Curriculum Textbooks | RealMindX Bookshop',
      description: 'Shop Cambridge International curriculum books in Ghana, including Cambridge textbooks, workbooks and classroom materials for schools and learners.',
      intro: 'Find Cambridge International curriculum books, textbooks and workbooks for learners, parents, teachers and schools in Ghana.',
      aliases: ['Cambridge books', 'Cambridge textbooks', 'Cambridge maths books', 'Cambridge curriculum books'],
      popularSearches: ['Cambridge textbooks', 'Cambridge maths books', 'Cambridge curriculum books'],
    },
  },
  category: {
    'text-books': {
      title: 'Textbooks in Ghana | School Books, BECE & WASSCE Materials | RealMindX Bookshop',
      description: 'Shop textbooks in Ghana for primary, JHS and SHS learners, including GES/NaCCA books, Cambridge books, BECE and WASSCE revision materials.',
      intro: 'Browse school textbooks for learners, parents, teachers and schools, including GES/NaCCA books, Cambridge titles, BECE materials, WASSCE resources and classroom-ready editions.',
      aliases: ['textbooks in Ghana', 'school books', 'text books', 'BECE books', 'WASSCE books', 'JHS textbooks', 'SHS textbooks'],
      popularSearches: ['BECE books', 'WASSCE books', 'JHS textbooks', 'SHS textbooks'],
    },
    'drawing-books': {
      title: 'Drawing Books in Ghana | School Drawing and Creative Arts Books | RealMindX Bookshop',
      description: 'Shop drawing books and creative arts books in Ghana for school learners, classrooms and home practice.',
      intro: 'Find drawing books and creative arts materials for learners, classrooms and home practice.',
      aliases: ['drawing books', 'creative arts books', 'school drawing books'],
      popularSearches: ['drawing books', 'creative arts books'],
    },
    'writing-books': {
      title: 'Writing Books in Ghana | Handwriting and Practice Books | RealMindX Bookshop',
      description: 'Shop writing books in Ghana, including handwriting books, practice books and classroom writing materials.',
      intro: 'Browse writing books and handwriting practice materials for early learners and classroom use.',
      aliases: ['writing books', 'handwriting books', 'practice books', 'copy books'],
      popularSearches: ['writing books', 'handwriting books', 'practice books'],
    },
  },
};

const LANDING_PROFILES = {
  subject: {
    title: 'Shop Books by Subject in Ghana | RealMindX Bookshop',
    description: 'Search and shop books by subject, including Mathematics, English Language, Science, Computing, BECE books, WASSCE books, textbooks and classroom materials.',
    intro: 'Search and tick one or more subjects to find the books your learner, class or school needs. You can then refine results by level, curriculum, publisher or item type.',
    aliases: ['books by subject', 'school subjects', 'subject textbooks', 'BECE subject books', 'WASSCE subject books'],
    popularSearches: ['Mathematics books', 'English books', 'Science books', 'Computing books'],
  },
  level: {
    title: 'School Books by Level in Ghana | Primary, JHS and SHS | RealMindX Bookshop',
    description: 'Shop school books by level in Ghana, including primary textbooks, JHS books, SHS textbooks, BECE books and WASSCE materials.',
    intro: 'Choose the learner stage first, then refine the matching books by subject, curriculum, publisher or item type.',
    aliases: ['primary books', 'JHS books', 'SHS books', 'BECE books', 'WASSCE books'],
    popularSearches: ['Primary books', 'JHS books', 'SHS books'],
  },
  curriculum: {
    title: 'Curriculum Textbooks in Ghana | GES/NaCCA, Cambridge & More | RealMindX Bookshop',
    description: 'Shop books by curriculum in Ghana, including GES/NaCCA curriculum books, Cambridge textbooks, British curriculum books and classroom materials.',
    intro: 'Choose the curriculum your school follows so you can reach the most relevant textbooks, workbooks and learning materials faster.',
    aliases: ['GES books', 'NaCCA books', 'Cambridge books', 'British curriculum books'],
    popularSearches: ['GES textbooks', 'NaCCA books', 'Cambridge books'],
  },
  category: {
    title: 'Educational Books and Learning Materials in Ghana | RealMindX Bookshop',
    description: 'Shop textbooks, readers, stationery, workbooks and learning materials for learners, parents, teachers and schools in Ghana.',
    intro: 'Choose the kind of learning material you need first, then narrow the list by subject, level, curriculum, publisher, price or stock.',
    aliases: ['educational books', 'learning materials', 'school supplies', 'stationery', 'textbooks'],
    popularSearches: ['Textbooks', 'School books', 'Stationery'],
  },
  publisher: {
    title: 'Educational Book Publishers in Ghana | RealMindX Bookshop',
    description: 'Browse educational titles by publisher and compare textbooks, workbooks, readers and classroom materials available in Ghana.',
    intro: 'Compare available titles by publisher, then narrow them by curriculum, subject, level or item type.',
    aliases: ['book publishers', 'educational publishers', 'school book publishers'],
    popularSearches: ['New Golden Publication', 'Cambridge publishers', 'school book publishers'],
  },
};

const fallbackSeoProfile = (taxonomy, label, id) => {
  const cleanLabel = clean(label) || taxonomyLabel(taxonomy);
  const lowerLabel = cleanLabel.toLowerCase();
  if (!id) return LANDING_PROFILES[taxonomy] || LANDING_PROFILES.category;
  switch (taxonomy) {
    case 'subject':
      return {
        title: `${cleanLabel} Books in Ghana | Textbooks and Learning Materials | RealMindX Bookshop`,
        description: `Shop ${cleanLabel} books in Ghana, including textbooks, workbooks, revision books, practice books and classroom materials.`,
        intro: `Find ${cleanLabel} books for learners, parents, teachers and schools, including textbooks, workbooks, revision books, practice books and classroom materials.`,
        aliases: [`${cleanLabel} books`, `${cleanLabel} textbooks`, `${cleanLabel} workbooks`, `${cleanLabel} revision books`],
        popularSearches: [`${cleanLabel} books`, `${cleanLabel} textbooks`, `${cleanLabel} workbooks`],
      };
    case 'level':
      return {
        title: `${cleanLabel} Books in Ghana | Textbooks and Revision Books | RealMindX Bookshop`,
        description: `Shop ${cleanLabel} books in Ghana, including textbooks, workbooks, revision books and classroom materials.`,
        intro: `Find books and learning materials matched to ${cleanLabel}, including textbooks, workbooks, revision guides and practice materials.`,
        aliases: [`${cleanLabel} books`, `${cleanLabel} textbooks`, `${cleanLabel} workbooks`],
        popularSearches: [`${cleanLabel} books`, `${cleanLabel} textbooks`],
      };
    case 'curriculum':
      return {
        title: `${cleanLabel} Books in Ghana | Curriculum Textbooks | RealMindX Bookshop`,
        description: `Shop ${cleanLabel} books in Ghana, including curriculum textbooks, workbooks and classroom materials.`,
        intro: `Browse titles that fit the ${cleanLabel} pathway, including textbooks, workbooks and classroom materials.`,
        aliases: [`${cleanLabel} books`, `${cleanLabel} textbooks`, `${cleanLabel} curriculum books`],
        popularSearches: [`${cleanLabel} books`, `${cleanLabel} textbooks`],
      };
    case 'publisher':
      return {
        title: `${cleanLabel} Books in Ghana | RealMindX Bookshop`,
        description: `Shop available books from ${cleanLabel}, including textbooks, workbooks and classroom materials for learners and schools.`,
        intro: `Browse books currently available from ${cleanLabel}, then narrow them by subject, curriculum, level or item type.`,
        aliases: [`${cleanLabel} books`, `${cleanLabel} textbooks`, `${cleanLabel} school books`],
        popularSearches: [`${cleanLabel} books`, `${cleanLabel} textbooks`],
      };
    default:
      return {
        title: `${cleanLabel} in Ghana | RealMindX Bookshop`,
        description: `Shop ${lowerLabel} in Ghana at RealMindX Bookshop for learners, parents, teachers and schools.`,
        intro: `Browse ${lowerLabel} in the RealMindX Bookshop and refine by subject, level, curriculum, publisher or stock.`,
        aliases: [`${cleanLabel}`, `${cleanLabel} in Ghana`, `${cleanLabel} for school`],
        popularSearches: [`${cleanLabel}`],
      };
  }
};

export const getBookshopSeoProfile = (taxonomy, value = '') => {
  const source = typeof value === 'object' && value ? value : {};
  const isLanding = !source.id && !source.label && !source.name && !clean(value);
  const label = isLanding ? '' : (source.label || source.name || value || taxonomyLabel(taxonomy));
  const id = isLanding ? '' : idFor(source.id || label, '');
  const aliasGroup = findAliasGroup(taxonomy, label, id);
  const displayLabel = clean(aliasGroup?.displayName || label);
  const profile = SEO_PROFILES[taxonomy]?.[id] || fallbackSeoProfile(taxonomy, displayLabel || label, id);
  return {
    ...profile,
    label: displayLabel,
    id,
    aliases: uniqueClean([profile.aliases || [], aliasGroup?.aliases || []]),
    popularSearches: uniqueClean([profile.popularSearches || [], aliasGroup?.popularSearches || []]),
  };
};

const canonicalOrAlias = (value, lookup, aliases = [], fallback = '') => {
  const raw = clean(value);
  if (!raw) return fallback;
  const slug = idFor(raw, '');
  if (lookup.has(slug)) return lookup.get(slug);
  const taxonomy = aliases === subjectAliases
    ? 'subject'
    : aliases === levelAliases
      ? 'level'
      : aliases === curriculumAliases
        ? 'curriculum'
        : '';
  const aliasCanonical = taxonomy ? canonicalFromAliasGroup(taxonomy, raw) : '';
  if (aliasCanonical) return aliasCanonical;
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

export const getBookshopTaxonomySearchTerms = (taxonomy, value = '', options = {}) => {
  const raw = clean(value);
  const normalized = normalizeBookshopTaxonomyValue(taxonomy, raw) || raw;
  const id = idFor(normalized, '');
  const profile = getBookshopSeoProfile(taxonomy, { id, label: normalized });
  const aliasGroup = findAliasGroup(taxonomy, normalized || raw, id);
  const normalizedValue = normalizeBookshopSearchText(normalized);
  const profileAliases = options.forBookSearch
    ? filterBookSearchAliasTerms(taxonomy, normalizedValue, profile.aliases || [])
    : profile.aliases || [];
  const profilePopularSearches = options.forBookSearch
    ? filterBookSearchAliasTerms(taxonomy, normalizedValue, profile.popularSearches || [])
    : profile.popularSearches || [];
  const groupAliases = options.forBookSearch
    ? filterBookSearchAliasTerms(taxonomy, normalizedValue, aliasGroup?.aliases || [])
    : aliasGroup?.aliases || [];
  const groupPopularSearches = options.forBookSearch
    ? filterBookSearchAliasTerms(taxonomy, normalizedValue, aliasGroup?.popularSearches || [])
    : aliasGroup?.popularSearches || [];
  return uniqueClean([
    raw,
    normalized,
    profile.label,
    profileAliases,
    profilePopularSearches,
    aliasGroup?.canonical,
    aliasGroup?.displayName,
    groupAliases,
    groupPopularSearches,
  ]);
};

export const bookshopSearchTextForBook = (book = {}) => uniqueClean([
  book.title,
  book.name,
  book.short,
  book.desc,
  book.full,
  book.catName,
  book.category,
  book.author,
  book.publisher,
  book.isbn,
  book.product_type,
  book.delivery_note,
  getBookshopTaxonomySearchTerms('category', book.catName || book.category || book.cat, { forBookSearch: true }),
  getBookshopTaxonomySearchTerms('subject', book.subject, { forBookSearch: true }),
  getBookshopTaxonomySearchTerms('level', book.levelName || book.grade || book.level, { forBookSearch: true }),
  getBookshopTaxonomySearchTerms('curriculum', book.curriculumName || book.curriculum, { forBookSearch: true }),
  getBookshopTaxonomySearchTerms('publisher', book.publisher, { forBookSearch: true }),
  book.tags || [],
]).map(normalizeBookshopSearchText).join(' ');

const directBookSearchTextForBook = (book = {}) => uniqueClean([
  book.title,
  book.name,
  book.short,
  book.desc,
  book.full,
  book.catName,
  book.category,
  book.author,
  book.publisher,
  book.isbn,
  book.product_type,
  book.delivery_note,
  book.subject,
  book.levelName,
  book.grade,
  book.level,
  book.curriculumName,
  book.curriculum,
  book.tags || [],
]).map(normalizeBookshopSearchText).join(' ');

const taxonomyValueForBook = (book, taxonomy) => {
  switch (taxonomy) {
    case 'category':
      return book.catName || book.category || book.cat;
    case 'subject':
      return book.subject;
    case 'level':
      return book.levelName || book.grade || book.level;
    case 'curriculum':
      return book.curriculumName || book.curriculum;
    case 'publisher':
      return book.publisher;
    default:
      return '';
  }
};

const exactAliasGroupsForQuery = (normalizedQuery) => {
  const matches = [];
  Object.entries(SEARCH_ALIAS_GROUPS).forEach(([taxonomy, entries]) => {
    entries.forEach((entry) => {
      const normalizedValue = normalizeBookshopSearchText(
        normalizeBookshopTaxonomyValue(taxonomy, entry.canonical) || entry.canonical,
      );
      const exactCandidate = aliasGroupValues(entry).find(
        candidate => normalizeBookshopSearchText(candidate) === normalizedQuery,
      );
      if (!exactCandidate) return;
      if (!filterBookSearchAliasTerms(taxonomy, normalizedValue, [exactCandidate]).length) return;
      matches.push({ taxonomy, entry });
    });
  });
  return matches;
};

const matchesExactAliasGroup = (book, match) => {
  const bookGroup = findAliasGroup(match.taxonomy, taxonomyValueForBook(book, match.taxonomy));
  return Boolean(bookGroup && bookGroup.id === match.entry.id);
};

const gradeSearchTarget = (normalizedQuery) => {
  let match = normalizedQuery.match(/\b(?:basic|grade)\s*([1-9])\b/);
  if (match) return `basic ${match[1]}`;
  match = normalizedQuery.match(/\bprimary\s*([1-6])\b/);
  if (match) return `basic ${match[1]}`;
  match = normalizedQuery.match(/\bp\s*([1-6])\b/);
  if (match) return `basic ${match[1]}`;
  match = normalizedQuery.match(/\bjhs\s*([1-3])\b/);
  if (match) return `basic ${Number(match[1]) + 6}`;
  match = normalizedQuery.match(/\bshs\s*([1-3])\b/);
  if (match) return `shs ${match[1]}`;
  match = normalizedQuery.match(/\bkg\s*([12])\b/);
  if (match) return `kg ${match[1]}`;
  return '';
};

const GENERIC_SEARCH_TOKENS = new Set(['book', 'books', 'textbook', 'textbooks', 'ghana', 'school', 'schools']);

export const bookMatchesBookshopSearch = (book, query) => {
  const normalizedQuery = normalizeBookshopSearchText(query);
  if (!normalizedQuery) return true;

  const gradeTarget = gradeSearchTarget(normalizedQuery);
  if (gradeTarget) return directBookSearchTextForBook(book).includes(gradeTarget);

  const exactAliasGroups = exactAliasGroupsForQuery(normalizedQuery);
  if (exactAliasGroups.length > 0) {
    return exactAliasGroups.some(match => matchesExactAliasGroup(book, match));
  }

  const haystack = bookshopSearchTextForBook(book);
  const haystackTokens = new Set(haystack.split(' ').filter(Boolean));
  const tokens = normalizedQuery
    .split(' ')
    .filter((token) => (token.length > 1 || /^\d+$/.test(token)) && !GENERIC_SEARCH_TOKENS.has(token));
  const matchesToken = token => (
    haystackTokens.has(token)
    || (token.length >= 3 && [...haystackTokens].some(candidate => candidate.startsWith(token)))
  );
  return tokens.length > 0 && tokens.every(matchesToken);
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
    .map(([id, count]) => {
      const label = labels.get(id);
      const profile = getBookshopSeoProfile(taxonomy, { id, label });
      return taxon(taxonomy, profile.label || displayLabelFor(taxonomy, label, id), count, {
        id,
        icon: options.icon,
        fallbackLabel: otherLabel,
        description: profile.intro || profile.description,
        aliases: profile.aliases,
        popularSearches: profile.popularSearches,
        seoTitle: profile.title,
        seoDescription: profile.description,
      });
    })
    .sort((left, right) => left.label.localeCompare(right.label));
};

const buildCategoryTaxonomy = (books, categories) => categories
  .filter((category) => category?.id && category.id !== 'all')
  .map((category) => {
    const profile = getBookshopSeoProfile('category', { id: category.id, label: category.name });
    return taxon('category', profile.label || displayLabelFor('category', category.name, category.id), countMatches(books, (book) => book.cat === category.id), {
      id: category.id,
      icon: category.icon || 'book',
      description: category.description || profile.intro || profile.description,
      legacyId: category.id,
      aliases: profile.aliases,
      popularSearches: profile.popularSearches,
      seoTitle: profile.title,
      seoDescription: profile.description,
    });
  })
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
