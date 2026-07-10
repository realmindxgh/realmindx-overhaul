import React from 'react';

import { api, isApiMode } from '../../src/lib/apiClient.js';
import { signInWithPhone, signOut } from '../../src/lib/authClient.js';
import { clearDemoSession } from '../../src/lib/demoAccounts.js';
import { loginPathForRole } from '../../src/lib/sessionRoutes.js';

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

const DeliveryLogin = ({ role }) => {
  const isCompany = role === 'delivery_company_user';
  const [form, setForm] = React.useState({ phone: '', password: '', remember: true });
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
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
      window.location.href = isCompany ? '/delivery-company' : '/delivery';
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
          <input value={form.phone} onChange={set('phone')} placeholder="024XXXXXXX" autoComplete="tel" required />
        </Field>
        <Field label="Password">
          <input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
        </Field>
        <label className="delivery-check">
          <input type="checkbox" checked={form.remember} onChange={set('remember')} />
          <span>Keep me signed in</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
      </form>
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

const PortalAccessChecking = () => (
  <main className="delivery-portal delivery-auth-check">
    <div className="delivery-empty">
      <h2>Checking secure access</h2>
      <p>Confirming your delivery portal session.</p>
    </div>
  </main>
);

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

  if (!verified) return <PortalAccessChecking />;
  return children;
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
  const [riderId, setRiderId] = React.useState(delivery.rider_id || '');
  const [reason, setReason] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');
  const [issueReason, setIssueReason] = React.useState('customer_unavailable');
  const [issueNote, setIssueNote] = React.useState('');

  const needsReassignReason = delivery.status === 'picked_up' && riderId && Number(riderId) !== Number(delivery.rider_id);

  return (
    <article className="delivery-card">
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
    </article>
  );
};

const RiderForm = ({ onCreated }) => {
  const [form, setForm] = React.useState({ name: '', phone: '', password: '' });
  const [busy, setBusy] = React.useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.deliveryCompanyCreateRider(form);
      setForm({ name: '', phone: '', password: '' });
      onCreated();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="delivery-rider-form" onSubmit={submit}>
      <input value={form.name} onChange={set('name')} placeholder="Rider name" required />
      <input value={form.phone} onChange={set('phone')} placeholder="Phone number" required />
      <input type="password" value={form.password} onChange={set('password')} placeholder="Temporary password" required minLength={8} />
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Rider'}</button>
    </form>
  );
};

