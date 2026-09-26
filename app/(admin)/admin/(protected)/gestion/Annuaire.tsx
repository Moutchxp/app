'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyserTerme, formaterDateIso, messageRechercheVide, periodeOccupation, titreLogement,
} from '../../../../lib/gestion/annuaireRecherche';
import type {
  FicheLocataire, FicheLot, FicheProprietaire, LigneResultat, ContactAffiche,
} from '../../../../lib/gestion/annuaireRepo';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import type { Cible } from '../../../../lib/gestion/rattachement';

/**
 * LOT ANNUAIRE-1 — L'ÉCRAN « ANNUAIRE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL CHAMP DE RECHERCHE, et c'est la demande d'Arno mot pour mot : « trouver par nom, adresse, téléphone ou
 * mail qui est qui par rapport à un logement ». Quatre champs obligeraient à décider AVANT de taper dans lequel on
 * est — alors qu'on a sous les yeux un numéro sans savoir s'il est d'un propriétaire ou d'un locataire.
 *
 * 🔴 LES RÉSULTATS SONT GROUPÉS PAR LOGEMENT, parce que c'est l'unité de la question : « 12 rue X, Puteaux —
 * Propriétaire : … — Locataire actuel : … ». Chaque ligne porte le trio, et chaque nom du trio est cliquable.
 *
 * 🔴 LECTURE SEULE DANS CE LOT. Rien ne se saisit ici : WIPPIMMO fait foi, et une correction tapée dans cet écran
 * serait écrasée au prochain import sans prévenir. L'écran DIT de quand datent ses données, pour qu'on sache quoi
 * penser d'un numéro qui ne répond pas.
 *
 * 🔒 LES COORDONNÉES SONT CLIQUABLES, PAS RECOPIABLES AILLEURS : `tel:` compose, `mailto:` ouvre le courrier. Rien
 * n'est envoyé nulle part par cet écran.
 *
 * MOBILE D'ABORD (exigence transverse §15) : tout tient en une colonne à 390 px, aucune table à défilement
 * horizontal, cibles tactiles ≥ 44 px, AUCUNE interaction au seul survol — les fiches s'ouvrent au clic, et l'état
 * « locataire actuel » est dit par un MOT, jamais par une seule couleur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Reponse =
  | { etat: 'repos' }
  | { etat: 'charge' }
  | { etat: 'sans_schema' }
  | { etat: 'erreur'; message: string }
  | { etat: 'ok'; lignes: LigneResultat[]; tronque: boolean; importe: { le: string } | null };

type Fiche =
  | { etat: 'charge' }
  | { etat: 'erreur'; message: string }
  | { etat: 'proprietaire'; data: FicheProprietaire }
  | { etat: 'lot'; data: FicheLot }
  | { etat: 'locataire'; data: FicheLocataire };

/** Le temps de silence après la dernière frappe avant d'interroger. Assez court pour paraître instantané, assez
 *  long pour ne pas lancer une requête par lettre. */
const ATTENTE_FRAPPE_MS = 250;

