import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { gardeBaseJetable } from '../../scripts/baseJetable';

/**
 * ══ 🔴🔴 LA FICHE LOCATAIRE DU SUIVI DU MOIS ÉCRIT DANS LA BASE PARTAGÉE (Arno, 27/10/2026) — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ══
 *   · le titre : le titulaire du bien, puis son copropriétaire au lien en cours (la lecture commune `proprietairesDuBien`) ; un lien clos n'y est pas ;
 *   · une modification faite dans la fenêtre (cartes du bloc 1) se relit IDENTIQUE depuis la fiche standard (la fiche de la Gestion,
 *     `ficheLocataire`) et depuis le Dossier de location (`lireDossierLocation`) — les mêmes enregistrements, aucune copie ; journalisée ;
 *     rien n'est fusionné ni supprimé (l'ancien téléphone reste, la fiche reste une).
 * 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable`.
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);
vi.mock('./sondeLocation', async () => {
  const { query } = await import('../db/client');
  return {
    colonneExisteMemo: async (t: string, c: string) => ((await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).rows[0]?.n ?? 0) > 0,
    oublierSchemaLocation: () => {},
  };
});

const { query, pool } = await import('../db/client');
const { lireFicheLocataireCartes, enregistrerFicheLocataire } = await import('./ficheLocataireCartesRepo');
const { lireDossierLocation } = await import('./dossierLocationRepo');
const { ficheLocataire } = await import('../gestion/annuaireRepo');
const { ficheLocataireLocation } = await import('./locationRepo');
const { CONDITIONS_VIDES } = await import('./conditionsEntree');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
const id = async (sql: string, p: unknown[]): Promise<number> => Number((await query<{ id: string }>(sql, p)).rows[0].id);
const L: Record<string, number> = {};
/** Un suffixe par passage : la base jetable refuse DELETE (393), une épreuve rejouée ne réutilise jamais une clé. */
const R = Date.now().toString(36);

