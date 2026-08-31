import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { marquerDossierPartiel, leverDossierPartiel, lireEtatPartiel, lireEtatsPartiel, estDemandeSuspendue, butoirPartielActif, evaluerLeveeAutoPartiel } from './dossierPartielRepo';
import { chargerDemandesSuivi } from '../veille/reponsesSuivi';
import { partitionnerParDus } from '../sitadel/demandesListe';
import { famillesAffichees } from './encartFamilles';

/**
 * PART-F ① — GARDE-FOU EN BASE : le butoir CADA d'un dossier partiel est FIXE (ancré sur la 1re réclamation, partiel_le). Une 2e
 * réclamation ne doit JAMAIS repousser `partiel_le` tant que le marqueur est actif (sinon la mairie repousse l'échéance à l'infini).
 * Seul un ré-armement APRÈS une levée (nouveau cycle) repose une nouvelle ancre. Itest : vraie base.
 */
const demandeIds: number[] = [];
const dossierIds: number[] = []; // FIX-3 : dossiers sitadel de test (contenu complétude+document), supprimés en fin
async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`); // FK commune : réutilise un code déjà valide
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee valide');
  return rows[0].code_insee;
}
async function creerDemande(statut = 'brouillon'): Promise<number> {
  // Référence au format imposé par le CHECK (^SVAV-DEM-[0-9]{4}-[0-9]{6}$) ; année 2099 = jeu d'itest, hors données réelles ; supprimée en fin.
  const ref = `SVAV-DEM-2099-${String(900001 + demandeIds.length).slice(0, 6)}`;
  const { rows } = await query<{ id: number }>(
    // RETURNING id::int : `demande.id` est bigint → sans cast le driver renvoie une CHAÎNE. En prod, les lookups se font par NOMBRE
    //   (chargerDemandesSuivi : d.id::int) ; le test DOIT donc manipuler un id NOMBRE pour refléter la vraie sémantique.
    `INSERT INTO demande (reference, code_insee, statut) VALUES ($1, $2, $3) RETURNING id::int AS id`, [ref, await codeInseeExistant(), statut]);
  const id = rows[0].id;
  demandeIds.push(id);
  return id;
}
async function partielLeBrut(id: number): Promise<string | null> {
  const { rows } = await query<{ t: string | null }>(`SELECT partiel_le::text AS t FROM demande WHERE id = $1`, [id]);
  return rows[0]?.t ?? null;
}

afterAll(async () => {
  for (const id of demandeIds) {
    await query(`DELETE FROM demande_dossier WHERE demande_id = $1`, [id]); // FK NO ACTION → délier avant de supprimer la demande
    await query(`DELETE FROM demande WHERE id = $1`, [id]);
  }
  for (const id of dossierIds) { // après les demandes (les liens demande_dossier sont partis) : contenu puis dossier
    await query(`DELETE FROM permis_completude WHERE dossier_id = $1`, [id]);
    await query(`DELETE FROM dossier_document WHERE dossier_id = $1`, [id]);
    await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]);
  }
});

describe('PART-F ① — marquerDossierPartiel : butoir FIXE (partiel_le ne bouge pas sur une 2e réclamation)', () => {
  it('2e réclamation active → partiel_le INCHANGÉ, mais familles rafraîchies', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    expect(t1).not.toBeNull();

    await marquerDossierPartiel(id, ['cerfa', 'masse'], 'declaree'); // 2e réclamation (nouvelle vague / re-clic)
    const t2 = await partielLeBrut(id);
    expect(t2).toBe(t1); // 🔴 l'ancre du butoir n'a PAS bougé

    const etat = await lireEtatPartiel(id);
    expect(etat?.familles.sort()).toEqual(['cerfa', 'masse']); // familles rafraîchies au manquant courant
    expect(etat?.origine).toBe('outil'); // origine de la 1re réclamation CONSERVÉE (pas écrasée par la 2e)
  });

  it('ré-armement APRÈS une levée (nouveau cycle) → nouvelle ancre partiel_le', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa'], 'outil');
    const t1 = await partielLeBrut(id);
    await leverDossierPartiel(id, 'itest');
    expect(await lireEtatPartiel(id)).toBeNull(); // levé → plus actif

    await marquerDossierPartiel(id, ['masse'], 'outil'); // dossier redevenu incomplet → nouveau cycle
    const t2 = await partielLeBrut(id);
    expect(t2).not.toBe(t1); // nouvelle ancre (la levée a clos le cycle précédent)
    expect((await lireEtatPartiel(id))?.familles).toEqual(['masse']);
  });
});

/**
 * 🔴 FIX-2b — LE défaut qui a fait disparaître le permis des deux onglets, IMPOSSIBLE à attraper par un test PUR/mocké : `demande.id`
 * est bigint → le driver pg le renvoie en CHAÎNE. Les Map/Set par id (lireEtatsPartiel / lireDemandesSuspendues / lireButoirsPartiel)
 * étaient alors clés STRING, or tous les consommateurs interrogent par NOMBRE (`chargerDemandesSuivi` fait `suspensions.get(d.id::int)`,
 * `estDemandeSuspendue(number)`) → miss silencieux → suspension null PARTOUT. Ces itests frappent la VRAIE base (vrai driver, vrai
 * cast id::int), donc ils échouent si le cast est retiré — ce qu'un mock renvoyant un id déjà-nombre ne verrait jamais.
 */
describe('FIX-2b — id bigint : les structures par id sont interrogeables par NOMBRE (défaut driver pg, invisible aux tests purs)', () => {
  it('marqueur actif → lireEtatsPartiel/estDemandeSuspendue/butoir matchent un lookup par NOMBRE', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa', 'etage'], 'declaree');

    const etats = await lireEtatsPartiel([id]); // exactement l'appel de chargerDemandesSuivi
    expect(etats.get(id), 'la Map DOIT être interrogeable par le NOMBRE id (sinon suspension null en affichage)').toBeDefined();
    expect(etats.get(id)?.familles.sort()).toEqual(['cerfa', 'etage']);
    expect(etats.get(id)?.origine).toBe('declaree'); // FIX-1 : origine 'declaree' bien portée

    expect(await estDemandeSuspendue(id), 'Set par NOMBRE (garde cascade + levée auto) — false silencieux sans le cast').toBe(true);
    expect(await butoirPartielActif(id, 1, 4), 'butoir CADA par NOMBRE').toBeInstanceOf(Date);
  });

  // Chaîne d'AFFICHAGE réelle, cas de la 154 : demande envoyée + marqueur partiel actif → chargerDemandesSuivi EXPOSE la suspension
  //   (le maillon qui était rompu), et le partitionnement front la classe VIVANTE (plus soldée) même à 0 dossier dû.
  it('chargerDemandesSuivi expose la suspension → le front classe la demande VIVANTE (plus soldée)', async () => {
    const id = await creerDemande('envoyee'); // statut envoyée → incluse dans le suivi
    await marquerDossierPartiel(id, ['etage'], 'declaree');

    const { demandes } = await chargerDemandesSuivi();
    const rich = demandes.find((d) => d.demandeId === id);
    expect(rich, 'la demande doit être dans le suivi').toBeDefined();
    expect(rich?.suspension, 'suspension DOIT être exposée (id::int) — maillon réparé par FIX-2b').not.toBeNull();

    // Reproduit la chaîne front (SuiviDemandes) : item de liste à 0 dossier dû, enrichi de la suspension issue de la donnée riche.
    const item = { id, nbDossiers: 1, dossiersDus: 0 };
    const enrichi = rich?.suspension != null ? { ...item, suspension: true } : item;
    const { vivantes, soldees } = partitionnerParDus([enrichi]);
    expect(vivantes.map((d) => d.id), 'VIVANTE en En cours').toEqual([id]);
    expect(soldees, 'plus classée soldée').toHaveLength(0);
  });
});

/**
 * 🔴 FIX-3 — l'ENCART de familles « En cours » sur une VRAIE ligne. UNIF-1 n'avait jamais été exercé qu'en SCAN DE SOURCE (aucune
 * demande en base) : c'est le premier passage d'une demande réelle. Un dossier SATISFAIT dont la demande est en PARTIEL ACTIF
 * (incomplet, revenu) doit garder son contenu per-permis dans l'encart (« garde tout sous la main », UNIF-1). Itest : vraie base
 * (chargerDemandesSuivi + socle familleAffichee), le seul format qui exerce la chaîne d'affichage réelle.
 */
async function creerDossierAvecContenu(): Promise<number> {
  // Dossier sitadel de TEST autonome + son contenu (complétude + 1 document GED). Dédié → jamais lié activement ailleurs (la contrainte
  //   demande_dossier_unique_actif interdit un 2e lien actif sur un dossier réel comme 7424). Nettoyé en fin. num_dau/code_insee de test.
  const suffixe = String(900001 + dossierIds.length);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TESTDOSS${suffixe}`]);
  const id = rows[0].id;
  dossierIds.push(id);
  await query(`INSERT INTO permis_completude (dossier_id, classements, nb_pieces) VALUES ($1, '{}'::jsonb, 0)`, [id]);
  await query(`INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage) VALUES ($1, 'test-fix3.pdf', 'test/fix3')`, [id]);
  return id;
}

