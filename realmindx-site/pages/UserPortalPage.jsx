import React, { useState } from 'react';
import { Icon, DatePickerField } from '../assets/components.jsx';
import logoWhite from '../assets/logo-white.png';
import { clearDemoSession, getDemoSession, saveDemoSession } from '../../src/lib/demoAccounts.js';
import { signOut } from '../../src/lib/authClient.js';
import { queueToast } from '../../src/lib/toast.js';
import { api, isApiMode } from '../../src/lib/apiClient.js';
import { useCropUpload } from '../../src/lib/useCropUpload.jsx';

// Splits a comma-joined multi-select value (e.g. "Mathematics, Physics, ICT")
// into trimmed, non-empty parts. Mirrors the `.join(', ')` used whenever a
// multi-select field (teaching subjects, curricula, levels, work types) is
// saved, so the same string can be safely round-tripped for editing or split
// back out into individual badges for display.
const splitMulti = (raw = '') => raw.split(',').map(s => s.trim()).filter(Boolean);

// CV Tutorial video card — YouTube URL is configurable via admin Site Settings (key: cv_tutorial_url)
const CV_TUTORIAL_FALLBACK_URL = '';  // set a YouTube embed URL here once you have one, e.g. 'https://www.youtube.com/embed/XXXXXXXXXXX'

