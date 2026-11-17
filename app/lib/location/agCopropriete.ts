/**
 * ══ 🔴🔴 LES ASSEMBLÉES GÉNÉRALES D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, migration 475). MODULE PUR. ═══════════════════════════════════════════
 *
 * Les AG appartiennent à la COPROPRIÉTÉ (le syndicat des copropriétaires, `gestion_copropriete`), jamais au syndic : un changement de syndic
 * ne fait rien perdre. Une copropriété peut couvrir plusieurs adresses : elles partagent ses AG. L'historique s'écrit en AJOUT SEUL : la
 * valeur « en cours » est la plus récente saisie de son type.
 *
 * « Valider la sortie », case « Retenue de 20 % » cochée (et seulement alors) :
 *   a) « Dernière assemblée générale connue » — préremplie avec la dernière AG tenue (« saisie par … le … »), « Confirmer cette date comme
 *      référence », modifiable ; vide si rien n'est connu ;
 *   b) « Prochaine assemblée générale » — la prochaine AG OFFICIELLE à venir si elle existe (statut officielle, avec qui l'a saisie), sinon
 *      dernière AG + 1 an (« projection — généralement à la même période chaque année ») ; statut OBLIGATOIRE : « Date projetée » ou « Date
 *      officielle », aucun présélectionné (sauf l'officielle déjà connue) ;
 *   c) rien ne part tant que la dernière AG est vide, ou que la prochaine n'a pas de date ET de statut.
 * ⚠️ AUCUN IMPORT.
 */

export type TypeAg = 'derniere' | 'prochaine';
export type StatutAg = 'officielle' | 'projetee';
export type OrigineAg = 'reprise' | 'sortie' | 'fiche_bien' | 'creation_bien' | 'fiche_copropriete';
/** 🔴 (Arno, 17/11/2026, migration 481) AGO : l'assemblée ordinaire, qui clôture les comptes ; AGE : extraordinaire (un PV seulement). */
export type NatureAg = 'ago' | 'age';

/** Une entrée de l'historique, telle que lue. */
export interface EntreeAg {
  id: number;
  type: TypeAg;
  statut: StatutAg;
  /** AAAA-MM-JJ ; `null` : la date a été retirée (champ vidé sur la fiche du bien) */
  date: string | null;
  confirmation: boolean;
  origine: OrigineAg;
  /** ISO */
  saisieLe: string;
  saisiePar: string;
  sortieId: number | null;
  /** `true` : saisie pour un bien relié à aucune copropriété, et sa clé n'en est toujours pas une */
  aRattacher: boolean;
  /** 🔴 (481) AGO / AGE ; avant la 481 (ou absente) : AGO */
  nature?: NatureAg;
  /** 🔴 (481) la note facultative du PV */
  note?: string | null;
  /** 🔴 (481) « Corriger » : ce que cette entrée a CORRIGÉ (la ligne d'avant reste en base, intacte) */
  corrige?: { id: number; date: string | null; nature: NatureAg; note: string | null } | null;
}

export const LIBELLE_TYPE_AG: Record<TypeAg, string> = { derniere: 'Dernière AG tenue', prochaine: 'Prochaine AG' };
export const LIBELLE_STATUT_AG: Record<StatutAg, string> = { officielle: 'officielle', projetee: 'projetée' };
export const LIBELLE_ORIGINE_AG: Record<OrigineAg, string> = { reprise: 'reprise (ancienne saisie)', sortie: 'sortie', fiche_bien: 'fiche du bien', creation_bien: 'création du bien',
  fiche_copropriete: 'fiche copropriété' };
export const LIBELLE_NATURE_AG: Record<NatureAg, string> = { ago: 'AGO (assemblée générale ordinaire)', age: 'AGE (assemblée générale extraordinaire)' };
export const SIGLE_NATURE_AG: Record<NatureAg, string> = { ago: 'AGO', age: 'AGE' };
export const natureDe = (e: Pick<EntreeAg, 'nature'>): NatureAg => (e.nature === 'age' ? 'age' : 'ago');
export const MENTION_PROJECTION = 'projection — généralement à la même période chaque année';
export const A_RATTACHER = 'à rattacher à une copropriété';
export const TITRE_BLOC_AG = 'AG de la copropriété';

const recentes = (e: readonly EntreeAg[]): EntreeAg[] => [...e].sort((a, b) => b.saisieLe.localeCompare(a.saisieLe) || b.id - a.id);

