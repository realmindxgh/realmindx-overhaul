import React from 'react';

import { DatePickerField, Icon } from '../../realmindx-site/assets/components.jsx';
import { api, isApiMode } from '../lib/apiClient.js';
import './analytics.css';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Product Analytics' },
  { id: 'search', label: 'Search Analytics' },
  { id: 'roadmap', label: 'Phase 2' },
];

const PRODUCT_LENSES = [
  { value: 'all', label: 'All products' },
  { value: 'most_viewed', label: 'Most viewed' },
  { value: 'most_purchased', label: 'Most purchased' },
  { value: 'most_added', label: 'Most added to cart' },
  { value: 'most_abandoned', label: 'Most abandoned' },
  { value: 'highest_revenue', label: 'Highest revenue' },
  { value: 'lowest_conversion', label: 'Lowest conversion' },
  { value: 'out_of_stock_but_searched', label: 'Out of stock but searched' },
  { value: 'viewed_never_purchased', label: 'Viewed but never purchased' },
  { value: 'added_rarely_purchased', label: 'Added to cart but rarely purchased' },
  { value: 'no_views', label: 'Products with no views' },
  { value: 'no_sales', label: 'Products with no sales' },
  { value: 'needs_restock', label: 'Products needing restock' },
  { value: 'gaining_interest', label: 'Gaining interest' },
];

const PRODUCT_SORTS = [
  { value: 'views', label: 'Views' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'add_to_cart', label: 'Add to cart' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'conversion_rate', label: 'Conversion rate' },
  { value: 'search_impressions', label: 'Search interest' },
  { value: 'cart_abandonment_count', label: 'Cart abandonment' },
  { value: 'interest_delta', label: 'Interest change' },
];

const numberFormat = new Intl.NumberFormat('en-US');
const currencyFormat = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const CHART_COLORS = {
  navy: 'var(--navy)',
  gold: 'var(--yellow-dark)',
  success: 'var(--success)',
  info: 'var(--info)',
  danger: 'var(--danger)',
  slate: 'var(--gray-400)',
};

const formatNumber = (value) => numberFormat.format(Number(value || 0));
const formatCurrency = (value) => currencyFormat.format(Number(value || 0));
const formatPercent = (value) => `${percentFormat.format(Number(value || 0))}%`;
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No data yet';

const queryParamsForRange = (preset, start, end) => (
  preset === 'custom'
    ? { preset, start, end }
    : { preset }
);

const lensPredicate = (lens, item) => {
  switch (lens) {
    case 'most_viewed':
      return item.views > 0;
    case 'most_purchased':
      return item.quantity_sold > 0;
    case 'most_added':
      return item.add_to_cart > 0;
    case 'most_abandoned':
      return item.cart_abandonment_count > 0;
    case 'highest_revenue':
      return item.revenue > 0;
    case 'lowest_conversion':
      return item.views > 0;
    case 'out_of_stock_but_searched':
      return item.status === 'Out of stock' && item.search_impressions > 0;
    case 'viewed_never_purchased':
      return item.views > 0 && item.purchases === 0;
    case 'added_rarely_purchased':
      return item.add_to_cart > 0 && item.purchases <= Math.max(1, Math.floor(item.add_to_cart * 0.15));
    case 'no_views':
      return item.views === 0;
    case 'no_sales':
      return item.quantity_sold === 0;
    case 'needs_restock':
      return (item.status === 'Out of stock' || item.stock_quantity <= 5) && (item.search_impressions > 0 || item.views > 0);
    case 'gaining_interest':
      return item.interest_delta > 0;
    default:
      return true;
  }
};

const compareBySort = (sortKey) => (left, right) => {
  const valueLeft = Number(left[sortKey] || 0);
  const valueRight = Number(right[sortKey] || 0);
  if (sortKey === 'conversion_rate') return valueLeft - valueRight;
  return valueRight - valueLeft;
};

const StatusBadge = ({ children, tone = 'navy' }) => (
  <span className={`analytics-pill analytics-pill-${tone}`}>{children}</span>
);

