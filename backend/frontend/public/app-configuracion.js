/* =========================
   CONFIGURACIÓN - Admin UI
   ========================= */

let currentTab = "empresas";
let empresasList = [];
let etiquetasList = [];
let categoriesList = [];
let apiKeysList = [];

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;

  // Solo admin puede acceder
  const user = getUser();
  if (user.role !== "admin") {
    toast("Acceso denegado", "Solo administradores pueden acceder a esta página", "error");
    setTimeout(() => { window.location.href = "egreso.html"; }, 1500);
    return;
  }

  await initCommonUI();
  initTabs();
  initModal();
  setupConfigTableActions();
  initApiKeyUi();
  await loadEmpresas();
  await loadCategories();
});

// ===== TABS =====
function initTabs() {
  document.querySelectorAll(".config-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".config-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;

      document.getElementById("panel-empresas").style.display = currentTab === "empresas" ? "" : "none";
      document.getElementById("panel-etiquetas").style.display = currentTab === "etiquetas" ? "" : "none";
      document.getElementById("panel-apikeys").style.display = currentTab === "apikeys" ? "" : "none";

      if (currentTab === "etiquetas" && etiquetasList.length === 0) {
        loadEtiquetas();
      }
      if (currentTab === "apikeys") {
        loadApiKeys();
      }
    });
  });

  document.getElementById("btnAddEmpresa").addEventListener("click", () => openModal("empresa"));
  document.getElementById("btnAddEtiqueta").addEventListener("click", () => openModal("etiqueta"));
}

// ===== LOAD DATA =====
async function loadEmpresas() {
  try {
    const { options } = await api("/api/options/all?type=empresa");
    empresasList = options;
    renderEmpresas();
  } catch (err) {
    toast("Error", err.message, "error");
  }
}

async function loadEtiquetas() {
  try {
    const { options } = await api("/api/options/all?type=etiqueta");
    etiquetasList = options;
    renderEtiquetas();
  } catch (err) {
    toast("Error", err.message, "error");
  }
}

async function loadCategories() {
  try {
    const { categories } = await api("/api/options/categories");
    categoriesList = categories;
  } catch (err) {
    console.warn("Error cargando categorías:", err.message);
  }
}

// ===== RENDER EMPRESAS =====
function renderEmpresas() {
  const tbody = document.getElementById("tbodyEmpresas");
  if (!tbody) return;

  tbody.innerHTML = empresasList.map((opt, i) => `
    <tr class="${opt.is_active ? '' : 'row-inactive'}">
      <td class="config-order">
        <button class="btn-order" data-dir="up" data-id="${opt.id}" data-order-type="empresa" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="btn-order" data-dir="down" data-id="${opt.id}" data-order-type="empresa" ${i === empresasList.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
      </td>
      <td>${escapeHtml(opt.value)}</td>
      <td>
        <label class="config-toggle">
          <input type="checkbox" ${opt.is_active ? 'checked' : ''} data-toggle-id="${opt.id}" data-toggle-type="empresa"/>
          <span class="config-toggle-slider"></span>
        </label>
      </td>
      <td class="row-actions">
        <button class="btn btn-small" data-edit-id="${opt.id}" data-edit-type="empresa">Editar</button>
      </td>
    </tr>
  `).join("");

}

// ===== RENDER ETIQUETAS =====
function renderEtiquetas() {
  const tbody = document.getElementById("tbodyEtiquetas");
  if (!tbody) return;

  tbody.innerHTML = etiquetasList.map((opt, i) => `
    <tr class="${opt.is_active ? '' : 'row-inactive'}">
      <td class="config-order">
        <button class="btn-order" data-dir="up" data-id="${opt.id}" data-order-type="etiqueta" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="btn-order" data-dir="down" data-id="${opt.id}" data-order-type="etiqueta" ${i === etiquetasList.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
      </td>
      <td>${escapeHtml(opt.category || '—')}</td>
      <td>${escapeHtml(opt.value)}</td>
      <td class="config-flag">${opt.flag_usuario_casino ? '✓' : ''}</td>
      <td class="config-flag">${opt.flag_premio_minimo ? '✓' : ''}</td>
      <td class="config-flag">${opt.flag_cierre_caja ? '✓' : ''}</td>
      <td>
        <label class="config-toggle">
          <input type="checkbox" ${opt.is_active ? 'checked' : ''} data-toggle-id="${opt.id}" data-toggle-type="etiqueta"/>
          <span class="config-toggle-slider"></span>
        </label>
      </td>
      <td class="row-actions">
        <button class="btn btn-small" data-edit-id="${opt.id}" data-edit-type="etiqueta">Editar</button>
      </td>
    </tr>
  `).join("");
}

