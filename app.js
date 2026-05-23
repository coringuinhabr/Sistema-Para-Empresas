/* ══════════════════════════════════════════════════════
   Financeiro Pessoal — app.js
   Lógica principal: login, transações, metas, dashboard
══════════════════════════════════════════════════════ */

let currentUser = null;
let txFilter    = 'all';
let txType      = 'income';
let fundingGoalId = null;

/* ── Competência mensal ── */
let compYear  = new Date().getFullYear();
let compMonth = new Date().getMonth(); // 0-based

/* ── Inicialização ── */
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const txDateEl = document.getElementById('tx-date');
  if (txDateEl) txDateEl.value = today;

  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  document.getElementById('fund-modal').addEventListener('click', function (e) {
    if (e.target === this) closeFundModal();
  });

  // Lembrar sessão
  const remembered = localStorage.getItem('fp_remembered');
  if (remembered) {
    const { user } = JSON.parse(remembered);
    document.getElementById('login-user').value    = user;
    document.getElementById('login-remember').checked = true;
  }
});

/* ══════════════════════════════
   UTILITÁRIOS
══════════════════════════════ */
function fmt(v) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function storageKey(k) {
  return 'fp_' + currentUser + '_' + k;
}

function loadData(k) {
  try {
    const r = localStorage.getItem(storageKey(k));
    return r ? JSON.parse(r) : null;
  } catch (e) {
    return null;
  }
}

function saveData(k, v) {
  localStorage.setItem(storageKey(k), JSON.stringify(v));
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem('fp_users') || '{}'); }
  catch (e) { return {}; }
}

function saveUsers(u) {
  localStorage.setItem('fp_users', JSON.stringify(u));
}

/* ══════════════════════════════
   MÁSCARA DE MOEDA
══════════════════════════════ */
function maskCurrency(input) {
  let raw = input.value.replace(/\D/g, '');
  if (!raw) { input.value = ''; return; }
  const num = parseInt(raw, 10) / 100;
  input.value = num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseCurrency(input) {
  const raw = (typeof input === 'string' ? input : input.value)
    .replace(/[R$\s.]/g, '')
    .replace(',', '.');
  return parseFloat(raw) || 0;
}

/* ══════════════════════════════
   AUTENTICAÇÃO
══════════════════════════════ */
function enterApp(user, displayName) {
  currentUser = user;
  const name = displayName || user;

  // Carrega nome salvo no perfil (se existir)
  const savedProfile = loadData('profile') || {};
  const displayLabel = savedProfile.displayName || name;

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'flex';

  // Dropdown menu
  const ddUsername = document.getElementById('dropdown-username');
  if (ddUsername) ddUsername.textContent = displayLabel;

  // Avatar
  updateAvatarDisplay(savedProfile.photo || null);

  document.getElementById('foot-user').textContent = displayLabel;
  goTo('dashboard');

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', outsideMenuClick);
}

function outsideMenuClick(e) {
  const wrap = document.getElementById('user-menu-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('user-dropdown').classList.remove('open');
  }
}

function doLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const remember = document.getElementById('login-remember').checked;

  if (!user || !pass) { showLoginErr('Preencha todos os campos.'); return; }

  const users = getUsers();

  if (!users[user]) { showLoginErr('Usuário não encontrado. Cadastre-se primeiro.'); return; }
  if (users[user] !== pass) { showLoginErr('Senha incorreta.'); return; }

  if (remember) {
    localStorage.setItem('fp_remembered', JSON.stringify({ user }));
  } else {
    localStorage.removeItem('fp_remembered');
  }

  enterApp(user, user);
}

function switchPanel(panel) {
  document.getElementById('panel-login').style.display    = panel === 'login'    ? 'flex' : 'none';
  document.getElementById('panel-register').style.display = panel === 'register' ? 'flex' : 'none';
}

function doRegister() {
  const user  = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const errEl = document.getElementById('reg-err');

  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };

  if (!user || !pass) { showErr('Preencha todos os campos.'); return; }
  if (pass !== pass2) { showErr('As senhas não coincidem.'); return; }
  if (pass.length < 4) { showErr('Senha deve ter ao menos 4 caracteres.'); return; }

  const users = getUsers();
  if (users[user]) { showErr('Usuário já existe. Faça login.'); return; }

  users[user] = pass;
  saveUsers(users);
  enterApp(user, user);
}

