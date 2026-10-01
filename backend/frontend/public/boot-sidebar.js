// Aplica el estado colapsado de la sidebar antes del primer pintado para evitar
// el salto visual. Vive en un archivo aparte (y no inline) para que el CSP pueda
// prohibir scripts inline.
(function () {
  try {
    if (localStorage.getItem('mm_sidebar_collapsed') === '1') {
      document.documentElement.classList.add('sidebar-collapsed');
    }
  } catch (_) {}
})();
