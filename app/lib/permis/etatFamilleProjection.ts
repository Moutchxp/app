/**
 * RATT-1 — ÉTAT porté par la LIGNE DE TITRE des familles « Bâtiments et projection (emprise) » et « Caractéristiques du permis » de
 * l'onglet « Analyse et projection », visible SANS déplier (comme le bilan de complétude de `BlocCompletude`). PUR (client-safe,
 * aucune I/O). L'information est portée par le TEXTE ; `ton` n'est qu'un APPUI de couleur, jamais seul porteur (a11y). Aucune teinte
 * nouvelle : 'rouge'/'vert'/'neutre' → couleurs EXISTANTES de l'admin, mappées par l'appelant (var(--color-svv-red) / -green-ink / -muted).
 */
import { etatEnteteProjection } from './projectionBatiments'; // SOURCE UNIQUE : le repli de titre PARTAGE la règle de l'en-tête live (estValidationAcquise)
import type { CasBilanComparatif } from './comparatifParcelles'; // PL-ÉTAT — cas du bilan déclaré ↔ sélectionné (module pur), pour l'état de la ligne « Planche cadastrale »

export type TonTitreFamille = 'rouge' | 'vert' | 'neutre';
export interface EtatTitreFamille { texte: string; ton: TonTitreFamille }

/**
 * « Bâtiments et projection » : la projection du permis est-elle validée ? (`permis_projection` non vide). ROUGE tant qu'elle ne l'est
 * pas (rappel honnête que rien n'a encore été projeté/validé), VERT une fois validée.
 * ⚠️ Ce marqueur `permis_projection` est le JALON DOSSIER (« permis clôturé / envoyé en Rattachement »), PAS l'état de validation PAR
 *   BÂTIMENT. Pour dire si la PROJECTION est faite, utiliser `etatProjectionTitreDepuisComptes` (repli calqué sur estValidationAcquise) :
 *   il partage la MÊME règle que l'en-tête live du bloc (etatEnteteProjection), si bien que la section et la ligne disent une seule vérité.
 */
export function etatProjectionTitre(projectionValidee: boolean): EtatTitreFamille {
  return projectionValidee
    ? { texte: 'projection validée', ton: 'vert' }
    : { texte: 'projection non validée', ton: 'rouge' };
}

/**
 * REPLI du titre « Bâtiments et projection » AVANT ouverture du bloc (état LIVE non encore remonté) : calqué sur `estValidationAcquise`
 * via `etatEnteteProjection` — la MÊME fonction qui produit l'en-tête live. La section (ce repli), la ligne de la file
 * (`estValidationAcquise`) et l'en-tête ouvert (valeur live) partagent donc UNE SEULE règle : validation PAR BÂTIMENT (toutes altitudes
 * de sommet ET emprises validées). 0 bâtiment → ROUGE (jamais validé par vacuité). PUR (client-safe). Le jeton vert « Projection
 * validée » / rouge est byte-identique à l'en-tête (aucune 2e formulation à maintenir).
 */
export function etatProjectionTitreDepuisComptes(nbBatiments: number, nbSansAltitudeValidee: number, nbSansEmpriseValidee: number): EtatTitreFamille {
  return etatEnteteProjection(nbBatiments, nbSansAltitudeValidee, nbSansEmpriseValidee);
}

/**
 * BAT-2 — SOUS-SECTION 4 « Les futurs bâtiments et leurs altitudes » (PORTEUSE de la mère « Caractéristiques du permis (saisie) ») : les
 * cartes de bâtiment existent-elles, et leur altitude de sommet est-elle renseignée ?
 * 🔄 RÈGLE RÉVISÉE (décision Arno, BAT-2) — l'ancien « 0 bâtiment → NEUTRE » est RETIRÉ ici : une projection EXIGE au moins une carte, donc
 *   AUCUNE carte n'est un manque à combler, pas un « rien à faire ». Trois cas :
 *   · nbCartes ≤ 0 → ROUGE « aucune carte de bâtiment » ;
 *   · ≥ 1 carte SANS altitude de sommet → ROUGE (avec compte) ;
 *   · ≥ 1 carte, TOUTES renseignées → VERT (avec compte).
 */
