(() => {
  const API_ORIGIN = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app';
  const panel = document.getElementById('ql-sheet-sim');
  if (!panel) return;

  const presetEl = document.getElementById('ql-sim-preset');
  const codeEl = document.getElementById('ql-sim-code');
  const jurEl = document.getElementById('ql-sim-jur');
  const modeEl = document.getElementById('ql-sim-mode');
  const barEl = document.getElementById('ql-formula-bar');
  const statusEl = document.getElementById('ql-sim-status');
  const tableHeadEl = document.getElementById('ql-sim-thead');
  const tableBodyEl = document.getElementById('ql-sim-tbody');

  function updateFormulaBar() {
    const fType = presetEl?.value || 'ENGINE';
    const code = (codeEl?.value || 'BI-17').trim().toUpperCase();
    const jur = (jurEl?.value || 'NY').trim().toUpperCase();
    const mode = modeEl?.value || 'kpis';
    if (!barEl) return;
    if (fType === 'KYB') barEl.value = '=QUANTLEDGER_KYB(A2:A5)';
    else if (fType === 'FORM_D') barEl.value = `=QUANTLEDGER_FORMD("${jur}", 14, 250000)`;
    else if (fType === 'FORM_5500') barEl.value = `=QUANTLEDGER_5500("${jur}", "FIRST_TIME_CPA_AUDIT_ZONE", 500000)`;
    else if (fType === 'TAX') barEl.value = `=QUANTLEDGER_TAX("${jur}")`;
    else barEl.value = `=QUANTLEDGER("${code}", "${jur}", , "${mode}")`;
  }

  function renderGrid(rows) {
    if (!tableHeadEl || !tableBodyEl || !Array.isArray(rows) || !rows.length) return;
    tableHeadEl.textContent = '';
    tableBodyEl.textContent = '';
    const colCount = rows[0].length;
    const headTr = document.createElement('tr');
    const cornerTh = document.createElement('th');
    cornerTh.textContent = '#';
    headTr.appendChild(cornerTh);
    for (let c = 0; c < colCount; c++) {
      const th = document.createElement('th');
      th.textContent = String.fromCharCode(65 + (c % 26));
      headTr.appendChild(th);
    }
    tableHeadEl.appendChild(headTr);

    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      const rowNum = document.createElement('td');
      rowNum.style.color = '#9fb0d9';
      rowNum.style.fontWeight = '600';
      rowNum.textContent = String(idx + 1);
      tr.appendChild(rowNum);
      r.forEach((cell) => {
        const td = document.createElement('td');
        if (idx === 0) {
          td.style.fontWeight = '700';
          td.style.color = '#34d399';
        }
        if (typeof cell === 'number') {
          td.textContent = Number.isInteger(cell) ? cell.toLocaleString('en-US') : cell.toLocaleString('en-US', { maximumFractionDigits: 4 });
        } else {
          td.textContent = String(cell ?? '');
        }
        tr.appendChild(td);
      });
      tableBodyEl.appendChild(tr);
    });
  }

  async function evaluateLiveFormula() {
    updateFormulaBar();
    const fType = presetEl?.value || 'ENGINE';
    const payload = {
      formula_type: fType,
      engine_code: (codeEl?.value || 'BI-17').trim().toUpperCase(),
      jurisdiction: (jurEl?.value || 'NY').trim().toUpperCase(),
      output_mode: modeEl?.value || 'kpis',
      entities: fType === 'KYB' ? ['Apple Inc.', 'Caterpillar Inc.', 'AEROCARIBBEAN AIRLINES'] : undefined,
      max_rows: 10,
    };
    if (statusEl) statusEl.textContent = 'Evaluating live 2D spreadsheet spill array...';
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/spreadsheet-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      renderGrid(data.rows || []);
      if (statusEl) statusEl.textContent = `Spilled ${data.row_count || 0} live data rows (+ header row) ready for Google Sheets, Excel & n8n.`;
    } catch (err) {
      if (statusEl) statusEl.textContent = `Formula notice: ${err.message}`;
    }
  }

  [presetEl, codeEl, jurEl, modeEl].forEach((el) => el?.addEventListener('change', updateFormulaBar));
  document.getElementById('ql-sim-run')?.addEventListener('click', evaluateLiveFormula);

  document.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy-target');
      const codeBlock = targetId ? document.getElementById(targetId) : null;
      if (!codeBlock) return;
      await navigator.clipboard.writeText(codeBlock.textContent || '');
      const orig = btn.textContent;
      btn.textContent = 'Copied to Clipboard!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  });

  updateFormulaBar();
})();
