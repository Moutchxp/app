/**
 * ══ 🔴🔴 LOCATION — LES MAILS AUTOMATIQUES DU PRÉAVIS ET DE LA SORTIE (Arno, 05/11/2026). MODULE PUR : ni base, ni réseau. ══
 *
 * À la validation d'un PRÉAVIS (un ou plusieurs locataires d'un même logement, écran /admin/location/locataire/<id>?sortie=) :
 *   A) l'ACCUSÉ DE RÉCEPTION DU CONGÉ aux locataires — un seul mail : À = tous les locataires choisis qui ont une adresse ;
 *      Cc = gestion@criterimmo.fr + la personne connectée qui valide. Le texte est celui d'Arno, repris tel quel ;
 *   B) l'INFORMATION À ADHOC (gestion.criterimmo@gmail.com), mail séparé, mêmes copies, suivi de la copie complète du mail A.
 * À la validation d'une SORTIE : l'INFORMATION À ADHOC (mêmes copies) — logement, adresse, propriétaire, sortants avec leurs
 * dates d'entrée et de sortie, « logement vacant » ou « reste loué à … ».
 *
 * 🔴 BIEN HORS GESTION : AUCUN mail ADHOC (règle d'Arno du 21/10/2026). L'accusé aux locataires part quand même.
 * 🔴 UN LOCATAIRE SANS E-MAIL NE BLOQUE RIEN : il est signalé dans l'aperçu (« pas d'e-mail, il ne recevra pas l'accusé de
 *    réception ») ; si AUCUN n'en a, le mail A n'est pas construit, et le mail B le dit à la place de la copie.
 * 🔴 LA DATE DE FIN DU BAIL = réception + durée, JOUR POUR JOUR ; un jour qui n'existe pas dans le mois d'arrivée devient le
 *    dernier jour de ce mois (31/01 + 1 mois = 28 ou 29/02) — `ajouterMois`, la règle déjà en place pour le préavis.
 * Tous partent de gestion@ avec la signature Gmail de la Gestion (passée en paramètre, déjà lue par l'appelant).
 */

import { echapper } from './mailNouvelleLocation';
import { ajouterMois, dateFrPreavis, type DureeMois, type ModePreavis } from './preavis';
import { descriptionLogement, type DonneesMailSortie } from './sortieLocataires';

/**
 * 🔴 Arno (05/11/2026, 460) — PLUS AUCUNE ADRESSE PARTENAIRE DANS LE CODE : les destinataires des mails d'information (préavis, sortie) sont
 * ceux des listes « Destinataires — Préavis » / « Sorties » de « Paramètres Location », dans leur ordre ; liste vide (ou case « Informer nos
 * partenaires » décochée) : aucun mail partenaire.
 */

/** Le libellé de l'aperçu pour un locataire sans adresse e-mail (affiché en orange, jamais bloquant). */
export const MENTION_SANS_EMAIL = 'pas d’e-mail, il ne recevra pas l’accusé de réception';

const FORMAT = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export type SorteMailAvis = 'preavis_locataires' | 'preavis_adhoc' | 'sortie_adhoc';

/** Un mail prêt : ce que l'aperçu montre et ce qui part, à l'identique. */
export interface MailAvis {
  sorte: SorteMailAvis;
  de: string;
  a: string[];
  cc: string[];
  objet: string;
  texte: string;
  html: string;
}

export interface Signature { html: string; texte: string }

export interface LocataireAvis { occupationId: number; nom: string; prenom: string | null; emails: string[] }

export interface DonneesPreavisMails {
  /** L'adresse complète du logement (« 12 rue …, 75011 Paris »). */
  adresse: string;
  proprietaire: string | null;
  /** Statut du bien = « en gestion » : seul cas où ADHOC est informé. */
  enGestion: boolean;
  locataires: LocataireAvis[];
  /** 🔴 Arno (05/11/2026) — les partenaires informés (liste « Préavis », dans l'ordre) ; vide : aucun mail partenaire. */
  partenaires: readonly string[];
  recuLe: string;
  choix: ModePreavis;
  expediteur: string;
  valideur: { nom: string; email: string | null };
  signature: Signature;
}

