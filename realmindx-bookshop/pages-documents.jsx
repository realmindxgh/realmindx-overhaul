import React from 'react';
import { Icon, LoadingState } from './shared.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';
import { fuzzyScore, normaliseSearchText } from '../src/lib/fuzzySearch.js';
import { setHeadLink, setHeadMeta } from '../src/lib/head.js';
import { canonicalBookshopBase, resourceHref } from './urls.js';

const FALLBACK_DOCUMENTS = [];
const PAGE_SIZES = [5, 10, 20, 50, 100];

const documentUrl = item => {
  const value = item.url || item.file_url || item.external_url || '';
  if (!value) return '';
  return /^https?:\/\//i.test(value) || value.startsWith('/') ? value : `/${value}`;
};

const normalizeDocument = item => ({
  ...item,
  id: item.id || `${item.title}-${item.external_url || ''}`,
  title: item.title || 'Untitled Resource',
  description: item.description || '',
  category: item.category || 'Teacher Resources',
  source: item.source || '',
  level: item.level || '',
  subject: item.subject || '',
  curriculum: item.curriculum || '',
  publicationYear: item.publication_year || '',
  tags: item.tags || '',
  audience: item.audience || '',
  documentType: item.document_type || '',
  copyrightStatus: item.copyright_status || '',
  originalFilename: item.original_filename || '',
  url: documentUrl(item),
  detailUrl: item.detail_url || resourceHref(item),
});

