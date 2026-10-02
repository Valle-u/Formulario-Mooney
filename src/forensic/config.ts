/** Umbrales forenses (paridad PAM DEPOSIT_CONFIG). El PAM usa estos datos para decidir acreditación. */
export const FORENSIC_CONFIG = {
  MONTO_MINIMO: 500,
  MONTO_MAXIMO: 10_000_000,
  CONFIANZA_MINIMA: 0.7,
  MAX_RECEIPT_AGE_HOURS: 48,
} as const;
