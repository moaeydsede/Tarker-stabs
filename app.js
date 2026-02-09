/* متابعة الأدوية - PWA (Mobile-first)
   تخزين: LocalStorage
   ملاحظة مهمة: إشعارات التذكير تعمل بشكل أفضل عند تثبيت التطبيق (PWA)
*/

const LS_KEY = "medTracker.v1";
const LS_LOG = "medTracker.log.v1";
const LS_SETTINGS = "medTracker.settings.v1";

let state = loadState();
let settings = loadSettings();

let deferredPrompt = null;
const $ = (id) => document.getElementById(id);

const todayList = $("todayList");
const prnList = $("prnList");
const emptyState = $("emptyState");
const prnEmpty = $("prnEmpty");
const logList = $("logList");
const logEmpty = $("logEmpty");

const modal = $("modal");
const medForm = $("medForm");
const btnAdd = $("btnAdd");
const btnClose = $("btnClose");
const btnDelete = $("btnDelete");
const modalTitle = $("modalTitle");
const medId = $("medId");
const medName = $("medName");
const medNote = $("medNote");
const medType = $("medType");
const medImage = $("medImage");
const medRemind = $("medRemind");
const medBefore = $("medBefore");
const medStart = $("medStart");
const medEnd = $("medEnd");
const timesWrap = $("timesWrap");
const btnAddTime = $("btnAddTime");

const searchInput = $("searchInput");
const btnExport = $("btnExport");
const btnClearLog = $("btnClearLog");

const btnNotify = $("btnNotify");
const btnInstall = $("btnInstall");
const errorBanner = $("errorBanner");
const errorBannerMsg = $("errorBannerMsg");
const btnReload = $("btnReload");

let filter = "all"; // all | due | taken | missed
let reminderTimer = null;

