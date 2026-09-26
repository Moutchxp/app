'use client';

import { useState } from 'react';
import { ChoisirCible, CSS_CHOISIR_CIBLE, type CibleChoisie } from './ChoisirCible';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
import type { Statut } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-1 — « RATTACHÉ À … », DANS CHAQUE MAIL OUVERT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND, EN UNE LIGNE : « ce mail parle du logement 4 rue X et de son propriétaire ». C'est la question
 * qu'on se pose en classant, et celle à laquelle il faudra répondre pour reconstituer l'historique d'un logement.
 *
 * 🔴 IL MONTRE AUSSI LES PROPOSITIONS, séparément, avec leurs deux gestes. Un candidat qu'on ne voit pas est un
 * candidat qui ne sera jamais arbitré — et la file de tri ne suffit pas : c'est en lisant le mail qu'on tranche.
 *
 * 🔴 TOUT EST RÉVERSIBLE, ET LE BANDEAU LE DIT. « Retirer » ne supprime rien : le lien change d'état, daté et signé,
 * et la mention « Remettre » apparaît. Ce qui se fait d'un clic se défait d'un clic.
 *
 * ⚠️ IL NE S'AFFICHE QU'AVEC QUELQUE CHOSE À DIRE OU À FAIRE. Migration 257 absente, ou réponse en échec : le parent
 * ne lui passe rien et il ne rend rien — surtout pas une erreur rouge au-dessus d'un mail, qui ferait croire que le
 * mail lui-même a un problème. Quand il n'y a ni lien ni candidat, il reste UNE ligne : le bouton « Rattacher à… ».
 * C'est le seul endroit d'où l'on puisse rattacher un mail qu'aucune adresse ne désigne — il ne peut pas disparaître.
 *
 * 🔴 IL NE CHARGE RIEN LUI-MÊME. Les liens lui sont DONNÉS par la conversation, qui les demande UNE FOIS pour tous
 * ses messages (`?messages=1,2,3`). Un échange porte parfois trente mails : trente requêtes se verraient à l'écran.
 * Après un geste, il appelle `onChange` — c'est la conversation qui recharge, une fois, pour tout le monde.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function EncartRattachement({ messageId, liens, onChange, onGeste }: {
  messageId: number;
  /** Les liens vivants de CE mail, chargés par la conversation. `null` = migration 257 absente ou lecture en échec. */
  liens: readonly LienAffiche[] | null;
  /** Recharge les liens de toute la conversation. Appelé après chaque geste réussi. */
  onChange: () => void | Promise<void>;
  /** Prévient l'écran parent qu'un geste a eu lieu, pour son compte rendu. */
  onGeste?: (message: string) => void;
}) {
  const [ajout, setAjout] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Les liens défaits pendant cette visite : on garde le bouton « Remettre » sous la main, sans recharger. */
  const [defaits, setDefaits] = useState<Map<number, LienAffiche>>(new Map());

  const agir = async (corps: Record<string, unknown>, methode: 'POST' | 'PATCH', dit: string): Promise<boolean> => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/rattachements', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return false; }
      onGeste?.(dit);
      await onChange();
      return true;
    } catch {
      setErreur('Le serveur n’a pas répondu.');
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const changer = async (lien: LienAffiche, statut: Statut, dit: string): Promise<void> => {
    const fait = await agir({ lienId: lien.id, statut }, 'PATCH', dit);
    if (!fait) return;
    setDefaits((m) => {
      const n = new Map(m);
      if (statut === 'retire' || statut === 'rejete') n.set(lien.id, lien); else n.delete(lien.id);
      return n;
    });
  };

  if (liens === null) return null;

  const vivants = liens.filter((l) => l.statut === 'confirme');
  const candidats = liens.filter((l) => l.statut === 'propose');
  const remettables = [...defaits.values()].filter((l) => !liens.some((x) => x.id === l.id));

  return (
    <div className="ert" role="group" aria-label="Rattachements de ce mail">
      <style>{CSS_ENCART_RATTACHEMENT}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>

      <div className="ert-tete">
        <span className="ert-titre">Rattaché à</span>
        {vivants.length === 0 && <span className="ert-vide">rien pour l’instant</span>}
      </div>

      {vivants.length > 0 && (
        <ul className="ert-liste">
          {vivants.map((l) => (
            <li key={l.id} className="ert-ligne">
              <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
              <span className="ert-nom">{l.libelle}</span>
              {/* D'OÙ VIENT LE LIEN, écrit : le moteur peut se tromper, une personne engage sa décision. */}
              <span className="ert-source">{l.parUnHumain ? 'à la main' : 'automatique'}</span>
              {l.pieceId !== null && <span className="ert-source">cette pièce seulement</span>}
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void changer(l, 'retire', `Rattachement retiré : ${l.libelle}`)}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidats.length > 0 && (
        <>
          <p className="ert-sous-titre">
            {candidats.length === 1 ? 'Une proposition à trancher' : `${candidats.length} propositions à trancher`}
          </p>
          <ul className="ert-liste">
            {candidats.map((l) => (
              <li key={l.id} className="ert-ligne ert-ligne--propose">
                <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
                <span className="ert-nom">{l.libelle}</span>
                {/* POURQUOI ce candidat : sans le motif, on ne peut pas trancher sans rouvrir le code. */}
                {l.motif && <span className="ert-motif">{l.motif}</span>}
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
                  onClick={() => void changer(l, 'confirme', `Rattachement confirmé : ${l.libelle}`)}>
                  Confirmer
                </button>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => void changer(l, 'rejete', `Proposition rejetée : ${l.libelle}`)}>
                  Rejeter
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* CE QU'ON VIENT DE DÉFAIRE, remis d'un clic. Rien n'a été supprimé : c'est le même lien qui revient. */}
      {remettables.length > 0 && (
        <ul className="ert-liste ert-liste--defaits">
          {remettables.map((l) => (
            <li key={l.id} className="ert-ligne">
              <span className="ert-defait">Retiré · {l.libelle}</span>
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void changer(l, l.statut === 'propose' ? 'propose' : 'confirme',
                  `Rattachement remis : ${l.libelle}`)}>
                Remettre
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

      {ajout ? (
        <ChoisirCible titre="Rattacher ce mail à…"
          dejaLa={[...vivants, ...candidats].map((l) => l.cible)}
          onAnnuler={() => setAjout(false)}
          onValider={async (choix: CibleChoisie[]) => {
            let faits = 0;
            for (const c of choix) {
              // UN PAR UN, et non en lot : si le troisième échoue, les deux premiers restent posés — c'est ce qu'on
              //   veut. Un envoi groupé qui échoue en bloc perdrait un travail de saisie déjà fait.
              const ok = await agir({ messageId, cible: c.cible }, 'POST', `Rattaché à ${c.libelle}`);
              if (ok) faits += 1;
            }
            if (faits > 0) setAjout(false);
          }} />
      ) : (
        <button type="button" className="gst-lien-bouton ert-ajouter" disabled={occupe}
          onClick={() => setAjout(true)}>
          + Rattacher à…
        </button>
      )}
    </div>
  );
}

/** Le mot de la sorte, écrit en toutes lettres. PUR. */
export function motSorte(s: 'lot' | 'proprietaire' | 'evenement'): string {
  if (s === 'lot') return 'Logement';
  if (s === 'proprietaire') return 'Propriétaire';
  return 'Événement';
}

export const CSS_ENCART_RATTACHEMENT = `
/* Un encart de RENSEIGNEMENT, jamais une alerte. La sorte est écrite, l'origine aussi : rien ne tient à une couleur.
   Mobile d'abord : chaque ligne s'enroule, les boutons font au moins 44 px de haut. */
.ert{display:flex;flex-direction:column;gap:.35rem;margin:.6rem 0;padding:10px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field);overflow-wrap:anywhere}
.ert-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem}
.ert-titre{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ert-vide{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-sous-titre{margin:.3rem 0 0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted)}
.ert-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.ert-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.85rem;color:var(--color-svv-ink);
  line-height:1.5;padding:2px 0}
.ert-ligne--propose{padding:4px 6px;border-radius:8px;border:1px dashed var(--color-svv-line)}
.ert-liste--defaits{opacity:.75}
.ert-sorte{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.ert-nom{font-weight:700}
.ert-source,.ert-motif{font-size:.74rem;color:var(--color-svv-muted)}
.ert-motif{font-style:italic}
.ert-defait{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-ajouter{align-self:flex-start}
.ert .gst-lien-bouton{min-height:44px}
`;
