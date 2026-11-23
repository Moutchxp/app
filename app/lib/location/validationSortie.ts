/**
 * ══ 🔴🔴 « VALIDER L'ÉTAT DES LIEUX DE SORTIE » (spec d'Arno du 11/11/2026, lot 4). MODULE PUR. ═══════════════════════════════════════════
 *
 * La fenêtre ouverte par « Valider la sortie » sur la ligne de préavis : la case « L'état des lieux de sortie a été réalisé », la date de
 * sortie effective (jamais dans le futur), les locataires concernés (tous cochés par défaut), le compte rendu libre, et les destinataires,
 * cochés un par un, par famille (LOCATAIRES puis PROPRIÉTAIRES). Aucun coché : copie interne seule (gestion@ et la personne qui valide).
 *
 * 🔴 CONFIDENTIALITÉ (règle absolue d'Arno) : UN mail par destinataire, seul destinataire, aucune copie visible. Un locataire ne reçoit
 * jamais les coordonnées (nom, téléphone, e-mail) du propriétaire ni d'un autre locataire ; un propriétaire jamais celles des locataires ni
 * d'un autre propriétaire. Les textes fixes n'en portent aucune ; le compte rendu, LIBRE, est CONTRÔLÉ (`coordonneesDeTiers`) : s'il en
 * contient, le récapitulatif le dit en rouge (« Attention : ce texte contient les coordonnées de … ») et RIEN ne part avant correction.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { adressesUniques, composerMailLocation, prenomNom, unMailParAdresse, type MailAvis, type Signature } from './mailsPreavisSortie';
import { dateFrPreavis } from './preavis';
import { dateFr, moisAnnee, unMoisApres, type StatutAg } from './agCopropriete';
import type { mentionEnvoyePar } from './mentionEnvoyePar';
import { lignesAg } from './agCopropriete';

export const COMPTE_RENDU_MAX = 20_000;
export const PREFIXE_COPIE_INTERNE_SORTIE = '[Copie interne] ';

export type FamilleSortie = 'locataire' | 'proprietaire';

/** Une partie du bail, avec SES coordonnées (lues dans l'encart du logement). `cle` : « loc-<occupation> » ou « pro-<propriétaire> ». */
export interface PartieSortie {
  cle: string;
  famille: FamilleSortie;
  nom: string;
  prenom: string | null;
  emails: string[];
  telephones: string[];
  occupationId?: number;
  proprietaireId?: number;
}

export const cleLocataire = (occupationId: number): string => `loc-${occupationId}`;
export const cleProprietaire = (id: number): string => `pro-${id}`;

// ── La saisie ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type VerdictValidation = { ok: true } | { ok: false; motif: string; champ: 'realise' | 'date' | 'locataires' | 'compteRendu' };

/**
 * Le contrôle de la fenêtre (le serveur le refait, puis `verifierSortie` pour les bornes du bail : entrée, un an au plus). PUR.
 * `aujourdhui` : AAAA-MM-JJ (Paris).
 */
export function verifierValidation(d: { realise: unknown; date: unknown; sortants: readonly number[]; compteRendu: unknown }, aujourdhui: string): VerdictValidation {
  if (d.realise !== true) return { ok: false, motif: 'Cochez « L’état des lieux de sortie a été réalisé » pour valider la sortie.', champ: 'realise' };
  if (typeof d.date !== 'string' || d.date === '') return { ok: false, motif: 'La date de sortie effective est obligatoire.', champ: 'date' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return { ok: false, motif: 'La date de sortie effective n’est pas une date valide.', champ: 'date' };
  if (d.date > aujourdhui) return { ok: false, motif: 'La date de sortie effective ne peut pas être dans le futur.', champ: 'date' };
  if (d.sortants.length === 0) return { ok: false, motif: 'Cochez au moins un locataire concerné.', champ: 'locataires' };
  if (typeof d.compteRendu === 'string' && d.compteRendu.length > COMPTE_RENDU_MAX) {
    return { ok: false, motif: `Le compte rendu dépasse ${COMPTE_RENDU_MAX} caractères.`, champ: 'compteRendu' };
  }
  return { ok: true };
}

// ── L'alerte : les coordonnées d'une autre partie dans le texte libre ─────────────────────────────────────────────────

const normaliser = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Les petits mots d'un nom qui ne désignent personne à eux seuls. */
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'van', 'von', 'der', 'den', 'mme', 'mlle', 'mr', 'monsieur', 'madame', 'et', 'sci', 'sas', 'sarl']);
const motsDuNom = (p: Pick<PartieSortie, 'nom' | 'prenom'>): string[] =>
  [...new Set(normaliser(`${p.prenom ?? ''} ${p.nom}`).split(/[^\p{L}\p{N}]+/u).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m)))];
