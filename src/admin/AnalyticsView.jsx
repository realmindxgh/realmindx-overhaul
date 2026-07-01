import React from 'react';

import { DatePickerField, Icon } from '../../realmindx-site/assets/components.jsx';
import { api, isApiMode } from '../lib/apiClient.js';
import toast from '../lib/toast.js';
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
  { id: 'engagement', label: 'Service & Leads' },
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
const chartColors = {
  navy: 'var(--navy)',
  gold: 'var(--yellow-dark)',
  success: 'var(--success)',
  info: 'var(--info)',
  danger: 'var(--danger)',
  slate: 'var(--gray-500)',
};
const donutPalette = [
  chartColors.navy,
  chartColors.gold,
  chartColors.success,
  chartColors.info,
  '#5f6f89',
  '#ce5b4f',
];

const formatNumber = (value) => numberFormat.format(Number(value || 0));
const formatCurrency = (value) => currencyFormat.format(Number(value || 0));
const formatPercent = (value) => `${percentFormat.format(Number(value || 0))}%`;
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No data yet';

const queryParamsForRange = (preset, start, end) => (
  preset === 'custom'
    ? { preset, start, end }
    : { preset }
);

const permissionSetFor = (session) => {
  if (!session) return new Set(['analytics.view', 'analytics.export']);
  return new Set([...(session.permissions || []), ...(session.directPermissions || [])]);
};

const canExportAnalytics = (session) => {
  if (!session) return true;
  if (session.role === 'admin') return true;
  return permissionSetFor(session).has('analytics.export');
};

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
      return (
        item.status === 'Out of stock'
        || (item.stock_quantity != null && item.stock_quantity <= 5)
      ) && (item.search_impressions > 0 || item.views > 0);
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

const collapseRows = (rows = [], valueField = 'count', labelField = 'label', limit = 5) => {
  const cleanRows = rows
    .map((row) => ({
      ...row,
      [valueField]: Number(row?.[valueField] || 0),
      [labelField]: row?.[labelField] || 'Unknown',
    }))
    .filter(row => row[valueField] > 0);
  if (cleanRows.length <= limit) return cleanRows;
  const visible = cleanRows.slice(0, limit - 1);
  const remainder = cleanRows.slice(limit - 1).reduce((sum, row) => sum + row[valueField], 0);
  return [...visible, { [labelField]: 'Other', [valueField]: remainder }];
};

const sumRows = (rows = [], valueField = 'count') => rows.reduce((sum, row) => sum + Number(row?.[valueField] || 0), 0);
const sumSeries = (series = []) => series.reduce((sum, item) => sum + Number(item?.value || 0), 0);
const activeSeriesPoints = (series = []) => series.filter(item => Number(item?.value || 0) > 0).length;
const ratioPercent = (value, total) => {
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return (Number(value || 0) / denominator) * 100;
};
const formatRatio = (value, total) => formatPercent(ratioPercent(value, total));

const StatusBadge = ({ children, tone = 'navy' }) => (
  <span className={`analytics-pill analytics-pill-${tone}`}>{children}</span>
);

const ExportButton = ({ href, label, compact = false }) => (
  <a
    className={`analytics-export-btn${compact ? ' analytics-export-compact' : ''}`}
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
  >
    <Icon name="file" size={14} />
    <span>{label}</span>
  </a>
);

