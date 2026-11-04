import { describe, expect, it } from 'vitest';
import { activiteVide, atomesDesMois, atomesDuPoint, avecReunies, cleCollab, collaborateursProposes, FILTRES_GRAPHE_DEFAUT as D, filtresDepuisAdresse, filtresVersAdresse, MESURES_GRAPHE,
  nbFiltresActifs, NON_ATTRIBUE, separesEffectifs, seriesDuPoint, seriesParActivite, type ActiviteGraphe, type AtomeGraphe, type CollaborateursGraphe, type FiltresGraphe,
  type StructureGraphe } from './grapheGlobal';
import { espaceNegociateurs } from './carteAffaireLignes';
import { venteDansSociete } from './interCabinet';
import type { EntreesCoutsGlobaux } from './coutsGlobal';
import type { EntreesGlobalUnite } from './globalUnite';
import type { GestionMois, LigneVente, Partie, Vente } from './modele';

/**
 * 🔴 D33 (Arno, 03/11/2026) — les collaborateurs dans les boutons d'activité du graphique du CA global. Données fictives : une vente partagée entre
 * CRITERIMMO (Arnaud, entrée) et MACJ (Pierre, sortie) avec un apporteur externe ; une vente importée à deux co-négociateurs (CEDRIC, ARNAUD) ; une
 * vente MACJ de Pierre ; de la gestion. La règle : tout coché = le graphique d'avant au centime ; décocher retire exactement la part ;
 * collaborateurs + « Non attribué » = l'atome ; les coûts généraux ne se déduisent en « CA net » que si toute l'activité est cochée.
 */
const partie = (sorte: Partie['sorte'], compteId: number, negociateur: string, societe: Partie['societe'], pourcentage: number): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut: 'associe' });
const ligne = (id: number, negociateur: string, montantTtc: number): LigneVente => ({ id, negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true,
  origine: 'import', sourceFichier: null, sourceOnglet: negociateur, sourceLigne: id, note: null } as LigneVente);
const base = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 0, statut: 'vendue', annee: 2026, mois: 7, dateCompromis: null, apporteur: null,
  note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [], ...o } as Vente);
const VENTES: Vente[] = [
  base({ id: 1, libelle: 'PARTAGÉE', honorairesTtc: 12000, apporteur: 'Gardien Dacquet',
    repartition: { retroApporteurTtc: 1200, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] },
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 2, nom: 'Arnaud Jorel' }, sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] } }),
  base({ id: 2, libelle: 'CO-NÉGOCIATEURS', honorairesTtc: 6000, origine: 'import', lignes: [ligne(1, 'CEDRIC', 0), ligne(2, 'ARNAUD', 0)] }),
  base({ id: 3, libelle: 'MACJ', societe: 'macj', honorairesTtc: 3000, mois: 8, origine: 'import', lignes: [ligne(3, 'PIERRE', 900)] }),
];
const GESTION = [{ id: 1, annee: 2026, mois: 7, nbLots: null, honorairesHt: 500, adhocHt: 200, salarieHt: null, resteHt: 300, note: null, origine: 'import' }] as unknown as GestionMois[];
const eG = { ventes: VENTES, location: { '2026-07': 1000 }, gestion: GESTION } as unknown as EntreesGlobalUnite;
const statut = (l: string) => (l === 'PIERRE' || l === 'Pierre Thevenin' ? 'independant' as const : 'associe' as const);
const eC: EntreesCoutsGlobaux = { ventes: VENTES, retrocessions: [], statutDuLibelle: statut, location: null, gestion: GESTION, saisis: [] };
const CS: CollaborateursGraphe = {
  comptes: [{ id: 2, libelle: 'Arnaud Jorel', fonctions: ['vente'], societes: ['criterimmo'] }, { id: 8, libelle: 'Pierre Thevenin', fonctions: ['vente'], societes: ['macj'] },
    { id: 9, libelle: 'Cédric JULLIEN', fonctions: ['vente'], societes: ['criterimmo', 'macj'] }, { id: 5, libelle: 'Jean-Baptiste PONS', fonctions: ['location', 'vente'], societes: ['criterimmo'] }],
  libelles: { 'Arnaud Jorel': 2, ARNAUD: 2, 'Pierre Thevenin': 8, PIERRE: 8, CEDRIC: 9 } };
const proposesDe = (structures: readonly StructureGraphe[]) => Object.fromEntries((['vente', 'location', 'gestion'] as ActiviteGraphe[])
  .map((a) => [a, new Set(collaborateursProposes(CS, a, structures).map((c) => String(c.id)))])) as Record<ActiviteGraphe, Set<string>>;
