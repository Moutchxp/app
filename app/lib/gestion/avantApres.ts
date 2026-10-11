import { motStatutClassement } from './repereFenetre';
import type { Classement, Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — CE QUE MONTRENT LES DEUX COLONNES. Module PUR ══════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « colonne GAUCHE, titre “AVANT — suivi de fond” : biens suivis, statut et parties avant
 * le geste […] ; colonne DROITE, titre “APRÈS — ” suivi de “ce mail uniquement”, ou de “à partir de ce mail” pour ③ : le
 * nouveau rattachement ; dans chaque colonne, une ligne par bien (adresse, CP ville, lot). Côté droit, les biens retirés
 * sont barrés en rouge pâle et les biens ajoutés portent un “+” vert. »
 *
 * 🔴 UNE SEULE FONCTION POUR LES DEUX FENÊTRES (pastille « one shot » et « i » de l'accolade) : ce qu'on compare est
 * toujours un classement AVANT et un classement APRÈS ; seule leur source change.
 */

export interface BienColonne {
  cle: string;
  /** Le libellé enregistré — repli tant que la ligne « adresse, CP ville — lot » n'est pas lue. */
  libelle: string;
  /** Côté APRÈS seulement : `ajoute` (« + » vert), `retire` (barré rouge pâle), `null` (inchangé). */
  etat: 'ajoute' | 'retire' | null;
}
export interface Colonne {
  statut: string;
  biens: BienColonne[];
  /** « Nevine Abdellatif (locataire) »… */
  parties: string[];
}

export const TITRE_AVANT = 'AVANT — suivi de fond';
export const MENTION_RECALCULE = '(recalculé aujourd’hui)';
export const SUFFIXE_CE_MAIL = 'ce mail uniquement';
export const SUFFIXE_SUITE = 'à partir de ce mail';
export const titreApres = (suffixe: string): string => `APRÈS — ${suffixe}`;
export const PHRASE_SUITE = 'Les mails plus anciens ne changent pas.';

const roleMot = (s: 'proprietaire' | 'locataire'): string => (s === 'proprietaire' ? 'propriétaire' : 'locataire');
const parties = (c: Classement | null): string[] =>
  (c?.personnes ?? []).map((p) => `${p.libelle.trim()} (${roleMot(p.sorte)})`).filter((x) => x.trim() !== '()');

/**
 * La marque d'ÉCHANGE « Interne » est le repli quand rien ne couvre le mail (règle d'Arno du 04/10/2026) : un fond
 * sans fenêtre, ou « aucun bien », sur un échange marqué interne se lit « Interne ».
 */
function statutDe(c: Classement | null, interneEchange: boolean): string {
  if (c === null) return interneEchange ? 'Interne' : 'À classer — aucun suivi de conversation';
  return motStatutClassement(c, interneEchange);
}

/** LES DEUX COLONNES. PUR. */
export function colonnesAvantApres(o: {
  avant: Classement | null;
  interneEchangeAvant?: boolean;
  apres: Classement;
}): { avant: Colonne; apres: Colonne } {
  const ie = o.interneEchangeAvant === true;
  const biensAvant = o.avant?.sorte === 'biens' ? o.avant.biens : [];
  const biensApres = o.apres.sorte === 'biens' ? o.apres.biens : [];
  const clesAvant = new Set(biensAvant.map((b) => b.cle));
  const clesApres = new Set(biensApres.map((b) => b.cle));
  return {
    avant: {
      statut: statutDe(o.avant, ie),
      biens: biensAvant.map((b) => ({ cle: b.cle, libelle: b.libelle, etat: null })),
      parties: parties(o.avant),
    },
    apres: {
      statut: statutDe(o.apres, false),
      /* Les biens gardés puis ajoutés (dans l'ordre de l'après), puis les retirés, barrés : on voit d'abord ce qui est. */
      biens: [
        ...biensApres.map((b) => ({ cle: b.cle, libelle: b.libelle, etat: clesAvant.has(b.cle) ? null : 'ajoute' as const })),
        ...biensAvant.filter((b) => !clesApres.has(b.cle)).map((b) => ({ cle: b.cle, libelle: b.libelle, etat: 'retire' as const })),
      ],
      parties: parties(o.apres),
    },
  };
}

/**
 * L'AVANT ET L'APRÈS D'UNE PÉRIODE « LA SUITE ». PUR.
 * 🔴 L'« AVANT » EST LA FENÊTRE QUI COUVRAIT LE MAIL PRÉCÉDENT — la même règle que `comparatifRepere` (la dernière qui
 * commence strictement avant ce mail). `null` = rien ne couvrait le mail d'avant.
 */
export function classementsDuRepere(o: {
  mails: readonly number[]; periodes: readonly Periode[]; periodeId: number;
}): { avant: Classement | null; apres: Classement } | null {
  const rang = new Map(o.mails.map((m, i) => [m, i]));
  const moi = o.periodes.find((p) => p.id === o.periodeId);
  if (moi === undefined) return null;
  const r = rang.get(moi.depuisMessageId) ?? -1;
  const avant = o.periodes
    .filter((p) => p.id !== moi.id && (rang.get(p.depuisMessageId) ?? -1) >= 0 && (rang.get(p.depuisMessageId) as number) < r)
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number))
    .at(-1) ?? null;
  return { avant: avant?.classement ?? null, apres: moi.classement };
}

/** Le geste que la fenêtre explique : un avant, un après, qui, quand, et l'avant est-il une photo ou un recalcul. */
export interface GesteAvantApres {
  avant: Classement | null;
  interneEchangeAvant: boolean;
  apres: Classement;
  /** `true` = l'avant n'a pas été photographié au geste : recalculé aujourd'hui (mention discrète). */
  recalcule: boolean;
  par: string | null;
  le: string | null;
}

/** « 25 rue Edith Cavell, 92400 COURBEVOIE — lot 219 » : adresse, CP ville, lot (Arno). PUR. */
export function ligneDuBien(b: { cle: string; adresse: string | null; codePostal: string | null; commune: string | null }): string {
  const ville = [b.codePostal ?? '', b.commune ?? ''].map((x) => x.trim()).filter((x) => x !== '').join(' ');
  const adresse = [(b.adresse ?? '').trim(), ville].filter((x) => x !== '').join(', ');
  return adresse === '' ? `lot ${b.cle}` : `${adresse} — lot ${b.cle}`;
}