/** Les 9 derniers chiffres d'un numéro français (le « 0 » ou le « +33 » de tête ignorés). */
const finDeNumero = (s: string): string | null => { const c = s.replace(/\D/g, ''); return c.length >= 9 ? c.slice(-9) : null; };

export type CoordonneeTrouvee = 'nom' | 'telephone' | 'email';
export interface TiersDansLeTexte { cle: string; famille: FamilleSortie; libelle: string; quoi: CoordonneeTrouvee[] }

/**
 * 🔴 LE CONTRÔLE : les AUTRES parties dont le texte porte le nom (chacun de ses mots distinctifs, hors ceux que le destinataire partage —
 * deux époux DUPONT), le téléphone (9 derniers chiffres) ou l'e-mail. Le destinataire lui-même n'est jamais signalé. Insensible à la casse
 * et aux accents. PUR.
 */
export function coordonneesDeTiers(texte: string, destinataire: PartieSortie, parties: readonly PartieSortie[]): TiersDansLeTexte[] {
  const t = normaliser(texte ?? '');
  if (t.trim() === '') return [];
  const motsDuTexte = new Set(t.split(/[^\p{L}\p{N}]+/u).filter((m) => m !== ''));
  const numeros = new Set((t.match(/\+?\d[\d\s.\-/]{7,}\d/g) ?? []).map(finDeNumero).filter((x): x is string => x !== null));
  const siens = new Set(motsDuNom(destinataire));
  // Un mot PROPRE à une partie (son prénom) la désigne ; un mot PARTAGÉ (« Dupont », deux époux) ne désigne ceux qui le portent que si
  // aucun d'eux n'est déjà désigné par un mot propre (« Jean Dupont » = Jean, pas Marie ; « M. Dupont » seul = l'un ou l'autre : les deux).
  const autres = parties.filter((p) => p.cle !== destinataire.cle);
  const motsDe = new Map(autres.map((p) => [p.cle, motsDuNom(p).filter((m) => !siens.has(m))]));
  const porteurs = new Map<string, string[]>();
  for (const [cle, mots] of motsDe) for (const m of mots) porteurs.set(m, [...(porteurs.get(m) ?? []), cle]);
  const designeParUnMotPropre = new Set([...motsDe].filter(([, mots]) => mots.some((m) => porteurs.get(m)!.length === 1 && motsDuTexte.has(m))).map(([cle]) => cle));
  const nommeDansLeTexte = (cle: string): boolean => designeParUnMotPropre.has(cle)
    || (motsDe.get(cle) ?? []).some((m) => motsDuTexte.has(m) && porteurs.get(m)!.length > 1 && porteurs.get(m)!.every((c) => !designeParUnMotPropre.has(c)));
  const sortie: TiersDansLeTexte[] = [];
  for (const p of autres) {
    const quoi: CoordonneeTrouvee[] = [];
    if (nommeDansLeTexte(p.cle)) quoi.push('nom');
    if (p.telephones.some((x) => { const f = finDeNumero(x); return f !== null && numeros.has(f); })) quoi.push('telephone');
    if (p.emails.some((e) => e.trim() !== '' && t.includes(normaliser(e.trim())))) quoi.push('email');
    if (quoi.length > 0) sortie.push({ cle: p.cle, famille: p.famille, libelle: prenomNom(p), quoi });
  }
  return sortie;
}

const MOT_COORDONNEE: Record<CoordonneeTrouvee, string> = { nom: 'nom', telephone: 'téléphone', email: 'e-mail' };
/** « Attention : ce texte contient les coordonnées de Jean DUPONT (nom, téléphone). » PUR. */
export function phraseAlerte(tiers: readonly TiersDansLeTexte[]): string {
  return `Attention : ce texte contient les coordonnées de ${tiers.map((x) => `${x.libelle} (${x.quoi.map((q) => MOT_COORDONNEE[q]).join(', ')})`).join(', ')}.`;
}

