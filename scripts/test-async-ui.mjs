import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const [{ text: bundledModule }] = (await build({
  entryPoints: ['src/lib/AsyncUI.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['react'],
  write: false,
  logLevel: 'silent',
})).outputFiles;

const temporaryDirectory = await mkdtemp(path.join(process.cwd(), '.async-ui-test-'));
const temporaryModule = path.join(temporaryDirectory, 'AsyncUI.mjs');
let asyncUi;

try {
  await writeFile(temporaryModule, bundledModule, 'utf8');
  asyncUi = await import(pathToFileURL(temporaryModule).href);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

const render = (Component, props = {}, children) => renderToStaticMarkup(
  React.createElement(Component, props, children),
);

test('spinner accessibility follows whether adjacent text names the state', () => {
  const decorative = render(asyncUi.Spinner);
  assert.match(decorative, /aria-hidden="true"/);
  assert.doesNotMatch(decorative, /role="status"/);

  const labelled = render(asyncUi.Spinner, { label: 'Loading orders' });
  assert.match(labelled, /role="status"/);
  assert.match(labelled, /aria-label="Loading orders"/);
});

test('loading notice exposes a concise named busy state without placeholder content', () => {
  const markup = render(asyncUi.LoadingNotice, {
    label: 'Loading invoices',
  });
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-label="Loading invoices"/);
  assert.doesNotMatch(markup, /skeleton/);
});

test('error state stops loading and offers a real retry action', () => {
  const markup = render(asyncUi.ErrorState, {
    message: 'Could not load contacts.',
    onRetry: () => {},
  });
  assert.match(markup, /role="alert"/);
  assert.match(markup, />Try again</);
  assert.doesNotMatch(markup, /aria-busy="true"/);
});

test('progress is determinate only when a real percentage is supplied', () => {
  const measured = render(asyncUi.ProgressStatus, {
    label: 'Uploading catalogue',
    stage: 'Uploading catalogue',
    percent: 62,
  });
  assert.match(measured, /<progress max="100" value="62"/);
  assert.match(measured, /62% complete/);

  const processing = render(asyncUi.ProgressStatus, {
    label: 'Importing catalogue',
    stage: 'Processing catalogue rows',
  });
  assert.doesNotMatch(processing, /<progress/);
  assert.match(processing, /rmx-indeterminate-track/);
  assert.match(processing, /Processing catalogue rows/);
});

test('pending button content uses a meaningful present-tense label', () => {
  const markup = render(asyncUi.AsyncButtonContent, {
    pending: true,
    pendingLabel: 'Saving teacher profile',
  }, 'Save');
  assert.match(markup, /Saving teacher profile/);
  assert.match(markup, /rmx-button-label-sizer/);
});
