const SESSION_KEY = "kerry-coi-unlocked-v2";

const $ = (sel) => document.querySelector(sel);

function phoneDigits(raw) {
  if (!raw) return [];
  var matches = String(raw).match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g);
  if (!matches) return [];
  return matches.map(function (m) {
    return m.replace(/\D/g, "");
  });
}

function telHref(digits) {
  return "tel:+1" + digits;
}

function mapsHref(address) {
  return "https://maps.google.com/?q=" + encodeURIComponent(address);
}

function escapeHtml(str) {
  return String(str)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

function highlightImportant(text) {
  return escapeHtml(text).replace(
    /\b(BRING A SPARE HEAT KIT|CONFIRM|DO NOT|EXPIRED|ALL after-photos|ALL install photos)\b/gi,
    "<strong>$1</strong>"
  );
}

function callButtons(label, phoneField, variant) {
  variant = variant || "";
  var nums = phoneDigits(phoneField || "");
  if (!nums.length) {
    return '<span class="call call--muted" aria-disabled="true">' + escapeHtml(label) + " · n/a</span>";
  }
  return nums
    .map(function (d, i) {
      var extra = nums.length > 1 ? " " + (i + 1) : "";
      return (
        '<a class="call ' +
        variant +
        '" href="' +
        telHref(d) +
        '">' +
        escapeHtml(label) +
        extra +
        "</a>"
      );
    })
    .join("");
}

function matchesQuery(haystack, q) {
  if (!q) return true;
  return haystack.toLowerCase().indexOf(q.toLowerCase()) !== -1;
}

function decodeSchedule() {
  if (!window.KERRY_COI_B64) {
    throw new Error("Schedule data missing. Hard-refresh the page.");
  }
  var bin = atob(window.KERRY_COI_B64);
  // decode UTF-8 safely
  try {
    return JSON.parse(decodeURIComponent(escape(bin)));
  } catch (e1) {
    return JSON.parse(bin);
  }
}

var schedule = null;
var activeTab = "route";
var dataReady = false;

function loadData() {
  if (!window.KERRY_COI_B64 || !window.KERRY_COI_PASS) {
    throw new Error("Schedule scripts did not load. Hard-refresh.");
  }
  dataReady = true;
}

function tryUnlock(password) {
  if (!dataReady) loadData();
  var cleaned = String(password || "").trim();
  if (cleaned !== window.KERRY_COI_PASS) {
    throw new Error("BAD_PASSWORD");
  }
  schedule = decodeSchedule();
  sessionStorage.setItem(SESSION_KEY, "1");
  try {
    showApp();
  } catch (renderErr) {
    console.error(renderErr);
    throw new Error("Unlocked but display failed: " + ((renderErr && renderErr.message) || renderErr));
  }
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

  const visible = counts[activeTab] || 0;
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

function setLockError(message) {
  const err = $("#lock-error");
  err.textContent = message;
  err.hidden = false;
}

function wireUi() {
  const show = document.getElementById("show-password");
  if (show) {
    show.addEventListener("change", function () {
      $("#password").type = show.checked ? "text" : "password";
    });
  }

  $("#unlock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    const btn = $("#unlock-btn");
    const err = $("#lock-error");
    const password = $("#password").value;
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Unlocking...";
    try {
      tryUnlock(password);
    } catch (ex) {
      console.error(ex);
      sessionStorage.removeItem(SESSION_KEY);
      const msg = String((ex && ex.message) || ex);
      if (msg === "BAD_PASSWORD") {
        setLockError("Wrong password. Use Show password and type KerryField26");
      } else {
        setLockError(msg);
      }
      btn.disabled = false;
      btn.textContent = "Unlock schedule";
    }
  });

  $("#lock-btn").addEventListener("click", lockApp);

  $("#search").addEventListener("input", function () {
    renderAll();
  });

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTab = btn.dataset.tab;
      renderAll();
    });
  });
}

function boot() {
  const btn = $("#unlock-btn");
  wireUi();
  try {
    loadData();
    btn.disabled = false;
    btn.textContent = "Unlock schedule";
  } catch (err) {
    console.error(err);
    setLockError(String((err && err.message) || "Could not load schedule file."));
    btn.textContent = "Retry unlock";
    btn.disabled = false;
    return;
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    try {
      schedule = decodeSchedule();
      showApp();
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
}

boot();
