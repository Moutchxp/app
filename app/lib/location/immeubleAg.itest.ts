/**
 * ══ 🔴🔴 TUILE LOCATION — DATE DE LA DERNIÈRE AG, PAR IMMEUBLE (Arno, 18/10/2026), SUR UNE BASE JETABLE ═══════════════════
 *
 *   ① un bien créé avec une date d'AG : elle est posée sur son IMMEUBLE, et pré-remplie pour une autre saisie à la même
 *      adresse ; un autre lot du même immeuble la voit dans sa fiche ;
 *   ② la modifier depuis la fiche d'un lot met à jour l'immeuble (l'autre lot voit la nouvelle date) ;
 *   ③ un parking nu SANS immeuble : pas de date d'AG (champ masqué), rien n'est écrit.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 377). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l12 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/immeubleAg.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien } from './creationBienRepo';
import { lireAgPourAdresse } from './immeubleAgRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest AG' };
const S = `a${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };

describe.skipIf(!baseEssai)('🔴 dernière AG : partagée par les lots du même immeuble', () => {
  let proprietaire = 0;
  let lotA = 0;
  let lotB = 0;
  const adresse = `15 rue de l’Assemblée${S}`;

  it('① posée sur l’immeuble à la création, pré-remplie pour la même adresse, vue par un autre lot du même immeuble', async () => {
    [proprietaire] = ok(await creerProprietaires({ enGestion: false, cartes: [{ nom: `AG${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 10 10 10 10', libelle: 'Mobile' }] }] }, AUTEUR)).ids;
    expect(await lireAgPourAdresse(adresse)).toBeNull();
    const a = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [],
      logement: { adresse, famille: 'logement', typeLogement: 'appartement', derniereAg: '2026-03-12' } }, AUTEUR));
    expect(a.agRefus).toBeNull();
    lotA = a.logementId;
    expect(await lireAgPourAdresse(adresse)).toBe('2026-03-12');
    expect(await lireAgPourAdresse(adresse.toUpperCase())).toBe('2026-03-12');
    lotB = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [],
      logement: { adresse, famille: 'logement', typeLogement: 'studio' } }, AUTEUR)).logementId;
    expect(await complementsDuBien(lotB)).toMatchObject({ derniereAg: '2026-03-12', agApplicable: true });
    const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_journal WHERE entite_id = $1 AND action = 'location_derniere_ag'`, [lotA]);
    expect(rows[0].n).toBe('1');
  });

  it('② modifiée depuis la fiche du lot B : l’immeuble est mis à jour, le lot A la voit ; une date invalide est refusée', async () => {
    expect(await modifierComplementsBien(lotB, { derniereAg: '2026-02-30' }, AUTEUR)).toEqual({ etat: 'refus', motif: 'La date de la dernière AG n’est pas une date valide.' });
    expect((await modifierComplementsBien(lotB, { derniereAg: '2026-06-30' }, AUTEUR)).etat).toBe('ok');
    expect((await complementsDuBien(lotA))?.derniereAg).toBe('2026-06-30');
    // Sans la clé « derniereAg » (un écran qui ne la montre pas), la date n'est pas touchée.
    expect((await modifierComplementsBien(lotA, { commentaire: 'sans AG' }, AUTEUR)).etat).toBe('ok');
    expect((await complementsDuBien(lotB))?.derniereAg).toBe('2026-06-30');
  });

  it('③ un parking nu sans immeuble : pas de date d’AG (masquée), rien n’est écrit', async () => {
    const p = ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [],
      logement: { adresse: `3 rue du Garage${S}`, famille: 'parking', parkingType: 'box_simple' } }, AUTEUR)).logementId;
    await query('UPDATE gestion_annuaire_lot SET immeuble = NULL WHERE id = $1', [p]);
    expect(await complementsDuBien(p)).toMatchObject({ agApplicable: false, derniereAg: null });
    const avant = (await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_immeuble_ag')).rows[0].n;
    expect((await modifierComplementsBien(p, { derniereAg: '2026-01-01' }, AUTEUR)).etat).toBe('ok');
    expect((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_immeuble_ag')).rows[0].n).toBe(avant);
  });
});