// ── Les mails ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const objetValidationSortie = (adresse: string): string => `État des lieux de sortie — ${adresse}`;
const paragraphesLibres = (texte: string): string[] => texte.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '');

export type QuiValide = Parameters<typeof mentionEnvoyePar>[0];

export interface DonneesValidationSortie {
  adresse: string;
  /** AAAA-MM-JJ. */
  date: string;
  compteRendu: string;
  /** Tout le logement est libéré (aucun locataire ne reste). */
  vacant: boolean;
  copropriete: boolean | null;
  /**
   * 🔴 Arno (11/11/2026) — la RETENUE DE 20 % du dépôt de garantie (la case de la fenêtre) : cochée, le paragraphe (modifiable) en fin de
   * compte rendu des LOCATAIRES, la phrase courte chez les PROPRIÉTAIRES ; décochée ou absente : rien.
   */
  retenue?: { appliquee: boolean; paragrapheLocataire: string;
    /** 🔴 Arno (16/11/2026, 475) — la phrase des propriétaires, avec la mention de la prochaine AG si elle a été choisie ; absente : la phrase fixe */
    phraseProprietaire?: string;
    /** 🔴 Arno (16/11/2026, 475) — les deux dates d'AG saisies (copie interne) */
    ag?: { derniere: string; prochaine: string; statut: 'officielle' | 'projetee' } | null } | null;
  /** 🔴 Arno (11/11/2026) — les pièces jointes : les MÊMES à chaque mail (locataires, propriétaires, copie interne). */
  pieces?: readonly PieceJointe[];
  /** Les parties COCHÉES (un mail chacune, si elle a une adresse). */
  destinataires: readonly PartieSortie[];
  /** Les locataires concernés (pour la copie interne seulement). */
  sortants: readonly Pick<PartieSortie, 'nom' | 'prenom'>[];
  expediteur: string;
  qui: QuiValide;
  signature: Signature;
  /** La copie interne : gestion@ et la personne qui valide (déjà dédoublonnés). */
  internes: readonly string[];
}

/**
 * 🔴 Arno (23/11/2026) — « après le 1er paragraphe du mail qui valide la sortie du locataire et qui se finit par "cette date", il faut ajouter un
 * paragraphe qui indique qu'il trouvera en pièce jointe de ce mail le document d'état des lieux de sortie effectué, puis garder le reste du mail
 * déjà écrit au paragraphe suivant. » — SEULEMENT si au moins une pièce est jointe au compte rendu ; au pluriel (« les documents ») s'il y en a
 * plusieurs. Sans pièce : rien (le récapitulatif l'annonce : AVERTISSEMENT_SANS_EDL_JOINT). PUR.
 */
// 🔴 Arno (23/11/2026, suite) — « le rapport COMPLET » (23/11, tard) ; « un paragraphe qui indique que le destinataire de ce mail trouvera en pièce jointe le rapport de l'état des lieux de
// sortie de son logement » : locataire (reformulé) et PROPRIÉTAIRE (même principe, juste après sa phrase d'ouverture).
export const paragraphePiecesLocataire = (n: number): string | null => (n <= 0 ? null : n === 1
  ? 'Vous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement. Nous vous invitons à le conserver.'
  : 'Vous trouverez en pièces jointes de ce mail le rapport complet et les documents de l’état des lieux de sortie de votre logement. Nous vous invitons à les conserver.');
export const paragraphePiecesProprietaire = (n: number, adresse: string): string | null => (n <= 0 ? null : n === 1
  ? `Vous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement situé ${adresse}.`
  : `Vous trouverez en pièces jointes de ce mail le rapport complet et les documents de l’état des lieux de sortie de votre logement situé ${adresse}.`);
export const AVERTISSEMENT_SANS_EDL_JOINT = 'Aucun état des lieux joint : le mail ne l’annoncera pas.';

