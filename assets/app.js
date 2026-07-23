const $ = function (sel) {
  return document.querySelector(sel);
};

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
    return (
      '<span class="call call--muted" aria-disabled="true">' +
      escapeHtml(label) +
      " · n/a</span>"
    );
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

var schedule = null;
var activeTab = "route";

function renderAlerts() {
  var el = $("#alerts");
  el.innerHTML = schedule.alerts
    .map(function (a, i) {
      return (
        '<div class="alert alert--' +
        escapeHtml(a.level) +
        '" style="animation-delay:' +
        i * 40 +
        'ms">' +
        '<span class="alert__badge">' +
        escapeHtml(a.label) +
        "</span>" +
        "<span>" +
        escapeHtml(a.text) +
        "</span></div>"
      );
    })
    .join("");
}

function renderRoute(q) {
  var panel = $("#panel-route");
  var items = schedule.fieldRoute.filter(function (j) {
    return matchesQuery(
      [j.customer, j.address, j.trip, j.work, j.inspector, j.customerPhone, j.expiry].join(" "),
      q
    );
  });

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  var html =
    '<p class="section-head">Do them in this order. Trips radiate from Grand Falls-Windsor. Confirm the customer will be home before any long drive.</p>';
  var lastTrip = null;

  for (var i = 0; i < items.length; i++) {
    var j = items[i];
    if (j.trip !== lastTrip) {
      html += '<p class="trip-label">' + escapeHtml(j.trip) + "</p>";
      lastTrip = j.trip;
    }
    var statusClass =
      j.expiryStatus === "expired"
        ? "expired"
        : j.expiryStatus === "urgent"
          ? "urgent"
          : j.expiryStatus === "none"
            ? "none"
            : "ok";
    var statusLabel =
      j.expiryStatus === "expired"
        ? "EXPIRED"
        : j.expiryStatus === "urgent"
          ? "2 WEEKS"
          : j.expiryStatus === "none"
            ? "NO DEADLINE"
            : "ON TRACK";

    html +=
      '<article class="card">' +
      '<div class="card__top">' +
      '<h2 class="card__customer"><span class="card__order">' +
      j.order +
      "</span> " +
      escapeHtml(j.customer) +
      "</h2>" +
      '<span class="badge badge--' +
      statusClass +
      '">' +
      statusLabel +
      "</span></div>" +
      '<div class="meta">' +
      "<span><a class=\"maps\" href=\"" +
      mapsHref(j.address) +
      '" target="_blank" rel="noopener">' +
      escapeHtml(j.address) +
      "</a></span>" +
      "<span>" +
      escapeHtml(j.drive) +
      "</span>" +
      "<span>Grant: " +
      escapeHtml(j.expiry) +
      "</span></div>" +
      '<p class="work">' +
      highlightImportant(j.work) +
      "</p>" +
      '<div class="actions">' +
      callButtons("Customer", j.customerPhone) +
      callButtons("Inspector · " + j.inspector, j.inspectorPhone, "call--sea") +
      "</div></article>";
  }

  panel.innerHTML = html;
  return items.length;
}

function renderUnblock(q) {
  var panel = $("#panel-unblock");
  var items = schedule.unblock.filter(function (j) {
    return matchesQuery(
      [j.customer, j.town, j.blocked, j.action, j.who, j.whoPhone, j.priority, j.expiry].join(" "),
      q
    );
  });

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  var html =
    '<p class="section-head">Office / phone tasks. Driving out before these are cleared wastes a day.</p>';

  for (var i = 0; i < items.length; i++) {
    var j = items[i];
    html +=
      '<article class="card">' +
      '<div class="card__top">' +
      '<h2 class="card__customer">' +
      escapeHtml(j.customer) +
      "</h2>" +
      '<span class="badge badge--' +
      escapeHtml(j.priorityLevel) +
      '">' +
      escapeHtml(j.priority) +
      "</span></div>" +
      '<div class="meta"><span>' +
      escapeHtml(j.town) +
      "</span><span>Grant: " +
      escapeHtml(j.expiry) +
      "</span></div>" +
      '<p class="work"><strong>Blocked:</strong> ' +
      escapeHtml(j.blocked) +
      "</p>" +
      '<p class="work" style="margin-top:0.45rem"><strong>Action:</strong> ' +
      escapeHtml(j.action) +
      "</p>" +
      '<div class="actions">' +
      callButtons(j.who || "Call", j.whoPhone, "call--sea") +
      "</div></article>";
  }

  panel.innerHTML = html;
  return items.length;
}

