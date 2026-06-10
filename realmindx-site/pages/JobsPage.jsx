import React, { useState } from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { publicItems, useManagedCollection, JOB_LEVELS as LEVELS, JOB_SUBJECTS as SUBJECTS, JOB_TYPES } from '../../src/lib/managedContent.js';
import { isApiMode, api } from '../../src/lib/apiClient.js';
import { Icon } from '../assets/components.jsx';
import { getDemoSession } from '../../src/lib/demoAccounts.js';
import { syncSessionFromApi } from '../../src/lib/authClient.js';

/* â”€â”€ Sample data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SAMPLE_JOBS = [
  {
    id: 1, title: 'Mathematics Teacher (JHS)', school: 'Annan House Community School',
    location: 'Dome, Accra', type: 'Full-time', level: 'JHS', subject: 'Mathematics',
    salary: 'GH 2,500 - 3,500 / month', posted: '2 days ago', deadline: '31 Jun 2026',
    description: 'We are looking for a dedicated and experienced Mathematics teacher to join our Junior High School department. The successful candidate will deliver engaging lessons, track student progress, and collaborate with colleagues to raise academic standards.',
    requirements: ['BSc Ed or BA Ed in Mathematics or related field', 'Valid NTC Teaching License', 'Minimum 2 years classroom experience', 'Strong communication and classroom management skills'],
    responsibilities: ['Plan and deliver effective lessons aligned with the national curriculum', 'Assess, record, and report student progress', 'Participate in CPD programmes and staff meetings', 'Support students with diverse learning needs'],
    logo: 'AH',
  },
  {
    id: 2, title: 'English Language Teacher (Primary)', school: 'Grace Valley School',
    location: 'Adenta, Accra', type: 'Full-time', level: 'Primary', subject: 'English',
    salary: 'GH 2,000 - 2,800 / month', posted: '5 days ago', deadline: '15 Jun 2026',
    description: 'Grace Valley School is seeking an enthusiastic Primary English Language Teacher to inspire a love of reading and writing in young learners.',
    requirements: ['Degree in English Education or related field', 'NTC License', 'Experience with primary learners', 'Creative and patient approach'],
    responsibilities: ['Teach English Language from Primary 1 to Primary 6', 'Design creative literacy activities', 'Liaise with parents on student progress'],
    logo: 'GV',
  },
  {
    id: 3, title: 'Science Teacher (SHS)', school: 'Lighthouse International School',
    location: 'East Legon, Accra', type: 'Full-time', level: 'SHS', subject: 'Science',
    salary: 'GH 3,500 - 5,000 / month', posted: '1 week ago', deadline: '30 Jun 2026',
    description: "An exciting opportunity for a Science teacher at one of Accra's leading international schools. Laboratory facilities are world-class and professional development is strongly supported.",
    requirements: ['BSc Ed in Science or Pure Science degree with PGDE', 'NTC License', 'Strong practical science background', '3+ years experience preferred'],
    responsibilities: ['Teach Physics, Chemistry, or Biology at SHS level', 'Manage laboratory sessions safely', 'Prepare students for WASSCE examinations'],
    logo: 'LI',
  },
  {
    id: 4, title: 'ICT Teacher (JHS/SHS)', school: 'New Generation Academy',
    location: 'Kasoa, Central Region', type: 'Full-time', level: 'JHS/SHS', subject: 'ICT',
    salary: 'GH 2,200 - 3,000 / month', posted: '3 days ago', deadline: '20 Jun 2026',
    description: 'New Generation Academy seeks a tech-savvy ICT Teacher to lead digital education across the school.',
    requirements: ['Degree in Computer Science, ICT Education, or related field', 'NTC License preferred', 'Proficiency in Microsoft Office, coding basics'],
    responsibilities: ['Deliver ICT curriculum at JHS and SHS levels', 'Maintain computer lab equipment', 'Run after-school coding and robotics clubs'],
    logo: 'NG',
  },
  {
    id: 5, title: 'Special Education Coordinator', school: 'RealMindX Partner School',
    location: 'Accra (Flexible)', type: 'Part-time', level: 'All Levels', subject: 'Special Needs',
    salary: 'GH 1,800 - 2,500 / month', posted: '1 day ago', deadline: '10 Jul 2026',
    description: 'RealMindX Education is recruiting a Special Education Coordinator to work across partner schools, supporting inclusive education practices and IEP development.',
    requirements: ['Degree in Special Education or Psychology', 'Experience with IEP development', 'Training in inclusive classroom strategies', 'Strong interpersonal skills'],
    responsibilities: ['Coordinate special education support across partner schools', 'Develop and review Individual Education Plans', 'Train classroom teachers on inclusive practice'],
    logo: 'RX',
  },
  {
    id: 6, title: 'French Teacher (Primary & JHS)', school: 'La Bonne Ecole',
    location: 'Labadi, Accra', type: 'Full-time', level: 'Primary/JHS', subject: 'French',
    salary: 'GH 2,300 - 3,200 / month', posted: '4 days ago', deadline: '25 Jun 2026',
    description: 'A bilingual school in Labadi is seeking a qualified French teacher for Primary and JHS classes.',
    requirements: ['Degree in French Education or Modern Languages', 'Fluent French speaker', 'NTC License or equivalent'],
    responsibilities: ['Deliver French language instruction', 'Organise French cultural events and language clubs'],
    logo: 'LB',
  },
];

/* â”€â”€ Empty / status states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const LoadingJobs = () => (
  <div style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)' }}>
    <div className="jobs-loading-spinner" />
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '1.2rem', color: 'var(--navy)', marginBottom: 8 }}>
      Loading Jobs...
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>
      Fetching the latest teaching vacancies for you.
    </p>
  </div>
);

const EmptyJobs = ({ onClear }) => (
  <div style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)' }}>
    <div style={{ fontSize: '3.5rem', marginBottom: 16, color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="search" size={52} stroke={1.6} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '1.2rem', color: 'var(--navy)', marginBottom: 8 }}>
      No Jobs Match Your Filters
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>
      Try adjusting your search or clearing some filters to see more opportunities.
    </p>
    <button className="btn btn-outline-navy" onClick={onClear}>Clear All Filters</button>
  </div>
);

const NoJobsAvailable = ({ isLoggedIn = false }) => (
  <div style={{ textAlign: 'center', padding: '80px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)' }}>
    <div style={{ fontSize: '3.5rem', marginBottom: 16, color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="clipboard" size={52} stroke={1.6} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '1.2rem', color: 'var(--navy)', marginBottom: 8 }}>
      No Jobs Posted Yet
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
      New teaching positions are added regularly. Set up a job alert so you are first to know.
    </p>
    <a href={isLoggedIn ? '/portal?view=alerts' : '/register'} className="btn btn-primary">Set Up Job Alerts</a>
  </div>
);

const JobAlertModal = ({ onDismiss, isLoggedIn = false }) => (
  <div className="job-modal-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
    <div className="job-alert-modal">
      <button className="job-alert-modal-close" onClick={onDismiss} aria-label="Close">
        <Icon name="x" size={16} stroke={2.2} />
      </button>
      <div className="job-alert-modal-icon"><Icon name="bell" size={26} stroke={2} /></div>
      <h3>Never Miss a Job</h3>
      <p>Create an account and set your subject and level preferences. We will alert you the moment a matching job is posted.</p>
      <div className="job-alert-modal-actions">
        <a href={isLoggedIn ? '/portal?view=alerts' : '/register'} className="btn btn-primary" onClick={onDismiss}>Set Up Alerts</a>
        <button className="btn btn-outline-navy" onClick={onDismiss}>Maybe Later</button>
      </div>
    </div>
  </div>
);

/* â”€â”€ Apply states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ApplyStateNotLoggedIn = ({ job, onClose }) => (
  <div className="job-apply-state">
    <div style={{ fontSize: '2.5rem', marginBottom: 12, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="lock" size={44} stroke={1.7} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8, fontSize: '1.1rem' }}>
      Create an Account to Apply
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', marginBottom: 24, lineHeight: 1.65 }}>
      To apply for <strong>{job.title}</strong>, you need a free RealMindX account.
      It only takes two minutes, and you can apply to all jobs with the same profile.
    </p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      <a href="/register" className="btn btn-primary">Create Free Account</a>
      <a href="/login" className="btn btn-outline-navy">Sign In</a>
    </div>
    <button onClick={onClose} style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--gray-600)', fontSize: '0.82rem', cursor: 'pointer' }}>
      Cancel
    </button>
  </div>
);

const ApplyStateProfileIncomplete = ({ missing = [], onClose }) => (
  <div className="job-apply-state">
    <div style={{ fontSize: '2.5rem', marginBottom: 12, display: 'inline-flex', color: 'var(--warning)' }}><Icon name="warning" size={44} stroke={1.7} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8, fontSize: '1.1rem' }}>
      Complete Your Profile First
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', marginBottom: 20 }}>
      Before you can apply, please add the following to your profile:
    </p>
    <div style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
      {missing.map(m => (
        <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.85rem', color: '#92400e' }}>
          <Icon name="warning" size={15} stroke={2} /> <span>{m}</span>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      <a href="/portal/profile" className="btn btn-primary">Complete Profile</a>
      <button className="btn btn-outline-navy" onClick={onClose}>Later</button>
    </div>
  </div>
);

const ApplyStateEmailNotVerified = ({ onResend, onClose }) => (
  <div className="job-apply-state">
    <div style={{ fontSize: '2.5rem', marginBottom: 12, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="mail" size={44} stroke={1.7} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8, fontSize: '1.1rem' }}>
      Verify Your Email First
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', marginBottom: 24, lineHeight: 1.65 }}>
      We sent a verification link to your email address. Please click the link in that email before you can apply for jobs.
    </p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-primary" onClick={onResend}>Resend Verification Email</button>
      <button className="btn btn-outline-navy" onClick={onClose}>Close</button>
    </div>
  </div>
);

const ApplyStateSuccess = ({ job, onClose }) => (
  <div className="job-apply-state">
    <div style={{ width: 64, height: 64, background: 'var(--success-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto 16px' }}>
      <Icon name="check" size={30} stroke={2.4} />
    </div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8, fontSize: '1.1rem' }}>
      Application Submitted!
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', marginBottom: 8 }}>
      Your application for <strong>{job.title}</strong> at <strong>{job.school}</strong> has been received.
    </p>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', marginBottom: 24 }}>
      We will notify you by email when the school reviews your application.
    </p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      <a href="/portal/applications" className="btn btn-primary">Track My Application</a>
      <button className="btn btn-outline-navy" onClick={onClose}>Browse More Jobs</button>
    </div>
  </div>
);

const ApplyStateError = ({ message, onClose }) => (
  <div className="job-apply-state">
    <div style={{ fontSize: '2.5rem', marginBottom: 12, display: 'inline-flex', color: 'var(--danger)' }}><Icon name="warning" size={44} stroke={1.7} /></div>
    <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8, fontSize: '1.1rem' }}>
      Application Could Not Be Sent
    </h3>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem', marginBottom: 24, lineHeight: 1.65 }}>
      {message || 'Please try again. If the problem continues, contact RealMindX support.'}
    </p>
    <button className="btn btn-outline-navy" onClick={onClose}>Close</button>
  </div>
);

/* â”€â”€ Job Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const JobCard = ({ job, onOpen }) => (
  <div className="job-card" onClick={() => onOpen(job)}>
    <div className="job-card-header">
      <div>
        <div className="job-card-title">{job.title}</div>
        <div className="job-card-school">{job.school}</div>
      </div>
      <div className="job-school-logo">{job.logo}</div>
    </div>
    <div className="job-card-meta">
      <span className="job-meta-tag"><Icon name="mapPin" size={13} stroke={2} /> {job.location}</span>
      <span className="job-meta-tag"><Icon name="teacher" size={13} stroke={2} /> {job.level}</span>
      <span className="job-meta-tag"><Icon name="book" size={13} stroke={2} /> {job.subject}</span>
      <span className="badge badge-navy">{job.type}</span>
    </div>
    <p className="job-card-desc">{job.description}</p>
    <div className="job-card-footer">
      {job.deadline
        ? <span className="job-deadline">Closes {job.deadline}</span>
        /* keep an empty flex item so `justify-content: space-between` still pins
           the posted-date/apply-button group to the right when there's no deadline */
        : <span />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{job.posted}</span>
        <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onOpen(job); }}>
          View & Apply
        </button>
      </div>
    </div>
  </div>
);

