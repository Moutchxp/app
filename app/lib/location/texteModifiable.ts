/**
 * ══ 🔴🔴 LE TEXTE D'UN MAIL, MODIFIABLE AVANT ENVOI, AVEC SES PARTIES PROTÉGÉES (décision d'Arno du 10/11/2026, option 1). MODULE PUR. ══════
 *
 * Un mail « à texte fixe » (accusé de préavis, départ, partenaires, pré-visite, invitations des tâches aux contacts extérieurs) se décrit
 * en PARTIES, dans l'ordre :
 *   · MODIFIABLES — la formule d'appel (« Bonjour … »), le paragraphe d'introduction, un paragraphe libre de conclusion (vide par défaut,
 *     avant la formule de politesse) et la formule de politesse. Seules ces quatre clés existent : toute autre est REFUSÉE ;
 *   · PROTÉGÉES — tout le reste (dates, adresse, dépôt de garantie et provision de 20 %, article de loi, copie de l'accusé, mention
 *     « Mail envoyé par … », signature, objet). Elles sont reconstruites par le SERVEUR à chaque envoi : on ne peut pas les remplacer.
 *
 * 🔴 LES REPÈRES PROTÉGÉS. Une partie modifiable peut contenir une donnée protégée (l'introduction de l'accusé porte l'adresse et la date de
 * réception) : elle y figure comme REPÈRE entre accolades (`{adresse}`, `{date de réception}`), que le serveur remplace lui-même par la
 * valeur du dossier. Un texte qui retire un repère de son modèle est REFUSÉ : la donnée ne peut ni disparaître ni être changée.
 * `{nom du locataire}` : chaque locataire reçoit SON mail, avec son nom (une seule modification, appliquée à chacun).
 *
 * Ce module est lu par le serveur (composition, envoi, contrôle) ET par l'écran (aperçu immédiat de l'éditeur) : le même code.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export const CLES_MODIFIABLES = ['appel', 'intro', 'conclusion', 'politesse'] as const;
export type CleModifiable = (typeof CLES_MODIFIABLES)[number];

/** Ce que la personne a changé : seulement les parties modifiables (absente = le texte proposé). */
export type Retouche = Partial<Record<CleModifiable, string>>;

/** Les retouches d'un envoi, par sorte de mail (« preavis_locataires », « tache_exterieur »…). */
export type Retouches = Record<string, Retouche>;

/** Les sortes dont le texte est modifiable, par récapitulatif (les routes refusent toute autre). */
export const SORTES_MODIFIABLES_PREAVIS = ['preavis_locataires', 'preavis_adhoc'] as const;
export const SORTES_MODIFIABLES_SORTIE = ['sortie_locataires', 'sortie_adhoc'] as const;
export const SORTES_MODIFIABLES_PREVISITE = ['previsite_locataires', 'previsite_locataires_modif'] as const;

export const LIBELLE_PARTIE: Record<CleModifiable, string> = {
  appel: 'Formule d’appel', intro: 'Introduction', conclusion: 'Paragraphe de conclusion (facultatif)', politesse: 'Formule de politesse',
};

/** Une partie du mail, dans l'ordre. Modifiable : `texte` est le MODÈLE (avec ses repères). Protégée : le texte tel qu'il part. */
export interface PartieTexte { cle: string; libelle: string; modifiable: boolean; texte: string }

/** Ce que l'éditeur reçoit pour UN mail : ses parties, les parties protégées qui suivent, et les valeurs des repères (premier destinataire). */
export interface EditionMail {
  /** La clé des retouches (la sorte du mail). Plusieurs mails de même clé (un par locataire) partagent la même modification. */
  cle: string;
  objet: string;
  parties: PartieTexte[];
  /** Après le corps : la mention « Mail envoyé par … », la signature, la copie de l'accusé… (protégées, affichées grisées). */
  suite: { libelle: string; texte: string }[];
  valeurs: Record<string, string>;
  /** Le texte a-t-il été modifié (par rapport au texte proposé) ? */
  modifie: boolean;
}

export const LONGUEUR_MAX_PARTIE = 5000;
const JETON = /\{([^{}\n]{1,60})\}/g;

/** Les repères `{…}` d'un texte, chacun une fois, dans l'ordre. PUR. */
export function reperesDe(texte: string): string[] {
  return [...new Set([...texte.matchAll(JETON)].map((m) => m[1]))];
}

/** Remplace les repères connus par leur valeur (un repère inconnu reste tel quel). PUR. */
export function remplirReperes(texte: string, valeurs: Readonly<Record<string, string>>): string {
  return texte.replace(JETON, (tout, nom: string) => (Object.prototype.hasOwnProperty.call(valeurs, nom) ? valeurs[nom] : tout));
}

const normaliser = (t: string): string => t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

/** Le texte retenu pour une partie : la retouche si elle existe (et que la partie est modifiable), sinon le modèle. PUR. */
export function texteDeLaPartie(p: PartieTexte, retouche: Retouche | null | undefined): string {
  if (!p.modifiable || retouche == null) return p.texte;
  const r = retouche[p.cle as CleModifiable];
  return r === undefined ? p.texte : normaliser(r);
}

/** Les paragraphes du corps, repères remplis ; une partie vide (conclusion par défaut, politesse effacée) disparaît. PUR. */
export function paragraphesDesParties(parties: readonly PartieTexte[], retouche: Retouche | null | undefined, valeurs: Readonly<Record<string, string>>): string[] {
  return parties.map((p) => remplirReperes(texteDeLaPartie(p, retouche), valeurs).trim()).filter((t) => t !== '');
}

