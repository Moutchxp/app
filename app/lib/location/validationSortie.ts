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
import { adressesUniques, composerMailLocation, paragrapheCopropriete, prenomNom, type MailAvis, type Signature } from './mailsPreavisSortie';
import { dateFrPreavis } from './preavis';
import type { mentionEnvoyePar } from './mentionEnvoyePar';

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

/** Les paragraphes du mail d'UNE partie : rien d'un tiers dans les textes fixes ; le compte rendu tel qu'écrit (contrôlé à part). PUR. */
export function paragraphesPour(p: Pick<PartieSortie, 'famille' | 'nom' | 'prenom'>, d: Pick<DonneesValidationSortie, 'adresse' | 'date' | 'compteRendu' | 'vacant' | 'copropriete'>): string[] {
  const date = dateFrPreavis(d.date);
  const cr = paragraphesLibres(d.compteRendu);
  const compteRendu = cr.length > 0 ? ['Compte rendu de l’état des lieux de sortie :', ...cr] : [];
  if (p.famille === 'locataire') {
    return [`Bonjour ${prenomNom(p)},`,
      `L’état des lieux de sortie de votre logement situé ${d.adresse} a été réalisé le ${date}. Votre sortie du logement est enregistrée à cette date.`,
      ...compteRendu, ...paragrapheCopropriete(d.copropriete, 'sortie'),
      'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'];
  }
  return [`Bonjour ${prenomNom(p)},`,
    `L’état des lieux de sortie de votre bien situé ${d.adresse} a été réalisé le ${date}.${d.vacant ? ' Le logement est désormais libre de toute occupation.' : ''}`,
    ...compteRendu, 'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'];
}

/** Le mail d'UNE partie : elle seule en destinataire, aucune copie. `null` : pas d'adresse e-mail. PUR. */
export function mailDeLaPartie(p: PartieSortie, d: DonneesValidationSortie): MailAvis | null {
  const a = adressesUniques(p.emails);
  if (a.length === 0) return null;
  const c = composerMailLocation(paragraphesPour(p, d), d.qui, d.signature);
  return { sorte: p.famille === 'locataire' ? 'sortie_edls_locataire' : 'sortie_edls_proprietaire', de: d.expediteur, a, cc: [], objet: objetValidationSortie(d.adresse), texte: c.texte, html: c.html };
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
  ], d.qui, d.signature);
  return { sorte: 'sortie_edls_interne', de: d.expediteur, a, cc: [], objet: `${PREFIXE_COPIE_INTERNE_SORTIE}${objetValidationSortie(d.adresse)}`, texte: c.texte, html: c.html };
}

/** Tous les mails de la validation, dans l'ordre : LOCATAIRES, PROPRIÉTAIRES, puis la copie interne. PUR. */
export function mailsValidationSortie(d: DonneesValidationSortie): { parties: { partie: PartieSortie; mail: MailAvis }[]; interne: MailAvis | null; sansEmail: string[] } {
  const ordre = [...d.destinataires.filter((p) => p.famille === 'locataire'), ...d.destinataires.filter((p) => p.famille === 'proprietaire')];
  const parties = ordre.map((p) => ({ partie: p, mail: mailDeLaPartie(p, d) })).filter((x): x is { partie: PartieSortie; mail: MailAvis } => x.mail !== null);
  return { parties, interne: copieInterneSortie(d, parties), sansEmail: ordre.filter((p) => adressesUniques(p.emails).length === 0).map(prenomNom) };
}

/** Les alertes du compte rendu, par destinataire coché : vide = rien à corriger. PUR. */
export function alertesDuCompteRendu(compteRendu: string, destinataires: readonly PartieSortie[], parties: readonly PartieSortie[]): { cle: string; libelle: string; tiers: TiersDansLeTexte[]; phrase: string }[] {
  return destinataires.map((p) => ({ p, tiers: coordonneesDeTiers(compteRendu, p, parties) })).filter((x) => x.tiers.length > 0)
    .map(({ p, tiers }) => ({ cle: p.cle, libelle: prenomNom(p), tiers, phrase: phraseAlerte(tiers) }));
}
