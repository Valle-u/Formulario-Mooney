const ROLES_FLUJO = new Set(["admin", "direccion", "encargado"]);

const NOTAS = {
  ARS: "El ingreso sale del balance mensual etiquetado al cargar el CSV. Las salidas y los cierres salen de este formulario. Quedó es inicio + entró − salió.",
  USDT: "Las entradas se toman de los movimientos ENTRADA y las salidas del resto. El inicio es el cierre de caja del último día del mes anterior. Quedó es inicio + entró − salió.",
  USD: "Mismo criterio que USDT, en dólares. No se mezcla con el flujo USDT.",
};

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formato(moneda, n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const texto = v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (moneda === "ARS") return `$ ${texto}`;
  return `${texto} ${moneda}`;
}

function claseNum(n) {
  const v = Number(n);
  if (v > 0) return "num-pos";
  if (v < 0) return "num-neg";
  return "";
}

function fechaCorta(iso) {
  const [y, m, d] = String(iso).split("-");
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function filaEtiqueta(moneda, fila) {
  return `<tr>
    <td>${escapeHtml(fila.etiqueta)}</td>
    <td class="${claseNum(fila.entro)}">${formato(moneda, fila.entro)}</td>
    <td class="${claseNum(-fila.salio)}">${formato(moneda, fila.salio)}</td>
    <td class="${claseNum(fila.neto)}">${formato(moneda, fila.neto)}</td>
    <td>${fila.movimientos}</td>
  </tr>`;
}

function tablaEtiquetas(moneda, filas) {
  if (!filas.length) return `<p class="flujo-vacio">Sin movimientos en este mes.</p>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Etiqueta</th><th>Entró</th><th>Salió</th><th>Neto</th><th>Movimientos</th></tr></thead>
    <tbody>${filas.map((f) => filaEtiqueta(moneda, f)).join("")}</tbody>
  </table></div>`;
}

function diasHtml(moneda, dias) {
  if (!dias.length) return "";
  return `<h3 style="margin:16px 0 8px">Por día</h3>` + dias.map((dia) => `
    <details class="flujo-dia">
      <summary>
        <span>${fechaCorta(dia.fecha)}</span>
        <span>Entró ${formato(moneda, dia.entro)} · Salió ${formato(moneda, dia.salio)} · Neto <span class="${claseNum(dia.neto)}">${formato(moneda, dia.neto)}</span></span>
      </summary>
      ${tablaEtiquetas(moneda, dia.etiquetas)}
    </details>
  `).join("");
}

function cierreHtml(moneda, flujo) {
  if (flujo.cierre_declarado == null) {
    return `<p class="note flujo-cierre">Sin cierre cargado en el mes. Quedó es el saldo calculado.</p>`;
  }
  const cuentas = flujo.cuentas_cierre === 1 ? "1 cuenta" : `${flujo.cuentas_cierre} cuentas`;
  return `<p class="note flujo-cierre">Cierre cargado (${cuentas}): <strong>${formato(moneda, flujo.cierre_declarado)}</strong>. Diferencia contra el saldo calculado: <strong class="${claseNum(flujo.diferencia)}">${formato(moneda, flujo.diferencia)}</strong>.</p>`;
}

function bloque(moneda, flujo, fechaInicio) {
  const cuando = fechaInicio ? ` del ${fechaCorta(fechaInicio)}` : " del mes anterior";
  const inicioCuentas = flujo.cuentas_inicio === 1
    ? `1 cierre${cuando}`
    : flujo.cuentas_inicio > 1
      ? `${flujo.cuentas_inicio} cierres${cuando}`
      : `sin cierre${cuando}`;
  return `<section class="card">
    <div class="card-header">Flujo ${moneda}</div>
    <div class="card-body">
      <div class="flujo-kpis">
        <div class="flujo-kpi"><span>Inicio</span><strong>${formato(moneda, flujo.inicio)}</strong></div>
        <div class="flujo-kpi entro"><span>Entró</span><strong>${formato(moneda, flujo.entro)}</strong></div>
        <div class="flujo-kpi salio"><span>Salió</span><strong>${formato(moneda, flujo.salio)}</strong></div>
        <div class="flujo-kpi"><span>Quedó</span><strong class="${claseNum(flujo.quedo)}">${formato(moneda, flujo.quedo)}</strong></div>
      </div>
      <p class="note">Inicio: ${inicioCuentas}. ${NOTAS[moneda]}</p>
      ${cierreHtml(moneda, flujo)}
      <h3 style="margin:0 0 8px">Por etiqueta</h3>
      ${tablaEtiquetas(moneda, flujo.por_etiqueta)}
      ${diasHtml(moneda, flujo.por_dia)}
    </div>
  </section>`;
}

function render(data) {
  const root = document.getElementById("flujoResultado");
  const { ARS, USDT, USD } = data.flujos;
  const fechaInicio = data.periodo.inicio_fecha;
  root.innerHTML = bloque("ARS", ARS, fechaInicio) + bloque("USDT", USDT, fechaInicio) + bloque("USD", USD, fechaInicio);
  root.style.display = "";
  const desde = fechaCorta(data.periodo.desde);
  const hasta = fechaCorta(data.periodo.hasta);
  const ing = data.ingresos_ars || {};
  const origen = ing.aviso
    ? `No pude leer los ingresos del balance: ${ing.aviso}`
    : `Ingresos en pesos: ${ing.movimientos || 0} movimientos del balance cargado.`;
  document.getElementById("flujoEstado").textContent = `Período ${desde} al ${hasta}. ${origen}`;
}

async function cargar(ev) {
  ev.preventDefault();
  const btn = document.getElementById("btnVer");
  const estado = document.getElementById("flujoEstado");
  const valor = document.getElementById("mes").value;
  if (!/^\d{4}-\d{2}$/.test(valor)) {
    estado.textContent = "Elegí un mes.";
    return;
  }
  const [anio, mes] = valor.split("-").map(Number);
  btn.disabled = true;
  estado.textContent = "Armando el flujo…";
  try {
    const data = await api(`/api/flujo-caja?anio=${anio}&mes=${mes}`);
    render(data);
  } catch (e) {
    document.getElementById("flujoResultado").style.display = "none";
    estado.textContent = e.message || "No pude armar el flujo de caja";
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  await initCommonUI();
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);
  const mes = document.getElementById("mes");
  mes.value = mesActual();
  document.getElementById("flujoForm").addEventListener("submit", cargar);
  if (!ROLES_FLUJO.has(getUser().role)) {
    document.getElementById("flujoEstado").textContent = "Esta sección es para admin, dirección o encargado.";
    document.getElementById("btnVer").disabled = true;
    mes.disabled = true;
    return;
  }
  cargar({ preventDefault() {} });
});
