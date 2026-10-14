/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) — À L'ENVOI, LES MÊMES ÉCRITURES QUE « MODIFIER LE
 * RATTACHEMENT », POUR CHAQUE POSITION DE LA GLISSIÈRE — ÉPROUVÉ SUR UNE VRAIE BASE D'ESSAI ═════════════════════════
 *
 * Deux conversations JUMELLES (mêmes mails, même suivi de fond, même réponse envoyée et capturée) :
 *   · sur la première, la réponse est modifiée par la fonction de « Modifier le rattachement » (`poserClassement`, ce
 *     que `POST /api/admin/gestion/suivi` appelle), avec ce que la fenêtre enverrait ;
 *   · sur la seconde, les mêmes choix ont été faits dans le composeur : l'intention est retenue sur l'envoi
 *     (`enregistrerClassementEnvoi`), puis appliquée après la capture (`appliquerClassementsEnAttente`).
 * Les deux doivent finir IDENTIQUES : périodes, exceptions, rattachements de chaque mail.
 *
 * 🔴 CE FICHIER NE TOURNE JAMAIS SUR LA BASE RÉELLE (garde ci-dessous), et AUCUN MAIL NE PART : l'envoi est une ligne
 * `gestion_envoi` écrite à la main, la réponse « capturée » une ligne `gestion_message`.
 *
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/composeurFenetreComplete.itest.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { query, closePool } from '../db/client';
import { heriterLesNouveauxMails, poserClassement } from './periodeRepo';
import { appliquerClassementsEnAttente, enregistrerClassementEnvoi } from './envoiClassementRepo';
import { definitionDe, type PositionPortee } from './porteeSuivi';
import type { Classement } from './periodesConversation';

const URL_BASE = process.env.DATABASE_URL ?? '';
const NOM_BASE = URL_BASE.split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) {
  throw new Error(`composeurFenetreComplete.itest : refus de tourner sur « ${NOM_BASE || '(aucune base)'} » `
    + '(base « svav_test… » exigée : cette épreuve ÉCRIT).');
}

const AUTEUR = { id: null, libelle: 'épreuve du composeur' };
const bien = (cle: string) => ({ cle, libelle: `Bien fictif ${cle}` });
let compteur = 0;

/** Une conversation de 3 mails reçus, suivie par LOT-A depuis le 1er, puis une réponse ENVOYÉE et capturée. */
async function jumelle(): Promise<{ filId: number; mails: number[]; reponse: number; objet: string; partiLe: string }> {
  compteur += 1;
  const cle = `composeur-${Date.now()}-${compteur}`;
  const { rows: f } = await query<{ id: string }>(
    "INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer') RETURNING id::text", [cle]);
  const filId = Number(f[0].id);
  const mails: number[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const { rows: m } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, 'recu', 'locataire@example.test', $3::timestamptz, 'Fuite fictive') RETURNING id::text`,
      [filId, `${cle}-${i}`, `2026-01-0${i}T09:00:00Z`]);
    mails.push(Number(m[0].id));
  }
  const pose = await poserClassement({ filId, messageId: mails[0], classement: { sorte: 'biens', biens: [bien('LOT-A')] }, choix: 'suite', auteur: AUTEUR });
  expect(pose.ok).toBe(true);
  const objet = `Re: Fuite fictive ${cle}`;
  const partiLe = '2026-01-05T10:00:00Z';
  const { rows: r } = await query<{ id: string }>(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
     VALUES ($1, $2, 'envoye', 'gestion@example.test', $3::timestamptz, $4) RETURNING id::text`,
    [filId, `${cle}-envoye`, '2026-01-05T10:00:30Z', objet]);
  const reponse = Number(r[0].id);
  // La relève fait hériter le nouveau mail du suivi de fond, comme pour tout mail qui arrive.
  await heriterLesNouveauxMails(filId, { id: null, libelle: 'suivi de la conversation' });
  return { filId, mails: [...mails, reponse], reponse, objet, partiLe };
}

