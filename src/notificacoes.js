/* =========================================================
   Saldo — avisos de vencimento (notificações locais)

   Usa @capacitor/local-notifications (somente no app Android).
   Tudo é calculado no aparelho, sem servidor:
   - lê as despesas (e, se ligado, as receitas) do Mensal;
   - agenda só os próximos 45 dias e reagenda quando os dados mudam;
   - um aviso por data de vencimento e antecedência (agrupa contas do mesmo dia);
   - despesa marcada como paga no mês não gera aviso.

   Preferências ficam em localStorage (saldo_notif_cfg) e NÃO entram no backup.
   ========================================================= */
(function(){
  "use strict";

  var CFG_KEY = 'saldo_notif_cfg';
  var CHANNEL_ID = 'vencimentos';
  var SMALL_ICON = 'ic_stat_saldo';          /* android/app/src/main/res/drawable/ic_stat_saldo.xml */
  var ICON_COLOR = '#FFC93C';
  var WINDOW_DAYS = 45;
  var MAX_SCHEDULED = 200;
  var LEAD_OPTIONS = [0, 1, 3];              /* dias de antecedência disponíveis */
  var DAY_MS = 86400000;
  var TEST_ID = 2147483001;                  /* fora da faixa dos ids calculados */
  var ACTION_ONE = 'venc_um';
  var ACTION_MANY = 'venc_varios';
  var ACTION_PAY = 'pagar';

  var api = null;
  var cfg = loadCfg();
  var chain = Promise.resolve();
  var refreshTimer = null;
  var lastSig = null;
  var lastPlan = [];
  var lastError = false;
  var permState = 'unknown';                 /* granted | denied | prompt | unavailable */
  var setupDone = false;
  var listenersBound = false;
  var ui = null;

  /* ---------- Preferências ---------- */
  function loadCfg(){
    var c = { on: false, leads: [0, 1], time: '09:00', income: false };
    try{
      var raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if(raw && typeof raw === 'object'){
        c.on = raw.on === true;
        c.income = raw.income === true;
        if(Array.isArray(raw.leads)){
          var ls = raw.leads.filter(function(n){ return LEAD_OPTIONS.indexOf(n) !== -1; });
          if(ls.length) c.leads = ls;
        }
        if(typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) c.time = raw.time;
      }
    }catch(e){}
    return c;
  }
  function saveCfg(){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){} }

  /* ---------- Plugin ---------- */
  function plugin(){
    try{
      var cap = window.Capacitor;
      if(!cap) return null;
      if(typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) return null;
      return (cap.Plugins && cap.Plugins.LocalNotifications) || null;
    }catch(e){ return null; }
  }

  function checkPerm(LN){
    return LN.checkPermissions().then(function(r){
      var d = r && r.display;
      permState = d === 'granted' ? 'granted' : (d === 'denied' ? 'denied' : 'prompt');
      return permState;
    }).catch(function(){ permState = 'unavailable'; return permState; });
  }

  function askPerm(LN){
    return checkPerm(LN).then(function(p){
      if(p === 'granted' || p === 'unavailable') return p;
      return LN.requestPermissions().then(function(r){
        permState = (r && r.display === 'granted') ? 'granted' : 'denied';
        return permState;
      });
    }).catch(function(){ permState = 'denied'; return permState; });
  }

  /* Canal e ações (idempotente; roda uma vez por sessão) */
  function ensureSetup(LN){
    if(setupDone) return Promise.resolve();
    var steps = [];
    try{
      steps.push(LN.createChannel({
        id: CHANNEL_ID, name: 'Vencimentos',
        description: 'Avisos de contas e receitas do controle Mensal',
        importance: 4, visibility: 1, vibration: true, lights: true, lightColor: ICON_COLOR
      }));
    }catch(e){}
    try{
      steps.push(LN.registerActionTypes({ types: [
        { id: ACTION_ONE,  actions: [{ id: ACTION_PAY, title: 'Marcar como paga' }] },
        { id: ACTION_MANY, actions: [{ id: ACTION_PAY, title: 'Marcar todas como pagas' }] }
      ]}));
    }catch(e){}
    return Promise.all(steps).then(function(){ setupDone = true; }).catch(function(){ setupDone = true; });
  }

  function cancelAll(LN){
    return LN.getPending().then(function(res){
      var list = (res && res.notifications) || [];
      if(!list.length) return;
      return LN.cancel({ notifications: list.map(function(n){ return { id: n.id }; }) });
    });
  }

  /* ---------- Cálculo do que agendar ---------- */
  function pad2(n){ return n < 10 ? '0' + n : '' + n; }
  function monthKeyOf(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }

  function hashId(str){
    var h = 5381;
    for(var i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
    h = Math.abs(h) % 2147483000;
    return h || 1;
  }

  function whenText(lead){
    if(lead === 0) return 'hoje';
    if(lead === 1) return 'amanhã';
    return 'em ' + lead + ' dias';
  }

  function nameOf(it){ return (it.name && String(it.name).trim()) || 'Item sem nome'; }

  function buildPlan(now){
    var st = api && api.getState();
    if(!st || !cfg.leads.length) return [];
    var hm = cfg.time.split(':');
    var hh = parseInt(hm[0], 10), mm = parseInt(hm[1], 10);
    var nowMs = now.getTime();
    var limit = nowMs + WINDOW_DAYS * DAY_MS;
    var baseKey = monthKeyOf(now);
    var groups = {}, keys = [];

    function collect(kind, list, mk){
      var p = mk.split('-');
      var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
      list.forEach(function(row){
        if(!api.rowActiveIn(row, mk)) return;
        var v = row.values && row.values[mk];
        if(typeof v !== 'number' || isNaN(v) || v <= 0) return;                    /* sem valor */
        if(row.day === null || row.day === undefined || isNaN(row.day)) return;    /* sem dia: sem vencimento */
        if(kind === 'expenses' && row.paid && row.paid[mk]) return;                /* já paga */
        var day = api.effectiveDay(row, mk);
        cfg.leads.forEach(function(lead){
          var fire = new Date(y, m - 1, day - lead, hh, mm, 0, 0);
          var t = fire.getTime();
          if(t <= nowMs + 5000 || t > limit) return;
          var dueISO = y + '-' + pad2(m) + '-' + pad2(day);
          var key = kind + '|' + dueISO + '|' + lead;
          var g = groups[key];
          if(!g){
            g = groups[key] = { key: key, kind: kind, lead: lead, fire: fire, monthKey: mk, items: [], total: 0 };
            keys.push(key);
          }
          g.items.push({ r: row.id, name: row.item, cents: v });
          g.total += v;
        });
      });
    }

    for(var i = 0; i < 3; i++){
      var mk = api.addMonthsToKey(baseKey, i);
      collect('expenses', st.expenses || [], mk);
      if(cfg.income) collect('income', st.income || [], mk);
    }

    var list = keys.map(function(k){ return groups[k]; });
    list.sort(function(a, b){ return a.fire.getTime() - b.fire.getTime() || (a.key < b.key ? -1 : 1); });
    if(list.length > MAX_SCHEDULED) list = list.slice(0, MAX_SCHEDULED);

    var used = {};
    return list.map(function(g){
      var id = hashId(g.key);
      while(used[id]) id = (id + 1) % 2147483000 || 1;
      used[id] = true;
      return toNotification(g, id);
    });
  }

  function toNotification(g, id){
    var n = g.items.length, w = whenText(g.lead);
    var isExp = g.kind === 'expenses';
    var title, body, large;

    if(isExp) title = n === 1 ? 'Conta vence ' + w : n + ' contas vencem ' + w;
    else title = n === 1 ? 'Receita prevista ' + w : n + ' receitas previstas ' + w;

    if(n === 1){
      body = nameOf(g.items[0]) + ': ' + api.fmtMoney(g.items[0].cents);
    } else {
      body = api.fmtMoney(g.total) + ' no total: ' + g.items.map(nameOf).join(', ');
      large = g.items.map(function(it){ return nameOf(it) + ': ' + api.fmtMoney(it.cents); }).join('\n')
            + '\nTotal: ' + api.fmtMoney(g.total);
    }

    var notif = {
      id: id,
      title: title,
      body: body,
      schedule: { at: g.fire, allowWhileIdle: true },
      channelId: CHANNEL_ID,
      smallIcon: SMALL_ICON,
      iconColor: ICON_COLOR,
      extra: {
        kind: g.kind,
        monthKey: g.monthKey,
        items: g.items.map(function(it){ return { r: it.r, m: g.monthKey }; })
      }
    };
    if(large) notif.largeBody = large;
    if(isExp) notif.actionTypeId = n > 1 ? ACTION_MANY : ACTION_ONE;
    return notif;
  }

  /* ---------- Agendamento (em fila, sem execuções simultâneas) ---------- */
  function runReschedule(force){
    var LN = plugin();
    if(!LN || !api) return Promise.resolve();

    if(!cfg.on){
      lastSig = null; lastPlan = []; lastError = false;
      return cancelAll(LN).then(updateUI);
    }

    return checkPerm(LN).then(function(p){
      if(p !== 'granted'){ lastSig = null; lastPlan = []; updateUI(); return; }

      var plan = buildPlan(new Date());
      var sig = JSON.stringify(plan.map(function(n){ return [n.id, n.schedule.at.getTime(), n.title, n.body]; }));
      if(!force && sig === lastSig && !lastError){ updateUI(); return; }

      return ensureSetup(LN)
        .then(function(){ return cancelAll(LN); })
        .then(function(){ return plan.length ? LN.schedule({ notifications: plan }) : null; })
        .then(function(){ lastSig = sig; lastPlan = plan; lastError = false; updateUI(); });
    });
  }

  function reschedule(force){
    chain = chain.then(function(){ return runReschedule(force); }).catch(function(err){
      console.error('Erro ao agendar avisos:', err);
      lastSig = null; lastError = true;
      try{ updateUI(); }catch(e){}
    });
    return chain;
  }

  /* Chamado a cada gravação dos dados: espera um pouco e só reagenda se o plano mudou */
  function refresh(){
    if(!cfg.on || !plugin()) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function(){ reschedule(false); }, 1200);
  }

  /* ---------- Toque na notificação / botão de ação ---------- */
  function onAction(ev){
    if(!api) return;
    var extra = (ev && ev.notification && ev.notification.extra) || {};
    if(ev && ev.actionId === ACTION_PAY && Array.isArray(extra.items)){
      var n = api.markPaid(extra.items);
      if(n) api.showToast(n === 1 ? 'Conta marcada como paga.' : n + ' contas marcadas como pagas.', 'success');
    }
    api.openMonth(extra.monthKey);
  }

  function bindListeners(LN){
    if(listenersBound) return;
    listenersBound = true;
    try{
      var h = LN.addListener('localNotificationActionPerformed', onAction);
      if(h && typeof h.catch === 'function') h.catch(function(){});
    }catch(e){}
  }

  /* ---------- Tela de Ajustes ---------- */
  function q(id){ return document.getElementById(id); }

  function fmtNext(plan){
    if(!plan.length) return '';
    var d = plan[0].schedule.at;
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' às ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function updateUI(){
    if(!ui) return;
    var native = !!plugin();
    ui.on.disabled = !native;
    ui.on.checked = native && cfg.on;
    ui.time.value = cfg.time;
    ui.income.checked = cfg.income;
    for(var i = 0; i < ui.leads.length; i++){
      ui.leads[i].checked = cfg.leads.indexOf(parseInt(ui.leads[i].value, 10)) !== -1;
    }

    var blocked = native && cfg.on && permState === 'denied';
    ui.options.hidden = !(native && cfg.on && !blocked);
    ui.denied.hidden = !blocked;

    var status;
    if(!native) status = 'Disponível só no app Android.';
    else if(!cfg.on) status = 'Desligado.';
    else if(blocked) status = 'Bloqueado pelo Android.';
    else if(lastError) status = 'Não foi possível agendar os avisos. Tente de novo.';
    else if(lastPlan.length) status = lastPlan.length + (lastPlan.length === 1 ? ' aviso agendado' : ' avisos agendados') + '. Próximo: ' + fmtNext(lastPlan) + '.';
    else status = 'Nenhum vencimento com dia e valor nos próximos ' + WINDOW_DAYS + ' dias.';
    ui.status.textContent = status;
  }

  function bindUI(){
    ui = {
      on: q('notifOn'), options: q('notifOptions'), status: q('notifStatus'), denied: q('notifDenied'),
      time: q('notifTime'), income: q('notifIncome'), test: q('notifTest'),
      leads: document.querySelectorAll('#notifLeads input')
    };
    if(!ui.on || !ui.options || !ui.status || !ui.denied || !ui.time || !ui.income){ ui = null; return; }

    ui.on.addEventListener('change', function(){
      var LN = plugin();
      if(!LN){ ui.on.checked = false; return; }
      if(ui.on.checked){
        askPerm(LN).then(function(p){
          if(p === 'granted'){
            cfg.on = true; saveCfg();
            reschedule(true).then(function(){
              if(api && !lastError) api.showToast(lastPlan.length ? 'Avisos ligados.' : 'Avisos ligados. Nenhum vencimento nos próximos ' + WINDOW_DAYS + ' dias.', 'success');
            });
          } else {
            cfg.on = false; saveCfg();
            updateUI();
            if(api) api.showToast('Permita as notificações do Saldo nas configurações do Android.', 'error', 6000);
          }
        });
      } else {
        cfg.on = false; saveCfg();
        reschedule(true);
        if(api) api.showToast('Avisos desligados.', 'info', 2200);
      }
    });

    for(var i = 0; i < ui.leads.length; i++){
      ui.leads[i].addEventListener('change', function(){
        var chosen = [];
        for(var j = 0; j < ui.leads.length; j++){
          if(ui.leads[j].checked) chosen.push(parseInt(ui.leads[j].value, 10));
        }
        if(!chosen.length){
          if(api) api.showToast('Mantenha pelo menos uma antecedência.', 'error', 2600);
          updateUI();
          return;
        }
        cfg.leads = chosen; saveCfg();
        reschedule(true);
      });
    }

    ui.time.addEventListener('change', function(){
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(ui.time.value)){ ui.time.value = cfg.time; return; }
      cfg.time = ui.time.value; saveCfg();
      reschedule(true);
    });

    ui.income.addEventListener('change', function(){
      cfg.income = ui.income.checked; saveCfg();
      reschedule(true);
    });

    if(ui.test){
      ui.test.addEventListener('click', function(){
        var LN = plugin();
        if(!LN) return;
        askPerm(LN).then(function(p){
          if(p !== 'granted'){
            updateUI();
            if(api) api.showToast('Permita as notificações nas configurações do Android.', 'error', 6000);
            return;
          }
          return ensureSetup(LN).then(function(){
            /* sem "schedule": a notificação aparece na hora */
            return LN.schedule({ notifications: [{
              id: TEST_ID, title: 'Saldo',
              body: 'Os avisos de vencimento estão funcionando.',
              channelId: CHANNEL_ID, smallIcon: SMALL_ICON, iconColor: ICON_COLOR
            }]});
          }).then(function(){
            if(api) api.showToast('Aviso de teste enviado. Veja a barra de notificações.', 'success', 3000);
          });
        }).catch(function(){ if(api) api.showToast('Não foi possível enviar o aviso de teste.', 'error'); });
      });
    }

    /* ao abrir Ajustes, confere de novo a permissão (a pessoa pode ter mudado no Android) */
    var btnConfig = q('btnConfig');
    if(btnConfig){
      btnConfig.addEventListener('click', function(){
        var LN = plugin();
        if(!LN){ updateUI(); return; }
        checkPerm(LN).then(updateUI);
      });
    }
    updateUI();
  }

  /* ---------- Início ---------- */
  function init(a){
    if(api) return;
    api = a;
    bindUI();
    var LN = plugin();
    if(!LN){ updateUI(); return; }
    bindListeners(LN);

    /* ao voltar para o app (inclusive depois da meia-noite), recalcula */
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible' && cfg.on) reschedule(false);
    });

    if(cfg.on) reschedule(true); else updateUI();
  }

  window.SaldoNotif = { init: init, refresh: refresh };
})();