/** Les paragraphes du mail d'UNE partie : rien d'un tiers dans les textes fixes ; le compte rendu tel qu'écrit (contrôlé à part). PUR. */
export function paragraphesPour(p: Pick<PartieSortie, 'famille' | 'nom' | 'prenom'>, d: Pick<DonneesValidationSortie, 'adresse' | 'date' | 'compteRendu' | 'vacant' | 'copropriete' | 'retenue' | 'pieces'>): string[] {
  const date = dateFrPreavis(d.date);
  const cr = paragraphesLibres(d.compteRendu);
  const compteRendu = cr.length > 0 ? ['Compte rendu de l’état des lieux de sortie :', ...cr] : [];
  if (p.famille === 'locataire') {
    return [`Bonjour ${prenomNom(p)},`,
      `L’état des lieux de sortie de votre logement situé ${d.adresse} a été réalisé le ${date}. Votre sortie du logement est enregistrée à cette date.`,
      // 🔴 Arno (23/11/2026) — « le paragraphe "Vous trouverez en pièce jointe …" doit être placé SOUS le bloc "Compte rendu de l'état des lieux de
      // sortie : …", et non avant » : ouverture, compte rendu, pièce jointe, 20 %, formule de fin (sans compte rendu : la pièce jointe suit l'ouverture)
      ...compteRendu,
      ...[paragraphePiecesLocataire((d.pieces ?? []).length)].filter((x): x is string => x !== null),
      // 🔴 Arno (11/11/2026) — la provision de 20 % : SEULEMENT si la case « Retenue de 20 % » est cochée (elle remplace le paragraphe
      // automatique d'avant) ; le texte, modifiable, est celui de la fenêtre.
      ...(d.retenue?.appliquee && d.retenue.paragrapheLocataire.trim() !== '' ? paragraphesLibres(d.retenue.paragrapheLocataire) : []),
      'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'];
  }
  return [`Bonjour ${prenomNom(p)},`,
    `L’état des lieux de sortie de votre bien situé ${d.adresse} a été réalisé le ${date}.${d.vacant ? ' Le logement est désormais libre de toute occupation.' : ''}`,
    // 🔴 Arno (23/11/2026) — même ordre que le locataire : le compte rendu, PUIS la pièce jointe
    ...compteRendu,
    ...[paragraphePiecesProprietaire((d.pieces ?? []).length, d.adresse)].filter((x): x is string => x !== null),
    // 🔴 Arno (23/11/2026) — le texte des propriétaires est modifiable (comme celui des locataires) : ses paragraphes, tels qu'écrits
    ...(d.retenue?.appliquee ? paragraphesLibres(d.retenue.phraseProprietaire?.trim() || PHRASE_RETENUE_PROPRIETAIRE) : []), 'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'];
}

/** Le mail d'UNE partie : elle seule en destinataire, aucune copie. `null` : pas d'adresse e-mail. PUR. */
export function mailDeLaPartie(p: PartieSortie, d: DonneesValidationSortie): MailAvis | null {
  const a = adressesUniques(p.emails);
  if (a.length === 0) return null;
  const c = composerMailLocation(paragraphesPour(p, d), d.qui, d.signature);
  return { sorte: p.famille === 'locataire' ? 'sortie_edls_locataire' : 'sortie_edls_proprietaire', de: d.expediteur, a, cc: [], objet: objetValidationSortie(d.adresse), texte: c.texte, html: c.html,
    ...((d.pieces ?? []).length > 0 ? { pieces: [...(d.pieces ?? [])] } : {}) };
}

/**
 * La COPIE INTERNE (gestion@ et la personne qui valide) : la sortie, à qui chaque mail est parti (séparément), et le compte rendu. Elle seule
 * réunit les coordonnées des parties : elle ne sort jamais de l'agence. `null` : aucune adresse interne. PUR.
 */
