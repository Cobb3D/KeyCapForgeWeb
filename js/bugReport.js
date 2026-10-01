// "Report a Bug": builds a report (the user's description, plus the details
// needed to reproduce the problem) and sends it one of three ways: a
// pre-filled email to the maker (the main option), a pre-filled GitHub
// issue on this project's repository, or copied to the clipboard.
//
// It lives in its own module and is set up before the app's main() runs,
// so the button still works when the app fails to start: a failed start is
// exactly the kind of bug worth reporting.

// Bump this when publishing an update, so reports say which version they
// came from.
export const APP_VERSION = '2026-10-01';

// The app's name as shown to users: the page title, the top bar, exported
// files' metadata, and bug reports.
export const APP_NAME = 'KeyCapForge Beta Pre Release';

// The GitHub repository reports go to, as "owner/repo". Left empty, it's
// worked out from the page's own address on GitHub Pages
// (https://owner.github.io/repo/). Set it if the site is hosted elsewhere.
const BUG_REPORT_REPO = '';

// GitHub issue links with very long pre-filled text get rejected, so above
// this the design is left out of the link (and the full report is copied).
const MAX_URL_LENGTH = 7000;

// Where emailed reports go. Assembled at runtime rather than written out
// whole, which keeps it away from the simplest spam address scrapers.
const REPORT_EMAIL = ['Cobb3dPrinting', 'gmail.com'].join('@');

// Mail apps don't reliably accept pre-filled emails much longer than this,
// so above it the design is left out of the email (and the full report is
// copied to paste in).
const MAX_MAILTO_LENGTH = 1900;

