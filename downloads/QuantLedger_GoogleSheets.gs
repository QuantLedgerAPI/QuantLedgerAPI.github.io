/**
 * QuantLedger 73-Engine GAAP, Tax, KYB, Form D & Form 5500 Custom Functions for Google Sheets
 * Version: 2.8.0 | Docs: https://quantledgerapi.github.io/google-sheets-excel-formulas-and-n8n/
 *
 * 10-SECOND INSTALL:
 *   1. In Google Sheets, click Extensions -> Apps Script, paste this file, and click Save.
 *   2. Type =QUANTLEDGER("BI-17", "NY") or =QUANTLEDGER_KYB(A2:A10) in any cell — works immediately in free preview mode!
 *   3. Optional Pro Mode (100 rows & higher quota): Reload your sheet -> QuantLedger menu -> Set RapidAPI Key
 *      (get 5 free/mo or Pro at https://rapidapi.com/quantledger/api/quantledger-73-engine-financial-and-statutory-api).
 */

const QL_RAPIDAPI_URL = 'https://quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com/v1/spreadsheet/formula-eval';
const QL_RAPIDAPI_HOST = 'quantledger-73-engine-financial-and-statutory-api.p.rapidapi.com';
const QL_FREE_DEMO_URL = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app/v1/public/spreadsheet-demo';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QuantLedger')
    .addItem('Set RapidAPI Key (Unlock 100-Row Pro Mode)', 'quantledgerSetApiKey')
    .addItem('Clear Formula Cache', 'quantledgerClearCache')
    .addToUi();
}

function quantledgerSetApiKey() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    'QuantLedger RapidAPI Key',
    'Paste your X-RapidAPI-Key from rapidapi.com/quantledger (leave blank to use free 12-row preview mode):',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty('RAPIDAPI_KEY', res.getResponseText().trim());
    ui.alert('Saved! Re-enter or refresh your =QUANTLEDGER(...) formulas to apply.');
  }
}

function quantledgerClearCache() {
  CacheService.getScriptCache().removeAll(['ql_ping']);
  SpreadsheetApp.getUi().alert('Cache notice: New parameter edits automatically bypass cached cells (10-min TTL).');
}

function _qlInvokeBridge(payload) {
  const apiKey = (PropertiesService.getScriptProperties().getProperty('RAPIDAPI_KEY') || '').trim();
  const rawJson = JSON.stringify(payload);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (apiKey ? 'PRO:' : 'DEMO:') + rawJson);
  const cacheKey = 'ql_' + digest.slice(0, 16).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) {
    return JSON.parse(hit);
  }
  const url = apiKey ? QL_RAPIDAPI_URL : QL_FREE_DEMO_URL;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-RapidAPI-Key'] = apiKey;
    headers['X-RapidAPI-Host'] = QL_RAPIDAPI_HOST;
  }
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: rawJson,
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const data = JSON.parse(resp.getContentText() || '{}');
  if (code >= 400) {
    throw new Error(data.detail || data.message || ('QuantLedger HTTP ' + code));
  }
  const out = (String(payload.output_mode || '').toLowerCase().indexOf('scalar') === 0)
    ? data.scalar_value
    : (data.rows || [['No rows returned']]);
  const serialized = JSON.stringify(out);
  if (serialized.length < 95000) {
    cache.put(cacheKey, serialized, 600);
  }
  return out;
}

/**
 * Executes any of QuantLedger's 73 deterministic GAAP, IRC Tax, 409A, QoE, DCAA, CRE or Credit engines (BI-01..BI-73).
 * @param {"BI-17"} engineCode Engine code from BI-01 to BI-73 (e.g. "BI-17" ASC 842 Lease, "BI-07" DCAA Wrap, "BI-48" 409A).
 * @param {"NY"} jurisdiction 2-letter US State, DC, PR, GU, VI, AS, MP, or US.
 * @param {A2:B8} inputRange Optional 2-column [parameter_name, value] cell range or JSON string.
 * @param {"kpis"} outputMode "kpis" (2-col summary), "schedule" (multi-period tie-out table), or "scalar:<metric_key>".
 * @return 2D spill array or scalar value.
 * @customfunction
 */