/** La dernière AG TENUE en cours : la plus récente saisie « dernière » (sa date peut avoir été retirée : `null`). PUR. */
export function derniereAgTenue(entrees: readonly EntreeAg[]): EntreeAg | null {
  const d = recentes(entrees).find((e) => e.type === 'derniere');
  return d === undefined || d.date === null ? null : d;
}

/** La prochaine AG OFFICIELLE À VENIR (date ≥ aujourd'hui), la plus récemment saisie ; sinon `null`. PUR. */
export function prochaineAgOfficielle(entrees: readonly EntreeAg[], aujourdhui: string): EntreeAg | null {
  return recentes(entrees).find((e) => e.type === 'prochaine' && e.statut === 'officielle' && e.date !== null && e.date >= aujourdhui) ?? null;
}

/** La date + 1 an (le 29 février devient le 28). PUR. */
export function unAnApres(jour: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (m === null) return null;
  const a = Number(m[1]) + 1; const mo = Number(m[2]); let j = Number(m[3]);
  const dernierDuMois = new Date(Date.UTC(a, mo, 0)).getUTCDate();
  if (j > dernierDuMois) j = dernierDuMois;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « mars 2027 ». PUR. */
export function moisAnnee(jour: string): string {
  const [a, m] = jour.split('-').map(Number);
  return `${MOIS[(m || 1) - 1]} ${a}`;
}
/** « 12/03/2026 ». PUR. */
export const dateFr = (jour: string): string => { const [a, m, j] = jour.split('-'); return `${j}/${m}/${a}`; };
/** « 12/03/2026 » d'un horodatage ISO, à Paris. PUR. */
export const jourFrDe = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

/** Ce que la fenêtre propose au départ. PUR. */
export interface PropositionAg {
  derniere: { date: string; par: string; le: string } | null;
  prochaine: { date: string; statut: StatutAg | null; mention: string | null; par: string | null; le: string | null } | null;
}
export function propositionAg(entrees: readonly EntreeAg[], aujourdhui: string): PropositionAg {
  const d = derniereAgTenue(entrees);
  const o = prochaineAgOfficielle(entrees, aujourdhui);
  const derniere = d === null ? null : { date: d.date as string, par: d.saisiePar, le: d.saisieLe };
  if (o !== null) return { derniere, prochaine: { date: o.date as string, statut: 'officielle', mention: null, par: o.saisiePar, le: o.saisieLe } };
  const p = derniere === null ? null : unAnApres(derniere.date);
  return { derniere, prochaine: p === null ? null : { date: p, statut: null, mention: MENTION_PROJECTION, par: null, le: null } };
}

/** La saisie de la fenêtre. */
export interface SaisieAg { derniere: string; derniereConfirmee: boolean; prochaine: string; statut: StatutAg | null }
export type ChampAg = 'derniere' | 'prochaine' | 'statut';
export const MOTIF_AG_DERNIERE = 'Renseignez la date de la dernière assemblée générale connue.';
export const MOTIF_AG_PROCHAINE = 'Renseignez la date de la prochaine assemblée générale.';
export const MOTIF_AG_STATUT = 'Choisissez le statut de la prochaine assemblée générale : « Date projetée » ou « Date officielle ».';

const estJour = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  && (() => { const [a, m, j] = x.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, j)); return a >= 1900 && d.getUTCMonth() === m - 1 && d.getUTCDate() === j; })();

/** Le contrôle (la fenêtre et le serveur) : les champs en défaut, et le motif du premier. PUR. */
export function verifierSaisieAg(s: { derniere?: unknown; prochaine?: unknown; statut?: unknown }): { ok: true } | { ok: false; motif: string; champs: ChampAg[] } {
  const champs: ChampAg[] = [];
  if (!estJour(s.derniere)) champs.push('derniere');
  if (!estJour(s.prochaine)) champs.push('prochaine');
  if (s.statut !== 'officielle' && s.statut !== 'projetee') champs.push('statut');
  if (champs.length === 0 && (s.prochaine as string) <= (s.derniere as string)) {
    return { ok: false, motif: 'La prochaine assemblée générale doit être après la dernière.', champs: ['prochaine'] };
  }
  if (champs.length === 0) return { ok: true };
  const motif = champs[0] === 'derniere' ? MOTIF_AG_DERNIERE : champs[0] === 'prochaine' ? MOTIF_AG_PROCHAINE : MOTIF_AG_STATUT;
  return { ok: false, motif, champs };
}

