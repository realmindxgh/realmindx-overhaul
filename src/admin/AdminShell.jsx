import React from 'react';
import { Icon } from '../../realmindx-site/assets/components.jsx';
import './admin-shell.css';

export const AdminPageSelector = ({ activeWorkspace, activePage, pages, onPageChange }) => {
  const [open, setOpen] = React.useState(false);
  const selectorRef = React.useRef(null);
  const activeIndex = Math.max(0, pages.findIndex(item => item.key === activePage?.key));

  React.useEffect(() => {
    const onPointerDown = event => {
      if (!selectorRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  React.useEffect(() => {
    setOpen(false);
  }, [activeWorkspace?.key, activePage?.key]);

  const selectPage = key => {
    if (key && key !== activePage?.key) onPageChange(key);
    setOpen(false);
  };

  const moveSelection = direction => {
    const nextIndex = (activeIndex + direction + pages.length) % pages.length;
    selectPage(pages[nextIndex]?.key);
  };

  const handleKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveSelection(-1);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(current => !current);
    }
  };

  return (
    <div className={`admin-page-selector-wrap${open ? ' is-open' : ''}`} ref={selectorRef}>
      <nav className="admin-page-tabs" aria-label={`${activeWorkspace?.label || 'Admin'} pages`}>
        {pages.map(item => {
          const selected = item.key === activePage?.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`admin-page-tab${selected ? ' is-active' : ''}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => selectPage(item.key)}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        id="admin-page-selector"
        className="admin-page-selector"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="admin-page-selector-menu"
        onClick={() => setOpen(current => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="admin-page-selector-icon" aria-hidden="true">
          <Icon name={activePage?.icon || activeWorkspace?.icon || 'grid'} size={21} stroke={1.9} />
        </span>
        <span className="admin-page-selector-copy">
          <span className="admin-page-selector-context">{activeWorkspace?.label || 'Admin'}</span>
          <span className="admin-page-selector-current">{activePage?.label || 'Choose page'}</span>
        </span>
        <span className="admin-page-selector-chevron" aria-hidden="true">
          <Icon name="chevDown" size={18} stroke={2.1} />
        </span>
      </button>
      {open ? (
        <div
          id="admin-page-selector-menu"
          className="admin-page-selector-menu"
          role="listbox"
          aria-label={`Pages in ${activeWorkspace?.label || 'admin'}`}
        >
          {pages.map(item => {
            const selected = item.key === activePage?.key;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={selected}
                className={`admin-page-selector-option${selected ? ' is-selected' : ''}`}
                onClick={() => selectPage(item.key)}
              >
                <span className="admin-page-selector-option-label">{item.label}</span>
                {selected ? (
                  <span className="admin-page-selector-option-check" aria-hidden="true">
                    <Icon name="check" size={15} stroke={2.2} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const AdminWorkspaceDock = ({ workspaces, activeWorkspace, onSelect }) => (
  <nav className="admin-workspace-dock" aria-label="Admin workspaces" data-testid="admin-workspace-dock">
    {workspaces.map(workspace => {
      const selected = workspace.key === activeWorkspace?.key;
      return (
        <button
          key={workspace.key}
          type="button"
          className={`admin-workspace-dock-item${selected ? ' is-active' : ''}`}
          aria-current={selected ? 'page' : undefined}
          aria-label={`${workspace.label} workspace`}
          onClick={() => onSelect(workspace.key)}
        >
          <span className="admin-workspace-dock-icon" aria-hidden="true">
            <Icon name={workspace.icon} size={22} stroke={2} />
          </span>
          <span className="admin-workspace-dock-label">{workspace.shortLabel}</span>
        </button>
      );
    })}
  </nav>
);

const AdminShell = ({
  portalLabel,
  adminName,
  adminInitials,
  workspaces,
  activeWorkspace,
  activePage,
  onWorkspaceChange,
  onPageChange,
  demoReset,
  notice,
  children,
}) => {
  const visiblePages = activeWorkspace?.pages || [];

  return (
    <div className="admin-portal-layout admin-shell">
      <header className="admin-shell-header">
        <a className="admin-shell-brand" href="/" aria-label="View the RealMindX website">
          <img src="/favicon.png" alt="" width="48" height="48" />
          <span>
            <strong>RealMindX Education</strong>
            <small>{portalLabel} Console</small>
          </span>
        </a>
        <div className="admin-shell-header-actions">
          {demoReset ? (
            <button className="admin-shell-demo-reset" type="button" onClick={demoReset}>
              Restore demo data
            </button>
          ) : null}
          <button
            className="admin-user-chip admin-shell-account"
            type="button"
            onClick={() => onPageChange('account')}
            aria-label={`Open ${adminName || portalLabel} account settings`}
          >
            <span className="admin-chip-avatar">{adminInitials}</span>
            <span className="admin-chip-name">{adminName}</span>
          </button>
        </div>
      </header>

      <div className="admin-shell-content">
        <AdminPageSelector
          activeWorkspace={activeWorkspace}
          activePage={activePage}
          pages={visiblePages}
          onPageChange={onPageChange}
        />

        <main className="admin-main admin-shell-main" data-testid="admin-shell-main">
          {notice}
          {children}
        </main>
      </div>

      <AdminWorkspaceDock
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelect={onWorkspaceChange}
      />
    </div>
  );
};

export default AdminShell;
