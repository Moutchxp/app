import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * T2 — lecture d'agrégation `chargerCumulsRuns`. On mocke `../db/client` (modèle demandeReponseRepo.test.ts) et on capture le
 * (sql, params) émis. Protocole : COMPORTEMENT (valeurs de retour, paramètres LIÉS) + SQL par FRAGMENTS sémantiques sur une
 * chaîne whitespace-normalisée, jamais la forme exacte du WHERE.
 */
const { appels, etat, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  // `dispatch` : rendre des lignes SPÉCIFIQUES à certaines requêtes (par fragment SQL) quand une lecture en enchaîne plusieurs
  //   (chargerSuiviReponses). Sans dispatch → `rows` par défaut, comme avant (rétrocompatible).
  const etat = { rows: [] as unknown[], dispatch: [] as { re: RegExp; rows: unknown[] }[], curseur: null as Date | null, plafond: false };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    // P1 — curseur (Date, PAS ::text) + plafond de la dernière passe courante : requêtes spécifiques (avant le dispatch générique).
    if (/declencheur = 'planifie' AND plafond_atteint IS NOT TRUE/i.test(sql)) return { rows: etat.curseur ? [{ t: etat.curseur }] : [], rowCount: etat.curseur ? 1 : 0 };
    if (/plafond_atteint AS p/i.test(sql)) return { rows: [{ p: etat.plafond }], rowCount: 1 };
    const hit = etat.dispatch.find((d) => d.re.test(sql));
    const rows = hit ? hit.rows : etat.rows;
    return { rows, rowCount: rows.length };
  };
  return { appels, etat, queryMock };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: vi.fn(), pool: {}, closePool: async () => undefined }));

import { chargerCumulsRuns, chargerSuiviReponses, chargerDemandesSuivi, listerLiensATelecharger } from './reponsesSuivi';
import { bornesFenetres } from './fenetresCumul';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const MAINTENANT = new Date('2026-08-09T12:00:00.000Z');
const JOUR = 24 * 3_600_000;

beforeEach(() => { appels.length = 0; etat.rows = []; etat.dispatch = []; etat.curseur = null; etat.plafond = false; });

