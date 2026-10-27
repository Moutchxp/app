import { describe, expect, it } from 'vitest';
import {
  construireFrise, dernierIdDeLaFrise, dernierJourDeLaFrise, jourDeRepliAuBout, motDateAvantDernier, ordreDeLaFrise, parOrdreDePose, poseAuBout,
  rangerEnLigne, refusDateAvantDernier, refusDEnregistrement, type EtapeAAfficher,
} from './frise';
import {
  gesteTransformerEnEtape, gesteTransformerEnPoint, natureDuPointApresTransformation, parcoursDeBorne, validerCorrection,
} from './correctionEtape';
import { estRepere } from './mongaEtape';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE (Arno, 27/10/2026) — GES-2026-000011 « Problème de chauffage » ═══════════════════════════════════════════
 *
 * CONSTAT : la carte « Attente intervention syndic », posée par le « + » de fin, s'affichait AVANT « Ouverture 23/10/2026 » et avant
 * les 5 points Monga des 23-24/10. CAUSE (code) : les étapes de la relève n'ont pas de rang de pose (rangées au bout par
 * `parOrdreDePose`), la carte manuelle avait le rang 1 (maximum lu sur les seules cartes de l'événement). Les données ci-dessous ont
 * la forme constatée (aucun nom réel).
 */
const etape = (id: number, p: Partial<EtapeAAfficher> = {}): EtapeAAfficher => ({
  id, reference: 'MNG-20922', type: 'commentaire', survenuLe: '2026-10-23 10:00:00', heureConnue: true, jourConnu: true, heureFin: null,
  numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'monga', certitude: 'confirmee', messageId: 900 + id,
  aEuUnMail: true, filId: 50, creeParLibelle: null, rangDevis: null, creeLe: '2026-10-23 10:00:05', titre: null, pieceNom: null,
  rangPose: null, poseChoisie: false, ...p,
});

/** La frise de GES-2026-000011 telle qu'enregistrée le 27/10 : tout ce qui vient de Monga est SANS rang ; la carte manuelle a le rang 1. */
const OUVERTURE = etape(101, { type: 'ouverture', survenuLe: '2026-10-23 09:12:00', creeLe: '2026-10-23 09:15:00', certitude: 'a_confirmer' });
const POINTS = [
  etape(102, { survenuLe: '2026-10-23 10:00:00', creeLe: '2026-10-23 10:01:00' }),
  etape(103, { survenuLe: '2026-10-23 15:30:00', creeLe: '2026-10-23 15:31:00' }),
  etape(104, { survenuLe: '2026-10-24 08:00:00', creeLe: '2026-10-24 08:01:00' }),
  etape(105, { survenuLe: '2026-10-24 11:00:00', creeLe: '2026-10-24 11:01:00' }),
  etape(106, { survenuLe: '2026-10-24 17:45:00', creeLe: '2026-10-24 17:46:00' }),
];
const CARTE = etape(200, {
  type: 'autre', titre: 'Attente intervention syndic', source: 'manuelle', reference: null, messageId: null, aEuUnMail: false, filId: null,
  survenuLe: '2026-10-27', jourConnu: false, heureConnue: false, creeLe: '2026-10-27 11:20:00', rangPose: 1,
});
const FRISE_37 = [CARTE, OUVERTURE, ...POINTS];

describe('🔴🔴 A — la cause, et ce que la frise montre désormais (GES-2026-000011)', () => {
  it('LA CAUSE : l’ancien tri (`parOrdreDePose` seul) mettait la carte de rang 1 devant tout ce qui n’avait pas de rang', () => {
    expect([...FRISE_37].sort(parOrdreDePose).map((e) => e.id)[0]).toBe(200);
  });

  it('la carte posée au bout s’affiche APRÈS l’Ouverture et les 5 points, sans toucher aux données', () => {
    expect(ordreDeLaFrise(FRISE_37).map((e) => e.id)).toEqual([101, 102, 103, 104, 105, 106, 200]);
    const { majeures, reperes } = construireFrise(FRISE_37, '2026-10-23 09:12:00+02');
    const ligne = rangerEnLigne(majeures, reperes, '2026-10-27');
    expect(ligne.filter((e) => e.sorte !== 'plus-entre').map((e) => e.cle)).toEqual(['e101', 'pts-avant-e200', 'e200', 'plus']);
    expect(ligne.find((e) => e.cle === 'pts-avant-e200')?.messages?.map((m) => m.id)).toEqual([102, 103, 104, 105, 106]);
  });

  it('A2 — une carte créée ensuite par le « + » (rang = maximum de TOUTE la frise + 1) va encore en dernier', () => {
    const suivante = etape(201, { ...CARTE, id: 201, titre: 'Relance syndic', creeLe: '2026-10-28 09:00:00', survenuLe: '2026-10-28', rangPose: 2 });
    expect(ordreDeLaFrise([...FRISE_37, suivante]).map((e) => e.id).slice(-2)).toEqual([200, 201]);
  });

  it('A5 — la relève garde la date réelle : un mail daté avant la carte passe avant elle, un mail daté après passe après', () => {
    const avant = etape(107, { survenuLe: '2026-10-26 09:00:00', creeLe: '2026-10-28 07:00:00' });
    const apres = etape(108, { survenuLe: '2026-10-29 09:00:00', creeLe: '2026-10-29 09:01:00' });
    expect(ordreDeLaFrise([...FRISE_37, avant, apres]).map((e) => e.id)).toEqual([101, 102, 103, 104, 105, 106, 107, 200, 108]);
  });

  it('A1 — l’Ouverture reste le premier élément, même face à une carte de rang plus petit (« + » de début, glisser)', () => {
    const devant = etape(300, { ...CARTE, id: 300, rangPose: 0.5, survenuLe: '2026-10-20', jourConnu: true, creeLe: '2026-10-27 12:00:00' });
    const rangee = etape(301, { type: 'ouverture', rangPose: 4, survenuLe: '2026-10-21 12:00:00', source: 'manuelle', reference: null });
    expect(ordreDeLaFrise([devant, rangee]).map((e) => e.id)).toEqual([301, 300]);
    const { majeures, reperes } = construireFrise([...FRISE_37, devant], '2026-10-23 09:12:00+02');
    expect(rangerEnLigne(majeures, reperes, '2026-10-27')[0].cle).toBe('e101');
  });

  it('sans aucun rang de pose, l’ordre est celui d’avant (date, rang de type, identifiant)', () => {
    const sansRang = FRISE_37.map((e) => ({ ...e, rangPose: null }));
    expect(ordreDeLaFrise(sansRang).map((e) => e.id)).toEqual([101, 102, 103, 104, 105, 106, 200]);
  });
});

describe('🔴🔴 A3 — à la création, pas de date avant le dernier élément', () => {
  it('le dernier élément est le dernier AFFICHÉ dont la date est connue ; à défaut, l’ouverture de l’événement', () => {
    expect(dernierJourDeLaFrise(FRISE_37, '2026-10-23 09:12:00+02')).toBe('2026-10-24');
    expect(dernierIdDeLaFrise(FRISE_37)).toBe(200);
    expect(dernierJourDeLaFrise([], '2026-10-23 09:12:00+02')).toBe('2026-10-23');
    expect(dernierJourDeLaFrise([], null)).toBeNull();
  });

  it('une date antérieure est refusée avec la phrase d’Arno ; le même jour et après passent', () => {
    expect(motDateAvantDernier('2026-10-24')).toBe('Cette étape ne peut pas être datée avant le dernier élément de la frise, du 24/10/2026.');
    expect(refusDateAvantDernier('2026-10-20', '2026-10-24')).toBe(motDateAvantDernier('2026-10-24'));
    expect(refusDateAvantDernier('2026-10-24', '2026-10-24')).toBeNull();
    expect(refusDateAvantDernier('2026-10-27T10:00', '2026-10-24')).toBeNull();
    expect(refusDateAvantDernier('', '2026-10-24')).toBeNull();
    expect(refusDEnregistrement({ jour: '2026-10-20', type: 'devis_recu', titre: '', montantLisible: true, plancher: '2026-10-24' }))
      .toBe(motDateAvantDernier('2026-10-24'));
    // Sans plancher (intercalaire, modification) : la règle d'avant.
    expect(refusDEnregistrement({ jour: '2026-10-20', type: 'devis_recu', titre: '', montantLisible: true })).toBeNull();
    // Une borne est datée par le serveur : aucun refus de date ici.
    expect(refusDEnregistrement({ jour: '', type: 'cloture', titre: '', montantLisible: true, plancher: '2026-12-31' })).toBeNull();
  });

  it('date par défaut = aujourd’hui ; si le dernier élément est plus tardif (rendez-vous à venir), son jour', () => {
    expect(jourDeRepliAuBout('2026-10-27', '2026-10-24')).toBe('2026-10-27');
    expect(jourDeRepliAuBout('2026-10-27', '2026-11-09')).toBe('2026-11-09');
    expect(jourDeRepliAuBout('2026-10-27', null)).toBe('2026-10-27');
  });

  it('seuls le gros « + » et le « + » qui suit le dernier élément posent au bout ; les intercalaires gardent leur place choisie', () => {
    expect(poseAuBout(undefined, 200)).toBe(true);
    expect(poseAuBout(200, 200)).toBe(true);
    expect(poseAuBout(104, 200)).toBe(false);
    expect(poseAuBout('debut', 200)).toBe(false);
  });
});

describe('🔴🔴 B — point ↔ carte : la date, le titre, le lien vers le mail, et la place', () => {
  it('point → carte : la carte choisie, à la date du point ; Carte libre prend le titre saisi', () => {
    expect(gesteTransformerEnEtape(POINTS[0], 'rapport')).toEqual({ geste: 'corriger', type: 'rapport', titre: null, jour: '2026-10-23' });
    expect(gesteTransformerEnEtape(POINTS[0], 'autre', '  Passage du syndic ')).toMatchObject({ type: 'autre', titre: 'Passage du syndic' });
    expect(validerCorrection({ type: 'commentaire', jour: '2026-10-23' }, gesteTransformerEnEtape(POINTS[0], 'rapport')))
      .toMatchObject({ refus: null, dateInchangee: true });
  });

  it('Clôture et Réouverture ne se corrigent pas : elles ouvrent le parcours de clôture du « + »', () => {
    expect(parcoursDeBorne('cloture')).toBe(true);
    expect(parcoursDeBorne('reouverture')).toBe(true);
    expect(parcoursDeBorne('rapport')).toBe(false);
    expect(validerCorrection({ type: 'commentaire', jour: '2026-10-23' }, { type: 'cloture', titre: null, jour: '2026-10-23' }).refus).not.toBeNull();
  });

  it('carte → point : la date et le titre (le mot de la carte) gardés ; une nature de point, jamais un faux commentaire Monga', () => {
    const devis = etape(400, { type: 'devis_recu', source: 'manuelle', survenuLe: '2026-10-25 12:00:00' });
    const g = gesteTransformerEnPoint(devis);
    expect(g).toEqual({ geste: 'corriger', type: 'note', titre: 'Devis reçu', jour: '2026-10-25' });
    expect(estRepere(g.type)).toBe(true);
    expect(validerCorrection({ type: 'devis_recu', jour: '2026-10-25' }, g)).toMatchObject({ refus: null, dateInchangee: true });
    expect(natureDuPointApresTransformation({ source: 'monga', autoType: 'facture' })).toBe('facture');
    expect(natureDuPointApresTransformation({ source: 'monga', autoType: null })).toBe('commentaire');
    expect(gesteTransformerEnPoint({ ...devis, titre: 'Devis plombier' }).titre).toBe('Devis plombier');
  });

  it('A5 — une transformation garde la place : même rang, même date, même suite', () => {
    const avant = ordreDeLaFrise(FRISE_37).map((e) => e.id);
    const transforme = FRISE_37.map((e) => (e.id === 104 ? { ...e, type: 'rapport' as const } : e));
    expect(ordreDeLaFrise(transforme).map((e) => e.id)).toEqual(avant);
    const { majeures, reperes } = construireFrise(transforme, '2026-10-23 09:12:00+02');
    expect(rangerEnLigne(majeures, reperes, '2026-10-27').filter((e) => e.sorte === 'carre').map((e) => e.cle)).toEqual(['e101', 'e104', 'e200']);
  });
});
