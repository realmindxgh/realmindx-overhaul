import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { trackServiceEnquiryClick } from '../../src/lib/analytics.js';
import { usePublicServices, useSiteCopy } from '../../src/lib/siteContent.js';
import { servicePath, slugify } from '../../src/lib/seoRoutes.js';

const serviceDocVariant = (service, variant = 'overview') => {
  if (variant === 'detail') {
    return {
      tag: service.detailTag,
      title: service.detailTitle,
      summary: service.detailSummary,
      body: service.detailBody,
      features: service.detailFeatures,
      badge: service.detailBadge,
      img: service.detailImg,
      ctas: service.detailCtas,
    };
  }
  return {
    tag: service.tag,
    title: service.title,
    summary: service.summary,
    body: service.body,
    features: service.features,
    badge: service.badge,
    img: service.img,
    ctas: service.ctas,
  };
};

const ServiceDocContent = ({ service, variant = 'overview' }) => {
  const doc = serviceDocVariant(service, variant);
  const detailHref = servicePath(service.id);
  const isOverview = variant === 'overview';
  const handleCtaClick = (cta) => {
    const href = String(cta?.href || '').trim();
    if (!href) return;
    const lowerHref = href.toLowerCase();
    const isEnquiryTarget = (
      lowerHref.startsWith('/contact')
      || lowerHref.startsWith('mailto:')
      || lowerHref.startsWith('tel:')
      || lowerHref.includes('wa.link')
      || lowerHref.includes('whatsapp')
    );
    if (!isEnquiryTarget) return;
    trackServiceEnquiryClick({
      serviceId: service.id,
      path: detailHref,
      href,
      label: cta.label,
      source: variant === 'detail' ? 'service_detail_cta' : 'service_overview_cta',
    });
  };

  return (
    <div className="service-doc-layout">
      <div className="service-doc-copy">
        {isOverview ? (
          <Link to={detailHref} className="service-doc-kicker service-doc-kicker-link">
            <span className="service-doc-icon"><Icon name={service.icon} size={18} stroke={1.9} /></span>
            <span>{doc.tag}</span>
          </Link>
        ) : (
          <div className="service-doc-kicker">
            <span className="service-doc-icon"><Icon name={service.icon} size={18} stroke={1.9} /></span>
            <span>{doc.tag}</span>
          </div>
        )}

        <h2>
          {isOverview ? <Link to={detailHref} className="service-doc-title-link">{doc.title}</Link> : doc.title}
        </h2>

        {doc.img && (
          <figure className="service-doc-image-card">
            {isOverview ? (
              <Link to={detailHref} className="service-doc-image-link">
                <img src={doc.img} alt={`${service.label} service`} loading="lazy" />
              </Link>
            ) : (
              <img src={doc.img} alt={`${service.label} service`} loading="lazy" />
            )}
            {doc.badge && <figcaption>{doc.badge}</figcaption>}
          </figure>
        )}

        {doc.summary && <p className="service-doc-summary">{doc.summary}</p>}
        {doc.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}

        {doc.features.length > 0 && (
          <div className="service-doc-features">
            {doc.features.map(feature => (
              <div className="service-doc-feature" key={feature}>
                <Icon name="check" size={15} stroke={2.4} />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        )}

        {doc.ctas.length > 0 && (
          <div className="service-doc-actions">
            {doc.ctas.map(cta => (
              <a
                key={`${service.id}-${cta.label}`}
                className={`btn btn-${cta.style}`}
                href={cta.href}
                target={cta.href.startsWith('http') ? '_blank' : undefined}
                rel={cta.href.startsWith('http') ? 'noreferrer' : undefined}
                onClick={() => handleCtaClick(cta)}
              >
                {cta.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ServicesPage = () => {
  const services = usePublicServices();
  const copy = useSiteCopy();
  const [activeSection, setActiveSection] = useState(services[0]?.id || '');
  const sectionRefs = useRef({});
  const activeRef = useRef('');
  const servicesRef = useRef([]);
  const scrollingRef = useRef(false);
  const scrollTimerRef = useRef(null);
  const frameRef = useRef(null);
  const initialHashAppliedRef = useRef(false);
  const servicesKey = useMemo(() => services.map(service => service.id).join('|'), [services]);
  const firstServiceId = services[0]?.id || '';

  useEffect(() => {
    servicesRef.current = services;
  }, [services, servicesKey]);

  const setActiveService = useCallback((id, syncUrl = true) => {
    if (!id || activeRef.current === id) return;
    activeRef.current = id;
    setActiveSection(id);
    if (syncUrl && typeof window !== 'undefined') {
      const nextHash = `#${encodeURIComponent(id)}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${nextHash}`);
      }
    }
  }, []);

  const findVisibleService = useCallback(() => {
    const currentServices = servicesRef.current;
    if (!currentServices.length || typeof window === 'undefined') return '';
    const marker = Math.max(96, Math.min(180, window.innerHeight * 0.28));
    let closest = currentServices[0]?.id || '';
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const service of currentServices) {
      const el = sectionRefs.current[service.id] || document.getElementById(service.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > marker) return service.id;
      const distance = Math.abs(rect.top - marker);
      if (distance < closestDistance) {
        closest = service.id;
        closestDistance = distance;
      }
    }

    return closest;
  }, []);

  const scrollToService = useCallback((id, smooth = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    scrollingRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    setActiveService(id);
    const navOffset = window.innerWidth <= 768 ? 142 : 94;
    const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    scrollTimerRef.current = setTimeout(() => {
      scrollingRef.current = false;
      setActiveService(findVisibleService(), false);
    }, smooth ? 900 : 120);
  }, [findVisibleService, setActiveService]);

  useEffect(() => {
    if (!services.length) return undefined;

    const syncFromScroll = () => {
      if (scrollingRef.current || frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setActiveService(findVisibleService(), false);
      });
    };

    const cancelProgrammaticScroll = () => {
      scrollingRef.current = false;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      syncFromScroll();
    };

    window.addEventListener('scroll', syncFromScroll, { passive: true });
    window.addEventListener('resize', syncFromScroll);
    window.addEventListener('wheel', cancelProgrammaticScroll, { passive: true });
    window.addEventListener('touchstart', cancelProgrammaticScroll, { passive: true });
    window.addEventListener('keydown', cancelProgrammaticScroll);
    window.requestAnimationFrame(syncFromScroll);

    return () => {
      window.removeEventListener('scroll', syncFromScroll);
      window.removeEventListener('resize', syncFromScroll);
      window.removeEventListener('wheel', cancelProgrammaticScroll);
      window.removeEventListener('touchstart', cancelProgrammaticScroll);
      window.removeEventListener('keydown', cancelProgrammaticScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [findVisibleService, services.length, servicesKey, setActiveService]);

  useEffect(() => {
    if (!services.length) return undefined;

    const handleHash = (smooth = true) => {
      const id = window.decodeURIComponent(window.location.hash.slice(1));
      if (id && servicesRef.current.some(service => service.id === id)) {
        window.requestAnimationFrame(() => scrollToService(id, smooth));
      } else if (!activeRef.current) {
        setActiveService(findVisibleService() || firstServiceId, false);
      }
    };

    if (!initialHashAppliedRef.current) {
      initialHashAppliedRef.current = true;
      handleHash(false);
    }
    const onHashChange = () => handleHash(true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [findVisibleService, firstServiceId, scrollToService, services.length, servicesKey, setActiveService]);

  const heroTitle = copy.services_hero_title || 'RealMindX Services';
  const heroBody = copy.services_hero_body || 'From teacher recruitment to school transformation, every RealMindX service is organised around one goal: making quality education easier to access, manage, and improve.';
  const heroNote = copy.services_effective_note || 'Built for schools, teachers, families, and learners across Ghana.';

  return (
    <>
      <Nav activePage="services" />

      <section className="services-policy-hero">
        <div className="container">
          <div className="legal-breadcrumb">
            <a href="/">RealMindX</a>
            <span>&gt;</span>
            <span>Services</span>
          </div>
          <h1>{heroTitle}</h1>
          <p>{heroBody}</p>
          <div className="services-effective-pill">
            <Icon name="settings" size={15} stroke={2} />
            <span>{heroNote}</span>
          </div>
        </div>
      </section>

      <section className="services-policy-body">
        <div className="container services-policy-grid">
          <aside className="services-contents services-contents-desktop" aria-label="Services contents">
            <p>Contents</p>
            <nav>
              {services.map(service => (
                <button
                  key={service.id}
                  className={activeSection === service.id ? 'active' : ''}
                  type="button"
                  onClick={() => scrollToService(service.id)}
                >
                  {service.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="services-mobile-tabs" aria-label="Services contents">
            {services.map(service => (
              <button
                key={service.id}
                className={activeSection === service.id ? 'active' : ''}
                type="button"
                onClick={() => scrollToService(service.id)}
              >
                {service.label}
              </button>
            ))}
          </div>

          <main className="services-document">
            {services.map(service => (
              <section
                className="service-doc-section"
                id={service.id}
                key={service.id}
                ref={el => { sectionRefs.current[service.id] = el; }}
              >
                <ServiceDocContent service={service} />
              </section>
            ))}
          </main>
        </div>
      </section>

      <section className="services-cta-banner">
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <p className="overline">Work With Us</p>
          <h2 className="section-title light">Not Sure Where to Start?</h2>
          <p className="section-lead light" style={{ margin: '0 auto 32px' }}>
            Tell us what your school or students need. We will recommend the right services
            and build a package around your goals.
          </p>
          <div className="btn-row">
            <a href="/contact" className="btn btn-primary btn-lg">Get in Touch</a>
            <a href="tel:+233558039190" className="btn btn-outline btn-lg">Call Us</a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
};

export const ServiceDetailPage = () => {
  const { serviceSlug = '' } = useParams();
  const services = usePublicServices();
  const service = services.find(item => slugify(item.id) === slugify(serviceSlug));
  const related = services.filter(item => item.id !== service?.id);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [serviceSlug]);

  if (!service) {
    return (
      <>
        <Nav activePage="services" />
        <main className="route-page">
          <section className="page-hero route-page-hero">
            <div className="container" style={{ position: 'relative', zIndex: 1 }}>
              <p className="overline">RealMindX</p>
              <h1>Service Not Found</h1>
              <p>That service link does not match a currently published RealMindX service.</p>
              <div className="btn-row" style={{ marginTop: 24 }}>
                <Link to="/services" className="btn btn-primary btn-lg">View All Services</Link>
                <Link to="/contact" className="btn btn-outline btn-lg">Contact RealMindX</Link>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  if (slugify(serviceSlug) !== slugify(service.id)) {
    return <Navigate to={servicePath(service.id)} replace />;
  }

  return (
    <>
      <Nav activePage="services" />
      <main className="route-page">
        <section className="services-policy-hero">
          <div className="container">
            <div className="legal-breadcrumb">
              <Link to="/">RealMindX</Link>
              <span>&gt;</span>
              <Link to="/services">Services</Link>
              <span>&gt;</span>
              <span>{service.label}</span>
            </div>
            <p className="overline">{service.detailTag}</p>
            <h1>{service.detailTitle}</h1>
            <p>{service.detailSummary || service.detailBody[0] || service.summary || service.body[0]}</p>
            <div className="services-effective-pill">
              <Icon name={service.icon} size={15} stroke={2} />
              <span>Built for Ghanaian schools, teachers, parents, and learners.</span>
            </div>
          </div>
        </section>

        <section className="services-policy-body">
          <div className="container services-policy-grid">
            <aside className="services-contents services-contents-desktop" aria-label="Related services">
              <p>Other Services</p>
              <nav>
                <Link className="active" to={servicePath(service.id)}>{service.label}</Link>
                {related.map(item => (
                  <Link key={item.id} to={servicePath(item.id)}>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>

            <main className="services-document">
              <section className="service-doc-section">
                <ServiceDocContent service={service} variant="detail" />
              </section>
            </main>
          </div>
        </section>

        {related.length > 0 && (
          <section className="site-info-section">
            <div className="container">
              <div className="section-heading" style={{ marginBottom: 28 }}>
                <p className="overline">Explore More</p>
                <h2 className="section-title">Related RealMindX Services</h2>
              </div>
              <div className="managed-card-grid">
                {related.map(item => (
                  <article key={item.id} className="managed-card">
                    {item.img && <img src={item.img} alt={`${item.label} service`} />}
                    <p className="overline">{item.tag}</p>
                    <h2>{item.label}</h2>
                    <p>{item.summary}</p>
                    <Link className="btn btn-navy btn-sm" to={servicePath(item.id)}>
                      View Service
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
};

export default ServicesPage;
