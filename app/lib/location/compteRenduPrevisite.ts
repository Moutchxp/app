/**
 * ══ 🔴🔴 LE COMPTE RENDU DE PRÉ-VISITE, EN LECTURE (Arno, 13/11/2026) — MODULE PUR ═══════════════════════════════════════════════════════════
 * « Voir le compte rendu » (case « 2 Pré-visite », pré-visite effectuée) : le texte tel qu'enregistré, qui l'a saisi et quand, les pièces
 * jointes, et l'envoi par mail — pour CHAQUE destinataire : son nom, sa famille (locataire / propriétaire / interne), la date et l'heure, l'état
 * (envoyé / échec / non envoyé). Tout vient du JOURNAL DES ENVOIS (`gestion_location_mail_avis`, sorte `previsite_compte_rendu`) : rien n'est
 * recalculé, rien n'est écrit. 🔴 CONFIDENTIALITÉ : aucune adresse de client n'est rendue — un destinataire se dit par son NOM ; une adresse
 * qu'aucune fiche ne reconnaît est MASQUÉE (« j…@exemple.fr »). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export type FamilleDestinataire = 'locataire' | 'proprietaire' | 'interne' | 'autre';
export type EtatEnvoiCr = 'envoye' | 'echec' | 'non_envoye';
export interface DestinataireCr { nom: string; famille: FamilleDestinataire; quand: string | null; etat: EtatEnvoiCr; motif: string | null }
export interface PieceCr { id: number; nom: string; taille: number;
  /** 🔴 (9e retour) la durée d'une prise, lue dans le brouillon envoyé (barre de lecture) */
  dureeS?: number }
/** 🔴 Arno (15/11/2026, 9e retour) — qui était présent (locataires : leurs occupations ; personnes ajoutées, avec leur note INTERNE). */
export interface PresencesCr { occupations: number[]; personnes: { civilite: string; nom: string; prenom: string; note: string }[];
  /** 🔴 (15/11/2026) les locataires présents, nommés (civilité, prénom, nom) — ceux de CE préavis seulement */
  locataires?: { occupationId: number; civilite: string | null; prenom: string | null; nom: string }[];
  /** 🔴 (15/11/2026, retours sur la fenêtre) « texte » : RECONSTITUÉES depuis la phrase « En présence de … » du mail envoyé (rien d'enregistré) */
  source?: 'texte';
  /** 🔴 (16/11/2026) « Absence de la partie locataire » : les locataires étaient absents ; `par` : le collaborateur qui a réalisé la pré-visite */
  absence?: { par: string | null } }
export interface CompteRenduAffiche {
  /** Le texte du compte rendu, tel qu'enregistré (le mail interne) ; null : aucun compte rendu saisi. */
  texte: string | null; objet: string | null; saisiPar: string | null; saisiLe: string | null;
  pieces: PieceCr[]; destinataires: DestinataireCr[];
  /** Aucun mail n'est parti (aucun envoi réussi). */
  aucunEnvoi: boolean;
  /** 🔴 Arno (13/11/2026, lot C) — les vocaux du compte rendu : INTERNES, écoutables ici, jamais envoyés. */
  vocaux?: PieceCr[];
  /** 🔴 Arno (15/11/2026) — les FICHIERS VOCAUX du dictaphone (nom, prises dans l'ordre), en lecture seule. */
  fichiersVocaux?: { nom: string; prises: PieceCr[]; locataires?: boolean }[];
  /** 🔴 Arno (15/11/2026, 9e retour) — les présences et les notes internes, lues dans le brouillon marqué « envoyé » ; null : inconnues */
  presences?: PresencesCr | null;
  /** 🔴 (15/11/2026) le TEXTE saisi seul (sans en-tête, présence, pièces, signature ni « Mail envoyé par »), lu dans le brouillon envoyé */
  corps?: string | null;
}