// ===== TABLE ACTIONS (delegación, una sola vez) =====
let configActionsBound = false;

function setupConfigTableActions() {
  if (configActionsBound) return;
  configActionsBound = true;

  const panels = [
    document.getElementById("tbodyEmpresas"),
    document.getElementById("tbodyEtiquetas")
  ].filter(Boolean);

  for (const tbody of panels) {
    tbody.addEventListener("change", async (e) => {
      const input = e.target.closest("[data-toggle-id]");
      if (!input) return;
      const id = input.dataset.toggleId;
      const type = input.dataset.toggleType;
      try {
        await api(`/api/options/${id}`, { method: "PUT", body: { is_active: input.checked } });
        toast("Actualizado", `Opción ${input.checked ? 'activada' : 'desactivada'}`, "success");
        if (type === "empresa") await loadEmpresas(); else await loadEtiquetas();
        reloadSelectOptions();
      } catch (err) {
        toast("Error", err.message, "error");
        input.checked = !input.checked;
      }
    });

    tbody.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit-id]");
      if (editBtn) {
        const type = editBtn.dataset.editType;
        const list = type === "empresa" ? empresasList : etiquetasList;
        const id = parseInt(editBtn.dataset.editId, 10);
        const opt = list.find(o => o.id === id);
        if (opt) openModal(type, opt);
        return;
      }

      const orderBtn = e.target.closest("[data-dir]");
      if (!orderBtn || orderBtn.disabled) return;
      const type = orderBtn.dataset.orderType || orderBtn.dataset.editType ||
        (tbody.id === "tbodyEmpresas" ? "empresa" : "etiqueta");
      const list = type === "empresa" ? empresasList : etiquetasList;
      const id = parseInt(orderBtn.dataset.id, 10);
      const dir = orderBtn.dataset.dir;
      const idx = list.findIndex(o => o.id === id);
      if (idx < 0) return;

      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return;

      [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
      const ids = list.map(o => o.id);

      try {
        await api("/api/options/reorder", { method: "PUT", body: { ids } });
        if (type === "empresa") renderEmpresas(); else renderEtiquetas();
        reloadSelectOptions();
      } catch (err) {
        toast("Error", err.message, "error");
        if (type === "empresa") await loadEmpresas(); else await loadEtiquetas();
      }
    });
  }
}

// ===== MODAL =====
function initModal() {
  document.getElementById("optionModalClose").addEventListener("click", closeModal);
  document.getElementById("optionModalCancel").addEventListener("click", closeModal);
  document.getElementById("optionModalSave").addEventListener("click", saveOption);

  // Cerrar al click en backdrop
  document.getElementById("optionModal").addEventListener("click", (e) => {
    if (e.target.id === "optionModal") closeModal();
  });
}