export function copieInterneSortie(d: DonneesValidationSortie, partis: readonly { partie: PartieSortie; mail: MailAvis }[]): MailAvis | null {
  const a = adressesUniques(d.internes);
  if (a.length === 0) return null;
  const MOT: Record<FamilleSortie, string> = { locataire: 'locataire', proprietaire: 'propriétaire' };
  const liste = partis.map((x) => `· ${prenomNom(x.partie)} (${MOT[x.partie.famille]}) — ${x.mail.a.join(', ')}`);
  const cr = paragraphesLibres(d.compteRendu);
  const c = composerMailLocation([
    `Sortie validée : l’état des lieux de sortie du logement situé ${d.adresse} a été réalisé le ${dateFrPreavis(d.date)}.`,
    `Locataire${d.sortants.length > 1 ? 's' : ''} concerné${d.sortants.length > 1 ? 's' : ''} : ${d.sortants.map(prenomNom).join(', ')}.${d.vacant ? ' Le logement devient libre.' : ''}`,
    partis.length === 0 ? 'Aucun mail aux locataires ni aux propriétaires : copie interne seule.'
      : `Mails partis séparément (un destinataire par mail, sans copie visible) :\n${liste.join('\n')}`,
    ...(cr.length > 0 ? ['Compte rendu de l’état des lieux de sortie :', ...cr] : ['Aucun compte rendu saisi.']),
    d.retenue?.appliquee ? 'Retenue de 20 % du dépôt de garantie : appliquée (article 22).' : 'Retenue de 20 % du dépôt de garantie : non appliquée.',
    // 🔴 Arno (16/11/2026, 475) — les deux dates d'AG saisies, avec leur statut
    ...(d.retenue?.appliquee && d.retenue.ag ? [lignesAg(d.retenue.ag).map(([k, v]) => `${k} : ${v}`).join('\n')] : []),
    ...((d.pieces ?? []).length > 0 ? [`Pièces jointes : ${(d.pieces ?? []).map((x) => x.nom).join(', ')}.`] : []),
  ], d.qui, d.signature);
  return { sorte: 'sortie_edls_interne', de: d.expediteur, a, cc: [], objet: `${PREFIXE_COPIE_INTERNE_SORTIE}${objetValidationSortie(d.adresse)}`, texte: c.texte, html: c.html,
    ...((d.pieces ?? []).length > 0 ? { pieces: [...(d.pieces ?? [])] } : {}) };
}

/** Tous les mails de la validation, dans l'ordre : LOCATAIRES, PROPRIÉTAIRES, puis la copie interne. PUR. */
export function mailsValidationSortie(d: DonneesValidationSortie): { parties: { partie: PartieSortie; mail: MailAvis }[]; interne: MailAvis | null; sansEmail: string[] } {
  const ordre = [...d.destinataires.filter((p) => p.famille === 'locataire'), ...d.destinataires.filter((p) => p.famille === 'proprietaire')];
  // 🔴🔴 (Arno, 17/11/2026) un mail PAR ADRESSE (un couple propriétaire sur une même fiche : chacun le sien), marqué client
  const parties = ordre.flatMap((p) => { const m = mailDeLaPartie(p, d); return m === null ? [] : unMailParAdresse({ ...m, client: p.famille }).map((mail) => ({ partie: p, mail })); });
  return { parties, interne: copieInterneSortie(d, parties), sansEmail: ordre.filter((p) => adressesUniques(p.emails).length === 0).map(prenomNom) };
}

/** Les alertes du compte rendu, par destinataire coché : vide = rien à corriger. PUR. */
export function alertesDuCompteRendu(compteRendu: string, destinataires: readonly PartieSortie[], parties: readonly PartieSortie[]): { cle: string; libelle: string; tiers: TiersDansLeTexte[]; phrase: string }[] {
  return destinataires.map((p) => ({ p, tiers: coordonneesDeTiers(compteRendu, p, parties) })).filter((x) => x.tiers.length > 0)
    .map(({ p, tiers }) => ({ cle: p.cle, libelle: prenomNom(p), tiers, phrase: phraseAlerte(tiers) }));
}

// ── 🔴 Arno (11/11/2026) — LA RETENUE DE 20 % DU DÉPÔT DE GARANTIE (article 22) ────────────────────────────────────────────────

/**
 * 🔴🔴 Arno (23/11/2026) — « le texte du mail aux locataires et au propriétaire […] doit être un peu plus développé/rond […] un peu plus humain
 * qu'uniquement factuel, et donner le nom complet de l'article de loi 22 avec sa date de vote ». La base légale, citée EN ENTIER une fois.
 */
export const BASE_LEGALE_ARTICLE_22 = 'l’article 22 de la loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs et portant modification de la loi n° 86-1290 du 23 décembre 1986 (dans sa rédaction issue de la loi n° 2014-366 du 24 mars 2014, dite loi ALUR)';
/**
 * Le paragraphe des LOCATAIRES (modifiable avant l'envoi), apostrophes typographiques — dans l'ordre voulu par Arno : pourquoi (copropriété), la
 * base légale, ce qu'elle permet (au plus 20 % jusqu'à l'arrêté annuel des comptes), ce qui se passera (régularisation au prorata, restitution
 * ou ajustement dans le mois qui suit l'approbation), [la date : phrase insérée par `avecMentionAgLocataire`], la réassurance. La formule « Nous
 * restons à votre disposition pour toute question. » suit déjà dans le mail : elle n'est pas répétée ici.
 */