function openModal(){
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(){
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}


function loadState(){
  try{
    return JSON.parse(localStorage.getItem(LS_KEY)) || { meds: [] };
  }catch(e){
    return { meds: [] };
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function loadLog(){
  try{
    return JSON.parse(localStorage.getItem(LS_LOG)) || [];
  }catch(e){ return []; }
}
function saveLog(log){
  localStorage.setItem(LS_LOG, JSON.stringify(log));
}
function loadSettings(){
  try{
    return JSON.parse(localStorage.getItem(LS_SETTINGS)) || { notificationsEnabled: false };
  }catch(e){
    return { notificationsEnabled: false };
  }
}
function saveSettings(){
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function isoDate(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function todayKey(d=new Date()){

  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}


function isMedActiveOnDate(med, date=new Date()){
  const d = isoDate(date);
  const start = med.startDate || d;
  const end = med.endDate || "";
  if (d < start) return false;
  if (end && d > end) return false;
  return true;
}

function parseTimeToDate(t, baseDate=new Date()){
  // t = "HH:MM"
  const [hh, mm] = t.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function fmtTime(d){
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute:"2-digit" });
}
function fmtDateTime(d){
  return d.toLocaleString("ar-EG", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function getTakenMapForToday(){
  const key = todayKey();
  const log = loadLog();
  const map = new Map(); // medId -> Set(timestring or "prn")
  for (const row of log){
    if (row.dayKey !== key) continue;
    const k = row.medId;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(row.slot || "prn");
  }
  return map;
}

function buildTodayTasks(){
  const now = new Date();
  const tasks = [];
  const takenMap = getTakenMapForToday();

  for (const med of state.meds){
    if (!isMedActiveOnDate(med, now)) continue;
    if (med.type === "prn") continue;
    const times = (med.times || []).filter(Boolean);
    for (const t of times){
      const dueAt = parseTimeToDate(t, now);
      const taken = takenMap.get(med.id)?.has(t) || false;
      const diffMin = Math.round((now - dueAt) / 60000);

      let status = "due";
      if (taken) status = "taken";
      else if (diffMin > 120) status = "missed"; // بعد ساعتين نعتبره "فات"
      else status = "due";

      tasks.push({
        med,
        slot: t,
        dueAt,
        status,
        overdueMinutes: Math.max(0, diffMin)
      });
    }
  }

  tasks.sort((a,b)=> a.dueAt - b.dueAt);
  return tasks;
}

function matchesSearch(med, q){
  if (!q) return true;
  const s = (med.name + " " + (med.note||"")).toLowerCase();
  return s.includes(q.toLowerCase());
}

function render(){
  const q = (searchInput.value || "").trim();
  const tasks = buildTodayTasks().filter(t => matchesSearch(t.med, q));
  const filtered = tasks.filter(t => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  todayList.innerHTML = "";
  if (state.meds.length === 0){
    emptyState.classList.remove("hidden");
  }else{
    emptyState.classList.add("hidden");
  }

  if (filtered.length === 0 && state.meds.length > 0){
    todayList.innerHTML = `<div class="empty">
      <div class="empty__emoji">✅</div>
      <div class="empty__title">لا توجد عناصر مطابقة</div>
      <div class="empty__desc">جرّب تغيير الفلتر أو البحث.</div>
    </div>`;
  }else{
    for (const t of filtered){
      todayList.appendChild(renderTaskItem(t));
    }
  }

  // PRN
  const prn = state.meds.filter(m => m.type === "prn" && isMedActiveOnDate(m, new Date()) && matchesSearch(m, q));
  prnList.innerHTML = "";
  if (prn.length === 0){
    prnEmpty.classList.remove("hidden");
  }else{
    prnEmpty.classList.add("hidden");
    for (const med of prn){
      prnList.appendChild(renderPrnItem(med));
    }
  }

  renderLog();
}

function statusBadge(status){
  if (status === "taken") return `<span class="badge badge--taken">تم</span>`;
  if (status === "missed") return `<span class="badge badge--missed">فات</span>`;
  return `<span class="badge badge--due">مستحق</span>`;
}

function renderTaskItem(task){
  const { med, slot, dueAt, status, overdueMinutes } = task;
  const img = med.imageDataUrl ? `<img class="item__img" src="${med.imageDataUrl}" alt="">`
                              : `<div class="item__img"></div>`;

  const rangeTxt = (med.startDate || med.endDate) ? `الفترة: <b>${med.startDate || '—'}</b> إلى <b>${med.endDate || 'مستمر'}</b>` : '';

  const metaParts = [
    `الوقت: <b>${slot}</b>`,
    med.note ? `الجرعة/ملاحظة: <b>${escapeHtml(med.note)}</b>` : "",
    rangeTxt
  ].filter(Boolean);

  const extra = (status !== "taken" && overdueMinutes > 0)
    ? ` • متأخر ${overdueMinutes} د`
    : "";

  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.innerHTML = `
    ${img}
    <div class="item__body">
      <div class="item__title">
        <h3>${escapeHtml(med.name)}</h3>
        ${statusBadge(status)}
      </div>
      <div class="item__meta">
        <span>${metaParts.join(" • ")}</span>
        <span>${extra}</span>
      </div>
      <div class="item__actions">
        ${status !== "taken" ? `<button class="btn btn-primary small" data-action="take" data-id="${med.id}" data-slot="${slot}">تناولت الآن</button>` : ""}
        ${status !== "taken" ? `<button class="btn btn-ghost small" data-action="skip" data-id="${med.id}" data-slot="${slot}">لم أتناوله</button>` : ""}
        <button class="btn btn-ghost small" data-action="edit" data-id="${med.id}">تعديل</button>
      </div>
    </div>
  `;
  return wrap;
}

function renderPrnItem(med){
  const img = med.imageDataUrl ? `<img class="item__img" src="${med.imageDataUrl}" alt="">`
                              : `<div class="item__img"></div>`;
  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.innerHTML = `
    ${img}
    <div class="item__body">
      <div class="item__title">
        <h3>${escapeHtml(med.name)}</h3>
        <span class="badge">أزمة</span>
      </div>
      <div class="item__meta">
        ${med.note ? `<span>ملاحظة: <b>${escapeHtml(med.note)}</b></span>` : `<span class="muted">—</span>`}
      </div>
      <div class="item__actions">
        <button class="btn btn-primary small" data-action="take-prn" data-id="${med.id}">تناولت الآن</button>
        <button class="btn btn-ghost small" data-action="edit" data-id="${med.id}">تعديل</button>
      </div>
    </div>
  `;
  return wrap;
}

function renderLog(){
  const log = loadLog();
  logList.innerHTML = "";
  if (log.length === 0){
    logEmpty.classList.remove("hidden");
    return;
  }
  logEmpty.classList.add("hidden");
  const last = log.slice().reverse().slice(0, 50); // آخر 50
  for (const row of last){
    const el = document.createElement("div");
    el.className = "log__row";
    const med = state.meds.find(m => m.id === row.medId);
    const medNameTxt = med ? med.name : "دواء محذوف";
    const slotTxt = row.slot ? ` • وقت: <b>${row.slot}</b>` : ` • <b>أزمة</b>`;
    el.innerHTML = `🕒 ${fmtDateTime(new Date(row.takenAt))} — <b>${escapeHtml(medNameTxt)}</b>${slotTxt}`;
    logList.appendChild(el);
  }
}

function syncTypeUI(){
  const isPrn = medType.value === "prn";
  // Disable adding times for PRN
  btnAddTime.disabled = isPrn;
  // Disable time inputs for PRN (prevent confusion)
  Array.from(timesWrap.querySelectorAll("input[type='time']")).forEach(inp => {
    inp.disabled = isPrn;
  });
  try{
    timesWrap.parentElement.parentElement.style.opacity = isPrn ? .5 : 1;
  }catch(_){}
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* Modal helpers */
function resetForm(){
  medId.value = "";
  medName.value = "";
  medNote.value = "";
  medType.value = "scheduled";
  medImage.value = "";
  medRemind.value = "30";
  if (medBefore) medBefore.value = "10";
  timesWrap.innerHTML = "";
  addTimeRow("08:00");
  addTimeRow("20:00");
  btnDelete.classList.add("hidden");
  if (medStart) medStart.value = isoDate(new Date());
  if (medEnd) medEnd.value = "";
  syncTypeUI();
}

function addTimeRow(value=""){
  const row = document.createElement("div");
  row.className = "time-row";
  row.innerHTML = `
    <input type="time" class="input" value="${value}">
    <button type="button" class="btn btn-ghost small">حذف</button>
  `;
  const input = row.querySelector("input");
  const del = row.querySelector("button");
  del.addEventListener("click", ()=> row.remove());
  timesWrap.appendChild(row);
  syncTypeUI();
  return input;
}

function openAdd(){
  resetForm();
  modalTitle.textContent = "إضافة دواء";
  syncTypeUI();
  openModal();
}

function openEdit(id){
  const med = state.meds.find(m=>m.id===id);
  if (!med) return;
  resetForm();
  medId.value = med.id;
  medName.value = med.name;
  medNote.value = med.note || "";
  medType.value = med.type || "scheduled";
  medRemind.value = String(med.remindEvery || 30);
  timesWrap.innerHTML = "";
  (med.times && med.times.length ? med.times : ["08:00"]).forEach(t=> addTimeRow(t));
  btnDelete.classList.remove("hidden");
  modalTitle.textContent = "تعديل دواء";
  syncTypeUI();
  openModal();
}

function readTimesFromUI(){
  const inputs = Array.from(timesWrap.querySelectorAll("input[type='time']"));
  const times = inputs.map(i=>i.value).filter(Boolean);
  // unique & sorted
  const uniq = Array.from(new Set(times));
  uniq.sort();
  return uniq;
}

async function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* Actions */
todayList.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const slot = btn.dataset.slot;

  if (action === "edit") return openEdit(id);
  if (action === "take") return takeDose(id, slot);
  if (action === "skip") return skipDose(id, slot);
});

prnList.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === "edit") return openEdit(id);
  if (action === "take-prn") return takePrn(id);
});

btnAdd.addEventListener("click", openAdd);
btnClose.addEventListener("click", closeModal);
btnAddTime.addEventListener("click", ()=> addTimeRow(""));

medType.addEventListener("change", ()=>{
  syncTypeUI();
});

medForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const id = medId.value || uid();
  const isNew = !medId.value;

  const name = medName.value.trim();
  if (!name) return;

  const note = medNote.value.trim();
  const type = medType.value;
  const times = (type === "scheduled") ? readTimesFromUI() : [];
  const remindEvery = Number(medRemind.value || 0);
  const notifyBefore = medBefore ? Number(medBefore.value || 0) : 0;
  const startDate = medStart ? (medStart.value || isoDate(new Date())) : isoDate(new Date());
  const endDate = medEnd ? (medEnd.value || "") : "";

  let imageDataUrl = undefined;
  const file = medImage.files && medImage.files[0];
  if (file){
    // Compress a bit by resizing client-side (fast and simple)
    imageDataUrl = await compressImageToDataUrl(file, 512, 0.82);
  } else {
    // keep previous image on edit
    const existing = state.meds.find(m=>m.id===id);
    if (existing && existing.imageDataUrl) imageDataUrl = existing.imageDataUrl;
  }

  const med = { id, name, note, type, times, imageDataUrl, remindEvery, notifyBefore, startDate, endDate };
  if (isNew){
    state.meds.push(med);
  }else{
    state.meds = state.meds.map(m => m.id===id ? med : m);
  }

  saveState();
  closeModal();
  render();
  startReminderLoop();
});

btnDelete.addEventListener("click", ()=>{
  const id = medId.value;
  if (!id) return;
  if (!confirm("حذف هذا الدواء؟")) return;
  state.meds = state.meds.filter(m=>m.id!==id);
  saveState();
  closeModal();
  render();
});

searchInput.addEventListener("input", ()=> render());

document.querySelectorAll(".segmented__btn").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".segmented__btn").forEach(x=>x.classList.remove("is-active"));
    b.classList.add("is-active");
    filter = b.dataset.filter;
    render();
  });
});