describe('T6-A — chargerDemandesSuivi : SOURCE UNIQUE (échéance + retour + dossiers), NON filtrée', () => {
  const DEM = /min\(a\.envoye_le\)::text AS envoye_le/;   // requête des demandes envoyée/close
  const DOSS = /ORDER BY dd\.demande_id, s\.num_dau/;     // requête des dossiers dus
  const OK = /max\(termine_le\)/;                          // fraîcheur (derniereOkLe)

  it('renvoie les demandes envoyée/close + réglages + derniereOkLe ; une demande SANS message y FIGURE (aucun filtre « la mairie a écrit » ici)', async () => {
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'SVAV-DEM-2026-000154', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 2, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: DOSS, rows: [
        { demande_id: 154, dossier_id: 5, num_dau: 'PC0930011', adresse: null, satisfait: false, satisfait_par: null, triage: null, refus_le: null },
        { demande_id: 154, dossier_id: 6, num_dau: 'PC0930012', adresse: null, satisfait: false, satisfait_par: null, triage: null, refus_le: null },
      ] },
    ];
    const { demandes, derniereOkLe, reglages } = await chargerDemandesSuivi();
    expect(derniereOkLe).toBe('2026-08-10T09:00:00Z');
    expect(reglages).toEqual(expect.objectContaining({ fraicheurHeures: expect.any(Number), alerteJours: expect.any(Number) })); // pour etatEcheance
    expect(demandes).toHaveLength(1);
    // la demande sans réponse (nb_reponses 0) ET sans dossier statué EST bien renvoyée : le filtre Réponses est EN AVAL, pas ici.
    expect(demandes[0]).toMatchObject({ demandeId: 154, nbReponses: 0, nbReponsesReelles: 0, dossiersActifs: 2, dossiersSatisfaits: 0, dossiersEnGed: 0, statutAcheminement: 'envoye', envoyeLe: '2026-07-01T10:00:00Z' });
    expect(demandes[0].dossiers).toHaveLength(2); // dossiers DUS présents (alimentent DetailDossiers en « En cours »)
    // la requête des demandes ne pose AUCUNE condition sur les messages : critère de statut seul (envoyee/close).
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).toContain("WHERE d.statut IN ('envoyee', 'close')");
    expect(norm(dem.sql)).not.toContain('nb_reponses > 0');
    // T3 — DEUX compteurs distincts : « a écrit » (nb_reponses, hors rebond) et « a répondu » (nb_reponses_reelles, hors accusé ET hors rebond).
    expect(norm(dem.sql)).toContain("nature <> 'rebond'");                // a écrit + derniere_reponse_le
    expect(norm(dem.sql)).toContain("nature NOT IN ('accuse','rebond')"); // a répondu (pilote « Réponses »)
    // T8 — « en GED » (dossier_document, déf. G1/G2) chargé À PART de satisfait_le → « obtenu » ne ment plus.
    expect(norm(dem.sql)).toContain('EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id)');
    expect(norm(dem.sql)).toContain('AS dossiers_en_ged');
  });

  it('LOT-4 — historiqueNonVide reflète le FIL (5 sources dont les ENVOIS), par requête SÉPARÉE de `dem`', async () => {
    const HIST = /demande_sortant_hors_outil s/; // fragment UNIQUE au signal historique (absent de `dem`)
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
    ];
    await chargerDemandesSuivi();
    const hist = appels.find((a) => HIST.test(a.sql));
    expect(hist, 'la requête du signal « historique » doit être émise').toBeDefined();
    const s = norm(hist!.sql);
    // les 5 sources du fil (BlocFilEchanges) : ENVOIS + reçus + hors-outil + journal (compl/decl/réponse libre).
    expect(s).toContain('demande_acheminement a');        // LOT-4 : les ENVOIS entrent dans le signal (sinon famille cachée à tort)
    expect(s).toContain("a.statut = 'envoye'");
    expect(s).toContain("nature <> 'rebond'");             // reçus
    expect(s).toContain('demande_sortant_hors_outil s');   // hors-outil (FIL-C)
    expect(s).toContain('demande_journal j');              // journal (préfixes de messages)
    // 🔴 requête SÉPARÉE : ce n'est PAS la requête centrale `dem`, et le critère « fil » ne s'y invite pas.
    expect(DEM.test(hist!.sql)).toBe(false);
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).toContain("WHERE d.statut IN ('envoyee', 'close')");
    expect(norm(dem.sql)).not.toContain('demande_sortant_hors_outil');
  });

  it('LOT 13-B — historique de NOS envois : acheminement (initial/ordinaire) + journal (partiel) FUSIONNÉS, ordonnés, SÉPARÉS de `dem`', async () => {
    const ACHEM = /a\.envoye_le::text AS le, a\.relance_id::int/;  // ma requête acheminement (fragment UNIQUE)
    const JOURNAL = /coalesce\(\(j\.details->>'rang'\)::int/;      // ma requête journal partiel (fragment UNIQUE)
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: ACHEM, rows: [
        { demande_id: 154, le: '2026-08-04T21:00:00Z', relance_id: null, variante: null, destinataire: 'mairie@ex.fr' }, // envoi initial (relance_id NULL)
        { demande_id: 154, le: '2026-08-26T09:00:00Z', relance_id: 8, variante: 'rappel', destinataire: 'mairie@ex.fr' }, // relance ORDINAIRE
      ] },
      { re: JOURNAL, rows: [{ demande_id: 154, le: '2026-09-10T08:00:00Z', rang: 1, destinataire: 'mairie@ex.fr' }] }, // relance PARTIELLE (journal)
    ];
    const { demandes } = await chargerDemandesSuivi();
    const hist = demandes[0].historiqueEnvois;
    // FUSION + ORDRE : demande initiale en tête, puis relance ordinaire, puis partielle ; grades NON fusionnés (Rappel vs « 1re relance »).
    expect(hist.map((e) => e.nature)).toEqual(['initiale', 'relance_ordinaire', 'relance_partielle']);
    expect(hist.map((e) => e.grade)).toEqual([null, 'Rappel', '1re relance']);
    // 🔴 DEUX requêtes SÉPARÉES, jamais la requête centrale `dem` ; le préfixe de motif partiel est LIÉ (paramètre), pas concaténé.
    const achem = appels.find((a) => ACHEM.test(a.sql))!;
    expect(DEM.test(achem.sql)).toBe(false);
    const journal = appels.find((a) => JOURNAL.test(a.sql))!;
    expect(norm(journal.sql)).toContain("j.motif LIKE $2 || '%'");
    expect(journal.params[1]).toBe('relance partielle envoyée'); // MOTIF_RELANCE_PARTIELLE_PREFIXE lié
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).not.toContain('a.envoye_le::text AS le'); // `dem` INCHANGÉE (aucun fragment de l'historique)
  });

  it('LOT 13-A — compteur de familles manquantes : lecture `permis_completude` batchée par dossier, SÉPARÉE de `dem`', async () => {
    const COMPL = /FROM permis_completude WHERE dossier_id = ANY/; // ma lecture du compteur (fragment UNIQUE ; ≠ du signal completudeNonVide qui JOIN permis_completude)
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: DOSS, rows: [{ demande_id: 154, dossier_id: 5, num_dau: 'PC0930011', adresse: null, satisfait: false, satisfait_par: null, triage: null, refus_le: null }] },
    ];
    await chargerDemandesSuivi();
    const compl = appels.find((a) => COMPL.test(a.sql));
    expect(compl, 'la lecture du compteur (permis_completude par dossier) doit être émise').toBeDefined();
    expect(DEM.test(compl!.sql)).toBe(false); // jamais la requête centrale `dem`
  });

  it('LOT 17/19-C — mention « N échanges » : DERNIER MAIL RÉEL (déclarations EXCLUES), compte + date batchés, SÉPARÉS de `dem`', async () => {
    const ECH = /to_char\(GREATEST\(/; // ma requête compte+date (fragment UNIQUE)
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: ECH, rows: [{ demande_id: 154, n: 7, dernier: '2026-08-28T13:59:51Z' }] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    expect(demandes[0].nbEchanges).toBe(7);
    expect(demandes[0].dernierEchangeLe).toBe('2026-08-28T13:59:51Z');
    const ech = appels.find((a) => ECH.test(a.sql))!;
    const s = norm(ech.sql);
    // périmètre = mails RÉELS échangés : envois (acheminement) + reçus + hors-outil + journal compléments/réponses libres.
    expect(s).toContain("demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye'");
    expect(s).toContain("demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond'");
    expect(s).toContain('demande_sortant_hors_outil s WHERE s.demande_id = d.id');
    expect(s).toContain('j.motif LIKE ANY($2::text[])');
    // 🔴 LOT 19 : DÉCLARATIONS exclues → 2 préfixes seulement (complément + réponse libre), pas de « déclaré ».
    expect((ech.params[1] as string[]).length).toBe(2);
    expect((ech.params[1] as string[]).some((p) => p.startsWith('relance de complément déclarée'))).toBe(false);
    // 🔴 requête SÉPARÉE, jamais `dem`
    expect(DEM.test(ech.sql)).toBe(false);
    expect(norm(appels.find((a) => DEM.test(a.sql))!.sql)).not.toContain('to_char(GREATEST(');
  });

  it('LOT 18 — annonce CADA (journal) batchée SÉPARÉE de `dem` ; réglages de cascade partielle exposés (config, projection du parcours)', async () => {
    const ANN = /AS le, details->>'destinataire' AS destinataire/; // LOT 21 : annonce CADA = date + destinataire du dernier (DISTINCT ON) — « AS le » absent de la requête réclamation
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: ANN, rows: [{ demande_id: 154, le: '2026-09-27T07:00:00Z' }] },
    ];
    const data = await chargerDemandesSuivi();
    expect(data.demandes[0].annonceCadaEnvoyeeLe).toBe('2026-09-27T07:00:00Z');
    // réglages partiels exposés pour la projection (issus de config, jamais en dur)
    expect(data.reglagesPartiel).toEqual(expect.objectContaining({ relanceJours: expect.any(Number), nbRelancesAvantAnnonce: expect.any(Number), annonceJours: expect.any(Number), saisineJours: expect.any(Number) }));
    const ann = appels.find((a) => ANN.test(a.sql))!;
    expect(norm(ann.sql)).toContain("motif LIKE $2 || '%'"); // motif LIÉ (préfixe annonce CADA)
    expect(ann.params[1]).toBe('annonce CADA envoyée');
    expect(DEM.test(ann.sql)).toBe(false); // requête SÉPARÉE
  });

  it('LOT-9 C — CONTACT MAIRIE : interlocuteurs (dernier message, tri récence) + destinataire, par requêtes SÉPARÉES de `dem`', async () => {
    const EXP = /max\(r\.recu_le\)::text AS dernier/; // fragment UNIQUE de la requête des interlocuteurs
    etat.dispatch = [
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
    ];
    await chargerDemandesSuivi();
    const exp = appels.find((a) => EXP.test(a.sql));
    expect(exp, 'la requête des interlocuteurs doit être émise').toBeDefined();
    const s = norm(exp!.sql);
    expect(s).toContain('FROM demande_reponse r');
    expect(s).toContain("nature <> 'rebond'");                       // vrais messages reçus
    expect(s).toContain('GROUP BY r.demande_id, r.de_adresse');      // une ligne par (demande, adresse)
    expect(s).toContain('ORDER BY r.demande_id, max(r.recu_le) DESC'); // TRI par récence
    // destinataire d'origine, requête séparée
    const dest = appels.find((a) => /nullif\(dest_email, ''\) AS dest/.test(a.sql));
    expect(dest, 'la requête du destinataire doit être émise').toBeDefined();
    // 🔴 `dem` inchangé : le critère « contact » ne s'invite pas dans la requête centrale
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).toContain("WHERE d.statut IN ('envoyee', 'close')");
    expect(norm(dem.sql)).not.toContain('GROUP BY r.demande_id, r.de_adresse'); // le regroupement « contact » ne s'invite pas dans dem
  });

  it('T1 — dossiers RETIRÉS exposés par une requête SÉPARÉE (NOT dd.actif) ; le PÉRIMÈTRE de `dem` reste INCHANGÉ', async () => {
    const RETIRES = /NOT dd\.actif/; // requête dédiée aux dossiers retirés (distincte des DUS : dd.actif AND satisfait_le IS NULL)
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'SVAV-DEM-2026-000154', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 0, nb_reponses_reelles: 0, derniere_reponse_le: null }] },
      { re: RETIRES, rows: [{ demande_id: 154, dossier_id: 9, num_dau: 'PC0930099', adresse: '3 rue X' }] }, // AVANT DOSS : la requête retirés partage l'ORDER BY
      { re: DOSS, rows: [{ demande_id: 154, dossier_id: 5, num_dau: 'PC0930011', adresse: null, satisfait: false, satisfait_par: null, triage: null, refus_le: null }] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    // la donnée est exposée, DISTINCTE des dus (un dossier n'est jamais dans les deux).
    expect(demandes[0].dossiers).toHaveLength(1);
    expect(demandes[0].dossiersRetires).toEqual([{ dossierId: 9, numDau: 'PC0930099', adresse: '3 rue X' }]);
    // 🔴 PÉRIMÈTRE INCHANGÉ : la requête `dem` garde son SEUL critère de statut, sans aucune condition sur dd.actif / retirés.
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).toContain("WHERE d.statut IN ('envoyee', 'close')");
    expect(norm(dem.sql)).not.toContain('NOT dd.actif');
    // une requête SÉPARÉE porte les retirés, DANS LE MÊME périmètre de statut (aucun WHERE ajouté à la source partagée).
    const ret = appels.find((a) => RETIRES.test(a.sql))!;
    expect(ret, 'une requête dédiée aux dossiers retirés doit être émise').toBeDefined();
    expect(norm(ret.sql)).toContain("WHERE d.statut IN ('envoyee', 'close') AND NOT dd.actif");
  });

  it('FUS — provenancesContenu : messages porteurs de contenu (lien fort OU pièce), le PLUS RÉCENT d’abord + expéditeur ; `dem` inchangé', async () => {
    const PROV = /AS a_lien/; // requête dédiée à la provenance du contenu
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'R', code_insee: '75056', commune_nom: 'Paris', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 1, nb_reponses_reelles: 1, derniere_reponse_le: '2026-08-12T09:00:00Z' }] },
      { re: PROV, rows: [ // fournies plus-récent-d'abord (l'ORDER BY vit dans le SQL, pas dans le mock)
        { demande_id: 154, recu_le: '2026-08-12T09:00:00Z', de_adresse: 'urba@paris.fr', a_lien: false, a_piece: true },
        { demande_id: 154, recu_le: '2026-08-10T13:24:00Z', de_adresse: 'no-reply@paris.fr', a_lien: true, a_piece: false },
      ] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    expect(demandes[0].provenancesContenu).toEqual([
      { recuLe: '2026-08-12T09:00:00Z', deAdresse: 'urba@paris.fr', aLien: false, aPiece: true },
      { recuLe: '2026-08-10T13:24:00Z', deAdresse: 'no-reply@paris.fr', aLien: true, aPiece: false },
    ]);
    // le SELECT ajouté porte le prédicat de CONTENU (lien fort OU pièce) + `de_adresse`, ordonné plus récent d'abord.
    const prov = appels.find((a) => PROV.test(a.sql))!;
    expect(prov, 'un SELECT de provenance doit être émis').toBeDefined();
    const s = norm(prov.sql);
    expect(s).toContain("l.fort");
    expect(s).toContain('demande_reponse_piece');
    expect(s).toContain('r.de_adresse');
    expect(s).toContain('r.recu_le DESC');
    // 🔴 PÉRIMÈTRE INCHANGÉ : la requête `dem` garde son seul critère de statut ; aucune condition « contenu » ne s'y invite.
    const dem = appels.find((a) => DEM.test(a.sql))!;
    expect(norm(dem.sql)).toContain("WHERE d.statut IN ('envoyee', 'close')");
    expect(norm(dem.sql)).not.toContain('AS a_lien');
  });

  it('chargerSuiviReponses DÉLÈGUE à chargerDemandesSuivi : mêmes demandes exposées (non-régression de l’extraction)', async () => {
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 200, reference: 'SVAV-DEM-2026-000200', code_insee: '75056', commune_nom: 'Paris', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, nb_reponses: 1, nb_reponses_reelles: 1, derniere_reponse_le: '2026-07-20T08:00:00Z' }] },
    ];
    const data = await chargerSuiviReponses();
    expect(data.demandes).toHaveLength(1);
    expect(data.demandes[0]).toMatchObject({ demandeId: 200, nbReponses: 1, nbReponsesReelles: 1, derniereReponseLe: '2026-07-20T08:00:00Z' });
    expect(data.derniereOkLe).toBe('2026-08-10T09:00:00Z'); // même valeur, remontée par la source unique
  });
});