/** Une ligne du journal des envois (sorte `previsite_compte_rendu`). */
export interface EnvoiJournalCr { destinataires: string[]; copies: string[]; objet: string; texte: string; statut: 'envoye' | 'echec'; erreur: string | null;
  envoyeLe: string; auteur: string; pieceIds: number[] }
export interface AnnuaireCr {
  locataires: readonly { nom: string; prenom: string | null; emails: readonly string[] }[];
  proprietaires: readonly { nom: string; emails: readonly string[] }[];
  /** Les comptes de l'agence (nom affiché, identifiant de connexion = adresse). */
  internes: readonly { nom: string; email: string }[];
  /** Les domaines de l'agence : une adresse inconnue de ces domaines reste « interne », lisible. */
  domainesAgence: readonly string[];
}

const norm = (x: string): string => x.trim().toLowerCase();
const nomComplet = (p: { nom: string; prenom?: string | null }): string => [p.prenom ?? '', p.nom].map((x) => x.trim()).filter(Boolean).join(' ');

/** « j…@exemple.fr » : une adresse sans fiche, jamais lisible en entier. PUR. */
export function adresseMasquee(a: string): string {
  const [l, d] = a.trim().split('@');
  return d === undefined ? '…' : `${(l ?? '').slice(0, 1)}…@${d}`;
}

/** Qui est cette adresse : son nom et sa famille. PUR. */
export function identifier(adresse: string, a: AnnuaireCr): { nom: string; famille: FamilleDestinataire; cle: string } {
  const x = norm(adresse);
  const loc = a.locataires.find((l) => l.emails.some((e) => norm(e) === x));
  if (loc) return { nom: nomComplet(loc), famille: 'locataire', cle: `locataire:${nomComplet(loc)}` };
  const pro = a.proprietaires.find((p) => p.emails.some((e) => norm(e) === x));
  if (pro) return { nom: pro.nom, famille: 'proprietaire', cle: `proprietaire:${pro.nom}` };
  const int = a.internes.find((i) => norm(i.email) === x);
  if (int) return { nom: int.nom, famille: 'interne', cle: `interne:${x}` };
  const domaine = x.split('@')[1] ?? '';
  if (a.domainesAgence.map(norm).includes(domaine)) return { nom: adresse.trim(), famille: 'interne', cle: `interne:${x}` };
  return { nom: adresseMasquee(adresse), famille: 'autre', cle: `autre:${x}` };
}

/**
 * Le compte rendu affiché, depuis le journal des envois. Le texte : celui du mail INTERNE (aucun locataire parmi ses destinataires), sinon le
 * premier ; qui / quand : le suivi de la pré-visite (« effectuée par … le … »), sinon le premier envoi. Les locataires du préavis qu'aucun mail
 * n'a atteints : « non envoyé ». Ordre : par famille (locataires, propriétaires, interne, autres), puis par nom. PUR.
 */