const f = (o: Partial<FiltresGraphe> = {}): FiltresGraphe => ({ ...D, ...o });

describe('🔴 D33 — libellés', () => {
  it('« CA net (CA − coûts) » (le même calcul que l’ancien « Résultat net »)', () => {
    expect(MESURES_GRAPHE.map((m) => m.mot)).toEqual(['CA brut', 'Coûts', 'CA net (CA − coûts)']);
  });
});

describe('🔴 D33 — tout coché = le graphique d’avant, au centime', () => {
  it('chaque mois et l’année, chaque mesure, chaque choix de structures, chaque comparaison', () => {
    for (const mois of [7, 8, null]) {
      const avant = atomesDuPoint(eG, eC, 2026, mois, true);
      const apres = atomesDuPoint(eG, eC, 2026, mois, true, CS);
      for (const mesure of ['ca', 'net', 'couts'] as const) for (const structures of [['criterimmo'], ['macj'], ['criterimmo', 'macj']] as StructureGraphe[][])
        for (const comparer of ['n1', 'structures', 'activites'] as const) {
          const ff = f({ mesure, structures, comparer, activites: structures.includes('criterimmo') ? ['vente', 'location', 'gestion'] : ['vente'] });
          expect(seriesDuPoint(apres, ff, proposesDe(structures))).toEqual(seriesDuPoint(avant, ff));
        }
    }
  });
  it('chaque atome éclaté : collaborateurs + « Non attribué » = l’atome d’avant', () => {
    const avant = atomesDuPoint(eG, eC, 2026, 7, true);
    const apres = atomesDuPoint(eG, eC, 2026, 7, true, CS);
    for (const a of avant) {
      const parts = apres.filter((x) => x.structure === a.structure && x.activite === a.activite && x.famille === a.famille);
      expect(parts.reduce((t, x) => ({ htC: t.htC + x.m.htC, ttcC: t.ttcC + x.m.ttcC }), { htC: 0, ttcC: 0 })).toEqual(a.m);
    }
  });
});

describe('🔴 D33 — décocher un collaborateur retire EXACTEMENT sa part', () => {
  const tout = ['criterimmo', 'macj'] as StructureGraphe[];
  const caDe = (nom: string, s: StructureGraphe) => espaceNegociateurs(VENTES.filter((v) => v.mois === 7).map((v) => venteDansSociete(v, s)).filter((v): v is Vente => v !== null), s, { statutDuLibelle: statut })
    .filter((l) => CS.libelles[l.negociateur] !== undefined && CS.libelles[l.negociateur] === CS.libelles[nom]).reduce((t, l) => t + l.ca.htC, 0);
  it('CA brut, juillet : sans Arnaud = le total − son « CA généré » de l’Espace par négociateur (la vente partagée et sa part de la co-négociation)', () => {
    const at = atomesDuPoint(eG, eC, 2026, 7, true, CS);
    const tous = seriesDuPoint(at, f({ structures: tout }), proposesDe(tout)).total.htC;
    const sans = seriesDuPoint(at, f({ structures: tout, exclus: [cleCollab('vente', '2')] }), proposesDe(tout)).total.htC;
    expect(tous - sans).toBe(caDe('Arnaud Jorel', 'criterimmo') + caDe('Arnaud Jorel', 'macj'));
    expect(tous - sans).toBeGreaterThan(0);
  });
  it('tout décoché sauf « Non attribué » : il reste la part conservée par la structure (apporteur, inter-cabinet…) ; décoché aussi : la vente vaut 0', () => {
    const at = atomesDuPoint(eG, eC, 2026, 7, true, CS);
    const ex = ['2', '8', '9', '5'].map((c) => cleCollab('vente', c));
    const ff = (exclus: string[]) => f({ structures: tout, activites: ['vente'], exclus });
    const na = seriesDuPoint(at, ff(ex), proposesDe(tout)).total.htC;
    const collabs = seriesDuPoint(at, ff([cleCollab('vente', NON_ATTRIBUE)]), proposesDe(tout)).total.htC;
    expect(na + collabs).toBe(seriesDuPoint(at, ff([]), proposesDe(tout)).total.htC);
    expect(seriesDuPoint(at, ff([...ex, cleCollab('vente', NON_ATTRIBUE)]), proposesDe(tout)).total).toEqual({ htC: 0, ttcC: 0 });
  });
  it('un collaborateur non proposé (sa structure n’est pas cochée) compte dans « Non attribué »', () => {
    // MACJ seule : Arnaud (CRITERIMMO) n'est pas proposé ; Cédric (les deux) et Pierre le sont
    expect(collaborateursProposes(CS, 'vente', ['macj']).map((c) => c.libelle)).toEqual(['Cédric JULLIEN', 'Pierre Thevenin']);
    expect(collaborateursProposes(CS, 'location', ['macj'])).toEqual([]);
    expect(collaborateursProposes(CS, 'gestion', ['criterimmo'])).toEqual([]); // la gestion : aucune attribution
  });
});

