import React from 'react';
import { Icon, LoadingState } from './shared.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';

const FALLBACK_DOCUMENTS = [
  {
    id: 'teacher-recruitment-checklist',
    title: 'Teacher Recruitment Checklist',
    description: 'A starter checklist for schools preparing to hire and onboard teachers.',
    url: 'https://realmindxgh.com/resources',
  },
  {
    id: 'school-improvement-planning',
    title: 'School Improvement Planning Notes',
    description: 'A simple planning outline for school leaders reviewing academic priorities.',
    url: 'https://realmindxgh.com/resources',
  },
  {
    id: 'exam-prep-guide',
    title: 'Exam Preparation Guide',
    description: 'A quick reference for families and teachers preparing learners for major assessments.',
    url: 'https://realmindxgh.com/resources',
  },
];

const DOCUMENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'curriculum', label: 'Curriculum' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'school', label: 'Schools' },
  { key: 'template', label: 'Templates' },
  { key: 'guide', label: 'Guides' },
];

const classifyDocument = (item) => {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  if (/(curriculum|nacca|ges|waec|bece|wassce)/.test(text)) return { key: 'curriculum', label: 'Curriculum' };
  if (/(teacher|teaching|recruitment|lesson|classroom)/.test(text)) return { key: 'teacher', label: 'Teachers' };
  if (/(school|leader|leadership|improvement|administration)/.test(text)) return { key: 'school', label: 'Schools' };
  if (/(template|form|checklist|worksheet|planner)/.test(text)) return { key: 'template', label: 'Templates' };
  return { key: 'guide', label: 'Guides' };
};

const documentUrl = (item) => {
  const value = item.url || item.external_url || item.file_url || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/${value}`;
};

const normalizeDocument = (item) => {
  const type = classifyDocument(item);
  return {
    id: item.id || `${item.title}-${item.url || item.external_url || ''}`,
    title: item.title || 'Untitled Document',
    description: item.description || 'Education resource from RealMindX.',
    url: documentUrl(item),
    type,
  };
};

const DocumentsPage = ({ navigate }) => {
  const [documents, setDocuments] = React.useState(FALLBACK_DOCUMENTS.map(normalizeDocument));
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(isApiMode());
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isApiMode()) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    api.fetchResources()
      .then((data) => {
        if (!alive) return;
        const rows = Array.isArray(data.items) ? data.items : [];
        setDocuments(rows.map(normalizeDocument));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || 'Could not load documents.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const filteredDocuments = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((item) => {
      const matchesFilter = filter === 'all' || item.type.key === filter;
      const matchesQuery = !needle || `${item.title} ${item.description} ${item.type.label}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [documents, filter, query]);

  return (
    <div className="bs-documents-page bs-fade-page">
      <section className="bs-documents-head">
        <div className="bs-container bs-documents-head-inner">
          <div>
            <p className="bs-eyebrow">Education Documents</p>
            <h1 className="bs-h1">Guides, templates, and learning resources</h1>
            <p>Helpful education documents for schools, teachers, parents, and learners.</p>
          </div>
          <div className="bs-documents-count" aria-label={`${documents.length} published documents`}>
            <Icon name="files" size={24} />
            <strong>{documents.length}</strong>
            <span>Published</span>
          </div>
        </div>
      </section>

      <section className="bs-container bs-documents-workspace">
        <div className="bs-documents-toolbar">
          <label className="bs-documents-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search documents"
              aria-label="Search education documents"
            />
          </label>
          <div className="bs-documents-filter" aria-label="Filter education documents">
            <Icon name="filter" size={16} />
            {DOCUMENT_FILTERS.map(item => (
              <button
                key={item.key}
                type="button"
                className={filter === item.key ? 'active' : ''}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bs-documents-results-head">
          <span>{filteredDocuments.length} document{filteredDocuments.length === 1 ? '' : 's'}</span>
          {(query || filter !== 'all') && (
            <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear</button>
          )}
        </div>

        {loading ? (
          <LoadingState title="Loading documents" body="Fetching the latest education resources." />
        ) : error ? (
          <div className="bs-empty-state">
            <div className="bs-empty-icon"><Icon name="refresh" size={34} /></div>
            <h2 className="bs-h2">Documents could not load</h2>
            <p>{error}</p>
            <button className="bs-btn bs-btn-navy" onClick={() => window.location.reload()}>Try Again</button>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="bs-empty-state">
            <div className="bs-empty-icon"><Icon name="files" size={34} /></div>
            <h2 className="bs-h2">No documents found</h2>
            <p>Try a different search term or filter.</p>
            <button className="bs-btn bs-btn-outline-navy" onClick={() => { setQuery(''); setFilter('all'); }}>Show All Documents</button>
          </div>
        ) : (
          <div className="bs-documents-grid">
            {filteredDocuments.map(item => (
              <article className="bs-document-card" key={item.id}>
                <div className="bs-document-icon"><Icon name="files" size={24} /></div>
                <div className="bs-document-copy">
                  <span>{item.type.label}</span>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
                <div className="bs-document-actions">
                  {item.url ? (
                    <a className="bs-btn bs-btn-outline-navy" href={item.url} target="_blank" rel="noopener">
                      Open Document <Icon name="arrow" size={15} />
                    </a>
                  ) : (
                    <button className="bs-btn bs-btn-outline-navy" disabled>Coming Soon</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="bs-documents-foot">
          <span>Need books for a document or curriculum?</span>
          <button type="button" className="bs-btn bs-btn-navy" onClick={() => navigate('shop')}>Browse Bookshop</button>
        </div>
      </section>
    </div>
  );
};

export { DocumentsPage };