/** La saisie propre (après `verifierSaisieAg`) : `null` si elle ne tient pas. PUR. */
export function saisieAgPropre(brut: unknown): SaisieAg | null {
  const o = (brut ?? {}) as Record<string, unknown>;
  const v = verifierSaisieAg(o);
  if (!v.ok) return null;
  return { derniere: o.derniere as string, derniereConfirmee: o.derniereConfirmee === true, prochaine: o.prochaine as string, statut: o.statut as StatutAg };
}

/**
 * Les entrées à AJOUTER à l'historique à la confirmation de la sortie : la dernière AG si elle a été saisie, modifiée ou confirmée comme
 * référence ; la prochaine AG (officielle : sur la copropriété, pour tous ses biens ; projetée : avec la sortie, montrée comme projection),
 * sauf si elle est exactement l'officielle déjà connue. PUR.
 */
export function entreesAAjouter(s: SaisieAg, connue: PropositionAg): { type: TypeAg; statut: StatutAg; date: string; confirmation: boolean }[] {
  const out: { type: TypeAg; statut: StatutAg; date: string; confirmation: boolean }[] = [];
  const memeDerniere = connue.derniere !== null && connue.derniere.date === s.derniere;
  if (!memeDerniere) out.push({ type: 'derniere', statut: 'officielle', date: s.derniere, confirmation: false });
  else if (s.derniereConfirmee) out.push({ type: 'derniere', statut: 'officielle', date: s.derniere, confirmation: true });
  const dejaOfficielle = connue.prochaine !== null && connue.prochaine.statut === 'officielle' && connue.prochaine.date === s.prochaine && s.statut === 'officielle';
  if (!dejaOfficielle) out.push({ type: 'prochaine', statut: s.statut as StatutAg, date: s.prochaine, confirmation: false });
  return out;
}

/** « Dernière AG : 12/03/2026 » / « Prochaine AG : 12/03/2027 (projetée) » : les deux lignes du récapitulatif et des mails internes. PUR. */
export function lignesAg(s: Pick<SaisieAg, 'derniere' | 'prochaine' | 'statut'>): [string, string][] {
  return [['Dernière assemblée générale', dateFr(s.derniere)],
    ['Prochaine assemblée générale', `${dateFr(s.prochaine)} (${s.statut === null ? 'statut à choisir' : `date ${LIBELLE_STATUT_AG[s.statut]}`})`]];
}

// ── Le paragraphe « 20 % » : la mention de la prochaine AG (proposée, modifiable) ──────────────────────────────────────────────────────

const ANCRE_LOCATAIRE = 'couvrant votre période d’occupation';
const ANCRE_PROPRIETAIRE = 'jusqu’à l’approbation des comptes de la copropriété';
/** « , prévue en principe lors de l’assemblée générale de mars 2027 » */
export const mentionAg = (jour: string): string => `, prévue en principe lors de l’assemblée générale de ${moisAnnee(jour)}`;
const RE_MENTION = /, prévue en principe lors de l’assemblée générale de [a-zéû]+ \d{4}/g;

/** Le texte SANS mention de l'AG (pour la retirer, ou la remplacer). PUR. */
export const sansMentionAg = (texte: string): string => texte.replace(RE_MENTION, '');

/**
 * Le paragraphe des LOCATAIRES avec la mention de la prochaine AG, juste après « … couvrant votre période d’occupation » (sinon après la
 * première « approbation … des comptes … » ; à défaut, rien n'est changé). Une mention déjà présente est remplacée. PUR.
 */
export function avecMentionAgLocataire(texte: string, jour: string): string {
  const t = sansMentionAg(texte);
  const i = t.indexOf(ANCRE_LOCATAIRE);
  if (i >= 0) return `${t.slice(0, i + ANCRE_LOCATAIRE.length)}${mentionAg(jour)}${t.slice(i + ANCRE_LOCATAIRE.length)}`;
  const m = /approbation[^.]*?comptes[^.,]*/.exec(t);
  return m === null ? t : `${t.slice(0, m.index + m[0].length)}${mentionAg(jour)}${t.slice(m.index + m[0].length)}`;
}
/** La phrase des PROPRIÉTAIRES avec la même mention. PUR. */
export function avecMentionAgProprietaire(phrase: string, jour: string): string {
  const t = sansMentionAg(phrase);
  const i = t.indexOf(ANCRE_PROPRIETAIRE);
  return i < 0 ? t : `${t.slice(0, i + ANCRE_PROPRIETAIRE.length)}${mentionAg(jour)}${t.slice(i + ANCRE_PROPRIETAIRE.length)}`;
}

