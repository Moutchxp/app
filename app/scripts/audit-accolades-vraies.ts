/**
 * ══ 🔴🔴 LOT ACCOLADE-TOUJOURS-VRAIE — AUDIT DES ACCOLADES, LECTURE SEULE STRICTE ═════════════════════════════════════
 *
 * RÈGLE ABSOLUE D'ARNO (12/10/2026) : « le texte d'une accolade dit TOUJOURS la réalité actuelle de ce qu'il annonce ».
 *
 * Pour CHAQUE accolade qui s'afficherait dans l'historique d'un bien (toutes les conversations, tous les biens en jeu),
 * l'audit compare ce qu'elle dit à la réalité d'aujourd'hui, c'est-à-dire aux biens rattachés au mail déclencheur — le
 * même calcul que le compteur sous la date et que la fenêtre « Bien(s) rattaché(s) à ce mail » :
 *   · « suivi de fond modifié — N biens rattachés » : N = compteur du mail déclencheur ;
 *   · « suivi aussi par ce bien » : le bien EST rattaché au mail déclencheur ;
 *   · « sorti du suivi de ce bien » : il ne l'est PAS.
 * Il dit aussi ce que l'ANCIENNE règle (chiffre figé à la pose, fenêtres seules) aurait affiché de faux.
 *
 * Et pour la vue conversation, dont l'accolade énumère les biens de la fenêtre (« À partir d'ici : 25 rue … ») : il
 * compare ces biens à ceux réellement rattachés au mail déclencheur. ⚠️ CET ÉCART-LÀ EST UN ÉTAT DES DONNÉES (la fenêtre
 * et les liens projetés ne disent pas la même chose — lien « retiré » par un ancien geste, fenêtre vide et liens
 * confirmés), pas un chiffre d'affichage : il est listé, jamais corrigé ici.
 *
 * 🔒 AUCUNE ÉCRITURE : ni en base (garde ci-dessous), ni sur disque — le résultat sort sur la console.
 * Usage : npx tsx --conditions=react-server --env-file=.env app/scripts/audit-accolades-vraies.ts
 */
import { readFileSync } from 'node:fs';
import { query } from '../lib/db/client';
import { mailsDuFil, periodesRefermeesDuFil, suiviDuFil } from '../lib/gestion/periodeRepo';
import { clesBiensParMail } from '../lib/gestion/compteBiensMailRepo';
import { accoladesDuBienDansLeFil } from '../lib/gestion/accoladesBien';
import { changementsDuFil, motBiensRattaches, nbBiensDuClassement } from '../lib/gestion/changementsSuivi';

const VERBES_INTERDITS = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

function GARDE_LECTURE_SEULE(): void {
  const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .filter((l) => !l.includes('VERBES_INTERDITS'))
    .join('\n')
    .toUpperCase();
  const trouves = VERBES_INTERDITS.filter((v) => code.includes(v));
  if (trouves.length > 0) {
    console.error(`ARRÊT : ce script d'audit contient un verbe d'écriture (${trouves.join(', ')}). Rien n'a été lu.`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  /* Les échanges qui portent au moins une accolade : le même filtre que la route de l'historique. */
  const { rows } = await query<{ fil_id: string }>(
    `SELECT DISTINCT p.fil_id::text
       FROM gestion_fil_periode p
      WHERE p.remplacee_le IS NULL
        AND (p.depuis_message_id <> (SELECT m.id FROM gestion_message m WHERE m.fil_id = p.fil_id
                                      ORDER BY m.recu_le, m.id LIMIT 1)
             OR lower(btrim(p.cree_par_libelle)) NOT LIKE 'reprise%')
      ORDER BY 1`);
  let controlees = 0;
  const parSens = { ajout: 0, retrait: 0, modif: 0 };
  let ecarts = 0;
  let fausseAncienneRegle = 0;
  let masqueesCarIrreelles = 0;
  let conversationControlees = 0;
  let conversationEcarts = 0;
  const details: string[] = [];
  for (const r of rows) {
    const fil = Number(r.fil_id);
    const [{ periodes }, mails, anciennes] = await Promise.all([suiviDuFil(fil), mailsDuFil(fil), periodesRefermeesDuFil(fil)]);
    const changements = changementsDuFil({ mails, periodes, anciennes });
    if (changements.length === 0) continue;
    const reels = await clesBiensParMail(changements.map((c) => c.depuisMessageId));
    /* La vue conversation : les biens que l'accolade énumère = les biens rattachés au mail déclencheur. */
    for (const c of changements) {
      conversationControlees += 1;
      const dit = new Set(c.apres.sorte === 'biens' ? c.apres.biens.map((b) => b.cle) : []);
      const vrai = reels.get(c.depuisMessageId) ?? new Set<string>();
      if (dit.size !== vrai.size || [...dit].some((k) => !vrai.has(k))) {
        conversationEcarts += 1;
        details.push(`conversation fil ${fil} mail ${c.depuisMessageId} : la fenêtre dit [${[...dit].join(',')}], rattachés [${[...vrai].join(',')}]`);
      }
    }
    /* L'historique de chaque bien en jeu. */
    const cles = new Set<string>();
    for (const c of changements) {
      for (const k of [c.avant, c.apres]) if (k?.sorte === 'biens') for (const b of k.biens) cles.add(b.cle);
    }
    for (const cle of cles) {
      const sansRealite = accoladesDuBienDansLeFil({ filId: fil, mails, periodes, anciennes, cle });
      const avecRealite = accoladesDuBienDansLeFil({ filId: fil, mails, periodes, anciennes, cle, rattachesParMail: reels });
      masqueesCarIrreelles += sansRealite.length - avecRealite.length;
      for (const a of sansRealite) {
        const vrai = reels.get(a.depuisMessageId) ?? new Set<string>();
        const juste = a.sens === 'ajout' ? vrai.has(cle) : a.sens === 'retrait' ? !vrai.has(cle)
          : vrai.has(cle) && nbBiensDuClassement(a.detail?.apres ?? null) === vrai.size;
        if (!juste) fausseAncienneRegle += 1;
      }
      for (const a of avecRealite) {
        controlees += 1;
        parSens[a.sens] += 1;
        const vrai = reels.get(a.depuisMessageId) ?? new Set<string>();
        const juste = a.sens === 'ajout' ? vrai.has(cle) : a.sens === 'retrait' ? !vrai.has(cle)
          : a.libelle === `suivi de fond modifié — ${motBiensRattaches(vrai.size)}`;
        if (!juste) {
          ecarts += 1;
          details.push(`historique fil ${fil} bien ${cle} mail ${a.depuisMessageId} : « ${a.libelle} », rattachés ${vrai.size}`);
        }
      }
    }
  }
  console.log(`Échanges examinés : ${rows.length}`);
  console.log(`Accolades d'historique contrôlées (règle corrigée) : ${controlees} — écarts : ${ecarts}`);
  console.log(`  « suivi de fond modifié — N » : ${parSens.modif} · « suivi aussi par ce bien » : ${parSens.ajout} · « sorti du suivi de ce bien » : ${parSens.retrait}`);
  console.log(`  dont fausses avec l'ANCIENNE règle (chiffre figé, réalité ignorée) : ${fausseAncienneRegle}`);
  console.log(`  accolades qui ne correspondaient plus à rien de réel, désormais masquées : ${masqueesCarIrreelles}`);
  console.log(`Accolades de la vue conversation contrôlées : ${conversationControlees} — écarts : ${conversationEcarts}`);
  for (const d of details.slice(0, 40)) console.log(`  · ${d}`);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
