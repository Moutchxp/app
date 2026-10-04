'use client';

import { useEffect, useState } from 'react';
import { CSS_PIECES, PiecesJointes } from './PiecesJointes';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — « voir dans Gmail » sur une piece non conservee.
import { lienGmail, COMPTE_GESTION_DEFAUT } from '../../../../lib/gestion/gmailMenu';
import { dateHeureCourte, formaterTaille, libelleSens } from '../../../../lib/gestion/ecran';
import { corpsLisible, etatTrombone, motTrombone, trierPieces } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { motCapsule, tonCapsule, type CapsuleStatut } from '../../../../lib/gestion/statutClassement';
// 🔴🔴 LOT CONTACTS-EXTERNES — le mot du rôle instantané, écrit UNE fois dans le module PUR.
import { motRoleInstantane } from '../../../../lib/gestion/contactExterne';
import type { LigneHistorique } from '../../../../lib/gestion/historique';
/* 🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — le découpage des mots surlignés vit dans le module PUR : il est
   éprouvé sans écran, et il ne rend jamais de HTML. */
import { decouperPourSurligner } from '../../../../lib/gestion/historiqueBien';

/**
 * LOT FICHES-ANNUAIRE (étape B) — « LA VIE DU BIEN » : TOUS SES MAILS, DANS LA FICHE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEMANDE D'ARNO, MOT POUR MOT : « VIE DU BIEN : tous les mails rattachés à ce bien, en ordre
 * antéchronologique, dans le même format de ligne que la boîte (capsules, trombone gris/noir, triangle ▶/▼,
 * dépliable sur place). Avec leurs pièces jointes (œil Visualiser, lien Drive) et leurs événements. Filtres
 * simples : Tous / avec pièces jointes / avec événement ouvert, plus une recherche. »
 *
 * 🔴 « LE MÊME FORMAT DE LIGNE QUE LA BOÎTE » N'EST PAS UNE RESSEMBLANCE : ce sont les MÊMES fonctions pures qui
 * décident. `capsuleStatut` pour la capsule, `etatTrombone`/`motTrombone` pour le trombone, `trierPieces` pour ce
 * qui compte comme pièce. En réécrire une seule ici donnerait, un jour, deux verdicts pour un même mail — et c'est
 * celui qu'on regarde le moins qui garderait l'erreur.
 *
 * 🔴 LE TROMBONE DIT OÙ EST LA PIÈCE, comme dans la boîte : NOIR quand elle est dans CE mail, GRIS quand elle est
 * ailleurs dans la conversation. Ici chaque ligne EST un mail, donc « ailleurs » ne se pose pas — mais la règle
 * passe par la même fonction, et l'info-bulle dit laquelle des deux en toutes lettres.
 *
 * ⚠️ LES PIÈCES SONT RENDUES PAR `PiecesJointes`, LE COMPOSANT EXISTANT — miniature, œil « Visualiser »,
 * « Télécharger », « Drive ». On n'en écrit pas un second.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — OÙ CE BLOC EST SUPPRIMÉ, ET OÙ IL RESTE LE SEUL LISTING ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD EXPLICITE D'ARNO, 04/10/2026, mot pour mot : « le bloc “Vie du bien” est SUPPRIMÉ (deux listings de
 * mails, c'est un de trop). Le moteur de recherche prend SA PLACE (**juste sous “Historique des locataires”**). »
 *
 * 🔴 CET ACCORD PORTE SUR LA FICHE D'UN **BIEN**, ET SUR ELLE SEULE — « juste sous Historique des locataires » est
 * une place qui n'existe que là. C'est là qu'il y avait DEUX listings de mails (celui-ci et le moteur), et c'est
 * ce doublon qui est supprimé : `VueLot` ne monte plus ce composant, le moteur occupe son rang et son ancre.
 *
 * 🔴 SUR LA FICHE D'UN **LOCATAIRE**, IL EST LE SEUL LISTING, ET IL RESTE. `VueLocataire` le monte pour montrer
 * « les échanges de SON logement » — il n'y a là aucun doublon, donc rien de ce qu'Arno a motivé. Le retirer
 * aurait supprimé une fonctionnalité qu'il n'a pas ouverte, ce que la consigne permanente interdit en toutes
 * lettres : « Hors de “Vie du bien” (accord donné), ne retire, ne masque et ne conditionne aucune fonctionnalité
 * sans l'accord d'Arno. » 🔭 **Question posée à Arno** : veut-il le moteur là aussi, ou ce listing tel quel ?
 *
 * 🔴 ET CE FICHIER PORTE CE QUE LE MOTEUR RÉUTILISE. `LigneVie` est LA ligne de courrier du moteur (« reçu de… » /
 * « nous avons écrit… », capsules, trombone, date, triangle ▸, dépliage sur place), et `CSS_VIE_DU_BIEN` son
 * style, qu'emporte `CSS_HISTORIQUE_DU_BIEN`. Les déménager aurait été une recopie déguisée — même code, nouvel
 * endroit, deux historiques de modification à relire le jour d'un défaut.
 *
 * ⚠️ CE QUE LE MOTEUR A REPRIS, UN À UN, pour que « rien n'est perdu » soit vérifiable et non promis :
 *   · la recherche « dans l'objet et le texte » → `Reglages.texte` + le champ du pavé OPTIONS ;
 *   · le filtre « Avec pièces jointes »        → `Reglages.pieces`, avec son complément « Sans pièce jointe » ;
 *   · le filtre « Avec événement ouvert »      → `Reglages.evenementOuvert` + son bouton, et le cartouche y
 *                                                 arrive DÉJÀ allumé (`evenementOuvertInitial`) ;
 *   · le dépliage par le triangle ▸            → `LigneVie`, inchangée ;
 *   · la sélection d'un mail                   → `onOuvrirFil`, passée telle quelle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** Les trois filtres d'Arno, et rien de plus : un filtre qu'on n'utilise pas est un filtre qu'on relit. */
