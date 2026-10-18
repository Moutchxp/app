/**
 * ══ 🔴🔴 LE MAIL DE CONFIRMATION D'UNE ENTRÉE / SORTIE DU PORTEFEUILLE DE GESTION (Arno, 18/10/2026). MODULE PUR. ════════
 *
 * « On doit comprendre immédiatement QUI, QUOI, OÙ, COMBIEN » :
 *   · Objet : « Sortie de gestion — NOM — N lot(s) — −X € HT/mois » ou « Nouveau mandat de gestion — NOM — N lot(s) — +X € HT/mois » ;
 *   · Qui : l'auteur (nom, e-mail), la date et l'heure, la tuile d'où vient l'action ;
 *   · Propriétaire(s) : noms, téléphone, e-mail, adresse, N° de mandat de gestion (ou de transaction) ;
 *   · Lot(s) : adresse, N° de lot, type et famille, surface, étage, annexes, locataire en place (« location close le … ») ;
 *   · Origine (sorties) : motif, sous-motif, et la « Précision » telle que saisie ;
 *   · Valorisation : par lot, loyer de départ × taux = honoraires ; totaux HT et TTC, par mois ET par an ; un lot sans loyer
 *     ou sans taux est exclu du total, et le total dit combien de lots manquent ;
 *   · un lien vers la fiche commune du propriétaire.
 * Ce module ne lit rien et n'envoie rien : il compose (objet, HTML lisible sur téléphone aux couleurs de l'agence, texte).
 * Les montants arrivent DÉJÀ CALCULÉS par les règles de l'écran « Honoraires de gestion » (`mailPortefeuilleRepo`).
 */

export type SensMouvement = 'sortie' | 'entree';
export type TuileOrigine = 'Location' | 'Gestion';

export interface ProprietaireMail {
  nom: string; telephone: string | null; email: string | null; adresse: string | null;
  mandatGestion: string | null; mandatTransaction: string | null;
}

export interface ValeurLot {
  /** Loyer de départ retenu (base de calcul, € / mois), taux de gestion (%) — `null` si non renseigné. */
  loyer: number | null; taux: number | null;
  /** Honoraires HT / mois de ce lot, `null` quand loyer ou taux manque. */
  mensuelHT: number | null;
}

export interface LotMail {
  lotId: number; adresse: string | null; numero: string | null;
  type: string | null; famille: string | null; surface: number | null; etage: string | null;
  annexes: string[];
  locataires: string[];
  /** Sortie : la date (AAAA-MM-JJ) à laquelle sa location a été close. */
  clotureLe: string | null;
  valeur: ValeurLot;
}

export interface OrigineMail { motif: string; sousMotif: string | null; precision: string | null }

export interface DonneesMail {
  sens: SensMouvement;
  /** Réactivation (entrée) plutôt que nouveau mandat. */
  reactivation?: boolean;
  auteur: { nom: string; email: string | null };
  /** Instant de l'action (ISO). */
  quand: string;
  tuile: TuileOrigine;
  proprietaires: ProprietaireMail[];
  lots: LotMail[];
  origine: OrigineMail | null;
  /** Taux de TVA appliqué (ex. 0.2), lu dans le réglage daté. */
  tva: number;
  /** Le lien absolu vers la fiche commune du propriétaire (ou `null`). */
  lienFiche: string | null;
}

const arrondi2 = (n: number): number => Math.round(n * 100) / 100;

export interface Totaux { mensuelHT: number; mensuelTTC: number; annuelHT: number; annuelTTC: number; lotsSansValeur: number; lotsValorises: number }

/** Les totaux (affichage : arrondis au centime une seule fois, à la fin). */
export function totaux(d: Pick<DonneesMail, 'lots' | 'tva'>): Totaux {
  let m = 0; let sans = 0; let avec = 0;
  for (const l of d.lots) {
    if (l.valeur.mensuelHT === null) sans += 1; else { m += l.valeur.mensuelHT; avec += 1; }
  }
  return { mensuelHT: arrondi2(m), mensuelTTC: arrondi2(m * (1 + d.tva)), annuelHT: arrondi2(m * 12), annuelTTC: arrondi2(m * 12 * (1 + d.tva)), lotsSansValeur: sans, lotsValorises: avec };
}

export function euros(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ')} €`;
}

const nbLots = (n: number): string => `${n} lot${n > 1 ? 's' : ''}`;

/** Le nom affiché du dossier : les propriétaires clients, séparés par « / ». */
export function nomDossier(d: Pick<DonneesMail, 'proprietaires'>): string {
  return d.proprietaires.map((p) => p.nom).filter((x) => x.trim() !== '').join(' / ') || 'Propriétaire';
}

/** L'objet du mail. */
export function objetMail(d: DonneesMail): string {
  const t = totaux(d);
  const montant = `${d.sens === 'sortie' ? '−' : '+'}${euros(t.mensuelHT)} HT/mois`;
  const titre = d.sens === 'sortie' ? 'Sortie de gestion' : d.reactivation ? 'Retour en gestion' : 'Nouveau mandat de gestion';
  return `${titre} — ${nomDossier(d)} — ${nbLots(d.lots.length)} — ${montant}`;
}

