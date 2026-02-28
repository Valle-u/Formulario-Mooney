/* =========================
   USUARIOS (admin)
   ========================= */
async function loadUsers(){
  const tbody = document.getElementById("usersTbody");
  if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Cargando…</td></tr>`;

  try{
    const { users } = await api("/api/users");
    renderUsers(users);
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${err.message}</td></tr>`;
  }
}

function renderUsers(users){
  const tbody = document.getElementById("usersTbody");
  if(!tbody) return;

  // Verificar si el usuario actual es admin
  const currentUser = getUser();
  const isCurrentUserAdmin = currentUser && currentUser.role === "admin";

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>
        ${isCurrentUserAdmin
          ? `<input data-edit-username="${u.id}" value="${escapeHtml(u.username ?? '')}" placeholder="username">`
          : escapeHtml(u.username ?? u.full_name ?? '')
        }
      </td>
      <td><input data-edit-name="${u.id}" value="${escapeHtml(u.full_name||"")}" placeholder="Nombre completo"></td>
      <td>
        <select data-edit-role="${u.id}">
          <option value="empleado" ${u.role==="empleado"?"selected":""}>Empleado</option>
          <option value="encargado" ${u.role==="encargado"?"selected":""}>Encargado</option>
          <option value="direccion" ${u.role==="direccion"?"selected":""}>Dirección</option>
          <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
        </select>
      </td>
      <td><input type="checkbox" data-edit-active="${u.id}" ${u.is_active?"checked":""}></td>
      <td>${u.created_at ? new Date(u.created_at).toLocaleString() : ""}</td>
      <td class="row-actions">
        <button class="btn btn-small" data-save-user="${u.id}">Guardar</button>
        <button class="btn btn-small btn-danger" data-reset-pass="${u.id}">Reset pass</button>
      </td>
    </tr>
  `).join("");

  bindUserRowActions();
}

function bindUserRowActions(){
  document.querySelectorAll("[data-save-user]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.saveUser;

      // Obtener valores del formulario
      const usernameInput = document.querySelector(`[data-edit-username="${id}"]`);
      const full_name = document.querySelector(`[data-edit-name="${id}"]`)?.value ?? "";
      const role = document.querySelector(`[data-edit-role="${id}"]`)?.value ?? "empleado";
      const is_active = !!document.querySelector(`[data-edit-active="${id}"]`)?.checked;

      // Construir body - solo incluir username si el input existe (admin)
      const body = { full_name, role, is_active };
      if (usernameInput) {
        const username = usernameInput.value.trim();
        if (!username) {
          toast("Username vacio", "El username no puede estar vacio", "warning");
          return;
        }
        body.username = username;
      }

      try{
        await api(`/api/users/${id}`, { method:"PUT", body });
        toast("Guardado","Usuario actualizado correctamente", "success");
        // Recargar la lista de usuarios para mostrar los cambios
        loadUsers();
      }catch(err){
        toast("Error", err.message, "error");
      }
    });
  });

  // Variable para guardar el ID del usuario a resetear
  let resetUserId = null;

  document.querySelectorAll("[data-reset-pass]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.resetPass;
      resetUserId = id;

      // Mostrar modal
      const modal = document.getElementById("resetPasswordModal");
      const input = document.getElementById("reset_password");
      if(modal && input) {
        modal.style.display = "flex";
        input.value = "";
        input.focus();
      }
    });
  });

  // Cerrar modal
  const closeResetModal = () => {
    const modal = document.getElementById("resetPasswordModal");
    if(modal) modal.style.display = "none";
    resetUserId = null;
  };

  document.getElementById("btnCloseResetModal")?.addEventListener("click", closeResetModal);
  document.getElementById("btnCancelReset")?.addEventListener("click", closeResetModal);

  // Confirmar reset
  document.getElementById("btnConfirmReset")?.addEventListener("click", async ()=>{
    const pass = document.getElementById("reset_password")?.value || "";
    if(!pass || !resetUserId) return;

    try{
      await api(`/api/users/${resetUserId}/reset-password`, { method:"POST", body:{ password: pass } });
      toast("Guardado","Contrasena actualizada correctamente", "success");
      closeResetModal();
    }catch(err){
      toast("Error", err.message, "error");
    }
  });

  // Cerrar modal al hacer click fuera
  document.getElementById("resetPasswordModal")?.addEventListener("click", (e)=>{
    if(e.target.id === "resetPasswordModal") closeResetModal();
  });
}

async function createUser(){
  const u = document.getElementById("u_username")?.value?.trim() || "";
  const p = document.getElementById("u_password")?.value || "";
  const pConfirm = document.getElementById("u_password_confirm")?.value || "";
  const r = document.getElementById("u_role")?.value || "empleado";
  const n = document.getElementById("u_fullname")?.value?.trim() || "";

  if(!u || !p){
    toast("Faltan datos","Username y contrasena son obligatorios", "warning");
    return;
  }

  if(p !== pConfirm){
    toast("Contrasenas no coinciden","Las contrasenas deben ser identicas", "warning");
    return;
  }

  try{
    await api("/api/users", { method:"POST", body:{ username:u, password:p, role:r, full_name:n } });
    toast("Usuario creado","El nuevo usuario ya puede iniciar sesion", "success");
    document.getElementById("u_username").value = "";
    document.getElementById("u_password").value = "";
    document.getElementById("u_password_confirm").value = "";
    document.getElementById("u_fullname").value = "";
    loadUsers();
  }catch(err){
    toast("Error", err.message, "error");
  }
}

// Validación en tiempo real de coincidencia de contraseñas
function setupPasswordMatchValidation(){
  const passInput = document.getElementById("u_password");
  const passConfirmInput = document.getElementById("u_password_confirm");
  const indicator = document.getElementById("password_match_indicator");

  if(!passInput || !passConfirmInput || !indicator) return;

  function checkMatch(){
    const pass = passInput.value;
    const passConfirm = passConfirmInput.value;

    if(!passConfirm){
      indicator.textContent = "Las contraseñas deben coincidir";
      indicator.style.color = "var(--muted)";
      return;
    }

    if(pass === passConfirm){
      indicator.textContent = "Contrasenas coinciden";
      indicator.style.color = "#10b981";
    } else {
      indicator.textContent = "Contrasenas no coinciden";
      indicator.style.color = "#ef4444";
    }
  }

  passInput.addEventListener("input", checkMatch);
  passConfirmInput.addEventListener("input", checkMatch);
}

/* =========================
   DOMCONTENTLOADED - Usuarios page
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  if(!document.getElementById("usersTable")) return;
  if(!requireAuth()) return;
  initCommonUI();
  setupPasswordMatchValidation();
  document.getElementById("btnCreateUser")?.addEventListener("click", createUser);
  document.getElementById("btnReloadUsers")?.addEventListener("click", loadUsers);
  loadUsers();
});
