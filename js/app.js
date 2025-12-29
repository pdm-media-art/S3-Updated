// SecureStay Analytics – Enterprise Edition
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function createEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.entries(v).forEach(([dk, dv]) => (el.dataset[dk] = dv));
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "innerHTML") el.innerHTML = v;
    else el.setAttribute(k, v);
  });
  children.forEach((c) => { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return el;
}

let risks = [], assets = [], incidents = [];
let riskIdCounter = 1, assetIdCounter = 1, incidentIdCounter = 1;

function showToast(type, title, message) {
  const container = $("#toastContainer"); if (!container) return;
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`,
  };
  const toast = createEl("div", { class: `toast ${type}` },
    createEl("div", { class: "toast-icon", innerHTML: icons[type] }),
    createEl("div", { class: "toast-content" }, createEl("div", { class: "toast-title" }, title), message ? createEl("div", { class: "toast-message" }, message) : null),
    createEl("button", { class: "toast-close", innerHTML: "×", onclick: () => removeToast(toast) })
  );
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) { toast.classList.add("removing"); setTimeout(() => toast.remove(), 300); }

const pageTitles = {
  dashboard: { title: "Dashboard", breadcrumb: "Übersicht / Sicherheitsanalyse" },
  threats: { title: "Threat Sheet", breadcrumb: "Analyse / Risikomanagement" },
  assets: { title: "Assets", breadcrumb: "Analyse / Inventar & Vulnerabilität" },
  incidents: { title: "Incidents", breadcrumb: "Analyse / Vorfallserfassung" },
  matrix: { title: "Risikomatrix", breadcrumb: "Matrix / Visuelle Darstellung" },
};

function navigateToPage(target) {
  if (!target) return;
  
  // Update nav buttons
  const navButtons = document.querySelectorAll(".nav-item");
  navButtons.forEach((b) => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.nav-item[data-page="${target}"]`);
  if (activeBtn) activeBtn.classList.add("active");
  
  // Update pages
  const pages = document.querySelectorAll(".page");
  pages.forEach((p) => {
    if (p.id === `page-${target}`) {
      p.classList.add("active");
      p.style.display = "block";
    } else {
      p.classList.remove("active");
      p.style.display = "none";
    }
  });
  
  // Update page title
  const pageInfo = pageTitles[target];
  if (pageInfo) {
    const titleEl = document.getElementById("pageTitle");
    const breadcrumbEl = document.querySelector(".page-breadcrumb");
    if (titleEl) titleEl.textContent = pageInfo.title;
    if (breadcrumbEl) breadcrumbEl.textContent = pageInfo.breadcrumb;
  }
  
  // Special handling for matrix page
  if (target === "matrix") {
    renderRiskMatrix();
    renderMatrixRiskList();
  }
  
  // Redraw charts when returning to dashboard
  if (target === "dashboard") {
    setTimeout(() => {
      drawSecurityRadar();
      drawTrendChart();
    }, 100);
  }
}

function initNavigation() {
  const navButtons = document.querySelectorAll(".nav-item");
  navButtons.forEach((btn) => {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      const target = this.getAttribute("data-page");
      console.log("Navigation clicked:", target);
      navigateToPage(target);
    });
  });
  
  // Ensure dashboard is visible on load
  navigateToPage("dashboard");
}

function updateDashboard() {
  let envIndex = 100, objIndex = 100;
  if (risks.length) { const avgRisk = risks.reduce((sum, r) => sum + (r.riskScore || 0), 0) / risks.length; envIndex = Math.max(0, Math.min(100, Math.round(100 - avgRisk))); }
  if (assets.length) { const avgVuln = assets.reduce((sum, a) => sum + (a.vulnIndex || 0), 0) / assets.length; objIndex = Math.max(0, Math.min(100, Math.round(100 - avgVuln * 10))); }
  const openRisks = risks.filter((r) => r.status !== "Erledigt" && r.status !== "Done").length;
  const openIncidents = incidents.filter((i) => i.status === "offen" || i.status === "in Bearbeitung").length;
  
  const envIndexEl = $("#envIndex"), objIndexEl = $("#objIndex"), openRisksEl = $("#openRisks"), openIncidentsEl = $("#openIncidents");
  if (envIndexEl) { envIndexEl.textContent = isFinite(envIndex) ? envIndex : "–"; const envBar = $("#envIndexBar"); if (envBar) envBar.style.width = `${envIndex}%`; }
  if (objIndexEl) { objIndexEl.textContent = isFinite(objIndex) ? objIndex : "–"; const objBar = $("#objIndexBar"); if (objBar) objBar.style.width = `${objIndex}%`; }
  if (openRisksEl) openRisksEl.textContent = openRisks;
  if (openIncidentsEl) openIncidentsEl.textContent = openIncidents;
  
  if ($("#navRiskCount")) $("#navRiskCount").textContent = risks.length;
  if ($("#navAssetCount")) $("#navAssetCount").textContent = assets.length;
  if ($("#navIncidentCount")) $("#navIncidentCount").textContent = openIncidents;
  if ($("#notificationBadge")) $("#notificationBadge").textContent = openRisks + openIncidents;
  renderActivityList();
}

