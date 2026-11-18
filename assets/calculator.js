(() => {
  const API_ORIGIN = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app';
  const root = document.getElementById('ql-calculator');
  if (!root) return;

  const engineCode = root.dataset.engineCode || 'BI-01';
  const defaultsEl = document.getElementById('ql-default-inputs');
  let defaultInputs = {};
  try {
    defaultInputs = JSON.parse(defaultsEl ? defaultsEl.textContent : '{}') || {};
  } catch {
    defaultInputs = {};
  }

  const jurEl = document.getElementById('ql-jurisdiction');
  const naicsEl = document.getElementById('ql-naics');
  const customJsonEl = document.getElementById('ql-custom-json');
  const statusEl = document.getElementById('ql-calc-status');
  const kpiGridEl = document.getElementById('ql-kpi-grid');
  const lockMetaEl = document.getElementById('ql-lock-meta');
  const paypalZone = document.getElementById('ql-paypal-buttons');
  const priceSpan = document.getElementById('ql-xlsx-price');

  function humanLabel(raw) {
    return String(raw || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bUsd\b/g, '(USD)').replace(/\bPct\b/g, '(%)').replace(/\bEbitda\b/g, 'EBITDA')
      .replace(/\bDscr\b/g, 'DSCR').replace(/\bFccr\b/g, 'FCCR').replace(/\bIrc\b/g, 'IRC');
  }

  function formatMetric(key, val) {
    if (typeof val === 'boolean') return val ? 'YES' : 'NO';
    if (typeof val !== 'number' || !Number.isFinite(val)) return String(val ?? '');
    const kl = String(key || '').toLowerCase();
    if (kl.endsWith('_pct') || kl.includes('percent')) return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    if (kl.endsWith('_rate') && Math.abs(val) > 0 && Math.abs(val) < 1) return `${(val * 100).toFixed(2)}%`;
    if (kl.endsWith('_x') || kl.includes('dscr') || kl.includes('fccr') || kl.includes('multiple')) return `${val.toFixed(2)}x`;
    if (['_usd', 'amount', 'revenue', 'ebitda', 'cash', 'debt', 'cost', 'value', 'price', 'fee', 'savings', 'penalty', 'credit', 'liability', 'asset', 'noi', 'pool', 'reserve'].some((t) => kl.includes(t))) {
      const sign = val < 0 ? '-' : '';
      return `${sign}$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return Number.isInteger(val) ? val.toLocaleString('en-US') : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function collectInputs() {
    const merged = {};
    root.querySelectorAll('[data-param-key]').forEach((inp) => {
      const k = inp.dataset.paramKey;
      const raw = String(inp.value || '').replace(/[$,\s]/g, '');
      if (raw !== '' && !Number.isNaN(Number(raw))) merged[k] = Number(raw);
    });
    const extraRaw = String(customJsonEl?.value || '').trim();
    if (extraRaw) {
      const parsed = JSON.parse(extraRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(merged, parsed);
    }
    return merged;
  }

  function renderKpis(kpis) {
    if (!kpiGridEl || !kpis) return;
    kpiGridEl.textContent = '';
    Object.entries(kpis).forEach(([k, v]) => {
      const box = document.createElement('div');
      box.className = 'kpi-box';
      const lbl = document.createElement('div');
      lbl.className = 'k-lbl';
      lbl.textContent = humanLabel(k);
      const valDiv = document.createElement('div');
      valDiv.className = 'k-val';
      valDiv.textContent = formatMetric(k, v);
      box.append(lbl, valDiv);
      kpiGridEl.appendChild(box);
    });
  }

  async function runLivePreview() {
    let structuredInputs;
    try {
      structuredInputs = collectInputs();
    } catch (err) {
      if (statusEl) statusEl.textContent = `Custom JSON syntax error: ${err.message}`;
      return;
    }
    if (statusEl) statusEl.textContent = 'Running deterministic statutory CPU solver...';
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/preview/${encodeURIComponent(engineCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: jurEl?.value || 'DC',
          naics_or_sic: naicsEl?.value || '541211',
          structured_inputs: structuredInputs,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      renderKpis(data.headline_kpis || {});
      const lk = data.locked_workpaper_contents || {};
      const jurInfo = data.engine_metadata?.jurisdiction_applied || {};
      if (lockMetaEl && lk.schedule_tie_out_rows_count !== undefined) {
        lockMetaEl.textContent = `Ready to compile 5-tab .xlsx workpaper: ${lk.statutory_rules_count || 4} statutory equations, ${lk.schedule_tie_out_rows_count} schedule tie-out rows, ${lk.sensitivity_scenarios_count || 3} variance scenarios, and ${lk.compliance_audit_flags_count || 3} compliance flags.`;
      }
      if (statusEl) {
        const taxPct = ((Number(jurInfo.corporate_or_statutory_tax_rate || 0)) * 100).toFixed(2);
        statusEl.textContent = `Solved live for ${jurInfo.jurisdiction_code || jurEl?.value || 'DC'} (${taxPct}% statutory rate, ${jurInfo.apportionment_formula || 'statutory'}).`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Preview notice: ${err.message}`;
    }
  }

  document.getElementById('ql-run-btn')?.addEventListener('click', runLivePreview);
  document.getElementById('ql-reset-btn')?.addEventListener('click', () => {
    root.querySelectorAll('[data-param-key]').forEach((inp) => {
      const k = inp.dataset.paramKey;
      if (defaultInputs[k] !== undefined) inp.value = String(defaultInputs[k]);
    });
    if (customJsonEl) customJsonEl.value = '';
    runLivePreview();
  });

  async function initCheckout() {
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/checkout/config`);
      if (!resp.ok) return;
      const cfg = await resp.json();
      if (priceSpan && cfg.workpaper_price_usd) priceSpan.textContent = `$${cfg.workpaper_price_usd}`;
      if (!cfg.paypal_enabled || !cfg.paypal_client_id || !paypalZone) return;

      paypalZone.style.display = 'block';
      const sdk = document.createElement('script');
      sdk.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypal_client_id)}&currency=USD&intent=capture&enable-funding=venmo,card`;
      sdk.onload = () => {
        if (!window.paypal) return;
        window.paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ engine_code: engineCode, jurisdiction: jurEl?.value || 'DC' }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.detail || 'Order creation failed');
            return d.order_id;
          },
          onApprove: async (data) => {
            if (statusEl) statusEl.textContent = 'Payment verified — compiling 5-tab formula-linked .xlsx workpaper...';
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/capture-and-download-xlsx`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderID,
                engine_code: engineCode,
                jurisdiction: jurEl?.value || 'DC',
                naics_or_sic: naicsEl?.value || '541211',
                structured_inputs: collectInputs(),
              }),
            });
            if (!r.ok) {
              const errObj = await r.json().catch(() => ({}));
              throw new Error(errObj?.detail || `Download HTTP ${r.status}`);
            }
            const disp = r.headers.get('Content-Disposition') || '';
            const match = disp.match(/filename="?([^"]+)"?/i);
            const filename = match ? match[1] : `QuantLedger_${engineCode}_Workpaper.xlsx`;
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (statusEl) statusEl.textContent = `Downloaded ${filename} — check your browser downloads.`;
          },
          onError: (err) => {
            if (statusEl) statusEl.textContent = `Checkout error: ${err?.message || err}`;
          },
        }).render('#ql-paypal-buttons');
      };
      document.head.appendChild(sdk);
    } catch {
      // Keep API & Apify workpaper buttons active when offline
    }
  }

  initCheckout();
})();
