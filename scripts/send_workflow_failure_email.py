"""Send a concise GitHub Actions failure alert through the existing Resend account."""

from __future__ import annotations

import argparse
from html import escape
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_RECIPIENT = "info@realmindxgh.com"
DEFAULT_SENDER = "RealMindX Monitoring <notifications@send.realmindxgh.com>"
MAX_REPORT_CHARS = 12_000


def _read_report(path_value):
    if not path_value:
        return "No machine-readable report was produced. Open the workflow run for the failing step and logs."
    path = Path(path_value)
    if not path.is_file():
        return "No machine-readable report was produced. Open the workflow run for the failing step and logs."
    content = path.read_text(encoding="utf-8", errors="replace").strip()
    if not content:
        return "The report file was empty. Open the workflow run for the failing step and logs."
    if len(content) > MAX_REPORT_CHARS:
        return content[:MAX_REPORT_CHARS] + "\n\n[Report truncated in email]"
    return content


def send_failure_email(*, workflow, run_url, report_path=None):
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    recipient = os.getenv("SEO_ALERT_TO", DEFAULT_RECIPIENT).strip() or DEFAULT_RECIPIENT
    sender = os.getenv("SEO_ALERT_FROM", DEFAULT_SENDER).strip() or DEFAULT_SENDER
    if not api_key:
        print("::warning::SEO failure email skipped because the RESEND_API_KEY GitHub secret is not configured.")
        return False

    report = _read_report(report_path)
    subject = f"[Action required] RealMindX {workflow} failed"
    safe_workflow = escape(workflow)
    safe_url = escape(run_url, quote=True)
    safe_report = escape(report)
    payload = {
        "from": sender,
        "to": [recipient],
        "subject": subject,
        "text": (
            f"The RealMindX {workflow} workflow failed.\n\n"
            f"Open the workflow run: {run_url}\n\n"
            f"Report:\n{report}\n"
        ),
        "html": (
            '<div style="font-family:Arial,sans-serif;color:#17243a;line-height:1.5">'
            '<h2 style="color:#b42318">RealMindX monitoring detected an error</h2>'
            f"<p>The <strong>{safe_workflow}</strong> workflow failed and requires review.</p>"
            f'<p><a href="{safe_url}">Open the GitHub Actions run</a></p>'
            '<h3>Available report</h3>'
            f'<pre style="white-space:pre-wrap;background:#f5f7fa;padding:16px;border-radius:8px">{safe_report}</pre>'
            "</div>"
        ),
    }
    request = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status not in {200, 201, 202}:
                raise RuntimeError(f"Resend returned unexpected status {response.status}.")
    except HTTPError as error:
        raise RuntimeError(f"Resend rejected the failure email with HTTP {error.code}.") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("Could not reach Resend to send the failure email.") from error
    print(f"Failure email accepted for {recipient}.")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--report")
    args = parser.parse_args()
    send_failure_email(workflow=args.workflow, run_url=args.run_url, report_path=args.report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
