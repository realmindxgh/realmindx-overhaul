import React from 'react';
import logoWhite from '../realmindx-site/assets/logo-white.png';
const bookshopLogo = '/bookshop-logo.png';

// ---------- Icons (24x24 stroke) ----------
const Icon = ({ name, size = 24, stroke = 1.8, className = '' }) => {
  const p = {
    search:   <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    cart:     <><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/></>,
    user:     <><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
    chevDown: <path d="M6 9l6 6 6-6"/>,
    chevUp:   <path d="M6 15l6-6 6 6"/>,
    chevR:    <path d="M9 6l6 6-6 6"/>,
    chevL:    <path d="M15 6l-6 6 6 6"/>,
    arrow:    <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    arrowUp:  <><path d="M12 19V5M6 11l6-6 6 6"/></>,
    plus:     <path d="M12 5v14M5 12h14"/>,
    minus:    <path d="M5 12h14"/>,
    check:    <path d="M5 12l4 4L19 7" strokeWidth="2.4"/>,
    close:    <path d="M6 6l12 12M18 6L6 18"/>,
    share:    <><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.2 10.9l7.6-4.5M8.2 13.1l7.6 4.5"/></>,
    menu:     <path d="M4 7h16M4 12h16M4 17h16"/>,
    star:     <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.6 6.1 21.3l1.2-6.6L2.5 9.5l6.6-.9L12 2.5z" fill="currentColor" stroke="none"/>,
    truck:    <><path d="M4 16h4.5l2.1-4H15l2.8 4H20"/><path d="M9 12h2.4l2.1-4H17l2 3"/><path d="M13.7 8l-1.2-2H10"/><path d="M16.8 8H20"/><circle cx="6.5" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M8.5 17h7.5M11.4 12l-2.2 5M15 12l2.1 5"/></>,
    pin:      <><path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="9" r="2.4"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    mail:     <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
    phone:    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>,
    heart:    <path d="M12 21s-7-5.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 11-7 11z"/>,
    bag:      <><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
    lock:     <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list:     <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2"/><circle cx="3.5" cy="12" r="1.2"/><circle cx="3.5" cy="18" r="1.2"/></>,
    filter:   <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>,
    trash:    <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></>,
    logout:   <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
    home:     <><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-3v-7H10v7H5a2 2 0 0 1-2-2v-9z"/></>,
    shop:     <><path d="M4 9h16l-1-4H5L4 9zM5 9v11h14V9M9 20v-6h6v6"/></>,
    book:     <><path d="M4 19a2 2 0 0 1 2-2h13V3H6a2 2 0 0 0-2 2v14z"/><path d="M4 19a2 2 0 0 0 2 2h13"/></>,
    pencil:   <><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 16v4z"/><path d="M14 7l3 3"/></>,
    files:    <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/></>,
    cap:      <><path d="M12 3l10 5-10 5L2 8l10-5z"/><path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></>,
    palette:  <><circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="9" r="1"/><circle cx="16.5" cy="13" r="1"/></>,
    globe:    <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    wa:       <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" fill="currentColor" stroke="none"/>,
    facebook: <path d="M13 22v-9h3l.5-3.5H13V7.2c0-1 .3-1.7 1.8-1.7H17V2.3C16.6 2.2 15.3 2 13.9 2c-3 0-5 1.8-5 5v3H6v3.5h3V22h4z" fill="currentColor" stroke="none"/>,
    instagram:<><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></>,
    x:        <path d="M3 3h4.2l4.4 6.3L16.6 3H21l-7.4 9.8L21.5 21h-4.3l-5-7.1L6.4 21H2l8-10.4L3 3z" fill="currentColor" stroke="none"/>,
    shield:   <><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></>,
    refresh:  <><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M18 4v5h-5M6 20v-5h5"/></>,
    box:      <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
    spark:    <path d="M12 2l2.4 6.5L21 9l-5 4.2L17.5 20 12 16.5 6.5 20 8 13.2 3 9l6.6-.5z"/>,
    tag:      <><path d="M20 13l-7 7-9-9V4h7l9 9z"/><circle cx="8.5" cy="8.5" r="1.5"/></>,
  };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
};

const BrainMark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
    <circle cx="7" cy="8" r="1.3" fill="currentColor"/>
    <circle cx="13" cy="6" r="1.3" fill="currentColor"/>
    <circle cx="17" cy="10" r="1.3" fill="currentColor"/>
    <circle cx="9" cy="13" r="1.3" fill="currentColor"/>
    <circle cx="15" cy="15" r="1.3" fill="currentColor"/>
    <circle cx="6" cy="16" r="1.1" fill="currentColor"/>
    <path d="M7 8l6-2M13 6l4 4M17 10l-2 5M15 15l-6-2M9 13l-2 3M9 13l-2-5M13 6l-4 7"/>
  </svg>
);