describe('B2 — chargerSuiviReponses : la date d’envoi (échéance à l’écran) se lit QUEL QUE SOIT le canal', () => {
  it('la jointure d’acheminement (ancre envoye_le) ne filtre PLUS canal=email → un dépôt formulaire est vu à l’écran', async () => {
    etat.rows = [];
    await chargerSuiviReponses();
    // la requête « suivi » = celle qui agrège min(a.envoye_le) en joignant demande_acheminement
    const dem = appels.find((a) => /min\(a\.envoye_le\)::text AS envoye_le/.test(a.sql));
    expect(dem, 'la requête suivi doit joindre l’acheminement pour l’ancre envoye_le').toBeDefined();
    const s = norm(dem!.sql);
    expect(s).toContain('LEFT JOIN demande_acheminement a ON a.demande_id = d.id');
    // B2 : plus AUCUN prédicat a.canal (le filtre e-mail est levé → la ligne canal='formulaire' de 119 est jointe → envoye_le lu)
    expect(s).not.toContain('a.canal');
  });
});

describe('T4 — chargerSuiviReponses : deux files DISTINCTES (« à rattacher » vs « dépôts à confirmer »)', () => {
  const RAT = /ORDER BY r\.recu_le DESC/;                 // requête des messages non rattachés
  const CIBLES = /dest_canal = 'formulaire'/;             // requête des demandes EN ATTENTE déposables à la main

  it('citant d’une demande en attente → proposition (hors « à rattacher ») ; sans rapport → reste à rattacher ; citant IGNORÉ → nulle part', async () => {
    etat.dispatch = [
      { re: RAT, rows: [
        // M1 : cite le num_dau de la demande 100 (en attente) → PROPOSITION, 2 pièces (qui ne satisfont RIEN)
        { id: 10, recu_le: '2026-08-05', de_adresse: 'urba@mairie.fr', de_nom: 'Mairie', objet: 'Dépôt PC 093 001 25 00081 enregistré', corps_texte: null, traite_le: null, rattachement_methode: 'aucun', nb_pieces: 2 },
        // M2 : sans rapport → reste « à rattacher »
        { id: 11, recu_le: '2026-08-04', de_adresse: 'pub@spam.fr', de_nom: null, objet: 'Publicité sans rapport', corps_texte: null, traite_le: null, rattachement_methode: 'aucun', nb_pieces: 0 },
        // M3 : cite la demande 100 mais a été IGNORÉ (traite_le posé) → ni proposition ni « à rattacher » (ne réapparaît pas)
        { id: 12, recu_le: '2026-08-03', de_adresse: 'urba@mairie.fr', de_nom: 'Mairie', objet: 'Dépôt PC 093 001 25 00081', corps_texte: null, traite_le: '2026-08-06', rattachement_methode: 'aucun', nb_pieces: 0 },
      ] },
      { re: CIBLES, rows: [
        { demande_id: 100, reference: 'SVAV-DEM-2026-000156', commune_nom: 'Paris', num_daus: ['PC 093 001 25 00081'], refs_mairie: [] },
      ] },
    ];
    const data = await chargerSuiviReponses();

    // proposition : un seul message actionnable, la demande 100 candidate, 2 pièces signalées
    expect(data.propositions).toHaveLength(1);
    expect(data.propositions[0]).toMatchObject({ id: 10, nbPieces: 2, candidats: [{ demandeId: 100, reference: 'SVAV-DEM-2026-000156', communeNom: 'Paris' }] });

    // à rattacher : SEULEMENT le message sans rapport (M2). M1 (proposition) et M3 (ignoré) en sont EXCLUS.
    expect(data.aRattacher.map((r) => r.id)).toEqual([11]);

    // la requête des cibles ne regarde QUE les demandes en attente déposables à la main (formulaire, brouillon/prête)
    const cible = appels.find((a) => CIBLES.test(a.sql))!;
    expect(cible, 'la requête des cibles de dépôt doit être émise').toBeDefined();
    expect(norm(cible.sql)).toContain("d.statut IN ('brouillon', 'prete')");
  });

  it('aucune demande en attente → aucune proposition ; le message non rattaché reste « à rattacher »', async () => {
    etat.dispatch = [
      { re: RAT, rows: [{ id: 10, recu_le: '2026-08-05', de_adresse: 'urba@mairie.fr', de_nom: 'Mairie', objet: 'Dépôt PC 093 001 25 00081', corps_texte: null, traite_le: null, rattachement_methode: 'aucun', nb_pieces: 0 }] },
      { re: CIBLES, rows: [] },
    ];
    const data = await chargerSuiviReponses();
    expect(data.propositions).toHaveLength(0);
    expect(data.aRattacher.map((r) => r.id)).toEqual([10]); // faute de cible, le message reste à rattacher
  });
});

