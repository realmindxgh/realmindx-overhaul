import React from 'react';
import { Icon } from '../assets/components.jsx';
import logoWhite from '../assets/logo-white.png';
import { getDemoSession } from '../../src/lib/demoAccounts.js';
import { signOut, syncSessionFromApi } from '../../src/lib/authClient.js';
import { dashboardPathForRole } from '../../src/lib/sessionRoutes.js';
import { isApiMode } from '../../src/lib/apiClient.js';
import toast from '../../src/lib/toast.js';
import { servicePath } from '../../src/lib/seoRoutes.js';
import { usePublicServices, usePublicSettings } from '../../src/lib/siteContent.js';

const SERVICE_NAV_ITEMS = [
  ['Teacher Recruitment', 'teacher-recruitment'],
  ['Teacher Development', 'teacher-development'],
  ['School Structuring', 'school-structuring'],
  ['After-School Tutoring', 'tutoring'],
  ['Research & Assignments', 'research'],
  ['Secretarial Services', 'secretarial'],
  ['Special Education', 'special-education'],
  ['Educational Consulting', 'consulting'],
  ['Extracurricular Offers', 'extracurricular'],
  ['Home Schooling Support', 'home-schooling'],
  ['SchoolMS', 'schoolms'],
].map(([label, slug]) => ({ label, href: servicePath(slug) }));

const ABOUT_NAV_ITEMS = [
  ['Who We Are', 'who'], ['Our Mission', 'mission'], ['Our Vision', 'vision'],
  ['Our Goals', 'goals'], ['Why Choose Us', 'choose-realmindx'], ['Our Leadership Team', 'leadership'],
].map(([label, id]) => ({ label, href: `/about#${id}` }));

const JOB_NAV_ITEMS_GUEST = [
  { label: 'Sign Up', href: '/register' },
  { label: 'Login', href: '/login' },
  { label: 'Job Posts', href: '/jobs' },
];

const JOB_NAV_ITEMS_AUTH = [
  { label: 'Job Posts', href: '/jobs' },
  { label: 'My Applications', href: '/portal?view=applications' },
  { label: 'My Portal', href: '/portal' },
];

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about', children: ABOUT_NAV_ITEMS },
  { label: 'Services', href: '/services', children: SERVICE_NAV_ITEMS },
  { label: 'Bookshop', href: 'https://bookshop.realmindxgh.com' },
  { label: 'News', href: '/news' },
  { label: 'Jobs', href: '/jobs', children: JOB_NAV_ITEMS_GUEST },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Contact', href: '/contact' },
];