/* ── Google Sign-In ── */
// Configure seu Client ID do Google Cloud Console em:
// https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';

function doGoogleLogin() {
  if (typeof google === 'undefined' || !google.accounts) {
    showLoginErr('Google Sign-In não disponível. Configure o Client ID.');
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
  });
  google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      // Fallback: renderiza o botão popup
      google.accounts.id.renderButton(
        document.querySelector('.google-btn'),
        { theme: 'outline', size: 'large', width: 320 }
      );
    }
  });
}

function handleGoogleCredential(response) {
  try {
    // Decodifica o JWT retornado pelo Google (payload sem verificação de assinatura — ok para client-side demo)
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    const email   = payload.email;
    const name    = payload.name || email.split('@')[0];
    const userId  = 'google_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const users = getUsers();
    if (!users[userId]) {
      users[userId] = '__google__';
      saveUsers(users);
    }

    const remember = document.getElementById('login-remember').checked;
    if (remember) {
      localStorage.setItem('fp_remembered', JSON.stringify({ user: userId }));
    } else {
      localStorage.removeItem('fp_remembered');
    }

    enterApp(userId, name);
  } catch (e) {
    showLoginErr('Erro ao autenticar com Google. Tente novamente.');
  }
}

function doLogout() {
  document.removeEventListener('click', outsideMenuClick);
  currentUser = null;
  document.getElementById('user-dropdown').classList.remove('open');
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value  = '';
  document.getElementById('login-pass').value  = '';
}

function showLoginErr(msg) {
  const el = document.getElementById('login-err');
  el.textContent   = msg;
  el.style.color   = 'var(--red)';
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

function showLoginInfo(msg) {
  const el = document.getElementById('login-err');
  el.textContent   = '✓ ' + msg;
  el.style.color   = 'var(--green)';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; el.style.color = ''; }, 4000);
}

function showGoalErr(msg) {
  const ok = document.getElementById('goal-ok');
  ok.textContent   = '⚠ ' + msg;
  ok.style.color   = 'var(--red)';
  ok.style.display = 'block';
  setTimeout(() => {
    ok.style.display = 'none';
    ok.style.color   = '';
    ok.textContent   = '✓ Meta criada com sucesso!';
  }, 4000);
}

/* ══════════════════════════════
   NAVEGAÇÃO
══════════════════════════════ */
function goTo(sec) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + sec).classList.add('active');

  document.querySelectorAll('.nav-list a').forEach(a => a.classList.remove('active-link'));
  const nl = document.getElementById('nl-' + sec);
  if (nl) nl.classList.add('active-link');

  // Fecha o formulário inline ao trocar de aba
  const inlineForm = document.getElementById('add-inline-form');
  if (inlineForm) inlineForm.style.display = 'none';

  if (sec === 'dashboard')    renderDashboard();
  if (sec === 'transactions') renderTransactions();
  if (sec === 'goals')        renderGoals();
}

/* ══════════════════════════════
   DADOS
══════════════════════════════ */
function getTx()    { return loadData('transactions') || []; }
function saveTx(t)  { saveData('transactions', t); }
function getGoals() { return loadData('goals') || []; }
function saveGoals(g){ saveData('goals', g); }

/* ══════════════════════════════
   FORMULÁRIO — TIPO DE TRANSAÇÃO
══════════════════════════════ */
function setType(t) {
  txType = t;
  document.getElementById('tb-income').className  = t === 'income'  ? 'type-btn sel-income'  : 'type-btn';
  document.getElementById('tb-expense').className = t === 'expense' ? 'type-btn sel-expense' : 'type-btn';
}

/* ══════════════════════════════
   TOGGLE FORMULÁRIO INLINE
══════════════════════════════ */
function toggleAddForm() {
  const form = document.getElementById('add-inline-form');
  const isVisible = form.style.display !== 'none';
  form.style.display = isVisible ? 'none' : 'block';
}