// ── LES BRIQUES ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * « Prénom Nom » d'un locataire. Avec un prénom saisi : « Prénom NOM ». Sans (cas de l'import WIPPIMMO, où `nom` porte
 * « ZITOUNI Nadia ») : les mots EN CAPITALES du début forment le nom, la suite le prénom → « Nadia ZITOUNI ». Un nom tout en
 * capitales, ou sans capitales en tête, reste tel quel. PUR.
 */
export function prenomNom(l: { nom: string; prenom: string | null }): string {
  const nom = l.nom.trim().replace(/\s+/g, ' ');
  const prenom = (l.prenom ?? '').trim();
  if (prenom !== '') return `${prenom} ${nom}`;
  const mots = nom.split(' ');
  const capitales = (m: string): boolean => /\p{Lu}/u.test(m) && m === m.toLocaleUpperCase('fr-FR');
  let i = 0;
  while (i < mots.length && capitales(mots[i])) i += 1;
  if (i === 0 || i === mots.length) return nom;
  return `${mots.slice(i).join(' ')} ${mots.slice(0, i).join(' ')}`;
}

/** « A », « A et B », « A, B et C ». PUR. */
export function enumerer(noms: readonly string[]): string {
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/** La date de fin du bail : réception + durée, jour pour jour (fin de mois ramenée au dernier jour) ; ou la date saisie. PUR. */
export function dateFinBail(recuLe: string, choix: ModePreavis): string {
  return choix.mode === 'mois' ? ajouterMois(recuLe, choix.duree) : choix.dateMax;
}

/** Les adresses valides, sans doublon (casse ignorée), dans l'ordre. PUR. */
export function adressesUniques(liste: readonly (string | null | undefined)[], sauf: readonly string[] = []): string[] {
  const vues = new Set(sauf.map((x) => x.trim().toLowerCase()));
  const sortie: string[] = [];
  for (const brut of liste) {
    const e = (brut ?? '').trim();
    if (!FORMAT.test(e) || vues.has(e.toLowerCase())) continue;
    vues.add(e.toLowerCase());
    sortie.push(e);
  }
  return sortie;
}

/** Les copies de tous ces mails : gestion@ + la personne qui valide (sans répéter un destinataire principal). PUR. */
export function copiesAvis(expediteur: string, valideur: { email: string | null }, a: readonly string[]): string[] {
  return adressesUniques([expediteur, valideur.email], a);
}

const libelleDuree = (d: DureeMois): string => `${d} mois`;

const paragraphesHtml = (paras: readonly string[]): string =>
  paras.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1a1f26">${echapper(p).replace(/\n/g, '<br>')}</p>`).join('');

const avecSignature = (corps: string, s: Signature): { texte: string; html: string } => ({
  texte: s.texte.trim() === '' ? corps : `${corps}\n\n-- \n${s.texte.trim()}`,
  html: s.html.trim() === '' ? '' : `<div class="gmail_signature" style="margin-top:16px">${s.html}</div>`,
});

const enveloppe = (contenu: string): string =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px">${contenu}</div>`;

// ── A) L'ACCUSÉ DE RÉCEPTION DU CONGÉ, AUX LOCATAIRES ─────────────────────────────────────────────────────────────────────

export function objetAccuseConge(adresse: string): string {
  return `Accusé de réception de votre congé — ${adresse}`;
}

/** Les paragraphes du mail A, tels qu'Arno les a écrits (seuls les champs entre chevrons changent). PUR. */
export function paragraphesAccuseConge(d: Pick<DonneesPreavisMails, 'adresse' | 'locataires' | 'recuLe' | 'choix'>): string[] {
  const fin = dateFrPreavis(dateFinBail(d.recuLe, d.choix));
  const duree = d.choix.mode === 'mois'
    ? `Votre préavis étant de ${libelleDuree(d.choix.duree)}, votre bail prendra fin le ${fin}.`
    // La date maximale saisie à la main (cas prévu par l'écran depuis le 18/10) : la phrase garde la date, sans durée inventée.
    : `Votre bail prendra fin le ${fin}.`;
  return [
    `Bonjour ${enumerer(d.locataires.map(prenomNom))},`,
    `Nous accusons réception de votre congé pour le logement situé ${d.adresse}, reçu le ${dateFrPreavis(d.recuLe)}.`,
    `${duree} Nous vous rappelons que le loyer et les charges restent dus jusqu’à la fin du préavis, y compris si vous quittez le logement avant cette date.`,
    'Notre équipe vous propose d’organiser dans les 10 jours une visite de pré-état des lieux de sortie. Elle permet de comparer l’état actuel du logement avec l’état des lieux d’entrée et de vous signaler, si besoin, les points à reprendre avant votre départ, afin de limiter les retenues sur le dépôt de garantie. Cette visite n’est pas obligatoire, mais nous vous la recommandons vivement : elle évite les incompréhensions le jour de l’état des lieux de sortie définitif. Pour la fixer, il vous suffit de répondre à ce message.',
    'Enfin, le logement étant situé dans un immeuble collectif, nous pourrons conserver, même si l’état des lieux de sortie est conforme, une provision de 20 % au plus du dépôt de garantie jusqu’à l’approbation des comptes annuels de l’immeuble par l’assemblée générale des copropriétaires (article 22 de la loi n° 89-462 du 6 juillet 1989). Cette provision sert à régulariser les charges réelles de l’année : le solde vous sera restitué, déduction faite des sommes éventuellement dues, dans le mois qui suit l’approbation des comptes.',
    'Nous restons à votre disposition pour toute question.',
  ];
}

/** Le mail A, ou `null` si aucun locataire choisi n'a d'adresse e-mail. PUR. */
export function mailAccuseConge(d: DonneesPreavisMails): MailAvis | null {
  const a = adressesUniques(d.locataires.flatMap((l) => l.emails));
  if (a.length === 0) return null;
  const paras = paragraphesAccuseConge(d);
  const sig = avecSignature(paras.join('\n\n'), d.signature);
  return {
    sorte: 'preavis_locataires', de: d.expediteur, a, cc: copiesAvis(d.expediteur, d.valideur, a), objet: objetAccuseConge(d.adresse),
    texte: sig.texte, html: enveloppe(`${paragraphesHtml(paras)}${sig.html}`),
  };
}

// ── B) L'INFORMATION À ADHOC, POUR LE PRÉAVIS ────────────────────────────────────────────────────────────────────────────

export function objetAdhocPreavis(d: Pick<DonneesPreavisMails, 'adresse' | 'locataires'>): string {
  return `[Information] Préavis reçu — ${d.adresse} — ${enumerer(d.locataires.map(prenomNom))}`;
}

/** L'en-tête de la copie du mail A (De, À, Cc, Objet), comme un transfert. PUR. */
function enteteCopie(m: MailAvis): string[] {
  return ['---------- Copie du mail envoyé aux locataires ----------', `De : ${m.de}`, `À : ${m.a.join(', ')}`,
    ...(m.cc.length > 0 ? [`Cc : ${m.cc.join(', ')}`] : []), `Objet : ${m.objet}`];
}

/** Le mail B, ou `null` pour un bien HORS gestion (aucun mail ADHOC). `accuse` = le mail A tel qu'il part (ou `null`). PUR. */
export function mailAdhocPreavis(d: DonneesPreavisMails, accuse: MailAvis | null): MailAvis | null {
  if (!d.enGestion) return null;
  const a = adressesUniques(d.partenaires);
  if (a.length === 0) return null;
  const noms = enumerer(d.locataires.map(prenomNom));
  const plusieurs = d.locataires.length > 1;
  // 🔴 Arno (05/11/2026) — l'introduction telle qu'il l'a écrite (seuls les champs changent) ; « purement informatif » retiré.
  const intro = [
    'Bonjour,',
    `Nous vous informons que nous avons reçu, le ${dateFrPreavis(d.recuLe)}, le congé de ${noms} pour le logement situé ${d.adresse} (propriétaire : ${d.proprietaire ?? 'non renseigné'}). Le bail prendra théoriquement fin le ${dateFrPreavis(dateFinBail(d.recuLe, d.choix))}.`,
    accuse === null
      // Aucun accusé envoyé par mail : pas de copie à annoncer (constat inchangé).
      ? 'Aucun des locataires n’a d’adresse e-mail connue : l’accusé de réception ne leur a pas été envoyé par mail.'
      : `Vous trouverez ci-dessous, pour votre suivi, la copie de l’accusé de réception que nous ${plusieurs ? 'leur' : 'lui'} avons adressé.`,
    'Bonne journée,\nL’équipe Sans Vis-à-Vis',
  ];
  // Notre signature d'abord, PUIS la copie (comme un transfert) — dans le texte comme dans le HTML.
  const sig = avecSignature(intro.join('\n\n'), d.signature);
  const texte = accuse === null ? sig.texte : `${sig.texte}\n\n${enteteCopie(accuse).join('\n')}\n\n${accuse.texte}`;
  const copieHtml = accuse === null ? '' : `<div style="margin-top:20px;padding:12px 16px;border-left:3px solid #c9ced6;background:#f4f5f7">`
    + `<div style="font-size:13px;line-height:1.5;color:#5b6472;margin-bottom:12px">${enteteCopie(accuse).map(echapper).join('<br>')}</div>${accuse.html}</div>`;
  return {
    sorte: 'preavis_adhoc', de: d.expediteur, a, cc: copiesAvis(d.expediteur, d.valideur, a), objet: objetAdhocPreavis(d),
    texte, html: enveloppe(`${paragraphesHtml(intro)}${sig.html}${copieHtml}`),
  };
}

/** Les deux mails du préavis, et les locataires choisis SANS adresse (orange dans l'aperçu). PUR. */
export function mailsDuPreavis(d: DonneesPreavisMails): { mails: MailAvis[]; sansEmail: string[] } {
  const accuse = mailAccuseConge(d);
  const adhoc = mailAdhocPreavis(d, accuse);
  return {
    mails: [accuse, adhoc].filter((m): m is MailAvis => m !== null),
    sansEmail: d.locataires.filter((l) => adressesUniques(l.emails).length === 0).map(prenomNom),
  };
}

// ── L'INFORMATION À ADHOC, POUR LA SORTIE ────────────────────────────────────────────────────────────────────────────────

export function objetAdhocSortie(adresse: string): string {
  return `[Information] Sortie de locataire(s) — ${adresse}`;
}

/**
 * Le mail d'information de la SORTIE à ADHOC, ou `null` pour un bien HORS gestion. Les données sont celles du mail de compte
 * rendu déjà en place (`DonneesMailSortie`), qui reste envoyé tel quel. PUR.
 */
export function mailAdhocSortie(d: DonneesMailSortie & { enGestion: boolean; expediteur: string; signature: Signature; partenaires: readonly string[] }): MailAvis | null {
  if (!d.enGestion) return null;
  const a = adressesUniques(d.partenaires);
  if (a.length === 0) return null;
  const adresse = d.adresse ?? `Bien ${d.lotId}`;
  const plusieurs = d.sortants.length > 1;
  const paras = [
    'Bonjour,',
    `Pour information, ${plusieurs ? 'les locataires suivants ont quitté' : 'le locataire suivant a quitté'} le logement situé ${adresse}.`,
    [`Logement : ${descriptionLogement(d)}${d.annexes.length > 0 ? ` — avec ${d.annexes.join(', ')}` : ''}`, `Adresse : ${adresse}`,
      `Propriétaire : ${d.proprietaire ?? 'non renseigné'}`].join('\n'),
    [`${plusieurs ? 'Locataires sortis' : 'Locataire sorti'} :`,
      ...d.sortants.map((s) => `- ${prenomNom({ nom: s.nom, prenom: null })} — ${s.entree === null ? 'date d’entrée non renseignée' : `entré(e) le ${dateFrPreavis(s.entree)}`}, sorti(e) le ${dateFrPreavis(s.sortie)}`)].join('\n'),
    d.vacant ? 'Le logement est désormais vacant.' : `Le logement reste loué à ${enumerer(d.restants.map((n) => prenomNom({ nom: n, prenom: null })))}.`,
    'Ce message est purement informatif : aucune action n’est attendue de votre part.',
  ];
  const sig = avecSignature(paras.join('\n\n'), d.signature);
  return {
    sorte: 'sortie_adhoc', de: d.expediteur, a, cc: copiesAvis(d.expediteur, d.auteur, a), objet: objetAdhocSortie(adresse),
    texte: sig.texte, html: enveloppe(`${paragraphesHtml(paras)}${sig.html}`),
  };
}
