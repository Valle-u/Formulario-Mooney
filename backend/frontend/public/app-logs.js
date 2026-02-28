/* =========================
   LOGS (admin)
   ========================= */
let logsOffset = 0;
const LOGS_LIMIT = 20;

async function loadLogs(){
  const tbody = document.getElementById("logsTbody");
  if(!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="muted">Cargando…</td></tr>`;

  const username = document.getElementById("logUsername")?.value?.trim() || "";
  const action = document.getElementById("logAction")?.value?.trim() || "";
  const from = document.getElementById("logFrom")?.value || "";
  const to = document.getElementById("logTo")?.value || "";

  const qs = new URLSearchParams();
  qs.set("limit", String(LOGS_LIMIT));
  qs.set("offset", String(logsOffset));
  if(username) qs.set("username", username);
  if(action) qs.set("action", action);
  if(from) qs.set("from", from);
  if(to) qs.set("to", to);

  try{
    const { logs, total, limit, offset } = await api(`/api/logs?${qs.toString()}`);

    const rows = logs.map(l => {
      const dt = l.created_at ? new Date(l.created_at).toLocaleString() : "";
      const ok = l.success ? "SI" : "NO";
      const detail = l.details ? JSON.stringify(l.details) : "";
      return `
        <tr>
          <td>${dt}</td>
          <td>${l.actor_username || "-"}</td>
          <td>${l.actor_role || "-"}</td>
          <td>${l.action}</td>
          <td>${l.entity || "-"}</td>
          <td>${l.entity_id || "-"}</td>
          <td>${ok}</td>
          <td>${l.ip || "-"}</td>
          <td style="max-width:360px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${detail.replace(/"/g,"&quot;")}">
            ${detail}
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="9" class="muted">Sin resultados</td></tr>`;

    // Actualizar info de paginación
    const info = document.getElementById("logsPageInfo");
    if(info){
      const start = offset + 1;
      const end = Math.min(offset + logs.length, total);
      info.textContent = `Mostrando ${start}-${end} de ${total} logs`;
    }

    // Deshabilitar botones según corresponda
    const btnPrev = document.getElementById("btnPrevLogs");
    const btnNext = document.getElementById("btnNextLogs");
    if(btnPrev) btnPrev.disabled = offset === 0;
    if(btnNext) btnNext.disabled = offset + logs.length >= total;

  }catch(err){
    tbody.innerHTML = `<tr><td colspan="9" class="muted">${err.message}</td></tr>`;
  }
}

function logsPrev(){
  logsOffset = Math.max(logsOffset - LOGS_LIMIT, 0);
  loadLogs();
}
function logsNext(){
  logsOffset += LOGS_LIMIT;
  loadLogs();
}
function clearLogsFilters(){
  document.getElementById("logUsername").value = "";
  document.getElementById("logAction").value = "";
  document.getElementById("logFrom").value = "";
  document.getElementById("logTo").value = "";
  logsOffset = 0;
  loadLogs();
}

/* =========================
   DOMCONTENTLOADED - Logs page
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  if(!document.getElementById("logsTable")) return;
  if(!requireAuth()) return;
  initCommonUI();
  document.getElementById("btnLoadLogs")?.addEventListener("click", () => { logsOffset = 0; loadLogs(); });
  document.getElementById("btnClearLogsFilters")?.addEventListener("click", clearLogsFilters);
  document.getElementById("btnPrevLogs")?.addEventListener("click", logsPrev);
  document.getElementById("btnNextLogs")?.addEventListener("click", logsNext);
  loadLogs();
});
