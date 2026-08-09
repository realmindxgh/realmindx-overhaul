import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import '../realmindx-site/assets/styles.css';
import '../realmindx-site/styles/pages.css';
import './route-fixes.css';

import { Nav, Footer } from '../realmindx-site/components/NavFooter.jsx';
import { Icon } from '../realmindx-site/assets/components.jsx';
import { usePublicGalleryState, usePublicNewsState, usePublicServices, usePublicServicesState, useSiteCopy, renderTextWithLinks } from './lib/siteContent.js';
import { API_BASE, api, isApiMode } from './lib/apiClient.js';
import { trackNewsServiceClick, trackPageView } from './lib/analytics.js';
import { setFavicons, setHeadLink, setHeadMeta, setStructuredData } from './lib/head.js';
import { newsPath, servicePath, SITE_BASE_URL, SITE_DEFAULT_IMAGE, slugify } from './lib/seoRoutes.js';

import { publicItems, useManagedContent } from './lib/managedContent.js';
import { useIdleTimeout } from './lib/useIdleTimeout.js';
import { IdleWarning } from './lib/IdleWarning.jsx';
import InstallAppPrompt, { isInstalledApp } from './lib/InstallAppPrompt.jsx';
import { getDemoSession } from './lib/demoAccounts.js';
import { signOut, syncSessionFromApi } from './lib/authClient.js';
import { loginPathForRole } from './lib/sessionRoutes.js';
import { flushQueuedToast, queueToast } from './lib/toast.js';

const HomePage = React.lazy(() => import('../realmindx-site/assets/app.jsx'));
const AboutPage = React.lazy(() => import('../realmindx-site/pages/AboutPage.jsx'));
const ServicesPage = React.lazy(() => import('../realmindx-site/pages/ServicesPage.jsx').then(module => ({ default: module.default })));
const ServiceDetailPage = React.lazy(() => import('../realmindx-site/pages/ServicesPage.jsx').then(module => ({ default: module.ServiceDetailPage })));
const ContactPage = React.lazy(() => import('../realmindx-site/pages/ContactPage.jsx'));
const JobsPage = React.lazy(() => import('../realmindx-site/pages/JobsPage.jsx'));
const UserPortalPage = React.lazy(() => import('../realmindx-site/pages/UserPortalPage.jsx'));
const AdminPortalPage = React.lazy(() => import('../realmindx-site/pages/AdminPortalPage.jsx'));
const DeliveryPortalPage = React.lazy(() => import('../realmindx-site/pages/DeliveryPortalPage.jsx'));
const UserLoginPage = React.lazy(() => import('../realmindx-site/pages/AuthPages.jsx').then(module => ({ default: module.UserLoginPage })));
const AdminLoginPage = React.lazy(() => import('../realmindx-site/pages/AuthPages.jsx').then(module => ({ default: module.AdminLoginPage })));
const StaffLoginPage = React.lazy(() => import('../realmindx-site/pages/AuthPages.jsx').then(module => ({ default: module.StaffLoginPage })));
const PasswordResetPage = React.lazy(() => import('../realmindx-site/pages/AuthPages.jsx').then(module => ({ default: module.PasswordResetPage })));
const BookshopApp = React.lazy(() => import('../realmindx-bookshop/BookshopApp.jsx'));
const DonatePage = React.lazy(() => import('../realmindx-site/pages/DonatePage.jsx'));

const RouteLoading = () => (
  <main className="route-page" aria-busy="true" aria-live="polite">
    <div className="container" style={{ padding: '96px 20px', textAlign: 'center' }}>Loading…</div>
  </main>
);


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

const serviceSlugFromHref = (href) => {
  if (!href || typeof window === 'undefined') return null;
  try {
    const url = new URL(href, window.location.origin);
    const path = (url.pathname || '').replace(/\/+$/, '');
    if (!path.startsWith('/services/')) return null;
    return path.split('/services/')[1] || null;
  } catch {
    return null;
  }
};

