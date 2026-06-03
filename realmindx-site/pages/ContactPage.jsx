import React, { useState } from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { TurnstileField } from '../../src/lib/TurnstileField.jsx';
import { submitMessage } from '../../src/lib/managedContent.js';
import { usePublicServices } from '../../src/lib/siteContent.js';

const SERVICE_OPTIONS = [
  'Teacher Recruitment',
  'Teacher Professional Development',
  'School Structuring / Restructuring',
  'Bookshop Enquiry',
  'After-School / Weekend Tutoring',
  'Research & Academic Assignments',
  'Secretarial Services',
  'Special Education Support',
  'Educational Consulting',
  'Extracurricular Activities',
  'Home Schooling Support',
  'Donation',
  'SchoolMS Demo / Enquiry',
  'General Enquiry',
];

const INITIAL = {
  firstName: '', lastName: '', email: '', phone: '',
  organisation: '', service: '', subject: '', message: '',
};

const ContactSocialIcon = ({ name }) => {
  const icons = {
    x: <path d="M4 4h4l3.2 4.5L15 4h5l-6.4 7.4L20.5 20h-4.1l-3.8-5.3L8.1 20H3l7-8.1L4 4z" fill="currentColor" stroke="none" />,
    facebook: <path d="M13 22v-8h2.8l.5-3H13V8.9c0-.9.3-1.5 1.7-1.5h1.8V4.7c-.3 0-1.5-.2-2.8-.2-2.8 0-4.7 1.7-4.7 4.8V11H6v3h3v8h4z" fill="currentColor" stroke="none" />,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" /></>,
    youtube: <><rect x="2.5" y="6" width="19" height="12" rx="3" /><path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none" /></>,
    whatsapp: <><path d="M20.5 12a8.5 8.5 0 0 1-12.7 7.4L3 21l1.6-4.7A8.5 8.5 0 1 1 20.5 12z" /><path d="M9 8.5c.4 2.9 2.6 5.1 5.5 5.5l1-1.2c.2-.2.5-.3.8-.2l1.6.5" /></>,
  };

  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
};