const unique = (items, key) => [...new Set(items.map(item => item[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
const weightedSearch = (items, query) => {
  if (!normaliseSearchText(query)) return [...items];
  return items.map((item, index) => {
    const scores = [
      [item.title, 5], [item.tags, 3.5], [item.category, 3], [item.subject, 3], [item.level, 3],
      [item.description, 2], [item.curriculum, 1.5], [item.source, 1.5], [item.audience, 1.5],
      [item.publicationYear, 1.2], [item.documentType, 1.2], [item.copyrightStatus, 1],
      [item.originalFilename, .7], [item.external_url, .4],
    ].map(([value, weight]) => {
      const score = fuzzyScore(value, query);
      return Number.isFinite(score) ? score * weight : Number.NEGATIVE_INFINITY;
    });
    return { item, index, score: Math.max(...scores) };
  }).filter(result => Number.isFinite(result.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.item);
};

const FilterGroup = ({ label, values, selected, onToggle }) => values.length ? (
  <section className="bs-resource-filter-group">
    <h3>{label}</h3>
    {values.map(value => <label key={value}><input type="checkbox" checked={selected.includes(String(value))} onChange={() => onToggle(String(value))} /><span>{value}</span></label>)}
  </section>
) : null;

const DocumentsPage = ({ navigate }) => {
  const [documents, setDocuments] = React.useState(() => (!isApiMode() && import.meta.env.DEV ? FALLBACK_DOCUMENTS.map(normalizeDocument) : []));
  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState({ category: [], level: [], subject: [], documentType: [] });
  const [sort, setSort] = React.useState('newest');
  const [view, setView] = React.useState('grid');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [mobileFilters, setMobileFilters] = React.useState(false);
  const [loading, setLoading] = React.useState(isApiMode());
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isApiMode()) return undefined;
    let alive = true;
    api.fetchResources().then(data => { if (alive) setDocuments((data.items || []).map(normalizeDocument)); })
      .catch(err => { if (alive) { setDocuments([]); setError(err?.message || 'Could not load resources.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const options = React.useMemo(() => ({
    category: unique(documents, 'category'), level: unique(documents, 'level'), subject: unique(documents, 'subject'), documentType: unique(documents, 'documentType'),
  }), [documents]);
  const hasFilterOptions = Object.values(options).some(values => values.length > 0);
  const toggle = (key, value) => setFilters(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));
  const activeFilterCount = Object.values(filters).reduce((total, values) => total + values.length, 0);
  const filtered = React.useMemo(() => {
    const matched = weightedSearch(documents.filter(item => Object.entries(filters).every(([key, values]) => !values.length || values.includes(String(item[key])))), query);
    return [...matched].sort((a, b) => {
      if (query) return 0;
      if (sort === 'az') return a.title.localeCompare(b.title);
      if (sort === 'updated') return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      if (sort === 'year') return Number(b.publicationYear || 0) - Number(a.publicationYear || 0);
      if (sort === 'featured') return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [documents, filters, query, sort]);
  React.useEffect(() => setPage(1), [query, filters, sort, pageSize]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const clearFilters = () => { setFilters({ category: [], level: [], subject: [], documentType: [] }); setQuery(''); };

  const filterPanel = <div className="bs-resource-filter-panel">
    <div className="bs-resource-filter-head"><h2>Filter Resources</h2>{activeFilterCount ? <button type="button" onClick={clearFilters}>Clear all</button> : null}</div>
    <FilterGroup label="Category" values={options.category} selected={filters.category} onToggle={value => toggle('category', value)} />
    <FilterGroup label="Level" values={options.level} selected={filters.level} onToggle={value => toggle('level', value)} />
    <FilterGroup label="Subject" values={options.subject} selected={filters.subject} onToggle={value => toggle('subject', value)} />
    <FilterGroup label="Document Type" values={options.documentType} selected={filters.documentType} onToggle={value => toggle('documentType', value)} />
  </div>;

  return <div className="bs-documents-page bs-fade-page">
    <section className="bs-documents-head"><div className="bs-container bs-documents-head-inner"><div><p className="bs-eyebrow">Education Resources</p><h1 className="bs-h1">Ghana Education Resource Library</h1><p>Official policies, syllabi, teacher guides, templates, and learning resources for schools, teachers, parents, and learners.</p></div><div className="bs-documents-count"><Icon name="files" size={24} />{loading ? <span>Loading</span> : <><strong>{documents.length}</strong><span>Published</span></>}</div></div></section>
    <section className="bs-container bs-resource-library">
      <label className="bs-resource-search"><Icon name="search" size={20} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search policies, syllabi, guides, subjects, sources..." /></label>
      {hasFilterOptions ? <button className="bs-resource-mobile-filter" type="button" onClick={() => setMobileFilters(true)}><Icon name="filter" size={18} /> Filter {activeFilterCount ? `(${activeFilterCount})` : ''}</button> : null}
      <div className={`bs-resource-layout ${hasFilterOptions ? '' : 'without-filters'}`}>{hasFilterOptions ? <aside>{filterPanel}</aside> : null}<div className="bs-resource-results">
        <div className="bs-resource-results-toolbar"><strong>Showing {visible.length} of {filtered.length} resources</strong><div><select className="bs-sort-select" value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort resources"><option value="newest">Newest</option><option value="az">A-Z</option><option value="updated">Recently updated</option><option value="year">Year, newest first</option><option value="featured">Featured first</option></select><button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Icon name="grid" size={18} /></button><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><Icon name="list" size={18} /></button></div></div>
        {loading ? <LoadingState title="Loading resources" body="Fetching the latest education resources." /> : error ? <div className="bs-empty-state"><h2>Resources could not load</h2><p>{error}</p></div> : !visible.length ? <div className="bs-empty-state"><div className="bs-empty-icon"><Icon name="files" size={34} /></div><h2>No resources found</h2><p>{documents.length ? 'Try adjusting your search or filters. RealMindX is building a Ghana-focused education resource library for schools, teachers, parents, and learners.' : 'RealMindX is preparing official policies, syllabi, teacher guides, and school resources. Please check back soon.'}</p>{documents.length ? <button className="bs-btn bs-btn-outline-navy" onClick={clearFilters}>Clear Search and Filters</button> : null}</div> : <div className={`bs-resource-cards ${view === 'list' ? 'list' : ''}`}>{visible.map(item => <article className="bs-resource-card" key={item.id}><div className="bs-resource-card-icon"><Icon name="files" size={22} /></div><div className="bs-resource-card-copy"><div className="bs-resource-badges"><span>{item.category}</span>{item.featured ? <span>Featured</span> : null}{item.copyrightStatus === 'RealMindX original' ? <span>RealMindX Original</span> : null}</div><h2><a href={item.detailUrl} onClick={event => { event.preventDefault(); navigate('resource', { segment: item.detailUrl.split('/documents/')[1] }); }}>{item.title}</a></h2>{item.description ? <p>{item.description}</p> : null}<dl>{item.level ? <div><dt>Level</dt><dd>{item.level}</dd></div> : null}{item.subject ? <div><dt>Subject</dt><dd>{item.subject}</dd></div> : null}{item.publicationYear ? <div><dt>Year</dt><dd>{item.publicationYear}</dd></div> : null}{item.source ? <div><dt>Source</dt><dd>{item.source}</dd></div> : null}</dl></div><div className="bs-resource-card-actions"><a className="bs-btn bs-btn-navy" href={item.detailUrl} onClick={event => { event.preventDefault(); navigate('resource', { segment: item.detailUrl.split('/documents/')[1] }); }}>View Details</a>{item.file_url && item.copyrightStatus !== 'Linked only' ? <a className="bs-btn bs-btn-outline-navy" href={item.file_url} target="_blank" rel="noopener">Download</a> : null}</div></article>)}</div>}
        {!loading && filtered.length ? <div className="bs-resource-pagination"><span>Page {page} of {pages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} aria-label="Previous page"><Icon name="chevL" size={17} /></button><button type="button" disabled={page === pages} onClick={() => setPage(value => value + 1)} aria-label="Next page"><Icon name="chevR" size={17} /></button></div><label>Rows <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size}>{size}</option>)}</select></label></div> : null}
      </div></div>
      <div className="bs-documents-foot"><span>Need books for a document or curriculum?</span><button type="button" className="bs-btn bs-btn-navy" onClick={() => navigate('shop')}>Browse Bookshop</button></div>
    </section>
    {mobileFilters && hasFilterOptions ? (
      <div className="bs-resource-filter-drawer" role="presentation" onMouseDown={event => event.target === event.currentTarget && setMobileFilters(false)}>
        <section role="dialog" aria-modal="true" aria-labelledby="bs-resource-filter-title">
          <header className="bs-resource-filter-drawer-head">
            <div>
              <h2 id="bs-resource-filter-title">Filter Resources</h2>
              {activeFilterCount ? <button type="button" onClick={clearFilters}>Clear all</button> : null}
            </div>
            <button type="button" className="bs-resource-filter-close" onClick={() => setMobileFilters(false)} aria-label="Close filters"><Icon name="close" size={20} /></button>
          </header>
          <div className="bs-resource-filter-drawer-body">{filterPanel}</div>
          <footer className="bs-resource-filter-drawer-foot">
            <button className="bs-btn bs-btn-navy" type="button" onClick={() => setMobileFilters(false)}>Show {filtered.length} Resources</button>
          </footer>
        </section>
      </div>
    ) : null}
  </div>;
};

const ResourceDetailPage = ({ navigate, segment }) => {
  const resourceId = String(segment || '').match(/^(\d+)(?:-|$)/)?.[1] || '';
  const [resource, setResource] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    if (!resourceId || !isApiMode()) {
      setError('This resource could not be found.');
      setLoading(false);
      return undefined;
    }
    api.fetchResource(resourceId)
      .then(data => { if (alive) setResource(normalizeDocument(data.item || {})); })
      .catch(err => { if (alive) setError(err?.status === 404 ? 'This resource is not currently published.' : (err?.message || 'This resource could not load.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [resourceId]);

  React.useEffect(() => {
    if (!resource) return;
    const canonical = `${canonicalBookshopBase}${resource.detailUrl}`;
    document.title = `${resource.title} | RealMindX Education Resource Library`;
    setHeadMeta('description', resource.description || `View ${resource.title} in the RealMindX Ghana Education Resource Library.`);
    setHeadMeta('robots', 'index, follow');
    setHeadLink('canonical', canonical);
  }, [resource]);

  if (loading) return <div className="bs-container bs-resource-detail-shell"><LoadingState title="Loading resource" body="Getting the published document ready." /></div>;
  if (error || !resource) return <div className="bs-container bs-resource-detail-shell"><div className="bs-empty-state"><h1>Resource unavailable</h1><p>{error}</p><button type="button" className="bs-btn bs-btn-navy" onClick={() => navigate('documents')}>Back to Resource Library</button></div></div>;

  const metadata = [
    ['Category', resource.category], ['Document type', resource.documentType], ['Level', resource.level],
    ['Subject', resource.subject], ['Curriculum', resource.curriculum], ['Audience', resource.audience],
    ['Year', resource.publicationYear], ['Source', resource.source], ['Publication status', resource.copyrightStatus],
  ].filter(([, value]) => value);
  const primaryUrl = resource.copyrightStatus === 'Linked only' ? (resource.official_source_url || resource.external_url || resource.url) : (resource.file_url || resource.url);

  return <div className="bs-resource-detail-page bs-fade-page">
    <section className="bs-container bs-resource-detail-shell">
      <nav className="bs-resource-breadcrumb" aria-label="Breadcrumb"><a href="/documents" onClick={event => { event.preventDefault(); navigate('documents'); }}>Resource Library</a><Icon name="chevR" size={15} /><span>{resource.title}</span></nav>
      <article className="bs-resource-detail-card">
        <div className="bs-resource-detail-icon"><Icon name="files" size={30} /></div>
        <div className="bs-resource-detail-copy"><span className="bs-eyebrow">{resource.category}</span><h1>{resource.title}</h1>{resource.description ? <p>{resource.description}</p> : null}</div>
        {metadata.length ? <dl className="bs-resource-detail-meta">{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
        <div className="bs-resource-detail-actions">{primaryUrl ? <a className="bs-btn bs-btn-gold" href={primaryUrl} target="_blank" rel="noopener">{resource.copyrightStatus === 'Linked only' ? 'View Official Source' : 'View Document'}</a> : null}{resource.file_url && resource.copyrightStatus !== 'Linked only' ? <a className="bs-btn bs-btn-outline-navy" href={resource.file_url} target="_blank" rel="noopener">Download</a> : null}{resource.official_source_url && resource.official_source_url !== primaryUrl ? <a className="bs-btn bs-btn-outline-navy" href={resource.official_source_url} target="_blank" rel="noopener">Official Source</a> : null}</div>
      </article>
    </section>
  </div>;
};

export { DocumentsPage, ResourceDetailPage };
