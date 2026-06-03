import React from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { usePublicPeople, useSiteCopy } from '../../src/lib/siteContent.js';
const aboutMain = '/uploads/Redesign/hero/School Restructuring-3.jpg';
const aboutAccent = '/uploads/Redesign/hero/Home Teaching-1.jpg';

const GOALS = [
  { num: '01', title: 'Enhance Student Performance', body: 'Provide high-quality educational support that helps students improve their academic performance and reach their potential.' },
  { num: '02', title: 'Expand Access to Education', body: 'Offer flexible online and in-person learning options to meet the diverse schedules and needs of every student.' },
  { num: '03', title: 'Support Special Education', body: 'Develop specialised programmes for students with special educational needs so no child is excluded from quality learning.' },
  { num: '04', title: 'Professional Development', body: 'Provide continuous growth opportunities for teachers so that better educators produce better outcomes for students.' },
  { num: '05', title: 'Customer Satisfaction', body: 'Maintain a high level of satisfaction among students, parents, and partner schools through continuous improvement.' },
  { num: '06', title: 'Community Impact', body: 'Reduce unemployment in the education sector by creating meaningful job opportunities for educators and support staff.' },
];

const WHY = [
  {
    icon: 'target',
    title: 'Tailored Solutions',
    body: 'We do not sell packages. Every school and student is different, and the service we deliver is built around your specific goals and context.',
  },
  {
    icon: 'teacher',
    title: 'Expert Team',
    body: 'Our team includes experienced teachers, researchers, and education specialists who have worked in real classrooms, not just boardrooms.',
  },
  {
    icon: 'sprout',
    title: 'Holistic Approach',
    body: 'We look at the whole picture. Students, teachers, and school leadership all need support, and we address all three.',
  },
  {
    icon: 'chart',
    title: 'Proven Results',
    body: 'Every programme we run is built around measurable outcomes. We track results and adjust until the numbers back up what we promise.',
  },
];

const STATS = [
  { num: '30+',  label: 'CPD Programmes Delivered' },
  { num: '200+', label: 'Research Projects Completed' },
  { num: '500+', label: 'Students Supported' },
  { num: '12',   label: 'Active Services' },
];