/** La ligne d'une entrée sur la fiche : « 12/03/2027 — prochaine AG, projetée — saisie par Arnaud JOREL le 16/11/2026 (sortie n° 12) ». PUR. */
export function ligneEntreeAg(e: EntreeAg): string {
  const quoi = e.type === 'derniere' ? `dernière AG tenue (${SIGLE_NATURE_AG[natureDe(e)]})` : `prochaine AG, ${LIBELLE_STATUT_AG[e.statut]}`;
  const date = e.date === null ? 'date retirée' : dateFr(e.date);
  const ou = e.origine === 'sortie' && e.sortieId !== null ? `sortie n° ${e.sortieId}` : LIBELLE_ORIGINE_AG[e.origine];
  return `${date} — ${quoi}${e.confirmation ? ' (confirmée comme référence)' : ''} — saisie par ${e.saisiePar} le ${jourFrDe(e.saisieLe)} (${ou})${e.aRattacher ? ` — ${A_RATTACHER}` : ''}${e.corrige ? ` — ${traceCorrection(e.corrige)}` : ''}`;
}

// ── 🔴🔴 LES PV D'AG DE LA FICHE COPROPRIÉTÉ (Arno, 17/11/2026, migration 481) ─────────────────────────────────────────────────────────────
// Demande d'Arno : « Ajoute « + Ajouter un PV d'AG » : date du PV (obligatoire), type obligatoire « AGO (assemblée générale ordinaire) » ou
// « AGE (assemblée générale extraordinaire) », note facultative. Dans cette fiche, on ne saisit QUE des dates OFFICIELLES de PV (aucune date
// projetée). Historique des PV du plus récent au plus ancien, avec le type, l'auteur et la date de saisie ; modifier une erreur se fait par
// « Corriger » (avec trace), sans jamais effacer. »

/** « corrige l'entrée d'avant : 12/03/2015, AGO » : la trace d'une correction. PUR. */
export function traceCorrection(c: NonNullable<EntreeAg['corrige']>): string {
  return `corrige la saisie d’avant : ${c.date === null ? 'date retirée' : dateFr(c.date)}, ${SIGLE_NATURE_AG[c.nature]}${c.note ? `, note « ${c.note} »` : ''}`;
}

/** Les PV (dernières AG tenues, datées), du plus RÉCENT au plus ancien (date du PV, puis saisie). PUR. */
export function pvsDeLaCopropriete(entrees: readonly EntreeAg[]): EntreeAg[] {
  return entrees.filter((e) => e.type === 'derniere' && e.date !== null)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string) || b.saisieLe.localeCompare(a.saisieLe) || b.id - a.id);
}

export interface SaisiePv { date: string; nature: NatureAg; note: string | null }
export type ChampPv = 'date' | 'nature' | 'note';
export const MOTIF_PV_DATE = 'Renseignez la date du PV.';
export const MOTIF_PV_FUTUR = 'Le PV d’une AG porte une date déjà passée (ou celle d’aujourd’hui) : une date à venir n’est pas un PV.';
export const MOTIF_PV_NATURE = 'Choisissez le type : AGO (assemblée générale ordinaire) ou AGE (assemblée générale extraordinaire).';
export const MOTIF_PV_NOTE = 'La note ne doit pas dépasser 500 caractères.';
export const NOTE_PV_MAX = 500;

/** Le contrôle d'un PV (la fiche et le serveur) : date valide et OFFICIELLE (passée ou du jour), type choisi, note bornée. PUR. */
export function verifierPv(s: { date?: unknown; nature?: unknown; note?: unknown }, aujourdhui: string): { ok: true; saisie: SaisiePv } | { ok: false; motif: string; champs: ChampPv[] } {
  const champs: ChampPv[] = [];
  let motif: string | null = null;
  if (!estJour(s.date)) { champs.push('date'); motif = MOTIF_PV_DATE; } else if ((s.date as string) > aujourdhui) { champs.push('date'); motif = MOTIF_PV_FUTUR; }
  if (s.nature !== 'ago' && s.nature !== 'age') { champs.push('nature'); motif ??= MOTIF_PV_NATURE; }
  const note = typeof s.note === 'string' ? s.note.replace(/\s+/g, ' ').trim() : '';
  if (note.length > NOTE_PV_MAX) { champs.push('note'); motif ??= MOTIF_PV_NOTE; }
  if (champs.length > 0) return { ok: false, motif: motif as string, champs };
  return { ok: true, saisie: { date: s.date as string, nature: s.nature as NatureAg, note: note === '' ? null : note } };
}