const SectionHeader = ({ eyebrow, title, body, actions }) => (
  <div className="analytics-section-head">
    <div>
      {eyebrow && <span className="analytics-eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
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

const EmptyChart = ({ label = 'No data yet' }) => (
  <div className="analytics-chart-empty">
    <Icon name="chart" size={18} />
    <span>{label}</span>
  </div>
);

const shortChartValue = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return formatNumber(number);
};

const LineChart = ({ series = [], color = chartColors.navy, compact = false, formatter = formatNumber }) => {
  const data = Array.isArray(series) ? series : [];
  const values = data.map(item => Number(item.value || 0));
  const max = Math.max(...values, 0);
  const width = 640;
  const height = compact ? 210 : 260;
  const margin = { top: 34, right: 38, bottom: 38, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const plot = data.map((item, index) => {
    const x = margin.left + (data.length === 1 ? innerWidth / 2 : (index / Math.max(data.length - 1, 1)) * innerWidth);
    const y = margin.top + (max === 0 ? innerHeight : innerHeight - ((Number(item.value || 0) / max) * innerHeight));
    return { ...item, x, y, value: Number(item.value || 0) };
  });
  const linePath = plot.map((item, index) => `${index ? 'L' : 'M'}${item.x},${item.y}`).join(' ');
  const areaPath = plot.length
    ? `M${margin.left},${margin.top + innerHeight} ${linePath} L${margin.left + innerWidth},${margin.top + innerHeight} Z`
    : '';
  const peakIndex = values.indexOf(max);
  const labels = new Set([peakIndex, data.length - 1, 0].filter(index => index >= 0));

  if (!data.length) return <EmptyChart />;

  return (
    <div className={`analytics-chart-wrap${compact ? ' compact' : ''}`}>
      <div className="analytics-chart-badges">
        <span>Peak <strong>{formatter(max)}</strong></span>
        <span>Latest <strong>{formatter(data[data.length - 1]?.value || 0)}</strong></span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-line-chart" aria-hidden="true">
        {[0, 0.5, 1].map(tick => {
          const y = margin.top + innerHeight - (tick * innerHeight);
          return (
            <g key={tick}>
              <line x1={margin.left} y1={y} x2={margin.left + innerWidth} y2={y} className="analytics-chart-grid" />
              <text x={margin.left - 10} y={y + 4} className="analytics-chart-axis-label" textAnchor="end">{shortChartValue(max * tick)}</text>
            </g>
          );
        })}
        <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} className="analytics-chart-axis" />
        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {plot.map((item, index) => (
          <g key={`${item.date}-${index}`}>
            <circle cx={item.x} cy={item.y} r="6" fill="#fff" stroke={color} strokeWidth="4" />
            {labels.has(index) || item.value > 0 ? (
              <text x={item.x} y={Math.max(16, item.y - 13)} className="analytics-chart-point-label" textAnchor="middle">
                {shortChartValue(item.value)}
              </text>
            ) : null}
          </g>
        ))}
        <text x={margin.left} y={height - 10} className="analytics-chart-date-label" textAnchor="start">{data[0]?.date || ''}</text>
        <text x={margin.left + innerWidth} y={height - 10} className="analytics-chart-date-label" textAnchor="end">{data[data.length - 1]?.date || ''}</text>
      </svg>
      <div className="analytics-chart-footer">
        <span>{data[0]?.date || ''}</span>
        <strong>{formatter(data[data.length - 1]?.value || 0)}</strong>
        <span>{data[data.length - 1]?.date || ''}</span>
      </div>
    </div>
  );
};

const MultiLineChart = ({ groups = [], tall = false }) => {
  const availableGroups = groups.filter(group => (group.data || []).length);
  const first = availableGroups[0];
  if (!first) return <EmptyChart />;
  const dates = first.data.map(item => item.date);
  const max = Math.max(
    ...availableGroups.flatMap(group => (group.data || []).map(item => Number(item.value || 0))),
    0,
  );
  const width = 860;
  const height = tall ? 360 : 300;
  const margin = { top: 42, right: 42, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const verticalEvery = Math.max(1, Math.ceil(dates.length / 8));

  return (
    <div className="analytics-multi-chart">
      <div className="analytics-chart-badges">
        {availableGroups.map(group => (
          <span key={group.label}><i style={{ background: group.color }} />{group.label} <strong>{formatNumber((group.data || []).reduce((sum, item) => sum + Number(item.value || 0), 0))}</strong></span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="analytics-line-chart" aria-hidden="true">
        {dates.map((date, index) => {
          if (index !== 0 && index !== dates.length - 1 && index % verticalEvery !== 0) return null;
          const x = margin.left + (dates.length === 1 ? innerWidth / 2 : (index / Math.max(dates.length - 1, 1)) * innerWidth);
          return <line key={`${date}-${index}`} x1={x} y1={margin.top} x2={x} y2={margin.top + innerHeight} className="analytics-chart-grid vertical" />;
        })}
        {[0, 0.5, 1].map(tick => {
          const y = margin.top + innerHeight - (tick * innerHeight);
          return (
            <g key={tick}>
              <line x1={margin.left} y1={y} x2={margin.left + innerWidth} y2={y} className="analytics-chart-grid" />
              <text x={margin.left - 10} y={y + 4} className="analytics-chart-axis-label" textAnchor="end">{shortChartValue(max * tick)}</text>
            </g>
          );
        })}
        <line x1={margin.left} y1={margin.top + innerHeight} x2={margin.left + innerWidth} y2={margin.top + innerHeight} className="analytics-chart-axis" />
        {availableGroups.map((group) => {
          const points = (group.data || []).map((item, index) => {
            const x = margin.left + (dates.length === 1 ? innerWidth / 2 : (index / Math.max(dates.length - 1, 1)) * innerWidth);
            const y = margin.top + (max === 0 ? innerHeight : innerHeight - ((Number(item.value || 0) / max) * innerHeight));
            return { ...item, x, y, value: Number(item.value || 0) };
          });
          const path = points.map((item, index) => `${index ? 'L' : 'M'}${item.x},${item.y}`).join(' ');
          const peak = Math.max(...points.map(item => item.value), 0);
          return (
            <g key={group.label}>
              <path d={path} fill="none" stroke={group.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((item, index) => (
                <g key={`${group.label}-${item.date}-${index}`}>
                  <circle cx={item.x} cy={item.y} r={item.value ? 5 : 3.5} fill="#fff" stroke={group.color} strokeWidth="3" />
                  {(item.value > 0 && (item.value === peak || index === points.length - 1)) ? (
                    <text x={item.x} y={Math.max(16, item.y - 12)} className="analytics-chart-point-label" textAnchor="middle">
                      {shortChartValue(item.value)}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          );
        })}
        <text x={margin.left} y={height - 10} className="analytics-chart-date-label" textAnchor="start">{dates[0] || ''}</text>
        <text x={margin.left + innerWidth} y={height - 10} className="analytics-chart-date-label" textAnchor="end">{dates[dates.length - 1] || ''}</text>
      </svg>
      <div className="analytics-legend-row">
        {availableGroups.map(group => (
          <span key={group.label}><i style={{ background: group.color }} />{group.label}</span>
        ))}
      </div>
    </div>
  );
};

const SparkBars = ({ data = [], color = chartColors.navy }) => {
  const bars = Array.isArray(data) ? data.slice(-14) : [];
  const max = Math.max(...bars.map(item => Number(item.value || 0)), 0);
  if (!bars.length) return <div className="analytics-spark-empty">No daily trend yet</div>;
  return (
    <div className="analytics-spark-bars" aria-hidden="true">
      {bars.map((item, index) => {
        const value = Number(item.value || 0);
        const height = max ? Math.max(8, (value / max) * 100) : 4;
        return (
          <span
            key={`${item.date || 'day'}-${index}`}
            className={value ? 'active' : ''}
            style={{ height: `${height}%`, background: value ? color : undefined }}
            title={`${item.date || 'Date'}: ${formatNumber(value)}`}
          >
            {value ? <i>{shortChartValue(value)}</i> : null}
          </span>
        );
      })}
    </div>
  );
};

const TrendSummary = ({ items = [], lowDataThreshold = 20 }) => {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const activeDays = Math.max(...items.map(item => activeSeriesPoints(item.data || [])), 0);
  const lowData = total > 0 && (total < lowDataThreshold || activeDays < 3);
  const groups = items.map(item => ({
    label: item.label,
    color: item.color || chartColors.navy,
    data: item.data || [],
  }));
  const hasSeries = groups.some(group => group.data.length);

  return (
    <div className="analytics-trend-summary analytics-trend-report">
      <div className="analytics-trend-card-grid">
        {items.map(item => {
          const series = item.data || [];
          const values = series.map(point => Number(point.value || 0));
          const peak = Math.max(...values, 0);
          const latest = series.length ? Number(series[series.length - 1]?.value || 0) : Number(item.value || 0);
          const formatter = item.formatter || formatNumber;
          return (
            <article className="analytics-trend-card" key={item.label}>
              <div className="analytics-trend-card-label">
                <i style={{ background: item.color || chartColors.navy }} />
                <span>{item.label}</span>
              </div>
              <strong>{formatter(item.value)}</strong>
              {item.note ? <small>{item.note}</small> : null}
              <div className="analytics-trend-card-meta">
                <span>Peak <b>{formatter(peak)}</b></span>
                <span>Latest <b>{formatter(latest)}</b></span>
              </div>
            </article>
          );
        })}
      </div>
      {hasSeries ? <MultiLineChart groups={groups} tall /> : <EmptyChart />}
      {lowData ? (
        <div className="analytics-low-data-note">
          <Icon name="warning" size={16} />
          <span>Low sample size: read this as directional, not a forecast.</span>
        </div>
      ) : null}
    </div>
  );
};

const DistributionList = ({
  rows = [],
  valueField = 'count',
  labelField = 'label',
  formatter = formatNumber,
  emptyLabel = 'No distribution yet.',
}) => {
  const data = collapseRows(rows, valueField, labelField, 6);
  const total = sumRows(data, valueField);
  if (!data.length || total === 0) return <div className="analytics-empty-block">{emptyLabel}</div>;

  return (
    <div className="analytics-distribution-list">
      {data.map((row, index) => {
        const value = Number(row[valueField] || 0);
        const share = ratioPercent(value, total);
        return (
          <div className="analytics-distribution-row" key={`${row[labelField]}-${index}`}>
            <div className="analytics-distribution-head">
              <span><i style={{ background: donutPalette[index % donutPalette.length] }} />{row[labelField]}</span>
              <strong>{formatter(value)}</strong>
            </div>
            <div className="analytics-distribution-track">
              <span style={{ width: `${share}%`, background: donutPalette[index % donutPalette.length] }} />
            </div>
            <small>{formatPercent(share)} of total</small>
          </div>
        );
      })}
    </div>
  );
};

const SplitBar = ({ rows = [], centerLabel = 'Total', formatter = formatNumber }) => {
  const data = rows
    .map(row => ({ ...row, count: Number(row.count || 0) }))
    .filter(row => row.count > 0);
  const total = sumRows(data);
  if (!data.length || total === 0) return <EmptyChart label="No split yet" />;

  return (
    <div className="analytics-split-card">
      <div className="analytics-split-total">
        <span>{centerLabel}</span>
        <strong>{formatter(total)}</strong>
      </div>
      <div className="analytics-split-track" aria-hidden="true">
        {data.map((row, index) => (
          <span
            key={`${row.label}-${index}`}
            style={{
              width: `${ratioPercent(row.count, total)}%`,
              background: row.color || donutPalette[index % donutPalette.length],
            }}
          />
        ))}
      </div>
      <div className="analytics-split-legend">
        {data.map((row, index) => (
          <div key={`${row.label}-${index}`}>
            <span><i style={{ background: row.color || donutPalette[index % donutPalette.length] }} />{row.label}</span>
            <strong>{formatter(row.count)}</strong>
            <small>{formatRatio(row.count, total)}</small>
          </div>
        ))}
      </div>
    </div>
  );
};

const DonutChart = ({ rows = [], valueField = 'count', labelField = 'label', formatter = formatNumber, centerLabel = 'Total' }) => {
  const data = collapseRows(rows, valueField, labelField, 6);
  const total = sumRows(data, valueField);
  if (!data.length || total === 0) return <EmptyChart label="No distribution yet" />;

  const circumference = 2 * Math.PI * 42;
  let offset = 0;

  return (
    <div className="analytics-donut-card">
      <div className="analytics-donut-visual">
        <svg viewBox="0 0 110 110" className="analytics-donut-chart" aria-hidden="true">
          <circle cx="55" cy="55" r="42" fill="none" stroke="var(--gray-100)" strokeWidth="12" />
          {data.map((row, index) => {
            const value = Number(row[valueField] || 0);
            const arc = total ? (value / total) * circumference : 0;
            const strokeDasharray = `${arc} ${circumference - arc}`;
            const currentOffset = offset;
            offset += arc;
            return (
              <circle
                key={`${row[labelField]}-${index}`}
                cx="55"
                cy="55"
                r="42"
                fill="none"
                stroke={donutPalette[index % donutPalette.length]}
                strokeWidth="12"
                strokeLinecap="butt"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 55 55)"
              />
            );
          })}
        </svg>
        <div className="analytics-donut-center">
          <strong>{formatter(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="analytics-donut-legend">
        {data.map((row, index) => (
          <div key={`${row[labelField]}-${index}`}>
            <i style={{ background: donutPalette[index % donutPalette.length] }} />
            <span>{row[labelField]}</span>
            <strong>{formatter(row[valueField])}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

const BarList = ({ rows = [], keyField = 'label', valueField = 'count', formatter = formatNumber, color = chartColors.navy, emptyLabel = 'No activity recorded yet.' }) => {
  const max = Math.max(...rows.map(row => Number(row?.[valueField] || 0)), 0);
  if (!rows.length) return <div className="analytics-empty-block">{emptyLabel}</div>;
  return (
    <div className="analytics-bar-list">
      {rows.map((row, index) => (
        <div className="analytics-bar-row" key={`${row[keyField]}-${index}`}>
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

const FunnelChart = ({ stages = [], formatter = formatNumber }) => {
  const cleanStages = stages.filter(stage => Number(stage?.value || 0) > 0);
  const max = Math.max(...cleanStages.map(stage => Number(stage.value || 0)), 0);
  if (!cleanStages.length || max === 0) return <EmptyChart label="No journey data yet" />;

  return (
    <div className="analytics-funnel">
      {cleanStages.map((stage, index) => (
        <div className="analytics-funnel-row" key={`${stage.label}-${index}`}>
          <div className="analytics-funnel-head">
            <span>{stage.label}</span>
            <strong>{formatter(stage.value)}</strong>
          </div>
          <div className="analytics-funnel-track">
            <span className="analytics-funnel-fill" style={{ width: `${(Number(stage.value || 0) / max) * 100}%`, background: stage.color || chartColors.navy }} />
          </div>
          {stage.note ? <small>{stage.note}</small> : null}
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
          {rows.map((row, index) => (
            <tr key={row.id || row.term || row.path || row.product || `${index}`} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'analytics-row-clickable' : ''}>
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

const ProductDetailDrawer = ({ open, detail, onClose, exportHref, canExport }) => {
  if (!open) return null;
  const trafficRows = detail?.breakdowns?.traffic_sources || [];
  const deviceRows = detail?.breakdowns?.devices || [];

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
            {detail && canExport ? <ExportButton href={exportHref} label="Export CSV" /> : null}
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
                <LineChart series={detail.charts.views} color={chartColors.navy} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Add to cart over time" />
                <LineChart series={detail.charts.add_to_cart} color={chartColors.gold} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Sales over time" />
                <LineChart series={detail.charts.sales} color={chartColors.success} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Revenue over time" />
                <LineChart series={detail.charts.revenue} color={chartColors.danger} formatter={formatCurrency} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Search interest over time" />
                <LineChart series={detail.charts.search_interest} color={chartColors.info} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Audience mix" body="Traffic sources and devices for this product." />
                <div className="analytics-two-grid compact">
                  <DonutChart rows={trafficRows} centerLabel="Sources" />
                  <DonutChart rows={deviceRows} centerLabel="Devices" />
                </div>
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
                <BarList rows={trafficRows} color={chartColors.navy} />
              </article>
              <article className="analytics-panel">
                <SectionHeader title="Device breakdown" />
                <BarList rows={deviceRows} color={chartColors.info} />
              </article>
            </div>

            <div className="analytics-two-grid">
              <article className="analytics-panel">
                <SectionHeader
                  title="Location summary"
                  body={<>Approximate network location only. No raw IP addresses appear in this view. IP geolocation by <a href="https://db-ip.com" target="_blank" rel="noreferrer">DB-IP</a>.</>}
                />
                <div className="analytics-mini-columns">
                  <div>
                    <h4>Countries</h4>
                    <BarList rows={detail.breakdowns.locations.countries} color={chartColors.navy} />
                  </div>
                  <div>
                    <h4>Regions</h4>
                    <BarList rows={detail.breakdowns.locations.regions} color={chartColors.gold} />
                  </div>
                  <div>
                    <h4>Cities</h4>
                    <BarList rows={detail.breakdowns.locations.cities} color={chartColors.success} />
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

const AnalyticsView = ({ session }) => {
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
  const [showLocationReset, setShowLocationReset] = React.useState(false);
  const [clearingLocations, setClearingLocations] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const canExport = React.useMemo(() => canExportAnalytics(session), [session]);
  const canClearLocations = !session || session.role === 'admin';
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
        return `${item.name} ${item.category} ${item.performance_status} ${item.status}`.toLowerCase().includes(search);
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

  const clearLocationHistory = async () => {
    setClearingLocations(true);
    try {
      const result = await api.adminClearAnalyticsLocations();
      const refreshed = await api.adminAnalyticsDashboard(rangeParams);
      setPayload(refreshed);
      setShowLocationReset(false);
      toast.success(`${formatNumber(result.events_cleared)} analytics events had location history cleared.`);
    } catch (err) {
      toast.error(err.message || 'Could not clear analytics location history.');
    } finally {
      setClearingLocations(false);
    }
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
  const bookshopSummary = payload?.bookshop?.summary || {};
  const overview = payload?.overview || {};
  const search = payload?.search || { summary: {}, terms: [], top_products: [], timeline: {} };
  const engagement = payload?.engagement || {
    services: { summary: {}, timeline: {}, items: [] },
    news: { summary: {}, timeline: {}, articles: [], service_targets: [] },
    leads: { summary: {}, timeline: {}, service_interest: [], newsletter_sources: [] },
    security: { summary: {}, action_breakdown: [], admin_actions: [], recent: [] },
  };

  const productTotals = products.reduce((acc, item) => ({
    views: acc.views + Number(item.views || 0),
    adds: acc.adds + Number(item.add_to_cart || 0),
    sales: acc.sales + Number(item.quantity_sold || 0),
    revenue: acc.revenue + Number(item.revenue || 0),
    abandoned: acc.abandoned + Number(item.cart_abandonment_count || 0),
    wishlist: acc.wishlist + Number(item.wishlist_count || 0),
  }), { views: 0, adds: 0, sales: 0, revenue: 0, abandoned: 0, wishlist: 0 });

  const productBoards = {
    viewed: (payload?.bookshop?.top_products?.viewed || []).map(item => ({ label: item.name, count: item.views })),
    added: (payload?.bookshop?.top_products?.added_to_cart || []).map(item => ({ label: item.name, count: item.add_to_cart })),
    purchased: (payload?.bookshop?.top_products?.purchased || []).map(item => ({ label: item.name, count: item.quantity_sold })),
    abandoned: (payload?.bookshop?.top_products?.abandoned || []).map(item => ({ label: item.name, count: item.cart_abandonment_count })),
    searched: (payload?.bookshop?.top_products?.searched || []).map(item => ({ label: item.name, count: item.search_impressions })),
    revenue: (payload?.bookshop?.top_products?.revenue || []).map(item => ({ label: item.name, count: item.revenue })),
    categories: payload?.bookshop?.top_categories || [],
  };

  const productStatusRows = Object.entries(products.reduce((acc, item) => {
    const key = item.status || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([label, count]) => ({ label, count }));

  const performanceRows = Object.entries(products.reduce((acc, item) => {
    const key = item.performance_status || 'Unlabelled';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([label, count]) => ({ label, count }));

  const noResultTerms = search.terms
    .filter(item => Number(item.no_results || 0) > 0)
    .slice(0, 8)
    .map(item => ({ label: item.term, count: item.no_results }));

  const totalVisits = Number(overview.summary?.total_visits || 0);
  const totalSearches = Number(search.summary?.total_searches || 0);
  const totalOrders = Number(bookshopSummary.total_orders || 0);

  const journeyStages = [
    { label: 'Visits', value: totalVisits, color: chartColors.navy, note: 'All tracked sessions in this range' },
    { label: 'Searches', value: totalSearches, color: chartColors.gold, note: `${formatRatio(totalSearches, totalVisits)} of visits` },
    { label: 'Product views', value: productTotals.views, color: chartColors.info, note: `${formatRatio(productTotals.views, totalVisits)} of visits` },
    { label: 'Orders', value: totalOrders, color: chartColors.success, note: `${formatRatio(totalOrders, totalVisits)} visit-to-order rate` },
  ];

  const productJourneyStages = [
    { label: 'Product views', value: productTotals.views, color: chartColors.navy, note: 'Product detail views' },
    { label: 'Add to cart', value: productTotals.adds, color: chartColors.gold, note: `${formatRatio(productTotals.adds, productTotals.views)} of product views` },
    { label: 'Units sold', value: productTotals.sales, color: chartColors.success, note: `${formatRatio(productTotals.sales, productTotals.adds)} of cart adds` },
  ];

  return (
    <div className="analytics-shell">
      <header className="analytics-hero">
        <div className="analytics-hero-head">
          <div className="analytics-hero-copy">
            <span className="analytics-eyebrow">Admin analytics</span>
            <h2>Website and bookshop analytics</h2>
            <p>Analytics use anonymous visitor IDs and summarised location data; full IP addresses are never shown.</p>
          </div>
          <div className="analytics-toolbar">
            <div className="analytics-range-picker">
              <label htmlFor="analytics-range">Date range</label>
              <div className="analytics-range-select">
                <Icon name="calendar" size={17} />
                <select id="analytics-range" value={preset} onChange={(event) => setPreset(event.target.value)}>
                  {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            {preset === 'custom' ? (
              <div className="analytics-date-fields">
                <DatePickerField value={customStart} onChange={setCustomStart} ariaLabel="Start date" />
                <DatePickerField value={customEnd} onChange={setCustomEnd} ariaLabel="End date" />
              </div>
            ) : null}
            {canExport ? <ExportButton href={api.adminAnalyticsExportUrl('products', rangeParams)} label="Export products" compact /> : null}
          </div>
        </div>

        <nav className="analytics-tabs" aria-label="Analytics sections">
          {TABS.map(tab => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="analytics-toolbar-metrics" aria-label="Business snapshot">
          <div>
            <span>Orders</span>
            <strong>{formatNumber(bookshopSummary.total_orders)}</strong>
            <small>{payload?.range?.label}</small>
          </div>
          <div>
            <span>Revenue</span>
            <strong>{formatCurrency(bookshopSummary.total_revenue)}</strong>
            <small>{payload?.range?.label}</small>
          </div>
          <div>
            <span>Service enquiries</span>
            <strong>{formatNumber(engagement.services.summary?.enquiry_clicks)}</strong>
            <small>{payload?.range?.label}</small>
          </div>
        </div>
      </header>

      {activeTab === 'overview' ? (
        <>
          <section className="analytics-stat-grid">
            <StatCard label="Total visits" value={formatNumber(overview.summary?.total_visits)} note={payload.range.label} icon="chart" tone="navy" />
            <StatCard label="Unique visitors" value={formatNumber(overview.summary?.unique_visitors)} note="Anonymous visitors" icon="users" tone="teal" />
            <StatCard label="Page views" value={formatNumber(overview.summary?.page_views)} note="All tracked public routes" icon="eye" tone="slate" />
            <StatCard label="Top searched product" value={topSearched?.name || 'No data yet'} note={topSearched ? `${formatNumber(topSearched.search_impressions)} impressions` : 'Search tracking is live'} icon="search" tone="gold" />
            <StatCard label="Most viewed product" value={topViewed?.name || 'No data yet'} note={topViewed ? `${formatNumber(topViewed.views)} views` : 'Product views are live'} icon="book" tone="green" />
            <StatCard label="Searches with no results" value={formatNumber(bookshopSummary.searches_no_results)} note="Bookshop demand gaps" icon="warning" tone="gold" />
          </section>

          <section className="analytics-panel analytics-panel-featured">
              <SectionHeader
                eyebrow="Traffic snapshot"
                title="Traffic at a glance"
                body="A larger trend view for page views, sessions, and unique visitors across the selected period."
                actions={canExport ? <ExportButton href={api.adminAnalyticsExportUrl('top-pages', rangeParams)} label="Export top pages" /> : null}
              />
              <TrendSummary
                lowDataThreshold={50}
                items={[
                  {
                    label: 'Page views',
                    value: overview.summary?.page_views || sumSeries(overview.timeline?.page_views || []),
                    note: 'All tracked route views',
                    color: chartColors.navy,
                    data: overview.timeline?.page_views || [],
                  },
                  {
                    label: 'Visits',
                    value: totalVisits || sumSeries(overview.timeline?.visits || []),
                    note: 'Visitor sessions',
                    color: chartColors.gold,
                    data: overview.timeline?.visits || [],
                  },
                  {
                    label: 'Unique visitors',
                    value: overview.summary?.unique_visitors || sumSeries(overview.timeline?.unique_visitors || []),
                    note: 'Anonymous visitor IDs',
                    color: chartColors.success,
                    data: overview.timeline?.unique_visitors || [],
                  },
                ]}
              />
          </section>

          <section className="analytics-panel analytics-panel-featured analytics-journey-panel">
              <SectionHeader
                eyebrow="Journey snapshot"
                title="From visit to order"
                body="A quick view of how broad traffic narrows into search, product interest, and paid orders."
              />
              <FunnelChart stages={journeyStages} />
          </section>

          <div className="analytics-three-grid">
            <article className="analytics-panel">
              <SectionHeader title="Traffic sources" body="How visitors are arriving." />
              <DistributionList rows={overview.traffic_sources || []} emptyLabel="No traffic sources yet." />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Device breakdown" body="Desktop versus mobile traffic balance." />
              <DistributionList rows={overview.device_breakdown || []} emptyLabel="No device data yet." />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Browser breakdown" body="Browser mix for compatibility monitoring." />
              <DistributionList rows={overview.browser_breakdown || []} emptyLabel="No browser data yet." />
            </article>
          </div>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader title="Top visited pages" body="The most-consumed public pages across the site and bookshop." />
              <BarList rows={(overview.top_pages || []).map(item => ({ label: item.title, count: item.views }))} color={chartColors.navy} />
              <div className="analytics-table-spacer">
                <DataTable
                  columns={[
                    { key: 'title', label: 'Page' },
                    { key: 'views', label: 'Views', render: row => formatNumber(row.views) },
                    { key: 'unique_visitors', label: 'Unique visitors', render: row => formatNumber(row.unique_visitors) },
                  ]}
                  rows={overview.top_pages || []}
                />
              </div>
            </article>

            <article className="analytics-panel">
              <SectionHeader title="Bookshop business snapshot" body="Commercial performance for the store in the same time window." />
              <div className="analytics-mini-card-grid">
                <div><span>Orders</span><strong>{formatNumber(bookshopSummary.total_orders)}</strong></div>
                <div><span>Revenue</span><strong>{formatCurrency(bookshopSummary.total_revenue)}</strong></div>
                <div><span>Average order value</span><strong>{formatCurrency(bookshopSummary.average_order_value)}</strong></div>
                <div><span>Conversion rate</span><strong>{formatPercent(bookshopSummary.conversion_rate)}</strong></div>
                <div><span>Abandoned carts</span><strong>{formatNumber(bookshopSummary.abandoned_carts)}</strong></div>
                <div><span>Service enquiry clicks</span><strong>{formatNumber(engagement.services.summary?.enquiry_clicks)}</strong></div>
              </div>
            </article>
          </div>

          <section className="analytics-panel">
            <SectionHeader
              title="Location summary"
              body={<>Approximate network location is resolved locally from the visitor IP. Unknown usually means a historical visit, bot, private address, or an IP absent from the database; it does not mean the visitor refused browser location permission. IP geolocation by <a href="https://db-ip.com" target="_blank" rel="noreferrer">DB-IP</a>.</>}
              actions={canClearLocations ? (
                <button className="analytics-danger-btn" type="button" onClick={() => setShowLocationReset(true)}>
                  <Icon name="trash" size={14} />
                  Clear location history
                </button>
              ) : null}
            />
            <div className="analytics-mini-columns">
              <div>
                <h4>Countries</h4>
                <BarList rows={overview.locations?.countries || []} color={chartColors.navy} />
              </div>
              <div>
                <h4>Regions</h4>
                <BarList rows={overview.locations?.regions || []} color={chartColors.gold} />
              </div>
              <div>
                <h4>Cities</h4>
                <BarList rows={overview.locations?.cities || []} color={chartColors.success} />
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
              body="Sort by demand, sales quality, or supply risk. The search box matches product name, category, status, and performance label."
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
                  placeholder="Search by product name, category, performance label, or status"
                />
              </div>
            </div>
            <div className="analytics-filter-summary">
              <span><strong>{formatNumber(filteredProducts.length)}</strong> products in view</span>
              <span><strong>{formatNumber(comparisonProducts.length)}</strong> pinned for comparison</span>
              <span><strong>{formatNumber(productTotals.abandoned)}</strong> abandoned carts tracked</span>
            </div>
          </section>

          <ComparisonStrip
            products={comparisonProducts}
            onRemove={(productId) => setComparisonIds(prev => prev.filter(id => id !== productId))}
          />

          <div className="analytics-two-grid">
            <section className="analytics-panel">
              <SectionHeader
                eyebrow="Commerce funnel"
                title="Demand to purchase flow"
                body="This shows how product interest is converting into cart action and completed sales."
              />
              <FunnelChart stages={productJourneyStages} />
            </section>
            <section className="analytics-panel">
              <SectionHeader
                eyebrow="Store health"
                title="Conversion, abandonment, and wishlist signals"
                body="High-level product quality markers before drilling into a single title."
              />
              <div className="analytics-mini-card-grid">
                <div><span>Total revenue</span><strong>{formatCurrency(productTotals.revenue)}</strong></div>
                <div><span>Total add to cart</span><strong>{formatNumber(productTotals.adds)}</strong></div>
                <div><span>Total wishlist saves</span><strong>{formatNumber(productTotals.wishlist)}</strong></div>
                <div><span>Total abandoned</span><strong>{formatNumber(productTotals.abandoned)}</strong></div>
                <div><span>Top category</span><strong>{productBoards.categories?.[0]?.label || 'No data yet'}</strong></div>
                <div><span>Top performer</span><strong>{productBoards.viewed?.[0]?.label || 'No data yet'}</strong></div>
              </div>
            </section>
          </div>

          <div className="analytics-three-grid">
            <article className="analytics-panel">
              <SectionHeader title="Most viewed products" />
              <BarList rows={productBoards.viewed} color={chartColors.navy} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Most added to cart" />
              <BarList rows={productBoards.added} color={chartColors.gold} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Best-selling products" />
              <BarList rows={productBoards.purchased} color={chartColors.success} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Highest revenue products" />
              <BarList rows={productBoards.revenue} color={chartColors.danger} formatter={formatCurrency} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Product status mix" />
              <DistributionList rows={productStatusRows} emptyLabel="No product status data yet." />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Performance labels" />
              <DistributionList rows={performanceRows} emptyLabel="No performance labels yet." />
            </article>
          </div>

          <section className="analytics-panel">
            <SectionHeader
              eyebrow="Product list"
              title={`Detailed product analytics (${formatNumber(filteredProducts.length)} shown)`}
              body="Open a product to see trend lines, traffic sources, device mix, search interest, and freshness markers. Compare keeps up to three products side by side."
              actions={canExport ? <ExportButton href={api.adminAnalyticsExportUrl('products', rangeParams)} label="Export CSV" /> : null}
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
            <StatCard label="Total searches" value={formatNumber(search.summary?.total_searches)} icon="search" tone="navy" />
            <StatCard label="Unique terms" value={formatNumber(search.summary?.unique_terms)} icon="file" tone="slate" />
            <StatCard label="Searches with results" value={formatNumber(search.summary?.searches_with_results)} icon="check" tone="green" />
            <StatCard label="Searches with no results" value={formatNumber(search.summary?.searches_without_results)} icon="warning" tone="gold" />
          </section>

          <section className="analytics-panel analytics-panel-featured">
              <SectionHeader
                eyebrow="Search snapshot"
                title="Search demand and response"
                body="A larger trend view for search demand, result coverage, and product click-through."
              />
              <TrendSummary
                lowDataThreshold={30}
                items={[
                  {
                    label: 'Searches',
                    value: search.summary?.total_searches || sumSeries(search.timeline?.searches || []),
                    note: 'All search attempts',
                    color: chartColors.navy,
                    data: search.timeline?.searches || [],
                  },
                  {
                    label: 'With results',
                    value: search.summary?.searches_with_results || sumSeries(search.timeline?.with_results || []),
                    note: 'Searches that returned inventory',
                    color: chartColors.success,
                    data: search.timeline?.with_results || [],
                  },
                  {
                    label: 'No results',
                    value: search.summary?.searches_without_results || sumSeries(search.timeline?.no_results || []),
                    note: 'Inventory or naming gaps',
                    color: chartColors.gold,
                    data: search.timeline?.no_results || [],
                  },
                  {
                    label: 'Clicks',
                    value: sumSeries(search.timeline?.clicks || []),
                    note: 'Product clicks from search',
                    color: chartColors.info,
                    data: search.timeline?.clicks || [],
                  },
                ]}
              />
          </section>

          <section className="analytics-panel analytics-panel-featured analytics-quality-panel">
              <SectionHeader title="Search quality split" body="A direct view of how often the search experience is meeting intent." />
              <SplitBar
                centerLabel="Searches"
                rows={[
                  { label: 'With results', count: search.summary?.searches_with_results || 0, color: chartColors.navy },
                  { label: 'No results', count: search.summary?.searches_without_results || 0, color: chartColors.gold },
                ]}
              />
          </section>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader
                title="Top search terms"
                body="This shows what visitors looked for, whether results appeared, and whether that search led to a product view or purchase."
                actions={canExport ? <ExportButton href={api.adminAnalyticsExportUrl('search-terms', rangeParams)} label="Export CSV" /> : null}
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
                rows={search.terms || []}
              />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="No-result search watchlist" body="Terms that repeatedly failed to return inventory." />
              <BarList rows={noResultTerms} color={chartColors.gold} emptyLabel="No no-result search terms in this range." />
              <div className="analytics-table-spacer">
                <SectionHeader title="Top searched products" body="Based on search-result clicks and product appearances in bookshop search." />
                <BarList rows={search.top_products || []} keyField="product" color={chartColors.info} />
              </div>
            </article>
          </div>
        </>
      ) : null}

      {activeTab === 'engagement' ? (
        <>
          <section className="analytics-stat-grid">
            <StatCard label="Service page views" value={formatNumber(engagement.services.summary?.page_views)} icon="eye" tone="navy" />
            <StatCard label="Service enquiry clicks" value={formatNumber(engagement.services.summary?.enquiry_clicks)} icon="mail" tone="gold" />
            <StatCard label="News article views" value={formatNumber(engagement.news.summary?.article_views)} icon="file" tone="teal" />
            <StatCard label="News to service clicks" value={formatNumber(engagement.news.summary?.service_clicks)} icon="arrow" tone="success" />
            <StatCard label="Contact submissions" value={formatNumber(engagement.leads.summary?.contact_submissions)} icon="mail" tone="navy" />
            <StatCard label="Failed logins" value={formatNumber(engagement.security.summary?.failed_logins)} icon="warning" tone="gold" />
          </section>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader
                eyebrow="Engagement trend"
                title="Service, news, and lead activity over time"
                body="These lines show content consumption, commercial intent, and inbound lead signals together."
              />
              <MultiLineChart groups={[
                { label: 'Service views', color: chartColors.navy, data: engagement.services.timeline?.views || [] },
                { label: 'Service enquiries', color: chartColors.gold, data: engagement.services.timeline?.enquiries || [] },
                { label: 'News views', color: chartColors.info, data: engagement.news.timeline?.views || [] },
                { label: 'Contact submissions', color: chartColors.success, data: engagement.leads.timeline?.contact_submissions || [] },
              ]} />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Lead funnel" body="Direct enquiries, newsletter capture, and job applications." />
              <FunnelChart stages={[
                { label: 'Contact submissions', value: engagement.leads.summary?.contact_submissions || 0, color: chartColors.navy },
                { label: 'Newsletter signups', value: engagement.leads.summary?.newsletter_signups || 0, color: chartColors.gold },
                { label: 'Job applications', value: engagement.leads.summary?.job_applications || 0, color: chartColors.success },
              ]} />
            </article>
          </div>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader title="Service page performance" body="Views and enquiry clicks by service page." />
              <DataTable
                columns={[
                  { key: 'label', label: 'Service' },
                  { key: 'views', label: 'Views', render: row => formatNumber(row.views) },
                  { key: 'unique_visitors', label: 'Unique visitors', render: row => formatNumber(row.unique_visitors) },
                  { key: 'enquiry_clicks', label: 'Enquiry clicks', render: row => formatNumber(row.enquiry_clicks) },
                  { key: 'engagement_rate', label: 'Engagement rate', render: row => formatPercent(row.engagement_rate) },
                ]}
                rows={engagement.services.items || []}
                emptyLabel="No tracked service page activity yet."
              />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Lead interest by service" body="Contact form submissions grouped by stated service interest." />
              <BarList rows={engagement.leads.service_interest || []} color={chartColors.navy} emptyLabel="No contact submissions yet." />
            </article>
          </div>

          <div className="analytics-two-grid">
            <article className="analytics-panel">
              <SectionHeader title="News article performance" body="Views over time and clicks from articles into service pages." />
              <DataTable
                columns={[
                  { key: 'title', label: 'Article' },
                  { key: 'views', label: 'Views', render: row => formatNumber(row.views) },
                  { key: 'unique_visitors', label: 'Unique visitors', render: row => formatNumber(row.unique_visitors) },
                  { key: 'service_clicks', label: 'Service clicks', render: row => formatNumber(row.service_clicks) },
                ]}
                rows={engagement.news.articles || []}
                emptyLabel="No tracked news article activity yet."
              />
            </article>
            <article className="analytics-panel">
              <SectionHeader title="Services reached from news" body="Which service pages people click after reading news articles." />
              <BarList rows={engagement.news.service_targets || []} color={chartColors.info} emptyLabel="No news-to-service clicks yet." />
              <div className="analytics-table-spacer">
                <SectionHeader title="Newsletter source mix" body="Where newsletter signups originated." />
                <DonutChart rows={engagement.leads.newsletter_sources || []} centerLabel="Signups" />
              </div>
            </article>
          </div>

          <section className="analytics-panel">
            <SectionHeader title="Security and audit summary" body="Admin-only monitoring of login activity, failed attempts, lockouts, and audit trails." />
            <div className="analytics-mini-card-grid security">
              <div><span>Login attempts</span><strong>{formatNumber(engagement.security.summary?.login_attempts)}</strong></div>
              <div><span>Failed logins</span><strong>{formatNumber(engagement.security.summary?.failed_logins)}</strong></div>
              <div><span>Locked logins</span><strong>{formatNumber(engagement.security.summary?.locked_logins)}</strong></div>
              <div><span>Password changes</span><strong>{formatNumber(engagement.security.summary?.password_changes)}</strong></div>
              <div><span>Admin actions</span><strong>{formatNumber(engagement.security.summary?.admin_actions)}</strong></div>
            </div>
            <div className="analytics-two-grid security-grid">
              <div className="analytics-muted-card">
                <h4>Security event mix</h4>
                <BarList rows={engagement.security.action_breakdown || []} color={chartColors.gold} emptyLabel="No security events in range." />
              </div>
              <div className="analytics-muted-card">
                <h4>Most common admin actions</h4>
                <BarList rows={engagement.security.admin_actions || []} color={chartColors.navy} emptyLabel="No admin actions in range." />
              </div>
            </div>
            <div className="analytics-table-spacer">
              <DataTable
                columns={[
                  { key: 'action', label: 'Action' },
                  { key: 'actor', label: 'Actor' },
                  { key: 'entity_type', label: 'Entity' },
                  { key: 'ip', label: 'IP / prefix' },
                  { key: 'at', label: 'Time', render: row => formatDateTime(row.at) },
                ]}
                rows={engagement.security.recent || []}
                emptyLabel="No recent security events in this range."
              />
            </div>
          </section>
        </>
      ) : null}

      {showLocationReset ? (
        <div className="analytics-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setShowLocationReset(false)}>
          <section className="analytics-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="analytics-location-reset-title">
            <button className="analytics-modal-close" type="button" onClick={() => setShowLocationReset(false)} aria-label="Close">
              <Icon name="x" size={18} />
            </button>
            <span className="analytics-eyebrow">Location privacy</span>
            <h3 id="analytics-location-reset-title">Clear location history?</h3>
            <p>Country, region, city, and network-prefix history will be removed from existing analytics events. Visits, orders, searches, devices, and all other reporting will remain intact.</p>
            <div className="analytics-confirm-actions">
              <button className="analytics-danger-btn solid" type="button" onClick={clearLocationHistory} disabled={clearingLocations}>
                {clearingLocations ? 'Clearing...' : 'Clear location history'}
              </button>
              <button className="analytics-export-btn" type="button" onClick={() => setShowLocationReset(false)} disabled={clearingLocations}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      <ProductDetailDrawer
        open={Boolean(selectedProductId)}
        detail={detailLoadingId === selectedProductId ? null : detail}
        onClose={() => setSelectedProductId(null)}
        exportHref={detailExportHref}
        canExport={canExport}
      />

      {isPending ? <div className="analytics-pending">Loading product drilldown...</div> : null}
    </div>
  );
};

export default AnalyticsView;
