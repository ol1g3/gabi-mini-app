import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'insecure-default-secret-change-me';
const COOKIE_NAME = 'gabi_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// The survey definition. Change these to re-use the kiosk for other studies.
export const SURVEY = {
  title: 'Quick taste & price check',
  subtitle: 'Tap your choice, then tap Submit.',
  questions: [
    {
      id: 'size',
      label: 'Which size would you buy?',
      type: 'size',
      options: [
        { value: '100ml', label: '100 ml' },
        { value: '250ml', label: '250 ml' },
      ],
    },
    {
      id: 'price',
      label: 'What feels like the right price?',
      type: 'price',
      options: [
        { value: '2.49', label: '€2,49' },
        { value: '2.99', label: '€2,99' },
        { value: '3.49', label: '€3,49' },
      ],
    },
  ],
};

// ─── Data store (append-only JSONL, committable) ─────────────────────
// One response per line. Appending never rewrites earlier lines, so each
// new response is a single added line in git — easy to review and commit.
const DATA_FILE = path.join(__dirname, 'responses.jsonl');
const TEXT_FILE = path.join(__dirname, 'responses.txt');

function loadResponses() {
  try {
    return fs
      .readFileSync(DATA_FILE, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function appendResponse(response) {
  // Machine-readable (one JSON object per line)
  fs.appendFileSync(DATA_FILE, JSON.stringify(response) + '\n');
  // Human-readable plain-text log
  const when = new Date(response.createdAt).toLocaleString();
  const parts = SURVEY.questions.map(
    (q) => `${q.label} ${labelFor(q, response.answers[q.id])}`
  );
  fs.appendFileSync(TEXT_FILE, `[${when}]  ${parts.join('  |  ')}\n`);
}

let responses = loadResponses();

// ─── Email (optional, wired but disabled until configured) ───────────
const emailConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.EMAIL_TO
);

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendResponseEmail(response) {
  if (!transporter) return;
  const lines = SURVEY.questions
    .map((q) => `${q.label}\n  → ${labelFor(q, response.answers[q.id])}`)
    .join('\n\n');
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: process.env.EMAIL_TO,
      subject: `New survey response · ${SURVEY.title}`,
      text: `A new response was submitted at ${new Date(
        response.createdAt
      ).toLocaleString()}.\n\n${lines}\n\nResponse ID: ${response.id}`,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

function labelFor(question, value) {
  const opt = question.options.find((o) => o.value === value);
  return opt ? opt.label : value;
}

// ─── Auth (signed cookie, no extra deps) ─────────────────────────────
function sign(value) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(value)
    .digest('hex');
}

function makeToken() {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

function tokenValid(token) {
  if (!token || !token.includes('.')) return false;
  const [exp, mac] = token.split('.');
  if (sign(exp) !== mac) return false;
  return Number(exp) > Date.now();
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
  );
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (tokenValid(cookies[COOKIE_NAME])) return next();
  res.redirect('/login');
}

// ─── App ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public config for the kiosk front-end
app.get('/api/survey', (_req, res) => res.json(SURVEY));

// Submit a response (public — this is the kiosk endpoint)
app.post('/api/submit', async (req, res) => {
  const answers = req.body?.answers || {};
  // Validate that every question was answered with a known option
  for (const q of SURVEY.questions) {
    const v = answers[q.id];
    if (!q.options.some((o) => o.value === v)) {
      return res
        .status(400)
        .json({ ok: false, error: `Missing or invalid answer for "${q.id}".` });
    }
  }
  const response = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    answers: Object.fromEntries(
      SURVEY.questions.map((q) => [q.id, answers[q.id]])
    ),
  };
  responses.push(response);
  appendResponse(response);
  sendResponseEmail(response); // fire-and-forget
  res.json({ ok: true });
});

// Login
app.post('/login', (req, res) => {
  if ((req.body?.password || '') === DASHBOARD_PASSWORD) {
    const cookie = [
      `${COOKIE_NAME}=${makeToken()}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${SESSION_TTL_MS / 1000}`,
    ].join('; ');
    res.setHeader('Set-Cookie', cookie);
    return res.redirect('/dashboard');
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
  res.redirect('/login');
});

// Dashboard data (auth required)
app.get('/api/responses', requireAuth, (_req, res) => {
  res.json({ survey: SURVEY, responses });
});

// CSV export (auth required)
app.get('/api/export.csv', requireAuth, (_req, res) => {
  const cols = ['id', 'createdAt', ...SURVEY.questions.map((q) => q.id)];
  const escape = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = responses.map((r) =>
    [r.id, r.createdAt, ...SURVEY.questions.map((q) => r.answers[q.id])]
      .map(escape)
      .join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="survey-responses.csv"'
  );
  res.send([cols.map(escape).join(','), ...rows].join('\n'));
});

// Pages
const send = (file) => (_req, res) =>
  res.sendFile(path.join(__dirname, 'views', file));

app.get('/login', send('login.html'));
app.get('/dashboard', requireAuth, send('dashboard.html'));

// Static kiosk + assets
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n  Kiosk survey running`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Survey (open on the iPad):  http://localhost:${PORT}/`);
  console.log(`  Dashboard:                  http://localhost:${PORT}/dashboard`);
  console.log(
    `  Email:                      ${
      emailConfigured ? 'ENABLED' : 'disabled (add SMTP_* in .env to enable)'
    }`
  );
  if (DASHBOARD_PASSWORD === 'changeme') {
    console.log(
      `\n  ⚠  Using the default dashboard password. Set DASHBOARD_PASSWORD in .env.`
    );
  }
  console.log('');
});