/** La retouche change-t-elle le texte proposé ? (Même texte retapé à l'identique : non.) PUR. */
export function estModifie(parties: readonly PartieTexte[], retouche: Retouche | null | undefined): boolean {
  if (retouche == null) return false;
  return parties.some((p) => p.modifiable && retouche[p.cle as CleModifiable] !== undefined && normaliser(retouche[p.cle as CleModifiable] ?? '') !== normaliser(p.texte));
}

/**
 * 🔴 LE CONTRÔLE DU SERVEUR : chaque partie modifiable retouchée garde TOUS les repères de son modèle (une donnée protégée ne peut ni
 * disparaître ni être remplacée). `null` = accepté ; sinon, la raison. PUR.
 */
export function refusRetouche(parties: readonly PartieTexte[], retouche: Retouche | null | undefined): string | null {
  if (retouche == null) return null;
  for (const cle of Object.keys(retouche)) {
    const p = parties.find((x) => x.cle === cle);
    if (p === undefined || !p.modifiable) return `La partie « ${cle} » n’est pas modifiable dans ce mail.`;
    const texte = retouche[cle as CleModifiable] ?? '';
    for (const r of reperesDe(p.texte)) {
      if (!texte.includes(`{${r}}`)) return `« {${r}} » est une donnée protégée : elle doit rester dans « ${p.libelle} ».`;
    }
  }
  return null;
}

/**
 * 🔴 LE CONTRÔLE D'UN ENVOI : chaque retouche est vérifiée contre les parties du mail qui part sous sa clé ; une retouche d'un mail qui ne
 * part pas (case « Informer nos partenaires » décochée…) est sans objet. `null` = accepté. PUR.
 */
export function refusDesRetouches(editions: readonly (EditionMail | undefined)[], retouches: Retouches | undefined): string | null {
  for (const [cle, r] of Object.entries(retouches ?? {})) {
    const e = editions.find((x) => x?.cle === cle);
    if (e === undefined) continue;
    const refus = refusRetouche(e.parties, r);
    if (refus !== null) return refus;
  }
  return null;
}

/**
 * 🔴 LA LECTURE D'UNE REQUÊTE : `{ [sorte]: { appel?, intro?, conclusion?, politesse? } }`, sortes permises seulement ; toute autre clé
 * (« objet », « signature », une partie protégée…) est REFUSÉE, jamais ignorée en silence. Absent ou vide : aucune retouche. PUR.
 */
export function lireRetouches(brut: unknown, sortesPermises: readonly string[]): { ok: true; retouches: Retouches } | { ok: false; motif: string } {
  if (brut === undefined || brut === null) return { ok: true, retouches: {} };
  if (typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, motif: 'Texte modifié illisible.' };
  const retouches: Retouches = {};
  for (const [sorte, r] of Object.entries(brut as Record<string, unknown>)) {
    if (!sortesPermises.includes(sorte)) return { ok: false, motif: `Ce mail (« ${sorte} ») ne peut pas être modifié ici.` };
    if (r === null || typeof r !== 'object' || Array.isArray(r)) return { ok: false, motif: 'Texte modifié illisible.' };
    const retouche: Retouche = {};
    for (const [cle, v] of Object.entries(r as Record<string, unknown>)) {
      if (!(CLES_MODIFIABLES as readonly string[]).includes(cle)) return { ok: false, motif: `« ${cle} » est une partie protégée : elle ne peut pas être modifiée.` };
      if (typeof v !== 'string') return { ok: false, motif: 'Texte modifié illisible.' };
      if (v.length > LONGUEUR_MAX_PARTIE) return { ok: false, motif: `« ${LIBELLE_PARTIE[cle as CleModifiable]} » est trop long (${LONGUEUR_MAX_PARTIE} caractères au plus).` };
      retouche[cle as CleModifiable] = v;
    }
    if (Object.keys(retouche).length > 0) retouches[sorte] = retouche;
  }
  return { ok: true, retouches };
}

/** Les parties MODIFIABLES de base d'un mail (appel, introduction, conclusion vide, politesse), autour des parties protégées. PUR. */
export function partiesDuMail(o: { appel: string; intro: string; proteges: readonly { libelle: string; texte: string }[]; politesse: string;
  /** Protégées APRÈS la politesse (ex. « L'équipe gestion »). */
  apres?: readonly { libelle: string; texte: string }[] }): PartieTexte[] {
  return [
    { cle: 'appel', libelle: LIBELLE_PARTIE.appel, modifiable: true, texte: o.appel },
    { cle: 'intro', libelle: LIBELLE_PARTIE.intro, modifiable: true, texte: o.intro },
    ...o.proteges.filter((p) => p.texte.trim() !== '').map((p, i) => ({ cle: `protege_${i}`, libelle: p.libelle, modifiable: false, texte: p.texte })),
    { cle: 'conclusion', libelle: LIBELLE_PARTIE.conclusion, modifiable: true, texte: '' },
    { cle: 'politesse', libelle: LIBELLE_PARTIE.politesse, modifiable: true, texte: o.politesse },
    ...(o.apres ?? []).filter((p) => p.texte.trim() !== '').map((p, i) => ({ cle: `apres_${i}`, libelle: p.libelle, modifiable: false, texte: p.texte })),
  ];
}