describe('🔴 D33 — « CA net » filtré : les coûts généraux seulement quand toute l’activité est cochée', () => {
  it('la gestion (tout « Non attribué ») décochée : son CA sort ET ses coûts (ADHOC) ne sont plus déduits — comme si l’activité n’était pas cochée', () => {
    const at = atomesDuPoint(eG, eC, 2026, 7, true, CS);
    const tout = ['criterimmo', 'macj'] as StructureGraphe[];
    const filtre = seriesDuPoint(at, f({ mesure: 'net', structures: tout, exclus: [cleCollab('gestion', NON_ATTRIBUE)] }), proposesDe(tout)).total;
    const sansGestion = seriesDuPoint(at, f({ mesure: 'net', structures: tout, activites: ['vente', 'location'] }), proposesDe(tout)).total;
    expect(filtre).toEqual(sansGestion);
  });
  it('« Coûts » : les cases de collaborateurs n’y changent rien (la liste des coûts, D25)', () => {
    const at = atomesDuPoint(eG, eC, 2026, 7, true, CS);
    const tout = ['criterimmo', 'macj'] as StructureGraphe[];
    expect(seriesDuPoint(at, f({ mesure: 'couts', structures: tout, exclus: [cleCollab('vente', '2')] }), proposesDe(tout)))
      .toEqual(seriesDuPoint(at, f({ mesure: 'couts', structures: tout }), proposesDe(tout)));
  });
});

describe('🔴 D33 — l’adresse et « Réinitialiser »', () => {
  it('les cases décochées vont dans l’adresse (g-exclus) et reviennent ; une valeur inconnue est ignorée ; le réglage par défaut : rien', () => {
    const x = f({ exclus: ['vente:2', 'gestion:non_attribue'] });
    const adresse = filtresVersAdresse(x);
    expect(adresse['g-exclus']).toBe('vente:2,gestion:non_attribue');
    expect(filtresDepuisAdresse((k) => (k === 'g-exclus' ? 'vente:2,gestion:non_attribue,pirate:x' : adresse[k] ?? null)).exclus).toEqual(['vente:2', 'gestion:non_attribue']);
    expect(filtresVersAdresse(D)['g-exclus']).toBeNull();
    expect(nbFiltresActifs(x)).toBe(1);
    expect(nbFiltresActifs(D)).toBe(0);
  });
});

/**
 * 🔴 D36 (Arno, 04/11/2026) — LE CONTRÔLE DU FILTRE DES COLLABORATEURS ET UNE COURBE PAR COLLABORATEUR. Tout décoché = 0 € partout ; une activité
 * décochée en entier (« Non attribué » compris) compte comme exclue, coûts généraux compris ; « Séparés » : une série par case cochée, leur somme =
 * la série « Réunis » de l'activité, au centime ; N−1 : les mêmes séries, dans le même ordre ; l'adresse ; « Réinitialiser ».
 */