const ExportButton = ({ href, label }) => (
  <a className="analytics-export-btn" href={href} target="_blank" rel="noreferrer">
    <Icon name="file" size={14} />
    <span>{label}</span>
  </a>
);

const SectionHeader = ({ eyebrow, title, body, actions }) => (
  <div className="analytics-section-head">
    <div>
      {eyebrow && <span className="analytics-eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
    </div>
    {actions ? <div className="analytics-section-actions">{actions}</div> : null}
  </div>
);

const StatCard = ({ label, value, note, icon, tone = 'navy' }) => (
  <article className="analytics-stat-card">
    <div className={`analytics-stat-icon analytics-tone-${tone}`}><Icon name={icon} size={18} /></div>
    <div className="analytics-stat-copy">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  </article>
);

const EmptyChart = () => (
  <div className="analytics-chart-empty">
    <Icon name="chart" size={18} />
    <span>No data yet</span>
  </div>
);

const LineChart = ({ series = [], color = CHART_COLORS.navy, compact = false }) => {
  const data = Array.isArray(series) ? series : [];
  const values = data.map(item => Number(item.value || 0));
  const max = Math.max(...values, 0);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? 50 : (index / Math.max(data.length - 1, 1)) * 100;
    const y = max === 0 ? 76 : 76 - ((Number(item.value || 0) / max) * 64);
    return `${x},${y}`;
  }).join(' ');

  if (!data.length) return <EmptyChart />;

  return (
    <div className={`analytics-chart-wrap${compact ? ' compact' : ''}`}>
      <svg viewBox="0 0 100 82" preserveAspectRatio="none" className="analytics-line-chart" aria-hidden="true">
        <line x1="0" y1="76" x2="100" y2="76" className="analytics-chart-axis" />
        <line x1="0" y1="12" x2="100" y2="12" className="analytics-chart-grid" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => {
          const x = data.length === 1 ? 50 : (index / Math.max(data.length - 1, 1)) * 100;
          const y = max === 0 ? 76 : 76 - ((Number(item.value || 0) / max) * 64);
          return <circle key={item.date} cx={x} cy={y} r="1.8" fill={color} />;
        })}
      </svg>
      <div className="analytics-chart-footer">
        <span>{data[0]?.date || ''}</span>
        <strong>{formatNumber(data[data.length - 1]?.value || 0)}</strong>
        <span>{data[data.length - 1]?.date || ''}</span>
      </div>
    </div>
  );
};

