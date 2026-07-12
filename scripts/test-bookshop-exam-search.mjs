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
];

const matches = query => catalogue
  .filter(item => taxonomy.bookMatchesBookshopSearchIntent(item, query))
  .filter(item => taxonomy.bookMatchesBookshopSearch(item, query))
  .map(item => item.title);

const cases = [
  ['WASSCE maths books', ['SHS Core Mathematics']],
  ['BECE maths books', ['JHS Mathematics']],
  ['WAEC maths books', ['JHS Mathematics', 'SHS Core Mathematics', 'GBCE Mathematics', 'ABCE Mathematics']],
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
];

for (const [query, expected] of cases) {
  assert.deepEqual(matches(query).sort(), expected.sort(), query);
}

console.log(`Bookshop examination search matrix passed (${cases.length} cases).`);