function renderDone(q) {
  var panel = $("#panel-done");
  var items = schedule.completed.filter(function (j) {
    return matchesQuery([j.customer, j.town, j.note, j.label].join(" "), q);
  });

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  var html =
    '<p class="section-head">Listed so nothing gets lost — Kerry does not need to drive to any of these.</p>';

  for (var i = 0; i < items.length; i++) {
    var j = items[i];
    html +=
      '<article class="card">' +
      '<div class="card__top">' +
      '<h2 class="card__customer">' +
      escapeHtml(j.customer) +
      "</h2>" +
      '<span class="badge badge--' +
      escapeHtml(j.status) +
      '">' +
      escapeHtml(j.label) +
      "</span></div>" +
      '<div class="meta"><span>' +
      escapeHtml(j.town) +
      "</span></div>" +
      '<p class="work">' +
      escapeHtml(j.note) +
      "</p></article>";
  }

  panel.innerHTML = html;
  return items.length;
}

function renderContacts(q) {
  var panel = $("#panel-contacts");
  var items = schedule.contacts.filter(function (c) {
    return matchesQuery([c.name, c.role, c.phone, c.covers].join(" "), q);
  });

  if (!items.length) {
    panel.innerHTML = "";
    return 0;
  }

  var html =
    '<p class="section-head">Batch your calls — one call can book several jobs.</p>';

  for (var i = 0; i < items.length; i++) {
    var c = items[i];
    html +=
      '<article class="card contact-card">' +
      '<div class="card__top">' +
      '<h2 class="card__customer">' +
      escapeHtml(c.name) +
      "</h2>" +
      '<span class="badge badge--ok">' +
      escapeHtml(c.role) +
      "</span></div>" +
      '<p class="work">' +
      escapeHtml(c.covers) +
      "</p>" +
      '<div class="actions">' +
      callButtons("Call", c.phone, "call--sea") +
      "</div></article>";
  }

  panel.innerHTML = html;
  return items.length;
}

function syncPanels() {
  var map = {
    route: "#panel-route",
    unblock: "#panel-unblock",
    done: "#panel-done",
    contacts: "#panel-contacts",
  };
  Object.keys(map).forEach(function (key) {
    $(map[key]).hidden = key !== activeTab;
  });
  document.querySelectorAll(".tab").forEach(function (btn) {
    var on = btn.getAttribute("data-tab") === activeTab;
    if (on) btn.classList.add("is-active");
    else btn.classList.remove("is-active");
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function renderAll() {
  var searchEl = $("#search");
  var q = searchEl ? String(searchEl.value || "").trim() : "";
  var counts = {
    route: renderRoute(q),
    unblock: renderUnblock(q),
    done: renderDone(q),
    contacts: renderContacts(q),
  };
  var visible = counts[activeTab] || 0;
  $("#empty").hidden = visible > 0;
  syncPanels();
}

function showSchedule() {
  $("#meta-line").textContent = schedule.homeBase + " · Prepared " + schedule.prepared;
  $("#footer-meta").textContent = schedule.subtitle;
  document.title = "Kerry's COI Schedule";
  renderAlerts();
  renderAll();
}

function wireUi() {
  $("#search").addEventListener("input", function () {
    renderAll();
  });
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeTab = btn.getAttribute("data-tab");
      renderAll();
    });
  });
}

function boot() {
  wireUi();
  if (!window.KERRY_COI_DATA) {
    $("#meta-line").textContent = "ERROR: schedule data failed to load. Hard-refresh.";
    return;
  }
  schedule = window.KERRY_COI_DATA;
  showSchedule();
}

boot();