export function etatAltitudesTitre(nbCartes: number, nbSansAltitude: number): EtatTitreFamille {
  if (nbCartes <= 0) return { texte: 'aucune carte de bâtiment', ton: 'rouge' };
  if (nbSansAltitude > 0) {
    return { texte: `altitude${nbSansAltitude > 1 ? 's' : ''} manquante${nbSansAltitude > 1 ? 's' : ''} (${nbSansAltitude}/${nbCartes})`, ton: 'rouge' };
  }
  return { texte: `altitudes renseignées (${nbCartes} bâtiment${nbCartes > 1 ? 's' : ''})`, ton: 'vert' };
}

/**
 * BAT-2 — SOUS-SECTION 1 « Caractéristiques et bâtiments d'origine » (PORTEUSE) : le NOMBRE de cartes de bâtiment (permis_corps_batiment)
 * correspond-il au nombre de bâtiments VALIDÉ (BAT-1, permis_caracteristique.nb_batiments_valide) ?
 *   · nbValide === null (JAMAIS validé — cas du « 0 détecté » que BAT-1 laisse à NULL) → NEUTRE « nombre de bâtiments non validé » : il n'y
 *     a PAS de nombre validé à comparer, on ne MENT dans aucun sens (ni faux « cohérent », ni faux « incohérent »). « Pas encore fait »
 *     n'est pas « rien à faire » : la mère vire tout de même au ROUGE via son agrégat (un porteur neutre bloque), SANS mentir sur ce titre.
 *   · nbCartes !== nbValide → ROUGE, libellé qui DIT l'incohérence (n cartes / m validés) ;
 *   · nbCartes === nbValide → VERT.
 */
export function etatCoherenceBatimentsTitre(nbCartes: number, nbValide: number | null): EtatTitreFamille {
  if (nbValide === null) return { texte: 'nombre de bâtiments non validé', ton: 'neutre' };
  if (nbCartes !== nbValide) {
    return { texte: `${nbCartes} carte${nbCartes > 1 ? 's' : ''} pour ${nbValide} bâtiment${nbValide > 1 ? 's' : ''} validé${nbValide > 1 ? 's' : ''}`, ton: 'rouge' };
  }
  return { texte: 'nombre de cartes cohérent avec le nombre validé', ton: 'vert' };
}

/**
 * BAT-2 — MÈRE « Caractéristiques du permis (saisie) » : agrège l'état de ses sous-sections PORTEUSES (l'appelant ne passe QUE les
 * porteuses — section 1 cohérence + section 4 altitudes). Les sous-sections NON BLOQUANTES (« Compte rendu du Cerfa », « Le permis » :
 * informatives, champs légitimement souvent vides) N'ENTRENT JAMAIS dans ce calcul. DEUX états seulement :
 *   · VERTE ssi TOUTES les porteuses sont vertes ;
 *   · ROUGE sinon — Y COMPRIS si une porteuse est NEUTRE (« pas encore fait » n'est pas « rien à faire »).
 * Quand ROUGE, la mère NOMME les porteuses qui bloquent en REPRENANT leur propre `texte` (jamais une 2e formulation à maintenir) → on sait
 * laquelle ouvrir sans déplier. SOURCE UNIQUE : cette fonction n'invente aucun état, elle agrège ceux des porteuses.
 */
export function etatMereCaracteristiques(porteuses: EtatTitreFamille[]): EtatTitreFamille {
  const bloquantes = porteuses.filter((p) => p.ton !== 'vert');
  if (bloquantes.length === 0) return { texte: 'complète', ton: 'vert' };
  return { texte: bloquantes.map((p) => p.texte).join(' · '), ton: 'rouge' };
}

/** BAT-2c — comptes de caractéristiques d'UN permis (source des états des sous-sections porteuses). Réutilisé côté serveur (payload) et client. */
export interface ComptesCaracteristiquesPermis { dossierId: number; nbCartes: number; nbSansAltitude: number; nbBatimentsValide: number | null }

/**
 * BAT-2c — état AGRÉGÉ d'UN permis = sa « mère » (cohérence des cartes + altitudes), depuis ses comptes bruts. MÊME agrégat que la ligne
 * mère de Projection (etatMereCaracteristiques sur les deux porteuses) → une seule vérité. Rend l'état porté par la ligne « Permis {numDau} »
 * d'un encart multi-permis, et alimente l'agrégat de la famille.
 */
export function etatCaracteristiquesPermis(c: ComptesCaracteristiquesPermis): EtatTitreFamille {
  return etatMereCaracteristiques([etatCoherenceBatimentsTitre(c.nbCartes, c.nbBatimentsValide), etatAltitudesTitre(c.nbCartes, c.nbSansAltitude)]);
}

