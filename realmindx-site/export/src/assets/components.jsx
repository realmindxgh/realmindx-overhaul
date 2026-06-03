// Icons & primitives shared across the site
const Icon = ({ name, size = 24, stroke = 1.8 }) => {
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
    chevL: <path d="M15 6l-6 6 6 6"/>,
    chevR: <path d="M9 6l6 6-6 6"/>,
    mapPin: <><path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
    phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// IntersectionObserver-driven reveal wrapper
const Reveal = ({ children, className = '', delay = 0, as: As = 'div', ...rest }) => {
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
const CountUp = ({ to = 100, suffix = '+', duration = 1500 }) => {
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

Object.assign(window, { Icon, Reveal, CountUp });