/* ══════════════════════════════
   ADICIONAR TRANSAÇÃO
══════════════════════════════ */
function addTransaction() {
  const desc = document.getElementById('tx-desc').value.trim();
  const val  = parseCurrency(document.getElementById('tx-val'));
  const cat  = document.getElementById('tx-cat').value;
  const date = document.getElementById('tx-date').value;

  if (!desc)        { alert('Preencha a descrição.'); return; }
  if (!val || val <= 0) { alert('Preencha o valor corretamente.'); return; }
  if (!cat)         { alert('Selecione uma categoria.'); return; }
  if (!date)        { alert('Selecione a data.'); return; }

  const txs = getTx();
  txs.unshift({ id: Date.now(), type: txType, desc, value: val, category: cat, date });
  saveTx(txs);

  document.getElementById('tx-desc').value = '';
  document.getElementById('tx-val').value  = '';

  const ok = document.getElementById('tx-ok');
  ok.style.display = 'block';
  setTimeout(() => {
    ok.style.display = 'none';
    document.getElementById('add-inline-form').style.display = 'none';
  }, 1800);

  renderTransactions();
}

/* ══════════════════════════════
   DASHBOARD
══════════════════════════════ */

// Instâncias dos gráficos (para destruir antes de recriar)
const _charts = {};

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function chartDefaults() {
  return {
    color: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(255,255,255,0.08)',
    plugins: {
      legend: { labels: { color: 'rgba(255,255,255,0.45)', font: { size: 11 }, boxWidth: 12 } },
      tooltip: {
        backgroundColor: '#161616',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: 'rgba(255,255,255,0.6)',
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
            if (typeof v === 'number') return ' R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            return ctx.formattedValue;
          }
        }
      }
    },
    scales: {}
  };
}

function darkScales() {
  const gridColor = 'rgba(255,255,255,0.06)';
  const tickColor = 'rgba(255,255,255,0.35)';
  return {
    x: {
      ticks: { color: tickColor, font: { size: 10 } },
      grid:  { color: gridColor }
    },
    y: {
      ticks: {
        color: tickColor, font: { size: 10 },
        callback: v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
      },
      grid: { color: gridColor }
    }
  };
}

function renderDashboard() {
  const txs   = getTx();
  const goals = getGoals();

  let income = 0, expense = 0;
  txs.forEach(t => {
    if (t.type === 'income') income += t.value;
    else expense += t.value;
  });

  document.getElementById('d-balance').textContent  = fmt(income - expense);
  document.getElementById('d-income').textContent   = fmt(income);
  document.getElementById('d-expense').textContent  = fmt(expense);
  document.getElementById('d-goals').textContent    = goals.length;

  const el     = document.getElementById('d-recent');
  const recent = txs.slice(0, 5);
  if (recent.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma transação ainda.</div>';
  } else {
    el.innerHTML = recent.map(t => txHTML(t, false)).join('');
  }

  renderChartEvolution(txs);
  renderChartDonut(income, expense);
  renderChartCategories(txs);
  renderChartGoals(goals);
}

/* ── Gráfico 1: Evolução mensal (linha — entradas, saídas e saldo) ── */
function renderChartEvolution(txs) {
  destroyChart('evolution');

  // Agrupa por mês (últimos 6 meses)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({
      key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    });
  }

  const incomeByMonth  = {};
  const expenseByMonth = {};
  months.forEach(m => { incomeByMonth[m.key] = 0; expenseByMonth[m.key] = 0; });

  txs.forEach(t => {
    if (!t.date) return;
    const key = t.date.substring(0, 7);
    if (incomeByMonth[key]  !== undefined && t.type === 'income')  incomeByMonth[key]  += t.value;
    if (expenseByMonth[key] !== undefined && t.type === 'expense') expenseByMonth[key] += t.value;
  });

  const labels   = months.map(m => m.label);
  const incData  = months.map(m => incomeByMonth[m.key]);
  const expData  = months.map(m => expenseByMonth[m.key]);
  const balData  = months.map(m => incomeByMonth[m.key] - expenseByMonth[m.key]);

  const cfg = chartDefaults();
  cfg.scales = darkScales();

  const ctx = document.getElementById('chart-evolution').getContext('2d');
  _charts['evolution'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Entradas',
          data: incData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Saídas',
          data: expData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Saldo',
          data: balData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.05)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: { ...cfg, responsive: true, maintainAspectRatio: true }
  });
}

