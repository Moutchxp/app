import { describe, expect, it } from 'vitest';
import { resumeDeLAnnee, resumeDuMoisComplet } from './resumePeriode';
import type { Apporteur, RegleCommission } from './suivi';
import type { ActiviteLue, ContexteCalcul, DonneesTableau } from './tableauBord';
import { netEnUnite } from '../../../(admin)/admin/(protected)/location/CascadeNegociateur';
import { sommesActivites } from '../../transaction/locationCa';

/**
 * 🔴 LOT LO8 (Arno, 01/11/2026) — LES COMMISSIONS D'APPORTEURS DU RÉSUMÉ, À LA RÈGLE DE LA PAGE « SUIVI CA › LOCATION » : chaque ligne arrondie au
 * centime (`montantsLigne`), puis additionnée. Trois baux de 100,05 € à 10 % (10,005 € chacun) : la page compte 3 × 10,01 = 30,03 € ; l'ancienne
 * somme en euros arrondie à la fin donnait 30,02 €. HT et TTC : « Honoraires d'apporteurs », externes / internes, chaque bénéficiaire, « CA HT
 * net », « Résultat net de l'agence », et l'année (la somme de ses mois) — tous = la page, au centime.
 */
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [
  { id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false },
  { id: 8, nom: 'Paul Interne', type: 'collaborateur', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false, compteId: 42 },
];
let n = 0;
const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 50.02, honoLocataireHt: 50.03,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: 7, apporteurNom: 'Agence Martin', apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'non_rattache', lotId: null, bailId: null, source: 'saisie', ...o,
} as ActiviteLue);
const lignes = [ligne({}), ligne({}), ligne({}), ligne({ apporteurId: 8, apporteurNom: 'Paul Interne' }), ligne({ apporteurId: 8, apporteurNom: 'Paul Interne' }),
  ligne({ dateSignature: '2026-08-03' }), ligne({ dateSignature: '2026-08-04', apporteurId: null, apporteurNom: null })];
const ctx: ContexteCalcul = { regles, apporteurs, retrocessions: [], aujourdhui: '2026-11-01' };
const d = { disponible: true, annee: 2026, annees: [2026], aujourdhui: '2026-11-01', activites: lignes, regles, apporteurs, retrocessions: [], negociateurs: [],
  gestion: { disponible: true, stock: 0, transitions: [] }, preavis: {}, voirCommissions: true, gestionLignes: [], gli: [], margesGli: [] } as unknown as DonneesTableau;

describe('🔴 LOT LO8 — le Résumé = la page Suivi CA › Location, au centime', () => {
  const r = resumeDuMoisComplet(d, lignes, ctx, '2026-09', null);
  const page = sommesActivites(lignes.filter((a) => a.dateSignature.startsWith('2026-09')), ctx);
  it('septembre : honoraires d’apporteurs 50,05 € HT (5 × 10,01), pas 50,03 € ; externes + internes, bénéficiaires, CA HT net — HT et TTC', () => {
    expect(page.apporteurs).toEqual({ htC: 5005, ttcC: 6005 });
    const v = r.ventilation;
    expect([v.externes.centimes, v.internes.centimes]).toEqual([3003, 2002]);
    expect([v.externes.centimes + v.internes.centimes, (v.externes.ttcC ?? 0) + (v.internes.ttcC ?? 0)]).toEqual([page.apporteurs.htC, page.apporteurs.ttcC]);
    expect([v.externes.ttcC, v.internes.ttcC]).toEqual([3603, 2402]);
    expect(v.externes.detail.map((b) => [b.nom, b.centimes, b.ttcC])).toEqual([['Agence Martin', 3003, 3603]]);
    expect(v.internes.detail.map((b) => [b.nom, b.centimes, b.ttcC])).toEqual([['Paul Interne', 2002, 2402]]);
    expect(Math.round(r.r.resultat.apporteurs * 100)).toBe(page.apporteurs.htC);
    expect(Math.round(r.r.resultat.caNet * 100)).toBe(page.netApporteurs.htC);
    // Résultat net de l'agence : ses commissions = la page ; en TTC, CA TTC − commissions TTC des lignes − variable TTC
    expect(r.net.apporteurs).toBe(page.apporteurs.htC);
    expect(r.net.ventilation.externes.ttcC).toBe(3603);
    const variable = r.net.variables.reduce((s, x) => s + Math.round(x.variable * 1.2), 0);
    expect(netEnUnite(r.net, r.dossiers.map((a) => ({ ca: a.honoProprietaireHt + a.honoLocataireHt }))).ttcC).toBe(page.ca.ttcC - page.apporteurs.ttcC - variable);
  });
  it('l’année (la somme de ses mois) = la page sur l’année, HT et TTC', () => {
    const a = resumeDeLAnnee(d, lignes, ctx, 2026, 10, null);
    const p = sommesActivites(lignes, ctx);
    expect([a.ventilation.externes.centimes + a.ventilation.internes.centimes, (a.ventilation.externes.ttcC ?? 0) + (a.ventilation.internes.ttcC ?? 0)]).toEqual([p.apporteurs.htC, p.apporteurs.ttcC]);
    expect(Math.round(a.r.resultat.caNet * 100)).toBe(p.netApporteurs.htC);
  });
});
