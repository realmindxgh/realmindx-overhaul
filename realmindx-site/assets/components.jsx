import React from 'react';
import ReactDOM from 'react-dom';

// Icons & primitives shared across the site
export const Icon = ({ name, size = 24, stroke = 1.8 }) => {
  const paths = {
    teacher: <><circle cx="12" cy="7" r="3.2"/><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/></>,
    growth: <><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></>,
    school: <><path d="M3 10l9-5 9 5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></>,
    book: <><path d="M4 19a2 2 0 0 1 2-2h13V3H6a2 2 0 0 0-2 2v14z"/><path d="M4 19a2 2 0 0 0 2 2h13"/></>,
    tutor: <><path d="M12 3l9 4.5-9 4.5L3 7.5 12 3z"/><path d="M5 10v5c0 2 3 4 7 4s7-2 7-4v-5"/></>,
    research: <><circle cx="11" cy="11" r="6"/><path d="M21 21l-4.3-4.3"/></>,
    secretarial: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    special: <><path d="M12 21s-7-5.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 11-7 11z"/></>,
    consulting: <><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></>,
    extra: <><path d="M12 2l2.4 6.5L21 9l-5 4.2L17.5 20 12 16.5 6.5 20 8 13.2 3 9l6.6-.5z"/></>,
    home: <><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-3v-7H10v7H5a2 2 0 0 1-2-2v-9z"/></>,
    schoolms: <><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M3 17h18M9 21h6M12 17v4"/></>,
    pBuilding: <><path d="M4 21V7l8-4 8 4v14"/><path d="M9 9h2M9 13h2M9 17h2M13 9h2M13 13h2M13 17h2"/></>,
    pBook: <><path d="M4 19a2 2 0 0 1 2-2h13V3H6a2 2 0 0 0-2 2v14z"/><path d="M4 19a2 2 0 0 0 2 2h13M9 7h6"/></>,
    pStar: <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.7L6 22l1.5-7.2L2 10l7.1-1.1L12 2z"/>,
    pColumn: <><path d="M5 21V8l7-4 7 4v13"/><path d="M5 11h14M5 15h14M5 21h14"/><path d="M10 11v10M14 11v10"/></>,
    pLeaf: <><path d="M21 3c-2 9-6 13-13 14a8 8 0 0 1 0-13c4 0 7-1 13-1z"/><path d="M3 21c2-9 7-12 14-13"/></>,
    pShield: <><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></>,
    check: <path d="M5 12l4 4L19 7" strokeWidth="2.5"/>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    arrowUp: <><path d="M12 19V5M6 11l6-6 6 6"/></>,
    chevL: <path d="M15 6l-6 6 6 6"/>,
    chevR: <path d="M9 6l6 6-6 6"/>,
    chevDown: <path d="M6 9l6 6 6-6"/>,
    chevUp: <path d="M6 15l6-6 6 6"/>,
    mapPin: <><path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
    phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    sprout: <><path d="M12 21V10"/><path d="M12 10C8 10 5 7 5 3c4 0 7 3 7 7z"/><path d="M12 13c4 0 7-3 7-7-4 0-7 3-7 7z"/></>,
    chart: <><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="8" width="3" height="8"/><rect x="17" y="5" width="3" height="11"/></>,
    package: <><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></>,
    newspaper: <><path d="M4 5h13a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3V5z"/><path d="M7 8h6M7 12h10M7 16h6"/></>,
    image: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5L5 19"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.8 1.7V22h-3.6v-.3a1.7 1.7 0 0 0-.8-1.7 1.7 1.7 0 0 0-2-.1l-.2.1-2-3 .1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2v-4h1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3 .2.1a1.7 1.7 0 0 0 2-.1 1.7 1.7 0 0 0 .8-1.7V2h3.6v.3a1.7 1.7 0 0 0 .8 1.7 1.7 1.7 0 0 0 2 .1l.2-.1 2 3-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h1v4h-1a1.7 1.7 0 0 0-1.6 1z"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0v2H9V4z"/><path d="M9 12h6M9 16h4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    paperclip: <path d="M21.4 11.6l-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>,
    award: <><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5L7 22l5-3 5 3-1.5-9.5"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    warning: <><path d="M12 3l10 18H2L12 3z"/><path d="M12 9v5M12 18h.01"/></>,
    x: <><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4A7 7 0 1 1 21 15z"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    money: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9h.01M18 15h.01"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M7.1 7.5C3.9 9.3 2 12 2 12s3.5 6 10 6c1.6 0 3-.3 4.2-.8"/><path d="M14.1 6.2C19.1 7 22 12 22 12a16.7 16.7 0 0 1-3.1 3.7"/></>,
    shield: <><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></>,
    camera: <><path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></>,
    folder: <><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
    party: <><path d="M5 21l5-17 10 10L5 21z"/><path d="M14 4l1-2M18 8l3-1M16 12l2 2M10 7l-2-2"/></>,
    filter: <path d="M3 5h18l-7 8.5V19l-4 2.5v-8L3 5z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ---------- Date helpers (ISO yyyy-mm-dd in/out, shared by every date selector on the site) ----------
const dpPad2 = n => String(n).padStart(2, '0');
const dpToISO = (year, month, day) => `${year}-${dpPad2(month + 1)}-${dpPad2(day)}`;
const dpParseISO = value => {
  if (!value || typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};
const dpFormatDisplay = value => {
  const date = dpParseISO(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const dpStartOfDay = date => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const dpSameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Pulls a date inside [minDate, maxDate] (when given) — used so the calendar always opens on a month
// that actually contains selectable days, instead of stranding the user on a fully-disabled "today"
// (e.g. a Date of Birth field constrained to 18+ years ago would otherwise open on the current month,
// where every single day is disabled, forcing ~200+ clicks back to a usable year).
const dpClampToRange = (date, minDate, maxDate) => {
  if (maxDate && date > maxDate) return maxDate;
  if (minDate && date < minDate) return minDate;
  return date;
};
const DP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DP_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Custom calendar date selector (RealMindX-styled popover) — used everywhere a date needs to be picked,
// across both the admin portal and user-facing forms, instead of the bare native <input type="date">.
export const DatePickerField = ({ value, onChange, placeholder, min, max, ariaLabel, className = '' }) => {
  // Computed up front (not hooks — plain derived values) so the initial viewDate below can use them.
  const selected = dpParseISO(value);
  const parsedMin = min ? dpParseISO(min) : null;
  const parsedMax = max ? dpParseISO(max) : null;
  const minDate = parsedMin ? dpStartOfDay(parsedMin) : null;
  const maxDate = parsedMax ? dpStartOfDay(parsedMax) : null;
  const today = dpStartOfDay(new Date());
  // Where the calendar should land when there's no selection yet: today, pulled inside [min, max]
  // if today falls outside it. Keeps "open the picker" useful for any field — birthdays decades back,
  // expiries decades forward — instead of always dumping the user on a dead, fully-disabled month.
  const preferredView = selected || dpClampToRange(today, minDate, maxDate);

  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => preferredView);
  const wrapRef = React.useRef(null);
  const popRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 240 });

  const reposition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = popRef.current?.offsetHeight || 356;
    const minWidth = Math.max(rect.width, 272);
    const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - minWidth - 12));
    const openAbove = rect.bottom + 8 + estimatedHeight > viewportHeight - 12 && rect.top - 8 - estimatedHeight >= 12;
    const top = openAbove
      ? Math.max(12, rect.top - estimatedHeight - 8)
      : Math.min(rect.bottom + 8, Math.max(12, viewportHeight - estimatedHeight - 12));
    setCoords({ top, left, width: rect.width });
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    setViewDate(preferredView);
    reposition();
    const frame = window.requestAnimationFrame(reposition);
    const handlePointerDown = event => {
      if (wrapRef.current?.contains(event.target) || popRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        // Stop here so the keypress only closes this popover, not any parent
        // modal (e.g. AdminPortalPage's form modal also closes on Escape via
        // a window-level listener — without this, one Escape press would
        // dismiss the calendar AND discard the admin's in-progress form).
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDisabled = date => {
    const day = dpStartOfDay(date);
    if (minDate && day < minDate) return true;
    if (maxDate && day > maxDate) return true;
    return false;
  };

  const pick = date => {
    if (isDisabled(date)) return;
    onChange(dpToISO(date.getFullYear(), date.getMonth(), date.getDate()));
    setOpen(false);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = [];
  if (open) {
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
    for (let i = 0; i < 42; i++) cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const popover = open && ReactDOM.createPortal(
    <div ref={popRef} className="dx-datepicker-pop" role="dialog" aria-label={`${ariaLabel || 'Date'} picker`}
         style={{ position: 'fixed', top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 272), maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}>
      <div className="dx-datepicker-head">
        <button type="button" className="dx-datepicker-nav" aria-label="Previous month"
                onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
          <Icon name="chevL" size={16} stroke={2.2} />
        </button>
        <span className="dx-datepicker-title">
          <select
            className="dx-datepicker-jump-select"
            aria-label="Month"
            value={month}
            onChange={e => setViewDate(new Date(year, Number(e.target.value), 1))}
          >
            {DP_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            className="dx-datepicker-jump-select"
            aria-label="Year"
            value={year}
            onChange={e => setViewDate(new Date(Number(e.target.value), month, 1))}
          >
            {(() => {
              const lo = minDate ? minDate.getFullYear() : today.getFullYear() - 100;
              const hi = maxDate ? maxDate.getFullYear() : today.getFullYear() + 10;
              const yrs = [];
              for (let y = hi; y >= lo; y--) yrs.push(y);
              return yrs.map(y => <option key={y} value={y}>{y}</option>);
            })()}
          </select>
        </span>
        <button type="button" className="dx-datepicker-nav" aria-label="Next month"
                onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
          <Icon name="chevR" size={16} stroke={2.2} />
        </button>
      </div>
      <div className="dx-datepicker-weekdays">
        {DP_WEEKDAYS.map(label => <span key={label}>{label}</span>)}
      </div>
      <div className="dx-datepicker-grid">
        {cells.map((date, i) => {
          const classes = ['dx-datepicker-cell'];
          if (date.getMonth() !== month) classes.push('is-outside');
          if (dpSameDay(date, today)) classes.push('is-today');
          if (dpSameDay(date, selected)) classes.push('is-selected');
          if (isDisabled(date)) classes.push('is-disabled');
          return (
            <button type="button" key={i} className={classes.join(' ')} disabled={isDisabled(date)}
                    onClick={() => pick(date)} aria-pressed={dpSameDay(date, selected)}>
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="dx-datepicker-foot">
        <button type="button" className="dx-datepicker-link" onClick={() => {
          if (!isDisabled(today)) { onChange(dpToISO(today.getFullYear(), today.getMonth(), today.getDate())); setOpen(false); }
          // Today isn't selectable here (e.g. a Date of Birth field) — land on the nearest edge of
          // the valid range instead of "today"'s month, which would just be another dead end.
          else setViewDate(dpClampToRange(today, minDate, maxDate));
        }}>
          Jump to today
        </button>
        {value ? (
          <button type="button" className="dx-datepicker-link is-danger" onClick={() => { onChange(''); setOpen(false); }}>
            Clear
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className={`dx-datepicker ${className}`} ref={wrapRef}>
      <button type="button" ref={triggerRef} className="dx-datepicker-trigger form-input"
              aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
              onClick={() => setOpen(o => !o)}>
        <span className={`dx-datepicker-value${value ? '' : ' is-placeholder'}`}>
          {value ? dpFormatDisplay(value) : (placeholder || 'Select a date')}
        </span>
        <span className="dx-datepicker-icon"><Icon name="calendar" size={17} stroke={1.8} /></span>
      </button>
      {popover}
    </div>
  );
};

// IntersectionObserver-driven reveal wrapper
export const Reveal = ({ children, className = '', delay = 0, as: As = 'div', ...rest }) => {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const delayCls = delay ? ` delay-${delay}` : '';
  return (
    <As ref={ref} className={`reveal${shown ? ' in' : ''}${delayCls} ${className}`} {...rest}>
      {children}
    </As>
  );
};

// Count-up number that triggers when in view
export const CountUp = ({ to = 100, suffix = '+', duration = 1500 }) => {
  const ref = React.useRef(null);
  const [n, setN] = React.useState(0);
  const started = React.useRef(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (t) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(eased * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{n}{suffix}</span>;
};

if (typeof window !== 'undefined') {
  Object.assign(window, { Icon, Reveal, CountUp });
}