/**
 * BAT-2c — état porté par le LIBELLÉ DE FAMILLE « Caractéristiques du permis » de l'encart d'une demande (Réponses / Suivi), pour savoir
 * s'il faut ouvrir SANS déplier la famille. Une demande peut couvrir PLUSIEURS permis (`dossiersEncart`) → on agrège :
 *   · 0 permis → `null` (pas de suffixe ; l'appelant garde le libellé nu — défensif, la famille est de toute façon masquée si vide) ;
 *   · 1 permis → SON état brut (« complète » / « altitude manquante (1/1) »… ), le détail utile directement ;
 *   · N permis → décompte : VERT « N permis complets » si tous verts, sinon ROUGE « X/N permis à compléter » (X = permis qui bloquent).
 * Le DÉTAIL par permis (lequel, pourquoi) reste porté par chaque ligne « Permis {numDau} » (etatCaracteristiquesPermis). SOURCE UNIQUE.
 */
export function etatFamilleCaracteristiquesDemande(comptes: ComptesCaracteristiquesPermis[]): EtatTitreFamille | null {
  if (comptes.length === 0) return null;
  const etats = comptes.map(etatCaracteristiquesPermis);
  if (etats.length === 1) return etats[0];
  const bloquants = etats.filter((e) => e.ton !== 'vert').length;
  return bloquants === 0
    ? { texte: `${etats.length} permis complets`, ton: 'vert' }
    : { texte: `${bloquants}/${etats.length} permis à compléter`, ton: 'rouge' };
}

/**
 * BAT-2d — FUSION des comptes du PAYLOAD (snapshot serveur, tous les dossiers d'encart) avec les comptes LIVE remontés par les blocs
 * ouverts (par dossierId). Le LIVE PRIME : un bloc ouvert reflète les données fraîches (après ajout/suppression d'une carte), au moins
 * aussi récentes que le payload → le résumé de famille et l'état par « Permis {numDau} » collent aux sous-titres des blocs (une seule
 * vérité, comme la mère de Projection). Un dossier sans entrée live garde son compte du payload. PUR.
 */
export function fusionnerComptesLive(
  payload: ComptesCaracteristiquesPermis[],
  live: ReadonlyMap<number, ComptesCaracteristiquesPermis>,
): ComptesCaracteristiquesPermis[] {
  return payload.map((c) => live.get(c.dossierId) ?? c);
}

/**
 * PL-ÉTAT — « Planche cadastrale (parcelles) » : dire SANS déplier où en est la sélection de parcelles ET signaler tout écart avec les
 * parcelles DÉCLARÉES au permis. PUR (dérivé des états déjà connus, jamais recalculé). Règles (décision Arno) :
 *  · un CHANGEMENT à l'écran non encore appliqué → ROUGE « sélection modifiée — non validée » (il reste une action à faire) ;
 *  · sinon, une SÉLECTION VALIDÉE → VERT, avec la NUANCE : « mêmes parcelles » (correspondance) ou « parcelles différentes » (écart validé,
 *    laissé visible en clair — jamais masqué sous le vert) ;
 *  · sinon (configuration automatique, aucune action en attente) : NEUTRE « configuration automatique » si ça concorde (ou incomparable),
 *    ROUGE « écart avec les parcelles déclarées » sinon. C'est un SIGNALEMENT, jamais un blocage.
 * `cas` = bilan `comparerParcelles`/`bilanComparatif` (déclaré ↔ effectif) ; le détail par nature reste dans le bloc déplié.
 */
export function etatPlancheTitre(p: { selectionValidee: boolean; changementEnAttente: boolean; cas: CasBilanComparatif }): EtatTitreFamille {
  if (p.changementEnAttente) return { texte: 'sélection modifiée — non validée', ton: 'rouge' };
  if (p.selectionValidee) {
    return p.cas === 'correspondance'
      ? { texte: 'validée — mêmes parcelles que le permis', ton: 'vert' }
      : { texte: 'validée — parcelles différentes du permis', ton: 'vert' };
  }
  return (p.cas === 'correspondance' || p.cas === 'impossible')
    ? { texte: 'configuration automatique', ton: 'neutre' }
    : { texte: 'écart avec les parcelles déclarées au permis', ton: 'rouge' };
}
