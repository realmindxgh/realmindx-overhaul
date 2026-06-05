import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { usePublicServices, useSiteCopy } from '../../src/lib/siteContent.js';

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
                <div className="service-doc-layout">
                  <div className="service-doc-copy">
                    <div className="service-doc-kicker">
                      <span className="service-doc-icon"><Icon name={service.icon} size={18} stroke={1.9} /></span>
                      <span>{service.tag}</span>
                    </div>
                    <h2>{service.title}</h2>

                    {/* Image between heading and summary */}
                    {service.img && (
                      <figure className="service-doc-image-card">
                        <img src={service.img} alt={`${service.label} service`} loading="lazy" />
                        {service.badge && <figcaption>{service.badge}</figcaption>}
                      </figure>
                    )}

                    {service.summary && <p className="service-doc-summary">{service.summary}</p>}
                    {service.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}

                    {service.features.length > 0 && (
                      <div className="service-doc-features">
                        {service.features.map(feature => (
                          <div className="service-doc-feature" key={feature}>
                            <Icon name="check" size={15} stroke={2.4} />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {service.ctas.length > 0 && (
                      <div className="service-doc-actions">
                        {service.ctas.map(cta => (
                          <a
                            key={`${service.id}-${cta.label}`}
                            className={`btn btn-${cta.style}`}
                            href={cta.href}
                            target={cta.href.startsWith('http') ? '_blank' : undefined}
                            rel={cta.href.startsWith('http') ? 'noreferrer' : undefined}
                          >
                            {cta.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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

export default ServicesPage;
