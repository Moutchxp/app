import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ciblesDeplacement, GROUPES_EN_BANDE, GROUPES_EN_ENCART, MOTIF_FICHE_SYNDIC, MOT_SYNDIC_A_LA_MAIN, MOT_SYNDIC_FICHE,
  peutDeposer, vientDeLaFicheSyndic, type CleGroupeParties,
} from './historiqueBien';
import { famillesDesParties, rangementsDesParties, type FicheAvecParties } from './familleDestinataire';
import { syndicauxDepuisJson } from './partiesSyndic';
import { sertALAutomatisation } from './partieCategorie';
import { tonDeLaFamille } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — LA RÈGLE DU GLISSER (DÉCISION D'ARNO DU 13/10/2026) ══
 *   1. une personne venue de la FICHE SYNDIC ne sort pas de « Syndic & immeuble » (ni glisser, ni menu) ;
 *   2. « Non affectés » et « Tiers indépendant » peuvent être déposés dans « Syndic & immeuble » ;
 *   3. ce dépôt est un SIMPLE CLASSEMENT LOCAL, pour CE bien seulement ;
 *   4. une personne classée à la main en « Syndic & immeuble » se re-déplace vers les autres familles.
 * PUR, données inventées.
 */
const TOUS: CleGroupeParties[] = [...GROUPES_EN_ENCART, ...GROUPES_EN_BANDE];

describe('chaque combinaison, dans les deux sens', () => {
  it('avec la migration 344 : tout vers tout, sauf son propre groupe ; « Syndic & immeuble » depuis Non affectés et Tiers seulement', () => {
    const permis: string[] = [];
    for (const d of TOUS) for (const v of TOUS) if (peutDeposer(d, v, { syndicLocal: true })) permis.push(`${d}→${v}`);
    expect(permis.sort()).toEqual([
      'a_repartir→independant', 'a_repartir→locataire', 'a_repartir→proprietaire', 'a_repartir→syndic_immeuble',
      'independant→a_repartir', 'independant→locataire', 'independant→proprietaire', 'independant→syndic_immeuble',
      'locataire→a_repartir', 'locataire→independant', 'locataire→proprietaire',
      'proprietaire→a_repartir', 'proprietaire→independant', 'proprietaire→locataire',
      /* Une personne CLASSÉE À LA MAIN dans « Syndic & immeuble » repart vers toutes les autres familles. */
      'syndic_immeuble→a_repartir', 'syndic_immeuble→independant', 'syndic_immeuble→locataire', 'syndic_immeuble→proprietaire',
    ].sort());
  });
  it('sans la migration 344 : « Syndic & immeuble » n’accepte rien — exactement la règle d’avant ce lot', () => {
    for (const d of TOUS) expect(peutDeposer(d, 'syndic_immeuble', { syndicLocal: false }), d).toBe(false);
  });
  it('le menu « Déplacer vers… » suit la même règle ; sans l’option, il est celui d’avant, au mot près', () => {
    for (const d of TOUS) {
      expect(ciblesDeplacement(d).map((c) => c.cle), `avant ${d}`)
        .toEqual(TOUS.filter((c) => c !== d && c !== 'syndic_immeuble'));
      expect(ciblesDeplacement(d, { syndicLocal: true }).map((c) => c.cle), `après ${d}`)
        .toEqual(TOUS.filter((c) => peutDeposer(d, c, { syndicLocal: true })));
    }
    expect(ciblesDeplacement('independant', { syndicLocal: true }).map((c) => c.titre)).toContain('Syndic & immeuble');
  });
  it('« Notre agence » est exclue : ce n’est pas un groupe de parties, ni source ni destination', () => {
    expect(TOUS).not.toContain('agence');
    for (const d of TOUS) expect(ciblesDeplacement(d, { syndicLocal: true }).map((c) => c.cle as string)).not.toContain('agence');
    const hdb = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(hdb).toContain("hdb-groupe hdb-groupe--nous hdb-groupe--bande${pendantGlisser ? ' hdb-groupe--interdit' : ''}");
  });
});

describe('🔴 la capsule issue de la fiche syndic n’est pas déplaçable', () => {
  const SYNDICAUX = syndicauxDepuisJson([{ adresse: 'Gestion@Cabinet.fr', role: 'Syndic — Cabinet', nom: 'Cabinet', partiLe: null }]);
  it('dans « Syndic & immeuble » : fiche syndic ⇒ fixe ; classée à la main ⇒ déplaçable', () => {
    expect(vientDeLaFicheSyndic(' gestion@cabinet.fr ', 'syndic_immeuble', SYNDICAUX)).toBe(true);
    expect(vientDeLaFicheSyndic('voisin@x.fr', 'syndic_immeuble', SYNDICAUX)).toBe(false);
    /* Hors de ce groupe (rôle client qui l'emporte), la règle ne s'applique pas. */
    expect(vientDeLaFicheSyndic('gestion@cabinet.fr', 'proprietaire', SYNDICAUX)).toBe(false);
  });
  it('la bulle et les deux mentions, au mot près', () => {
    expect(MOTIF_FICHE_SYNDIC).toBe('Contact issu de la fiche syndic — modifiable depuis la fiche syndic');
    expect([MOT_SYNDIC_FICHE, MOT_SYNDIC_A_LA_MAIN]).toEqual(['fiche syndic', 'classée à la main']);
  });
  it('à l’écran : ni glisser ni menu pour elle, et sa bulle le dit', () => {
    const hdb = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
    expect(hdb).toContain('const deplacable = partieDeplacable(i.adresse, p.categoriesFiche, i.interne) && !deLaFicheSyndic;');
    expect(hdb).toContain('title={deplacable ? undefined : deLaFicheSyndic ? MOTIF_FICHE_SYNDIC : MOTIF_NON_DEPLACABLE}');
    /* Le menu n'est rendu que pour une capsule déplaçable (règle d'avant, inchangée). */
    expect(hdb).toMatch(/\{deplacable && \(\s*<MenuDeplacer/);
  });
});

describe('🔴 un classement LOCAL : ce bien, et lui seul', () => {
  const FICHE: FicheAvecParties = { proprietaires: [], proprietaireContacts: [], occupants: [], occupations: [] };
  it('rangé « syndic & immeuble » sur ce bien ⇒ rose ici ; l’autre bien du même immeuble garde le Tiers indépendant (global)', () => {
    /* Le même tiers, rangé indépendant en global, puis classé « syndic & immeuble » sur le bien 343 seulement : la
       lecture d'un bien ne rend que SA ligne (la portée de la base), et la ligne du bien l'emporte sur la globale. */
    const bien343 = rangementsDesParties([{ adresse: 'tiers@x.fr', categorie: 'syndic_immeuble' }]);
    const bien344 = rangementsDesParties([{ adresse: 'tiers@x.fr', categorie: 'independant' }]);
    expect(tonDeLaFamille(famillesDesParties(FICHE, bien343, new Map()).get('tiers@x.fr'))).toBe('syndic');
    expect(tonDeLaFamille(famillesDesParties(FICHE, bien344, new Map()).get('tiers@x.fr'))).toBe('independant');
  });
  it('« non affectée » n’est toujours pas un rangement ; « syndic & immeuble » rangé à la main en est un', () => {
    expect([...rangementsDesParties([
      { adresse: 'a@x.fr', categorie: 'a_repartir' }, { adresse: 'b@x.fr', categorie: 'syndic_immeuble' },
    ])]).toEqual([['b@x.fr', 'syndic_immeuble']]);
  });
  it('🔒 il ne sert JAMAIS à l’automatisation (aucune déduction de bien depuis cette adresse)', () => {
    expect(sertALAutomatisation('syndic_immeuble')).toBe(false);
  });
  it('la migration 344 n’élargit que la contrainte : aucune donnée écrite, aucune autre table', () => {
    const sql = readFileSync('db/migrations/344_gestion_partie_syndic_local.sql', 'utf8').replace(/--[^\n]*/g, ' ');
    for (const v of ['UPDATE ', 'INSERT ', 'DELETE ', 'TRUNCATE', 'DROP TABLE', 'gestion_syndic', 'gestion_copropriete']) {
      expect(sql, v).not.toContain(v);
    }
    expect(sql.replace(/\s+/g, ' ')).toContain(
      "ARRAY['proprietaire', 'locataire', 'ancien_locataire', 'independant', 'a_repartir', 'syndic_immeuble']");
  });
});