/* ── Gráfico 2: Rosca — Entradas vs Saídas ── */
function renderChartDonut(income, expense) {
  destroyChart('donut');
  if (income === 0 && expense === 0) {
    destroyChart('donut');
    const ctx = document.getElementById('chart-donut').getContext('2d');
    _charts['donut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Sem dados'],
        datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.06)'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
    return;
  }

  const cfg = chartDefaults();
  const ctx = document.getElementById('chart-donut').getContext('2d');
  _charts['donut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Entradas', 'Saídas'],
      datasets: [{
        data: [income, expense],
        backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(239,68,68,0.8)'],
        borderColor: ['#22c55e', '#ef4444'],
        borderWidth: 1,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: cfg.plugins
    }
  });
}

/* ── Gráfico 3: Barras — Gastos por categoria ── */
function renderChartCategories(txs) {
  destroyChart('categories');

  const expenses = txs.filter(t => t.type === 'expense');
  const catMap   = {};
  expenses.forEach(t => {
    const c = t.category || 'Geral';
    catMap[c] = (catMap[c] || 0) + t.value;
  });

  const sorted  = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels  = sorted.map(e => e[0]);
  const data    = sorted.map(e => e[1]);

  const palette = [
    'rgba(239,68,68,0.75)','rgba(249,115,22,0.75)','rgba(245,158,11,0.75)',
    'rgba(34,197,94,0.75)','rgba(6,182,212,0.75)','rgba(59,130,246,0.75)',
    'rgba(139,92,246,0.75)','rgba(236,72,153,0.75)'
  ];

  const cfg = chartDefaults();
  cfg.scales = darkScales();
  cfg.scales.y.ticks.callback = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0 });

  const ctx = document.getElementById('chart-categories').getContext('2d');
  _charts['categories'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Sem dados'],
      datasets: [{
        label: 'Gastos',
        data: data.length ? data : [0],
        backgroundColor: palette,
        borderColor: palette.map(c => c.replace('0.75', '1')),
        borderWidth: 1,
        borderRadius: 2
      }]
    },
    options: {
      ...cfg,
      responsive: true, maintainAspectRatio: true,
      plugins: { ...cfg.plugins, legend: { display: false } }
    }
  });
}

/* ── Gráfico 4: Barras horizontais — Progresso das metas ── */
function renderChartGoals(goals) {
  destroyChart('goals');

  const labels = goals.length ? goals.map(g => g.name) : ['Sem metas'];
  const pcts   = goals.length ? goals.map(g => Math.min(100, Math.round((g.current / g.target) * 100))) : [0];

  const barColors = pcts.map(p =>
    p >= 100 ? 'rgba(34,197,94,0.8)' : p >= 60 ? 'rgba(59,130,246,0.8)' : 'rgba(245,158,11,0.8)'
  );

  const cfg = chartDefaults();

  const ctx = document.getElementById('chart-goals').getContext('2d');
  _charts['goals'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Progresso (%)',
        data: pcts,
        backgroundColor: barColors,
        borderColor: barColors.map(c => c.replace('0.8', '1')),
        borderWidth: 1,
        borderRadius: 2
      }]
    },
    options: {
      ...cfg,
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: true,
      scales: {
        x: {
          min: 0, max: 100,
          ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 }, callback: v => v + '%' },
          grid:  { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 } },
          grid:  { color: 'rgba(255,255,255,0.06)' }
        }
      },
      plugins: {
        ...cfg.plugins,
        legend: { display: false },
        tooltip: {
          ...cfg.plugins.tooltip,
          callbacks: { label: ctx => ' ' + ctx.parsed.x + '% concluído' }
        }
      }
    }
  });
}

/* ══════════════════════════════
   HTML DE UMA TRANSAÇÃO
══════════════════════════════ */
function txHTML(t, showDel) {
  const sign     = t.type === 'income' ? '+' : '−';
  const cls      = t.type === 'income' ? 'in' : 'out';
  const dateStr  = t.date
    ? new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')
    : '';
  const delBtn   = showDel
    ? `<button class="del-btn" onclick="deleteTx(${t.id})" title="Excluir">×</button>`
    : '';

  return `
    <div class="tx-item">
      <div>
        <div class="tx-desc">${t.desc}</div>
        <div class="tx-date">${dateStr}${t.category ? ' · ' + t.category : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;">
        <span class="tx-amount ${cls}">${sign} ${fmt(t.value)}</span>
        ${delBtn}
      </div>
    </div>`;
}

/* ══════════════════════════════
   COMPETÊNCIA — NAVEGAÇÃO MENSAL
══════════════════════════════ */
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function compKey(year, month) {
  return year + '-' + String(month + 1).padStart(2, '0');
}

