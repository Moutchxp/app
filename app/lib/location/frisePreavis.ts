/**
 * ══ 🔴🔴 LA FRISE DES ÉTAPES D'UN PRÉAVIS (spec d'Arno du 11/11/2026, lot 3). MODULE PUR. ═══════════════════════════════════════════════
 *   1 « Préavis reçu » → 2 « Pré-visite » → 3 « État des lieux de sortie » → 4 « Sortie validée ».
 * Chaque étape : son titre, sa date, son statut. Couleurs : VERT = faite ; ORANGE = pré-visite refusée / absente ; neutre = à faire ;
 * l'étape EN COURS (la première ni faite ni refusée) est mise en évidence. Plus aucun gris pour une étape faite. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { dateFrPreavis, type LignePreavisAccueil } from './preavis';
import { creneauFr, finDuRendezVous } from './previsite';
import { prenomNom } from './triRdvPreavis';
import type { EdlsAffiche } from './edls';

export type StatutEtape = 'faite' | 'refusee' | 'programmee' | 'a_faire';
export type CleEtape = 'preavis' | 'previsite' | 'edls' | 'sortie';
export interface EtapePreavis { cle: CleEtape; numero: number; titre: string; statut: StatutEtape; libelle: string; enCours: boolean;
  /** 🔴 Arno (11/11/2026) — les lignes affichées sous le titre (« Préavis reçu » : « Reçu le … » puis « Fin du préavis le … ») ; sinon le libellé seul. */
  lignes: string[] }

const jourIso = (d: string | null | undefined): string | null => (d ? d.slice(0, 10) : null);

export function etapesPreavis(l: LignePreavisAccueil, aujourdhui: string,
  /** 🔴 Arno (11/11/2026) — `retenue` : la retenue de 20 % appliquée à la sortie (« Retenue 20 % appliquée » à l'étape 4).
   *  🔴🔴 Arno (27/11/2026, 21h19) — `maintenant` : l'état des lieux PLANIFIÉ est effectué dès sa FIN prévue + 1 h (`edlsEffectue`) ; absent : la règle
   *  du jour, comme avant. */
  o: { sortieValidee?: string | null; retenue?: boolean; maintenant?: Date } = {}): EtapePreavis[] {
  const p = l.previsite ?? null;
  const previsite: Pick<EtapePreavis, 'statut' | 'libelle'> = p === null ? { statut: 'a_faire', libelle: 'À programmer' }
    : p.statut === 'effectuee' ? { statut: 'faite', libelle: p.rdv ? `Effectuée le ${creneauFr(p.rdv)}` : 'Effectuée' }
      : p.statut === 'refusee' ? { statut: 'refusee', libelle: 'Refusée / absente' }
        : p.statut === 'programmee' ? { statut: 'programmee', libelle: p.rdv ? `Programmée le ${creneauFr(p.rdv)}` : 'Programmée' }
          : { statut: 'a_faire', libelle: p.statut === 'alerte' ? 'À programmer — alerte : aucune pré-visite fixée' : 'À programmer' };
  const jourEdl = jourIso(l.edls?.jour ?? l.etatDesLieuxLe);
  const edls: Pick<EtapePreavis, 'statut' | 'libelle'> = o.sortieValidee ? { statut: 'faite', libelle: jourEdl ? `Réalisé le ${dateFrPreavis(jourEdl)}` : 'Réalisé' }
    : jourEdl === null ? { statut: 'a_faire', libelle: 'À planifier' }
      : l.edls && o.maintenant ? (edlsEffectue(l.edls, o.maintenant) ? { statut: 'faite', libelle: `Réalisé le ${dateFrPreavis(jourEdl)}` }
        : { statut: 'programmee', libelle: `Prévu le ${dateFrPreavis(jourEdl)}${l.edls.confieA ? ` — confié à ${l.edls.confieA}` : ''}` })
      : jourEdl < aujourdhui ? { statut: 'faite', libelle: `Réalisé le ${dateFrPreavis(jourEdl)}` }
        : { statut: 'programmee', libelle: `Prévu le ${dateFrPreavis(jourEdl)}${l.edls?.confieA ? ` — confié à ${l.edls.confieA}` : ''}` };
  const sortie: Pick<EtapePreavis, 'statut' | 'libelle'> = o.sortieValidee ? { statut: 'faite', libelle: `Validée le ${dateFrPreavis(o.sortieValidee)}${o.retenue ? ' — Retenue 20 % appliquée' : ''}` }
    : { statut: 'a_faire', libelle: `À valider — fin du préavis le ${dateFrPreavis(l.dateMax)}` };
  const etapes: (Omit<EtapePreavis, 'enCours' | 'lignes'> & { lignes?: string[] })[] = [
    { cle: 'preavis', numero: 1, titre: 'Préavis reçu', statut: 'faite', libelle: `Reçu le ${dateFrPreavis(l.recuLe)} — fin du préavis le ${dateFrPreavis(l.dateMax)}`,
      lignes: [`Reçu le ${dateFrPreavis(l.recuLe)}`, `Fin du préavis le ${dateFrPreavis(l.dateMax)}`] },
    { cle: 'previsite', numero: 2, titre: 'Pré-visite', ...previsite },
    { cle: 'edls', numero: 3, titre: 'État des lieux de sortie', ...edls },
    { cle: 'sortie', numero: 4, titre: 'Sortie validée', ...sortie },
  ];
  const courante = etapes.find((e) => e.statut === 'a_faire' || e.statut === 'programmee')?.cle ?? null;
  return etapes.map((e) => ({ ...e, lignes: e.lignes ?? [e.libelle], enCours: e.cle === courante }));
}