export function compteRenduAffiche(envois: readonly EnvoiJournalCr[], a: AnnuaireCr, suivi: { effectueeLe: string | null; effectueePar: string | null },
  pieces: readonly PieceCr[] = []): CompteRenduAffiche {
  const tries = [...envois].sort((x, y) => x.envoyeLe.localeCompare(y.envoyeLe));
  const estLocataire = (adr: string) => identifier(adr, a).famille === 'locataire';
  // 🔴 (16/11/2026) le mail INTERNE : ni locataire ni propriétaire parmi ses destinataires (les mails aux propriétaires ont la même sorte)
  const estExterieur = (adr: string) => ['locataire', 'proprietaire'].includes(identifier(adr, a).famille);
  const interne = tries.find((m) => !m.destinataires.some(estExterieur)) ?? tries.find((m) => !m.destinataires.some(estLocataire)) ?? tries[0] ?? null;
  const vus = new Map<string, DestinataireCr>();
  for (const m of tries) {
    for (const adr of [...m.destinataires, ...m.copies]) {
      const q = identifier(adr, a);
      const avant = vus.get(q.cle);
      // un même destinataire, plusieurs envois : un envoi réussi l'emporte sur un échec ; à égalité, le plus récent
      if (avant !== undefined && avant.etat === 'envoye' && m.statut !== 'envoye') continue;
      vus.set(q.cle, { nom: q.nom, famille: q.famille, quand: m.envoyeLe, etat: m.statut === 'envoye' ? 'envoye' : 'echec', motif: m.statut === 'envoye' ? null : m.erreur });
    }
  }
  if (tries.length > 0) {
    for (const l of a.locataires) {
      const cle = `locataire:${nomComplet(l)}`;
      if (!vus.has(cle)) vus.set(cle, { nom: nomComplet(l), famille: 'locataire', quand: null, etat: 'non_envoye', motif: l.emails.length === 0 ? 'pas d’adresse e-mail' : null });
    }
  }
  const RANG: Record<FamilleDestinataire, number> = { locataire: 0, proprietaire: 1, interne: 2, autre: 3 };
  const destinataires = [...vus.values()].sort((x, y) => RANG[x.famille] - RANG[y.famille] || x.nom.localeCompare(y.nom, 'fr'));
  return {
    texte: interne?.texte ?? null, objet: interne?.objet ?? null,
    saisiPar: suivi.effectueePar ?? interne?.auteur ?? null, saisiLe: suivi.effectueeLe ?? interne?.envoyeLe ?? null,
    pieces: [...pieces], destinataires, aucunEnvoi: !tries.some((m) => m.statut === 'envoye'),
  };
}

/**
 * 🔴 Arno (15/11/2026, 11e retour) — « Saisi par » : le PRÉNOM et le NOM du collaborateur (« Arnaud JOREL »), jamais son adresse. Un libellé
 * qui est une adresse connue des comptes de l'agence est remplacé ; inconnu : tel quel. PUR.
 */