/* Saldo acumulado de todos os meses ANTES do mês atual */
function calcSaldoAnterior(txs, year, month) {
  const limit = compKey(year, month);
  let saldo = 0;
  txs.forEach(t => {
    if (!t.date) return;
    const k = t.date.substring(0, 7);
    if (k < limit) {
      saldo += t.type === 'income' ? t.value : -t.value;
    }
  });
  return saldo;
}

function changeMonth(delta) {
  compMonth += delta;
  if (compMonth > 11) { compMonth = 0;  compYear++; }
  if (compMonth < 0)  { compMonth = 11; compYear--; }
  renderTransactions();
}

function updateCompNav() {
  document.getElementById('comp-label').textContent =
    MONTH_NAMES[compMonth] + ' ' + compYear;

  // Desabilita "próximo" se já está no mês atual ou futuro
  const now = new Date();
  const isFuture = compYear > now.getFullYear() ||
    (compYear === now.getFullYear() && compMonth >= now.getMonth());
  document.getElementById('comp-next').disabled = isFuture;
}

/* ══════════════════════════════
   FILTROS E LISTAGEM
══════════════════════════════ */
function setFilter(f) {
  txFilter = f;
  ['all', 'income', 'expense'].forEach(x => {
    document.getElementById('f-' + x).classList.toggle('active', x === f);
  });
  renderTransactions();
}

function renderTransactions() {
  updateCompNav();

  const allTxs = getTx();
  const key    = compKey(compYear, compMonth);

  // Transações do mês
  const monthTxs = allTxs.filter(t => t.date && t.date.substring(0, 7) === key);

  // Saldo anterior (herdado dos meses anteriores)
  const saldoAnterior = calcSaldoAnterior(allTxs, compYear, compMonth);

  // Totais do mês
  let income = 0, expense = 0;
  monthTxs.forEach(t => {
    if (t.type === 'income') income += t.value;
    else expense += t.value;
  });
  const saldoFinal = saldoAnterior + income - expense;

  // Atualiza resumo
  const prevEl = document.getElementById('ms-prev');
  prevEl.textContent = (saldoAnterior < 0 ? '−' : '') + fmt(saldoAnterior);
  prevEl.className   = 'month-summary-val' + (saldoAnterior < 0 ? ' expense' : saldoAnterior > 0 ? ' income' : '');

  document.getElementById('ms-income').textContent  = fmt(income);
  document.getElementById('ms-expense').textContent = fmt(expense);

  const balEl = document.getElementById('ms-balance');
  balEl.textContent = (saldoFinal < 0 ? '−' : '') + fmt(saldoFinal);
  balEl.className   = 'month-summary-val' + (saldoFinal < 0 ? ' expense' : saldoFinal > 0 ? ' income' : '');

  // Filtra por tipo
  const filtered = txFilter === 'all'
    ? monthTxs
    : monthTxs.filter(t => t.type === txFilter);

  const el = document.getElementById('tx-list');

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma transação em ' +
      MONTH_NAMES[compMonth] + ' ' + compYear + '.</div>';
    return;
  }

  // Agrupa por dia (mais recente primeiro)
  const byDay = {};
  [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(t => {
    const d = t.date || 'sem-data';
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(t);
  });

  el.innerHTML = Object.entries(byDay).map(([day, txs]) => {
    const dayLabel = day !== 'sem-data'
      ? new Date(day + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
      : 'Sem data';

    const dayIncome  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.value, 0);
    const dayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.value, 0);
    const dayNet     = dayIncome - dayExpense;
    const netCls     = dayNet >= 0 ? 'in' : 'out';
    const netSign    = dayNet >= 0 ? '+' : '−';

    return `
      <div class="tx-day-group">
        <div class="tx-day-header">
          <span class="tx-day-label">${dayLabel}</span>
          <span class="tx-day-net ${netCls}">${netSign} ${fmt(Math.abs(dayNet))}</span>
        </div>
        ${txs.map(t => txHTML(t, true)).join('')}
      </div>`;
  }).join('');
}

function deleteTx(id) {
  saveTx(getTx().filter(t => t.id !== id));
  renderTransactions();
}

