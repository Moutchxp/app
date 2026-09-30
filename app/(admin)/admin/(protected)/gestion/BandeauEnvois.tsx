'use client';

import { useCallback, useEffect, useState } from 'react';
import { grouperEnvois, motGroupeEnvoi, tonEtatFile } from '../../../../lib/gestion/fileEnvoi';

/**
 * 🔴 LOT ENVOI-ARRIERE-PLAN — CE QUI N'EST PAS (ENCORE) PARTI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX ÉTATS, ET UN SEUL DEMANDE UN GESTE.
 *   · « Envoi en cours » — neutre, et il ne dure que quelques secondes. Il comble l'intervalle entre le clic et la
 *     capture du message par la relève : sans lui, le mail n'est nulle part pendant une minute, on croit le clic
 *     perdu, et on réécrit le message ;
 *   · « Non envoyé » — ROUGE, avec sa cause en français et le lien vers le brouillon. C'est le seul qui appelle
 *     une action.
 *
 * 🔴 LE MOT PORTE L'INFORMATION, JAMAIS LA COULEUR SEULE : « Non envoyé » se lit en niveaux de gris comme il se lit
 * par un daltonien. La couleur n'est qu'un renfort — règle de tout le module.
 *
 * ⚠️ IL NE S'AFFICHE PAS QUAND IL N'Y A RIEN. Un bandeau permanent qui dit « rien à signaler » cesse d'être lu, et
 * le jour où il dit quelque chose, personne ne le voit.
 *
 * ⚠️ SANS LA MIGRATION 271, la route rend une liste vide : ce bandeau n'existe simplement pas, et l'envoi reste
 * synchrone comme avant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface EnvoiEnCours {
  id: number;
  filId: number | null;
  objet: string;
  destinataires: string[];
  etat: 'attente' | 'en_cours' | 'echec';
  demandeLe: string;
  cause: string | null;
  brouillonId: number | null;
}

/**
 * ⚠️ RELU RÉGULIÈREMENT, MAIS PAS TROP. Un envoi ordinaire dure quelques secondes : cinq secondes suffisent à le
 * voir naître et disparaître. Interroger chaque seconde ferait quatre-vingts requêtes par minute pour une liste
 * presque toujours vide.
 */
const INTERVALLE_MS = 5000;

