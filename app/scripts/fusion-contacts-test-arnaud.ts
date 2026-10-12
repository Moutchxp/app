/**
 * ══ 🔴🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — FUSION DE DEUX DOUBLONS, ACCORD D'ARNO (12/10/2026) ══
 *
 * PÉRIMÈTRE VERROUILLÉ : le syndic « TEST ARNAUD », et lui seul ; Augustin JOREL et Mathis BERCIER, et eux seuls.
 * Chacun : une ANCIENNE fiche « Ne travaille plus ici » + une fiche RECRÉÉE ensuite. Tout autre cas : arrêt, rien écrit.
 *
 *   ① SAUVEGARDE : export JSON complet des lignes concernées et de ce qui les référence (coordonnées, rattachements aux
 *      copropriétés, adresses de mails, journal) → app/.captures/partage-et-fusion/sauvegarde-avant-fusion.json ;
 *   ② SIMULATION (par défaut) : ce qui va changer, ligne par ligne, SANS RIEN ÉCRIRE ;
 *   ③ FUSION (`--appliquer`), EN UNE SEULE TRANSACTION :
 *      · l'ANCIENNE fiche est conservée et RÉINTÉGRÉE (retour = date de création de la copie récente), sa période
 *        terminée gardée au journal (`syndic_contact_periode`) ;
 *      · les coordonnées et rattachements de la copie récente y sont REPOINTÉS (sans doublon) ; toute référence à la
 *        copie récente (adresses de mails comprises) pointe désormais l'ancienne fiche ;
 *      · la copie récente n'est PAS supprimée : archivée (`retire_le`) avec « fusionnée dans la fiche #id le JJ/MM/AAAA » ;
 *   ④ VÉRIFICATION : une seule fiche visible par personne, deux périodes, aucune référence orpheline, aucun mail touché.
 *
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/fusion-contacts-test-arnaud.ts [--appliquer]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query, withTransaction } from '../lib/db/client';
import { cleNom } from '../lib/gestion/syndics';
import { ACTION_PERIODE_CONTACT, dateCivile } from '../lib/gestion/reintegrationContact';

const SYNDIC = 'TEST ARNAUD';
const PERSONNES = ['Augustin JOREL', 'Mathis BERCIER'];
const AUTEUR = 'Claude Code — fusion autorisée par Arno (lot PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR)';
const DOSSIER = join(process.cwd(), '.captures', 'partage-et-fusion');
const SAUVEGARDE = join(DOSSIER, 'sauvegarde-avant-fusion.json');
const APPLIQUER = process.argv.includes('--appliquer');

interface Contact {
  id: string; syndic_id: string; titre: string | null; prenom: string | null; nom: string | null; civilite: string | null;
  rang: number; cree_le: string; parti_le: string | null; reintegre_le: string | null; retire_le: string | null;
}

async function compteurs(): Promise<Record<string, number>> {
  const { rows } = await query<{ m: string; r: string; a: string }>(
    `SELECT (SELECT count(*) FROM gestion_message)::text AS m, (SELECT count(*) FROM gestion_rattachement)::text AS r,
            (SELECT count(*) FROM gestion_message_adresse)::text AS a`);
  return { messages: Number(rows[0].m), rattachements: Number(rows[0].r), adressesDeMails: Number(rows[0].a) };
}

async function main(): Promise<void> {
  /* ── Le périmètre : un syndic, deux personnes, deux fiches chacune (une partie, une en poste) ── */
  const { rows: syndics } = await query<{ id: string }>(`SELECT id::text FROM gestion_syndic WHERE nom = $1 AND supprime_le IS NULL`, [SYNDIC]);
  if (syndics.length !== 1) throw new Error(`ARRÊT : ${syndics.length} syndic(s) « ${SYNDIC} » — il en faut exactement un.`);
  const syndicId = Number(syndics[0].id);
  const { rows: tous } = await query<Contact>(
    `SELECT id::text, syndic_id::text, titre, prenom, nom, civilite, rang, cree_le::text, parti_le::text, reintegre_le::text, retire_le::text
       FROM gestion_syndic_contact WHERE syndic_id = $1 AND retire_le IS NULL ORDER BY id`, [syndicId]);
  const paires = PERSONNES.map((p) => {
    const [prenom, nom] = p.split(' ');
    const lignes = tous.filter((c) => cleNom(c.prenom, c.nom) === cleNom(prenom, nom));
    const ancienne = lignes.filter((c) => c.parti_le !== null);
    const recente = lignes.filter((c) => c.parti_le === null);
    if (lignes.length !== 2 || ancienne.length !== 1 || recente.length !== 1) {
      throw new Error(`ARRÊT : ${p} — ${lignes.length} fiche(s) (${ancienne.length} partie(s), ${recente.length} en poste) ; attendu 1 + 1.`);
    }
    if (Date.parse(recente[0].cree_le.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
      < Date.parse((ancienne[0].parti_le as string).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))) {
      throw new Error(`ARRÊT : ${p} — la fiche récente est antérieure au départ de l'ancienne.`);
    }
    return { personne: p, ancienne: ancienne[0], recente: recente[0] };
  });
  const ids = paires.flatMap((x) => [Number(x.ancienne.id), Number(x.recente.id)]);

  /* ── ① SAUVEGARDE ── */
  const [coords, affect, adresses, journal] = await Promise.all([
    query(`SELECT *, cree_le::text AS cree_le_texte, retire_le::text AS retire_le_texte FROM gestion_syndic_coordonnee WHERE contact_id = ANY($1::bigint[]) ORDER BY id`, [ids]),
    query(`SELECT *, affecte_le::text AS affecte_le_texte, retire_le::text AS retire_le_texte FROM gestion_syndic_contact_copropriete WHERE contact_id = ANY($1::bigint[]) ORDER BY id`, [ids]),
    query(`SELECT * FROM gestion_message_adresse WHERE syndic_contact_id = ANY($1::bigint[]) ORDER BY id`, [ids]),
    query(`SELECT * FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = ANY($1::bigint[]) ORDER BY id`, [ids]),
  ]);
  const { rows: contactsComplets } = await query(`SELECT * FROM gestion_syndic_contact WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
  mkdirSync(DOSSIER, { recursive: true });
  writeFileSync(SAUVEGARDE, JSON.stringify({
    lot: 'PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR', faite_le: new Date().toISOString(), syndic: { id: syndicId, nom: SYNDIC },
    paires: paires.map((x) => ({ personne: x.personne, ancienne: Number(x.ancienne.id), recente: Number(x.recente.id) })),
    gestion_syndic_contact: contactsComplets, gestion_syndic_coordonnee: coords.rows,
    gestion_syndic_contact_copropriete: affect.rows, gestion_message_adresse: adresses.rows,
    gestion_journal: journal.rows,
    note_journal: 'Les lignes du journal « annuaire » portant ces numéros concernent d’AUTRES fiches de l’annuaire (import, client) : elles ne référencent pas ces contacts et ne sont pas modifiées.',
    compteurs_avant: await compteurs(),
  }, null, 2));
  console.log(`① Sauvegarde écrite : ${SAUVEGARDE}`);

  /* ── ② SIMULATION ── */
  const aujourdhui = dateCivile(new Date().toISOString());
  const plan: string[] = [];
  for (const x of paires) {
    const a = x.ancienne; const r = x.recente;
    const cr = coords.rows.filter((k) => String((k as { contact_id: unknown }).contact_id) === r.id);
    const ar = affect.rows.filter((k) => String((k as { contact_id: unknown }).contact_id) === r.id);
    const mr = adresses.rows.filter((k) => String((k as { syndic_contact_id: unknown }).syndic_contact_id) === r.id);
    plan.push(`${x.personne} : fiche #${a.id} (partie le ${a.parti_le}) conservée et réintégrée ; copie #${r.id} (créée le ${r.cree_le}) archivée.`,
      `  · #${a.id} : parti_le ${a.parti_le} → NULL ; reintegre_le → ${r.cree_le} ; titre « ${a.titre ?? ''} » → « ${r.titre ?? a.titre ?? ''} » ; civilité ${a.civilite ?? '—'} → ${r.civilite ?? a.civilite ?? '—'}`,
      `  · journal : période terminée (départ ${a.parti_le} → retour ${r.cree_le}) ; fusion #${r.id} → #${a.id}`,
      ...cr.map((k) => { const c = k as { id: unknown; sorte: string; valeur: string; retire_le_texte: string | null };
        return `  · coordonnée #${String(c.id)} (${c.sorte} ${c.valeur}${c.retire_le_texte ? `, retirée le ${c.retire_le_texte}` : ', en cours'}) : contact #${r.id} → #${a.id}`; }),
      ...ar.map((k) => { const c = k as { id: unknown; copropriete_id: unknown; retire_le_texte: string | null };
        return `  · rattachement #${String(c.id)} (copropriété ${String(c.copropriete_id)}${c.retire_le_texte ? `, fermé le ${c.retire_le_texte}` : ', en cours'}) : contact #${r.id} → #${a.id}`; }),
      `  · adresses de mails qui citent #${r.id} : ${mr.length} → #${a.id}`,
      `  · #${r.id} : retire_le → maintenant ; motif « fusionnée dans la fiche #${a.id} le ${aujourdhui} »`);
  }
  console.log('② Simulation — ce qui va changer :');
  for (const l of plan) console.log(l);
  if (!APPLIQUER) { console.log('Rien n’a été écrit (simulation). Relancer avec --appliquer pour fusionner.'); return; }

  /* ── ③ FUSION, EN UNE SEULE TRANSACTION ── */
  const avant = await compteurs();
  await withTransaction(async (q) => {
    for (const x of paires) {
      const a = Number(x.ancienne.id); const r = Number(x.recente.id);
      /* Verrouille et relit : rien n'a bougé depuis la simulation. */
      const { rows: v } = await q<{ id: string; parti: boolean; retire: boolean }>(
        `SELECT id::text, parti_le IS NOT NULL AS parti, retire_le IS NOT NULL AS retire FROM gestion_syndic_contact
          WHERE id = ANY($1::bigint[]) AND syndic_id = $2 FOR UPDATE`, [[a, r], syndicId]);
      const va = v.find((y) => Number(y.id) === a); const vr = v.find((y) => Number(y.id) === r);
      if (!va?.parti || va.retire || vr === undefined || vr.parti || vr.retire) throw new Error(`ARRÊT : ${x.personne} a changé depuis la simulation.`);
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
         SELECT 'annuaire', $1, '${ACTION_PERIODE_CONTACT}', c.parti_le::text, $2, $3, $4 FROM gestion_syndic_contact c WHERE c.id = $1`,
        [a, x.recente.cree_le, `période en poste terminée au départ ; retour = création de la copie #${r} (fusion)`, AUTEUR]);
      await q(
        `UPDATE gestion_syndic_contact a SET parti_le = NULL, parti_par = NULL, parti_par_libelle = NULL,
                reintegre_le = r.cree_le, reintegre_par_libelle = $3,
                titre = coalesce(r.titre, a.titre), civilite = coalesce(r.civilite, a.civilite), rang = r.rang,
                maj_le = now(), maj_par_libelle = $3
           FROM gestion_syndic_contact r WHERE a.id = $1 AND r.id = $2`, [a, r, AUTEUR]);
      await q(`UPDATE gestion_syndic_coordonnee SET contact_id = $1 WHERE contact_id = $2`, [a, r]);
      /* Un rattachement EN COURS que l'ancienne fiche aurait déjà sur la même copropriété : on ferme celui de la copie
         (aucun doublon, l'index « en cours » l'exige) ; les autres sont repointés. */
      await q(
        `UPDATE gestion_syndic_contact_copropriete x SET retire_le = now(), retire_par_libelle = $3, retire_motif = 'doublon de fusion'
          WHERE x.contact_id = $2 AND x.retire_le IS NULL
            AND EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete y WHERE y.contact_id = $1 AND y.copropriete_id = x.copropriete_id AND y.retire_le IS NULL)`,
        [a, r, AUTEUR]);
      await q(`UPDATE gestion_syndic_contact_copropriete SET contact_id = $1 WHERE contact_id = $2`, [a, r]);
      await q(`UPDATE gestion_message_adresse SET syndic_contact_id = $1 WHERE syndic_contact_id = $2`, [a, r]);
      await q(
        `UPDATE gestion_syndic_contact SET retire_le = now(), retire_par_libelle = $2, retire_motif = $3 WHERE id = $1`,
        [r, AUTEUR, `fusionnée dans la fiche #${a} le ${aujourdhui}`]);
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
         VALUES ('annuaire', $1, 'syndic_contact_fusion', $2, $3, $4, $5)`,
        [a, String(r), String(a), `${x.personne} : la copie #${r} est fusionnée dans la fiche #${a} (accord d’Arno, 12/10/2026)`, AUTEUR]);
    }
  });
  console.log('③ Fusion appliquée (une transaction).');

  /* ── ④ VÉRIFICATION ── */
  const apres = await compteurs();
  const { rows: visibles } = await query<{ id: string; prenom: string | null; nom: string | null; parti_le: string | null }>(
    `SELECT id::text, prenom, nom, parti_le::text FROM gestion_syndic_contact WHERE syndic_id = $1 AND retire_le IS NULL ORDER BY id`, [syndicId]);
  for (const x of paires) {
    const [prenom, nom] = x.personne.split(' ');
    const v = visibles.filter((c) => cleNom(c.prenom, c.nom) === cleNom(prenom, nom));
    const { rows: per } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND action = '${ACTION_PERIODE_CONTACT}'`, [Number(x.ancienne.id)]);
    console.log(`④ ${x.personne} : ${v.length} fiche visible (#${v.map((c) => c.id).join(', ')}, ${v[0]?.parti_le === null ? 'en poste' : 'partie'}) ; périodes : ${Number(per[0].n) + 1}`);
  }
  const { rows: orph } = await query<{ n: string }>(
    `SELECT ((SELECT count(*) FROM gestion_syndic_coordonnee k JOIN gestion_syndic_contact c ON c.id = k.contact_id WHERE c.id = ANY($1::bigint[]) AND c.retire_le IS NOT NULL)
           + (SELECT count(*) FROM gestion_syndic_contact_copropriete k JOIN gestion_syndic_contact c ON c.id = k.contact_id WHERE c.id = ANY($1::bigint[]) AND c.retire_le IS NOT NULL)
           + (SELECT count(*) FROM gestion_message_adresse a JOIN gestion_syndic_contact c ON c.id = a.syndic_contact_id WHERE c.id = ANY($1::bigint[]) AND c.retire_le IS NOT NULL))::text AS n`,
    [paires.map((x) => Number(x.recente.id))]);
  console.log(`④ Références restées sur les copies archivées : ${orph[0].n}`);
  console.log(`④ Mails : avant ${JSON.stringify(avant)} — après ${JSON.stringify(apres)} — ${JSON.stringify(avant) === JSON.stringify(apres) ? 'aucun mail touché' : 'ÉCART'}`);
}

void main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
