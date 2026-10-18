(function(){
  "use strict";

  var STORAGE_KEY = "livro-caixa-dados-v2";
  var INVALID_KEY = "livro-caixa-dados-v2-invalido";
  var CURRENT_SCHEMA_VERSION = 3;
  var MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  var CAL_SVG = '<svg class="icon" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/></svg>';
  var TRASH_SVG = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>';

  function getTodayMonthKey() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    return y + "-" + (m < 10 ? "0" + m : "" + m);
  }

  function monthLabel(key){
    var parts = key.split("-");
    var y = parts[0], m = parseInt(parts[1],10)-1;
    return MONTH_NAMES[m] + "/" + y;
  }

  function monthShort(key){
    var parts = key.split("-");
    var m = parseInt(parts[1],10)-1;
    return MONTH_NAMES[m].slice(0,3) + "/" + parts[0].slice(2);
  }

  function toCents(reais){
    var n = Number(reais);
    if(isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  function centsToInput(cents){
    if(typeof cents !== 'number' || isNaN(cents)) return '';
    return (cents / 100).toFixed(2);
  }

  function parseCents(str){
    if(str === null || str === undefined) return null;
    var s = String(str).replace(/R\$/gi, '').replace(/\s/g, '');
    if(s === '') return null;
    var neg = false;
    if(s.charAt(0) === '-'){ neg = true; s = s.slice(1); }
    else if(s.charAt(0) === '+'){ s = s.slice(1); }
    if(!/^[0-9.,]+$/.test(s)) return null;

    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    var decPos = -1;
    if(lastComma > -1 && lastDot > -1){
      decPos = Math.max(lastComma, lastDot);
    } else if(lastComma > -1){
      decPos = (s.indexOf(',') === lastComma) ? lastComma : -1;
    } else if(lastDot > -1){
      decPos = (s.indexOf('.') === lastDot) ? lastDot : -1;
    }

    var intPart, fracPart;
    if(decPos > -1){
      intPart = s.slice(0, decPos).replace(/[.,]/g, '');
      fracPart = s.slice(decPos + 1).replace(/[.,]/g, '');
    } else {
      intPart = s.replace(/[.,]/g, '');
      fracPart = '';
    }
    if(intPart === '' && fracPart === '') return null;
    if(intPart === '') intPart = '0';
    fracPart = (fracPart + '00').slice(0, 2);
    var cents = parseInt(intPart, 10) * 100 + parseInt(fracPart, 10);
    if(isNaN(cents)) return null;
    return neg ? -cents : cents;
  }

  /* Campo de texto digitado à mão (gasto rápido): no padrão brasileiro,
     "1.234" ou "1.234.567" são milhares, não decimais. */
  function parseCentsText(str){
    var s = String(str === null || str === undefined ? '' : str).replace(/R\$/gi, '').replace(/\s/g, '');
    if(/^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseCents(s);
  }

  /* Máscara de valores: fora de foco "1.234,56"; em foco "1234,56" */
  function fmtPlain(cents){
    return ((cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function centsToEdit(cents){
    if(typeof cents !== 'number' || isNaN(cents)) return '';
    var a = Math.abs(cents);
    return (cents < 0 ? '-' : '') + Math.floor(a / 100) + ',' + (a % 100 < 10 ? '0' : '') + (a % 100);
  }

  /* Preferências só deste aparelho (não entram no backup) */
  var BACKUP_KEY = 'saldo_ultimo_backup';
  var BACKUP_SNOOZE_KEY = 'saldo_backup_adiado';
  var WELCOME_KEY = 'saldo_boas_vindas_ok';
  var DAY_MS = 86400000;
  var BACKUP_LATE_DAYS = 14;
  var BACKUP_SNOOZE_DAYS = 3;

  function lsGetInt(k){ try{ return parseInt(localStorage.getItem(k), 10) || null; }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, String(v)); }catch(e){} }

  function nativePlugin(name){
    try{
      var cap = window.Capacitor;
      return (cap && cap.Plugins && cap.Plugins[name]) || null;
    }catch(e){ return null; }
  }
  function isNativeApp(){
    try{ return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()); }
    catch(e){ return false; }
  }

  function migrateData(d){
    if(!d || typeof d !== 'object') return null;
    var v = (typeof d.version === 'number') ? d.version : 1;
    if(v > CURRENT_SCHEMA_VERSION) return null;
    if(v < 3){
      ['expenses', 'income'].forEach(function(listName){
        (d[listName] || []).forEach(function(row){
          if(!row.values) row.values = {};
          Object.keys(row.values).forEach(function(k){
            var x = row.values[k];
            if(typeof x === 'number' && !isNaN(x)) row.values[k] = toCents(x);
            else delete row.values[k];
          });
        });
      });
      if(d.daily){
        (d.daily.entries || []).forEach(function(row){
          if(typeof row.amount === 'number' && !isNaN(row.amount)) row.amount = toCents(row.amount);
          else row.amount = undefined;
        });
        var bal = d.daily.balances || {};
        Object.keys(bal).forEach(function(k){
          if(bal[k] && typeof bal[k].initial === 'number') bal[k].initial = toCents(bal[k].initial);
        });
      }
      d.version = 3;
    }
    return d;
  }

  function seedData(){
    var currentKey = getTodayMonthKey();
    var months = [];
    for(var i = -1; i <= 5; i++) months.push(addMonthsToKey(currentKey, i));

    function series(arrReais){
      var o = {};
      months.forEach(function(mk, idx){ o[mk] = toCents(arrReais[idx]); });
      return o;
    }

    var expenses = [
      { id:"e1", day:5,  item:"Aluguel e Condomínio",  values: series([1200,1200,1200,1200,1200,1200,1200]) },
      { id:"e2", day:10, item:"Energia e Água",        values: series([280,240,260,300,290,270,250]) },
      { id:"e3", day:12, item:"Internet e Celular",    values: series([120,120,120,120,120,120,120]) },
      { id:"e4", day:15, item:"Supermercado",          values: series([900,820,880,1100,800,850,870]) },
      { id:"e5", day:20, item:"Cartão de Crédito",     values: series([620,380,510,890,400,430,490]) }
    ];
    var income = [
      { id:"r1", day:5,  item:"Salário",                    values: series([3500,3500,3500,3500,3500,3500,3500]) },
      { id:"r2", day:15, item:"Serviços Extra / Freelance", values: series([450,800,300,1200,500,650,400]) },
      { id:"r3", day:25, item:"Rendimentos / Outros",       values: series([150,160,155,170,165,175,180]) }
    ];
    var today = new Date().getDate();
    var daily = {
      nextId: 3,
      balances: {},
      entries: [
        { id:"d1", day: today, item:"Padaria", amount: toCents(18.5), monthKey: currentKey },
        { id:"d2", day: today, item:"Uber",    amount: toCents(22),   monthKey: currentKey }
      ]
    };
    daily.balances[months[0]] = { initial: toCents(500) };

    return { version: CURRENT_SCHEMA_VERSION, months: months, selectedMonth: currentKey, selectedDiarioMonth: currentKey, expenses: expenses, income: income, nextId: 100, daily: daily };
  }

  function emptyData(){
    var currentKey = getTodayMonthKey();
    return { version: CURRENT_SCHEMA_VERSION, months: [currentKey], selectedMonth: currentKey, selectedDiarioMonth: currentKey, expenses: [], income: [], nextId: 1, daily: { nextId: 1, entries: [], balances: {} } };
  }

  var state = null;
  var saveTimer = null;
  var hasNativeStorage = (typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function');

  function storageGet(key){
    if(hasNativeStorage){
      return window.storage.get(key, false)
        .then(function(res){ return res ? res.value : null; })
        .catch(function(){ return null; });
    }
    try{
      return Promise.resolve(window.localStorage.getItem(key));
    }catch(e){
      return Promise.resolve(null);
    }
  }

  function storageSet(key, value){
    if(hasNativeStorage){
      return window.storage.set(key, value, false)
        .then(function(res){ return !!res; })
        .catch(function(){ return false; });
    }
    try{
      window.localStorage.setItem(key, value);
      return Promise.resolve(true);
    }catch(e){
      return Promise.resolve(false);
    }
  }

  function nextMonthKey(key){ return addMonthsToKey(key, 1); }

  function getMonthDiff(startKey, endKey) {
    if(!startKey || !endKey) return 0;
    var s = startKey.split('-');
    var e = endKey.split('-');
    return (parseInt(e[0],10) - parseInt(s[0],10)) * 12 + (parseInt(e[1],10) - parseInt(s[1],10));
  }

  function addMonthsToKey(key, num) {
    var parts = key.split('-');
    var y = parseInt(parts[0],10);
    var m = parseInt(parts[1],10);
    var total = y * 12 + (m - 1) + num;
    var ny = Math.floor(total / 12);
    var nm = total - ny * 12 + 1;
    return ny + "-" + (nm < 10 ? "0" + nm : "" + nm);
  }

  function fmtMoney(cents){
    return ((cents || 0) / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function el(tag, className, text){
    var node = document.createElement(tag);
    if(className) node.className = className;
    if(text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function flagSave(){
    var node = document.getElementById('saveFlag');
    if(node) {
      node.classList.add('show');
      clearTimeout(node._t);
      node._t = setTimeout(function(){ node.classList.remove('show'); }, 1100);
    }
  }

  var toastStack = document.getElementById('toastStack');

  function showToast(message, type, duration){
    if(!toastStack){ return; }
    type = type || 'info';
    duration = duration || 4200;
    var node = document.createElement('div');
    node.className = 'toast ' + type;
    node.textContent = message;
    node.title = 'Clique para fechar';
    node.addEventListener('click', function(){ dismissToast(node); });
    toastStack.appendChild(node);
    requestAnimationFrame(function(){ node.classList.add('show'); });
    node._timer = setTimeout(function(){ dismissToast(node); }, duration);
    return node;
  }

  function dismissToast(node){
    if(!node || !node.parentNode) return;
    clearTimeout(node._timer);
    node.classList.remove('show');
    setTimeout(function(){ if(node.parentNode) node.parentNode.removeChild(node); }, 220);
  }

  /* ---------- Modal de confirmação ---------- */
  var modalOverlay = document.getElementById('modalOverlay');
  var modalTitleEl = document.getElementById('modalTitle');
  var modalMessageEl = document.getElementById('modalMessage');
  var modalActionsEl = document.getElementById('modalActions');
  var modalResolve = null;

  function closeModalWith(result){
    if(modalOverlay) modalOverlay.classList.remove('open');
    if(modalResolve){
      var resolve = modalResolve;
      modalResolve = null;
      resolve(result);
    }
  }

  if(modalOverlay){
    modalOverlay.addEventListener('click', function(e){
      if(e.target === modalOverlay) closeModalWith(false);
    });
  }

  function showConfirm(message, opts){
    opts = opts || {};
    return new Promise(function(resolve){
      if(!modalOverlay){ resolve(window.confirm(message)); return; }
      modalResolve = resolve;
      if(modalTitleEl) modalTitleEl.textContent = opts.title || 'Confirmar';
      if(modalMessageEl) modalMessageEl.textContent = message;
      if(modalActionsEl){
        modalActionsEl.innerHTML = '';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'modal-btn secondary';
        cancelBtn.textContent = opts.cancelLabel || 'Cancelar';
        cancelBtn.addEventListener('click', function(){ closeModalWith(false); });

        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'modal-btn ' + (opts.danger ? 'danger' : 'primary');
        confirmBtn.textContent = opts.confirmLabel || 'Confirmar';
        confirmBtn.addEventListener('click', function(){ closeModalWith(true); });

        modalActionsEl.appendChild(cancelBtn);
        modalActionsEl.appendChild(confirmBtn);
      }
      modalOverlay.classList.add('open');
    });
  }

  /* ---------- Tema ---------- */
  var THEME_STORAGE_KEY = 'saldo_theme';

  function getCurrentTheme(){
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* Barras nativas do Android via SystemBars (@capacitor/core 7.1+).
     O estilo é pelo FUNDO: 'LIGHT' = fundo claro (ícones escuros),
     'DARK' = fundo escuro (ícones claros). */
  function sincronizarBarrasSistema(theme){
    try{
      var cap = window.Capacitor;
      var SB = cap && cap.Plugins && cap.Plugins.SystemBars;
      if(SB && typeof SB.setStyle === 'function'){
        var r = SB.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' });
        if(r && typeof r.catch === 'function') r.catch(function(){});
      }
    }catch(e){ /* fora do app nativo: ignora */ }
  }

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    try{ localStorage.setItem(THEME_STORAGE_KEY, theme); }catch(e){}

    var metaThemeColor = document.getElementById('themeColorMeta');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#14213D' : '#F6F8FC');
    }

    var toggles = document.querySelectorAll('.theme-toggle-btn');
    for(var i = 0; i < toggles.length; i++){
      toggles[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      var label = toggles[i].querySelector('.theme-toggle-label');
      if(label) label.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
    }
    sincronizarBarrasSistema(theme);
  }

  var themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
  for(var ttIdx = 0; ttIdx < themeToggleBtns.length; ttIdx++){
    themeToggleBtns[ttIdx].addEventListener('click', function(){
      applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  applyTheme(getCurrentTheme());

  function persist(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      storageSet(STORAGE_KEY, JSON.stringify(state)).then(function(ok){
        if(ok) flagSave();
        if(window.SaldoNotif) window.SaldoNotif.refresh();
      }).catch(function(err){ console.error("Erro ao salvar localmente:", err); });
    }, 250);
  }

  /* ---------- Cálculos ---------- */
  function lastDayOfMonth(monthKey){
    var p = monthKey.split('-');
    return new Date(parseInt(p[0],10), parseInt(p[1],10), 0).getDate();
  }

  function effectiveDay(row, monthKey){
    var last = lastDayOfMonth(monthKey);
    var d = row.day;
    if(d === null || d === undefined || isNaN(d)) return last;
    return Math.min(d, last);
  }

  function mensalCutoffDay(monthKey){
    var tk = getTodayMonthKey();
    if(monthKey < tk) return 99;
    if(monthKey === tk) return new Date().getDate();
    return 0;
  }

  function isOnce(row){
    return !!row.once && (row.instTotal || 1) <= 1;
  }

  function rowActiveIn(row, monthKey){
    var instTotal = row.instTotal || 1;
    if(instTotal > 1){
      var diff = getMonthDiff(row.instStart || monthKey, monthKey);
      return !(diff < 0 || diff >= instTotal);
    }
    if(row.once && row.onceMonth) return row.onceMonth === monthKey;
    return true;
  }

  function sumMonth(list, monthKey, upToDay){
    var total = 0, count = 0;
    for(var i=0;i<list.length;i++){
      var row = list[i];
      if (!rowActiveIn(row, monthKey)) continue;
      if (upToDay !== undefined && effectiveDay(row, monthKey) > upToDay) continue;

      var v = row.values[monthKey];
      if(typeof v === 'number' && !isNaN(v)){ total += v; count++; }
    }
    return { total: total, count: count };
  }

  function ensureCurrentMonthSelected() {
    var todayKey = getTodayMonthKey();
    if (!state.months || state.months.length === 0) {
      state.months = [todayKey];
    }
    if (state.months.indexOf(todayKey) === -1) {
      state.months.push(todayKey);
      state.months.sort();
    }
    if (!state.selectedMonth || state.months.indexOf(state.selectedMonth) === -1) {
      state.selectedMonth = todayKey;
    }
    if (!state.selectedDiarioMonth || state.months.indexOf(state.selectedDiarioMonth) === -1) {
      state.selectedDiarioMonth = todayKey;
    }
    if (!state.daily) {
      state.daily = { nextId: 1, entries: [], balances: {} };
    }
    if (!state.daily.balances) state.daily.balances = {};
    if (!state.daily.entries) state.daily.entries = [];
    if (!state.daily.nextId) state.daily.nextId = 1;
  }

  function getSelectedDiarioMonth(){
    return state.selectedDiarioMonth || getTodayMonthKey();
  }

  /* ---------- Data selecionada no Diário (dia visualizado) ---------- */
  function pad2(n){ return n < 10 ? '0' + n : '' + n; }
  function dateToISO(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayISO(){ return dateToISO(new Date()); }
  function shiftDateISO(iso, days){
    var p = iso.split('-');
    return dateToISO(new Date(parseInt(p[0],10), parseInt(p[1],10) - 1, parseInt(p[2],10) + days));
  }
  var diarioData = todayISO();
  function diarioDay(){ return parseInt(diarioData.slice(8, 10), 10) || 1; }

  function setDiarioData(iso){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) iso = todayISO();
    var mk = iso.slice(0, 7);
    if(state.months.indexOf(mk) === -1){
      state.months.push(mk);
      state.months.sort();
    }
    state.selectedDiarioMonth = mk;
    diarioData = iso;
    persist();
    renderDiario();
  }

  function sumDailyMonth(monthKey){
    var total = 0, count = 0;
    state.daily.entries.forEach(function(row){
      if(row.monthKey !== monthKey) return;
      var v = row.amount;
      if(typeof v === 'number' && !isNaN(v)){ total += v; count++; }
    });
    return { total: total, count: count };
  }

  function mensalSaldoFor(monthKey, upToDay){
    var exp = sumMonth(state.expenses, monthKey, upToDay);
    var inc = sumMonth(state.income, monthKey, upToDay);
    return inc.total - exp.total;
  }

  function sumDailyDay(monthKey, day){
    var total = 0, count = 0;
    state.daily.entries.forEach(function(row){
      if(row.monthKey !== monthKey || effectiveDay(row, monthKey) !== day) return;
      var v = row.amount;
      if(typeof v === 'number' && !isNaN(v)){ total += v; count++; }
    });
    return { total: total, count: count };
  }

  function recomputeDailyBalances(){
    var sorted = state.months.slice().sort();
    var carry = 0;
    sorted.forEach(function(mk, idx){
      var existing = state.daily.balances[mk];
      if(idx === 0){
        var initVal = (existing && typeof existing.initial === 'number') ? existing.initial : 0;
        state.daily.balances[mk] = { initial: initVal, manual: !!(existing && existing.manual) };
        carry = initVal;
      } else if(existing && existing.manual){
        carry = existing.initial;
      } else {
        var prevKey = sorted[idx-1];
        var prevFinal = carry - sumDailyMonth(prevKey).total;
        var thisInitial = prevFinal + mensalSaldoFor(prevKey);
        state.daily.balances[mk] = { initial: thisInitial, manual: false };
        carry = thisInitial;
      }
    });
  }

  function removeMonth(mk) {
    showConfirm("Tem certeza que deseja apagar o mês " + monthLabel(mk) + "?", { title: 'Apagar mês', confirmLabel: 'Apagar', danger: true }).then(function(ok){
      if(!ok) return;
      var idx = state.months.indexOf(mk);
      if (idx > -1) {
        state.months.splice(idx, 1);
        state.expenses.forEach(function(e) { delete e.values[mk]; if(e.paid) delete e.paid[mk]; });
        state.income.forEach(function(i) { delete i.values[mk]; });
        state.daily.entries = state.daily.entries.filter(function(row){ return row.monthKey !== mk; });
        delete state.daily.balances[mk];

        if (state.months.length === 0) {
          var todayKey = getTodayMonthKey();
          state.months.push(todayKey);
          state.selectedMonth = todayKey;
          state.selectedDiarioMonth = todayKey;
        } else {
          if (state.selectedMonth === mk) {
            state.selectedMonth = state.months[Math.max(0, idx - 1)];
          }
          if (state.selectedDiarioMonth === mk) {
            state.selectedDiarioMonth = state.months[Math.max(0, idx - 1)];
          }
        }
        persist();
        render();
        renderDiario();
      }
    });
  }

  function isInstallment(row){ return (row.instTotal || 1) > 1; }

  function monthHasRecurringValue(mk){
    var lists = [state.expenses, state.income];
    for(var l = 0; l < lists.length; l++){
      for(var i = 0; i < lists[l].length; i++){
        var row = lists[l][i];
        if(isInstallment(row) || isOnce(row)) continue;
        var v = row.values[mk];
        if(typeof v === 'number' && !isNaN(v)) return true;
      }
    }
    return false;
  }

  function findBaseMonth(newKey){
    var sorted = state.months.slice().sort();
    for(var i = sorted.length - 1; i >= 0; i--){
      if(sorted[i] < newKey && monthHasRecurringValue(sorted[i])) return sorted[i];
    }
    return null;
  }

  function copyMonthValues(fromKey, toKey){
    var copied = 0;
    [state.expenses, state.income].forEach(function(list){
      list.forEach(function(row){
        if(isInstallment(row) || isOnce(row)) return;
        var v = row.values[fromKey];
        if(typeof v === 'number' && !isNaN(v)){
          row.values[toKey] = v;
          copied++;
        }
      });
    });
    return copied;
  }

  function addNextMonth(){
    var sorted = state.months.slice().sort();
    var nk = nextMonthKey(sorted[sorted.length - 1]);
    if(state.months.indexOf(nk) !== -1) return null;
    var base = findBaseMonth(nk);
    state.months.push(nk);
    state.months.sort();
    if(base){
      var n = copyMonthValues(base, nk);
      if(n > 0){
        showToast('Valores de ' + monthLabel(base) + ' copiados para ' + monthLabel(nk) + '. Ajuste o que mudou.', 'info', 6000);
      }
    }
    return nk;
  }

  /* ---------- Render: Mensal ---------- */
  function render(){
    renderTabs();
    renderPanel();
    renderTable('expenses');
    renderTable('income');
  }

  function buildTabs(rowEl, selectedKey, onSelect, onAdd){
    rowEl.innerHTML = "";

    state.months.forEach(function(mk){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (mk === selectedKey ? ' active' : '');
      btn.title = monthLabel(mk);

      btn.appendChild(el('span', '', monthShort(mk)));

      var closeBtn = el('span', 'tab-close');
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Apagar mês';
      closeBtn.addEventListener('click', function(e){
        e.stopPropagation();
        removeMonth(mk);
      });
      btn.appendChild(closeBtn);

      btn.addEventListener('click', function(){ onSelect(mk); });
      rowEl.appendChild(btn);
    });

    var addBtn = el('button', 'tab-add', '+');
    addBtn.type = 'button';
    addBtn.title = 'Adicionar próximo mês';
    addBtn.addEventListener('click', onAdd);
    rowEl.appendChild(addBtn);
  }

  function renderTabs(){
    var row = document.getElementById('tabsRow');
    if(!row) return;
    buildTabs(row, state.selectedMonth, function(mk){
      state.selectedMonth = mk;
      render();
    }, function(){
      var nk = addNextMonth();
      if(nk){
        state.selectedMonth = nk;
        persist();
        render();
      }
    });
  }

  function renderPanel(){
    var mk = state.selectedMonth;
    var exp = sumMonth(state.expenses, mk);
    var inc = sumMonth(state.income, mk);
    var saldo = inc.total - exp.total;

    var elExp = document.getElementById('statDespesas');
    if(elExp) elExp.textContent = fmtMoney(exp.total);

    var elExpCount = document.getElementById('statDespesasCount');
    if(elExpCount) elExpCount.textContent = exp.count + (exp.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var elInc = document.getElementById('statReceitas');
    if(elInc) elInc.textContent = fmtMoney(inc.total);

    var elIncCount = document.getElementById('statReceitasCount');
    if(elIncCount) elIncCount.textContent = inc.count + (inc.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var saldoEl = document.getElementById('statSaldo');
    if(saldoEl) {
      saldoEl.textContent = fmtMoney(saldo);
      saldoEl.classList.toggle('pos', saldo >= 0);
      saldoEl.classList.toggle('neg', saldo < 0);
    }

    var elSub = document.getElementById('statSaldoSub');
    if(elSub) elSub.textContent = saldo >= 0 ? 'positivo' : 'negativo';

    var elExpHead = document.getElementById('expTotalHead');
    if(elExpHead) elExpHead.textContent = fmtMoney(exp.total);

    var elIncHead = document.getElementById('incTotalHead');
    if(elIncHead) elIncHead.textContent = fmtMoney(inc.total);
  }

  function dayValue(row){
    return (row.day === null || row.day === undefined || isNaN(row.day)) ? 999 : row.day;
  }

  /* Monta uma linha .entry-item (usada no Mensal e no Diário).
     cfg: { row, namePlaceholder, delTitle, dayValue, onName, onDay, onDelete,
            valueCents, onValue, tags (elemento opcional) } */
  function buildEntryItem(cfg){
    var item = el('div', 'entry-item');

    // Dia
    var badge = el('div', 'entry-day-badge');
    badge.appendChild(el('span', 'entry-day-label', 'DIA'));
    var dayInput = el('input', 'entry-day-input');
    dayInput.type = 'number';
    dayInput.min = 1; dayInput.max = 31;
    dayInput.placeholder = '—';
    dayInput.setAttribute('aria-label', 'Dia');
    dayInput.value = (cfg.dayValue === null || cfg.dayValue === undefined) ? '' : cfg.dayValue;
    dayInput.addEventListener('change', function(){
      var v = parseInt(dayInput.value, 10);
      cfg.onDay(isNaN(v) ? null : Math.max(1, Math.min(31, v)));
    });
    badge.appendChild(dayInput);
    item.appendChild(badge);

    // Nome + chips
    var main = el('div', 'entry-main');
    var nameInput = el('input', 'entry-name-input');
    nameInput.type = 'text';
    nameInput.placeholder = cfg.namePlaceholder;
    nameInput.setAttribute('aria-label', 'Descrição');
    nameInput.value = cfg.name || '';
    nameInput.addEventListener('change', function(){ cfg.onName(nameInput.value); });
    main.appendChild(nameInput);
    if(cfg.tags) main.appendChild(cfg.tags);
    item.appendChild(main);

    // Valor + lixeira
    var right = el('div', 'entry-right');
    var valWrap = el('div', 'entry-val-wrap');
    valWrap.appendChild(el('span', 'entry-val-symbol', 'R$'));
    var valInput = el('input', 'entry-val-input');
    valInput.type = 'text';
    valInput.setAttribute('inputmode', 'decimal');
    valInput.setAttribute('autocomplete', 'off');
    valInput.placeholder = '0,00';
    valInput.setAttribute('aria-label', 'Valor em reais');
    var curCents = (typeof cfg.valueCents === 'number' && !isNaN(cfg.valueCents)) ? cfg.valueCents : null;
    function sizeVal(){ valInput.style.width = (Math.max(valInput.value.length, 4) + 1) + 'ch'; }
    function showVal(){ valInput.value = (curCents === null) ? '' : fmtPlain(curCents); sizeVal(); }
    showVal();
    valInput.addEventListener('focus', function(){
      valInput.value = (curCents === null) ? '' : centsToEdit(curCents);
      sizeVal();
      setTimeout(function(){ try{ valInput.select(); }catch(e){} }, 0);
    });
    valInput.addEventListener('input', sizeVal);
    valInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); valInput.blur(); } });
    valInput.addEventListener('blur', function(){
      var txt = valInput.value.trim();
      if(txt === ((curCents === null) ? '' : centsToEdit(curCents))){ showVal(); return; }
      if(txt === ''){ curCents = null; showVal(); cfg.onValue(null); return; }
      var parsed = parseCentsText(txt);
      if(parsed === null){
        showToast('Valor inválido. Use o formato 18,50.', 'error');
        showVal();
        return;
      }
      curCents = parsed;
      showVal();
      cfg.onValue(parsed);
    });
    valWrap.appendChild(valInput);
    right.appendChild(valWrap);

    var delBtn = el('button', 'entry-del-btn');
    delBtn.type = 'button';
    delBtn.title = cfg.delTitle;
    delBtn.setAttribute('aria-label', cfg.delTitle);
    delBtn.innerHTML = TRASH_SVG;
    delBtn.addEventListener('click', cfg.onDelete);
    right.appendChild(delBtn);
    item.appendChild(right);

    return item;
  }

  /* Situação de pagamento de uma despesa no mês aberto:
     paid = marcada como paga; late = mês atual, dia já passou e não paga; open = a pagar.
     O "paga" fica em row.paid = { "AAAA-MM": true } (por mês, para itens recorrentes). */
  function paidStatus(row, mk){
    if(row.paid && row.paid[mk]) return 'paid';
    if(mk === getTodayMonthKey() && row.day !== null && row.day !== undefined && !isNaN(row.day)
       && effectiveDay(row, mk) < new Date().getDate()) return 'late';
    return 'open';
  }

  function buildPaidChip(row){
    var mk = state.selectedMonth;
    var st = paidStatus(row, mk);
    var label = st === 'paid' ? '✓ paga' : (st === 'late' ? 'atrasada' : 'a pagar');
    var chip = el('button', 'chip-badge chip-paid ' + st, label);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', st === 'paid' ? 'true' : 'false');
    chip.title = st === 'paid' ? 'Paga em ' + monthLabel(mk) + '. Toque para desmarcar.' : 'Toque para marcar como paga em ' + monthLabel(mk) + '.';
    chip.addEventListener('click', function(){
      if(!row.paid) row.paid = {};
      if(row.paid[mk]) delete row.paid[mk]; else row.paid[mk] = true;
      persist();
      renderTable('expenses');
    });
    return chip;
  }

  /* Tipos de item (mutuamente exclusivos):
     - recorrente (∞): copiado para os próximos meses; a caixa de parcelas fica escondida
     - parcelado: tem nº de parcelas > 1; o botão ∞ fica escondido
     - avulso: só no mês atual; mostra a caixa de parcelas e o ∞ (desmarcado) lado a lado */
  function buildTags(row, kind){
    var tags = el('div', 'entry-tags');

    if(kind === 'expenses'){
      var monthVal = row.values && row.values[state.selectedMonth];
      if(typeof monthVal === 'number' && !isNaN(monthVal)) tags.appendChild(buildPaidChip(row));
    }

    var instTotal = row.instTotal || 1;
    var instStart = row.instStart || state.selectedMonth;
    var currentDiff = getMonthDiff(instStart, state.selectedMonth);
    var parcelado = instTotal > 1;
    var avulso = isOnce(row);
    var recorrente = !parcelado && !avulso;

    // Parcelas: some quando o ∞ está definido
    if(!recorrente){
      var instChip = el('span', 'chip-badge' + (parcelado ? ' active' : ''));
      var instInput = el('input', 'chip-inst-input');
      instInput.type = 'number';
      instInput.min = 1;
      instInput.placeholder = '1';
      instInput.title = 'Número de parcelas (meses)';
      instInput.setAttribute('aria-label', 'Número de parcelas');
      instInput.value = parcelado ? instTotal : '';
      instInput.addEventListener('change', function(){
        var t = parseInt(instInput.value, 10);
        if(isNaN(t) || t < 1) t = 1;
        row.instTotal = t;
        if (t > 1) { delete row.once; delete row.onceMonth; }
        if (!row.instStart || t === 1) row.instStart = state.selectedMonth;

        if (t > 1) {
          var baseVal = row.values[row.instStart] !== undefined ? row.values[row.instStart] : row.values[state.selectedMonth];
          if (baseVal !== undefined) {
            for (var i = 0; i < t; i++) {
              var mk = addMonthsToKey(row.instStart, i);
              row.values[mk] = baseVal;
              if (state.months.indexOf(mk) === -1) state.months.push(mk);
            }
            state.months.sort();
          }
        }
        persist();
        render();
      });
      instChip.appendChild(instInput);
      instChip.appendChild(document.createTextNode(parcelado ? 'parcelas' : 'parcela'));
      tags.appendChild(instChip);

      if(parcelado){
        var status;
        if (currentDiff < 0) status = 'Futuro';
        else if (currentDiff >= instTotal) status = 'Fim';
        else status = (currentDiff + 1) + '/' + instTotal;
        tags.appendChild(el('span', 'chip-badge static', status));
      }
    }

    // ∞ recorrente: some quando há parcelas definidas
    if(!parcelado){
      var recur = el('button', 'chip-badge' + (recorrente ? ' active' : ''), '∞ recorrente');
      recur.type = 'button';
      recur.title = recorrente
        ? 'Recorrente: é copiado para os próximos meses. Toque para desmarcar (item avulso ou parcelado).'
        : 'Avulso: aparece só em ' + monthLabel(row.onceMonth || state.selectedMonth) + '. Toque para tornar recorrente.';
      recur.addEventListener('click', function(){
        if(isOnce(row)){
          delete row.once;
          delete row.onceMonth;
          showToast('Item recorrente: passa a ser copiado nos próximos meses.', 'info');
        } else {
          row.once = true;
          row.onceMonth = state.selectedMonth;
          showToast('Item avulso em ' + monthLabel(state.selectedMonth) + '. Se for parcelado, informe as parcelas.', 'info');
        }
        persist();
        render();
      });
      tags.appendChild(recur);
    }
    return tags;
  }

  function renderTable(kind){
    var rawList = kind === 'expenses' ? state.expenses : state.income;
    var container = document.getElementById(kind === 'expenses' ? 'expensesBody' : 'incomeBody');
    if(!container) return;
    container.innerHTML = "";

    var list = rawList.filter(function(r){
      if(isOnce(r) && r.onceMonth && r.onceMonth !== state.selectedMonth) return false;
      // Parcelados só aparecem nos meses em que estão ativos
      if(isInstallment(r) && !rowActiveIn(r, state.selectedMonth)) return false;
      return true;
    }).sort(function(a, b){ return dayValue(a) - dayValue(b); });

    if(list.length === 0){
      container.appendChild(el('div', 'empty-note', 'Nenhum item ainda.'));
      return;
    }

    list.forEach(function(row){
      container.appendChild(buildEntryItem({
        name: row.item,
        namePlaceholder: 'Nome do item',
        delTitle: 'Remover item',
        dayValue: row.day,
        valueCents: row.values[state.selectedMonth],
        tags: buildTags(row, kind),
        onName: function(v){
          row.item = v;
          persist();
        },
        onDay: function(v){
          row.day = v;
          persist();
          renderTable(kind);
        },
        onDelete: function(){
          var arr = kind === 'expenses' ? state.expenses : state.income;
          var idx = arr.indexOf(row);
          if(idx > -1) arr.splice(idx, 1);
          persist();
          render();
        },
        onValue: function(v){
          var t = row.instTotal || 1;
          var start = row.instStart || state.selectedMonth;

          if(v === null){
            delete row.values[state.selectedMonth];
            if (t > 1) {
              for (var i = 0; i < t; i++) { delete row.values[addMonthsToKey(start, i)]; }
            }
          } else {
            row.values[state.selectedMonth] = v;
            if (t > 1) {
              for (var j = 0; j < t; j++) {
                var mk = addMonthsToKey(start, j);
                row.values[mk] = v;
                if (state.months.indexOf(mk) === -1) state.months.push(mk);
              }
              state.months.sort();
              renderTabs();
            }
          }
          persist();
          renderPanel();
        }
      }));
    });
  }

  /* ---------- Render: Diário ---------- */
  function renderDiarioTabs(){
    var row = document.getElementById('diarioTabsRow');
    if(!row) return;
    buildTabs(row, getSelectedDiarioMonth(), function(mk){
      state.selectedDiarioMonth = mk;
      persist();
      renderDiario();
    }, function(){
      var nk = addNextMonth();
      if(nk){
        state.selectedDiarioMonth = nk;
        persist();
        renderDiario();
      }
    });
  }

  var saldoAtualCents = 0;

  function renderDiario(){
    var mk = getSelectedDiarioMonth();
    // a data visualizada sempre pertence ao mês selecionado nas abas
    if(diarioData.slice(0, 7) !== mk) diarioData = (mk === getTodayMonthKey()) ? todayISO() : mk + '-01';
    renderDiarioTabs();
    recomputeDailyBalances();

    var dateInput = document.getElementById('diarioDataInput');
    if(dateInput && document.activeElement !== dateInput) dateInput.value = diarioData;
    var btnHoje = document.getElementById('btnDiarioDiaHoje');
    if(btnHoje) btnHoje.classList.toggle('is-hoje', diarioData === todayISO());

    var exp = sumDailyMonth(mk);
    var initial = state.daily.balances[mk].initial;
    var cutoff = mensalCutoffDay(mk);

    var saldoAtual = initial + mensalSaldoFor(mk, cutoff) - exp.total;
    var projetado = initial + mensalSaldoFor(mk) - exp.total;

    var elExp = document.getElementById('diarioDespesas');
    if(elExp) elExp.textContent = fmtMoney(exp.total);

    var elExpCount = document.getElementById('diarioDespesasCount');
    if(elExpCount) elExpCount.textContent = exp.count + (exp.count===1?' item':' itens') + ' em ' + monthLabel(mk);

    var elHead = document.getElementById('diarioTotalHead');
    if(elHead) elHead.textContent = fmtMoney(sumDailyDay(mk, diarioDay()).total);

    var saldoInput = document.getElementById('diarioSaldoAtualInput');
    saldoAtualCents = saldoAtual;
    if(saldoInput && document.activeElement !== saldoInput){
      saldoInput.value = fmtMoney(saldoAtual);
    }
    if(saldoInput){
      saldoInput.classList.toggle('pos', saldoAtual >= 0);
      saldoInput.classList.toggle('neg', saldoAtual < 0);
    }

    var elAtualSub = document.getElementById('diarioSaldoAtualSub');
    if(elAtualSub){
      if(cutoff === 0) elAtualSub.textContent = 'ainda sem o Mensal deste mês';
      else if(cutoff >= 99) elAtualSub.textContent = 'inclui todo o Mensal do mês';
      else elAtualSub.textContent = 'inclui o Mensal até o dia ' + cutoff;
    }

    // primeiro passo pendente: destaca o cartão do saldo atual
    var cardSaldo = saldoInput ? saldoInput.closest('.stat-card') : null;
    var precisaSaldo = welcomePending();
    if(cardSaldo) cardSaldo.classList.toggle('needs-saldo', precisaSaldo);
    if(precisaSaldo && elAtualSub) elAtualSub.textContent = 'Toque aqui: informe seu saldo';

    var elFinal = document.getElementById('diarioSaldoFinal');
    if(elFinal){
      elFinal.textContent = fmtMoney(projetado);
      elFinal.classList.toggle('pos', projetado >= 0);
      elFinal.classList.toggle('neg', projetado < 0);
    }
    var elFinalSub = document.getElementById('diarioSaldoFinalSub');
    if(elFinalSub) elFinalSub.textContent = 'com todo o Mensal de ' + monthLabel(mk);

    renderAvisoBackup();
    renderBoasVindas();
    renderDiarioTable();
  }

  function renderDiarioTable(){
    var mk = getSelectedDiarioMonth();
    var container = document.getElementById('diarioBody');
    if(!container) return;
    container.innerHTML = "";

    var day = diarioDay();
    var list = state.daily.entries.filter(function(row){ return row.monthKey === mk && effectiveDay(row, mk) === day; });

    if(list.length === 0){
      container.appendChild(el('div', 'empty-note', 'Nenhum lançamento neste dia.'));
      return;
    }

    list.forEach(function(row){
      container.appendChild(buildEntryItem({
        name: row.item,
        namePlaceholder: 'Nome do gasto',
        delTitle: 'Remover lançamento',
        dayValue: row.day,
        valueCents: row.amount,
        onName: function(v){
          row.item = v;
          persist();
        },
        onDay: function(v){
          row.day = v;
          persist();
          renderDiarioTable();
        },
        onDelete: function(){
          var idx = state.daily.entries.indexOf(row);
          if(idx > -1) state.daily.entries.splice(idx, 1);
          persist();
          renderDiario();
        },
        onValue: function(v){
          row.amount = (v === null) ? undefined : v;
          persist();
          renderDiario();
        }
      }));
    });
  }

  function addDiarioRow(){
    var mk = getSelectedDiarioMonth();
    var id = 'd' + (state.daily.nextId++);
    state.daily.entries.push({ id: id, day: diarioDay(), item: '', amount: undefined, monthKey: mk });
    persist();
    renderDiario();
    focusLastName('diarioBody');
  }

  function focusLastName(bodyId){
    setTimeout(function(){
      var body = document.getElementById(bodyId);
      if(body){
        var inputs = body.querySelectorAll('.entry-name-input');
        if(inputs.length) inputs[inputs.length-1].focus();
      }
    }, 30);
  }

  var diarioDataInput = document.getElementById('diarioDataInput');
  if(diarioDataInput) diarioDataInput.addEventListener('change', function(e){ setDiarioData(e.target.value); });
  var btnDiaHoje = document.getElementById('btnDiarioDiaHoje');
  if(btnDiaHoje) btnDiaHoje.addEventListener('click', function(){ setDiarioData(todayISO()); });
  var btnDiaAnt = document.getElementById('btnDiarioDiaAnterior');
  if(btnDiaAnt) btnDiaAnt.addEventListener('click', function(){ setDiarioData(shiftDateISO(diarioData, -1)); });
  var btnDiaProx = document.getElementById('btnDiarioDiaProximo');
  if(btnDiaProx) btnDiaProx.addEventListener('click', function(){ setDiarioData(shiftDateISO(diarioData, 1)); });

  var btnAddDiario = document.getElementById('addDiarioBtn');
  if(btnAddDiario) btnAddDiario.addEventListener('click', addDiarioRow);

  /* ---------- Gasto rápido ---------- */
  var quickOverlay = document.getElementById('quickOverlay');
  var quickForm = document.getElementById('quickForm');
  var qValor = document.getElementById('qValor');
  var qItem = document.getElementById('qItem');
  var qDia = document.getElementById('qDia');

  function openQuick(){
    if(!quickOverlay || !state) return;
    var mk = getSelectedDiarioMonth();
    var lbl = document.getElementById('quickMonthLabel');
    if(lbl) lbl.textContent = 'Será lançado em ' + monthLabel(mk) + '.';
    if(qValor) qValor.value = '';
    if(qItem) qItem.value = '';
    if(qDia) qDia.value = diarioDay();
    quickOverlay.classList.add('open');
    setTimeout(function(){ if(qValor) qValor.focus(); }, 60);
  }
  function closeQuick(){ if(quickOverlay) quickOverlay.classList.remove('open'); }

  var fabQuick = document.getElementById('fabQuick');
  if(fabQuick) fabQuick.addEventListener('click', openQuick);
  var btnCloseQuick = document.getElementById('btnCloseQuick');
  if(btnCloseQuick) btnCloseQuick.addEventListener('click', closeQuick);
  if(quickOverlay) quickOverlay.addEventListener('click', function(e){ if(e.target === quickOverlay) closeQuick(); });

  if(quickForm){
    quickForm.addEventListener('submit', function(e){
      e.preventDefault();
      var cents = parseCentsText(qValor.value);
      if(cents === null || cents <= 0){
        showToast('Informe o valor do gasto.', 'error');
        qValor.focus();
        return;
      }
      var mk = getSelectedDiarioMonth();
      var day = parseInt(qDia.value, 10);
      if(isNaN(day)) day = diarioDay();
      day = Math.max(1, Math.min(lastDayOfMonth(mk), day));
      var id = 'd' + (state.daily.nextId++);
      state.daily.entries.push({ id: id, day: day, item: (qItem.value || '').trim(), amount: cents, monthKey: mk });
      persist();
      renderDiario();
      closeQuick();
      showToast('Gasto de ' + fmtMoney(cents) + ' lançado.', 'success', 2600);
    });
  }

  var diarioSaldoAtualInput = document.getElementById('diarioSaldoAtualInput');
  if(diarioSaldoAtualInput){
    var cardSaldoEl = diarioSaldoAtualInput.closest('.stat-card');
    if(cardSaldoEl) cardSaldoEl.addEventListener('click', function(e){
      if(e.target !== diarioSaldoAtualInput) diarioSaldoAtualInput.focus();
    });
    diarioSaldoAtualInput.addEventListener('focus', function(){
      diarioSaldoAtualInput.value = centsToEdit(saldoAtualCents);
      setTimeout(function(){ try{ diarioSaldoAtualInput.select(); }catch(e){} }, 0);
    });
    diarioSaldoAtualInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); diarioSaldoAtualInput.blur(); }
    });
    diarioSaldoAtualInput.addEventListener('blur', function(){
      var txt = diarioSaldoAtualInput.value.trim();
      // vazio ou igual ao atual: não altera nada
      if(txt === '' || txt === centsToEdit(saldoAtualCents)){
        diarioSaldoAtualInput.value = fmtMoney(saldoAtualCents);
        return;
      }
      var v = parseCentsText(txt);
      if(v === null){
        showToast('Valor inválido. Use o formato 1234,56.', 'error');
        diarioSaldoAtualInput.value = fmtMoney(saldoAtualCents);
        return;
      }
      var mk = getSelectedDiarioMonth();
      recomputeDailyBalances();
      var expTotal = sumDailyMonth(mk).total;
      var mensalCaido = mensalSaldoFor(mk, mensalCutoffDay(mk));
      state.daily.balances[mk] = { initial: v + expTotal - mensalCaido, manual: true };
      marcarBoasVindas();
      persist();
      renderDiario();
      diarioSaldoAtualInput.value = fmtMoney(saldoAtualCents);
    });
  }

  function addRow(kind){
    var list = kind === 'expenses' ? state.expenses : state.income;
    var id = (kind === 'expenses' ? 'e' : 'r') + (state.nextId++);
    list.push({ id:id, day:null, item:'', values:{}, instTotal: 1, instStart: state.selectedMonth });
    persist();
    render();
    focusLastName(kind === 'expenses' ? 'expensesBody' : 'incomeBody');
  }

  var btnAddExpense = document.getElementById('addExpenseBtn');
  if(btnAddExpense) btnAddExpense.addEventListener('click', function(){ addRow('expenses'); });

  var btnAddIncome = document.getElementById('addIncomeBtn');
  if(btnAddIncome) btnAddIncome.addEventListener('click', function(){ addRow('income'); });

  function marcarBoasVindas(){ lsSet(WELCOME_KEY, '1'); }

  function loadExample(){
    state = seedData();
    ensureCurrentMonthSelected();
    marcarBoasVindas();
    diarioData = todayISO();
    persist();
    render();
    renderDiario();
  }

  var btnReset = document.getElementById('resetBtn');
  if(btnReset) {
    btnReset.addEventListener('click', function(){
      showConfirm('Isso vai carregar os dados genéricos de exemplo. Deseja continuar?', { title: 'Carregar exemplo', confirmLabel: 'Carregar' }).then(function(ok){
        if(!ok) return;
        loadExample();
      });
    });
  }

  var btnClear = document.getElementById('clearBtn');
  if(btnClear) {
    btnClear.addEventListener('click', function(){
      showConfirm('Certeza de que deseja limpar todos os registros e começar um livro-caixa em branco?', { title: 'Limpar tudo', confirmLabel: 'Limpar', danger: true }).then(function(ok){
        if(!ok) return;
        state = emptyData();
        marcarBoasVindas();
        persist();
        render();
        renderDiario();
      });
    });
  }

  /* ---------- Navegação e Ajustes ---------- */
  var viewTriggers = document.querySelectorAll('.view-trigger');
  var viewMensal = document.getElementById('viewMensal');
  var viewDiario = document.getElementById('viewDiario');
  var viewAnual = document.getElementById('viewAnual');

  var configOverlay = document.getElementById('configOverlay');
  function daysSince(ts){
    var x = new Date(ts), y = new Date();
    x.setHours(0, 0, 0, 0); y.setHours(0, 0, 0, 0);
    return Math.round((y - x) / DAY_MS);
  }
  function renderBackupInfo(){
    var node = document.getElementById('backupInfo');
    if(!node) return;
    var ts = lsGetInt(BACKUP_KEY);
    var late = true, text = 'Nenhum backup feito ainda neste aparelho.';
    if(ts){
      var d = daysSince(ts);
      text = 'Último backup: ' + (d <= 0 ? 'hoje' : (d === 1 ? 'ontem' : 'há ' + d + ' dias'));
      late = d >= BACKUP_LATE_DAYS;
    }
    node.textContent = text;
    node.classList.toggle('atrasado', late);
  }
  function openConfig(){ renderBackupInfo(); if(configOverlay) configOverlay.classList.add('open'); }
  function closeConfig(){ if(configOverlay) configOverlay.classList.remove('open'); }
  var btnConfig = document.getElementById('btnConfig');
  if(btnConfig) btnConfig.addEventListener('click', openConfig);
  var btnCloseConfig = document.getElementById('btnCloseConfig');
  if(btnCloseConfig) btnCloseConfig.addEventListener('click', closeConfig);
  if(configOverlay){
    configOverlay.addEventListener('click', function(e){ if(e.target === configOverlay) closeConfig(); });
    ['resetBtn', 'clearBtn'].forEach(function(id){
      var b = document.getElementById(id);
      if(b) b.addEventListener('click', closeConfig);
    });
  }

  /* Fecha apenas a camada mais acima (confirmação > gasto rápido > ajustes).
     Devolve true se havia alguma camada aberta. Usado pelo Escape e pelo botão voltar. */
  function closeTopLayer(){
    if(modalOverlay && modalOverlay.classList.contains('open')){ closeModalWith(false); return true; }
    if(welcomeOverlay && welcomeOverlay.classList.contains('open')){ skipWelcome(); return true; }
    if(quickOverlay && quickOverlay.classList.contains('open')){ closeQuick(); return true; }
    if(configOverlay && configOverlay.classList.contains('open')){ closeConfig(); return true; }
    return false;
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeTopLayer();
  });

  /* Botão voltar do Android (@capacitor/app): fecha a camada de cima; depois vai ao Diário;
     já no Diário, sai do app. */
  var backButtonBound = false;
  function setupBackButton(){
    if(backButtonBound) return;
    var AppP = nativePlugin('App');
    if(!AppP || typeof AppP.addListener !== 'function') return;
    backButtonBound = true;
    try{
      var r = AppP.addListener('backButton', function(){
        if(closeTopLayer()) return;
        if(document.body.getAttribute('data-view') !== 'diario'){ showView('diario'); return; }
        if(typeof AppP.exitApp === 'function') AppP.exitApp();
      });
      if(r && typeof r.catch === 'function') r.catch(function(){});
    }catch(e){ backButtonBound = false; }
  }

  var pageTitle = document.getElementById('pageTitle');

  function showView(view){
    if(viewMensal) viewMensal.style.display = 'none';
    if(viewDiario) viewDiario.style.display = 'none';
    if(viewAnual) viewAnual.style.display = 'none';

    var topBar = document.querySelector('.top-bar');
    if (topBar) topBar.style.display = '';

    document.body.setAttribute('data-view', view);
    for(var vi = 0; vi < viewTriggers.length; vi++){ viewTriggers[vi].classList.remove('active'); }

    function activateTriggers(v){
      for(var i = 0; i < viewTriggers.length; i++){
        if(viewTriggers[i].getAttribute('data-view') === v) viewTriggers[i].classList.add('active');
      }
    }

    if(view === 'anual'){
      if(viewAnual) viewAnual.style.display = 'block';
      activateTriggers('anual');
      if(pageTitle) pageTitle.textContent = 'Resumo anual';
      renderAnual();
    } else if(view === 'diario'){
      if(viewDiario) viewDiario.style.display = 'block';
      activateTriggers('diario');
      if(pageTitle) pageTitle.textContent = 'Controle diário';
      renderDiario();
    } else {
      if(viewMensal) viewMensal.style.display = 'block';
      activateTriggers('mensal');
      if(pageTitle) pageTitle.textContent = 'Controle mensal';
      render();
    }
    closeConfig();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  for(var vt = 0; vt < viewTriggers.length; vt++){
    (function(btn){
      btn.addEventListener('click', function(){ showView(btn.getAttribute('data-view')); });
    })(viewTriggers[vt]);
  }

  /* ---------- Backup ---------- */
  var navExportBtns = document.querySelectorAll('.action-export');
  var navImportBtns = document.querySelectorAll('.action-import');
  var importFile = document.getElementById('importFile');

  function registrarBackup(){
    lsSet(BACKUP_KEY, Date.now());
    try{ localStorage.removeItem(BACKUP_SNOOZE_KEY); }catch(e){}
    renderBackupInfo();
    renderAvisoBackup();
  }

  function exportViaDownload(dataStr, name){
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 500);
    registrarBackup();
    showToast('Backup exportado.', 'success');
  }

  var exporting = false;
  function doExport(){
    if(exporting || !state) return;
    var dataStr;
    try{ dataStr = JSON.stringify(state, null, 2); }
    catch(err){ showToast('Não foi possível exportar os dados.', 'error'); return; }
    var name = 'saldo-backup-' + todayISO() + '.json';
    closeConfig();

    var FS = nativePlugin('Filesystem');
    var SH = nativePlugin('Share');
    if(isNativeApp() && FS && SH){
      // App Android: grava no cache e abre o menu de compartilhar (Drive, WhatsApp, e-mail...)
      exporting = true;
      FS.writeFile({ path: name, data: dataStr, directory: 'CACHE', encoding: 'utf8' })
        .then(function(res){
          return SH.share({ title: 'Backup do Saldo', text: 'Backup do Saldo', url: res.uri, dialogTitle: 'Salvar backup' });
        })
        .then(function(){
          // só conta como backup depois que o compartilhar conclui
          registrarBackup();
          showToast('Compartilhamento concluído. Confira se o arquivo foi salvo onde você escolheu.', 'success', 6000);
        })
        .catch(function(err){
          var msg = String((err && (err.message || err.errorMessage)) || err || '');
          if(/cancel/i.test(msg)) showToast('Backup cancelado. Nenhum arquivo foi salvo.', 'info');
          else showToast('Não foi possível exportar o backup.', 'error', 6000);
        })
        .then(function(){ exporting = false; });
      return;
    }

    try{ exportViaDownload(dataStr, name); }
    catch(err){ showToast('Não foi possível exportar os dados.', 'error'); }
  }
  for(var ei = 0; ei < navExportBtns.length; ei++){
    navExportBtns[ei].addEventListener('click', doExport);
  }

  if(navImportBtns.length && importFile) {
    for(var ii = 0; ii < navImportBtns.length; ii++){
      navImportBtns[ii].addEventListener('click', function(){
        importFile.value = '';
        importFile.click();
      });
    }

    importFile.addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        try{
          var parsed = JSON.parse(ev.target.result);
          var valid = parsed && Array.isArray(parsed.months) && Array.isArray(parsed.expenses) && Array.isArray(parsed.income);
          if(!valid){
            showToast('Arquivo inválido. Verifique se é um backup do Saldo.', 'error');
            return;
          }
          var migrated = migrateData(parsed);
          if(!migrated){
            showToast('Este backup é de uma versão mais nova do Saldo. Atualize o app para importá-lo.', 'error', 6000);
            return;
          }
          showConfirm('Isso vai substituir todos os dados atuais pelos dados do arquivo importado. Deseja continuar?', { title: 'Importar backup', confirmLabel: 'Importar', danger: true }).then(function(ok){
            if(!ok) return;
            state = migrated;
            ensureCurrentMonthSelected();
            marcarBoasVindas();
            persist();
            render();
            renderDiario();
            closeConfig();
          });
        }catch(err){
          showToast('Não foi possível ler o arquivo. Verifique se é um JSON válido.', 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  /* ---------- Lembrete de backup (topo do Diário) ---------- */
  function appIsEmpty(){
    return !state || (state.expenses.length === 0 && state.income.length === 0 && state.daily.entries.length === 0);
  }

  function renderAvisoBackup(){
    var box = document.getElementById('avisoBackup');
    if(!box) return;
    var msg = '';
    if(!appIsEmpty()){
      var snooze = lsGetInt(BACKUP_SNOOZE_KEY);
      if(!(snooze && Date.now() < snooze)){
        var last = lsGetInt(BACKUP_KEY);
        if(!last){
          msg = 'Você ainda não fez backup. Se desinstalar o app, os dados são perdidos.';
        } else {
          var d = daysSince(last);
          if(d >= BACKUP_LATE_DAYS) msg = 'Seu último backup foi há ' + d + ' dias.';
        }
      }
    }
    var txt = document.getElementById('avisoBackupText');
    if(txt) txt.textContent = msg;
    box.hidden = !msg;
  }

  var btnAvisoFazer = document.getElementById('avisoBackupFazer');
  if(btnAvisoFazer) btnAvisoFazer.addEventListener('click', doExport);
  var btnAvisoDepois = document.getElementById('avisoBackupDepois');
  if(btnAvisoDepois) btnAvisoDepois.addEventListener('click', function(){
    lsSet(BACKUP_SNOOZE_KEY, Date.now() + BACKUP_SNOOZE_DAYS * DAY_MS);
    renderAvisoBackup();
  });

  /* ---------- Boas-vindas (pop-up no primeiro uso, app vazio) ---------- */
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var welcomeForm = document.getElementById('welcomeForm');
  var wSaldo = document.getElementById('wSaldo');
  var welcomeSkipped = false; // "Pular por enquanto": vale só até fechar o app

  function welcomePending(){
    var done = false;
    try{ done = !!localStorage.getItem(WELCOME_KEY); }catch(e){}
    return !done && appIsEmpty();
  }

  function renderBoasVindas(){
    if(!welcomeOverlay) return;
    var show = welcomePending() && !welcomeSkipped;
    var open = welcomeOverlay.classList.contains('open');
    if(show && !open){
      if(wSaldo) wSaldo.value = '';
      welcomeOverlay.classList.add('open');
      setTimeout(function(){ if(wSaldo) wSaldo.focus(); }, 150);
    } else if(!show && open){
      welcomeOverlay.classList.remove('open');
    }
  }

  function skipWelcome(){
    welcomeSkipped = true;
    renderBoasVindas();
  }

  if(welcomeOverlay) welcomeOverlay.addEventListener('click', function(e){ if(e.target === welcomeOverlay) skipWelcome(); });
  var btnBoasPular = document.getElementById('boasPular');
  if(btnBoasPular) btnBoasPular.addEventListener('click', skipWelcome);
  var btnBoasExemplo = document.getElementById('boasExemplo');
  if(btnBoasExemplo) btnBoasExemplo.addEventListener('click', loadExample);
  var btnBoasBackup = document.getElementById('boasBackup');
  if(btnBoasBackup) btnBoasBackup.addEventListener('click', function(){
    if(importFile){ importFile.value = ''; importFile.click(); }
  });

  if(wSaldo){
    wSaldo.addEventListener('focus', function(){
      var c = parseCentsText(wSaldo.value);
      if(c !== null) wSaldo.value = centsToEdit(c);
      setTimeout(function(){ try{ wSaldo.select(); }catch(e){} }, 0);
    });
    wSaldo.addEventListener('blur', function(){
      var c = parseCentsText(wSaldo.value);
      if(c !== null) wSaldo.value = fmtPlain(c);
    });
  }

  if(welcomeForm){
    welcomeForm.addEventListener('submit', function(e){
      e.preventDefault();
      var cents = parseCentsText(wSaldo.value);
      if(cents === null){
        showToast('Informe seu saldo atual. Se for zero, digite 0.', 'error');
        wSaldo.focus();
        return;
      }
      var mk = getSelectedDiarioMonth();
      recomputeDailyBalances();
      var expTotal = sumDailyMonth(mk).total;
      var mensalCaido = mensalSaldoFor(mk, mensalCutoffDay(mk));
      var primeiro = state.months.slice().sort()[0] === mk;
      state.daily.balances[mk] = { initial: cents + expTotal - mensalCaido, manual: !primeiro };
      marcarBoasVindas();
      persist();
      renderDiario();
      showToast('Saldo registrado: ' + fmtMoney(cents) + '. Agora lance seus gastos no + ou cadastre as contas no Mensal.', 'success', 6000);
    });
  }

  /* ---------- Render: Anual ---------- */
  function renderAnual(){
    var container = document.getElementById('anualYears');
    if(!container) return;
    container.innerHTML = "";

    var years = [];
    state.months.forEach(function(mk){
      var y = mk.slice(0,4);
      if(years.indexOf(y) === -1) years.push(y);
    });
    years.sort();

    if(years.length === 0){
      container.innerHTML = '<div class="anual-empty">Nenhum mês cadastrado ainda.</div>';
    }

    var geralDespesas = 0, geralReceitas = 0;

    // ano selecionado: mantém o atual; se não existir, usa o ano corrente (ou o último)
    if(years.indexOf(anualSelected) === -1){
      var thisYear = String(new Date().getFullYear());
      anualSelected = years.indexOf(thisYear) !== -1 ? thisYear : years[years.length - 1];
    }
    renderAnualTabs(years);
    bindAnualCarousel();

    years.forEach(function(year){
      var monthsInYear = state.months.filter(function(mk){ return mk.slice(0,4) === year; });

      var expItems = sumItemsByYear(state.expenses, monthsInYear);
      var incItems = sumItemsByYear(state.income, monthsInYear);
      var expTotal = expItems.reduce(function(s,i){ return s+i.total; }, 0);
      var incTotal = incItems.reduce(function(s,i){ return s+i.total; }, 0);
      var saldo = incTotal - expTotal;

      geralDespesas += expTotal;
      geralReceitas += incTotal;

      var card = document.createElement('div');
      card.className = 'year-card';

      var head = document.createElement('div');
      head.className = 'year-head';
      head.innerHTML =
        '<h3 class="year-title"><span class="book-icon" aria-hidden="true">' + CAL_SVG + '</span>' + year + '</h3>' +
        '<span class="year-saldo ' + (saldo >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(saldo) + '</span>';
      card.appendChild(head);

      var stats = document.createElement('div');
      stats.className = 'year-stats';
      stats.innerHTML =
        '<div class="year-stat despesas"><p class="stat-label">Despesas</p><p class="stat-value">' + fmtMoney(expTotal) + '</p></div>' +
        '<div class="year-stat receitas"><p class="stat-label">Receitas</p><p class="stat-value">' + fmtMoney(incTotal) + '</p></div>';
      card.appendChild(stats);
      card.appendChild(buildYearChart(year, monthsInYear));

      var breakdown = document.createElement('div');
      breakdown.className = 'year-breakdown';
      breakdown.appendChild(buildBreakdownCol('Despesas por item', expItems));
      breakdown.appendChild(buildBreakdownCol('Receitas por item', incItems));
      card.appendChild(breakdown);

      card.setAttribute('data-year', year);
      container.appendChild(card);
    });

    alignCarousel(false);

    var geralSaldo = geralReceitas - geralDespesas;
    var elGeralExp = document.getElementById('geralDespesas');
    if(elGeralExp) elGeralExp.textContent = fmtMoney(geralDespesas);

    var elGeralInc = document.getElementById('geralReceitas');
    if(elGeralInc) elGeralInc.textContent = fmtMoney(geralReceitas);

    var gsEl = document.getElementById('geralSaldo');
    if(gsEl) {
      gsEl.textContent = fmtMoney(geralSaldo);
      gsEl.classList.toggle('pos', geralSaldo >= 0);
      gsEl.classList.toggle('neg', geralSaldo < 0);
    }

    var elGeralSub = document.getElementById('geralSaldoSub');
    if(elGeralSub) elGeralSub.textContent = years.length ? (years[0] + (years.length>1 ? ' – ' + years[years.length-1] : '')) : ' ';
  }

  /* ---------- Carrossel de anos ---------- */
  var anualSelected = null;
  var anualBound = false;
  var anualLock = false;
  var anualLockTimer = null;
  var anualRaf = 0;

  function anualCards(){
    var c = document.getElementById('anualYears');
    return c ? c.querySelectorAll('.year-card') : [];
  }

  function renderAnualTabs(years){
    var row = document.getElementById('anualTabs');
    if(!row) return;
    row.innerHTML = '';
    years.forEach(function(y){
      var btn = el('button', 'tab' + (y === anualSelected ? ' active' : ''), y);
      btn.type = 'button';
      btn.setAttribute('data-year', y);
      btn.addEventListener('click', function(){
        anualSelected = y;
        updateAnualTabs();
        alignCarousel(true);
      });
      row.appendChild(btn);
    });
  }

  function updateAnualTabs(){
    var row = document.getElementById('anualTabs');
    if(!row) return;
    var tabs = row.querySelectorAll('.tab');
    for(var i = 0; i < tabs.length; i++){
      var on = tabs[i].getAttribute('data-year') === anualSelected;
      tabs[i].classList.toggle('active', on);
      if(on){ try{ tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }catch(e){} }
    }
  }

  function alignCarousel(smooth){
    var c = document.getElementById('anualYears');
    if(!c || !c.offsetWidth) return;
    var cards = anualCards();
    for(var i = 0; i < cards.length; i++){
      if(cards[i].getAttribute('data-year') === anualSelected){
        if(smooth){
          // enquanto a rolagem animada acontece, ela não troca o ano selecionado
          anualLock = true;
          clearTimeout(anualLockTimer);
          anualLockTimer = setTimeout(function(){ anualLock = false; }, 600);
        }
        c.scrollTo({ left: cards[i].offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
        return;
      }
    }
  }

  function onAnualScroll(){
    if(anualLock) return;
    cancelAnimationFrame(anualRaf);
    anualRaf = requestAnimationFrame(function(){
      var c = document.getElementById('anualYears');
      var cards = anualCards();
      if(!c || !cards.length) return;
      var best = null, bestDist = Infinity;
      for(var i = 0; i < cards.length; i++){
        var d = Math.abs(cards[i].offsetLeft - c.scrollLeft);
        if(d < bestDist){ bestDist = d; best = cards[i].getAttribute('data-year'); }
      }
      if(best && best !== anualSelected){
        anualSelected = best;
        updateAnualTabs();
      }
    });
  }

  function bindAnualCarousel(){
    if(anualBound) return;
    var c = document.getElementById('anualYears');
    if(!c) return;
    c.addEventListener('scroll', onAnualScroll, { passive: true });
    window.addEventListener('resize', function(){ alignCarousel(false); });
    anualBound = true;
  }

  function fmtCompact(cents){
    var v = Math.abs(cents) / 100;
    if(v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' mil';
    return String(Math.round(v));
  }

  function buildYearChart(year, monthsInYear){
    var wrap = document.createElement('div');
    wrap.className = 'year-chart';

    var data = [], max = 0;
    for(var m = 1; m <= 12; m++){
      var mk = year + '-' + (m < 10 ? '0' + m : '' + m);
      var has = monthsInYear.indexOf(mk) !== -1;
      var d = {
        label: MONTH_NAMES[m-1].slice(0,3),
        full: MONTH_NAMES[m-1],
        has: has,
        inc: has ? sumMonth(state.income, mk).total : 0,
        exp: has ? sumMonth(state.expenses, mk).total : 0
      };
      max = Math.max(max, d.inc, d.exp);
      data.push(d);
    }

    if(max <= 0){
      wrap.innerHTML = '<p class="year-breakdown-empty">sem valores neste ano</p>';
      return wrap;
    }

    var W = 360, H = 190, padL = 38, padR = 6, padT = 10, padB = 22;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var slot = plotW / 12, barW = 9, gap = 2;
    var groupW = barW * 2 + gap, offset = (slot - groupW) / 2;
    var baseY = padT + plotH;

    function barH(v){
      if(v <= 0) return 0;
      return Math.max(1, (v / max) * plotH);
    }
    function f(n){ return n.toFixed(1); }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Receitas e despesas por mês em ' + year + '" xmlns="http://www.w3.org/2000/svg">';

    [0, 0.5, 1].forEach(function(frac){
      var y = baseY - frac * plotH;
      svg += '<line class="' + (frac === 0 ? 'yc-base' : 'yc-grid') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f(y) + '" y2="' + f(y) + '"/>';
      svg += '<text class="yc-label" x="' + (padL - 4) + '" y="' + f(y + 3) + '" text-anchor="end">' + fmtCompact(max * frac) + '</text>';
    });

    data.forEach(function(d, i){
      var x0 = padL + i * slot + offset;
      var hi = barH(d.inc), he = barH(d.exp);
      var tip = escapeHtml(d.full + ': receitas ' + fmtMoney(d.inc) + ' · despesas ' + fmtMoney(d.exp));
      if(hi > 0) svg += '<rect class="yc-inc" x="' + f(x0) + '" y="' + f(baseY - hi) + '" width="' + barW + '" height="' + f(hi) + '" rx="2"><title>' + tip + '</title></rect>';
      if(he > 0) svg += '<rect class="yc-exp" x="' + f(x0 + barW + gap) + '" y="' + f(baseY - he) + '" width="' + barW + '" height="' + f(he) + '" rx="2"><title>' + tip + '</title></rect>';
      svg += '<text class="yc-label' + (d.has ? '' : ' dim') + '" x="' + f(padL + i * slot + slot / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + d.label + '</text>';
    });
    svg += '</svg>';

    wrap.innerHTML = svg +
      '<div class="year-legend"><span><i class="yc-inc"></i>Receitas</span><span><i class="yc-exp"></i>Despesas</span></div>';
    return wrap;
  }

  function sumItemsByYear(list, monthsInYear){
    var out = [];
    list.forEach(function(row){
      var total = 0;
      monthsInYear.forEach(function(mk){
        if(!rowActiveIn(row, mk)) return;
        var v = row.values[mk];
        if(typeof v === 'number' && !isNaN(v)) total += v;
      });
      if(total !== 0){
        out.push({ item: row.item || '(sem nome)', total: total });
      }
    });
    out.sort(function(a,b){ return b.total - a.total; });
    return out;
  }

  function buildBreakdownCol(title, items){
    var col = document.createElement('div');
    col.className = 'year-breakdown-col';
    var h = document.createElement('p');
    h.className = 'year-breakdown-title';
    h.textContent = title;
    col.appendChild(h);
    if(items.length === 0){
      var empty = document.createElement('p');
      empty.className = 'year-breakdown-empty';
      empty.textContent = 'sem valores neste ano';
      col.appendChild(empty);
    } else {
      items.forEach(function(it){
        var row = document.createElement('div');
        row.className = 'year-item-row';
        row.innerHTML = '<span class="yi-name">' + escapeHtml(it.item) + '</span><span class="yi-val">' + fmtMoney(it.total) + '</span>';
        col.appendChild(row);
      });
    }
    return col;
  }

  function escapeHtml(str){
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- Avisos de vencimento (notificacoes.js) ---------- */
  var notifStarted = false;

  /* Botão "Marcar como paga" da notificação: items = [{ r: idDoItem, m: 'AAAA-MM' }] */
  function markPaidFromNotification(items){
    var n = 0;
    items.forEach(function(it){
      if(!it || !it.m) return;
      var row = null;
      for(var i = 0; i < state.expenses.length; i++){
        if(state.expenses[i].id === it.r){ row = state.expenses[i]; break; }
      }
      if(!row) return;
      if(!row.paid) row.paid = {};
      if(!row.paid[it.m]){ row.paid[it.m] = true; n++; }
    });
    if(n) persist();
    return n;
  }

  /* Toque na notificação: abre o Mensal no mês do vencimento */
  function openMonthFromNotification(mk){
    if(mk && state.months.indexOf(mk) !== -1){ state.selectedMonth = mk; persist(); }
    showView('mensal');
  }

  function startNotifications(){
    if(notifStarted || !window.SaldoNotif) return;
    notifStarted = true;
    window.SaldoNotif.init({
      getState: function(){ return state; },
      rowActiveIn: rowActiveIn,
      effectiveDay: effectiveDay,
      addMonthsToKey: addMonthsToKey,
      fmtMoney: fmtMoney,
      showToast: showToast,
      markPaid: markPaidFromNotification,
      openMonth: openMonthFromNotification
    });
  }

  /* ---------- Início ---------- */
  function init(){
    try{ ['saldo_token','saldo_user_name','saldo_user_first_name','saldo_pending_sync'].forEach(function(k){ localStorage.removeItem(k); }); }catch(e){}

    var invalidSaved = false;
    setupBackButton();

    storageGet(STORAGE_KEY).then(function(value){
      state = null;
      if(value){
        var parsed = null;
        try{ parsed = JSON.parse(value); }catch(e){}
        var looksValid = parsed && Array.isArray(parsed.months) && Array.isArray(parsed.expenses) && Array.isArray(parsed.income);
        if(looksValid) state = migrateData(parsed);
        if(!state){
          storageSet(INVALID_KEY, value);
          invalidSaved = true;
        }
      }
      if(!state) state = emptyData();
      ensureCurrentMonthSelected();
      persist();
      showView('diario');
      startNotifications();
      if(invalidSaved) showToast('Não foi possível ler os dados salvos. Uma cópia foi guardada e o app abriu vazio.', 'error', 7000);
    }).catch(function(){
      state = emptyData();
      ensureCurrentMonthSelected();
      showView('diario');
      startNotifications();
    });
  }

  init();
})();