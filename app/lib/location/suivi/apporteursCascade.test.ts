import { describe, expect, it } from 'vitest';
import { baremeADate, libelleHistorique, libelleRegleApporteur, versionsEffectives, type Apporteur, type BaremeApporteur } from './suivi';
import { cascade, cascadeAuCentime, dusParDossier, effetReglage, totauxApporteurs, type ActiviteCalcul } from './tableauBord';

/**
 * 🔴 Arno (24/10/2026, migration 420) — L'EFFET EN DIRECT D'UN RÉGLAGE, « DEPUIS TOUJOURS », LA CASCADE DES HONORAIRES.
 * Le cas d'Arno, en fictif : un partenaire externe à 50 %, huit dossiers repris du fichier (taux ET montant saisis sur chaque ligne) ;
 * un « Nouveau taux » à 20 % daté d'aujourd'hui ne touche aucun d'eux — et le formulaire le DIT ; « Depuis toujours » les recalcule tous.
 */
const JOUR = '2026-10-24';
const dossier = (id: number, date: string, ca: number, o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: date, libelleProprietaire: `P${id}`, libelleLocataire: `L${id}`, honoProprietaireHt: ca, honoLocataireHt: 0, primeSaisie: null,
  mandatGestion: false, categoriePrime: 'logement', apporteurId: 12, apporteurNom: 'COHEN Michel', apporteurTaux: 0.5, commissionSaisie: ca * 0.5,
  negociateurId: 3, negociateurLibelle: 'JB', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'non_rattache', origineContact: 'apporteur', ...o,
});
const CAS = [1050, 1235.08, 840.25, 1006.92, 1355.76, 875, 421, 350];
const DATES = ['2021-04-01', '2021-05-01', '2022-10-01', '2022-10-01', '2023-04-01', '2025-01-01', '2025-03-01', '2025-07-01'];
const dossiers = CAS.map((ca, i) => dossier(i + 1, DATES[i], ca));
const v50: BaremeApporteur = { depuis: '2021-01-01', taux: 0.5, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 1 };
const cohen = (o: Partial<Apporteur> = {}): Apporteur => ({ id: 12, nom: 'Michel Cohen', type: 'partenaire', archive: false, compteId: null, baremes: [v50],
  collegues: [{ depuis: '0001-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }], remunerations: [], ...o });
const ca = CAS.reduce((s, x) => s + x, 0);   // 7 134,01 €

describe('🔴 « Effet de ce réglage », en direct', () => {
  it('un taux daté d’aujourd’hui : 0 dossier concerné sur 8 — et ce qui reste au taux précédent est dit', () => {
    const e = effetReglage({ dossiers, apporteurs: [cohen()], apporteurId: 12, aujourdhui: JOUR, bareme: { depuis: JOUR, taux: 0.2, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 } });
    expect(e).toMatchObject({ total: 8, concernes: 0, changes: 0, toujours: false, depuis: JOUR });
    expect(e.avantApporteur).toBeCloseTo(ca * 0.5, 6);
    expect(e.apresApporteur).toBeCloseTo(ca * 0.5, 6);
  });
  it('un taux daté du 01/01/2025 : 3 dossiers sur 8 concernés… mais leurs montants SAISIS restent (rien ne change sans « Depuis toujours »)', () => {
    const e = effetReglage({ dossiers, apporteurs: [cohen()], apporteurId: 12, aujourdhui: JOUR, bareme: { depuis: '2025-01-01', taux: 0.2, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 } });
    expect(e).toMatchObject({ total: 8, concernes: 3, changes: 0, figes: 3 });   // dit à l'écran : seul « Depuis toujours » les remplace
    // Sans montant saisi sur les dossiers (saisie d'aujourd'hui), le taux s'applique : 3 dossiers changent.
    const saisis = dossiers.map((d) => ({ ...d, apporteurTaux: null, commissionSaisie: null }));
    const f = effetReglage({ dossiers: saisis, apporteurs: [cohen()], apporteurId: 12, aujourdhui: JOUR, bareme: { depuis: '2025-01-01', taux: 0.2, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 } });
    expect(f).toMatchObject({ concernes: 3, changes: 3, figes: 0 });
    expect(f.apresApporteur).toBeCloseTo(ca * 0.5 - (875 + 421 + 350) * 0.3, 6);
  });
  it('« Depuis toujours » : 8 sur 8, TOUS recalculés (montants saisis remplacés) ; le dû passe de 50 % à 20 %', () => {
    const e = effetReglage({ dossiers, apporteurs: [cohen()], apporteurId: 12, aujourdhui: JOUR, bareme: { depuis: '2000-01-01', taux: 0.2, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, toujours: true } });
    expect(e).toMatchObject({ total: 8, concernes: 8, changes: 8, toujours: true, depuis: JOUR });
    expect(e.apresApporteur).toBeCloseTo(ca * 0.2, 6);
  });
  it('la rémunération du collègue : avant → après, sur les dossiers de cet apporteur', () => {
    const e = effetReglage({ dossiers, apporteurs: [cohen()], apporteurId: 12, aujourdhui: JOUR,
      remuneration: { depuis: '2000-01-01', remunere: true, mode: 'one_shot', taux: 0.05, tauxGestion: 0, dureeAnnees: null, toujours: true } });
    expect(e).toMatchObject({ concernes: 8, changes: 8, avantCollegue: 0 });
    expect(e.apresCollegue).toBeCloseTo(ca * 0.05, 6);
    expect(e.apresApporteur).toBeCloseTo(e.avantApporteur, 6);   // l'apporteur ne bouge pas
  });
});

describe('🔴 « Depuis toujours » : tous les dossiers recalculés, l’historique conservé', () => {
  const toujours: BaremeApporteur = { depuis: JOUR, taux: 0.2, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, toujours: true, ordre: 2 };
  it('elle remplace les versions enregistrées AVANT elle dans le calcul — elles restent dans la liste (historique)', () => {
    const a = cohen({ baremes: [v50, toujours] });
    expect(a.baremes).toHaveLength(2);
    expect(versionsEffectives(a.baremes)).toEqual([{ ...toujours, depuis: '0001-01-01', toujoursLe: JOUR }]);
    expect(baremeADate(a, '2021-04-01')?.taux).toBe(0.2);
    expect(totauxApporteurs(dossiers, [a], JOUR)[12].commission).toBeCloseTo(ca * 0.2, 6);
    expect(a.baremes.map((b) => libelleHistorique(b, libelleRegleApporteur(b)))).toEqual([
      '01/01/2021 → One shot — location 50 %, gestion 0 %', '24/10/2026 : remplacé depuis toujours par One shot — location 20 %, gestion 0 %']);
  });
  it('un dossier signé APRÈS garde ce qui y a été saisi ; une version datée enregistrée après la « depuis toujours » prend le relais à sa date', () => {
    const apres = dossier(9, '2026-11-02', 1000, { apporteurTaux: 0.3, commissionSaisie: 300 });
    const a = cohen({ baremes: [v50, toujours, { depuis: '2027-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 3 }] });
    expect(totauxApporteurs([apres], [a], JOUR)[12].commission).toBe(300);
    expect(baremeADate(a, '2027-02-01')?.taux).toBe(0.1);
    expect(baremeADate(a, '2026-12-01')?.taux).toBe(0.2);
  });
  it('une règle datée enregistrée AVANT une « depuis toujours » est remplacée, même si sa date est postérieure', () => {
    const a = cohen({ baremes: [v50, { depuis: '2027-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 2 }, { ...toujours, ordre: 3 }] });
    expect(baremeADate(a, '2027-06-01')?.taux).toBe(0.2);
  });
});

describe('🔴 la cascade des honoraires : juste au centime', () => {
  it('honoraires − apporteur − collègue = net, au centime, sur la carte comme par dossier', () => {
    const a = cohen({ remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'one_shot', taux: 0.0333, tauxGestion: 0, dureeAnnees: null }] });
    const t = totauxApporteurs(dossiers, [a], JOUR)[12];
    const c = cascadeAuCentime({ ca: t.ca, apporteur: t.commission, collegue: t.collegue });
    expect(c.ca).toBe(7134.01);
    expect(Math.round(c.ca * 100) - Math.round(c.apporteur * 100) - Math.round((c.collegue ?? 0) * 100)).toBe(Math.round(c.net * 100));
    // Par dossier : la somme des nets = le net de la carte (à l'arrondi de chaque terme près, dit au centime).
    const parDossier = dusParDossier(dossiers, [a], JOUR);
    expect(parDossier).toHaveLength(8);
    for (const d of parDossier) {
      const x = cascadeAuCentime({ ca: d.ca, apporteur: d.apporteur, collegue: d.collegue });
      expect(Math.round(x.ca * 100) - Math.round(x.apporteur * 100) - Math.round((x.collegue ?? 0) * 100)).toBe(Math.round(x.net * 100));
    }
    expect(cascade({ ca: 100, commission: 30, collegue: 5 })).toEqual({ ca: 100, apporteur: 30, collegue: 5, net: 65 });
  });
  it('des termes à demi-centime : le net affiché est la différence des termes AFFICHÉS (jamais un centime d’écart)', () => {
    expect(cascadeAuCentime({ ca: 1000.005, apporteur: 333.335, collegue: 33.335 })).toEqual({ ca: 1000.01, apporteur: 333.34, collegue: 33.34, net: 633.33 });
  });
  it('un INTERNE : pas de ligne collègue — honoraires − apporteur = net', () => {
    expect(cascadeAuCentime({ ca: 1000, apporteur: 50, collegue: null })).toEqual({ ca: 1000, apporteur: 50, collegue: null, net: 950 });
  });
});
