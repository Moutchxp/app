/**
 * CLI `gestion:annuaire:epreuve` — MODULE « GESTION », LOT ANNUAIRE-1 : L'ÉPREUVE SUR CLUSTER JETABLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'AUCUN TEST UNITAIRE NE PEUT PROUVER. `npm test` éprouve des fonctions pures sur des jeux fictifs : c'est
 * nécessaire, et ce n'est pas suffisant. Ce que PostgreSQL fait vraiment — une contrainte qui refuse, un
 * `ON CONFLICT` qui met à jour au lieu de doubler, un trigger append-only qui tient — ne se mesure que sur une VRAIE
 * base. Cette commande la fabrique, l'éprouve, et n'a aucun autre usage.
 *
 * 🔴 ELLE REFUSE DE S'EXÉCUTER AILLEURS QUE SUR `gestion_jetable`. Elle EFFACE le contenu de l'annuaire entre deux
 * épreuves : lancée par mégarde sur la base de travail, elle détruirait l'annuaire réel. Le garde est la PREMIÈRE
 * chose qu'elle fait, avant toute lecture, et il ne se contourne par aucune option.
 *
 * COMMENT LA LANCER :
 *   psql -d postgres -c 'CREATE DATABASE gestion_jetable'
 *   psql -d gestion_jetable -f <le socle gestion_journal de la migration 228>
 *   psql -d gestion_jetable -v ON_ERROR_STOP=1 -f db/migrations/253_gestion_annuaire.sql
 *   DATABASE_URL=postgresql://localhost:5432/gestion_jetable \
 *     npm run gestion:annuaire:epreuve -- --dossier=/Users/macbookprom4arnaud/Downloads
 *
 * 🔒 ELLE N'IMPRIME AUCUNE DONNÉE PERSONNELLE. Les fichiers importés contiennent les coordonnées de 800 personnes ;
 * la sortie ne porte que des COMPTES et des verdicts. Aucun nom, aucun numéro, aucune adresse.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { construirePlan, type PlanImport } from '../lib/gestion/annuaireImport';
import { appliquerPlan } from '../lib/gestion/annuaireRepo';
import { analyserTerme } from '../lib/gestion/annuaireRecherche';
import { rechercher, ficheLot, ficheProprietaire, ficheLocataire } from '../lib/gestion/annuaireRepo';
import { dossierParDefaut, lireOptions, lireSources } from './importer-annuaire';

/** Le SEUL nom de base sur lequel cette commande accepte de travailler. */
export const BASE_JETABLE = 'gestion_jetable';

let echecs = 0;
function verifier(quoi: string, condition: boolean, detail = ''): void {
  if (condition) { console.log(`  ✅ ${quoi}${detail === '' ? '' : ` — ${detail}`}`); return; }
  echecs += 1;
  console.log(`  ❌ ${quoi}${detail === '' ? '' : ` — ${detail}`}`);
}

