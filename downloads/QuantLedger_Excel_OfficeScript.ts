/**
 * QuantLedger Microsoft Excel Automate (Office Script) — 2D Statutory & Compliance Spill Writer
 * Version: 2.8.0 | Docs: https://quantledgerapi.github.io/google-sheets-excel-formulas-and-n8n/
 *
 * HOW TO USE IN EXCEL (WEB OR DESKTOP):
 *   1. Open Excel -> Automate tab -> New Script -> paste this TypeScript file and click Save.
 *   2. Click Run (works immediately in free 12-row demo mode, or paste your RapidAPI key below for 100-row Pro mode).
 */

async function main(
  workbook: ExcelScript.Workbook,
  formulaType: string = "ENGINE",
  engineCode: string = "BI-17",
  jurisdiction: string = "NY",
  outputMode: string = "schedule",
  rapidApiKey: string = ""
): Promise<void> {
  const sheet = workbook.getActiveWorksheet();
  const usePro = rapidApiKey.trim().length > 0;
  const endpoint = usePro
    ? "https://quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com/v1/spreadsheet/formula-eval"
    : "https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app/v1/public/spreadsheet-demo";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (usePro) {
    headers["X-RapidAPI-Key"] = rapidApiKey.trim();
    headers["X-RapidAPI-Host"] = "quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      formula_type: formulaType,
      engine_code: engineCode,
      jurisdiction,
      output_mode: outputMode,
      max_rows: usePro ? 50 : 12,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || `QuantLedger HTTP ${response.status}`);
  }

  const rows: (string | number | boolean)[][] = payload.rows || [["No data"]];
  const rowCount = rows.length;
  const colCount = rows[0].length;

  const targetRange = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  targetRange.setValues(rows);
  const headerRange = sheet.getRangeByIndexes(0, 0, 1, colCount);
  headerRange.getFormat().getFill().setColor("#131B33");
  headerRange.getFormat().getFont().setColor("#FFFFFF");
  headerRange.getFormat().getFont().setBold(true);
  targetRange.getFormat().autofitColumns();
}
