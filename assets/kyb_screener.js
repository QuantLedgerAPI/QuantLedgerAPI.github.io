(() => {
  const API_ORIGIN = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app';
  const panel = document.getElementById('ql-kyb-panel');
  if (!panel) return;

  const listEl = document.getElementById('ql-kyb-entities');
  const threshEl = document.getElementById('ql-kyb-threshold');
  const runBtn = document.getElementById('ql-kyb-run');
  const sampleBtn = document.getElementById('ql-kyb-sample');
  const statusEl = document.getElementById('ql-kyb-status');
  const tbodyEl = document.getElementById('ql-kyb-tbody');
  const kpiEl = document.getElementById('ql-kyb-kpis');
  const priceEl = document.getElementById('ql-kyb-price');

  function parseEntities(limit) {
    const lines = String(listEl?.value || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return lines.slice(0, limit);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderRows(rows) {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = (rows || []).map((r) => {
      const disp = String(r.screening_disposition || 'CLEAR');
      const color = disp === 'CLEAR' ? '#34d399' : (disp.includes('POTENTIAL') ? '#fbbf24' : '#f87171');
      const secStr = r.sec_edgar_verified_filer ? `${r.sec_ticker} (CIK ${r.sec_cik})` : '—';
      return `<tr>
        <td><strong>${esc(r.queried_entity)}</strong></td>
        <td style="color:${color};font-weight:700;">${esc(disp)}</td>
        <td>${Number(r.composite_risk_score_0_100 || 0).toFixed(1)}</td>
        <td>${Number(r.jaro_winkler_similarity || 0).toFixed(4)}</td>
        <td><code>${esc(r.matched_watchlist_code || 'NONE')}</code></td>
        <td>${esc(r.matched_watchlist_name || '—')}</td>
        <td>${esc(secStr)}</td>
      </tr>`;
    }).join('');
  }

  async function runPreview() {
    const entities = parseEntities(25);
    if (!entities.length) return;
    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = `Screening ${entities.length} entities across 138,000+ live .gov OFAC, BIS, ITAR, OIG & SEC records...`;
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/kyb-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entities,
          fuzzy_threshold: Number(threshEl?.value || 0.88),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      const hk = data.headline_kpis || {};
      const em = data.execution_metrics || {};
      if (kpiEl) {
        kpiEl.innerHTML = [
          ['Entities Screened', hk.entities_screened_count ?? 0],
          ['Blocked Sanctions / Exclusions', hk.blocked_sanctions_or_exclusion_hits_count ?? 0],
          ['Fuzzy Manual Review Alerts', hk.fuzzy_manual_review_alerts_count ?? 0],
          ['SEC Public Registrants', hk.sec_edgar_verified_public_issuers_count ?? 0],
          ['Batch Screening Latency', `${em.screening_execution_ms ?? 0} ms`],
        ].map(([k, v]) => `<div class="kpi-box"><div class="k-lbl">${esc(k)}</div><div class="k-val">${esc(v)}</div></div>`).join('');
      }
      renderRows(data.results || []);
      if (statusEl) {
        statusEl.textContent = `Live .gov Watchlist Preview Verified (${data.remaining_free_previews_in_window ?? 25} free browser previews remaining).`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Preview error: ${err?.message || err}`;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  runBtn?.addEventListener('click', runPreview);
  sampleBtn?.addEventListener('click', () => {
    if (listEl) {
      listEl.value = [
        'Apple Inc.',
        'Caterpillar Inc.',
        'AEROCARIBBEAN AIRLINES',
        'Aerocaribean Airline',
        '#1 MARKETING SERVICE, INC',
      ].join('\n');
    }
    runPreview();
  });

  async function initKybPayPal() {
    try {
      const cfgResp = await fetch(`${API_ORIGIN}/v1/public/checkout/config`);
      if (!cfgResp.ok) return;
      const cfg = await cfgResp.json();
      if (priceEl && cfg.workpaper_price_usd) priceEl.textContent = `$${cfg.workpaper_price_usd}`;
      const ppBox = document.getElementById('ql-kyb-paypal');
      if (!cfg.paypal_enabled || !cfg.paypal_client_id || !ppBox) return;

      const sdk = document.createElement('script');
      sdk.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypal_client_id)}&currency=USD&intent=capture`;
      sdk.async = true;
      sdk.onload = () => {
        if (!window.paypal) return;
        ppBox.style.display = 'block';
        window.paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ engine_code: 'KYB-BATCH', jurisdiction: 'US' }),
            });
            const out = await r.json();
            if (!r.ok) throw new Error(out?.detail || 'Order error');
            return out.order_id;
          },
          onApprove: async (data) => {
            if (statusEl) statusEl.textContent = 'Payment verified — compiling 5-tab KYB & OFAC Excel workpaper (.xlsx)...';
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/capture-and-download-xlsx`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderID,
                engine_code: 'KYB-BATCH',
                jurisdiction: 'US',
                naics_or_sic: '522110',
                structured_inputs: {
                  entities: parseEntities(500),
                  fuzzy_threshold: Number(threshEl?.value || 0.88),
                },
              }),
            });
            if (!r.ok) throw new Error('Workpaper download failed');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'QuantLedger_KYB-BATCH_US_Workpaper.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (statusEl) statusEl.textContent = 'Downloaded QuantLedger_KYB-BATCH_US_Workpaper.xlsx!';
          },
        }).render('#ql-kyb-paypal');
      };
      document.head.appendChild(sdk);
    } catch {
      // Keep Apify & RapidAPI buttons active offline
    }
  }

  initKybPayPal();
})();