const CvTutorialCard = () => {
  const [embedUrl, setEmbedUrl] = React.useState(CV_TUTORIAL_FALLBACK_URL);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!isApiMode()) return;
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const url = data.settings?.cv_tutorial_url;
        if (url) setEmbedUrl(url);
      })
      .catch(() => {});
  }, []);

  if (!embedUrl || dismissed) return null;

  // Convert watch URL to embed URL if needed
  const src = embedUrl.includes('youtube.com/watch?v=')
    ? embedUrl.replace('watch?v=', 'embed/').split('&')[0]
    : embedUrl;

  return (
    <div className="profile-section-card" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', color: '#fff', position: 'relative' }}>
      <button onClick={() => setDismissed(true)}
        style={{ position:'absolute', top:12, right:14, background:'none', border:'none', color:'rgba(255,255,255,0.6)', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }} aria-label="Dismiss">
        <Icon name="x" size={18} stroke={2.4} />
      </button>
      <div style={{ display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 280px' }}>
          <p style={{ fontFamily:"'Montserrat',sans-serif", fontWeight:800, fontSize:'0.7rem', letterSpacing:2, textTransform:'uppercase', color:'var(--yellow)', marginBottom:8 }}>
            CV Guide by RealMindX
          </p>
          <h3 style={{ color:'#fff', fontFamily:"'Montserrat',sans-serif", fontWeight:800, fontSize:'1.1rem', marginBottom:10 }}>
            How to Write a Standout Teaching CV
          </h3>
          <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'0.87rem', lineHeight:1.65, marginBottom:16 }}>
            Watch our step-by-step tutorial to build a professional CV that gets you noticed by schools in Ghana. Covers structure, subject matching, and what hiring managers look for.
          </p>
          <a href={embedUrl.replace('/embed/', '/watch?v=')} target="_blank" rel="noreferrer"
            className="btn btn-primary btn-sm">Open on YouTube</a>
        </div>
        <div style={{ flex:'1 1 340px', borderRadius:12, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.3)', minHeight:200 }}>
          <iframe
            src={src}
            title="CV Tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width:'100%', aspectRatio:'16/9', border:'none', display:'block' }}
          />
        </div>
      </div>
    </div>
  );
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   MOCK USER - swap with real auth context later
   isNew: true  = first-time user / empty state
   isNew: false = returning user with data
   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const MOCK_USER = {
  isNew: false, // toggle to true to preview new-user state
  firstName: 'Kwame',
  lastName: 'Mensah',
  email: 'kwame.mensah@gmail.com',
  phone: '+233 24 567 8901',
  location: 'Accra, Ghana',
  subject: 'Mathematics',
  level: 'JHS / SHS',
  profileComplete: 72,
  emailVerified: true,
  hasCV: true,
  hasCerts: true,
  initials: 'KM',
  avatarUrl: null, // replace with real URL when available
};

const MOCK_APPLICATIONS = [];
const MOCK_ALERTS = [];

/* â”€â”€ Status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const StatusBadge = ({ status }) => {
  const map = {
    pending:  { cls: 'badge-warning', label: 'Under Review' },
    accepted: { cls: 'badge-success', label: 'Accepted'     },
    rejected: { cls: 'badge-danger',  label: 'Not Shortlisted' },
    withdrawn:{ cls: 'badge-navy',    label: 'Withdrawn'    },
  };
  const { cls, label } = map[status] || { cls: 'badge-navy', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
};

/* â”€â”€ Empty / loading states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const EmptyApplications = () => (
  <div style={{ textAlign: 'center', padding: '60px 24px' }}>
    <div style={{ fontSize: '3rem', marginBottom: 12, color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="clipboard" size={48} stroke={1.6} /></div>
    <h4 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8 }}>No Applications Yet</h4>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', maxWidth: 300, margin: '0 auto 20px' }}>
      When you apply for teaching jobs, your applications will appear here with live status updates.
    </p>
    <a href="/jobs" className="btn btn-primary btn-sm">Browse Teaching Jobs</a>
  </div>
);

const EmptyAlerts = ({ onAdd }) => (
  <div style={{ textAlign: 'center', padding: '60px 24px' }}>
    <div style={{ fontSize: '3rem', marginBottom: 12, color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="bell" size={48} stroke={1.6} /></div>
    <h4 style={{ fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)', marginBottom: 8 }}>No Job Alerts Set Up</h4>
    <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', maxWidth: 320, margin: '0 auto 20px' }}>
      Set up alerts for your subject and preferred level. We will notify you instantly when a matching job is posted.
    </p>
    <button className="btn btn-primary btn-sm" onClick={onAdd}>Create Job Alert</button>
  </div>
);

const LoadingRows = ({ n = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ height: 64, background: 'var(--gray-100)', borderRadius: 8, animation: 'pulse 1.5s ease infinite' }} />
    ))}
    <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
  </div>
);

const formatDate = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const normaliseApplication = item => {
  const job = item.job || {};
  return {
    id: item.id,
    title: item.title || job.title || 'Teaching Application',
    school: item.school || job.organisation || job.school || 'RealMindX partner school',
    organisation: job.organisation || item.organisation || '',
    logo: (job.organisation || item.school || 'RM').slice(0, 2).toUpperCase(),
    applied: formatDate(item.created_at || item.applied_at || item.applied),
    status: item.status || 'pending',
  };
};

const normaliseAlert = pref => {
  if (!pref) return null;
  return {
    id: 'primary',
    subject: pref.subject || 'Any subject',
    level: pref.preferred_level || pref.level || 'Any level',
    location: pref.location || 'Any location',
    employmentType: pref.employment_type || 'Any type',
    frequency: pref.frequency || 'instant',
    active: pref.alert_by_email !== false,
  };
};

const completionFromProfile = profile => {
  const checks = [
    profile?.email || profile?.first_name,
    profile?.phone,
    profile?.location,
    profile?.teaching_subject,
    profile?.preferred_level,
    profile?.preferred_employment_type,
    profile?.curriculum_experience,
    profile?.cv_file_id,
    profile?.certificate_file_id,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

/* â”€â”€ Profile completion checklist (new user) â”€â”€â”€â”€â”€â”€â”€ */
const ProfileChecklist = ({ user, setActive, onAction, hasJobAlert = false }) => {
  const steps = [
    { label: 'Email verified',            done: user.emailVerified, view: null,          icon: 'mail',  action: null            },
    { label: 'Add your phone number',     done: !!user.phone,       view: 'profile',     icon: 'phone', action: 'edit-personal' },
    { label: 'Set teaching subject',      done: !!user.subject,     view: 'profile',     icon: 'book',  action: 'edit-teaching' },
    { label: 'Upload your CV',            done: user.hasCV,         view: 'documents',   icon: 'file',  action: 'highlight-cv'  },
    { label: 'Add certificates',          done: user.hasCerts,      view: 'documents',   icon: 'award', action: 'highlight-cert'},
    { label: 'Set job alert preferences', done: hasJobAlert,        view: 'alerts',      icon: 'bell',  action: 'create-alert'  },
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="profile-section-card">
      <h3>
        Complete Your Profile
        <span style={{ fontFamily: 'Arimo', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.82rem', color: 'var(--gray-600)' }}>
          {doneCount}/{steps.length} done
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: s.done ? 'var(--success-bg)' : 'var(--gray-50)',
            border: `1px solid ${s.done ? '#86efac' : 'var(--gray-100)'}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: s.done ? 'var(--success)' : 'var(--gray-200)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: s.done ? 'var(--white)' : 'var(--gray-600)',
              fontSize: s.done ? '0.75rem' : '0.9rem',
              flexShrink: 0,
            }}>
              {s.done ? <Icon name="check" size={15} stroke={2.5} /> : <Icon name={s.icon} size={15} stroke={2} />}
            </div>
            <span style={{ flex: 1, fontSize: '0.85rem', color: s.done ? '#166534' : 'var(--navy)', fontWeight: s.done ? 400 : 600 }}>
              {s.label}
            </span>
            {!s.done && s.view && (
              <button
                type="button"
                onClick={() => onAction?.(s)}
                style={{ fontSize: '0.75rem', color: 'var(--yellow-dark)', fontWeight: 700, fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.04em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ADD
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',        icon: 'grid', group: 'Main'      },
  { key: 'profile',      label: 'My Profile',       icon: 'user', group: 'Main'      },
  { key: 'documents',    label: 'Documents',        icon: 'file', group: 'Main'      },
  { key: 'applications', label: 'Applications',     icon: 'clipboard', group: 'Jobs' },
  { key: 'alerts',       label: 'Job Alerts',       icon: 'bell', group: 'Jobs'      },
  { key: 'settings',     label: 'Settings',         icon: 'settings', group: 'Account'   },
];

const PORTAL_VIEW_KEYS = new Set(NAV_ITEMS.map(item => item.key));

const viewFromLocation = () => {
  if (typeof window === 'undefined') return 'dashboard';
  const queryView = new URLSearchParams(window.location.search).get('view');
  if (PORTAL_VIEW_KEYS.has(queryView)) return queryView;
  const pathView = window.location.pathname.replace(/^\/portal\/?/, '').split('/')[0];
  return PORTAL_VIEW_KEYS.has(pathView) ? pathView : 'dashboard';
};

const Sidebar = ({ active, setActive, user, sidebarOpen, setSidebarOpen, applicationCount = 0, onPreviewAvatar }) => (
  <>
    {sidebarOpen && (
      <div
        onClick={() => setSidebarOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }}
        className="sidebar-overlay"
      />
    )}
    <aside className={`portal-sidebar${sidebarOpen ? ' open' : ''}`}>
      {/* Logo */}
      <div className="portal-sidebar-logo">
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logoWhite} alt="RealMindX Education" className="portal-sidebar-logo-img" />
          <div>
            <div className="portal-kicker">Teacher Portal</div>
          </div>
        </a>
      </div>

      {/* User info */}
      <div className="portal-sidebar-user">
        <button className="sidebar-user-avatar avatar-preview-button" type="button" onClick={onPreviewAvatar} aria-label="View profile picture">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}
        </button>
        <div>
          <div className="sidebar-user-name">{user.firstName} {user.lastName}</div>
          <div className="sidebar-user-role">{user.subject || 'Teacher'}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="portal-nav portal-sidebar-nav">
        {['Main', 'Jobs', 'Account'].map(group => (
          <div key={group} className="portal-nav-section">
            <div className="portal-nav-label">{group}</div>
            {NAV_ITEMS.filter(i => i.group === group).map(item => (
              item.href
                ? <a key={item.key} href={item.href} className="portal-nav-item">
                    <span className="nav-icon"><Icon name={item.icon} size={17} stroke={1.9} /></span>
                    {item.label}
                  </a>
                : <button
                    key={item.key}
                    className={`portal-nav-item${active === item.key ? ' active' : ''}`}
                    onClick={() => { setActive(item.key); setSidebarOpen(false); }}
                  >
                    <span className="nav-icon"><Icon name={item.icon} size={17} stroke={1.9} /></span>
                    {item.label}
                    {item.key === 'applications' && applicationCount > 0 && <span className="portal-nav-badge">{applicationCount}</span>}
                  </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="portal-sidebar-footer">
        <a href="/" className="portal-nav-item" style={{ textDecoration: 'none' }}>
          <span className="nav-icon"><Icon name="home" size={17} stroke={1.9} /></span> Back to RealMindX
        </a>
        <button className="portal-nav-item" style={{ color: 'var(--danger)', width: '100%', textAlign: 'left' }} onClick={async () => { await signOut(); queueToast("You've been signed out.", 'success'); window.location.href = '/login'; }}>
          <span className="nav-icon"><Icon name="x" size={17} stroke={1.9} /></span> Sign Out
        </button>
      </div>
    </aside>
  </>
);

/* â”€â”€ DASHBOARD VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DashboardView = ({ user, setActive, onAction, applications = [], alerts = [], onPreviewAvatar }) => {
  const pendingCount = applications.filter(a => ['pending', 'reviewed', 'shortlisted'].includes(a.status)).length;
  const acceptedCount = applications.filter(a => a.status === 'accepted').length;
  const activeAlerts = alerts.filter(a => a.active !== false);
  const recentApplications = applications.slice(0, 3);

  return (
  <div>
    {/* Welcome card */}
    <div className="welcome-card">
      <div className="welcome-content">
        <p className="welcome-greeting">Welcome back</p>
        <h2>Hello, {user.firstName}.</h2>
        <p>
          {user.isNew
            ? 'Your portal is almost ready. Complete your profile to start applying for teaching jobs.'
            : pendingCount
              ? `You have ${pendingCount} application${pendingCount === 1 ? '' : 's'} under review.`
              : 'You have no applications under review yet.'
          }
        </p>
        <div className="welcome-actions">
          {user.isNew
            ? <><button className="btn btn-primary" onClick={() => setActive('profile')}>Complete Profile</button>
                <a href="/jobs" className="btn btn-outline">Browse Jobs</a></>
            : <><a href="/jobs" className="btn btn-primary">Find New Jobs</a>
                <button className="btn btn-outline" onClick={() => setActive('applications')}>My Applications</button></>
          }
        </div>
      </div>
      <div className="welcome-image-side">
        <button className="welcome-avatar-large avatar-preview-button" type="button" onClick={onPreviewAvatar} aria-label="View profile picture">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '3rem', color: 'var(--yellow)', letterSpacing: '-1px' }}>
                {user.initials}
              </div>
          }
        </button>
      </div>
    </div>

    {/* Stats */}
    <div className="portal-stats-grid">
      {[
        { label: 'Applications Sent',  value: applications.length, sub: applications.length ? 'Total submitted' : 'None yet' },
        { label: 'Under Review',       value: pendingCount,        sub: pendingCount ? 'Awaiting school response' : 'None yet' },
        { label: 'Accepted',           value: acceptedCount,       sub: acceptedCount ? 'Schools want to meet you' : 'None yet' },
        { label: 'Profile Complete',    value: `${user.profileComplete}%`,                                                            sub: user.profileComplete < 100 ? 'Finish your profile' : 'Fully complete' },
      ].map(s => (
        <div key={s.label} className="portal-stat-card">
          <div className="psc-label">{s.label}</div>
          <div className="psc-value">{s.value}</div>
          <div className="psc-sub">{s.sub}</div>
        </div>
      ))}
    </div>

    {/* Main grid */}
    {user.isNew ? (
      <div className="portal-grid-2">
        <ProfileChecklist user={user} setActive={setActive} onAction={onAction} hasJobAlert={activeAlerts.length > 0} />
        <div className="profile-section-card">
          <h3>Recommended Jobs</h3>
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8, color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="briefcase" size={34} stroke={1.7} /></div>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: 16 }}>
              Complete your profile to get personalised job recommendations.
            </p>
            <a href="/jobs" className="btn btn-outline-navy btn-sm">Browse All Jobs</a>
          </div>
        </div>
      </div>
    ) : (
      <div className="portal-grid-2">
        {/* Recent Applications */}
        <div className="profile-section-card">
          <h3>Recent Applications <button onClick={() => setActive('applications')} className="profile-edit-link">View All</button></h3>
          {recentApplications.length === 0
            ? <EmptyApplications />
            : recentApplications.map(app => (
                <div key={app.id} className="application-row">
                  <div className="app-school-icon">{app.logo || app.organisation?.slice(0, 2)?.toUpperCase() || 'RM'}</div>
                  <div className="app-info">
                    <div className="app-title">{app.title}</div>
                    <div className="app-school">{app.school || app.organisation || 'RealMindX'}{app.applied ? ` - ${app.applied}` : ''}</div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
              ))
          }
        </div>

        {/* Profile completion + job alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="profile-section-card">
            <h3>Profile <button onClick={() => setActive('profile')} className="profile-edit-link">Edit</button></h3>
            <div style={{ marginBottom: 12 }}>
              <div className="completion-label">Profile Completion</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 100 }}>
                  <div style={{ height: '100%', width: `${user.profileComplete}%`, background: 'var(--yellow)', borderRadius: 100 }} />
                </div>
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '0.85rem', color: 'var(--yellow-dark)' }}>
                  {user.profileComplete}%
                </span>
              </div>
            </div>
            {[
              { label: 'Subject',  value: user.subject  },
              { label: 'Level',    value: user.level    },
              { label: 'Location', value: user.location },
            ].map(f => (
              <div key={f.label} className="profile-field">
                <div className="profile-field-label">{f.label}</div>
                <div className="profile-field-value">{f.value || <span className="profile-field-empty">Not set</span>}</div>
              </div>
            ))}
          </div>

          <div className="profile-section-card">
            <h3>Job Alerts <button onClick={() => setActive('alerts')} className="profile-edit-link">Manage</button></h3>
            {activeAlerts.length === 0
              ? <EmptyAlerts onAdd={() => setActive('alerts')} />
              : activeAlerts.map(alert => (
                  <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <span style={{ fontSize: '1rem', color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="bell" size={17} stroke={1.9} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>{alert.subject} - {alert.level}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{alert.frequency}</div>
                    </div>
                    <span className="badge badge-success">Active</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    )}
  </div>
  );
};

/* â”€â”€ PROFILE VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/* ── Profile picture card with crop ─────────────────────── */
const ProfilePictureCard = ({ user, onPreviewAvatar, onUploadAvatar, avatarUploading, uploadError }) => {
  const { inputProps, cropModal } = useCropUpload({
    aspectRatio: 1,
    title: 'Crop Profile Picture',
    onFile: (file) => onUploadAvatar?.(file),
  });
  return (
    <div className="profile-section-card">
      {cropModal}
      <h3>Profile Picture</h3>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <button className="avatar-preview-button" type="button" onClick={onPreviewAvatar} aria-label="View profile picture"
          style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '2rem', color: 'var(--navy)', border: 0 }}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : user.initials}
        </button>
        <label className="document-upload-zone portal-upload-zone" style={{ marginTop: 0 }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 6, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="camera" size={26} stroke={1.8} /></div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>{avatarUploading ? 'Uploading photo...' : 'Click to upload a photo'}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--gray-600)', marginTop: 4 }}>JPG, PNG · Crop after selecting</p>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden {...inputProps} />
        </label>
        {uploadError && <p className="form-error" style={{ marginTop: 10 }}>{uploadError}</p>}
      </div>
    </div>
  );
};

const ProfileView = ({ user, onPreviewAvatar, onUploadAvatar, onEditProfile, avatarUploading, uploadError }) => (
  <div>
    {/* Profile header */}
    <div className="profile-header-card">
      <div className="profile-avatar-wrapper">
        <button className="profile-avatar avatar-preview-button" type="button" onClick={onPreviewAvatar} aria-label="View profile picture">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.initials}
        </button>
        <button className="profile-avatar-edit" type="button" title="Change photo" onClick={onPreviewAvatar}><Icon name="camera" size={15} stroke={2} /></button>
      </div>
      <div className="profile-header-info">
        <h2>{user.firstName} {user.lastName}</h2>
        <p>{user.email}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {/* Both fields are comma-joined multi-select values (a teacher can have
              several subjects and several preferred levels) — render one badge
              per value rather than cramming the whole joined string into a
              single pill. */}
          {splitMulti(user.subject).map(s => <span key={`subject-${s}`} className="badge badge-yellow">{s}</span>)}
          {splitMulti(user.level).map(l => <span key={`level-${l}`} className="badge badge-navy">{l}</span>)}
        </div>
        <div className="profile-completion" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="completion-bar-wrap">
              <div className="completion-bar" style={{ width: `${user.profileComplete}%` }} />
            </div>
            <span className="completion-pct">{user.profileComplete}%</span>
            <span className="completion-label">complete</span>
          </div>
        </div>
      </div>
    </div>

    <div className="profile-sections-grid">
      {/* Personal Info */}
      <div className="profile-section-card">
        <h3>
          Personal Information
          <button type="button" className="profile-edit-link" onClick={() => onEditProfile?.('personal')}>Edit</button>
        </h3>
        {[
          { label: 'First Name',    value: user.firstName  },
          { label: 'Last Name',     value: user.lastName   },
          { label: 'Email Address', value: user.email      },
          { label: 'Phone Number',  value: user.phone      },
          { label: 'Location',      value: user.location   },
        ].map(f => (
          <div key={f.label} className="profile-field">
            <div className="profile-field-label">{f.label}</div>
            {f.value ? <div className="profile-field-value">{f.value}</div> : <div className="profile-field-empty">Not provided</div>}
          </div>
        ))}
      </div>

      {/* Teaching Preferences */}
      <div className="profile-section-card">
        <h3>
          Teaching Preferences
          <button type="button" className="profile-edit-link" onClick={() => onEditProfile?.('teaching')}>Edit</button>
        </h3>
        {[
          { label: 'Teaching Subject',    value: user.subject  },
          { label: 'Preferred Level',     value: user.level    },
          { label: 'Work Type Preferred', value: user.preferredEmploymentType },
          { label: 'Curriculum Experience', value: user.curriculumExperience },
          { label: 'Available From',      value: user.availableFrom },
        ].map(f => (
          <div key={f.label} className="profile-field">
            <div className="profile-field-label">{f.label}</div>
            {f.value ? <div className="profile-field-value">{f.value}</div> : <div className="profile-field-empty">Not set</div>}
          </div>
        ))}
      </div>

      {/* Next of Kin */}
      <div className="profile-section-card">
        <h3>
          Next of Kin
          <button type="button" className="profile-edit-link" onClick={() => onEditProfile?.('kin')}>Edit</button>
        </h3>
        {[
          { label: 'Full Name',     value: user.nextOfKinName },
          { label: 'Relationship', value: user.nextOfKinRelationship },
          { label: 'Phone Number', value: user.nextOfKinPhone },
          { label: 'Email Address', value: user.nextOfKinEmail },
        ].map(f => (
          <div key={f.label} className="profile-field">
            <div className="profile-field-label">{f.label}</div>
            {f.value ? <div className="profile-field-value">{f.value}</div> : <div className="profile-field-empty">Not provided</div>}
          </div>
        ))}
        <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onEditProfile?.('kin')} style={{ marginTop: 8 }}>Add Next of Kin</button>
      </div>

      {/* Profile picture slot */}
      <ProfilePictureCard user={user} onPreviewAvatar={onPreviewAvatar} onUploadAvatar={onUploadAvatar} avatarUploading={avatarUploading} uploadError={uploadError} />
    </div>
  </div>
);

const ProfileEditModal = ({ section, form, setForm, onCancel, onSave, saving, error }) => {
  const titleMap = {
    personal: 'Edit Personal Information',
    teaching: 'Edit Teaching Preferences',
    kin: 'Edit Next of Kin',
  };
  // Helpers for comma-separated multi-select fields
  const multiValues = (key) => splitMulti(form[key] || '');
  const toggleMulti = (key, value) => {
    const cur = multiValues(key);
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    setForm(prev => ({ ...prev, [key]: next.join(', ') }));
  };

  const SUBJECTS = [
    'Accounting','Agricultural Science','Agriculture','Applied Technology','Arabic',
    'Auto Mechanics','Autobody Works','Basketry','Biology','Building and Construction',
    'Business Management','Business Studies','Career Technology','Catering / Hospitality','Ceramics',
    'Chemistry','Christian Religious Studies','Clothing and Textiles','Commerce','Computer Science',
    'Computing','Cosmetology','Cost Accounting','Creative Arts','Creative Arts and Design',
    'Dance','Design and Technology','Diesel Mechanic / Heavy Engine','Drama / Theatre Arts','Early Childhood Learning Areas',
    'Economics','Electrical Installation','Electronics','Engineering','English Language',
    'Entrepreneurship','Environmental Science','Fashion Design','Financial Accounting','Food and Nutrition',
    'French','General Knowledge in Art','General Science','Geography','Ghanaian Language',
    'Global Perspectives','Government / Civics','Graphic Design','Health Education','Heavy Duty Industrial Mechanics',
    'History','Home Economics','ICT','Integrated Science','Islamic Religious Studies',
    'Jewellery','Law','Leatherwork','Life Skills','Literature',
    'Management in Living','Mathematics','Mechanical Engineering Technology','Media Studies','Metalwork',
    'Montessori Learning Areas','Motor Vehicle Engineering','Music','Other Foreign Languages','Our World Our People',
    'Performing Arts','Philosophy','Physical and Health Education','Physical Education','Physics',
    'Picture Making','Plumbing','Psychology','Refrigeration and Air Conditioning','Religious and Moral Education',
    'Robotics','Science','Sculpture','Social Studies','Sociology',
    'Spanish','Technical Drawing','Textiles','Welding and Fabrication','Woodwork / Carpentry and Joinery',
    'Other',
  ];
  // A teacher can teach more than one subject, so this is multi-select, the
  // same tag pattern proven out for Curriculum Experience below: presets
  // render as checkboxes, anything saved that isn't a preset (a previously
  // typed custom entry, or a stray "Other" left over from the old single
  // -select dropdown) renders back as a removable tag, and a free-text "Add"
  // box lets a teacher append any subject not on the official list. A search
  // box narrows the ~90-option checklist down to a manageable handful — handy
  // since scrolling through all of them to find one would be its own bad UX.
  const KNOWN_SUBJECTS = SUBJECTS.filter(s => s !== 'Other');
  const selectedSubjects = multiValues('teaching_subject');
  const [subjectFilter, setSubjectFilter] = React.useState('');
  const [newSubject, setNewSubject] = React.useState('');
  const addCustomSubject = () => {
    const val = newSubject.trim();
    if (!val) return;
    const cur = multiValues('teaching_subject');
    if (!cur.includes(val)) setForm(prev => ({ ...prev, teaching_subject: [...cur, val].join(', ') }));
    setNewSubject('');
  };
  const filteredSubjects = (() => {
    const q = subjectFilter.trim().toLowerCase();
    return q ? KNOWN_SUBJECTS.filter(s => s.toLowerCase().includes(q)) : KNOWN_SUBJECTS;
  })();
  const LEVELS = ['Early Childhood / Daycare','Pre-School / Nursery','Kindergarten','Lower Primary','Upper Primary','Junior High / Lower Secondary','Senior High / Upper Secondary','Sixth Form / Pre-University','TVET / Vocational','Other'];
  const KNOWN_LEVELS = LEVELS.filter(l => l !== 'Other');
  const selectedLevels = multiValues('preferred_level');
  const customLevels = selectedLevels.filter(l => !KNOWN_LEVELS.includes(l));
  const [newLevel, setNewLevel] = React.useState('');
  const addCustomLevel = () => {
    const val = newLevel.trim();
    if (!val) return;
    const cur = multiValues('preferred_level');
    if (!cur.includes(val)) setForm(prev => ({ ...prev, preferred_level: [...cur, val].join(', ') }));
    setNewLevel('');
  };

  const WORK_TYPES = ['Full Time','Part Time','Contract','Volunteer','Remote / Online','Other'];
  const KNOWN_WORK_TYPES = WORK_TYPES.filter(w => w !== 'Other');
  const selectedWorkTypes = multiValues('preferred_employment_type');
  const customWorkTypes = selectedWorkTypes.filter(w => !KNOWN_WORK_TYPES.includes(w));
  const [newWorkType, setNewWorkType] = React.useState('');
  const addCustomWorkType = () => {
    const val = newWorkType.trim();
    if (!val) return;
    const cur = multiValues('preferred_employment_type');
    if (!cur.includes(val)) setForm(prev => ({ ...prev, preferred_employment_type: [...cur, val].join(', ') }));
    setNewWorkType('');
  };

  // Availability is single-choice; the preset windows can't cover every real
  // answer ("From January 2027", "After WASSCE marking"), so "Other" reveals a
  // free-text input writing to the same available_from field. A saved custom
  // value re-opens in custom mode instead of being silently dropped.
  const AVAILABILITY_OPTIONS = ['Immediately', '1 Month', '3 Months', 'After Current Term'];
  const [availabilityOther, setAvailabilityOther] = React.useState(() => {
    const v = form.available_from || '';
    return Boolean(v) && !AVAILABILITY_OPTIONS.includes(v);
  });

  const CURRICULA = ['GES / NaCCA Curriculum','TVET / CTVET Curriculum','Cambridge International Curriculum','British / English National Curriculum','Pearson Edexcel Pathway','International Baccalaureate (IB) Curriculum','American Curriculum','Montessori Curriculum','Oxford International Curriculum','Other'];
  // Same dead end as Teaching Subject, but this list is multi-select: ticking
  // "Other" just added the literal word "Other" with no way to say what it was.
  // Fix: drop "Other" as a checkbox and let the teacher type any number of their
  // own entries instead, each becoming its own removable tag stored directly in
  // the same comma-joined field. Anything already saved that isn't one of the
  // preset names (e.g. a custom entry typed previously, or a stray "Other" left
  // over from the old broken checkbox) renders back as a tag too, so nothing
  // saved is ever silently dropped.
  const KNOWN_CURRICULA = CURRICULA.filter(c => c !== 'Other');
  const selectedCurricula = multiValues('curriculum_experience');
  const customCurricula = selectedCurricula.filter(c => !KNOWN_CURRICULA.includes(c));
  const [newCurriculum, setNewCurriculum] = React.useState('');
  const addCustomCurriculum = () => {
    const val = newCurriculum.trim();
    if (!val) return;
    const cur = multiValues('curriculum_experience');
    if (!cur.includes(val)) setForm(prev => ({ ...prev, curriculum_experience: [...cur, val].join(', ') }));
    setNewCurriculum('');
  };

  const fields = section === 'teaching'
    ? null // rendered separately below
    : section === 'kin'
      ? [
          ['next_of_kin_name', 'Full Name', 'Example: Ama Mensah'],
          ['next_of_kin_relationship', 'Relationship', 'Example: Parent, Spouse, Sibling'],
          ['next_of_kin_phone', 'Phone Number', 'Example: +233 24 000 0000'],
          ['next_of_kin_email', 'Email Address', 'Example: ama.mensah@example.com'],
        ]
      : [
          ['phone', 'Phone Number', 'Example: +233 24 000 0000'],
          ['location', 'Location', 'Example: Accra, Tema, Kumasi'],
        ];

  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <form className="admin-modal-panel portal-profile-modal" onSubmit={onSave} role="dialog" aria-modal="true" aria-label={titleMap[section] || 'Edit profile'}>
        <button className="admin-modal-close" type="button" onClick={onCancel}>
          <Icon name="x" size={16} stroke={2.1} />
          <span>Close</span>
        </button>
        <h3 style={{ fontFamily: "'Montserrat', sans-serif", marginBottom: 18, fontSize: '1.25rem', color: 'var(--navy)' }}>{titleMap[section] || 'Edit Profile'}</h3>
        <div className="profile-sections-grid">
          {/* ── Teaching section: dropdowns + checkboxes ── */}
          {section === 'teaching' && (<>
            {/* Availability */}
            <div className="form-group">
              <label className="form-label">Availability</label>
              <select
                className="form-input"
                value={availabilityOther ? '__other__' : (form.available_from || '')}
                onChange={e => {
                  const value = e.target.value;
                  if (value === '__other__') {
                    setAvailabilityOther(true);
                    setForm(p => ({ ...p, available_from: '' }));
                  } else {
                    setAvailabilityOther(false);
                    setForm(p => ({ ...p, available_from: value }));
                  }
                }}
              >
                <option value="">Select availability</option>
                <option value="Immediately">Immediately Available</option>
                <option value="1 Month">Within 1 Month</option>
                <option value="3 Months">Within 3 Months</option>
                <option value="After Current Term">After Current Term</option>
                <option value="__other__">Other…</option>
              </select>
              {availabilityOther && (
                <input
                  className="form-input"
                  style={{ marginTop: 8 }}
                  placeholder="Example: From January 2027"
                  value={form.available_from || ''}
                  onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))}
                />
              )}
            </div>
            {/* Years of Experience */}
            <div className="form-group">
              <label className="form-label">Years of Teaching Experience</label>
              <select className="form-input" value={form.years_of_experience !== undefined && form.years_of_experience !== null && form.years_of_experience !== '' ? String(form.years_of_experience) : ''} onChange={e => setForm(p => ({ ...p, years_of_experience: e.target.value === '' ? '' : Number(e.target.value) }))}>
                <option value="">Select experience</option>
                <option value="0">Less than 1 year</option>
                <option value="1">1 – 2 years</option>
                <option value="3">3 – 5 years</option>
                <option value="6">6 – 10 years</option>
                <option value="11">11 – 15 years</option>
                <option value="16">16 – 20 years</option>
                <option value="21">More than 20 years</option>
              </select>
            </div>
            {/* Date of Birth */}
            <div className="form-group">
              <label className="form-label">Date of Birth <span style={{ fontWeight: 400, color: 'var(--gray-600)', fontSize: '0.78rem' }}>(used to verify eligibility)</span></label>
              <DatePickerField
                value={form.date_of_birth || ''}
                onChange={value => setForm(p => ({ ...p, date_of_birth: value }))}
                max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().split('T')[0]; })()}
                placeholder="Select your date of birth"
                ariaLabel="Date of Birth"
              />
            </div>
            {/* Teaching Subjects — searchable multi-select with custom entries */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Teaching Subjects <span style={{ fontWeight: 400, color: 'var(--gray-600)', fontSize: '0.78rem' }}>(select all that apply)</span></label>
              {selectedSubjects.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {selectedSubjects.map(s => (
                    <span
                      key={s}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'var(--gray-100)', border: '1px solid var(--gray-200)',
                        borderRadius: 100, padding: '4px 6px 4px 12px',
                        fontSize: '0.82rem', color: 'var(--navy)',
                      }}
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => toggleMulti('teaching_subject', s)}
                        aria-label={`Remove ${s}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', border: 'none',
                          background: 'var(--gray-200)', color: 'var(--navy)', cursor: 'pointer',
                          fontSize: '0.9rem', lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className="form-input"
                placeholder="Search subjects (e.g. Mathematics, ICT, French)…"
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div className="portal-checkbox-grid" style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 6 }}>
                {filteredSubjects.map(s => (
                  <label key={s} className="portal-checkbox-row">
                    <input type="checkbox" checked={selectedSubjects.includes(s)} onChange={() => toggleMulti('teaching_subject', s)} />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              {filteredSubjects.length === 0 && (
                <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', marginTop: 8 }}>
                  No subjects match "{subjectFilter}" — type it below to add it as a custom entry.
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="form-input"
                  placeholder="Other subject? Type it and press Enter to add"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSubject(); } }}
                />
                <button type="button" className="btn btn-outline-navy btn-sm" onClick={addCustomSubject} style={{ flexShrink: 0 }}>Add</button>
              </div>
            </div>
            {/* Preferred Level checkboxes + custom entries */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Preferred School Level <span style={{ fontWeight: 400, color: 'var(--gray-600)', fontSize: '0.78rem' }}>(select all that apply)</span></label>
              <div className="portal-checkbox-grid">
                {KNOWN_LEVELS.map(lvl => (
                  <label key={lvl} className="portal-checkbox-row">
                    <input type="checkbox" checked={selectedLevels.includes(lvl)} onChange={() => toggleMulti('preferred_level', lvl)} />
                    <span>{lvl}</span>
                  </label>
                ))}
              </div>
              {customLevels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {customLevels.map(lvl => (
                    <span
                      key={lvl}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'var(--gray-100)', border: '1px solid var(--gray-200)',
                        borderRadius: 100, padding: '4px 6px 4px 12px',
                        fontSize: '0.82rem', color: 'var(--navy)',
                      }}
                    >
                      {lvl}
                      <button
                        type="button"
                        onClick={() => toggleMulti('preferred_level', lvl)}
                        aria-label={`Remove ${lvl}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', border: 'none',
                          background: 'var(--gray-200)', color: 'var(--navy)', cursor: 'pointer',
                          fontSize: '0.9rem', lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="form-input"
                  placeholder="Other school level? Type it and press Enter to add"
                  value={newLevel}
                  onChange={e => setNewLevel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLevel(); } }}
                />
                <button type="button" className="btn btn-outline-navy btn-sm" onClick={addCustomLevel} style={{ flexShrink: 0 }}>Add</button>
              </div>
            </div>
            {/* Work Type checkboxes + custom entries */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Work Type <span style={{ fontWeight: 400, color: 'var(--gray-600)', fontSize: '0.78rem' }}>(select all that apply)</span></label>
              <div className="portal-checkbox-grid">
                {KNOWN_WORK_TYPES.map(wt => (
                  <label key={wt} className="portal-checkbox-row">
                    <input type="checkbox" checked={selectedWorkTypes.includes(wt)} onChange={() => toggleMulti('preferred_employment_type', wt)} />
                    <span>{wt}</span>
                  </label>
                ))}
              </div>
              {customWorkTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {customWorkTypes.map(wt => (
                    <span
                      key={wt}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'var(--gray-100)', border: '1px solid var(--gray-200)',
                        borderRadius: 100, padding: '4px 6px 4px 12px',
                        fontSize: '0.82rem', color: 'var(--navy)',
                      }}
                    >
                      {wt}
                      <button
                        type="button"
                        onClick={() => toggleMulti('preferred_employment_type', wt)}
                        aria-label={`Remove ${wt}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', border: 'none',
                          background: 'var(--gray-200)', color: 'var(--navy)', cursor: 'pointer',
                          fontSize: '0.9rem', lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="form-input"
                  placeholder="Other work type? Type it and press Enter to add"
                  value={newWorkType}
                  onChange={e => setNewWorkType(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomWorkType(); } }}
                />
                <button type="button" className="btn btn-outline-navy btn-sm" onClick={addCustomWorkType} style={{ flexShrink: 0 }}>Add</button>
              </div>
            </div>
            {/* Curriculum checkboxes */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Curriculum Experience <span style={{ fontWeight: 400, color: 'var(--gray-600)', fontSize: '0.78rem' }}>(select all that apply)</span></label>
              <div className="portal-checkbox-grid">
                {KNOWN_CURRICULA.map(c => (
                  <label key={c} className="portal-checkbox-row">
                    <input type="checkbox" checked={selectedCurricula.includes(c)} onChange={() => toggleMulti('curriculum_experience', c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              {customCurricula.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {customCurricula.map(c => (
                    <span
                      key={c}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'var(--gray-100)', border: '1px solid var(--gray-200)',
                        borderRadius: 100, padding: '4px 6px 4px 12px',
                        fontSize: '0.82rem', color: 'var(--navy)',
                      }}
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => toggleMulti('curriculum_experience', c)}
                        aria-label={`Remove ${c}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', border: 'none',
                          background: 'var(--gray-200)', color: 'var(--navy)', cursor: 'pointer',
                          fontSize: '0.9rem', lineHeight: 1, padding: 0,
                        }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="form-input"
                  placeholder="Other curriculum? Type it and press Enter to add"
                  value={newCurriculum}
                  onChange={e => setNewCurriculum(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCurriculum(); } }}
                />
                <button type="button" className="btn btn-outline-navy btn-sm" onClick={addCustomCurriculum} style={{ flexShrink: 0 }}>Add</button>
              </div>
            </div>
          </>)}

          {/* ── All other sections: generic text inputs ── */}
          {fields && fields.map(([name, label, placeholder]) => (
            <div className="form-group" key={name}>
              <label className="form-label">{label}</label>
              <input
                className="form-input"
                type={name.includes('email') ? 'email' : 'text'}
                placeholder={placeholder}
                value={form[name] || ''}
                onChange={event => setForm(prev => ({ ...prev, [name]: event.target.value }))}
              />
            </div>
          ))}
          {section === 'personal' && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Short Bio</label>
              <textarea
                className="form-textarea"
                placeholder="A short professional summary admins can use when reviewing applications."
                value={form.bio || ''}
                onChange={event => setForm(prev => ({ ...prev, bio: event.target.value }))}
              />
            </div>
          )}
        </div>
        {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button className="btn btn-outline-navy" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

/* â”€â”€ DOCUMENTS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const DocumentsView = ({ user, onUploadDocument, uploadingKind, uploadError, highlight }) => {
  const cvRef   = React.useRef(null);
  const certRef = React.useRef(null);
  React.useEffect(() => {
    if (!highlight) return;
    const ref = highlight === 'cv' ? cvRef : certRef;
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.current?.classList.add('portal-highlight-flash');
      setTimeout(() => ref.current?.classList.remove('portal-highlight-flash'), 2000);
    }, 120);
  }, [highlight]);
  return (
  <div>
    <div style={{ marginBottom: 24 }}>
      <h2 className="portal-page-title">My Documents</h2>
      <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginTop: 4 }}>
        Upload your CV and certificates. These are attached to job applications automatically.
      </p>
    </div>

    <div className="profile-sections-grid">
      {/* CV Video Tutorial */}
      <CvTutorialCard />

      {/* CV */}
      <div className="profile-section-card" ref={cvRef}>
        <h3>Curriculum Vitae (CV)</h3>
        {user.hasCV ? (
          <div>
            <div className="document-row">
              <span className="doc-icon"><Icon name="file" size={18} stroke={1.9} /></span>
              <div style={{ flex: 1 }}>
                <div className="doc-name">{user.cvFilename || 'CV uploaded'}</div>
                <div className="doc-size">Attached to your job applications automatically</div>
              </div>
              <div className="doc-actions">
                {user.cvUrl && <a className="btn btn-sm btn-outline-navy" href={user.cvUrl} target="_blank" rel="noreferrer">View</a>}
                <label className="btn btn-sm btn-outline-navy">
                  {uploadingKind === 'cv' ? 'Uploading...' : 'Replace'}
                  <input type="file" hidden accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => onUploadDocument?.('cv', event.target.files?.[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#92400e' }}>
              <Icon name="warning" size={15} stroke={2} /> A CV is required before you can apply for jobs.
            </div>
            <div className="document-upload-zone">
              <div style={{ fontSize: '2rem', marginBottom: 8, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="file" size={34} stroke={1.7} /></div>
              <p style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '0.88rem' }}>Upload your CV</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 4 }}>PDF, DOC, or DOCX up to 10MB</p>
              <label className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                {uploadingKind === 'cv' ? 'Uploading...' : 'Choose File'}
                <input type="file" hidden accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => onUploadDocument?.('cv', event.target.files?.[0])} />
              </label>
            </div>
          </>
        )}
      </div>

      {/* Certificates */}
      <div className="profile-section-card" ref={certRef}>
        <h3>Certificates & Qualifications</h3>
        {user.hasCerts ? (
          <div>
            {[
              { name: user.certificateFilename || 'Certificate uploaded', size: 'Stored securely', date: '' },
            ].map(f => (
              <div key={f.name} className="document-row">
                <span className="doc-icon"><Icon name="award" size={18} stroke={1.9} /></span>
                <div style={{ flex: 1 }}>
                  <div className="doc-name">{f.name}</div>
                  <div className="doc-size">{f.size}</div>
                </div>
                <div className="doc-actions">
                  {user.certificateUrl && <a className="btn btn-sm btn-outline-navy" href={user.certificateUrl} target="_blank" rel="noreferrer">View</a>}
                </div>
              </div>
            ))}
            <label className="btn btn-outline-navy btn-sm" style={{ marginTop: 12 }}>
              {uploadingKind === 'certificate' ? 'Uploading...' : 'Replace Certificate'}
              <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={event => onUploadDocument?.('certificate', event.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#92400e' }}>
              <Icon name="warning" size={15} stroke={2} /> Please upload your highest formal certificate or NTC license.
            </div>
            <div className="document-upload-zone">
              <div style={{ fontSize: '2rem', marginBottom: 8, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="award" size={34} stroke={1.7} /></div>
              <p style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '0.88rem' }}>Upload Certificates</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 4 }}>PDF or image files - Multiple allowed</p>
              <label className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
                {uploadingKind === 'certificate' ? 'Uploading...' : 'Choose Files'}
                <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={event => onUploadDocument?.('certificate', event.target.files?.[0])} />
              </label>
            </div>
          </>
        )}
      </div>

      {/* Other documents */}
      <div className="profile-section-card" style={{ gridColumn: '1 / -1' }}>
        <h3>Other Documents</h3>
        <div className="document-upload-zone">
          <div style={{ fontSize: '1.5rem', marginBottom: 6, display: 'inline-flex', color: 'var(--yellow-dark)' }}><Icon name="folder" size={26} stroke={1.8} /></div>
          <p style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '0.88rem' }}>Upload any other supporting documents</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 4 }}>Reference letters, additional qualifications, etc.</p>
          <label className="btn btn-outline-navy btn-sm" style={{ marginTop: 12 }}>
            {uploadingKind === 'document' ? 'Uploading...' : 'Choose Files'}
            <input type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={event => onUploadDocument?.('document', event.target.files?.[0])} />
          </label>
          {uploadError && <p className="form-error" style={{ marginTop: 10 }}>{uploadError}</p>}
        </div>
      </div>
    </div>
  </div>
  );
};

/* ── APPLICATIONS VIEW ─────────────────────────────────── */
const ApplicationsView = ({ applications = [] }) => (
  <div>
    <div className="portal-view-header">
      <div>
        <h2 className="portal-page-title">My Applications</h2>
        <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginTop: 4 }}>
          Track the status of every job you have applied for.
        </p>
      </div>
      <a href="/jobs" className="btn btn-primary btn-sm">Browse More Jobs</a>
    </div>

    {applications.length === 0 ? <EmptyApplications /> : (
      <div>
        {applications.map(app => (
          <div key={app.id} style={{
            background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: '24px 28px',
            marginBottom: 16, border: '1px solid var(--gray-100)', boxShadow: 'var(--shadow-sm)',
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}>
            <div className="app-school-icon" style={{ width: 48, height: 48, fontSize: '1rem' }}>{app.logo}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '1rem', color: 'var(--navy)', marginBottom: 2 }}>{app.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>{app.school}</div>
              {app.applied && <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: 4 }}>Applied {app.applied}</div>}
            </div>
            <StatusBadge status={app.status} />
            {app.status === 'pending' && (
              <div style={{ padding: '8px 14px', background: 'var(--warning-bg)', borderRadius: 8, fontSize: '0.78rem', color: '#92400e' }}>
                Awaiting review by school
              </div>
            )}
            {app.status === 'accepted' && (
              <div style={{ padding: '8px 14px', background: 'var(--success-bg)', borderRadius: 8, fontSize: '0.78rem', color: '#166534' }}>
                Congratulations! Check your email.
              </div>
            )}
            {app.status === 'rejected' && (
              <div style={{ padding: '8px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--gray-600)' }}>
                Keep applying - the right role is ahead.
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

/* â”€â”€ ALERTS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const AlertsView = ({ initialAlerts = [], user, onSaved }) => {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [showForm, setShowForm] = useState(false);
  const blankForm = { subject: '', location: '', preferred_level: '', employment_type: '', frequency: 'instant', alert_by_email: true };
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openForm = () => {
    // Pre-fill from the user's existing profile so they only need to
    // change the fields that make this alert *different* from their default.
    setForm({
      subject: user?.subject || '',
      location: user?.location || '',
      preferred_level: user?.level || '',
      employment_type: user?.preferredEmploymentType || '',
      frequency: 'instant',
      alert_by_email: true,
    });
    setError('');
    setShowForm(true);
  };

  React.useEffect(() => setAlerts(initialAlerts), [initialAlerts]);

  const toggleAlert = (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  };

  const saveAlert = async event => {
    event.preventDefault();
    setError('');
    if (!form.subject.trim()) {
      setError('Choose or type the subject you want alerts for.');
      return;
    }
    setSaving(true);
    try {
      if (isApiMode()) {
        await api.saveJobAlerts(form);
      }
      const next = normaliseAlert(form);
      setAlerts(next ? [next] : []);
      onSaved?.(next ? [next] : []);
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Could not save alert preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="portal-view-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="portal-page-title">Job Alerts</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginTop: 4 }}>
            We email you instantly when a new teaching role matches your saved preferences. Your alert is set up automatically the first time you save your profile. You can edit it any time.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={openForm}>
          {alerts.length === 0 ? 'Set Up Alert' : 'Edit Alert'}
        </button>
      </div>

      {alerts.length === 0 ? (
        <EmptyAlerts onAdd={openForm} />
      ) : (
        <div>
          {alerts.map(alert => (
            <div key={alert.id} style={{
              background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '20px 24px',
              marginBottom: 12, border: '1px solid var(--gray-100)', boxShadow: 'var(--shadow-sm)',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <span style={{ fontSize: '1.3rem', color: 'var(--yellow-dark)', display: 'inline-flex' }}><Icon name="bell" size={22} stroke={1.9} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontFamily: "'Montserrat', sans-serif", fontSize: '0.92rem' }}>
                  {alert.subject} - {alert.level}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 2 }}>
                  {alert.location} - {alert.employmentType} - {alert.frequency}
                </div>
              </div>
              <button className="btn btn-sm btn-outline-navy" onClick={openForm}>Edit</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <form className="admin-modal-panel portal-alert-modal" onSubmit={saveAlert} role="dialog" aria-modal="true" aria-label="Create job alert">
            <button className="admin-modal-close" type="button" onClick={() => setShowForm(false)}>
              <Icon name="x" size={16} stroke={2.1} />
              <span>Close</span>
            </button>
            <h3 style={{ fontFamily: "'Montserrat', sans-serif", marginBottom: 8, fontSize: '1.25rem', color: 'var(--navy)' }}>Job Alert Preferences</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)', marginBottom: 20, lineHeight: 1.6 }}>
              Pre-filled from your profile. We will email you when a posted role matches these criteria. Adjust and save to update.
            </p>
            <div className="profile-sections-grid">
              <div className="form-group">
                <label className="form-label">Teaching Subject</label>
                <input className="form-input" placeholder="Example: Mathematics, English, Science" value={form.subject} onChange={event => setForm(prev => ({ ...prev, subject: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Level</label>
                <input className="form-input" placeholder="Example: Primary, JHS, SHS" value={form.preferred_level} onChange={event => setForm(prev => ({ ...prev, preferred_level: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Preferred Location</label>
                <input className="form-input" placeholder="Example: Accra, Tema, Remote" value={form.location} onChange={event => setForm(prev => ({ ...prev, location: event.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Employment Type</label>
                <input className="form-input" placeholder="Example: Full-time, Part-time, Contract" value={form.employment_type} onChange={event => setForm(prev => ({ ...prev, employment_type: event.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Alert Frequency</label>
              <select className="form-select" value={form.frequency} onChange={event => setForm(prev => ({ ...prev, frequency: event.target.value }))}>
                <option value="instant">Immediately when a matching job is posted</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
              </select>
            </div>
            <label className="permission-item" style={{ maxWidth: 260 }}>
              <span className="perm-label">Send alerts by email</span>
              <span className="toggle-switch">
                <input type="checkbox" checked={form.alert_by_email} onChange={event => setForm(prev => ({ ...prev, alert_by_email: event.target.checked }))} />
                <span className="toggle-slider" />
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Alert'}</button>
              <button className="btn btn-outline-navy" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* â”€â”€ SETTINGS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SettingsView = ({ onNavigate }) => {
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submitPassword = async event => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (passwords.next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      if (isApiMode()) {
        const result = await api.changePassword({
          current_password: passwords.current,
          new_password: passwords.next,
        });
        setSuccess(result.message || 'Password updated successfully.');
      } else {
        setSuccess('Password form validated in demo mode.');
      }
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err.message || 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="portal-page-title" style={{ marginBottom: 24 }}>Account Settings</h2>
      <div className="profile-sections-grid">
        <form className="profile-section-card" onSubmit={submitPassword}>
          <h3>Change Password</h3>
          <div className="form-group"><label className="form-label">Current Password</label><input type="password" className="form-input" autoComplete="current-password" value={passwords.current} onChange={event => setPasswords(prev => ({ ...prev, current: event.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">New Password</label><input type="password" className="form-input" autoComplete="new-password" placeholder="Minimum 8 characters" value={passwords.next} onChange={event => setPasswords(prev => ({ ...prev, next: event.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Confirm New Password</label><input type="password" className="form-input" autoComplete="new-password" placeholder="Repeat new password" value={passwords.confirm} onChange={event => setPasswords(prev => ({ ...prev, confirm: event.target.value }))} required /></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</button>
        </form>
        <div className="profile-section-card">
          <h3>Notifications</h3>
          <div className="portal-setting-row">
            <div>
              <strong>Application updates</strong>
              <p>Status changes are always sent to your account email.</p>
            </div>
            <span className="badge badge-success">Always on</span>
          </div>
          <div className="portal-setting-row">
            <div>
              <strong>Matching job alerts</strong>
              <p>Choose subjects, school levels, locations, and frequency.</p>
            </div>
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onNavigate?.('alerts')}>Manage Alerts</button>
          </div>
          <div className="portal-setting-row">
            <div>
              <strong>Newsletter</strong>
              <p>Use the unsubscribe link in any newsletter to change this preference.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="profile-section-card" style={{ marginTop: 20, borderTop: '3px solid var(--danger)' }}>
        <h3 style={{ color: 'var(--danger)' }}>Account Closure</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--gray-600)', marginBottom: 16 }}>
          Account closure is reviewed by support so applications and documents are not deleted accidentally.
        </p>
        <a className="btn btn-sm" href="/contact" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid #fca5a5' }}>
          Request Account Closure
        </a>
      </div>
    </div>
  );
};

const PortalLoadingState = ({ error = '' }) => (
  <div className="portal-loading-screen" role="status" aria-live="polite">
    <img src={logoWhite} alt="RealMindX Education" />
    <div className="portal-loading-card">
      {error ? <Icon name="warning" size={28} stroke={1.9} /> : <span className="portal-loading-spinner" aria-hidden="true" />}
      <h1>{error ? 'We could not load your portal' : 'Loading your teacher portal'}</h1>
      <p>{error || 'Getting your profile, applications, documents, and job alerts ready.'}</p>
      {error && <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Try Again</button>}
    </div>
  </div>
);

/* â”€â”€ MAIN PORTAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const UserPortalPage = () => {
  const [activeView, setActiveView] = useState(viewFromLocation);
  const pendingActionRef = React.useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [session, setSession] = React.useState(() => getDemoSession());
  const [sessionChecked, setSessionChecked] = React.useState(!isApiMode());
  const [apiProfile, setApiProfile] = React.useState(null);
  const [apiApplications, setApiApplications] = React.useState(null);
  const [apiAlerts, setApiAlerts] = React.useState(null);
  const [portalLoading, setPortalLoading] = React.useState(isApiMode());
  const [portalLoadError, setPortalLoadError] = React.useState('');
  const [avatarPreview, setAvatarPreview] = React.useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [uploadingKind, setUploadingKind] = React.useState('');
  const [uploadError, setUploadError] = React.useState('');
  const [profileEditSection, setProfileEditSection] = React.useState('');
  const [profileForm, setProfileForm] = React.useState({});
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileError, setProfileError] = React.useState('');

  React.useEffect(() => {
    if (!isApiMode()) {
      if (!session) {
        window.location.href = '/login';
        return undefined;
      }
      if (['admin', 'staff'].includes(session.role)) {
        window.location.href = '/admin/dashboard';
      }
      return undefined;
    }

    let cancelled = false;
    api.me()
      .then(({ user }) => {
        if (cancelled) return;
        const role = user?.role?.name || user?.role;
        if (!user) {
          clearDemoSession();
          window.location.href = '/login';
          return;
        }
        if (['admin', 'staff'].includes(role)) {
          saveDemoSession({
            role,
            email: user.email,
            firstName: user.first_name || user.firstName || 'Admin',
            lastName: user.last_name || user.lastName || '',
            initials: user.initials || `${user.first_name?.[0] || 'A'}${user.last_name?.[0] || 'D'}`.toUpperCase(),
          });
          window.location.href = '/admin/dashboard';
          return;
        }
        const freshSession = {
          role: 'user',
          email: user.email,
          firstName: user.first_name || user.firstName || 'Teacher',
          lastName: user.last_name || user.lastName || '',
          initials: user.initials || `${user.first_name?.[0] || 'T'}${user.last_name?.[0] || ''}`.toUpperCase(),
          avatarUrl: user.profile_picture_url || user.avatar_url || null,
        };
        saveDemoSession(freshSession);
        setSession(freshSession);
        setApiProfile(prev => ({ ...(prev || {}), ...user }));
        setSessionChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearDemoSession();
        window.location.href = '/login';
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const syncView = () => setActiveView(viewFromLocation());
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);

  React.useEffect(() => {
    const handler = () => {
      const fresh = getDemoSession();
      setSession(fresh);
      if (!fresh) {
        window.location.href = '/login';
      }
    };
    window.addEventListener('rmx-session-sync', handler);
    return () => window.removeEventListener('rmx-session-sync', handler);
  }, []);

  // In API mode: fetch the real user profile and applications on mount.
  React.useEffect(() => {
    if (!sessionChecked || !session || ['admin', 'staff'].includes(session.role) || !isApiMode()) return;
    let cancelled = false;
    const fetchPortalData = async (path) => {
      const response = await fetch(path, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The portal service did not respond.');
      return data;
    };
    setPortalLoading(true);
    setPortalLoadError('');
    Promise.all([
      fetchPortalData('/api/me/profile'),
      fetchPortalData('/api/me/applications'),
      fetchPortalData('/api/me/job-alerts'),
    ]).then(([profileData, applicationData, alertData]) => {
      if (cancelled) return;
      if (profileData.profile) setApiProfile(prev => ({ ...(prev || {}), ...profileData.profile }));
      setApiApplications(applicationData.items || []);
      setApiAlerts(alertData.preferences ? [normaliseAlert(alertData.preferences)].filter(Boolean) : []);
    }).catch(error => {
      if (!cancelled) setPortalLoadError(error.message || 'Please check your connection and try again.');
    }).finally(() => {
      if (!cancelled) setPortalLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, sessionChecked]);

  if (!sessionChecked || !session) return <PortalLoadingState />;
  if (['admin', 'staff'].includes(session.role)) return null;
  if (portalLoading) return <PortalLoadingState />;
  if (portalLoadError) return <PortalLoadingState error={portalLoadError} />;

  const applications = isApiMode()
    ? (apiApplications || []).map(normaliseApplication)
    : MOCK_APPLICATIONS.map(normaliseApplication);
  const alerts = isApiMode()
    ? (apiAlerts || [])
    : MOCK_ALERTS.map(normaliseAlert).filter(Boolean);

  const profileSource = apiProfile || {};
  const firstName = isApiMode()
    ? (profileSource.first_name || profileSource.firstName || session.firstName || '')
    : (session.firstName || MOCK_USER.firstName);
  const lastName = isApiMode()
    ? (profileSource.last_name || profileSource.lastName || session.lastName || '')
    : (session.lastName || MOCK_USER.lastName);
  const email = isApiMode()
    ? (profileSource.email || session.email || '')
    : (session.email || MOCK_USER.email);
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'RM';
  const profileCompletion = isApiMode()
    ? completionFromProfile({
        ...profileSource,
        email,
        first_name: firstName,
        last_name: lastName,
      })
    : MOCK_USER.profileComplete;

  // Merge: API profile takes precedence over session/mock data.
  const user = isApiMode()
    ? {
        isNew: profileCompletion < 100,
        firstName: firstName || 'Teacher',
        lastName,
        email,
        phone: profileSource.phone || '',
        location: profileSource.location || '',
        subject: profileSource.teaching_subject || '',
        level: profileSource.preferred_level || '',
        profileComplete: profileCompletion,
        emailVerified: Boolean(profileSource.is_verified),
        hasCV: Boolean(profileSource.cv_file_id),
        hasCerts: Boolean(profileSource.certificate_file_id),
        cvUrl: profileSource.cv_url || '',
        cvFilename: profileSource.cv_filename || '',
        certificateUrl: profileSource.certificate_url || '',
        certificateFilename: profileSource.certificate_filename || '',
        initials,
        avatarUrl: profileSource.profile_picture_url || profileSource.avatar_url || null,
        preferredEmploymentType: profileSource.preferred_employment_type || '',
        curriculumExperience: profileSource.curriculum_experience || '',
        availableFrom: profileSource.available_from || '',
        nextOfKinName: profileSource.next_of_kin_name || '',
        nextOfKinPhone: profileSource.next_of_kin_phone || '',
        nextOfKinRelationship: profileSource.next_of_kin_relationship || '',
        nextOfKinEmail: profileSource.next_of_kin_email || '',
      }
    : {
        ...MOCK_USER,
        ...(session?.role === 'user' ? { firstName: session.firstName, lastName: session.lastName, email: session.email } : {}),
      };

  const VIEW_TITLES = {
    dashboard:    'Dashboard',
    profile:      'My Profile',
    documents:    'Documents',
    applications: 'My Applications',
    alerts:       'Job Alerts',
    settings:     'Settings',
  };

  const mergeUploadedProfile = (result, kind) => {
    const uploadedProfile = result?.profile || {};
    setApiProfile(prev => ({
      ...(prev || {}),
      ...uploadedProfile,
      ...(kind === 'profile_picture' ? { profile_picture_url: uploadedProfile.profile_picture_url || result?.url || prev?.profile_picture_url } : {}),
    }));
  };

  const handleFileUpload = async (kind, file) => {
    if (!file) return;
    setUploadError('');
    if (kind === 'profile_picture') setAvatarUploading(true);
    else setUploadingKind(kind);
    try {
      if (!isApiMode()) {
        const localUrl = kind === 'profile_picture' ? URL.createObjectURL(file) : null;
        if (localUrl) {
          setApiProfile(prev => ({ ...(prev || {}), profile_picture_url: localUrl }));
        }
        return;
      }
      const result = await api.uploadUserFile(file, kind);
      mergeUploadedProfile(result, kind);
    } catch (err) {
      setUploadError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
      setUploadingKind('');
    }
  };

  // openProfileEdit must be declared BEFORE the checklist handler that calls it
  const openProfileEdit = (section = 'personal') => {
    setProfileError('');
    setProfileForm({
      phone: profileSource.phone || '',
      location: profileSource.location || '',
      bio: profileSource.bio || '',
      teaching_subject: profileSource.teaching_subject || '',
      preferred_level: profileSource.preferred_level || '',
      preferred_employment_type: profileSource.preferred_employment_type || '',
      available_from: profileSource.available_from || '',
      curriculum_experience: profileSource.curriculum_experience || '',
      next_of_kin_name: profileSource.next_of_kin_name || '',
      next_of_kin_phone: profileSource.next_of_kin_phone || '',
      next_of_kin_relationship: profileSource.next_of_kin_relationship || '',
      next_of_kin_email: profileSource.next_of_kin_email || '',
      years_of_experience: profileSource.years_of_experience !== undefined && profileSource.years_of_experience !== null ? profileSource.years_of_experience : '',
      date_of_birth: profileSource.date_of_birth || '',
    });
    setProfileEditSection(section);
  };

  // Checklist ADD handler: navigate then execute the action after a short delay
  const handleChecklistAction = (step) => {
    pendingActionRef.current = step.action;
    setActiveView(step.view);
    // Run the action on the next tick so the new view has mounted
    setTimeout(() => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action === 'edit-personal') openProfileEdit('personal');
      if (action === 'edit-teaching') openProfileEdit('teaching');
    }, 80);
  };

  const saveProfileEdit = async event => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      if (isApiMode()) {
        const result = await api.updateProfile(profileForm);
        setApiProfile(prev => ({ ...(prev || {}), ...(result.profile || {}), phone: profileForm.phone }));
      } else {
        setApiProfile(prev => ({ ...(prev || {}), ...profileForm }));
      }
      setProfileEditSection('');
    } catch (err) {
      setProfileError(err?.message || 'Could not save profile changes.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    queueToast("You've been signed out.", 'success');
    window.location.href = '/login';
  };

  const renderView = () => {
    switch (activeView) {
      case 'profile':      return <ProfileView      user={user} onPreviewAvatar={() => setAvatarPreview(true)} onUploadAvatar={file => handleFileUpload('profile_picture', file)} onEditProfile={openProfileEdit} avatarUploading={avatarUploading} uploadError={uploadError} />;
      case 'documents':    return <DocumentsView    user={user} onUploadDocument={handleFileUpload} uploadingKind={uploadingKind} uploadError={uploadError} highlight={pendingActionRef.current === 'highlight-cv' ? 'cv' : pendingActionRef.current === 'highlight-cert' ? 'cert' : null} />;
      case 'applications': return <ApplicationsView applications={applications} />;
      case 'alerts':       return <AlertsView initialAlerts={alerts} user={user} onSaved={next => { if (isApiMode()) setApiAlerts(next); }} />;
      case 'settings':     return <SettingsView onNavigate={setActiveView} />;
      default:             return <DashboardView user={user} setActive={setActiveView} onAction={handleChecklistAction} applications={applications} alerts={alerts} onPreviewAvatar={() => setAvatarPreview(true)} />;
    }
  };

  return (
    <div className="portal-layout">
      <Sidebar
        active={activeView}
        setActive={setActiveView}
        user={user}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        applicationCount={applications.length}
        onPreviewAvatar={() => setAvatarPreview(true)}
      />

      <main className="portal-main">
        {/* Topbar */}
        <div className="portal-topbar">
          <div className="portal-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Desktop-only back button: visible on non-dashboard views, hidden on dashboard */}
            {activeView !== 'dashboard' && (
              <button
                type="button"
                className="portal-desktop-back-btn"
                onClick={() => setActiveView('dashboard')}
                aria-label="Back to dashboard"
              >
                <Icon name="chevL" size={16} stroke={2.4} />
                <span>Dashboard</span>
              </button>
            )}
            {/* Mobile-only SchoolMS-style back button on subpages; the hamburger
                lives at the far right of the topbar (always available) */}
            {activeView !== 'dashboard' && (
              <button
                onClick={() => setActiveView('dashboard')}
                className="mobile-menu-toggle"
                style={{ display: 'none' }}
                aria-label="Back to dashboard"
              >
                <Icon name="chevL" size={18} stroke={2.4} />
              </button>
            )}
            <h1 className="portal-page-title">{VIEW_TITLES[activeView]}</h1>
          </div>
          <div className="portal-topbar-actions">
            <button
              type="button"
              className="topbar-icon-btn"
              title="Job Alerts"
              onClick={() => setActiveView('alerts')}
            >
              <Icon name="bell" size={18} stroke={1.9} />
              {alerts.length > 0 && <span className="notif-dot" />}
            </button>
            <button
              type="button"
              className="portal-user-chip"
              onClick={() => setAccountMenuOpen(open => !open)}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: '0.75rem', color: 'var(--navy)' }}>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : user.initials}
              </div>
              <span className="portal-user-chip-name" style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: "'Montserrat', sans-serif", color: 'var(--navy)' }}>
                {user.firstName}
              </span>
              <Icon name="chevron" size={14} stroke={2} />
            </button>
            {accountMenuOpen && (
              <div className="portal-account-menu" role="menu">
                <a href="/jobs" role="menuitem">
                  <Icon name="briefcase" size={16} stroke={1.9} />
                  Job Posts
                </a>
                <button type="button" role="menuitem" onClick={() => { setActiveView('profile'); setAccountMenuOpen(false); }}>
                  <Icon name="user" size={16} stroke={1.9} />
                  View / Edit Profile
                </button>
                <button type="button" role="menuitem" onClick={handleSignOut}>
                  <Icon name="x" size={16} stroke={1.9} />
                  Sign Out
                </button>
              </div>
            )}
            {/* Mobile-only hamburger at the far right corner; pushes the user pill left */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mobile-menu-toggle"
              style={{ display: 'none' }}
              aria-label="Open menu"
            >
              <Icon name="menu" size={18} stroke={2.2} />
            </button>
          </div>
        </div>

        {renderView()}
      </main>

      {avatarPreview && (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAvatarPreview(false); }}>
          <div className="avatar-preview-modal" role="dialog" aria-modal="true" aria-label="Profile picture preview">
            <button className="admin-modal-close" type="button" onClick={() => setAvatarPreview(false)}>
              <Icon name="x" size={16} stroke={2.1} />
              <span>Close</span>
            </button>
            <div className="avatar-preview-large">
              {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} /> : user.initials}
            </div>
            <h3>{user.firstName} {user.lastName}</h3>
            <p>{user.avatarUrl ? 'Profile picture' : 'No uploaded profile picture yet.'}</p>
            <label className="btn btn-primary" style={{ marginTop: 18 }}>
              {avatarUploading ? 'Uploading...' : user.avatarUrl ? 'Replace Photo' : 'Upload Photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => handleFileUpload('profile_picture', event.target.files?.[0])} />
            </label>
            {uploadError && <p className="form-error" style={{ marginTop: 10 }}>{uploadError}</p>}
          </div>
        </div>
      )}

      {profileEditSection && (
        <ProfileEditModal
          section={profileEditSection}
          form={profileForm}
          setForm={setProfileForm}
          onCancel={() => setProfileEditSection('')}
          onSave={saveProfileEdit}
          saving={profileSaving}
          error={profileError}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-toggle { display: flex !important; }
          .sidebar-overlay { display: block !important; }
        }
      `}</style>
    </div>
  );
};

export default UserPortalPage;