/** « samedi 18/10/2026 à 14:32 » (heure de Paris). */
export function dateHeure(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

const dateCourte = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pourcent = (n: number): string => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/** La ligne de valorisation d'un lot. */
export function ligneValeur(v: ValeurLot): string {
  if (v.loyer === null) return 'loyer de départ non renseigné — lot exclu du total';
  if (v.taux === null) return `loyer de départ ${euros(v.loyer)} — taux de gestion non renseigné — lot exclu du total`;
  return `${euros(v.loyer)} × ${pourcent(v.taux)} = ${euros(v.mensuelHT ?? 0)} HT / mois`;
}

/** La phrase des totaux (perdus / générés), avec le nombre de lots exclus. */
export function phraseTotaux(d: DonneesMail): string[] {
  const t = totaux(d);
  const mot = d.sens === 'sortie' ? 'perdus' : 'générés';
  const l = [
    `Honoraires de gestion ${mot} : ${euros(t.mensuelHT)} HT / mois (${euros(t.mensuelTTC)} TTC) · ${euros(t.annuelHT)} HT / an (${euros(t.annuelTTC)} TTC)`,
  ];
  if (t.lotsSansValeur > 0) l.push(`${t.lotsSansValeur} lot${t.lotsSansValeur > 1 ? 's' : ''} sans loyer de départ ou sans taux : exclu${t.lotsSansValeur > 1 ? 's' : ''} du total.`);
  return l;
}

function detailsLot(l: LotMail, sens: SensMouvement): string[] {
  return [
    [l.type, l.famille].filter((x) => x !== null && x !== '').join(' · ') || null,
    l.surface === null ? null : `${l.surface.toLocaleString('fr-FR')} m²`,
    l.etage === null ? null : `étage : ${l.etage}`,
    l.annexes.length > 0 ? `annexes : ${l.annexes.join(', ')}` : null,
    l.locataires.length > 0 ? `${sens === 'sortie' ? 'locataire' : 'locataire en place'} : ${l.locataires.join(', ')}${sens === 'sortie' && l.clotureLe !== null ? ` — location close le ${dateCourte(l.clotureLe)}` : ''}` : 'sans locataire en place',
  ].filter((x): x is string => x !== null);
}

/** Le texte brut (même contenu, pour les messageries sans HTML). */
export function texteMail(d: DonneesMail): string {
  const t: string[] = [objetMail(d), ''];
  t.push(`QUI : ${d.auteur.nom}${d.auteur.email ? ` <${d.auteur.email}>` : ''} — ${dateHeure(d.quand)} — depuis la tuile ${d.tuile}`, '');
  t.push('PROPRIÉTAIRE(S)');
  for (const p of d.proprietaires) {
    t.push(`- ${p.nom}${p.telephone ? ` · ${p.telephone}` : ''}${p.email ? ` · ${p.email}` : ''}${p.adresse ? ` · ${p.adresse}` : ''}`);
    if (p.mandatGestion) t.push(`  Mandat de gestion : ${p.mandatGestion}`);
    if (p.mandatTransaction) t.push(`  Mandat de transaction : ${p.mandatTransaction}`);
  }
  t.push('', `LOT(S) — ${d.lots.length}`);
  for (const l of d.lots) {
    t.push(`- ${l.adresse ?? `Bien ${l.lotId}`}${l.numero ? ` · lot ${l.numero}` : ''}`);
    for (const x of detailsLot(l, d.sens)) t.push(`  ${x}`);
    t.push(`  Valorisation : ${ligneValeur(l.valeur)}`);
  }
  if (d.origine !== null) {
    t.push('', 'ORIGINE', `- ${d.origine.motif}${d.origine.sousMotif ? ` — ${d.origine.sousMotif}` : ''}`);
    if (d.origine.precision) t.push(`- Précision : « ${d.origine.precision} »`);
  }
  t.push('', 'VALORISATION', ...phraseTotaux(d));
  if (d.lienFiche) t.push('', `Fiche du propriétaire : ${d.lienFiche}`);
  return t.join('\n');
}

/**
 * Le HTML : tableaux simples (les messageries ignorent la mise en page moderne), largeur 600 px qui se réduit au téléphone,
 * styles en ligne, rouge de l'agence (#a30402), aucune image.
 * ⚠️ Couleurs écrites ici en clair : un mail n'a pas accès aux variables du thème de l'application.
 */
export function htmlMail(d: DonneesMail): string {
  const rouge = '#a30402'; const encre = '#1a1f26'; const gris = '#5b6472'; const fond = '#f4f5f7'; const ligne = '#e3e6ea';
  const sortie = d.sens === 'sortie';
  const t = totaux(d);
  const bloc = (titre: string, corps: string): string =>
    `<tr><td style="padding:14px 20px 4px"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${rouge}">${echapper(titre)}</div>${corps}</td></tr>`;
  const p = (s: string, extra = ''): string => `<div style="margin:6px 0 0;font-size:15px;line-height:1.45;color:${encre};${extra}">${s}</div>`;
  const petit = (s: string): string => `<div style="margin:2px 0 0;font-size:13px;line-height:1.45;color:${gris}">${s}</div>`;
  const proprietaires = d.proprietaires.map((x) => p(`<strong>${echapper(x.nom)}</strong>`)
    + petit([x.telephone, x.email, x.adresse].filter((y) => y).map((y) => echapper(y as string)).join(' · ') || 'coordonnées non renseignées')
    + (x.mandatGestion ? petit(`Mandat de gestion : <strong>${echapper(x.mandatGestion)}</strong>`) : '')
    + (x.mandatTransaction ? petit(`Mandat de transaction locative : <strong>${echapper(x.mandatTransaction)}</strong>`) : '')).join('');
  const lots = d.lots.map((l) => `<div style="margin:10px 0 0;padding:10px 12px;border:1px solid ${ligne};border-left:4px solid ${rouge};border-radius:8px">`
    + `<div style="font-size:15px;font-weight:700;color:${encre}">${echapper(l.adresse ?? `Bien ${l.lotId}`)}${l.numero ? ` · lot ${echapper(l.numero)}` : ''}</div>`
    + detailsLot(l, d.sens).map((x) => petit(echapper(x))).join('')
    + `<div style="margin:6px 0 0;font-size:14px;color:${l.valeur.mensuelHT === null ? gris : encre}">${echapper(ligneValeur(l.valeur))}</div></div>`).join('');
  const origine = d.origine === null ? '' : bloc('Origine',
    p(`<strong>${echapper(d.origine.motif)}</strong>${d.origine.sousMotif ? ` — ${echapper(d.origine.sousMotif)}` : ''}`)
    + (d.origine.precision ? petit(`Précision : « ${echapper(d.origine.precision)} »`) : ''));
  const totauxHtml = `<div style="margin:8px 0 0;padding:12px;border-radius:8px;background:${sortie ? '#fdeceb' : '#e9f6ee'}">`
    + `<div style="font-size:13px;color:${gris}">Honoraires de gestion ${sortie ? 'perdus' : 'générés'}</div>`
    + `<div style="font-size:20px;font-weight:800;color:${sortie ? rouge : '#1f7a45'}">${sortie ? '−' : '+'}${euros(t.mensuelHT)} HT / mois</div>`
    + petit(`${euros(t.mensuelTTC)} TTC / mois · ${euros(t.annuelHT)} HT / an · ${euros(t.annuelTTC)} TTC / an`)
    + (t.lotsSansValeur > 0 ? petit(`<strong>${t.lotsSansValeur} lot${t.lotsSansValeur > 1 ? 's' : ''}</strong> sans loyer de départ ou sans taux : exclu${t.lotsSansValeur > 1 ? 's' : ''} du total.`) : '')
    + `</div>`;
  const lien = d.lienFiche === null ? '' : `<tr><td style="padding:16px 20px 20px"><a href="${echapper(d.lienFiche)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:${rouge};color:#ffffff;font-weight:700;text-decoration:none;font-size:15px">Ouvrir la fiche du propriétaire</a></td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(objetMail(d))}</title></head>`
    + `<body style="margin:0;padding:0;background:${fond};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${fond}"><tr><td align="center" style="padding:16px 8px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">`
    + `<tr><td style="background:${rouge};padding:16px 20px;color:#ffffff"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">Sans Vis-à-Vis® · Gestion locative</div>`
    + `<div style="margin-top:4px;font-size:20px;font-weight:800;line-height:1.25">${echapper(sortie ? 'Sortie de gestion' : d.reactivation ? 'Retour en gestion' : 'Nouveau mandat de gestion')}</div>`
    + `<div style="margin-top:2px;font-size:15px">${echapper(nomDossier(d))} — ${nbLots(d.lots.length)}</div></td></tr>`
    + bloc('Qui', p(`<strong>${echapper(d.auteur.nom)}</strong>${d.auteur.email ? ` · ${echapper(d.auteur.email)}` : ''}`) + petit(`${echapper(dateHeure(d.quand))} — depuis la tuile ${d.tuile}`))
    + bloc(d.proprietaires.length > 1 ? 'Propriétaires' : 'Propriétaire', proprietaires)
    + bloc(d.lots.length > 1 ? `Lots concernés (${d.lots.length})` : 'Lot concerné', lots)
    + origine
    + bloc('Valorisation', totauxHtml)
    + lien
    + `</table><div style="padding:10px;font-size:12px;color:${gris}">Mail automatique de l’application Sans Vis-à-Vis® — rien n’a été effacé, tout reste consultable et réactivable.</div>`
    + `</td></tr></table></body></html>`;
}
