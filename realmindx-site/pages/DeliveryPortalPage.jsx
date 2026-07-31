import React from 'react';

import { Icon } from '../assets/components.jsx';
import { api, isApiMode } from '../../src/lib/apiClient.js';
import { signInWithPhone, signOut } from '../../src/lib/authClient.js';
import { clearDemoSession } from '../../src/lib/demoAccounts.js';
import { dashboardPathForRole, loginPathForRole } from '../../src/lib/sessionRoutes.js';
import AuthLoadingScreen from '../../src/lib/AuthLoadingScreen.jsx';
import { copyTextToClipboard } from '../../src/lib/clipboard.js';
import toast from '../../src/lib/toast.js';
import { rankByFuzzyMatch } from '../../src/lib/fuzzySearch.js';

const ACTIVE_POLL_MS = 15000;

const ISSUE_OPTIONS = [
  ['customer_unavailable', 'Customer unavailable'],
  ['wrong_address', 'Wrong address'],
  ['customer_unreachable', 'Customer unreachable'],
  ['customer_refused_delivery', 'Customer refused delivery'],
  ['package_damaged', 'Package damaged'],
  ['vehicle_or_route_delay', 'Vehicle or route delay'],
  ['payment_issue', 'Payment issue'],
  ['returned_to_office', 'Returned to office'],
  ['other', 'Other'],
];

const statusLabel = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const deliveryTone = status => {
  if (status === 'delivered') return 'complete';
  if (['assigned_to_company', 'accepted_by_company', 'assigned_to_rider'].includes(status)) return 'attention';
  if (['rejected_by_company', 'issue_reported', 'failed', 'returned', 'cancelled'].includes(status)) return 'problem';
  return 'progress';
};

const PortalShell = ({ title, subtitle, children, onLogout }) => (
  <main className="delivery-portal">
    <header className="delivery-portal-top">
      <div>
        <span>RealMindX Bookshop</span>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {onLogout ? <button className="btn btn-outline-navy" type="button" onClick={onLogout}>Sign Out</button> : null}
    </header>
    {children}
  </main>
);

const Field = ({ label, children }) => (
  <label className="delivery-field">
    <span>{label}</span>
    {children}
  </label>
);

const DeliveryPasswordInput = ({ value, onChange, placeholder, autoComplete, required = false, minLength, name }) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="delivery-password-field">
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
      />
      <button type="button" onClick={() => setVisible(current => !current)} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>
        <Icon name={visible ? 'eyeOff' : 'eye'} size={15} />
      </button>
    </div>
  );
};

const DeliveryLogin = ({ role }) => {
  const isCompany = role === 'delivery_company_user';
  const [form, setForm] = React.useState({ phone: '', password: '', remember: true });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showTerms, setShowTerms] = React.useState(false);
  const set = key => event => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!isApiMode()) {
      setError('Delivery portals require the live API.');
      return;
    }
    setBusy(true);
    try {
      await signInWithPhone({ ...form, role });
      window.location.href = dashboardPathForRole(role);
    } catch (err) {
      setError(err?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell
      title={isCompany ? 'Delivery Company Portal' : 'Rider Portal'}
      subtitle={isCompany ? 'Dispatch orders assigned by RealMindX.' : 'Manage your assigned deliveries.'}
    >
      <form className="delivery-login-panel" onSubmit={submit}>
        {error ? <div className="form-error">{error}</div> : null}
        <Field label="Phone number">
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="024XXXXXXX" autoComplete="tel" required />
        </Field>
        <Field label="Password">
          <DeliveryPasswordInput value={form.password} onChange={set('password')} autoComplete="current-password" required />
        </Field>
        <label className="delivery-check">
          <input type="checkbox" checked={form.remember} onChange={set('remember')} />
          <span>Keep me signed in</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
        <p className="delivery-login-terms">
          By signing in to use the {isCompany ? 'RealMindX Delivery Company Platform' : 'RealMindX Rider Platform'}, you agree to the{' '}
          <button type="button" onClick={() => setShowTerms(true)}>{isCompany ? 'RealMindX Delivery Company Platform Terms' : 'RealMindX Rider Platform Terms'}</button>.
        </p>
      </form>
      {showTerms ? <DeliveryTermsModal role={role} onClose={() => setShowTerms(false)} /> : null}
    </PortalShell>
  );
};

const useVisiblePolling = (enabled, callback, delay = ACTIVE_POLL_MS) => {
  React.useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const run = () => {
      if (document.visibilityState === 'visible') callback();
    };
    timer = window.setInterval(run, delay);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [callback, delay, enabled]);
};

const EmptyState = ({ title, body }) => (
  <div className="delivery-empty">
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
);

const PAGE_SIZES = [5, 10, 20, 50, 100];

const PaginationControls = ({ page, pageSize, total, onPage, onPageSize }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return null;
  return (
    <div className="delivery-pagination">
      <span>{total} result{total === 1 ? '' : 's'}</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="chevL" size={16} /></button>
        <strong>Page {page} of {totalPages}</strong>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="chevR" size={16} /></button>
      </div>
      <label>Rows <select value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
  );
};

