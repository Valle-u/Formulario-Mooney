import { Router } from "express";
import { query } from "../config/db.js";
import { auth, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../utils/audit.js";
import { invalidateCache } from "../utils/optionsCache.js";

const router = Router();

// GET /api/options?type=empresa|etiqueta — opciones activas (todos los usuarios autenticados)
router.get("/", auth, async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !["empresa", "etiqueta"].includes(type)) {
      return res.status(400).json({ message: "Parámetro type requerido: empresa o etiqueta" });
    }

    const { rows } = await query(
      `SELECT id, option_type, value, category, sort_order,
              flag_usuario_casino, flag_premio_minimo, flag_cierre_caja
       FROM select_options
       WHERE option_type = $1 AND is_active = true
       ORDER BY sort_order, id`,
      [type]
    );

    res.json({ options: rows });
  } catch (err) {
    console.error("Error GET /api/options:", err);
    res.status(500).json({ message: "Error al obtener opciones" });
  }
});

// GET /api/options/all?type=empresa|etiqueta — todas incluidas inactivas (solo admin)
router.get("/all", auth, requireAdmin, async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !["empresa", "etiqueta"].includes(type)) {
      return res.status(400).json({ message: "Parámetro type requerido: empresa o etiqueta" });
    }

    const { rows } = await query(
      `SELECT id, option_type, value, category, sort_order, is_active,
              flag_usuario_casino, flag_premio_minimo, flag_cierre_caja,
              legacy_value, created_at, updated_at
       FROM select_options
       WHERE option_type = $1
       ORDER BY sort_order, id`,
      [type]
    );

    res.json({ options: rows });
  } catch (err) {
    console.error("Error GET /api/options/all:", err);
    res.status(500).json({ message: "Error al obtener opciones" });
  }
});

// GET /api/options/categories — categorías distintas de etiquetas
router.get("/categories", auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT category FROM select_options
       WHERE option_type = 'etiqueta' AND category IS NOT NULL
       ORDER BY category`
    );
    res.json({ categories: rows.map(r => r.category) });
  } catch (err) {
    console.error("Error GET /api/options/categories:", err);
    res.status(500).json({ message: "Error al obtener categorías" });
  }
});

// POST /api/options — crear opción (solo admin)
router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const { option_type, value, category, sort_order, flag_usuario_casino, flag_premio_minimo, flag_cierre_caja, legacy_value } = req.body;

    if (!option_type || !["empresa", "etiqueta"].includes(option_type)) {
      return res.status(400).json({ message: "option_type debe ser empresa o etiqueta" });
    }

    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) {
      return res.status(400).json({ message: "El valor es obligatorio" });
    }

    // Para etiquetas, construir valor con prefijo de categoría si se proporciona
    let finalValue = trimmedValue;
    if (option_type === "etiqueta" && category && !trimmedValue.startsWith("[")) {
      finalValue = `[${category}] ${trimmedValue}`;
    }

    // Obtener el max sort_order actual para poner al final si no se especifica
    let finalSort = sort_order;
    if (finalSort === undefined || finalSort === null) {
      const maxRes = await query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
         FROM select_options WHERE option_type = $1`,
        [option_type]
      );
      finalSort = maxRes.rows[0].next_order;
    }

    const { rows } = await query(
      `INSERT INTO select_options (option_type, value, category, sort_order, flag_usuario_casino, flag_premio_minimo, flag_cierre_caja, legacy_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        option_type,
        finalValue,
        category || null,
        finalSort,
        !!flag_usuario_casino,
        !!flag_premio_minimo,
        !!flag_cierre_caja,
        legacy_value || null
      ]
    );

    invalidateCache();

    await auditLog(req, {
      action: "OPTION_CREATE",
      entity: "select_options",
      entity_id: rows[0].id,
      success: true,
      status_code: 201,
      details: { option_type, value: finalValue, category }
    });

    res.status(201).json({ option: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Ya existe una opción con ese valor" });
    }
    console.error("Error POST /api/options:", err);
    res.status(500).json({ message: "Error al crear opción" });
  }
});

// PUT /api/options/reorder — reordenar (solo admin)
router.put("/reorder", auth, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Se requiere array de ids" });
    }

    // Actualizar sort_order en una transacción
    const client = (await import("../config/db.js")).pool;
    const conn = await client.connect();
    try {
      await conn.query("BEGIN");
      for (let i = 0; i < ids.length; i++) {
        await conn.query(
          `UPDATE select_options SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
          [i, ids[i]]
        );
      }
      await conn.query("COMMIT");
    } catch (e) {
      await conn.query("ROLLBACK");
      throw e;
    } finally {
      conn.release();
    }

    invalidateCache();
    res.json({ message: "Orden actualizado" });
  } catch (err) {
    console.error("Error PUT /api/options/reorder:", err);
    res.status(500).json({ message: "Error al reordenar" });
  }
});

// PUT /api/options/:id — editar opción (solo admin)
router.put("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { value, category, is_active, flag_usuario_casino, flag_premio_minimo, flag_cierre_caja, legacy_value } = req.body;

    // Obtener opción actual
    const current = await query(`SELECT * FROM select_options WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ message: "Opción no encontrada" });
    }

    const opt = current.rows[0];

    // Construir updates dinámicos
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (value !== undefined) {
      let finalValue = String(value).trim();
      if (opt.option_type === "etiqueta" && category && !finalValue.startsWith("[")) {
        finalValue = `[${category}] ${finalValue}`;
      }
      updates.push(`value = $${paramIdx++}`);
      params.push(finalValue);
    }

    if (category !== undefined) {
      updates.push(`category = $${paramIdx++}`);
      params.push(category || null);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(!!is_active);
    }

    if (flag_usuario_casino !== undefined) {
      updates.push(`flag_usuario_casino = $${paramIdx++}`);
      params.push(!!flag_usuario_casino);
    }

    if (flag_premio_minimo !== undefined) {
      updates.push(`flag_premio_minimo = $${paramIdx++}`);
      params.push(!!flag_premio_minimo);
    }

    if (flag_cierre_caja !== undefined) {
      updates.push(`flag_cierre_caja = $${paramIdx++}`);
      params.push(!!flag_cierre_caja);
    }

    if (legacy_value !== undefined) {
      updates.push(`legacy_value = $${paramIdx++}`);
      params.push(legacy_value || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No hay campos para actualizar" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await query(
      `UPDATE select_options SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    invalidateCache();

    await auditLog(req, {
      action: "OPTION_UPDATE",
      entity: "select_options",
      entity_id: parseInt(id),
      success: true,
      status_code: 200,
      details: { changes: req.body }
    });

    res.json({ option: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Ya existe una opción con ese valor" });
    }
    console.error("Error PUT /api/options/:id:", err);
    res.status(500).json({ message: "Error al actualizar opción" });
  }
});

export default router;
