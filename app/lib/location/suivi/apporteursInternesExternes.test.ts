import { describe, expect, it } from 'vitest';
import {
  aRattacher, badgeApporteur, estInterne, libelleRegleApporteur, libelleRemuneration, lireDuree, MOT_COLLEGUE_OBLIGATOIRE, MOT_DUREE, verifierApporteur, verifierRemuneration,
  type Apporteur,
} from './suivi';
import {
  collegueDeLigne, commissionApporteurDe, commissionCollegueMensuelleDe, commissionCollegueSignatureDe, moisDusApporteur, moisDusRecurrent, partGestionMensuelleDe,
  remunerationCollegueDe, totauxApporteurs, totauxPeriode, type ActiviteCalcul, type ContexteCalcul,
} from './tableauBord';
import { planPassageInterne, lireLiens, type ApporteurExamine, type CompteInterface } from './apporteursInternes';

/**
 * 🔴 Arno (24/10/2026, migration 419) — APPORTEURS INTERNES / EXTERNES, DURÉE DU RÉCURRENT, RÉMUNÉRATION DU COLLÈGUE DE RATTACHEMENT.
 * Les calculs (one shot, récurrent 1 an / N ans / indéterminé, fin de période), le versionnement, les refus, la commission du collègue
 * sur le BON dossier, et les totaux existants INCHANGÉS. Données fictives.
 */
const ligne = (o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400, primeSaisie: null,
  mandatGestion: true, categoriePrime: 'logement', apporteurId: 7, apporteurNom: 'DUPONT Léa', apporteurTaux: null, commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB',
  avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100, assurance: null, parking: false, vacanceJours: null,
  rattachement: 'rattache', origineContact: 'apporteur', tauxGestionBien: 5, finGestion: null, ...o,
});
// Honoraires de gestion mensuels du bail : (900 + 100) × 5 % = 50 € ; CA HT = 1 000 €.
const externe = (o: Partial<Apporteur> = {}): Apporteur => ({
  id: 7, nom: 'Léa Dupont', type: 'partenaire', archive: false, compteId: null,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0.2 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }], remunerations: [], ...o,
});

describe('🔴 la durée du « Récurrent » (1 an, N ans, indéterminée) et la fin de période', () => {
  it('1 an = 12 mois à partir du mois de signature ; 3 ans = 36 ; indéterminée = jusqu’au mois en cours', () => {
    const a = { dateSignature: '2026-03-10', finGestion: null };
    expect(moisDusRecurrent(a, '2030-01-15', 1)).toHaveLength(12);
    expect(moisDusRecurrent(a, '2030-01-15', 1).at(-1)).toBe('2027-02');
    expect(moisDusRecurrent(a, '2030-01-15', 3)).toHaveLength(36);
    expect(moisDusRecurrent(a, '2030-01-15', 3).at(-1)).toBe('2029-02');
    expect(moisDusRecurrent(a, '2030-01-15', null)).toHaveLength(47);   // mars 2026 → janvier 2030
    expect(moisDusRecurrent(a, '2030-01-15')).toEqual(moisDusRecurrent(a, '2030-01-15', null));   // absente : comme avant la 419
  });
  it('fin de période : jamais au-delà du mois en cours, ni de la sortie de gestion (la plus proche gagne)', () => {
    expect(moisDusRecurrent({ dateSignature: '2026-03-10', finGestion: null }, '2026-10-24', 3)).toHaveLength(8);   // mars → octobre 2026
    expect(moisDusRecurrent({ dateSignature: '2026-03-10', finGestion: '2026-07-01' }, '2030-01-01', 3)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });
  it('la durée est celle de la règle de l’apporteur EN VIGUEUR À LA SIGNATURE (versionnée, jamais rétroactive)', () => {
    const ap = externe({ baremes: [
      { depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1, dureeAnnees: 1 },
      { depuis: '2027-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1, dureeAnnees: 3 },
    ] });
    expect(moisDusApporteur(ligne(), [ap], '2031-01-01')).toHaveLength(12);   // signé en 2026 : la version d'alors (1 an)
    expect(moisDusApporteur(ligne({ dateSignature: '2027-02-01' }), [ap], '2031-01-01')).toHaveLength(36);
    expect(partGestionMensuelleDe(ligne(), [ap])).toBeCloseTo(5, 10);   // 10 % × 50 €
    // Le total de l'annuaire : 5 € × 12 mois de récurrent, en plus de la part location (10 % × 1 000 €).
    expect(totauxApporteurs([ligne()], [ap], '2031-01-01')[7].commission).toBeCloseTo(100 + 60, 8);
  });
  it('les règles d’avant la 419 (durée absente) : « Indéterminée », le calcul ne change pas', () => {
    const ap = externe({ baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1 }] });
    expect(moisDusApporteur(ligne(), [ap], '2026-10-24')).toEqual(moisDusRecurrent(ligne(), '2026-10-24'));
    expect(libelleRegleApporteur(ap.baremes[0])).toBe('Récurrent — location 10 %, gestion 10 % / mois, durée indéterminée');
    expect(libelleRegleApporteur({ ...ap.baremes[0], dureeAnnees: 3 })).toBe('Récurrent — location 10 %, gestion 10 % / mois, pendant 3 ans');
    expect(libelleRegleApporteur({ ...ap.baremes[0], dureeAnnees: 1 })).toBe('Récurrent — location 10 %, gestion 10 % / mois, pendant 1 an');
  });
  it('One shot (inchangé) : location + gestion × 12, une fois à la signature', () => {
    expect(commissionApporteurDe(ligne(), [externe()])).toBeCloseTo(1000 * 0.1 + 0.2 * 50 * 12, 10);
  });
  it('la saisie de la durée : années entières ≥ 1, ou « Indéterminée »', () => {
    expect(lireDuree('')).toBeNull();
    expect(lireDuree('indeterminee')).toBeNull();
    expect(lireDuree('3')).toBe(3);
    expect(lireDuree(1)).toBe(1);
    expect(lireDuree('0')).toBeUndefined();
    expect(lireDuree('2,5')).toBeUndefined();
    expect(verifierApporteur({ nom: 'X', type: 'partenaire', depuis: '2026-01-01', collegueId: 5, mode: 'recurrent', dureeAnnees: '0' })).toEqual({ ok: false, motif: MOT_DUREE });
    const v = verifierApporteur({ nom: 'X', type: 'partenaire', depuis: '2026-01-01', collegueId: 5, mode: 'recurrent', dureeAnnees: '3' });
    expect(v.ok && v.dureeAnnees).toBe(3);
  });
});

