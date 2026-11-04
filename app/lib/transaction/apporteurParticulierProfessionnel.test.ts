import { describe, expect, it } from 'vitest';
import { caNetVente, lignesCarteAffaire, resultatDesCartes } from './carteAffaireLignes';
import { centimesRepartition } from './repartition';
import { coutsVente } from './coutsGlobal';
import { parApporteur, type Partie, type Retrocession, type Vente } from './modele';
import { avecTvaA, poserApporteurs, poserApporteursRetros, type TypesApporteurs } from './repo';
import { coutsLocationMois, ligneLocationCa, montantsLigne } from './locationCa';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import { changementsFiche, ficheDe, verifierFiche } from '../location/suivi/ficheApporteur';

/**
 * 🔴 D38 (Arno, 04/11/2026, migration 455) — L'APPORTEUR PARTICULIER OU PROFESSIONNEL (remplace « externe = sans TVA » de D29).
 *   · Particulier : commission SANS TVA (versé = HT = TTC) et la ligne « TVA non récupérable » (TTC seulement) ;
 *   · Professionnel : commission AVEC TVA (TTC = HT × 1,2), aucune TVA non récupérable ;
 *   · rétrocession sans fiche : Professionnel par défaut ; rattachée à une vente dont l'apporteur est nommé : son statut ; un statut choisi à la main prime ;
 *   · primes de gestion (variable du négociateur en location) : sans TVA ; inter-cabinet et partages entre collaborateurs : avec TVA, inchangés.
 * Données fictives.
 */
const C = (htC: number, ttcC: number) => ({ htC, ttcC });
const partie = (sorte: Partie['sorte'], compteId: number | null, negociateur: string | null, societe: Partie['societe'], pourcentage: number, nom: string | null = null): Partie =>
  ({ sorte, compteId, negociateur, societe, nom, coordonnees: null, pourcentage, montantHt: null, statut: 'associe' });
const vente = (o: Partial<Vente> = {}): Vente => ({ id: 37, societe: 'criterimmo', libelle: 'TEST TRANSACTION', honorairesTtc: 7500, statut: 'vendue', annee: 2026, mois: 6,
  dateCompromis: '2026-03-28', apporteur: 'Gardien Dacquet', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
  repartition: { retroApporteurTtc: 1200, parties: [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 50), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50)] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 9, nom: 'Cédric JULLIEN' }, sortie: { id: 2, nom: 'Arnaud Jorel' }, apporteurId: 16, personnes: [] },
  ...o } as Vente);
const retro = (id: number, o: Partial<Retrocession> = {}): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 6, negociateur: 'CEDRIC', montantTtc: 1200,
  apporteur: null, venteId: null, libelle: null, origine: 'import', sourceOnglet: 'CEDRIC', sourceCellule: 'J3', ...o });
/** L'annuaire après la 455 : 16 Particulier, 24 Professionnel, 21 collaborateur (compte). */
const types: TypesApporteurs = { d38: true,
  parId: new Map([[16, { compteId: null, interneDepuis: null }], [24, { compteId: null, interneDepuis: null, professionnel: true }], [21, { compteId: 9, interneDepuis: null }]]),
  parNom: new Map([['gardien dacquet', { compteId: null, interneDepuis: null }], ['agence du parc', { compteId: null, interneDepuis: null, professionnel: true }]]) };
const poser = (v: Vente): Vente => poserApporteurs([v], types)[0];

describe('🔴 D38 — la règle : avec ou sans TVA', () => {
  it('Particulier : sans ; Professionnel et collaborateur : avec ; aucune fiche : Professionnel (avec la 455), sans TVA sans elle (D29)', () => {
    expect([avecTvaA(types.parId.get(16), '2026-06-01', types), avecTvaA(types.parId.get(24), '2026-06-01', types), avecTvaA(types.parId.get(21), '2026-06-01', types),
      avecTvaA(undefined, '2026-06-01', types), avecTvaA(undefined, '2026-06-01', {})]).toEqual([false, true, true, true, false]);
  });
});

describe('🔴 D38 — une vente : apporteur Particulier (1 200 € versés, sans TVA)', () => {
  const v = poser(vente());
  it('HT = TTC = 1 200 ; base HT 6 250 − 1 200 = 5 050 ; parts TTC = HT × 1,2 ; TVA non récupérable 240 € TTC (0 en HT)', () => {
    expect(v.apporteurInterne).toBeUndefined();
    const l = lignesCarteAffaire(v, 'criterimmo');
    expect(l.apporteur).toEqual(C(120000, 120000));
    expect(l.tva).toEqual(C(0, 24000));
    expect(l.lignes.map((x) => x.honoraires)).toEqual([C(252500, 303000), C(252500, 303000)]);
    const r = resultatDesCartes([v], 'criterimmo');
    expect([r.retro, r.tvaApporteur, r.reste]).toEqual([C(120000, 120000), C(0, 24000), C(505000, 606000)]);
  });
});