describe('T2 — le détail des dossiers ne liste QUE les dus (les obtenus vivent dans Archives, jamais dans les deux onglets)', () => {
  it('la requête de détail exige satisfait_le IS NULL (dossier dû) + dd.actif', async () => {
    await chargerSuiviReponses();
    const doss = appels.find((a) => norm(a.sql).includes('ORDER BY dd.demande_id, s.num_dau'));
    expect(doss, 'la requête de détail des dossiers doit être émise').toBeDefined();
    const s = norm(doss!.sql);
    expect(s).toContain('dd.satisfait_le IS NULL'); // seuls les dossiers DUS sont listés sous la demande
    expect(s).toContain('dd.actif');
  });
});

describe('T2 — chargerCumulsRuns : une requête, six fenêtres', () => {
  it('émet les cinq fenêtres bornées (FILTER + param lié) et le total sans borne', async () => {
    etat.rows = [{}];
    await chargerCumulsRuns(MAINTENANT);
    expect(appels).toHaveLength(1); // un seul aller-retour
    const sql = norm(appels[0].sql);
    expect(sql).toContain('FROM releve_run');
    // fenêtre bornée (24h = $1) : somme et comptage filtrés
    expect(sql).toContain('coalesce(sum(vus) FILTER (WHERE demarre_le >= $1), 0)::int AS w0_vus');
    expect(sql).toContain("count(demarre_le) FILTER (WHERE demarre_le >= $1 AND resultat = 'erreur')::int AS w0_err");
    // total (w5) SANS borne : ni FILTER de fenêtre sur la somme, ni sur le comptage de relèves
    expect(sql).toContain('coalesce(sum(vus), 0)::int AS w5_vus');
    expect(sql).toContain('count(demarre_le)::int AS w5_nb');
    // cumule aussi les compteurs de bruit et d'événement (échantillon)
    expect(sql).toContain('sum(rebonds_etrangers)');
    expect(sql).toContain('sum(pieces_deposees)');
    // cinq bornes LIÉES (24h,7j,30j,90j,365j), la total n'en consomme aucune
    const bornes = bornesFenetres(MAINTENANT);
    expect(appels[0].params).toEqual([
      bornes[0].depuis!.toISOString(), bornes[1].depuis!.toISOString(), bornes[2].depuis!.toISOString(),
      bornes[3].depuis!.toISOString(), bornes[4].depuis!.toISOString(),
    ]);
    expect(appels[0].params[0]).toBe(new Date(MAINTENANT.getTime() - JOUR).toISOString());
    expect(appels[0].params[4]).toBe(new Date(MAINTENANT.getTime() - 365 * JOUR).toISOString());
  });

  it('livre les SIX fenêtres en une seule charge → changer de période n’exige aucun rechargement', async () => {
    etat.rows = [{}];
    const cumuls = await chargerCumulsRuns(MAINTENANT);
    expect(Object.keys(cumuls).sort()).toEqual(['24h', '30j', '365j', '7j', '90j', 'total']);
  });

  it('reshape : chaque alias wN_col est remis sur la bonne fenêtre et la bonne propriété', async () => {
    etat.rows = [{
      w0_nb: 3, w0_err: 1, w0_vus: 30, w0_deja_connus: 5, w0_retenus: 2, w0_rebonds_etrangers: 9, w0_pieces_non_deposees: 4,
      w5_nb: 100, w5_err: 7, w5_vus: 1000, w5_enregistrees: 12, w5_pieces_deposees: 8,
    }];
    const cumuls = await chargerCumulsRuns(MAINTENANT);
    expect(cumuls['24h']).toMatchObject({ nbReleves: 3, nbErreurs: 1, vus: 30, dejaConnus: 5, retenus: 2, rebondsEtrangers: 9, piecesNonDeposees: 4 });
    expect(cumuls['24h'].rattaches).toBe(0); // alias absent du row → 0, jamais NULL
    expect(cumuls.total).toMatchObject({ nbReleves: 100, nbErreurs: 7, vus: 1000, enregistrees: 12, piecesDeposees: 8 });
  });

  it('aucune relève (row vide ou absent) → cumuls à zéro, jamais NULL', async () => {
    etat.rows = [{}];
    const c1 = await chargerCumulsRuns(MAINTENANT);
    expect(c1['7j']).toMatchObject({ nbReleves: 0, nbErreurs: 0, vus: 0, retenus: 0, enregistrees: 0 });
    etat.rows = []; // pas même une ligne d'agrégat
    const c2 = await chargerCumulsRuns(MAINTENANT);
    expect(c2.total.nbReleves).toBe(0);
    expect(c2.total.vus).toBe(0);
  });
});