function renderActivityList() {
  const container = $("#activityList"); if (!container) return;
  container.innerHTML = "";
  const activities = [
    ...incidents.map((i) => ({ type: "incident", title: i.type, desc: `${i.location} - ${i.category}`, time: i.datetime, severity: i.severity, status: i.status })),
    ...risks.slice(0, 5).map((r) => ({ type: "risk", title: r.name, desc: `${r.type} - Risikowert: ${r.riskScore}`, time: new Date().toISOString(), severity: r.priority, status: r.status })),
  ];
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));
  activities.slice(0, 6).forEach((activity) => {
    let iconClass = "info", iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
    if (activity.type === "incident") {
      if (activity.status === "offen") { iconClass = "danger"; iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`; }
      else if (activity.status === "in Bearbeitung") { iconClass = "warning"; iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`; }
      else { iconClass = "success"; iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>`; }
    } else if (activity.severity === "Kritisch" || activity.severity === "Hoch") {
      iconClass = "warning"; iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    }
    const timeStr = formatRelativeTime(activity.time);
    container.appendChild(createEl("div", { class: "activity-item" },
      createEl("div", { class: `activity-icon ${iconClass}`, innerHTML: iconSvg }),
      createEl("div", { class: "activity-content" }, createEl("div", { class: "activity-title" }, activity.title), createEl("div", { class: "activity-desc" }, activity.desc)),
      createEl("div", { class: "activity-time" }, timeStr)
    ));
  });
  if (activities.length === 0) container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Keine Aktivitäten</div></div>`;
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr), now = new Date(), diff = now - date;
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
  if (mins < 1) return "Gerade eben"; if (mins < 60) return `vor ${mins} Min.`; if (hours < 24) return `vor ${hours} Std.`; if (days < 7) return `vor ${days} Tag${days > 1 ? "en" : ""}`;
  return date.toLocaleDateString("de-DE");
}

let riskModal, riskForm;
function openRiskModal(risk = null) {
  if (!riskModal) return; riskModal.classList.add("open");
  if (risk) {
    $("#riskModalTitle").textContent = "Risiko bearbeiten"; $("#riskId").value = risk.id; $("#riskName").value = risk.name; $("#riskType").value = risk.type; $("#riskPriority").value = risk.priority; $("#riskStatus").value = risk.status; $("#riskDescription").value = risk.description || "";
    $("#probFreq").value = risk.probFreq; $("#probControls").value = risk.probControls; $("#probSigns").value = risk.probSigns; $("#probComplexity").value = risk.probComplexity;
    $("#impPeople").value = risk.impPeople; $("#impAssets").value = risk.impAssets; $("#impReputation").value = risk.impReputation; $("#impLegal").value = risk.impLegal; $("#impResilience").value = risk.impResilience;
    updateAllSliderDisplays(); $("#probRating").value = risk.probRating; $("#impRating").value = risk.impRating; $("#riskScore").value = risk.riskScore;
  } else {
    $("#riskModalTitle").textContent = "Neues Risiko"; riskForm.reset(); $("#riskId").value = "";
    ["probFreq", "probControls", "probSigns", "probComplexity", "impPeople", "impAssets", "impReputation", "impLegal", "impResilience"].forEach((id) => { const el = $(`#${id}`); if (el) el.value = 3; });
    updateAllSliderDisplays(); updateRiskDerivedFields();
  }
}
function closeRiskModal() { if (riskModal) riskModal.classList.remove("open"); }
function updateAllSliderDisplays() { ["probFreq", "probControls", "probSigns", "probComplexity", "impPeople", "impAssets", "impReputation", "impLegal", "impResilience"].forEach(id => { const slider = $(`#${id}`), display = $(`#${id}Val`); if (slider && display) display.textContent = slider.value; }); }
function calcProbRating() { const freq = Number($("#probFreq").value) || 0, controls = Number($("#probControls").value) || 0, signs = Number($("#probSigns").value) || 0, complexity = Number($("#probComplexity").value) || 0; return Math.round((freq + (6 - controls) + signs + (6 - complexity)) / 4 * 2); }
function calcImpRating() { const people = Number($("#impPeople").value) || 0, assetsVal = Number($("#impAssets").value) || 0, rep = Number($("#impReputation").value) || 0, legal = Number($("#impLegal").value) || 0, resilience = Number($("#impResilience").value) || 0; return Math.round((people + assetsVal + rep + legal + (6 - resilience)) / 5 * 2); }
function updateRiskDerivedFields() { const probRating = calcProbRating(), impRating = calcImpRating(), score = probRating * impRating; if ($("#probRating")) $("#probRating").value = probRating; if ($("#impRating")) $("#impRating").value = impRating; if ($("#riskScore")) $("#riskScore").value = score; }

function initRiskModal() {
  riskModal = $("#riskModal"); riskForm = $("#riskForm");
  if ($("#btnAddRisk")) $("#btnAddRisk").addEventListener("click", () => openRiskModal());
  if ($("#riskModalClose")) $("#riskModalClose").addEventListener("click", closeRiskModal);
  if ($("#riskCancel")) $("#riskCancel").addEventListener("click", closeRiskModal);
  const backdrop = riskModal?.querySelector(".modal-backdrop"); if (backdrop) backdrop.addEventListener("click", closeRiskModal);
  ["probFreq", "probControls", "probSigns", "probComplexity", "impPeople", "impAssets", "impReputation", "impLegal", "impResilience"].forEach((id) => {
    const el = $(`#${id}`); if (el) el.addEventListener("input", () => { const display = $(`#${id}Val`); if (display) display.textContent = el.value; updateRiskDerivedFields(); });
  });
  if (riskForm) riskForm.addEventListener("submit", (e) => {
    e.preventDefault(); const idValue = $("#riskId").value;
    const riskObj = { id: idValue ? Number(idValue) : riskIdCounter++, name: $("#riskName").value.trim(), type: $("#riskType").value, priority: $("#riskPriority").value, status: $("#riskStatus").value, description: $("#riskDescription").value.trim(),
      probFreq: Number($("#probFreq").value), probControls: Number($("#probControls").value), probSigns: Number($("#probSigns").value), probComplexity: Number($("#probComplexity").value),
      impPeople: Number($("#impPeople").value), impAssets: Number($("#impAssets").value), impReputation: Number($("#impReputation").value), impLegal: Number($("#impLegal").value), impResilience: Number($("#impResilience").value),
      probRating: Number($("#probRating").value), impRating: Number($("#impRating").value), riskScore: Number($("#riskScore").value) };
    if (!riskObj.name) { showToast("error", "Fehler", "Risikoname ist erforderlich"); return; }
    if (idValue) { const idx = risks.findIndex((r) => r.id === riskObj.id); if (idx !== -1) risks[idx] = riskObj; showToast("success", "Aktualisiert", `Risiko "${riskObj.name}" gespeichert`); }
    else { risks.push(riskObj); showToast("success", "Erstellt", `Risiko "${riskObj.name}" hinzugefügt`); }
    closeRiskModal(); renderRiskTable(); renderRiskMatrix(); renderMatrixRiskList(); updateDashboard();
  });
}

function getRiskScoreClass(score) { if (score < 25) return "low"; if (score < 50) return "medium"; if (score < 80) return "high"; return "critical"; }
function getStatusBadgeClass(status) { if (status === "Erledigt" || status === "Done") return "low"; if (status === "Ongoing") return "warning"; return "neutral"; }
function getPriorityBadgeClass(priority) { if (priority === "Kritisch") return "danger"; if (priority === "Hoch") return "high"; if (priority === "Moderat") return "warning"; return "low"; }

function renderRiskTable() {
  const tbody = $("#riskTableBody"); if (!tbody) return; tbody.innerHTML = "";
  const search = $("#riskSearch")?.value.trim().toLowerCase() || "", typeFilter = $("#riskTypeFilter")?.value || "", statusFilter = $("#riskStatusFilter")?.value || "";
  const filtered = risks.filter((r) => (!search || r.name.toLowerCase().includes(search) || (r.description || "").toLowerCase().includes(search)) && (!typeFilter || r.type === typeFilter) && (!statusFilter || r.status === statusFilter));
  if ($("#riskFilterCount")) $("#riskFilterCount").textContent = filtered.length;
  if (filtered.length === 0) { tbody.appendChild(createEl("tr", {}, createEl("td", { colspan: "7" }, createEl("div", { style: "padding: 40px; text-align: center; color: var(--text-muted);" }, "Keine Risiken gefunden")))); return; }
  filtered.forEach((risk) => {
    tbody.appendChild(createEl("tr", {},
      createEl("td", {}, createEl("span", { style: "font-family: 'JetBrains Mono', monospace; color: var(--text-muted);" }, `#${risk.id}`)),
      createEl("td", {}, createEl("div", {}, createEl("div", { style: "font-weight: 500;" }, risk.name), risk.description ? createEl("div", { style: "font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;" }, risk.description.length > 50 ? risk.description.substring(0, 50) + "..." : risk.description) : null)),
      createEl("td", {}, createEl("span", { class: "status-badge info" }, risk.type)),
      createEl("td", {}, createEl("span", { class: `status-badge ${getPriorityBadgeClass(risk.priority)}` }, risk.priority)),
      createEl("td", {}, createEl("span", { class: `status-badge ${getStatusBadgeClass(risk.status)}` }, risk.status)),
      createEl("td", {}, createEl("span", { class: `risk-score ${getRiskScoreClass(risk.riskScore)}` }, risk.riskScore.toString())),
      createEl("td", {}, createEl("div", { class: "table-actions" },
        createEl("button", { class: "table-btn", title: "Bearbeiten", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`, onclick: () => openRiskModal(risk) }),
        createEl("button", { class: "table-btn danger", title: "Löschen", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`, onclick: () => deleteRisk(risk.id) })
      ))
    ));
  });
}

function deleteRisk(id) { const risk = risks.find(r => r.id === id); if (!confirm(`Risiko "${risk?.name}" wirklich löschen?`)) return; risks = risks.filter((r) => r.id !== id); showToast("success", "Gelöscht", "Risiko wurde entfernt"); renderRiskTable(); renderRiskMatrix(); renderMatrixRiskList(); updateDashboard(); }
function initRiskFilters() { if ($("#riskSearch")) $("#riskSearch").addEventListener("input", renderRiskTable); if ($("#riskTypeFilter")) $("#riskTypeFilter").addEventListener("change", renderRiskTable); if ($("#riskStatusFilter")) $("#riskStatusFilter").addEventListener("change", renderRiskTable); }

function renderRiskMatrix() {
  const container = $("#riskMatrix"); if (!container) return; container.innerHTML = "";
  for (let imp = 10; imp >= 1; imp--) {
    for (let prob = 1; prob <= 10; prob++) {
      const cellScore = prob * imp; let levelClass = "low"; if (cellScore >= 25 && cellScore < 50) levelClass = "medium"; else if (cellScore >= 50 && cellScore < 80) levelClass = "high"; else if (cellScore >= 80) levelClass = "critical";
      const inCell = risks.filter((r) => r.probRating === prob && r.impRating === imp);
      const cell = createEl("div", { class: `matrix-cell ${levelClass}${inCell.length ? " has-risk" : ""}`, title: inCell.length ? inCell.map((r) => `#${r.id} ${r.name} (${r.riskScore})`).join("\n") : `P:${prob} × I:${imp} = ${cellScore}` });
      if (inCell.length) cell.textContent = inCell.length.toString();
      container.appendChild(cell);
    }
  }
}

function renderMatrixRiskList() {
  const container = $("#matrixRiskList"); if (!container) return; container.innerHTML = "";
  const sortedRisks = [...risks].sort((a, b) => b.riskScore - a.riskScore);
  if (sortedRisks.length === 0) { container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Keine Risiken</div></div>`; return; }
  sortedRisks.forEach((risk) => {
    container.appendChild(createEl("div", { class: "matrix-risk-item", onclick: () => openRiskModal(risk) },
      createEl("span", { class: `risk-score matrix-risk-score ${getRiskScoreClass(risk.riskScore)}` }, risk.riskScore.toString()),
      createEl("div", { class: "matrix-risk-info" }, createEl("div", { class: "matrix-risk-name" }, risk.name), createEl("div", { class: "matrix-risk-type" }, risk.type)),
      createEl("div", { class: "matrix-risk-position" }, `P:${risk.probRating} × I:${risk.impRating}`)
    ));
  });
}

let assetModal, assetForm;
function calcAssetVulnIndex() { const crit = Number($("#assetCriticality").value) || 0, prot = Number($("#assetProtection").value) || 0; return Math.round((crit * (11 - prot)) / 10 * 10) / 10; }
function calcAssetZone(vulnIndex) { if (vulnIndex >= 7) return "Rot"; if (vulnIndex >= 4) return "Gelb"; return "Grün"; }
function updateAssetDerivedFields() { const vuln = calcAssetVulnIndex(), zone = calcAssetZone(vuln); if ($("#assetVulnIndex")) $("#assetVulnIndex").value = vuln; if ($("#assetZone")) $("#assetZone").value = zone; }

function openAssetModal(asset = null) {
  if (!assetModal) return; assetModal.classList.add("open");
  if (asset) {
    $("#assetModalTitle").textContent = "Asset bearbeiten"; $("#assetId").value = asset.id; $("#assetName").value = asset.name; $("#assetType").value = asset.type || ""; $("#assetLocation").value = asset.location || ""; $("#assetOwner").value = asset.owner || "";
    $("#assetCriticality").value = asset.criticality; $("#assetProtection").value = asset.protection;
    if ($("#assetCriticalityVal")) $("#assetCriticalityVal").textContent = asset.criticality; if ($("#assetProtectionVal")) $("#assetProtectionVal").textContent = asset.protection;
    $("#assetVulnIndex").value = asset.vulnIndex; $("#assetZone").value = asset.zone;
  } else {
    $("#assetModalTitle").textContent = "Neues Asset"; assetForm.reset(); $("#assetId").value = "";
    if ($("#assetCriticality")) $("#assetCriticality").value = 5; if ($("#assetProtection")) $("#assetProtection").value = 5;
    if ($("#assetCriticalityVal")) $("#assetCriticalityVal").textContent = "5"; if ($("#assetProtectionVal")) $("#assetProtectionVal").textContent = "5";
    updateAssetDerivedFields();
  }
}
function closeAssetModal() { if (assetModal) assetModal.classList.remove("open"); }

function initAssetModal() {
  assetModal = $("#assetModal"); assetForm = $("#assetForm");
  if ($("#btnAddAsset")) $("#btnAddAsset").addEventListener("click", () => openAssetModal());
  if ($("#assetModalClose")) $("#assetModalClose").addEventListener("click", closeAssetModal);
  if ($("#assetCancel")) $("#assetCancel").addEventListener("click", closeAssetModal);
  const backdrop = assetModal?.querySelector(".modal-backdrop"); if (backdrop) backdrop.addEventListener("click", closeAssetModal);
  if ($("#assetCriticality")) $("#assetCriticality").addEventListener("input", () => { if ($("#assetCriticalityVal")) $("#assetCriticalityVal").textContent = $("#assetCriticality").value; updateAssetDerivedFields(); });
  if ($("#assetProtection")) $("#assetProtection").addEventListener("input", () => { if ($("#assetProtectionVal")) $("#assetProtectionVal").textContent = $("#assetProtection").value; updateAssetDerivedFields(); });
  if (assetForm) assetForm.addEventListener("submit", (e) => {
    e.preventDefault(); const idValue = $("#assetId").value;
    const assetObj = { id: idValue ? Number(idValue) : assetIdCounter++, name: $("#assetName").value.trim(), type: $("#assetType").value.trim(), location: $("#assetLocation").value.trim(), owner: $("#assetOwner").value.trim(),
      criticality: Number($("#assetCriticality").value), protection: Number($("#assetProtection").value), vulnIndex: Number($("#assetVulnIndex").value), zone: $("#assetZone").value };
    if (!assetObj.name) { showToast("error", "Fehler", "Asset-Name ist erforderlich"); return; }
    if (idValue) { const idx = assets.findIndex((a) => a.id === assetObj.id); if (idx !== -1) assets[idx] = assetObj; showToast("success", "Aktualisiert", `Asset "${assetObj.name}" gespeichert`); }
    else { assets.push(assetObj); showToast("success", "Erstellt", `Asset "${assetObj.name}" hinzugefügt`); }
    closeAssetModal(); renderAssetTable(); updateDashboard();
  });
}

function renderAssetTable() {
  const tbody = $("#assetTableBody"); if (!tbody) return; tbody.innerHTML = "";
  const search = $("#assetSearch")?.value.trim().toLowerCase() || "", zoneFilter = $("#assetZoneFilter")?.value || "";
  const filtered = assets.filter((a) => (!search || a.name.toLowerCase().includes(search) || (a.type || "").toLowerCase().includes(search) || (a.location || "").toLowerCase().includes(search) || (a.owner || "").toLowerCase().includes(search)) && (!zoneFilter || a.zone === zoneFilter));
  if ($("#assetFilterCount")) $("#assetFilterCount").textContent = filtered.length;
  if (filtered.length === 0) { tbody.appendChild(createEl("tr", {}, createEl("td", { colspan: "8" }, createEl("div", { style: "padding: 40px; text-align: center; color: var(--text-muted);" }, "Keine Assets gefunden")))); return; }
  filtered.forEach((asset) => {
    tbody.appendChild(createEl("tr", {},
      createEl("td", {}, createEl("span", { style: "font-family: 'JetBrains Mono', monospace; color: var(--text-muted);" }, `#${asset.id}`)),
      createEl("td", { style: "font-weight: 500;" }, asset.name), createEl("td", {}, asset.type || "–"), createEl("td", {}, asset.location || "–"), createEl("td", {}, asset.owner || "–"),
      createEl("td", {}, createEl("span", { class: `risk-score ${asset.vulnIndex >= 7 ? 'critical' : asset.vulnIndex >= 4 ? 'medium' : 'low'}` }, asset.vulnIndex.toString())),
      createEl("td", {}, createEl("span", { class: `zone-badge ${asset.zone.toLowerCase()}` }, asset.zone)),
      createEl("td", {}, createEl("div", { class: "table-actions" },
        createEl("button", { class: "table-btn", title: "Bearbeiten", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`, onclick: () => openAssetModal(asset) }),
        createEl("button", { class: "table-btn danger", title: "Löschen", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`, onclick: () => deleteAsset(asset.id) })
      ))
    ));
  });
}