describe('🔴 D36 — tout décoché = 0 € ; une activité à 0/N = exclue', () => {
  const tout = ['criterimmo', 'macj'] as StructureGraphe[];
  const P = proposesDe(tout);
  const VENTE_0 = [...[...P.vente].map((c) => cleCollab('vente', c)), cleCollab('vente', NON_ATTRIBUE)];
  const TOUT_0 = [...VENTE_0, ...[...P.location].map((c) => cleCollab('location', c)), cleCollab('location', NON_ATTRIBUE), cleCollab('gestion', NON_ATTRIBUE)];
  const mois = atomesDesMois(eG, eC, 2026, true, 12, CS).mois;
  const somme = (xs: readonly AtomeGraphe[][], ff: FiltresGraphe) => xs.reduce((t, a) => { const m = seriesDuPoint(a, ff, P, CS).total; return { htC: t.htC + m.htC, ttcC: t.ttcC + m.ttcC }; }, { htC: 0, ttcC: 0 });
  it('toutes les cases de toutes les activités décochées : 0 € chaque mois et au cumul, CA brut et CA net, chaque comparaison, séries comprises', () => {
    for (const mesure of ['ca', 'net'] as const) for (const comparer of ['n1', 'activites', 'structures', 'rien'] as const) for (const separes of [[], ['vente', 'location', 'gestion']] as ActiviteGraphe[][]) {
      const ff = f({ mesure, comparer, structures: tout, exclus: TOUT_0, separes });
      for (const a of mois) {
        const r = seriesDuPoint(a, ff, P, CS);
        expect(r.total).toEqual({ htC: 0, ttcC: 0 });
        expect(r.series.every((x) => x.m.htC === 0 && x.m.ttcC === 0)).toBe(true);
      }
      expect(somme(mois, ff)).toEqual({ htC: 0, ttcC: 0 });
    }
    // et toutes les activités exclues
    expect(somme(mois, f({ structures: tout, activites: [] }))).toEqual({ htC: 0, ttcC: 0 });
    expect(somme(mois, f({ mesure: 'net', structures: tout, activites: [] }))).toEqual({ htC: 0, ttcC: 0 });
  });
  it('Vente 0/N seule décochée = Location + Gestion, au centime, chaque mois, CA brut et CA net (les coûts généraux de la vente non plus)', () => {
    for (const mesure of ['ca', 'net'] as const) {
      for (const a of mois) expect(seriesDuPoint(a, f({ mesure, structures: tout, exclus: VENTE_0 }), P, CS).total)
        .toEqual(seriesDuPoint(a, f({ mesure, structures: tout, activites: ['location', 'gestion'] }), P, CS).total);
      const loc = somme(mois, f({ mesure, structures: tout, activites: ['location'] })); const ges = somme(mois, f({ mesure, structures: tout, activites: ['gestion'] }));
      expect(somme(mois, f({ mesure, structures: tout, exclus: VENTE_0 }))).toEqual({ htC: loc.htC + ges.htC, ttcC: loc.ttcC + ges.ttcC });
    }
    expect(somme(mois, f({ structures: tout, exclus: VENTE_0 })).htC).toBeGreaterThan(0);
  });
  it('activiteVide : seulement quand toutes les cases ET « Non attribué » sont décochées', () => {
    expect(activiteVide({ exclus: VENTE_0 }, 'vente', P.vente)).toBe(true);
    expect(activiteVide({ exclus: VENTE_0.slice(1) }, 'vente', P.vente)).toBe(false);
    expect(activiteVide({ exclus: VENTE_0.slice(0, -1) }, 'vente', P.vente)).toBe(false);
    expect(activiteVide({ exclus: [cleCollab('gestion', NON_ATTRIBUE)] }, 'gestion', P.gestion)).toBe(true);
  });
});