/* â”€â”€ Job Detail Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const JobModal = ({ job, onClose, applyState, applyError, onApply }) => {
  if (!job) return null;
  const showApplyForm = !['not-logged-in','profile-incomplete','email-not-verified','success','error'].includes(applyState);

  return (
    <div className="job-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="job-modal">
        <div className="job-modal-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2>{job.title}</h2>
              <p>{job.school} - {job.location}</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--white)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="x" size={17} stroke={2.2} />
            </button>
          </div>
        </div>

        {/* Render apply flow state if active */}
        {applyState === 'not-logged-in'        && <ApplyStateNotLoggedIn job={job} onClose={onClose} />}
        {applyState === 'profile-incomplete'   && <ApplyStateProfileIncomplete missing={['Upload your CV', 'Add your phone number', 'Select your teaching subject']} onClose={onClose} />}
        {applyState === 'email-not-verified'   && <ApplyStateEmailNotVerified onResend={() => {}} onClose={onClose} />}
        {applyState === 'success'              && <ApplyStateSuccess job={job} onClose={onClose} />}
        {applyState === 'error'                && <ApplyStateError message={applyError} onClose={onClose} />}

        {showApplyForm && (
          <div className="job-modal-body">
            <div className="job-modal-meta">
              <span className="badge badge-navy">{job.type}</span>
              <span className="job-meta-tag"><Icon name="teacher" size={13} stroke={2} /> {job.level}</span>
              <span className="job-meta-tag"><Icon name="book" size={13} stroke={2} /> {job.subject}</span>
              <span className="job-meta-tag"><Icon name="money" size={13} stroke={2} /> {job.salary}</span>
              {job.deadline && <span className="job-meta-tag"><Icon name="clock" size={13} stroke={2} /> Closes {job.deadline}</span>}
            </div>

            <div className="job-modal-section">
              <h4>About this Role</h4>
              <p>{job.description}</p>
            </div>

            <div className="job-modal-section">
              <h4>Responsibilities</h4>
              <ul>{job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>

            <div className="job-modal-section">
              <h4>Requirements</h4>
              <ul>{job.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          </div>
        )}

        {showApplyForm && (
          <div className="job-modal-footer">
            <button className="btn btn-outline-navy" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={onApply} disabled={applyState === 'submitting'}>
              {applyState === 'submitting' ? 'Submitting...' : 'Apply for this Job'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Admin enters requirements/responsibilities as one item per line (Text column);
// sample/seed jobs already provide arrays. Normalise both to an array of strings.
const splitLines = value => (
  Array.isArray(value)
    ? value
    : String(value || '').split('\n').map(line => line.trim()).filter(Boolean)
);

const formatSalary = job => {
  if (job.salary) return job.salary;
  const currency = job.salary_currency || 'GHS';
  const { salary_min: min, salary_max: max } = job;
  const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (min != null && max != null) return `${currency} ${fmt(min)} - ${fmt(max)} / month`;
  if (min != null) return `From ${currency} ${fmt(min)} / month`;
  if (max != null) return `Up to ${currency} ${fmt(max)} / month`;
  return 'Available on request';
};

// Admin saves deadlines as ISO (YYYY-MM-DD) via DatePickerField; sample/seed jobs already
// provide pre-formatted "D MMM YYYY" strings. Normalise both to the same display format,
// parsing the ISO date as local Y/M/D components to avoid UTC off-by-one shifts.
const formatDeadline = deadline => {
  if (!deadline) return '';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (!isoMatch) return deadline;
  const [, y, m, d] = isoMatch;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const normaliseJob = (job) => ({
  ...job,
  school: job.school || job.organisation,
  type: job.type || job.employment_type,
  requirements: splitLines(job.requirements),
  responsibilities: splitLines(job.responsibilities),
  salary: formatSalary(job),
  deadline: formatDeadline(job.deadline),
  logo: job.logo || (job.organisation || job.school || 'RM').substring(0, 2).toUpperCase(),
  posted: job.posted || (job.created_at ? new Date(job.created_at).toLocaleDateString() : ''),
});

const JOB_ALERT_MODAL_KEY = 'rmx-jobs-alert-modal-dismissed';

/* â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const JobsPage = () => {
  const managedJobs = publicItems(useManagedCollection('jobs'));
  const [apiJobs, setApiJobs] = React.useState(null);
  const [session, setSession] = React.useState(() => getDemoSession());

  React.useEffect(() => {
    if (!isApiMode()) return;
    api.fetchProducts && api.fetchProducts; // ensure client is initialised
    fetch('/api/jobs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setApiJobs((data.items || []).map(normaliseJob)))
      .catch(() => setApiJobs([]));
  }, []);

  React.useEffect(() => {
    let alive = true;
    const refresh = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    syncSessionFromApi().then(freshSession => {
      if (alive) setSession(freshSession);
    });
    return () => {
      alive = false;
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const isLoadingJobs = isApiMode() && apiJobs === null;
  const rawJobs = isApiMode()
    ? (apiJobs || [])
    : (managedJobs.length ? managedJobs : SAMPLE_JOBS);

  const jobs = rawJobs.map(normaliseJob);
  const isTeacherLoggedIn = session?.role === 'user';
  const [search,      setSearch]      = useState('');
  const [filters,     setFilters]     = useState({ type: [], subject: [], level: [] });
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyState,  setApplyState]  = useState('idle');
  const [applyError,  setApplyError]  = useState('');
  const [showAlertModal, setShowAlertModal] = useState(() => {
    try { return localStorage.getItem(JOB_ALERT_MODAL_KEY) !== '1'; } catch { return true; }
  });

  const dismissAlertModal = () => {
    setShowAlertModal(false);
    try { localStorage.setItem(JOB_ALERT_MODAL_KEY, '1'); } catch {}
  };

  // Filter logic
  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q || j.title.toLowerCase().includes(q) || j.school.toLowerCase().includes(q) || j.subject.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
    const matchType    = !filters.type.length    || filters.type.includes(j.type);
    const matchSubject = !filters.subject.length || filters.subject.includes(j.subject);
    const matchLevel   = !filters.level.length   || filters.level.includes(j.level);
    return matchSearch && matchType && matchSubject && matchLevel;
  });

  const toggleFilter = (group, value) => {
    setFilters(prev => ({
      ...prev,
      [group]: prev[group].includes(value)
        ? prev[group].filter(v => v !== value)
        : [...prev[group], value],
    }));
  };

  const clearFilters = () => { setFilters({ type: [], subject: [], level: [] }); setSearch(''); };

  const openJob = (job) => { setSelectedJob(job); setApplyState('idle'); setApplyError(''); };

  const handleApply = async () => {
    if (!isTeacherLoggedIn) {
      setApplyState('not-logged-in');
      return;
    }
    if (!selectedJob?.id) return;
    if (!isApiMode()) {
      setApplyState('success');
      return;
    }
    setApplyState('submitting');
    try {
      await api.applyForJob(selectedJob.id);
      setApplyState('success');
    } catch (err) {
      if (err?.status === 401) {
        setApplyState('not-logged-in');
      } else if (err?.status === 403 && /verify/i.test(err.message || '')) {
        setApplyState('email-not-verified');
      } else if (err?.status === 409) {
        setApplyState('success');
      } else {
        setApplyError(err?.message || 'Application could not be submitted.');
        setApplyState('error');
      }
    }
  };

  const hasActiveFilters = filters.type.length || filters.subject.length || filters.level.length || search;

  return (
    <>
      <Nav activePage="jobs" />

      {/* Hero */}
      <section className="page-hero">
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <p className="overline">Teaching Careers in Ghana</p>
          <h1>Find Your Next<br /><span>Teaching Role</span></h1>
          <p>RealMindX connects passionate educators with schools that are ready for them. Browse current vacancies and apply in minutes.</p>
          <div className="hero-breadcrumb">
            <a href="/">Home</a><span>&gt;</span>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>Teaching Jobs</span>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="container">
        <div className="jobs-layout">

          {/* Filters sidebar */}
          <aside className="jobs-filters">
            <div className="filter-card">
              <h4>Job Type</h4>
              {JOB_TYPES.map(t => (
                <div key={t} className="filter-option">
                  <input type="checkbox" id={`type-${t}`} checked={filters.type.includes(t)} onChange={() => toggleFilter('type', t)} />
                  <label htmlFor={`type-${t}`}>{t}</label>
                  <span className="count">{jobs.filter(j => j.type === t).length}</span>
                </div>
              ))}
            </div>

            <div className="filter-card">
              <h4>Level</h4>
              {LEVELS.map(l => (
                <div key={l} className="filter-option">
                  <input type="checkbox" id={`lvl-${l}`} checked={filters.level.includes(l)} onChange={() => toggleFilter('level', l)} />
                  <label htmlFor={`lvl-${l}`}>{l}</label>
                </div>
              ))}
            </div>

            <div className="filter-card">
              <h4>Subject</h4>
              {SUBJECTS.map(s => (
                <div key={s} className="filter-option">
                  <input type="checkbox" id={`sub-${s}`} checked={filters.subject.includes(s)} onChange={() => toggleFilter('subject', s)} />
                  <label htmlFor={`sub-${s}`}>{s}</label>
                </div>
              ))}
            </div>

            {hasActiveFilters && (
              <button className="btn btn-outline-navy" onClick={clearFilters} style={{ width: '100%', justifyContent: 'center' }}>
                Clear All Filters
              </button>
            )}
          </aside>

          {/* Main content */}
          <main>
            {/* Search bar */}
            <div className="jobs-search-bar">
              <span style={{ color: 'var(--gray-600)', fontSize: '1.1rem' }}><Icon name="search" size={18} stroke={2} /></span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, school, subject, or location..."
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--gray-600)', cursor: 'pointer', fontSize: '1rem' }}><Icon name="x" size={15} stroke={2.1} /></button>
              )}
            </div>

            {/* Results header */}
            {!isLoadingJobs && (
              <div className="jobs-main-header">
                <p className="jobs-count">
                  Showing <strong>{filtered.length}</strong> of <strong>{jobs.length}</strong> jobs
                </p>
                <div className="jobs-sort">
                  <label style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>Sort by</label>
                  <select>
                    <option>Most Recent</option>
                    <option>Deadline</option>
                    <option>Level</option>
                  </select>
                </div>
              </div>
            )}

            {/* Job list, loading, or empty state */}
            {isLoadingJobs
              ? <LoadingJobs />
              : filtered.length === 0
                ? (hasActiveFilters ? <EmptyJobs onClear={clearFilters} /> : <NoJobsAvailable isLoggedIn={isTeacherLoggedIn} />)
                : filtered.map(job => (
                    <JobCard key={job.id} job={job} onOpen={openJob} />
                  ))
            }

            {filtered.length > 0 && (
              <div className="pagination">
                {[1, 2, 3].map(n => (
                  <button key={n} className={`pag-btn${n === 1 ? ' active' : ''}`}>{n}</button>
                ))}
                <button className="pag-btn">&gt;</button>
              </div>
            )}
          </main>
        </div>
      </div>

      <Footer />

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          applyState={applyState}
          applyError={applyError}
          onApply={handleApply}
        />
      )}

      {/* "Never Miss a Job" one-time alert modal */}
      {showAlertModal && !selectedJob && (
        <JobAlertModal isLoggedIn={isTeacherLoggedIn} onDismiss={dismissAlertModal} />
      )}
    </>
  );
};

export default JobsPage;
