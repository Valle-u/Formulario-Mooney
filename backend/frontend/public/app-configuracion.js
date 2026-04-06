/* =========================
   CONFIGURACIÓN - Admin UI
   ========================= */

let currentTab = "empresas";
let empresasList = [];
let etiquetasList = [];
let categoriesList = [];

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

      if (currentTab === "etiquetas" && etiquetasList.length === 0) {
        loadEtiquetas();
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
        <button class="btn-order" data-dir="up" data-id="${opt.id}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="btn-order" data-dir="down" data-id="${opt.id}" ${i === empresasList.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
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

  bindTableActions("empresa");
}

// ===== RENDER ETIQUETAS =====
function renderEtiquetas() {
  const tbody = document.getElementById("tbodyEtiquetas");
  if (!tbody) return;

  tbody.innerHTML = etiquetasList.map((opt, i) => `
    <tr class="${opt.is_active ? '' : 'row-inactive'}">
      <td class="config-order">
        <button class="btn-order" data-dir="up" data-id="${opt.id}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="btn-order" data-dir="down" data-id="${opt.id}" ${i === etiquetasList.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
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

  bindTableActions("etiqueta");
}

// ===== BIND TABLE ACTIONS =====
function bindTableActions(type) {
  const list = type === "empresa" ? empresasList : etiquetasList;

  // Toggle active
  document.querySelectorAll(`[data-toggle-type="${type}"]`).forEach(input => {
    input.addEventListener("change", async () => {
      const id = input.dataset.toggleId;
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
  });

  // Edit
  document.querySelectorAll(`[data-edit-type="${type}"]`).forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.editId);
      const opt = list.find(o => o.id === id);
      if (opt) openModal(type, opt);
    });
  });

  // Reorder
  document.querySelectorAll(`[data-dir]`).forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.id);
      const dir = btn.dataset.dir;
      const idx = list.findIndex(o => o.id === id);
      if (idx < 0) return;

      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return;

      // Swap in array
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
  });
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