function deleteAsset(id) { const asset = assets.find(a => a.id === id); if (!confirm(`Asset "${asset?.name}" wirklich löschen?`)) return; assets = assets.filter((a) => a.id !== id); showToast("success", "Gelöscht", "Asset wurde entfernt"); renderAssetTable(); updateDashboard(); }
function initAssetFilters() { if ($("#assetSearch")) $("#assetSearch").addEventListener("input", renderAssetTable); if ($("#assetZoneFilter")) $("#assetZoneFilter").addEventListener("change", renderAssetTable); }

let incidentModal, incidentForm;
function openIncidentModal(incident = null) {
  if (!incidentModal) return; incidentModal.classList.add("open");
  if (incident) {
    $("#incidentModalTitle").textContent = "Vorfall bearbeiten"; $("#incidentId").value = incident.id; $("#incidentDatetime").value = incident.datetime; $("#incidentLocation").value = incident.location; $("#incidentCategory").value = incident.category;
    $("#incidentType").value = incident.type; $("#incidentReporter").value = incident.reporter || ""; $("#incidentSeverity").value = incident.severity; $("#incidentStatus").value = incident.status; $("#incidentOwner").value = incident.owner || ""; $("#incidentDescription").value = incident.description || "";
  } else {
    $("#incidentModalTitle").textContent = "Neuer Vorfall"; incidentForm.reset(); $("#incidentId").value = "";
    const now = new Date(); $("#incidentDatetime").value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
}
function closeIncidentModal() { if (incidentModal) incidentModal.classList.remove("open"); }

function initIncidentModal() {
  incidentModal = $("#incidentModal"); incidentForm = $("#incidentForm");
  if ($("#btnAddIncident")) $("#btnAddIncident").addEventListener("click", () => openIncidentModal());
  if ($("#incidentModalClose")) $("#incidentModalClose").addEventListener("click", closeIncidentModal);
  if ($("#incidentCancel")) $("#incidentCancel").addEventListener("click", closeIncidentModal);
  const backdrop = incidentModal?.querySelector(".modal-backdrop"); if (backdrop) backdrop.addEventListener("click", closeIncidentModal);
  if (incidentForm) incidentForm.addEventListener("submit", (e) => {
    e.preventDefault(); const idValue = $("#incidentId").value;
    const incidentObj = { id: idValue ? Number(idValue) : incidentIdCounter++, datetime: $("#incidentDatetime").value, location: $("#incidentLocation").value.trim(), category: $("#incidentCategory").value, type: $("#incidentType").value.trim(),
      reporter: $("#incidentReporter").value.trim(), severity: $("#incidentSeverity").value, status: $("#incidentStatus").value, owner: $("#incidentOwner").value.trim(), description: $("#incidentDescription").value.trim() };
    if (!incidentObj.datetime || !incidentObj.location || !incidentObj.type) { showToast("error", "Fehler", "Datum, Ort und Art sind erforderlich"); return; }
    if (idValue) { const idx = incidents.findIndex((i) => i.id === incidentObj.id); if (idx !== -1) incidents[idx] = incidentObj; showToast("success", "Aktualisiert", "Vorfall wurde gespeichert"); }
    else { incidents.push(incidentObj); showToast("warning", "Neuer Vorfall", `"${incidentObj.type}" wurde erfasst`); }
    closeIncidentModal(); renderIncidentTable(); updateDashboard();
  });
}

function getSeverityBadgeClass(severity) { if (severity === "Hoch") return "danger"; if (severity === "Mittel") return "warning"; return "low"; }
function getIncidentStatusBadgeClass(status) { if (status === "offen") return "danger"; if (status === "in Bearbeitung") return "warning"; return "low"; }

function renderIncidentTable() {
  const tbody = $("#incidentTableBody"); if (!tbody) return; tbody.innerHTML = "";
  const search = $("#incidentSearch")?.value.trim().toLowerCase() || "", catFilter = $("#incidentCategoryFilter")?.value || "", statusFilter = $("#incidentStatusFilter")?.value || "";
  const filtered = incidents.filter((i) => (!search || i.location.toLowerCase().includes(search) || i.type.toLowerCase().includes(search) || (i.description || "").toLowerCase().includes(search)) && (!catFilter || i.category === catFilter) && (!statusFilter || i.status === statusFilter));
  if ($("#incidentFilterCount")) $("#incidentFilterCount").textContent = filtered.length;
  if (filtered.length === 0) { tbody.appendChild(createEl("tr", {}, createEl("td", { colspan: "8" }, createEl("div", { style: "padding: 40px; text-align: center; color: var(--text-muted);" }, "Keine Vorfälle gefunden")))); return; }
  filtered.forEach((incident) => {
    const dateFormatted = incident.datetime ? new Date(incident.datetime).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
    tbody.appendChild(createEl("tr", {},
      createEl("td", {}, createEl("span", { style: "font-family: 'JetBrains Mono', monospace; color: var(--text-muted);" }, `#${incident.id}`)),
      createEl("td", { style: "font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;" }, dateFormatted),
      createEl("td", { style: "font-weight: 500;" }, incident.location), createEl("td", {}, createEl("span", { class: "status-badge info" }, incident.category)), createEl("td", {}, incident.type),
      createEl("td", {}, createEl("span", { class: `status-badge ${getSeverityBadgeClass(incident.severity)}` }, incident.severity)),
      createEl("td", {}, createEl("span", { class: `status-badge ${getIncidentStatusBadgeClass(incident.status)}` }, incident.status)),
      createEl("td", {}, createEl("div", { class: "table-actions" },
        createEl("button", { class: "table-btn", title: "Bearbeiten", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`, onclick: () => openIncidentModal(incident) }),
        createEl("button", { class: "table-btn danger", title: "Löschen", innerHTML: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`, onclick: () => deleteIncident(incident.id) })
      ))
    ));
  });
}

function deleteIncident(id) { if (!confirm("Vorfall wirklich löschen?")) return; incidents = incidents.filter((i) => i.id !== id); showToast("success", "Gelöscht", "Vorfall wurde entfernt"); renderIncidentTable(); updateDashboard(); }
function initIncidentFilters() { if ($("#incidentSearch")) $("#incidentSearch").addEventListener("input", renderIncidentTable); if ($("#incidentCategoryFilter")) $("#incidentCategoryFilter").addEventListener("change", renderIncidentTable); if ($("#incidentStatusFilter")) $("#incidentStatusFilter").addEventListener("change", renderIncidentTable); }

function seedDemoData() {
  risks = [
    { id: riskIdCounter++, name: "Einbruch in Lagerhalle", type: "Security", priority: "Hoch", status: "Ongoing", description: "Mögliche Einbruchgefahr aufgrund unzureichender Perimeter-Sicherheit.", probFreq: 4, probControls: 2, probSigns: 3, probComplexity: 2, impPeople: 2, impAssets: 4, impReputation: 3, impLegal: 2, impResilience: 3, probRating: 7, impRating: 7, riskScore: 49 },
    { id: riskIdCounter++, name: "Brandgefahr Rechenzentrum", type: "Brandschutz", priority: "Kritisch", status: "Not Started", description: "Hohe Brandlast durch veraltete Verkabelung.", probFreq: 3, probControls: 3, probSigns: 3, probComplexity: 3, impPeople: 4, impAssets: 5, impReputation: 5, impLegal: 4, impResilience: 2, probRating: 5, impRating: 9, riskScore: 45 },
    { id: riskIdCounter++, name: "Datenschutzverletzung", type: "Datenschutz", priority: "Hoch", status: "Ongoing", description: "Unzureichende Verschlüsselung personenbezogener Daten.", probFreq: 3, probControls: 2, probSigns: 4, probComplexity: 3, impPeople: 3, impAssets: 3, impReputation: 5, impLegal: 5, impResilience: 3, probRating: 6, impRating: 8, riskScore: 48 },
    { id: riskIdCounter++, name: "Unbefugter Zutritt", type: "Security", priority: "Moderat", status: "Ongoing", description: "Zugangskontrollsystem zeigt häufige Ausfälle.", probFreq: 3, probControls: 3, probSigns: 2, probComplexity: 4, impPeople: 2, impAssets: 2, impReputation: 2, impLegal: 2, impResilience: 4, probRating: 4, impRating: 5, riskScore: 20 },
  ];
  assets = [
    { id: assetIdCounter++, name: "Rechenzentrum A", type: "Gebäude", location: "Standort Nord", owner: "IT-Abteilung", criticality: 9, protection: 6, vulnIndex: 4.5, zone: "Gelb" },
    { id: assetIdCounter++, name: "Zutrittskontrollsystem", type: "IT-System", location: "Zentrale", owner: "Security", criticality: 7, protection: 8, vulnIndex: 2.1, zone: "Grün" },
    { id: assetIdCounter++, name: "Produktionshalle West", type: "Gebäude", location: "Standort West", owner: "Produktion", criticality: 8, protection: 5, vulnIndex: 4.8, zone: "Gelb" },
    { id: assetIdCounter++, name: "Backup-Server", type: "IT-System", location: "Rechenzentrum A", owner: "IT-Abteilung", criticality: 10, protection: 4, vulnIndex: 7.0, zone: "Rot" },
  ];
  incidents = [
    { id: incidentIdCounter++, datetime: "2025-01-05T21:30", location: "Lagerhalle Ost", category: "Security-Vorfälle", type: "Einbruchsversuch", reporter: "Wachdienst", severity: "Mittel", status: "in Bearbeitung", owner: "M. Schmidt", description: "Unbekannte Personen auf dem Gelände gesichtet." },
    { id: incidentIdCounter++, datetime: "2025-01-04T14:15", location: "Rechenzentrum A", category: "IT-Vorfälle", type: "Systemausfall", reporter: "IT-Support", severity: "Hoch", status: "geschlossen", owner: "T. Weber", description: "Kurzzeitiger Ausfall des Kühlsystems." },
    { id: incidentIdCounter++, datetime: "2025-01-06T09:00", location: "Haupteingang", category: "Safety-Vorfälle", type: "Defekte Notbeleuchtung", reporter: "Facility Management", severity: "Niedrig", status: "offen", owner: "Facility Team", description: "Notbeleuchtung im Eingangsbereich funktioniert nicht." },
  ];
}

function drawSecurityRadar() {
  const canvas = document.getElementById("securityRadar"); if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const displayWidth = 360, displayHeight = 360;
  canvas.width = displayWidth * dpr; canvas.height = displayHeight * dpr;
  canvas.style.width = displayWidth + "px"; canvas.style.height = displayHeight + "px";
  ctx.scale(dpr, dpr);
  const centerX = displayWidth / 2, centerY = displayHeight / 2, maxRadius = Math.min(displayWidth, displayHeight) * 0.38;
  const labels = ["Zugangssicherheit", "Überwachung", "IT-Sicherheit", "Brandschutz", "Awareness", "Notfall-Org"];
  const values = [Math.max(2, 10 - risks.filter(r => r.type === "Security").length * 1.5), Math.max(3, 8 - incidents.filter(i => i.status === "offen").length), Math.max(2, 10 - risks.filter(r => r.type === "IT" || r.type === "Datenschutz").length * 2), Math.max(3, 9 - risks.filter(r => r.type === "Brandschutz").length * 2), Math.max(4, 7), Math.max(5, 9 - incidents.length * 0.5)];
  const maxValue = 10, levels = 5;
  ctx.clearRect(0, 0, displayWidth, displayHeight); ctx.save(); ctx.translate(centerX, centerY);
  const angleStep = (Math.PI * 2) / labels.length;
  for (let level = 1; level <= levels; level++) { const radius = (maxRadius / levels) * level; ctx.beginPath(); for (let i = 0; i < labels.length; i++) { const angle = i * angleStep - Math.PI / 2, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"; ctx.lineWidth = 1; ctx.stroke(); }
  for (let i = 0; i < labels.length; i++) { const angle = i * angleStep - Math.PI / 2, x = Math.cos(angle) * maxRadius, y = Math.sin(angle) * maxRadius; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.beginPath(); for (let i = 0; i < values.length; i++) { const value = Math.max(0, Math.min(values[i], maxValue)), radius = (value / maxValue) * maxRadius, angle = i * angleStep - Math.PI / 2, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath();
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius); gradient.addColorStop(0, "rgba(99, 102, 241, 0.4)"); gradient.addColorStop(1, "rgba(168, 85, 247, 0.1)"); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = "rgba(99, 102, 241, 0.9)"; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < values.length; i++) { const value = Math.max(0, Math.min(values[i], maxValue)), radius = (value / maxValue) * maxRadius, angle = i * angleStep - Math.PI / 2, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = "rgba(99, 102, 241, 0.3)"; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = "#6366f1"; ctx.fill(); ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore(); ctx.font = "500 11px 'DM Sans', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < labels.length; i++) { const angle = i * angleStep - Math.PI / 2, labelRadius = maxRadius + 28, x = centerX + Math.cos(angle) * labelRadius, y = centerY + Math.sin(angle) * labelRadius; ctx.fillStyle = "rgba(255, 255, 255, 0.7)"; ctx.fillText(labels[i], x, y); }
  const legend = $("#radarLegend"); if (legend) { legend.innerHTML = ""; labels.forEach((label, i) => { legend.appendChild(createEl("div", { class: "radar-legend-item" }, createEl("div", { class: "radar-legend-dot" }), createEl("span", {}, `${label}: ${values[i].toFixed(1)}`))); }); }
}

function drawTrendChart() {
  const canvas = document.getElementById("trendChart"); if (!canvas) return;
  const ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect(), displayWidth = rect.width - 48, displayHeight = rect.height - 48;
  canvas.width = displayWidth * dpr; canvas.height = displayHeight * dpr; canvas.style.width = displayWidth + "px"; canvas.style.height = displayHeight + "px"; ctx.scale(dpr, dpr);
  const data = []; let baseValue = 45; for (let i = 0; i < 30; i++) { baseValue += (Math.random() - 0.5) * 8; baseValue = Math.max(20, Math.min(80, baseValue)); data.push(baseValue); }
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }, chartWidth = displayWidth - padding.left - padding.right, chartHeight = displayHeight - padding.top - padding.bottom;
  const maxVal = Math.max(...data) * 1.1, minVal = Math.min(...data) * 0.9;
  ctx.clearRect(0, 0, displayWidth, displayHeight); ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = padding.top + (chartHeight / 4) * i; ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(displayWidth - padding.right, y); ctx.stroke(); }
  ctx.beginPath(); data.forEach((val, i) => { const x = padding.left + (i / (data.length - 1)) * chartWidth, y = padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight); ctx.lineTo(padding.left, padding.top + chartHeight); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight); gradient.addColorStop(0, "rgba(99, 102, 241, 0.3)"); gradient.addColorStop(1, "rgba(99, 102, 241, 0)"); ctx.fillStyle = gradient; ctx.fill();
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) { const val = minVal + ((maxVal - minVal) / 4) * (4 - i), y = padding.top + (chartHeight / 4) * i; ctx.fillText(Math.round(val).toString(), padding.left - 8, y + 4); }
  ctx.textAlign = "center"; ["Vor 30T", "Vor 20T", "Vor 10T", "Heute"].forEach((label, i) => { const x = padding.left + (i / 3) * chartWidth; ctx.fillText(label, x, displayHeight - 8); });
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("SecureStay Analytics initializing...");
  
  // Initialize all components
  initNavigation();
  initRiskModal();
  initRiskFilters();
  initAssetModal();
  initAssetFilters();
  initIncidentModal();
  initIncidentFilters();
  
  // Load demo data
  seedDemoData();
  
  // Render all tables and components
  renderRiskTable();
  renderRiskMatrix();
  renderMatrixRiskList();
  renderAssetTable();
  renderIncidentTable();
  updateDashboard();
  
  // Draw charts
  setTimeout(() => {
    drawSecurityRadar();
    drawTrendChart();
  }, 100);
  
  // Resize handler
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      drawSecurityRadar();
      drawTrendChart();
    }, 250);
  });
  
  // Welcome message
  setTimeout(() => {
    showToast("success", "Willkommen", "SecureStay Analytics ist bereit");
  }, 500);
  
  console.log("SecureStay Analytics ready!");
});
