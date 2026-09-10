
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const DB_NAME = "materia-finance";
  const STORE = "state";
  const STATE_KEY = "primary";
  let db = null;
  let deferredInstall = null;
  let toastTimer = null;

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const parseDate = (s) => {
    const [y,m,d] = s.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d));
  };
  const fmtDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function freshState() {
    return {
      version: 1,
      settings: { currency: "AUD", monthStart: 1 },
      accounts: [
        { id: uid(), name: "Everyday Account", type: "bank", opening: 0 },
        { id: uid(), name: "Cash", type: "cash", opening: 0 },
        { id: uid(), name: "Credit Card", type: "credit", opening: 0 }
      ],
      categories: [
        ["gro","Groceries","expense"],["din","Dining","expense"],["bil","Bills","expense"],
        ["tra","Transport","expense"],["sho","Shopping","expense"],["ent","Entertainment","expense"],
        ["hea","Health","expense"],["edu","Education","expense"],["oth","Other","expense"],
        ["sal","Salary","income"],["oin","Other Income","income"]
      ].map(([id,name,type]) => ({id,name,type})),
      budgets: {},
      transactions: []
    };
  }

  let state = freshState();

  function money(n) {
    return new Intl.NumberFormat(undefined,{
      style:"currency",currency:state.settings.currency,maximumFractionDigits:2
    }).format(Number(n)||0);
  }

  function showToast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  function openDB() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME,1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGet() {
    return new Promise((resolve,reject) => {
      const req = db.transaction(STORE,"readonly").objectStore(STORE).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut() {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put(state,STATE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function save(message) {
    await dbPut();
    render();
    if (message) showToast(message);
  }

  const accountById = id => state.accounts.find(a => a.id === id);
  const categoryById = id => state.categories.find(c => c.id === id);

  function accountBalance(id) {
    const a = accountById(id);
    let b = Number(a?.opening) || 0;
    state.transactions.forEach(t => {
      const v = Number(t.amount) || 0;
      if (t.type === "income" && t.account === id) b += v;
      if (t.type === "expense" && t.account === id) b -= v;
      if (t.type === "transfer") {
        if (t.account === id) b -= v;
        if (t.toAccount === id) b += v;
      }
    });
    return b;
  }

  function customPeriod(dateStr = today()) {
    const d = parseDate(dateStr);
    const startDay = state.settings.monthStart;
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (d.getUTCDate() < startDay) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    const start = new Date(Date.UTC(y,m,startDay));
    const end = new Date(Date.UTC(y,m+1,startDay-1));
    return { start:fmtDate(start), end:fmtDate(end), startDate:start, endDate:end };
  }

  function periodLabel(p) {
    const fmt = new Intl.DateTimeFormat(undefined,{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"});
    return `${fmt.format(p.startDate)} → ${fmt.format(p.endDate)}`;
  }

  function totals(start,end) {
    let income=0, expense=0;
    state.transactions.forEach(t => {
      if (t.date < start || t.date > end) return;
      if (t.type === "income") income += +t.amount;
      if (t.type === "expense") expense += +t.amount;
    });
    return {income,expense,flow:income-expense};
  }

  function categorySpend(start,end) {
    const out = {};
    state.transactions.forEach(t => {
      if (t.type !== "expense" || t.date < start || t.date > end) return;
      out[t.category] = (out[t.category] || 0) + (+t.amount || 0);
    });
    return out;
  }

  function monthlyPeriods(count=6) {
    const current = customPeriod();
    const base = current.startDate;
    const result = [];
    for (let i=count-1;i>=0;i--) {
      const start = new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()-i,state.settings.monthStart));
      const end = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,state.settings.monthStart-1));
      result.push({
        start:fmtDate(start), end:fmtDate(end),
        label:start.toLocaleDateString(undefined,{timeZone:"UTC",month:"short",year:"2-digit"})
      });
    }
    return result;
  }

  function yearlyPeriods(count=4) {
    const year = new Date().getFullYear();
    return Array.from({length:count},(_,i) => {
      const y = year-(count-1-i);
      return {start:`${y}-01-01`,end:`${y}-12-31`,label:String(y)};
    });
  }

  const seriesColors = ["#79a7ff","#62d6b0","#ff8b9e","#c79cff","#e7c46b"];

  function makeChart(periods, series, type="bar", allowNegative=false) {
    if (!series.length) return `<div class="empty">Not enough data to draw this chart yet.</div>`;
    const W=720,H=300,L=55,R=16,T=18,B=46;
    const values = series.flatMap(s=>s.values);
    const min = allowNegative ? Math.min(0,...values) : 0;
    const max = Math.max(1,...values);
    const y = v => T + (max-v)*(H-T-B)/(max-min || 1);
    const baseline = y(0);
    const groupW = (W-L-R)/periods.length;
    let grid = "";
    for (let i=0;i<=4;i++){
      const v = max-(max-min)*i/4;
      const yy = y(v);
      const label = Math.abs(v)>=1000 ? `${(v/1000).toFixed(1)}k` : Math.round(v);
      grid += `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#22304d" stroke-width="1"/>
               <text x="${L-8}" y="${yy+4}" text-anchor="end">${label}</text>`;
    }
    let marks = "";
    if (type === "bar") {
      series.forEach((s,si) => s.values.forEach((v,i) => {
        const bw = Math.max(4,(groupW-12)/series.length);
        const x = L+i*groupW+6+si*bw;
        const yy = y(v);
        marks += `<rect x="${x}" y="${Math.min(yy,baseline)}" width="${Math.max(3,bw-2)}" height="${Math.max(1,Math.abs(baseline-yy))}" rx="2" fill="${seriesColors[si%seriesColors.length]}">
          <title>${esc(s.name)} · ${esc(periods[i].label)} · ${money(v)}</title></rect>`;
      }));
    } else {
      series.forEach((s,si) => {
        const pts = s.values.map((v,i)=>[L+i*groupW+groupW/2,y(v)]);
        marks += `<polyline fill="none" stroke="${seriesColors[si%seriesColors.length]}" stroke-width="3" points="${pts.map(p=>p.join(",")).join(" ")}"/>`;
        marks += pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${seriesColors[si%seriesColors.length]}">
          <title>${esc(s.name)} · ${esc(periods[i].label)} · ${money(s.values[i])}</title></circle>`).join("");
      });
    }
    const labels = periods.map((p,i)=>`<text x="${L+i*groupW+groupW/2}" y="${H-16}" text-anchor="middle">${esc(p.label)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Finance chart">
      ${grid}<line x1="${L}" y1="${baseline}" x2="${W-R}" y2="${baseline}" stroke="#314363"/>${marks}${labels}</svg>`;
  }

  function txRow(t, deletable=false) {
    const from = accountById(t.account);
    const to = accountById(t.toAccount);
    const cat = categoryById(t.category);
    const title = t.type==="transfer" ? `${esc(from?.name||"Account")} → ${esc(to?.name||"Account")}` : esc(cat?.name || t.type);
    const cls = t.type==="income" ? "good" : t.type==="expense" ? "bad" : "transfer";
    const prefix = t.type==="income" ? "+" : t.type==="expense" ? "−" : "⇄";
    return `<div class="list-row">
      <div>
        <strong>${title}</strong>
        <div class="meta">${esc(t.date)}${t.note?` · ${esc(t.note)}`:""}</div>
      </div>
      <div style="text-align:right">
        <div class="amount ${cls}">${prefix}${money(t.amount)}</div>
        ${deletable?`<button class="link-btn" data-delete-tx="${t.id}" type="button">Delete</button>`:""}
      </div>
    </div>`;
  }

  function fillTransactionOptions() {
    const accountOptions = state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
    $("#txAccount").innerHTML = accountOptions;
    $("#txToAccount").innerHTML = accountOptions;
    const type = $("#txType").value;
    const categoryType = type==="income" ? "income" : "expense";
    $("#txCategory").innerHTML = state.categories.filter(c=>c.type===categoryType).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
    $("#toAccountWrap").classList.toggle("hidden",type!=="transfer");
    $("#categoryWrap").classList.toggle("hidden",type==="transfer");
  }

  function renderDashboard() {
    const p = customPeriod();
    const t = totals(p.start,p.end);
    $("#periodLabel").textContent = periodLabel(p);
    $("#incomeKpi").textContent = money(t.income);
    $("#expenseKpi").textContent = money(t.expense);
    $("#flowKpi").textContent = money(t.flow);
    $("#flowKpi").className = t.flow>=0 ? "good" : "bad";
    $("#netKpi").textContent = money(state.accounts.reduce((sum,a)=>sum+accountBalance(a.id),0));

    const periods = monthlyPeriods(6);
    $("#cashFlowChart").innerHTML = makeChart(periods,[{
      name:"Cash flow",values:periods.map(x=>totals(x.start,x.end).flow)
    }],"line",true);

    $("#dashboardAccounts").innerHTML = state.accounts.length
      ? state.accounts.map(a=>`<div class="list-row"><div><strong>${esc(a.name)}</strong><div class="meta">${a.type}</div></div><div class="amount">${money(accountBalance(a.id))}</div></div>`).join("")
      : `<div class="empty">No accounts yet.</div>`;

    const spent = categorySpend(p.start,p.end);
    const budgetCats = state.categories.filter(c=>c.type==="expense" && +state.budgets[c.id]>0);
    $("#dashboardBudgets").innerHTML = budgetCats.length
      ? budgetCats.slice(0,6).map(c=>{
          const limit=+state.budgets[c.id], value=spent[c.id]||0, pct=Math.min(100,Math.round(value/limit*100));
          return `<div style="margin-bottom:13px">
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:.82rem"><span>${esc(c.name)}</span><span>${money(value)} / ${money(limit)}</span></div>
            <div class="progress"><span style="width:${pct}%"></span></div>
          </div>`;
        }).join("")
      : `<div class="empty">Set category budgets to see progress here.</div>`;

    const recent = [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
    $("#dashboardRecent").innerHTML = recent.length ? recent.map(t=>txRow(t,false)).join("") : `<div class="empty">No transactions yet.</div>`;
  }

  function renderTransactions() {
    fillTransactionOptions();
    const filter = $("#txFilter").value;
    let items = [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date));
    if (filter !== "all") items = items.filter(t=>t.type===filter);
    $("#transactionList").innerHTML = items.length ? items.map(t=>txRow(t,true)).join("") : `<div class="empty">No matching transactions.</div>`;
    $$("[data-delete-tx]").forEach(btn => btn.addEventListener("click", async () => {
      state.transactions = state.transactions.filter(t=>t.id!==btn.dataset.deleteTx);
      await save("Transaction deleted.");
    }));
  }

  function renderAccounts() {
    $("#accountList").innerHTML = state.accounts.map(a=>`
      <div class="account-card">
        <div class="account-top">
          <div><strong>${esc(a.name)}</strong><div class="meta">${a.type}</div></div>
          <div class="balance">${money(accountBalance(a.id))}</div>
        </div>
        ${state.accounts.length>1?`<button class="link-btn" data-delete-account="${a.id}" type="button">Remove</button>`:""}
      </div>`).join("");
    $$("[data-delete-account]").forEach(btn => btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteAccount;
      if (state.transactions.some(t=>t.account===id || t.toAccount===id)) return showToast("Delete or move this account's transactions first.");
      state.accounts = state.accounts.filter(a=>a.id!==id);
      await save("Account removed.");
    }));
  }

  function renderBudgets() {
    const p = customPeriod();
    const spent = categorySpend(p.start,p.end);
    $("#budgetEditor").innerHTML = state.categories.filter(c=>c.type==="expense").map(c=>`
      <label class="budget-card">
        <span style="display:flex;justify-content:space-between;gap:10px"><strong>${esc(c.name)}</strong><span class="hint">Spent ${money(spent[c.id]||0)}</span></span>
        <input data-budget="${c.id}" type="number" min="0" step="1" value="${state.budgets[c.id]||0}" placeholder="No budget">
      </label>`).join("");
  }

  function renderReports() {
    const periods = $("#reportPeriod").value==="year" ? yearlyPeriods(5) : monthlyPeriods(6);
    const type = $("#chartType").value;
    const ranked = state.categories.filter(c=>c.type==="expense").map(c=>({
      category:c,
      total:periods.reduce((s,p)=>s+(categorySpend(p.start,p.end)[c.id]||0),0)
    })).filter(x=>x.total>0).sort((a,b)=>b.total-a.total).slice(0,5);

    const series = ranked.map(x=>({
      name:x.category.name,
      values:periods.map(p=>categorySpend(p.start,p.end)[x.category.id]||0)
    }));

    $("#categoryLegend").innerHTML = series.map((s,i)=>`<span><i style="background:${seriesColors[i%seriesColors.length]}"></i>${esc(s.name)}</span>`).join("");
    $("#categoryChart").innerHTML = makeChart(periods,series,type,false);

    const incomes = periods.map(p=>totals(p.start,p.end).income);
    const expenses = periods.map(p=>totals(p.start,p.end).expense);
    const flows = periods.map(p=>totals(p.start,p.end).flow);
    $("#reportCashFlowChart").innerHTML = makeChart(periods,[
      {name:"Income",values:incomes},{name:"Expenses",values:expenses},{name:"Cash flow",values:flows}
    ],"line",true);

    const avg = expenses.reduce((a,b)=>a+b,0)/Math.max(1,expenses.length);
    const last = expenses.at(-1)||0, prev=expenses.at(-2)||0;
    const trend = prev ? (last-prev)/prev*100 : 0;
    $("#avgSpend").textContent = money(avg);
    $("#spendTrend").textContent = `${trend>0?"+":""}${trend.toFixed(1)}%`;
    $("#spendTrend").className = trend<=0 ? "good" : "bad";
    const latestSpend = categorySpend(periods.at(-1).start,periods.at(-1).end);
    const top = Object.entries(latestSpend).sort((a,b)=>b[1]-a[1])[0];
    $("#topCategory").textContent = top ? (categoryById(top[0])?.name || "Other") : "—";
    $("#latestCashFlow").textContent = money(flows.at(-1)||0);
    $("#latestCashFlow").className = (flows.at(-1)||0)>=0 ? "good" : "bad";
  }

  function renderCategories() {
    $("#categoryList").innerHTML = state.categories.map(c=>`
      <div class="list-row">
        <div><strong>${esc(c.name)}</strong><div class="meta">${c.type}</div></div>
        <button type="button" class="link-btn" data-delete-category="${c.id}">Delete</button>
      </div>`).join("");
    $$("[data-delete-category]").forEach(btn => btn.addEventListener("click", async () => {
      const id=btn.dataset.deleteCategory;
      if (state.transactions.some(t=>t.category===id)) return showToast("This category is already used by transactions.");
      state.categories=state.categories.filter(c=>c.id!==id);
      delete state.budgets[id];
      await save("Category removed.");
    }));
  }

  function renderSettings() {
    $("#monthStart").value = state.settings.monthStart;
    $("#currency").value = state.settings.currency;
    $("#storageStatus").textContent = "Storage: local IndexedDB · No cloud account · No server sync";
  }

  function render() {
    renderDashboard();
    renderTransactions();
    renderAccounts();
    renderBudgets();
    renderReports();
    renderCategories();
    renderSettings();
  }

  $$(".tabs button").forEach(btn => btn.addEventListener("click", () => {
    $$(".tabs button").forEach(x=>x.classList.toggle("active",x===btn));
    $$(".tab-panel").forEach(x=>x.classList.toggle("active",x.id===btn.dataset.tab));
    if (btn.dataset.tab==="reports") renderReports();
  }));

  $("#quickAdd").addEventListener("click",()=>document.querySelector('[data-tab="transactions"]').click());
  $("#txType").addEventListener("change",fillTransactionOptions);
  $("#txFilter").addEventListener("change",renderTransactions);
  $("#reportPeriod").addEventListener("change",renderReports);
  $("#chartType").addEventListener("change",renderReports);
  $("#txDate").value = today();

  $("#transactionForm").addEventListener("submit", async e => {
    e.preventDefault();
    const type=$("#txType").value;
    const amount=Number($("#txAmount").value);
    const account=$("#txAccount").value;
    const toAccount=$("#txToAccount").value;
    if (!account || !Number.isFinite(amount) || amount<=0) return showToast("Enter a valid positive amount.");
    if (type==="transfer" && (!toAccount || toAccount===account)) return showToast("Choose a different destination account.");
    state.transactions.push({
      id:uid(), type, date:$("#txDate").value||today(), amount, account,
      toAccount:type==="transfer"?toAccount:null,
      category:type==="transfer"?null:$("#txCategory").value,
      note:$("#txNote").value.trim()
    });
    e.target.reset();
    $("#txType").value="expense";
    $("#txDate").value=today();
    fillTransactionOptions();
    await save(type==="transfer"?"Transfer saved. Reporting remains untouched.":"Transaction saved.");
  });

  $("#accType").addEventListener("change",()=>{
    $("#openingHelp").textContent = $("#accType").value==="credit"
      ? "Enter the amount currently owed. It is stored as a liability."
      : "Enter money currently available.";
  });

  $("#accountForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name=$("#accName").value.trim(), type=$("#accType").value;
    let opening=Number($("#accOpening").value)||0;
    if (!name) return;
    if (type==="credit" && opening>0) opening=-opening;
    state.accounts.push({id:uid(),name,type,opening});
    e.target.reset();
    $("#accOpening").value=0;
    await save("Account added.");
  });

  $("#saveBudgets").addEventListener("click", async () => {
    $$("[data-budget]").forEach(input=>{
      const v=Math.max(0,Number(input.value)||0);
      if (v) state.budgets[input.dataset.budget]=v;
      else delete state.budgets[input.dataset.budget];
    });
    await save("Budgets saved.");
  });

  $("#settingsForm").addEventListener("submit", async e => {
    e.preventDefault();
    state.settings.monthStart=Math.max(1,Math.min(28,Number($("#monthStart").value)||1));
    state.settings.currency=$("#currency").value;
    await save("Settings saved.");
  });

  $("#categoryForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name=$("#newCategoryName").value.trim();
    if (!name) return;
    state.categories.push({id:uid(),name,type:$("#newCategoryType").value});
    e.target.reset();
    await save("Category added.");
  });

  $("#exportBtn").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`materia-finance-backup-${today()}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),800);
  });

  $("#importFile").addEventListener("change",async e=>{
    const file=e.target.files?.[0];
    if (!file) return;
    try {
      const parsed=JSON.parse(await file.text());
      if (!parsed.accounts || !parsed.transactions || !parsed.categories || !parsed.settings) throw new Error("invalid");
      state=parsed;
      await save("Backup imported.");
    } catch {
      showToast("That file is not a valid Materia Finance backup.");
    }
    e.target.value="";
  });

  $("#demoBtn").addEventListener("click",async()=>{
    const d=freshState();
    const bank=d.accounts.find(a=>a.type==="bank").id;
    const card=d.accounts.find(a=>a.type==="credit").id;
    d.accounts.find(a=>a.type==="bank").opening=4200;
    d.accounts.find(a=>a.type==="credit").opening=-680;
    d.budgets={gro:900,din:350,ent:220,tra:260};
    const add=(type,date,amount,account,category,note,toAccount=null)=>d.transactions.push({id:uid(),type,date,amount,account,category,note,toAccount});
    add("income",today(),4800,bank,"sal","Salary");
    add("expense",today(),168.40,bank,"gro","Groceries");
    add("expense",today(),72.50,card,"din","Dinner");
    add("transfer",today(),250,bank,null,"Card payment",card);
    const now=parseDate(today());
    for(let m=1;m<=5;m++){
      const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-m,10));
      const ds=fmtDate(dt);
      add("income",ds,4700+m*30,bank,"sal","Salary");
      add("expense",fmtDate(new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),14))),520+m*20,bank,"gro","Groceries");
      add("expense",fmtDate(new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),18))),150+m*12,card,"din","Dining");
    }
    state=d;
    await save("Demo data loaded.");
  });

  $("#resetBtn").addEventListener("click",async()=>{
    if (!confirm("Reset all locally stored Materia Finance data?")) return;
    state=freshState();
    await save("Finance data reset.");
  });

  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    deferredInstall=e;
    $("#installBtn").classList.remove("hidden");
  });
  $("#installBtn").addEventListener("click",async()=>{
    if(!deferredInstall)return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall=null;
    $("#installBtn").classList.add("hidden");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  (async()=>{
    try {
      db=await openDB();
      const stored=await dbGet();
      if (stored) state=stored;
      else await dbPut();
      render();
    } catch (err) {
      console.error(err);
      alert("Materia Finance could not open local storage in this browser.");
    }
  })();
})();
