'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AIDE_MODIFIER, corpsApercu, enTeteApercu, MOT_MODIFIER, motPiecesBrouillon, objetApercu,
  TITRE_APERCU_BROUILLON,
} from '../../../../lib/gestion/apercuBrouillon';
import { taillePourHumain, type PieceBrouillonAffichee } from '../../../../lib/gestion/piecesEnvoi';
import { reprendreBrouillon, type BrouillonEnregistre } from '../../../../lib/gestion/brouillonReprise';
import { CorpsHtmlMail } from './Conversation';

/**
 * ══ 🔴🔴 LOT BROUILLONS-APERCU — VOIR UN BROUILLON TROUVÉ, SANS L'OUVRIR ══════════════════════════════════════
 *
 * CONSTAT D'ARNO (02/10/2026), recherche « cecile thai » : « la carte “Brouillons (3)” liste les brouillons, sans
 * moyen de les voir. »
 *
 * 🔴 LECTURE SEULE, ET AUCUN NOUVEL ÉDITEUR. Cette fenêtre MONTRE : objet, À, Cc, Cci, corps (en HTML, images
 * comprises) et pièces jointes. Pour modifier, elle rend la main à l'éditeur ORDINAIRE — celui du dossier
 * « Brouillons », avec ses règles (envoi bloqué tant que le mail n'est pas classé, pièces, destinataires). Un
 * second éditeur aurait ses propres oublis, et deux fenêtres sur une même ligne finiraient par se manger.
 *
 * 🔴 LE CORPS PASSE PAR `CorpsHtmlMail`, LA VISIONNEUSE DES MAILS. Arno : « dans la même visionneuse que les
 * mails ». Elle porte la lisibilité en thème sombre et l'agrandissement des images au clic ; la recopier ici
 * aurait fait deux règles pour une.
 *
 * ⚠️ RIEN N'EST ÉCRIT, JAMAIS. Cette fenêtre n'émet que deux GET. Elle ne crée pas de brouillon, n'en enregistre
 * aucun, et ne touche pas à `maj_le` — c'est ce qui permet de regarder un brouillon sans le réveiller.
 */
