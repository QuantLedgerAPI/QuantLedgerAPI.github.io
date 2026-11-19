(() => {
  const API_ORIGIN = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app';
  const panel = document.getElementById('ql-formd-panel');
  if (!panel) return;

  const daysEl = document.getElementById('ql-fd-days');
  const stateEl = document.getElementById('ql-fd-state');
  const kwEl = document.getElementById('ql-fd-kw');
  const minEl = document.getElementById('ql-fd-min');
  const opOnlyEl = document.getElementById('ql-fd-oponly');
  const runBtn = document.getElementById('ql-fd-run');
  const statusEl = document.getElementById('ql-fd-status');
  const tbodyEl = document.getElementById('ql-fd-tbody');
  const kpiEl = document.getElementById('ql-fd-kpis');
  const priceEl = document.getElementById('ql-fd-price');

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmtUsd(v) {
    const n = Number(v || 0);
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function collectParams(maxRows) {
    return {
      days_back: Number(daysEl?.value || 14),
      max_results: maxRows,
      state_filter: String(stateEl?.value || '').trim().toUpperCase(),
      industry_keyword: String(kwEl?.value || '').trim(),
      min_amount_sold_usd: Number(minEl?.value || 0),
      exclude_pooled_funds: Boolean(opOnlyEl ? opOnlyEl.checked : true),
      form_types: 'D,D/A',
    };
  }

  function renderRows(rows) {
    if (!tbodyEl) return;
    if (!rows.length) {
      tbodyEl.innerHTML = '<tr><td colspan="7" style="color:#9fb0d9;">No filings matched your filter window — widen lookback days or clear state/keyword filters.</td></tr>';
      return;
    }
    tbodyEl.innerHTML = rows.map((r) => {
      const trig = String(r.irc_409a_trigger_status || '');
      const tColor = trig.includes('IMMEDIATE') ? '#34d399' : (trig.includes('CONVERTIBLE') ? '#fbbf24' : '#9fb0d9');
      const exec = `${r.signer_name || '—'} (${r.signer_title || 'Signer'})`;
      return `<tr>
        <td>${esc(r.filing_date)}</td>
        <td><strong>${esc(r.entity_name)}</strong><br/><small style="color:#9fb0d9;">${esc(r.industry_group)} &middot; ${esc(r.hq_city)}, ${esc(r.hq_state)}</small></td>
        <td>${esc(exec)}<br/><small style="color:#93bcff;">${esc(r.issuer_phone || '')}</small></td>
        <td style="font-weight:700;color:#34d399;">${esc(fmtUsd(r.total_amount_sold_usd))}</td>
        <td><code>${esc(r.security_types)}</code></td>
        <td style="color:${tColor};font-weight:600;font-size:0.82rem;">${esc(trig)}</td>
        <td>${r.irc_1202_qsbs_candidate ? 'YES' : 'NO'} (${Number(r.combined_fed_state_tax_rate_pct || 0).toFixed(1)}%)</td>
      </tr>`;
    }).join('');
  }

  async function runPreview() {
    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Querying live SEC EDGAR Form D XML filings & computing 409A / state tax triggers...';
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/form-d-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectParams(12)),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      const hk = data.headline_kpis || {};
      if (kpiEl) {
        kpiEl.innerHTML = [
          ['Enriched Leads (Preview)', hk.enriched_form_d_leads_count ?? 0],
          ['Capital Closed Pool', fmtUsd(hk.aggregate_capital_closed_usd ?? 0)],
          ['Immediate 409A Triggers', hk.immediate_irc_409a_revaluation_triggers_count ?? 0],
          ['IRC 1202 QSBS Candidates', hk.irc_1202_qsbs_eligible_candidates_count ?? 0],
          ['Dual-State Tax Nexus', hk.dual_state_tax_nexus_issuers_count ?? 0],
        ].map(([k, v]) => `<div class="kpi-box"><div class="k-lbl">${esc(k)}</div><div class="k-val">${esc(v)}</div></div>`).join('');
      }
      renderRows(data.leads || []);
      if (statusEl) {
        statusEl.textContent = `Live SEC EDGAR Form D Preview Verified (${data.remaining_free_previews_in_window ?? 20} free browser previews remaining).`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Preview error: ${err?.message || err}`;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  runBtn?.addEventListener('click', runPreview);

  async function initFormDPayPal() {
    try {
      const cfgResp = await fetch(`${API_ORIGIN}/v1/public/checkout/config`);
      if (!cfgResp.ok) return;
      const cfg = await cfgResp.json();
      if (priceEl && cfg.workpaper_price_usd) priceEl.textContent = `$${cfg.workpaper_price_usd}`;
      const ppBox = document.getElementById('ql-fd-paypal');
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
              body: JSON.stringify({ engine_code: 'FORM-D', jurisdiction: stateEl?.value || 'US' }),
            });
            const out = await r.json();
            if (!r.ok) throw new Error(out?.detail || 'Order error');
            return out.order_id;
          },
          onApprove: async (data) => {
            if (statusEl) statusEl.textContent = 'Payment verified — compiling up to 100 SEC Form D leads into 5-tab .xlsx workpaper...';
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/capture-and-download-xlsx`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderID,
                engine_code: 'FORM-D',
                jurisdiction: stateEl?.value || 'US',
                naics_or_sic: '523910',
                structured_inputs: collectParams(100),
              }),
            });
            if (!r.ok) throw new Error('Workpaper download failed');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'QuantLedger_FORM-D_Private_Raises_409A_Workpaper.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (statusEl) statusEl.textContent = 'Downloaded QuantLedger_FORM-D_Private_Raises_409A_Workpaper.xlsx!';
          },
        }).render('#ql-fd-paypal');
      };
      document.head.appendChild(sdk);
    } catch {
      // Keep Apify & RapidAPI buttons active offline
    }
  }

  initFormDPayPal();
})();
