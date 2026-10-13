/**
 * CLI — LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET : L'ÉPREUVE SUR UNE BASE DE TEST.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PEUT PROUVER : ce que la base fait VRAIMENT — le suivi de fond posé par l'automate dans
 * la même transaction que le lien, l'héritage des mails suivants, un mail SORTI DU SUIVI qui ne revient jamais, un lien
 * retiré par le moteur qui ne bloque plus, un lien retiré par une décision qui bloque toujours, et la décision C (un
 * mail arrivé AVANT la mise en service garde le moteur d'avant).
 *
 * 🔴 ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR UNE BASE `svav_test_…` : elle écrit des clients, des mails et des
 * rattachements inventés. C'est la PREMIÈRE chose qu'elle vérifie. 🔒 Aucun service extérieur, aucun mail envoyé.
 *
 * FABRIQUER LA BASE ET LANCER L'ÉPREUVE (le schéma seul de la base de travail, AUCUNE donnée) :
 *   psql -d postgres -c 'DROP DATABASE IF EXISTS svav_test_rattachement'
 *   psql -d postgres -c 'CREATE DATABASE svav_test_rattachement'
 *   pg_dump --schema-only --no-owner --no-privileges sansvisavis | psql -q -d svav_test_rattachement
 *   psql -v ON_ERROR_STOP=1 -d svav_test_rattachement -f db/migrations/345_gestion_rattachement_reglage.sql
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_rattachement npx tsx app/scripts/rattachement-auto-epreuve.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { oublierSchema } from '../lib/gestion/schema';
import { chargerAnnuaireAdresses, releverPaquet, COMPTES_RELEVE_VIDE } from '../lib/gestion/adressesRepo';
import { chargerLibelles, examinerFilsPrecis, COMPTES_VIDES } from '../lib/gestion/rattachementRepo';
import { sortirDuSuivi } from '../lib/gestion/sortieSuiviRepo';
import { heriterLesNouveauxMails } from '../lib/gestion/periodeRepo';
import { AUTEUR_SUIVI_AUTOMATIQUE } from '../lib/gestion/reglesRattachement';
import { poserCarteAlaMain, poserCategorieAlaMain } from '../lib/gestion/partieCategorieRepo';

let echecs = 0;
function verifier(quoi: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✅' : '❌'} ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) echecs += 1;
}

const un = async <T>(sql: string, p: unknown[] = []): Promise<T> => (await query(sql, p)).rows[0] as T;

async function principal(): Promise<void> {
  const { base } = await un<{ base: string }>('SELECT current_database() AS base');
  if (!base.startsWith('svav_test')) {
    console.error(`\n❌ REFUS : cette épreuve écrit des données inventées. Base visée « ${base} », attendue « svav_test_… ».\n`);
    process.exitCode = 1;
    return;
  }
  oublierSchema();
  const { mise } = await un<{ mise: string }>(
    `SELECT to_char(mise_en_service AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS mise FROM gestion_rattachement_reglage WHERE id = 1`);
  console.log(`\n╔══ ÉPREUVE DES RÈGLES DE RATTACHEMENT AUTOMATIQUE sur « ${base} » — mise en service ${mise}\n`);
  const apres = (minutes: number) => new Date(Date.parse(mise) + minutes * 60_000).toISOString();
  const avant = (jours: number) => new Date(Date.parse(mise) - jours * 86_400_000).toISOString();
  const jourMoinsMois = (mois: number) => { const d = new Date(mise); d.setUTCMonth(d.getUTCMonth() - mois); return d.toISOString().slice(0, 10); };

  // ── L'ANNUAIRE INVENTÉ ─────────────────────────────────────────────────────────────────────────────────────────
  await query(`INSERT INTO gestion_config (id, adresse_gestion) VALUES (1, 'gestion@criterimmo.fr') ON CONFLICT (id) DO NOTHING`).catch(() => {});
  const { id: humain } = await un<{ id: string }>(
    `INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, prenom, nom)
     VALUES ('epreuve@sansvisavis.com', 'x', 'administrateur', 'Épreuve', 'TEST') RETURNING id::text`);
  const auteur = { id: Number(humain), libelle: 'epreuve@sansvisavis.com' };
  const proprio = async (cle: string, nom: string, email: string | null) => {
    const { id } = await un<{ id: string }>(
      `INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ($1, $2, $2, lower($2)) RETURNING id::text`, [cle, nom]);
    if (email !== null) await query(`INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute) VALUES ('proprietaire', $1, 'email', $2, $2)`, [id, email]);
    return id;
  };
  const lot = async (cle: string, adresse: string, pid: string) => (await un<{ id: string }>(
    `INSERT INTO gestion_annuaire_lot (wippimmo_id, adresse, commune, proprietaire_id, proprietaire_texte) VALUES ($1, $2, 'VILLE-TEST', $3, 'x') RETURNING id::text`,
    [cle, adresse, pid])).id;
  const locataire = async (cle: string, nom: string, email: string, lotId: string, lotCle: string, entree: string, sortie: string | null) => {
    const { id } = await un<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire (wippimmo_id, cle_personne, nom, nom_normalise) VALUES ($1, $1, $2, lower($2)) RETURNING id::text`, [cle, nom]);
    await query(`INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute) VALUES ('locataire', $1, 'email', $2, $2)`, [id, email]);
    await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`occ-${cle}`, id, lotId, lotCle, entree, sortie]);
  };
  const P1 = await proprio('P1', 'UNBIEN Paul', 'unbien@epreuve.test');
  const P2 = await proprio('P2', 'MULTI Anne', 'multi@epreuve.test');
  const P3 = await proprio('P3', 'TROIS Léa', null);
  const P4 = await proprio('P4', 'CARTE Max', 'carte@epreuve.test');
  const P5 = await proprio('P5', 'DOUBLE Eve', 'double@epreuve.test');
  const P6 = await proprio('P6', 'SIX Noé', null);
  const P7 = await proprio('P7', 'TIERS Sam', 'tiers@epreuve.test');
  const L101 = await lot('101', '67 rue de Normandie', P1);
  const L201 = await lot('201', '1 avenue Foch', P2); await lot('202', '2 avenue Foch', P2); await lot('203', '3 avenue Foch', P2);
  const L301 = await lot('301', '9 rue Danton', P3); const L302 = await lot('302', '11 rue Danton', P3);
  await lot('401', '4 rue Carnot', P4); await lot('501', '5 rue Hoche', P5);
  const L601 = await lot('601', '6 rue Kléber', P6); const L602 = await lot('602', '8 rue Kléber', P6);
  await lot('701', '7 rue Monge', P7);
  void L101;
  await locataire('T1', 'KASSAR Marnie', 'loc@epreuve.test', L301, '301', '2024-01-01', null);
  await locataire('T2', 'DEUX Bob', 'loc2@epreuve.test', L201, '201', '2024-01-01', null);
  await locataire('T3', 'DOUBLE Eve', 'double@epreuve.test', L302, '302', '2024-01-01', null);
  await locataire('T4', 'ANCIEN Quatorze', 'ancien14@epreuve.test', L601, '601', '2020-01-01', jourMoinsMois(14));
  await locataire('T5', 'ANCIEN Seize', 'ancien16@epreuve.test', L602, '602', '2020-01-01', jourMoinsMois(16));
  /* Par les portes de l'écran (le dépôt des rangements), jamais par une écriture directe dans leurs tables. */
  const carte = await poserCarteAlaMain({ lotCle: '401', cote: 'proprietaire', adresse: 'carte@epreuve.test', auteur });
  const rang = await poserCategorieAlaMain({ adresse: 'tiers@epreuve.test', lotCle: null, categorie: 'independant', auteur });
  if (!carte.ok || !rang.ok) throw new Error(`préparation refusée : ${JSON.stringify(carte)} ${JSON.stringify(rang)}`);

  // ── LES MAILS INVENTÉS ─────────────────────────────────────────────────────────────────────────────────────────
  let n = 0;
  const fil = async () => Number((await un<{ id: string }>(`INSERT INTO gestion_fil (cle) VALUES ($1) RETURNING id::text`, [`fil-epreuve-${++n}`])).id);
  const mail = async (filId: number, de: string, recuLe: string, objet = 'Question', cc: string[] = []) => Number((await un<{ id: string }>(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet, dest_a, dest_cc)
     VALUES ($1, $2, 'recu', $3, $4, $5, '[{"nom": null, "adresse": "gestion@criterimmo.fr"}]'::jsonb, $6::jsonb) RETURNING id::text`,
    [filId, `<m${++n}@epreuve.test>`, de, recuLe, objet, JSON.stringify(cc.map((a) => ({ nom: null, adresse: a })))])).id);

  const F = {
    r1: await fil(), r1copie: await fil(), r2: await fil(), r2carte: await fil(), r3: await fil(), r4: await fil(),
    a: await fil(), b14: await fil(), b16: await fil(), syndic: await fil(), tiers: await fil(), interne: await fil(),
    sorti: await fil(), retireMoteur: await fil(), retireLot: await fil(), avantR1copie: await fil(), avantR2carte: await fil(),
    objetAdresse: await fil(), objetNom: await fil(), objetAmbigu: await fil(),
  };
  const M = {
    r1: await mail(F.r1, 'loc@epreuve.test', apres(5)),
    r1copie: await mail(F.r1copie, 'loc2@epreuve.test', apres(6), 'Charges', ['multi@epreuve.test']),
    r2: await mail(F.r2, 'unbien@epreuve.test', apres(7)),
    r2carte: await mail(F.r2carte, 'carte@epreuve.test', apres(8)),
    r3: await mail(F.r3, 'multi@epreuve.test', apres(9)),
    r4a: await mail(F.r4, 'loc@epreuve.test', apres(10)),
    r4b: await mail(F.r4, 'inconnu@ailleurs.test', apres(11), 'Re: Question'),
    r4c: await mail(F.r4, 'unbien@epreuve.test', apres(12), 'Re: Question'),
    a: await mail(F.a, 'double@epreuve.test', apres(13)),
    b14: await mail(F.b14, 'ancien14@epreuve.test', apres(14)),
    b16: await mail(F.b16, 'ancien16@epreuve.test', apres(15)),
    syndic: await mail(F.syndic, 'syndic@cabinet.test', apres(16)),
    tiers: await mail(F.tiers, 'tiers@epreuve.test', apres(17)),
    interne: await mail(F.interne, 'loc@epreuve.test', apres(18)),
    sorti: await mail(F.sorti, 'loc@epreuve.test', apres(19)),
    retireMoteur: await mail(F.retireMoteur, 'unbien@epreuve.test', apres(20)),
    retireLot: await mail(F.retireLot, 'unbien@epreuve.test', apres(21)),
    avantR1copie: await mail(F.avantR1copie, 'loc2@epreuve.test', avant(2), 'Charges', ['multi@epreuve.test']),
    avantR2carte: await mail(F.avantR2carte, 'carte@epreuve.test', avant(2)),
    objetAdresse: await mail(F.objetAdresse, 'multi@epreuve.test', apres(22), 'Fuite d’eau au 67 R. de Normandie'),
    objetNom: await mail(F.objetNom, 'inconnu@ailleurs.test', apres(23), 'Départ locataire - Mme KASSAR Marnie'),
    objetAmbigu: await mail(F.objetAmbigu, 'inconnu@ailleurs.test', apres(24), 'Rue de Normandie : travaux de Martin'),
  };
  await query(`INSERT INTO gestion_fil_interne (fil_id, pose_par_libelle) VALUES ($1, 'epreuve')`, [F.interne]);
  /* Deux liens RETIRÉS posés d'avance : l'un par le moteur lui-même (ne doit plus bloquer), l'autre par un lot (bloque). */
  const retire = (msg: number, par: string, motif: string) => query(
    `INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, regle, statut, statut_le, statut_par_libelle, statut_motif, cree_par_libelle)
     VALUES ($1, 'lot', '101', 'automatique', 'a', 'retire', now(), $2, $3, 'moteur de rattachement')`, [msg, par, motif]);
  await retire(M.retireMoteur, 'moteur de rattachement', 'le moteur ne propose plus cette cible');
  await retire(M.retireLot, 'lot DOCUMENTS-HORS-BIENS', 'décision d’un lot');

  // ── LA VRAIE CHAÎNE : reconnaissance des adresses, puis moteur sur les conversations ─────────────────────────────
  const annuaire = await chargerAnnuaireAdresses();
  let depuis: number | null = 0;
  while (depuis !== null) depuis = await releverPaquet(depuis, 500, annuaire, { ...COMPTES_RELEVE_VIDE });
  const libelles = await chargerLibelles();
  const tous = Object.values(F);
  await examinerFilsPrecis(tous, libelles, { ...COMPTES_VIDES }, true);

  const liens = async (msg: number) => (await query<{ cle: string; statut: string; regle: string | null; motif: string | null }>(
    `SELECT cible_cle AS cle, statut, regle, motif FROM gestion_rattachement WHERE message_id = $1 AND cible_sorte = 'lot' ORDER BY id`, [msg])).rows;
  const confirmes = async (msg: number) => (await liens(msg)).filter((l) => l.statut === 'confirme').map((l) => l.cle).sort();
  const proposes = async (msg: number) => (await liens(msg)).filter((l) => l.statut === 'propose').map((l) => l.cle).sort();
  const suivis = async (filId: number) => (await query<{ par: string; biens: string[] | null; depuis: string }>(
    `SELECT p.cree_par_libelle AS par, p.depuis_message_id::text AS depuis,
            (SELECT array_agg(b.cible_cle ORDER BY b.cible_cle) FROM gestion_fil_periode_bien b WHERE b.periode_id = p.id) AS biens
       FROM gestion_fil_periode p WHERE p.fil_id = $1 AND p.remplacee_le IS NULL`, [filId])).rows;
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  console.log('R1 — locataire actuel');
  verifier('rattaché automatiquement à son bien', eq(await confirmes(M.r1), ['301']), JSON.stringify(await liens(M.r1)));
  verifier('R1 avec le propriétaire à plusieurs biens en copie : l’adresse du locataire tranche, les autres proposés',
    eq(await confirmes(M.r1copie), ['201']) && eq(await proposes(M.r1copie), ['202', '203']), JSON.stringify(await liens(M.r1copie)));
  console.log('R2 — propriétaire d’un seul bien');
  verifier('rattaché automatiquement', eq(await confirmes(M.r2), ['101']));
  verifier('R2 avec carte de contact : la règle propriétaire passe avant la carte', eq(await confirmes(M.r2carte), ['401']), JSON.stringify(await liens(M.r2carte)));
  console.log('R3 — propriétaire de plusieurs biens');
  verifier('« À classer » : tous ses biens proposés, aucun confirmé', eq(await confirmes(M.r3), []) && eq(await proposes(M.r3), ['201', '202', '203']));
  verifier('aucun suivi de fond posé', (await suivis(F.r3)).length === 0);
  console.log('R4 — le suivi de fond posé par l’automate');
  const s4 = await suivis(F.r4);
  verifier('un suivi « Ce mail + futurs échanges » sur le bien, depuis le mail rattaché, signé par l’automate',
    s4.length === 1 && s4[0].par === AUTEUR_SUIVI_AUTOMATIQUE && eq(s4[0].biens, ['301']) && Number(s4[0].depuis) === M.r4a, JSON.stringify(s4));
  verifier('le mail suivant (sans adresse connue) hérite du bien', eq(await confirmes(M.r4b), ['301']), JSON.stringify(await liens(M.r4b)));
  verifier('le mail suivant qui désigne un AUTRE bien : ce bien est PROPOSÉ, le suivi ne bouge pas',
    eq(await proposes(M.r4c), ['101']) && !(await confirmes(M.r4c)).includes('101') && eq(await suivis(F.r4), s4), JSON.stringify(await liens(M.r4c)));
  verifier('un suivi automatique sur chaque rattachement automatique (R1, R2)', (await suivis(F.r1)).length === 1 && (await suivis(F.r2)).length === 1);
  console.log('A — locataire d’un bien et propriétaire d’un autre');
  verifier('aucun rattachement automatique ; les deux biens proposés', eq(await confirmes(M.a), []) && eq(await proposes(M.a), ['302', '501']), JSON.stringify(await liens(M.a)));
  console.log('B — ancien locataire');
  verifier('à 14 mois de la sortie : rattaché automatiquement à son dernier bien', eq(await confirmes(M.b14), ['601']), JSON.stringify(await liens(M.b14)));
  verifier('à 16 mois : seulement proposé, durée dans le motif', eq(await confirmes(M.b16), []) && eq(await proposes(M.b16), ['602'])
    && ((await liens(M.b16))[0]?.motif ?? '').includes('au-delà de 15 mois'), JSON.stringify(await liens(M.b16)));
  console.log('Syndic, tiers indépendant, Interne');
  verifier('syndic : aucun rattachement automatique', eq(await confirmes(M.syndic), []));
  verifier('tiers indépendant : jamais de rattachement automatique (bien proposé)', eq(await confirmes(M.tiers), []) && eq(await proposes(M.tiers), ['701']));
  verifier('Interne : inchangé (aucun bien)', (await liens(M.interne)).length === 0);
  console.log('Liens retirés');
  verifier('un lien retiré PAR LE MOTEUR ne bloque plus R2 (nouveau lien confirmé)', eq(await confirmes(M.retireMoteur), ['101']), JSON.stringify(await liens(M.retireMoteur)));
  verifier('un lien retiré par une DÉCISION (lot) bloque toujours', eq(await confirmes(M.retireLot), []), JSON.stringify(await liens(M.retireLot)));
  console.log('Décision C — un mail arrivé AVANT la mise en service garde le moteur d’avant');
  verifier('R1 copie d’avant : « à trancher », aucun suivi', eq(await confirmes(M.avantR1copie), []) && (await suivis(F.avantR1copie)).length === 0);
  verifier('R2 avec carte d’avant : « à trancher »', eq(await confirmes(M.avantR2carte), []));
  console.log('Lecture de l’objet');
  const oA = (await liens(M.objetAdresse)).find((l) => l.cle === '101');
  verifier('objet avec une adresse : bien proposé, motif « l’objet cite “67 R. de Normandie” », jamais confirmé',
    oA?.statut === 'propose' && oA.regle === 'o' && (oA.motif ?? '').includes('l’objet cite “67 R. de Normandie”'), JSON.stringify(oA));
  const oN = await liens(M.objetNom);
  verifier('objet avec un nom connu : ses biens proposés, motif avec le nom', oN.length > 0 && oN.every((l) => l.statut === 'propose')
    && oN.some((l) => (l.motif ?? '').includes('KASSAR')), JSON.stringify(oN));
  verifier('objet ambigu (voie sans numéro, nom courant) : aucune proposition', (await liens(M.objetAmbigu)).length === 0, JSON.stringify(await liens(M.objetAmbigu)));

  console.log('🔴 Un mail SORTI DU SUIVI n’est JAMAIS rattaché de nouveau');
  verifier('d’abord rattaché automatiquement', eq(await confirmes(M.sorti), ['301']));
  const s = await sortirDuSuivi({ messageId: M.sorti, lotCle: '301', auteur, motif: 'épreuve' });
  verifier('sorti du suivi par un humain', s.ok === true, JSON.stringify(s));
  await examinerFilsPrecis([F.sorti], libelles, { ...COMPTES_VIDES }, true);
  await heriterLesNouveauxMails(F.sorti, { id: null, libelle: 'suivi de la conversation' });
  const apresSortie = await liens(M.sorti);
  verifier('ni le moteur, ni l’héritage du suivi ne le rattachent de nouveau', !apresSortie.some((l) => l.statut === 'confirme') && apresSortie.some((l) => l.statut === 'sorti'),
    JSON.stringify(apresSortie));

  console.log(`\n${echecs === 0 ? '✅ TOUT EST CONFORME' : `❌ ${echecs} ÉCART(S)`}\n`);
  if (echecs > 0) process.exitCode = 1;
}

principal()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => { void closePool(); });