const internalRouteFromHref = (href) => {
  if (!href || typeof window === 'undefined') return null;
  try {
    const url = new URL(href, window.location.origin);
    const mainSiteHosts = new Set([
      window.location.hostname,
      'realmindxgh.com',
      'www.realmindxgh.com',
    ]);
    if (!mainSiteHosts.has(url.hostname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const NewsArticleBody = ({ item, onLinkClick }) => {
  const sections = Array.isArray(item.sections) ? item.sections : [];
  const introParagraphs = String(item.body || item.excerpt || '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  return (
    <div className="news-article-body" onClick={onLinkClick}>
      {introParagraphs.map((paragraph, index) => <p key={`intro-${index}`}>{renderTextWithLinks(paragraph)}</p>)}
      {sections.map((section, index) => {
        const imagePosition = section.image_position === 'auto'
          ? (index % 2 === 0 ? 'right' : 'left')
          : (section.image_position || 'right');
        const imageSize = section.image_size || 'medium';
        return (
          <section className="news-article-section" key={section.id || `${item.id}-section-${index}`}>
            {section.heading && <h3>{section.heading}</h3>}
            {newsAssetUrl(section.image_url) && (
              <figure className={`news-section-image position-${imagePosition} size-${imageSize}`}>
              <img src={newsAssetUrl(section.image_url)} alt={section.caption || section.heading || item.title} />
              {section.caption && <figcaption>{section.caption}</figcaption>}
              </figure>
            )}
            {String(section.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, paragraphIndex) => (
              <p key={`section-${index}-p-${paragraphIndex}`}>{renderTextWithLinks(paragraph)}</p>
            ))}
          </section>
        );
      })}
    </div>
  );
};

const NEWS_PER_PAGE = 15;

const NewsCard = ({ item }) => (
  <article className="news-card news-card-clickable">
    <Link to={newsPath(item)} className="news-card-link">
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
    </Link>
  </article>
);

const NewsPage = ({ articleSlug = null }) => {
  const newsState = usePublicNewsState(200);
  const navigate = useNavigate();
  const allItems = newsState.items;
  const [page, setPage] = React.useState(1);

  const totalPages = Math.max(1, Math.ceil(allItems.length / NEWS_PER_PAGE));
  const paginated = allItems.slice((page - 1) * NEWS_PER_PAGE, page * NEWS_PER_PAGE);

  const selectedItem = articleSlug
    ? allItems.find(i => slugify(i.slug || i.id) === slugify(articleSlug) || slugify(String(i.id)) === slugify(articleSlug))
    : null;
  const handleArticleLinkClick = React.useCallback((event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || !selectedItem?.id) return;
    const href = anchor.getAttribute('href');
    const serviceId = serviceSlugFromHref(href);
    if (serviceId) {
      trackNewsServiceClick({
        newsId: selectedItem.id,
        serviceId,
        path: newsPath(selectedItem),
        href,
        label: anchor.textContent?.trim() || 'Service link',
        source: 'news_article_body',
      });
    }
    const internalRoute = internalRouteFromHref(href);
    if (!internalRoute || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(internalRoute);
  }, [navigate, selectedItem]);
  const relatedItems = articleSlug && selectedItem
    ? allItems.filter(item => item.id !== selectedItem.id).slice(0, 3)
    : [];

  if (articleSlug && selectedItem && slugify(articleSlug) !== slugify(selectedItem.slug || selectedItem.id)) {
    return <Navigate to={newsPath(selectedItem)} replace />;
  }

  if (articleSlug && newsState.loading) {
    return (
      <>
        <Nav activePage="news" solid={true} />
        <main className="route-page">
          <section className="site-info-section">
            <div className="container">
              <div className="managed-empty">
                <h2>Loading Article</h2>
                <p>Checking the latest published RealMindX update.</p>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  // Single article view
  if (articleSlug && selectedItem) {
    return (
      <>
        <Nav activePage="news" solid={true} />
        <main className="route-page">
          <article className="news-article-page">
            <div className="container" style={{ maxWidth: 860 }}>
              <div className="news-article-metahead">
                <Link to="/news" className="news-article-backlink">Newsroom</Link>
                <span>/</span>
                <span>{selectedItem.cat || 'Update'}</span>
              </div>
              {newsAssetUrl(selectedItem.img || selectedItem.image_url) && (
                <img className="news-article-hero-img" src={newsAssetUrl(selectedItem.img || selectedItem.image_url)} alt={selectedItem.title} />
              )}
              <p className="overline" style={{ marginTop:28 }}>{selectedItem.cat || 'Update'}{selectedItem.date ? ` · ${selectedItem.date}` : ''}</p>
              <h1 className="news-article-title">{selectedItem.title}</h1>
              {selectedItem.excerpt && <p className="news-article-lead">{selectedItem.excerpt}</p>}
              <NewsArticleBody item={selectedItem} onLinkClick={handleArticleLinkClick} />
              <div className="news-article-footer-ctas">
                <Link to="/news" className="btn btn-primary">More News</Link>
                <Link to="/" className="btn btn-navy">Visit Homepage</Link>
              </div>
              {relatedItems.length > 0 && (
                <section className="news-article-related">
                  <div className="section-heading" style={{ marginBottom: 22 }}>
                    <p className="overline">Keep Reading</p>
                    <h2 className="section-title">More RealMindX News</h2>
                  </div>
                  <div className="news-card-grid news-card-grid-related">
                    {relatedItems.map(item => <NewsCard key={item.id} item={item} />)}
                  </div>
                </section>
              )}
            </div>
          </article>
        </main>
        <Footer />
      </>
    );
  }

  if (articleSlug && !selectedItem) {
    return (
      <>
        <Nav activePage="news" />
        <main className="route-page">
          <section className="page-hero route-page-hero">
            <div className="container" style={{ position: 'relative', zIndex: 1 }}>
              <p className="overline">RealMindX News</p>
              <h1>Article Not Found</h1>
              <p>That news link does not match a currently published RealMindX article.</p>
              <div className="btn-row" style={{ marginTop: 24 }}>
                <Link to="/news" className="btn btn-primary btn-lg">Browse News</Link>
                <Link to="/" className="btn btn-navy btn-lg">Back to Homepage</Link>
              </div>
            </div>
          </section>
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
                    <NewsCard key={item.id} item={item} />
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

const UnsubscribePage = () => {
  const [status, setStatus] = React.useState('loading');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('error');
      setMessage('No unsubscribe token found. Please use the link from your email.');
      return;
    }
    fetch(`${API_BASE}/public/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'You have been unsubscribed.');
        } else {
          setStatus('error');
          setMessage(data.error || 'This unsubscribe link is invalid or has already been used.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again or contact us at info@realmindxgh.com.');
      });
  }, []);

  return (
    <SiteInfoPage
      eyebrow="Newsletter"
      title={status === 'loading' ? 'Unsubscribing…' : status === 'success' ? 'You are Unsubscribed' : 'Unsubscribe Failed'}
      body={status === 'loading' ? 'Please wait a moment.' : message}
      actions={[{ label: 'Back to Homepage', href: '/' }]}
    />
  );
};

const NotFoundPage = () => (
  <SiteInfoPage
    eyebrow="404"
    title="Sorry, we couldn’t find that page"
    body="Please check the web address for a typo. If it looks correct, return to the homepage or visit the RealMindX Bookshop."
    actions={[{ label: 'Back to Homepage', href: '/' }, { label: 'Visit Bookshop', href: 'https://bookshop.realmindxgh.com', variant: 'btn-outline' }]}
  />
);

const RegisterRoute = () => <UserLoginPage initialMode="register" />;
const NewsArticleRoute = () => {
  const { articleSlug = '' } = useParams();
  return <NewsPage articleSlug={articleSlug} />;
};

// ── Per-route meta (title + description + OG) ─────────────────
const BASE_URL = SITE_BASE_URL;
const DEFAULT_IMG = SITE_DEFAULT_IMAGE;
const absoluteSeoImage = (value) => {
  if (!value) return DEFAULT_IMG;
  try {
    return new URL(value, SITE_BASE_URL).toString();
  } catch {
    return DEFAULT_IMG;
  }
};

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
    desc: 'Explore RealMindX education services in Ghana, including teacher recruitment, teacher development, school structuring, tutoring, special education, SchoolMS, and more.',
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
  '/reset-password': { title: 'Reset Password | RealMindX Education', desc: 'Create a new password for your RealMindX account.' },
};

const shouldNoIndexPath = (path) => (
  path === '/unsubscribe'
  || path === '/login'
  || path === '/register'
  || path === '/signup'
  || path === '/forgot-password'
  || path === '/user/login'
  || path === '/user/register'
  || path === '/user/signup'
  || path === '/reset-password'
  || path.startsWith('/portal')
  || path.startsWith('/admin')
  || path.startsWith('/staff')
  || path.startsWith('/delivery-company')
  || path.startsWith('/manager')
  || path.startsWith('/rider')
  || path.startsWith('/delivery')
);

const serviceMeta = (service) => ({
  title: `${service.label} | RealMindX Education Ghana`,
  desc: service.summary || service.body?.[0] || `Learn how RealMindX delivers ${service.label.toLowerCase()} services across Ghana.`,
  image: absoluteSeoImage(service.img),
});

const newsMeta = (item) => ({
  title: `${item.title} | RealMindX News`,
  desc: item.excerpt || item.summary || item.body || 'Latest RealMindX news and updates from Ghana.',
  image: absoluteSeoImage(newsAssetUrl(item.img || item.image_url)),
});

const RouteTitle = () => {
  const location = useLocation();
  const servicesState = usePublicServicesState();
  const services = servicesState.items;
  const newsState = usePublicNewsState(200);
  React.useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (path.startsWith('/bookshop')) return; // handled by BookshopApp
    if (path.startsWith('/jobs/')) return; // server-rendered job metadata remains authoritative
    let meta = PAGE_META[path] || { title: 'RealMindX Education', desc: "Ghana's educational services provider: teacher recruitment, bookshop, CPD, school transformation and more." };
    let canonicalPath = path;
    let image = DEFAULT_IMG;
    let structuredData = null;
    const knownDynamicPath = path.startsWith('/services/') || path.startsWith('/news/');
    let robots = shouldNoIndexPath(path) || (!PAGE_META[path] && !knownDynamicPath)
      ? 'noindex,follow'
      : 'index,follow';

    if (path.startsWith('/admin')) {
      meta = { title: 'RealMindX Admin - RealMindX Education', desc: 'Secure RealMindX administration portal.' };
    } else if (path.startsWith('/staff')) {
      meta = { title: 'RealMindX Staff - RealMindX Education', desc: 'Secure RealMindX staff portal.' };
    } else if (path.startsWith('/delivery-company') || path.startsWith('/manager')) {
      meta = { title: 'RealMindX Delivery Company Portal', desc: 'Secure dispatch portal for RealMindX delivery partners.' };
    } else if (path.startsWith('/delivery') || path.startsWith('/rider')) {
      meta = { title: 'RealMindX Rider Portal - RealMindX Education', desc: 'Secure delivery workspace for assigned RealMindX riders.' };
    } else if (path.startsWith('/portal')) {
      meta = { title: 'My RealMindX Profile - RealMindX Education', desc: 'Secure RealMindX teacher account portal.' };
    } else if (path.startsWith('/services/')) {
      const serviceSlug = path.split('/services/')[1] || '';
      const service = services.find(item => slugify(item.id) === slugify(serviceSlug));
      if (service) {
        meta = serviceMeta(service);
        canonicalPath = servicePath(service.id);
        image = meta.image;
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: service.label,
          description: meta.desc,
          provider: {
            '@type': 'EducationalOrganization',
            name: 'RealMindX Education Limited',
            url: SITE_BASE_URL,
          },
          areaServed: {
            '@type': 'Country',
            name: 'Ghana',
          },
          url: `${SITE_BASE_URL}${servicePath(service.id)}`,
        };
      } else if (servicesState.loading) {
        meta = PAGE_META['/services'];
        canonicalPath = '/services';
      } else {
        meta = {
          title: 'Service Not Found | RealMindX Education',
          desc: 'That RealMindX service link does not match a currently published service.',
        };
        robots = 'noindex,follow';
      }
    } else if (path.startsWith('/news/')) {
      const articleSlug = path.split('/news/')[1] || '';
      const article = newsState.items.find(item => slugify(item.slug || item.id) === slugify(articleSlug) || slugify(String(item.id)) === slugify(articleSlug));
      if (article) {
        meta = newsMeta(article);
        canonicalPath = newsPath(article);
        image = meta.image;
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.title,
          description: meta.desc,
          image,
          datePublished: article.published_at || undefined,
          author: {
            '@type': 'Organization',
            name: 'RealMindX Education Limited',
          },
          publisher: {
            '@type': 'Organization',
            name: 'RealMindX Education Limited',
            logo: {
              '@type': 'ImageObject',
              url: `${SITE_BASE_URL}/logo-white.png`,
            },
          },
          mainEntityOfPage: `${SITE_BASE_URL}${newsPath(article)}`,
        };
        } else if (!newsState.loading && !newsState.failed) {
          meta = {
            title: 'Article Not Found | RealMindX News',
            desc: 'That RealMindX news link does not match a currently published article.',
        };
        robots = 'noindex,follow';
      }
    }

    document.title = meta.title;
    const url = `${BASE_URL}${canonicalPath}`;
    setHeadMeta('description', meta.desc);
    setHeadMeta('robots', robots);
    setHeadMeta('og:type', path.startsWith('/news/') ? 'article' : 'website', { property: true });
    setHeadMeta('og:title', meta.title, { property: true });
    setHeadMeta('og:description', meta.desc, { property: true });
    setHeadMeta('og:url', url, { property: true });
    setHeadMeta('og:image', image, { property: true });
    setHeadMeta('og:image:alt', meta.title, { property: true });
    setHeadMeta('og:image:width', image === DEFAULT_IMG ? '1200' : null, { property: true });
    setHeadMeta('og:image:height', image === DEFAULT_IMG ? '630' : null, { property: true });
    setHeadMeta('twitter:card', 'summary_large_image');
    setHeadMeta('twitter:title', meta.title);
    setHeadMeta('twitter:description', meta.desc);
    setHeadMeta('twitter:image', image);
    const portalIcon = path.startsWith('/manager') || path.startsWith('/delivery-company')
      ? '/delivery-assets/delivery-company-icon.png'
      : path.startsWith('/rider') || path.startsWith('/delivery')
        ? '/delivery-assets/rider-icon.png'
        : '/favicon.png';
    setFavicons({ icon: portalIcon, appleTouchIcon: portalIcon === '/favicon.png' ? '/apple-touch-icon.png' : portalIcon });
    setHeadLink('canonical', url);
    setStructuredData('route-seo', structuredData);
  }, [location.pathname, newsState.failed, newsState.items, newsState.loading, services, servicesState.loading]);
  return null;
};

const HashScroll = ({ children }) => {
  const location = useLocation();

  React.useEffect(() => {
    if (location.pathname === '/services' || location.pathname.startsWith('/bookshop')) return;
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
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  const isBookshopRoute = location.pathname.startsWith('/bookshop');
  // Only dashboards send the user to a login screen on sign-out; any other
  // page just reloads in place, now logged out, with a toast explaining why.
  const isDashboardRoute = location.pathname.startsWith('/portal')
    || location.pathname.startsWith('/admin')
    || location.pathname.startsWith('/staff')
    || location.pathname.startsWith('/delivery-company')
    || location.pathname.startsWith('/manager')
    || location.pathname.startsWith('/rider')
    || location.pathname.startsWith('/delivery');

  React.useEffect(() => {
    const handler = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', handler);
    return () => window.removeEventListener('rmx-session-sync', handler);
  }, []);

  const loginUrl = loginPathForRole(session?.role);
  const idleMs = session?.role === 'staff' ? 5 * 60 * 1000 : 10 * 60 * 1000;
  const timeoutMessage = session?.role === 'staff'
    ? 'Your staff session expired after five idle minutes and the warning countdown finished.'
    : 'You were signed out after 15 minutes of inactivity.';

  const signOutHere = async (message, { idle = false } = {}) => {
    await signOut();
    if (isDashboardRoute) {
      window.location.href = idle ? `${loginUrl}?reason=idle` : loginUrl;
    } else {
      queueToast(message, 'info');
      window.location.reload();
    }
  };

  const { countdown, keepAlive } = useIdleTimeout({
    enabled: Boolean(session?.role) && !isBookshopRoute && !isInstalledApp(),
    idleMs,
    onTimeout: () => signOutHere(timeoutMessage, { idle: true }),
  });
  return (
    <IdleWarning
      countdown={countdown}
      onKeepAlive={keepAlive}
      onLogout={() => signOutHere("You've been signed out.")}
    />
  );
};

const SessionBridge = () => {
  const location = useLocation();
  React.useEffect(() => {
    if (
      location.pathname.startsWith('/admin')
      || location.pathname.startsWith('/staff')
      || location.pathname.startsWith('/portal')
      || location.pathname.startsWith('/delivery-company')
      || location.pathname.startsWith('/manager')
      || location.pathname.startsWith('/rider')
      || location.pathname.startsWith('/delivery')
    ) {
      return undefined;
    }
    let alive = true;
    syncSessionFromApi().then(() => {
      if (alive) window.dispatchEvent(new Event('rmx-session-sync'));
    });
    return () => { alive = false; };
  }, [location.pathname]);
  return null;
};

const RouteAnalyticsTracker = () => {
  const location = useLocation();
  const services = usePublicServices();
  const newsState = usePublicNewsState(200);

  React.useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (
      path.startsWith('/bookshop')
      || path.startsWith('/admin')
      || path.startsWith('/staff')
      || path.startsWith('/portal')
      || path.startsWith('/delivery-company')
      || path.startsWith('/manager')
      || path.startsWith('/rider')
      || path.startsWith('/delivery')
    ) return;

    let pageType = 'website';
    let serviceId = null;
    let newsId = null;

    if (path === '/services') {
      pageType = 'services';
    } else if (path.startsWith('/services/')) {
      pageType = 'service_detail';
      const serviceSlug = path.split('/services/')[1] || '';
      const service = services.find(item => slugify(item.id) === slugify(serviceSlug));
      serviceId = service?.id || serviceSlug || null;
    } else if (path === '/news') {
      pageType = 'news';
    } else if (path.startsWith('/news/')) {
      pageType = 'news_article';
      const articleSlug = path.split('/news/')[1] || '';
      const article = newsState.items.find(item => slugify(item.slug || item.id) === slugify(articleSlug) || slugify(String(item.id)) === slugify(articleSlug));
      newsId = article?.id || null;
    } else if (path === '/contact') {
      pageType = 'contact';
    } else if (path === '/jobs') {
      pageType = 'jobs';
    } else if (path === '/donate') {
      pageType = 'donate';
    } else if (path === '/about') {
      pageType = 'about';
    }

    trackPageView({
      path,
      fullPath: `${path}${location.search}`,
      pageType,
      serviceId,
      newsId,
    });
  }, [location.pathname, location.search, newsState.items, services]);

  return null;
};

// If served from bookshop.realmindxgh.com, show only the bookshop
const isBookshopSubdomain =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('bookshop.');
const isDeliverySubdomain =
  typeof window !== 'undefined' &&
  window.location.hostname.startsWith('delivery.');

const FOCUS_FLYER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const FOCUS_FLYER_SEEN_KEY = 'rmx-focus-flyer-seen-at-v2';

const publicAssetUrl = (value) => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  const base = String(API_BASE || '').startsWith('http')
    ? API_BASE.replace(/\/api\/?$/, '')
    : window.location.origin;
  return new URL(value, base).toString();
};

const InstalledSurfaceLinkGuard = () => {
  React.useEffect(() => {
    if (!isInstalledApp()) return undefined;
    const path = window.location.pathname;
    const host = window.location.hostname;
    const scope = host.startsWith('bookshop.') ? '/'
      : path.startsWith('/manager') ? '/manager/'
      : path.startsWith('/rider') ? '/rider/'
      : path.startsWith('/delivery-company') ? '/delivery-company/'
      : path.startsWith('/delivery') ? '/delivery/'
      : path.startsWith('/admin') ? '/admin/'
      : path.startsWith('/staff') ? '/staff/'
      : null;
    if (!scope) return undefined;

    const outsideSurface = url => {
      if (url.origin !== window.location.origin) return true;
      if (scope === '/') return false;
      return !(url.pathname === scope.slice(0, -1) || url.pathname.startsWith(scope) || url.pathname.startsWith('/api/'));
    };
    const handleClick = event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || event.defaultPrevented || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (!outsideSurface(url)) return;
      event.preventDefault();
      window.open(url.href, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
  return null;
};

const FlyerFocusModal = () => {
  const [flyer, setFlyer] = React.useState(null);

  React.useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (shouldNoIndexPath(path)) return undefined;

    let lastSeen = 0;
    try {
      lastSeen = Number(window.localStorage.getItem(FOCUS_FLYER_SEEN_KEY) || 0);
    } catch {
      lastSeen = 0;
    }
    if (Date.now() - lastSeen < FOCUS_FLYER_COOLDOWN_MS) return undefined;

    let active = true;
    api.fetchFocusFlyer()
      .then((data) => {
        if (!active || !data?.item) return;
        setFlyer(data.item);
        try {
          window.localStorage.setItem(FOCUS_FLYER_SEEN_KEY, String(Date.now()));
        } catch {
          // Browsers with blocked storage still get a dismissible modal.
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!flyer) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => event.key === 'Escape' && setFlyer(null);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [flyer]);

  if (!flyer) return null;
  const imageUrl = publicAssetUrl(flyer.image_url);

  return (
    <div className="focus-flyer-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setFlyer(null)}>
      <section className="focus-flyer-modal" role="dialog" aria-modal="true" aria-label={flyer.headline || 'Featured flyer'}>
        <button className="focus-flyer-close" type="button" onClick={() => setFlyer(null)} aria-label="Close featured flyer">
          <Icon name="x" size={20} stroke={2.3} />
        </button>
        {imageUrl ? <img src={imageUrl} alt={flyer.headline || 'RealMindX featured flyer'} /> : null}
        {(flyer.headline || flyer.accent || flyer.subline || flyer.badge) ? (
          <div className="focus-flyer-copy">
            {flyer.badge ? <span>{flyer.badge}</span> : null}
            {flyer.headline ? <h2>{flyer.headline}{flyer.accent ? <> <strong>{flyer.accent}</strong></> : null}</h2> : null}
            {flyer.subline ? <p>{flyer.subline}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};

const AppRoutes = () => {
  const deliveryPortalPath = typeof window !== 'undefined'
    && (window.location.pathname.startsWith('/delivery-company')
      || window.location.pathname.startsWith('/delivery')
      || window.location.pathname.startsWith('/manager')
      || window.location.pathname.startsWith('/rider'));
  if (isBookshopSubdomain && !deliveryPortalPath) {
    return (
      <>
        <FlyerFocusModal />
        <InstallAppPrompt />
        <InstalledSurfaceLinkGuard />
        <React.Suspense fallback={<RouteLoading />}><BookshopApp /></React.Suspense>
      </>
    );
  }
  return (
  <>
    <FlyerFocusModal />
    <InstallAppPrompt />
    <InstalledSurfaceLinkGuard />
    <BrowserRouter>
      <RouteTitle />
      <RouteAnalyticsTracker />
      <SessionBridge />
      <IdleGuard />
      <HashScroll>
        <React.Suspense fallback={<RouteLoading />}>
        <Routes>
        <Route path="/" element={isDeliverySubdomain ? <Navigate to="/manager/login" replace /> : <HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/services/:serviceSlug" element={<ServiceDetailPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:jobId" element={<JobsPage />} />
        <Route path="/login" element={<UserLoginPage />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
        {/* Legacy /user/* URLs that Google may still index — redirect client-side */}
        <Route path="/user/signup" element={<Navigate to="/register" replace />} />
        <Route path="/user/register" element={<Navigate to="/register" replace />} />
        <Route path="/user/login" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/book_service" element={<Navigate to="/contact" replace />} />
        <Route path="/portal/*" element={<UserPortalPage />} />

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminPortalPage portalRole="admin" />} />
        <Route path="/admin/*" element={<AdminPortalPage portalRole="admin" />} />
        <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/staff/dashboard" element={<AdminPortalPage portalRole="staff" />} />
        <Route path="/staff/*" element={<AdminPortalPage portalRole="staff" />} />
        <Route path="/delivery-company/login" element={<DeliveryPortalPage role="delivery_company_user" />} />
        <Route path="/delivery-company/*" element={<DeliveryPortalPage role="delivery_company_user" />} />
        <Route path="/delivery/login" element={<DeliveryPortalPage role="delivery_rider" />} />
        <Route path="/delivery/*" element={<DeliveryPortalPage role="delivery_rider" />} />
        <Route path="/manager/login" element={<DeliveryPortalPage role="delivery_company_user" />} />
        <Route path="/manager/*" element={<DeliveryPortalPage role="delivery_company_user" />} />
        <Route path="/rider/login" element={<DeliveryPortalPage role="delivery_rider" />} />
        <Route path="/rider/*" element={<DeliveryPortalPage role="delivery_rider" />} />

        <Route path="/bookshop/*" element={<BookshopApp />} />

        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/:articleSlug" element={<NewsArticleRoute />} />
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
          path="/unsubscribe"
          element={<UnsubscribePage />}
        />

        <Route
          path="*"
          element={<NotFoundPage />}
        />
        </Routes>
        </React.Suspense>
      </HashScroll>
    </BrowserRouter>
  </>
  );
};

// Show (and clear) any toast a previous page queued right before redirecting
// here — e.g. "You've been signed out" survives the hard reload to /login.
flushQueuedToast();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRoutes />
  </React.StrictMode>,
);