const Logo = ({ href = '#home', onClick }) => (
  <a className="bs-logo bs-logo-img" href={href} onClick={onClick} aria-label="RealMindX Bookshop home">
    <img src={bookshopLogo} alt="RealMindX Bookshop" className="bs-navbar-logo-img"
      onError={e => { e.target.style.display='none'; }} />
  </a>
);

const Stars = ({ value = 0, size = 14 }) => (
  <span className="bs-stars" aria-label={`${value} out of 5 stars`}>
    {[1,2,3,4,5].map(i => (
      <Icon key={i} name="star" size={size} stroke={0}
        className={i <= Math.round(value) ? '' : 'bs-empty'} />
    ))}
  </span>
);

const LoadingState = ({
  title = 'Loading',
  body = 'Please wait while we fetch the latest bookshop data.',
}) => (
  <div className="bs-empty-state bs-loading-state" role="status" aria-live="polite">
    <div className="bs-empty-icon bs-loading-icon" aria-hidden="true">
      <div className="bs-loading-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
    <h2 className="bs-h2">{title}</h2>
    <p>{body}</p>
  </div>
);

const cedis = (n) => `GH\u20b5${Number(n || 0).toFixed(2)}`;

const COVER_TINTS = ['#143670','#1c4a96','#0d2550','#26417a','#324f8a'];
const CoverPlaceholder = ({
  title,
  idx = 0,
  small = false,
  image = null,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  width,
  height,
}) => {
  const tint = COVER_TINTS[idx % COVER_TINTS.length];
  if (image) {
    const imgProps = {
      src: image,
      alt: title,
      loading,
      decoding,
      width: width || (small ? 96 : 400),
      height: height || (small ? 128 : 560),
    };
    if (fetchPriority) imgProps.fetchPriority = fetchPriority;
    return (
      <div className="bs-ph-cover bs-ph-img">
        <img {...imgProps} />
      </div>
    );
  }
  return (
    <div className="bs-ph-cover" style={{
      background:
        '#eef1f7'
    }}>
      <span className="bs-ph-spine" style={{ background: tint }} />
      {small
        ? <span className="bs-ph-label">Cover coming soon</span>
        : <span className="bs-ph-title" style={{ color: tint }}>{title}</span>}
    </div>
  );
};

