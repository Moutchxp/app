/**
 * LOT 113 — POSE des e-mails de mairie relevés FICHE PAR FICHE sur l'annuaire BANATIC (DGCL — www.banatic.interieur.gouv.fr,
 * Licence Ouverte Etalab 2.0) pour les 12 communes du 94 absentes d'api-lannuaire (relevé LOT 112, valeurs VERBATIM ci-dessous).
 *
 * PÉRIMÈTRE STRICT : ce script ne touche QUE les 12 communes listées (aucun balayage des 382 communes — contrairement à
 * `mairie:contact:import`). Les 3 communes SANS e-mail BANATIC (94019 Chennevières, 94028 Créteil, 94077 Villeneuve-le-Roi) ne
 * sont PAS ici : rien n'est posé pour elles (pas de canal inventé).
 *
 * ÉCRITURE via `ecrireContact` (journalisée) : source='annuaire_banatic' (migration 199 — DISTINCTE de 'annuaire', donc protégée
 * d'un écrasement par api-lannuaire), statut='presume' (aucune vérification humaine), canal='email'. La traçabilité Etalab
 * (paternité + source + DATE du relevé) est portée par `mairie_contact.note` : sûr par construction (créations fraîches, aucune
 * note humaine en 94). NE PRODUIT AUCUN ENVOI, NE CRÉE AUCUNE DEMANDE.
 *
 * Lancer :  npm run permis:banatic-poser-94              (DRY-RUN : compte, journalise, ROLLBACK — rien écrit)
 *           npm run permis:banatic-poser-94 -- --appliquer (COMMIT)
 */
import '../lib/chargerEnv';
import { pool, closePool } from '../lib/db/client';
import { ecrireContact, type Requete } from '../lib/sitadel/mairieContact';

/** DATE du relevé BANATIC (LOT 112) — figée ici pour la mention Etalab, jamais `new Date()` (déterminisme + fidélité au relevé). */
const RELEVE_LE = '2026-09-05';
const NOTE = `Relevé annuaire BANATIC (DGCL, www.banatic.interieur.gouv.fr) le ${RELEVE_LE} — Licence Ouverte Etalab 2.0`;
const MOTIF = 'pose e-mail relevé BANATIC (LOT 113)';

/** Les 12, VERBATIM du LOT 112 (e-mail + téléphone bruts, aucune correction). */
const CONTACTS: { codeInsee: string; email: string; telephone: string }[] = [
  { codeInsee: '94001', email: 'mairie@ville-ablonsurseine.fr', telephone: '0149613333' },
  { codeInsee: '94016', email: 'secretariat.general@ville-cachan.fr', telephone: '0149696969' },
  { codeInsee: '94017', email: 'secretariat-maire@mairie-champigny94.fr', telephone: '0145164000' },
  { codeInsee: '94021', email: 'cabinetmaire@ville-chevilly-larue.fr', telephone: '0145601800' },
  { codeInsee: '94034', email: 'secretariatgeneral@fresnes94.fr', telephone: '0149845656' },
  { codeInsee: '94038', email: 'maire@ville-lhay94.fr', telephone: '0146153333' },
  { codeInsee: '94042', email: 'secretariat.maire@joinvillelepont.fr', telephone: '0148851040' },
  { codeInsee: '94059', email: 'direction.generale@leplessistrevise.fr', telephone: '0149622525' },
  { codeInsee: '94065', email: 'cabinetdumaire@ville-rungis.fr', telephone: '0145128000' },
  { codeInsee: '94071', email: 'dgs@ville-sucy.fr', telephone: '0149822450' },
  { codeInsee: '94080', email: 'maire@vincennes.fr', telephone: '0143986500' },
  { codeInsee: '94081', email: 'secretariatdumaire@mairie-vitry94.fr', telephone: '0146828000' },
];

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  console.log(`\n══════ POSE BANATIC 94 — ${appliquer ? 'APPLIQUÉ (commit)' : 'DRY-RUN (rollback — RIEN écrit)'} ══════`);
  console.log(`${CONTACTS.length} commune(s) ciblée(s) ; note = « ${NOTE} »`);
  const client = await pool.connect();
  let ecrits = 0;
  try {
    await client.query('BEGIN');
    const q: Requete = <R = Record<string, unknown>>(t: string, p?: unknown[]) =>
      client.query(t, p) as unknown as Promise<{ rows: R[] }>;
    for (const c of CONTACTS) {
      const { change } = await ecrireContact(q, {
        codeInsee: c.codeInsee, email: c.email, source: 'annuaire_banatic', statut: 'presume', canal: 'email',
        telephone: c.telephone, note: NOTE, motif: MOTIF, auteur: null,
      });
      if (change) ecrits += 1;
      console.log(`  ${c.codeInsee} ${change ? 'écrit' : 'inchangé'} · ${c.email} · ${c.telephone}`);
    }
    if (appliquer) { await client.query('COMMIT'); console.log(`\n✓ COMMIT — ${ecrits} contact(s) écrit(s)/mis à jour.`); }
    else { await client.query('ROLLBACK'); console.log(`\n⚠ DRY-RUN : ROLLBACK — ${ecrits} écriture(s) prévue(s), RIEN appliqué. Relancer avec --appliquer.`); }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

void main()
  .catch((e) => { console.error('[banatic:poser-94] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