describe('🔴 D38 — une vente : apporteur Professionnel (1 200 € TTC facturés)', () => {
  const v = poser(vente({ apporteur: 'Agence du Parc', dossier: { ...vente().dossier!, apporteurId: 24 } }));
  it('TTC = HT × 1,2 (1 000 HT, 1 200 TTC) ; base HT 5 250 ; AUCUNE ligne de TVA non récupérable', () => {
    expect([v.apporteurInterne, v.repartition!.apporteurInterne]).toEqual([true, true]);
    const l = lignesCarteAffaire(v, 'criterimmo');
    expect(l.apporteur).toEqual(C(100000, 120000));
    expect(l.tva ?? null).toBeNull();
    expect(l.lignes.map((x) => x.honoraires)).toEqual([C(262500, 315000), C(262500, 315000)]);
    const r = resultatDesCartes([v], 'criterimmo');
    expect([r.retro, r.tvaApporteur, r.reste]).toEqual([C(100000, 120000), C(0, 0), C(525000, 630000)]);
    expect(caNetVente(v, 'criterimmo')).toEqual(C(525000, 630000));
  });
  it('les centimes de la répartition : en TTC, 7 500 = parts 6 300 + apporteur 1 200, sans TVA perdue', () => {
    const t = centimesRepartition(v.repartition!.parties, 7500, 1200, 'criterimmo', 'ttc', true)!;
    expect([t.apporteurHt, t.tvaApporteur, t.baseHt, t.parts]).toEqual([1200, 0, 6300, [3150, 3150]]);
  });
});

describe('🔴 D38 — inter-cabinet, partage entre collaborateurs, agence extérieure : TOUJOURS avec TVA (TTC = HT × 1,2)', () => {
  const parties = [partie('entree', 9, 'Cédric JULLIEN', 'criterimmo', 40), partie('sortie', 5, 'Myriam', 'macj', 40), partie('exterieure', null, null, null, 20, 'Agence du Lac')];
  for (const [mot, apporteurId, interne] of [['Particulier', 16, false], ['Professionnel', 24, true]] as const) {
    it(`apporteur ${mot} : chaque part (collaborateur, inter-cabinet, agence extérieure) a TTC = HT × 1,2 au centime`, () => {
      const h = centimesRepartition(parties, 7500, 1200, 'criterimmo', 'ht', interne)!;
      const t = centimesRepartition(parties, 7500, 1200, 'criterimmo', 'ttc', interne)!;
      h.parts.forEach((x, i) => expect(t.parts[i]).toBeCloseTo(x * 1.2, 2));
      const v = poser(vente({ repartition: { retroApporteurTtc: 1200, parties }, dossier: { ...vente().dossier!, apporteurId } }));
      const l = lignesCarteAffaire(v, 'criterimmo');
      for (const x of l.lignes) {
        if (x.reverse) expect(x.reverse.m.ttcC).toBe(Math.round(x.reverse.m.htC * 1.2));
        for (const e of x.exterieures) expect(e.m.ttcC).toBe(Math.round(e.m.htC * 1.2));
      }
    });
  }
});

describe('🔴 D38 — les rétrocessions saisies au mois', () => {
  const ventes = new Map([[200, { apporteurId: 16, apporteur: null }], [201, { apporteurId: 24, apporteur: null }]]);
  it('sans nom ni vente : Professionnel ; rattachée à une vente d’un Particulier : sans TVA ; d’un Professionnel : avec ; le statut choisi à la main prime', () => {
    const rs = poserApporteursRetros([retro(1), retro(2, { venteId: 200 }), retro(3, { venteId: 201 }), retro(4, { statutApporteur: 'particulier' }),
      retro(5, { venteId: 200, statutApporteur: 'professionnel' }), retro(6, { apporteur: 'Gardien Dacquet' })], types, ventes);
    expect(rs.map((r) => r.interne)).toEqual([true, undefined, true, undefined, true, undefined]);
  });
  it('sans la 455 (aucun statut lu) : la règle D29, toutes sans TVA', () => {
    const rs = poserApporteursRetros([retro(1), retro(2, { venteId: 201 })], { parId: new Map(), parNom: new Map() }, new Map());
    expect(rs.map((r) => r.interne)).toEqual([undefined, undefined]);
  });
  it('tableau par apporteur : un Professionnel ÷ 1,2 (avec TVA) ; un Particulier « sans TVA »', () => {
    const imp = vente({ id: 200, repartition: null, dossier: null, apporteur: null });
    const [pro] = parApporteur(poserApporteursRetros([retro(1, { venteId: 200 })], types, new Map()), [imp]);
    expect([pro.retroHt, pro.sansTva]).toEqual([1000, false]);
    const [part] = parApporteur(poserApporteursRetros([retro(2, { venteId: 200, statutApporteur: 'particulier' })], types, new Map()), [imp]);
    expect([part.retroHt, part.sansTva]).toEqual([1200, true]);
  });
});

