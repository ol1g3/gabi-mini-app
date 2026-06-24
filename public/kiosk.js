// Small kiosk survey: render questions, collect one answer each, submit.
const state = { survey: null, answers: {} };

const el = (id) => document.getElementById(id);

// A simple bottle illustration; `scale` makes the 250ml visibly bigger.
function bottleSVG(scale) {
  const h = Math.round(58 * scale);
  const w = Math.round(34 * scale);
  return `
  <svg class="bottle" width="${w}" height="${h}" viewBox="0 0 34 58" fill="none" aria-hidden="true">
    <rect x="13" y="2" width="8" height="6" rx="1.5" fill="currentColor"/>
    <path d="M11 8 h12 c1 4 5 5 5 10 v32 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4 v-32 c0 -5 4 -6 5 -10 z"
      fill="currentColor" opacity="0.14"/>
    <path d="M11 8 h12 c1 4 5 5 5 10 v32 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4 v-32 c0 -5 4 -6 5 -10 z"
      fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="9" y="30" width="16" height="13" rx="2" fill="#ffffff" stroke="currentColor" stroke-width="1.4"/>
  </svg>`;
}

function renderQuestion(q) {
  const isSize = q.type === 'size';
  const opts = q.options
    .map((o) => {
      const art = isSize
        ? bottleSVG(o.value === '250ml' ? 1.25 : 0.85)
        : '';
      return `
      <button class="option" type="button"
        data-q="${q.id}" data-value="${o.value}" aria-pressed="false">
        ${art}
        <span class="opt-label">${o.label}</span>
      </button>`;
    })
    .join('');
  return `
    <div class="question">
      <h2>${q.label}</h2>
      <div class="options ${q.type}">${opts}</div>
    </div>`;
}

function render() {
  el('title').textContent = state.survey.title;
  el('subtitle').textContent = state.survey.subtitle;
  el('questions').innerHTML = state.survey.questions.map(renderQuestion).join('');

  el('questions')
    .querySelectorAll('.option')
    .forEach((btn) =>
      btn.addEventListener('click', () => {
        const { q, value } = btn.dataset;
        state.answers[q] = value;
        // toggle pressed state within the same question group
        btn.parentElement
          .querySelectorAll('.option')
          .forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        refreshSubmit();
      })
    );
}

function refreshSubmit() {
  const complete = state.survey.questions.every((q) => state.answers[q.id]);
  el('submit').disabled = !complete;
}

async function submit() {
  el('submit').disabled = true;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers }),
    });
    if (!res.ok) throw new Error('Request failed');
    showThanks();
  } catch (err) {
    alert('Could not save your answer. Please try again.');
    el('submit').disabled = false;
  }
}

let countdownTimer = null;
function showThanks() {
  el('survey').classList.add('hidden');
  el('thanks').classList.remove('hidden');
  let n = 4;
  el('countdown').textContent = n;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n -= 1;
    el('countdown').textContent = n;
    if (n <= 0) reset();
  }, 1000);
}

function reset() {
  clearInterval(countdownTimer);
  state.answers = {};
  el('thanks').classList.add('hidden');
  el('survey').classList.remove('hidden');
  render();
  refreshSubmit();
  window.scrollTo(0, 0);
}

async function init() {
  state.survey = await fetch('/api/survey').then((r) => r.json());
  render();
  el('submit').addEventListener('click', submit);
  el('next').addEventListener('click', reset);
}

init();
