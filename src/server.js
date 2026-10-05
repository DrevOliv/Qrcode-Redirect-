import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import * as qr from './qr.js';
import * as views from './views.js';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD environment variable is required');
  process.exit(1);
}
// Derived from the password unless set, so changing the password logs everyone out.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(`session:${ADMIN_PASSWORD}`).digest('hex');
const SESSION_DAYS = 30;
const COOKIE = 'qr_session';
const SECURE_COOKIE = BASE_URL.startsWith('https://');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use('/static', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public'), { maxAge: '1h' }));

// ---------- auth ----------

const sign = (value) => crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function isLoggedIn(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function setSession(res) {
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  res.cookie(COOKIE, `${expires}.${sign(String(expires))}`, {
    httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIE, maxAge: SESSION_DAYS * 86400_000, path: '/',
  });
}

const passwordMatches = (input) => {
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
};

// Simple in-memory brute-force protection: 10 failed attempts per IP per 15 minutes.
const failedLogins = new Map();
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;
function tooManyAttempts(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || entry.reset < Date.now()) return false;
  return entry.count >= 10;
}
function recordFailure(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || entry.reset < Date.now()) failedLogins.set(ip, { count: 1, reset: Date.now() + 15 * 60_000 });
  else entry.count++;
}

const requireAdmin = (req, res, next) => (isLoggedIn(req) ? next() : res.redirect('/admin/login'));

// ---------- helpers ----------

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i lookalikes
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function randomId(len = 6) {
  for (;;) {
    const id = Array.from(crypto.randomBytes(len), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
    if (!db.getProject(id)) return id;
  }
}

function normalizeUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try { url = new URL(withScheme); } catch { throw new Error('That target link is not a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Target link must start with http:// or https://');
  return url.href;
}

const qrUrlFor = (id) => `${BASE_URL}/r/${encodeURIComponent(id)}`;

const noStore = (res) => res.set('Cache-Control', 'no-store');

// ---------- public ----------

app.get('/', (req, res) => res.redirect('/admin'));

app.get('/r/:id', (req, res) => {
  noStore(res);
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).send(views.notFoundPage());
  if (req.method === 'GET') db.recordScan(project.id);
  if (!project.target_url) return res.send(views.noLinkPage(project));
  res.redirect(302, project.target_url);
});

app.get('/healthz', (req, res) => res.send('ok'));

// ---------- admin ----------

app.use('/admin', (req, res, next) => { noStore(res); next(); });

app.get('/admin/login', (req, res) => (isLoggedIn(req) ? res.redirect('/admin') : res.send(views.loginPage())));

app.post('/admin/login', (req, res) => {
  const ip = clientIp(req);
  if (tooManyAttempts(ip)) return res.status(429).send(views.loginPage('Too many attempts. Try again in 15 minutes.'));
  if (!passwordMatches(req.body.password)) {
    recordFailure(ip);
    return res.status(401).send(views.loginPage('Wrong password.'));
  }
  failedLogins.delete(ip);
  setSession(res);
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  res.send(views.listPage({ projects: db.listProjects(), baseUrl: BASE_URL, msg: req.query.msg }));
});

app.post('/admin/projects', requireAdmin, (req, res) => {
  const renderError = (error) =>
    res.status(400).send(views.listPage({ projects: db.listProjects(), baseUrl: BASE_URL, error }));

  const name = String(req.body.name ?? '').trim().slice(0, 200);
  const customId = String(req.body.id ?? '').trim();
  if (!name) return renderError('Name is required.');
  if (customId && !ID_PATTERN.test(customId)) return renderError('ID may only contain letters, numbers, "-" and "_" (max 64 characters).');
  if (customId && db.getProject(customId)) return renderError(`A project with ID "${customId}" already exists.`);

  let target;
  try { target = normalizeUrl(req.body.target_url); } catch (e) { return renderError(e.message); }

  const id = customId || randomId();
  db.createProject(id, name, target);
  res.redirect(`/admin/projects/${encodeURIComponent(id)}?msg=created`);
});

function loadProject(req, res, next) {
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).send(views.notFoundPage());
  req.project = project;
  next();
}

async function renderProject(res, project, { msg, error } = {}) {
  const qrUrl = qrUrlFor(project.id);
  res.status(error ? 400 : 200).send(views.projectPage({
    project, qrUrl, svg: await qr.toSvg(qrUrl), stats: db.getStats(project.id), msg, error,
  }));
}

app.get('/admin/projects/:id', requireAdmin, loadProject, (req, res) => renderProject(res, req.project, { msg: req.query.msg }));

app.post('/admin/projects/:id', requireAdmin, loadProject, (req, res) => {
  const name = String(req.body.name ?? '').trim().slice(0, 200);
  if (!name) return renderProject(res, req.project, { error: 'Name is required.' });
  let target;
  try { target = normalizeUrl(req.body.target_url); } catch (e) {
    return renderProject(res, { ...req.project, name, target_url: req.body.target_url }, { error: e.message });
  }
  db.updateProject(req.project.id, name, target);
  res.redirect(`/admin/projects/${encodeURIComponent(req.project.id)}?msg=saved`);
});

app.post('/admin/projects/:id/delete', requireAdmin, loadProject, (req, res) => {
  db.deleteProject(req.project.id);
  res.redirect('/admin?msg=deleted');
});

const download = (ext, type, render) =>
  app.get(`/admin/projects/:id/qr.${ext}`, requireAdmin, loadProject, async (req, res) => {
    const filename = `qr-${req.project.id}.${ext}`;
    res.type(type).attachment(filename).send(await render(qrUrlFor(req.project.id)));
  });

download('png', 'image/png', qr.toPng);
download('jpg', 'image/jpeg', qr.toJpeg);
download('svg', 'image/svg+xml', qr.toSvg);

app.use((req, res) => res.status(404).send(views.notFoundPage()));

app.listen(PORT, () => {
  console.log(`QR redirect service listening on :${PORT}`);
  console.log(`QR codes will point to ${BASE_URL}/r/<id>`);
});