describe('FIX-3 — encart « En cours » : un dossier satisfait-mais-partiel garde son contenu per-permis', () => {
  it('chargerDemandesSuivi → dossiersEncart inclut le dossier satisfait-partiel, signaux vrais, familles Complétude+Pièces affichées', async () => {
    const demandeId = await creerDemande('envoyee');
    const dossierId = await creerDossierAvecContenu(); // dossier de test portant permis_completude + dossier_document
    // Lien SATISFAIT (satisfait_le renseigné) → hors des « dûs » ; demande en PARTIEL ACTIF → le dossier reste « en jeu » pour l'encart.
    await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif, satisfait_le) VALUES ($1, $2, true, now())`, [demandeId, dossierId]);
    await marquerDossierPartiel(demandeId, ['cerfa', 'etage'], 'declaree');

    const { demandes } = await chargerDemandesSuivi();
    const rd = demandes.find((d) => d.demandeId === demandeId);
    expect(rd, 'la demande doit être dans le suivi').toBeDefined();

    // `dossiers` (DÛS) exclut le dossier satisfait (DetailDossiers/Archives inchangés) ; `dossiersEncart` l'inclut (contenu per-permis).
    expect(rd!.dossiers.some((x) => x.dossierId === dossierId), 'dûs : dossier satisfait exclu').toBe(false);
    expect(rd!.dossiersEncart.some((x) => x.dossierId === dossierId), 'encart : dossier satisfait-partiel inclus').toBe(true);

    // Signaux batchés : le contenu réel remonte MALGRÉ satisfait_le (c'est le défaut que FIX-3 corrige).
    expect(rd!.completudeNonVide, 'complétude non vide (permis_completude)').toBe(true);
    expect(rd!.piecesNonVide, 'pièces non vides (dossier_document)').toBe(true);

    // Décision d'affichage RÉELLE (socle) : Complétude + Pièces apparaissent (avant FIX-3 : absentes) ; Suivi toujours (remplissable).
    const affichees = famillesAffichees('en_cours', {
      suivi_actions: true, historique: rd!.historiqueNonVide, completude: rd!.completudeNonVide,
      caracteristiques: rd!.caracteristiquesNonVide, batiments: rd!.batimentsNonVide, pieces: rd!.piecesNonVide,
    });
    expect(affichees).toContain('suivi_actions');
    expect(affichees).toContain('completude');
    expect(affichees).toContain('pieces');
  });
});

/**
 * 🔴 LOT-1 / CASC-2 — ANCRAGE DE LA DATE DÉCLARÉE. Une relance déclarée hors outil (PART-3e) doit ancrer `partiel_le` sur la date
 * d'ENVOI RÉELLEMENT affirmée par Arno, posée à **12:00 Europe/Paris**, et NON sur l'instant du clic. Sinon le butoir CADA part du jour
 * de saisie dans l'outil (cas 154 : déclaré le 31/08 pour un envoi du 28/08 → butoir 05/10 au lieu de 02/10 — 3 jours indûment gagnés,
 * et une date juridique fausse). Le choix de 12:00 (jamais minuit) évite le glissement d'un jour entre le calcul UTC de `dateButoirPartiel`
 * et l'affichage Europe/Paris. Itest : VRAIE base (vrai `AT TIME ZONE`, vrai driver pg) — le seul format qui prouve le calendrier réel ;
 * un test pur ne verrait ni le fuseau ni le stockage. Sans le correctif (`ELSE now()`), `partiel_le` = l'instant du test → l'assertion
 * d'ancre échoue et le butoir dérive → ces cas ROUGISSENT (vérifié par revert temporaire avant commit).
 */
function jourParis(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
async function ancreEst12hParis(id: number, jour: string): Promise<boolean> {
  // Compare partiel_le à la RÉ-évaluation de la même expression → équivalence d'instant (déterministe, DST géré par AT TIME ZONE).
  const { rows } = await query<{ ok: boolean }>(
    `SELECT (partiel_le = (($2::date + interval '12 hours') AT TIME ZONE 'Europe/Paris')) AS ok FROM demande WHERE id = $1`, [id, jour]);
  return rows[0]?.ok ?? false;
}

describe('CASC-2 / LOT-1 — ancre du butoir = date d’envoi déclarée (12:00 Europe/Paris), pas l’instant du clic', () => {
  it('déclaration au 28/08 → partiel_le = 28/08 12:00 Paris, butoir = 02/10/2026 (cas réel 154)', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['cerfa', 'etage'], 'declaree', '2026-08-28');
    expect(await ancreEst12hParis(id, '2026-08-28'), 'partiel_le ancré à 12:00 Europe/Paris de la date déclarée').toBe(true);

    const butoir = await butoirPartielActif(id, 1, 4);
    expect(butoir).toBeInstanceOf(Date);
    // 28/08 + 1 mois (28/09) + 4 jours = 02/10. AVANT LE CORRECTIF : ancre = clic du test → butoir dérive (≈05/10 dans le cas 154).
    expect(jourParis(butoir!), 'butoir = 28/08 + 1 mois + 4 jours').toBe('2026-10-02');
  });

  it('cas de bord fin de mois : déclaration au 31/01 → clamp 28/02 (2026 non bissextile) + 4 j = 04/03/2026', async () => {
    const id = await creerDemande();
    await marquerDossierPartiel(id, ['masse'], 'declaree', '2026-01-31');
    expect(await ancreEst12hParis(id, '2026-01-31'), 'ancre 31/01 12:00 Paris (CET/hiver)').toBe(true);

    const butoir = await butoirPartielActif(id, 1, 4);
    expect(jourParis(butoir!), '31/01 + 1 mois → clamp 28/02 + 4 j = 04/03 (le clamp fin-de-mois de dateButoirPartiel est verrouillé)').toBe('2026-03-04');
  });

  it('sans ancre (chemin envoi outil / autres appelants) → partiel_le = now(), comportement historique INCHANGÉ', async () => {
    const id = await creerDemande();
    const avant = new Date();
    await marquerDossierPartiel(id, ['cerfa'], 'outil'); // 4e arg absent → COALESCE retombe sur now()
    const apres = new Date();
    const { rows } = await query<{ t: Date }>(`SELECT partiel_le AS t FROM demande WHERE id = $1`, [id]);
    const t = new Date(rows[0].t).getTime();
    expect(t).toBeGreaterThanOrEqual(avant.getTime() - 1000); // marge d'horloge, l'ancre est bien « maintenant » et non une date civile
    expect(t).toBeLessThanOrEqual(apres.getTime() + 1000);
  });
});

/**
 * 🔴 LEVÉE AUTO — CORRECTIF DU BIGINT (classe FIX-2b, 4e occurrence). `evaluerLeveeAutoPartiel` lisait `demande_id` (bigint) SANS
 * `::int` → le driver pg le rendait en CHAÎNE → `estDemandeSuspendue('1794')` interrogeait un Set<number> → miss silencieux → la
 * fonction concluait « pas suspendue » et SORTAIT avant toute levée : la sortie automatique n'a JAMAIS fonctionné, le permis restait
 * coincé en « En cours ». Ce test — le test d'intégration ABSENT qui a laissé passer le défaut — le prouve sur vraie base : un dossier
 * en partiel actif qui redevient COMPLET → `partiel_leve_le` renseigné → le permis quitte « En cours ». Sans le `::int`, il ROUGIT.
 */
async function creerDossierComplet(): Promise<number> {
  const suffixe = String(900001 + dossierIds.length);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TESTDOSS${suffixe}`]);
  const id = rows[0].id;
  dossierIds.push(id);
  // classements couvrant les 4 familles → quelles que soient les familles ATTENDUES (config), toutes sont présentes → resumeCompletude = 'complet'.
  const classements = ['masse', 'coupe', 'etage', 'cerfa'].map((f) => ({ nomFichier: `${f}.pdf`, famille: f, parContenu: f, parNom: null, desaccord: false }));
  await query(`INSERT INTO permis_completude (dossier_id, classements, nb_pieces) VALUES ($1, $2::jsonb, 0)`, [id, JSON.stringify(classements)]);
  return id;
}

