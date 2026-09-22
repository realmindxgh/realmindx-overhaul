import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_PAGES,
  ADMIN_WORKSPACES,
  adminPathFor,
  defaultPageForWorkspace,
  resolveAdminRoute,
  visibleAdminWorkspaces,
  workspaceForPage,
} from '../src/admin/adminNavigation.js';

test('admin information architecture contains six workspaces and all 37 destinations', () => {
  assert.equal(ADMIN_WORKSPACES.length, 6);
  assert.equal(ADMIN_PAGES.length, 37);
  assert.equal(new Set(ADMIN_PAGES.map(item => item.key)).size, ADMIN_PAGES.length);
  assert.equal(new Set(ADMIN_PAGES.map(item => item.slug)).size, ADMIN_PAGES.length);
});

test('reclassified pages resolve to the intended workspaces', () => {
  assert.equal(workspaceForPage('alerts').key, 'recruitment');
  assert.equal(workspaceForPage('teachers').key, 'recruitment');
  assert.equal(workspaceForPage('settings').key, 'content');
  assert.equal(workspaceForPage('newsletters').key, 'comms');
});

test('canonical admin and staff paths include workspace and page slugs', () => {
  assert.equal(adminPathFor('admin', 'products'), '/admin/bookshop/products');
  assert.equal(adminPathFor('staff', 'applications'), '/staff/recruitment/applications');
  assert.equal(adminPathFor('admin', 'account'), '/admin/system/my-account');
});

test('canonical and legacy routes resolve without redirects', () => {
  const canonical = resolveAdminRoute('/admin/bookshop/products', 'admin');
  assert.equal(canonical.page.key, 'products');
  assert.equal(canonical.workspace.key, 'bookshop');
  assert.equal(canonical.needsRedirect, false);

  const legacyDashboard = resolveAdminRoute('/admin/dashboard', 'admin');
  assert.equal(legacyDashboard.page.key, 'dashboard');
  assert.equal(legacyDashboard.needsRedirect, false);

  const legacyPage = resolveAdminRoute('/staff/products', 'staff');
  assert.equal(legacyPage.page.key, 'products');
  assert.equal(legacyPage.needsRedirect, false);
});

test('unknown and mismatched workspace routes fall back safely', () => {
  const unknown = resolveAdminRoute('/admin/nope/nothing', 'admin');
  assert.equal(unknown.page.key, 'dashboard');
  assert.equal(unknown.needsRedirect, true);
  assert.equal(unknown.canonicalPath, '/admin/overview/dashboard');

  const mismatch = resolveAdminRoute('/admin/content/products', 'admin');
  assert.equal(mismatch.page.key, 'dashboard');
  assert.equal(mismatch.needsRedirect, true);
});

test('permission filtering hides inaccessible pages and selects the first permitted fallback', () => {
  const permitted = new Set(['dashboard', 'products', 'account']);
  const canAccess = item => permitted.has(item.key);
  const visible = visibleAdminWorkspaces(canAccess);

  assert.deepEqual(visible.map(workspace => workspace.key), ['overview', 'bookshop', 'system']);
  assert.equal(defaultPageForWorkspace('bookshop', canAccess).key, 'products');
  assert.equal(defaultPageForWorkspace('system', canAccess).key, 'account');

  const unauthorized = resolveAdminRoute('/staff/system/admin-accounts', 'staff', canAccess);
  assert.equal(unauthorized.page.key, 'dashboard');
  assert.equal(unauthorized.needsRedirect, true);
  assert.equal(unauthorized.canonicalPath, '/staff/overview/dashboard');
});