const RiderEditModal = ({ rider, onClose, onSaved }) => {
  const [form, setForm] = React.useState({ name: rider.name || '', phone: rider.phone || '' });
  const [busy, setBusy] = React.useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.deliveryCompanyUpdateRider(rider.id, form);
      toast.success('Rider details updated.');
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Could not update rider.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="delivery-password-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="delivery-password-modal delivery-rider-edit-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Edit ${rider.name}`}>
        <div className="delivery-password-modal-head">
          <div><span>Rider Account</span><h2>Edit rider</h2><p>Update the rider's name or normalized login phone number.</p></div>
          <button className="delivery-icon-button" type="button" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <Field label="Rider name"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required /></Field>
        <Field label="Phone number"><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} required /></Field>
        <div className="delivery-modal-actions">
          <button className="btn btn-outline-navy" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
};

const PortalAccessGate = ({ role, children }) => {
  const [verified, setVerified] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const loginPath = loginPathForRole(role);
    const verify = async () => {
      if (!isApiMode()) {
        clearDemoSession();
        window.location.replace(loginPath);
        return;
      }
      try {
        if (role === 'delivery_company_user') {
          await api.deliveryCompanyMe();
        } else {
          await api.deliveryRiderMe();
        }
        if (alive) setVerified(true);
      } catch {
        clearDemoSession();
        if (alive) window.location.replace(loginPath);
      }
    };
    verify();
    return () => { alive = false; };
  }, [role]);

  if (!verified) return <AuthLoadingScreen />;
  return children;
};

const ForcedDeliveryPasswordModal = ({ accountLabel, onChanged, onSignOut }) => {
  const [form, setForm] = React.useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (form.new_password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ current_password: form.current_password, new_password: form.new_password });
      onChanged();
    } catch (err) {
      setError(err?.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="delivery-password-modal-backdrop">
      <section className="delivery-password-modal" role="dialog" aria-modal="true" aria-label="Change temporary password">
        <div className="delivery-password-modal-head">
          <div>
            <span>First Sign-In</span>
            <h2>Change your temporary password</h2>
            <p>Your {accountLabel} account cannot perform delivery actions until you choose a private password.</p>
          </div>
          <button className="btn btn-outline-navy btn-sm" type="button" onClick={onSignOut}>Sign Out</button>
        </div>
        <form onSubmit={submit}>
          <Field label="Current temporary password">
            <DeliveryPasswordInput value={form.current_password} onChange={set('current_password')} autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <DeliveryPasswordInput value={form.new_password} onChange={set('new_password')} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password">
            <DeliveryPasswordInput value={form.confirm_password} onChange={set('confirm_password')} autoComplete="new-password" required />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Updating...' : 'Change Password and Continue'}</button>
        </form>
      </section>
    </div>
  );
};

const DeliveryTermsModal = ({ role, required = false, onClose, onAccepted, onSignOut }) => {
  const isCompany = role === 'delivery_company_user';
  const [terms, setTerms] = React.useState(null);
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    (isCompany ? api.deliveryCompanyTerms() : api.deliveryRiderTerms())
      .then(result => { if (alive) setTerms(result.terms); })
      .catch(err => { if (alive) setError(err?.message || 'Could not load the platform terms.'); });
    return () => { alive = false; };
  }, [isCompany]);

  const accept = async () => {
    if (!terms || !agreed) return;
    setBusy(true); setError('');
    try {
      const result = await (isCompany ? api.deliveryCompanyAcceptTerms : api.deliveryRiderAcceptTerms)({ version: terms.version, hash: terms.hash });
      toast.success('Platform Terms accepted.');
      onAccepted?.(result.terms);
    } catch (err) {
      setError(err?.message || 'Could not record your acceptance.');
    } finally { setBusy(false); }
  };

  return (
    <div className="delivery-password-modal-backdrop delivery-terms-backdrop" role="presentation" onMouseDown={event => { if (!required && event.target === event.currentTarget) onClose?.(); }}>
      <section className="delivery-password-modal delivery-terms-modal" role="dialog" aria-modal="true" aria-label={terms?.title || 'Platform Terms'}>
        <div className="delivery-password-modal-head">
          <div><span>Platform Terms</span><h2>{terms?.title || 'Loading terms...'}</h2>{terms ? <p>Effective {terms.effective_date} | Version {terms.version}</p> : null}</div>
          {!required ? <button className="delivery-icon-button" type="button" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button> : null}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {!terms && !error ? <EmptyState title="Loading Terms" body="Preparing the current legal terms." /> : null}
        {terms ? <div className="delivery-terms-content" tabIndex="0">
          {(terms.intro || []).map((paragraph, index) => <p key={`intro-${index}`}>{paragraph}</p>)}
          {(terms.sections || []).map(section => <section key={section.heading}><h3>{section.heading}</h3>{section.paragraphs.map((paragraph, index) => <p key={`${section.heading}-${index}`}>{paragraph}</p>)}</section>)}
        </div> : null}
        {terms ? <div className="delivery-terms-footer">
          <a href={terms.download_url} target="_blank" rel="noreferrer" className="btn btn-outline-navy btn-sm">Download DOCX</a>
          {required ? <label className="delivery-check delivery-terms-check"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span>{terms.checkbox_wording}</span></label> : null}
          <div className="delivery-modal-actions">
            {required ? <button className="btn btn-outline-navy" type="button" onClick={onSignOut}>Sign Out</button> : <button className="btn btn-outline-navy" type="button" onClick={onClose}>Close</button>}
            {required ? <button className="btn btn-primary" type="button" disabled={!agreed || busy} onClick={accept}>{busy ? 'Recording Acceptance...' : 'I Agree and Continue'}</button> : null}
          </div>
        </div> : null}
      </section>
    </div>
  );
};

const DeliveryMeta = ({ delivery, riderSafe = false }) => (
  <dl className="delivery-meta">
    <div><dt>Order</dt><dd>{delivery.order_reference}</dd></div>
    <div><dt>Customer</dt><dd>{delivery.customer_name || 'Customer'}</dd></div>
    <div><dt>Phone</dt><dd>{delivery.customer_phone || 'Unavailable'}</dd></div>
    <div><dt>Location</dt><dd>{delivery.delivery_location || 'Not provided'}</dd></div>
    <div><dt>Status</dt><dd>{statusLabel(delivery.status)}</dd></div>
    <div><dt>OTP</dt><dd>{delivery.otp?.blocked ? 'Staff review required' : statusLabel(delivery.otp?.status || 'not_generated')}</dd></div>
    {!riderSafe && <div><dt>Rider</dt><dd>{delivery.rider_name || 'Unassigned'}</dd></div>}
    {delivery.delivery_notes ? <div className="wide"><dt>Notes</dt><dd>{delivery.delivery_notes}</dd></div> : null}
    {delivery.issue_reason ? <div className="wide"><dt>Issue</dt><dd>{statusLabel(delivery.issue_reason)}{delivery.issue_note ? ` - ${delivery.issue_note}` : ''}</dd></div> : null}
  </dl>
);

const CompanyDeliveryCard = ({ delivery, riders, onAction }) => {
  const [open, setOpen] = React.useState(false);
  const [riderId, setRiderId] = React.useState(delivery.rider_id || '');
  const [reason, setReason] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');
  const [issueReason, setIssueReason] = React.useState('customer_unavailable');
  const [issueNote, setIssueNote] = React.useState('');

  const needsReassignReason = delivery.status === 'picked_up' && riderId && Number(riderId) !== Number(delivery.rider_id);

  return (
    <>
      <button className={`delivery-compact-card tone-${deliveryTone(delivery.status)}`} type="button" onClick={() => setOpen(true)}>
        <strong>{delivery.order_reference}</strong>
        <span>{delivery.delivery_location || 'Location unavailable'}</span>
        <small>{statusLabel(delivery.status)}</small>
      </button>
      {open ? <div className="delivery-password-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <article className={`delivery-card delivery-detail-modal tone-${deliveryTone(delivery.status)}`} role="dialog" aria-modal="true">
      <button className="delivery-icon-button delivery-detail-close" type="button" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={20} /></button>
      <div className="delivery-card-head">
        <div>
          <h2>{delivery.order_reference}</h2>
          <p>{delivery.tracking_label}</p>
        </div>
        <span>{statusLabel(delivery.status)}</span>
      </div>
      <DeliveryMeta delivery={delivery} />
      <div className="delivery-actions">
        {delivery.status === 'assigned_to_company' ? (
          <>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => onAction(() => api.deliveryCompanyAccept(delivery.id))}>Accept</button>
            <input value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Rejection reason" />
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onAction(() => api.deliveryCompanyReject(delivery.id, { reason: rejectReason }))}>Reject</button>
          </>
        ) : null}
        {!['delivered', 'cancelled', 'returned', 'failed', 'rejected_by_company'].includes(delivery.status) ? (
          <>
            <select value={riderId} onChange={event => setRiderId(event.target.value)}>
              <option value="">Select rider</option>
              {riders.filter(rider => rider.is_active).map(rider => (
                <option key={rider.id} value={rider.id}>{rider.name} ({rider.phone})</option>
              ))}
            </select>
            {needsReassignReason ? <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for reassignment" /> : null}
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!riderId}
              onClick={() => onAction(() => api.deliveryCompanyAssignRider(delivery.id, { rider_id: Number(riderId), reason }))}
            >
              {delivery.rider_id ? 'Reassign Rider' : 'Assign Rider'}
            </button>
          </>
        ) : null}
        {delivery.status === 'picked_up' ? <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onAction(() => api.deliveryCompanyResendOtp(delivery.id))}>Resend Customer OTP</button> : null}
      </div>
      {!['delivered', 'cancelled', 'returned', 'failed'].includes(delivery.status) ? (
        <div className="delivery-issue-row">
          <select value={issueReason} onChange={event => setIssueReason(event.target.value)}>
            {ISSUE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input value={issueNote} onChange={event => setIssueNote(event.target.value)} placeholder="Optional note" />
          <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onAction(() => api.deliveryCompanyReportIssue(delivery.id, { reason: issueReason, note: issueNote }))}>Report Issue</button>
        </div>
      ) : null}
    </article></div> : null}
    </>
  );
};

const RiderForm = ({ onCreated, onError, onNotice }) => {
  const [form, setForm] = React.useState({ name: '', phone: '' });
  const [busy, setBusy] = React.useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.deliveryCompanyCreateRider(form);
      const temporaryPassword = result?.temporary_password || '12345678';
      const copied = await copyTextToClipboard(temporaryPassword);
      setForm({ name: '', phone: '' });
      onNotice(`Rider created. Temporary password ${temporaryPassword}${copied ? ' was copied to the clipboard' : ' is ready to share'}.`);
      await onCreated();
    } catch (err) {
      onError(err?.message || 'Could not create rider.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="delivery-rider-form" onSubmit={submit}>
      <input value={form.name} onChange={set('name')} placeholder="Rider name" required />
      <input value={form.phone} onChange={set('phone')} placeholder="Phone number" required />
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Rider'}</button>
    </form>
  );
};

const RiderManagementRow = ({ rider, onChanged, onEdit, onSelect }) => {
  const [busy, setBusy] = React.useState(false);

  const toggleActive = async () => {
    setBusy(true);
    try {
      await api.deliveryCompanyUpdateRider(rider.id, { is_active: !rider.is_active });
      toast.success(rider.is_active ? 'Rider deactivated.' : 'Rider activated.');
      await onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not update rider status.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      const result = await api.deliveryCompanyResetRiderPassword(rider.id);
      const temporaryPassword = result?.temporary_password || '12345678';
      const copied = await copyTextToClipboard(temporaryPassword);
      toast.success(`Password reset to ${temporaryPassword}${copied ? ' and copied to the clipboard' : ''}.`);
      await onChanged();
    } catch (err) {
      toast.error(err?.message || 'Could not reset rider password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`delivery-rider-row${rider.is_active ? '' : ' inactive'}`}>
      <div className="delivery-rider-identity">
        <button className="delivery-rider-name-button" type="button" onClick={() => onSelect(rider)}>{rider.name}</button>
        <span>{rider.phone}</span>
      </div>
      <span className={`delivery-status-pill ${rider.is_active ? 'active' : 'inactive'}`}>{rider.is_active ? 'Active' : 'Inactive'}</span>
      <span className={`delivery-status-pill ${rider.terms?.accepted ? 'active' : 'inactive'}`}>{rider.terms?.accepted ? 'Terms accepted' : 'Terms pending'}</span>
      <span className="delivery-rider-count"><strong>{rider.active_deliveries || 0}</strong> active</span>
      <span className="delivery-rider-count"><strong>{rider.completed_deliveries || 0}</strong> delivered</span>
      <div className="delivery-row-actions">
        <button className="delivery-icon-text-button" type="button" onClick={() => onSelect(rider)}><Icon name="clock" size={16} /> History</button>
        <button className="delivery-icon-text-button" type="button" disabled={busy} onClick={() => onEdit(rider)}><Icon name="settings" size={16} /> Edit</button>
        <button className="delivery-icon-text-button" type="button" disabled={busy} onClick={toggleActive}>{rider.is_active ? 'Deactivate' : 'Activate'}</button>
        <button className="delivery-icon-text-button" type="button" disabled={busy} onClick={resetPassword}><Icon name="lock" size={16} /> Reset</button>
      </div>
    </div>
  );
};

const moneyLabel = value => `GHS ${Number(value || 0).toFixed(2)}`;

const CompanySettlements = () => {
  const [items, setItems] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const load = React.useCallback(async () => {
    try { setItems((await api.deliveryCompanySettlements()).items || []); }
    catch (err) { toast.error(err?.message || 'Could not load settlements.'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const open = async item => {
    try { setSelected((await api.deliveryCompanySettlement(item.id)).settlement); }
    catch (err) { toast.error(err?.message || 'Could not open settlement.'); }
  };
  const dispute = async () => {
    try {
      const result = await api.deliveryCompanyDisputeSettlement(selected.id, { note });
      setSelected(result.settlement); setNote(''); await load(); toast.success('Settlement dispute submitted.');
    } catch (err) { toast.error(err?.message || 'Could not submit dispute.'); }
  };
  const filtered = React.useMemo(
    () => rankByFuzzyMatch(items, search, item => [item.reference, item.settlement_date, item.status, item.company_name]),
    [items, search],
  );
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => setPage(1), [search, pageSize]);
  React.useEffect(() => setPage(current => Math.min(current, Math.max(1, Math.ceil(filtered.length / pageSize)))), [filtered.length, pageSize]);
  if (loading) return <EmptyState title="Loading settlements" body="Preparing the daily accounting view." />;
  return <section className="delivery-section">
    <div className="delivery-section-head"><div><h2>Settlements</h2><p>Daily delivery collections and balances with RealMindX.</p></div></div>
    <div className="delivery-list-toolbar"><label className="delivery-search-field"><Icon name="search" size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search settlements" /></label></div>
    <div className="settlement-card-grid">
      {paged.map(item => <button key={item.id} className="settlement-summary-card" type="button" onClick={() => open(item)}>
        <span>{item.settlement_date}</span><strong>{item.reference}</strong><small>{item.delivery_count} deliveries</small>
        <b className={item.net_balance >= 0 ? 'due-rmx' : 'due-company'}>{item.balance_direction === 'company_owes_realmindx' ? `Company owes ${moneyLabel(item.net_balance)}` : item.balance_direction === 'realmindx_owes_company' ? `RealMindX owes ${moneyLabel(Math.abs(item.net_balance))}` : 'Balanced'}</b>
      </button>)}
      {!filtered.length ? <EmptyState title={search ? 'No matching settlements' : 'No settlements yet'} body={search ? 'Try a different reference, date, or status.' : 'A daily settlement appears after a delivery is completed.'} /> : null}
    </div>
    <PaginationControls page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
    {selected ? <div className="delivery-password-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="delivery-password-modal settlement-detail-modal" role="dialog" aria-modal="true">
        <div className="delivery-password-modal-head"><div><span>Settlement</span><h2>{selected.reference}</h2><p>{selected.settlement_date} | {statusLabel(selected.status)}</p></div><button className="delivery-icon-button" type="button" onClick={() => setSelected(null)}><Icon name="x" size={20} /></button></div>
        <div className="delivery-kpi-strip"><div><span>Book value</span><strong>{moneyLabel(selected.book_subtotal)}</strong></div><div><span>Company payable</span><strong>{moneyLabel(selected.company_payable)}</strong></div><div><span>Net balance</span><strong>{moneyLabel(selected.net_balance)}</strong></div></div>
        <div className="settlement-line-list">{(selected.lines || []).map(line => <div key={line.id}><strong>{line.order_reference}</strong><span>{line.rider_name || '-'}</span><span>{line.delivery_location || '-'}</span><span>{statusLabel(line.payment_method)}</span><b>{moneyLabel(line.net_balance)}</b></div>)}</div>
        <div className="delivery-modal-actions">{['csv', 'xlsx', 'pdf'].map(format => <a key={format} className="btn btn-outline-navy" href={api.deliveryCompanySettlementExportUrl(selected.id, format)}>{format.toUpperCase()}</a>)}</div>
        {selected.dispute_status !== 'open' ? <div className="delivery-issue-row"><input value={note} onChange={event => setNote(event.target.value)} placeholder="Explain the settlement concern" /><button className="btn btn-outline-navy" type="button" disabled={!note.trim()} onClick={dispute}>Raise Dispute</button></div> : <p className="form-error">Dispute open: {selected.dispute_notes}</p>}
      </section>
    </div> : null}
  </section>;
};

const CompanyPortal = () => {
  const [profile, setProfile] = React.useState(null);
  const [deliveries, setDeliveries] = React.useState([]);
  const [riders, setRiders] = React.useState([]);
  const [view, setView] = React.useState('deliveries');
  const [scope, setScope] = React.useState('active');
  const [selectedRider, setSelectedRider] = React.useState(null);
  const [riderScope, setRiderScope] = React.useState('all');
  const [riderDetailBusy, setRiderDetailBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [riderSearch, setRiderSearch] = React.useState('');
  const [deliverySearch, setDeliverySearch] = React.useState('');
  const [deliveryPage, setDeliveryPage] = React.useState(1);
  const [deliveryPageSize, setDeliveryPageSize] = React.useState(10);
  const [riderPage, setRiderPage] = React.useState(1);
  const [riderPageSize, setRiderPageSize] = React.useState(10);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [historyPageSize, setHistoryPageSize] = React.useState(10);
  const [editingRider, setEditingRider] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!isApiMode()) return;
    try {
      const me = await api.deliveryCompanyMe();
      const nextProfile = { ...me.company_user, must_change_password: Boolean(me.user?.must_change_password) };
      setProfile(nextProfile);
      if (nextProfile.must_change_password || !nextProfile.terms?.accepted) {
        setError('');
        return;
      }
      const [deliveryData, riderData] = await Promise.all([
        api.deliveryCompanyDeliveries('all'),
        api.deliveryCompanyRiders(),
      ]);
      setDeliveries(deliveryData.items || []);
      setRiders(riderData.items || []);
      setError('');
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = loginPathForRole('delivery_company_user');
        return;
      }
      setError(err?.message || 'Could not load deliveries.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  useVisiblePolling(Boolean(profile) && view === 'deliveries' && scope === 'active', load);

  const openRider = React.useCallback(async (rider, nextScope = riderScope) => {
    setSelectedRider(current => current?.rider?.id === rider.id ? current : { rider, deliveries: [] });
    setRiderDetailBusy(true);
    setError('');
    try {
      setSelectedRider(await api.deliveryCompanyRiderDetail(rider.id, nextScope));
    } catch (err) {
      setError(err?.message || 'Could not load rider history.');
    } finally {
      setRiderDetailBusy(false);
    }
  }, [riderScope]);

  React.useEffect(() => {
    if (selectedRider?.rider?.id) openRider(selectedRider.rider, riderScope);
  }, [riderScope, openRider, selectedRider?.rider?.id]);

  const filteredRiders = React.useMemo(
    () => rankByFuzzyMatch(riders, riderSearch, rider => [rider.name, rider.phone, rider.status]),
    [riderSearch, riders],
  );
  const filteredDeliveries = React.useMemo(() => {
    const scoped = deliverySearch ? deliveries : deliveries.filter(delivery => scope === 'completed'
      ? ['delivered', 'failed', 'returned', 'cancelled'].includes(delivery.status)
      : !['delivered', 'failed', 'returned', 'cancelled'].includes(delivery.status));
    return rankByFuzzyMatch(scoped, deliverySearch, delivery => [delivery.order_reference, delivery.customer_name, delivery.customer_phone, delivery.delivery_location, delivery.status, delivery.rider_name]);
  }, [deliveries, deliverySearch, scope]);
  const deliveryTotalPages = Math.max(1, Math.ceil(filteredDeliveries.length / deliveryPageSize));
  const pagedDeliveries = filteredDeliveries.slice((deliveryPage - 1) * deliveryPageSize, deliveryPage * deliveryPageSize);
  const riderTotalPages = Math.max(1, Math.ceil(filteredRiders.length / riderPageSize));
  const pagedRiders = filteredRiders.slice((riderPage - 1) * riderPageSize, riderPage * riderPageSize);
  const riderHistory = selectedRider?.deliveries || [];
  const historyTotalPages = Math.max(1, Math.ceil(riderHistory.length / historyPageSize));
  const pagedHistory = riderHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  React.useEffect(() => { setRiderPage(1); }, [riderSearch, riderPageSize]);
  React.useEffect(() => { setDeliveryPage(1); }, [deliverySearch, deliveryPageSize, scope]);
  React.useEffect(() => { setDeliveryPage(current => Math.min(current, deliveryTotalPages)); }, [deliveryTotalPages]);
  React.useEffect(() => { setRiderPage(current => Math.min(current, riderTotalPages)); }, [riderTotalPages]);
  React.useEffect(() => { setHistoryPage(1); }, [riderScope, historyPageSize, selectedRider?.rider?.id]);
  React.useEffect(() => { setHistoryPage(current => Math.min(current, historyTotalPages)); }, [historyTotalPages]);

  const onAction = async fn => {
    setError('');
    try {
      await fn();
      await load();
      toast.success('Delivery updated.');
    } catch (err) {
      setError(err?.message || 'Action failed.');
      toast.error(err?.message || 'Action failed.');
    }
  };

  const logout = async () => {
    await signOut();
    window.location.href = loginPathForRole('delivery_company_user');
  };

  return (
    <PortalShell title="Delivery Company Portal" subtitle={profile?.company_name} onLogout={logout}>
      {error ? <div className="form-error delivery-alert">{error}</div> : null}
      <section className="delivery-kpi-strip" aria-label="Delivery company summary">
        <div><span>Active deliveries</span><strong>{deliveries.filter(item => !['delivered', 'failed', 'returned', 'cancelled'].includes(item.status)).length}</strong></div>
        <div><span>Available riders</span><strong>{riders.filter(item => item.is_active).length}</strong></div>
        <div><span>Total riders</span><strong>{riders.length}</strong></div>
      </section>
      <section className="delivery-toolbar">
        <div className="segmented">
          <button type="button" className={view === 'deliveries' ? 'active' : ''} onClick={() => setView('deliveries')}>Deliveries</button>
          <button type="button" className={view === 'riders' ? 'active' : ''} onClick={() => setView('riders')}>Riders</button>
          <button type="button" className={view === 'settlements' ? 'active' : ''} onClick={() => setView('settlements')}>Settlements</button>
        </div>
      </section>
      {view === 'settlements' ? <CompanySettlements /> : view === 'deliveries' ? (
        <>
          <section className="delivery-toolbar delivery-subtoolbar">
            <div className="segmented">
              <button type="button" className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>Active</button>
              <button type="button" className={scope === 'completed' ? 'active' : ''} onClick={() => setScope('completed')}>Completed</button>
            </div>
            <label className="delivery-search-field"><Icon name="search" size={18} /><input value={deliverySearch} onChange={event => setDeliverySearch(event.target.value)} placeholder="Search deliveries" /></label>
          </section>
          <section className="delivery-grid">
            {loading ? <EmptyState title="Loading deliveries" body="Fetching assigned orders." /> : null}
            {!loading && filteredDeliveries.length === 0 ? <EmptyState title={deliverySearch ? 'No matching deliveries' : 'No deliveries here'} body={deliverySearch ? 'Try a different order reference, location, rider, or status.' : 'Assigned orders will appear here.'} /> : null}
            {pagedDeliveries.map(delivery => (
              <CompanyDeliveryCard key={delivery.id} delivery={delivery} riders={riders} onAction={onAction} />
            ))}
          </section>
          <PaginationControls page={deliveryPage} pageSize={deliveryPageSize} total={filteredDeliveries.length} onPage={setDeliveryPage} onPageSize={setDeliveryPageSize} />
        </>
      ) : (
        <section className="delivery-section delivery-riders-page">
          <div className="delivery-section-head">
            <div><h2>Riders</h2><p>Create accounts, manage access, and review each rider's assigned delivery history.</p></div>
          </div>
          <RiderForm onCreated={load} onError={message => { setError(message); toast.error(message); }} onNotice={message => toast.success(message)} />
          <div className="delivery-list-toolbar">
            <label className="delivery-search-field"><Icon name="search" size={18} /><input value={riderSearch} onChange={event => setRiderSearch(event.target.value)} placeholder="Search riders by name, phone, or status" /></label>
          </div>
          <div className="delivery-rider-table-head" aria-hidden="true"><span>Rider</span><span>Account</span><span>Terms</span><span>Active Jobs</span><span>Delivered</span><span>Actions</span></div>
          <div className="delivery-rider-list">
            {filteredRiders.length === 0 ? <EmptyState title={riderSearch ? 'No matching riders' : 'No riders yet'} body={riderSearch ? 'Try a different spelling or fewer characters.' : 'Create the first rider account for this company.'} /> : null}
            {pagedRiders.map(rider => (
              <RiderManagementRow key={rider.id} rider={rider} onChanged={load} onEdit={setEditingRider} onSelect={openRider} />
            ))}
          </div>
          <PaginationControls page={riderPage} pageSize={riderPageSize} total={filteredRiders.length} onPage={setRiderPage} onPageSize={setRiderPageSize} />
          {selectedRider && (
            <section className="delivery-rider-history">
              <div className="delivery-rider-history-head">
                <div><span>Rider Profile</span><h2>{selectedRider.rider?.name}</h2><p>{selectedRider.rider?.phone} | {selectedRider.rider?.is_active ? 'Active' : 'Inactive'}</p></div>
                <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => setSelectedRider(null)}>Close</button>
              </div>
              <div className="segmented">
                {['all', 'active', 'completed'].map(value => <button key={value} type="button" className={riderScope === value ? 'active' : ''} onClick={() => setRiderScope(value)}>{statusLabel(value)}</button>)}
              </div>
              <div className="delivery-rider-history-list">
                {riderDetailBusy ? <p>Loading rider history...</p> : null}
                {!riderDetailBusy && (selectedRider.deliveries || []).length === 0 ? <p>No deliveries in this view.</p> : null}
                {pagedHistory.map(delivery => (
                  <div key={delivery.id}>
                    <span><strong>{delivery.order_reference}</strong><small>{delivery.customer_name || 'Customer'}</small></span>
                    <span>{statusLabel(delivery.status)}</span>
                    <span>{delivery.delivery_location || '-'}</span>
                    <span>{delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString() : delivery.updated_at ? new Date(delivery.updated_at).toLocaleString() : '-'}</span>
                  </div>
                ))}
              </div>
              <PaginationControls page={historyPage} pageSize={historyPageSize} total={riderHistory.length} onPage={setHistoryPage} onPageSize={setHistoryPageSize} />
            </section>
          )}
        </section>
      )}
      {editingRider ? <RiderEditModal rider={editingRider} onClose={() => setEditingRider(null)} onSaved={load} /> : null}
      {profile?.must_change_password ? (
        <ForcedDeliveryPasswordModal
          accountLabel="company manager"
          onChanged={() => { setProfile(current => ({ ...current, must_change_password: false })); load(); }}
          onSignOut={logout}
        />
      ) : null}
      {profile && !profile.must_change_password && !profile.terms?.accepted ? (
        <DeliveryTermsModal
          role="delivery_company_user"
          required
          onAccepted={terms => { setProfile(current => ({ ...current, terms })); load(); }}
          onSignOut={logout}
        />
      ) : null}
    </PortalShell>
  );
};

const RiderDeliveryCard = ({ delivery, onAction }) => {
  const [open, setOpen] = React.useState(false);
  const [otp, setOtp] = React.useState('');
  const [issueReason, setIssueReason] = React.useState('customer_unavailable');
  const [issueNote, setIssueNote] = React.useState('');
  return (
    <>
      <button className={`delivery-compact-card tone-${deliveryTone(delivery.status)}`} type="button" onClick={() => setOpen(true)}>
        <strong>{delivery.order_reference}</strong>
        <span>{delivery.delivery_location || 'Location unavailable'}</span>
        <small>{statusLabel(delivery.status)}</small>
      </button>
      {open ? <div className="delivery-password-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <article className={`delivery-card delivery-detail-modal tone-${deliveryTone(delivery.status)}`} role="dialog" aria-modal="true">
      <button className="delivery-icon-button delivery-detail-close" type="button" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={20} /></button>
      <div className="delivery-card-head">
        <div>
          <h2>{delivery.order_reference}</h2>
          <p>{delivery.tracking_label}</p>
        </div>
        <span>{statusLabel(delivery.status)}</span>
      </div>
      <DeliveryMeta delivery={delivery} riderSafe />
      <div className="delivery-actions">
        {delivery.status === 'assigned_to_rider' ? (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onAction(() => api.deliveryRiderPickup(delivery.id))}>Picked Up</button>
        ) : null}
        {delivery.status === 'picked_up' ? (
          <>
            <p className="delivery-otp-warning">Enter the OTP only when you are physically delivering the package to the customer or an authorised receiver.</p>
            <input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Customer OTP" inputMode="numeric" />
            <button className="btn btn-primary btn-sm" type="button" onClick={() => onAction(() => api.deliveryRiderDeliver(delivery.id, otp))}>Mark Delivered</button>
            <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onAction(() => api.deliveryRiderResendOtp(delivery.id))}>Resend OTP</button>
          </>
        ) : null}
      </div>
      {!['delivered', 'cancelled', 'returned', 'failed'].includes(delivery.status) ? (
        <div className="delivery-issue-row">
          <select value={issueReason} onChange={event => setIssueReason(event.target.value)}>
            {ISSUE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input value={issueNote} onChange={event => setIssueNote(event.target.value)} placeholder="Optional note" />
          <button className="btn btn-outline-navy btn-sm" type="button" onClick={() => onAction(() => api.deliveryRiderReportIssue(delivery.id, { reason: issueReason, note: issueNote }))}>Report Issue</button>
        </div>
      ) : null}
    </article></div> : null}
    </>
  );
};

const RiderPortal = () => {
  const [rider, setRider] = React.useState(null);
  const [deliveries, setDeliveries] = React.useState([]);
  const [scope, setScope] = React.useState('active');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const load = React.useCallback(async () => {
    if (!isApiMode()) return;
    try {
      const me = await api.deliveryRiderMe();
      const nextRider = { ...me.rider, must_change_password: Boolean(me.user?.must_change_password) };
      setRider(nextRider);
      if (nextRider.must_change_password || !nextRider.terms?.accepted) {
        setError('');
        return;
      }
      const deliveryData = await api.deliveryRiderDeliveries('all');
      setDeliveries(deliveryData.items || []);
      setError('');
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = loginPathForRole('delivery_rider');
        return;
      }
      setError(err?.message || 'Could not load deliveries.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  useVisiblePolling(Boolean(rider) && scope === 'active', load);

  const onAction = async fn => {
    setError('');
    try {
      await fn();
      await load();
      toast.success('Delivery updated.');
    } catch (err) {
      setError(err?.message || 'Action failed.');
      toast.error(err?.message || 'Action failed.');
    }
  };

  const logout = async () => {
    await signOut();
    window.location.href = loginPathForRole('delivery_rider');
  };

  const filteredDeliveries = React.useMemo(() => {
    const scoped = search ? deliveries : deliveries.filter(delivery => scope === 'history'
      ? ['delivered', 'failed', 'returned', 'cancelled'].includes(delivery.status)
      : ['assigned_to_rider', 'picked_up', 'issue_reported'].includes(delivery.status));
    return rankByFuzzyMatch(scoped, search, delivery => [delivery.order_reference, delivery.customer_name, delivery.customer_phone, delivery.delivery_location, delivery.status]);
  }, [deliveries, search, scope]);
  const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / pageSize));
  const pagedDeliveries = filteredDeliveries.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => { setPage(1); }, [scope, search, pageSize]);
  React.useEffect(() => { setPage(current => Math.min(current, totalPages)); }, [totalPages]);

  return (
    <PortalShell title="Rider Portal" subtitle={rider?.name} onLogout={logout}>
      {error ? <div className="form-error delivery-alert">{error}</div> : null}
      <section className="delivery-kpi-strip delivery-rider-kpis" aria-label="Rider delivery summary">
        <div><span>Active</span><strong>{deliveries.filter(item => ['assigned_to_rider', 'picked_up', 'issue_reported'].includes(item.status)).length}</strong></div>
        <div><span>Out for delivery</span><strong>{deliveries.filter(item => item.status === 'picked_up').length}</strong></div>
        <div><span>Current view</span><strong>{scope === 'history' ? 'History' : 'Active'}</strong></div>
      </section>
      <section className="delivery-toolbar delivery-rider-toolbar">
        <div className="segmented">
          <button type="button" className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>Active</button>
          <button type="button" className={scope === 'history' ? 'active' : ''} onClick={() => setScope('history')}>History</button>
        </div>
        <label className="delivery-search-field"><Icon name="search" size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search deliveries" /></label>
      </section>
      <section className="delivery-grid">
        {loading ? <EmptyState title="Loading deliveries" body="Fetching your assigned orders." /> : null}
        {!loading && filteredDeliveries.length === 0 ? <EmptyState title={search ? 'No matching deliveries' : 'No deliveries here'} body={search ? 'Try another order reference, customer, or location.' : 'Assigned orders will appear here.'} /> : null}
        {pagedDeliveries.map(delivery => (
          <RiderDeliveryCard key={delivery.id} delivery={delivery} onAction={onAction} />
        ))}
      </section>
      <div className="delivery-pagination-wrap"><PaginationControls page={page} pageSize={pageSize} total={filteredDeliveries.length} onPage={setPage} onPageSize={setPageSize} /></div>
      {rider?.must_change_password ? (
        <ForcedDeliveryPasswordModal
          accountLabel="rider"
          onChanged={() => { setRider(current => ({ ...current, must_change_password: false })); load(); }}
          onSignOut={logout}
        />
      ) : null}
      {rider && !rider.must_change_password && !rider.terms?.accepted ? (
        <DeliveryTermsModal
          role="delivery_rider"
          required
          onAccepted={terms => { setRider(current => ({ ...current, terms })); load(); }}
          onSignOut={logout}
        />
      ) : null}
    </PortalShell>
  );
};

const DeliveryPortalPage = ({ role }) => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const isLogin = path.endsWith('/login');
  if (isLogin) return <DeliveryLogin role={role} />;
  return (
    <PortalAccessGate role={role}>
      {role === 'delivery_company_user' ? <CompanyPortal /> : <RiderPortal />}
    </PortalAccessGate>
  );
};

export default DeliveryPortalPage;
