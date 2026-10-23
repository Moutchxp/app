import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireClasseurDetaille, type ClasseurLu } from './lectureExcel';
import { planifier, sourceDe, versActivite } from './planImport';
import { ONGLETS_MOIS, FUSIONNER_SECOND_BLOC } from './decisionsHistorique';
import { cumulApporteur, filtrer, totauxApporteurs, totauxPeriode, type ActiviteCalcul } from './tableauBord';
import type { Apporteur } from './suivi';

/**
 * 🔴 Arno (23/10/2026) — l'annuaire des apporteurs : pour chacun, le total depuis le début (dossiers, honoraires HT, dû HT ; le TTC
 * et le net se déduisent à l'écran), avec les règles du Suivi — et la preuve qu'il égale la somme des lignes du Suivi.
 */
const base = (id: string, o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: '2026-01-01', dateSupposee: false, libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 0, honoLocataireHt: 0,
  primeSaisie: 0, mandatGestion: false, categoriePrime: null, apporteurId: 3, apporteurNom: 'Kin Immo', apporteurTaux: null, commissionSaisie: null,
  negociateurId: 5, negociateurLibelle: 'N', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null,
  parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', collegueId: null, collegueLibelle: null, primeMode: 'aucune', ...o,
});
const kin: Apporteur = { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2020-01-01', taux: 0.1, coutFixeMensuel: 0 }] };

describe('🔴 Totaux d’un apporteur depuis le début', () => {
  it('dossiers (dont avenants), honoraires HT, dû HT (saisi, sinon au taux) ; les autres apporteurs ne comptent pas', () => {
    const lignes = [
      base('a', { dateSignature: '2021-03-01', honoProprietaireHt: 600, honoLocataireHt: 400, commissionSaisie: 100 }),
      base('b', { dateSignature: '2024-06-01', honoProprietaireHt: 250.5, honoLocataireHt: 0, type: 'avenant' }),           // au taux : 25,05
      base('c', { dateSignature: '2026-09-01', honoProprietaireHt: 1000, honoLocataireHt: 884, commissionSaisie: 188.4, rattachement: 'non_rattache' }),
      base('d', { dateSignature: '2026-09-01', honoProprietaireHt: 999, apporteurId: 4, apporteurNom: 'Autre' }),
    ];
    const c = cumulApporteur(lignes, [kin], 3);
    expect([c.total.nb, c.total.avenants]).toEqual([3, 1]);
    expect(c.total.ca).toBeCloseTo(3134.5, 6);
    expect(c.total.commission).toBeCloseTo(313.45, 6);
    expect(c.total.ca * 1.2).toBeCloseTo(3761.4, 6);                 // TTC (TVA 20 %)
    expect(c.total.ca - c.total.commission).toBeCloseTo(2821.05, 6);  // net pour l'agence HT
    expect(c.parAnnee.map((x) => x.annee)).toEqual([2026, 2024, 2021]);
    const t = totauxApporteurs(lignes, [kin]);
    expect(Object.keys(t)).toEqual(['3', '4']);
    expect({ ...t[3], ca: Math.round(t[3].ca * 100) / 100 }).toEqual({ nb: 3, avenants: 1, ca: 3134.5, commission: c.total.commission });
  });

  it('cohérent avec le Suivi : Frédéric Rousseau (« Apporteur A » des copies anonymisées), toutes années, égale la somme du Suivi', () => {
    // Les lignes de 2019 → 2026 telles que l'import les écrit ; Frédéric Rousseau y est l'apporteur le plus fréquent de chaque fichier.
    const activites: ActiviteCalcul[] = [2020, 2021, 2022, 2023, 2024, 2025, 2026].flatMap((annee) => {
      const c = JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
      const mois = lireClasseurDetaille(c, annee, { ongletsMois: ONGLETS_MOIS[sourceDe(annee)], fusionnerSecondBloc: FUSIONNER_SECOND_BLOC }).mois;
      return planifier(mois, [], { collaborateurs: [], dejaImportees: new Set(), bauxSuivis: new Set(), source: sourceDe(annee) })
        .map((p) => versActivite(p, { id: 5, libelle: 'N' }))
        .map((a) => ({ ...a, apporteurId: a.apporteurNom === 'Apporteur A' ? 1 : a.apporteurNom === null ? null : 2 }));
    });
    const rousseau: Apporteur = { id: 1, nom: 'Frédéric Rousseau', type: 'partenaire', archive: false, baremes: [{ depuis: '2019-01-01', taux: 0.1, coutFixeMensuel: 0 }] };
    const total = cumulApporteur(activites, [rousseau], 1).total;
    // Le Suivi, année par année, filtré sur cet apporteur : CA et honoraires d'apporteur.
    const annees = [...new Set(activites.map((a) => Number(a.dateSignature.slice(0, 4))))];
    const filtrees = filtrer(activites, { negociateur: null, apporteur: 1, gestion: null, origine: null });
    const suivi = annees.map((annee) => totauxPeriode(filtrees, { regles: [], apporteurs: [rousseau], retrocessions: [] }, { annee, mois: null }));
    expect(total.nb).toBe(suivi.reduce((s, t) => s + t.nb, 0));
    expect(total.nb).toBe(213);
    expect(Math.abs(total.ca - suivi.reduce((s, t) => s + t.ca, 0))).toBeLessThan(0.005);
    expect(Math.abs(total.commission - suivi.reduce((s, t) => s + t.apporteurs, 0))).toBeLessThan(0.005);
    expect(total.ca).toBeGreaterThan(100000);
  });
});
