/**
 * ══ 🔴🔴 LOCATION — LE MAIL « NOUVELLE LOCATION » (ENVOI ADHOC & MONGA) ET LES PARAMÈTRES (Arno, 21/10/2026, migration 395),
 *    SUR UNE COPIE DE LA RECETTE ══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   ① CONTENU TIRÉ À LA SOURCE, sur un vrai bail créé par « Nouveau locataire » : deux propriétaires nouveaux, toutes leurs
 *      coordonnées, lots à DEUX adresses (logement + cave à la même, box à une autre), deux colocataires, un GARANT, et un
 *      conjoint qui N'APPARAÎT PAS ; sans GLI ; honoraires et barème ENREGISTRÉS ;
 *   ② ENVOI : la fenêtre propose la copie de la personne connectée EN TÊTE puis les trois adresses par défaut ; échec →
 *      journalisé ; « Réessayer » → envoyé, journalisé avec la PERSONNE (prénom nom, e-mail), la liste réelle, l'objet ;
 *   ③ CONFIGURATION : la liste par défaut se modifie par une NOUVELLE version (l'ancienne reste) ; une liste modifiée pour
 *      UN envoi ne la touche pas ; pas de doublon de la copie personnelle ;
 *   ④ BARÈMES : une nouvelle version ne change RIEN aux honoraires déjà enregistrés (AVANT / APRÈS prouvé) ; un nouveau bail
 *      prend la nouvelle version ; une version utilisée ne se modifie ni ne se supprime (application ET base) ; une date
 *      antérieure est refusée ; une version future jamais utilisée se corrige ;
 *   ⑤ ESSAI sur « ESSAI BAIL DRIVE » (bail 536) : l'envoi passe par le canal réel (API Gmail) et la décision de la RECETTE
 *      l'intercepte — le message capturé est écrit sous `.captures/` (SORTIE_ESSAI).
 *
 * 🔒 AUCUN ENVOI RÉEL : transports injectés (factice, ou l'interception de la recette) ; le `fetch` global REFUSE tout appel
 *    Google pendant l'épreuve. AUCUN Drive : le jeton du Drive est refusé d'office.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) ; la 395 y est appliquée puis annulée.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_test…`, copie de la recette SANS la 395 :
 *   createdb svav_test_mail395 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_mail395
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_mail395 SORTIE_ESSAI=.captures/mail-nouvelle-location \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/mailNouvelleLocation.itest.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { construireRfc822, envoyerViaGmail, type MessageAEnvoyer } from '../gestion/envoiGmail';
import type { TransportDemande } from '../gestion/envoiDemandeTache';
import { decisionRecette, decoderRfc822 } from '../recette/interception';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBienAvec } from './portefeuilleRepo';
import { oublierSchemaLocation } from './sondeLocation';
import { apercuNouvelleLocation, DESTINATAIRES_DEFAUT, dernierEnvoi, donneesNouvelleLocation, envoyerNouvelleLocation, lireDestinatairesDefaut } from './mailNouvelleLocationRepo';
import { htmlNouvelleLocation, objetNouvelleLocation, texteNouvelleLocation } from './mailNouvelleLocation';
import { ajouterVersionBareme, corrigerVersionBareme, enregistrerDestinataires, lireParametresLocation, lireVersionsBaremes } from './parametresLocationRepo';
import type { DepsBrancheBail } from './brancheBailDriveRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
/** La personne connectée : le compte n° 2 de la recette (Arnaud Jorel). */
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const S = `m${Date.now().toString(36)}`;
const SORTIE = process.env.SORTIE_ESSAI ?? '';
const ecrire = (nom: string, contenu: string): void => {
  if (SORTIE === '') return;
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(path.join(SORTIE, nom), contenu);
};
/** Le Drive n'est jamais appelé : son jeton est refusé d'office (la branche du bail « reste à créer »). */
const SANS_DRIVE: DepsBrancheBail = { fetch: (async () => { throw new Error('Drive interdit pendant l’épreuve'); }) as typeof fetch, jeton: async () => ({ etat: 'expire', motif: 'épreuve sans Drive' }) };

