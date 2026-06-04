import React from 'react';
import { Icon, Reveal, CountUp } from './components.jsx';
import logoWhite from './logo-white.png';
import { getDemoSession } from '../../src/lib/demoAccounts.js';
import { signOut } from '../../src/lib/authClient.js';
import {
  useHomeHeroSlides,
  usePublicGallery,
  usePublicNews,
  usePublicPartners,
  usePublicServices,
} from '../../src/lib/siteContent.js';

// ====================== Nav ======================
const SERVICE_NAV_ITEMS = [
  { label: 'Teacher Recruitment', href: '/services#teacher-recruitment' },
  { label: 'Teacher Development', href: '/services#teacher-development' },
  { label: 'School Structuring', href: '/services#school-structuring' },
  { label: 'Bookshop', href: 'https://bookshop.realmindxgh.com' },
  { label: 'After-School Tutoring', href: '/services#tutoring' },
  { label: 'Research & Assignments', href: '/services#research' },
  { label: 'Secretarial Services', href: '/services#secretarial' },
  { label: 'Special Education', href: '/services#special-education' },
  { label: 'Educational Consulting', href: '/services#consulting' },
  { label: 'Extracurricular Offers', href: '/services#extracurricular' },
  { label: 'Home Schooling Support', href: '/services#home-schooling' },
  { label: 'SchoolMS', href: '/services#schoolms' },
];

const ABOUT_NAV_ITEMS = [
  { label: 'Who We Are', href: '/about#who' },
  { label: 'Our Mission', href: '/about#mission' },
  { label: 'Our Vision', href: '/about#vision' },
  { label: 'Our Goals', href: '/about#goals' },
  { label: 'Why Choose Us', href: '/about#choose-realmindx' },
  { label: 'Our Leadership Team', href: '/about#leadership' },
];

const JOB_NAV_ITEMS = [
  { label: 'Sign Up', href: '/register' },
  { label: 'Login', href: '/login' },
  { label: 'Job Posts', href: '/jobs' },
];

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about', children: ABOUT_NAV_ITEMS },
  { label: 'Services', href: '/services', children: SERVICE_NAV_ITEMS },
  { label: 'Bookshop', href: 'https://bookshop.realmindxgh.com' },
  { label: 'News', href: '/news' },
  { label: 'Jobs', href: '/jobs', children: JOB_NAV_ITEMS },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
];