// The last few errors the page hit, oldest first. Recorded from the moment
// this module loads.
const recentErrors = [];
function recordError(message) {
  recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${message}`);
  if (recentErrors.length > 10) recentErrors.shift();
}
window.addEventListener('error', (e) => recordError(e.message || String(e.error || 'Unknown error')));
window.addEventListener('unhandledrejection', (e) => recordError('Unhandled promise rejection: ' + ((e.reason && e.reason.message) || String(e.reason))));

function githubRepo() {
  if (BUG_REPORT_REPO) return BUG_REPORT_REPO;
  const host = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!host) return null;
  const first = location.pathname.split('/').filter(Boolean)[0];
  // A project site lives at owner.github.io/repo/; a user site (whose repo
  // is named owner.github.io) sits at the root.
  return first && !first.includes('.') ? `${host[1]}/${first}` : `${host[1]}/${host[1]}.github.io`;
}

function graphicsInfo(renderer) {
  try {
    const gl = renderer && renderer.getContext();
    if (!gl) return 'unavailable';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch (e) {
    return 'unavailable';
  }
}

// getState() returns whatever the app currently knows; any of its fields
// may be missing (for example if the app failed to start).
export function initBugReport(getState) {
  const dialog = document.getElementById('bugDialog');
  const openBtn = document.getElementById('bugReportBtn');
  if (!dialog || !openBtn) return;
  const text = document.getElementById('bugText');
  const includeDesign = document.getElementById('bugIncludeDesign');
  const preview = document.getElementById('bugPreview');
  const note = document.getElementById('bugNote');
  const githubBtn = document.getElementById('bugGithub');
  const repo = githubRepo();

  const environment = () => {
    const st = getState() || {};
    return [
      `- App: ${APP_NAME}, version ${APP_VERSION}`,
      `- Page: ${location.href}`,
      `- Browser: ${navigator.userAgent}`,
      `- Screen: ${innerWidth}x${innerHeight} at ${window.devicePixelRatio || 1}x`,
      `- Graphics: ${graphicsInfo(st.renderer)}`,
      `- Export format: ${st.exportFormat || 'unknown'}`,
      `- View: ${st.view ? Object.entries(st.view).filter(([, v]) => v).map(([k]) => k).join(', ') || 'default' : 'unknown'}`,
    ].join('\n');
  };
  const designJSON = () => {
    const st = getState() || {};
    if (!st.settings && !st.caps) return null;
    return JSON.stringify({ settings: st.settings, caps: st.caps });
  };
  // `plain` drops GitHub's formatting (bold markers, a collapsible block,
  // a code fence), which would show up as stray symbols in an email.
  const buildReport = ({ withDesign = includeDesign.checked, plain = false } = {}) => {
    const description = text.value.trim() || '(no description given)';
    const errors = recentErrors.length ? recentErrors.map((e) => `- ${e}`).join('\n') : '- none';
    const design = withDesign ? designJSON() : null;
    const heading = (t) => (plain ? t.toUpperCase() : `**${t}**`);
    const designBlock = !design ? [] : plain
      ? ['', heading('Design'), '(Settings changed from the defaults, and how each cap differs from a standard cap.)', design]
      : ['', '<details><summary>Design</summary>', '', 'Settings changed from the defaults, and how each cap differs from a standard cap.', '', '```json', design, '```', '</details>'];
    return [
      heading('What happened'), description, '',
      heading('Environment'), environment(), '',
      heading('Recent errors'), errors,
      ...designBlock,
    ].join('\n');
  };
  const refreshPreview = () => { preview.textContent = buildReport({ plain: true }); };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      // Fallback for browsers or pages where the clipboard API is blocked.
      const ta = document.createElement('textarea');
      ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  openBtn.addEventListener('click', () => {
    note.textContent = `Email Report opens your email app with the report filled in, addressed to ${REPORT_EMAIL}. If nothing opens, use Copy Report and email it to that address.`;
    githubBtn.hidden = !repo;
    refreshPreview();
    dialog.showModal();
    text.focus();
  });
  text.addEventListener('input', refreshPreview);
  includeDesign.addEventListener('change', refreshPreview);
  document.getElementById('bugCancel').addEventListener('click', () => dialog.close());

  document.getElementById('bugCopy').addEventListener('click', async () => {
    const ok = await copyText(buildReport({ plain: true }));
    note.textContent = ok ? `Report copied. Paste it into an email to ${REPORT_EMAIL}.` : `Couldn't copy automatically. Open "What gets sent", copy the text, and email it to ${REPORT_EMAIL}.`;
  });

  document.getElementById('bugEmail').addEventListener('click', async () => {
    const description = text.value.trim();
    const subject = `${APP_NAME} bug: ` + (description ? description.split('\n')[0].slice(0, 70) : 'report');
    // Mail links want CRLF line breaks.
    const makeUrl = (body) => `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
    let url = makeUrl(buildReport({ plain: true }));
    let copied = false;
    if (url.length > MAX_MAILTO_LENGTH) {
      // Too long for a mail link: leave the design out of the email, and
      // copy the full report so it can be pasted in.
      copied = await copyText(buildReport({ plain: true }));
      url = makeUrl(buildReport({ plain: true, withDesign: false }) +
        (copied ? '\n\n(The full report with the design was copied to the clipboard. Please paste it here.)' : ''));
    }
    // A plain link click, rather than window.open(), so no blank tab is left
    // behind while the mail app opens.
    const a = document.createElement('a');
    a.href = url;
    a.click();
    note.textContent = copied
      ? `Your email app should open. The design didn't fit in the email, so the full report was copied: paste it into the message before sending.`
      : `Your email app should open with the report. If it doesn't, use Copy Report and email it to ${REPORT_EMAIL}.`;
  });

  githubBtn.addEventListener('click', async () => {
    const description = text.value.trim();
    const title = 'Bug: ' + (description ? description.split('\n')[0].slice(0, 70) : 'describe the problem');
    const makeUrl = (body) => `https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    let url = makeUrl(buildReport());
    if (url.length > MAX_URL_LENGTH) {
      // Too long for a link: leave the design out of the link, and copy the
      // full report so it can be pasted into the issue.
      await copyText(buildReport());
      url = makeUrl(buildReport({ withDesign: false }) + '\n\n_(The design was too long to include in the link. It was copied to the clipboard; please paste it here.)_');
    }
    window.open(url, '_blank', 'noopener');
    dialog.close();
  });
}