describe('L1 — chargerDemandesSuivi : liens captés par demande (forts d’abord), sans jamais suivre un lien', () => {
  const OK = /max\(termine_le\)/;
  const DEM = /min\(a\.envoye_le\)::text AS envoye_le/;
  const LIENS = /FROM demande_reponse_lien/;
  const GED = 'https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder';

  it('rattache les liens à leur demande (fort en tête + expiration relative) et lit UNIQUEMENT en base', async () => {
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'SVAV-DEM-2026-000154', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, nb_reponses: 1, nb_reponses_reelles: 1, derniere_reponse_le: '2026-08-10T13:24:00Z' }] },
      { re: LIENS, rows: [
        { demande_id: 154, url: GED, fort: true, recu_le: '2026-08-10T13:24:00Z', expire_le: '2026-08-17T13:24:00Z', expiration_source: 'relative', expiration_indice: '7 jours' },
        { demande_id: 154, url: 'https://opendata.paris.fr', fort: false, recu_le: '2026-08-10T13:24:00Z', expire_le: null, expiration_source: null, expiration_indice: null },
      ] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    expect(demandes[0].liens).toHaveLength(2);
    expect(demandes[0].liens[0]).toMatchObject({ url: GED, fort: true, recuLe: '2026-08-10T13:24:00Z', expireLe: '2026-08-17T13:24:00Z', expirationSource: 'relative', expirationIndice: '7 jours' });
    const q = appels.find((a) => LIENS.test(a.sql))!;
    expect(norm(q.sql)).toContain('JOIN demande_reponse r ON r.id = l.reponse_id');
    expect(norm(q.sql)).toContain('ORDER BY r.demande_id, l.fort DESC');
    // LECTURE SEULE : la requête des liens est un SELECT (aucune écriture, aucun appel réseau — c'est de l'affichage).
    expect(/^\s*SELECT/i.test(q.sql)).toBe(true);
  });
});

