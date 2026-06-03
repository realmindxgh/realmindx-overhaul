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
import { usePublicGallery, usePublicNews, useSiteCopy } from './lib/siteContent.js';
import { API_BASE, api, isApiMode } from './lib/apiClient.js';

import BookshopApp from '../realmindx-bookshop/BookshopApp.jsx';
import DonatePage from '../realmindx-site/pages/DonatePage.jsx';
import { publicItems, useManagedContent } from './lib/managedContent.js';


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
  const managedNews = usePublicNews(40);
  const managedGallery = usePublicGallery(40);

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

  const source = isApiMode() && apiItems ? apiItems : (content[collection] || []);
  const rawItems = isApiMode() && apiItems ? source : publicItems(source);
  const items = collection === 'news'
    ? managedNews
    : collection === 'gallery'
      ? managedGallery
      : rawItems;
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
            {items.length === 0 ? (
              <div className="managed-empty">
                <h2>No Published Items</h2>
                <p>Fresh RealMindX content will appear here as it is published.</p>
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
  const allItems = usePublicNews(200);
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
            {allItems.length === 0 ? (
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
  ['About This Policy', 'This Privacy Policy explains how RealMindX Education Limited ("RealMindX", "we", "our", or "us") collects, uses, stores, and protects personal information when you use our website, job portal, bookshop, and related services. By using our platform you agree to the practices described here. If you do not agree, please do not use our services.'],
  ['Information We Collect', 'We collect information you provide directly — such as your name, email address, phone number, location, and professional details when you create an account, apply for a job, place a bookshop order, or contact us. We also collect profile files you upload (CVs, certificates, profile pictures), job alert preferences, and newsletter subscriptions. When you visit our site, our servers automatically log your IP address, browser type, pages visited, and referring URL for security and analytics purposes.'],
  ['How We Use Your Information', 'We use your information to: create and manage your account; match you with relevant teaching job posts and send job alerts; process bookshop orders and arrange delivery or pickup; respond to enquiries and support requests; send transactional emails (order confirmations, verification codes, password resets); send newsletters you have subscribed to; improve our platform and services; detect and prevent fraud; and comply with legal obligations.'],
  ['Information Sharing', 'We do not sell your personal information to third parties. We share information only where necessary: with school partners to facilitate job placements (with your consent when you apply); with payment processors (Paystack) to securely process bookshop orders; with email delivery providers (Resend) to send transactional and marketing emails; and with hosting and infrastructure providers who operate under confidentiality agreements. We may also disclose information where required by Ghanaian law or a court order.'],
  ['Data Storage and Security', 'Your data is stored on secured servers. We use role-based access controls, encrypted passwords, HTTPS, and audit logging to protect your information. Uploaded documents (CVs, certificates) are stored as protected files accessible only to you and authorised staff. We retain your data for as long as your account is active or as required by law. You may request deletion of your account and data by contacting us at info@realmindxgh.com.'],
  ['Your Rights', 'You have the right to: access the personal information we hold about you; correct inaccurate information; request deletion of your account and data; withdraw consent for marketing communications (unsubscribe at any time); and lodge a complaint with the relevant data protection authority. To exercise these rights, contact us at info@realmindxgh.com.'],
  ['Cookies', 'We use session cookies to keep you signed in and to maintain CSRF protection. We do not use tracking cookies or third-party advertising cookies without your consent. You can disable cookies in your browser settings, though some features may not function correctly without them.'],
  ['Children', 'Our platform is intended for users aged 18 and over. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us immediately.'],
  ['Changes to This Policy', 'We may update this Privacy Policy periodically. We will post the revised version on this page with an updated effective date. Continued use of our services after changes constitutes acceptance of the revised policy. For significant changes, we will notify registered users by email.'],
  ['Contact Us', 'For any privacy-related questions or requests, please contact us at: privacy@realmindxgh.com — or by post: RealMindX Education Limited, Dome Pillar 2, Accra, Ghana.'],
];

const TERMS_SECTIONS = [
  ['Agreement', 'These Terms of Service govern your use of the RealMindX Education Limited ("RealMindX") website, job portal, user portal, bookshop, and related services ("the Platform"). By accessing or using the Platform, you agree to be bound by these terms. If you do not agree, do not use the Platform.'],
  ['Eligibility', 'You must be at least 18 years old to create an account. By registering, you confirm that you are 18 or over and that the information you provide is accurate and complete. RealMindX reserves the right to suspend or terminate accounts that violate these terms or provide false information.'],
  ['Account Responsibilities', 'You are responsible for keeping your login credentials secure. You must not share your account or allow others to access it. You are responsible for all activity that occurs under your account. Notify us immediately at info@realmindxgh.com if you suspect unauthorised access.'],
  ['Job Portal', 'The job portal connects teachers with schools across Ghana. Job listings are published in good faith by RealMindX or partner schools. Applying for a job through the Platform does not guarantee an interview, offer, or placement. RealMindX facilitates the process but is not a party to any employment contract between a teacher and a school. You must ensure that all information in your profile and applications is truthful and up to date.'],
  ['Bookshop', 'Bookshop orders are requests subject to stock availability. Placing an order does not constitute a binding contract until RealMindX confirms availability and accepts payment. Prices are stated in Ghanaian Cedis (GH₵) and are subject to change without notice. Delivery fees are calculated at checkout based on your location. Customers are responsible for ensuring delivery details are accurate. Our return policy allows unused items in original condition to be returned within 7 days for exchange or store credit.'],
  ['Intellectual Property', 'All content on the Platform — including text, images, logos, product descriptions, and code — is the property of RealMindX Education Limited or its licensors and is protected by Ghanaian and international copyright law. You may not reproduce, distribute, or create derivative works from Platform content without express written permission.'],
  ['Prohibited Conduct', 'You must not: use the Platform for any unlawful purpose; upload malicious content or attempt to compromise system security; impersonate another person or entity; harvest other users\' personal data; submit false information or fraudulent orders; use automated tools to scrape or overload the Platform; or interfere with other users\' access to the Platform.'],
  ['Limitation of Liability', 'RealMindX provides the Platform "as is" and makes no warranties regarding uptime, accuracy, or fitness for a particular purpose. To the fullest extent permitted by Ghanaian law, RealMindX shall not be liable for indirect, incidental, or consequential damages arising from your use of the Platform, including but not limited to loss of employment opportunity, loss of data, or loss of income.'],
  ['Termination', 'RealMindX reserves the right to suspend or terminate your account at any time if you violate these Terms or engage in conduct harmful to the Platform, other users, or RealMindX. You may close your account at any time by contacting info@realmindxgh.com.'],
  ['Governing Law', 'These Terms are governed by the laws of the Republic of Ghana. Any disputes arising from these Terms or your use of the Platform shall be subject to the exclusive jurisdiction of the courts of Ghana.'],
  ['Changes to Terms', 'We may update these Terms periodically. Continued use of the Platform after changes are posted constitutes acceptance. We will notify registered users of significant changes by email.'],
  ['Contact', 'Questions about these Terms? Contact us at: legal@realmindxgh.com — or: RealMindX Education Limited, Dome Pillar 2, Accra, Ghana.'],
];

const LegalPage = ({ type }) => {
  const copy = useSiteCopy();
  const privacy = type === 'privacy';
  const title = privacy ? 'Privacy Policy' : 'Terms of Service';
  const managedBody = privacy ? copy.privacy_body : copy.terms_body;
  const body = privacy
    ? 'How RealMindX Education Limited collects, uses, and protects your personal information.'
    : 'The terms governing your use of the RealMindX platform, job portal, and services.';
  const defaultSections = privacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <SiteInfoPage
      activePage=""
      eyebrow="RealMindX Legal"
      title={title}
      body={body}
      actions={[{ label: 'Contact Us', href: '/contact' }, { label: 'Back to Homepage', href: '/', variant: 'btn-outline' }]}
    >
      <div className="site-info-copy">
        <p className="site-info-date">Effective date: 2 June 2026 · RealMindX Education Limited, Ghana</p>
        {managedBody
          ? String(managedBody).split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
          : defaultSections.map(([heading, text]) => (
            <section key={heading}>
              <h2>{heading}</h2>
              <p>{text}</p>
            </section>
          ))}
      </div>
    </SiteInfoPage>
  );
};

// DonatePage is a full dedicated page imported from realmindx-site/pages/DonatePage.jsx

const NotFoundPage = () => (
  <SiteInfoPage
    eyebrow="404"
    title="Page Not Found"
    body="That address is not part of the current RealMindX route map."
    actions={[{ label: 'Go Home', href: '/' }, { label: 'View Bookshop', href: '/bookshop', variant: 'btn-outline' }]}
  />
);

const RegisterRoute = () => <UserLoginPage initialMode="register" />;

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

const AppRoutes = () => (
  <BrowserRouter>
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
        <Route path="/portal" element={<UserPortalPage />} />

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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRoutes />
  </React.StrictMode>,
);