/**
 * 🔴 Arno (13/11/2026) — LES LIGNES SOUS LE TITRE D'UNE ÉTAPE, SANS DOUBLON : quand la case montre déjà le CARTOUCHE du rendez-vous (pré-visite
 * programmée ou effectuée avec sa date ; état des lieux de sortie fixé, non refusé, dans la planification), la ligne grise le répétait mot pour
 * mot : elle disparaît (accord d'Arno), et seule l'indication « étape en cours » reste, si l'étape est la courante. Sans cartouche (« À
 * programmer », « À planifier », refus) : les lignes telles quelles. PUR.
 */
export function lignesSousTitre(e: EtapePreavis, l: LignePreavisAccueil, o: { planification: boolean }): string[] {
  const p = l.previsite ?? null;
  const cartouche = (e.cle === 'previsite' && p !== null && p.rdv !== null && (p.statut === 'programmee' || p.statut === 'effectuee'))
    || (e.cle === 'edls' && o.planification && l.edls != null && l.edls.statut !== 'refusee');
  if (cartouche) return e.enCours ? [ETAPE_EN_COURS] : [];
  // 🔴 Arno (19/11/2026, accord explicite) — plus de légende « À planifier » (état des lieux sans date) ni « À valider — fin du préavis le … »
  //    (sortie à valider) sous le titre ; « étape en cours » reste. La fin du préavis reste dite en case 1 et sur la ligne « Préavis : … ».
  if ((e.cle === 'edls' && e.libelle === 'À planifier') || (e.cle === 'sortie' && e.statut === 'a_faire')) return e.enCours ? [ETAPE_EN_COURS] : [];
  return e.lignes.map((x, i) => (i === e.lignes.length - 1 && e.enCours ? `${x} · ${ETAPE_EN_COURS}` : x));
}
export const ETAPE_EN_COURS = 'étape en cours';

/**
 * 🔴🔴 Arno (16/11/2026) — LE CARTOUCHE VERT de l'état des lieux de sortie fixé (case 3), du même style que « Pré-visite programmée — le … de …
 * à … » de la case 2 : « État des lieux programmé — le 18/11/2026 de 11h30 à 12h30 », et dessous « Prénom NOM : en attente / acceptée /
 * refusée » (confié directement, sans demande : acceptée). PUR.
 */
export const REPONSE_EDLS: Record<'en_attente' | 'acceptee' | 'refusee', string> = { en_attente: 'en attente', acceptee: 'acceptée', refusee: 'refusée' };
export function cartoucheEdls(e: Pick<EdlsAffiche, 'jour' | 'heure' | 'dureeMinutes' | 'confieA' | 'statut'>, maintenant?: Date): { texte: string; qui: string; reponse: string; effectue: boolean; statut: 'en_attente' | 'acceptee' | 'refusee' } {
  const quand = e.heure ? creneauFr({ jour: e.jour, heure: e.heure, dureeMinutes: e.dureeMinutes ?? 60 }) : dateFrPreavis(e.jour);
  const statut = e.statut ?? 'acceptee';
  const effectue = maintenant !== undefined && edlsEffectue(e, maintenant);
  // 🔴🔴 Arno (27/11/2026, 21h19) — « RDV fixé — le … de … à … · confié à Prénom NOM » ; effectué : « État des lieux effectué — le … · par Prénom NOM »
  const qui = prenomNom(e.confieA);
  // 🔴🔴 (Arno, 28/11/2026, 00h45) « dans le cartouche vert, ne pas mettre le nom du collaborateur […] ça fait doublon avec la ligne du dessous que l'on
  //    garde » : la date et les horaires seulement ; « Prénom NOM : acceptée / en attente » reste la ligne du dessous (`qui`, `reponse`)
  return { texte: effectue ? `État des lieux effectué — le ${quand}` : `RDV fixé — le ${quand}`, qui, reponse: REPONSE_EDLS[statut], effectue, statut };
}

/** 🔴🔴 Arno (27/11/2026, 21h19) — le délai après la FIN prévue du rendez-vous au bout duquel l'état des lieux de sortie est effectué : 1 h. */
export const DELAI_EDLS_EFFECTUE_MS = 60 * 60_000;

/**
 * 🔴🔴 Arno (27/11/2026, 21h19) — L'ÉTAT DES LIEUX DE SORTIE EFFECTUÉ, AUTOMATIQUEMENT : dès que l'heure de FIN prévue (début + durée, heure de Paris)
 * + 1 h est dépassée — à fin + 1 h pile, il l'est. Un rendez-vous refusé par le collègue (à réattribuer) ne l'est jamais. Règle du SEUL bloc 3 :
 * la pré-visite reste effectuée par le geste du compte rendu (Arno, 13/11/2026). PUR.
 */
export function edlsEffectue(e: Pick<EdlsAffiche, 'jour' | 'heure' | 'dureeMinutes' | 'statut'> | null | undefined, maintenant: Date): boolean {
  if (e === null || e === undefined || e.statut === 'refusee') return false;
  return maintenant.getTime() >= finDuRendezVous(e.jour, e.heure, e.dureeMinutes).getTime() + DELAI_EDLS_EFFECTUE_MS;
}