describe('🔴 interne / externe : rattachement', () => {
  it('externe sans collègue : REFUSÉ ; interne sans compte : refusé ; interne sans collègue : accepté (rattaché à personne)', () => {
    expect(verifierApporteur({ nom: 'Léa Dupont', type: 'partenaire', depuis: '2026-01-01' }, { collegueObligatoire: true })).toEqual({ ok: false, motif: MOT_COLLEGUE_OBLIGATOIRE });
    expect(verifierApporteur({ interne: true, depuis: '2026-01-01' }, { collegueObligatoire: true }).ok).toBe(false);
    const v = verifierApporteur({ interne: true, compteId: 5, collegueId: 9, depuis: '2026-01-01' }, { collegueObligatoire: true });
    expect(v.ok && { compteId: v.compteId, collegueId: v.collegueId, type: v.type }).toEqual({ compteId: 5, collegueId: null, type: 'collaborateur' });
  });
  it('un interne n’est jamais « à rattacher » ; ses dossiers sont les siens ; un rattachement d’AVANT reste celui de l’époque', () => {
    const interne: Apporteur = externe({ compteId: 5, nom: 'Jean-Baptiste Pons', collegues: [] });
    expect(estInterne(interne)).toBe(true);
    expect(aRattacher(interne)).toBe(false);
    expect(aRattacher(externe({ collegues: [] }))).toBe(true);
    expect(badgeApporteur(interne)).toBe('INTERNE');
    expect(badgeApporteur(externe())).toBe('PARTENAIRE EXTERNE');
    expect(collegueDeLigne(ligne(), [interne])).toEqual({ cle: 'id:5', libelle: 'Jean-Baptiste Pons' });
    const passe = externe({ compteId: 5, collegues: [{ depuis: '2020-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] });
    expect(collegueDeLigne(ligne({ dateSignature: '2025-05-01' }), [passe])).toEqual({ cle: 'id:2', libelle: 'Arnaud Jorel' });
    // Aucune rémunération de collègue pour un interne, même si une version traîne.
    expect(remunerationCollegueDe(ligne(), [{ ...interne, remunerations: [{ depuis: '2020-01-01', remunere: true, mode: 'one_shot', taux: 0.1, tauxGestion: 0, dureeAnnees: null }] }])).toBeNull();
  });
});

describe('🔴 la rémunération du collègue de rattachement', () => {
  const remu = (o: Partial<NonNullable<Apporteur['remunerations']>[number]> = {}) => ({ depuis: '2026-01-01', remunere: true, mode: 'one_shot' as const, taux: 0.05, tauxGestion: 0.1, dureeAnnees: null, ...o });
  it('« Aucune rémunération » par défaut (aucune version) et quand la version le dit', () => {
    expect(commissionCollegueSignatureDe(ligne(), [externe()])).toBe(0);
    expect(commissionCollegueSignatureDe(ligne(), [externe({ remunerations: [remu({ remunere: false })] })])).toBe(0);
    expect(libelleRemuneration(null)).toBe('Aucune rémunération');
  });
  it('One shot : CA × taux location + taux gestion × honoraires mensuels × 12, à la signature', () => {
    const ap = externe({ remunerations: [remu()] });
    expect(commissionCollegueSignatureDe(ligne(), [ap])).toBeCloseTo(1000 * 0.05 + 0.1 * 50 * 12, 10);
    expect(commissionCollegueMensuelleDe(ligne(), [ap])).toBe(0);
  });
  it('Récurrent 3 ans : la location à la signature, puis taux gestion × mensuels chaque mois pendant 36 mois', () => {
    const ap = externe({ remunerations: [remu({ mode: 'recurrent', dureeAnnees: 3 })] });
    expect(commissionCollegueSignatureDe(ligne(), [ap])).toBeCloseTo(50, 10);
    expect(commissionCollegueMensuelleDe(ligne(), [ap])).toBeCloseTo(5, 10);
    expect(totauxApporteurs([ligne()], [ap], '2035-01-01')[7].collegue).toBeCloseTo(50 + 5 * 36, 8);
    expect(libelleRemuneration(ap.remunerations![0])).toBe('Récurrent — location 5 %, gestion 10 % / mois, pendant 3 ans');
  });
  it('sur le BON dossier : seulement les dossiers de CET apporteur, signés sous une version « Rémunération », au collègue de l’époque', () => {
    const ap = externe({ remunerations: [remu({ depuis: '2026-06-01' })],
      collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }, { depuis: '2026-09-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] });
    const autre = externe({ id: 8, nom: 'Autre', remunerations: [] });
    expect(commissionCollegueSignatureDe(ligne({ dateSignature: '2026-03-10' }), [ap, autre])).toBe(0);   // avant la version : rien (jamais rétroactif)
    expect(remunerationCollegueDe(ligne({ dateSignature: '2026-07-10' }), [ap, autre])?.collegue.libelle).toBe('Jean-Baptiste Pons');
    expect(remunerationCollegueDe(ligne({ dateSignature: '2026-10-01' }), [ap, autre])?.collegue.libelle).toBe('Arnaud Jorel');   // changement daté
    expect(commissionCollegueSignatureDe(ligne({ dateSignature: '2026-07-10', apporteurId: 8 }), [ap, autre])).toBe(0);   // un autre apporteur
    expect(commissionCollegueSignatureDe(ligne({ dateSignature: '2026-07-10', apporteurId: null, apporteurNom: null }), [ap, autre])).toBe(0);
  });
  it('versionné : une nouvelle version ne touche que les dossiers signés à partir de sa date', () => {
    const ap = externe({ remunerations: [remu({ depuis: '2026-01-01', taux: 0.05, tauxGestion: 0 }), remu({ depuis: '2026-09-01', taux: 0.1, tauxGestion: 0 })] });
    expect(commissionCollegueSignatureDe(ligne({ dateSignature: '2026-08-31' }), [ap])).toBeCloseTo(50, 10);
    expect(commissionCollegueSignatureDe(ligne({ dateSignature: '2026-09-01' }), [ap])).toBeCloseTo(100, 10);
  });
  it('🔴 les totaux existants NE CHANGENT PAS (apporteurs, CA net) ; la ligne « collègues » est à part ; le VARIABLE retire la part collègue à la signature (Arno, 25/10/2026)', () => {
    const lignes = [ligne(), ligne({ id: 2, dateSignature: '2026-03-20', apporteurId: null, apporteurNom: null, origineContact: 'internet' })];
    const sans: ContexteCalcul = { regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [externe()], retrocessions: [], aujourdhui: '2026-10-24' };
    const avec: ContexteCalcul = { ...sans, apporteurs: [externe({ remunerations: [remu({ mode: 'recurrent', dureeAnnees: 1 })] })] };
    const a = totauxPeriode(lignes, sans, { annee: 2026, mois: 3 });
    const b = totauxPeriode(lignes, avec, { annee: 2026, mois: 3 });
    for (const k of ['ca', 'apporteurs', 'apporteursLocation', 'apporteursGestion', 'caNet', 'primes', 'retrocessions', 'apporteursRecurrents'] as const) {
      expect(b[k]).toBe(a[k]);
    }
    // 🔴 Arno (25/10/2026, accord écrit) — la base du négociateur retire ce qui est dû au collègue À LA SIGNATURE (50 €), pas son récurrent.
    expect(b.deductions - a.deductions).toBeCloseTo(50, 10);
    expect(a.commission - b.commission).toBeCloseTo(0.15 * 50, 10);
    expect(b.colleguesRecurrents).toBeCloseTo(5, 10);
    expect(a.collegues).toBe(0);
    expect(b.collegues).toBeCloseTo(50 + 5, 10);   // la location à la signature + le récurrent dû en mars
    expect(totauxPeriode(lignes, avec, { annee: 2026, mois: 4 }).collegues).toBeCloseTo(5, 10);   // avril : le récurrent seul
  });
  it('la saisie : aucune / rémunération (mode, taux saisis — 0 % accepté, vide refusé —, durée), date d’effet obligatoire', () => {
    expect(verifierRemuneration({ remunere: false, depuis: '2026-01-01' })).toEqual({ ok: true, r: { depuis: '2026-01-01', remunere: false, mode: 'one_shot', taux: 0, tauxGestion: 0, dureeAnnees: null } });
    expect(verifierRemuneration({ remunere: true, depuis: '2026-01-01', mode: 'recurrent', taux: '5', tauxGestion: '10', dureeAnnees: '3' }))
      .toEqual({ ok: true, r: { depuis: '2026-01-01', remunere: true, mode: 'recurrent', taux: 0.05, tauxGestion: 0.1, dureeAnnees: 3 } });
    expect(verifierRemuneration({ remunere: true, depuis: '2026-01-01', mode: 'one_shot', taux: '', tauxGestion: '' }).ok).toBe(false);
    // 🔴 Arno (24/10/2026) — 0 % est valide (les deux à 0 % aussi) ; un champ vide est refusé, avec un motif qui le dit.
    expect(verifierRemuneration({ remunere: true, depuis: '2026-01-01', mode: 'one_shot', taux: '0', tauxGestion: '0' }))
      .toEqual({ ok: true, r: { depuis: '2026-01-01', remunere: true, mode: 'one_shot', taux: 0, tauxGestion: 0, dureeAnnees: null } });
    expect(verifierRemuneration({ remunere: true, depuis: '2026-01-01', mode: 'one_shot', taux: '5', tauxGestion: '' })).toMatchObject({ ok: false, motif: expect.stringMatching(/gestion : saisissez un pourcentage \(0 est accepté\)/) });
    expect(verifierRemuneration({ remunere: true, mode: 'one_shot', taux: '5', tauxGestion: '0' }).ok).toBe(false);
    expect(verifierRemuneration({ remunere: true, depuis: '2026-01-01', mode: 'recurrent', taux: '5', tauxGestion: '0', dureeAnnees: '0' })).toEqual({ ok: false, motif: MOT_DUREE });
  });
});

describe('🔴 le script : passage en interne proposé, douteux listés sans être touchés', () => {
  const ap = (id: number, nom: string, o: Partial<ApporteurExamine> = {}): ApporteurExamine => ({ id, nom, type: 'partenaire', nomFamille: null, prenom: null, compteId: null, archive: false, ...o });
  const comptes: CompteInterface[] = [
    { id: 2, prenom: 'Arnaud', nom: 'Jorel', identifiant: 'a.jorel@exemple.fr', actif: true },
    { id: 4, prenom: 'Augustin', nom: 'Jorel', identifiant: 'au.jorel@exemple.fr', actif: true },
    { id: 5, prenom: 'Jean-Baptiste', nom: 'PONS', identifiant: 'jb.pons@exemple.fr', actif: true },
  ];
  it('nom exact (accents, casse, tirets, ordre) → à passer ; seul le nom de famille → douteux ; aucun compte → externe', () => {
    const plan = planPassageInterne([ap(1, 'Jean Baptiste Pons'), ap(2, 'JOREL Arnaud'), ap(3, 'M. Jorel'), ap(4, 'Catherine Tarisse'), ap(5, 'Léa', { type: 'collaborateur' }),
      ap(6, 'Arnaud Jorel', { archive: true }), ap(7, 'Augustin Jorel', { compteId: 4 })], comptes);
    expect(plan.map((d) => [d.apporteur.id, d.sorte, d.sorte === 'passer' ? d.compte.id : null])).toEqual([
      [1, 'passer', 5], [2, 'passer', 2], [3, 'douteux', null], [4, 'externe', null], [5, 'douteux', null]]);
  });
  it('deux apporteurs pour un même compte : celui déjà lié bloque l’autre (douteux) ; un lien forcé (--lier) tranche', () => {
    const deja = planPassageInterne([ap(1, 'Arnaud Jorel'), ap(9, 'Ancien', { compteId: 2 })], comptes);
    expect(deja[0]).toMatchObject({ sorte: 'douteux', raison: expect.stringMatching(/déjà l’apporteur interne « Ancien »/) });
    expect(planPassageInterne([ap(3, 'M. Jorel')], comptes, lireLiens('3:4'))[0]).toMatchObject({ sorte: 'passer', compte: { id: 4 } });
    expect(() => lireLiens('3-4')).toThrow(/illisible/);
  });
});