const Reveal = ({ children, className = '', delay = 0, as: As = 'div', ...rest }) => {
  const ref = React.useRef(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.1, rootMargin: '0px 0px -40px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <As ref={ref} className={`bs-reveal${shown ? ' in' : ''}${delay ? ' d'+delay : ''} ${className}`} {...rest}>{children}</As>;
};

const CATEGORIES = [
  { id: 'all',        name: 'All Books',     icon: 'grid' },
  { id: 'curriculum', name: 'Curriculum Books', icon: 'cap' },
  { id: 'textbooks',  name: 'Textbooks',     icon: 'book' },
  { id: 'past',       name: 'Past Questions',icon: 'files' },
  { id: 'stationery', name: 'Stationery',    icon: 'pencil' },
  { id: 'readers',    name: 'Readers',       icon: 'globe' },
  { id: 'art',        name: 'Art & Craft',   icon: 'palette' },
];

const BOOKS = [
  { id:'b1',  title:'Integrated Science for JHS 1', cat:'curriculum', catName:'Curriculum Books', price:48, old:60, desc:'Approved science textbook, Basic 7', rating:4.5, reviews:128, stock:true, grade:'JHS 1', subject:'Integrated Science', publisher:'RealMindX Press', isbn:'978-9988-2-4410-1', badge:'Bestseller', featured:true },
  { id:'b2',  title:'Mathematics for Basic 6 Pupils', cat:'curriculum', catName:'Curriculum Books', price:42, desc:'Standards-based curriculum maths', rating:4.0, reviews:86, stock:true, grade:'Basic 6', subject:'Mathematics', publisher:'Pearson Ghana', isbn:'978-9988-2-3321-8', featured:true },
  { id:'b3',  title:'BECE Past Questions: English (2015-2024)', cat:'past', catName:'Past Questions', price:35, desc:'Ten years of solved papers', rating:5.0, reviews:212, stock:true, grade:'JHS 3', subject:'English', publisher:'Aki-Ola Series', isbn:'978-9988-2-7781-0', badge:'Top Rated', featured:true },
  { id:'b4',  title:'Golden English Reader, Primary 4', cat:'readers', catName:'Readers', price:28, desc:'Graded reading & comprehension', rating:4.5, reviews:64, stock:true, grade:'Primary 4', subject:'English', publisher:'Sedco', isbn:'978-9988-2-1190-4', featured:true },
  { id:'b5',  title:'Social Studies for SHS', cat:'textbooks', catName:'Textbooks', price:55, desc:'WASSCE-aligned, full syllabus', rating:4.0, reviews:41, stock:true, grade:'SHS', subject:'Social Studies', publisher:'Excellence Series', isbn:'978-9988-2-5567-2', featured:true },
  { id:'b6',  title:'A4 Exercise Books (Pack of 10)', cat:'stationery', catName:'Stationery', price:30, desc:'80 leaves, single line ruled', rating:4.5, reviews:159, stock:true, subject:'Stationery', publisher:'Sky Stationery', isbn:'-', featured:true },
  { id:'b7',  title:'Creative Arts & Design, JHS 2', cat:'curriculum', catName:'Curriculum Books', price:46, desc:'New standards curriculum', rating:4.0, reviews:33, stock:false, grade:'JHS 2', subject:'Creative Arts', publisher:'RealMindX Press', isbn:'978-9988-2-4411-8', featured:true },
  { id:'b8',  title:'Coloured Pencils Set (24)', cat:'art', catName:'Art & Craft', price:38, old:45, desc:'Pre-sharpened, vivid pigments', rating:5.0, reviews:97, stock:true, subject:'Art Supplies', publisher:'ColourMate', isbn:'-', badge:'Sale', featured:true },
  { id:'b9',  title:"Computing for JHS, Pupil's Book 3", cat:'curriculum', catName:'Curriculum Books', price:50, desc:'ICT for the current curriculum', rating:4.5, reviews:52, stock:true, grade:'JHS 3', subject:'Computing', publisher:'Masterman', isbn:'978-9988-2-6612-7' },
  { id:'b10', title:'Elective Mathematics for SHS', cat:'textbooks', catName:'Textbooks', price:62, desc:'Volumes 1 & 2 combined', rating:4.0, reviews:74, stock:true, grade:'SHS', subject:'Mathematics', publisher:'Approachers', isbn:'978-9988-2-9923-4' },
  { id:'b11', title:'WASSCE Past Questions: Biology', cat:'past', catName:'Past Questions', price:40, desc:'Objective & theory, fully solved', rating:4.5, reviews:118, stock:true, grade:'SHS', subject:'Biology', publisher:'Aki-Ola Series', isbn:'978-9988-2-7782-7' },
  { id:'b12', title:'Twi Reader for Primary 2', cat:'readers', catName:'Readers', price:24, desc:'Ghanaian Language series', rating:4.0, reviews:29, stock:true, grade:'Primary 2', subject:'Ghanaian Language', publisher:'Bureau of Languages', isbn:'978-9988-2-0098-4' },
  { id:'b13', title:'Mathematical Set (Oxford-style)', cat:'stationery', catName:'Stationery', price:18, desc:'Compass, protractor, set squares', rating:4.5, reviews:203, stock:true, subject:'Stationery', publisher:'GeoTools', isbn:'-' },
  { id:'b14', title:'Religious & Moral Education, Basic 5', cat:'curriculum', catName:'Curriculum Books', price:39, desc:'RME standards-based', rating:4.0, reviews:18, stock:true, grade:'Basic 5', subject:'RME', publisher:'Sedco', isbn:'978-9988-2-1191-1' },
  { id:'b15', title:'Watercolour Paint Set (12)', cat:'art', catName:'Art & Craft', price:32, desc:'Washable, with brush', rating:4.5, reviews:61, stock:false, subject:'Art Supplies', publisher:'ColourMate', isbn:'-' },
  { id:'b16', title:'English Grammar & Composition, SHS', cat:'textbooks', catName:'Textbooks', price:52, desc:'Complete WASSCE preparation', rating:5.0, reviews:140, stock:true, grade:'SHS', subject:'English', publisher:'Excellence Series', isbn:'978-9988-2-5568-9' },
  { id:'b17', title:'Owl & Co. Spelling Workbook, P3', cat:'readers', catName:'Readers', price:22, desc:'Weekly graded word lists', rating:4.0, reviews:24, stock:true, grade:'Primary 3', subject:'English', publisher:'Sedco', isbn:'978-9988-2-1192-8' },
  { id:'b18', title:'HB Pencils (Box of 12)', cat:'stationery', catName:'Stationery', price:15, desc:'Smooth graphite, eraser-tipped', rating:4.5, reviews:188, stock:true, subject:'Stationery', publisher:'Sky Stationery', isbn:'-' },
  { id:'b19', title:'Geography for SHS', cat:'textbooks', catName:'Textbooks', price:58, desc:'Physical & human geography', rating:4.0, reviews:37, stock:true, grade:'SHS', subject:'Geography', publisher:'Approachers', isbn:'978-9988-2-9924-1' },
  { id:'b20', title:'BECE Past Questions: Mathematics', cat:'past', catName:'Past Questions', price:35, desc:'Worked solutions, 2015-2024', rating:5.0, reviews:176, stock:true, grade:'JHS 3', subject:'Mathematics', publisher:'Aki-Ola Series', isbn:'978-9988-2-7783-4', badge:'Bestseller' },
];

export { Icon, BrainMark, Logo, Stars, LoadingState, cedis, CoverPlaceholder, Reveal, CATEGORIES, BOOKS };
