import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import '../realmindx-site/assets/styles.css';
import '../realmindx-site/styles/pages.css';
import '../realmindx-bookshop/styles/bookshop.css';
import './route-fixes.css';

import HomePage from '../realmindx-site/assets/app.jsx';
import AboutPage from '../realmindx-site/pages/AboutPage.jsx';
import ServicesPage from '../realmindx-site/pages/ServicesPage.jsx';
import ContactPage from '../realmindx-site/pages/ContactPage.jsx';
import JobsPage from '../realmindx-site/pages/JobsPage.jsx';
import UserPortalPage from '../realmindx-site/pages/UserPortalPage.jsx';
import AdminPortalPage from '../realmindx-site/pages/AdminPortalPage.jsx';
import { AdminLoginPage, UserLoginPage } from '../realmindx-site/pages/AuthPages.jsx';
import { Nav, Footer } from '../realmindx-site/components/NavFooter.jsx';
import { Icon } from '../realmindx-site/assets/components.jsx';
import { usePublicGalleryState, usePublicNewsState, useSiteCopy } from './lib/siteContent.js';
import { API_BASE, api, isApiMode } from './lib/apiClient.js';

import BookshopApp from '../realmindx-bookshop/BookshopApp.jsx';
import DonatePage from '../realmindx-site/pages/DonatePage.jsx';
import { publicItems, useManagedContent } from './lib/managedContent.js';
import { useIdleTimeout } from './lib/useIdleTimeout.js';
import { IdleWarning } from './lib/IdleWarning.jsx';
import { getDemoSession } from './lib/demoAccounts.js';
import { signOut, syncSessionFromApi } from './lib/authClient.js';


