export const portalStyles = `
.nozle-billing-portal{color:var(--nozle-portal-text,#202922);background:var(--nozle-portal-background,#fff);font:14px/1.55 system-ui,sans-serif;box-sizing:border-box;width:100%;min-width:0;padding:clamp(18px,4vw,40px);border-radius:12px}
.nozle-billing-portal *{box-sizing:border-box}
.nozle-billing-portal h2,.nozle-billing-portal h3,.nozle-billing-portal p{margin:0}
.nozle-billing-portal h2{font-size:24px;letter-spacing:-.6px;line-height:1.3}
.nozle-billing-portal h3{font-size:16px;line-height:1.4}
.nozle-billing-portal header{margin-bottom:30px}
.nozle-billing-portal section{margin-top:28px;padding-top:24px;border-top:1px solid var(--nozle-portal-border,#e6e9e5)}
.nozle-billing-portal button,.nozle-billing-portal .nzp-link{appearance:none;display:inline-flex;align-items:center;justify-content:center;font:inherit;font-weight:550;line-height:1.4;border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:7px;background:var(--nozle-portal-background,#fff);color:var(--nozle-portal-text,#202922);padding:9px 14px;cursor:pointer;text-decoration:none;white-space:normal}
.nozle-billing-portal button:hover,.nozle-billing-portal .nzp-link:hover{background:var(--nozle-portal-muted-background,#f4f6f2)}
.nozle-billing-portal button:disabled{opacity:.55;cursor:wait}
.nozle-billing-portal :focus-visible{outline:2px solid var(--nozle-portal-accent,#526949);outline-offset:3px}
.nozle-billing-portal .nzp-primary{background:var(--nozle-portal-accent,#526949);border-color:var(--nozle-portal-accent,#526949);color:#fff}
.nozle-billing-portal .nzp-primary:hover{filter:brightness(.92);background:var(--nozle-portal-accent,#526949)}
.nozle-billing-portal .nzp-muted{color:var(--nozle-portal-muted,#687166);font-size:13px}
.nozle-billing-portal .nzp-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.nozle-billing-portal .nzp-stack{display:grid;gap:12px;margin-top:16px}
.nozle-billing-portal .nzp-card{border:1px solid var(--nozle-portal-border,#e0e6dc);border-radius:10px;padding:20px;min-width:0}
.nozle-billing-portal .nzp-price{font-size:26px;letter-spacing:-.5px;margin:12px 0 4px}
.nozle-billing-portal .nzp-badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.3px;border-radius:5px;background:var(--nozle-portal-muted-background,#edf3e8);padding:3px 7px}
.nozle-billing-portal .nzp-empty{border:1px dashed var(--nozle-portal-border,#dce2d9);border-radius:8px;padding:22px;text-align:center;color:var(--nozle-portal-muted,#687166);margin-top:16px}
.nozle-billing-portal .nzp-error{color:#922e25;background:#fff4f2;border:1px solid #f2d2ce;border-radius:8px;padding:14px;margin:16px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.nozle-billing-portal .nzp-table{overflow-x:auto;margin-top:16px}
.nozle-billing-portal table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
.nozle-billing-portal th{font-weight:500;color:var(--nozle-portal-muted,#687166);background:var(--nozle-portal-muted-background,#f7f8f5)}
.nozle-billing-portal th,.nozle-billing-portal td{padding:12px 10px;border-bottom:1px solid var(--nozle-portal-border,#e6e9e5);white-space:nowrap}
.nozle-billing-portal label{display:grid;gap:6px;font-size:13px;font-weight:500;min-width:0}
.nozle-billing-portal input,.nozle-billing-portal select{width:100%;min-width:0;font:inherit;color:inherit;background:var(--nozle-portal-background,#fff);border:1px solid var(--nozle-portal-border,#dce2d9);border-radius:6px;padding:9px 10px}
.nozle-billing-portal .nzp-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px;margin:20px 0}
.nozle-billing-portal .nzp-actions{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}
.nozle-billing-portal dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:18px;margin:16px 0 0}
.nozle-billing-portal dt{font-size:12px;color:var(--nozle-portal-muted,#687166)}
.nozle-billing-portal dd{margin:3px 0 0;overflow-wrap:anywhere}
.nozle-billing-portal footer{margin-top:30px;text-align:center;color:var(--nozle-portal-muted,#687166);font-size:12px}
`;