export function Annuaire({ fiche, onFiche, onRetour, onEcrire, onHistorique }: {
  fiche: FicheUrl | null;
  onFiche: (f: FicheUrl | null) => void;
  onRetour: () => void;
  /** Ouvre « Nouveau message » de la tuile avec ce destinataire. Absent = le lien `mailto:` du système. */
  onEcrire?: (email: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique des échanges d'un logement ou d'un propriétaire. Absent = le bouton
   * ne s'affiche pas : la fiche reste exactement celle du lot ANNUAIRE-1.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  const [terme, setTerme] = useState('');
  const [reponse, setReponse] = useState<Reponse>({ etat: 'repos' });
  const [detail, setDetail] = useState<Fiche | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  // ── LA RECHERCHE ────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = terme.trim();
    if (t === '') { setReponse({ etat: 'repos' }); return; }
    let vivant = true;
    setReponse({ etat: 'charge' });
    const minuterie = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; data?: { lignes?: LigneResultat[]; tronque?: boolean }; importe?: { le: string } | null;
          };
          if (!vivant) return;
          if (d.etat === 'sans_schema') { setReponse({ etat: 'sans_schema' }); return; }
          if (d.etat !== 'ok') { setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti.' }); return; }
          setReponse({
            etat: 'ok', lignes: d.data?.lignes ?? [], tronque: d.data?.tronque === true, importe: d.importe ?? null,
          });
        } catch {
          if (vivant) setReponse({ etat: 'erreur', message: 'La recherche n’a pas abouti : le serveur n’a pas répondu.' });
        }
      })();
    }, ATTENTE_FRAPPE_MS);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [terme]);

  // ── LA FICHE OUVERTE, QUI VIT DANS L'ADRESSE ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fiche === null) { setDetail(null); return; }
    let vivant = true;
    setDetail({ etat: 'charge' });
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/annuaire?${fiche.sorte}=${fiche.id}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: unknown };
        if (!vivant) return;
        if (d.etat === 'inconnu') { setDetail({ etat: 'erreur', message: 'Cette fiche n’existe pas (ou plus) dans l’annuaire.' }); return; }
        if (d.etat !== 'ok') { setDetail({ etat: 'erreur', message: 'Fiche illisible.' }); return; }
        if (fiche.sorte === 'proprietaire') setDetail({ etat: 'proprietaire', data: d.data as FicheProprietaire });
        else if (fiche.sorte === 'lot') setDetail({ etat: 'lot', data: d.data as FicheLot });
        else setDetail({ etat: 'locataire', data: d.data as FicheLocataire });
      } catch {
        if (vivant) setDetail({ etat: 'erreur', message: 'Fiche illisible : le serveur n’a pas répondu.' });
      }
    })();
    return () => { vivant = false; };
  }, [fiche]);

  const ouvrir = useCallback((sorte: FicheUrl['sorte'], id: number) => onFiche({ sorte, id }), [onFiche]);

  return (
    <div className="ann">
      <style>{CSS_ANNUAIRE}</style>

      <div className="ann-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        <h2 className="ann-titre">Annuaire</h2>
      </div>

      {/* LE CHAMP. `type="search"` pour la croix d'effacement native, et une étiquette VISIBLE : un champ dont
          l'intitulé n'est qu'un texte d'invite disparaît dès qu'on tape, et l'on ne sait plus ce qu'on remplit. */}
      <div className="ann-chercher">
        <label className="ann-label" htmlFor="ann-q">Chercher un propriétaire, un lot, un locataire</label>
        <input
          id="ann-q" ref={champ} type="search" className="ann-champ" value={terme} autoComplete="off"
          onChange={(e) => setTerme(e.target.value)}
          placeholder="nom, adresse, commune, téléphone, e-mail, n° de lot"
        />
        <p className="ann-aide">
          Tout est accepté&nbsp;: accents ou non, majuscules ou non, téléphone avec espaces, points ou +33.
        </p>
      </div>

      {/* LA FICHE OUVERTE PREND LA PLACE DE LA LISTE — pas de colonne à côté : à 390 px il n'y en a pas deux. Le
          bouton de retour ramène à la liste, qui n'a pas bougé (le texte tapé est resté). */}
      {fiche !== null ? (
        <section className="ann-fiche" aria-live="polite">
          <button type="button" className="svv-btn svv-btn-outline gst-btn ann-retour" onClick={() => onFiche(null)}>
            ← Retour aux résultats
          </button>
          {detail === null || detail.etat === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
            : detail.etat === 'erreur' ? <p className="gst-erreur" role="status">{detail.message}</p>
              : detail.etat === 'proprietaire'
                ? <VueProprietaire f={detail.data} ouvrir={ouvrir} onEcrire={onEcrire} onHistorique={onHistorique} />
                : detail.etat === 'lot' ? <VueLot f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique} />
                  : <VueLocataire f={detail.data} ouvrir={ouvrir} onEcrire={onEcrire} onHistorique={onHistorique} />}
        </section>
      ) : (
        <Resultats reponse={reponse} terme={terme} ouvrir={ouvrir} />
      )}
    </div>
  );
}

// ══ LA LISTE ════════════════════════════════════════════════════════════════════════════════════════════════════

