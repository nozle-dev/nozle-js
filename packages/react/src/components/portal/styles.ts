import { T } from "../../appearance/tokens.js";

const line = `${T.borderWidth} solid ${T.border}`;
const r = (factor: number) => `calc(${T.radius} * ${factor})`;

export const portalStyles = `
.nozle-billing-portal{color:${T.foreground};background:${T.background};font:14px/1.55 ${T.font};box-sizing:border-box;width:100%;min-width:0;padding:clamp(18px,4vw,40px);border-radius:${T.radius}}
.nozle-billing-portal *{box-sizing:border-box}
.nozle-billing-portal h2,.nozle-billing-portal h3,.nozle-billing-portal p{margin:0}
.nozle-billing-portal h2{font-size:24px;letter-spacing:-.6px;line-height:1.3}
.nozle-billing-portal h3{font-size:16px;line-height:1.4}
.nozle-billing-portal header{margin-bottom:30px}
.nozle-billing-portal section{margin-top:28px;padding-top:24px;border-top:${line}}
.nozle-billing-portal button,.nozle-billing-portal .nzp-link{appearance:none;display:inline-flex;align-items:center;justify-content:center;font:inherit;font-weight:550;line-height:1.4;border:var(--nozle-button-border-width, ${T.borderWidth}) solid ${T.input};border-radius:var(--nozle-button-radius, ${r(0.6)});background:${T.card};color:${T.foreground};padding:9px 14px;cursor:pointer;text-decoration:none;white-space:normal}
.nozle-billing-portal button:hover,.nozle-billing-portal .nzp-link:hover{background:${T.muted}}
.nozle-billing-portal button:disabled{opacity:.55;cursor:wait}
.nozle-billing-portal :focus-visible{outline:2px solid ${T.primary};outline-offset:3px}
.nozle-billing-portal .nzp-primary{background:${T.primary};border-color:var(--nozle-button-border, ${T.primary});box-shadow:var(--nozle-button-shadow, none);color:${T.primaryForeground}}
.nozle-billing-portal .nzp-primary:hover{filter:brightness(.92);background:${T.primary}}
.nozle-billing-portal .nzp-muted{color:${T.mutedForeground};font-size:13px}
.nozle-billing-portal .nzp-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.nozle-billing-portal .nzp-stack{display:grid;gap:12px;margin-top:16px}
.nozle-billing-portal .nzp-card{background:${T.card};border:${line};border-radius:${r(0.85)};box-shadow:${T.shadow};padding:20px;min-width:0}
.nozle-billing-portal .nzp-price{font-size:26px;letter-spacing:-.5px;margin:12px 0 4px}
.nozle-billing-portal .nzp-badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.3px;border-radius:${r(0.4)};background:${T.accent};color:${T.accentForeground};padding:3px 7px}
.nozle-billing-portal .nzp-empty{border:${T.borderWidth} dashed ${T.border};border-radius:${r(0.65)};padding:22px;text-align:center;color:${T.mutedForeground};margin-top:16px}
.nozle-billing-portal .nzp-error{color:${T.danger};background:${T.dangerSoft};border:${T.borderWidth} solid ${T.dangerBorder};border-radius:${r(0.65)};padding:14px;margin:16px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.nozle-billing-portal .nzp-table{overflow-x:auto;margin-top:16px}
.nozle-billing-portal table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
.nozle-billing-portal th{font-weight:500;color:${T.mutedForeground};background:${T.muted}}
.nozle-billing-portal th,.nozle-billing-portal td{padding:12px 10px;border-bottom:${line};white-space:nowrap}
.nozle-billing-portal label{display:grid;gap:6px;font-size:13px;font-weight:500;min-width:0}
.nozle-billing-portal input,.nozle-billing-portal select{width:100%;min-width:0;font:inherit;color:inherit;background:${T.card};border:${line};border-radius:${r(0.5)};padding:9px 10px}
.nozle-billing-portal .nzp-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px;margin:20px 0}
.nozle-billing-portal .nzp-actions{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}
.nozle-billing-portal dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:18px;margin:16px 0 0}
.nozle-billing-portal dt{font-size:12px;color:${T.mutedForeground}}
.nozle-billing-portal dd{margin:3px 0 0;overflow-wrap:anywhere}
.nozle-billing-portal footer{margin-top:30px;text-align:center;color:${T.mutedForeground};font-size:12px}
`;