const un = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T> => (await query<T>(sql, p)).rows[0];
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };
const tel = (n: number) => `06 41 52 63 ${String(n).padStart(2, '0')}`;
const mel = (nom: string, n: number) => `${nom.toLowerCase()}.${n}.${S}@exemple.test`;
const CONDITIONS = {
  depot: 'agence', prelevement: true, jour: '5', garant: true, assurance: 'aucune', assurancePrecision: '',
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: '1 240', prorataCharges: '180', depotGarantie: '1 240', honorairesAgence: '776,82' },
  reglement: 'virement', reglementPrecision: '', commentaire: '',
  // 🔴 Arno (25/10/2026) — le dossier COMPLET : loyer (dans les conditions, comme l'écran l'envoie), paiement des charges, indice.
  loyer: { principal: '1 240', provisions: '180' }, chargesCopro: 'agence', indice: { type: 'irl', reference: '2026-2', revision: '2027-10-01' },
};

/** Les envois du transport factice de l'épreuve ; `refuser` : le prochain envoi échoue. */
const envois: MessageAEnvoyer[] = [];
let refuser = false;
const TRANSPORT: TransportDemande = {
  async envoyer(m) {
    if (refuser) { refuser = false; return { ok: false, motif: 'Gmail a refusé l’envoi : essai d’échec' }; }
    envois.push(m);
    return { ok: true, id: `essai-${envois.length}`, factice: true };
  },
};

