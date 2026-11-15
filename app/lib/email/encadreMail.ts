/**
 * ══ 🔴 Arno (15/11/2026, 7e retour) — UN ENCADRÉ BIEN VISIBLE DANS UN MAIL (« ATTENTION ») ══════════════════════════════════════════════
 * Construit avec une table et des styles EN LIGNE (seule forme que Gmail iPhone, Gmail web, Apple Mail et Outlook rendent pareil) : un cadre
 * rouge de l'application, un fond très clair, le titre en gros et en gras, le texte dessous. Fond et couleurs fixés : lisible en clair comme
 * en sombre. La VERSION TEXTE l'encadre de deux filets. PUR, sans import.
 */
const ROUGE = '#a30402';
const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function encadreMailHtml(titre: string, paragraphes: readonly string[]): string {
  const police = 'font-family:Arial,Helvetica,sans-serif';
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;border-collapse:separate" data-encadre-mail="">`
    + `<tr><td bgcolor="#fff4f4" style="padding:16px 18px;border:3px solid ${ROUGE};border-radius:12px;background:#fff4f4">`
    + `<p style="margin:0 0 10px;${police};font-size:22px;line-height:1.2;font-weight:bold;letter-spacing:.06em;color:${ROUGE}">${echapper(titre)}</p>`
    + paragraphes.map((p) => `<p style="margin:0 0 10px;${police};font-size:15px;line-height:1.5;color:#1a1f26">${echapper(p)}</p>`).join('')
    + `</td></tr></table>`;
}

const FILET = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
/** La version texte : deux filets, le titre, les paragraphes. PUR. */
export function encadreMailTexte(titre: string, paragraphes: readonly string[]): string {
  return [FILET, titre, '', ...paragraphes.flatMap((p, i) => (i === 0 ? [p] : ['', p])), FILET].join('\n');
}