const pageKeyFromHref = (href = '/') => {
  if (href === '/') return 'home';
  return href.replace(/^\//, '').split(/[?#/]/)[0] || 'home';
};

const currentPageKey = () => {
  if (typeof window === 'undefined') return 'home';
  return pageKeyFromHref(window.location.pathname);
};

const SESSION_KEY = 'realmindx.demoSession';

const NavUserPill = () => {
  const [session, setSession] = React.useState(() => getDemoSession());
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onOutsideClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!session) return null;

  const initials = session.initials
    || ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase();
  const isAdminSession = ['admin', 'staff'].includes(session.role);
  const dashboardHref = isAdminSession ? '/admin/dashboard' : '/portal';

  const handleSignOut = async (e) => {
    e.stopPropagation();
    await signOut();
    setSession(null);
    window.location.href = '/';
  };

  return (
    <div
      ref={ref}
      className={`nav-user-pill${open ? ' open' : ''}`}
      onClick={() => setOpen(o => !o)}
      role="button"
      aria-haspopup="true"
      aria-expanded={open}
    >
      <div className="nav-user-pill-avatar">
        {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}
      </div>
      <span className="nav-user-pill-name">{session.firstName}</span>
      <span className="nav-user-pill-caret" aria-hidden="true" />

      {open && (
        <div className="nav-user-dropdown" onClick={e => e.stopPropagation()}>
          <div className="nav-user-dropdown-greeting">
            Signed in as
            <div className="nav-user-dropdown-name">
              {session.firstName} {session.lastName}
            </div>
          </div>
          <div className="nav-user-dropdown-divider" />
          <a
            href={dashboardHref}
            className="nav-user-menu-item"
            onClick={() => setOpen(false)}
          >
            <span className="menu-icon"><Icon name="grid" size={15} stroke={2} /></span>
            {isAdminSession ? 'Go to Admin Dashboard' : 'Go to Dashboard'}
          </a>
          <a
            href="/jobs"
            className="nav-user-menu-item"
            onClick={() => setOpen(false)}
          >
            <span className="menu-icon"><Icon name="briefcase" size={15} stroke={2} /></span>
            View Job Posts
          </a>
          <div className="nav-user-dropdown-divider" />
          <button className="nav-user-menu-item danger" onClick={handleSignOut}>
            <span className="menu-icon"><Icon name="x" size={15} stroke={2.5} /></span>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export const Nav = ({ activePage, solid = false }) => {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [activeDropdown, setActiveDropdown] = React.useState(null);
  const [openMobileDropdown, setOpenMobileDropdown] = React.useState(null);
  const managedServices = usePublicServices();
  const currentPage = activePage || currentPageKey();
  const navItems = React.useMemo(() => {
    const serviceChildren = managedServices.length
      ? managedServices.map(service => ({
          label: service.label,
          href: `/services#${service.id}`,
        }))
      : SERVICE_NAV_ITEMS;
    return NAV_ITEMS.map(item =>
      item.label === 'Services' ? { ...item, children: serviceChildren } : item
    );
  }, [managedServices]);
  const isActive = (item, index) => {
    if (index === 0) return currentPage === 'home';
    const key = pageKeyFromHref(item.href);
    return currentPage === key;
  };
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  React.useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);
  React.useEffect(() => { if (!open) setOpenMobileDropdown(null); }, [open]);
  React.useEffect(() => {
    const onDocumentClick = (event) => {
      if (!event.target.closest('.nav-dropdown')) setActiveDropdown(null);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <nav className={`nav main-nav${solid || scrolled ? ' scrolled' : ''}`}>
        <div className="nav-inner">
          <a className="nav-logo" href="/" aria-label="RealMindX Education home">
            <img src={logoWhite} alt="RealMindX Education" />
          </a>
          <div className="nav-links">
            {navItems.map((n, i) => n.children ? (
              <div
                className={`nav-dropdown${activeDropdown === n.label ? ' open' : ''}${n.children.length > 6 ? ' nav-dropdown-long' : ''}`}
                key={n.label}
              >
                <button
                  className={`nav-link nav-dropdown-trigger${isActive(n, i) ? ' active' : ''}`}
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={activeDropdown === n.label}
                  onClick={() => setActiveDropdown(activeDropdown === n.label ? null : n.label)}
                >
                  {n.label}
                  <span className="nav-caret" aria-hidden="true" />
                </button>
                <div className="nav-dropdown-menu" role="menu" aria-label={`${n.label} menu`}>
                  {n.children.map(item => (
                    <a
                      key={item.label}
                      className="nav-dropdown-item"
                      href={item.href}
                      role="menuitem"
                      onClick={() => setActiveDropdown(null)}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <a key={n.label} className={`nav-link${isActive(n, i) ? ' active' : ''}`} href={n.href}>{n.label}</a>
            ))}
            <a className="btn btn-primary nav-cta" href="/donate">Donate</a>
            <NavUserPill />
          </div>
          <button
            className={`hamburger${open ? ' open' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span/><span/><span/>
          </button>
        </div>
      </nav>
      <div className={`mobile-menu${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
        {navItems.map(n => {
          if (!n.children) return <a key={n.label} href={n.href}>{n.label}</a>;
          const isDropdownOpen = openMobileDropdown === n.label;
          return (
            <div
              className={`mobile-dropdown${isDropdownOpen ? ' open' : ''}`}
              key={n.label}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="mobile-menu-link mobile-dropdown-trigger"
                type="button"
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
                onClick={() => setOpenMobileDropdown(isDropdownOpen ? null : n.label)}
              >
                {n.label}
                <span className="nav-caret" aria-hidden="true" />
              </button>
              <div className="mobile-dropdown-menu" role="menu" aria-label={`${n.label} menu`}>
                {n.children.map(item => (
                  <a key={item.label} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        <a className="btn btn-primary mobile-menu-cta" href="/donate">Donate</a>
      </div>
    </>
  );
};

// ====================== Hero ======================
const Hero = () => {
  const heroSlides = useHomeHeroSlides();
  const [idx, setIdx] = React.useState(0);
  const total = heroSlides.length || 1;
  React.useEffect(() => {
    if (total <= 1) return undefined;
    const id = setInterval(() => setIdx(i => (i + 1) % total), 5000);
    return () => clearInterval(id);
  }, [total]);
  React.useEffect(() => {
    if (idx >= total) setIdx(0);
  }, [idx, total]);
  return (
    <section id="home" className="hero">
      <div className="hero-dots" />
      <div className="hero-image" aria-hidden="true">
        {heroSlides.map((s, i) => (
          <img
            key={s.id || s.src}
            src={s.src || s.img}
            alt=""
            className={`hero-slide${i === idx ? ' active' : ''}`}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
        <div className="hero-image-fade" />
      </div>
      <div className="hero-inner">
        <div className="hero-content">
          <div className="hero-bar fade-up" />
          <span className="label-eyebrow hero-label fade-up delay-1">
            Education - Innovation - Community
          </span>
          <h1>
            <span className="fade-up delay-2" style={{ display: 'block' }}>Empowering</span>
            <span className="fade-up delay-3" style={{ display: 'block' }}>Every <span className="gold">Mind.</span></span>
          </h1>
          <p className="hero-sub fade-up delay-4">
            Ghana's most comprehensive educational services provider.
            From teacher recruitment to school transformation, we make quality education possible.
          </p>
          <div className="hero-cta-row fade-up delay-5">
            <a className="btn btn-primary" href="/services">
              Explore Our Services <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light" href="/bookshop">
              Visit the Bookshop <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light" href="/services#schoolms">
              Explore SchoolMS <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light hero-cta-end" href="/jobs">
              Teaching Opportunities <Icon name="arrow" size={16} />
            </a>
          </div>
          <div className="hero-trust fade-up delay-6">
            Trusted by schools across Accra and beyond
          </div>
        </div>
      </div>
      <div className="hero-slide-dots" aria-hidden="true">
        {heroSlides.map((_, i) => (
          <button
            key={i}
            className={`hero-slide-dot${i === idx ? ' active' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`Show slide ${i + 1}`}
          />
        ))}
      </div>
      <div className="scroll-indicator" aria-hidden="true">
        <span>Scroll</span>
        <span className="dot" />
      </div>
    </section>
  );
};

// ====================== Marquee ======================
const Marquee = ({ items, variant = 'gold' }) => {
  const group = (
    <div className="marquee-group">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span className="marquee-item">{it}</span>
          <span className="marquee-sep">&bull;</span>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div className={`marquee ${variant}`} aria-hidden="true">
      <div className="marquee-track">
        {group}{group}
      </div>
    </div>
  );
};

const SERVICE_MARQUEE = [
  'Teacher Recruitment', 'Teacher Development', 'School Structuring',
  'Bookshop', 'After-School Tutoring', 'Research & Assignments',
  'Secretarial Services', 'Special Education', 'Educational Consulting',
  'Extracurricular Offers', 'Home Schooling', 'SchoolMS',
];
const IMPACT_MARQUEE = [
  '30+ CPD Programs Delivered', '200+ Research Projects',
  '100+ Teachers Recruited', 'Trusted Across Ghana',
  'Holistic Learning for Every Mind',
];

// ====================== Mission & Stats ======================
const STATS = [
  { num: 30, label: 'CPD Programs', desc: 'Delivered across Ghanaian schools' },
  { num: 200, label: 'Research Projects', desc: 'Completed by our expert researchers' },
  { num: 100, label: 'Teachers Recruited', desc: 'Placed in quality schools nationwide' },
];

const MissionStats = () => (
  <section className="mission" id="mission">
    <div className="mission-left">
      <Reveal>
        <span className="label-eyebrow">Our Mission</span>
        <h2 className="h2" style={{ marginTop: 18 }}>Holistic learning, conveniently<br/>for every mind.</h2>
        <p>
          We exist to make quality education a reality for every Ghanaian school,
          teacher and learner. We partner with institutions to lift standards
          end-to-end, covering the people they recruit, the way they train, and
          the systems that hold their work together.
        </p>
        <div className="mission-rule" />
        <a href="/about" className="mission-link">Learn more about us <Icon name="arrow" size={15} /></a>
      </Reveal>
    </div>
    <div className="mission-right">
      {STATS.map((s, i) => (
        <Reveal key={s.label} delay={(i + 1) * 100}>
          <div className="stat-num"><CountUp to={s.num} /></div>
          <div className="stat-label label-eyebrow">{s.label}</div>
          <div className="stat-desc">{s.desc}</div>
        </Reveal>
      ))}
    </div>
  </section>
);

// ====================== Services ======================
const SERVICES = [
  { icon: 'teacher', name: 'Teacher Recruitment', desc: 'We match schools with qualified, vetted teachers ready to make impact from day one.' },
  { icon: 'growth', name: 'Teacher Development', desc: 'CPD workshops and coaching to grow confident, modern classroom practitioners.' },
  { icon: 'school', name: 'School Structuring', desc: 'Operations, governance and culture support to turn good schools into great ones.' },
  { icon: 'book', name: 'Bookshop', desc: 'Wholesale and retail stationery, textbooks and learning materials, delivered to your door.' },
  { icon: 'tutor', name: 'After-School Tutoring', desc: 'One-on-one and small-group tutoring tailored to each learner\'s pace.' },
  { icon: 'research', name: 'Research & Assignments', desc: 'Academic research support, data analysis and editorial review by subject experts.' },
  { icon: 'secretarial', name: 'Secretarial Services', desc: 'Typesetting, printing, binding and administrative work, done quickly and accurately.' },
  { icon: 'special', name: 'Special Education', desc: 'Inclusive learning programs and trained support for every kind of mind.' },
  { icon: 'consulting', name: 'Educational Consulting', desc: 'Strategic advisory for school leaders navigating reform, growth and change.' },
  { icon: 'extra', name: 'Extracurricular Offers', desc: 'Clubs, camps and enrichment programs that build well-rounded students.' },
  { icon: 'home', name: 'Home Schooling Support', desc: 'Structured curricula and visiting tutors for families teaching at home.' },
  { icon: 'schoolms', name: 'SchoolMS', desc: 'A school management platform built for Ghanaian basic schools. AI-enabled.' },
];

const Services = () => {
  const managedServices = usePublicServices();
  const [selectedService, setSelectedService] = React.useState(null);
  const stripRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const setRef = React.useRef(null);
  const offsetRef = React.useRef(0);
  const loopWidthRef = React.useRef(0);
  const lastFrameRef = React.useRef(0);
  const pauseUntilRef = React.useRef(0);
  const serviceItems = managedServices.length
    ? managedServices.map(service => ({
        ...service,
        id: service.id,
        icon: service.icon,
        name: service.label,
        desc: service.summary || service.body?.[0] || '',
      }))
    : SERVICES.map(service => ({
        ...service,
        id: service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        label: service.name,
        summary: service.desc,
        body: [service.desc],
        features: [],
      }));

  const applyTransform = React.useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
    }
  }, []);

  const wrapOffset = React.useCallback(() => {
    const loopWidth = loopWidthRef.current;
    if (!loopWidth) return;
    offsetRef.current = ((offsetRef.current % loopWidth) + loopWidth) % loopWidth;
  }, []);

  const measureLoop = React.useCallback(() => {
    loopWidthRef.current = setRef.current?.scrollWidth || 0;
    wrapOffset();
    applyTransform();
  }, [applyTransform, wrapOffset]);

  const scrollServices = React.useCallback((direction = 1, multiplier = 1) => {
    const strip = stripRef.current;
    if (!strip || serviceItems.length <= 1) return;
    measureLoop();
    const distance = Math.min((strip.clientWidth || 420) * 0.74 * multiplier, 560);
    const start = offsetRef.current;
    const target = start + direction * distance;
    const duration = 480;
    const startTime = performance.now();
    pauseUntilRef.current = Date.now() + duration + 320;

    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const animate = now => {
      const t = Math.min(1, (now - startTime) / duration);
      offsetRef.current = start + (target - start) * easeOut(t);
      wrapOffset();
      applyTransform();
      if (t < 1) window.requestAnimationFrame(animate);
    };
    window.requestAnimationFrame(animate);
  }, [applyTransform, measureLoop, serviceItems.length, wrapOffset]);

  React.useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !trackRef.current || serviceItems.length <= 1) return undefined;
    measureLoop();
    let frame = 0;
    const handleResize = () => measureLoop();
    window.addEventListener('resize', handleResize);

    const animate = timestamp => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = Math.min(80, timestamp - lastFrameRef.current);
      lastFrameRef.current = timestamp;
      const isPaused = strip.matches(':hover') || strip.matches(':focus-within') || Date.now() < pauseUntilRef.current;
      if (!isPaused && loopWidthRef.current) {
        offsetRef.current += 4 * (delta / 1000);
        wrapOffset();
        applyTransform();
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      lastFrameRef.current = 0;
    };
  }, [applyTransform, measureLoop, serviceItems.length, wrapOffset]);

  React.useEffect(() => {
    if (!selectedService) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => {
      if (event.key === 'Escape') setSelectedService(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [selectedService]);

  const selectedServiceCtas = React.useMemo(() => {
    if (!selectedService) return [];
    if (Array.isArray(selectedService.ctas) && selectedService.ctas.length) {
      return selectedService.ctas.filter(cta => cta?.label && cta?.href);
    }
    return [
      selectedService.primary_cta_label && selectedService.primary_cta_href
        ? { label: selectedService.primary_cta_label, href: selectedService.primary_cta_href, style: 'primary' }
        : null,
      selectedService.secondary_cta_label && selectedService.secondary_cta_href
        ? { label: selectedService.secondary_cta_label, href: selectedService.secondary_cta_href, style: 'outline-navy' }
        : null,
    ].filter(Boolean);
  }, [selectedService]);

  const renderServiceCard = (s, i, duplicate = false) => (
    <button
       className="home-service-card"
       type="button"
       key={`${s.id}-${duplicate ? 'dupe' : 'main'}-${i}`}
       aria-label={`View ${s.name}`}
       tabIndex={duplicate ? -1 : undefined}
       onClick={() => { if (!duplicate) setSelectedService(s); }}
    >
      <span className="service-icon"><Icon name={s.icon} size={22} /></span>
      <span className="service-name">{s.name}</span>
      <span className="service-desc">{s.desc}</span>
    </button>
  );

  return (
    <section className="services" id="services">
      <div className="container">
        <Reveal className="section-head">
          <span className="label-eyebrow">What We Offer</span>
          <h2 className="h2">Comprehensive Educational Services</h2>
          <p>From teacher development to school transformation, we have the expertise your institution needs.</p>
        </Reveal>
      </div>

      {/* Marquee strip - pauses on hover, loops forever */}
      <div className="home-services-controls" aria-label="Service strip controls">
        <button className="home-services-control" type="button" onClick={() => scrollServices(-1)} aria-label="Scroll services backward">
          <Icon name="chevL" size={19} stroke={2.2} />
        </button>
        <button className="home-services-control is-forward" type="button" onClick={() => scrollServices(1, 1.45)} aria-label="Scroll services forward faster">
          <Icon name="chevR" size={19} stroke={2.2} />
        </button>
      </div>

      <div className="home-services-marquee" ref={stripRef} aria-label="RealMindX services">
        <div className="home-services-marquee-track" ref={trackRef}>
          <div className="home-services-marquee-set" ref={setRef}>
            {serviceItems.map((s, i) => renderServiceCard(s, i))}
          </div>
          {serviceItems.length > 1 && (
            <div className="home-services-marquee-set" aria-hidden="true">
              {serviceItems.map((s, i) => renderServiceCard(s, i, true))}
            </div>
          )}
        </div>
      </div>

      <div className="container">
        <Reveal className="services-cta" delay={200}>
          <a className="btn btn-outline-gold" href="/services">View All Services <Icon name="arrow" size={15} /></a>
        </Reveal>
      </div>
      {selectedService && (
        <div
          className="service-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelectedService(null);
          }}
        >
          <article className="service-modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
            <button className="service-modal-close" type="button" onClick={() => setSelectedService(null)} aria-label="Close service details">
              <Icon name="x" size={18} stroke={2.2} />
            </button>
            <figure className="service-modal-media">
              {selectedService.img ? <img src={selectedService.img} alt={selectedService.title || selectedService.name} /> : <Icon name={selectedService.icon} size={72} />}
            </figure>
            <div className="service-modal-copy">
              <p className="label-eyebrow">{selectedService.tag || 'RealMindX Service'}</p>
              <h2 id="service-modal-title">{selectedService.title || selectedService.name}</h2>
              <p>{selectedService.summary || selectedService.desc}</p>
              {selectedService.body?.length > 0 && (
                <div className="service-modal-body">
                  {selectedService.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                </div>
              )}
              {selectedService.features?.length > 0 && (
                <ul className="service-modal-features">
                  {selectedService.features.map(feature => (
                    <li key={feature}><Icon name="check" size={16} /> {feature}</li>
                  ))}
                </ul>
              )}
              <div className="service-modal-actions">
                {(selectedServiceCtas.length ? selectedServiceCtas : [{ label: 'Enquire Now', href: '/contact', style: 'primary' }]).map(cta => (
                  <a
                    key={`${cta.label}-${cta.href}`}
                    className={`btn ${cta.style === 'outline-navy' || cta.style === 'outline' ? 'btn-outline-navy' : 'btn-primary'}`}
                    href={cta.href}
                  >
                    {cta.label}
                  </a>
                ))}
                <a className="btn btn-outline-navy" href="/services">
                  View All Services
                </a>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

// ====================== Why us ======================
const FEATURES = [
  { label: 'Tailored Solutions', sub: 'Customised to your unique goals' },
  { label: 'Expert Team', sub: 'Highly experienced educators and specialists' },
  { label: 'Holistic Approach', sub: 'Thriving students, teachers, and leaders' },
  { label: 'Proven Results', sub: 'Data-driven and measurable impact' },
];

const WhyUs = () => (
  <section className="whyus" id="why">
    <div className="whyus-left">
      <Reveal>
        <span className="label-eyebrow">Why Us</span>
        <h2 className="h2">The standard your<br/>school deserves.</h2>
        <p>
          We do not offer one-size-fits-all solutions. Every school has its own
          culture, needs, and ambitions. Our work is built around yours.
        </p>
        <div className="features-list">
          {FEATURES.map((f, i) => (
            <div className="feature-row" key={f.label}>
              <div className="feature-check"><Icon name="check" size={16} stroke={3} /></div>
              <div>
                <div className="feature-label">{f.label}</div>
                <div className="feature-sub">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
    <div className="whyus-right">
      <Reveal delay={200}>
        <div className="quote-card">
          <div className="quote-mark">"</div>
          <blockquote>
            When a teacher grows, a school transforms. When a school improves,
            an entire community thrives.
          </blockquote>
          <div className="quote-rule" />
          <cite>RealMindX Education</cite>
        </div>
      </Reveal>
    </div>
  </section>
);

// ====================== Testimonials ======================
const TESTIMONIALS = [
  { quote: 'RealMindX transformed our school\'s teacher recruitment.', name: 'Mr. James', role: 'Principal, Bright Minds School' },
  { quote: 'Our research projects have improved greatly through RealMindX CPD programs.', name: 'Mrs. Clara', role: 'Head of Research' },
  { quote: 'RealMindX made teacher development enjoyable.', name: 'Mr. Daniel', role: 'Training Coordinator' },
  { quote: 'We recruited the best teachers easily through their platform.', name: 'Mrs. Grace', role: 'Principal, Elite High School' },
];

const initials = (name) => name.replace(/(Mr|Mrs|Ms|Dr)\.?\s*/i, '').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

const Testimonials = () => {
  const [idx, setIdx] = React.useState(0);
  const total = TESTIMONIALS.length;
  React.useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % total), 6000);
    return () => clearInterval(id);
  }, [total]);
  const go = (n) => setIdx((n + total) % total);
  const t = TESTIMONIALS[idx];
  return (
    <section className="testimonials">
      <div className="testimonials-watermark" aria-hidden="true">REALMINDX</div>
      <div className="testimonials-glow" aria-hidden="true" />

      <div className="testimonials-inner">
        <Reveal className="testimonials-head">
          <span className="label-eyebrow">Client Voices</span>
          <h2 className="h2">What schools are saying</h2>
        </Reveal>

        <div className="testimonial-card-wrap">
          <button className="arrow-btn prev" onClick={() => go(idx - 1)} aria-label="Previous testimonial">
            <Icon name="chevL" size={18} />
          </button>

          <div className="testimonial-card" key={idx}>
            <div className="testimonial-quote-badge" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor">
                <path d="M11 9c-3.5 0-6 2.5-6 6v8h8v-8H8c0-2 1-3 3-3V9zm12 0c-3.5 0-6 2.5-6 6v8h8v-8h-5c0-2 1-3 3-3V9z"/>
              </svg>
            </div>
            <blockquote className="testimonial-quote">{t.quote}</blockquote>
            <div className="testimonial-author">
              <div className="author-avatar" aria-hidden="true">{initials(t.name)}</div>
              <div className="author-text">
                <div className="author-name">{t.name}</div>
                <div className="author-role">{t.role}</div>
              </div>
            </div>
          </div>

          <button className="arrow-btn next" onClick={() => go(idx + 1)} aria-label="Next testimonial">
            <Icon name="chevR" size={18} />
          </button>
        </div>

        <div className="testimonial-controls">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              className={`dot-btn${i === idx ? ' active' : ''}`}
              onClick={() => go(i)}
              aria-label={`Go to testimonial ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

// ====================== Bookshop ======================
const Bookshop = () => (
  <section className="bookshop" id="bookshop">
    <div className="container">
      <div className="bookshop-grid">
        <Reveal>
          <div className="bookshop-img-wrap">
            <div
              className="bookshop-img"
              role="img"
              aria-label="Stationery and supplies on display at the RealMindX bookshop"
            />
          </div>
        </Reveal>
        <Reveal delay={200}>
          <div className="bookshop-text">
            <span className="label-eyebrow">RealMindX Bookshop</span>
            <h2 className="h2">All your stationery,<br/>at the right price.</h2>
            <p>Wholesale and retail prices. Deliveries to all locations. Pickups available.</p>
            <a className="btn btn-primary" href="/bookshop">Visit Our Bookshop <Icon name="arrow" size={16} /></a>
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

// ====================== SchoolMS ======================
const SchoolMS = () => (
  <section className="schoolms-showcase" id="schoolms">
    <div className="container schoolms-showcase-grid">
      <Reveal className="schoolms-showcase-copy">
        <span className="label-eyebrow">SchoolMS by RealMindX</span>
        <h2 className="h2">School management for every classroom.</h2>
        <p>
          Attendance, fees, report cards, parent updates, and daily school operations
          in one clean platform built for Ghanaian schools.
        </p>
        <div className="schoolms-showcase-actions">
          <a className="btn btn-primary" href="https://schoolms.realmindxgh.com/" target="_blank" rel="noreferrer">
            Visit SchoolMS <Icon name="arrow" size={16} />
          </a>
          <a className="btn btn-outline" href="/contact">
            Book a Demo
          </a>
        </div>
      </Reveal>
      <Reveal delay={160} className="schoolms-showcase-card">
        <div className="schoolms-app-mark">
          <Icon name="schoolms" size={42} stroke={1.7} />
          <div>
            <strong>SchoolMS</strong>
            <span>by RealMindX</span>
          </div>
        </div>
        <div className="schoolms-metric-grid">
          <div><strong>Fees</strong><span>Paystack-ready payments</span></div>
          <div><strong>Attendance</strong><span>Daily registers in minutes</span></div>
          <div><strong>Reports</strong><span>Clean end-of-term records</span></div>
          <div><strong>Parents</strong><span>Real-time updates</span></div>
        </div>
      </Reveal>
    </div>
  </section>
);

// ====================== Donate CTA ======================
const Donate = () => (
  <section className="donate" id="donate">
    <div className="donate-inner">
      <Reveal>
        <span className="label-eyebrow">Support Our Work</span>
        <h2 className="h2" style={{ marginTop: 16 }}>Help us make education possible for every child.</h2>
        <p>
          Your contribution funds teacher training, classroom resources, scholarship
          support and the everyday work of building stronger schools across Ghana.
        </p>
        <a className="btn btn-primary" href="/donate" style={{ padding: '16px 36px', fontSize: 15 }}>
          Donate Now <Icon name="arrow" size={16} />
        </a>
        <div className="donate-note">Every contribution makes a real difference.</div>
      </Reveal>
    </div>
  </section>
);

// ====================== Gallery preview ======================
const Gallery = () => {
  const galleryItems = usePublicGallery(6);
  const stripRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const setRef = React.useRef(null);
  const offsetRef = React.useRef(0);
  const loopWidthRef = React.useRef(0);
  const lastFrameRef = React.useRef(0);
  const pauseUntilRef = React.useRef(0);

  const applyTransform = React.useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
    }
  }, []);

  const wrapOffset = React.useCallback(() => {
    const loopWidth = loopWidthRef.current;
    if (!loopWidth) return;
    offsetRef.current = ((offsetRef.current % loopWidth) + loopWidth) % loopWidth;
  }, []);

  const measureLoop = React.useCallback(() => {
    loopWidthRef.current = setRef.current?.scrollWidth || 0;
    wrapOffset();
    applyTransform();
  }, [applyTransform, wrapOffset]);

  const scrollGallery = React.useCallback((direction = 1) => {
    measureLoop();
    const firstCard = setRef.current?.querySelector('.gallery-card');
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width + 22 : 340;
    const start = offsetRef.current;
    const target = start + direction * cardWidth;
    const duration = 360;
    const startTime = performance.now();
    pauseUntilRef.current = Date.now() + duration + 260;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const animate = now => {
      const t = Math.min(1, (now - startTime) / duration);
      offsetRef.current = start + (target - start) * easeOut(t);
      wrapOffset();
      applyTransform();
      if (t < 1) window.requestAnimationFrame(animate);
    };
    window.requestAnimationFrame(animate);
  }, [applyTransform, measureLoop, wrapOffset]);

  React.useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !trackRef.current || galleryItems.length <= 1) return undefined;
    measureLoop();
    let frame = 0;
    const handleResize = () => measureLoop();
    window.addEventListener('resize', handleResize);

    const animate = timestamp => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = Math.min(80, timestamp - lastFrameRef.current);
      lastFrameRef.current = timestamp;
      const isPaused = strip.matches(':hover') || strip.matches(':focus-within') || Date.now() < pauseUntilRef.current;
      if (!isPaused && loopWidthRef.current) {
        offsetRef.current += 32 * (delta / 1000);
        wrapOffset();
        applyTransform();
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      lastFrameRef.current = 0;
    };
  }, [applyTransform, galleryItems.length, measureLoop, wrapOffset]);

  return (
    <section className="gallery" id="gallery">
      <div className="container">
        <Reveal className="section-head section-head-light">
          <span className="label-eyebrow">From the field</span>
          <h2 className="h2">Moments from our work</h2>
          <p>A glimpse into the schools, teachers and students we serve every day.</p>
        </Reveal>
        <div className="gallery-marquee-controls" aria-label="Gallery strip controls">
          <button type="button" className="gallery-marquee-control" onClick={() => scrollGallery(-1)} aria-label="Scroll gallery backward">
            <Icon name="chevL" size={18} stroke={2.2} />
          </button>
          <button type="button" className="gallery-marquee-control" onClick={() => scrollGallery(1)} aria-label="Scroll gallery forward">
            <Icon name="chevR" size={18} stroke={2.2} />
          </button>
        </div>
        <div className="gallery-marquee" ref={stripRef} aria-label="Latest RealMindX gallery items">
          <div className="gallery-marquee-track" ref={trackRef}>
            <div className="gallery-marquee-set" ref={setRef}>
              {galleryItems.map((g, i) => (
                <a className="gallery-card" href={g.href || '/gallery'} key={g.id || i}>
                  <div className="gallery-img">
                    <img src={g.image} alt={g.caption} />
                    <span className="gallery-tag">{g.tag}</span>
                  </div>
                  <div className="gallery-caption">{g.caption}</div>
                </a>
              ))}
            </div>
            {galleryItems.length > 1 && (
              <div className="gallery-marquee-set" aria-hidden="true">
                {galleryItems.map((g, i) => (
                  <a className="gallery-card" href={g.href || '/gallery'} key={`${g.id || i}-dupe`} tabIndex={-1}>
                    <div className="gallery-img">
                      <img src={g.image} alt="" />
                      <span className="gallery-tag">{g.tag}</span>
                    </div>
                    <div className="gallery-caption">{g.caption}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        {galleryItems.length === 0 && (
          <div className="managed-empty gallery-empty">
            <h3>No gallery posts yet</h3>
            <p>Published admin gallery posts will appear here automatically.</p>
          </div>
        )}
        <Reveal className="services-cta" delay={200}>
          <a className="btn btn-primary" href="/gallery">View Full Gallery <Icon name="arrow" size={16} /></a>
        </Reveal>
      </div>
    </section>
  );
};

// ====================== News preview ======================
const News = () => {
  const newsItems = usePublicNews(3);
  const [activeNews, setActiveNews] = React.useState(null);

  const closeNews = () => setActiveNews(null);

  return (
    <section className="news" id="news">
      <div className="container">
        <Reveal className="section-head news-head">
          <div>
            <span className="label-eyebrow">Latest News</span>
            <h2 className="h2">Updates from RealMindX</h2>
          </div>
          <a className="news-head-link" href="/news">All news <Icon name="arrow" size={14} /></a>
        </Reveal>
        <div className="news-grid">
          {newsItems.map((n, i) => (
            <Reveal key={n.id || i} delay={i * 100}>
              <button className={`news-card n-${i}`} type="button" onClick={() => setActiveNews(n)}>
                <div className="news-img">
                  {n.img && <img src={n.img} alt={n.title} loading="lazy" />}
                  <span className="news-tag">{n.cat}</span>
                </div>
                <div className="news-body">
                  <div className="news-date">{n.date}</div>
                  <h3 className="news-title">{n.title}</h3>
                  <p className="news-excerpt">{n.excerpt}</p>
                  <span className="news-link">Read more <Icon name="arrow" size={15} /></span>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
      {activeNews && (
        <div className="site-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeNews(); }}>
          <article className="news-modal" role="dialog" aria-modal="true" aria-label={activeNews.title}>
            <button className="site-modal-close" type="button" onClick={closeNews} aria-label="Close news article">
              <Icon name="x" size={20} stroke={2} />
            </button>
            {activeNews.img && <img className="news-modal-hero" src={activeNews.img} alt={activeNews.title} />}
            <div className="news-modal-copy">
              <p className="overline">{activeNews.cat}{activeNews.date ? ` · ${activeNews.date}` : ''}</p>
              <h2>{activeNews.title}</h2>
              {activeNews.excerpt && <p className="news-modal-summary">{activeNews.excerpt}</p>}
              {String(activeNews.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
                <p key={`intro-${index}`}>{paragraph}</p>
              ))}
              {(activeNews.sections || []).map((section, index) => (
                <section className="news-modal-section" key={section.id || index}>
                  {section.heading && <h3>{section.heading}</h3>}
                  {section.image_url && (
                    <figure>
                      <img src={section.image_url} alt={section.caption || section.heading || activeNews.title} />
                      {section.caption && <figcaption>{section.caption}</figcaption>}
                    </figure>
                  )}
                  {String(section.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, paragraphIndex) => (
                    <p key={`section-${index}-${paragraphIndex}`}>{paragraph}</p>
                  ))}
                </section>
              ))}
              <a className="btn btn-primary" href={activeNews.href || '/news'}>Open News Page <Icon name="arrow" size={15} /></a>
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

// ====================== Partners ======================
const PartnerMark = ({ partner, compact = false }) => (
  <div className="partner-card" title={partner.name} aria-label={partner.name}>
    {partner.img ? (
      <img src={partner.img} alt={partner.name} loading="lazy" />
    ) : (
      <Icon name={partner.icon} size={compact ? 28 : 40} stroke={1.5} />
    )}
    <span className="partner-card-name">{partner.name}</span>
  </div>
);

const Partners = () => {
  const partners = usePublicPartners();
  const marqueePartners = partners.length > 5 ? [...partners, ...partners] : partners;

  return (
    <section className="partners" id="partners">
      <div className="container">
        <Reveal className="section-head">
          <span className="label-eyebrow">Our Partners</span>
          <h2 className="h2">Schools and organisations we work with</h2>
          <p>We collaborate with institutions across Ghana to deliver lasting impact.</p>
        </Reveal>
        {partners.length > 5 ? (
          <div className="partners-marquee" aria-label="Partner logos">
            <div className="partners-marquee-track">
              {marqueePartners.map((partner, index) => (
                <PartnerMark partner={partner} key={`${partner.id}-${index}`} />
              ))}
            </div>
          </div>
        ) : (
          <div className="partners-grid">
            {partners.map((partner, i) => (
              <Reveal key={partner.id} delay={(i % 6) * 60}>
                <PartnerMark partner={partner} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ====================== Footer ======================
const SocialIcon = ({ name }) => {
  const map = {
    x: <path d="M3 3h4.2l4.4 6.3L16.6 3H21l-7.4 9.8L21.5 21h-4.3l-5-7.1L6.4 21H2l8-10.4L3 3z" fill="currentColor"/>,
    facebook: <path d="M13 22v-9h3l.5-3.5H13V7.2c0-1 .3-1.7 1.8-1.7H17V2.3C16.6 2.2 15.3 2 13.9 2c-3 0-5 1.8-5 5v3H6v3.5h3V22h4z" fill="currentColor"/>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></>,
    youtube: <><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none"/></>,
    whatsapp: <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" fill="currentColor" stroke="none"/>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      {map[name]}
    </svg>
  );
};

export const Footer = () => (
  <footer className="footer main-footer" id="contact">
    <div className="container">
      <div className="footer-grid">
        <div>
          <a className="footer-logo" href="/" aria-label="RealMindX Education home">
            <img src={logoWhite} alt="RealMindX Education" />
          </a>
          <p className="footer-tag">
            Holistic learning, conveniently for every mind. Ghana's most
            comprehensive educational services provider.
          </p>
          <div className="socials">
            <a href="https://x.com/realmindxgh" target="_blank" rel="noopener" aria-label="X"><SocialIcon name="x" /></a>
            <a href="https://web.facebook.com/profile.php?id=61566941171883" target="_blank" rel="noopener" aria-label="Facebook"><SocialIcon name="facebook" /></a>
            <a href="https://www.instagram.com/realmindxgh/" target="_blank" rel="noopener" aria-label="Instagram"><SocialIcon name="instagram" /></a>
            <a href="https://www.youtube.com/@realmindxgh" target="_blank" rel="noopener" aria-label="YouTube"><SocialIcon name="youtube" /></a>
            <a href="https://wa.link/q5rjtp" target="_blank" rel="noopener" aria-label="WhatsApp"><SocialIcon name="whatsapp" /></a>
          </div>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div className="footer-links">
            <a href="/about">About</a>
            <a href="/services">Services</a>
            <a href="/jobs">Jobs</a>
            <a href="/news">News</a>
            <a href="/gallery">Gallery</a>
            <a href="/donate">Donate</a>
          </div>
        </div>
        <div>
          <h4>Contact</h4>
          <div className="footer-contact">
            <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="mapPin" size={18} />
              Dome Pillar 2, Accra, Ghana
            </span>
            <a href="mailto:info@realmindxgh.com" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="mail" size={18} /> info@realmindxgh.com
            </a>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="phone" size={18} /> +233 55 803 9190
            </span>
            <span style={{ marginLeft: 28, fontSize: 14 }}>+233 55 452 9493</span>
            <span style={{ marginLeft: 28, fontSize: 14 }}>+233 55 132 4729</span>
          </div>
        </div>
        <div>
          <h4>Legal</h4>
          <div className="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="https://schoolms.realmindxgh.com/">SchoolMS</a>
            <a href="/bookshop">Bookshop</a>
            <a href="/donate">Donate</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        &copy; {new Date().getFullYear()} RealMindX Education Limited. All rights reserved.
      </div>
    </div>
  </footer>
);

// ====================== App ======================
const App = () => (
  <div className="home-page">
    <Nav />
    <Hero />
    <Marquee items={SERVICE_MARQUEE} variant="gold" />
    <MissionStats />
    <Services />
    <Marquee items={IMPACT_MARQUEE} variant="navy" />
    <WhyUs />
    <Gallery />
    <News />
    <Testimonials />
    <Bookshop />
    <SchoolMS />
    <Donate />
    <Partners />
    <Footer />
  </div>
);

export default App;
