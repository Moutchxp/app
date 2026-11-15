/**
 * ══ 🔴 Arno (15/11/2026) — LE GROS BOUTON D'ACTION DES MAILS INTERNES ═══════════════════════════════════════════════════════════════════
 * Un lien brut vers l'admin devient un GROS BOUTON : un `<a>` stylé EN LIGNE, construit avec des tables (seule forme que Gmail iPhone, Gmail
 * web, Apple Mail et Outlook rendent toutes de la même façon), rouge de l'application, texte blanc, coins arrondis, 48 px de haut (14 + 20 + 14),
 * large et centré. Juste dessous, en petit et en gris : « Si le bouton ne fonctionne pas : » et le lien (secours). La VERSION TEXTE du mail ne
 * change pas : elle garde le lien tel quel. Aucune couleur claire sur fond clair : en sombre, Gmail et Apple Mail gardent le fond rouge et le
 * texte blanc lisibles. PUR, sans import.
 */
export const ROUGE_BOUTON_MAIL = '#a30402';
export const MOT_SECOURS_BOUTON = 'Si le bouton ne fonctionne pas :';

const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Le lien est-il un lien http(s) ? Sinon, pas de bouton (le paragraphe reste du texte). PUR. */
export const lienBoutonValide = (lien: string): boolean => /^https?:\/\/[^\s"<>]+$/i.test(lien.trim());

/** Le bouton et son lien de secours, en HTML compatible avec les messageries. PUR. */
export function boutonMailHtml(libelle: string, lien: string): string {
  const href = echapper(lien.trim());
  const police = 'font-family:Arial,Helvetica,sans-serif';
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 6px;border-collapse:separate" data-bouton-mail="">`
    + `<tr><td align="center" style="padding:0">`
    + `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:420px;border-collapse:separate">`
    + `<tr><td align="center" bgcolor="${ROUGE_BOUTON_MAIL}" style="border-radius:12px;background:${ROUGE_BOUTON_MAIL}">`
    + `<a href="${href}" target="_blank" style="display:block;padding:14px 24px;${police};font-size:17px;font-weight:bold;line-height:20px;`
    + `color:#ffffff;text-decoration:none;border-radius:12px;background:${ROUGE_BOUTON_MAIL};text-align:center">${echapper(libelle)}</a>`
    + `</td></tr></table></td></tr></table>`
    + `<p style="margin:6px 0 16px;${police};font-size:12px;line-height:1.5;color:#6b7280;text-align:center">${MOT_SECOURS_BOUTON} `
    + `<a href="${href}" target="_blank" style="color:#6b7280;text-decoration:underline;word-break:break-all">${href}</a></p>`;
}
