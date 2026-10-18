/**
 * ══ 🔴🔴 TUILE LOCATION — REFONTE DE L'ACCUEIL (17/10/2026), SUR UNE BASE JETABLE ══════════════════════════════════════
 *
 *   ① recherche : l'adresse ne trouve QUE les biens du portefeuille — ni l'adresse personnelle d'un propriétaire, ni celle
 *      d'un syndic, ni un bien en fin de gestion ou sorti ; personnes et syndics par nom, téléphone, e-mail ;
 *   ② sortie du portefeuille / réactivation : rien n'est effacé ; la fiche quitte la recherche et les listes actives,
 *      passe dans les anciens, se réactive (le propriétaire entraîne ses biens et leurs annexes, aller et retour) ;
 *   ③ un locataire en place ne bloque plus (règle d'Arno du 18/10/2026) : refus SANS la confirmation de l'avertissement,
 *      puis la location est close à la date du jour (bien, propriétaire, locataire) ;
 *   ④ « Nouveau locataire » rattaché à un bien du portefeuille ; refusé sur un bien sorti.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 373). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l3 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/portefeuille.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerProprietaireEtBiens, ficheBienLocation, listeBiens, listeProprietaires } from './locationRepo';
import {
  biensPourLocataire, creerLocataireSurBien, reactiverDansPortefeuille, rechercherPortefeuille, sortirDuPortefeuille,
} from './portefeuilleRepo';
import { MOTIF_OCCUPATION_A_CONFIRMER } from './archivage';

/** Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires à la création d'un logement — l'ancienne voie aussi. */
const DPE_ENTRETIEN = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest portefeuille' };
const S = `p${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };

describe.skipIf(!baseEssai)('🔴 portefeuille de la Location', () => {
  let proprietaireId = 0;
  let logementId = 0;
  let caveId = 0;

  it('① la recherche : adresses du portefeuille seulement ; personnes et syndics par nom / téléphone / e-mail', async () => {
    const c = ok(await creerProprietaireEtBiens({ proprietaireId: null,
      proprietaire: { nom: `EXEMPLE${S}`, prenom: 'Claire', telephone: '06 12 34 56 81', email: `claire.${S}@exemple.test`, adresse: `8 rue Imaginaire${S}`, codePostal: '75011', commune: 'Paris' },
      logement: { ...DPE_ENTRETIEN, adresse: `14 rue des Lilas${S}`, codePostal: '75011', commune: 'Paris' }, annexes: [{ categorie: 'cave', porte: '12' }] }, AUTEUR));
    proprietaireId = c.proprietaireId; logementId = c.logementId;
    caveId = ok(await ficheBienLocation(logementId)).annexes[0].id;
    // Un bien en FIN DE GESTION (hors portefeuille) et un syndic avec une adresse.
    const fin = ok(await creerProprietaireEtBiens({ proprietaireId, proprietaire: {}, logement: { ...DPE_ENTRETIEN, adresse: `3 rue Ancienne${S}` }, annexes: [] }, AUTEUR));
    await query(`UPDATE gestion_annuaire_lot SET gestion_fin = DATE '2025-01-01' WHERE id = $1`, [fin.logementId]);
    const { rows } = await query<{ id: string }>(`INSERT INTO gestion_syndic (nom, adresse, telephone, email, cree_par_libelle)
      VALUES ($1, $2, '01 40 00 00 00', $3, 'itest') RETURNING id::text`, [`FONCIA${S}`, `12 rue du Syndic${S}`, `contact.${S}@foncia.test`]);
    const syndicId = Number(rows[0].id);
    const { rows: ct } = await query<{ id: string }>(`INSERT INTO gestion_syndic_contact (syndic_id, nom, cree_par_libelle) VALUES ($1, 'Durand', 'itest') RETURNING id::text`, [syndicId]);
    await query(`INSERT INTO gestion_syndic_coordonnee (contact_id, sorte, valeur) VALUES ($1, 'telephone', '+33 6 99 88 77 66')`, [Number(ct[0].id)]);

    const r = async (q: string) => rechercherPortefeuille(q);
    expect((await r(`Lilas${S}`)).biens.map((b) => b.id)).toEqual([logementId]);
    // Une ligne porte téléphone, e-mail et l'adresse d'un bien DU PORTEFEUILLE (jamais l'adresse personnelle).
    const ligne = (await r(`EXEMPLE${S}`)).proprietaires[0];
    expect(ligne).toMatchObject({ id: proprietaireId, telephone: '06 12 34 56 81', email: `claire.${S}@exemple.test`, ancien: false });
    expect(ligne.adresse).toContain(`14 rue des Lilas${S}`);
    expect(ligne.adresse).not.toContain('Imaginaire');
    // L'adresse PERSONNELLE du propriétaire, celle du SYNDIC et un bien HORS portefeuille ne répondent pas.
    const imaginaire = await r(`Imaginaire${S}`);
    expect(imaginaire.proprietaires.length + imaginaire.biens.length + imaginaire.syndics.length).toBe(0);
    const syndicAdresse = await r(`rue du Syndic${S}`);
    expect(syndicAdresse.syndics.length + syndicAdresse.biens.length).toBe(0);
    expect((await r(`Ancienne${S}`)).biens).toEqual([]);
    // Personnes et syndics : nom, téléphone (toutes formes), e-mail.
    expect((await r(`EXEMPLE${S}`)).proprietaires.map((p) => p.id)).toEqual([proprietaireId]);
    expect((await r('+33 6 12 34 56 81')).proprietaires.map((p) => p.id)).toContain(proprietaireId);
    expect((await r(`claire.${S}@`)).proprietaires.map((p) => p.id)).toEqual([proprietaireId]);
    expect((await r(`FONCIA${S}`)).syndics.map((x) => x.id)).toEqual([syndicId]);
    expect((await r('06 99 88 77 66')).syndics.map((x) => x.id)).toContain(syndicId);
    expect((await r(`contact.${S}@foncia`)).syndics.map((x) => x.id)).toEqual([syndicId]);
  });

  it('② sortie du portefeuille et réactivation : rien n’est effacé, le propriétaire entraîne ses biens', async () => {
    const avant = Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n);
    const s = ok(await sortirDuPortefeuille('proprietaire', proprietaireId, AUTEUR, { origine: { origine: 'litige' } }));
    expect(s.biens).toBeGreaterThanOrEqual(2); // logement + cave (+ le bien en fin de gestion, encore au portefeuille de la fiche)
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_lot')).rows[0].n)).toBe(avant);
    // Retouche d'Arno (17/10/2026) : les fiches sorties restent TROUVABLES, marquées « Ancien » (en bas, grisées, à l'écran).
    expect((await rechercherPortefeuille(`EXEMPLE${S}`)).proprietaires.map((p) => ({ id: p.id, ancien: p.ancien }))).toEqual([{ id: proprietaireId, ancien: true }]);
    expect((await rechercherPortefeuille(`Lilas${S}`)).biens.map((b) => ({ id: b.id, ancien: b.ancien }))).toEqual([{ id: logementId, ancien: true }]);
    expect((await listeProprietaires(0, `EXEMPLE${S}`)).lignes).toEqual([]);
    expect((await listeProprietaires(0, `EXEMPLE${S}`, true)).lignes.map((p) => p.id)).toEqual([proprietaireId]);
    expect((await listeBiens(0, `14 rue des Lilas${S}`, true)).lignes.map((b) => b.id).sort()).toEqual([logementId, caveId].sort());
    const fiche = ok(await ficheBienLocation(logementId));
    expect(fiche.sortie?.par).toBe('itest portefeuille');
    const journal = await query<{ action: string }>(`SELECT action FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND action LIKE 'location_%portefeuille'`, [proprietaireId]);
    expect(journal.rows.map((x) => x.action)).toEqual(['location_sortie_portefeuille']);
    ok(await reactiverDansPortefeuille('proprietaire', proprietaireId, AUTEUR));
    expect((await rechercherPortefeuille(`Lilas${S}`)).biens.map((b) => b.id)).toEqual([logementId]);
    expect(ok(await ficheBienLocation(caveId)).sortie).toBeNull();
  });

  it('③ un locataire en place : refus SANS confirmation de l’avertissement, puis location close à la date du jour', async () => {
    const l = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `MODELE${S}`, email: `jules.${S}@exemple.test` }, lotId: logementId, entree: '2026-03-01' }, AUTEUR));
    // Règle d'Arno du 18/10/2026 (remplace « sortie refusée si locataire en place ») : sans confirmation, refus — même par appel direct.
    expect(await sortirDuPortefeuille('bien', logementId, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_OCCUPATION_A_CONFIRMER });
    expect(await sortirDuPortefeuille('proprietaire', proprietaireId, AUTEUR, { origine: { origine: 'litige' } })).toEqual({ etat: 'refus', motif: MOTIF_OCCUPATION_A_CONFIRMER });
    expect(await sortirDuPortefeuille('locataire', l.locataireId, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_OCCUPATION_A_CONFIRMER });
    // Rien n'a été écrit par ces refus.
    expect((await query<{ sortie: string | null }>('SELECT sortie::text FROM gestion_annuaire_occupation WHERE locataire_id = $1', [l.locataireId])).rows[0].sortie).toBeNull();
    // Confirmé : la location du locataire est close aujourd'hui, et il sort du portefeuille.
    expect(ok(await sortirDuPortefeuille('locataire', l.locataireId, AUTEUR, { confirmeOccupation: true }))).toMatchObject({ locations: 1 });
    const { rows: o } = await query<{ sortie: string | null; aujourdhui: string }>(
      `SELECT sortie::text, (now() AT TIME ZONE 'Europe/Paris')::date::text AS aujourdhui FROM gestion_annuaire_occupation WHERE locataire_id = $1`, [l.locataireId]);
    expect(o[0].sortie).toBe(o[0].aujourdhui);
    // Le bien n'est plus loué : il sort sans avertissement.
    expect((await sortirDuPortefeuille('bien', logementId, AUTEUR)).etat).toBe('ok');
    // La cave suit son logement ; le propriétaire, lui, reste dans le portefeuille.
    expect(ok(await ficheBienLocation(caveId)).sortie).not.toBeNull();
  });

  it('④ « Nouveau locataire » : sur un bien du portefeuille seulement', async () => {
    const refus = await creerLocataireSurBien({ locataireId: null, locataire: { nom: `REFUS${S}` }, lotId: logementId, entree: null }, AUTEUR);
    expect(refus.etat).toBe('refus');
    ok(await reactiverDansPortefeuille('bien', logementId, AUTEUR));
    // Le choix du bien : champ VIDE (premier affichage de l'écran) comme champ rempli, sans erreur.
    expect((await biensPourLocataire('')).length).toBeGreaterThan(0);
    expect((await biensPourLocataire(`Lilas${S}`)).map((b) => b.id)).toContain(logementId);
    expect(ok(await ficheBienLocation(caveId)).sortie).toBeNull(); // l'annexe revient avec lui
    const l = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `NOUVEAU${S}`, telephone: '06 11 22 33 44' }, lotId: logementId, entree: '2026-10-01' }, AUTEUR));
    const f = ok(await ficheBienLocation(logementId));
    expect(f.fiche.occupations.some((o) => o.locataireId === l.locataireId && o.encours)).toBe(true);
  });
});
