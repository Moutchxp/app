/**
 * ══ 🔴🔴 Arno (28/11/2026, 12h17, point 4) — LA FICHE SYNDIC NE RÉPÈTE JAMAIS UNE ADRESSE ═════════════════════════════════════════════════════════════
 * « Sur la fiche syndic, la liste des adresses d'une copropriété montre des doublons (« 43 Avenue Marceau · 43 avenue Marceau · 43 avenue Marceau · 80 rue
 * de Normandie · 80 rue de Normandie »). » CONSTAT (recette, lecture seule) : ce ne sont pas des doublons en base — la liste écrivait l'adresse de CHAQUE
 * BIEN de la copropriété. Depuis le point 3, la fiche liste les ADRESSES DE LA COPROPRIÉTÉ, chacune une fois sous la clé de comparaison de la 522
 * (`cleComparable` : majuscules, accents, ponctuation, « bis / ter » et abréviations du type de voie ignorés) ; les liens vers chaque bien restent. PUR.
 */
import { cleComparable } from '../gestion/adresseCoproExclusivite';
import { trierAdresses } from '../gestion/ordreAdresses';
import { biensDesLots, detailVacants, type DetailVacants, type LotPourVacance } from './lotsVacants';
import type { FicheSyndic } from '../gestion/syndics';

/* ══ 🔴🔴 Arno (28/11/2026, 12h17, point 3) — LE BLOC « COPROPRIÉTÉS SUIVIES » DE LA FICHE SYNDIC ════════════════════════════════════════════════════════
 * « mettre le nombre de copropriétés que ce syndic gère dans notre portefeuille, puis la liste des copropriétés : un bloc par copropriété avec en première
 * position le nom de la résidence s'il existe, ensuite l'adresse principale, ensuite les adresses complémentaires, et en face de chaque adresse le nombre
 * de lots en gestion à cette adresse, avec le total des lots en gestion de la copropriété […] Au compteur, ajouter le nombre de lots concernés en tout,
 * avec le même système de comptage que le résumé des lots vacants (a5107e9c), appliqué à la totalité des lots en gestion, occupés ou vacants. »
 *   · les BIENS (`biensDesLots`, ad11dca5) : un lot principal et ses annexes rattachées = 1 ; leur type est celui du lot de tête (a5107e9c) ;
 *   · seuls les biens EN GESTION comptent (choix de Claude : pas la location seule, pas l'ancienne gestion), occupés ou vacants ;
 *   · un bien compte UNE fois, à l'adresse de son lot de tête ; les adresses d'une copropriété ne sont jamais répétées (clé de la 522), la principale
 *     en tête, les autres triées comme dans la fiche copropriété (3583a9f4). PUR. */
export interface CoproPourResume {
  id: number; cle: string; libelle: string; nom?: string | null;
  adresses?: readonly { cle: string; libelle: string }[];
  lots: readonly { id: number; statut?: string | null; cleImmeuble?: string }[];
}
export interface AdresseResumee { libelle: string; principale: boolean; biens: number; teteIds: number[] }
/** 🔴 (Arno, 28/11/2026, 13h36) un bien en gestion de la copropriété : son lot de tête et tous ses lots (annexes rattachées comprises). */
export interface BienDeCopro { teteId: number; lotIds: number[] }
export interface ResumeCopro { id: number; cle: string; nom: string | null; adresses: AdresseResumee[]; detail: DetailVacants; biens: BienDeCopro[] }
/** 🔴 (Arno, 28/11/2026, 13h36) le détail d'un bien, pour la liste dépliée sous le total : propriétaires, locataires en place, repères du lot. */
export interface PersonneDuBien { id: number; nom: string }
export interface DetailBienCopro {
  lotId: number; lot: string | null; batiment: string | null; etage: string | null;
  proprietaires: PersonneDuBien[]; locataires: PersonneDuBien[];
}
export interface ResumeCoprosSyndic { copros: ResumeCopro[]; detail: DetailVacants; detailBiens?: Record<number, DetailBienCopro> }

export function resumerCoprosSyndic(copros: readonly CoproPourResume[], lots: readonly LotPourVacance[]): ResumeCoprosSyndic {
  const biens = biensDesLots(lots);
  const tous: ReturnType<typeof biensDesLots> = [];
  const resumes = copros.map((c) => {
    const enGestion = new Map(c.lots.filter((l) => l.statut === 'en_gestion').map((l) => [l.id, l]));
    // les biens dont la TÊTE est un lot en gestion de cette copropriété (une seule fois chacun)
    const siens = biens.filter((b) => enGestion.has(b.teteId));
    tous.push(...siens);
    // les adresses : la principale, puis les autres triées ; une seule fois chacune (clé de la 522)
    const principale = { cle: c.cle, libelle: c.libelle, principale: true };
    const autres = trierAdresses((c.adresses ?? []).map((a) => ({ cle: a.cle, libelle: a.libelle, principale: false })), (a) => a.libelle);
    const parComparable = new Map<string, AdresseResumee & { cles: Set<string> }>();
    for (const a of [principale, ...autres]) {
      const k = cleComparable(a.libelle) || a.cle;
      const deja = parComparable.get(k);
      if (deja) deja.cles.add(a.cle);
      else parComparable.set(k, { libelle: a.libelle, principale: a.principale, biens: 0, teteIds: [], cles: new Set([a.cle]) });
    }
    const liste = [...parComparable.values()];
    for (const b of siens) {
      const cleTete = enGestion.get(b.teteId)?.cleImmeuble;
      const a = liste.find((x) => cleTete !== undefined && x.cles.has(cleTete)) ?? liste[0];
      a.biens += 1; a.teteIds.push(b.teteId);
    }
    return { id: c.id, cle: c.cle, nom: (c.nom ?? '').trim() || null,
      adresses: liste.map(({ cles: _c, ...x }) => x), detail: detailVacants(siens),
      biens: siens.map((b) => ({ teteId: b.teteId, lotIds: b.lots.map((l) => l.id) })) };
  });
  return { copros: resumes, detail: detailVacants(tous) };
}

/** La fiche syndic de la Location : celle de la Gestion, plus le résumé des copropriétés suivies (absent si la lecture des lots échoue). */
export type FicheSyndicLocation = FicheSyndic & { resumeCopros?: ResumeCoprosSyndic };

/**
 * 🔴🔴 Arno (28/11/2026, 12h54, point 1) — « l'adresse postale du syndic doit être présente » : l'adresse COMPLÈTE (numéro et rue, puis code postal et
 * ville), sur une ou deux lignes. Règle du 10/10 : rue, code postal et ville sont obligatoires pour un syndic ; s'il en manque, on montre ce qui existe
 * et on le DIT (« Adresse incomplète — à compléter ») : rien n'est inventé ni réécrit. PUR.
 */
export function adressePostaleSyndic(s: { adresse: string | null; codePostal: string | null; ville: string | null }): { lignes: string[]; incomplete: boolean } {
  const p = (x: string | null) => (x ?? '').replace(/\s+/g, ' ').trim();
  const rue = p(s.adresse); const cp = p(s.codePostal); const ville = p(s.ville);
  return { lignes: [rue, [cp, ville].filter((x) => x !== '').join(' ')].filter((x) => x !== ''), incomplete: rue === '' || cp === '' || ville === '' };
}
/** Le lien vers la modification du syndic : l'écran des syndics de la Gestion, ce syndic ouvert. */
export const lienModifierSyndic = (id: number): string => `/admin/gestion?ecran=syndics&syndic=${id}`;