export type FiltreVie = 'tous' | 'pieces' | 'evenement';

export const FILTRES_VIE: { cle: FiltreVie; mot: string }[] = [
  { cle: 'tous', mot: 'Tous' },
  { cle: 'pieces', mot: 'Avec pièces jointes' },
  { cle: 'evenement', mot: 'Avec événement ouvert' },
];

type Etat =
  | { v: 'charge' }
  | { v: 'erreur'; message: string }
  | { v: 'ok'; lignes: LigneHistorique[]; suite: boolean; total: number };

/** Le temps de silence après la dernière frappe avant d'interroger : assez court pour paraître instantané. */
const ATTENTE_FRAPPE_MS = 250;

export function VieDuBien({ lotCle, maintenant, onOuvrirFil, filtreInitial = 'tous' }: {
  /** La clé WIPPIMMO du lot — la cible de l'historique, et la seule identité qui survive à un ré-import. */
  lotCle: string;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * 🔴 LOT FICHES-RETOUCHES-2 — LE FILTRE DE DÉPART. Le cartouche « Événement en cours » d'une carte de bien mène
   * ici avec `'evenement'` : on arrive sur les échanges qui portent un événement ouvert, et non sur la liste
   * entière qu'il faudrait filtrer soi-même.
   *
   * ⚠️ C'EST UN DÉPART, PAS UNE CONTRAINTE : les trois filtres restent cliquables, et le premier clic reprend la
   * main. Un filtre imposé ferait croire que le bien n'a que ces échanges-là.
   */
  filtreInitial?: FiltreVie;
}) {
  const [filtre, setFiltre] = useState<FiltreVie>(filtreInitial);
  const [texte, setTexte] = useState('');
  const [page, setPage] = useState(0);
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [deplie, setDeplie] = useState<Set<number>>(new Set());

  /**
   * ⚠️ TOUT CHANGEMENT DE FILTRE REMET À LA PREMIÈRE PAGE. Sans cela, filtrer depuis la page 3 afficherait « rien
   * à voir » sur un résultat qui en a douze — et l'on croirait le filtre vide.
   */
  useEffect(() => { setPage(0); }, [filtre, texte]);

  useEffect(() => {
    let vivant = true;
    setEtat((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    const minuterie = setTimeout(() => {
      void (async () => {
        try {
          const p = new URLSearchParams({ cible: `lot-${lotCle}`, taille: '25', page: String(page) });
          if (filtre === 'pieces') p.set('pieces', 'avec');
          if (filtre === 'evenement') p.set('evt', 'ouvert');
          if (texte.trim() !== '') p.set('q', texte.trim());
          const res = await fetch(`/api/admin/gestion/historique?${p}`, { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string;
            data?: { lignes?: LigneHistorique[]; suite?: boolean; entete?: { nbMails?: number } };
          };
          if (!vivant) return;
          if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: 'La vie du bien n’a pas pu être lue.' }); return; }
          setEtat({
            v: 'ok', lignes: d.data?.lignes ?? [], suite: d.data?.suite === true,
            total: d.data?.entete?.nbMails ?? 0,
          });
        } catch {
          if (vivant) setEtat({ v: 'erreur', message: 'La vie du bien n’a pas pu être lue : le serveur n’a pas répondu.' });
        }
      })();
    }, texte.trim() === '' ? 0 : ATTENTE_FRAPPE_MS);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [lotCle, filtre, texte, page]);

  return (
    <section className="ann-bloc" aria-labelledby="ann-vie">
      <style>{CSS_PIECES}</style>
      <h4 className="ann-bloc-titre" id="ann-vie">
        Vie du bien
        {etat.v === 'ok' && <span className="gst-compte">{etat.total}</span>}
      </h4>

      {/* ══ LES FILTRES — trois boutons et une recherche. Le filtre actif est dit par `aria-pressed` ET par son
          aspect : une couleur seule ne dirait pas lequel est allumé à qui ne la voit pas. */}
      <div className="vdb-filtres" role="group" aria-label="Filtrer la vie du bien">
        {FILTRES_VIE.map((f) => (
          <button key={f.cle} type="button" aria-pressed={filtre === f.cle}
            className={`vdb-filtre${filtre === f.cle ? ' vdb-filtre--actif' : ''}`}
            onClick={() => setFiltre(f.cle)}>{f.mot}</button>
        ))}
        <input type="search" className="ann-champ vdb-recherche" value={texte} autoComplete="off"
          aria-label="Chercher dans les mails de ce bien"
          placeholder="Chercher dans l’objet et le texte…"
          onChange={(e) => setTexte(e.target.value)} />
      </div>

      {etat.v === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
        : etat.v === 'erreur' ? <p className="gst-erreur" role="status">{etat.message}</p>
          : etat.lignes.length === 0 ? (
            <p className="ann-gris" role="status">
              {filtre === 'tous' && texte.trim() === ''
                ? 'Aucun mail rattaché à ce bien.'
                : 'Aucun mail ne correspond à ce filtre.'}
            </p>
          ) : (
            <>
              <ol className="vdb-liste">
                {etat.lignes.map((l) => (
                  <LigneVie key={`${l.messageId}`} l={l} maintenant={maintenant}
                    ouvert={deplie.has(l.messageId)}
                    onBasculer={() => setDeplie((s) => {
                      const n = new Set(s);
                      if (n.has(l.messageId)) n.delete(l.messageId); else n.add(l.messageId);
                      return n;
                    })}
                    onOuvrirFil={onOuvrirFil} />
                ))}
              </ol>
              {/* ⚠️ « VOIR LA SUITE » PLUTÔT QUE TOUT CHARGER : le lot le plus fourni compte 429 mails. */}
              <div className="vdb-pages">
                {page > 0 && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n - 1)}>← Page précédente</button>
                )}
                {etat.suite && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n + 1)}>Voir la suite →</button>
                )}
              </div>
            </>
          )}
    </section>
  );
}

