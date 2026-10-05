export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MESSAGES = {
  created: 'Project created.',
  saved: 'Changes saved.',
  deleted: 'Project deleted.',
};

function layout(title, body, { admin = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  ${admin ? `<header class="topbar">
    <a class="brand" href="/admin">QR Redirects</a>
    <form method="post" action="/admin/logout"><button class="btn ghost small">Log out</button></form>
  </header>` : ''}
  <main class="${admin ? 'container' : 'center'}">${body}</main>
  ${admin ? '<script src="/static/app.js"></script>' : ''}
</body>
</html>`;
}

const flash = (msg, error) =>
  (error ? `<div class="alert error">${esc(error)}</div>` : '') +
  (MESSAGES[msg] ? `<div class="alert ok">${esc(MESSAGES[msg])}</div>` : '');

export const loginPage = (error) =>
  layout('Log in', `
    <div class="card narrow">
      <h1>QR Redirects</h1>
      <p class="muted">Admin login</p>
      ${flash(null, error)}
      <form method="post" action="/admin/login" class="stack">
        <label>Password <input type="password" name="password" autofocus required></label>
        <button class="btn primary">Log in</button>
      </form>
    </div>`);

export const listPage = ({ projects, baseUrl, msg, error }) =>
  layout('Projects', `
    ${flash(msg, error)}
    <section class="card">
      <h2>New QR code</h2>
      <form method="post" action="/admin/projects" class="grid-form">
        <label>Name <input name="name" placeholder="Summer festival poster" required maxlength="200"></label>
        <label>Target link <span class="muted">(optional, can be added later)</span>
          <input name="target_url" placeholder="https://…" maxlength="2000"></label>
        <details>
          <summary>Restore an old QR code (custom ID)</summary>
          <label>ID <span class="muted">— leave empty to generate a random one</span>
            <input name="id" placeholder="e.g. k7m3xq" pattern="[A-Za-z0-9_-]{1,64}" maxlength="64"></label>
          <p class="muted small">The QR code will point to <code>${esc(baseUrl)}/r/&lt;ID&gt;</code>, so entering the ID of a previously printed code makes it work again.</p>
        </details>
        <button class="btn primary">Create</button>
      </form>
    </section>

    <section class="card">
      <h2>Projects <span class="muted">(${projects.length})</span></h2>
      ${projects.length === 0 ? '<p class="muted">No projects yet. Create your first QR code above.</p>' : `
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>ID</th><th>Target</th><th class="num">Scans</th></tr></thead>
        <tbody>
          ${projects.map((p) => `
          <tr>
            <td><a href="/admin/projects/${encodeURIComponent(p.id)}">${esc(p.name)}</a></td>
            <td><code>${esc(p.id)}</code></td>
            <td class="truncate">${p.target_url ? `<span title="${esc(p.target_url)}">${esc(p.target_url)}</span>` : '<span class="badge">No link</span>'}</td>
            <td class="num">${p.total_scans}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`}
    </section>`, { admin: true });

function chart(daily) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const w = 600, h = 140, gap = 2;
  const bw = w / daily.length - gap;
  const bars = daily.map((d, i) => {
    const bh = d.count ? Math.max(2, (d.count / max) * (h - 20)) : 0;
    return `<rect x="${i * (bw + gap)}" y="${h - bh}" width="${bw}" height="${bh}" rx="2"><title>${d.day}: ${d.count} scan${d.count === 1 ? '' : 's'}</title></rect>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily scans, last ${daily.length} days">${bars}</svg>
    <div class="chart-axis muted small"><span>${daily[0].day}</span><span>${daily.at(-1).day}</span></div>`;
}

export const projectPage = ({ project: p, qrUrl, svg, stats, msg, error }) => {
  const id = encodeURIComponent(p.id);
  return layout(p.name, `
    <p><a href="/admin" class="muted">← All projects</a></p>
    ${flash(msg, error)}
    <div class="project-grid">
      <section class="card qr-card">
        <div class="qr">${svg}</div>
        <div class="copy-row">
          <input readonly value="${esc(qrUrl)}" id="qr-url">
          <button type="button" class="btn small" data-copy="#qr-url">Copy link</button>
        </div>
        <div class="downloads">
          <a class="btn small" href="/admin/projects/${id}/qr.png" download>PNG</a>
          <a class="btn small" href="/admin/projects/${id}/qr.jpg" download>JPEG</a>
          <a class="btn small" href="/admin/projects/${id}/qr.svg" download>SVG</a>
        </div>
      </section>

      <section class="card">
        <h2>${esc(p.name)}</h2>
        <p class="muted small">ID <code>${esc(p.id)}</code> · created ${esc(p.created_at)} UTC</p>
        <form method="post" action="/admin/projects/${id}" class="stack">
          <label>Name <input name="name" value="${esc(p.name)}" required maxlength="200"></label>
          <label>Target link
            <div class="copy-row">
              <input name="target_url" id="target-url" value="${esc(p.target_url)}" placeholder="Leave empty to show a “no link yet” page" maxlength="2000">
              <button type="button" class="btn small" id="test-link">Test link</button>
            </div>
          </label>
          <div class="row">
            <button class="btn primary">Save</button>
          </div>
        </form>
      </section>
    </div>

    <section class="card">
      <h2>Scans</h2>
      <div class="stats">
        <div><span class="stat">${stats.total}</span><span class="muted">total</span></div>
        <div><span class="stat">${stats.today}</span><span class="muted">today</span></div>
      </div>
      <p class="muted small">Daily scans, last 30 days (UTC)</p>
      ${chart(stats.daily)}
    </section>

    <section class="card danger-zone">
      <h2>Delete project</h2>
      <p class="muted">Printed QR codes will show “not found” until you recreate a project with ID <code>${esc(p.id)}</code>. Scan history is deleted.</p>
      <form method="post" action="/admin/projects/${id}/delete" data-confirm="Delete “${esc(p.name)}”? This cannot be undone.">
        <button class="btn danger">Delete</button>
      </form>
    </section>`, { admin: true });
};

export const noLinkPage = (p) =>
  layout('Coming soon', `
    <div class="card narrow public">
      <div class="emoji" aria-hidden="true">⏳</div>
      <h1>Nothing here yet</h1>
      <p>The link for <strong>${esc(p.name)}</strong> hasn’t been set up yet.</p>
      <p class="muted">Check back a bit later — this QR code will take you to the right place once it’s ready.</p>
    </div>`);

export const notFoundPage = () =>
  layout('Not found', `
    <div class="card narrow public">
      <div class="emoji" aria-hidden="true">🔍</div>
      <h1>QR code not found</h1>
      <p class="muted">This code doesn’t point anywhere right now. It may have expired or been removed.</p>
    </div>`);
