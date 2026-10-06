/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 2 — LA REPRISE DES ÉTAPES DÉJÀ REÇUES ════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO (06/10/2026) : « Reprise : enregistre les étapes des mails Monga déjà reçus (corbeille comprise),
 * avec une simulation chiffrée avant d'appliquer. Aucun doublon si un même mail est relu. » Et, après l'audit :
 * « Reclasse les 55 lignes “commentaire” de gestion_monga_mail selon les étapes réelles trouvées dans le corps
 * (simulation chiffrée d'abord, puis application). »
 *
 * ═══ POURQUOI UNE REPRISE, ET POURQUOI ELLE PRESSE ══════════════════════════════════════════════════════════════
 *
 * **25 des 98 mails Monga gabarités sont déjà à la corbeille** (mesuré le 06/10/2026), et Gmail efface au bout de
 * 30 jours. Chaque jour sans reprise est un jour où de l'historique d'intervention peut disparaître pour de bon.
 *
 * ═══ USAGE ═════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx app/scripts/monga-etapes-reprise.ts              → SIMULATION (par défaut, n'écrit RIEN)
 *   npx tsx app/scripts/monga-etapes-reprise.ts --appliquer  → écrit
 *
 * 🔴 LA SIMULATION EST LE DÉFAUT, ET NON L'OPTION. Un script de reprise qui écrit quand on l'appelle sans
 * argument est un script qu'on lance une fois de trop. Il faut DEMANDER d'écrire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { query, closePool } from '../lib/db/client';
import { etapesDuMailMonga, ouvertureDeRepli, motEtape, type TypeEtape } from '../lib/gestion/mongaEtape';

const APPLIQUER = process.argv.includes('--appliquer');

interface MailMonga {
  id: string; fil_id: string; message_id: string | null;
  objet: string | null; corps_texte: string | null; recu_le: string;
  reference: string | null; jete: boolean;
}

async function main(): Promise<void> {
  console.log(APPLIQUER
    ? '🔴 LOT MONGA-2 — REPRISE : APPLICATION (la base va être écrite)'
    : '— LOT MONGA-2 — REPRISE : SIMULATION (aucune écriture ; --appliquer pour écrire)');
  console.log('');

  /**
   * ⚠️ TOUS LES MAILS MONGA, CORBEILLE COMPRISE, et c'est le point : la règle d'Arno existe précisément pour que
   * le sort du mail n'efface pas l'étape. Filtrer la corbeille ici aurait perdu un quart du corpus.
   */
  const { rows } = await query<MailMonga>(
    `SELECT id, fil_id, message_id, objet, corps_texte, recu_le::text AS recu_le,
            CASE WHEN (regexp_match(coalesce(objet,'')||' '||coalesce(corps_texte,''),
                                    'MNG[- ]?([0-9]{4,6})'))[1] IS NULL THEN NULL
                 ELSE 'MNG-' || (regexp_match(coalesce(objet,'')||' '||coalesce(corps_texte,''),
                                              'MNG[- ]?([0-9]{4,6})'))[1] END AS reference,
            corbeille_le IS NOT NULL AS jete
       FROM gestion_message
      WHERE de_adresse ~* '@([a-z0-9-]+\\.)*monga\\.io$'
      ORDER BY recu_le`);

  const parType = new Map<TypeEtape, number>();
  const refs = new Map<string, { premier: string; aOuverture: boolean }>();
  let sansRef = 0; let sansEtape = 0; let etapesVues = 0; let jetes = 0;

  for (const m of rows) {
    if (m.jete) jetes += 1;
    if (m.reference === null) { sansRef += 1; continue; }
    const lues = etapesDuMailMonga(m.objet, m.corps_texte);
    if (lues.length === 0) { sansEtape += 1; }
    const r = refs.get(m.reference) ?? { premier: m.recu_le, aOuverture: false };
    if (m.recu_le < r.premier) r.premier = m.recu_le;
    for (const e of lues) {
      etapesVues += 1;
      parType.set(e.type, (parType.get(e.type) ?? 0) + 1);
      if (e.type === 'ouverture') r.aOuverture = true;
    }
    refs.set(m.reference, r);

    if (APPLIQUER) {
      for (const e of lues) {
        const survenu = e.jour === null ? m.recu_le : `${e.jour}T${e.heure?.de ?? '00:00'}:00`;
        await query(
          `INSERT INTO gestion_monga_etape
             (reference, type, survenu_le, heure_connue, heure_fin, numero, rang, texte, auteur,
              source, message_id, message_cle, certitude)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'monga',$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [m.reference, e.type, survenu, e.heure !== null, e.heure?.a ?? null,
            e.numero, e.rang, e.texte, e.auteur, Number(m.id), m.message_id, e.certitude]);
      }
    }
  }

  /* ── LES OUVERTURES DE REPLI (décision d'Arno) ───────────────────────────────────────────────────────────── */
  let replis = 0;
  for (const [ref, r] of refs) {
    if (r.aOuverture) continue;
    replis += 1;
    if (APPLIQUER) {
      const e = ouvertureDeRepli(r.premier);
      await query(
        `INSERT INTO gestion_monga_etape (reference, type, survenu_le, texte, source, certitude)
         SELECT $1,'ouverture',$2,$3,'monga','a_confirmer'
          WHERE NOT EXISTS (SELECT 1 FROM gestion_monga_etape
                             WHERE reference = $1 AND type = 'ouverture' AND statut = 'vif')`,
        [ref, r.premier, e.texte]);
    }
  }

  console.log(`mails Monga relus (corbeille comprise) : ${rows.length}   dont à la corbeille : ${jetes}`);
  console.log(`sans référence MNG (ignorés)           : ${sansRef}`);
  console.log(`mails ne donnant aucune étape          : ${sansEtape}`);
  console.log(`références couvertes                   : ${refs.size}`);
  console.log(`ouvertures de repli                    : ${replis}`);
  console.log('');
  console.log(`étapes ${APPLIQUER ? 'écrites' : 'qui seraient écrites'} : ${etapesVues} + ${replis} ouvertures = ${etapesVues + replis}`);
  console.log('');
  for (const [t, n] of [...parType].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${motEtape(t).padEnd(28)} ${String(n).padStart(4)}`);
  }

  /* ══ LE RECLASSEMENT DE `gestion_monga_mail` (décision d'Arno du 06/10) ═══════════════════════════════════════
   *
   * 🔴 CE QUE ÇA CORRIGE : cette table range 55 mails sous « commentaire » parce qu'elle ne lit que l'OBJET. Or
   * l'audit a montré que c'est dans le CORPS que Monga écrit le rendez-vous, le devis et la facture. Le
   * reclassement leur rend leur vraie étape, avec le vocabulaire DE CETTE TABLE-LÀ (son `CHECK` ne connaît pas
   * les types de la frise), sans toucher à une seule autre colonne.
   */
  console.log('');
  console.log('── RECLASSEMENT DE gestion_monga_mail ──────────────────────────────────────');
  /**
   * ══ 🔴🔴 DEUX ÉTIQUETTES À RELIRE, ET LA SECONDE EST ARRIVÉE APRÈS COUP ═══════════════════════════════════════
   *
   * Arno avait d'abord nommé « les 55 lignes commentaire ». En les reclassant, le script a SIGNALÉ SANS LE FAIRE
   * que **12 lignes rangées sous `attention` portent en réalité un devis avec son numéro** : leur OBJET dit « le
   * ticket MONGA # requiert votre attention » pendant que leur CORPS dit « Votre devis N°DEV-… ». C'est le même
   * défaut qu'avec `commentaire` — un classement fait sur l'objet alors que l'étape est dans le corps.
   *
   * 🔴 ARNO A TRANCHÉ (lot FRISE-HORIZONTALE) : « Si les 12 lignes “attention” n'ont pas encore été reclassées :
   * fais-le d'abord. » Les deux étiquettes passent donc par la même relecture.
   *
   * ⚠️ ET SEULEMENT CELLES-LÀ. `service`, `facture`, `compte_rendu`… ont été POSÉES par ce reclassement : les
   * relire ferait tourner en rond. Seules les deux étiquettes « fourre-tout » de la lecture par l'objet sont
   * concernées.
   */
  const { rows: aRelire } = await query<{ message_id: string; etape: string; objet: string | null; corps_texte: string | null }>(
    `SELECT mm.message_id, mm.etape, m.objet, m.corps_texte
       FROM gestion_monga_mail mm JOIN gestion_message m ON m.id = mm.message_id
      WHERE mm.etape IN ('commentaire', 'attention')`);

  /** La traduction vers le vocabulaire de `gestion_monga_mail` — il est plus pauvre, et on ne l'élargit pas ici. */
  const versAncien: Partial<Record<TypeEtape, string>> = {
    devis_recu: 'devis_envoye', rappel_devis: 'devis_rappel', cloture: 'terminee',
    facture: 'facture', intervention: 'compte_rendu', rdv_eu_lieu: 'compte_rendu',
    prise_rdv: 'service', rdv_intervention: 'service', ouverture: 'service',
    contact_injoignable: 'service',
  };
  const mouvements = new Map<string, number>();
  for (const l of aRelire) {
    const lues = etapesDuMailMonga(l.objet, l.corps_texte);
    const majeure = lues.find((e) => e.type !== 'commentaire');
    const cible = majeure === undefined ? null : versAncien[majeure.type] ?? null;
    if (cible === null || cible === l.etape) continue;
    mouvements.set(`${l.etape} → ${cible}`, (mouvements.get(`${l.etape} → ${cible}`) ?? 0) + 1);
    if (APPLIQUER) {
      await query('UPDATE gestion_monga_mail SET etape = $2 WHERE message_id = $1', [Number(l.message_id), cible]);
    }
  }
  console.log(`lignes « commentaire » et « attention » examinées : ${aRelire.length}`);
  let total = 0;
  for (const [k, n] of [...mouvements].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(34)} ${String(n).padStart(4)}`);
    total += n;
  }
  console.log(`${APPLIQUER ? 'reclassées' : 'seraient reclassées'} : ${total}   inchangées : ${aRelire.length - total}`);

  /**
   * ⚠️ LE SIGNALEMENT « HORS CONSIGNE » QUI VIVAIT ICI A ÉTÉ RETIRÉ, ET C'EST NORMAL : il annonçait les 12
   * lignes « attention » qu'on ne touchait pas. Arno les a depuis fait entrer dans la consigne, et elles sont
   * reclassées par la boucle ci-dessus. Garder l'avertissement aurait annoncé un travail déjà fait.
   */

  if (!APPLIQUER) {
    console.log('');
    console.log('— SIMULATION terminée. Rien n’a été écrit. Relancer avec --appliquer pour écrire.');
  }
  await closePool();
}

void main().catch((e: unknown) => {
  console.error('échec de la reprise :', e);
  process.exitCode = 1;
});