const ContactPage = () => {
  const managedServices = usePublicServices();
  const [form, setForm]       = useState(INITIAL);
  const [errors, setErrors]   = useState({});
  const [sent, setSent]       = useState(false);
  const [ticketReference, setTicketReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const serviceOptions = React.useMemo(() => {
    const source = managedServices.length
      ? managedServices.map(service => service.label)
      : SERVICE_OPTIONS;
    return Array.from(new Set([...source, 'Donation', 'General Enquiry']))
      .sort((a, b) => a.localeCompare(b));
  }, [managedServices]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.email.trim())     e.email = 'Email address is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Please enter a valid email.';
    if (!form.service)          e.service = 'Please select a service.';
    if (!form.message.trim())   e.message = 'Please write a message.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setLoading(true);
    try {
      const response = await submitMessage({
        name: [form.firstName, form.lastName].filter(Boolean).join(' ').trim(),
        email: form.email,
        phone: form.phone,
        subject: form.subject || form.service || 'Website enquiry',
        message: form.organisation ? `[${form.organisation}] ${form.message}` : form.message,
        service: form.service,
        turnstileToken,
      });
      setTicketReference(response?.ticket_reference || '');
      setSent(true);
    } catch (err) {
      setErrors(prev => ({ ...prev, message: err?.message || 'Could not send your message. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav activePage="contact" />

      {/* Hero */}
      <section className="page-hero contact-hero">
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <p className="overline">Get In Touch</p>
          <h1>Contact <span>Us</span></h1>
          <p>
            Have a question, need a service, or just want to talk education?
            We are ready. Send us a message and we will get back to you quickly.
          </p>
          <div className="hero-breadcrumb">
            <a href="/">Home</a>
            <span>&gt;</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>Contact</span>
          </div>
        </div>
      </section>

      {/* Main contact layout */}
      <div className="contact-layout" style={{ marginTop: 0 }}>

        {/* Form side */}
        <div className="contact-form-side" style={{ paddingTop: 72 }}>
          <p className="overline">Send a Message</p>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '2rem', marginBottom: 6 }}>
            We'd Love to Hear from You
          </h2>
          <p style={{ color: 'var(--gray-600)', marginBottom: 40, fontSize: '0.95rem' }}>
            Fill in the form below and one of our team will respond within one business day.
          </p>

          {sent ? (
            <div>
              <div className="contact-success">
                <span className="status-icon" style={{ fontSize: '1.5rem' }}><Icon name="check" size={22} stroke={2.4} /></span>
                <div>
                  <strong>Message sent!</strong>
                  <p style={{ fontWeight: 400, marginTop: 2, fontSize: '0.9rem' }}>
                    Thank you, {form.firstName}. We will be in touch shortly.
                    {ticketReference ? ` Your ticket reference is ${ticketReference}.` : ''}
                  </p>
                </div>
              </div>
              <button
                className="btn btn-outline-navy"
                onClick={() => { setForm(INITIAL); setSent(false); }}
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Kwame"
                    value={form.firstName}
                    onChange={e => update('firstName', e.target.value)}
                  />
                  {errors.firstName && <p className="form-error">{errors.firstName}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Mensah"
                    value={form.lastName}
                    onChange={e => update('lastName', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={e => update('email', e.target.value)}
                  />
                  {errors.email && <p className="form-error">{errors.email}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    className="form-input"
                    type="tel"
                    placeholder="+233 XX XXX XXXX"
                    value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">School or Organisation</label>
                <input
                  className="form-input"
                  placeholder="Your school or company name (optional)"
                  value={form.organisation}
                  onChange={e => update('organisation', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Service of Interest *</label>
                <select
                  className="form-select"
                  value={form.service}
                  onChange={e => update('service', e.target.value)}
                >
                  <option value="">Select a service...</option>
                  {serviceOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.service && <p className="form-error">{errors.service}</p>}
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  className="form-input"
                  placeholder="Brief subject line"
                  value={form.subject}
                  onChange={e => update('subject', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Message *</label>
                <textarea
                  className="form-textarea"
                  placeholder="Tell us what you need. The more detail you give, the better we can help."
                  rows={5}
                  value={form.message}
                  onChange={e => update('message', e.target.value)}
                />
                {errors.message && <p className="form-error">{errors.message}</p>}
              </div>

              <TurnstileField className="turnstile-slot" onVerify={setTurnstileToken} />

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Sending...' : 'Send Message'}
              </button>

              <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', textAlign: 'center', marginTop: 12 }}>
                We respect your privacy. Your details will never be shared with third parties.
              </p>
            </form>
          )}
        </div>

        {/* Info side */}
        <div className="contact-info-side">
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p className="overline" style={{ marginBottom: 12 }}>Find Us</p>
            <h2 style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)',
              color: 'var(--white)',
              lineHeight: 1.2,
              marginBottom: 40,
            }}>
              We Are Right<br />Here for You
            </h2>

            <div className="contact-info-item">
              <div className="cii-icon"><Icon name="mapPin" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Our Address</p>
                <p className="cii-value">Dome Pillar 2, Accra, Ghana</p>
              </div>
            </div>

            <div className="contact-info-item">
              <div className="cii-icon"><Icon name="mail" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Email Us</p>
                <p className="cii-value">
                  <a href="mailto:info@realmindxgh.com" style={{ color: 'var(--white)' }}>
                    info@realmindxgh.com
                  </a>
                </p>
              </div>
            </div>

            <div className="contact-info-item">
              <div className="cii-icon"><Icon name="phone" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Call Us</p>
                <div className="cii-value">
                  <div><a href="tel:+233558039190" style={{ color: 'var(--white)' }}>+233 55 803 9190</a></div>
                  <div><a href="tel:+233554529493" style={{ color: 'var(--white)' }}>+233 55 452 9493</a></div>
                  <div><a href="tel:+233551324729" style={{ color: 'var(--white)' }}>+233 55 132 4729</a></div>
                </div>
              </div>
            </div>

            <div className="contact-info-item">
              <div className="cii-icon"><Icon name="clock" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Working Hours</p>
                <p className="cii-value">Monday - Friday: 8:00am - 5:00pm</p>
                <p className="cii-value">Saturday: 9:00am - 1:00pm</p>
              </div>
            </div>

            <div className="contact-divider" />

            <p className="contact-social-title">Follow Us</p>
            <div className="contact-social-links">
              <a href="https://x.com/RealMindXgh" target="_blank" rel="noreferrer" title="Twitter/X"><ContactSocialIcon name="x" /></a>
              <a href="https://web.facebook.com/profile.php?id=61566941171883" target="_blank" rel="noreferrer" title="Facebook"><ContactSocialIcon name="facebook" /></a>
              <a href="https://www.instagram.com/realmindxgh/" target="_blank" rel="noreferrer" title="Instagram"><ContactSocialIcon name="instagram" /></a>
              <a href="https://www.youtube.com/@realmindxgh" target="_blank" rel="noreferrer" title="YouTube"><ContactSocialIcon name="youtube" /></a>
              <a href="https://wa.link/d6x888" target="_blank" rel="noreferrer" title="WhatsApp"><ContactSocialIcon name="whatsapp" /></a>
            </div>

            <div className="contact-map-card">
              <iframe
                title="RealMindX Education location at Dome Pillar 2, Accra"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3970.4149449183387!2d-0.21959702603021514!3d5.652959532669197!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xfdf9d0d971fa545%3A0xb6793ef61afc720f!2sDome%20pillar%202!5e0!3m2!1sen!2sgh!4v1780224663665!5m2!1sen!2sgh"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default ContactPage;
