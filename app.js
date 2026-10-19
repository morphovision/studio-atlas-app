/* Studio Atlas — cloud app (Supabase + GitHub Actions engine) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2800); };
const sb = window.supabase.createClient(window.ATLAS_CONFIG.supabaseUrl, window.ATLAS_CONFIG.supabaseKey);
const mobile = () => matchMedia("(max-width: 760px)").matches;

const STATUSES = ["por_contactar", "enviado", "sin_respuesta", "respondido", "descartado", "no_contactar"];
const STATUS_LABEL = { por_contactar: "Por contactar", enviado: "Enviado", sin_respuesta: "Sin respuesta", respondido: "Respondido", descartado: "Descartado", no_contactar: "No contactar" };
const ALIVE_LABEL = { activa: "Activa", dudosa: "Dudosa", inactiva: "Inactiva", sin_comprobar: "Sin comprobar" };
const CAT_SHORT = { vfx: "VFX", motion: "Motion / 3D", design: "Diseño", advertising: "Publicidad", production: "Productora", marketing: "Marketing", web: "Diseño web", other: "Otro" };
const CAT_LONG = { vfx: "VFX", motion: "Motion / 3D / Animación", design: "Diseño gráfico / Branding", advertising: "Publicidad / Agencia creativa", production: "Productora / Postproducción", marketing: "Marketing", web: "Diseño web" };
const REGIONS = {
  "Iberia": ["ES", "PT"],
  "Europa": ["GB", "IE", "FR", "NL", "BE", "DE", "CH", "AT", "IT", "SE", "DK", "NO", "FI", "IS", "EE", "LV", "LT", "PL", "CZ", "HU", "RO", "BG", "RS", "HR", "SI", "UA", "GR", "ES", "PT"],
  "Norteamérica": ["US", "CA"],
  "Latinoamérica": ["MX", "CO", "AR", "CL", "PE", "UY", "BR"],
  "Oriente Medio y África": ["AE", "SA", "QA", "IL", "LB", "EG", "MA", "ZA", "NG", "KE", "TR"],
  "Asia-Pacífico": ["JP", "KR", "CN", "HK", "TW", "SG", "TH", "MY", "ID", "PH", "VN", "IN", "AU", "NZ"],
};
const SPANISH = new Set(["ES", "MX", "CO", "AR", "CL", "PE", "UY", "EC", "VE", "BO", "PY", "CR", "PA", "GT", "DO", "SV", "HN", "NI", "CU"]);
const CATEGORY_WORDS = {
  es: { vfx: "efectos visuales", motion: "motion y 3D", design: "diseño", advertising: "publicidad", production: "producción", marketing: "marketing", web: "diseño web", other: "creatividad" },
  en: { vfx: "visual effects", motion: "motion and 3D", design: "design", advertising: "advertising", production: "production", marketing: "marketing", web: "web design", other: "creative work" },
};
const REGION_NAMES = (() => { try { return new Intl.DisplayNames(["es"], { type: "region" }); } catch { return null; } })();
const countryName = (cc, fallback) => { try { return (cc && REGION_NAMES && REGION_NAMES.of(cc)) || fallback || cc || ""; } catch { return fallback || cc || ""; } };
const state = { items: [], total: 0, offset: 0, sel: new Set(), settings: {}, tpl: "template_es", view: "list", jobs: [] };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const dot = (kind, v) => `<span class="dot" style="background:var(--${kind}-${v})"></span>`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const domainOf = (u) => { try { return new URL(u.includes("://") ? u : "https://" + u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

// ------------------------------------------------------------------ auth
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  $("#login").hidden = true;
  $("#appshell").hidden = false;
  try {
    await init();
  } catch (e) {
    if (/autorizado/.test(e.message)) {
      showLogin(`Esta cuenta (${session.user.email}) no tiene acceso. Entra con el email configurado en la guía.`);
      await sb.auth.signOut();
    } else toast(e.message);
  }
}
function showLogin(msg) {
  $("#appshell").hidden = true;
  $("#login").hidden = false;
  if (msg) $("#login-msg").textContent = msg;
}
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) return ($("#login-msg").textContent = error.message);
  localStorage.setItem("atlas-email", email);
  $("#login-msg").textContent = "Revisa tu correo.";
  $("#code-form").hidden = false;
};
$("#code-form").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.verifyOtp({ email: $("#login-email").value.trim() || localStorage.getItem("atlas-email"), token: $("#login-code").value.trim(), type: "email" });
  if (error) return ($("#login-msg").textContent = error.message);
  boot();
};
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && $("#appshell").hidden) boot(); });

// ------------------------------------------------------------------ filters
function currentFilters() {
  const f = {
    q: $("#f-q").value.trim(), country_code: $("#f-country").value, category: $("#f-category").value,
    status: $("#f-status").value, alive_status: $("#f-alive").value, sort: $("#f-sort").value,
    has_email: $("#f-email").checked ? "1" : "", freelance: $("#f-freelance").checked ? "1" : "", favorite: $("#f-fav").checked ? "1" : "",
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v != null));
}
let fTimer;
function onFilter() {
  clearTimeout(fTimer);
  fTimer = setTimeout(() => { loadList(true); if (state.view === "map") loadMap(); }, 250);
}

// ------------------------------------------------------------------ list
async function loadList(reset) {
  if (reset) { state.offset = 0; state.items = []; }
  const data = must(await sb.rpc("atlas_companies", { f: currentFilters(), lim: 100, off: state.offset }));
  state.total = data.total;
  state.items = state.items.concat(data.items);
  state.offset += data.items.length;
  renderList();
}
function renderList() {
  $("#table tbody").innerHTML = state.items.map((c) => `
    <tr data-id="${c.id}" class="${state.sel.has(c.id) ? "sel" : ""}">
      <td class="c-sel"><input type="checkbox" data-sel="${c.id}" ${state.sel.has(c.id) ? "checked" : ""}></td>
      <td><div class="name">${c.favorite ? '<span class="fav">★</span> ' : ""}${esc(c.name)}</div>
          <div class="sub">${esc(c.domain || (c.instagram || "").replace(/https?:\/\/(www\.)?instagram\.com\//, "@") || "")}${c.emails.length ? " · ✉" : ""}</div></td>
      <td>${esc(c.city || "")}<div class="sub">${esc(countryName(c.country_code, c.country))}</div></td>
      <td>${esc(CAT_SHORT[c.category] || c.category)}</td>
      <td class="num">${c.fit_score ?? 0}<span class="bar"><i style="width:${c.fit_score || 0}%"></i></span></td>
      <td class="num">${c.freelance_score ?? 0}</td>
      <td><span class="pill">${dot("a", c.alive_status)}${ALIVE_LABEL[c.alive_status] || ""}</span></td>
      <td><span class="pill">${dot("s", c.status)}${STATUS_LABEL[c.status] || ""}</span></td>
      <td class="sub">${fmtDate(c.last_sent)}</td>
    </tr>`).join("");
  $("#empty").hidden = state.total > 0;
  $("#count").textContent = state.total ? `${state.items.length} de ${state.total.toLocaleString("es-ES")}` : "";
  $("#load-more").hidden = state.items.length >= state.total;
  updateBulk();
}
function updateBulk() {
  $("#bulkbar").classList.toggle("on", state.sel.size > 0);
  $("#sel-count").textContent = `${state.sel.size} seleccionadas`;
}
$("#table").addEventListener("click", (e) => {
  const sel = e.target.closest("[data-sel]");
  if (sel) {
    const id = +sel.dataset.sel;
    sel.checked ? state.sel.add(id) : state.sel.delete(id);
    sel.closest("tr").classList.toggle("sel", sel.checked);
    return updateBulk();
  }
  const tr = e.target.closest("tr[data-id]");
  if (tr) openDrawer(+tr.dataset.id);
});
$("#sel-all").addEventListener("change", (e) => { state.items.forEach((c) => e.target.checked ? state.sel.add(c.id) : state.sel.delete(c.id)); renderList(); });
$("#load-more").addEventListener("click", () => loadList(false));

async function queueJob(kind, label, params) {
  const row = must(await sb.from("jobs").insert({ kind, label, params }).select().single());
  toast("En marcha en la nube · lo verás en Buscar › Tareas");
  loadJobs();
  return row;
}
$("#bulkbar").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]");
  if (!b) return;
  const ids = [...state.sel];
  const act = b.dataset.bulk;
  try {
    if (act === "verify") await queueJob("verify", `Verificar ${ids.length} empresas`, { ids });
    if (act === "send" || act === "followup") {
      if (!confirm(`¿Enviar ${act === "followup" ? "seguimiento" : "el primer correo"} a ${ids.length} empresas? Solo a las que tengan email y estén en el estado correcto, respetando tu límite diario.`)) return;
      await queueJob("send", `${act === "followup" ? "Seguimiento" : "Envío"} a ${ids.length} empresas`, { ids, kind: act === "followup" ? "followup" : "first" });
    }
    if (act === "favorite") must(await sb.from("companies").update({ favorite: true }).in("id", ids));
    if (act === "delete") {
      if (!confirm(`¿Eliminar ${ids.length} empresas?`)) return;
      must(await sb.from("companies").delete().in("id", ids));
      state.sel.clear();
    }
    if (act === "favorite" || act === "delete") { loadList(true); loadStats(); }
  } catch (err) { toast(err.message); }
});
$("#bulk-status").addEventListener("change", async (e) => {
  if (!e.target.value) return;
  must(await sb.from("companies").update({ status: e.target.value }).in("id", [...state.sel]));
  e.target.value = ""; loadList(true); loadStats();
});

// ------------------------------------------------------------------ drawer
const linkedinPeople = (c) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.name} (recruiter OR talent OR "head of" OR producer OR "creative director" OR founder OR HR)`)}`;
const googlePeople = (c) => `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${c.name}" (producer OR "head of" OR director OR founder OR recruiter OR talent)`)}`;

function render(c, kind = "first") {
  const s = state.settings;
  const lang = (c.lang === "es" || SPANISH.has(c.country_code || "")) ? "es" : "en";
  let t = (kind === "first" ? s[`template_${lang}`] : s[`followup_${lang}`]) || "";
  const vals = { empresa: c.name || "", ciudad: c.city || "", pais: countryName(c.country_code, c.country), tipo: CATEGORY_WORDS[lang][c.category || "other"] || "", mi_nombre: s.my_name || "", mi_web: s.my_web || "", web_empresa: c.website || "" };
  for (const [k, v] of Object.entries(vals)) t = t.replaceAll(`{${k}}`, v);
  const m = t.match(/^\s*(asunto|subject)\s*:\s*(.+?)\n/i);
  return { lang, to: c.emails[0], subject: m ? m[2].trim() : "", body: m ? t.slice(m[0].length).replace(/^\n+/, "") : t };
}

async function openDrawer(id) {
  const c = must(await sb.from("companies").select("*").eq("id", id).single());
  const links = [
    c.website && ["Web", c.website], c.instagram && ["Instagram", c.instagram], c.linkedin && ["LinkedIn empresa", c.linkedin],
    c.behance && ["Behance", c.behance], c.vimeo && ["Vimeo", c.vimeo],
    ["Personas en LinkedIn", linkedinPeople(c)], ["Personas vía Google", googlePeople(c)],
    ["Buscar en Google", `https://www.google.com/search?q=${encodeURIComponent(c.name + " " + (c.city || ""))}`],
  ].filter(Boolean);
  $("#drawer-body").innerHTML = `
    <h2>${esc(c.name)}</h2>
    <div class="meta">${esc(CAT_SHORT[c.category] || "")} · ${esc([c.city, countryName(c.country_code, c.country)].filter(Boolean).join(", ") || "Ubicación desconocida")}
      ${c.address ? `<br>${esc(c.address)}` : ""}</div>
    <div class="links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`).join("")}</div>
    ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
    <div>${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <div class="scores">
      <div><b>${c.fit_score ?? 0}</b><span>Encaje</span></div>
      <div><b>${c.freelance_score ?? 0}</b><span>Freelance</span></div>
      <div><b>${c.boutique_score ?? 0}</b><span>Boutique</span></div>
      <div><b>${c.alive_score ?? "—"}</b><span>Actividad</span></div>
    </div>
    <p class="meta">${dot("a", c.alive_status)} ${ALIVE_LABEL[c.alive_status]}${c.alive_notes ? " · " + esc(c.alive_notes) : ""}
      ${c.last_checked ? `<br>Comprobada el ${fmtDate(c.last_checked)}` : ""}<br>Fuentes: ${esc((c.sources || []).join(", "))}</p>
    <h3>Emails</h3>
    <div class="emails">${c.emails.length ? c.emails.map((e) => `<div>${esc(e)}<button data-copy="${esc(e)}">Copiar</button></div>`).join("") : '<p class="hint">Sin email todavía. Verifica la empresa o añádelo a mano.</p>'}</div>
    <div class="row"><input id="d-email" placeholder="Añadir email" style="flex:1"><button id="d-add-email">Añadir</button></div>
    <h3>Estado</h3>
    <div class="row">
      <select id="d-status">${STATUSES.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select>
      <button id="d-fav">${c.favorite ? "★ Favorita" : "☆ Favorita"}</button>
    </div>
    <p class="meta">Último envío: ${fmtDate(c.last_sent)} · Respuesta: ${fmtDate(c.last_reply)}</p>
    <h3>Notas</h3>
    <textarea id="d-notes" placeholder="Con quién hablar, qué hacen, ideas…">${esc(c.notes || "")}</textarea>
    <h3>Correo</h3>
    <div class="row"><button id="d-preview">Vista previa</button><button id="d-send" class="primary">Enviar</button><button id="d-verify">Verificar</button><button id="d-del" class="danger">Eliminar</button></div>
    <div id="d-prev"></div>`;
  $("#drawer").classList.add("on"); $("#drawer").setAttribute("aria-hidden", "false");
  const save = async (fields) => { must(await sb.from("companies").update(fields).eq("id", id)); loadList(true); loadStats(); };
  $("#d-status").onchange = (e) => save({ status: e.target.value }).then(() => toast("Estado guardado"));
  $("#d-notes").onblur = (e) => save({ notes: e.target.value });
  $("#d-fav").onclick = () => save({ favorite: !c.favorite }).then(() => openDrawer(id));
  $("#d-add-email").onclick = () => { const v = $("#d-email").value.trim().toLowerCase(); if (v) save({ emails: [...c.emails, v] }).then(() => openDrawer(id)); };
  $$("[data-copy]").forEach((b) => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast("Copiado"); });
  $("#d-preview").onclick = () => {
    const p = render(c, c.status === "sin_respuesta" ? "followup" : "first");
    $("#d-prev").innerHTML = `<div class="preview">Para: ${esc(p.to || "—")}\nAsunto: ${esc(p.subject)}\n\n${esc(p.body)}</div>`;
  };
  $("#d-send").onclick = async () => {
    if (!c.emails.length) return toast("Esta empresa no tiene email");
    const kind = c.status === "sin_respuesta" ? "followup" : "first";
    if (!confirm(`¿Enviar ${kind === "followup" ? "el seguimiento" : "el primer correo"} a ${c.name} <${c.emails[0]}>?`)) return;
    try { await queueJob("send", `${kind === "followup" ? "Seguimiento" : "Envío"} a ${c.name}`, { ids: [id], kind }); } catch (err) { toast(err.message); }
  };
  $("#d-verify").onclick = () => queueJob("verify", `Verificar ${c.name}`, { ids: [id] }).catch((err) => toast(err.message));
  $("#d-del").onclick = async () => { if (confirm("¿Eliminar esta empresa?")) { must(await sb.from("companies").delete().eq("id", id)); closeDrawer(); loadList(true); loadStats(); } };
}
function closeDrawer() { $("#drawer").classList.remove("on"); $("#drawer").setAttribute("aria-hidden", "true"); }
$("#drawer-close").onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// ------------------------------------------------------------------ map
let map, cluster, mapReq = 0;
function initMap() {
  if (map) return;
  map = L.map("map", { worldCopyJump: true, minZoom: 2, zoomControl: !mobile() }).setView([30, 5], 2);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19, className: dark ? "tiles-dark" : "tiles-light",
  }).addTo(map);
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true,
    iconCreateFunction: (cl) => {
      const n = cl.getChildCount();
      const size = n < 10 ? 26 : n < 100 ? 32 : n < 1000 ? 40 : 48;
      return L.divIcon({ html: `<div class="cl" style="width:${size}px;height:${size}px">${n}</div>`, className: "", iconSize: [size, size] });
    },
  });
  map.addLayer(cluster);
  $("#legend").innerHTML = Object.entries(STATUS_LABEL).map(([k, v]) => `<span>${dot("s", k)} ${v}</span>`).join("");
}
async function loadMap() {
  initMap();
  const my = ++mapReq;
  $("#map-note").textContent = "Cargando…";
  const data = must(await sb.rpc("atlas_map", { f: currentFilters(), lim: mobile() ? 15000 : 40000 }));
  if (my !== mapReq) return;
  cluster.clearLayers();
  const colors = Object.fromEntries(STATUSES.map((k) => [k, css(`--s-${k}`) || "#999"]));
  const icons = {};
  const iconFor = (st, dead) => icons[st + dead] ||= L.divIcon({ className: "", html: `<div class="pin" style="background:${colors[st]};opacity:${dead ? .35 : 1}"></div>`, iconSize: [12, 12] });
  const markers = data.rows.map(([id, name, lat, lon, cat, st, alive, fit]) => {
    const m = L.marker([lat, lon], { icon: iconFor(st, alive === "inactiva") });
    m.on("click", () => openDrawer(id));
    if (!mobile()) m.bindTooltip(`${esc(name)} · ${CAT_SHORT[cat] || ""} · ${fit}`, { direction: "top", offset: [0, -6] });
    return m;
  });
  cluster.addLayers(markers);
  const f = currentFilters();
  if (markers.length && (f.country_code || f.q || !loadMap._fitted)) {
    const bb = cluster.getBounds();
    if (bb.isValid()) map.fitBounds(bb.pad(0.05), { maxZoom: 12 });
    loadMap._fitted = true;
  }
  $("#map-note").textContent = data.total > data.rows.length
    ? `Las ${data.rows.length.toLocaleString("es-ES")} con mejor encaje de ${data.total.toLocaleString("es-ES")}. Filtra para ver el resto.`
    : `${data.rows.length.toLocaleString("es-ES")} empresas`;
  setTimeout(() => map.invalidateSize(), 50);
}

// ------------------------------------------------------------------ views
function show(view) {
  state.view = view;
  $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === `view-${view}`));
  document.body.dataset.view = view;
  if (view === "map") loadMap();
  if (view === "mail") loadMail();
  if (view === "search") loadJobs();
}
$$("#nav button").forEach((b) => b.onclick = () => show(b.dataset.view));
document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) show(g.dataset.goto); });
$("#filters-toggle").onclick = () => document.body.classList.toggle("show-filters");

// ------------------------------------------------------------------ search & jobs
function buildSearchUI() {
  const off = ["marketing", "web"];
  $("#cat-chips").innerHTML = Object.entries(CAT_LONG).map(([k, v]) => `<label><input type="checkbox" value="${k}" ${off.includes(k) ? "" : "checked"}> ${esc(v)}</label>`).join("");
  $("#region-chips").innerHTML = `<button data-region="" class="on">Todo el mundo</button>` + Object.keys(REGIONS).map((r) => `<button data-region="${esc(r)}">${esc(r)}</button>`).join("");
  $("#region-chips").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $$("#region-chips button").forEach((x) => x.classList.toggle("on", x === b));
    $("#countries").value = b.dataset.region ? REGIONS[b.dataset.region].join(", ") : "";
  };
}
$("#start-search").onclick = async () => {
  const countries = $("#countries").value.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  const params = {
    sources: $$("#src-chips input:checked").map((i) => i.value),
    categories: $$("#cat-chips input:checked").map((i) => i.value),
    countries, verify_top: $("#opt-verify").checked ? +$("#verify-n").value || 0 : 0,
    force: $("#opt-force").checked, deep: $("#opt-deep").checked,
  };
  if (!params.sources.length || !params.categories.length) return toast("Elige al menos una fuente y un tipo");
  if (!countries.length && !confirm("Buscar en todo el mundo puede traer cientos de miles de empresas y llenar el espacio gratuito (unas 400.000). ¿Seguir?")) return;
  try { await queueJob("discover", "Búsqueda: " + (countries.join(", ") || "todo el mundo"), params); } catch (e) { toast(e.message); }
};
$("#verify-pending").onclick = () => queueJob("verify", "Verificar más (filtro actual)", { filters: currentFilters(), limit: +$("#verify-n").value || 500 }).catch((e) => toast(e.message));
$("#add-form").onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const dom = d.website ? domainOf(d.website) : null;
  const res = must(await sb.rpc("atlas_import", { rows: [{ ...d, domain: dom, website: dom ? "https://" + dom : null, emails: (d.emails || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) }] }));
  if (res.added) { toast("Añadida; verificándola en la nube"); queueJob("verify", `Verificar ${d.name}`, { ids: res.ids }); }
  else toast("Ya existía");
  e.target.reset(); loadList(true); loadStats();
};
$("#import").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rows = parseCSV(await f.text());
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  const pick = (r, ...k) => { for (const key of k) { const i = head.indexOf(key); if (i >= 0 && r[i]) return r[i].trim(); } return ""; };
  const items = rows.map((r) => {
    const site = pick(r, "website", "web", "url"); const dom = site ? domainOf(site) : null;
    return { name: pick(r, "name", "nombre", "empresa"), domain: dom, website: dom ? "https://" + dom : null,
      emails: pick(r, "emails", "email").split(/[;,]/).map((x) => x.trim().toLowerCase()).filter(Boolean),
      instagram: pick(r, "instagram"), city: pick(r, "city", "ciudad"), country_code: pick(r, "country_code", "pais_codigo"),
      category: pick(r, "category", "tipo"), notes: pick(r, "notes", "notas") };
  }).filter((x) => x.name);
  let added = 0;
  for (let i = 0; i < items.length; i += 500) added += must(await sb.rpc("atlas_import", { rows: items.slice(i, i + 500) })).added;
  toast(`${added} empresas importadas`); e.target.value = ""; loadList(true); loadStats();
};
function parseCSV(text) {
  const out = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === "," || ch === ";") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}
$("#export").onclick = async () => {
  const cols = ["name", "website", "emails", "instagram", "linkedin", "city", "country_code", "category", "tags", "fit_score", "freelance_score", "boutique_score", "alive_status", "alive_notes", "status", "last_sent", "last_reply", "notes", "description"];
  const all = []; const f = currentFilters();
  toast("Preparando CSV…");
  for (let off = 0; off < 50000; off += 500) {
    const d = must(await sb.rpc("atlas_companies", { f, lim: 500, off }));
    all.push(...d.items);
    if (all.length >= d.total) break;
  }
  const cell = (v) => { v = Array.isArray(v) ? v.join("; ") : (v ?? ""); v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const csv = "﻿" + [cols.join(","), ...all.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "studio-atlas.csv" });
  a.click();
};

async function loadJobs() {
  state.jobs = must(await sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(15));
  renderJobs();
}
function renderJobs() {
  const js = state.jobs;
  $("#jobs").innerHTML = js.length ? js.map((j) => {
    const pct = j.total ? Math.round((j.done / j.total) * 100) : (j.status === "running" ? 3 : j.status === "queued" ? 0 : 100);
    const end = j.finished_at ? new Date(j.finished_at) : new Date();
    const el = j.started_at ? Math.max(0, Math.round((end - new Date(j.started_at)) / 1000)) : 0;
    const t = el >= 60 ? `${Math.floor(el / 60)} min ${el % 60} s` : `${el} s`;
    const label = { queued: "arrancando…", done: "terminada", error: "error", cancelled: "cancelada" }[j.status];
    const active = j.status === "running" || j.status === "queued";
    return `<div class="job"><header><b>${esc(j.label || j.kind)}</b>
      ${active ? `<button class="ghost" data-cancel="${j.id}" ${j.cancel_requested ? "disabled" : ""}>${j.cancel_requested ? "Cancelando…" : "Cancelar"}</button>` : ""}
      ${label ? `<span class="st">${label}</span>` : ""}</header>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="st">${j.done || 0}/${j.total || "?"} pasos · ${(j.found || 0).toLocaleString("es-ES")} resultados${el ? " · " + t : ""}${j.phase ? " · " + esc(j.phase) : ""}
        ${j.run_url ? ` · <a href="${esc(j.run_url)}" target="_blank" rel="noopener">registro</a>` : ""}</div>
      <pre>${esc((j.logs || []).slice(-10).join("\n"))}</pre></div>`;
  }).join("") : `<p class="hint">No hay tareas todavía.</p>`;
  $$("[data-cancel]").forEach((b) => b.onclick = async () => {
    b.textContent = "Cancelando…"; b.disabled = true;
    const j = state.jobs.find((x) => x.id === b.dataset.cancel);
    const upd = j && j.status === "queued" ? { cancel_requested: true, status: "cancelled", finished_at: new Date().toISOString() } : { cancel_requested: true };
    must(await sb.from("jobs").update(upd).eq("id", b.dataset.cancel));
  });
}
function subscribeJobs() {
  sb.channel("jobs").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, (p) => {
    const row = p.new;
    if (!row || !row.id) return;
    const i = state.jobs.findIndex((x) => x.id === row.id);
    if (i >= 0) state.jobs[i] = row; else state.jobs.unshift(row);
    if (state.view === "search") renderJobs();
    if (["done", "cancelled", "error"].includes(row.status)) { loadStats(); loadList(true); }
  }).subscribe();
}

// ------------------------------------------------------------------ mail
async function loadSettings() {
  const rows = must(await sb.from("settings").select("key,value"));
  state.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
async function loadMail() {
  await loadSettings();
  const s = state.settings;
  $("#gmail-status").innerHTML = s.gmail_configured
    ? `Conectado${s.gmail_account ? ` como <b>${esc(s.gmail_account)}</b>` : ""}<br><span class="hint">Última sincronización: ${s.gmail_last_sync ? new Date(s.gmail_last_sync).toLocaleString("es-ES") : "aún no"}</span>`
    : `Gmail aún no está conectado. Sigue el paso «Conectar Gmail» de la guía; solo se hace una vez.`;
  for (const k of ["my_name", "my_web", "daily_limit", "follow_up_days", "delay_min", "delay_max"]) $(`#s-${k}`).value = s[k] ?? "";
  $("#tpl").value = s[state.tpl] || "";
}
$("#tpl-tabs").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.settings[state.tpl] = $("#tpl").value;
  state.tpl = b.dataset.tpl;
  $$("#tpl-tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("#tpl").value = state.settings[state.tpl] || "";
};
$("#save-mail").onclick = async () => {
  state.settings[state.tpl] = $("#tpl").value;
  const keys = ["template_es", "template_en", "followup_es", "followup_en"];
  const rows = keys.map((k) => ({ key: k, value: state.settings[k] ?? "" }));
  for (const k of ["my_name", "my_web"]) rows.push({ key: k, value: $(`#s-${k}`).value });
  for (const k of ["daily_limit", "follow_up_days", "delay_min", "delay_max"]) rows.push({ key: k, value: +$(`#s-${k}`).value });
  must(await sb.from("settings").upsert(rows));
  $("#saved").textContent = "Guardado"; setTimeout(() => ($("#saved").textContent = ""), 2000);
};
$("#gmail-sync").onclick = () => queueJob("gmail_sync", "Sincronizar Gmail", {}).catch((e) => toast(e.message));
$("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

// ------------------------------------------------------------------ stats & init
async function loadStats() {
  const s = must(await sb.rpc("atlas_stats"));
  const a = s.alive_status || {}, st = s.status || {};
  const n = (x) => (x || 0).toLocaleString("es-ES");
  $("#kpis").innerHTML = `<span><b>${n(s.total)}</b> empresas</span><span><b>${n(a.activa)}</b> activas</span>
    <span><b>${n(s.with_email)}</b> con email</span><span><b>${n((st.enviado || 0) + (st.sin_respuesta || 0))}</b> esperando</span><span><b>${n(st.respondido)}</b> respuestas</span>`;
  const cur = $("#f-country").value;
  $("#f-country").innerHTML = `<option value="">Todos los países</option>` + s.countries.map((c) => `<option value="${c.country_code}">${esc(countryName(c.country_code, c.country))} (${n(c.n)})</option>`).join("");
  $("#f-country").value = cur;
  $("#storage-hint").textContent = `Tienes ${n(s.total)} empresas guardadas. El plan gratuito admite unas 400.000; busca por regiones si quieres afinar.`;
}

let inited = false;
async function init() {
  if (inited) return;
  await loadStats();          // throws "no autorizado" for strangers
  inited = true;
  $("#f-category").innerHTML += Object.entries(CAT_SHORT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("#f-status").innerHTML += STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("");
  $("#bulk-status").innerHTML += STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("");
  buildSearchUI();
  $$("#filters input, #filters select").forEach((el) => el.addEventListener(el.type === "search" ? "input" : "change", onFilter));
  document.body.dataset.view = "list";
  await Promise.all([loadList(true), loadSettings(), loadJobs()]);
  subscribeJobs();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