/** Ce que la base porte pour une conversation, rangé par RANG de mail (comparable d'une jumelle à l'autre). */
async function etat(filId: number, mails: readonly number[]) {
  const rang = new Map(mails.map((m, i) => [m, i]));
  const { rows: liens } = await query<{ message_id: string; cible_cle: string; statut: string }>(
    `SELECT r.message_id::text, r.cible_cle, r.statut FROM gestion_rattachement r
       JOIN gestion_message m ON m.id = r.message_id WHERE m.fil_id = $1 AND r.cible_sorte = 'lot'`, [filId]);
  const { rows: periodes } = await query<{ depuis: string; biens: string }>(
    `SELECT p.depuis_message_id::text AS depuis, string_agg(b.cible_cle, ',' ORDER BY b.cible_cle) AS biens
       FROM gestion_fil_periode p LEFT JOIN gestion_fil_periode_bien b ON b.periode_id = p.id
      WHERE p.fil_id = $1 AND p.remplacee_le IS NULL GROUP BY p.id, p.depuis_message_id`, [filId]);
  const { rows: exceptions } = await query<{ message_id: string; biens: string | null }>(
    `SELECT e.message_id::text, string_agg(b.cible_cle, ',' ORDER BY b.cible_cle) AS biens
       FROM gestion_message_exception e LEFT JOIN gestion_message_exception_bien b ON b.exception_id = e.id
      WHERE e.message_id = ANY($1::bigint[]) AND e.retiree_le IS NULL GROUP BY e.id, e.message_id`, [[...mails]]);
  return {
    liens: liens.map((l) => `${rang.get(Number(l.message_id))}:${l.cible_cle}:${l.statut}`).sort(),
    periodes: periodes.map((p) => `${rang.get(Number(p.depuis))}:${p.biens ?? ''}`).sort(),
    exceptions: exceptions.map((e) => `${rang.get(Number(e.message_id))}:${e.biens ?? ''}`).sort(),
  };
}