export function nomSaisisseur(libelle: string | null, comptes: readonly { identifiant: string; prenom: string | null; nom: string | null }[]): string | null {
  if (libelle === null) return null;
  const x = libelle.trim().toLowerCase();
  const c = comptes.find((k) => k.identifiant.trim().toLowerCase() === x);
  if (!c) return libelle;
  const nom = [(c.prenom ?? '').trim(), (c.nom ?? '').trim().toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');
  return nom === '' ? libelle : nom;
}

/* ══ 🔴🔴 Arno (15/11/2026, retours sur la fenêtre) — LES PRÉSENCES ENREGISTRÉES AVEC LE COMPTE RENDU, ET LE TEXTE SAISI SEUL ══════════════════
 * À l'envoi, les présences sont rangées au JOURNAL (en ajout seul, dans la transaction qui marque la pré-visite effectuée) : chaque personne avec
 * son RÔLE (locataire du préavis, avec son occupation ; ou personne présente, avec sa note interne). La fenêtre les relit là, quel que soit le
 * brouillon. Les envois d'avant le rôle (version 1 : les noms seuls) : le rôle se retrouve par le nom des locataires du préavis. Un compte rendu
 * envoyé sans aucune présence enregistrée : les noms tirés de la phrase « En présence de … » du mail, marqués « reconstitué depuis le texte »
 * (rien n'est écrit après coup). */
export const ACTION_JOURNAL_PRESENCES = 'location_previsite_presences';
type LocataireCr = { occupationId: number; civilite: string | null; prenom: string | null; nom: string };
/** Une personne présente telle qu'enregistrée au journal (version 2 : avec son rôle). */
export type PresentJournal = { role: 'locataire'; occupationId: number; civilite: string | null; prenom: string | null; nom: string }
  | { role: 'personne'; civilite: string | null; prenom: string | null; nom: string; note?: string | null };
/** Ce qui est rangé au journal à l'envoi. PUR. */
export function tracePresences(phrase: string, presents: readonly PresentJournal[], absence?: { par: string | null } | null): string {
  return JSON.stringify({ v: 2, phrase, presents, ...(absence ? { absence: { par: absence.par } } : {}) });
}

const cleNom = (p: { civilite?: string | null; prenom: string | null; nom: string }): string => nomPresentCr(p).replace(/\s+/g, ' ').trim().toLowerCase();
/** Même rendu que `nomPresent` (texteCompteRendu) — dupliqué ici pour garder ce module sans import. */
function nomPresentCr(p: { civilite?: string | null; prenom: string | null; nom: string }): string {
  const nom = p.nom.replace(/\s+/g, ' ').trim();
  const prenom = (p.prenom ?? '').replace(/\s+/g, ' ').trim();
  const complet = prenom !== '' && !nom.toLowerCase().includes(prenom.toLowerCase()) ? `${prenom} ${nom}` : nom;
  const c = (p.civilite ?? '').trim().toLowerCase().replace(/\.$/, '');
  const civ = ['madame', 'mme', 'mlle', 'mademoiselle'].includes(c) ? 'Mme' : ['monsieur', 'm', 'mr'].includes(c) ? 'M.' : '';
  return [civ, complet].filter(Boolean).join(' ');
}

/** Les présences relues dans le journal (versions 1 et 2), bornées aux locataires de CE préavis ; illisible : null. PUR. */
export function presencesDuJournal(valeur: string | null, locataires: readonly LocataireCr[]): PresencesCr | null {
  let o: { v?: unknown; presents?: unknown; absence?: unknown };
  try { o = JSON.parse(valeur ?? '') as typeof o; } catch { return null; }
  if (o === null || typeof o !== 'object' || !Array.isArray(o.presents)) return null;
  const r: PresencesCr = { occupations: [], personnes: [], locataires: [] };
  if (o.absence !== null && typeof o.absence === 'object') {
    const par = (o.absence as { par?: unknown }).par;
    r.absence = { par: typeof par === 'string' && par.trim() !== '' ? par.trim() : null };
  }
  for (const brut of o.presents as Record<string, unknown>[]) {
    if (brut === null || typeof brut !== 'object' || typeof brut.nom !== 'string') continue;
    const p = { civilite: typeof brut.civilite === 'string' ? brut.civilite : null, prenom: typeof brut.prenom === 'string' ? brut.prenom : null, nom: brut.nom,
      note: typeof brut.note === 'string' ? brut.note : '' };
    // version 2 : le rôle et l'occupation enregistrés ; version 1 : le locataire du préavis qui porte ce nom
    const loc = o.v === 2
      ? (brut.role === 'locataire' ? locataires.find((l) => l.occupationId === Number(brut.occupationId)) : undefined)
      : locataires.find((l) => cleNom(l) === cleNom(p));
    if (loc !== undefined && !r.occupations.includes(loc.occupationId)) { r.occupations.push(loc.occupationId); r.locataires!.push({ ...loc }); continue; }
    if (o.v === 2 && brut.role === 'locataire') continue; // un locataire qui n'est plus de ce préavis : jamais rendu
    r.personnes.push({ civilite: p.civilite ?? '', prenom: p.prenom ?? '', nom: p.nom, note: p.note });
  }
  return r;
}

const RE_ABSENCE = /^Pré-visite réalisée en l’absence des locataires/;
const paragraphesDuMail = (texte: string | null): string[] => (texte ?? '').replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((x) => x.trim());
/** Les noms de la phrase « En présence de Mme X, M. Y et de Mme Z. » (le premier paragraphe qui commence ainsi) ; aucune phrase : []. PUR. */
export function nomsDeLaPhrase(texte: string | null): string[] {
  const p = (texte ?? '').replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((x) => x.trim()).find((x) => /^En présence (de |d’|d')/.test(x));
  if (p === undefined) return [];
  const s = p.replace(/^En présence /, '').replace(/\.$/, '');
  const i = s.lastIndexOf(' et ');
  const parts = i < 0 ? [s] : [...s.slice(0, i).split(', '), s.slice(i + 4)];
  const sansDe = (x: string): string => x.replace(/^(de |d’|d')/, '');
  return parts.map((x, k) => (k === 0 || k === parts.length - 1 ? sansDe(x) : x).trim()).filter((x) => x !== '');
}

/** Les présences RECONSTITUÉES depuis le texte du mail (un nom de locataire du préavis : locataire ; sinon : personne présente). PUR. */
export function presencesDuTexte(texte: string | null, locataires: readonly LocataireCr[]): PresencesCr | null {
  // 🔴 (16/11/2026) la phrase de l'ABSENCE : « Pré-visite réalisée en l’absence des locataires, par X (agence)[, en présence de …]. »
  const abs = paragraphesDuMail(texte).find((x) => RE_ABSENCE.test(x));
  if (abs !== undefined) {
    const par = /, par (.+?) \(/.exec(abs)?.[1]?.trim() ?? null;
    const i = abs.indexOf(', en présence ');
    const noms = i < 0 ? [] : nomsDeLaPhrase(`En présence ${abs.slice(i + ', en présence '.length)}`);
    return { occupations: [], locataires: [], personnes: noms.map((n) => ({ civilite: '', prenom: '', nom: n, note: '' })), source: 'texte', absence: { par } };
  }
  const noms = nomsDeLaPhrase(texte);
  if (noms.length === 0) return null;
  const r: PresencesCr = { occupations: [], personnes: [], locataires: [], source: 'texte' };
  for (const n of noms) {
    const loc = locataires.find((l) => cleNom(l) === n.toLowerCase());
    if (loc !== undefined && !r.occupations.includes(loc.occupationId)) { r.occupations.push(loc.occupationId); r.locataires!.push({ ...loc }); }
    else r.personnes.push({ civilite: '', prenom: '', nom: n, note: '' });
  }
  return r;
}

const TITRES_GENERES = ['Photos', 'Enregistrements vocaux joints', 'Notes de présence (internes)'];
/**
 * Le TEXTE SAISI seul, retrouvé dans le mail interne envoyé : sans la ligne d'en-tête « Compte rendu de la pré-visite du … — adresse », sans la
 * phrase « En présence de … », et rien à partir des parties générées (photos, vocaux joints, notes de présence, « Mail envoyé par … », signature).
 * Le mail lui-même n'est jamais modifié. PUR.
 */
export function texteSaisiDuMail(texte: string | null): string {
  // « Mail envoyé par … » et la signature (« -- ») : tout ce qui suit est généré, même sans ligne vide avant
  const paras = (texte ?? '').replace(/\r\n/g, '\n').split(/\n[ \t]*(?:Mail envoyé par |-- ?\n)/)[0].split(/\n[ \t]*\n/);
  let i = 0;
  if (/^Compte rendu de la pré-visite du /.test((paras[i] ?? '').trim())) i += 1;
  if (/^En présence (de |d’|d')/.test((paras[i] ?? '').trim()) || RE_ABSENCE.test((paras[i] ?? '').trim())) i += 1;
  const garde: string[] = [];
  for (const p of paras.slice(i)) {
    const t = p.trim();
    if (TITRES_GENERES.includes(t) || /^Mail envoyé par /.test(t) || /^--\s*(\n|$)/.test(t)) break;
    garde.push(p.replace(/^\n+|\s+$/g, ''));
  }
  return garde.filter((p) => p.trim() !== '').join('\n\n');
}

/** « le 13/11/2026 à 13h52 » (heure de Paris). PUR. */
export function quandFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const v = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `le ${v('day')}/${v('month')}/${v('year')} à ${v('hour')}h${v('minute')}`;
}

export const LIBELLE_FAMILLE_CR: Record<FamilleDestinataire, string> = { locataire: 'Locataire', proprietaire: 'Propriétaire', interne: 'Interne', autre: 'Autre' };
export const LIBELLE_ETAT_CR: Record<EtatEnvoiCr, string> = { envoye: 'envoyé', echec: 'échec', non_envoye: 'non envoyé' };
export const AUCUN_ENVOI_CR = 'Compte rendu conservé en interne — aucun mail envoyé';
export const AUCUN_CR = 'Aucun compte rendu saisi';