describe('T7-B — chargerDemandesSuivi : messages « autre » ancrés par demande (cas ③, Paris protégée)', () => {
  const OK = /max\(termine_le\)/;
  const DEM = /min\(a\.envoye_le\)::text AS envoye_le/;
  const MSG = /r\.nature = 'autre'/; // unique à la requête messagesAutre (la requête des demandes n'emploie jamais « = 'autre' »)

  it('rattache les messages autre à leur demande ; la requête porte l’ANCRE nature_classee_le IS NOT NULL', async () => {
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'SVAV-DEM-2026-000154', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 2, nb_reponses_reelles: 2, derniere_reponse_le: '2026-08-12T09:00:00Z' }] },
      { re: MSG, rows: [
        { demande_id: 154, id: 71, objet: 'Complément', de_adresse: 'urba@mairie.fr', de_nom: 'Urba', recu_le: '2026-08-12T09:00:00Z', repondu_le: null, repondu_par: null, repondu_auto: false },
        { demande_id: 154, id: 70, objet: 'Question', de_adresse: 'urba@mairie.fr', de_nom: null, recu_le: '2026-08-11T09:00:00Z', repondu_le: '2026-08-11T15:00:00Z', repondu_par: '5', repondu_auto: false },
        { demande_id: 154, id: 69, objet: 'Info', de_adresse: 'urba@mairie.fr', de_nom: null, recu_le: '2026-08-10T09:00:00Z', repondu_le: '2026-08-10T16:00:00Z', repondu_par: null, repondu_auto: true }, // T7-C : pré-coché système
      ] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    expect(demandes[0].messagesAutre).toHaveLength(3);
    expect(demandes[0].messagesAutre[0]).toMatchObject({ id: 71, objet: 'Complément', reponduLe: null, reponduAuto: false });
    expect(demandes[0].messagesAutre[1]).toMatchObject({ id: 70, reponduLe: '2026-08-11T15:00:00Z', reponduPar: '5', reponduAuto: false });
    expect(demandes[0].messagesAutre[2]).toMatchObject({ id: 69, reponduPar: null, reponduAuto: true }); // T7-C : « auto » lu sur repondu_auto_le
    const q0 = appels.find((a) => MSG.test(a.sql))!; // la requête expose bien le drapeau auto
    expect(norm(q0.sql)).toContain('(r.repondu_auto_le IS NOT NULL) AS repondu_auto');
    const q = appels.find((a) => MSG.test(a.sql))!;
    const sql = norm(q.sql);
    expect(sql).toContain("r.nature = 'autre'");
    expect(sql).toContain('r.nature_classee_le IS NOT NULL'); // ANCRE : un autre rétro-classé (Paris) n'apparaît jamais → ni signal ni bouton
    expect(sql).toContain('r.demande_id IS NOT NULL');        // rattachés uniquement (le signal de ligne exige une demande)
    expect(/^\s*SELECT/i.test(q.sql)).toBe(true);             // lecture seule
  });
});