function QUANTLEDGER(engineCode, jurisdiction, inputRange, outputMode) {
  let parsedInputs = inputRange || null;
  if (typeof inputRange === 'string' && inputRange.trim().charAt(0) === '{') {
    parsedInputs = JSON.parse(inputRange);
  }
  return _qlInvokeBridge({
    formula_type: 'ENGINE',
    engine_code: engineCode || 'BI-17',
    jurisdiction: jurisdiction || 'DC',
    output_mode: outputMode || 'kpis',
    range_or_inputs: parsedInputs,
  });
}

/**
 * Batch-screens company or individual names against 138,000+ US OFAC SDN/SSI, Commerce BIS Entity List, ITAR, OIG & SEC records.
 * @param {A2:A20} entitiesRange Cell or range of counterparty names to screen.
 * @return 2D compliance screening spill table.
 * @customfunction
 */
function QUANTLEDGER_KYB(entitiesRange) {
  const list = Array.isArray(entitiesRange) ? entitiesRange : [[entitiesRange || 'Apple Inc.']];
  return _qlInvokeBridge({ formula_type: 'KYB', range_or_inputs: list });
}

/**
 * Pulls live SEC EDGAR Form D newly funded startups with CEO/CFO signer contact, phone, capital closed, IRC 409A & QSBS flags.
 * @param {"CA"} state Optional 2-letter US state filter (or "ALL").
 * @param {14} daysBack Lookback window in calendar days (1 to 90).
 * @param {250000} minSoldUsd Minimum closed capital in USD.
 * @return 2D live Form D fundraising leads spill table.
 * @customfunction
 */
function QUANTLEDGER_FORMD(state, daysBack, minSoldUsd) {
  return _qlInvokeBridge({
    formula_type: 'FORM_D',
    jurisdiction: state || 'ALL',
    days_back: Number(daysBack || 14),
    min_amount_usd: Number(minSoldUsd || 250000),
  });
}

/**
 * Screens 121,000+ DOL EBSA Form 5500 retirement plans for 80-120 CPA audit transitions, ERISA 408(b)(2) excess fees & late deferrals.
 * @param {"CA"} state Optional 2-letter US state filter (or "ALL").
 * @param {"FIRST_TIME_CPA_AUDIT_ZONE"} triggerFilter FIRST_TIME_CPA_AUDIT_ZONE, HIGH_FEE_BENCHMARK_ALERT, MISSING_CPA_AUDIT_OPINION, LATE_DEFERRAL_VIOLATION, or FIDELITY_BOND_SHORTFALL.
 * @param {500000} minAssetsUsd Minimum net plan assets in USD.
 * @return 2D DOL Form 5500 CPA audit & ERISA compliance spill table.
 * @customfunction
 */
function QUANTLEDGER_5500(state, triggerFilter, minAssetsUsd) {
  return _qlInvokeBridge({
    formula_type: 'FORM_5500',
    jurisdiction: state || 'CA',
    trigger_filter: triggerFilter || 'FIRST_TIME_CPA_AUDIT_ZONE',
    min_amount_usd: Number(minAssetsUsd || 500000),
  });
}

/**
 * Returns 57-jurisdiction US corporate tax rate, apportionment formula, Federal IRC Sec. 11 rate, and live NY Fed SOFR benchmark.
 * @param {"NY"} jurisdiction 2-letter US State, DC, Territory, or US code.
 * @return 2D statutory tax & benchmark rate table.
 * @customfunction
 */
function QUANTLEDGER_TAX(jurisdiction) {
  return _qlInvokeBridge({ formula_type: 'TAX', jurisdiction: jurisdiction || 'NY' });
}
