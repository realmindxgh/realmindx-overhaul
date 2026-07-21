import React, { useState } from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { TurnstileField } from '../../src/lib/TurnstileField.jsx';
import { submitMessage } from '../../src/lib/managedContent.js';
import { usePublicServices, usePublicSettings } from '../../src/lib/siteContent.js';

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
    whatsapp: <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" fill="currentColor" stroke="none" />,
  };

  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
};

const ContactPage = () => {
  const managedServices = usePublicServices();
  const settings = usePublicSettings();
  const phones = [
    settings.contact_phone_1,
    settings.contact_phone_2,
    settings.contact_phone_3,
  ].filter(Boolean);
  const mapSrc = settings.contact_address
    ? `https://www.google.com/maps?q=${encodeURIComponent(settings.contact_address)}&output=embed`
    : settings.contact_map_embed;
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

            {settings.contact_address && <div className="contact-info-item">
              <div className="cii-icon"><Icon name="mapPin" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Our Address</p>
                <p className="cii-value">{settings.contact_address}</p>
              </div>
            </div>}

            {settings.contact_email && <div className="contact-info-item">
              <div className="cii-icon"><Icon name="mail" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Email Us</p>
                <p className="cii-value">
                  <a href={`mailto:${settings.contact_email}`} style={{ color: 'var(--white)' }}>
                    {settings.contact_email}
                  </a>
                </p>
              </div>
            </div>}

            {phones.length > 0 && (
              <div className="contact-info-item">
                <div className="cii-icon"><Icon name="phone" size={21} stroke={1.8} /></div>
                <div>
                  <p className="cii-label">Call Us</p>
                  <div className="cii-value">
                    {phones.map(phone => (
                      <div key={phone}>
                        <a href={`tel:${phone.replace(/\s/g, '')}`} style={{ color: 'var(--white)' }}>
                          {phone}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(settings.working_hours_weekday || settings.working_hours_saturday) && <div className="contact-info-item">
              <div className="cii-icon"><Icon name="clock" size={21} stroke={1.8} /></div>
              <div>
                <p className="cii-label">Working Hours</p>
                {settings.working_hours_weekday && <p className="cii-value">{settings.working_hours_weekday}</p>}
                {settings.working_hours_saturday && <p className="cii-value">{settings.working_hours_saturday}</p>}
              </div>
            </div>}

            <div className="contact-divider" />

            <p className="contact-social-title">Follow Us</p>
            <div className="contact-social-links">
              <a href="https://x.com/RealMindXgh" target="_blank" rel="noreferrer" title="Twitter/X"><ContactSocialIcon name="x" /></a>
              <a href="https://web.facebook.com/profile.php?id=61566941171883" target="_blank" rel="noreferrer" title="Facebook"><ContactSocialIcon name="facebook" /></a>
              <a href="https://www.instagram.com/realmindxgh/" target="_blank" rel="noreferrer" title="Instagram"><ContactSocialIcon name="instagram" /></a>
              <a href="https://www.youtube.com/@realmindxgh" target="_blank" rel="noreferrer" title="YouTube"><ContactSocialIcon name="youtube" /></a>
              <a href="https://wa.link/d6x888" target="_blank" rel="noreferrer" title="WhatsApp"><ContactSocialIcon name="whatsapp" /></a>
            </div>

            {mapSrc && (
              <div className="contact-map-card">
                <iframe
                  title={`${settings.contact_address} map`}
                  src={mapSrc}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default ContactPage;
