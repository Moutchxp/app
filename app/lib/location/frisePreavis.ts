/**
 * ══ 🔴🔴 LA FRISE DES ÉTAPES D'UN PRÉAVIS (spec d'Arno du 11/11/2026, lot 3). MODULE PUR. ═══════════════════════════════════════════════
 *   1 « Préavis reçu » → 2 « Pré-visite » → 3 « État des lieux de sortie » → 4 « Sortie validée ».
 * Chaque étape : son titre, sa date, son statut. Couleurs : VERT = faite ; ORANGE = pré-visite refusée / absente ; neutre = à faire ;
 * l'étape EN COURS (la première ni faite ni refusée) est mise en évidence. Plus aucun gris pour une étape faite. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { dateFrPreavis, type LignePreavisAccueil } from './preavis';
import { creneauFr } from './previsite';

export type StatutEtape = 'faite' | 'refusee' | 'programmee' | 'a_faire';
export type CleEtape = 'preavis' | 'previsite' | 'edls' | 'sortie';
export interface EtapePreavis { cle: CleEtape; numero: number; titre: string; statut: StatutEtape; libelle: string; enCours: boolean }

const jourIso = (d: string | null | undefined): string | null => (d ? d.slice(0, 10) : null);

export function etapesPreavis(l: LignePreavisAccueil, aujourdhui: string,
  /** 🔴 Arno (11/11/2026) — `retenue` : la retenue de 20 % appliquée à la sortie (« Retenue 20 % appliquée » à l'étape 4). */
  o: { sortieValidee?: string | null; retenue?: boolean } = {}): EtapePreavis[] {
  const p = l.previsite ?? null;
  const previsite: Pick<EtapePreavis, 'statut' | 'libelle'> = p === null ? { statut: 'a_faire', libelle: 'À programmer' }
    : p.statut === 'effectuee' ? { statut: 'faite', libelle: p.rdv ? `Effectuée le ${creneauFr(p.rdv)}` : 'Effectuée' }
      : p.statut === 'refusee' ? { statut: 'refusee', libelle: 'Refusée / absente' }
        : p.statut === 'programmee' ? { statut: 'programmee', libelle: p.rdv ? `Programmée le ${creneauFr(p.rdv)}` : 'Programmée' }
          : { statut: 'a_faire', libelle: p.statut === 'alerte' ? 'À programmer — alerte : aucune pré-visite fixée' : 'À programmer' };
  const jourEdl = jourIso(l.edls?.jour ?? l.etatDesLieuxLe);
  const edls: Pick<EtapePreavis, 'statut' | 'libelle'> = o.sortieValidee ? { statut: 'faite', libelle: jourEdl ? `Réalisé le ${dateFrPreavis(jourEdl)}` : 'Réalisé' }
    : jourEdl === null ? { statut: 'a_faire', libelle: 'À planifier' }
      : jourEdl < aujourdhui ? { statut: 'faite', libelle: `Réalisé le ${dateFrPreavis(jourEdl)}` }
        : { statut: 'programmee', libelle: `Prévu le ${dateFrPreavis(jourEdl)}${l.edls?.confieA ? ` — confié à ${l.edls.confieA}` : ''}` };
  const sortie: Pick<EtapePreavis, 'statut' | 'libelle'> = o.sortieValidee ? { statut: 'faite', libelle: `Validée le ${dateFrPreavis(o.sortieValidee)}${o.retenue ? ' — Retenue 20 % appliquée' : ''}` }
    : { statut: 'a_faire', libelle: `À valider — fin du préavis le ${dateFrPreavis(l.dateMax)}` };
  const etapes: Omit<EtapePreavis, 'enCours'>[] = [
    { cle: 'preavis', numero: 1, titre: 'Préavis reçu', statut: 'faite', libelle: `Reçu le ${dateFrPreavis(l.recuLe)} — fin du préavis le ${dateFrPreavis(l.dateMax)}` },
    { cle: 'previsite', numero: 2, titre: 'Pré-visite', ...previsite },
    { cle: 'edls', numero: 3, titre: 'État des lieux de sortie', ...edls },
    { cle: 'sortie', numero: 4, titre: 'Sortie validée', ...sortie },
  ];
  const courante = etapes.find((e) => e.statut === 'a_faire' || e.statut === 'programmee')?.cle ?? null;
  return etapes.map((e) => ({ ...e, enCours: e.cle === courante }));
}
