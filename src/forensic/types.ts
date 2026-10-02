/** Extracción forense de comprobante bancario argentino (paridad PAM receipt-reader). */
export interface ReceiptExtraction {
  monto: number | null;
  codigo_operacion: string | null;
  fecha: string | null;
  /**
   * v1.6 aditivo (#36). Día de la semana **tal como está impreso** en el comprobante ("Martes"), o
   * null si no lo imprime. Es la evidencia con la que se verifica el año: viaja al consumidor al lado
   * del veredicto para que el par sea auditable sin creerle a GATE.
   */
  dia_semana?: string | null;
  nombre_emisor: string | null;
  cuenta_emisora: string | null;
  cuenta_receptora: string | null;
  entidad_emisora: string | null;
  tipo_operacion: string | null;
  confianza: number;
  signos_edicion: boolean;
  es_comprobante_valido: boolean;
  coelsa_id: string | null;
  observaciones: string | null;
  estado_comprobante?: "confirmado" | "pendiente" | "preview" | "desconocido" | null;
  /**
   * v1.2 aditivo (MSG-PAM-20260728-6 / #444). Validez del checksum CBU/CVU de cada cuenta:
   *  - `true`  → 22 dígitos con checksum COELSA válido (cuenta bien leída).
   *  - `false` → misread seguro: 22 dígitos con checksum inválido (#444) O campo de largo de CBU con
   *              mayoría de dígitos y una letra suelta (#451, ej. `...4007I5658`).
   *  - `null`/omitido → no aplica (alias legítimo, vacío).
   * GATE NO anula el valor (PAM tiene el extracto para decidir si la basura igual identifica la cuenta);
   * sólo expone el hecho. Emitido sólo con `RECEIPT_SANITIZE_INVALID_CBU=true`.
   */
  cuenta_emisora_checksum_valid?: boolean | null;
  cuenta_receptora_checksum_valid?: boolean | null;
  /**
   * v1.6 aditivo (#36). Cruce entre el día impreso y el calendario:
   *  - `true`  → el día no calza y un cambio de año lo explica: el año está mal leído.
   *  - `false` → el día calza: el año quedó corroborado por el propio comprobante.
   *  - `null`/omitido → no hubo con qué cruzar (sin fecha o sin día impreso), o el día no calza y
   *    ningún año cercano lo explica (inconsistencia real, pero no del año).
   * `fecha` NUNCA se modifica: la candidata va aparte en `fecha_alternativa`.
   */
  fecha_anio_sospechoso?: boolean | null;
  /** Fecha que implica el día impreso. Null si no hay una sola candidata. GATE no la promueve. */
  fecha_alternativa?: string | null;
}

export interface ExtractionResult {
  data: ReceiptExtraction;
  alerts: string[];
  isValid: boolean;
}
