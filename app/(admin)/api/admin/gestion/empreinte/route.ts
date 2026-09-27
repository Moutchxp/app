import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';
import {
  EMPREINTE_VIDE, VEILLE_VIVE_VIDE, type Empreinte, type VeilleVive,
} from '../../../../../lib/gestion/rafraichir';

/**
 * /api/admin/gestion/empreinte — LOT ÉCRAN-VIVANT : « l'écran a-t-il vieilli ? », en trois nombres.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CETTE ROUTE EXISTE. L'écran de gestion ne se chargeait qu'une fois, au montage : le 26/09/2026 il
 * affichait « dernière passe il y a 46 s » une heure durant, et la Réception restait figée sur le dernier mail connu
 * au chargement. Un écran figé qui affiche une heure figée est indiscernable d'une relève arrêtée.
 *
 * Il faut donc un battement — et un battement qui relirait TOUT l'écran (file, cartes, compteurs, veille, copie)
 * toutes les 30 secondes ferait payer 120 lectures complètes par heure pour la même image. Cette route répond à la
 * seule question utile, en 1,2 ms MESURÉ : trois `max()` lus sur des index.
 *
 * 🔒 LECTURE SEULE, ET RIEN QUE TROIS NOMBRES. Aucune donnée personnelle ne sort d'ici : ni objet, ni adresse, ni
 * extrait. C'est ce qui permet de l'appeler souvent sans y réfléchir.
 *
 * ⚠️ PAS DE `count(*)`. Compter 56 805 messages est un balayage complet ; le plus grand identifiant dit la même chose
 * — un message de plus, un identifiant de plus — pour un millième du coût.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  try {
    /**
     * ══ 🔴 LOT VEILLE-VIVE — LA ROUTE RAPPORTE AUSSI L'ÉTAT DE LA RELÈVE ══════════════════════════════════════
     * Le bandeau annonçait « arrêtée depuis 12 min » pendant que la relève tournait chaque minute : l'écran faisait
     * avancer son horloge à chaque battement mais ne relisait l'heure de la dernière passe que lorsqu'un MESSAGE
     * arrivait. Pendant une accalmie, il comparait donc une horloge vivante à une heure gelée.
     *
     * ⚠️ CELA NE COÛTE RIEN. La sous-requête de la dernière passe était DÉJÀ là — on ne faisait que jeter sa date et
     * son résultat pour n'en garder que l'identifiant. Trois colonnes de plus sur la même ligne, aucun accès de plus.
     *
     * 🔒 TOUJOURS AUCUNE DONNÉE PERSONNELLE : deux dates, un mot (`ok`/`erreur`), trois nombres. Ni objet, ni
     * adresse, ni extrait. C'est ce qui permet d'appeler cette route toutes les 30 secondes sans y réfléchir.
     */
    const { rows } = await query<{
      m: string | null; f: string | null; p: string | null;
      passe_le: string | null; passe_resultat: 'ok' | 'erreur' | null; mail_le: string | null;
    }>(
      `WITH derniere AS (
         SELECT id, termine_le, resultat FROM gestion_releve_run
          WHERE declencheur = 'planifie' AND resultat IN ('ok', 'erreur') AND termine_le IS NOT NULL
          ORDER BY termine_le DESC LIMIT 1
       )
       SELECT (SELECT max(id)::text FROM gestion_message) AS m,
              (SELECT max(id)::text FROM gestion_fil) AS f,
              (SELECT id::text FROM derniere) AS p,
              (SELECT to_char(termine_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM derniere) AS passe_le,
              (SELECT resultat FROM derniere) AS passe_resultat,
              -- Le dernier mail CAPTURÉ : une autre question que « la relève tourne-t-elle ». Lu par l'identifiant
              --   le plus grand (index de clé primaire), jamais par un max() sur une date non indexée.
              (SELECT to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                 FROM gestion_message ORDER BY id DESC LIMIT 1) AS mail_le`);
    const r = rows[0];
    const empreinte: Empreinte & { veille: VeilleVive } = {
      messageMax: Number(r?.m ?? 0), filMax: Number(r?.f ?? 0), passeId: Number(r?.p ?? 0),
      veille: {
        derniereLe: r?.passe_le ?? null,
        resultat: r?.passe_resultat ?? null,
        dernierMailLe: r?.mail_le ?? null,
      },
    };
    return Response.json(empreinte, { headers: ENTETES });
  } catch (e) {
    /**
     * ⚠️ UN ÉCHEC ICI NE CASSE RIEN, ET NE MENT PAS NON PLUS. L'écran est déjà affiché ; il continuera de montrer ce
     * qu'il a. On rend l'empreinte VIDE (trois zéros) plutôt qu'une erreur : `aRafraichir` ne déclenche un
     * rechargement que sur un CHANGEMENT de message ou de fil, et une empreinte vide ne prétend donc pas qu'il y a du
     * neuf — elle dit seulement qu'on n'a rien pu mesurer.
     */
    console.error('[api/admin/gestion/empreinte] lecture impossible', e);
    // ⚠️ L'état de veille VIDE, pas un état inventé : `veilleAAfficher` retombe alors champ par champ sur ce que la
    //   page portait. On ne remplace jamais une heure connue par un « on ne sait pas » déguisé en « jamais ».
    return Response.json({ ...EMPREINTE_VIDE, veille: VEILLE_VIVE_VIDE }, { status: 200, headers: ENTETES });
  }
}