const RiderManagementRow = ({ rider, onChanged, onError }) => {
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({ name: rider.name || '', phone: rider.phone || '' });
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.deliveryCompanyUpdateRider(rider.id, form);
      setEditing(false);
      onChanged();
    } catch (err) {
      onError(err?.message || 'Could not update rider.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      await api.deliveryCompanyUpdateRider(rider.id, { is_active: !rider.is_active });
      onChanged();
    } catch (err) {
      onError(err?.message || 'Could not update rider status.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (password.length < 8) {
      onError('Temporary password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.deliveryCompanyResetRiderPassword(rider.id, password);
      setPassword('');
      onChanged();
    } catch (err) {
      onError(err?.message || 'Could not reset rider password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`delivery-rider-row${rider.is_active ? '' : ' inactive'}`}>
      {editing ? (
        <>
          <input value={form.name} onChange={set('name')} aria-label="Rider name" />
          <input value={form.phone} onChange={set('phone')} aria-label="Rider phone" />
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={save}>Save</button>
          <button className="btn btn-outline-navy btn-sm" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <div>
            <strong>{rider.name}</strong>
            <span>{rider.phone} | {rider.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <button className="btn btn-outline-navy btn-sm" type="button" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-outline-navy btn-sm" type="button" disabled={busy} onClick={toggleActive}>{rider.is_active ? 'Deactivate' : 'Activate'}</button>
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="New temporary password" />
          <button className="btn btn-outline-navy btn-sm" type="button" disabled={busy} onClick={resetPassword}>Reset Password</button>
        </>
      )}
    </div>
  );
};

const CompanyPortal = () => {
  const [profile, setProfile] = React.useState(null);
  const [deliveries, setDeliveries] = React.useState([]);
  const [riders, setRiders] = React.useState([]);
  const [scope, setScope] = React.useState('active');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!isApiMode()) return;
    try {
      const [me, deliveryData, riderData] = await Promise.all([
        api.deliveryCompanyMe(),
        api.deliveryCompanyDeliveries(scope),
        api.deliveryCompanyRiders(),
      ]);
      setProfile(me.company_user);
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
  }, [scope]);

  React.useEffect(() => { load(); }, [load]);
  useVisiblePolling(Boolean(profile), load);

  const onAction = async fn => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err?.message || 'Action failed.');
    }
  };

  const logout = async () => {
    await signOut();
    window.location.href = loginPathForRole('delivery_company_user');
  };

  return (
    <PortalShell title="Delivery Company Portal" subtitle={profile?.company_name} onLogout={logout}>
      {error ? <div className="form-error delivery-alert">{error}</div> : null}
      <section className="delivery-toolbar">
        <div className="segmented">
          <button type="button" className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>Active</button>
          <button type="button" className={scope === 'completed' ? 'active' : ''} onClick={() => setScope('completed')}>Completed</button>
        </div>
      </section>
      <section className="delivery-section">
        <div className="delivery-section-head">
          <h2>Riders</h2>
        </div>
        <RiderForm onCreated={load} />
        <div className="delivery-rider-list">
          {riders.map(rider => (
            <RiderManagementRow key={rider.id} rider={rider} onChanged={load} onError={setError} />
          ))}
        </div>
      </section>
      <section className="delivery-grid">
        {loading ? <EmptyState title="Loading deliveries" body="Fetching assigned orders." /> : null}
        {!loading && deliveries.length === 0 ? <EmptyState title="No deliveries here" body="Assigned orders will appear here." /> : null}
        {deliveries.map(delivery => (
          <CompanyDeliveryCard key={delivery.id} delivery={delivery} riders={riders} onAction={onAction} />
        ))}
      </section>
    </PortalShell>
  );
};

const RiderDeliveryCard = ({ delivery, onAction }) => {
  const [otp, setOtp] = React.useState('');
  const [issueReason, setIssueReason] = React.useState('customer_unavailable');
  const [issueNote, setIssueNote] = React.useState('');
  return (
    <article className="delivery-card">
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
            <input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Customer OTP" inputMode="numeric" />
            <button className="btn btn-primary btn-sm" type="button" onClick={() => onAction(() => api.deliveryRiderDeliver(delivery.id, otp))}>Mark Delivered</button>
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
    </article>
  );
};

const RiderPortal = () => {
  const [rider, setRider] = React.useState(null);
  const [deliveries, setDeliveries] = React.useState([]);
  const [scope, setScope] = React.useState('active');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!isApiMode()) return;
    try {
      const [me, deliveryData] = await Promise.all([
        api.deliveryRiderMe(),
        api.deliveryRiderDeliveries(scope === 'history' ? 'history' : 'active'),
      ]);
      setRider(me.rider);
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
  }, [scope]);

  React.useEffect(() => { load(); }, [load]);
  useVisiblePolling(Boolean(rider) && scope === 'active', load);

  const onAction = async fn => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err?.message || 'Action failed.');
    }
  };

  const logout = async () => {
    await signOut();
    window.location.href = loginPathForRole('delivery_rider');
  };

  return (
    <PortalShell title="Rider Portal" subtitle={rider?.name} onLogout={logout}>
      {error ? <div className="form-error delivery-alert">{error}</div> : null}
      <section className="delivery-toolbar">
        <div className="segmented">
          <button type="button" className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>Active</button>
          <button type="button" className={scope === 'history' ? 'active' : ''} onClick={() => setScope('history')}>History</button>
        </div>
      </section>
      <section className="delivery-grid">
        {loading ? <EmptyState title="Loading deliveries" body="Fetching your assigned orders." /> : null}
        {!loading && deliveries.length === 0 ? <EmptyState title="No deliveries here" body="Assigned orders will appear here." /> : null}
        {deliveries.map(delivery => (
          <RiderDeliveryCard key={delivery.id} delivery={delivery} onAction={onAction} />
        ))}
      </section>
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