const SiteInfoPage = ({ activePage = '', eyebrow = 'RealMindX', title, body, actions = [], cards = [], children }) => (
  <>
    <Nav activePage={activePage} />
    <main className="route-page">
      <section className="page-hero route-page-hero">
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <p className="overline">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{body}</p>
          <div className="route-page-actions">
            {actions.map((action) => (
              <a key={action.href} className={`btn ${action.variant || 'btn-primary'}`} href={action.href}>
                {action.label}
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="site-info-section">
        <div className="container">
          {children}
          {cards.length > 0 && (
            <div className="site-info-grid">
              {cards.map(card => (
                <article className="site-info-card" key={card.title}>
                  <div className="site-info-icon"><Icon name={card.icon || 'check'} size={22} /></div>
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
    <Footer />
  </>
);

const SiteCollectionPage = ({ activePage = '', collection, title, body }) => {
  const content = useManagedContent();
  const [apiItems, setApiItems] = React.useState(null);
  const managedNews = usePublicNewsState(40);
  const managedGallery = usePublicGalleryState(40);

  React.useEffect(() => {
    if (!isApiMode() || collection === 'news' || collection === 'gallery') return;
    let alive = true;
    const loaders = {
      resources: api.fetchResources,
    };
    const load = loaders[collection];
    if (!load) return;
    load()
      .then(data => { if (alive) setApiItems(data.items || []); })
      .catch(() => { if (alive) setApiItems([]); });
    return () => { alive = false; };
  }, [collection]);

  const source = isApiMode() ? (apiItems ?? []) : (content[collection] || []);
  const rawItems = isApiMode() ? source : publicItems(source);
  const itemsState = collection === 'news'
    ? managedNews
    : collection === 'gallery'
      ? managedGallery
      : { items: rawItems, loading: isApiMode() && apiItems === null };
  const items = itemsState.items;
  const emptyTitle = collection === 'news'
    ? 'No Published News Yet'
    : collection === 'gallery'
      ? 'No Gallery Images Yet'
      : 'No Published Items';
  const emptyBody = collection === 'news'
    ? 'Fresh RealMindX updates will appear here when they are published.'
    : collection === 'gallery'
      ? 'RealMindX gallery moments will appear here when they are published.'
      : 'Fresh RealMindX content will appear here as it is published.';
  const publicAssetUrl = value => {
    if (!value || !String(value).startsWith('/uploads/')) return value;
    try {
      return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
    } catch {
      return value;
    }
  };

  return (
    <>
      <Nav activePage={activePage} />
      <main className="route-page">
        <section className="page-hero route-page-hero">
          <div className="container" style={{ position: 'relative', zIndex: 1 }}>
            <p className="overline">RealMindX</p>
            <h1>{title}</h1>
            <p>{body}</p>
          </div>
        </section>
        <section className="managed-public-section">
          <div className="container">
            {itemsState.loading ? (
              <div className="managed-empty">
                <h2>Loading Published Content</h2>
                <p>Checking the latest RealMindX updates.</p>
              </div>
            ) : items.length === 0 ? (
              <div className="managed-empty">
                <h2>{emptyTitle}</h2>
                <p>{emptyBody}</p>
              </div>
            ) : (
              <div className="managed-card-grid">
                {items.map(item => {
                  const anchorId = collection === 'news'
                    ? `post-${item.slug || item.id}`
                    : collection === 'gallery'
                      ? `gallery-${item.id}`
                      : `${collection}-${item.id}`;
                  return (
                  <article key={item.id} id={anchorId} className="managed-card" tabIndex={-1}>
                    {(item.image_url || item.image || item.img) && <img src={publicAssetUrl(item.image_url || item.image || item.img)} alt={item.title || item.caption} />}
                    <p className="overline">{item.cat || item.tag || item.category || item.service || collection}</p>
                    <h2>{item.title || item.caption}</h2>
                    <p>{item.excerpt || item.summary || item.description || item.body || item.message}</p>
                    {(item.url || item.external_url) && <a className="btn btn-outline-navy btn-sm" href={item.url || item.external_url}>Open Resource</a>}
                  </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

const newsAssetUrl = value => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  try {
    return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
  } catch {
    return value;
  }
};

const NewsArticleBody = ({ item }) => {
  const sections = Array.isArray(item.sections) ? item.sections : [];
  const introParagraphs = String(item.body || item.excerpt || '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  return (
    <div className="news-article-body">
      {introParagraphs.map((paragraph, index) => <p key={`intro-${index}`}>{paragraph}</p>)}
      {sections.map((section, index) => (
        <section className="news-article-section" key={section.id || `${item.id}-section-${index}`}>
          {section.heading && <h3>{section.heading}</h3>}
          {newsAssetUrl(section.image_url) && (
            <figure>
              <img src={newsAssetUrl(section.image_url)} alt={section.caption || section.heading || item.title} />
              {section.caption && <figcaption>{section.caption}</figcaption>}
            </figure>
          )}
          {String(section.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, paragraphIndex) => (
            <p key={`section-${index}-p-${paragraphIndex}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
};

const NEWS_PER_PAGE = 15;

const NewsCard = ({ item, onClick }) => (
  <article className="news-card news-card-clickable" onClick={onClick} style={{ cursor:'pointer' }} tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
    {newsAssetUrl(item.img || item.image_url) && (
      <div className="news-card-img-wrap">
        <img src={newsAssetUrl(item.img || item.image_url)} alt={item.title} />
      </div>
    )}
    <div className="news-card-body">
      <p className="overline">{item.cat || 'Update'}{item.date ? ` · ${item.date}` : ''}</p>
      <h2 className="news-card-title">{item.title}</h2>
      <p className="news-card-excerpt">{item.excerpt || item.summary || ''}</p>
      <span className="news-card-read-more">Read more <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </div>
  </article>
);

const NewsPage = () => {
  const newsState = usePublicNewsState(200);
  const allItems = newsState.items;
  const [page, setPage] = React.useState(1);
  const [selectedSlug, setSelectedSlug] = React.useState(() => {
    // Support direct URL like /news#slug
    if (typeof window !== 'undefined' && window.location.hash) {
      return window.location.hash.replace('#', '').replace('post-', '');
    }
    return null;
  });

  const totalPages = Math.max(1, Math.ceil(allItems.length / NEWS_PER_PAGE));
  const paginated = allItems.slice((page - 1) * NEWS_PER_PAGE, page * NEWS_PER_PAGE);

  const openArticle = (item) => {
    setSelectedSlug(item.slug || String(item.id));
    window.scrollTo(0, 0);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/news#post-${item.slug || item.id}`);
    }
  };

  const closeArticle = () => {
    setSelectedSlug(null);
    window.scrollTo(0, 0);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/news');
    }
  };

  const selectedItem = selectedSlug
    ? allItems.find(i => (i.slug || String(i.id)) === selectedSlug)
    : null;

  // Single article view
  if (selectedItem) {
    return (
      <>
        <Nav activePage="news" />
        <main className="route-page">
          <article className="news-article-page">
            <div className="container" style={{ maxWidth: 860 }}>
              <div className="news-article-breadcrumb">
                <button onClick={closeArticle} className="btn btn-outline-navy btn-sm">← Back to News</button>
                <a href="/" className="btn btn-outline-navy btn-sm">Back to Homepage</a>
              </div>
              {newsAssetUrl(selectedItem.img || selectedItem.image_url) && (
                <img className="news-article-hero-img" src={newsAssetUrl(selectedItem.img || selectedItem.image_url)} alt={selectedItem.title} />
              )}
              <p className="overline" style={{ marginTop:28 }}>{selectedItem.cat || 'Update'}{selectedItem.date ? ` · ${selectedItem.date}` : ''}</p>
              <h1 className="news-article-title">{selectedItem.title}</h1>
              {selectedItem.excerpt && <p className="news-article-lead">{selectedItem.excerpt}</p>}
              <NewsArticleBody item={selectedItem} />
              <div className="news-article-footer-ctas">
                <button onClick={closeArticle} className="btn btn-primary">← Back to News</button>
                <a href="/" className="btn btn-outline-navy">Back to Homepage</a>
              </div>
            </div>
          </article>
        </main>
        <Footer />
      </>
    );
  }

  // News listing with pagination
  return (
    <>
      <Nav activePage="news" />
      <main className="route-page">
        <section className="page-hero route-page-hero">
          <div className="container" style={{ position: 'relative', zIndex: 1 }}>
            <p className="overline">RealMindX</p>
            <h1>News and Updates</h1>
            <p>Stories, announcements, and useful updates from RealMindX.</p>
          </div>
        </section>
        <section className="site-info-section">
          <div className="container">
            {newsState.loading ? (
              <div className="managed-empty">
                <h2>Loading News</h2>
                <p>Checking the latest published RealMindX updates.</p>
              </div>
            ) : allItems.length === 0 ? (
              <div className="managed-empty">
                <h2>No Published News Yet</h2>
                <p>Fresh RealMindX updates will appear here when they are published.</p>
              </div>
            ) : (
              <>
                <div className="news-card-grid">
                  {paginated.map(item => (
                    <NewsCard key={item.id} item={item} onClick={() => openArticle(item)} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="news-pagination">
                    <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0); }}>← Previous</button>
                    <span className="news-page-count">Page {page} of {totalPages}</span>
                    <button className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}>Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

const PRIVACY_SECTIONS = [
  ['Who We Are', 'RealMindX Education Limited operates the website at realmindxgh.com. We are an education company based in Ghana. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website. For questions about this policy, contact us at info@realmindxgh.com.'],
  ['Information We Collect', 'When you create an account we collect your name, email address, and password. When you apply for a job we collect your name, contact details, education history, employment history, and any supporting documents you upload. When you make a donation we collect your name, email, and payment reference. When you submit a contact form we collect your name, email, and message. When you subscribe to our newsletter we collect your email address. If you sign in using Google or Facebook, we receive your name and email address from those providers only. We do not receive your password or access your contacts or posts. When you visit our website we automatically collect your IP address, browser type, device information, pages visited, and time spent on pages through standard web server logs.'],
  ['How We Use Your Information', 'We use the information we collect to operate and maintain the website and its features, to create and manage your account, to respond to your enquiries and support requests, to process job applications and communicate about their status, to process and acknowledge donations, to send you the newsletter if you have subscribed, to send you service and account-related communications, to detect and prevent fraud and unauthorised access, to comply with legal obligations under Ghanaian law, and to improve our services based on how the website is used. We do not sell your personal information to any third party. We do not use your personal information for advertising purposes on third-party platforms.'],
  ['Who We Share Your Information With', 'We share information with trusted providers who help us operate the website. These include Resend for email delivery, Paystack for payment processing, Cloudflare for security and performance, and our hosting provider for server infrastructure. If you sign in with Google or Facebook, your use of those services is also subject to their respective privacy policies. We may disclose information if required by Ghanaian law, a court order, or a valid legal process. We will notify you of such requests where legally permitted. We do not share your information with any other party without your explicit consent.'],
  ['Job Application Data', 'Information submitted as part of a job application is used solely for evaluating your suitability for the role and communicating with you about your application. We retain application data for a period of twelve months after the application process concludes, after which it is permanently deleted unless you are offered and accept a position. We do not share application data with third parties except where a specific role is managed in partnership with another organisation, in which case we will inform you at the time of application.'],
  ['Donation Data', 'Payment processing for donations is handled entirely by Paystack. We do not store your card number or mobile money credentials. We retain a record of donation transactions including your name, email, amount, and Paystack reference for accounting and acknowledgement purposes. This data is retained for seven years in compliance with Ghanaian financial record-keeping requirements.'],
  ['Data Retention', 'We retain account data for as long as your account is active. If you close your account we retain a minimal record for twelve months to handle any outstanding queries before permanent deletion. We retain newsletter subscription records until you unsubscribe. Contact form submissions are retained for twelve months. Audit logs recording admin actions are retained for twenty-four months.'],
  ['Data Security', 'We implement appropriate technical and organisational measures to protect your personal information. These include encrypted HTTPS connections for all data in transit, HTTP-only session cookies with SameSite protection, hashed passwords using industry-standard algorithms, role-based access controls limiting who within RealMindX can access different categories of data, and rate limiting to prevent brute-force attacks. In the event of a data breach that affects your personal information, we will notify you and relevant authorities as required by applicable Ghanaian law.'],
  ['Your Rights', 'You have the right to request access to the personal information we hold about you. You have the right to request correction of inaccurate information. You have the right to request deletion of your information subject to our legal obligations. You have the right to withdraw consent for communications such as the newsletter at any time. You have the right to request a copy of your data in a portable format. To exercise any of these rights, contact us at info@realmindxgh.com. We will respond within thirty days.'],
  ['Cookies and Local Storage', 'We use session cookies to maintain your login state. We do not use third-party advertising cookies. We do not use tracking pixels. You may disable cookies in your browser settings but doing so will prevent you from remaining logged in.'],
  ["Children's Privacy", 'Our website is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, contact us at info@realmindxgh.com and we will delete it promptly.'],
  ['Changes to This Policy', 'We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. We will notify registered users of significant changes by email.'],
  ['Contact', 'RealMindX Education Limited, Dome Pillar 2, Accra, Ghana. Email: info@realmindxgh.com. Website: realmindxgh.com.'],
];

const TERMS_SECTIONS = [
  ['Agreement to These Terms', 'By accessing or using the RealMindX Education Limited website at realmindxgh.com, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the website. These terms apply to all visitors, registered users, job applicants, donors, and anyone who interacts with our services through this website. RealMindX Education Limited is a company registered in Ghana. References to "we", "us", or "RealMindX" in these terms refer to RealMindX Education Limited.'],
  ['About RealMindX', 'RealMindX Education Limited is an education company providing digital tools, platforms, and services to support schools, teachers, students, and families across Ghana. Our website provides information about our services, career opportunities, donation options, news, and access to our various education technology products including SchoolMS.'],
  ['User Accounts', 'Some features of the website require you to create an account. You must provide accurate, current, and complete information when registering. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. New accounts require email verification via a one-time code sent to the email address you provide. You may register and sign in using your Google or Facebook account. You must notify us immediately at info@realmindxgh.com if you become aware of any unauthorised access to your account. We reserve the right to suspend or terminate accounts that violate these terms, contain inaccurate information, or are used for fraudulent purposes. You may close your account at any time by contacting us.'],
  ['Job Applications', 'Our website allows individuals to apply for positions at RealMindX Education Limited and partner schools. By submitting a job application you confirm that all information provided is truthful and accurate. We reserve the right to reject any application at our discretion. Submitting a fraudulent application may result in permanent disqualification from future opportunities. Application data is handled as described in our Privacy Policy. We do not guarantee employment to any applicant.'],
  ['Donations', 'RealMindX accepts voluntary donations to support our education initiatives. All donations are processed through Paystack. Donations are voluntary and non-refundable except where required by Ghanaian consumer protection law or where a payment error has occurred. Donations do not confer any ownership interest, voting rights, or financial return. We will use donations in support of our stated educational mission. If a payment is taken but the donation is not recorded, contact us immediately at info@realmindxgh.com with your payment reference.'],
  ['Services and Products', 'Information about our services and products on this website is provided for general information purposes. Service availability, features, and pricing may change. Detailed terms governing specific products such as SchoolMS are contained in the terms specific to those products.'],
  ['Contact Form and Communications', 'When you submit a message through our contact form, we will use the information you provide to respond to your enquiry. We may also use your email address to send you updates about RealMindX if you have opted in to communications. You may unsubscribe from marketing emails at any time using the unsubscribe link in any email we send.'],
  ['Newsletter', 'By subscribing to our newsletter you consent to receiving periodic updates about RealMindX news, products, and educational content. We will not share your email address with third parties for marketing purposes. You may unsubscribe at any time.'],
  ['Intellectual Property', 'All content on this website including text, images, logos, software, and design is the intellectual property of RealMindX Education Limited or its licensors. You may not reproduce, distribute, modify, or create derivative works from any content on this website without our prior written consent. The RealMindX name and logo are trademarks of RealMindX Education Limited.'],
  ['Disclaimer of Warranties', 'This website and all content, services, and features provided through it are offered on an as-is and as-available basis. To the fullest extent permitted by Ghanaian law, RealMindX makes no warranties, express or implied, regarding the accuracy, reliability, completeness, or fitness for purpose of any content or service on this website.'],
  ['Limitation of Liability', 'To the fullest extent permitted by applicable Ghanaian law, RealMindX Education Limited is not liable for any indirect, incidental, special, or consequential loss or damage arising from your use of this website or any services described on it. Our total liability in connection with this website shall not exceed the amount you paid to us in the three months preceding the relevant claim, or GHS 100 where no payment was made.'],
  ['Prohibited Conduct', 'You must not use this website to transmit harmful, abusive, defamatory, or illegal content. You must not attempt to gain unauthorised access to any part of the website or its underlying systems. You must not use automated tools to scrape or extract data from the website without our prior written consent. You must not impersonate any person or entity or misrepresent your affiliation with any organisation.'],
  ['Changes to These Terms', 'We may update these terms from time to time. Changes will be posted on this page with an updated effective date. Your continued use of the website after changes are posted constitutes acceptance of the updated terms. For significant changes we will provide notice to registered users by email.'],
  ['Governing Law', 'These terms are governed by the laws of Ghana. Any disputes arising from these terms or your use of this website shall be subject to the exclusive jurisdiction of the courts of Ghana.'],
  ['Contact', 'RealMindX Education Limited, info@realmindxgh.com, realmindxgh.com, Dome Pillar 2, Accra, Ghana.'],
];

// ── Shared Legal Page Layout (with sidebar table of contents) ──
const LegalPageLayout = ({ nav, children, eyebrow, title, body, effectiveDate }) => {
  const [active, setActive] = React.useState('');
  const sectionRefs = React.useRef({});

  React.useEffect(() => {
    window.scrollTo(0, 0);
    const handler = () => {
      const offset = 100;
      let found = '';
      for (const { id } of nav) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offset) found = id;
      }
      setActive(found || nav[0]?.id || '');
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [nav]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <>
      <Nav activePage="" />
      <main>
        <section className="page-hero route-page-hero">
          <div className="container" style={{ position: 'relative', zIndex: 1 }}>
            <p className="overline">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{body}</p>
            <p style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.7 }}>Effective {effectiveDate} · RealMindX Education Limited, Ghana</p>
          </div>
        </section>

        <section style={{ padding: '64px 0 96px' }}>
          <div className="container legal-policy-grid">

            {/* Sidebar TOC */}
            <aside className="legal-contents">
              <p>Contents</p>
              <nav>
                {nav.map(({ id, label }, i) => (
                  <button
                    key={id}
                    className={active === id ? 'active' : ''}
                    onClick={() => scrollTo(id)}
                  >
                    <span style={{ opacity: 0.45, marginRight: 6, fontSize: '0.75rem' }}>{String(i + 1).padStart(2, '0')}</span>
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <div>
              {children}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

const LegalSection = ({ id, number, title, children }) => (
  <section id={id} style={{ marginBottom: 48, scrollMarginTop: 100 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--gold)', letterSpacing: '1px', flexShrink: 0 }}>{String(number).padStart(2, '0')}</span>
      <h2 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2vw, 1.35rem)', fontWeight: 900, color: 'var(--navy)' }}>{title}</h2>
    </div>
    <div style={{ paddingLeft: 36, color: 'var(--gray-700, #374151)', lineHeight: 1.8, fontSize: '0.95rem' }}>
      {children}
    </div>
    <hr style={{ marginTop: 40, border: 'none', borderTop: '1px solid var(--border-light, #e5e7eb)' }} />
  </section>
);

const LegalPage = ({ type }) => {
  const privacy = type === 'privacy';
  const sections = privacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const nav = sections.map(([title], i) => ({
    id: `section-${i + 1}`,
    label: title,
  }));

  return (
    <LegalPageLayout
      nav={nav}
      eyebrow="RealMindX Legal"
      title={privacy ? 'Privacy Policy' : 'Terms of Service'}
      body={privacy
        ? 'How RealMindX Education Limited collects, uses, and protects your personal information.'
        : 'The terms governing your use of the RealMindX website, job portal, and related services.'}
      effectiveDate="3 June 2026"
    >
      {sections.map(([title, text], i) => (
        <LegalSection key={title} id={`section-${i + 1}`} number={i + 1} title={title}>
          {String(text).split('\n').filter(Boolean).map((para, j) => <p key={j} style={{ margin: '0 0 12px' }}>{para}</p>)}
        </LegalSection>
      ))}
    </LegalPageLayout>
  );
};

// DonatePage is a full dedicated page imported from realmindx-site/pages/DonatePage.jsx

const NotFoundPage = () => (
  <SiteInfoPage
    eyebrow="404"
    title="Page Not Found"
    body="That address is not part of the current RealMindX route map."
    actions={[{ label: 'Go Home', href: '/' }, { label: 'View Bookshop', href: 'https://bookshop.realmindxgh.com', variant: 'btn-outline' }]}
  />
);

const RegisterRoute = () => <UserLoginPage initialMode="register" />;

// ── Per-route meta (title + description + OG) ─────────────────
const BASE_URL = 'https://realmindxgh.com';
const DEFAULT_IMG = `${BASE_URL}/og-image.png`;

const PAGE_META = {
  '/': {
    title: "RealMindX Education | Ghana's Educational Services Provider",
    desc: "Ghana's most comprehensive educational services provider: teacher recruitment, CPD, school transformation, bookshop, tutoring and more. Serving schools across Accra and beyond.",
  },
  '/about': {
    title: 'About RealMindX Education | Ghana',
    desc: 'Learn about RealMindX Education Limited: our mission, vision, leadership team and commitment to transforming education across Ghana.',
  },
  '/services': {
    title: 'Educational Services | RealMindX Education Ghana',
    desc: 'Teacher recruitment, professional development, school structuring, after-school tutoring, special education, home schooling support and more. All in one place.',
  },
  '/jobs': {
    title: 'Teaching Jobs in Ghana | RealMindX Jobs Board',
    desc: 'Browse teaching vacancies across Ghana. Apply for Mathematics, English, Science, ICT and other teaching positions at schools throughout Accra and beyond.',
  },
  '/contact': {
    title: 'Contact RealMindX Education | Accra, Ghana',
    desc: 'Get in touch with RealMindX Education Limited. Visit us at Dome Pillar 2, Accra, or call +233 55 803 9190.',
  },
  '/news': {
    title: 'News and Updates | RealMindX Education',
    desc: 'Latest news, announcements and updates from RealMindX Education Limited in Ghana.',
  },
  '/gallery': {
    title: 'Gallery | RealMindX Education Ghana',
    desc: 'Photos from RealMindX school visits, teacher training programmes, community outreach and educational events across Ghana.',
  },
  '/donate': {
    title: 'Donate | Support Education in Ghana | RealMindX',
    desc: 'Support quality education in Ghana. Your donation helps fund learning materials, teacher development, special education support, and after-school tutoring programmes.',
  },
  '/terms':   { title: 'Terms of Service | RealMindX Education', desc: 'Terms governing your use of the RealMindX Education platform, job portal, and services.' },
  '/privacy': { title: 'Privacy Policy | RealMindX Education',   desc: 'How RealMindX Education Limited collects, uses, and protects your personal information.' },
  '/login':   { title: 'Sign In | RealMindX Education', desc: 'Sign in to your RealMindX teacher portal to apply for jobs, manage applications, and track your career.' },
  '/register':{ title: 'Create a Teacher Account | RealMindX', desc: 'Join thousands of teachers on the RealMindX platform. Create your profile, upload your CV, and apply for teaching positions across Ghana.' },
};

const setMeta = (name, content) => {
  let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(name.startsWith('og:') || name.startsWith('twitter:') ? 'property' : 'name', name); document.head.appendChild(el); }
  el.setAttribute('content', content);
};

const RouteTitle = () => {
  const location = useLocation();
  React.useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (path.startsWith('/bookshop')) return; // handled by BookshopApp
    if (path.startsWith('/admin')) { document.title = 'Admin | RealMindX'; return; }
    const meta = PAGE_META[path] || { title: 'RealMindX Education', desc: "Ghana's educational services provider: teacher recruitment, bookshop, CPD, school transformation and more." };
    document.title = meta.title;
    const url = `${BASE_URL}${path}`;
    setMeta('description', meta.desc);
    setMeta('og:title', meta.title);
    setMeta('og:description', meta.desc);
    setMeta('og:url', url);
    setMeta('og:image', DEFAULT_IMG);
    setMeta('twitter:title', meta.title);
    setMeta('twitter:description', meta.desc);
    // Canonical
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = url;
  }, [location.pathname]);
  return null;
};

const HashScroll = ({ children }) => {
  const location = useLocation();

  React.useEffect(() => {
    if (location.pathname === '/services') return;
    if (!location.hash) {
      window.scrollTo({ top: 0, left: 0 });
      return;
    }

    const id = window.decodeURIComponent(location.hash.slice(1));
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.pathname, location.hash]);

  return children;
};

const IdleGuard = () => {
  const location = useLocation();
  const session = getDemoSession();
  const isTeacherPortalSession = session?.role === 'user';
  const isBookshopRoute = location.pathname.startsWith('/bookshop');
  const { countdown, keepAlive } = useIdleTimeout({
    enabled: isTeacherPortalSession && !isBookshopRoute,
    onTimeout: async () => {
      await signOut();
      window.location.href = '/login?reason=idle';
    },
  });
  return (
    <IdleWarning
      countdown={countdown}
      onKeepAlive={keepAlive}
      onLogout={async () => { await signOut(); window.location.href = '/login'; }}
    />
  );
};

const SessionBridge = () => {
  const location = useLocation();
  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(() => {
      if (alive) window.dispatchEvent(new Event('rmx-session-sync'));
    });
    return () => { alive = false; };
  }, [location.pathname]);
  return null;
};

// If served from bookshop.realmindxgh.com, show only the bookshop
const isBookshopSubdomain =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('bookshop.');

const AppRoutes = () => {
  if (isBookshopSubdomain) return <BookshopApp />;
  return (
  <BrowserRouter>
    <RouteTitle />
    <SessionBridge />
    <IdleGuard />
    <HashScroll>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/login" element={<UserLoginPage />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
        {/* Legacy /user/* URLs that Google may still index — redirect client-side */}
        <Route path="/user/signup" element={<Navigate to="/register" replace />} />
        <Route path="/user/register" element={<Navigate to="/register" replace />} />
        <Route path="/user/login" element={<Navigate to="/login" replace />} />
        <Route path="/portal/*" element={<UserPortalPage />} />

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminPortalPage />} />
        <Route path="/admin/*" element={<AdminPortalPage />} />

        <Route path="/bookshop/*" element={<BookshopApp />} />

        <Route
          path="/news"
          element={<NewsPage />}
        />
        <Route
          path="/gallery"
          element={<SiteCollectionPage activePage="gallery" collection="gallery" title="Gallery" body="Images and moments from RealMindX programmes, school visits, and community work." />}
        />
        <Route
          path="/resources"
          element={<SiteCollectionPage collection="resources" title="Resources" body="Helpful guides, tools, and learning resources from the RealMindX team." />}
        />
        <Route
          path="/donate"
          element={<DonatePage />}
        />
        <Route
          path="/privacy"
          element={<LegalPage type="privacy" />}
        />
        <Route
          path="/terms"
          element={<LegalPage type="terms" />}
        />

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Routes>
    </HashScroll>
  </BrowserRouter>
  );
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRoutes />
  </React.StrictMode>,
);
