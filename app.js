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
const state = { items: [], total: 0, offset: 0, sel: new Set(), settings: {}, tpl: "template_es", view: "cgi", jobs: [],
  cgi: { items: [], total: 0, offset: 0, sel: new Set() }, vsrc: "list" };
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
    segment: $("#f-segment").value,
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
  $("#list-count").textContent = `${state.total.toLocaleString("es-ES")} empresas con este filtro`;
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
    <div class="row">
      ${c.website ? `<button class="primary" data-view-open="web">Ver web aquí</button>` : ""}
      ${c.instagram ? `<button data-view-open="ig">Ver Instagram aquí</button>` : ""}
    </div>
    <div class="links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l} ↗</a>`).join("")}</div>
    ${c.segment === "cgi" ? cgiEvidenceHtml(c) : ""}
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
  state.current = c;
  $$("[data-tier-set]").forEach((b) => b.onclick = async () => {
    must(await sb.from("companies").update({ cgi_tier: b.dataset.tierSet }).eq("id", c.id));
    toast(b.dataset.tierSet === "confirmado" ? "Confirmado como estudio CGI" : "Descartado");
    loadCgi(true); loadCgiStats(); openDrawer(c.id);
  });
  $$("[data-view-open]").forEach((b) => b.onclick = () => { setViewerMode(c.segment === "cgi" && state.view === "cgi" ? "cgi" : "list"); openViewer(c, b.dataset.viewOpen); });
  if (!$("#viewer").hidden) openViewer(c, viewerTab(c));
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (!$("#viewer").hidden) closeViewer(); else closeDrawer(); }
});

// ------------------------------------------------------------------ quick viewer (check a studio without leaving)
const igHandle = (u) => { const m = (u || "").match(/instagram\.com\/([A-Za-z0-9._]{2,30})/); return m ? m[1] : null; };
const shotUrl = (u) => `https://s0.wp.com/mshots/v1/${encodeURIComponent(u)}?w=1280&h=960`;
const shotFallback = (u) => `https://image.thum.io/get/width/1280/crop/960/${u}`;
function viewerTab(c) {
  if (state.vsrc === "cgi" && c.instagram) return "ig";
  return c.website ? (c.frameable === false ? "shot" : "web") : (c.instagram ? "ig" : "web");
}
const vlist = () => (state.vsrc === "cgi" ? state.cgi : state);
function setViewerMode(src) {
  state.vsrc = src;
  const cgi = src === "cgi";
  $("#v-alive").textContent = cgi ? "✓ Confirmar" : "✓ Activa";
  $("#v-alive").title = cgi ? "Es un estudio CGI como los que busco (A)" : "Marcar activa (A)";
  $("#v-dead").textContent = cgi ? "✗ Descartar" : "✗ Inactiva";
  $("#v-dead").title = cgi ? "No encaja (I)" : "Marcar inactiva (I)";
}

