// ====================== Nav ======================
const NAV_ITEMS = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Bookshop', href: '#bookshop' },
  { label: 'News', href: '#news' },
  { label: 'Jobs', href: '#jobs' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Contact', href: '#contact' },
];

const Nav = () => {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  React.useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; }, [open]);

  return (
    <>
      <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-inner">
          <a className="nav-logo" href="#home" aria-label="RealMindX Education home">
            <img src="assets/logo-white.png" alt="RealMindX Education" />
          </a>
          <div className="nav-links">
            {NAV_ITEMS.map((n, i) => (
              <a key={n.label} className={`nav-link${i === 0 ? ' active' : ''}`} href={n.href}>{n.label}</a>
            ))}
            <a className="btn btn-primary nav-cta" href="#donate">Donate</a>
          </div>
          <button className="hamburger" onClick={() => setOpen(!open)} aria-label="Open menu">
            <span/><span/><span/>
          </button>
        </div>
      </nav>
      <div className={`mobile-menu${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
        {NAV_ITEMS.map(n => (
          <a key={n.label} href={n.href}>{n.label}</a>
        ))}
        <a className="btn btn-primary" href="#donate" style={{ marginTop: 16, padding: '16px 40px', fontSize: 14 }}>Donate</a>
      </div>
    </>
  );
};

// ====================== Hero ======================
const HERO_SLIDES = [
  { src: 'assets/images/hero/teacher-recruitment.jpg',  alt: 'Students in a Ghanaian classroom focused on their work' },
  { src: 'assets/images/hero/home-teaching.jpg',        alt: 'A teacher guiding a young learner one-on-one at home' },
  { src: 'assets/images/hero/school-restructuring.jpg', alt: 'A school leader presenting a strategy at a planning session' },
  { src: 'assets/images/hero/special-needs.jpg',        alt: 'A smiling student supported by inclusive education' },
  { src: 'assets/images/hero/bookshop.jpg',             alt: 'Books and stationery on display at the RealMindX bookshop' },
];

const Hero = () => {
  const [idx, setIdx] = React.useState(0);
  const total = HERO_SLIDES.length;
  React.useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % total), 5000);
    return () => clearInterval(id);
  }, [total]);
  return (
    <section id="home" className="hero">
      <div className="hero-dots" />
      <div className="hero-image" aria-hidden="true">
        {HERO_SLIDES.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
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
            Education · Innovation · Community
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
            <a className="btn btn-primary" href="#services">
              Explore Our Services <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light" href="#bookshop">
              Visit the Bookshop <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light" href="#schoolms">
              Explore SchoolMS <Icon name="arrow" size={16} />
            </a>
            <a className="btn btn-ghost-light hero-cta-end" href="#jobs">
              Teaching Opportunities <Icon name="arrow" size={16} />
            </a>
          </div>
          <div className="hero-trust fade-up delay-6">
            Trusted by schools across Accra and beyond
          </div>
        </div>
      </div>
      <div className="hero-slide-dots" aria-hidden="true">
        {HERO_SLIDES.map((_, i) => (
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
          <span className="marquee-sep">◆</span>
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
        <a href="#about" className="mission-link">Learn more about us  →</a>
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

const Services = () => (
  <section className="services" id="services">
    <div className="container">
      <Reveal className="section-head">
        <span className="label-eyebrow">What We Offer</span>
        <h2 className="h2">Comprehensive Educational Services</h2>
        <p>From teacher development to school transformation, we have the expertise your institution needs.</p>
      </Reveal>
      <div className="services-grid">
        {SERVICES.map((s, i) => (
          <Reveal key={s.name} delay={(i % 4) * 100}>
            <div className="service-card">
              <div className="service-icon"><Icon name={s.icon} size={22} /></div>
              <div className="service-name">{s.name}</div>
              <div className="service-desc">{s.desc}</div>
              <a className="service-link" href="#services">Learn more →</a>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="services-cta" delay={200}>
        <a className="btn btn-outline-gold" href="#services">View All Services →</a>
      </Reveal>
    </div>
  </section>
);

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
          <div className="quote-mark">“</div>
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
          <h2 className="h2">What clients are saying</h2>
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
            <a className="btn btn-primary" href="#bookshop">Visit Our Bookshop <Icon name="arrow" size={16} /></a>
          </div>
        </Reveal>
      </div>
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
        <a className="btn btn-primary" href="#donate-form" style={{ padding: '16px 36px', fontSize: 15 }}>
          Donate Now <Icon name="arrow" size={16} />
        </a>
        <div className="donate-note">Every contribution makes a real difference.</div>
      </Reveal>
    </div>
  </section>
);

// ====================== Gallery preview ======================
const GALLERY_ITEMS = [
  { tag: 'Classroom',     caption: 'CPD workshop in session' },
  { tag: 'Field Day',     caption: 'Inter-school sports event' },
  { tag: 'Bookshop',      caption: 'New stock arrival' },
  { tag: 'Training',      caption: 'Teacher induction day' },
  { tag: 'Recognition',   caption: 'Awards & graduations' },
  { tag: 'Community',     caption: 'School outreach visit' },
];

const Gallery = () => (
  <section className="gallery" id="gallery">
    <div className="container">
      <Reveal className="section-head section-head-light">
        <span className="label-eyebrow">From the field</span>
        <h2 className="h2">Moments from our work</h2>
        <p>A glimpse into the schools, teachers and students we serve every day.</p>
      </Reveal>
      <div className="gallery-grid">
        {GALLERY_ITEMS.map((g, i) => (
          <Reveal key={i} delay={(i % 3) * 100}>
            <a className="gallery-card" href="#gallery">
              <div className="gallery-img">
                <span className="gallery-tag">{g.tag}</span>
                <span className="gallery-placeholder-label">[ image placeholder ]</span>
              </div>
              <div className="gallery-caption">{g.caption}</div>
            </a>
          </Reveal>
        ))}
      </div>
      <Reveal className="services-cta" delay={200}>
        <a className="btn btn-primary" href="#gallery">View Full Gallery <Icon name="arrow" size={16} /></a>
      </Reveal>
    </div>
  </section>
);

// ====================== News preview ======================
const NEWS = [
  {
    cat: 'Announcement',
    date: 'May 12, 2026',
    title: 'New CPD cohort opens for the 2026/27 academic year',
    excerpt: 'Applications are now open for our flagship Continuous Professional Development program. Schools and individual teachers can register before the August deadline.',
  },
  {
    cat: 'Partnership',
    date: 'April 28, 2026',
    title: 'RealMindX partners with five basic schools in Greater Accra',
    excerpt: 'The new partnership brings end-to-end school structuring, teacher recruitment, and the SchoolMS platform to five basic schools across the region.',
  },
  {
    cat: 'Story',
    date: 'April 6, 2026',
    title: 'Inside our after-school tutoring program',
    excerpt: 'How a small group of dedicated tutors is helping students close gaps in mathematics, English, and science across three districts.',
  },
];

const News = () => (
  <section className="news" id="news">
    <div className="container">
      <Reveal className="section-head news-head">
        <div>
          <span className="label-eyebrow">Latest News</span>
          <h2 className="h2">Updates from RealMindX</h2>
        </div>
        <a className="news-head-link" href="#news">All news <Icon name="arrow" size={14} /></a>
      </Reveal>
      <div className="news-grid">
        {NEWS.map((n, i) => (
          <Reveal key={i} delay={i * 100}>
            <a className={`news-card n-${i}`} href="#news">
              <div className="news-img">
                <span className="news-tag">{n.cat}</span>
              </div>
              <div className="news-body">
                <div className="news-date">{n.date}</div>
                <h3 className="news-title">{n.title}</h3>
                <p className="news-excerpt">{n.excerpt}</p>
                <span className="news-link">Read more →</span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

// ====================== Partners ======================
const PARTNERS = [
  { name: 'Bright Minds School',    icon: 'pBuilding' },
  { name: 'Elite High School',      icon: 'pBook' },
  { name: 'Greater Accra Ed.',      icon: 'pStar' },
  { name: 'Pillar Foundation',      icon: 'pColumn' },
  { name: 'Open Books Initiative',  icon: 'pLeaf' },
  { name: 'Volta Learning Trust',   icon: 'pShield' },
];

const Partners = () => (
  <section className="partners" id="partners">
    <div className="container">
      <Reveal className="section-head">
        <span className="label-eyebrow">Our Partners</span>
        <h2 className="h2">Schools and organisations we work with</h2>
        <p>We collaborate with institutions across Ghana to deliver lasting impact.</p>
      </Reveal>
      <div className="partners-grid">
        {PARTNERS.map((p, i) => (
          <Reveal key={p.name} delay={(i % 6) * 60}>
            <div className="partner-card" title={p.name} aria-label={`${p.name} logo placeholder`}>
              <Icon name={p.icon} size={40} stroke={1.5} />
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

// ====================== Footer ======================
const SocialIcon = ({ name }) => {
  const map = {
    x: <path d="M3 3h4.2l4.4 6.3L16.6 3H21l-7.4 9.8L21.5 21h-4.3l-5-7.1L6.4 21H2l8-10.4L3 3z" fill="currentColor"/>,
    facebook: <path d="M13 22v-9h3l.5-3.5H13V7.2c0-1 .3-1.7 1.8-1.7H17V2.3C16.6 2.2 15.3 2 13.9 2c-3 0-5 1.8-5 5v3H6v3.5h3V22h4z" fill="currentColor"/>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></>,
    youtube: <><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none"/></>,
    whatsapp: <path d="M20.5 12a8.5 8.5 0 0 1-12.7 7.4L3 21l1.6-4.7A8.5 8.5 0 1 1 20.5 12z"/>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      {map[name]}
    </svg>
  );
};

const Footer = () => (
  <footer className="footer" id="contact">
    <div className="container">
      <div className="footer-grid">
        <div>
          <a className="footer-logo" href="#home" aria-label="RealMindX Education home">
            <img src="assets/logo-white.png" alt="RealMindX Education" />
          </a>
          <p className="footer-tag">
            Holistic learning, conveniently for every mind. Ghana's most
            comprehensive educational services provider.
          </p>
          <div className="socials">
            <a href="#" aria-label="X"><SocialIcon name="x" /></a>
            <a href="#" aria-label="Facebook"><SocialIcon name="facebook" /></a>
            <a href="#" aria-label="Instagram"><SocialIcon name="instagram" /></a>
            <a href="#" aria-label="YouTube"><SocialIcon name="youtube" /></a>
            <a href="#" aria-label="WhatsApp"><SocialIcon name="whatsapp" /></a>
          </div>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div className="footer-links">
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#jobs">Jobs</a>
            <a href="#news">News</a>
            <a href="#gallery">Gallery</a>
            <a href="#donate">Donate</a>
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
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} RealMindX Education Limited. All rights reserved.</div>
    </div>
  </footer>
);

// ====================== App ======================
const App = () => (
  <>
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
    <Donate />
    <Partners />
    <Footer />
  </>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
