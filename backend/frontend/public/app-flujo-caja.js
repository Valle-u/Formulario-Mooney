const ROLES_FLUJO = new Set(["admin", "direccion"]);
const CACHE_KEY = "mooney-flujo-caja";

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

function celdaLado(moneda, monto, clase) {
  const v = Number(monto);
  if (!v) return "<td>—</td>";
  return `<td class="${clase}">${formato(moneda, v)}</td>`;
}

function filaEtiqueta(moneda, fila) {
  return `<tr>
    <td>${escapeHtml(fila.etiqueta)}</td>
    ${celdaLado(moneda, fila.entro, "num-pos")}
    ${celdaLado(moneda, fila.salio, "num-neg")}
    <td>${fila.movimientos}</td>
  </tr>`;
}

function tablaEtiquetas(moneda, filas) {
  if (!filas.length) return `<p class="flujo-vacio">Sin movimientos en este mes.</p>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Etiqueta</th><th>Entró</th><th>Salió</th><th>Movimientos</th></tr></thead>
    <tbody>${filas.map((f) => filaEtiqueta(moneda, f)).join("")}</tbody>
  </table></div>`;
}

function celdaNeto(moneda, monto) {
  const v = Number(monto);
  if (!v) return "<td>—</td>";
  return `<td class="${claseNum(v)}">${formato(moneda, v)}</td>`;
}

function diasHtml(moneda, dias) {
  if (!dias.length) return "";
  const filas = dias.map((dia) => {
    const id = `dia-${moneda}-${dia.fecha}`;
    return `<tr>
      <td><button type="button" class="flujo-dia-btn" aria-expanded="false" aria-controls="${id}">${fechaCorta(dia.fecha)}</button></td>
      ${celdaLado(moneda, dia.entro, "num-pos")}
      ${celdaLado(moneda, dia.salio, "num-neg")}
      ${celdaNeto(moneda, dia.neto)}
    </tr>
    <tr id="${id}" class="flujo-dia-detalle" hidden>
      <td colspan="4">${tablaEtiquetas(moneda, dia.etiquetas)}</td>
    </tr>`;
  }).join("");
  return `<h3 style="margin:16px 0 8px">Por día</h3>
    <p class="note">Tocá la fecha para ver las etiquetas de ese día.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Fecha</th><th>Entró</th><th>Salió</th><th>Neto</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

function alertaRedireccion(moneda, flujo) {
  const r = flujo.redireccion;
  if (!r || !r.movimientos) return "";
  if (r.diferencia === 0) {
    return `<p class="note">Redirección de capital: entró ${formato(moneda, r.entro)} y salió ${formato(moneda, r.salio)}. No se suma al flujo.</p>`;
  }
  const falta = r.diferencia > 0 ? "la salida" : "la entrada";
  return `<p class="flujo-alerta">Redirección de capital: entró ${formato(moneda, r.entro)} y salió ${formato(moneda, r.salio)}. Hay una diferencia de ${formato(moneda, Math.abs(r.diferencia))} porque falta cargar ${falta}.</p>`;
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
      ${alertaRedireccion(moneda, flujo)}
      ${cierreHtml(moneda, flujo)}
      <h3 style="margin:0 0 8px">Por etiqueta</h3>
      ${tablaEtiquetas(moneda, flujo.por_etiqueta)}
      ${diasHtml(moneda, flujo.por_dia)}
    </div>
  </section>`;
}

function claveMes(anio, mes) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function leerTodo() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function leerMes(anio, mes) {
  const item = leerTodo()[claveMes(anio, mes)];
  if (!item?.data?.flujos) return null;
  return item;
}

function guardarMes(anio, mes, data) {
  const todo = leerTodo();
  todo[claveMes(anio, mes)] = { cuando: new Date().toISOString(), data };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(todo));
  } catch {
    /* si el navegador no guarda, el flujo igual queda en pantalla */
  }
}

function render(data, guardado) {
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
  let extra = "";
  if (guardado) {
    const cuando = new Date(guardado);
    if (!Number.isNaN(cuando.getTime())) {
      extra = ` Guardado ${cuando.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}. Ver flujo lo actualiza.`;
    }
  }
  document.getElementById("flujoEstado").textContent = `Período ${desde} al ${hasta}. ${origen}${extra}`;
  root.querySelectorAll(".flujo-dia-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fila = document.getElementById(btn.getAttribute("aria-controls"));
      if (!fila) return;
      const abierto = fila.hidden;
      fila.hidden = !abierto;
      btn.setAttribute("aria-expanded", String(abierto));
    });
  });
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
    guardarMes(anio, mes, data);
    render(data);
  } catch (e) {
    if (!leerMes(anio, mes)) document.getElementById("flujoResultado").style.display = "none";
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
    window.location.replace("egreso.html");
    return;
  }
  const [anio, mesNum] = mes.value.split("-").map(Number);
  const guardado = leerMes(anio, mesNum);
  if (guardado) render(guardado.data, guardado.cuando);
  else cargar({ preventDefault() {} });
});