describe('LEVÉE AUTO — evaluerLeveeAutoPartiel lève le marqueur quand le dossier redevient complet (bigint::int, classe FIX-2b)', () => {
  it('dossier complet → partiel_leve_le renseigné, marqueur inactif → le permis quitte « En cours »', async () => {
    const demandeId = await creerDemande('envoyee');
    const dossierId = await creerDossierComplet();
    await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif, satisfait_le) VALUES ($1, $2, true, now())`, [demandeId, dossierId]);
    await marquerDossierPartiel(demandeId, ['cerfa', 'etage'], 'declaree', '2026-08-28');
    expect(await lireEtatPartiel(demandeId), 'marqueur ACTIF avant la levée auto').not.toBeNull();

    await evaluerLeveeAutoPartiel(dossierId); // chemin de SORTIE (appelé en prod par enregistrerCompletude au recalcul de complétude)

    // Preuve directe en base : partiel_leve_le est renseigné (le marqueur EST levé), avec l'auteur automatique.
    const { rows } = await query<{ leve_le: Date | null; par: string | null }>(
      `SELECT partiel_leve_le AS leve_le, partiel_leve_par AS par FROM demande WHERE id = $1`, [demandeId]);
    expect(rows[0].leve_le, 'partiel_leve_le renseigné = marqueur levé automatiquement').not.toBeNull();
    expect(rows[0].par, 'auteur de la levée automatique').toBe('auto:complet');
    // Corollaire d'affichage : plus de marqueur actif → le permis repart vers « Analyse et projection ».
    expect(await lireEtatPartiel(demandeId), 'plus de marqueur actif').toBeNull();
  });
});

/**
 * 🔴 LOT-8 (C) — GRADE de la cascade PARTIELLE (« 1re relance », « 2e relance »…). `nbReclamationsComplement` = 1 (la réclamation qui a
 * POSÉ le marqueur) + les relances partielles DÉJÀ envoyées (demande_journal, motif « relance partielle envoyée » — JAMAIS
 * demande_acheminement, qui porte les relances ORDINAIRES). Vraie base : seed + assert via chargerDemandesSuivi.
 */
describe('LOT-8 C — nbReclamationsComplement (grade, source journal + marqueur)', () => {
  it('suspendue sans relance partielle → 1 (réclamation d’origine)', async () => {
    const id = await creerDemande('envoyee');
    await marquerDossierPartiel(id, ['cerfa'], 'declaree');
    const rich = (await chargerDemandesSuivi()).demandes.find((d) => d.demandeId === id);
    expect(rich?.nbReclamationsComplement).toBe(1);
  });
  it('+1 relance partielle au journal → 2', async () => {
    const id = await creerDemande('envoyee');
    await marquerDossierPartiel(id, ['cerfa'], 'declaree');
    await query(`INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, 'relance partielle envoyée #1 à mairie', 'itest')`, [id]);
    const rich = (await chargerDemandesSuivi()).demandes.find((d) => d.demandeId === id);
    expect(rich?.nbReclamationsComplement).toBe(2);
  });
  it('NON suspendue → 0 (aucun grade)', async () => {
    const id = await creerDemande('envoyee');
    const rich = (await chargerDemandesSuivi()).demandes.find((d) => d.demandeId === id);
    expect(rich?.nbReclamationsComplement).toBe(0);
  });
});