const AboutPage = () => {
  const copy = useSiteCopy();
  const people = usePublicPeople();
  const aboutWhoBody = String(copy.about_who_body || '').split(/\n\s*\n/).filter(Boolean);

  return (
  <>
    <Nav activePage="about" />

    {/* Hero */}
    <section className="page-hero">
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <p className="overline">Our Story</p>
        <h1>About <span>RealMindX</span></h1>
        <p>{copy.about_hero_body || 'A dynamic and innovative educational solutions provider dedicated to empowering schools, teachers, and students to achieve excellence.'}</p>
        <div className="hero-breadcrumb">
          <a href="/">Home</a>
          <span>&gt;</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>About</span>
        </div>
      </div>
    </section>

    {/* Who We Are */}
    <section className="about-intro" id="who">
      <div className="container">
        <div className="about-intro-grid">
          <div className="about-intro-content">
            <p className="overline">Who We Are</p>
            <h2 className="section-title">{copy.about_who_title || 'A Company Built on a Simple Belief'}</h2>
            {(aboutWhoBody.length ? aboutWhoBody : [
              'RealMindX Education Limited is a registered Ghanaian company with a clear purpose: to make quality education available to every school, teacher, and learner who needs it.',
              'We are not a tutoring centre. We are not a staffing agency. We are a comprehensive educational services provider, covering the full lifecycle of learning.',
              'That breadth is deliberate. Education does not fail at one point. RealMindX exists to fix connected problems together.',
            ]).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <a href="/services" className="btn btn-primary">Explore Our Services</a>
              <a href="/contact"  className="btn btn-outline-navy">Get In Touch</a>
            </div>
          </div>

          {/* Image collage */}
          <div className="about-img-collage">
            <div className="about-stat-float">
              <div className="big">2024</div>
              <div className="small">Founded</div>
            </div>
            <div className="about-img-main">
              <img src={aboutMain} alt="RealMindX team working with a school" />
            </div>
            <div className="about-img-accent">
              <img src={aboutAccent} alt="RealMindX school support session" />
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Stats bar */}
    <div className="stats-bar">
      <div className="container">
        <div className="stats-bar-inner">
          {STATS.map(s => (
            <div key={s.num} className="stat-item">
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Mission, Vision, Goals */}
    <section className="mvg-section" id="mission">
      <div className="container">
        <p className="overline">Our Direction</p>
        <h2 className="section-title light">Mission, Vision & Goals</h2>

        <div className="mvg-grid">
          {/* Mission - spans full width */}
          <div className="mvg-card" id="vision">
            <div>
              <div className="mvg-icon"><Icon name="target" size={30} stroke={1.8} /></div>
              <h3>Our Mission</h3>
              <h2>What We Are Here to Do</h2>
              <p>
                To provide convenient and excellent educational services that cater to the
                diverse needs of students and teachers at all levels, through innovation,
                flexibility, and high-quality learning solutions, ensuring every client
                achieves their full potential.
              </p>
            </div>
            <div>
              <div className="mvg-icon"><Icon name="research" size={30} stroke={1.8} /></div>
              <h3>Our Vision</h3>
              <h2 style={{ fontSize: '1.4rem' }}>Where We Are Going</h2>
              <p>
                To be the leading educational agency in Ghana and beyond, known for
                setting a benchmark in the education sector by continuously improving
                our offerings and expanding our reach to impact more students and schools.
              </p>
            </div>
          </div>

          {/* Goals */}
          <div className="mvg-card" id="goals" style={{ gridColumn: '1 / -1' }}>
            <div className="mvg-icon"><Icon name="award" size={30} stroke={1.8} /></div>
            <h3>Our Goals</h3>
            <div className="mvg-goals-grid">
              {GOALS.map(g => (
                <div key={g.num} className="mvg-goal-card">
                  <div className="mvg-goal-number">{g.num}</div>
                  <h4>{g.title}</h4>
                  <p>{g.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Why Choose RealMindX */}
    <section className="why-rmx" id="choose-realmindx">
      <div className="container">
        <p className="overline">Our Edge</p>
        <h2 className="section-title">Why Schools and Families Choose RealMindX</h2>
        <p className="section-lead" style={{ marginBottom: 0 }}>
          There are many education providers in Ghana. Here is what makes us different.
        </p>
        <div className="why-grid">
          {WHY.map((w, i) => (
            <div key={w.title} className="why-card">
              <div className="why-number">{String(i + 1).padStart(2, '0')}</div>
              <div className="why-icon">
                <Icon name={w.icon} size={34} stroke={1.7} />
              </div>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Team section */}
    <section className="team-section" id="leadership">
      <div className="container">
        <p className="overline">The People</p>
        <h2 className="section-title">Our Leadership Team</h2>
        <p className="section-lead">
          A team of educators, researchers, and operators who have spent careers
          in classrooms, schools, and educational institutions across Ghana.
        </p>
        <div className="team-grid">
          {people.map((m) => (
            <div key={m.id} className="team-card">
              <div className={`team-avatar${m.img ? ' team-avatar-photo' : ''}`}>
                {m.img ? (
                  <img src={m.img} alt={`${m.name}, ${m.position}`} />
                ) : (
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '2rem', color: 'var(--navy)' }}>
                    {m.initials || 'RM'}
                  </span>
                )}
              </div>
              <div className="team-name">{m.name}</div>
              <div className="team-role">{m.position}</div>
              {m.bio && <p className="team-bio">{m.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="services-cta-banner">
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <p className="overline">Ready to Work Together?</p>
        <h2 className="section-title light">Let Us Build Something Real</h2>
        <p className="section-lead light" style={{ margin: '0 auto 32px' }}>
          Whether you are a school, a teacher, a student, or a parent, there is
          something here for you. Start the conversation today.
        </p>
        <div className="btn-row">
          <a href="/contact"  className="btn btn-primary btn-lg">Contact Us</a>
          <a href="/services" className="btn btn-outline btn-lg">View Services</a>
        </div>
      </div>
    </section>

    <Footer />
  </>
  );
};

export default AboutPage;