/* ══════════════════════════════
   METAS
══════════════════════════════ */
function addGoal() {
  const name     = document.getElementById('goal-name').value.trim();
  const category = document.getElementById('goal-category').value;
  const target   = parseCurrency(document.getElementById('goal-target'));
  const current  = parseCurrency(document.getElementById('goal-current'));
  const monthly  = parseCurrency(document.getElementById('goal-monthly'));
  const deadline = document.getElementById('goal-deadline').value;

  const errors = [];
  if (!name)                errors.push('Nome da meta');
  if (!category)            errors.push('Categoria');
  if (!target || target <= 0) errors.push('Valor Alvo');
  if (isNaN(current))       errors.push('Valor Atual');
  if (!monthly || monthly <= 0) errors.push('Aporte Mensal');

  if (errors.length > 0) {
    showGoalErr('Preencha os campos obrigatórios: ' + errors.join(', ') + '.');
    return;
  }

  const goals = getGoals();
  goals.push({ id: Date.now(), name, category, target, current, monthly, deadline });
  saveGoals(goals);

  document.getElementById('goal-name').value     = '';
  document.getElementById('goal-category').value = '';
  document.getElementById('goal-target').value   = '';
  document.getElementById('goal-current').value  = '';
  document.getElementById('goal-monthly').value  = '';
  document.getElementById('goal-deadline').value = '';

  const ok = document.getElementById('goal-ok');
  ok.style.display = 'block';
  setTimeout(() => ok.style.display = 'none', 2500);

  renderGoals();
}

function calcProjection(g) {
  const remaining = g.target - g.current;
  if (remaining <= 0) return null;
  if (!g.monthly || g.monthly <= 0) return null;

  const months = Math.ceil(remaining / g.monthly);
  const projDate = new Date();
  projDate.setMonth(projDate.getMonth() + months);

  const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const label = monthNames[projDate.getMonth()] + '/' + projDate.getFullYear();

  return { months, label };
}

const GOAL_CATEGORY_ICONS = {
  'Veículo': '🚗', 'Imóvel': '🏠', 'Viagem': '✈️', 'Emergência': '🛡️',
  'Educação': '🎓', 'Saúde': '❤️', 'Investimento': '📈',
  'Eletrônicos': '💻', 'Geral': '🎯', 'Outro': '📌'
};

