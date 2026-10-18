/**
 * ══ 🔴🔴 FICHE COMMUNE (règle d'Arno du 17/10/2026, « une seule fiche »), SUR UNE BASE JETABLE ═══════════════════════════
 *
 *   ① « en gestion : oui / non / non renseigné » se lit et se corrige depuis la fiche commune, et chaque correction est
 *      journalisée (rien n'est effacé) ;
 *   ② les données des sections « Location » de la fiche commune (bien, propriétaire, locataire) sont celles de la base,
 *      lues par les MÊMES fonctions que la tuile Location : mandat, annexes, compléments, loyers, sortie du portefeuille.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 375). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l6 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/ficheCommune.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerLocataireSurBien, sortirDuPortefeuille, reactiverDansPortefeuille } from './portefeuilleRepo';
import { creerBienComplet, creerProprietaires, enregistrerEnGestion } from './creationBienRepo';
import { ficheBienLocation, ficheLocataireLocation, ficheProprietaireLocation } from './locationRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest fiche commune' };
const S = `f${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };

describe.skipIf(!baseEssai)('🔴 fiche commune : sections « Location »', () => {
  let proprietaireId = 0;
  let logementId = 0;

  it('① « en gestion » : oui → non → non renseigné, journalisé ; une valeur hors liste est refusée', async () => {
    const r = ok(await creerProprietaires({ cartes: [{ nom: `COMMUNE${S}`, coordonnees: [{ sorte: 'telephone' as const, valeur: '06 33 44 55 66', libelle: 'Mobile' }] }], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR));
    proprietaireId = r.ids[0];
    expect(ok(await ficheProprietaireLocation(proprietaireId))).toMatchObject({ enGestion: true, numeroMandat: `MG-${S}` });
    ok(await enregistrerEnGestion(proprietaireId, false, AUTEUR));
    expect(ok(await ficheProprietaireLocation(proprietaireId)).enGestion).toBe(false);
    ok(await enregistrerEnGestion(proprietaireId, null, AUTEUR));
    expect(ok(await ficheProprietaireLocation(proprietaireId)).enGestion).toBeNull();
    expect((await enregistrerEnGestion(proprietaireId, 'peut-être', AUTEUR)).etat).toBe('refus');
    const j = await query<{ commentaire: string }>(
      `SELECT commentaire FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND action = 'location_en_gestion' ORDER BY id`, [proprietaireId]);
    expect(j.rows.map((x) => x.commentaire)).toEqual([
      expect.stringMatching(/^en gestion : oui, N° de mandat de gestion/),
      'en gestion : oui → non (fiche commune)',
      'en gestion : non → non renseigné (fiche commune)',
    ]);
  });

  it('② les sections lisent la base : annexes, compléments, loyers ; sortie et réactivation depuis la fiche', async () => {
    const b = ok(await creerBienComplet({
      proprietaireIds: [proprietaireId],
      logement: { adresse: `7 rue Commune${S}`, famille: 'logement', typeLogement: 'studio', dpeClasse: 'B' },
      annexes: [{ categorie: 'cave', porte: '4' }],
    }, AUTEUR));
    logementId = b.logementId;
    const l = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `LOC${S}` }, lotId: logementId, entree: '2026-02-01' }, AUTEUR));
    const fb = ok(await ficheBienLocation(logementId));
    expect(fb.annexes.map((a) => a.categorie)).toEqual(['cave']);
    expect(fb.complements).toMatchObject({ typeLogement: 'studio', dpeClasse: 'B' });
    expect(fb.locations.map((x) => x.occupationId)).toHaveLength(1);
    const fl = ok(await ficheLocataireLocation(l.locataireId));
    expect(fl.locations.map((x) => x.lotId)).toEqual([logementId]);
    // Locataire en place : la sortie demande la confirmation de l'avertissement (règle d'Arno du 18/10/2026) — sans elle,
    // refus ; et un bien sans locataire (la cave) sort et revient.
    expect((await sortirDuPortefeuille('bien', logementId, AUTEUR)).etat).toBe('refus');
    ok(await sortirDuPortefeuille('bien', b.annexes[0], AUTEUR));
    expect(ok(await ficheBienLocation(b.annexes[0])).sortie?.par).toBe('itest fiche commune');
    ok(await reactiverDansPortefeuille('bien', b.annexes[0], AUTEUR));
    expect(ok(await ficheBienLocation(b.annexes[0])).sortie).toBeNull();
  });
});