function openViewer(c, tab) {
  state.vc = c;
  const v = $("#viewer");
  v.hidden = false;
  $("#v-name").textContent = c.name;
  const L = vlist();
  const i = L.items.findIndex((x) => x.id === c.id);
  const extra = c.ig_followers != null ? ` · ${fmtNum(c.ig_followers)} seguidores · ${c.cgi_score ?? 0} pts` : "";
  $("#v-pos").textContent = (i >= 0 ? `${i + 1} de ${L.total.toLocaleString("es-ES")} · ` : "") + [c.city, countryName(c.country_code, c.country)].filter(Boolean).join(", ") + extra;
  $$("#v-tabs button").forEach((b) => {
    const ok = b.dataset.v === "ig" ? !!igHandle(c.instagram) : !!c.website;
    b.classList.toggle("off", !ok);
    b.classList.toggle("on", b.dataset.v === tab);
  });
  showViewerTab(tab);
}
function showViewerTab(tab) {
  const c = state.vc, frame = $("#v-frame"), shot = $("#v-shot"), empty = $("#v-empty");
  $$("#v-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === tab));
  frame.hidden = shot.hidden = empty.hidden = true;
  frame.removeAttribute("src");
  if (tab === "ig") {
    const h = igHandle(c.instagram);
    if (!h) return showEmpty("Esta empresa no tiene Instagram guardado.");
    frame.hidden = false;
    frame.src = `https://www.instagram.com/${h}/embed/`;
    $("#v-open").href = `https://www.instagram.com/${h}/`;
    return;
  }
  if (!c.website) return showEmpty("Esta empresa no tiene web guardada.");
  $("#v-open").href = c.website;
  if (tab === "shot" || c.frameable === false) {
    shot.hidden = false;
    const img = $("#v-img");
    img.onerror = () => { if (!img.src.includes("thum.io")) img.src = shotFallback(c.website); };
    img.src = shotUrl(c.website);
    $("#v-shot-note").textContent = c.frameable === false
      ? "Esta web no se deja mostrar dentro de otra página, así que ves una captura. Si sale «generando», pulsa Captura otra vez en unos segundos."
      : "Captura reciente de la web. Si sale «generando», pulsa Captura otra vez en unos segundos.";
    return;
  }
  frame.hidden = false;
  frame.src = c.website;
}
function showEmpty(msg) { $("#v-empty").hidden = false; $("#v-empty").textContent = msg; }
function closeViewer() { $("#viewer").hidden = true; $("#v-frame").removeAttribute("src"); }
$("#v-close").onclick = closeViewer;
$("#v-tabs").onclick = (e) => { const b = e.target.closest("button"); if (b && !b.classList.contains("off")) showViewerTab(b.dataset.v); };

async function stepViewer(dir, fromIndex) {
  const L = vlist();
  let i = (fromIndex ?? L.items.findIndex((x) => x.id === state.vc?.id)) + dir;
  if (i >= L.items.length && L.items.length < L.total) await (state.vsrc === "cgi" ? loadCgi(false) : loadList(false));
  if (i < 0 || i >= L.items.length) {
    if (state.vsrc === "cgi" && !L.items.length) { closeViewer(); closeDrawer(); return toast("Revisión terminada: no quedan estudios con este filtro"); }
    return toast(dir > 0 ? "No hay más con este filtro" : "Es la primera");
  }
  openDrawer(L.items[i].id);   // the drawer refreshes the open viewer with the full record
}
async function markViewer(fields, msg) {
  const c = state.vc; if (!c) return;
  must(await sb.from("companies").update(fields).eq("id", c.id));
  const L = vlist();
  const i = L.items.findIndex((x) => x.id === c.id);
  if (i >= 0) Object.assign(L.items[i], fields);
  toast(msg);
  if (state.vsrc === "cgi") {
    // in review mode the item leaves the current list (e.g. "Para revisar"), so continue from the same position
    const stillIn = cgiFilters().cgi_tier.split(",").includes(fields.cgi_tier);
    if (!stillIn && i >= 0) { L.items.splice(i, 1); L.total -= 1; renderCgi(); loadCgiStats(); return stepViewer(0, i); }
    renderCgi(); loadCgiStats(); return stepViewer(1);
  }
  renderList(); loadStats();
  stepViewer(1);
}
$("#v-prev").onclick = () => stepViewer(-1);
$("#v-next").onclick = () => stepViewer(1);
$("#v-alive").onclick = () => state.vsrc === "cgi"
  ? markViewer({ cgi_tier: "confirmado" }, "Confirmado como estudio CGI")
  : markViewer({ alive_status: "activa", alive_notes: "Revisada a mano: activa" }, "Marcada como activa");
$("#v-dead").onclick = () => state.vsrc === "cgi"
  ? markViewer({ cgi_tier: "descartado_manual" }, "Descartado")
  : markViewer({ alive_status: "inactiva", alive_notes: "Revisada a mano: inactiva" }, "Marcada como inactiva");
$("#v-del").onclick = async () => {
  const c = state.vc; if (!c) return;
  const L = vlist();
  const i = L.items.findIndex((x) => x.id === c.id);
  must(await sb.from("companies").delete().eq("id", c.id));
  if (i >= 0) { L.items.splice(i, 1); L.total -= 1; }
  state.vsrc === "cgi" ? (renderCgi(), loadCgiStats()) : renderList();
  loadStats();
  toast(`${c.name} eliminada`);
  const next = L.items[i];
  if (next) openDrawer(next.id); else { closeViewer(); closeDrawer(); }
};
document.addEventListener("keydown", (e) => {
  if ($("#viewer").hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (e.key === "ArrowRight") $("#v-next").click();
  else if (e.key === "ArrowLeft") $("#v-prev").click();
  else if (e.key.toLowerCase() === "a") $("#v-alive").click();
  else if (e.key.toLowerCase() === "i") $("#v-dead").click();
  else if (e.key === "Delete") $("#v-del").click();
});
$("#review-start").onclick = () => {
  setViewerMode("list");
  const c = state.items[0];
  if (!c) return toast("No hay empresas con este filtro");
  openDrawer(c.id); openViewer(c, viewerTab(c));
};
$("#delete-inactive").onclick = async () => {
  const f = { ...currentFilters(), alive_status: "inactiva" };
  delete f.sort;
  const n = must(await sb.rpc("atlas_companies", { f, lim: 1, off: 0 })).total;
  if (!n) return toast("No hay inactivas con este filtro");
  if (!confirm(`¿Eliminar ${n.toLocaleString("es-ES")} empresas inactivas${Object.keys(f).length > 1 ? " (con el filtro actual)" : ""}? Quedan apuntadas como descartadas y no volverán en búsquedas futuras.`)) return;
  const d = must(await sb.rpc("atlas_delete", { f }));
  toast(`${d.toLocaleString("es-ES")} empresas eliminadas`);
  loadList(true); loadStats();
};

// ------------------------------------------------------------------ Estudios CGI
const TIER_LABEL = { semilla: "Referencia", confirmado: "Confirmado", auto: "Verificado auto", revisar: "Revisar", descartado: "Descartado", descartado_manual: "Descartado" };
const CGI_TERMS = ["cgi studio", "3d studio", "creative studio cgi", "design and direction studio", "houdini studio", "cgi design studio",
  "vfx studio", "3d design studio", "cgi agency", "visual studio 3d", "cgi music video", "creative studio", "motion and cgi studio", "cgi production studio"];
const DEFAULT_SEEDS = ["sideeye.mov", "onesal_studio", "looop.studio", "tendril.studio", "someform.studio", "bureauklausalman",
  "notreal.tv", "fluentstudio", "zunc.studio", "erasestudio", "here.creative"];
const fmtNum = (n) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".0", "") + "k" : String(n);
const ago = (d) => { if (!d) return "—"; const days = Math.round((Date.now() - new Date(d)) / 864e5); return days <= 0 ? "hoy" : days < 31 ? `hace ${days} d` : days < 365 ? `hace ${Math.round(days / 30)} m` : `hace ${Math.round(days / 365)} a`; };

function cgiFilters() {
  const f = { segment: "cgi", cgi_tier: $("#c-tier").value, q: $("#c-q").value.trim(), country_code: $("#c-country").value,
    min_followers: $("#c-followers").value, status: $("#c-status").value, sort: $("#c-sort").value };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "" && v != null));
}
async function loadCgi(reset) {
  const C = state.cgi;
  if (reset) { C.offset = 0; C.items = []; }
  const data = must(await sb.rpc("atlas_companies", { f: cgiFilters(), lim: 60, off: C.offset }));
  C.total = data.total; C.items = C.items.concat(data.items); C.offset += data.items.length;
  renderCgi();
}
function cgiCard(c) {
  const ev = c.cgi_evidence || {};
  const chips = (ev.cgi || []).slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join("")
    + (ev.clients || []).slice(0, 3).map((t) => `<span class="tag client">${esc(t)}</span>`).join("")
    + (ev.neg || []).slice(0, 2).map((t) => `<span class="tag neg">${esc(t)}</span>`).join("");
  const initial = esc((c.name || c.ig_username || "?").trim()[0]?.toUpperCase() || "?");
  const pic = c.ig_pic ? `<img src="${esc(c.ig_pic)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : "";
  const where = [c.city, countryName(c.country_code, c.country)].filter(Boolean).join(", ");
  const sel = state.cgi.sel.has(c.id);
  return `<article class="cgi-card ${sel ? "sel" : ""}" data-cid="${c.id}">
    <input type="checkbox" class="csel" data-csel="${c.id}" ${sel ? "checked" : ""} aria-label="Seleccionar">
    <div class="cc-top"><div class="avatar">${initial}${pic}</div>
      <div class="cc-name"><b>${esc(c.name)}</b><span class="sub">@${esc(c.ig_username || "")}${where ? " · " + esc(where) : ""}</span></div>
      <div class="ring" style="--s:${c.cgi_score || 0}" title="Puntuación CGI"><span>${c.cgi_score ?? 0}</span></div></div>
    <div class="cc-stats"><span><b>${fmtNum(c.ig_followers)}</b> seguidores</span><span><b>${fmtNum(c.ig_posts)}</b> posts</span><span>${ago(c.ig_last_post)}</span>${c.emails.length ? "<span>✉</span>" : ""}</div>
    <div class="cc-chips">${chips}</div>
    <div class="cc-foot"><span class="tier ${esc(c.cgi_tier || "")}">${TIER_LABEL[c.cgi_tier] || "—"}</span>
      <span class="pill" title="${STATUS_LABEL[c.status] || ""}">${dot("s", c.status)}<span class="st-txt">${STATUS_LABEL[c.status] || ""}</span></span><span class="grow"></span>
      <button data-cig="${c.id}" title="Ver su Instagram aquí">Instagram</button>
      ${["semilla", "confirmado"].includes(c.cgi_tier) ? "" : `<button data-ctier="confirmado" data-id="${c.id}" title="Confirmar">✓</button>`}
      ${["descartado", "descartado_manual"].includes(c.cgi_tier) ? "" : `<button data-ctier="descartado_manual" data-id="${c.id}" title="Descartar">✗</button>`}
    </div></article>`;
}
function renderCgi() {
  const C = state.cgi;
  $("#cgi-grid").innerHTML = C.items.map(cgiCard).join("");
  $("#c-empty").hidden = C.total > 0;
  $("#c-empty-msg").textContent = $("#c-tier").value === "revisar" ? "No hay estudios pendientes de revisar." : "Aún no hay estudios con este filtro.";
  $("#c-count").textContent = C.total ? `${C.items.length} de ${C.total.toLocaleString("es-ES")}` : "";
  $("#c-more").hidden = C.items.length >= C.total;
  $("#c-bulkbar").classList.toggle("on", C.sel.size > 0);
  $("#c-sel-count").textContent = `${C.sel.size} seleccionados`;
}
async function loadCgiStats() {
  const s = must(await sb.rpc("atlas_cgi_stats"));
  const t = s.tiers || {};
  const mine = (t.semilla || 0) + (t.confirmado || 0);
  $("#cgi-kpis").innerHTML = `<div><b>${mine}</b><span>Confirmados</span></div><div><b>${t.auto || 0}</b><span>Verificados auto</span></div>
    <div><b>${t.revisar || 0}</b><span>Para revisar</span></div><div><b>${s.with_email || 0}</b><span>Con email</span></div><div><b>${s.contacted || 0}</b><span>Contactados</span></div>`;
  const cur = $("#c-country").value;
  $("#c-country").innerHTML = `<option value="">Todo el mundo</option>` + (s.countries || []).map((c) => `<option value="${c.country_code}">${esc(countryName(c.country_code))} (${c.n})</option>`).join("");
  $("#c-country").value = cur;
  state.cgiStats = s;
  renderCgiPanelInfo();
}
["#c-tier", "#c-country", "#c-followers", "#c-status", "#c-sort"].forEach((id) => $(id).addEventListener("change", () => loadCgi(true)));
let cTimer; $("#c-q").addEventListener("input", () => { clearTimeout(cTimer); cTimer = setTimeout(() => loadCgi(true), 250); });
$("#c-more").onclick = () => loadCgi(false);
$("#cgi-grid").addEventListener("click", async (e) => {
  const sel = e.target.closest("[data-csel]");
  if (sel) { const id = +sel.dataset.csel; sel.checked ? state.cgi.sel.add(id) : state.cgi.sel.delete(id); return renderCgi(); }
  const ig = e.target.closest("[data-cig]");
  if (ig) { const c = state.cgi.items.find((x) => x.id === +ig.dataset.cig); setViewerMode("cgi"); openDrawer(c.id); openViewer(c, "ig"); return; }
  const tb = e.target.closest("[data-ctier]");
  if (tb) {
    must(await sb.from("companies").update({ cgi_tier: tb.dataset.ctier }).eq("id", +tb.dataset.id));
    toast(tb.dataset.ctier === "confirmado" ? "Confirmado como estudio CGI" : "Descartado");
    loadCgi(true); loadCgiStats(); return;
  }
  const card = e.target.closest("[data-cid]");
  if (card) { setViewerMode("cgi"); openDrawer(+card.dataset.cid); }
});
$("#c-review").onclick = () => {
  const C = state.cgi;
  if (!C.items.length) return toast("No hay estudios con este filtro");
  setViewerMode("cgi"); openDrawer(C.items[0].id); openViewer(C.items[0], "ig");
};
$("#c-bulkbar").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-cbulk]"); if (!b) return;
  const ids = [...state.cgi.sel], act = b.dataset.cbulk;
  try {
    if (act === "clear") state.cgi.sel.clear();
    if (act === "confirm" || act === "discard") {
      must(await sb.from("companies").update({ cgi_tier: act === "confirm" ? "confirmado" : "descartado_manual" }).in("id", ids));
      state.cgi.sel.clear(); toast(act === "confirm" ? `${ids.length} confirmados` : `${ids.length} descartados`); loadCgiStats();
    }
    if (act === "send") {
      if (!confirm(`¿Enviar el primer correo a ${ids.length} estudios? Solo a los que tengan email y no hayas contactado, respetando tu límite diario.`)) return;
      await queueJob("send", `Envío a ${ids.length} estudios CGI`, { ids, kind: "first" });
    }
    if (act === "refresh") await queueJob("cgi_refresh", `Actualizar ${ids.length} estudios CGI`, { ids });
    loadCgi(true);
  } catch (err) { toast(err.message); }
});
function cgiEvidenceHtml(c) {
  const ev = c.cgi_evidence || {}, p = ev.parts || {};
  const part = (k, label) => p[k] == null ? "" : `<div><span>${label}</span> ${p[k]}</div>`;
  return `<div class="cgi-ev">
    <div class="row" style="margin:0;justify-content:space-between"><b>Verificación CGI · ${c.cgi_score ?? 0} pts</b><span class="tier ${esc(c.cgi_tier || "")}">${TIER_LABEL[c.cgi_tier] || "—"}</span></div>
    <div class="cc-stats" style="margin-top:6px"><span><b>${fmtNum(c.ig_followers)}</b> seguidores</span><span><b>${fmtNum(c.ig_posts)}</b> posts</span><span>último post ${ago(c.ig_last_post)}</span>${c.ig_category ? `<span>${esc(c.ig_category)}</span>` : ""}</div>
    <div class="parts">${part("cgi", "CGI")}${part("estudio", "Estudio")}${part("clientes", "Clientes")}${part("tamaño", "Tamaño")}${part("red", "Red")}${part("resta", "Resta")}</div>
    <div class="cc-chips" style="margin-top:8px">${(ev.cgi || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${(ev.clients || []).map((t) => `<span class="tag client">${esc(t)}</span>`).join("")}${(ev.neg || []).map((t) => `<span class="tag neg">${esc(t)}</span>`).join("")}</div>
    ${(ev.notes || []).length ? `<p class="hint" style="margin:6px 0 0">${ev.notes.map(esc).join(" · ")}</p>` : ""}
    <div class="row" style="margin:10px 0 0">
      <button class="primary" data-tier-set="confirmado">✓ Es un estudio como los que busco</button>
      <button data-tier-set="descartado_manual">✗ Descartar</button>
    </div></div>`;
}

// search panel
function buildCgiPanel() {
  $("#cp-terms").innerHTML = CGI_TERMS.map((t) => `<label><input type="checkbox" value="${esc(t)}"> ${esc(t)}</label>`).join("");
  const upd = () => {
    const terms = $$("#cp-terms input:checked").length;
    $("#cp-cost").textContent = `Leerá como máximo ${(+$("#cp-budget").value).toLocaleString("es-ES")} perfiles${terms ? ` (incluidas ${terms} búsquedas en Instagram)` : ""}.`;
  };
  ["#cp-budget", "#cp-terms"].forEach((id) => $(id).addEventListener("change", upd)); upd();
}
function renderCgiPanelInfo() {
  const s = state.cgiStats || {};
  const used = s.apify?.results || 0, cap = s.apify_cap || 1800;
  $("#cp-apify").innerHTML = state.settings.apify_configured === false
    ? `Apify aún no está conectado. Añade el secreto <code>APIFY_TOKEN</code> en GitHub (mira la guía) y vuelve aquí.`
    : `Instagram vía Apify: <b>${used.toLocaleString("es-ES")}</b> de ${Number(cap).toLocaleString("es-ES")} perfiles gratis usados este mes.<br><span class="hint">Se consultan solo perfiles públicos desde los servidores de Apify: tu cuenta de Instagram nunca interviene.</span>`;
  if (!$("#cp-seeds").value) $("#cp-seeds").value = (s.seeds || DEFAULT_SEEDS).map((x) => "@" + x).join("\n");
  const miss = s.seeds_missing || [];
  $("#cp-missing").textContent = miss.length ? `No encontrados en Instagram: ${miss.map((m) => "@" + m).join(", ")}. Corrige el @ o bórralos.` : "";
}
function renderCgiJob() {
  const j = state.jobs.find((x) => x.kind && x.kind.startsWith("cgi"));
  if (!j) return ($("#cp-job").innerHTML = "");
  const pct = j.total ? Math.round((j.done / j.total) * 100) : (j.status === "running" ? 3 : 100);
  const st = { queued: "arrancando…", running: "en marcha", done: "terminada", error: "error", cancelled: "cancelada" }[j.status] || j.status;
  $("#cp-job").innerHTML = `<div class="job"><header><b>${esc(j.label)}</b><span class="st">${st}</span></header>
    <div class="prog"><i style="width:${pct}%"></i></div><div class="st">${j.phase ? esc(j.phase) : ""}</div>
    <pre>${esc((j.logs || []).slice(-8).join("\n"))}</pre></div>`;
}
const openCgiPanel = () => { $("#cgi-panel").hidden = false; renderCgiPanelInfo(); renderCgiJob(); };
$("#c-find").onclick = openCgiPanel;
$("#c-empty-find").onclick = openCgiPanel;
$("#cp-close").onclick = () => ($("#cgi-panel").hidden = true);
$("#cp-start").onclick = async () => {
  const seeds = $("#cp-seeds").value.split(/[\s,]+/).map((x) => x.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean);
  if (!seeds.length) return toast("Añade al menos un estudio de referencia");
  const params = { seeds: [...new Set(seeds)], rounds: +$("#cp-rounds").value, budget: +$("#cp-budget").value,
    terms: $$("#cp-terms input:checked").map((i) => i.value), per_term: 25, web: $("#cp-web").checked, websites: $("#cp-sites").checked };
  try {
    const row = await queueJob("cgi_discover", "Buscar estudios CGI", params);
    state.jobs.unshift(row); renderCgiJob();
  } catch (e) { toast(e.message); }
};

// ------------------------------------------------------------------ map
let map, cluster, mapReq = 0;
function initMap() {
  if (map) return;
  map = L.map("map", { worldCopyJump: true, minZoom: 2, zoomControl: !mobile() }).setView([30, 5], 2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
  }).addTo(map);
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true, zoomToBoundsOnClick: false,
    iconCreateFunction: (cl) => {
      const kids = cl.getAllChildMarkers();
      const n = kids.length;
      const sent = kids.filter((m) => CONTACTED.has(m.options.atlas.st)).length;
      const p = Math.round((sent / n) * 100);
      const size = n < 10 ? 30 : n < 100 ? 36 : n < 1000 ? 44 : 52;
      return L.divIcon({ className: "", iconSize: [size, size],
        html: `<div class="clw ${sent === n ? "all" : ""}" style="--p:${p}%;width:${size}px;height:${size}px" title="${sent} de ${n} contactadas"><div class="cl">${n}</div></div>` });
    },
  });
  cluster.on("clusterclick", (e) => showClusterList(e.layer));
  map.addLayer(cluster);
  map.on("click", () => ($("#map-list").hidden = true));
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
    const m = L.marker([lat, lon], { icon: iconFor(st, alive === "inactiva"), atlas: { id, name, cat, st, alive, fit } });
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

// what is inside a cluster: tap a circle to see its companies
const CONTACTED = new Set(["enviado", "sin_respuesta", "respondido"]);
let mlLayer = null;
function showClusterList(layer) {
  mlLayer = layer;
  const items = layer.getAllChildMarkers().map((m) => m.options.atlas).sort((a, b) => b.fit - a.fit);
  const sent = items.filter((x) => CONTACTED.has(x.st)).length;
  $("#ml-title").textContent = `${items.length.toLocaleString("es-ES")} empresas aquí`;
  $("#ml-sum").innerHTML = `${dot("s", "enviado")} ${sent} contactadas · ${items.length - sent} sin contactar`;
  const shown = items.slice(0, 300);
  $("#ml-items").innerHTML = shown.map((x) => `<li data-id="${x.id}">${dot("s", x.st)}<b>${esc(x.name)}</b><span class="num">${x.fit}</span>
      <span class="sub">${esc(CAT_SHORT[x.cat] || "")} · ${STATUS_LABEL[x.st] || ""}${x.alive === "inactiva" ? " · inactiva" : ""}</span></li>`).join("")
    + (items.length > shown.length ? `<li class="sub">… y ${items.length - shown.length} más. Pulsa «Acercar» para verlas en el mapa.</li>` : "");
  $("#map-list").hidden = false;
}
$("#ml-items").onclick = (e) => { const li = e.target.closest("li[data-id]"); if (li) openDrawer(+li.dataset.id); };
$("#ml-close").onclick = () => ($("#map-list").hidden = true);
$("#ml-zoom").onclick = () => { if (mlLayer) mlLayer.zoomToBounds({ padding: [30, 30] }); $("#map-list").hidden = true; };

// ------------------------------------------------------------------ theme (auto → light → dark)
const ICO = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const THEMES = [
  ["", ICO('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'), "Tema: automático"],
  ["light", ICO('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'), "Tema: claro"],
  ["dark", ICO('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'), "Tema: oscuro"],
];
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { t ? localStorage.setItem("atlas-theme", t) : localStorage.removeItem("atlas-theme"); } catch (e) {}
  const [, icon, label] = THEMES.find((x) => x[0] === t) || THEMES[0];
  $("#theme-toggle").innerHTML = icon; $("#theme-toggle").title = label; $("#theme-toggle").setAttribute("aria-label", label);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = css("--bg") || "#111111";
  if (map && state.view === "map") loadMap();
}
$("#theme-toggle").onclick = () => {
  const cur = document.documentElement.dataset.theme || "";
  const next = THEMES[(THEMES.findIndex((x) => x[0] === cur) + 1) % THEMES.length][0];
  applyTheme(next); toast(THEMES.find((x) => x[0] === next)[2]);
};
applyTheme(document.documentElement.dataset.theme || "");

// ------------------------------------------------------------------ views
function show(view) {
  state.view = view;
  $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("on", v.id === `view-${view}`));
  document.body.dataset.view = view;
  if (view === "map") loadMap();
  if (view === "cgi") { loadCgi(true); loadCgiStats(); }
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
      ${label ? `<span class="st">${label}</span>` : ""}
      ${active ? "" : `<button class="ghost job-del" data-del-job="${j.id}" title="Borrar tarea" aria-label="Borrar tarea">×</button>`}</header>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="st">${j.done || 0}/${j.total || "?"} pasos · ${(j.found || 0).toLocaleString("es-ES")} resultados${el ? " · " + t : ""}${j.phase ? " · " + esc(j.phase) : ""}
        ${j.run_url ? ` · <a href="${esc(j.run_url)}" target="_blank" rel="noopener">registro</a>` : ""}</div>
      <pre>${esc((j.logs || []).slice(-10).join("\n"))}</pre></div>`;
  }).join("") : `<p class="hint">No hay tareas todavía.</p>`;
  $$("[data-del-job]").forEach((b) => b.onclick = async () => {
    must(await sb.from("jobs").delete().eq("id", b.dataset.delJob));
    state.jobs = state.jobs.filter((x) => x.id !== b.dataset.delJob);
    renderJobs();
  });
  $("#jobs-clear").hidden = !js.some((j) => !["running", "queued"].includes(j.status));
  $$("[data-cancel]").forEach((b) => b.onclick = async () => {
    b.textContent = "Cancelando…"; b.disabled = true;
    const j = state.jobs.find((x) => x.id === b.dataset.cancel);
    const upd = j && j.status === "queued" ? { cancel_requested: true, status: "cancelled", finished_at: new Date().toISOString() } : { cancel_requested: true };
    must(await sb.from("jobs").update(upd).eq("id", b.dataset.cancel));
  });
}
$("#jobs-clear").onclick = async () => {
  const n = state.jobs.filter((j) => !["running", "queued"].includes(j.status)).length;
  if (!n || !confirm(`¿Borrar ${n} tareas terminadas, canceladas o con error? Las que están en marcha se quedan.`)) return;
  must(await sb.from("jobs").delete().in("status", ["done", "error", "cancelled"]));
  loadJobs(); toast("Tareas borradas");
};
function subscribeJobs() {
  sb.channel("jobs").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, (p) => {
    if (p.eventType === "DELETE") {
      state.jobs = state.jobs.filter((x) => x.id !== p.old?.id);
      if (state.view === "search") renderJobs();
      return;
    }
    const row = p.new;
    if (!row || !row.id) return;
    const i = state.jobs.findIndex((x) => x.id === row.id);
    if (i >= 0) state.jobs[i] = row; else state.jobs.unshift(row);
    if (state.view === "search") renderJobs();
    if (row.kind && row.kind.startsWith("cgi")) renderCgiJob();
    if (["done", "cancelled", "error"].includes(row.status)) {
      loadStats(); loadList(true);
      if (row.kind && row.kind.startsWith("cgi")) { loadCgi(true); loadCgiStats(); }
    }
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
  document.body.dataset.view = "cgi";
  $("#c-status").innerHTML += STATUSES.map((s) => `<option value="${s}">${STATUS_LABEL[s]}</option>`).join("");
  buildCgiPanel();
  await Promise.all([loadList(true), loadSettings(), loadJobs(), loadCgi(true), loadCgiStats()]);
  subscribeJobs();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => reg.update()).catch(() => {});
  // when a new version takes over, reload once so you see it straight away
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
boot();