const MultiLineChart = ({ groups = [] }) => {
  const first = groups.find(group => group.data?.length);
  if (!first) return <EmptyChart />;
  const dates = first.data.map(item => item.date);
  const max = Math.max(
    ...groups.flatMap(group => (group.data || []).map(item => Number(item.value || 0))),
    0,
  );

  return (
    <div className="analytics-multi-chart">
      <svg viewBox="0 0 100 82" preserveAspectRatio="none" className="analytics-line-chart" aria-hidden="true">
        <line x1="0" y1="76" x2="100" y2="76" className="analytics-chart-axis" />
        <line x1="0" y1="12" x2="100" y2="12" className="analytics-chart-grid" />
        {groups.map((group) => {
          const points = (group.data || []).map((item, index) => {
            const x = dates.length === 1 ? 50 : (index / Math.max(dates.length - 1, 1)) * 100;
            const y = max === 0 ? 76 : 76 - ((Number(item.value || 0) / max) * 64);
            return `${x},${y}`;
          }).join(' ');
          return <polyline key={group.label} points={points} fill="none" stroke={group.color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
      <div className="analytics-legend-row">
        {groups.map(group => (
          <span key={group.label}><i style={{ background: group.color }} />{group.label}</span>
        ))}
      </div>
    </div>
  );
};

const BarList = ({ rows = [], keyField = 'label', valueField = 'count', formatter = formatNumber, color = CHART_COLORS.navy }) => {
  const max = Math.max(...rows.map(row => Number(row[valueField] || 0)), 0);
  if (!rows.length) return <div className="analytics-empty-block">No activity recorded yet.</div>;
  return (
    <div className="analytics-bar-list">
      {rows.map((row) => (
        <div className="analytics-bar-row" key={row[keyField]}>
          <div className="analytics-bar-copy">
            <strong>{row[keyField]}</strong>
            <span>{formatter(row[valueField])}</span>
          </div>
          <div className="analytics-bar-track">
            <span className="analytics-bar-fill" style={{ width: `${max ? (Number(row[valueField] || 0) / max) * 100 : 0}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const DataTable = ({ columns, rows, onRowClick, emptyLabel = 'No rows yet.' }) => {
  if (!rows.length) return <div className="analytics-empty-block">{emptyLabel}</div>;
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row.term || row.path || row.product} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'analytics-row-clickable' : ''}>
              {columns.map(column => (
                <td key={column.key} data-label={column.label}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const InsightCard = ({ title, body, rows, color = CHART_COLORS.navy, keyField = 'label', valueField = 'count', formatter = formatNumber }) => (
  <article className="analytics-highlight-card">
    <div className="analytics-highlight-head">
      <h4>{title}</h4>
      {body ? <p>{body}</p> : null}
    </div>
    <BarList rows={rows} keyField={keyField} valueField={valueField} formatter={formatter} color={color} />
  </article>
);

const ComparisonStrip = ({ products, onRemove }) => {
  if (!products.length) return null;
  return (
    <section className="analytics-compare-strip">
      <SectionHeader
        eyebrow="Compare"
        title="Selected product comparison"
        body="A quick side-by-side view of demand, cart behaviour, and sales quality."
      />
      <div className="analytics-compare-grid">
        {products.map(product => (
          <article key={product.id} className="analytics-compare-card">
            <div className="analytics-compare-head">
              <div>
                <h4>{product.name}</h4>
                <p>{product.category}</p>
              </div>
              <button type="button" className="analytics-icon-btn" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from comparison`}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="analytics-compare-metrics">
              <span><strong>{formatNumber(product.views)}</strong> views</span>
              <span><strong>{formatNumber(product.add_to_cart)}</strong> added</span>
              <span><strong>{formatNumber(product.quantity_sold)}</strong> sold</span>
              <span><strong>{formatCurrency(product.revenue)}</strong> revenue</span>
              <span><strong>{formatPercent(product.conversion_rate)}</strong> conversion</span>
            </div>
            <div className="analytics-compare-footer">
              <StatusBadge tone={product.status === 'Out of stock' ? 'gold' : 'slate'}>{product.status}</StatusBadge>
              <StatusBadge tone="green">{product.performance_status}</StatusBadge>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

const ProductDetailDrawer = ({ open, productId, detail, onClose, exportHref }) => {
  if (!open) return null;
  return (
    <div className="analytics-drawer-backdrop" onClick={onClose}>
      <aside className="analytics-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="analytics-drawer-head">
          <div>
            <span className="analytics-eyebrow">Product drilldown</span>
            <h3>{detail?.product?.name || 'Loading product analytics'}</h3>
            {detail?.product ? <p>{detail.product.category} / {detail.product.status}</p> : null}
          </div>
          <div className="analytics-drawer-actions">
            {detail ? <ExportButton href={exportHref} label="Export CSV" /> : null}
            <button type="button" className="analytics-icon-btn" onClick={onClose} aria-label="Close product analytics">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {!detail ? (
          <div className="analytics-drawer-loading">Loading product analytics...</div>
        ) : (
          <div className="analytics-drawer-body">
            <div className="analytics-stat-grid compact">
              <StatCard label="Views" value={formatNumber(detail.metrics.views)} icon="eye" tone="navy" />
              <StatCard label="Unique visitors" value={formatNumber(detail.metrics.unique_visitors)} icon="users" tone="teal" />
              <StatCard label="Added to cart" value={formatNumber(detail.metrics.add_to_cart)} icon="package" tone="gold" />
              <StatCard label="Purchases" value={formatNumber(detail.metrics.quantity_sold)} icon="check" tone="green" />
              <StatCard label="Revenue" value={formatCurrency(detail.metrics.revenue)} icon="money" tone="navy" />
              <StatCard label="Conversion rate" value={formatPercent(detail.metrics.conversion_rate)} icon="growth" tone="green" />
              <StatCard label="Cart abandonment" value={formatNumber(detail.metrics.cart_abandonment_count)} icon="warning" tone="gold" />
              <StatCard label="Search interest" value={formatNumber(detail.metrics.search_impressions)} icon="search" tone="teal" />
            </div>

            <div className="analytics-chart-grid">
              <article className="analytics-panel">
                <SectionHeader title="Views over time" />
                <LineChart series={detail.charts.views} color={CHART_COLORS.navy} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Add to cart over time" />
                <LineChart series={detail.charts.add_to_cart} color={CHART_COLORS.gold} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Sales over time" />
                <LineChart series={detail.charts.sales} color={CHART_COLORS.success} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Revenue over time" />
                <LineChart series={detail.charts.revenue} color={CHART_COLORS.danger} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Search interest over time" />
                <LineChart series={detail.charts.search_interest} color={CHART_COLORS.info} />
              </article>
            </div>

            <div className="analytics-three-grid">
              <article className="analytics-panel">
                <SectionHeader title="Search terms that led to this product" />
                <DataTable
                  columns={[
                    { key: 'term', label: 'Search term' },
                    { key: 'clicks', label: 'Clicks' },
                    { key: 'purchases', label: 'Purchases' },
                  ]}
                  rows={detail.breakdowns.search_terms}
                  emptyLabel="No tracked search clicks yet."
                />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Traffic sources" />
                <BarList rows={detail.breakdowns.traffic_sources} color={CHART_COLORS.navy} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Device breakdown" />
                <BarList rows={detail.breakdowns.devices} color={CHART_COLORS.info} />
              </article>
            </div>

            <div className="analytics-two-grid">
              <article className="analytics-panel">
                <SectionHeader title="Location summary" body="Approximate location only. No raw IP addresses appear in this view." />
                <div className="analytics-mini-columns">
                  <div>
                    <h4>Countries</h4>
                    <BarList rows={detail.breakdowns.locations.countries} color={CHART_COLORS.navy} />
                  </div>
                  <div>
                    <h4>Regions</h4>
                    <BarList rows={detail.breakdowns.locations.regions} color={CHART_COLORS.gold} />
                  </div>
                  <div>
                    <h4>Cities</h4>
                    <BarList rows={detail.breakdowns.locations.cities} color={CHART_COLORS.success} />
                  </div>
                </div>
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Freshness" />
                <div className="analytics-timestamp-list">
                  <div><span>Last sale</span><strong>{formatDateTime(detail.metrics.last_sale_at)}</strong></div>
                  <div><span>Last product view</span><strong>{formatDateTime(detail.metrics.last_view_at)}</strong></div>
                  <div><span>Last add to cart</span><strong>{formatDateTime(detail.metrics.last_add_to_cart_at)}</strong></div>
                  <div><span>Search result appearances</span><strong>{formatNumber(detail.metrics.search_impressions)}</strong></div>
                  <div><span>Unavailable searches</span><strong>{formatNumber(detail.metrics.unavailable_searches)}</strong></div>
                  <div><span>Wishlist saves</span><strong>{formatNumber(detail.metrics.wishlist_count)}</strong></div>
                </div>
              </article>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};

const AnalyticsView = () => {
  const [activeTab, setActiveTab] = React.useState('overview');
  const [preset, setPreset] = React.useState('30d');
  const [customStart, setCustomStart] = React.useState(() => new Date(Date.now() - (29 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [payload, setPayload] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [lens, setLens] = React.useState('all');
  const [sortKey, setSortKey] = React.useState('views');
  const [productSearch, setProductSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(productSearch);
  const [comparisonIds, setComparisonIds] = React.useState([]);
  const [selectedProductId, setSelectedProductId] = React.useState(null);
  const [detailCache, setDetailCache] = React.useState({});
  const [detailLoadingId, setDetailLoadingId] = React.useState(null);
  const [isPending, startTransition] = React.useTransition();

  const rangeParams = React.useMemo(() => queryParamsForRange(preset, customStart, customEnd), [customEnd, customStart, preset]);

  React.useEffect(() => {
    setDetailCache({});
  }, [rangeParams]);

  React.useEffect(() => {
    if (!isApiMode()) {
      setLoading(false);
      setError('Analytics require the Flask API mode.');
      return;
    }
    let alive = true;
    setLoading(true);
    setError('');
    api.adminAnalyticsDashboard(rangeParams)
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'Could not load analytics right now.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rangeParams]);

  const products = payload?.products?.items || [];
  const filteredProducts = React.useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();
    return products
      .filter(item => lensPredicate(lens, item))
      .filter(item => {
        if (!search) return true;
        return `${item.name} ${item.category} ${item.performance_status}`.toLowerCase().includes(search);
      })
      .sort(compareBySort(sortKey));
  }, [deferredSearch, lens, products, sortKey]);

  const comparisonProducts = React.useMemo(() => (
    comparisonIds.map(id => products.find(item => item.id === id)).filter(Boolean)
  ), [comparisonIds, products]);

  const detail = selectedProductId ? detailCache[selectedProductId] : null;
  const detailExportHref = selectedProductId ? api.adminAnalyticsExportUrl('product-detail', { ...rangeParams, product_id: selectedProductId }) : '#';

  React.useEffect(() => {
    if (!selectedProductId || !isApiMode() || detailCache[selectedProductId]) return undefined;
    let alive = true;
    setDetailLoadingId(selectedProductId);
    api.adminAnalyticsProduct(selectedProductId, rangeParams)
      .then((data) => {
        if (!alive) return;
        setDetailCache(prev => ({ ...prev, [selectedProductId]: data }));
        setDetailLoadingId(null);
      })
      .catch(() => {
        if (alive) setDetailLoadingId(null);
      });
    return () => {
      alive = false;
    };
  }, [detailCache, rangeParams, selectedProductId]);

  const openProductDetail = (productId) => {
    startTransition(() => setSelectedProductId(productId));
  };

  const toggleComparison = (productId) => {
    setComparisonIds((prev) => {
      if (prev.includes(productId)) return prev.filter(id => id !== productId);
      if (prev.length >= 3) return [...prev.slice(1), productId];
      return [...prev, productId];
    });
  };

  if (!isApiMode()) {
    return <div className="analytics-empty-state">Analytics require API mode and a running Flask backend.</div>;
  }

  if (loading) {
    return <div className="analytics-empty-state">Loading analytics dashboard...</div>;
  }

  if (error) {
    return <div className="analytics-empty-state">{error}</div>;
  }

  const topViewed = payload?.bookshop?.top_products?.viewed?.[0];
  const topSearched = payload?.bookshop?.top_products?.searched?.[0];
  const noResultSearches = payload?.bookshop?.summary?.searches_no_results || 0;
  const productBoards = {
    viewed: (payload?.bookshop?.top_products?.viewed || []).map(item => ({ label: item.name, count: item.views })),
    added: (payload?.bookshop?.top_products?.added_to_cart || []).map(item => ({ label: item.name, count: item.add_to_cart })),
    purchased: (payload?.bookshop?.top_products?.purchased || []).map(item => ({ label: item.name, count: item.quantity_sold })),
    abandoned: (payload?.bookshop?.top_products?.abandoned || []).map(item => ({ label: item.name, count: item.cart_abandonment_count })),
    searched: (payload?.bookshop?.top_products?.searched || []).map(item => ({ label: item.name, count: item.search_impressions })),
    categories: payload?.bookshop?.top_categories || [],
  };

  return (
    <div className="analytics-shell">
      <header className="analytics-hero">
        <div>
          <span className="analytics-eyebrow">Admin analytics</span>
          <h2>Visitor behaviour, product interest, and search performance</h2>
          <p>{payload?.privacy?.notice}</p>
        </div>
        <div className="analytics-toolbar">
          <div className="analytics-range-picker">
            <label htmlFor="analytics-range">Date range</label>
            <select id="analytics-range" value={preset} onChange={(event) => setPreset(event.target.value)}>
              {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {preset === 'custom' ? (
            <div className="analytics-date-fields">
              <DatePickerField value={customStart} onChange={setCustomStart} ariaLabel="Start date" />
              <DatePickerField value={customEnd} onChange={setCustomEnd} ariaLabel="End date" />
            </div>
          ) : null}
          <ExportButton href={api.adminAnalyticsExportUrl('products', rangeParams)} label="Export products" />
        </div>
      </header>

      <nav className="analytics-tabs" aria-label="Analytics sections">
        {TABS.map(tab => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <>
          <section className="analytics-stat-grid">
            <StatCard label="Total visits" value={formatNumber(payload.overview.summary.total_visits)} note={payload.range.label} icon="chart" tone="navy" />
            <StatCard label="Unique visitors" value={formatNumber(payload.overview.summary.unique_visitors)} note="Anonymous visitors" icon="users" tone="teal" />
            <StatCard label="Page views" value={formatNumber(payload.overview.summary.page_views)} note="All tracked public routes" icon="eye" tone="slate" />
            <StatCard label="Top searched product" value={topSearched?.name || 'No data yet'} note={topSearched ? `${formatNumber(topSearched.search_impressions)} appearances` : 'Search tracking is live'} icon="search" tone="gold" />
            <StatCard label="Most viewed product" value={topViewed?.name || 'No data yet'} note={topViewed ? `${formatNumber(topViewed.views)} views` : 'Product view tracking is live'} icon="book" tone="green" />
            <StatCard label="Searches with no results" value={formatNumber(noResultSearches)} note="Bookshop search gaps" icon="warning" tone="gold" />
          </section>

          <section className="analytics-panel">
            <SectionHeader
              eyebrow="Traffic trend"
              title="Visits, unique visitors, and page views over time"
              actions={<ExportButton href={api.adminAnalyticsExportUrl('top-pages', rangeParams)} label="Export top pages" />}
            />
            <MultiLineChart groups={[
              { label: 'Page views', color: CHART_COLORS.navy, data: payload.overview.timeline.page_views },
              { label: 'Visits', color: CHART_COLORS.gold, data: payload.overview.timeline.visits },
              { label: 'Unique visitors', color: CHART_COLORS.success, data: payload.overview.timeline.unique_visitors },
            ]} />
          </section>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader title="Top visited pages" />
              <DataTable
                columns={[
                  { key: 'title', label: 'Page' },
                  { key: 'views', label: 'Views', render: row => formatNumber(row.views) },
                  { key: 'unique_visitors', label: 'Unique visitors', render: row => formatNumber(row.unique_visitors) },
                ]}
                rows={payload.overview.top_pages}
              />
            </article>

            <article className="analytics-panel">
              <SectionHeader title="Bookshop summary" />
              <div className="analytics-mini-card-grid">
                <div><span>Orders</span><strong>{formatNumber(payload.bookshop.summary.total_orders)}</strong></div>
                <div><span>Revenue</span><strong>{formatCurrency(payload.bookshop.summary.total_revenue)}</strong></div>
                <div><span>Average order value</span><strong>{formatCurrency(payload.bookshop.summary.average_order_value)}</strong></div>
                <div><span>Conversion rate</span><strong>{formatPercent(payload.bookshop.summary.conversion_rate)}</strong></div>
                <div><span>Abandoned carts</span><strong>{formatNumber(payload.bookshop.summary.abandoned_carts)}</strong></div>
                <div><span>No-result searches</span><strong>{formatNumber(payload.bookshop.summary.searches_no_results)}</strong></div>
              </div>
            </article>
          </div>

          <div className="analytics-three-grid">
            <article className="analytics-panel">
              <SectionHeader title="Traffic sources" />
              <BarList rows={payload.overview.traffic_sources} color={CHART_COLORS.navy} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Device breakdown" />
              <BarList rows={payload.overview.device_breakdown} color={CHART_COLORS.info} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Browser breakdown" />
              <BarList rows={payload.overview.browser_breakdown} color={CHART_COLORS.gold} />
            </article>
          </div>

          <section className="analytics-panel">
            <SectionHeader title="Location summary" body="Approximate country, region, and city only." />
            <div className="analytics-mini-columns">
              <div>
                <h4>Countries</h4>
                <BarList rows={payload.overview.locations.countries} color={CHART_COLORS.navy} />
              </div>
              <div>
                <h4>Regions</h4>
                <BarList rows={payload.overview.locations.regions} color={CHART_COLORS.gold} />
              </div>
              <div>
                <h4>Cities</h4>
                <BarList rows={payload.overview.locations.cities} color={CHART_COLORS.success} />
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'products' ? (
        <>
          <section className="analytics-panel analytics-filter-panel">
            <SectionHeader
              eyebrow="Filter products"
              title="Focus the product list"
              body="Sort by demand, sales quality, or supply risk. Search still works by product name, category, and performance label."
            />
            <div className="analytics-controls">
              <div className="analytics-control">
                <label htmlFor="analytics-lens">Lens</label>
                <select id="analytics-lens" value={lens} onChange={(event) => setLens(event.target.value)}>
                  {PRODUCT_LENSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="analytics-control">
                <label htmlFor="analytics-sort">Sort by</label>
                <select id="analytics-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                  {PRODUCT_SORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="analytics-control analytics-control-search">
                <label htmlFor="analytics-product-search">Find a product</label>
                <input
                  id="analytics-product-search"
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search by product name, category, or status"
                />
              </div>
            </div>
          </section>

          <ComparisonStrip
            products={comparisonProducts}
            onRemove={(productId) => setComparisonIds(prev => prev.filter(id => id !== productId))}
          />

          <section className="analytics-panel">
            <SectionHeader
              eyebrow="Product charts"
              title="Demand, search, and sales watchlist"
              body="These charts surface interest and friction before you drill into a single product."
            />
            <div className="analytics-highlight-grid">
              <InsightCard title="Most viewed products" rows={productBoards.viewed} color={CHART_COLORS.navy} />
              <InsightCard title="Most added to cart" rows={productBoards.added} color={CHART_COLORS.gold} />
              <InsightCard title="Best-selling products" rows={productBoards.purchased} color={CHART_COLORS.success} />
              <InsightCard title="Cart abandonment watchlist" rows={productBoards.abandoned} color={CHART_COLORS.danger} />
              <InsightCard title="Search demand" rows={productBoards.searched} color={CHART_COLORS.info} />
              <InsightCard title="Top categories" rows={productBoards.categories} color={CHART_COLORS.slate} />
            </div>
          </section>

          <section className="analytics-panel">
            <SectionHeader
              eyebrow="Product list"
              title={`Detailed product analytics (${formatNumber(filteredProducts.length)} shown)`}
              body="Use View charts to open the full product report. Compare pins up to three products side by side without leaving the list."
              actions={<ExportButton href={api.adminAnalyticsExportUrl('products', rangeParams)} label="Export CSV" />}
            />
            <DataTable
              onRowClick={(row) => openProductDetail(row.id)}
              columns={[
                {
                  key: 'name',
                  label: 'Product',
                  render: (row) => (
                    <div className="analytics-product-cell">
                      <div>
                        <strong>{row.name}</strong>
                        <span>{row.category}</span>
                      </div>
                      <div className="analytics-product-badges">
                        <StatusBadge tone={row.status === 'Out of stock' ? 'gold' : 'slate'}>{row.status}</StatusBadge>
                        <StatusBadge tone="green">{row.performance_status}</StatusBadge>
                      </div>
                    </div>
                  ),
                },
                { key: 'views', label: 'Views', render: row => formatNumber(row.views) },
                { key: 'add_to_cart', label: 'Added', render: row => formatNumber(row.add_to_cart) },
                { key: 'quantity_sold', label: 'Sold', render: row => formatNumber(row.quantity_sold) },
                { key: 'revenue', label: 'Revenue', render: row => formatCurrency(row.revenue) },
                { key: 'conversion_rate', label: 'Conversion', render: row => formatPercent(row.conversion_rate) },
                { key: 'cart_abandonment_count', label: 'Abandoned', render: row => formatNumber(row.cart_abandonment_count) },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => (
                    <div className="analytics-row-actions">
                      <button
                        type="button"
                        className="analytics-open-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          openProductDetail(row.id);
                        }}
                      >
                        View charts
                      </button>
                      <button
                        type="button"
                        className={`analytics-compare-btn${comparisonIds.includes(row.id) ? ' active' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleComparison(row.id);
                        }}
                      >
                        {comparisonIds.includes(row.id) ? 'Added' : 'Compare'}
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={filteredProducts}
              emptyLabel="No products match the current filters."
            />
          </section>
        </>
      ) : null}

      {activeTab === 'search' ? (
        <>
          <section className="analytics-stat-grid compact">
            <StatCard label="Total searches" value={formatNumber(payload.search.summary.total_searches)} icon="search" tone="navy" />
            <StatCard label="Unique terms" value={formatNumber(payload.search.summary.unique_terms)} icon="file" tone="slate" />
            <StatCard label="Searches with results" value={formatNumber(payload.search.summary.searches_with_results)} icon="check" tone="green" />
            <StatCard label="Searches with no results" value={formatNumber(payload.search.summary.searches_without_results)} icon="warning" tone="gold" />
          </section>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader
                title="Top search terms"
                body="This shows what visitors looked for, whether results appeared, and whether that search led to a product view or purchase."
                actions={<ExportButton href={api.adminAnalyticsExportUrl('search-terms', rangeParams)} label="Export CSV" />}
              />
              <DataTable
                columns={[
                  { key: 'term', label: 'Search term' },
                  { key: 'searches', label: 'Searches', render: row => formatNumber(row.searches) },
                  { key: 'with_results', label: 'With results', render: row => formatNumber(row.with_results) },
                  { key: 'no_results', label: 'No results', render: row => formatNumber(row.no_results) },
                  { key: 'product_views', label: 'Product views', render: row => formatNumber(row.product_views) },
                  { key: 'purchases', label: 'Purchases', render: row => formatNumber(row.purchases) },
                ]}
                rows={payload.search.terms}
              />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Top searched products" body="Based on search-result clicks and product appearances in bookshop search." />
              <BarList rows={payload.search.top_products} keyField="product" color={CHART_COLORS.info} />
            </article>
          </div>
        </>
      ) : null}

      {activeTab === 'roadmap' ? (
        <section className="analytics-roadmap-grid">
          {payload.phase2.planned.map((item) => (
            <article key={item} className="analytics-roadmap-card">
              <StatusBadge tone="slate">Phase 2</StatusBadge>
              <h4>{item}</h4>
              <p>The analytics foundation is already collecting the anonymous session and content signals needed to extend into this report next.</p>
            </article>
          ))}
        </section>
      ) : null}

      <ProductDetailDrawer
        open={Boolean(selectedProductId)}
        productId={selectedProductId}
        detail={detailLoadingId === selectedProductId ? null : detail}
        onClose={() => setSelectedProductId(null)}
        exportHref={detailExportHref}
      />

      {isPending ? <div className="analytics-pending">Loading product drilldown...</div> : null}
    </div>
  );
};

export default AnalyticsView;