function renderGoals() {
  const goals = getGoals();
  const el    = document.getElementById('goals-grid');

  if (goals.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma meta criada ainda.</div>';
    return;
  }

  el.innerHTML = goals.map(g => {
    const pct         = Math.min(100, Math.round((g.current / g.target) * 100));
    const done        = pct >= 100;
    const deadlineStr = g.deadline
      ? new Date(g.deadline + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Sem prazo';
    const icon     = GOAL_CATEGORY_ICONS[g.category] || '\u{1F3AF}';
    const catLabel = g.category || 'Geral';
    const proj     = calcProjection(g);

    let projHTML = '';
    if (!done && proj) {
      projHTML = `
        <div class="goal-projection">
          <span class="proj-icon">\u{1F4C5}</span>
          Conclusão estimada: <strong>${proj.label}</strong>
          <span class="proj-months">(${proj.months} ${proj.months === 1 ? 'mês' : 'meses'})</span>
        </div>`;
    } else if (!done && (!g.monthly || g.monthly <= 0)) {
      projHTML = `<div class="goal-projection muted">Sem projeção — defina um aporte mensal.</div>`;
    }

    const detailsHTML = `
      <div class="goal-details" id="details-${g.id}" style="display:none;">
        <div class="goal-detail-row">
          <span class="goal-detail-label">Valor Atual</span>
          <span class="goal-detail-val">${fmt(g.current)}</span>
        </div>
        <div class="goal-detail-row">
          <span class="goal-detail-label">Valor Alvo</span>
          <span class="goal-detail-val">${fmt(g.target)}</span>
        </div>
        <div class="goal-detail-row">
          <span class="goal-detail-label">Prazo</span>
          <span class="goal-detail-val">${deadlineStr}</span>
        </div>
        ${g.monthly > 0 ? `
        <div class="goal-detail-row">
          <span class="goal-detail-label">Aporte Mensal</span>
          <span class="goal-detail-val" style="color:var(--blue)">${fmt(g.monthly)}</span>
        </div>` : ''}
        ${!done ? `
        <div class="goal-actions" style="margin-top:1rem;">
          <button class="add-funds-btn" onclick="openFundModal(${g.id})">+ Adicionar Fundos</button>
        </div>` : ''}
      </div>`;

    return `
      <div class="goal-card">
        <div class="goal-card-actions">
          <button class="goal-edit-btn" onclick="openEditModal(${g.id})" title="Editar">&#9998;</button>
          <button class="goal-del" onclick="deleteGoal(${g.id})" title="Excluir">&times;</button>
        </div>

        <div class="goal-category-badge">
          <span class="goal-cat-icon">${icon}</span>
          <span class="goal-cat-label">${catLabel}</span>
        </div>

        <div class="goal-name">${g.name}</div>
        <div class="goal-summary-value">${fmt(g.target)}</div>

        <div class="progress-bar">
          <div class="progress-fill ${done ? 'done' : ''}" style="width:${pct}%"></div>
        </div>

        <div class="goal-pct">${pct}% ${done ? '&#10003; Concluída' : 'concluído'}</div>

        ${projHTML}

        <button class="goal-toggle-btn" onclick="toggleGoalDetails(${g.id}, this)">
          Detalhes <span class="toggle-arrow">&#9662;</span>
        </button>

        ${detailsHTML}
      </div>`;
  }).join('');
}

function toggleGoalDetails(id, btn) {
  const details = document.getElementById('details-' + id);
  const arrow   = btn.querySelector('.toggle-arrow');
  const open    = details.style.display === 'none';
  details.style.display = open ? 'block' : 'none';
  arrow.innerHTML        = open ? '&#9652;' : '&#9662;';
}

function deleteGoal(id) {
  saveGoals(getGoals().filter(g => g.id !== id));
  renderGoals();
}

/* ── Modal de adicionar fundos ── */
function openFundModal(id) {
  fundingGoalId = id;
  document.getElementById('fund-val').value = '';
  document.getElementById('fund-modal').classList.add('open');
}

function closeFundModal() {
  document.getElementById('fund-modal').classList.remove('open');
  fundingGoalId = null;
}

function confirmFund() {
  const val = parseFloat(document.getElementById('fund-val').value);
  if (isNaN(val) || val <= 0) return;

  const goals = getGoals().map(g => {
    if (g.id === fundingGoalId) {
      g.current = Math.min(g.target, g.current + val);
    }
    return g;
  });

  saveGoals(goals);
  closeFundModal();
  renderGoals();
}

/* ── Modal de editar meta ── */
let editingGoalId = null;

function openEditModal(id) {
  const g = getGoals().find(g => g.id === id);
  if (!g) return;
  editingGoalId = id;

  document.getElementById('edit-goal-name').value     = g.name;
  document.getElementById('edit-goal-category').value = g.category || 'Geral';
  document.getElementById('edit-goal-target').value   = g.target  ? g.target.toLocaleString('pt-BR',  { style: 'currency', currency: 'BRL' }) : '';
  document.getElementById('edit-goal-current').value  = g.current ? g.current.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  document.getElementById('edit-goal-monthly').value  = g.monthly ? g.monthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  document.getElementById('edit-goal-deadline').value = g.deadline || '';

  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  editingGoalId = null;
}

function confirmEditGoal() {
  const name     = document.getElementById('edit-goal-name').value.trim();
  const category = document.getElementById('edit-goal-category').value;
  const target   = parseCurrency(document.getElementById('edit-goal-target'));
  const current  = parseCurrency(document.getElementById('edit-goal-current'));
  const monthly  = parseCurrency(document.getElementById('edit-goal-monthly'));
  const deadline = document.getElementById('edit-goal-deadline').value;

  if (!name || !target) return;

  const goals = getGoals().map(g => {
    if (g.id === editingGoalId) {
      return { ...g, name, category, target, current, monthly, deadline };
    }
    return g;
  });

  saveGoals(goals);
  closeEditModal();
  renderGoals();
}

document.addEventListener('DOMContentLoaded', () => {
  const editModal = document.getElementById('edit-modal');
  if (editModal) editModal.addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
  });
});

/* ══════════════════════════════
   MENU 3 PONTOS
══════════════════════════════ */
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}

/* ══════════════════════════════
   PERFIL — MODAL
══════════════════════════════ */
let _profileSection = 'name';