beforeAll(async () => {
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom) VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL')
               ON CONFLICT (id) DO NOTHING`);
  const proprio = (cle: string, nom: string) => id(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ($1, $2, $2, lower($2)) RETURNING id::text`, [`${cle}-${R}`, nom]);
  L.titulaire = await proprio('fc-t', 'TEST Titulaire');
  L.copro = await proprio('fc-c', 'TEST Copropriétaire');
  L.ancien = await proprio('fc-a', 'TEST Ancien');
  L.lot = await id(`INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, commune, categorie, en_gestion, statut_bien_depuis)
    VALUES ('fc-lot-' || $2, $1, 'TEST Titulaire', '7 Rue des Essais', 'PARIS', 'logement', true, '2020-01-01') RETURNING id::text`, [L.titulaire, R]);
  await query(`INSERT INTO gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id, depuis, jusqu_a) VALUES ($1, $2, '2020-01-01', NULL), ($1, $3, '2015-01-01', '2019-12-31')`,
    [L.lot, L.copro, L.ancien]);
  L.loc = await id(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, prenom, nom_normalise, commune)
    VALUES ('fc-l-' || $1, 'fc-l-' || $1, 'MARTIN', 'Léa', 'martin lea', 'COURBEVOIE') RETURNING id::text`, [R]);
  await query(`INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute, libelle, rang) VALUES ('locataire', $1, 'telephone', '+33600000001', '06 00 00 00 01', 'Mobile', 0)`, [L.loc]);
  L.bail = await id(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2026-09-12') RETURNING id::text`, [L.lot]);
  await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, bail_id) VALUES ('fc-o-' || $4, $1, $2, 'fc-lot-' || $4, '2026-09-12', $3)`,
    [L.loc, L.lot, L.bail, R]);
  L.ligne = await id(`INSERT INTO gestion_location_activite (type, date_signature, bail_id, lot_id, libelle_proprietaire, libelle_locataire, hono_proprietaire_ht, hono_locataire_ht,
     negociateur_libelle, origine_contact, source, cree_par_libelle) VALUES ('bail', '2026-09-01', $1, $2, 'TEST Titulaire', 'MARTIN', 416.67, 229.85, '', 'apporteur', 'import', 'épreuve')
     RETURNING id::text`, [L.bail, L.lot]);
});
afterAll(async () => { await pool.end(); });

describe('🔴 la fiche locataire du Suivi du mois — la base partagée', () => {
  it('le titre : le titulaire, puis le copropriétaire au lien en cours ; jamais l’ancien propriétaire (lien clos)', async () => {
    const r = await lireFicheLocataireCartes(L.loc, L.bail);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.proprietaires).toEqual(['TEST Titulaire', 'TEST Copropriétaire']);
  });

  it('une modification faite ICI se relit IDENTIQUE depuis la fiche standard et depuis le Dossier de location ; journalisée ; rien n’est supprimé', async () => {
    const lu = await lireFicheLocataireCartes(L.loc, L.bail);
    if (lu.etat !== 'ok') throw new Error('lecture');
    const avant = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal`)).rows[0].n;
    const r = await enregistrerFicheLocataire(L.loc, L.bail, {
      version: lu.data.version, nouvelles: [],
      modifiees: [{ id: L.loc, sorte: 'client', champs: { commune: 'NANTERRE', coordonnees: [
        { sorte: 'telephone', valeur: '06 00 00 00 01', libelle: 'Mobile' }, { sorte: 'email', valeur: 'lea.martin@exemple.test', libelle: 'E-mail' }] } }],
    }, null, AUTEUR);
    expect(r.etat).toBe('ok');

    // La fenêtre, relue.
    const fen = await lireFicheLocataireCartes(L.loc, L.bail);
    if (fen.etat !== 'ok') throw new Error('relecture');
    const carte = fen.data.cartes.find((c) => c.sorte === 'client' && c.id === L.loc)!;
    // La fiche standard (Gestion / Location) : le MÊME enregistrement.
    const std = await ficheLocataire(L.loc);
    if (std.etat !== 'ok') throw new Error('fiche standard');
    // Le Dossier de location de la ligne : le MÊME enregistrement.
    const dos = await lireDossierLocation(L.ligne);
    if (dos.etat !== 'ok') throw new Error(`dossier ${dos.etat}`);
    const locDossier = dos.data.locataires.find((x) => x.id === L.loc)!;

    expect([carte.commune, std.data.commune, locDossier.commune]).toEqual(['NANTERRE', 'NANTERRE', 'NANTERRE']);
    const emails = (l: { sorte: string; affichage?: string; valeur?: string }[]) => l.filter((k) => k.sorte === 'email').map((k) => (k.affichage ?? k.valeur ?? '').toLowerCase());
    expect(emails(carte.contacts)).toEqual(['lea.martin@exemple.test']);
    expect(emails(locDossier.contacts)).toEqual(['lea.martin@exemple.test']);
    expect(std.data.contacts.filter((k) => k.sorte === 'email' && !k.absent).map((k) => k.valeur.toLowerCase())).toEqual(['lea.martin@exemple.test']);
    // Le téléphone d'avant reste (rien n'est supprimé) ; une seule fiche locataire (rien n'est fusionné ni dupliqué).
    expect(carte.contacts.filter((k) => k.sorte === 'telephone').map((k) => k.affichage)).toEqual(['06 00 00 00 01']);
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_annuaire_locataire WHERE cle_personne = $1`, [`fc-l-${R}`])).rows[0].n).toBe(1);
    // Journalisé.
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal`)).rows[0].n).toBeGreaterThan(avant);
  });

  it('🔴 27/10/2026 — bail SANS conditions : la fiche les CRÉE (formulaire de « Nouveau locataire ») ; relues IDENTIQUES depuis le Dossier de location et la fiche Location ; journalisées', async () => {
    const d0 = await lireDossierLocation(L.ligne);
    if (d0.etat !== 'ok') throw new Error(`dossier ${d0.etat}`);
    expect(d0.data.conditions).toBeNull();
    const lu = await lireFicheLocataireCartes(L.loc, L.bail);
    if (lu.etat !== 'ok') throw new Error('lecture');
    const avant = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal`)).rows[0].n;
    const conditions = { ...CONDITIONS_VIDES, depot: 'bailleur', prelevement: true, jour: '10', garant: false, assurance: 'visale', honorairesLocataire: 'agence',
      honorairesProprietaire: 'gestion', reglement: 'cheque', loyer: { principal: '950', provisions: '50' },
      sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '950', honorairesAgence: '0' },
      indice: { type: 'irl', reference: '2026-2', revision: '2027-09-12' }, chargesCopro: 'agence' };
    const r = await enregistrerFicheLocataire(L.loc, L.bail, { version: lu.data.version, nouvelles: [], modifiees: [] },
      { activiteId: L.ligne, saisie: { version: d0.data.version, conditions, entretien: null, honorairesSaisis: '0' } }, AUTEUR);
    if (r.etat !== 'ok') throw new Error(`enregistrement : ${JSON.stringify(r)}`);
    expect(r.data.dossier.map((c) => c.champ)).toContain('Mode de règlement');
    expect(r.data.dossier.every((c) => c.avant === '(vide)')).toBe(true);

    // Le Dossier de location : les MÊMES conditions (une version, sur ce bail).
    const d1 = await lireDossierLocation(L.ligne);
    if (d1.etat !== 'ok' || d1.data.conditions === null) throw new Error('dossier relu');
    expect(d1.data.conditions.valeurs).toMatchObject({ depot: 'bailleur', prelevement: true, jour: 10, garant: false, assurance: 'visale', reglement: 'cheque',
      honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', sommes: { depotGarantie: 95000, honorairesAgence: 0 } });
    expect(d1.data.conditions.loyer).toEqual({ principal: 95000, provisions: 5000 });
    // La fiche du locataire (Location / Gestion) : le MÊME jeu de conditions.
    const f = await ficheLocataireLocation(L.loc);
    if (f.etat !== 'ok') throw new Error('fiche Location');
    const lues = f.data.conditionsEntree ?? [];
    expect(lues).toHaveLength(1);
    // Le paiement des charges est la donnée du BIEN (lu avec les lots au Dossier) : comparé à part.
    expect({ ...lues[0].conditions, chargesCopro: undefined }).toEqual({ ...d1.data.conditions.valeurs, chargesCopro: undefined });
    expect(lues[0].bailId).toBe(L.bail);
    // Une seule ligne de conditions pour ce bail (rien en double) ; journalisé.
    expect((await query<{ n: number }>('SELECT count(*)::int AS n FROM gestion_location_conditions_entree WHERE bail_id = $1', [L.bail])).rows[0].n).toBe(1);
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal`)).rows[0].n).toBeGreaterThan(avant);
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal WHERE entite = 'location_bail' AND entite_id = $1 AND action = 'location_dossier_conditions'`, [L.bail])).rows[0].n).toBeGreaterThan(0);
  });
});