describe('🔴 D38 — une seule comptabilité : « Les coûts » / Coûts globaux = Résultat de l’agence (Suivi CA, Mon espace) au centime', () => {
  const ventesLues = poserApporteurs([vente(), vente({ id: 38, apporteur: 'Agence du Parc', dossier: { ...vente().dossier!, apporteurId: 24 } })], types);
  const rs = poserApporteursRetros([retro(1, { venteId: 37 }), retro(2, { venteId: 38 })], types, new Map([[37, { apporteurId: 16, apporteur: null }], [38, { apporteurId: 24, apporteur: null }]]));
  it('apporteurs des coûts = rétrocessions + TVA non récupérable du Résultat ; CA − coûts = CA net = reste, HT et TTC', () => {
    const c = coutsVente(ventesLues, { retros: rs }, 'criterimmo');
    const r = resultatDesCartes(ventesLues, 'criterimmo', { retros: rs });
    for (const u of ['htC', 'ttcC'] as const) {
      expect(c.apporteurs[u]).toBe(r.retro[u] + r.tvaApporteur[u]);
      expect(c.ca[u] - c.commissions[u] - c.apporteurs[u] - c.exterieures[u]).toBe(c.net[u]);
    }
    // 37 (Particulier) : 1 200 + rétro 1 200 sans TVA, 480 de TVA non récupérable ; 38 (Professionnel) : 1 000 + 1 000 HT, 2 400 TTC
    expect([r.retro, r.tvaApporteur]).toEqual([C(440000, 480000), C(0, 48000)]);
  });
});

describe('🔴 D38 — la Location : prime de gestion sans TVA ; commission d’un Particulier sans TVA, d’un Professionnel avec', () => {
  const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
  const apporteurs: Apporteur[] = [
    { id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false, statutTva: 'professionnel' },
    { id: 8, nom: 'Léa MARTIN', type: 'partenaire', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false, statutTva: 'particulier' },
    { id: 9, nom: 'Sans 455', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
  const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
    id: 1, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500, honoLocataireHt: 400,
    primeSaisie: null, mandatGestion: true, avecGestion: true, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
    negociateurLibelle: 'Jean-Baptiste PONS', origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
    vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [], locataires: [], ...o });
  const ctx = { regles, apporteurs };
  it('prime 150 € : HT = TTC (élément du salaire) ; Particulier 90 € : HT = TTC ; Professionnel 90 € HT : 108 € TTC ; sans la 455 : sans TVA (LO14)', () => {
    const [pro, part, avant] = [7, 8, 9].map((id) => montantsLigne(ligne({ apporteurId: id }), ctx));
    expect(pro.primeC).toEqual(C(15000, 15000));
    expect([pro.apporteurC, part.apporteurC, avant.apporteurC]).toEqual([C(9000, 10800), C(9000, 9000), C(9000, 9000)]);
  });
  it('le CA net TTC baisse de la TVA du Professionnel, le HT ne bouge pas ; le variable du négociateur (HT) est le même', () => {
    const lp = ligneLocationCa(ligne({ apporteurId: 7 }), ctx); const lq = ligneLocationCa(ligne({ apporteurId: 8 }), ctx);
    expect([lp.netC.htC, lp.netC.ttcC - lq.netC.ttcC, lp.variableC]).toEqual([lq.netC.htC, -1800, lq.variableC]);
  });
  it('la part de gestion récurrente : sans TVA pour un Particulier, avec pour un Professionnel ; les collègues : sans TVA (LO15)', () => {
    const c = coutsLocationMois([], [], null, true, { partGestionHt: 300, partGestionProHt: 100, colleguesHt: 50 });
    expect([c.partGestion, c.collegues]).toEqual([C(30000, 32000), C(5000, 5000)]);
    expect(coutsLocationMois([], [], null, true, { partGestionHt: 300, colleguesHt: 0 }).partGestion).toEqual(C(30000, 30000));
  });
});

describe('🔴 D38 — la fiche : le statut TVA', () => {
  const a: Apporteur = { id: 16, nom: 'Gardien Dacquet', type: 'partenaire', baremes: [], archive: false, statutTva: 'particulier', nomFamille: 'Dacquet', prenom: 'Gardien' };
  it('lu dans la fiche ; vérifié (l’un des deux) ; absent de l’envoi : aucun changement ; changé : une ligne « Statut TVA » (journal)', () => {
    expect(ficheDe(a).statutTva).toBe('particulier');
    expect(verifierFiche({ ...ficheDe(a), statutTva: 'autre' })).toMatchObject({ ok: false });
    const { statutTva: _s, ...sans } = ficheDe(a);
    expect(changementsFiche(ficheDe(a), sans)).toEqual([]);
    expect(changementsFiche(ficheDe(a), { ...ficheDe(a), statutTva: 'professionnel' }))
      .toEqual([{ cle: 'statutTva', champ: 'Statut TVA', avant: 'Particulier (sans TVA)', apres: 'Professionnel (avec TVA)' }]);
  });
});