async function compte(table: string, ou = 'true'): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table} WHERE ${ou}`);
  return Number(rows[0].n);
}

async function principal(): Promise<void> {
  const { rows } = await query<{ base: string }>('SELECT current_database() AS base');
  const base = rows[0].base;
  if (base !== BASE_JETABLE) {
    console.error(`\n❌ REFUS : cette épreuve EFFACE l'annuaire. Base visée « ${base} », attendue « ${BASE_JETABLE} ».`);
    console.error(`   Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}\n`);
    process.exitCode = 1;
    return;
  }

  const o = lireOptions(process.argv.slice(2), dossierParDefaut());
  console.log(`\n╔══ ÉPREUVE DE L'ANNUAIRE sur « ${base} » — dossier ${o.dossier}\n`);

  // Table rase : l'épreuve doit partir d'un état connu, sinon ses comptes ne veulent rien dire.
  await query(`TRUNCATE gestion_annuaire_contact, gestion_annuaire_occupation, gestion_annuaire_locataire,
                        gestion_annuaire_lot, gestion_annuaire_proprietaire RESTART IDENTITY CASCADE`);

  const sources = lireSources(o.dossier);
  const plan = construirePlan(sources);

  // ── ① LA SIMULATION N'ÉCRIT RIEN ────────────────────────────────────────────────────────────────────────────────
  console.log('① la simulation calcule tout et n’écrit rien');
  const simul = await appliquerPlan(plan, { dossier: o.dossier, appliquer: false });
  if (simul.etat !== 'ok') { console.error('   migration 253 absente'); process.exitCode = 1; return; }
  verifier('elle annonce les créations', simul.comptes.proprietairesCrees === plan.proprietaires.length,
    `${simul.comptes.proprietairesCrees} propriétaires`);
  verifier('elle compte les contacts d’un premier import',
    simul.comptes.contactsCrees > 0, `${simul.comptes.contactsCrees} contacts`);
  verifier('la base est restée VIDE', await compte('gestion_annuaire_proprietaire') === 0);
  verifier('la passe de simulation n’a laissé aucune trace',
    await compte('gestion_annuaire_import') === 0);

  // ── ② LE PREMIER IMPORT RÉEL ────────────────────────────────────────────────────────────────────────────────────
  console.log('\n② le premier import écrit ce que la simulation annonçait');
  const un = await appliquerPlan(plan, { dossier: o.dossier, appliquer: true });
  if (un.etat !== 'ok') { console.error('   échec'); process.exitCode = 1; return; }
  verifier('propriétaires', await compte('gestion_annuaire_proprietaire') === plan.proprietaires.length,
    `${plan.proprietaires.length}`);
  verifier('lots', await compte('gestion_annuaire_lot') === plan.lots.length, `${plan.lots.length}`);
  verifier('locataires (personnes)', await compte('gestion_annuaire_locataire') === plan.locataires.length,
    `${plan.locataires.length}`);
  verifier('baux', await compte('gestion_annuaire_occupation') === plan.occupations.length,
    `${plan.occupations.length}`);
  verifier('les comptes annoncés à blanc sont ceux qui ont été écrits',
    un.comptes.proprietairesCrees === simul.comptes.proprietairesCrees
    && un.comptes.lotsCrees === simul.comptes.lotsCrees
    && un.comptes.contactsCrees === simul.comptes.contactsCrees);
  verifier('la passe est journalisée et close',
    await compte('gestion_annuaire_import', "mode = 'applique' AND termine_le IS NOT NULL") === 1);
  verifier('le journal du module porte la ligne d’import',
    await compte('gestion_journal', "entite = 'annuaire'") === 1);
  const horsGestion = await compte('gestion_annuaire_occupation', 'lot_id IS NULL');
  verifier('les baux visant un lot hors gestion sont GARDÉS', horsGestion === plan.occupationsHorsGestion,
    `${horsGestion} bail/baux « lot hors gestion »`);

  // ── ③ L'IDEMPOTENCE ────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n③ le ré-import ne double rien, et le dit');
  const deux = await appliquerPlan(plan, { dossier: o.dossier, appliquer: true });
  if (deux.etat !== 'ok') { console.error('   échec'); process.exitCode = 1; return; }
  verifier('aucune création au second passage',
    deux.comptes.proprietairesCrees === 0 && deux.comptes.lotsCrees === 0
    && deux.comptes.locatairesCrees === 0 && deux.comptes.occupationsCreees === 0);
  verifier('tout est annoncé « inchangé »',
    deux.comptes.proprietairesInchanges === plan.proprietaires.length
    && deux.comptes.lotsInchanges === plan.lots.length
    && deux.comptes.occupationsInchangees === plan.occupations.length);
  verifier('aucun contact en double', deux.comptes.contactsCrees === 0 && deux.comptes.contactsRetires === 0);
  verifier('le nombre de lignes n’a pas bougé',
    await compte('gestion_annuaire_lot') === plan.lots.length
    && await compte('gestion_annuaire_proprietaire') === plan.proprietaires.length);

  // ── ④ UN DISPARU N'EST PAS EFFACÉ ──────────────────────────────────────────────────────────────────────────────
  console.log('\n④ ce qui disparaît d’un export est MARQUÉ, jamais effacé');
  const ampute: PlanImport = {
    ...plan,
    lots: plan.lots.slice(1),
    proprietaires: plan.proprietaires.slice(1),
  };
  const trois = await appliquerPlan(ampute, { dossier: o.dossier, appliquer: true });
  if (trois.etat !== 'ok') { console.error('   échec'); process.exitCode = 1; return; }
  verifier('les lignes sont toujours là',
    await compte('gestion_annuaire_lot') === plan.lots.length
    && await compte('gestion_annuaire_proprietaire') === plan.proprietaires.length);
  verifier('elles portent la mention « absent du dernier export »',
    await compte('gestion_annuaire_lot', 'absent_le IS NOT NULL') === 1
    && await compte('gestion_annuaire_proprietaire', 'absent_le IS NOT NULL') === 1,
    `${trois.comptes.disparus} disparu(s) annoncé(s)`);
  const { rows: dates } = await query<{ le: string }>(
    'SELECT absent_le::text AS le FROM gestion_annuaire_lot WHERE absent_le IS NOT NULL');
  const premiereDate = dates[0]?.le;
  const quatre = await appliquerPlan(ampute, { dossier: o.dossier, appliquer: true });
  const { rows: dates2 } = await query<{ le: string }>(
    'SELECT absent_le::text AS le FROM gestion_annuaire_lot WHERE absent_le IS NOT NULL');
  verifier('un second export sans lui ne REPOUSSE pas la date (on garde le « depuis quand »)',
    dates2[0]?.le === premiereDate);
  verifier('il n’est plus compté comme disparu une seconde fois',
    quatre.etat === 'ok' && quatre.comptes.disparus === 0);

  // ── ⑤ LE RETOUR LÈVE LA MENTION ────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑤ un export qui le ramène lève la mention');
  const cinq = await appliquerPlan(plan, { dossier: o.dossier, appliquer: true });
  verifier('plus aucune ligne marquée « absente »',
    await compte('gestion_annuaire_lot', 'absent_le IS NOT NULL') === 0
    && await compte('gestion_annuaire_proprietaire', 'absent_le IS NOT NULL') === 0);
  verifier('le retour est compté', cinq.etat === 'ok' && cinq.comptes.revenus >= 2,
    cinq.etat === 'ok' ? `${cinq.comptes.revenus} revenu(s)` : '');

  // ── ⑥ LES HOMONYMES SONT SIGNALÉS, JAMAIS FUSIONNÉS ────────────────────────────────────────────────────────────
  console.log('\n⑥ les homonymes sont signalés, jamais fusionnés');
  verifier('l’export réel en contient, et ils sont rapportés', plan.homonymes.length > 0,
    `${plan.homonymes.length} homonyme(s)`);
  for (const h of plan.homonymes) {
    const n = await compte('gestion_annuaire_proprietaire',
      `wippimmo_id = ANY(ARRAY[${h.wippimmoIds.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')}])`);
    verifier('chaque porteur du nom garde SA fiche', n === h.wippimmoIds.length, `${n} fiches distinctes`);
  }
  const { rows: contactsMelanges } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM (
       SELECT sujet_id, count(DISTINCT valeur) FROM gestion_annuaire_contact
        WHERE sujet = 'proprietaire' GROUP BY sujet_id HAVING count(DISTINCT valeur) > 12) x`);
  verifier('aucune fiche n’a hérité des contacts d’une autre', Number(contactsMelanges[0].n) === 0);

  // ── ⑦ LA RECHERCHE ─────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑦ la recherche trouve, quelle que soit l’écriture');
  const { rows: ech } = await query<{ tel: string; mail: string; adresse: string; lot: string; commune: string }>(
    `SELECT (SELECT valeur FROM gestion_annuaire_contact WHERE sorte = 'telephone' ORDER BY id LIMIT 1) AS tel,
            (SELECT valeur FROM gestion_annuaire_contact WHERE sorte = 'email' ORDER BY id LIMIT 1) AS mail,
            (SELECT adresse FROM gestion_annuaire_lot WHERE adresse IS NOT NULL ORDER BY id LIMIT 1) AS adresse,
            (SELECT wippimmo_id FROM gestion_annuaire_lot ORDER BY id LIMIT 1) AS lot,
            (SELECT commune FROM gestion_annuaire_lot WHERE commune IS NOT NULL ORDER BY id LIMIT 1) AS commune`);
  const e = ech[0];
  const national = `0${e.tel.slice(3)}`;                      // +33612345678 → 0612345678
  const espace = national.replace(/(\d{2})(?=\d)/g, '$1 ');   // → 06 12 34 56 78
  const points = national.replace(/(\d{2})(?=\d)/g, '$1.');   // → 06.12.34.56.78
  const fin = national.slice(-6);                             // les six derniers chiffres

  for (const [quoi, terme] of [
    ['le numéro en E.164', e.tel], ['le même en national', national],
    ['le même avec des espaces', espace], ['le même avec des points', points],
    ['sa seule FIN', fin],
  ] as const) {
    const r = await rechercher(analyserTerme(terme));
    verifier(`par téléphone — ${quoi}`, r.etat === 'ok' && r.data.length > 0);
  }
  const parMail = await rechercher(analyserTerme(e.mail.toUpperCase()));
  verifier('par e-mail, même tapé en MAJUSCULES', parMail.etat === 'ok' && parMail.data.length > 0);

  const sansAccent = e.adresse.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const parAdresse = await rechercher(analyserTerme(sansAccent));
  verifier('par adresse, sans accent et en majuscules', parAdresse.etat === 'ok' && parAdresse.data.length > 0);
  const parCommune = await rechercher(analyserTerme(e.commune));
  verifier('par commune', parCommune.etat === 'ok' && parCommune.data.length > 0);
  const parLot = await rechercher(analyserTerme(e.lot));
  verifier('par numéro de lot', parLot.etat === 'ok' && parLot.data.some((x) => x.lotNumero === e.lot));

  // ── ⑧ LES TROIS FICHES ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n⑧ les trois fiches se tiennent');
  const { rows: ids } = await query<{ lot: string; prop: string; loc: string }>(
    `SELECT (SELECT id::text FROM gestion_annuaire_lot WHERE proprietaire_id IS NOT NULL ORDER BY id LIMIT 1) AS lot,
            (SELECT id::text FROM gestion_annuaire_proprietaire ORDER BY id LIMIT 1) AS prop,
            (SELECT locataire_id::text FROM gestion_annuaire_occupation WHERE sortie IS NULL ORDER BY id LIMIT 1) AS loc`);
  const fl = await ficheLot(Number(ids[0].lot));
  verifier('la fiche LOT porte son propriétaire', fl.etat === 'ok' && fl.data.proprietaireId !== null);
  const fp = await ficheProprietaire(Number(ids[0].prop));
  verifier('la fiche PROPRIÉTAIRE liste ses lots et ses contacts',
    fp.etat === 'ok' && fp.data.contacts.length > 0);
  verifier('sa date de début de relation est DÉRIVÉE de ses lots',
    fp.etat === 'ok' && (fp.data.lots.length === 0
      ? fp.data.relationDepuis === null
      : fp.data.relationDepuis !== null && fp.data.lots.every(
        (l) => l.debut === null || l.debut >= (fp.data.relationDepuis ?? ''))));
  const fc = await ficheLocataire(Number(ids[0].loc));
  verifier('la fiche LOCATAIRE porte au moins un bail',
    fc.etat === 'ok' && fc.data.occupations.length > 0);
  verifier('un bail en cours est marqué en cours',
    fc.etat === 'ok' && fc.data.occupations.some((x) => x.encours));

  // ── ⑨ LE JOURNAL D'IMPORT EST APPEND-ONLY, GARANTI EN BASE ─────────────────────────────────────────────────────
  console.log('\n⑨ le journal d’import est append-only, garanti par la base');
  let refuse = false;
  try {
    await query(`UPDATE gestion_annuaire_import SET resultat = 'echec' WHERE termine_le IS NOT NULL`);
  } catch { refuse = true; }
  verifier('PostgreSQL refuse de réécrire une passe close', refuse);
  let refuseSuppression = false;
  try {
    await query('DELETE FROM gestion_annuaire_import');
  } catch { refuseSuppression = true; }
  verifier('PostgreSQL refuse d’effacer une passe', refuseSuppression);

  console.log(`\n╚══ ${echecs === 0 ? 'TOUT EST VERT' : `${echecs} ÉCHEC(S)`}\n`);
  if (echecs > 0) process.exitCode = 1;
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
