# Async UI guidelines

The longer uncertainty lasts, the more information the interface owes the user. Every request should distinguish initial loading, usable-data refresh, mutation, success, empty results, and failure.

## Shared primitives

Use the components in `src/lib/AsyncUI.jsx` instead of adding another loader:

- `AsyncButtonContent` for button-triggered work. Disable the initiating control, use a present-tense label such as `Saving profile`, and keep unrelated controls available.
- `LoadingNotice` for an initial load that needs acknowledgement. Keep it compact and specific, such as `Loading teacher accounts`.
- `RefreshingIndicator` when valid content is already visible. Keep that content on screen while the replacement request runs.
- `ProgressStatus` for uploads and long work. Use a percentage only when it comes from measurable progress; otherwise show an indeterminate stage such as `Upload finished. Processing file`.
- `ErrorState` for failed data loads, with `onRetry` when repeating the request is safe.
- `InlineStatus` for proportional success, validation, and local failure feedback.
- `AsyncState` when a component needs a standard loading/error/empty/preserve-data state boundary.

`useDelayedPending` keeps short requests from flashing an animation. It delays only the indicator, never the operation.

## Interaction rules

- Put feedback beside the action that caused the wait. Do not replace a page because one row or button is updating.
- Prevent duplicate submissions and reset pending flags in `finally` blocks.
- Keep modal context and entered values after a failure. Destructive dialogs close only after success.
- Debounce request-backed search and use `AbortController` or a request identity so stale responses cannot replace newer results.
- Initial loads use a concise loading notice. Refreshes keep old data visible. Empty states appear only after a successful response.
- Polling must not overlap an in-flight poll. Stop or ignore polling after unmount.
- Communicate completion when silence would be ambiguous, using the existing toast or a short inline status.
- Never invent precise progress. Browser upload progress may end at 100% while the server is still processing; switch to an indeterminate processing stage at that point.
- Expose cancellation only when the underlying operation can actually be cancelled.

## Accessibility and layout

- Use `aria-busy` on the affected region, `role="status"` for polite state changes, and `role="alert"` for failures.
- Do not put per-second countdowns or rapidly changing progress in an `aria-live` region.
- Give visual-only spinners an accessible label or hide them when adjacent text already names the state.
- Preserve button width and content height while state labels change.
- Loading feedback must remain understandable without animation or colour. Shared animation styles respect `prefers-reduced-motion`.

## Inspecting slow states locally

Set `VITE_DEV_API_DELAY_MS` to a value such as `1200` before starting Vite to add development-only API latency. The delay is clamped to 15 seconds, respects request cancellation, and is removed from production builds. Browser network throttling remains useful for inspecting upload progress.

Before merging, exercise fast success, slow success, failure and retry, duplicate clicks, empty results, background refresh, and narrow-screen layouts. Run `npm run build` and `npm run test:async-ui`.