/**
 * ══ 🔴 UNE LIGNE, DANS L'IDIOME DE LA BOÎTE ═══════════════════════════════════════════════════════════════════
 *
 * Triangle ▶/▼ à GAUCHE, VOISIN de la ligne et jamais son enfant — un bouton dans un bouton est du HTML invalide
 * et injouable au clavier (règle posée au lot LECTURE-HTML-FIL-TROMBONE, et éprouvée là-bas).
 *
 * Le triangle est invisible au clavier (`tabIndex=-1`, `aria-hidden`) : l'action vit déjà sur la ligne, qui porte
 * `aria-expanded`. Deux arrêts de tabulation pour un seul geste, et un lecteur d'écran annoncerait deux boutons.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — EXPORTÉE, ET POUR UNE SEULE RAISON ═══════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « LE FIL : même présentation que les mails de “Vie du bien” (“reçu de…” / “nous
 * avons écrit…”, badge de statut, objet, aperçu, trombone, date). **RÉUTILISE ce composant, ne le recopie pas.** »
 *
 * 🔴 LA RECOPIE ÉTAIT LE PIÈGE. Deux rendus d'une même ligne de courrier divergent au premier ajustement — et
 * c'est le second qu'on oublie. Ce dépôt l'a déjà payé plusieurs fois (deux listes de domaines, deux règles de
 * repli, trois listes de types d'images). Le nouveau bloc « Historique » rend donc EXACTEMENT cette ligne-ci.
 *
 * ⚠️ AUCUN CONTENU N'A CHANGÉ ICI : ni le rendu, ni les classes, ni les props, ni une virgule du corps. Seul le
 * mot-clé `export` a été ajouté — même geste que `CHOIX_SUIVI` au lot BROUILLONS-APERCU-TYPES-LIBELLES, et pour
 * la même raison. « Vie du bien » continue de l'appeler sans savoir qu'un autre écran l'appelle aussi.
 */