const pageKeyFromHref = (href = '/') => href === '/'
  ? 'home'
  : href.replace(/^\//, '').split(/[?#/]/)[0] || 'home';

const currentPageKey = () => typeof window === 'undefined'
  ? 'home'
  : pageKeyFromHref(window.location.pathname);

const NavUserPill = () => {
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(fresh => { if (alive) setSession(fresh); });
    const refresh = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      alive = false;
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  React.useEffect(() => {
    const close = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  if (!session) return null;
  const initials = session.initials || `${session.firstName?.[0] || ''}${session.lastName?.[0] || ''}`.toUpperCase();
  const internal = ['admin', 'staff'].includes(session.role);
  const dashboardHref = internal ? dashboardPathForRole(session.role) : '/portal';
  const handleSignOut = async event => {
    event.stopPropagation();
    await signOut();
    setSession(null);
    setOpen(false);
    toast.success("You've been signed out.");
  };
  return (
    <div ref={ref} className={`nav-user-pill${open ? ' open' : ''}`} onClick={() => setOpen(value => !value)} role="button" aria-haspopup="true" aria-expanded={open}>
      <div className="nav-user-pill-avatar">{session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}</div>
      <span className="nav-user-pill-name">{session.firstName}</span>
      <span className="nav-user-pill-caret" aria-hidden="true" />
      {open && <div className="nav-user-dropdown" onClick={event => event.stopPropagation()}>
        <div className="nav-user-dropdown-greeting">Signed in as<div className="nav-user-dropdown-name">{session.firstName} {session.lastName}</div></div>
        <div className="nav-user-dropdown-divider" />
        <a href={dashboardHref} className="nav-user-menu-item"><span className="menu-icon"><Icon name="grid" size={15} stroke={2} /></span>{internal ? 'Go to Admin Dashboard' : 'Go to Dashboard'}</a>
        <a href="/jobs" className="nav-user-menu-item"><span className="menu-icon"><Icon name="briefcase" size={15} stroke={2} /></span>View Job Posts</a>
        <div className="nav-user-dropdown-divider" />
        <button className="nav-user-menu-item danger" onClick={handleSignOut}><span className="menu-icon"><Icon name="logout" size={15} stroke={2.2} /></span>Sign Out</button>
      </div>}
    </div>
  );
};

export const Nav = ({ activePage, solid = false }) => {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [activeDropdown, setActiveDropdown] = React.useState(null);
  const [mobileDropdown, setMobileDropdown] = React.useState(null);
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  const services = usePublicServices();
  const currentPage = activePage || currentPageKey();
  const items = React.useMemo(() => NAV_ITEMS.map(item => {
    if (item.label === 'Services') return { ...item, children: services.length ? services.map(service => ({ label: service.label, href: servicePath(service.id) })) : SERVICE_NAV_ITEMS };
    if (item.label === 'Jobs') return { ...item, children: session?.role ? JOB_NAV_ITEMS_AUTH : JOB_NAV_ITEMS_GUEST };
    return item;
  }), [services, session?.role]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    const refresh = () => setSession(getDemoSession());
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    let alive = true;
    syncSessionFromApi().then(fresh => { if (alive) setSession(fresh); });
    return () => {
      alive = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) setMobileDropdown(null);
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  React.useEffect(() => {
    const outside = event => { if (!event.target.closest('.nav-dropdown')) setActiveDropdown(null); };
    const escape = event => { if (event.key === 'Escape') setActiveDropdown(null); };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const active = (item, index) => index === 0 ? currentPage === 'home' : currentPage === pageKeyFromHref(item.href);
  return <>
    <nav className={`nav main-nav${solid || scrolled ? ' scrolled' : ''}`}>
      <div className="nav-inner">
        <a className="nav-logo" href="/" aria-label="RealMindX Education home"><img src={logoWhite} alt="RealMindX Education" /></a>
        <div className="nav-links">
          {items.map((item, index) => item.children ? <div className={`nav-dropdown${activeDropdown === item.label ? ' open' : ''}${item.children.length > 6 ? ' nav-dropdown-long' : ''}`} key={item.label}>
            <button className={`nav-link nav-dropdown-trigger${active(item, index) ? ' active' : ''}`} type="button" aria-haspopup="true" aria-expanded={activeDropdown === item.label} onClick={() => setActiveDropdown(activeDropdown === item.label ? null : item.label)}>{item.label}<span className="nav-caret" aria-hidden="true" /></button>
            <div className="nav-dropdown-menu" role="menu" aria-label={`${item.label} menu`}>{item.children.map(child => <a key={child.label} className="nav-dropdown-item" href={child.href} role="menuitem">{child.label}</a>)}</div>
          </div> : <a key={item.label} className={`nav-link${active(item, index) ? ' active' : ''}`} href={item.href}>{item.label}</a>)}
          <a className="btn btn-primary nav-cta" href="/donate">Donate</a><NavUserPill />
        </div>
        <button className={`hamburger${open ? ' open' : ''}`} onClick={() => setOpen(value => !value)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}><span/><span/><span/></button>
      </div>
    </nav>
    <div className={`mobile-menu${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
      {items.map(item => !item.children ? <a key={item.label} href={item.href}>{item.label}</a> : <div className={`mobile-dropdown${mobileDropdown === item.label ? ' open' : ''}`} key={item.label} onClick={event => event.stopPropagation()}>
        <button className="mobile-menu-link mobile-dropdown-trigger" type="button" aria-expanded={mobileDropdown === item.label} onClick={() => setMobileDropdown(mobileDropdown === item.label ? null : item.label)}>{item.label}<span className="nav-caret" aria-hidden="true" /></button>
        <div className="mobile-dropdown-menu" role="menu">{item.children.map(child => <a key={child.label} href={child.href} role="menuitem" onClick={() => setOpen(false)}>{child.label}</a>)}</div>
      </div>)}
      <a className="btn btn-primary mobile-menu-cta" href="/donate">Donate</a>
    </div>
  </>;
};

const SocialIcon = ({ name }) => {
  const paths = {
    x: <path d="M3 3h4.2l4.4 6.3L16.6 3H21l-7.4 9.8L21.5 21h-4.3l-5-7.1L6.4 21H2l8-10.4L3 3z" fill="currentColor"/>,
    facebook: <path d="M13 22v-9h3l.5-3.5H13V7.2c0-1 .3-1.7 1.8-1.7H17V2.3C16.6 2.2 15.3 2 13.9 2c-3 0-5 1.8-5 5v3H6v3.5h3V22h4z" fill="currentColor"/>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></>,
    youtube: <><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none"/></>,
    whatsapp: <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.7 14.2c-.2.6-1.2 1.1-1.7 1.2-.5.1-1.1.2-3.6-.8-3-1.2-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1 0-1.5.8-2.2 1.1-2.5.3-.3.6-.4.9-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.8 2.1 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.3.7-.2l2 .9c.3.1.5.2.6.4.1.1.1.7-.1 1.3Z" fill="currentColor" stroke="none"/>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{paths[name]}</svg>;
};

export const Footer = () => {
  const settings = usePublicSettings();
  const phones = [settings.contact_phone_2, settings.contact_phone_3].filter(Boolean);
  return <footer className="footer main-footer" id="contact"><div className="container">
    <div className="footer-grid">
      <div><a className="footer-logo" href="/" aria-label="RealMindX Education home"><img src={logoWhite} alt="RealMindX Education" /></a><p className="footer-tag">Holistic learning, conveniently for every mind. Ghana's most comprehensive educational services provider.</p>
        <div className="socials">{[
          ['x', 'https://x.com/realmindxgh'], ['facebook', 'https://web.facebook.com/profile.php?id=61566941171883'],
          ['instagram', 'https://www.instagram.com/realmindxgh/'], ['youtube', 'https://www.youtube.com/@realmindxgh'], ['whatsapp', 'https://wa.link/q5rjtp'],
        ].map(([name, href]) => <a key={name} href={href} target="_blank" rel="noopener" aria-label={name}><SocialIcon name={name} /></a>)}</div>
      </div>
      <div><h4>Quick Links</h4><div className="footer-links">{[['About','/about'],['Services','/services'],['Jobs','/jobs'],['News','/news'],['Gallery','/gallery'],['Donate','/donate']].map(([label, href]) => <a key={href} href={href}>{label}</a>)}</div></div>
      <div><h4>Contact</h4><div className="footer-contact">
        {settings.contact_address ? <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Icon name="mapPin" size={18} />{settings.contact_address}</span> : null}
        {settings.contact_email ? <a href={`mailto:${settings.contact_email}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="mail" size={18} />{settings.contact_email}</a> : null}
        {settings.contact_phone_1 ? <a href={`tel:${String(settings.contact_phone_1).replace(/\s+/g, '')}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Icon name="phone" size={18} />{settings.contact_phone_1}</a> : null}
        {phones.map(phone => <a key={phone} href={`tel:${String(phone).replace(/\s+/g, '')}`} style={{ marginLeft: 28, fontSize: 14 }}>{phone}</a>)}
      </div></div>
      <div><h4>Legal</h4><div className="footer-links"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="https://schoolms.realmindxgh.com/">SchoolMS</a><a href="https://bookshop.realmindxgh.com">Bookshop</a><a href="/donate">Donate</a></div></div>
    </div>
    <div className="footer-bottom">&copy; {new Date().getFullYear()} RealMindX Education Limited. All rights reserved.</div>
  </div></footer>;
};
