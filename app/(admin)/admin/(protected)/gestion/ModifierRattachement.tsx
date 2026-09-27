'use client';

import { useState } from 'react';
import { ChoisirCible, CSS_CHOISIR_CIBLE, type CibleChoisie } from './ChoisirCible';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { memeCible } from '../../../../lib/gestion/rattachement';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';

/**
 * LOT FIL-LECTURE-2 — MODIFIER UN RATTACHEMENT : d'abord COMPRENDRE, ensuite CHANGER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI UNE FENÊTRE ET PAS UN CHAMP DE PLUS DANS LE BANDEAU. Changer un rattachement, c'est décider que ce mail
 * ne parle pas du logement qu'on croyait. Avant de décider, il faut voir CE QUI A JUSTIFIÉ le lien actuel : la règle
 * qui l'a posé, les adresses qu'elle a reconnues, qui l'a touché et quand. Ces renseignements existaient en base
 * depuis la migration 257 et n'étaient affichés nulle part — on modifiait à l'aveugle, ou on ne modifiait pas.
 *
 * 🔴 RIEN N'EST APPLIQUÉ SANS VALIDATION, et « Valider » reste ÉTEINT tant que rien n'a changé. Une fenêtre qui peut
 * être ouverte par curiosité ne doit pas pouvoir écrire par inadvertance.
 *
 * 🔴 REMPLACER, C'EST DEUX GESTES QUI EXISTENT DÉJÀ, dans cet ordre : l'ancien lien passe à « retiré » (il n'est
 * JAMAIS supprimé, il reste consultable et remettable), puis le nouveau est posé à la main — donc origine
 * « manuel », statut « confirmé ». Les deux routes journalisent en append-only avec l'auteur connecté ; on n'écrit
 * pas une troisième façon de faire la même chose.
 *
 * ⚠️ L'ORDRE COMPTE, ET DANS CE SENS-LÀ. Retirer d'abord : si la pose échoue, on se retrouve avec un mail sans
 * rattachement — visible, et rattrapable d'un clic (« Remettre »). Poser d'abord et rater le retrait laisserait DEUX
 * rattachements contradictoires, que personne ne remarquerait.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ModifierRattachement({ lien, messageId, onFait, onAnnuler, onGeste }: {
  lien: LienAffiche;
  messageId: number;
  /** Le remplacement a abouti : l'appelant recharge les liens de la conversation. */
  onFait: () => void | Promise<void>;
  onAnnuler: () => void;
  onGeste?: (message: string) => void;
}) {
  const [cible, setCible] = useState<CibleChoisie | null>(null);
  const [choisir, setChoisir] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * 🔴 RIEN N'A CHANGÉ ⇒ RIEN À VALIDER. C'est la garantie qui rend la fenêtre consultable sans risque.
   *
   * ⚠️ `memeCible` ET NON `!==`. Deux cibles identiques sont deux OBJETS distincts : comparer les références
   * rendait « Valider » actif dès qu'on rouvrait le sélecteur pour rechoisir la même cible — la fenêtre aurait
   * alors retiré puis reposé le même rattachement, en écrivant deux lignes de journal pour rien. `memeCible`
   * compare la sorte, la clé et l'identifiant, c'est-à-dire ce qui fait qu'une cible EST une cible.
   */
  const modifiable = cible !== null && !memeCible(cible.cible, lien.cible);

  const valider = async () => {
    if (cible === null) return;
    setOccupe(true);
    setErreur(null);
    try {
      // ① L'ANCIEN PASSE À « RETIRÉ ». Jamais supprimé : il reste dans la table, daté et signé, et « Remettre » le
      //    ramène. Le motif dit POURQUOI, pour qui relira le journal dans six mois.
      const retrait = await fetch('/api/admin/gestion/rattachements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lienId: lien.id, statut: 'retire', motif: `remplacé par ${cible.libelle}` }),
      });
      const dr = (await retrait.json()) as { ok?: boolean; erreur?: string };
      if (!retrait.ok || dr.ok !== true) { setErreur(dr.erreur ?? 'Le retrait n’a pas abouti.'); return; }

      // ② LE NOUVEAU EST POSÉ À LA MAIN. La route lui donne origine « manuel » et statut « confirmé », et
      //    journalise — c'est exactement le geste de « + Rattacher à… », avec un motif qui dit d'où il vient.
      const pose = await fetch('/api/admin/gestion/rattachements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, cible: cible.cible, motif: `remplace ${lien.libelle}` }),
      });
      const dp = (await pose.json()) as { ok?: boolean; erreur?: string };
      if (!pose.ok || dp.ok !== true) {
        // Le retrait, lui, a eu lieu : on le DIT, plutôt que de laisser croire que rien n'a bougé.
        setErreur(`${dp.erreur ?? 'Le nouveau rattachement n’a pas pu être posé.'} L’ancien a été retiré : ` +
          'servez-vous de « Remettre » pour revenir en arrière.');
        await onFait();
        return;
      }
      onGeste?.(`Rattachement modifié : ${lien.libelle} → ${cible.libelle}`);
      await onFait();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onAnnuler(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>
      {/* ⚠️ `aria-modal` ET un titre NOMMÉ : sans les deux, un lecteur d'écran continue de lire la page derrière. */}
      <div className="mrt" role="dialog" aria-modal="true" aria-labelledby="mrt-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onAnnuler(); } }}>
        <h2 className="mrt-titre" id="mrt-titre">Modifier le rattachement</h2>

        {/* ══ CE QU'ON SAIT DU LIEN ACTUEL — la moitié de l'intérêt de cette fenêtre ══════════════════════════════
            Chaque ligne n'apparaît que si elle a quelque chose à dire : une fiche à moitié vide se lit moins bien
            qu'une fiche courte. */}
        <dl className="mrt-fiche">
          <Ligne intitule="Type" valeur={motSorteLong(lien.cible.sorte)} />
          <Ligne intitule="Cible" valeur={lien.libelle} fort />
          <Ligne intitule="Origine" valeur={lien.origine === 'manuel' ? 'posé à la main' : 'posé automatiquement'} />
          <Ligne intitule="Statut" valeur={motStatut(lien.statut)} />
          {lien.regle && <Ligne intitule="Règle" valeur={lien.regle} />}
          {lien.motif && <Ligne intitule="Motif" valeur={lien.motif} />}
          {lien.adresses.length > 0 && <Ligne intitule="Adresses" valeur={lien.adresses.join(', ')} />}
          {lien.confiance && <Ligne intitule="Confiance" valeur={lien.confiance} />}
          {lien.creeLe && (
            <Ligne intitule="Posé le" valeur={`${dateHeureComplete(lien.creeLe)} · ${lien.creePar ?? 'automatique'}`} />
          )}
          {lien.statutLe && (
            <Ligne intitule="Statut modifié" valeur={`${dateHeureComplete(lien.statutLe)} · ${lien.statutPar ?? 'automatique'}`} />
          )}
          {lien.pieceId !== null && <Ligne intitule="Portée" valeur="cette pièce jointe seulement" />}
        </dl>

        {/* ══ LE REMPLACEMENT ═══════════════════════════════════════════════════════════════════════════════════
            La MÊME recherche que « + Rattacher à… » — annuaire, logements, propriétaires, événements. Le TYPE se
            change en choisissant une cible d'une autre sorte : il n'y a pas deux façons de désigner une cible, il
            n'y a donc pas deux sélecteurs. */}
        {choisir ? (
          <ChoisirCible titre="Remplacer par…"
            onAnnuler={() => setChoisir(false)}
            onValider={(choix) => {
              // Une seule cible remplace une seule cible. Le sélecteur en accepte plusieurs (il sert aussi à
              //   « + Rattacher à… ») : ici on garde la première, et le reste n'aurait pas de sens.
              if (choix.length > 0) setCible(choix[0]);
              setChoisir(false);
            }} />
        ) : (
          <p className="mrt-nouvelle">
            <span className="mrt-intitule">Remplacer par</span>
            {cible === null
              ? <span className="mrt-rien">rien choisi — le rattachement ne changera pas</span>
              : <span className="mrt-cible">{motSorteLong(cible.cible.sorte)} · {cible.libelle}</span>}
            <button type="button" className="gst-lien-bouton" disabled={occupe} onClick={() => setChoisir(true)}>
              {cible === null ? 'Choisir une autre cible…' : 'Choisir une autre cible'}
            </button>
          </p>
        )}

        {/* Ce que la validation VA faire, écrit avant de la faire : personne ne doit découvrir l'effet après coup. */}
        {modifiable && (
          <p className="mrt-effet">
            À la validation : « {lien.libelle} » passera au statut <strong>retiré</strong> (il restera consultable et
            pourra être remis), et « {cible.libelle} » sera posé au statut <strong>confirmé</strong>, origine
            <strong> manuel</strong>. Les deux gestes seront écrits dans le journal, à votre nom.
          </p>
        )}

        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onAnnuler}>
            Annuler
          </button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            disabled={occupe || !modifiable} onClick={() => void valider()}>
            {occupe ? 'Modification…' : 'Valider la modification'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Une ligne de la fiche : intitulé à gauche, valeur à droite, sur UNE ligne. */
function Ligne({ intitule, valeur, fort = false }: { intitule: string; valeur: string; fort?: boolean }) {
  return (
    <div className="mrt-ligne">
      <dt>{intitule}</dt>
      <dd className={fort ? 'mrt-fort' : undefined}>{valeur}</dd>
    </div>
  );
}

/** Le mot du type, en toutes lettres. PUR. */
export function motSorteLong(s: 'lot' | 'proprietaire' | 'evenement'): string {
  if (s === 'lot') return 'Logement';
  if (s === 'proprietaire') return 'Propriétaire';
  return 'Événement';
}

/** Le mot du statut, en toutes lettres — jamais un code de base de données à l'écran. PUR. */
export function motStatut(s: string): string {
  if (s === 'confirme') return 'confirmé';
  if (s === 'propose') return 'proposé, à trancher';
  if (s === 'retire') return 'retiré';
  if (s === 'rejete') return 'rejeté';
  return s;
}

/**
 * ⚠️ EXPORTÉE DEPUIS LE LOT BARRE-STATUT : la fenêtre « Visualiser / Modifier » (`RattachementsDuFil`) réutilise le
 * MÊME voile et la MÊME boîte. Recopier ces règles ailleurs aurait donné deux fenêtres qui se ressemblent presque,
 * et qui divergeraient au premier ajustement.
 */
export const CSS_MODIFIER_RATTACHEMENT = `
/* Le voile : il ferme au clic à côté, comme toutes les fenêtres du module. Le contenu défile si l'écran est court —
   une fenêtre plus haute que l'écran cacherait ses propres boutons. */
.mrt-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45)}
.mrt{width:min(42rem,100%);max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:.7rem;
  padding:16px;border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 12px 40px rgba(17,19,24,.25)}
.mrt-titre{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink)}
.mrt-fiche{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);font-size:.82rem}
.mrt-ligne{display:flex;align-items:baseline;gap:.5rem;margin:0 0 .2rem}
.mrt-ligne:last-child{margin-bottom:0}
.mrt-fiche dt{flex:0 0 7.5rem;font-weight:700;color:var(--color-svv-muted)}
.mrt-fiche dt::after{content:' :'}
.mrt-fiche dd{flex:1 1 auto;margin:0;min-width:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mrt-fort{font-weight:700}
.mrt-nouvelle{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;margin:0;font-size:.85rem}
.mrt-intitule{font-weight:700;color:var(--color-svv-muted)}
.mrt-rien{font-style:italic;color:var(--color-svv-muted)}
.mrt-cible{font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mrt-effet{margin:0;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-line);
  font-size:.78rem;line-height:1.45;color:var(--color-svv-ink)}
.mrt-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.mrt .gst-lien-bouton{min-height:44px}
`;