export function LigneVie({ l, maintenant, ouvert, onBasculer, onOuvrirFil, surligner = [] }: {
  l: LigneHistorique; maintenant: Date; ouvert: boolean; onBasculer: () => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LES MOTS CHERCHÉS, SURLIGNÉS DANS L'APERÇU ═════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « les mots trouvés sont surlignés dans l'aperçu ».
   *
   * ⚠️ VIDE PAR DÉFAUT, DONC AUCUN CHANGEMENT LÀ OÙ PERSONNE NE CHERCHE : la fiche d'un LOCATAIRE monte cette
   * même ligne et ne passe rien — son aperçu est, au caractère près, celui d'avant ce lot.
   *
   * 🔴 DES MORCEAUX, ET NON DU HTML. `decouperPourSurligner` rend des morceaux que React pose et échappe ; une
   * chaîne balisée aurait obligé à l'injecter sans échappement, c'est-à-dire à faire confiance au corps d'un
   * courrier que n'importe qui envoie.
   */
  surligner?: readonly string[];
}) {
  const { vraies, signatures } = trierPieces(l.pieces);
  const lisible = l.extrait === null ? null : corpsLisible(l.extrait);
  // 🔴 LA MÊME RÈGLE QUE LA BOÎTE : les « ._ » et les images de signature ne comptent pas comme pièces.
  const trombone = etatTrombone(vraies.length, 0);
  const motDuTrombone = motTrombone(trombone);
  const ouverts = l.evenements.filter((e) => e.ouvert);

  return (
    <li className="vdb-item">
      <div className="vdb-rangee">
        <button type="button" className={`vdb-triangle${ouvert ? ' vdb-triangle--ouvert' : ''}`}
          aria-hidden="true" tabIndex={-1} onClick={onBasculer}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M5 3l5 4-5 4z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="vdb-ligne" aria-expanded={ouvert} onClick={onBasculer}>
          <span className="vdb-haut">
            <span className="vdb-qui">
              {libelleSens(l.sens)} {(l.deNom ?? '').trim() === '' ? l.de : l.deNom}
            </span>
            {l.statut !== null && (
              <span className={`vdb-capsule vdb-capsule--${tonCapsule(l.statut as CapsuleStatut)}`}
                title={l.statutDetail ?? undefined}>
                {motCapsule(l.statut as CapsuleStatut)}
              </span>
            )}
            {ouverts.length > 0 && (
              <span className="vdb-capsule vdb-capsule--evt">
                {ouverts.length === 1 ? 'Événement ouvert' : `${ouverts.length} événements ouverts`}
              </span>
            )}
            {motDuTrombone !== null && (
              <span className="vdb-trombone" title={motDuTrombone} aria-label={motDuTrombone}>
                <span aria-hidden="true">📎</span>{vraies.length}
              </span>
            )}
            <span className="vdb-quand">{dateHeureCourte(l.recuLe, maintenant)}</span>
          </span>
          <span className="vdb-objet">Objet : {nettoyerObjet(l.objet ?? '') || '(sans objet)'}</span>
          {/* ══ 🔴🔴 LOT CONTACTS-EXTERNES — « pour MARTY Jean-François (locataire sortant) · via Me Martin, avocat »
              Demande d'Arno : le mail apparaît ici « avec le rôle instantané et le contact externe ».
              ⚠️ LE RÔLE EST CELUI DU JOUR DU MAIL, et il ne bougera plus : c'est ce qui permet de relire un
              courrier d'avocat de 2025 sans le faire mentir. Vide ⇒ rien n'est affiché, et la ligne est celle
              d'avant ce lot — c'est le cas de l'immense majorité du courrier. */}
          {(l.interventions ?? []).length > 0 && (
            <span className="vdb-via">
              {(l.interventions ?? []).map((x) => (
                <span key={`${x.sorte}-${x.libelle}`} className="vdb-via-qui">
                  pour {x.libelle} <span className="vdb-via-role">({motRoleInstantane(x.role).toLowerCase()})</span>
                  {x.via !== null && <> · <span className="vdb-via-contact">{x.via}</span></>}
                </span>
              ))}
            </span>
          )}
          {!ouvert && lisible !== null && lisible.visible !== '' && (
            <span className="vdb-extrait">
              {surligner.length === 0
                ? lisible.visible
                : decouperPourSurligner(lisible.visible, surligner).map((m, i) => (
                  m.trouve
                    ? <mark key={`${i}-${m.texte}`} className="vdb-trouve">{m.texte}</mark>
                    : <span key={`${i}-${m.texte}`}>{m.texte}</span>
                ))}
            </span>
          )}
        </button>
      </div>

      {/* ⚠️ LE DÉTAIL S'OUVRE SUR PLACE : on ne quitte pas la fiche pour lire un mail de ce bien. */}
      {ouvert && (
        <div className="vdb-detail">
          {l.destinataires.length > 0 && (
            <p className="vdb-dest">À : {l.destinataires.slice(0, 6).join(', ')}
              {l.destinataires.length > 6 && ' et d’autres'}</p>
          )}
          {lisible !== null && lisible.visible !== '' && <p className="vdb-corps">{lisible.visible}</p>}
          {l.evenements.length > 0 && (
            <p className="vdb-evts">
              {l.evenements.map((e) => (
                <span key={e.id} className={`vdb-capsule${e.ouvert ? ' vdb-capsule--evt' : ' vdb-capsule--gris'}`}>
                  {e.reference} — {e.objet}{e.ouvert ? '' : ' (traité)'}
                </span>
              ))}
            </p>
          )}
          {l.pieces.length > 0 && (
            <PiecesJointes messageId={l.messageId} filId={l.filId} vraies={vraies} signatures={signatures}
              gmailDuMail={lienGmail(COMPTE_GESTION_DEFAUT, { messageIdRfc: l.messageIdRfc })} />
          )}
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE MOT D'ARNO ════════════════════════════════════════════
              « “Ouvrir l'échange →” devient “Voir la conversation d'origine →”. Il ouvre la conversation dont le
              mail est tiré. »

              🔴 LE LIBELLÉ CHANGE ICI, DONC AUX DEUX ENDROITS QUI MONTENT CETTE LIGNE — le bloc « Historique »
              d'une fiche de bien et le listing de la fiche d'un LOCATAIRE. C'est voulu : c'est le même geste et
              la même destination, et deux libellés pour une même action se mettraient à divergEr. Le nouveau mot
              est d'ailleurs le plus juste des deux partout : il dit qu'on quitte une LISTE pour aller voir la
              conversation D'OÙ le mail est tiré. */}
          {onOuvrirFil && (
            <button type="button" className="gst-lien-bouton"
              onClick={() => onOuvrirFil(l.filId, l.messageId)}>Voir la conversation d’origine →</button>
          )}
          {l.pieces.length === 0 && (
            <p className="ann-gris">
              {formaterTaille(0) === '' ? '' : ''}Aucune pièce jointe.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export const CSS_VIE_DU_BIEN = `
/* AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne onze fois dans ce depot, et onze fois dans un commentaire. */
.vdb-filtres{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.vdb-filtre{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:999px;padding:.3rem .8rem;font:inherit;font-size:.8rem;color:var(--color-svv-muted);
  cursor:pointer;min-height:36px}
.vdb-filtre:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
/* LE FILTRE ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.vdb-filtre--actif{background:var(--color-svv-ink);border-color:var(--color-svv-ink);color:var(--color-svv-surface);
  font-weight:700}
.vdb-filtre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.vdb-recherche{flex:1 1 13rem;min-width:0;min-height:36px;font-size:.85rem}
.vdb-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vdb-item{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);overflow:hidden}
.svv-adm-root[data-theme='dark'] .vdb-item{box-shadow:0 1px 2px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .vdb-item{box-shadow:0 1px 2px rgba(0,0,0,.3)}
}
/* LE TRIANGLE EST LE VOISIN DE LA LIGNE, jamais son enfant : un bouton dans un bouton est du HTML invalide. */
.vdb-rangee{display:flex;align-items:stretch;min-width:0}
.vdb-triangle{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:26px;
  background:none;border:0;padding:0;margin:0;cursor:pointer;color:var(--color-svv-red)}
.vdb-triangle svg{transition:transform .15s ease}
.vdb-triangle--ouvert svg{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.vdb-triangle svg{transition:none}}
.vdb-ligne{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:.15rem;align-items:stretch;
  text-align:left;background:none;border:0;padding:8px 12px 8px 0;font:inherit;color:inherit;cursor:pointer}
.vdb-ligne:hover{background:var(--color-svv-field)}
.vdb-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.vdb-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;min-width:0}
.vdb-qui{font-size:.88rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.vdb-quand{margin-left:auto;font-size:.76rem;color:var(--color-svv-muted);flex:0 0 auto}
.vdb-objet{font-size:.84rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.vdb-extrait{font-size:.8rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
/* LES MOTS TROUVES, surlignes dans l'apercu (lot HISTORIQUE-BIEN-3, point 5). Jetons seulement : lisible dans
   les deux themes, et c'est un <mark>, donc un lecteur d'ecran l'annonce comme une mise en valeur. */
.vdb-trouve{background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-weight:700;
  border-radius:3px;padding:0 1px}
/* 🔴🔴 LOT CONTACTS-EXTERNES — « pour MARTY Jean-Francois (locataire sortant) · via Me Martin, avocat ».
   Elle s'enroule d'elle-meme quand la largeur manque : sur un telephone, une ligne de plus vaut mieux qu'un nom
   tronque au milieu. Le ROLE est entre parentheses et le contact en italique — deux informations de nature
   differente, et l'oeil doit pouvoir les separer sans les lire. */
.vdb-via{display:flex;flex-wrap:wrap;gap:.1rem .6rem;font-size:.78rem;color:var(--color-svv-muted);min-width:0}
.vdb-via-qui{overflow-wrap:anywhere}
.vdb-via-role{font-weight:600}
.vdb-via-contact{font-style:italic}
/* LES CAPSULES — les memes MOTS que la boite, et les memes tons. Le mot porte l'information, le ton l'appuie. */
.vdb-capsule{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;border:1px solid transparent;
  flex:0 0 auto}
.vdb-capsule--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);
  border-color:var(--color-svv-green-soft)}
.vdb-capsule--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-soft)}
.vdb-capsule--gris{background:var(--color-svv-field);color:var(--color-svv-muted);
  border-color:var(--color-svv-line)}
.vdb-capsule--evt{background:var(--color-svv-amber-soft);color:var(--color-svv-amber);
  border-color:var(--color-svv-amber-soft)}
/* LE TROMBONE : NOIR (encre) quand la piece est dans CE mail. Son infobulle dit laquelle des deux situations. */
.vdb-trombone{font-size:.76rem;font-weight:600;color:var(--color-svv-ink);flex:0 0 auto}
.vdb-detail{border-top:1px solid var(--color-svv-line);padding:10px 12px 12px 26px;
  display:flex;flex-direction:column;gap:.5rem;background:var(--color-svv-field)}
.vdb-dest{margin:0;font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.vdb-corps{margin:0;font-size:.86rem;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.vdb-evts{margin:0;display:flex;flex-wrap:wrap;gap:.35rem}
.vdb-pages{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.2rem}
`;