describe('T5 — chargerDemandesSuivi : pièces des réponses rattachées, groupées par réponse (Réponses ET En cours)', () => {
  const OK = /max\(termine_le\)/;
  const DEM = /min\(a\.envoye_le\)::text AS envoye_le/;
  const PJR = /p\.id::int AS piece_id/; // unique à la requête T5 des pièces rattachées

  it('groupe les pièces par réponse (récente d’abord) ; bouton seulement si stockée, sinon motif ; clé jamais sélectionnée', async () => {
    etat.dispatch = [
      { re: OK, rows: [{ t: '2026-08-10T09:00:00Z' }] },
      { re: DEM, rows: [{ id: 154, reference: 'SVAV-DEM-2026-000154', code_insee: '93001', commune_nom: 'Aubervilliers', statut: 'envoyee', envoye_le: '2026-07-01T10:00:00Z', statut_acheminement: 'envoye', dossiers_actifs: 1, dossiers_satisfaits: 0, dossiers_en_ged: 0, nb_reponses: 2, nb_reponses_reelles: 2, derniere_reponse_le: '2026-08-12T09:00:00Z' }] },
      { re: PJR, rows: [
        { demande_id: 154, reponse_id: 71, recu_le: '2026-08-12T09:00:00Z', objet: 'Envoi des pièces', piece_id: 500, nom_fichier: 'plan.pdf', stockee: true, motif_non_stocke: null },
        { demande_id: 154, reponse_id: 71, recu_le: '2026-08-12T09:00:00Z', objet: 'Envoi des pièces', piece_id: 501, nom_fichier: 'coupe.pdf', stockee: false, motif_non_stocke: 'pièce trop volumineuse : 60 Mo (maximum 50 Mo)' },
        { demande_id: 154, reponse_id: 70, recu_le: '2026-08-05T09:00:00Z', objet: 'Première réponse', piece_id: 490, nom_fichier: 'arrete.pdf', stockee: true, motif_non_stocke: null },
      ] },
    ];
    const { demandes } = await chargerDemandesSuivi();
    const g = demandes[0].piecesReponses;
    expect(g).toHaveLength(2);                                   // deux réponses porteuses de pièces
    expect(g[0]).toMatchObject({ reponseId: 71, recuLe: '2026-08-12T09:00:00Z', objet: 'Envoi des pièces' });
    expect(g[0].pieces).toEqual([
      { id: 500, nomFichier: 'plan.pdf', stockee: true, motif: null },
      { id: 501, nomFichier: 'coupe.pdf', stockee: false, motif: 'pièce trop volumineuse : 60 Mo (maximum 50 Mo)' },
    ]);
    expect(g[1]).toMatchObject({ reponseId: 70, objet: 'Première réponse' });
    const q = appels.find((a) => PJR.test(a.sql))!;
    const sql = norm(q.sql);
    expect(sql).toContain("r.nature <> 'rebond'");              // un rebond n'est pas une réponse de mairie
    expect(sql).toContain('r.demande_id IS NOT NULL');         // rattachées uniquement
    expect(sql).toContain('(p.cle_stockage IS NOT NULL) AS stockee'); // exposée en booléen
    expect(sql).not.toMatch(/p\.cle_stockage\s+AS/i);          // la clé n'est JAMAIS renvoyée
    expect(/^\s*SELECT/i.test(q.sql)).toBe(true);              // lecture seule
    expect(JSON.stringify(demandes)).not.toContain('cle_stockage');
  });
});