export const PARAGRAPHE_RETENUE_LOCATAIRE = `Le logement que vous occupiez se trouve dans un immeuble en copropriété. Pour cette raison, et comme le prévoit ${BASE_LEGALE_ARTICLE_22}, nous conservons au plus 20 % de votre dépôt de garantie jusqu’à l’arrêté annuel des comptes de l’immeuble couvrant votre période d’occupation. Une régularisation des charges sera alors établie au prorata de votre durée d’occupation : si les charges réelles correspondent aux provisions que vous avez versées, ce solde vous sera restitué intégralement ; dans le cas contraire, il sera ajusté en conséquence, dans le mois qui suit l’approbation des comptes. Notre équipe reviendra vers vous dès l’approbation des comptes, pour vous en présenter le détail.`;
/**
 * 🔴🔴 Arno (23/11/2026) — LE TEXTE DES PROPRIÉTAIRES : « il faut ajouter qu'il doit nous communiquer, dès qu'il en aura connaissance, la date de tenue
 * de l'AGO (rappeler la date approximative projetée qui concerne son/ses locataires sortants), afin de pouvoir préparer/anticiper la restitution des
 * 20 % aux locataires. La bonne gestion de la sortie complète de son locataire dépend aussi de la bonne transmission des éléments nécessaires au
 * service Gestion. Refaire le texte plus synthétique et clair. » Trois paragraphes : la retenue (base légale, exercice), la date (l'AGO qui compte,
 * la MÊME que pour le locataire, et la restitution le mois suivant), ce qu'on attend du propriétaire. Projetée (ou statut à choisir) / officielle ;
 * arrêté inconnu : « l'exercice couvrant sa période d'occupation » ; plusieurs locataires sortants : « vos locataires » / « leur ». Sans date
 * (case « Indiquer … » non cochée) : la restitution « dans le mois qui suit l'approbation des comptes » et la demande de la date. PUR.
 */
export function texteProprietaire(o: { jour: string | null; statut: StatutAg | null; cloture: string | null; pluriel: boolean }): string {
  const loc = o.pluriel ? 'vos locataires' : 'votre locataire';
  const exercice = o.cloture !== null ? `de l’exercice clos le ${dateFr(o.cloture)}` : `de l’exercice couvrant ${o.pluriel ? 'leur' : 'sa'} période d’occupation`;
  const p1 = `Le logement étant situé dans une copropriété, nous conservons, comme le prévoit ${BASE_LEGALE_ARTICLE_22}, au plus 20 % du dépôt de garantie de ${loc} jusqu’à l’approbation des comptes ${exercice}.`;
  const demande = (quoi: string): string => `Pour préparer cette restitution dans les délais, merci de nous communiquer ${quoi} dès que vous la connaîtrez, puis son procès-verbal dès sa réception. La bonne clôture de la sortie de ${loc} dépend de la transmission de ces éléments à notre service Gestion.`;
  if (o.jour === null) {
    return [p1, `Le solde sera ensuite restitué ou ajusté à ${loc} dans le mois qui suit l’approbation des comptes.`,
      demande('la date de l’assemblée générale ordinaire qui approuvera ces comptes')].join('\n\n');
  }
  return [p1, paragrapheDateProprietaire(o.jour, o.statut, o.pluriel), o.statut === 'officielle'
    ? `Merci de nous transmettre le procès-verbal de cette assemblée dès sa réception : la bonne clôture de la sortie de ${loc} en dépend.`
    : demande('la date précise de cette assemblée')].join('\n\n');
}
/** Le 2e paragraphe du texte des propriétaires : l'AGO qui compte et la restitution (le mois suivant). PUR. */
export function paragrapheDateProprietaire(jour: string, statut: StatutAg | null, pluriel = false): string {
  const loc = pluriel ? 'vos locataires' : 'votre locataire';
  return statut === 'officielle'
    ? `Ces comptes seront approuvés lors de l’assemblée générale ordinaire prévue le ${dateFr(jour)}. Le solde sera ensuite restitué ou ajusté à ${loc} au plus tard le ${dateFr(unMoisApres(jour))}.`
    : `Ces comptes seront approuvés lors de l’assemblée générale ordinaire attendue vers ${moisAnnee(jour)} (date approximative, estimée d’après les précédentes assemblées). Le solde sera ensuite restitué ou ajusté à ${loc} vers ${moisAnnee(unMoisApres(jour))}.`;
}
/** Le texte des propriétaires par défaut (aucune date connue, un locataire) : le repli du mail. */
export const PHRASE_RETENUE_PROPRIETAIRE = texteProprietaire({ jour: null, statut: null, cloture: null, pluriel: false });
export const MOTIF_RETENUE_IMPOSSIBLE = 'Retenue impossible : le bien n’est pas en copropriété (article 22).';
export const ALERTE_COPROPRIETE_NON_RENSEIGNEE = 'Copropriété non renseignée sur la fiche du bien : vérifiez avant d’appliquer la retenue.';