export function ApercuBrouillon({ brouillonId, onFermer, onModifier, onVisualiser }: {
  brouillonId: number;
  /** Fermer et RENDRE LES RÉSULTATS INTACTS : cette fenêtre est posée PAR-DESSUS, elle ne les démonte pas. */
  onFermer: () => void;
  /**
   * 🔴 LE MÊME GESTE QUE DEPUIS LE DOSSIER « BROUILLONS », et c'est l'appelant qui le fournit : un brouillon de
   * réponse s'ouvre dans sa conversation, un message neuf dans sa fenêtre flottante. Écrire ce choix une seconde
   * fois ici le ferait diverger du jour où il changera.
   */
  onModifier: (b: BrouillonEnregistre) => void;
  /** Agrandir une image du corps dans la visionneuse des pièces, quand elle en vient (facultatif). */
  onVisualiser?: (pieceId: number) => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; b: BrouillonEnregistre; pieces: PieceBrouillonAffichee[] } | { v: 'erreur' }>(
      { v: 'charge' });
  const croix = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { croix.current?.focus(); }, []);

  // ÉCHAP FERME, comme toutes les fenêtres du module. `true` à la capture : une fenêtre posée par-dessus répond
  // la première, sinon la liste de dessous recevrait la touche.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [onFermer]);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        /**
         * ⚠️ LES DEUX LECTURES EN PARALLÈLE, et aucune n'est nouvelle : `?id=` sert déjà à rouvrir un brouillon
         * cliqué dans la liste, et `/pieces` à les afficher dans l'éditeur. On n'ajoute aucune porte.
         */
        const [rb, rp] = await Promise.all([
          fetch(`/api/admin/gestion/brouillons?id=${brouillonId}`, { cache: 'no-store' }),
          fetch(`/api/admin/gestion/brouillons/${brouillonId}/pieces`, { cache: 'no-store' }),
        ]);
        if (annule) return;
        if (!rb.ok) { setEtat({ v: 'erreur' }); return; }
        const d = (await rb.json()) as { brouillon?: BrouillonEnregistre | null };
        if (annule) return;
        if (d.brouillon === null || d.brouillon === undefined) { setEtat({ v: 'erreur' }); return; }
        // ⚠️ LES PIÈCES NE FONT PAS ÉCHOUER L'APERÇU : sans la migration 252 la route rend « sans_schema », et
        //   un brouillon sans liste de pièces reste parfaitement lisible.
        const p = rp.ok ? ((await rp.json()) as { pieces?: PieceBrouillonAffichee[] }).pieces ?? [] : [];
        if (!annule) setEtat({ v: 'ok', b: d.brouillon, pieces: p });
      } catch { if (!annule) setEtat({ v: 'erreur' }); }
    })();
    return () => { annule = true; };
  }, [brouillonId]);

  return (
    <div className="apb-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_APERCU_BROUILLON}</style>
      <div className="apb" role="dialog" aria-modal="true" aria-labelledby="apb-titre">
        <header className="apb-tete">
          <h2 className="apb-titre" id="apb-titre">{TITRE_APERCU_BROUILLON}</h2>
          {etat.v === 'ok' && (
            /* 🔴 « MODIFIER » OUVRE L'ÉDITEUR ORDINAIRE, et ferme cet aperçu : laisser les deux ouverts
               montrerait deux états du même brouillon, dont l'un cesserait d'être vrai à la première frappe. */
            <button type="button" className="svv-btn svv-btn-outline apb-modifier" title={AIDE_MODIFIER}
              onClick={() => { const b = etat.b; onFermer(); onModifier(b); }}>
              {MOT_MODIFIER}
            </button>
          )}
          <button ref={croix} type="button" className="apb-croix" onClick={onFermer}
            aria-label="Fermer l’aperçu">×</button>
        </header>

        {etat.v === 'charge' && <p className="gst-vide">Lecture du brouillon…</p>}
        {etat.v === 'erreur' && (
          <p className="gst-vide">Ce brouillon n’a pas pu être lu. Il est peut-être à la corbeille.</p>
        )}
        {etat.v === 'ok' && (
          <>
            <div className="apb-entete">
              <p className="apb-objet">{objetApercu(etat.b)}</p>
              {enTeteApercu(etat.b).map((l) => (
                <p key={l.ligne} className="apb-ligne">
                  <span className="apb-intitule">{l.ligne} :</span>{' '}
                  <span className="apb-valeur">{l.valeur === '' ? '—' : l.valeur}</span>
                </p>
              ))}
            </div>

            <div className="apb-corps">{rendreCorps(etat.b, onVisualiser)}</div>

            <footer className="apb-pied">
              <p className="apb-pieces-titre">
                <span aria-hidden="true">📎</span> {motPiecesBrouillon(etat.pieces.length)}
              </p>
              {etat.pieces.length > 0 && (
                <ul className="apb-pieces">
                  {etat.pieces.map((p) => (
                    <li key={p.id} className="apb-piece">
                      <span className="apb-piece-nom">{p.nom}</span>
                      <span className="apb-piece-taille"> · {taillePourHumain(p.taille)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* ⚠️ LA FENÊTRE DIT CE QU'ELLE NE FAIT PAS. Un aperçu qui ressemble à un éditeur ferait chercher
                  où taper ; celui-ci annonce que rien n'y est modifiable, et où aller pour le faire. */}
              <p className="gst-note apb-note">
                Aperçu en lecture seule : rien n’est modifié ni envoyé d’ici. « {MOT_MODIFIER} » ouvre ce
                brouillon dans l’éditeur habituel.
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * LE CORPS, RENDU COMME DANS UN MAIL.
 *
 * ⚠️ `reprendreBrouillon` EST APPELÉE ICI POUR SA SEULE CITATION EN HTML : c'est elle qui convertit la citation
 * TEXTE de la base en HTML, et c'est exactement ce que l'éditeur fera au moment d'envoyer. Recoller le texte brut
 * dans du HTML ferait lire les « > » de citation comme des balises.
 */
function rendreCorps(b: BrouillonEnregistre, onVisualiser?: (pieceId: number) => void): React.ReactNode {
  const quoi = corpsApercu({ ...b, citationHtml: reprendreBrouillon(b).citationHtml });
  if (quoi.sorte === 'html') return <CorpsHtmlMail html={quoi.html} onVisualiser={onVisualiser} />;
  return <p className="apb-texte">{quoi.texte === '' ? '(message vide)' : quoi.texte}</p>;
}

const CSS_APERCU_BROUILLON = `
.apb-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;
  padding:2vh 2vw;background:rgba(0,0,0,.45)}
.apb{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:10px;width:min(820px,100%);
  height:min(88vh,100%);padding:14px;border:1px solid var(--color-svv-line);border-radius:.8rem;
  background:var(--color-svv-surface);box-shadow:0 18px 50px rgba(0,0,0,.28)}
.apb-tete{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.apb-titre{flex:1 1 12rem;min-width:0;margin:0;font-size:.95rem;font-weight:700;color:var(--color-svv-ink)}
/* 🔴 LA CLASSE .svv-btn PORTE width:100% (feuille globale) : sans ces trois proprietes, « Modifier » prend toute
   la rangee et rejette la croix a la ligne — vu a l'ecran le 02/10/2026. On le ramene a sa taille de contenu, et
   il ne retrecit ni ne s'etire.
   ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral de gabarit, qu'un seul accent grave
   terminerait — piege consigne douze fois dans ce depot, et dans lequel je viens de tomber. */
.apb-modifier{flex:0 0 auto;width:auto;min-height:40px;padding:0 .9rem;font-size:.85rem}
.apb-croix{flex:0 0 auto}
.apb-croix{min-width:44px;min-height:44px;font-size:1.3rem;line-height:1;color:var(--color-svv-ink);
  background:transparent;border:1px solid transparent;border-radius:.5rem;cursor:pointer}
.apb-croix:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.apb-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.apb-entete{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-field)}
.apb-objet{margin:0 0 .3rem;font-size:.9rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.apb-ligne{margin:.15rem 0;font-size:.82rem;overflow-wrap:anywhere}
.apb-intitule{color:var(--color-svv-ink-soft)}
.apb-valeur{color:var(--color-svv-ink)}
.apb-corps{overflow:auto;min-height:0;padding:10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
.apb-texte{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.88rem;color:var(--color-svv-ink)}
.apb-pied{min-width:0}
.apb-pieces-titre{margin:0 0 .3rem;font-size:.82rem;font-weight:600;color:var(--color-svv-ink)}
.apb-pieces{list-style:none;margin:0 0 .4rem;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.apb-piece{padding:3px 8px;border:1px solid var(--color-svv-line);border-radius:.5rem;font-size:.8rem;
  background:var(--color-svv-field);overflow-wrap:anywhere}
.apb-piece-nom{color:var(--color-svv-ink)}
.apb-piece-taille{color:var(--color-svv-ink-soft)}
.apb-note{margin:0}
@media (max-width:640px){
  .apb{width:100%;height:100%;border-radius:0;padding:10px}
  .apb-voile{padding:0}
}
`;