/* Intake logic */
function appendLog(entry){
  const log = loadLog();
  log.push(entry);
  // keep last 2000
  if (log.length > 2000) log.splice(0, log.length - 2000);
  saveLog(log);
}

function takeDose(medId, slot){
  appendLog({
    id: uid(),
    medId,
    slot,
    takenAt: Date.now(),
    dayKey: todayKey()
  });
  notifyNow("تم تسجيل التناول ✅", "تم تسجيل تناول الدواء.");
  render();
}

function takePrn(medId){
  appendLog({
    id: uid(),
    medId,
    slot: null,
    takenAt: Date.now(),
    dayKey: todayKey()
  });
  notifyNow("تم تسجيل دواء الأزمة ✅", "تم تسجيل تناول دواء الأزمة.");
  render();
}

function skipDose(medId, slot){
  // لا نسجل "skip" في السجل، لكن نُبقيه مستحقًا ليعيد التذكير
  notifyNow("تنبيه", "سأذكّرك مرة أخرى بهذا الدواء.");
  render();
}

/* Export / Clear */
btnExport.addEventListener("click", ()=>{
  const log = loadLog();
  const rows = [["dateTime","medName","slot","note"]];

  for (const r of log){
    const med = state.meds.find(m=>m.id===r.medId);
    rows.push([
      fmtDateTime(new Date(r.takenAt)),
      med ? med.name : "Deleted",
      r.slot || "PRN",
      med?.note || ""
    ]);
  }

  const csv = rows.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `med-log-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

btnClearLog.addEventListener("click", ()=>{
  if (!confirm("مسح سجل التناول بالكامل؟")) return;
  saveLog([]);
  render();
});

/* Notifications & reminders */
btnNotify.addEventListener("click", async ()=>{
  const ok = await ensureNotificationPermission();
  settings.notificationsEnabled = ok;
  saveSettings();
  syncNotifyButton();
  if (ok){
    notifyNow("تم تفعيل التذكير 🔔", "سأرسل تذكيرات عند الاستحقاق (حسب إمكانيات الجهاز).");
  }
});

function syncNotifyButton(){
  btnNotify.textContent = settings.notificationsEnabled ? "التذكير مفعّل" : "تفعيل التذكير";
  btnNotify.classList.toggle("btn-primary", settings.notificationsEnabled);
}

async function ensureNotificationPermission(){
  if (!("Notification" in window)){
    alert("جهازك لا يدعم الإشعارات.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

async function notifyNow(title, body){
  if (!settings.notificationsEnabled) return;
  if (!("serviceWorker" in navigator)) return;
  if (Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg){
    reg.showNotification(title, {
      body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      vibrate: [80, 60, 80],
      tag: "med-tracker",
      renotify: true
    });
  }else{
    new Notification(title, { body });
  }
}

function startReminderLoop(){
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminders, 60 * 1000); // كل دقيقة
  checkReminders();
}

function checkReminders(){
  const now = new Date();
  const tasks = buildTodayTasks();
  const pending = tasks.filter(t => t.status !== "taken");
  if (pending.length === 0) return;

  for (const t of pending){
    const med = t.med;
    const remindEvery = Number(med.remindEvery || 0);
    const beforeMin = Number(med.notifyBefore || 0);

    const msToDue = t.dueAt - now;
    const minToDue = Math.round(msToDue / 60000); // دقائق حتى الموعد (قد تكون سالبة)

    // 1) إشعار قبل الموعد (مرة واحدة)
    if (beforeMin > 0 && minToDue === beforeMin){
      const preKey = `pre:${todayKey()}:${med.id}:${t.slot}:${beforeMin}`;
      if (!sessionStorage.getItem(preKey)){
        sessionStorage.setItem(preKey, "1");
        const body = `${med.name} — بعد ${beforeMin} دقائق (الوقت: ${t.slot})${med.note ? " — " + med.note : ""}`;
        notifyNow("تنبيه قبل موعد الدواء 🔔", body);
      }
    }

    // 2) إشعار عند الموعد / بعده + تكرار حسب remindEvery
    if (minToDue > 1) continue;

    const stampKey = `stamp:${todayKey()}:${med.id}:${t.slot}`;
    const last = Number(sessionStorage.getItem(stampKey) || 0);
    const nowTs = Date.now();
    const minGap = remindEvery > 0 ? remindEvery : 999999;

    if ((nowTs - last) / 60000 < minGap) continue;

    sessionStorage.setItem(stampKey, String(nowTs));

    const overdueMin = Math.max(0, -minToDue);
    const title = overdueMin > 0 ? "دواء متأخر ⏰" : "حان موعد الدواء ⏰";
    const body = `${med.name} — الوقت: ${t.slot}${med.note ? " — " + med.note : ""}`;
    notifyNow(title, body);
  }
}

/* Install prompt (Android/Chrome) */
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.classList.remove("hidden");
});

btnInstall.addEventListener("click", async ()=>{
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.classList.add("hidden");
});

/* PWA / SW */
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("sw.js");
  }catch(e){
    // ignore
  }
}

/* Image compression */
async function compressImageToDataUrl(file, maxSide=512, quality=0.82){
  const img = await new Promise((resolve, reject)=>{
    const i = new Image();
    i.onload = ()=> resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const { width, height } = img;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  URL.revokeObjectURL(img.src);
  return dataUrl;
}

/* Boot */
document.addEventListener("DOMContentLoaded", () => {
(async function init(){
  registerSW();
  syncNotifyButton();
  render();
  startReminderLoop();
})();
});

// Close modal when clicking backdrop
modal.addEventListener("click", (e)=>{
  const isBackdrop = e.target && (e.target.dataset && e.target.dataset.close === "1");
  if (isBackdrop) closeModal();
});

document.addEventListener("keydown",(e)=>{
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

// Global error catcher (helps على الموبايل)
window.addEventListener("error", (e)=>{
  try{
    if (errorBanner && errorBannerMsg){
      errorBannerMsg.textContent = (e && e.message) ? e.message : "خطأ غير معروف";
      errorBanner.classList.remove("hidden");
    }
  }catch(_){}
});
window.addEventListener("unhandledrejection", (e)=>{
  try{
    if (errorBanner && errorBannerMsg){
      errorBannerMsg.textContent = (e && e.reason && (e.reason.message || e.reason)) ? String(e.reason.message || e.reason) : "خطأ غير معروف";
      errorBanner.classList.remove("hidden");
    }
  }catch(_){}
});
if (btnReload){
  btnReload.addEventListener("click", ()=> location.reload());
}