function openProfileModal(section) {
  _profileSection = section;
  document.getElementById('user-dropdown').classList.remove('open');

  const titles = { name: 'Alterar nome', password: 'Alterar senha', settings: 'Configurações' };
  document.getElementById('profile-modal-title').textContent = titles[section] || 'Perfil';

  ['name','password','settings'].forEach(s => {
    document.getElementById('profile-section-' + s).style.display = s === section ? 'block' : 'none';
  });

  // Preenche nome atual
  if (section === 'name') {
    const saved = loadData('profile') || {};
    document.getElementById('profile-new-name').value = saved.displayName || currentUser || '';
  }

  document.getElementById('profile-ok').style.display = 'none';
  document.getElementById('profile-modal').classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('open');
  const errEl = document.getElementById('profile-pass-err');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
}

function saveProfileName() {
  const name = document.getElementById('profile-new-name').value.trim();
  if (!name) return;

  const profile = loadData('profile') || {};
  profile.displayName = name;
  saveData('profile', profile);

  document.getElementById('dropdown-username').textContent = name;
  document.getElementById('foot-user').textContent = name;
  showProfileOk();
}

function saveProfilePassword() {
  const oldPass  = document.getElementById('profile-old-pass').value;
  const newPass  = document.getElementById('profile-new-pass').value;
  const newPass2 = document.getElementById('profile-new-pass2').value;
  const errEl    = document.getElementById('profile-pass-err');

  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';

  const users = getUsers();
  if (!currentUser || users[currentUser] !== oldPass) { showErr('Senha atual incorreta.'); return; }
  if (newPass.length < 4) { showErr('Nova senha deve ter ao menos 4 caracteres.'); return; }
  if (newPass !== newPass2) { showErr('As senhas não coincidem.'); return; }

  users[currentUser] = newPass;
  saveUsers(users);

  document.getElementById('profile-old-pass').value = '';
  document.getElementById('profile-new-pass').value = '';
  document.getElementById('profile-new-pass2').value = '';
  showProfileOk();
}

function showProfileOk() {
  const ok = document.getElementById('profile-ok');
  ok.style.display = 'block';
  setTimeout(() => ok.style.display = 'none', 2500);
}

/* ══════════════════════════════
   FOTO DE PERFIL
══════════════════════════════ */
let _pendingPhotoDataUrl = null;

function openProfilePhotoModal() {
  document.getElementById('user-dropdown').classList.remove('open');
  _pendingPhotoDataUrl = null;

  const saved = (loadData('profile') || {}).photo;
  const preview = document.getElementById('photo-preview');
  preview.innerHTML = saved
    ? `<img src="${saved}" alt="avatar"/>`
    : '👤';

  document.getElementById('photo-input').value = '';
  document.getElementById('photo-modal').classList.add('open');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.remove('open');
}

function previewPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _pendingPhotoDataUrl = e.target.result;
    document.getElementById('photo-preview').innerHTML = `<img src="${_pendingPhotoDataUrl}" alt="preview"/>`;
  };
  reader.readAsDataURL(file);
}

function savePhoto() {
  if (!_pendingPhotoDataUrl) { closePhotoModal(); return; }
  const profile = loadData('profile') || {};
  profile.photo = _pendingPhotoDataUrl;
  saveData('profile', profile);
  updateAvatarDisplay(_pendingPhotoDataUrl);
  closePhotoModal();
}

function updateAvatarDisplay(dataUrl) {
  const navAvatar      = document.getElementById('nav-avatar');
  const dropdownAvatar = document.getElementById('dropdown-avatar');
  const photoPreview   = document.getElementById('photo-preview');

  if (dataUrl) {
    const imgTag = `<img src="${dataUrl}" alt="avatar"/>`;
    if (navAvatar)      navAvatar.innerHTML      = imgTag;
    if (dropdownAvatar) dropdownAvatar.innerHTML = imgTag;
    if (photoPreview)   photoPreview.innerHTML   = imgTag;
  } else {
    if (navAvatar)      navAvatar.innerHTML      = '👤';
    if (dropdownAvatar) dropdownAvatar.innerHTML = '👤';
    if (photoPreview)   photoPreview.innerHTML   = '👤';
  }
}

// Fechar modais de perfil/foto ao clicar no overlay
document.addEventListener('DOMContentLoaded', () => {
  ['profile-modal','photo-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });
});
