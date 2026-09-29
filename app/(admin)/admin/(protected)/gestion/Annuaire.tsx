'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyserTerme, formaterDateIso, messageRechercheVide, periodeOccupation, titreLogement,
} from '../../../../lib/gestion/annuaireRecherche';
import type {
  BienDuProprietaire, FicheLocataire, FicheLot, FicheProprietaire, LigneResultat, ContactAffiche,
  OccupationDuLot,
} from '../../../../lib/gestion/annuaireRepo';
// LOT FICHES-ANNUAIRE étape B — « la vie du bien » : tous ses mails, dans l'idiome de la boîte.
import { CSS_VIE_DU_BIEN, VieDuBien } from './VieDuBien';
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

export function Annuaire({ fiche, onFiche, onRetour, onEcrire, onHistorique, maintenant, onOuvrirFil }: {
  fiche: FicheUrl | null;
  onFiche: (f: FicheUrl | null) => void;
  onRetour: () => void;
  /**
   * 🔴 LOT FICHES-ANNUAIRE étape B — l'heure de référence de l'écran, pour que « il y a 3 h » soit le même partout.
   * Par défaut, maintenant : une fiche ouverte sans référence n'a pas à afficher des dates fausses.
   */
  maintenant?: Date;
  /** Ouvre l'échange d'un mail de la « vie du bien ». Absent = la ligne reste lisible, sans ce chemin. */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /** Ouvre « Nouveau message » de la tuile avec ce destinataire. Absent = le lien `mailto:` du système. */
  onEcrire?: (email: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique des échanges d'un logement ou d'un propriétaire. Absent = le bouton
   * ne s'affiche pas : la fiche reste exactement celle du lot ANNUAIRE-1.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  const [terme, setTerme] = useState('');
  /**
   * ⚠️ UNE SEULE RÉFÉRENCE DE TEMPS POUR TOUT L'ÉCRAN, figée au montage : recalculer `new Date()` à chaque rendu
   * ferait glisser les « il y a 3 min » d'une ligne à l'autre, et l'on croirait à des mails différents.
   */
  const [refTemps] = useState(() => maintenant ?? new Date());
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
      <style>{CSS_VIE_DU_BIEN}</style>

      {/* ══ 🔴🔴 LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE : UN RETOUR, ET LA RECHERCHE ════════════════════════
          Arno, sur la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ». La fiche
          commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas — titre du module, sa
          description, le bandeau de relève, « Relève automatique », « Copie des pièces ». Ils sont retirés de CET
          écran (voir `GestionVue`), et restent là où ils servent : la page de la boîte.

          🔴 CE QU'ON GARDE, ET RIEN D'AUTRE : un fil de retour, et le champ de recherche — compact quand une
          fiche est ouverte, parce qu'on y cherche la personne SUIVANTE, pas la page où l'on est. */}
      <div className="ann-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn ann-retour-haut"
          onClick={() => (fiche !== null ? onFiche(null) : onRetour())}>
          ← Retour
        </button>
        {fiche === null && <h2 className="ann-titre">Annuaire</h2>}
        {/* LE CHAMP. `type="search"` pour la croix d'effacement native. Son étiquette reste VISIBLE tant qu'on est
            sur les résultats ; sur une fiche elle devient l'invite du champ, faute de quoi elle ferait une ligne
            de plus au-dessus de ce qu'on est venu lire. */}
        {fiche !== null && (
          <input
            type="search" className="ann-champ ann-champ--compact" value={terme} autoComplete="off"
            aria-label="Chercher un propriétaire, un lot, un locataire"
            onChange={(e) => setTerme(e.target.value)}
            placeholder="Chercher une autre personne, un lot, une adresse…"
          />
        )}
      </div>

      {fiche === null && (
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
      )}

      {/* 🔴 TAPER DANS LE CHAMP D'UNE FICHE RAMÈNE AUX RÉSULTATS. Sans cela, on taperait sans rien voir venir :
          les résultats sont rendus à la place de la fiche, et la fiche est encore ouverte. */}
      {fiche !== null && terme.trim() !== '' && (
        <p className="ann-bascule">
          <button type="button" className="ann-lien ann-lien--fort" onClick={() => onFiche(null)}>
            Voir les résultats pour « {terme.trim()} » →
          </button>
        </p>
      )}

      {/* LA FICHE OUVERTE PREND LA PLACE DE LA LISTE — pas de colonne à côté : à 390 px il n'y en a pas deux. Le
          bouton de retour ramène à la liste, qui n'a pas bougé (le texte tapé est resté). */}
      {fiche !== null ? (
        <section className="ann-fiche" aria-live="polite">
          {/* ⚠️ PLUS DE SECOND BOUTON DE RETOUR ICI : il est en haut de page, au-dessus de tout, et il ramène aux
              résultats comme celui-ci le faisait. En garder deux ferait deux chemins pour un même geste. */}
          {detail === null || detail.etat === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
            : detail.etat === 'erreur' ? <p className="gst-erreur" role="status">{detail.message}</p>
              : detail.etat === 'proprietaire'
                ? <VueProprietaire f={detail.data} ouvrir={ouvrir} onEcrire={onEcrire} onHistorique={onHistorique} />
                : detail.etat === 'lot'
                  ? <VueLot f={detail.data} ouvrir={ouvrir} onHistorique={onHistorique} onEcrire={onEcrire}
                    maintenant={refTemps} onOuvrirFil={onOuvrirFil} />
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

/**
 * ══ 🔴 COPIER UNE COORDONNÉE ══════════════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « chaque téléphone et chaque e-mail avec son libellé et un bouton Copier ». Un numéro se
 * recopie dix fois par jour dans un autre outil — le lire à voix haute à soi-même est exactement le moment où
 * l'on inverse deux chiffres.
 *
 * ⚠️ LE PRESSE-PAPIERS PEUT REFUSER (navigateur ancien, page non sécurisée). On le DIT sur le bouton plutôt que
 * de laisser croire que c'est copié — un « ✓ » menteur ferait coller autre chose.
 */
function BoutonCopier({ valeur, quoi }: { valeur: string; quoi: string }) {
  const [etat, setEtat] = useState<'repos' | 'fait' | 'refus'>('repos');
  useEffect(() => {
    if (etat === 'repos') return;
    const t = setTimeout(() => setEtat('repos'), 1800);
    return () => clearTimeout(t);
  }, [etat]);
  return (
    <button type="button" className="ann-copier" title={`Copier ${quoi}`} aria-label={`Copier ${quoi}`}
      onClick={() => {
        void (async () => {
          try { await navigator.clipboard.writeText(valeur); setEtat('fait'); }
          catch { setEtat('refus'); }
        })();
      }}>
      {etat === 'fait' ? '✓ copié' : etat === 'refus' ? 'copie refusée' : 'Copier'}
    </button>
  );
}

/**
 * ══ 🔴🔴 LE BLOC DES COORDONNÉES COMPLÈTES — LE PREMIER DE LA FICHE ═══════════════════════════════════════════
 *
 * Arno : « 1er bloc = COORDONNÉES COMPLÈTES du ou des propriétaires du même ensemble de biens (co-propriétaires,
 * indivision, société + représentant) : civilité, nom, qualité, adresse postale, chaque téléphone et chaque
 * e-mail avec son libellé et un bouton Copier, une note libre ».
 *
 * ═══ CE QUE LA BASE SAIT, MESURÉ LE 29/09/2026 ═════════════════════════════════════════════════════════════════
 *   · civilité 302/307 · adresse postale 304/307 · coordonnées : 354 e-mails et 287 téléphones, TOUS avec leur
 *     libellé d'origine (« Mobile », « Email », …) ;
 *   · QUALITÉ et NOTE LIBRE : aucune colonne n'existe. On écrit « non renseignée » — jamais un vide, qui se
 *     lirait comme un oubli d'affichage ;
 *   · CO-PROPRIÉTAIRES : un bien n'a qu'UN propriétaire dans le schéma (clé étrangère unique). 66 fiches sur 307
 *     nomment pourtant deux personnes DANS le nom (« AISSAOUI Mohamed et Amina »). On rend donc la liste telle
 *     qu'elle est — une personne aujourd'hui — sans inventer un découpage que rien ne permet de faire.
 *     🔭 L'étape C ouvre l'ajout d'un co-propriétaire : c'est là que la liste en portera plusieurs, pour de vrai.
 */
function BlocCoordonnees({ f, onEcrire }: { f: FicheProprietaire; onEcrire?: (email: string) => void }) {
  const adresse = titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '));
  const tels = f.contacts.filter((c) => c.sorte === 'telephone');
  const mails = f.contacts.filter((c) => c.sorte === 'email');
  return (
    <section className="ann-bloc" aria-labelledby="ann-coord">
      <h4 className="ann-bloc-titre" id="ann-coord">Coordonnées</h4>
      <article className="ann-personne">
        {/* ⚠️ L'EN-TÊTE DU BLOC porte le nom À GAUCHE et ses actions À DROITE. C'est ici que « Modifier » prendra
            place à l'étape C — un bouton par PERSONNE, puisque le bloc en portera plusieurs. */}
        <div className="ann-personne-tete">
          <p className="ann-personne-nom">{f.civilite ? `${f.civilite} ` : ''}{f.nom}</p>
        </div>
        <dl className="ann-champs">
          <dt>Qualité</dt>
          {/* 🔴 AUCUNE COLONNE « QUALITÉ » n'existe : on le DIT, on ne laisse pas une ligne vide. */}
          <dd><span className="ann-inconnu">non renseignée</span></dd>
          <dt>Adresse postale</dt>
          <dd>{adresse !== '' ? adresse : <span className="ann-inconnu">non renseignée</span>}</dd>
          <dt>Téléphone{tels.length > 1 ? 's' : ''}</dt>
          <dd>
            {tels.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
              <ul className="ann-coords">
                {tels.map((c) => (
                  <li key={c.valeur} className="ann-coord">
                    <a className="ann-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
                    <span className="ann-libelle">{c.libelle ?? 'Téléphone'}</span>
                    <BoutonCopier valeur={c.affichage} quoi="ce numéro" />
                    {c.absent && <span className="ann-etiq ann-etiq--absent">retiré de l’export</span>}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt>E-mail{mails.length > 1 ? 's' : ''}</dt>
          <dd>
            {mails.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
              <ul className="ann-coords">
                {mails.map((c) => (
                  <li key={c.valeur} className="ann-coord">
                    {onEcrire
                      ? <button type="button" className="ann-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
                      : <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
                    <span className="ann-libelle">{c.libelle ?? 'E-mail'}</span>
                    <BoutonCopier valeur={c.valeur} quoi="cette adresse" />
                    {c.absent && <span className="ann-etiq ann-etiq--absent">retiré de l’export</span>}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt>Note</dt>
          <dd><span className="ann-inconnu">non renseignée</span></dd>
        </dl>
      </article>
      <p className="ann-depuis">
        {f.relationDepuis
          ? <>Début de collaboration : <strong>le {formaterDateIso(f.relationDepuis)}</strong>{' '}
            <span className="ann-gris">— début de gestion du plus ancien lot</span></>
          : <>Début de collaboration : <span className="ann-inconnu">non renseigné</span>{' '}
            <span className="ann-gris">— aucun lot en gestion ne porte de date de début</span></>}
      </p>
    </section>
  );
}

/** Ce qu'une carte de bien affiche d'une date : la date seule, ou le mot qui dit qu'on ne l'a pas. */
function DateOuRien({ iso, sinon }: { iso: string | null; sinon: string }) {
  return iso === null ? <span className="ann-inconnu">{sinon}</span> : <>{formaterDateIso(iso)}</>;
}

const DRIVE_DOSSIER = 'https://drive.google.com/drive/folders/';

/**
 * ══ 🔴🔴 UNE CARTE DE BIEN ════════════════════════════════════════════════════════════════════════════════════
 *
 * Arno : « les BIENS en gestion […] sous forme de CARTES cliquables : adresse, lot, type, surface ou “non
 * renseignée”, locataire en place ou “Vacant”, nombre de mails, dernier échange, événements ouverts, lien vers le
 * dossier Drive du lot ».
 *
 * 🔴 LA CARTE ENTIÈRE EST LE BOUTON, et les deux liens qui en sortent (le locataire, le Drive) s'arrêtent au clic
 * (`stopPropagation`). Un bouton dans un bouton serait du HTML invalide : le lien du Drive est donc un vrai
 * `<a>`, posé À CÔTÉ du bouton dans le flux, et la carte est une grille — pas une imbrication.
 *
 * ⚠️ « SURFACE : NON RENSEIGNÉE » EST UN FAIT, PAS UN TROU. Mesuré le 29/09/2026 : aucune colonne de surface
 * n'existe dans le schéma. On ne la déduit pas du type (« Type 2 » ne dit pas des mètres carrés).
 */
function CarteBien({ b, ouvrir }: { b: BienDuProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void }) {
  return (
    <li className={`ann-carte${b.fin !== null ? ' ann-carte--ancien' : ''}`}>
      <button type="button" className="ann-carte-corps" onClick={() => ouvrir('lot', b.id)}>
        <span className="ann-carte-tete">
          <span className="ann-carte-titre">{titreLogement(b.adresse, b.commune)}</span>
          <span className="ann-carte-sous">
            <span className="ann-etiq">lot {b.numero}</span>
            {b.nature && <span className="ann-etiq">{b.nature}</span>}
            {b.typeBien && <span className="ann-etiq">{b.typeBien}</span>}
          </span>
        </span>
        <span className="ann-carte-faits">
          <span className="ann-fait">
            <span className="ann-fait-mot">Surface</span>
            {b.surfaceM2 === null
              ? <span className="ann-inconnu">non renseignée</span>
              : <span>{b.surfaceM2} m²</span>}
          </span>
          {/* 🔴 LE LOCATAIRE EN PLACE EST MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */}
          <span className={`ann-fait${b.locataire !== null ? ' ann-fait--locataire' : ''}`}>
            <span className="ann-fait-mot">Locataire</span>
            {b.locataire === null
              ? <span className="ann-vacant">Vacant</span>
              : <span className="ann-fait-valeur">{b.locataire}</span>}
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Mails</span>
            <span>{b.mails}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Dernier échange</span>
            <DateOuRien iso={b.dernierEchange} sinon="aucun" />
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">Événements ouverts</span>
            <span>{b.evenementsOuverts === 0 ? 'aucun' : b.evenementsOuverts}</span>
          </span>
          <span className="ann-fait">
            <span className="ann-fait-mot">{b.fin === null ? 'En gestion depuis' : 'Sorti de gestion le'}</span>
            <DateOuRien iso={b.fin ?? b.debut} sinon="non renseigné" />
          </span>
        </span>
      </button>
      <span className="ann-carte-pied">
        {b.locataireId !== null && b.locataire !== null && (
          <button type="button" className="ann-lien" onClick={() => ouvrir('locataire', b.locataireId as number)}>
            Fiche du locataire →
          </button>
        )}
        {b.driveDossierId !== null ? (
          <a className="ann-lien" href={`${DRIVE_DOSSIER}${b.driveDossierId}`} target="_blank" rel="noreferrer">
            Dossier Drive du lot ↗
          </a>
        ) : (
          <span className="ann-inconnu">dossier Drive non construit</span>
        )}
      </span>
    </li>
  );
}

function VueProprietaire({ f, ouvrir, onEcrire, onHistorique }: {
  f: FicheProprietaire; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
  onHistorique?: (cible: Cible) => void;
}) {
  const [anciensOuverts, setAnciensOuverts] = useState(false);
  const enGestion = f.biens.filter((b) => b.fin === null);
  const anciens = f.biens.filter((b) => b.fin !== null);
  return (
    <>
      {/* ══ 🔴 L'EN-TÊTE DE FICHE — un bandeau sobre : le nom en grand, le rôle en capsule, les actions à droite.
          Demande d'Arno : « en-tête de fiche distinct ». Il remplace un titre et une ligne grise qui se
          confondaient avec le reste de la page. */}
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{f.civilite ? `${f.civilite} ` : ''}{f.nom}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Propriétaire</span>
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      <BlocCoordonnees f={f} onEcrire={onEcrire} />

      <section className="ann-bloc" aria-labelledby="ann-biens">
        <h4 className="ann-bloc-titre" id="ann-biens">
          Biens en gestion <span className="gst-compte">{enGestion.length}</span>
        </h4>
        {enGestion.length === 0 ? <p className="ann-gris">Aucun bien en gestion.</p> : (
          <ul className="ann-cartes">
            {enGestion.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir} />)}
          </ul>
        )}
      </section>

      {/* ⚠️ « ANCIENS BIENS » EST REPLIÉ, jamais retiré : un bien sorti de gestion garde ses mails et son
          historique, et c'est souvent pour EUX qu'on ouvre la fiche. Replié, il ne noie pas les biens vivants. */}
      {anciens.length > 0 && (
        <section className="ann-bloc">
          <button type="button" className="ann-repli" aria-expanded={anciensOuverts}
            onClick={() => setAnciensOuverts((v) => !v)}>
            <span aria-hidden="true" className={`ann-repli-triangle${anciensOuverts ? ' ann-repli-triangle--ouvert' : ''}`}>▸</span>
            Anciens biens <span className="gst-compte">{anciens.length}</span>
          </button>
          {anciensOuverts && (
            <ul className="ann-cartes">
              {anciens.map((b) => <CarteBien key={b.id} b={b} ouvrir={ouvrir} />)}
            </ul>
          )}
        </section>
      )}

      {/* ⚠️ DISCRET, ET TOUJOURS LÀ : c'est le chemin vers tout ce qui a été échangé avec cette personne. */}
      <p className="ann-discret">
        <BoutonHistorique cible={{ sorte: 'proprietaire', cle: f.cle, id: null }} onHistorique={onHistorique} />
      </p>
    </>
  );
}

/**
 * ══ 🔴 UN OCCUPANT, AVEC SES COORDONNÉES COMPLÈTES ════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : les occupants « avec coordonnées complètes, date d'entrée et liens vers leur fiche » — et,
 * pour l'historique, « les occupants, la date d'entrée, la date de sortie et les coordonnées ». Le même bloc
 * sert aux deux : ce qu'on veut savoir d'un ancien locataire est ce qu'on veut savoir d'un actuel.
 */
function BlocOccupant({ o, ouvrir, onEcrire }: {
  o: OccupationDuLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onEcrire?: (email: string) => void;
}) {
  const tels = o.contacts.filter((c) => c.sorte === 'telephone');
  const mails = o.contacts.filter((c) => c.sorte === 'email');
  const adresse = titreLogement(o.adresse, [o.codePostal, o.commune].filter((x) => x).join(' '));
  return (
    <article className={`ann-personne${o.encours ? '' : ' ann-personne--passe'}`}>
      <div className="ann-personne-tete">
        <p className="ann-personne-nom">
          <button type="button" className="ann-lien ann-lien--fort"
            onClick={() => ouvrir('locataire', o.locataireId)}>{o.nom}</button>
        </p>
        <span className="ann-personne-actions">
          <span className="ann-role-capsule">{o.encours ? 'En place' : 'Parti'}</span>
        </span>
      </div>
      <dl className="ann-champs">
        <dt>{o.encours ? 'Entré le' : 'Occupation'}</dt>
        <dd>
          {o.entree === null && o.sortie === null
            ? <span className="ann-inconnu">dates non renseignées</span>
            : periodeOccupation(o.entree, o.sortie)}
        </dd>
        <dt>Adresse postale</dt>
        <dd>{adresse !== '' ? adresse : <span className="ann-inconnu">non renseignée</span>}</dd>
        <dt>Téléphone{tels.length > 1 ? 's' : ''}</dt>
        <dd>
          {tels.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
            <ul className="ann-coords">
              {tels.map((c) => (
                <li key={c.valeur} className="ann-coord">
                  <a className="ann-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
                  <span className="ann-libelle">{c.libelle ?? 'Téléphone'}</span>
                  <BoutonCopier valeur={c.affichage} quoi="ce numéro" />
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>E-mail{mails.length > 1 ? 's' : ''}</dt>
        <dd>
          {mails.length === 0 ? <span className="ann-inconnu">non renseigné</span> : (
            <ul className="ann-coords">
              {mails.map((c) => (
                <li key={c.valeur} className="ann-coord">
                  {onEcrire
                    ? <button type="button" className="ann-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
                    : <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
                  <span className="ann-libelle">{c.libelle ?? 'E-mail'}</span>
                  <BoutonCopier valeur={c.valeur} quoi="cette adresse" />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </article>
  );
}

/**
 * ══ 🔴🔴 LA FICHE D'UN BIEN — ÉTAPE B ═════════════════════════════════════════════════════════════════════════
 *
 * Arno : « En-tête : adresse, lot, type, surface, propriétaire(s) (liens vers leur fiche), dossier Drive.
 * LOCATAIRE(S) EN PLACE […] HISTORIQUE DES LOCATAIRES […] VIE DU BIEN ».
 *
 * ═══ « LES OCCUPANTS DU MÊME BAIL », ET CE QUE LA BASE EN SAIT ════════════════════════════════════════════════
 * Un bail n'existe pas comme objet : il n'y a que des OCCUPATIONS (une personne, un lot, deux dates). Deux
 * personnes d'un même foyer feraient donc deux occupations de MÊMES DATES — mesuré le 29/09/2026 : il n'y en a
 * AUCUNE dans la base, et 116 fiches de locataires sur 510 nomment pourtant deux personnes dans leur nom
 * (« ABGRALL CAYREY Chloé et Romain »).
 *
 * 🔴 ON NE DÉCOUPE PAS CES NOMS — rien ne dit quelle coordonnée est à qui. L'écran GROUPE donc par PÉRIODE : le
 * jour où deux personnes partageront une date d'entrée, elles s'afficheront ensemble, sans qu'une ligne change.
 * 🔭 L'étape C ouvre l'ajout d'un occupant : c'est là que le groupe en portera plusieurs, pour de vrai.
 */
function VueLot({ f, ouvrir, onHistorique, onEcrire, maintenant, onOuvrirFil }: {
  f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void; onHistorique?: (cible: Cible) => void;
  onEcrire?: (email: string) => void;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  const actuels = f.occupations.filter((o) => o.encours);
  const passes = f.occupations.filter((o) => !o.encours);
  /** Les occupations passées, groupées par PÉRIODE : un même bail rassemble ses occupants. */
  const baux = grouperParPeriode(passes);
  return (
    <>
      <header className="ann-tete">
        <div className="ann-tete-mots">
          <h3 className="ann-tete-nom">{titreLogement(f.adresse, f.commune)}</h3>
          <p className="ann-tete-sous">
            <span className="ann-role-capsule">Bien</span>
            <span className="ann-etiq">lot {f.numero}</span>
            {f.nature && <span className="ann-etiq">{f.nature}</span>}
            {f.typeBien && <span className="ann-etiq">{f.typeBien}</span>}
            {f.absent && <span className="ann-etiq ann-etiq--absent">absent du dernier export</span>}
          </p>
        </div>
        <div className="ann-tete-actions">
          {f.driveDossierId !== null && (
            <a className="svv-btn svv-btn-outline gst-btn" href={`${DRIVE_DOSSIER}${f.driveDossierId}`}
              target="_blank" rel="noreferrer">Dossier Drive ↗</a>
          )}
        </div>
      </header>

      <section className="ann-bloc">
        <div className="ann-personne">
          <dl className="ann-champs">
            <dt>Adresse</dt>
            <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
            {f.immeuble && <><dt>Immeuble</dt><dd>{f.immeuble}</dd></>}
            <dt>Type</dt>
            <dd>
              {[f.nature, f.typeBien].filter((x) => x).join(' · ') || <span className="ann-inconnu">non renseigné</span>}
            </dd>
            <dt>Surface</dt>
            {/* 🔴 AUCUNE COLONNE DE SURFACE n'existe dans le schéma : on le DIT, on ne devine pas depuis le type. */}
            <dd>{f.surfaceM2 === null ? <span className="ann-inconnu">non renseignée</span> : `${f.surfaceM2} m²`}</dd>
            <dt>Propriétaire</dt>
            <dd>
              {f.proprietaireId !== null ? (
                <>
                  <button type="button" className="ann-lien ann-lien--fort"
                    onClick={() => ouvrir('proprietaire', f.proprietaireId as number)}>{f.proprietaireNom}</button>
                  {f.proprietaireContacts.length > 0 && (
                    <ul className="ann-coords">
                      {f.proprietaireContacts.map((c) => (
                        <li key={`${c.sorte}-${c.valeur}`} className="ann-coord">
                          {c.sorte === 'telephone'
                            ? <a className="ann-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
                            : onEcrire
                              ? <button type="button" className="ann-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
                              : <a className="ann-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
                          <span className="ann-libelle">{c.libelle ?? (c.sorte === 'telephone' ? 'Téléphone' : 'E-mail')}</span>
                          <BoutonCopier valeur={c.sorte === 'telephone' ? c.affichage : c.valeur}
                            quoi={c.sorte === 'telephone' ? 'ce numéro' : 'cette adresse'} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <span className="ann-inconnu">
                  {f.proprietaireNom || 'non rattaché'} — nom porté par plusieurs fiches WIPPIMMO, non tranché
                </span>
              )}
            </dd>
            <dt>En gestion</dt>
            <dd>
              {f.debut ? <>depuis le {formaterDateIso(f.debut)}</> : <span className="ann-inconnu">date non renseignée</span>}
              {f.fin && <> · <strong>fin de gestion le {formaterDateIso(f.fin)}</strong></>}
            </dd>
          </dl>
        </div>
      </section>

      <section className="ann-bloc" aria-labelledby="ann-occ">
        <h4 className="ann-bloc-titre" id="ann-occ">
          Locataire{actuels.length > 1 ? 's' : ''} en place
          <span className="gst-compte">{actuels.length}</span>
        </h4>
        {actuels.length === 0
          ? <p className="ann-gris">Aucun bail en cours — le logement est vacant.</p>
          : actuels.map((o) => (
            <BlocOccupant key={`a-${o.locataireId}-${o.entree ?? ''}`} o={o} ouvrir={ouvrir} onEcrire={onEcrire} />
          ))}
      </section>

      {/* ⚠️ L'HISTORIQUE EST TOUJOURS LÀ, jamais derrière un survol : c'est la question qu'on pose juste après
          « qui habite ici ? » — « et avant ? ». Chaque occupation passée porte ses coordonnées, comme demandé. */}
      <section className="ann-bloc" aria-labelledby="ann-histo-loc">
        <h4 className="ann-bloc-titre" id="ann-histo-loc">
          Historique des locataires <span className="gst-compte">{passes.length}</span>
        </h4>
        {baux.length === 0 ? <p className="ann-gris">Aucun locataire passé connu.</p> : baux.map((bail, i) => (
          <div key={`bail-${i}`} className="ann-bail">
            {bail.length > 1 && (
              <p className="ann-bail-mot">{bail.length} occupants du même bail</p>
            )}
            {bail.map((o) => (
              <BlocOccupant key={`p-${o.locataireId}-${o.entree ?? ''}-${o.sortie ?? ''}`}
                o={o} ouvrir={ouvrir} onEcrire={onEcrire} />
            ))}
          </div>
        ))}
      </section>

      <VieDuBien lotCle={f.numero} maintenant={maintenant} onOuvrirFil={onOuvrirFil} />

      <p className="ann-discret">
        <BoutonHistorique cible={{ sorte: 'lot', cle: f.numero, id: null }} onHistorique={onHistorique} />
      </p>
    </>
  );
}

/**
 * ══ 🔴 GROUPER LES OCCUPATIONS PAR BAIL ═══════════════════════════════════════════════════════════════════════
 *
 * Un « bail » se reconnaît à ses DATES : deux personnes entrées le même jour et sorties le même jour occupaient
 * le même logement ensemble. C'est la seule lecture que la base permette — elle ne porte pas d'objet « bail ».
 *
 * ⚠️ AUCUN GROUPE AUJOURD'HUI, et c'est mesuré : zéro couple (lot, entrée) porté par deux personnes au
 * 29/09/2026. Le groupement est écrit quand même, parce que l'étape C va créer ces cas — et qu'un écran qui
 * n'aurait pas prévu deux occupants les afficherait comme deux baux successifs, ce qui serait faux. PUR.
 */
function grouperParPeriode(occupations: readonly OccupationDuLot[]): OccupationDuLot[][] {
  const groupes: OccupationDuLot[][] = [];
  const index = new Map<string, number>();
  for (const o of occupations) {
    const cle = `${o.entree ?? '?'}|${o.sortie ?? '?'}`;
    const place = index.get(cle);
    if (place === undefined) { index.set(cle, groupes.length); groupes.push([o]); }
    else groupes[place].push(o);
  }
  return groupes;
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
/* ══ « NON RENSEIGNE » : UN FAIT, DIT EN ITALIQUE ET PLUS CLAIR QUE LA VALEUR — jamais un vide, qui se lirait
   comme un oubli d'affichage.
   🔴 LE GRIS EST celui de --color-svv-muted (#5c6573), PAS --color-svv-label (#8a929e). Arno demande « gris clair » ET
   « contraste AA verifie » : mesure sur fond blanc, label tombe a 3,0:1 — sous les 4,5:1 exiges pour un texte de
   cette taille. Muted tient 6,4:1, reste nettement plus clair que l'encre des valeurs (#16202c, 15,3:1), et
   l'ITALIQUE fait le reste du travail de distinction. Un contraste qu'on ne peut pas lire n'est pas une nuance. */
.ann-inconnu{font-size:.85rem;color:var(--color-svv-muted);font-style:italic}
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
/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FICHES-ANNUAIRE — LE LANGAGE VISUEL DES FICHES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Arno : « beaucoup trop blanc, il faut plus de contraste et de relief, tout en restant dans le style global du
   site, sans etre extravagant ».

   CE QUI CHANGE, ET RIEN D'AUTRE :
     · un FOND DE PAGE legerement teinte (le gris de la charte) sous la fiche, pour que les blocs BLANCS s'en
       detachent — c'est le relief, et il ne coute aucune couleur nouvelle ;
     · chaque bloc et chaque carte : surface blanche, bordure fine, ombre douce ;
     · un EN-TETE de fiche distinct : le nom en grand, le role en capsule, les actions a droite ;
     · des titres de section porteurs d'un FILET a la couleur de la charte ;
     · des libelles en gris moyen, des valeurs en encre appuyee, « non renseigne » en italique clair.

   🔴 AUCUNE COULEUR NOUVELLE. Tout sort des jetons existants (--color-svv-*), y compris en Sombre, ou les
   surfaces sont GRADUEES (bg < field < surface) plutot que posees sur du noir plat.
   🔴 LE ROUGE NE DECORE JAMAIS : il ne sert qu'aux actions, aux filets de titre et a l'anneau de focus.

   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}

/* LE FOND TEINTE de la fiche. En clair, le gris de la charte ; en sombre, le fond de page, plus SOMBRE que la
   surface des blocs — dans les deux cas, les blocs se detachent par la LUMINOSITE, jamais par une teinte. */
.ann-fiche{background:var(--color-svv-field);border-radius:14px;padding:14px;
  display:flex;flex-direction:column;gap:.9rem;min-width:0}
.svv-adm-root[data-theme='dark'] .ann-fiche{background:var(--color-svv-bg)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-fiche{background:var(--color-svv-bg)}
}

/* ── L'EN-TETE DE FICHE ───────────────────────────────────────────────────────────────────────────────────────
   Un bandeau sobre : le nom en grand a gauche, le role en capsule dessous, les actions a droite. */
.ann-tete{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.8rem;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05),0 6px 16px rgba(22,32,44,.05);padding:14px 16px}
.svv-adm-root[data-theme='dark'] .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-tete{box-shadow:0 1px 2px rgba(0,0,0,.35),0 6px 16px rgba(0,0,0,.28)}
}
.ann-tete-mots{flex:1 1 16rem;min-width:0;display:flex;flex-direction:column;gap:.35rem}
.ann-tete-nom{margin:0;font-size:1.35rem;line-height:1.2;font-weight:700;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.ann-tete-sous{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0}
/* LE ROLE EN CAPSULE — un MOT dans une pastille, jamais une couleur seule. */
.ann-role-capsule{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  color:var(--color-svv-muted);background:var(--color-svv-field);border:1px solid var(--color-svv-line);
  border-radius:999px;padding:.12rem .6rem}
.ann-tete-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-left:auto}

/* ── LES BLOCS ────────────────────────────────────────────────────────────────────────────────────────────── */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:0}
/* LE FILET de la charte devant chaque titre de section : deux pixels de rouge, et rien de plus. */
.ann-bloc-titre{margin:0;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);display:flex;align-items:center;gap:.5rem}
.ann-bloc-titre::before{content:"";flex:0 0 auto;width:3px;height:1em;border-radius:2px;
  background:var(--color-svv-red)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);padding:14px 16px;display:flex;flex-direction:column;gap:.6rem}
.svv-adm-root[data-theme='dark'] .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-personne{box-shadow:0 1px 2px rgba(0,0,0,.3)}
}
/* L'EN-TETE D'UN BLOC DE PERSONNE : son nom a gauche, ses actions (Modifier) a droite. */
.ann-personne-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;flex:1 1 auto;min-width:0}
.ann-personne-actions{display:flex;flex-wrap:wrap;gap:.4rem;margin-left:auto}
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .9rem;margin:0}
/* LIBELLE en gris moyen, VALEUR en encre appuyee : c'est ce qui donne le contraste demande. */
.ann-champs dt{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);margin-top:.4rem}
.ann-champs dd{margin:0;font-size:.92rem;font-weight:500;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9.5rem 1fr}
  .ann-champs dt{margin-top:.22rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.25rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.ann-libelle{font-size:.7rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  padding:.15rem .5rem;font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* Un occupant PARTI reste parfaitement lisible : il est seulement pose sur le gris de la page, pas efface. */
.ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
.svv-adm-root[data-theme='dark'] .ann-personne--passe{background:var(--color-svv-field);box-shadow:none}
/* UN BAIL = un groupe d'occupants. Quand il en porte plusieurs, un mot le DIT — jamais un simple alignement. */
.ann-bail{display:flex;flex-direction:column;gap:.4rem}
.ann-bail+.ann-bail{margin-top:.5rem;padding-top:.5rem;border-top:1px dashed var(--color-svv-line)}
.ann-bail-mot{margin:0;font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}

/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────── */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);display:flex;flex-direction:column;overflow:hidden;min-width:0;
  transition:box-shadow .15s ease,transform .15s ease,border-color .15s ease}
/* LE SURVOL SOULEVE LA CARTE — l'elevation est un APPUI, jamais l'information : tout reste ecrit. */
.ann-carte:hover{box-shadow:0 2px 4px rgba(22,32,44,.07),0 10px 24px rgba(22,32,44,.09);
  border-color:var(--color-svv-line-strong);transform:translateY(-1px)}
@media (prefers-reduced-motion:reduce){.ann-carte{transition:none}.ann-carte:hover{transform:none}}
.svv-adm-root[data-theme='dark'] .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
.svv-adm-root[data-theme='dark'] .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .ann-carte{box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .svv-adm-root:not([data-theme='light']) .ann-carte:hover{box-shadow:0 2px 6px rgba(0,0,0,.45),0 10px 24px rgba(0,0,0,.35)}
}
.ann-carte--ancien{background:var(--color-svv-field)}
.ann-carte-corps{display:flex;flex-direction:column;gap:0;align-items:stretch;text-align:left;
  background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'EN-TETE DE CARTE, TEINTE : il porte l'adresse et les etiquettes, et separe la carte de son contenu. */
.ann-carte-tete{display:flex;flex-direction:column;gap:.35rem;padding:11px 14px;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line)}
.ann-carte--ancien .ann-carte-tete{background:var(--color-svv-surface)}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.2rem;padding:11px 14px 8px}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:7.4rem}
/* LE LOCATAIRE EN PLACE est MIS EN VALEUR : c'est ce qu'on cherche sur une carte de bien. */
.ann-fait--locataire{background:var(--color-svv-green-soft);border-radius:.4rem;margin:.1rem -.35rem;
  padding:.2rem .35rem}
.ann-fait--locataire .ann-fait-valeur{font-weight:700;color:var(--color-svv-green-ink)}
/* « Vacant » est un MOT, jamais une couleur seule : il se lit en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.2rem 0 0}
/* ══ LOT FICHES-ANNUAIRE — LE HAUT DE LA FICHE, ET LES CARTES DE BIENS ════════════════════════════════════════
   AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne dix fois dans ce depot, et dix fois dans un commentaire. */
.ann-retour-haut{flex:0 0 auto}
/* Le champ compact d'une fiche : il prend la place qui reste, sans pousser la fiche vers le bas. */
.ann-champ--compact{flex:1 1 14rem;min-width:0;min-height:38px;font-size:.88rem}
.ann-bascule{margin:0}
/* Un BLOC de fiche : un titre, un cadre discret, et de l'air. C'est l'unite de lecture de la fiche. */
.ann-bloc{display:flex;flex-direction:column;gap:.5rem;margin-top:.2rem}
.ann-bloc-titre{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.ann-personne{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  padding:12px 14px;display:flex;flex-direction:column;gap:.5rem}
.ann-personne-nom{margin:0;font-size:1rem;font-weight:700;color:var(--color-svv-ink);
  display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
/* Deux colonnes des 520 px, une seule en dessous : un intitule au-dessus de sa valeur reste lisible au telephone. */
.ann-champs{display:grid;grid-template-columns:1fr;gap:.15rem .8rem;margin:0}
.ann-champs dt{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);margin-top:.35rem}
.ann-champs dd{margin:0;font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (min-width:520px){
  .ann-champs{grid-template-columns:9rem 1fr}
  .ann-champs dt{margin-top:.2rem}
}
.ann-coords{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.2rem}
.ann-coord{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
/* Le LIBELLE d'origine (« Mobile », « Email »). Il dit LEQUEL des trois numeros on regarde. */
.ann-libelle{font-size:.72rem;font-weight:700;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:999px;padding:.05rem .45rem}
.ann-copier{background:none;border:1px solid var(--color-svv-line);border-radius:.4rem;padding:.15rem .5rem;
  font:inherit;font-size:.72rem;color:var(--color-svv-muted);cursor:pointer;min-height:28px}
.ann-copier:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.ann-copier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-depuis{margin:0;font-size:.85rem;color:var(--color-svv-ink)}
/* ── LES CARTES DE BIENS ─────────────────────────────────────────────────────────────────────────────────────
   Une grille qui se remplit toute seule : une colonne au telephone, deux ou trois sur un grand ecran. */
.ann-cartes{list-style:none;margin:0;padding:0;display:grid;gap:10px;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}
.ann-carte{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:12px;
  display:flex;flex-direction:column;overflow:hidden;min-width:0}
.ann-carte--ancien{background:var(--color-svv-field)}
/* LA CARTE ENTIERE EST LE BOUTON. Les deux liens qui en sortent sont DANS LE PIED, a cote — jamais dedans :
   un bouton dans un bouton est du HTML invalide et injouable au clavier. */
.ann-carte-corps{display:flex;flex-direction:column;gap:.45rem;align-items:stretch;text-align:left;
  background:none;border:0;padding:12px 14px 8px;font:inherit;color:inherit;cursor:pointer;width:100%}
.ann-carte-corps:hover{background:var(--color-svv-field)}
.ann-carte--ancien .ann-carte-corps:hover{background:var(--color-svv-surface)}
.ann-carte-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.ann-carte-titre{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ann-carte-sous{display:flex;flex-wrap:wrap;gap:.3rem}
.ann-carte-faits{display:grid;grid-template-columns:1fr;gap:.15rem}
.ann-fait{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.82rem;color:var(--color-svv-ink)}
.ann-fait-mot{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto;min-width:8.5rem}
/* « Vacant » est un MOT, jamais une couleur seule : c'est un fait, et il doit se lire en noir et blanc. */
.ann-vacant{font-weight:700;color:var(--color-svv-red)}
.ann-carte-pied{display:flex;flex-wrap:wrap;gap:.8rem;padding:0 14px 10px;align-items:center}
.ann-carte-pied .ann-lien{min-height:32px;font-size:.8rem}
/* ── LE REPLI DES ANCIENS BIENS ───────────────────────────────────────────────────────────────────────────── */
.ann-repli{display:flex;align-items:center;gap:.4rem;background:none;border:0;padding:.3rem 0;margin:0;
  font:inherit;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted);cursor:pointer;min-height:38px;text-align:left}
.ann-repli:hover{color:var(--color-svv-ink)}
.ann-repli:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ann-repli-triangle{display:inline-block;color:var(--color-svv-red);transition:transform .15s ease}
.ann-repli-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.ann-repli-triangle{transition:none}}
.ann-discret{margin:.4rem 0 0}
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
