(() => {
  const API_ORIGIN = 'https://quantledger-ghost-kitchen-3yplwqtnha-uc.a.run.app';
  const panel = document.getElementById('ql-f5500-panel');
  if (!panel) return;

  const yearEl = document.getElementById('ql-f55-year');
  const trigEl = document.getElementById('ql-f55-trigger');
  const stateEl = document.getElementById('ql-f55-state');
  const queryEl = document.getElementById('ql-f55-query');
  const minAstEl = document.getElementById('ql-f55-minassets');
  const runBtn = document.getElementById('ql-f55-run');
  const statusEl = document.getElementById('ql-f55-status');
  const tbodyEl = document.getElementById('ql-f55-tbody');
  const kpiEl = document.getElementById('ql-f55-kpis');
  const priceEl = document.getElementById('ql-f55-price');

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
      plan_year: Number(yearEl?.value || 2025),
      trigger_filter: String(trigEl?.value || 'FIRST_TIME_CPA_AUDIT_ZONE'),
      state_filter: String(stateEl?.value || '').trim().toUpperCase(),
      sponsor_or_ein_query: String(queryEl?.value || '').trim(),
      min_assets_usd: Number(minAstEl?.value || 500000),
      max_results: maxRows,
    };
  }

  function renderRows(rows) {
    if (!tbodyEl) return;
    if (!rows.length) {
      tbodyEl.innerHTML = '<tr><td colspan="7" style="color:#9fb0d9;">No plans matched your filter — clear the state/keyword filter or lower minimum plan assets.</td></tr>';
      return;
    }
    tbodyEl.innerHTML = rows.map((r) => {
      const aud = String(r.iqpa_audit_trigger_status || '');
      const aColor = aud.includes('MISSING') ? '#f87171' : (aud.includes('AUDIT') ? '#34d399' : '#9fb0d9');
      const feeAlert = String(r.erisa_408b2_fee_status || '').startsWith('EXCESS');
      return `<tr>
        <td><strong>${esc(r.sponsor_name)}</strong><br/><small style="color:#9fb0d9;">EIN ${esc(r.sponsor_ein)} &middot; ${esc(r.city)}, ${esc(r.state)}</small></td>
        <td>${esc(r.fiduciary_signer_name || '—')}<br/><small style="color:#93bcff;">${esc(r.sponsor_phone || '')}</small></td>
        <td><strong>${esc(r.account_balance_participants)}</strong><br/><small style="color:#9fb0d9;">${esc(r.schedule_attached)}</small></td>
        <td style="font-weight:700;color:#34d399;">${esc(fmtUsd(r.net_assets_eoy_usd))}</td>
        <td style="color:${aColor};font-weight:600;font-size:0.81rem;">${esc(aud)}<br/><small style="color:#9fb0d9;">CPA: ${esc(r.incumbent_cpa_firm_name)}</small></td>
        <td style="color:${feeAlert ? '#fbbf24' : '#cbd5e1'};">${Number(r.admin_fee_bps || 0).toFixed(1)} bps<br/><small>${feeAlert ? 'Excess ' + fmtUsd(r.estimated_annual_excess_fees_usd) : 'Benchmark OK'}</small></td>
        <td style="color:${Number(r.late_participant_deferrals_usd || 0) > 0 ? '#f87171' : '#9fb0d9'};">${fmtUsd(r.late_participant_deferrals_usd)}<br/><small>Bond gap: ${fmtUsd(r.fidelity_bond_shortfall_usd)}</small></td>
      </tr>`;
    }).join('');
  }

  async function runPreview() {
    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Querying 121,000+ official DOL EBSA Form 5500 & Schedule H/I retirement plans...';
    try {
      const resp = await fetch(`${API_ORIGIN}/v1/public/form-5500-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectParams(15)),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
      const hk = data.headline_kpis || {};
      if (kpiEl) {
        kpiEl.innerHTML = [
          ['Total Cohort Matches', (hk.total_matching_plans_in_cohort ?? 0).toLocaleString('en-US')],
          ['Preview Plan Assets', fmtUsd(hk.aggregate_plan_net_assets_usd ?? 0)],
          ['CPA Audit Opportunities', hk.cpa_iqpa_audit_opportunity_leads_count ?? 0],
          ['Est. Excess 408(b)(2) Fees', fmtUsd(hk.estimated_recoverable_annual_fees_usd ?? 0)],
          ['Line 4a Late Deferrals', hk.late_deferral_line_4a_violations_count ?? 0],
        ].map(([k, v]) => `<div class="kpi-box"><div class="k-lbl">${esc(k)}</div><div class="k-val">${esc(v)}</div></div>`).join('');
      }
      renderRows(data.plans || []);
      const prov = data.dataset_provenance || {};
      if (statusEl) {
        statusEl.textContent = `Screened ${(prov.indexed_retirement_plans_count || 121374).toLocaleString('en-US')} official ${prov.plan_year || 2025} DOL EFAST2 plans in ${prov.execution_latency_ms || 0} ms (${data.remaining_free_previews_in_window ?? 20} free previews left).`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Preview error: ${err?.message || err}`;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  runBtn?.addEventListener('click', runPreview);

  async function initForm5500PayPal() {
    try {
      const cfgResp = await fetch(`${API_ORIGIN}/v1/public/checkout/config`);
      if (!cfgResp.ok) return;
      const cfg = await cfgResp.json();
      if (priceEl && cfg.workpaper_price_usd) priceEl.textContent = `$${cfg.workpaper_price_usd}`;
      const ppBox = document.getElementById('ql-f55-paypal');
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
              body: JSON.stringify({ engine_code: 'FORM-5500', jurisdiction: stateEl?.value || 'US' }),
            });
            const out = await r.json();
            if (!r.ok) throw new Error(out?.detail || 'Order error');
            return out.order_id;
          },
          onApprove: async (data) => {
            if (statusEl) statusEl.textContent = 'Payment verified — compiling up to 100 DOL Form 5500 plans into 5-tab .xlsx workpaper...';
            const r = await fetch(`${API_ORIGIN}/v1/public/checkout/capture-and-download-xlsx`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderID,
                engine_code: 'FORM-5500',
                jurisdiction: stateEl?.value || 'US',
                naics_or_sic: '525110',
                structured_inputs: collectParams(100),
              }),
            });
            if (!r.ok) throw new Error('Workpaper download failed');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'QuantLedger_DOL_Form_5500_ERISA_Audit_Workpaper.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            if (statusEl) statusEl.textContent = 'Downloaded QuantLedger_DOL_Form_5500_ERISA_Audit_Workpaper.xlsx!';
          },
        }).render('#ql-f55-paypal');
      };
      document.head.appendChild(sdk);
    } catch {
      // Keep Apify & RapidAPI buttons active offline
    }
  }

  initForm5500PayPal();
})();