let essai: EssaiAnnule | null = null;
const fetchGlobal = globalThis.fetch;
beforeAll(async () => {
  if (!baseEssai) return;
  globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => {
    if (/googleapis\.com/.test(String(u))) throw new Error(`appel Google interdit pendant l'épreuve : ${String(u)}`);
    return fetchGlobal(u, i);
  }) as typeof fetch;
  essai = await ouvrirEssaiAnnule();
});
afterAll(async () => { globalThis.fetch = fetchGlobal; if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 395 — le mail « Nouvelle location » et les paramètres Location', () => {
  it('⓪ la base est la recette SANS la 395 ; la 395 appliquée dans la transaction ; la liste par défaut amorcée', async () => {
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_location_mail_envoi')::text AS t`)).t).toBeNull();
    const avant = await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_bareme_honoraires_location');
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/395_location_mail_nouvelle_location.sql'), 'utf8'));
    // Arno (21/10/2026) — la 398 : le message d'accompagnement dans le journal d'envoi.
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/398_location_mail_message.sql'), 'utf8'));
    oublier();
    expect(await lireDestinatairesDefaut()).toEqual([
      { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
      { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' },
      { adresse: 'laura@monga.io', libelle: 'MONGA' },
    ]);
    // Aucune valeur de barème touchée par la migration.
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_bareme_honoraires_location')).n).toBe(avant.n);
    expect(await un('SELECT depuis::text, tres_tendue_m2::text AS t, tendue_m2::text AS z, autre_m2::text AS a, etat_des_lieux_m2::text AS e FROM gestion_bareme_honoraires_location WHERE id = 1'))
      .toEqual({ depuis: '2026-01-01', t: '12.10', z: '10.09', a: '8.07', e: '3.03' });
  });

  let bailA = 0;
  let proprietaires: number[] = [];
  it('① CONTENU sur un vrai bail : 2 propriétaires nouveaux, lots à 2 adresses, colocataires, garant, AUCUN autre contact, sans GLI', async () => {
    proprietaires = ok(await creerProprietaires({ cartes: [
      { civilite: 'M.', nom: `DUPONT${S}`, prenom: 'Jean', qualite: 'Particulier', note: 'Préfère être joint le matin', adresse: '8 avenue Foch', codePostal: '75116', commune: 'PARIS',
        coordonnees: [{ sorte: 'telephone', valeur: tel(1), libelle: 'Mobile' }, { sorte: 'telephone', valeur: '07 11 22 33 44', libelle: 'Mobile' },
          { sorte: 'telephone', valeur: '01 45 67 89 10', libelle: 'Fixe' }, { sorte: 'email', valeur: mel('jean', 1), libelle: 'E-mail' }, { sorte: 'email', valeur: mel('cabinet', 2), libelle: 'E-mail' }] },
      { civilite: 'Mme', nom: `DUPONT${S}`, prenom: 'Claire', coordonnees: [{ sorte: 'email', valeur: mel('claire', 3), libelle: 'E-mail' }] },
    ], enGestion: true, numeroMandat: `G-${S}` }, AUTEUR)).ids;
    const b = ok(await creerBienComplet({ proprietaireIds: proprietaires,
      annexes: [{ categorie: 'cave', etage: '-1', porte: '12', numLotCopro: '112' },
        { categorie: 'parking', etage: '-1', porte: '34', numLotCopro: '134', parkingType: 'box_simple', autreAdresse: true, adresse: `14 rue Essai ${S}`, codePostal: '92400', commune: 'COURBEVOIE' }],
      logement: { adresse: `12 rue Essai ${S}`, codePostal: '92400', commune: 'COURBEVOIE', surfaceCarrezM2: '61,8', famille: 'logement', typeLogement: 'appartement', nombrePieces: 3, meuble: false,
        porte: 'Porte gauche', numLotCopro: '47', batiment: 'B', escalier: '2', etage: '3', ascenseur: true, digicode: true, digicodeCode: '57B83',
        dpeClasse: 'D', dpeDate: '2024-03-12', entretienAPrevoir: false } }, AUTEUR));
    const i = ok(await creerLocatairesSurBienAvec({
      cartes: [{ civilite: 'Mme', nom: `MARTIN${S}`, prenom: 'Sophie', qualite: 'Salariée', coordonnees: [{ sorte: 'telephone', valeur: tel(4), libelle: 'Mobile' }, { sorte: 'email', valeur: mel('sophie', 4), libelle: 'E-mail' }] },
        { civilite: 'M.', nom: `MARTIN${S}`, prenom: 'Paul', coordonnees: [{ sorte: 'telephone', valeur: tel(5), libelle: 'Mobile' }] }],
      existants: [],
      contacts: [{ civilite: 'M.', nom: `GARANT${S}`, prenom: 'Henri', qualite: 'Garant', commune: 'LYON', coordonnees: [{ sorte: 'email', valeur: mel('henri', 6), libelle: 'E-mail' }] },
        { civilite: 'Mme', nom: `CONJOINTE${S}`, prenom: 'Zoé', qualite: 'Conjoint', coordonnees: [{ sorte: 'email', valeur: mel('zoe', 7), libelle: 'E-mail' }] }],
      rattachements: [{ garantit: [0, 1] }, { locataire: 0 }],
      lotId: b.logementId, entree: '2026-10-01', lotIds: [b.logementId, ...b.annexes], conditions: CONDITIONS, loyer: { principal: '1 240', provisions: '180' },
    }, AUTEUR, SANS_DRIVE));
    bailA = (i as { bailId: number }).bailId;
    const d = await donneesNouvelleLocation(bailA);
    expect(d).not.toBeNull();
    const html = htmlNouvelleLocation(d!);
    const objet = objetNouvelleLocation(d!);
    // 🔴 Arno (25/10/2026) — sous le loyer : l'indice de révision du bail et le paiement des charges du bien.
    expect(texteNouvelleLocation(d!)).toMatch(/Total charges comprises : 1 420,00 €\nIndice de révision : IRL T2 2026( — [\d,]+)? · révision annuelle le 01\/10\nPaiement des charges : payées par l’agence/);
    ecrire('mail-bail-complet.html', html);
    expect(objet).toBe(`Nouvelle location · NOUVEAUX PROPRIÉTAIRES · 12 rue Essai ${S}, COURBEVOIE · MARTIN${S.toUpperCase()} · 01/10/2026 · SANS GLI`);
    expect(d!.statut).toMatchObject({ sorte: 'nouveau', pastille: ['NOUVEAUX', 'PROPRIÉTAIRES'], mandat: `Mandat de gestion n° G-${S}` });
    // Toutes les coordonnées du propriétaire.
    for (const x of [tel(1), '07 11 22 33 44', '01 45 67 89 10', mel('jean', 1), mel('cabinet', 2), 'Préfère être joint le matin', '8 avenue Foch, 75116 PARIS', mel('claire', 3)]) expect(html).toContain(x);
    // Les lots, regroupés : 2 adresses.
    expect(html).toContain('⚠ ATTENTION · lots à 2 adresses différentes');
    expect(html).toContain('Lot principal · Appartement 3 pièces');
    expect(html).toContain('<b>57B83</b>');
    expect(html).toContain('1 lot · autre adresse');
    expect(d!.lots.map((l) => [l.titre, l.lignes.filter((x) => x.mot.startsWith('N°')).map((x) => x.valeur)])).toEqual([
      ['Lot principal · Appartement 3 pièces', ['Porte gauche', '47']], ['Cave', ['12', '112']], ['Parking · box simple', ['34', '134']]]);
    // Locataires, garant (« Garantit » en tête) ; le conjoint N'APPARAÎT PAS.
    expect(d!.locataires.map((p) => p.prenom)).toEqual(['Sophie', 'Paul']);
    expect(d!.garants).toHaveLength(1);
    expect(d!.garants[0].garantit).toEqual([`Mme MARTIN${S.toUpperCase()} Sophie`, `M. MARTIN${S.toUpperCase()} Paul`]);
    expect(html).not.toContain(`CONJOINTE${S}`.toUpperCase());
    expect(html).not.toContain(mel('zoe', 7));
    // Arno (21/10/2026) : « Aucune » → rouge, avec la caution en place (les garants).
    expect(d!.gli).toEqual({ etat: 'non', sorte: 'aucune', titre: 'PAS D’ASSURANCE LOYERS IMPAYÉS', detail: `Caution en place : M. GARANT${S.toUpperCase()} Henri` });
    // Le bail : loyer, honoraires ENREGISTRÉS (barème du 01/01/2026, zone très tendue : 61,8 × (12,10 + 3,03) = 935,034).
    expect(html).toContain('1 420,00 €');
    expect(html).toContain('935,03 € · 61,8 m² × (12,10 € + 3,03 €) · barème du 01/01/2026, zone très tendue · compte bancaire gestion');
    expect(html).toContain('Dossier Drive en cours de création');
    expect(html.toLowerCase()).not.toContain('client');
    expect(texteNouvelleLocation(d!)).toContain('Garantit :');
  });

  it('② ENVOI : copie personnelle EN TÊTE ; échec journalisé ; « Réessayer » envoyé et journalisé avec la PERSONNE qui envoie', async () => {
    const a = await apercuNouvelleLocation(bailA, AUTEUR);
    expect(a?.destinataires).toEqual([
      { adresse: 'a.jorel@sansvisavis.com', libelle: 'Vous (Arnaud Jorel) · copie personnelle', personnelle: true },
      { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
      { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }, { adresse: 'laura@monga.io', libelle: 'MONGA' },
    ]);
    expect(a?.envoiPossible).toBe(true);
    expect(a?.dernierEnvoi).toBeNull();
    const liste = a!.destinataires.map(({ adresse, libelle }) => ({ adresse, libelle }));
    refuser = true;
    expect(await envoyerNouvelleLocation(bailA, liste, AUTEUR, { transport: TRANSPORT })).toEqual({ etat: 'echec', motif: 'Gmail a refusé l’envoi : essai d’échec' });
    expect(envois).toHaveLength(0);
    const r = await envoyerNouvelleLocation(bailA, liste, AUTEUR, { transport: TRANSPORT });
    expect(r.etat).toBe('ok');
    expect(r.etat === 'ok' && r.data.n).toBe(4);
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({ de: 'gestion@criterimmo.fr', a: liste.map((x) => x.adresse), objet: a!.objet });
    expect(envois[0].corpsHtml).toContain('Nouvelle location');
    const { rows } = await query<{ statut: string; auteur_id: string; auteur_libelle: string; auteur_email: string; destinataires: unknown; objet: string; erreur: string | null; expediteur: string }>(
      'SELECT statut, auteur_id::text, auteur_libelle, auteur_email, destinataires, objet, erreur, expediteur FROM gestion_location_mail_envoi WHERE bail_id = $1 ORDER BY id', [bailA]);
    expect(rows).toEqual([
      { statut: 'echec', auteur_id: '2', auteur_libelle: 'Arnaud Jorel', auteur_email: 'a.jorel@sansvisavis.com', destinataires: liste, objet: a!.objet, erreur: 'Gmail a refusé l’envoi : essai d’échec', expediteur: 'gestion@criterimmo.fr' },
      { statut: 'envoye', auteur_id: '2', auteur_libelle: 'Arnaud Jorel', auteur_email: 'a.jorel@sansvisavis.com', destinataires: liste, objet: a!.objet, erreur: null, expediteur: 'gestion@criterimmo.fr' },
    ]);
    const dernier = await dernierEnvoi(bailA);
    expect(dernier?.mention).toMatch(/^Envoyé le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Arnaud Jorel à a\.jorel@sansvisavis\.com, gestion@criterimmo\.fr, gestion\.criterimmo@gmail\.com, laura@monga\.io$/);
    // Le journal est en ajout seul.
    await expect(query('UPDATE gestion_location_mail_envoi SET statut = $1 WHERE bail_id = $2', ['envoye', bailA])).rejects.toThrow(/ajout seul/);
    await expect(query('DELETE FROM gestion_location_mail_envoi WHERE bail_id = $1', [bailA])).rejects.toThrow(/ajout seul/);
  });

  it('③ CONFIGURATION : une liste modifiée pour UN envoi ne touche pas la configuration ; la configuration se modifie par une nouvelle version ; pas de doublon', async () => {
    const pourUnEnvoi = [{ adresse: 'laura@monga.io', libelle: 'MONGA — Laura' }, { adresse: `compta.${S}@exemple.test`, libelle: 'Compta' }];
    expect((await envoyerNouvelleLocation(bailA, pourUnEnvoi, AUTEUR, { transport: TRANSPORT })).etat).toBe('ok');
    expect(envois[envois.length - 1].a).toEqual(['laura@monga.io', `compta.${S}@exemple.test`]);
    expect((await lireDestinatairesDefaut()).map((d) => d.adresse)).toEqual(['gestion@criterimmo.fr', 'gestion.criterimmo@gmail.com', 'laura@monga.io']);
    expect(await enregistrerDestinataires([{ adresse: 'pas-une-adresse', libelle: '' }], AUTEUR)).toMatchObject({ etat: 'refus' });
    ok(await enregistrerDestinataires([{ adresse: 'a.jorel@sansvisavis.com', libelle: 'Arno' }, { adresse: 'laura@monga.io', libelle: 'MONGA' }, { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }], AUTEUR));
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_location_mail_destinataires')).n).toBe(2);
    const p = await lireParametresLocation();
    expect(p.destinatairesSaisis?.par).toBe('Arnaud Jorel');
    expect((await apercuNouvelleLocation(bailA, AUTEUR))?.destinataires).toEqual([
      { adresse: 'a.jorel@sansvisavis.com', libelle: 'Arno' }, { adresse: 'laura@monga.io', libelle: 'MONGA' }, { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }]);
    await expect(query('UPDATE gestion_location_mail_destinataires SET liste = $1::jsonb', ['[]'])).rejects.toThrow(/ajout seul/);
  });

  it('④ BARÈMES : AVANT / APRÈS une nouvelle version, les honoraires enregistrés n’ont pas bougé ; le nouveau bail prend la nouvelle version ; verrous', async () => {
    const HONO = `SELECT c.id, c.bail_id, c.hono_bareme_id, c.hono_surface_m2::text AS surface, c.hono_zone, c.hono_tarif_zone_m2::text AS tarif_zone,
      c.hono_tarif_edl_m2::text AS tarif_edl, c.hono_visite_bail::text AS visite, c.hono_etat_des_lieux::text AS edl, c.hono_total_proprietaire::text AS total
      FROM gestion_location_conditions_entree c`;
    const empreinte = async () => (await un<{ e: string; n: number }>(`SELECT md5(string_agg(row_to_json(c)::text, '|' ORDER BY c.id)) AS e, count(*)::int AS n FROM gestion_location_conditions_entree c`));
    const avantA = await un(`${HONO} WHERE c.bail_id = $1 ORDER BY c.id DESC LIMIT 1`, [bailA]);
    const avantTout = await empreinte();
    expect(avantA).toMatchObject({ hono_bareme_id: '1', surface: '61.8', hono_zone: 'tres_tendue', tarif_zone: '12.1', tarif_edl: '3.03', total: '935.034' });

    const { aujourdhui } = await lireParametresLocation();
    // Une date antérieure à la version précédente est refusée (application) — rien n'est écrit.
    expect(await ajouterVersionBareme({ depuis: '2025-12-31', tresTendue: '13', tendue: '11', autre: '9', etatDesLieux: '3,5' }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'La date « Applicable à partir du » ne peut pas être antérieure à celle de la version précédente (01/01/2026).' });
    ok(await ajouterVersionBareme({ depuis: aujourdhui, tresTendue: '13', tendue: '11', autre: '9', etatDesLieux: '3,5' }, AUTEUR));
    const v2 = (await lireVersionsBaremes())[0];
    expect(v2).toMatchObject({ depuis: aujourdhui, tresTendue: '13', etatDesLieux: '3.5', saisiPar: 'Arnaud Jorel', baux: 0 });

    const apresA = await un(`${HONO} WHERE c.bail_id = $1 ORDER BY c.id DESC LIMIT 1`, [bailA]);
    const apresTout = await empreinte();
    ecrire('baremes-avant-apres.json', JSON.stringify({ avant: { bailA: avantA, empreinteConditions: avantTout }, nouvelleVersion: v2, apres: { bailA: apresA, empreinteConditions: apresTout } }, null, 2));
    expect(apresA).toEqual(avantA);
    expect(apresTout).toEqual(avantTout);
    // Le mail du bail A dit toujours « barème du 01/01/2026 ».
    expect(htmlNouvelleLocation((await donneesNouvelleLocation(bailA))!)).toContain('barème du 01/01/2026');

    // Un NOUVEAU bail (entrée après la date d'effet) prend la nouvelle version — mêmes propriétaires : « déjà en gestion ».
    const b2 = ok(await creerBienComplet({ proprietaireIds: proprietaires, annexes: [],
      logement: { adresse: `20 rue Essai ${S}`, codePostal: '92400', commune: 'COURBEVOIE', surfaceCarrezM2: '40', famille: 'logement', typeLogement: 'studio',
        dpeClasse: 'C', dpeDate: '2024-01-01', entretienAPrevoir: false } }, AUTEUR));
    const i2 = ok(await creerLocatairesSurBienAvec({ cartes: [{ nom: `NOUVEAU${S}`, prenom: 'Léa', coordonnees: [{ sorte: 'telephone', valeur: tel(8), libelle: 'Mobile' }, { sorte: 'email', valeur: mel('lea', 8), libelle: 'E-mail' }] }],
      existants: [], contacts: [], lotId: b2.logementId, entree: '2026-11-01', lotIds: [b2.logementId],
      conditions: { ...CONDITIONS, garant: false, assurance: 'gli', assurancePrecision: 'AXA · contrat 42' } }, AUTEUR, SANS_DRIVE));
    const bailB = (i2 as { bailId: number }).bailId;
    expect(await un(`${HONO} WHERE c.bail_id = $1`, [bailB])).toMatchObject({ hono_bareme_id: String(v2.id), surface: '40', tarif_zone: '13', tarif_edl: '3.5', total: '660' });
    const dB = (await donneesNouvelleLocation(bailB))!;
    expect(dB.statut.objet).toBe('PROPRIÉTAIRES DÉJÀ EN GESTION');
    expect(dB.statut.phrase).toMatch(/2 biens en gestion$/);
    expect(dB.gli).toEqual({ etat: 'oui', sorte: 'gli', titre: 'ASSURANCE LOYERS IMPAYÉS (GLI)', detail: 'AXA · contrat 42' });
    expect(objetNouvelleLocation(dB)).toMatch(/^Nouvelle location · PROPRIÉTAIRES DÉJÀ EN GESTION · .* · 01\/11\/2026$/);
    expect(htmlNouvelleLocation(dB)).toContain(`barème du ${aujourdhui.split('-').reverse().join('/')}, zone très tendue`);
    expect((await lireVersionsBaremes()).map((v) => [v.id, v.baux])).toEqual([[v2.id, 1], [1, 1]]);

    // Une version UTILISÉE ne se modifie pas : refusée par l'application ET par la base ; aucune ne se supprime.
    expect(await corrigerVersionBareme(1, { depuis: '2027-01-01', tresTendue: '1', tendue: '1', autre: '1', etatDesLieux: '1' }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'Cette version est utilisée par 1 bail : elle ne se modifie pas. Enregistrez une nouvelle version.' });
    await expect(query('UPDATE gestion_bareme_honoraires_location SET tres_tendue_m2 = 99, corrige_le = now(), corrige_par_libelle = $1 WHERE id = 1', ['x'])).rejects.toThrow(/utilisée par au moins un bail/);
    await expect(query('DELETE FROM gestion_bareme_honoraires_location WHERE id = $1', [v2.id])).rejects.toThrow(/ne s'efface jamais/);
    await expect(query(`INSERT INTO gestion_bareme_honoraires_location (depuis, tres_tendue_m2, tendue_m2, autre_m2, etat_des_lieux_m2, source, saisi_par_libelle)
      VALUES ('2026-06-01', 1, 1, 1, 1, 'x', 'x')`)).rejects.toThrow(/antérieure à celle de la version précédente/);

    // Une version FUTURE jamais utilisée se corrige (la saisie d'origine reste, la correction est tracée).
    ok(await ajouterVersionBareme({ depuis: '2027-01-01', tresTendue: '14', tendue: '12', autre: '10', etatDesLieux: '4' }, AUTEUR));
    const v3 = (await lireVersionsBaremes())[0];
    ok(await corrigerVersionBareme(v3.id, { depuis: '2027-02-01', tresTendue: '14,20', tendue: '12', autre: '10', etatDesLieux: '4' }, AUTEUR));
    expect((await lireVersionsBaremes())[0]).toMatchObject({ id: v3.id, depuis: '2027-02-01', tresTendue: '14.2', saisiPar: 'Arnaud Jorel', corrigePar: 'Arnaud Jorel', baux: 0 });
    expect((await corrigerVersionBareme(v2.id, { depuis: '2027-03-01', tresTendue: '1', tendue: '1', autre: '1', etatDesLieux: '1' }, AUTEUR)).etat).toBe('refus');
    // Et, à la fin, les honoraires du bail A sont toujours ceux de l'entrée.
    expect(await un(`${HONO} WHERE c.bail_id = $1 ORDER BY c.id DESC LIMIT 1`, [bailA])).toEqual(avantA);
    ecrire('parametres-essai.json', JSON.stringify(await lireParametresLocation(), null, 2));
  });

  it('⑤ ESSAI sur « ESSAI BAIL DRIVE » (bail 536) : l’envoi passe par l’API Gmail et la RECETTE l’intercepte ; le message capturé', async () => {
    const loc = await un<{ id: string; bail: string }>(`SELECT l.id::text, o.bail_id::text AS bail FROM gestion_annuaire_locataire l
      JOIN gestion_annuaire_occupation o ON o.locataire_id = l.id WHERE l.nom = 'ESSAI BAIL DRIVE' ORDER BY o.id DESC LIMIT 1`);
    const bail = Number(loc.bail);
    // La liste par défaut d'Arno, remise par une nouvelle version (③ l'avait changée) : la copie personnelle revient en tête.
    ok(await enregistrerDestinataires(DESTINATAIRES_DEFAUT, AUTEUR));
    const a = (await apercuNouvelleLocation(bail, AUTEUR))!;
    expect(a.destinataires.map((d) => d.adresse)).toEqual(['a.jorel@sansvisavis.com', 'gestion@criterimmo.fr', 'gestion.criterimmo@gmail.com', 'laura@monga.io']);
    ecrire('apercu-essai.json', JSON.stringify(a, null, 2));
    expect(a.objet).toMatch(/^Nouvelle location · (NOUVEAUX? PROPRIÉTAIRES?|PROPRIÉTAIRES? DÉJÀ EN GESTION) · .+ · ESSAI BAIL DRIVE · 01\/11\/2026 · GARANTIE À VÉRIFIER$/);
    // L'interception de la recette : le VRAI chemin d'envoi (message RFC 822, API Gmail), et la décision de la recette.
    const interceptions: { action: string; canal?: string; corps: string }[] = [];
    const fetchRecette = (async (u: string | URL | Request, i?: RequestInit) => {
      const d = decisionRecette(String(u), i?.method, 'essai');
      interceptions.push({ action: d.action, canal: 'canal' in d ? d.canal : undefined, corps: String(i?.body ?? '') });
      if (d.action === 'laisser') throw new Error('la recette aurait laissé partir cet envoi');
      return new Response(JSON.stringify(d.corps), { status: d.statut, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const RECETTE: TransportDemande = {
      async envoyer(m) {
        const r = await envoyerViaGmail({ accessToken: 'recette', rfc822: construireRfc822(m, 'essai') }, { fetch: fetchRecette });
        return r.ok ? { ok: true, id: r.gmailMessageId, factice: false } : { ok: false, motif: r.motif };
      },
    };
    // Arno (21/10/2026) — avec un MESSAGE D'ACCOMPAGNEMENT (retours à la ligne, et un <b> qui doit rester du texte).
    const message = 'Bonjour à toutes et à tous,\nvoici le dossier du bail d’essai.\nCe <b>texte</b> ne doit pas être interprété.';
    const r = await envoyerNouvelleLocation(bail, a.destinataires.map(({ adresse, libelle }) => ({ adresse, libelle })), AUTEUR, { transport: RECETTE }, message);
    expect(r.etat).toBe('ok');
    expect(interceptions).toHaveLength(1);
    expect(interceptions[0]).toMatchObject({ action: 'simuler', canal: 'gmail_envoi' });
    const eml = decoderRfc822((JSON.parse(interceptions[0].corps) as { raw: string }).raw)!;
    ecrire('mail-intercepte-essai.eml', eml);
    ecrire('mail-intercepte-essai.html', a.html);
    expect(eml).toMatch(/^From: .*gestion@criterimmo\.fr/m);
    expect(eml).toMatch(/^To: .*a\.jorel@sansvisavis\.com/m);
    expect(eml).toContain('text/html');
    const { rows } = await query<{ statut: string; auteur_libelle: string; message_id: string | null; message: string | null }>(
      'SELECT statut, auteur_libelle, message_id, message FROM gestion_location_mail_envoi WHERE bail_id = $1', [bail]);
    expect(rows).toEqual([{ statut: 'envoye', auteur_libelle: 'Arnaud Jorel', message_id: expect.stringMatching(/^<.+@criterimmo\.fr>$/), message }]);
    // Le message, dans le mail capturé (HTML et texte, encodés en base64 dans le RFC 822).
    const parties = [...eml.matchAll(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g)].map((m) => Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString('utf8'));
    const html = parties.find((x) => x.includes('<!doctype html>')) ?? '';
    const texte = parties.find((x) => !x.includes('<!doctype html>')) ?? '';
    ecrire('mail-intercepte-essai-message.html', html);
    expect(html).toContain('Message de Arnaud Jorel');
    expect(html).toContain('voici le dossier du bail d’essai.<br>Ce &lt;b&gt;texte&lt;/b&gt;');
    expect(html).not.toMatch(/background\s*:/i);
    expect(texte).toContain('── Message de Arnaud Jorel ──');
    expect(eml).toContain(`Message-ID: ${rows[0].message_id}`);
  });
});