function Resultats({ reponse, terme, ouvrir }: {
  reponse: Reponse; terme: string; ouvrir: (s: FicheUrl['sorte'], id: number) => void;
}) {
  if (reponse.etat === 'repos') {
    return (
      <p className="gst-vide">
        Tapez un nom, une adresse, une commune, un téléphone, un e-mail ou un numéro de lot.
        {' '}L’annuaire répond par LOGEMENT&nbsp;: l’adresse, son propriétaire, son locataire actuel.
      </p>
    );
  }
  if (reponse.etat === 'charge') return <p className="gst-info" role="status">Recherche…</p>;
  if (reponse.etat === 'erreur') return <p className="gst-erreur" role="status">{reponse.message}</p>;
  if (reponse.etat === 'sans_schema') {
    return (
      <p className="gst-vide">
        <strong>L’annuaire n’est pas encore installé.</strong> Une mise à jour de la base est nécessaire
        (migration 253), puis un premier import des exports WIPPIMMO. Rien d’autre n’est affecté&nbsp;: le reste du
        module fonctionne normalement.
      </p>
    );
  }
  if (reponse.lignes.length === 0) {
    return <p className="gst-vide" role="status">{messageRechercheVide(analyserTerme(terme))}</p>;
  }
  return (
    <>
      {/* 🔴 UNE LISTE COUPÉE LE DIT. Mesuré le 26/09/2026 sur la vraie base : « puvis » correspond à 76 logements,
          l'écran en montrait 60 et annonçait « 60 résultats » — 16 disparaissaient sans un mot. C'est exactement ce
          que le module s'interdit ailleurs (la fenêtre de 30 jours de la file annonce ce qu'elle laisse de côté). */}
      <p className="ann-compte" role="status">
        {reponse.tronque
          ? <>
            <strong>{reponse.lignes.length} premiers résultats</strong>
            {' — d’autres correspondent. Précisez votre recherche (une adresse plus complète, une commune, '}
            {'un nom) pour tous les voir.'}
          </>
          : <>{reponse.lignes.length} résultat{reponse.lignes.length > 1 ? 's' : ''}</>}
        {reponse.importe && <> · annuaire importé le {formaterDateIso(reponse.importe.le)}</>}
      </p>
      <ul className="ann-liste">
        {reponse.lignes.map((l, i) => (
          <li key={`${l.lotId ?? 'x'}-${l.proprietaireId ?? 'x'}-${l.locataireId ?? 'x'}-${i}`} className="ann-item">
            <div className="ann-item-titre">
              {l.lotId !== null ? (
                <button type="button" className="ann-lien ann-lien--fort" onClick={() => ouvrir('lot', l.lotId as number)}>
                  {titreLogement(l.adresse, l.commune)}
                </button>
              ) : <span className="ann-sans-lot">Sans lot en gestion</span>}
              {l.nature && <span className="ann-etiq">{l.nature}{l.typeBien ? ` · ${l.typeBien}` : ''}</span>}
              {/* « absent du dernier export » est dit par un MOT : lisible en niveaux de gris comme aux daltoniens. */}
              {l.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
            </div>
            <div className="ann-item-ligne">
              <span className="ann-role">Propriétaire</span>
              {l.proprietaireId !== null ? (
                <button type="button" className="ann-lien" onClick={() => ouvrir('proprietaire', l.proprietaireId as number)}>
                  {l.proprietaireNom || '(sans nom)'}
                </button>
              ) : <span className="ann-inconnu">{l.proprietaireNom || 'non rattaché'}</span>}
            </div>
            <div className="ann-item-ligne">
              <span className="ann-role">Locataire actuel</span>
              {l.locataireId !== null ? (
                <>
                  <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', l.locataireId as number)}>
                    {l.locataireNom}
                  </button>
                  {l.locataireDepuis && <span className="ann-gris">depuis le {formaterDateIso(l.locataireDepuis)}</span>}
                </>
              ) : <span className="ann-inconnu">aucun bail en cours</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ══ LES CONTACTS, CLIQUABLES ════════════════════════════════════════════════════════════════════════════════════

function Contacts({ contacts, onEcrire }: { contacts: ContactAffiche[]; onEcrire?: (email: string) => void }) {
  if (contacts.length === 0) return <p className="ann-gris">Aucune coordonnée dans WIPPIMMO.</p>;
  return (
    <ul className="ann-contacts">
      {contacts.map((c) => (
        <li key={`${c.sorte}-${c.valeur}`} className="ann-contact">
          <span className="ann-role">{c.sorte === 'telephone' ? 'Téléphone' : 'E-mail'}</span>
          {c.sorte === 'telephone' ? (
            /* `tel:` porte la forme CANONIQUE (+33…), qui compose partout ; le texte, lui, montre ce qui était
               écrit dans WIPPIMMO — un numéro reformaté n'est plus reconnu par celui qui l'a saisi. */
            <a className="ann-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
          ) : onEcrire ? (
            <button type="button" className="ann-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
          ) : (
            <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>
          )}
          {c.absent && <span className="ann-etiq ann-etiq--absent">retiré de l’export</span>}
        </li>
      ))}
    </ul>
  );
}

// ══ LES TROIS FICHES ════════════════════════════════════════════════════════════════════════════════════════════

function VueProprietaire({ f, ouvrir, onEcrire, onHistorique }: {
  f: FicheProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
  onHistorique?: (cible: Cible) => void;
}) {
  return (
    <>
      <h3 className="ann-fiche-titre">{f.civilite ? `${f.civilite} ` : ''}{f.nom}</h3>
      <p className="ann-fiche-sous">Propriétaire{f.absent && ' · absent du dernier export'}</p>
      <BoutonHistorique cible={{ sorte: 'proprietaire', cle: f.cle, id: null }} onHistorique={onHistorique} />
      <dl className="ann-dl">
        <dt>Début de la relation</dt>
        <dd>
          {f.relationDepuis
            ? <>le {formaterDateIso(f.relationDepuis)} <span className="ann-gris">(début de gestion du plus ancien de ses lots)</span></>
            : <span className="ann-gris">inconnu — aucun lot en gestion ne porte de date de début</span>}
        </dd>
        <dt>Adresse</dt>
        <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' ')) }</dd>
      </dl>
      <h4 className="ann-sstitre">Coordonnées</h4>
      <Contacts contacts={f.contacts} onEcrire={onEcrire} />
      <h4 className="ann-sstitre">Ses lots <span className="gst-compte">{f.lots.length}</span></h4>
      {f.lots.length === 0 ? <p className="ann-gris">Aucun lot en gestion.</p> : (
        <ul className="ann-liste">
          {f.lots.map((l) => (
            <li key={l.id} className="ann-item">
              <div className="ann-item-titre">
                <button type="button" className="ann-lien ann-lien--fort" onClick={() => ouvrir('lot', l.id)}>
                  {titreLogement(l.adresse, l.commune)}
                </button>
                {l.nature && <span className="ann-etiq">{l.nature}{l.typeBien ? ` · ${l.typeBien}` : ''}</span>}
              </div>
              <div className="ann-item-ligne">
                <span className="ann-role">Locataire actuel</span>
                {l.locataireId !== null && l.locataire
                  ? <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', l.locataireId as number)}>{l.locataire}</button>
                  : <span className="ann-inconnu">aucun bail en cours</span>}
              </div>
              {l.debut && <div className="ann-item-ligne"><span className="ann-role">En gestion depuis</span><span>le {formaterDateIso(l.debut)}</span></div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function VueLot({ f, ouvrir, onHistorique }: {
  f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onHistorique?: (cible: Cible) => void;
}) {
  const actuels = f.occupations.filter((o) => o.encours);
  const passes = f.occupations.filter((o) => !o.encours);
  return (
    <>
      <h3 className="ann-fiche-titre">{titreLogement(f.adresse, f.commune)}</h3>
      <p className="ann-fiche-sous">
        Lot n° {f.numero}{f.nature ? ` · ${f.nature}` : ''}{f.typeBien ? ` · ${f.typeBien}` : ''}
        {f.absent && ' · absent du dernier export'}
      </p>
      <BoutonHistorique cible={{ sorte: 'lot', cle: f.numero, id: null }} onHistorique={onHistorique} />
      <dl className="ann-dl">
        {f.immeuble && <><dt>Immeuble</dt><dd>{f.immeuble}</dd></>}
        {f.codePostal && <><dt>Code postal</dt><dd>{f.codePostal}</dd></>}
        <dt>En gestion depuis</dt>
        <dd>{f.debut ? `le ${formaterDateIso(f.debut)}` : <span className="ann-gris">date inconnue</span>}
          {f.fin && <> · <strong>fin de gestion le {formaterDateIso(f.fin)}</strong></>}</dd>
        <dt>Propriétaire</dt>
        <dd>
          {f.proprietaireId !== null
            ? <button type="button" className="ann-lien" onClick={() => ouvrir('proprietaire', f.proprietaireId as number)}>{f.proprietaireNom}</button>
            : <span className="ann-inconnu">{f.proprietaireNom || 'non rattaché'} <span className="ann-gris">(nom porté par plusieurs fiches WIPPIMMO&nbsp;: non tranché)</span></span>}
        </dd>
      </dl>

      <h4 className="ann-sstitre">Locataire actuel</h4>
      {actuels.length === 0 ? <p className="ann-gris">Aucun bail en cours.</p> : (
        <ul className="ann-liste">
          {actuels.map((o) => (
            <li key={`a-${o.locataireId}-${o.entree ?? ''}`} className="ann-item">
              <div className="ann-item-titre">
                <button type="button" className="ann-lien ann-lien--fort" onClick={() => ouvrir('locataire', o.locataireId)}>{o.nom}</button>
                <span className="ann-etiq">en cours</span>
              </div>
              <div className="ann-item-ligne"><span className="ann-role">Entré</span><span>{periodeOccupation(o.entree, o.sortie)}</span></div>
            </li>
          ))}
        </ul>
      )}

      {/* L'HISTORIQUE EST TOUJOURS LÀ, jamais replié derrière un survol : c'est la question qu'on pose le plus après
          « qui habite ici ? » — « et avant ? ». */}
      <h4 className="ann-sstitre">Locataires passés <span className="gst-compte">{passes.length}</span></h4>
      {passes.length === 0 ? <p className="ann-gris">Aucun locataire passé connu.</p> : (
        <ul className="ann-liste">
          {passes.map((o) => (
            <li key={`p-${o.locataireId}-${o.entree ?? ''}-${o.sortie ?? ''}`} className="ann-item ann-item--passe">
              <div className="ann-item-titre">
                <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', o.locataireId)}>{o.nom}</button>
              </div>
              <div className="ann-item-ligne"><span className="ann-role">Occupation</span><span>{periodeOccupation(o.entree, o.sortie)}</span></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function VueLocataire({ f, ouvrir, onEcrire, onHistorique }: {
  f: FicheLocataire; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
  onHistorique?: (cible: Cible) => void;
}) {
  return (
    <>
      <h3 className="ann-fiche-titre">{f.nom}</h3>
      <p className="ann-fiche-sous">Locataire{f.absent && ' · absent du dernier export'}</p>
      <dl className="ann-dl">
        <dt>Adresse</dt>
        <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
      </dl>
      <h4 className="ann-sstitre">Coordonnées</h4>
      <Contacts contacts={f.contacts} onEcrire={onEcrire} />
      <h4 className="ann-sstitre">Ses logements <span className="gst-compte">{f.occupations.length}</span></h4>
      <ul className="ann-liste">
        {f.occupations.map((o) => (
          <li key={`${o.lotId ?? o.numero}-${o.entree ?? ''}`} className={`ann-item${o.encours ? '' : ' ann-item--passe'}`}>
            <div className="ann-item-titre">
              {o.lotId !== null
                ? <button type="button" className="ann-lien ann-lien--fort" onClick={() => ouvrir('lot', o.lotId as number)}>{titreLogement(o.adresse, o.commune)}</button>
                : <span className="ann-sans-lot">Lot n° {o.numero}</span>}
              {o.encours ? <span className="ann-etiq">en cours</span> : <span className="ann-etiq ann-etiq--passe">terminé</span>}
              {/* Un bail dont le lot n'est pas dans l'export Lots : on le GARDE, et on dit pourquoi il est nu. */}
              {o.horsGestion && <span className="ann-etiq ann-etiq--absent">lot hors gestion</span>}
            </div>
            {/* LOT RATTACHEMENT-2 — un LOCATAIRE n'est pas une cible de rattachement (il déménage ; le logement, non) :
                l'entrée passe donc par chacun de ses logements, et jamais par lui. */}
            {!o.horsGestion && (
              <BoutonHistorique cible={{ sorte: 'lot', cle: o.numero, id: null }} onHistorique={onHistorique} />
            )}
            <div className="ann-item-ligne"><span className="ann-role">Occupation</span><span>{periodeOccupation(o.entree, o.sortie)}</span></div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * LOT RATTACHEMENT-2 — LE POINT D'ENTRÉE DE L'HISTORIQUE, sur une fiche.
 *
 * ⚠️ IL NE S'AFFICHE QUE SI LE PARENT SAIT OÙ ALLER (`onHistorique` fourni) et si la cible a une clé. Un bouton qui
 * n'irait nulle part est pire qu'un bouton absent : on clique, rien ne se passe, et on cherche la panne.
 */
function BoutonHistorique({ cible, onHistorique }: { cible: Cible; onHistorique?: (c: Cible) => void }) {
  if (onHistorique === undefined || cible.cle === null || cible.cle === '') return null;
  return (
    <button type="button" className="svv-btn svv-btn-outline gst-btn ann-histo"
      onClick={() => onHistorique(cible)}>
      Tout l’historique des échanges →
    </button>
  );
}

export const CSS_ANNUAIRE = `
/* MOBILE D'ABORD : une seule colonne, aucune table, aucun débordement horizontal — tout casse en fin de ligne. */
.ann{display:flex;flex-direction:column;gap:.75rem;min-width:0}
.ann-histo{align-self:flex-start;margin:.2rem 0 .4rem}
.ann-entete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-titre{margin:0;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
.ann-chercher{display:flex;flex-direction:column;gap:.3rem}
/* L'étiquette est VISIBLE : un intitulé qui n'existe que dans le texte d'invite disparaît dès qu'on tape. */
.ann-label{font-size:.78rem;font-weight:600;color:var(--color-svv-ink)}
.ann-champ{min-height:44px;padding:.5rem .7rem;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.95rem;width:100%}
.ann-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-aide{margin:0;font-size:.74rem;color:var(--color-svv-muted);line-height:1.4}
.ann-compte{margin:0;font-size:.78rem;color:var(--color-svv-muted)}
.ann-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ann-item{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:10px 12px;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:3px}
/* Un bail terminé est plus discret, mais reste parfaitement lisible : on ne cache pas l'historique. */
.ann-item--passe{background:var(--color-svv-field)}
.ann-item-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem}
.ann-item-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem}
/* Le RÔLE est écrit en toutes lettres devant chaque valeur : « Propriétaire », « Locataire actuel », « Téléphone ».
   Sans lui, deux noms l'un sous l'autre ne disent pas lequel est lequel. */
.ann-role{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted);
  flex:0 0 auto;min-width:6.5rem}
.ann-gris{font-size:.78rem;color:var(--color-svv-muted)}
.ann-inconnu{font-size:.82rem;color:var(--color-svv-muted);font-style:normal}
.ann-sans-lot{font-weight:700;color:var(--color-svv-ink)}
/* Un lien est un BOUTON souligné : cible tactile pleine hauteur, et jamais une couleur seule pour dire qu'il agit. */
.ann-lien{background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;color:var(--color-svv-ink);
  font:inherit;font-size:.88rem;text-decoration:underline;text-underline-offset:3px;min-height:44px}
.ann-lien--fort{font-weight:700;font-size:.95rem}
.ann-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-etiq{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:1px 8px;white-space:nowrap}
.ann-etiq--passe{opacity:.85}
/* « absent du dernier export » : le MOT porte l'information ; la bordure ne fait que la redire. */
.ann-etiq--absent{border-color:var(--color-svv-red);color:var(--color-svv-ink)}
.ann-fiche{display:flex;flex-direction:column;gap:.5rem;min-width:0}
.ann-retour{align-self:flex-start}
.ann-fiche-titre{margin:.2rem 0 0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-fiche-sous{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.ann-sstitre{margin:.6rem 0 .2rem;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
/* La liste de définitions se replie en une colonne sous 520 px : deux colonnes serrées rendent l'adresse illisible. */
.ann-dl{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.25rem .7rem;margin:0;font-size:.85rem}
.ann-dl dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ann-dl dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.ann-dl{grid-template-columns:1fr;gap:.1rem}.ann-dl dd{margin-bottom:.35rem}}
.ann-contacts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.ann-contact{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-height:44px}
`;