/** L'envoi parti, et l'intention du composeur retenue dessus — comme `deps.classer` après un envoi réussi. */
async function envoiDuComposeur(j: Awaited<ReturnType<typeof jumelle>>, o: {
  biens: { cle: string; libelle: string }[]; retires: string[]; position: PositionPortee | null;
}): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_envoi (cle_idempotence, message_id_rfc, objet, auteur_libelle, etat, parti_le, fil_id)
     VALUES ($1, $2, $3, 'épreuve du composeur', 'envoye', $4::timestamptz, $5) RETURNING id::text`,
    [`cle-${j.filId}`, `<${j.filId}@example.test>`, j.objet, j.partiLe, j.filId]);
  const retenu = await enregistrerClassementEnvoi({
    envoiId: Number(rows[0].id), auteur: AUTEUR,
    cibles: o.biens.map((b) => ({ sorte: 'lot', cle: b.cle, id: null, libelle: b.libelle })),
    rattachement: { position: o.position, retires: o.retires },
  });
  expect(retenu).toBe(true);
}

afterAll(async () => { await closePool(); });

/**
 * Les cas : ce que la fenêtre enverrait (`classement`, `position`) et ce que le composeur garde (`biens`, `retires`,
 * `position` touchée ou non). Le suivi de fond de la réponse est LOT-A.
 */
const CAS: { nom: string; classement: Classement | null; position: PositionPortee;
  composeur: { biens: { cle: string; libelle: string }[]; retires: string[]; position: PositionPortee | null } }[] = [
  { nom: '② One shot (défaut) : LOT-B ajouté', position: 'one_shot',
    classement: { sorte: 'biens', biens: [bien('LOT-A'), bien('LOT-B')] },
    composeur: { biens: [bien('LOT-B')], retires: [], position: null } },
  { nom: '③ Ce mail + futurs échanges : LOT-B ajouté', position: 'suite',
    classement: { sorte: 'biens', biens: [bien('LOT-A'), bien('LOT-B')] },
    composeur: { biens: [bien('LOT-B')], retires: [], position: 'suite' } },
  { nom: '④ Toute la conversation : LOT-B ajouté', position: 'conversation',
    classement: { sorte: 'biens', biens: [bien('LOT-A'), bien('LOT-B')] },
    composeur: { biens: [bien('LOT-B')], retires: [], position: 'conversation' } },
  { nom: '② One shot : LOT-A (suivi de fond) décoché, LOT-C ajouté', position: 'one_shot',
    classement: { sorte: 'biens', biens: [bien('LOT-C')] },
    composeur: { biens: [bien('LOT-C')], retires: ['LOT-A'], position: null } },
  { nom: '① Origine : aucun changement, rien n’est écrit', position: 'origine', classement: null,
    composeur: { biens: [bien('LOT-A')], retires: [], position: null } },
];

describe('🔴🔴 à l’envoi, les mêmes écritures que « Modifier le rattachement »', () => {
  for (const c of CAS) {
    it(c.nom, async () => {
      const fenetre = await jumelle();
      const composeur = await jumelle();
      /* ① LA FENÊTRE « Modifier le rattachement » sur la réponse capturée : ce que `ecrire` envoie à la route. */
      const choix = definitionDe(c.position).choix;
      if (c.classement !== null && choix !== null) {
        const fait = await poserClassement({ filId: fenetre.filId, messageId: fenetre.reponse, classement: c.classement, choix, auteur: AUTEUR });
        expect(fait.ok).toBe(true);
      }
      /* ② LE COMPOSEUR : l'intention sur l'envoi, appliquée après la capture. */
      await envoiDuComposeur(composeur, c.composeur);
      const appliques = await appliquerClassementsEnAttente();
      expect(appliques).toBeGreaterThanOrEqual(1);
      expect(await etat(composeur.filId, composeur.mails)).toEqual(await etat(fenetre.filId, fenetre.mails));
      const { rows } = await query<{ issue: string; message_id: string }>(
        `SELECT ec.issue, ec.message_id::text FROM gestion_envoi_classement ec JOIN gestion_envoi e ON e.id = ec.envoi_id
          WHERE e.fil_id = $1`, [composeur.filId]);
      expect(Number(rows[0].message_id)).toBe(composeur.reponse);
      expect(rows[0].issue).toBe(c.classement === null ? 'origine : rien à écrire (origine)' : `pose : ${choix}`);
      /* Rejouer la passe n'applique rien deux fois. */
      const avant = await etat(composeur.filId, composeur.mails);
      await appliquerClassementsEnAttente();
      expect(await etat(composeur.filId, composeur.mails)).toEqual(avant);
    });
  }

  it('🔴 un envoi en échec : rien n’est appliqué', async () => {
    const j = await jumelle();
    const avant = await etat(j.filId, j.mails);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_envoi (cle_idempotence, message_id_rfc, objet, auteur_libelle, etat, fil_id)
       VALUES ($1, $2, $3, 'épreuve du composeur', 'echec', $4) RETURNING id::text`,
      [`cle-echec-${j.filId}`, `<echec-${j.filId}@example.test>`, j.objet, j.filId]);
    await query(
      `INSERT INTO gestion_envoi_classement (envoi_id, biens, retires, position, auteur_libelle)
       VALUES ($1, $2::jsonb, '[]'::jsonb, 'suite', 'épreuve du composeur')`,
      [Number(rows[0].id), JSON.stringify([bien('LOT-B')])]);
    await appliquerClassementsEnAttente();
    expect(await etat(j.filId, j.mails)).toEqual(avant);
    const { rows: r } = await query<{ applique_le: string | null }>(
      'SELECT applique_le::text FROM gestion_envoi_classement WHERE envoi_id = $1', [Number(rows[0].id)]);
    expect(r[0].applique_le).toBeNull();
  });
});