export function BandeauEnvois({ filId, sauf = null, onRouvrir }: {
  /** Borne l'affichage à un échange. `null` = tous, ce qu'on veut en tête du module. */
  filId?: number | null;
  /**
   * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — L'ÉCHANGE DONT LE BANDEAU EST DÉJÀ À L'ÉCRAN ════════════════════════════════
   *
   * CONSTAT D'ARNO : le même échec s'affichait QUATRE fois — deux en tête de page, deux dans le fil. Deux causes,
   * et celle-ci est la première : `GestionVue` pose un bandeau GÉNÉRAL, `Conversation` en pose un BORNÉ au fil
   * ouvert. Quand on regarde justement ce fil, la même phrase est donc écrite deux fois à dix centimètres
   * d'intervalle — et rien n'y distingue l'une de l'autre, donc on croit à deux pannes.
   *
   * 🔴 C'EST LA TÊTE DE PAGE QUI SE TAIT, JAMAIS LE FIL. Le bandeau du fil est posé À CÔTÉ du message concerné,
   * là où se fait le geste ; celui de la tête n'est qu'un rappel pour les écrans où l'échange n'est pas visible.
   * Supprimer le mauvais des deux ferait disparaître l'échec de l'endroit où on le répare.
   *
   * `null` = on ne masque rien (aucun fil ouvert, ou bandeau déjà borné par `filId`).
   */
  sauf?: number | null;
  /** Rouvre le brouillon d'un envoi échoué. Absent = on affiche la cause sans proposer de geste. */
  onRouvrir?: (brouillonId: number) => void;
}) {
  const [lignes, setLignes] = useState<EnvoiEnCours[]>([]);

  const relire = useCallback(async () => {
    try {
      const q = filId ? `?fil=${filId}` : '';
      const res = await fetch(`/api/admin/gestion/envois-en-cours${q}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; lignes?: EnvoiEnCours[] };
      // ⚠️ Une erreur laisse la liste TELLE QU'ELLE ÉTAIT : la vider ferait disparaître un « Non envoyé » à cause
      //   d'un hoquet de réseau, c'est-à-dire effacer l'alerte au lieu de la porter.
      if (d.etat === 'ok') setLignes(d.lignes ?? []);
    } catch { /* silence : on garde ce qu'on affichait */ }
  }, [filId]);

  useEffect(() => {
    void relire();
    const t = setInterval(() => { void relire(); }, INTERVALLE_MS);
    return () => clearInterval(t);
  }, [relire]);

  /**
   * 🔴 DEUX RÉDUCTIONS, DANS CET ORDRE : on retire d'abord ce que le fil ouvert dit déjà, on regroupe ensuite les
   * tentatives identiques de ce qui reste. L'inverse compterait des tentatives qu'on s'apprête à ne pas montrer,
   * et annoncerait « 2 tentatives » au-dessus d'un bandeau qui n'en montre qu'une.
   */
  const visibles = sauf === null ? lignes : lignes.filter((l) => l.filId !== sauf);
  const groupes = grouperEnvois(visibles);

  if (groupes.length === 0) return null;

  return (
    <div className="bev-envois" role="status" aria-live="polite">
      <style>{CSS_BANDEAU_ENVOIS}</style>
      {groupes.map(({ ligne: l, nb, ids }) => (
        <p key={l.id} className={`bev-envoi bev-envoi--${tonEtatFile(l.etat)}`}>
          {/* 🔴 LE MOT D'ABORD, toujours : c'est lui qui porte l'état, la couleur ne fait que l'appuyer. Et c'est
              LUI qui porte le nombre — « Non envoyé » lu deux fois ne dit pas « 2 tentatives non envoyées ». */}
          <span className="bev-envoi-mot" title={nb > 1 ? `Tentatives nos ${ids.join(', ')}` : undefined}>
            {motGroupeEnvoi(l.etat, nb)}
          </span>
          <span className="bev-envoi-objet" title={l.objet}>
            {l.objet.trim() === '' ? '(sans objet)' : l.objet}
          </span>
          {l.destinataires.length > 0 && (
            <span className="bev-envoi-dest">à {l.destinataires.join(', ')}</span>
          )}
          {/* La CAUSE, en français, à côté du mot : aller la chercher ailleurs ferait perdre du temps. */}
          {l.etat === 'echec' && l.cause !== null && <span className="bev-envoi-cause">{l.cause}</span>}
          {l.etat === 'echec' && l.brouillonId !== null && onRouvrir && (
            <button type="button" className="gst-lien-bouton" onClick={() => onRouvrir(l.brouillonId as number)}>
              Rouvrir le brouillon
            </button>
          )}
          {/* 🔴 LA PHRASE QUI RASSURE : le travail n'est pas perdu. Sans elle, on rouvre tout pour vérifier. */}
          {l.etat === 'echec' && <span className="bev-envoi-note">Le message est retourné dans les Brouillons.</span>}
        </p>
      ))}
    </div>
  );
}

export const CSS_BANDEAU_ENVOIS = `
.bev-envois{display:flex;flex-direction:column;gap:4px;margin:0 0 8px;min-width:0}
.bev-envoi{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0;padding:6px 10px;font-size:.82rem;
  color:var(--color-svv-ink);background:var(--color-svv-field);border-radius:.4rem;min-width:0}
/* 🔴 Le seul etat ROUGE est celui qui demande un geste. « Envoi en cours » est neutre : il ne dure que quelques
   secondes, et en faire une alerte ferait paraitre anormal le fonctionnement ordinaire. */
.bev-envoi--rouge{border-left:3px solid var(--color-svv-red);background:var(--color-svv-red-soft)}
.bev-envoi-mot{font-weight:700;white-space:nowrap}
.bev-envoi--rouge .bev-envoi-mot{color:var(--color-svv-red)}
.bev-envoi-objet{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:22rem}
.bev-envoi-dest,.bev-envoi-note{color:var(--color-svv-muted)}
.bev-envoi-cause{overflow-wrap:anywhere}
`;
