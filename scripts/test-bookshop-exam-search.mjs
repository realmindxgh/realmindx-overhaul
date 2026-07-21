import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const outfile = join(tmpdir(), `realmindx-bookshop-taxonomy-${Date.now()}.mjs`);
await build({
  entryPoints: ['src/lib/bookshopTaxonomy.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
});
const taxonomy = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

const book = (title, levelName, curriculumName, subject = 'Mathematics') => ({
  title, levelName, curriculumName, subject,
});

const withAll = (title, levelName, curriculumName, subject = 'All Subjects') => ({
  title, levelName, curriculumName, subject,
});

const catalogue = [
  book('KG Mathematics', 'Kindergarten', 'GES / NaCCA Curriculum'),
  book('Primary Mathematics', 'Upper Primary', 'GES / NaCCA Curriculum'),
  book('Common Entrance Mathematics', 'Upper Primary', 'British / English National Curriculum'),
  book('JHS Mathematics', 'Junior High / Lower Secondary', 'GES / NaCCA Curriculum'),
  book('SHS Core Mathematics', 'Senior High / Upper Secondary', 'GES / NaCCA Curriculum'),
  book('GBCE Mathematics', 'Senior High / Upper Secondary', 'GES / NaCCA Curriculum'),
  book('ABCE Mathematics', 'Sixth Form / Pre-University', 'GES / NaCCA Curriculum'),
  book('Cambridge Primary Checkpoint Mathematics', 'Upper Primary', 'Cambridge International Curriculum'),
  book('Cambridge Lower Secondary Checkpoint Mathematics', 'Junior High / Lower Secondary', 'Cambridge International Curriculum'),
  book('Cambridge IGCSE Mathematics', 'Senior High / Upper Secondary', 'Cambridge International Curriculum'),
  book('Cambridge O Level Mathematics', 'Senior High / Upper Secondary', 'Cambridge International Curriculum'),
  book('Cambridge A Level Mathematics', 'Sixth Form / Pre-University', 'Cambridge International Curriculum'),
  book('Pearson International GCSE Mathematics', 'Senior High / Upper Secondary', 'Pearson Edexcel Pathway'),
  book('Pearson International A Level Mathematics', 'Sixth Form / Pre-University', 'Pearson Edexcel Pathway'),
  book('OxfordAQA International GCSE Mathematics', 'Senior High / Upper Secondary', 'Oxford International Curriculum'),
  book('OxfordAQA A Level Mathematics', 'Sixth Form / Pre-University', 'Oxford International Curriculum'),
  book('IB Primary Years Mathematics', 'Upper Primary', 'International Baccalaureate (IB) Curriculum'),
  book('IB Middle Years Mathematics', 'Junior High / Lower Secondary', 'International Baccalaureate (IB) Curriculum'),
  book('IB Diploma Mathematics', 'Sixth Form / Pre-University', 'International Baccalaureate (IB) Curriculum'),
  book('SAT Mathematics', 'Sixth Form / Pre-University', 'American Curriculum'),
  book('ACT Mathematics', 'Senior High / Upper Secondary', 'American Curriculum'),
  book('AP Calculus Mathematics', 'Senior High / Upper Secondary', 'American Curriculum'),
  book('BTEC Engineering Mathematics', 'TVET / Vocational', 'Pearson Edexcel Pathway'),
  book('CTVET Mathematics', 'TVET / Vocational', 'TVET / CTVET Curriculum'),
  book('NVTI Mathematics', 'TVET / Vocational', 'TVET / CTVET Curriculum'),
  book('NECO Mathematics', 'Senior High / Upper Secondary', ''),
  book('JAMB Mathematics', 'Sixth Form / Pre-University', ''),
  // BECE/WASSCE picks edge-case books
  book('All Curricula JHS Book', 'Junior High / Lower Secondary', 'All Curricula'),
  book('GES All Levels Book', 'All Levels', 'GES / NaCCA Curriculum'),
  book('All Curricula All Levels Book', 'All Levels', 'All Curricula'),
  book('Cambridge JHS Book', 'Junior High / Lower Secondary', 'Cambridge International Curriculum'),
  book('Cambridge SHS Book', 'Senior High / Upper Secondary', 'Cambridge International Curriculum'),
  book('GES Primary Book', 'Upper Primary', 'GES / NaCCA Curriculum'),
  book('GES Sixth Form Book', 'Sixth Form / Pre-University', 'GES / NaCCA Curriculum'),
];

const matches = query => catalogue
  .filter(item => taxonomy.bookMatchesBookshopSearchIntent(item, query))
  .filter(item => taxonomy.bookMatchesBookshopSearch(item, query))
  .map(item => item.title);

const cases = [
  ['WASSCE maths books', ['SHS Core Mathematics']],
  ['BECE maths books', ['JHS Mathematics']],
  ['WAEC maths books', ['JHS Mathematics', 'SHS Core Mathematics', 'GBCE Mathematics', 'ABCE Mathematics', 'GES Sixth Form Book']],
  ['GBCE maths books', ['GBCE Mathematics']],
  ['ABCE maths books', ['ABCE Mathematics']],
  ['Common Entrance maths', ['Common Entrance Mathematics']],
  ['Cambridge Primary Checkpoint maths', ['Cambridge Primary Checkpoint Mathematics']],
  ['Cambridge Lower Secondary Checkpoint maths', ['Cambridge Lower Secondary Checkpoint Mathematics']],
  ['IGCSE maths books', ['Cambridge IGCSE Mathematics', 'Pearson International GCSE Mathematics', 'OxfordAQA International GCSE Mathematics']],
  ['Pearson Edexcel IGCSE maths', ['Pearson International GCSE Mathematics']],
  ['O level maths books', ['Cambridge O Level Mathematics']],
  ['A level maths books', ['Cambridge A Level Mathematics', 'Pearson International A Level Mathematics', 'OxfordAQA A Level Mathematics']],
  ['Pearson IAL maths', ['Pearson International A Level Mathematics']],
  ['OxfordAQA IGCSE maths', ['OxfordAQA International GCSE Mathematics']],
  ['OxfordAQA A level maths', ['OxfordAQA A Level Mathematics']],
  ['IB PYP maths', ['IB Primary Years Mathematics']],
  ['IB MYP maths', ['IB Middle Years Mathematics']],
  ['IB Diploma maths', ['IB Diploma Mathematics']],
  ['SAT maths books', ['SAT Mathematics']],
  ['ACT maths books', ['ACT Mathematics']],
  ['AP exam maths books', ['AP Calculus Mathematics']],
  ['BTEC maths books', ['BTEC Engineering Mathematics']],
  ['CTVET maths books', ['CTVET Mathematics']],
  ['NVTI maths books', ['NVTI Mathematics']],
  ['NECO maths books', ['NECO Mathematics']],
  ['JAMB maths books', ['JAMB Mathematics']],
  // BECE Picks intersection: curriculum=GES/NaCCA + level=Junior High/Lower Secondary
  ['BECE mathematics textbooks', ['JHS Mathematics']],
  ['GES / NaCCA Curriculum Junior High / Lower Secondary textbooks', ['JHS Mathematics']],
  // WASSCE Picks intersection: curriculum=GES/NaCCA + level=Senior High/Upper Secondary
  ['WASSCE mathematics textbooks', ['SHS Core Mathematics']],
  ['GES / NaCCA Curriculum Senior High / Upper Secondary textbooks', ['GBCE Mathematics', 'SHS Core Mathematics']],
  // Exclusions — All Curricula + JHS must NOT appear in BECE picks
  ['GES / NaCCA Curriculum Junior High / Lower Secondary mathematics', ['JHS Mathematics']],
  // Exclusions — products with wrong curriculum, wrong level, or All Curricula/All Levels must not match
  // (these are verified via strict curriculum+level matching below)
];

for (const [query, expected] of cases) {
  assert.deepEqual(matches(query).sort(), expected.sort(), query);
}
console.log(`Bookshop examination search matrix passed (${cases.length} cases).`);

// ---- BECE/WASSCE Picks intersection validation ----
// Verify that only products matching the exact curriculum+level intersection
// are selectable via the alias-resolved structured query values.

const picksCatalogue = [
  book('JHS GES Mathematics', 'Junior High / Lower Secondary', 'GES / NaCCA Curriculum'),
  book('SHS GES Core Mathematics', 'Senior High / Upper Secondary', 'GES / NaCCA Curriculum'),
  // Should NOT qualify:
  book('All Curricula JHS', 'Junior High / Lower Secondary', 'All Curricula'),
  book('GES All Levels', 'All Levels', 'GES / NaCCA Curriculum'),
  book('All Curricula All Levels', 'All Levels', 'All Curricula'),
  book('Cambridge JHS', 'Junior High / Lower Secondary', 'Cambridge International Curriculum'),
  book('Cambridge SHS', 'Senior High / Upper Secondary', 'Cambridge International Curriculum'),
  book('GES Primary', 'Upper Primary', 'GES / NaCCA Curriculum'),
  book('GES Sixth Form', 'Sixth Form / Pre-University', 'GES / NaCCA Curriculum'),
  book('GES Kindergarten', 'Kindergarten', 'GES / NaCCA Curriculum'),
];

const matchBece = query => picksCatalogue
  .filter(item => taxonomy.bookMatchesBookshopSearchIntent(item, query))
  .filter(item => taxonomy.bookMatchesBookshopSearch(item, query))
  .map(item => item.title);

const matchWassce = query => picksCatalogue
  .filter(item => taxonomy.bookMatchesBookshopSearchIntent(item, query))
  .filter(item => taxonomy.bookMatchesBookshopSearch(item, query))
  .map(item => item.title);

// BECE picks: only JHS GES Mathematics should qualify
const beceResults = matchBece('BECE textbooks');
assert.ok(beceResults.includes('JHS GES Mathematics'), 'BECE picks must include JHS GES Mathematics');
assert.ok(!beceResults.includes('SHS GES Core Mathematics'), 'BECE picks must NOT include SHS products');
assert.ok(!beceResults.includes('All Curricula JHS'), 'BECE picks must NOT include All Curricula + JHS');
assert.ok(!beceResults.includes('GES All Levels'), 'BECE picks must NOT include GES + All Levels');
assert.ok(!beceResults.includes('All Curricula All Levels'), 'BECE picks must NOT include All Curricula + All Levels');
assert.ok(!beceResults.includes('Cambridge JHS'), 'BECE picks must NOT include Cambridge + JHS');
assert.ok(!beceResults.includes('GES Primary'), 'BECE picks must NOT include GES + Primary');
assert.ok(!beceResults.includes('GES Kindergarten'), 'BECE picks must NOT include GES + Kindergarten');

// WASSCE picks: only SHS GES Core Mathematics should qualify
const wassceResults = matchWassce('WASSCE textbooks');
assert.ok(wassceResults.includes('SHS GES Core Mathematics'), 'WASSCE picks must include SHS GES Core Mathematics');
assert.ok(!wassceResults.includes('JHS GES Mathematics'), 'WASSCE picks must NOT include JHS products');
assert.ok(!wassceResults.includes('All Curricula JHS'), 'WASSCE picks must NOT include All Curricula');
assert.ok(!wassceResults.includes('GES All Levels'), 'WASSCE picks must NOT include All Levels');
assert.ok(!wassceResults.includes('Cambridge SHS'), 'WASSCE picks must NOT include Cambridge + SHS');
assert.ok(!wassceResults.includes('GES Primary'), 'WASSCE picks must NOT include GES + Primary');
assert.ok(!wassceResults.includes('GES Sixth Form'), 'WASSCE picks must NOT include GES + Sixth Form');
assert.ok(!wassceResults.includes('GES Kindergarten'), 'WASSCE picks must NOT include GES + Kindergarten');

console.log('BECE/WASSCE picks intersection validation passed.');