describe('🔴 D36 — « Séparées » : une série par activité ; collaborateurs « Séparés » : une série par case cochée', () => {
  const tout = ['criterimmo', 'macj'] as StructureGraphe[];
  const P = proposesDe(tout);
  const at = atomesDuPoint(eG, eC, 2026, 7, true, CS);
  const cles = (ff: FiltresGraphe, a: readonly AtomeGraphe[] = at) => seriesDuPoint(a, ff, P, CS).series.map((x) => x.cle);
  it('« Activités entre elles » : une série par activité incluse ; « Réunies » : Vente et Location & Gestion', () => {
    expect(cles(f({ structures: tout, comparer: 'activites' }))).toEqual(['vente', 'location', 'gestion']);
    expect(cles(f({ structures: tout, comparer: 'activites', reunies: true }))).toEqual(['vente', 'location_gestion']);
    expect(cles(f({ structures: tout, comparer: 'activites', activites: ['vente', 'gestion'] }))).toEqual(['vente', 'gestion']);
  });
  it('Vente « Séparés » : ses collaborateurs (par nom), « Non attribué », puis les autres activités ; nuances de la couleur de la vente ; noms', () => {
    const r = seriesDuPoint(at, f({ structures: tout, comparer: 'activites', separes: ['vente'] }), P, CS).series;
    expect(r.map((x) => x.cle)).toEqual(['vente:2', 'vente:9', 'vente:5', 'vente:8', 'vente:non_attribue', 'location', 'gestion']);
    expect(r.map((x) => x.nom).slice(0, 5)).toEqual(['Arnaud Jorel', 'Cédric JULLIEN', 'Jean-Baptiste PONS', 'Pierre Thevenin', 'Non attribué (Vente)']);
    expect(r.slice(0, 5).map((x) => [x.couleur, x.nuance])).toEqual([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]]);
    expect(r[5]).not.toHaveProperty('nuance');
  });
  it('la somme des séries « Séparés » = la série « Réunis » de l’activité, au centime (chaque mois, l’année, CA brut et CA net) ; le total ne change pas', () => {
    for (const mois of [7, 8, null]) for (const mesure of ['ca', 'net'] as const) {
      const a = atomesDuPoint(eG, eC, 2026, mois, true, CS);
      const reunis = seriesDuPoint(a, f({ mesure, structures: tout, comparer: 'activites' }), P, CS);
      const separes = seriesDuPoint(a, f({ mesure, structures: tout, comparer: 'activites', separes: ['vente', 'gestion'] }), P, CS);
      for (const act of ['vente', 'gestion']) {
        const parts = separes.series.filter((x) => x.cle.startsWith(`${act}:`));
        expect(parts.reduce((t, x) => ({ htC: t.htC + x.m.htC, ttcC: t.ttcC + x.m.ttcC }), { htC: 0, ttcC: 0 })).toEqual(reunis.series.find((x) => x.cle === act)!.m);
      }
      expect(separes.total).toEqual(reunis.total);
      // en « CA net », les coûts généraux de l'activité : leur propre série
      expect(separes.series.some((x) => x.cle === 'vente:generaux')).toBe(mesure === 'net');
    }
  });
  it('décocher une case retire sa série ; la somme reste celle des cases cochées ; la gestion : une seule série « Non attribué »', () => {
    const ff = f({ structures: tout, comparer: 'activites', separes: ['vente', 'gestion'], exclus: [cleCollab('vente', '2')] });
    expect(cles(ff)).not.toContain('vente:2');
    expect(cles(ff).filter((c) => c.startsWith('gestion'))).toEqual(['gestion:non_attribue']);
    expect(seriesDuPoint(at, ff, P, CS).total).toEqual(seriesDuPoint(at, f({ structures: tout, exclus: [cleCollab('vente', '2')] }), P, CS).total);
  });
  it('« Année précédente » + « Séparés » : plusieurs séries (par activité), les mêmes clés dans le même ordre l’année d’avant (le pointillé N−1)', () => {
    const ff = f({ structures: tout, comparer: 'n1', separes: ['vente'] });
    expect(seriesParActivite(ff)).toBe(true);
    expect(seriesParActivite(f({ structures: tout }))).toBe(false);
    expect(cles(ff, atomesDuPoint(eG, eC, 2025, 7, true, CS))).toEqual(cles(ff));
  });
  it('« Structures » / « Familles » entre elles, « Coûts », une activité exclue : « Séparés » sans effet', () => {
    expect(separesEffectifs(f({ comparer: 'structures', separes: ['vente'] }))).toEqual([]);
    expect(separesEffectifs(f({ comparer: 'familles', mesure: 'couts', separes: ['vente'] }))).toEqual([]);
    expect(separesEffectifs(f({ mesure: 'couts', separes: ['vente'] }))).toEqual([]);
    expect(separesEffectifs(f({ activites: ['location'], separes: ['vente'] }))).toEqual([]);
    expect(seriesDuPoint(at, f({ structures: tout, comparer: 'structures', separes: ['vente'] }), P, CS)).toEqual(seriesDuPoint(at, f({ structures: tout, comparer: 'structures' }), P, CS));
  });
  it('« Réunis » (par défaut) : exactement le graphique d’avant', () => {
    for (const comparer of ['n1', 'activites', 'structures', 'rien'] as const)
      expect(seriesDuPoint(at, f({ structures: tout, comparer }), P, CS)).toEqual(seriesDuPoint(at, f({ structures: tout, comparer }), P));
  });
});

describe('🔴 D36 — l’adresse, « Réinitialiser », « Réunies »', () => {
  it('g-separes va dans l’adresse et revient ; une valeur inconnue est ignorée ; par défaut : rien ; un filtre actif', () => {
    const x = f({ separes: ['vente', 'location'] });
    expect(filtresVersAdresse(x)['g-separes']).toBe('vente,location');
    expect(filtresDepuisAdresse((k) => (k === 'g-separes' ? 'vente,pirate,location' : null)).separes).toEqual(['vente', 'location']);
    expect(filtresVersAdresse(D)['g-separes']).toBeNull();
    expect(filtresDepuisAdresse(() => null).separes).toEqual([]);
    expect(nbFiltresActifs(x)).toBe(1);
    expect(D.separes).toEqual([]);
  });
  it('« Réunies » : la location et la gestion « Séparés » ensemble (le bouton « Location & Gestion » n’a qu’une liste)', () => {
    expect(avecReunies(f({ separes: ['location'] }), true).separes).toEqual(['location', 'gestion']);
    expect(avecReunies(f({ separes: ['vente'] }), true).separes).toEqual(['vente']);
  });
});
