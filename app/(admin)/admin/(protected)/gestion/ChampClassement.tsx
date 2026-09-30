'use client';

import { useState } from 'react';
import { ChoisirCible, CSS_CHOISIR_CIBLE, type CibleChoisie } from './ChoisirCible';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';

/**
 * LOT REDACTION-GMAIL — « CLASSER CE MAIL », PENDANT QU'ON L'ÉCRIT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI PENDANT L'ÉCRITURE, ET PAS APRÈS. Un mail ENVOYÉ par nous n'a, par construction, aucun expéditeur à
 * reconnaître : le moteur de rattachement automatique ne peut rien en faire, et il part donc « à classer » — pour y
 * rester, puisque personne ne relit ses propres envois. C'est exactement le moment où l'on SAIT de quoi le message
 * parle : on est en train de l'écrire.
 *
 * 🔴 NOUVEAU MESSAGE SANS HISTORIQUE UNIQUEMENT (demande d'Arno). Une réponse hérite du classement de son échange ;
 * reproposer le geste donnerait deux vérités sur la même conversation, et rien ne dirait laquelle est la bonne.
 * C'est l'appelant qui applique cette règle — ce composant ne s'affiche que là où il a un sens.
 *
 * 🔴 CE QUI EST CHOISI ICI DEVIENT, À L'ENVOI, UN RATTACHEMENT MANUEL CONFIRMÉ du message envoyé — donc une capsule
 * verte « Classé » sur la ligne, et une ligne de journal à votre nom. « Manuel », parce qu'un humain a tranché ;
 * « confirmé », parce qu'il n'y a rien à valider après coup quand c'est l'auteur lui-même qui l'a dit.
 *
 * ⚠️ IL RÉUTILISE `ChoisirCible` TEL QUEL — la recherche de l'annuaire, la même partout. Écrire un second sélecteur
 * donnerait deux comportements pour une seule question.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ChampClassement({ cibles, onChange, onRouvrir, interne = false, onInterne }: {
  cibles: readonly CibleBrouillon[];
  onChange: (c: CibleBrouillon[]) => void;
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — ROUVRIR LA MODALE « Rattacher ce mail à… ». Demande d'Arno : « Elle se rouvre
   * à la demande depuis “Classer ce mail” ». Absent ⇒ aucun bouton : c'est le cas tant qu'aucun destinataire
   * n'est validé, puisque le moteur n'aurait alors rien à déduire.
   */
  onRouvrir?: () => void;
  /** 🔴 « Interne » a-t-il été choisi pour ce brouillon ? Il s'affiche ICI, comme les biens : une seule vérité. */
  interne?: boolean;
  /** Retirer le choix « interne ». Absent ⇒ il s'affiche sans pouvoir se défaire d'ici. */
  onInterne?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);

  const ajouter = (choix: CibleChoisie[]) => {
    const suite = [...cibles];
    for (const c of choix) {
      const n: CibleBrouillon = {
        sorte: c.cible.sorte as CibleBrouillon['sorte'],
        cle: c.cible.cle ?? null,
        id: c.cible.id ?? null,
        libelle: c.libelle,
      };
      // ⚠️ JAMAIS DEUX FOIS LA MÊME : recocher une cible déjà choisie ne doit pas la doubler dans le message.
      if (!suite.some((x) => memeCibleBrouillon(x, n))) suite.push(n);
    }
    onChange(suite);
    setOuvert(false);
  };

  return (
    <div className="ccl">
      <style>{CSS_CHOISIR_CIBLE}</style>
      <span className="red-label" id="ccl-label">Classer ce mail</span>

      {/* ══ 🔴 LOT RATTACHER-EN-ECRIVANT — « INTERNE » S'AFFICHE ICI COMME LES BIENS ════════════════════════
          Une seule vérité sous « Classer ce mail » : ce qui a été décidé pour ce message, quoi que ce soit. Le
          cacher ici aurait fait croire, en relisant le brouillon, qu'aucune réponse n'avait été donnée. */}
      {interne && (
        <p className="ccl-interne">
          <span className="ccl-interne-capsule">Interne</span>
          {' '}Échange entre collègues — aucun bien ne sera rattaché, et la conversation portera ce statut.
          {onInterne && (
            <>
              {' '}
              <button type="button" className="gst-lien-bouton" onClick={onInterne}>Retirer</button>
            </>
          )}
        </p>
      )}

      {cibles.length === 0 && !interne ? (
        <p className="ccl-rien">
          Aucun classement — ce message partira « à classer ».{' '}
          {onRouvrir && (
            <>
              <button type="button" className="gst-lien-bouton" onClick={onRouvrir}>
                Rattacher ce mail à…
              </button>
              {' · '}
            </>
          )}
          <button type="button" className="gst-lien-bouton" onClick={() => setOuvert(true)}>
            Choisir un logement, un propriétaire ou un locataire…
          </button>
        </p>
      ) : cibles.length === 0 ? null : (
        <>
          <ul className="ccl-liste" aria-labelledby="ccl-label">
            {cibles.map((c) => (
              <li key={`${c.sorte}|${c.cle ?? ''}|${c.id ?? 0}`} className="ccl-pastille">
                <span className="ccl-sorte">{motSorte(c.sorte)}</span>
                <span className="ccl-nom">{c.libelle}</span>
                {/* Le « × » est visible EN PERMANENCE, jamais au survol : au doigt, le survol n'existe pas. */}
                <button type="button" className="ccl-retirer" aria-label={`Retirer ${c.libelle}`}
                  onClick={() => onChange(cibles.filter((x) => !memeCibleBrouillon(x, c)))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="ccl-note">
            À l’envoi, ce message sera rattaché à {cibles.length === 1 ? 'cette cible' : `ces ${cibles.length} cibles`}
            {' '}— rattachement posé à la main, confirmé, à votre nom.{' '}
            <button type="button" className="gst-lien-bouton" onClick={() => setOuvert(true)}>Ajouter…</button>
            {onRouvrir && (
              <>
                {' · '}
                <button type="button" className="gst-lien-bouton" onClick={onRouvrir}>Modifier</button>
              </>
            )}
          </p>
        </>
      )}

      {ouvert && (
        <ChoisirCible titre="Classer ce mail dans…"
          dejaLa={cibles.map((c) => ({ sorte: c.sorte, cle: c.cle, id: c.id })) as never}
          onAnnuler={() => setOuvert(false)}
          onValider={ajouter} />
      )}
    </div>
  );
}

/**
 * Le mot de la sorte, écrit en toutes lettres — jamais une couleur ni une icône seule. PUR.
 *
 * 🔴 LOT FICHE-RATTACHEMENT — « Propriétaire » et « Locataire » ont disparu d'ici parce qu'elles ont disparu du
 * TYPE : un mail ne se classe plus chez une personne. Les deux branches n'étaient pas mortes par hasard, elles
 * l'étaient par décision, et TypeScript l'a dit à la compilation.
 */
function motSorte(s: CibleBrouillon['sorte']): string {
  return s === 'lot' ? 'Logement' : 'Événement';
}

export const CSS_CHAMP_CLASSEMENT = `
.ccl{display:flex;flex-direction:column;gap:4px;min-width:0}
.ccl-rien,.ccl-note{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
/* LOT RATTACHER-EN-ECRIVANT — la reponse « Interne », affichee comme les biens : une seule verite sous ce titre. */
.ccl-interne{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.ccl-interne-capsule{display:inline-block;padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;
  color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.ccl-liste{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.ccl-pastille{display:inline-flex;align-items:center;gap:.35rem;max-width:100%;padding:.15rem .2rem .15rem .5rem;
  font-size:.8rem;color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);border-radius:999px;
  min-width:0}
.ccl-sorte{font-weight:700;font-size:.7rem;letter-spacing:.03em;text-transform:uppercase}
.ccl-nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccl-retirer{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0;
  font:inherit;font-size:1rem;line-height:1;color:inherit;background:transparent;border:0;border-radius:50%;
  cursor:pointer}
.ccl-retirer:hover{background:color-mix(in srgb, var(--color-svv-ink) 8%, transparent)}
.ccl-retirer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
`;