function openModal(type, opt = null) {
  const modal = document.getElementById("optionModal");
  const title = document.getElementById("optionModalTitle");
  const isEdit = !!opt;

  title.textContent = isEdit ? "Editar opción" : "Agregar opción";
  document.getElementById("modal_option_id").value = isEdit ? opt.id : "";
  document.getElementById("modal_option_type").value = type;

  // Value
  if (isEdit && type === "etiqueta" && opt.category && opt.value.startsWith("[")) {
    // Extraer solo el nombre sin el prefijo [Categoria]
    const match = opt.value.match(/^\[.*?\]\s*(.+)$/);
    document.getElementById("modal_value").value = match ? match[1] : opt.value;
  } else {
    document.getElementById("modal_value").value = isEdit ? opt.value : "";
  }

  // Category (solo etiquetas)
  const catWrap = document.getElementById("modal_category_wrap");
  const flagsWrap = document.getElementById("modal_flags_wrap");

  if (type === "etiqueta") {
    catWrap.style.display = "";
    flagsWrap.style.display = "";

    // Populate category select
    const catSelect = document.getElementById("modal_category_select");
    catSelect.innerHTML = `<option value="">Sin categoría</option>` +
      categoriesList.map(c => `<option value="${escapeHtml(c)}" ${isEdit && opt.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join("");

    document.getElementById("modal_category_new").value = "";
    document.getElementById("modal_flag_casino").checked = isEdit ? opt.flag_usuario_casino : false;
    document.getElementById("modal_flag_premio").checked = isEdit ? opt.flag_premio_minimo : false;
    document.getElementById("modal_flag_cierre").checked = isEdit ? opt.flag_cierre_caja : false;
  } else {
    catWrap.style.display = "none";
    flagsWrap.style.display = "none";
  }

  modal.style.display = "flex";
  document.getElementById("modal_value").focus();
}

function closeModal() {
  document.getElementById("optionModal").style.display = "none";
}

async function saveOption() {
  const id = document.getElementById("modal_option_id").value;
  const type = document.getElementById("modal_option_type").value;
  const value = document.getElementById("modal_value").value.trim();
  const isEdit = !!id;

  if (!value) {
    toast("Error", "El nombre es obligatorio", "warning");
    return;
  }

  const body = { option_type: type, value };

  if (type === "etiqueta") {
    const catNew = document.getElementById("modal_category_new").value.trim();
    const catSelect = document.getElementById("modal_category_select").value;
    body.category = catNew || catSelect || null;
    body.flag_usuario_casino = document.getElementById("modal_flag_casino").checked;
    body.flag_premio_minimo = document.getElementById("modal_flag_premio").checked;
    body.flag_cierre_caja = document.getElementById("modal_flag_cierre").checked;
  }

  try {
    if (isEdit) {
      await api(`/api/options/${id}`, { method: "PUT", body });
      toast("Actualizado", "Opción guardada correctamente", "success");
    } else {
      await api("/api/options", { method: "POST", body });
      toast("Creada", "Nueva opción agregada", "success");
    }

    closeModal();
    if (type === "empresa") await loadEmpresas(); else { await loadEtiquetas(); await loadCategories(); }
    reloadSelectOptions();
  } catch (err) {
    toast("Error", err.message, "error");
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadApiKeys() {
  try {
    const { api_keys } = await api("/api/api-keys");
    apiKeysList = api_keys || [];
    renderApiKeys();
  } catch (err) {
    toast("Error", err.message, "error");
  }
}

function renderApiKeys() {
  const tbody = document.getElementById("tbodyApiKeys");
  if (!tbody) return;

  if (!apiKeysList.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="note">Todavía no hay API keys. Creá una para exportar datos a otra app.</td></tr>`;
    return;
  }

  tbody.innerHTML = apiKeysList.map((key) => {
    const statusClass = key.status === "activa" ? "api-key-status-ok" : "api-key-status-off";
    const canRevoke = key.status === "activa";
    return `
      <tr class="${canRevoke ? "" : "row-inactive"}">
        <td>${escapeHtml(key.name)}</td>
        <td><code>${escapeHtml(key.key_prefix)}…</code></td>
        <td>${escapeHtml((key.scopes || []).join(", "))}</td>
        <td>${escapeHtml(formatDateTime(key.created_at))}</td>
        <td>${escapeHtml(formatDateTime(key.last_used_at))}</td>
        <td>${escapeHtml(key.expires_at ? formatDateTime(key.expires_at) : "Nunca")}</td>
        <td><span class="api-key-status ${statusClass}">${escapeHtml(key.status)}</span></td>
        <td class="row-actions">
          ${canRevoke
            ? `<button class="btn btn-danger btn-small" data-revoke-key="${key.id}">Revocar</button>`
            : "—"}
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-revoke-key]").forEach((btn) => {
    btn.addEventListener("click", () => revokeApiKey(Number(btn.dataset.revokeKey)));
  });
}

function initApiKeyUi() {
  const example = document.getElementById("apiKeyExample");
  if (example && typeof API_BASE !== "undefined") {
    example.textContent = `curl -H "X-API-Key: TU_API_KEY" "${API_BASE}/api/export/egresos?limit=100"`;
  }

  document.getElementById("btnAddApiKey").addEventListener("click", openApiKeyModal);
  document.getElementById("apiKeyModalClose").addEventListener("click", closeApiKeyModal);
  document.getElementById("apiKeyModalCancel").addEventListener("click", closeApiKeyModal);
  document.getElementById("apiKeyModalSave").addEventListener("click", createApiKey);
  document.getElementById("apiKeyModal").addEventListener("click", (e) => {
    if (e.target.id === "apiKeyModal") closeApiKeyModal();
  });

  document.getElementById("apiKeyCreatedClose").addEventListener("click", closeApiKeyCreatedModal);
  document.getElementById("apiKeyCreatedOk").addEventListener("click", closeApiKeyCreatedModal);
  document.getElementById("apiKeyCreatedModal").addEventListener("click", (e) => {
    if (e.target.id === "apiKeyCreatedModal") closeApiKeyCreatedModal();
  });
  document.getElementById("apiKeyCopyBtn").addEventListener("click", copyCreatedApiKey);
}

function openApiKeyModal() {
  document.getElementById("apiKeyName").value = "";
  document.getElementById("apiKeyExpires").value = "never";
  document.getElementById("apiKeyModal").style.display = "flex";
  document.getElementById("apiKeyName").focus();
}

function closeApiKeyModal() {
  document.getElementById("apiKeyModal").style.display = "none";
}

function closeApiKeyCreatedModal() {
  document.getElementById("apiKeyCreatedModal").style.display = "none";
  document.getElementById("apiKeyRawValue").textContent = "";
}

function showCreatedApiKey(rawKey) {
  document.getElementById("apiKeyRawValue").textContent = rawKey;
  document.getElementById("apiKeyCreatedModal").style.display = "flex";
}

async function copyCreatedApiKey() {
  const value = document.getElementById("apiKeyRawValue").textContent;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast("Copiada", "La API key se copió al portapapeles", "success");
  } catch {
    toast("Error", "No se pudo copiar. Seleccioná la clave y copiala a mano.", "error");
  }
}

async function createApiKey() {
  const name = document.getElementById("apiKeyName").value.trim();
  const expires = document.getElementById("apiKeyExpires").value;
  if (!name || name.length < 2) {
    toast("Error", "El nombre es obligatorio", "warning");
    return;
  }

  try {
    const result = await api("/api/api-keys", {
      method: "POST",
      body: {
        name,
        expires_in_days: expires === "never" ? "never" : Number(expires),
        scopes: ["export:egresos"]
      }
    });
    closeApiKeyModal();
    await loadApiKeys();
    showCreatedApiKey(result.raw_key);
    toast("Creada", "API key generada. Copiala ahora.", "success");
  } catch (err) {
    toast("Error", err.message, "error");
  }
}

async function revokeApiKey(id) {
  const key = apiKeysList.find((item) => item.id === id);
  const label = key ? key.name : "esta API key";
  if (!confirm(`¿Revocar ${label}? La otra app va a dejar de poder exportar datos.`)) return;

  try {
    await api(`/api/api-keys/${id}/revoke`, { method: "POST" });
    toast("Revocada", "La API key ya no sirve para exportar", "success");
    await loadApiKeys();
  } catch (err) {
    toast("Error", err.message, "error");
  }
}