/** La case « Retenue de 20 % », selon la copropriété SAISIE sur la fiche du bien. PUR. */
export function etatRetenue(copropriete: boolean | null): 'impossible' | 'a_verifier' | 'possible' {
  return copropriete === false ? 'impossible' : copropriete === null ? 'a_verifier' : 'possible';
}

// ── 🔴 Arno (11/11/2026) — LES PIÈCES JOINTES ───────────────────────────────────────────────────────────────────────────────

/** Une pièce prête à partir : ses octets ne viennent qu'au moment de l'envoi (stockage objet). */
export interface PieceJointe { id: number; nom: string; typeMime: string; taille: number; octets?: Uint8Array }

/** 10 Mo par fichier, 15 Mo au total : un mail encodé (≈ × 1,37) reste sous la limite de 25 Mo de Gmail. */
export const PIECE_MAX_OCTETS = 10 * 1024 * 1024;
export const PIECES_MAX_OCTETS = 15 * 1024 * 1024;
/** Types acceptés : PDF, JPG, PNG, HEIC, Word — par type annoncé OU par extension (un navigateur ne connaît pas toujours HEIC). */
const TYPES_PIECE: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const TYPES_PIECE_LIBELLE = 'PDF, JPG, PNG, HEIC, Word';
export const ACCEPT_PIECES = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const mo = (octets: number): string => `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

/** Le type normalisé d'une pièce acceptée, ou `null` (refusée). PUR. */
export function typePiece(nom: string, typeMime: string | null | undefined): string | null {
  const ext = (nom.split('.').pop() ?? '').toLowerCase();
  const t = (typeMime ?? '').toLowerCase().trim();
  const parType = Object.values(TYPES_PIECE).includes(t) ? t : null;
  return parType ?? (nom.includes('.') ? TYPES_PIECE[ext] ?? null : null);
}

/** Le contrôle d'une pièce de plus : type, taille, total. `null` = acceptée. PUR. */
export function refusPiece(p: { nom: string; typeMime: string | null; taille: number }, dejaJointes: readonly { taille: number }[]): string | null {
  if (typePiece(p.nom, p.typeMime) === null) return `« ${p.nom} » : type refusé (acceptés : ${TYPES_PIECE_LIBELLE}).`;
  if (!(p.taille > 0)) return `« ${p.nom} » : fichier vide.`;
  if (p.taille > PIECE_MAX_OCTETS) return `« ${p.nom} » : ${mo(p.taille)}, au-delà de ${mo(PIECE_MAX_OCTETS)} par fichier.`;
  const total = dejaJointes.reduce((n, x) => n + x.taille, 0) + p.taille;
  if (total > PIECES_MAX_OCTETS) return `« ${p.nom} » : le total des pièces dépasserait ${mo(PIECES_MAX_OCTETS)} (${mo(total)}).`;
  return null;
}

export const AVERTISSEMENT_PIECES = 'Vérifiez que les pièces jointes ne contiennent pas de coordonnées qui ne doivent pas être transmises à ce destinataire.';

/** Le filtre « États des lieux » de la fenêtre Drive : le nom du fichier ou son chemin parle d'état des lieux. PUR. */
export function estEtatDesLieux(nom: string, chemin: readonly string[] = []): boolean {
  const t = normaliser([...chemin, nom].join(' / '));
  return /etats? des lieux|\bedls?\b|\bedl[_\- ]/.test(t);
}
