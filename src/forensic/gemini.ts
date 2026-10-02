import { env } from "../config/env.js";

export interface GeminiExtractionResult {
  bank_name: string | null;
  amount: number | null;
  sender_cbu_alias: string | null;
  receiver_cbu_alias: string | null;
  sender_name: string | null;
  transfer_date: string | null;
  weekday: string | null;
  reference_number: string | null;
  transfer_type: string | null;
  is_valid_receipt: boolean;
  confidence: number;
  error?: string;
}

const RECEIPT_PROMPT = `Analyze this bank transfer receipt image. Extract the following data and return ONLY valid JSON, no markdown:

{
  "bank_name": "name of the bank or payment app (e.g. Mercado Pago, Brubank, Galicia, BBVA, Santander, Macro, Nacion, HSBC, DolarApp/ARQ, etc.)",
  "amount": 0.00,
  "sender_cbu_alias": "CBU/CVU (22 exact digits) or alias of the sender",
  "receiver_cbu_alias": "CBU/CVU (22 exact digits) or alias of the receiver/destination — transcribe all 22 digits, no spaces/dots, do not confuse letters with numbers (O=0, I/l=1, S=5, B=8). A CBU/CVU has EXACTLY 22 digits — in long runs of zeros count carefully, do not add or drop zeros (exactly 22)",
  "sender_name": "name of the person who sent the transfer",
  "transfer_date": "YYYY-MM-DD format. TRANSCRIBE the year from the image — NEVER infer it or replace it with the year you believe it is now: your notion of the current year comes from training and IS OUT OF DATE. If the receipt says 2026, write 2026 even if it looks like the future. Re-read the four digits of the year before writing them. If the receipt does not print the year, return null",
  "weekday": "the day of the week EXACTLY as printed on the receipt (e.g. 'Martes'), null if not printed. Do NOT derive it from the date: it is used to verify the year against the calendar",
  "reference_number": "transfer reference / operation number / Coelsa ID — transcribe EXACTLY character by character (uppercase alphanumeric, monospaced). Do NOT correct or normalize. Watch ambiguous glyphs: 0/O, 1/I/L, 5/S, 8/B, 6/G, 2/Z, Y/V, U/V (6 is closed, G has a hook; Y has an arm, V is straight; 0 is narrower than O). One wrong char breaks reconciliation. Do NOT confuse it with another field: it is NOT the CUIT/CUIL (11 digits), NOT the CBU/CVU (22 digits), NOT the amount or date. Look for its label (Coelsa ID, operation number, comprobante, reference). If there is no clear operation/Coelsa code, return null — never fill it with the CUIT, the account, or a placeholder like <UNKNOWN>/N/A.",
  "transfer_type": "transferencia/deposito/pago",
  "is_valid_receipt": true,
  "confidence": 0.95
}

Rules:
- If the image is NOT a valid bank transfer receipt, set is_valid_receipt to false and confidence to 0.
- Amount must be a number (no currency symbols).
- Confidence is 0.0 to 1.0 indicating how sure you are about the extraction.
- If you cannot read a field, set it to null.
- Return ONLY the JSON object, nothing else.`;

function defaultResult(): GeminiExtractionResult {
  return {
    bank_name: null,
    amount: null,
    sender_cbu_alias: null,
    receiver_cbu_alias: null,
    sender_name: null,
    transfer_date: null,
    weekday: null,
    reference_number: null,
    transfer_type: null,
    is_valid_receipt: false,
    confidence: 0,
  };
}

function parseGeminiJson(text: string): GeminiExtractionResult {
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      bank_name: (parsed.bank_name as string) || null,
      amount:
        typeof parsed.amount === "number"
          ? parsed.amount
          : parseFloat(String(parsed.amount)) || null,
      sender_cbu_alias: (parsed.sender_cbu_alias as string) || null,
      receiver_cbu_alias: (parsed.receiver_cbu_alias as string) || null,
      sender_name: (parsed.sender_name as string) || null,
      transfer_date: (parsed.transfer_date as string) || null,
      weekday: (parsed.weekday as string) || null,
      reference_number: (parsed.reference_number as string) || null,
      transfer_type: (parsed.transfer_type as string) || null,
      is_valid_receipt: !!parsed.is_valid_receipt,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { ...defaultResult(), error: "Failed to parse Gemini response" };
  }
}

export async function analyzeWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<GeminiExtractionResult> {
  if (!env.GEMINI_API_KEY) {
    return { ...defaultResult(), error: "GEMINI_API_KEY is not configured" };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: RECEIPT_PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return { ...defaultResult(), error: `Gemini API error: ${response.status} ${errText.slice(0, 120)}` };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseGeminiJson(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...defaultResult(), error: msg };
  }
}
