import { categoriePrimeImport, MOTS_PARKING } from './repriseExcel';

/**
 * ══ 🔴 Arno (24/10/2026, validé) — LA RÉPARATION DE LA CATÉGORIE DE PRIME DES LIGNES REPRISES DU FICHIER ══════════════════════════
 * La règle d'import classait « parking » toute prime inférieure à 150 € ; la règle corrigée (`categoriePrimeImport`) ne le fait plus
 * que si le libellé le dit ou si le lot rattaché est un parking. Ce plan recalcule chaque ligne REPRISE (`source = 'import'`) :
 *   · « change » : la nouvelle règle donne une autre catégorie, et la ligne dit de quoi décider (un bien rattaché, ou des honoraires) ;
 *   · « à vérifier à la main » : la règle changerait la catégorie, mais la ligne n'a NI bien rattaché NI honoraires (une prime seule,
 *     sans rien pour dire si c'est un parking) — rien n'est touché (LEBRETON, décembre 2020) ;
 *   · « à vérifier à la main » aussi quand la PRIME contredit la règle : son montant est exactement la prime-règle de l'AUTRE catégorie
 *     (15 € de parking sur une ligne que la règle ferait « logement » — TALLEC, 2025 ; 150 € de logement sur un bail de parking —
 *     AFONSO, 2022) : deux indices opposés, rien n'est tranché ;
 *   · une catégorie « local » (posée à la main, l'import n'en pose jamais) n'est jamais touchée.
 * La prime (montant, choix) n'est jamais modifiée. PUR.
 */
export interface LigneACategoriser {
  id: number; mois: string; proprietaire: string; locataire: string; prime: number; ca: number;
  categorie: 'parking' | 'logement' | 'local' | null;
  /** Le lot rattaché est-il un parking ? `null` : pas de lot rattaché. */
  lotParking: boolean | null;
}
export type DecisionCategorie =
  | { sorte: 'change'; ligne: LigneACategoriser; nouvelle: 'parking' | 'logement'; raison: string }
  | { sorte: 'a_verifier'; ligne: LigneACategoriser; proposee: 'parking' | 'logement' | null; raison: string };

const sansAccents = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Les primes-règles (montants de la règle « 150 € » logement et parking) : un montant égal à celle de l'autre catégorie contredit. */
export const PRIMES_REGLE = { logement: 150, parking: 15 } as const;

export function planReparationCategorie(lignes: readonly LigneACategoriser[], primes: { logement: number; parking: number } = PRIMES_REGLE): DecisionCategorie[] {
  const sortie: DecisionCategorie[] = [];
  for (const l of lignes) {
    if (l.categorie === 'local') continue;
    const libelleParking = MOTS_PARKING.test(sansAccents(l.proprietaire));
    const nouvelle = categoriePrimeImport({ prime: l.prime, libelleParking, lotParking: l.lotParking });
    if (nouvelle === null || nouvelle === l.categorie) continue;
    const raison = libelleParking ? 'le libellé dit « parking »' : l.lotParking === true ? 'le lot rattaché est un parking'
      : l.lotParking === false ? 'le lot rattaché n’est pas un parking' : 'le libellé ne dit pas « parking »';
    if (l.lotParking === null && !libelleParking && !(l.ca > 0)) {
      sortie.push({ sorte: 'a_verifier', ligne: l, proposee: nouvelle, raison: 'ni bien rattaché ni honoraires : rien ne dit si c’est un parking — à vérifier à la main' });
      continue;
    }
    const contraire = nouvelle === 'logement' ? primes.parking : primes.logement;
    if (Math.abs(l.prime - contraire) < 0.005) {
      sortie.push({ sorte: 'a_verifier', ligne: l, proposee: nouvelle,
        raison: `${raison}, mais la prime (${l.prime.toFixed(2).replace('.', ',')} €) est celle de la règle « ${nouvelle === 'logement' ? 'parking' : 'logement'} » : indices opposés — à vérifier à la main` });
      continue;
    }
    sortie.push({ sorte: 'change', ligne: l, nouvelle, raison });
  }
  return sortie;
}

const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;
const MOT = { parking: 'Parking', logement: 'Logement', local: 'Local' } as const;
const mot = (c: 'parking' | 'logement' | 'local' | null): string => (c === null ? '(aucune)' : MOT[c]);

/** Le texte du rapport (avant → après, ligne par ligne). PUR. */
export function texteReparationCategorie(d: readonly DecisionCategorie[], o: { reel: boolean; base: string; lues: number; ecrites?: number }): string {
  const changes = d.filter((x): x is Extract<DecisionCategorie, { sorte: 'change' }> => x.sorte === 'change');
  const verifier = d.filter((x): x is Extract<DecisionCategorie, { sorte: 'a_verifier' }> => x.sorte === 'a_verifier');
  const desc = (l: LigneACategoriser): string => `ligne ${l.id} — ${l.mois} — ${l.proprietaire || '—'} / ${l.locataire || '—'} — prime ${euros(l.prime)}, CA ${euros(l.ca)}`;
  return [
    `RÉPARATION DE LA CATÉGORIE DE PRIME (lignes reprises du fichier) — ${o.reel ? 'RÉEL' : 'ESSAI (aucune écriture)'}`,
    `base : ${o.base} · lignes reprises lues : ${o.lues} · à corriger : ${changes.length} · à vérifier à la main : ${verifier.length}${o.reel ? ` · corrigées : ${o.ecrites ?? 0}` : ''}`,
    '',
    'À CORRIGER (catégorie avant → après ; la prime ne change pas) :',
    ...(changes.length === 0 ? ['  (aucune)'] : changes.map((c) => `  · ${desc(c.ligne)} : ${mot(c.ligne.categorie)} → ${mot(c.nouvelle)} (${c.raison})${o.reel ? '' : ' — serait corrigée'}`)),
    '',
    'À VÉRIFIER À LA MAIN (rien n’est touché) :',
    ...(verifier.length === 0 ? ['  (aucune)'] : verifier.map((c) => `  · ${desc(c.ligne)} : ${mot(c.ligne.categorie)} (la règle proposerait ${mot(c.proposee)}) — ${c.raison}`)),
    '',
  ].join('\n');
}