describe('P1 — chargerSuiviReponses : « on relève depuis le … » et plafond exposés à l’écran', () => {
  it('releveDepuisLe = curseur − 3 j ; relevePlafondAtteint remonte le plafond de la dernière passe courante', async () => {
    etat.curseur = new Date('2026-08-09T12:00:00Z');
    etat.plafond = true;
    const data = await chargerSuiviReponses();
    expect(data.releveDepuisLe).toBe('2026-08-06T12:00:00.000Z'); // curseur − 3 j (marge)
    expect(data.relevePlafondAtteint).toBe(true);
  });

  it('aucun curseur → releveDepuisLe null (repli backfill), plafond faux', async () => {
    const data = await chargerSuiviReponses();
    expect(data.releveDepuisLe).toBeNull();
    expect(data.relevePlafondAtteint).toBe(false);
  });
});

describe('GED-1 — listerLiensATelecharger : lien fort + GED encore vide', () => {
  it('mappe (n° permis, nature en clair, url, expiration) ; SQL exige lien fort + GED vide, sans filtre de process (garde axe-F)', async () => {
    etat.dispatch = [{ re: /demande_reponse_lien l ON/i, rows: [
      { dossier_id: 531, num_dau: '07512025V0006', type: 'PC', commune_nom: 'Paris', nature: '1', adresse: '7 RUE ALPHONSE PENAUD', recu_le: '2026-08-28T11:45:00Z', url: 'https://ged-pcpr.apps.paris.fr/share/s/TOKEN/folder', expire_le: '2026-09-04T11:45:00Z', expiration_indice: '7 jours' },
    ] }];
    const liens = await listerLiensATelecharger();
    expect(liens).toHaveLength(1);
    expect(liens[0]).toMatchObject({ dossierId: 531, numDau: '07512025V0006', type: 'PC', communeNom: 'Paris', url: 'https://ged-pcpr.apps.paris.fr/share/s/TOKEN/folder', expireLe: '2026-09-04T11:45:00Z' });
    expect(liens[0].natureLibelle.length).toBeGreaterThan(1); // nature TRADUITE (jamais le code nu « 1 »)
    const q = appels.find((a) => /demande_reponse_lien l ON/i.test(a.sql))!;
    const sql = norm(q.sql);
    expect(sql).toContain('AND l.fort');                                                            // uniquement les liens FORTS
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = s.id)'); // GED encore VIDE
    expect(sql).not.toMatch(/dest_canal/i);                                                         // garde axe-F : aucun filtre de process
  });

  it('aucune ligne → liste vide', async () => {
    etat.dispatch = [{ re: /demande_reponse_lien l ON/i, rows: [] }];
    expect(await listerLiensATelecharger()).toEqual([]);
  });
});
