/**
 * ══ 🔴🔴 L'ENCART DU BIEN MODIFIABLE SUR PLACE (Arno, 21/10/2026) — VRAIE BASE ══════════════════════════════════════════════════
 *
 *   ① une seule source : ce que l'encart enregistre, la fiche (« Nouveau bien », section Le bien) le lit, et l'inverse ;
 *   ② les écritures de « Nouveau bien » : leurs contrôles (nombre de pièces hors bornes refusé : rien d'écrit ni de journalisé) ;
 *   ③ le digicode est porté par l'immeuble : modifié depuis l'encart d'un bien, l'autre bien de l'adresse le voit ;
 *   ④ l'Historique du bien : « Champ : ancienne → nouvelle », qui et quand.
 *
 * VRAIE base — COPIE jetable (jamais la base de dev ni la prod) ; aucun appel réseau (fetch refusé) :
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_statut403 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/encartBien.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool } from '../db/client';
import { creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { ficheBienLocation } from './locationRepo';
import { lireEncartBien, modificationsEncart, modifierEncartBien } from './encartBienRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest encart' };
const S = `e${Date.now().toString(36)}`;
const DPE = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const valeurs = async (id: number) => ok(await lireEncartBien(id)).valeurs;
afterAll(async () => { if (baseEssai) await closePool(); });
beforeAll(() => { globalThis.fetch = (async () => { throw new Error('aucun appel réseau dans cet essai'); }) as typeof fetch; });

describe.skipIf(!baseEssai)('🔴🔴 l’encart du bien, une seule source (vraie base)', () => {
  let b1 = 0; let b2 = 0;
  beforeAll(async () => {
    const p = ok(await creerProprietaires({ cartes: [{ nom: `ENCART${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 09 09 09 09', libelle: 'Mobile' }, { sorte: 'email', valeur: `encart${S}@exemple.test`, libelle: 'E-mail' }] }],
      enGestion: true, numeroMandat: `MG ${S}` }, AUTEUR)).ids[0];
    const adresse = `9 rue Encart${S}`;
    b1 = ok(await creerBienComplet({ proprietaireIds: [p], enGestion: true, logement: { adresse, ...DPE, famille: 'logement', typeLogement: 'appartement', nombrePieces: '3' }, annexes: [] }, AUTEUR)).logementId;
    b2 = ok(await creerBienComplet({ proprietaireIds: [p], enGestion: true, logement: { adresse, ...DPE, famille: 'logement', typeLogement: 'studio' }, annexes: [] }, AUTEUR)).logementId;
  });

  it('① l’encart écrit, la fiche lit (base et compléments) ; la fiche écrit, l’encart lit', async () => {
    const r = ok(await modifierEncartBien(b1, 'caracteristiques', { ...(await valeurs(b1)), etage: '3', nombrePieces: '4', surfaceCarrezM2: '41,8' }, AUTEUR));
    expect(r.changements.map((c) => c.cle)).toEqual(['nombrePieces', 'etage', 'surfaceCarrezM2']);
    const f = ok(await ficheBienLocation(b1));
    expect([f.bien.etage, f.bien.surfaceCarrezM2, f.complements?.nombrePieces]).toEqual(['3', 41.8, 4]);
    // L'autre sens : la section « Le bien » (même écriture que « Nouveau bien ») change le commentaire.
    const c = f.complements!;
    ok(await modifierComplementsBien(b1, { batiment: c.batiment ?? '', escalier: '', typeLogement: 'appartement', nombrePieces: '4', meuble: '', surfaceHabitableM2: '',
      syndicId: '', epoqueConstruction: '', chauffage: '', dpeClasse: 'D', dpeDate: '2024-03-01', commentaire: 'Depuis la section', typeLocal: '', parkingSituation: '',
      parkingType: '', surfaceM2: '', ascenseur: '', digicode: '', digicodeCode: '', precisionAcces: '' }, AUTEUR));
    expect((await valeurs(b1)).commentaire).toBe('Depuis la section');
    expect((await valeurs(b1)).etage).toBe('3');
  });

  it('② un contrôle de « Nouveau bien » refuse : rien n’est écrit, rien n’est journalisé', async () => {
    const avant = (await modificationsEncart(b1)).length;
    const r = await modifierEncartBien(b1, 'caracteristiques', { nombrePieces: '0', meuble: 'oui' }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Le nombre de pièces doit être un entier entre 1 et 50.' });
    expect([(await valeurs(b1)).nombrePieces, (await valeurs(b1)).meuble]).toEqual(['4', '']);
    expect((await modificationsEncart(b1)).length).toBe(avant);
  });

  it('③ le digicode modifié depuis l’encart d’un bien vaut pour l’immeuble : l’autre bien de l’adresse le voit', async () => {
    ok(await modifierEncartBien(b1, 'situation', { digicode: 'oui', digicodeCode: '57B83' }, AUTEUR));
    expect((await valeurs(b1)).digicodeCode).toBe('57B83');
    expect((await valeurs(b2)).digicodeCode).toBe('57B83');
  });

  it('④ l’Historique : une ligne par écriture, « Champ : ancienne → nouvelle », l’auteur, l’heure', async () => {
    ok(await modifierEncartBien(b1, 'commentaire', { commentaire: 'Après.' }, AUTEUR));
    const l = await modificationsEncart(b1);
    expect(l[0]).toMatchObject({ texte: 'Commentaire — Commentaire libre : Depuis la section → Après.', par: 'itest encart' });
    expect(Number.isNaN(Date.parse(l[0].quand))).toBe(false);
    expect(l.map((x) => x.texte)).toEqual(expect.arrayContaining(['Caractéristiques — Pièces : 3 → 4', 'Caractéristiques — Étage : non renseigné → 3 · Surface Carrez / Boutin : non renseigné → 41,8 m²']));
    // rejouer la même saisie : aucun changement, aucune ligne de plus
    const n = l.length;
    expect(ok(await modifierEncartBien(b1, 'commentaire', { commentaire: 'Après.' }, AUTEUR)).changements).toEqual([]);
    expect((await modificationsEncart(b1)).length).toBe(n);
  });
});
