const ENC_URL = "data/schedule.enc.json";
const SESSION_KEY = "kerry-coi-unlocked-v1";

const $ = (sel) => document.querySelector(sel);

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptPayload(payload, password) {
  const salt = b64ToBytes(payload.salt);
  const iv = b64ToBytes(payload.iv);
  const data = b64ToBytes(payload.data);
  const key = await deriveKey(password, salt, payload.iter);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

function phoneDigits(raw) {
  if (!raw) return [];
  return [...raw.matchAll(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g)].map((m) =>
    m[0].replace(/\D/g, "")
  );
}

function telHref(digits) {
  return `tel:+1${digits}`;
}

function mapsHref(address) {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightImportant(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(
      /\b(BRING A SPARE HEAT KIT|CONFIRM|DO NOT|EXPIRED|ALL after-photos|ALL install photos)\b/gi,
      "<strong>$1</strong>"
    );
}

function callButtons(label, phoneField, variant = "") {
  const nums = phoneDigits(phoneField || "");
  if (!nums.length) {
    return `<span class="call call--muted" aria-disabled="true">${escapeHtml(label)} · n/a</span>`;
  }
  return nums
    .map((d, i) => {
      const extra = nums.length > 1 ? ` ${i + 1}` : "";
      return `<a class="call ${variant}" href="${telHref(d)}">${escapeHtml(label)}${extra}</a>`;
    })
    .join("");
}

function matchesQuery(haystack, q) {
  if (!q) return true;
  return haystack.toLowerCase().includes(q.toLowerCase());
}

let schedule = null;
let encPayload = null;
let activeTab = "route";

async function loadEnc() {
  const res = await fetch(ENC_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load encrypted schedule.");
  encPayload = await res.json();
}

async function tryUnlock(password) {
  schedule = await decryptPayload(encPayload, password);
  sessionStorage.setItem(SESSION_KEY, password);
  showApp();
}

function lockApp() {
  schedule = null;
  sessionStorage.removeItem(SESSION_KEY);
  $("#app").hidden = true;
  $("#lock-screen").hidden = false;
  document.title = "COI Schedule — Locked";
  $("#password").value = "";
  $("#lock-error").hidden = true;
  $("#password").focus();
}

function showApp() {
  $("#lock-screen").hidden = true;
  $("#app").hidden = false;
  document.title = "Kerry’s COI Schedule";
  $("#meta-line").textContent = `${schedule.homeBase} · Prepared ${schedule.prepared}`;
  $("#footer-meta").textContent = schedule.subtitle;
  renderAlerts();
  renderAll();
}

function renderAlerts() {
  const el = $("#alerts");
  el.innerHTML = schedule.alerts
    .map(
      (a, i) => `
      <div class="alert alert--${escapeHtml(a.level)}" style="animation-delay:${i * 40}ms">
        <span class="alert__badge">${escapeHtml(a.label)}</span>
        <span>${escapeHtml(a.text)}</span>
      </div>`
    )
    .join("");
}

function renderRoute(q) {
  const panel = $("#panel-route");
  const items = schedule.fieldRoute.filter((j) =>
    matchesQuery(
      [j.customer, j.address, j.trip, j.work, j.inspector, j.customerPhone, j.expiry].join(" "),
      q
    )
  );

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  let html = `<p class="section-head">Do them in this order. Trips radiate from Grand Falls-Windsor. Confirm the customer will be home before any long drive.</p>`;
  let lastTrip = null;

  for (const j of items) {
    if (j.trip !== lastTrip) {
      html += `<p class="trip-label">${escapeHtml(j.trip)}</p>`;
      lastTrip = j.trip;
    }
    const statusClass =
      j.expiryStatus === "expired"
        ? "expired"
        : j.expiryStatus === "urgent"
          ? "urgent"
          : j.expiryStatus === "none"
            ? "none"
            : "ok";
    const statusLabel =
      j.expiryStatus === "expired"
        ? "EXPIRED"
        : j.expiryStatus === "urgent"
          ? "2 WEEKS"
          : j.expiryStatus === "none"
            ? "NO DEADLINE"
            : "ON TRACK";

    html += `
      <article class="card">
        <div class="card__top">
          <h2 class="card__customer">
            <span class="card__order">${j.order}</span>
            ${escapeHtml(j.customer)}
          </h2>
          <span class="badge badge--${statusClass}">${statusLabel}</span>
        </div>
        <div class="meta">
          <span><a class="maps" href="${mapsHref(j.address)}" target="_blank" rel="noopener">${escapeHtml(j.address)}</a></span>
          <span>${escapeHtml(j.drive)}</span>
          <span>Grant: ${escapeHtml(j.expiry)}</span>
        </div>
        <p class="work">${highlightImportant(j.work)}</p>
        <div class="actions">
          ${callButtons("Customer", j.customerPhone)}
          ${callButtons("Inspector · " + j.inspector, j.inspectorPhone, "call--sea")}
        </div>
      </article>`;
  }

  panel.innerHTML = html;
  return items.length;
}

function renderUnblock(q) {
  const panel = $("#panel-unblock");
  const items = schedule.unblock.filter((j) =>
    matchesQuery(
      [j.customer, j.town, j.blocked, j.action, j.who, j.whoPhone, j.priority, j.expiry].join(" "),
      q
    )
  );

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  let html = `<p class="section-head">Office / phone tasks. Driving out before these are cleared wastes a day.</p>`;

  for (const j of items) {
    html += `
      <article class="card">
        <div class="card__top">
          <h2 class="card__customer">${escapeHtml(j.customer)}</h2>
          <span class="badge badge--${escapeHtml(j.priorityLevel)}">${escapeHtml(j.priority)}</span>
        </div>
        <div class="meta">
          <span>${escapeHtml(j.town)}</span>
          <span>Grant: ${escapeHtml(j.expiry)}</span>
        </div>
        <p class="work"><strong>Blocked:</strong> ${escapeHtml(j.blocked)}</p>
        <p class="work" style="margin-top:0.45rem"><strong>Action:</strong> ${escapeHtml(j.action)}</p>
        <div class="actions">
          ${callButtons(j.who || "Call", j.whoPhone, "call--sea")}
        </div>
      </article>`;
  }

  panel.innerHTML = html;
  return items.length;
}

function renderDone(q) {
  const panel = $("#panel-done");
  const items = schedule.completed.filter((j) =>
    matchesQuery([j.customer, j.town, j.note, j.label].join(" "), q)
  );

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  let html = `<p class="section-head">Listed so nothing gets lost — Kerry does not need to drive to any of these.</p>`;

  for (const j of items) {
    html += `
      <article class="card">
        <div class="card__top">
          <h2 class="card__customer">${escapeHtml(j.customer)}</h2>
          <span class="badge badge--${escapeHtml(j.status)}">${escapeHtml(j.label)}</span>
        </div>
        <div class="meta"><span>${escapeHtml(j.town)}</span></div>
        <p class="work">${escapeHtml(j.note)}</p>
      </article>`;
  }

  panel.innerHTML = html;
  return items.length;
}

function renderContacts(q) {
  const panel = $("#panel-contacts");
  const items = schedule.contacts.filter((c) =>
    matchesQuery([c.name, c.role, c.phone, c.covers].join(" "), q)
  );

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  let html = `<p class="section-head">Batch your calls — one call can book several jobs.</p>`;

  for (const c of items) {
    html += `
      <article class="card contact-card">
        <div class="card__top">
          <h2 class="card__customer">${escapeHtml(c.name)}</h2>
          <span class="badge badge--ok">${escapeHtml(c.role)}</span>
        </div>
        <p class="work">${escapeHtml(c.covers)}</p>
        <div class="actions">
          ${callButtons("Call", c.phone, "call--sea")}
        </div>
      </article>`;
  }

  panel.innerHTML = html;
  return items.length;
}

function renderAll() {
  const q = $("#search").value.trim();
  const counts = {
    route: renderRoute(q),
    unblock: renderUnblock(q),
    done: renderDone(q),
    contacts: renderContacts(q),
  };

  const visible = counts[activeTab] ?? 0;
  $("#empty").hidden = visible > 0;
  syncPanels();
}

function syncPanels() {
  const map = {
    route: "#panel-route",
    unblock: "#panel-unblock",
    done: "#panel-done",
    contacts: "#panel-contacts",
  };
  for (const [key, sel] of Object.entries(map)) {
    $(sel).hidden = key !== activeTab;
  }
  document.querySelectorAll(".tab").forEach((btn) => {
    const on = btn.dataset.tab === activeTab;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function wireUi() {
  $("#unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#unlock-btn");
    const err = $("#lock-error");
    const password = $("#password").value;
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Decrypting…";
    try {
      await tryUnlock(password);
    } catch {
      err.hidden = false;
      sessionStorage.removeItem(SESSION_KEY);
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock schedule";
    }
  });

  $("#lock-btn").addEventListener("click", lockApp);

  $("#search").addEventListener("input", () => {
    renderAll();
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderAll();
    });
  });
}

async function boot() {
  wireUi();
  await loadEnc();
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      await tryUnlock(saved);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
}

boot().catch((err) => {
  console.error(err);
  const errEl = $("#lock-error");
  errEl.textContent = "Could not load schedule file. Check the deploy.";
  errEl.hidden = false;
});
