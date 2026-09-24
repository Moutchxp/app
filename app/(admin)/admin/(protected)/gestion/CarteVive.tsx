'use client';

import { useCallback, useEffect, useState } from 'react';
import { BlocRepliable } from '../permis/BlocRepliable';
import { ChoisirEvenement } from './ChoisirEvenement';
import { MenuDiscret } from './MenuDiscret';
import { Conversation, MessageConversation } from './Conversation';
import { agirSurLeMail, DeplacerVers, type Rapport } from './gestesMail';
import type { CarteDetail, FilDeCarte, MailParti, MessageDeFil } from '../../../../lib/gestion/carteRepo';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
import { depuis, formaterDateFr, formaterTaille, libelleEtat, libelleSens } from '../../../../lib/gestion/ecran';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';

/**
 * LOT 4c — LA CARTE VIVANTE : le côté droit de l'écran cesse d'être une liste pour devenir un dossier qu'on ouvre.
 *
 * CHARGEMENT PARESSEUX, patron `BlocRepliable` (réutilisé tel quel, pas recopié) : une carte qu'on ne déplie pas ne
 * lance AUCUNE requête, et un échange qu'on ne déplie pas non plus. Avec 443 échanges dans la file, c'est ce qui fait
 * la différence entre un écran qui s'ouvre et un écran qui rame. Une fois ouvert, le contenu reste monté : replier
 * puis rouvrir ne relance rien.
 *
 * ⚠️ LES PIÈCES JOINTES SONT SERVIES PAR L'APPLICATION (`/api/admin/gestion/pieces/[id]`). Aucune URL de stockage
 * n'arrive jusqu'au navigateur : une URL signée serait un laissez-passer transmissible vers le bail ou le RIB d'un
 * locataire, alors qu'ici le droit est relu en base à chaque ouverture.
 *
 * MOBILE D'ABORD : tout casse en fin de ligne, cibles ≥ 44 px, aucune interaction au survol seul, et pas une seule
 * couleur en dur — uniquement des jetons `--color-svv-*`.
 */

// LOT 5b — `Rapport` vit dans `gestesMail` (brique partagée avec la vue conversation, sans cycle d'imports).
//   RÉEXPORTÉ ici : aucun import existant ne casse.
export type { Rapport };

type VueCarte = { v: 'charge' } | { v: 'ok'; d: CarteDetail } | { v: 'erreur'; m: string };

/**
 * Va chercher une carte et RENVOIE le résultat sans toucher à aucun état : c'est l'appelant qui décide quoi en faire.
 * Hors du composant, donc réutilisable par l'effet de montage comme par le « Réessayer », sans dupliquer la lecture.
 * Un refus (403) n'est pas une panne, et il est dit pour ce qu'il est.
 */
async function chargerCarte(evenementId: number): Promise<VueCarte> {
  try {
    const res = await fetch(`/api/admin/gestion/evenements/${evenementId}`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    return { v: 'ok', d: (await res.json()) as CarteDetail };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/** Même principe pour les messages d'un échange : on rapporte, on ne décide pas. */
async function chargerMessages(filId: number): Promise<
  { v: 'ok'; messages: MessageDeFil[]; partis: MailParti[] } | { v: 'erreur'; m: string }
> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/messages`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    const data = (await res.json()) as { messages: MessageDeFil[]; partis?: MailParti[] };
    return { v: 'ok', messages: data.messages, partis: data.partis ?? [] };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}


export function CarteVive({ carte, maintenant, onGeste }: {
  carte: CarteEvenement;
  maintenant: Date;
  onGeste: Rapport;
}) {
  // Le détail, une fois chargé, fait foi sur le résumé : après une correction du « quoi », le titre replié doit dire
  //   le nouveau libellé sans attendre un rechargement de tout l'écran.
  const [detail, setDetail] = useState<CarteDetail | null>(null);
  const objet = detail?.objet ?? carte.objet;
  const etat = detail?.etat ?? carte.etat;

  return (
    <li className="gst-item">
      <BlocRepliable
        titreClasseExtra="gst-repli"
        titre={
          <span className="gst-carte-titre">
            <span className="gst-objet">{objet}</span>
            {carte.attend && <span className="gst-attend">attend une réponse</span>}
            <span className="gst-carte-bas">
              <span className="gst-ref">{carte.reference}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span>{libelleEtat(etat)}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span>{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}</span>
              {carte.dernierEchangeLe && <>
                <span className="gst-sep" aria-hidden="true">·</span>
                <span title={formaterDateFr(carte.dernierEchangeLe)}>dernier échange {depuis(carte.dernierEchangeLe, maintenant)}</span>
              </>}
            </span>
          </span>
        }
      >
        {() => <CorpsCarte evenementId={carte.evenementId} maintenant={maintenant} onDetail={setDetail} onGeste={onGeste} />}
      </BlocRepliable>
    </li>
  );
}

/** Le contenu d'une carte dépliée. Monté au PREMIER dépliage — c'est là, et seulement là, que la requête part. */
function CorpsCarte({ evenementId, maintenant, onDetail, onGeste }: {
  evenementId: number; maintenant: Date; onDetail: (d: CarteDetail) => void; onGeste: Rapport;
}) {
  const [etatVue, setEtatVue] = useState<VueCarte>({ v: 'charge' });
  const [occupe, setOccupe] = useState(false);
  const [edition, setEdition] = useState(false);

  /** Relit la carte et POSE l'état. Sert au « Réessayer » et à la relecture qui suit un geste. */
  const lire = useCallback(async () => {
    const r = await chargerCarte(evenementId);
    setEtatVue(r);
    if (r.v === 'ok') onDetail(r.d);
  }, [evenementId, onDetail]);

  // Chargement au montage — c'est-à-dire au PREMIER dépliage, puisque `BlocRepliable` ne monte son enfant qu'alors.
  //   Le premier acte est un `await` : aucun setState ne part du corps de l'effet (pas de cascade de rendus), et
  //   `annule` empêche d'écrire dans un composant démonté entre-temps. Même patron que les autres écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await chargerCarte(evenementId);
      if (annule) return;
      setEtatVue(r);
      if (r.v === 'ok') onDetail(r.d);
    })();
    return () => { annule = true; };
  }, [evenementId, onDetail]);

  /** Un geste sur la carte : un appel, un compte rendu, une relecture. Jamais un silence. */
  const agir = useCallback(async (corps: unknown, succes: string) => {
    if (occupe) return;
    setOccupe(true);
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${evenementId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Modification impossible.'); return; }
      onGeste(succes);
      setEdition(false);
      await lire();
    } catch {
      onGeste('Modification impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  }, [occupe, evenementId, onGeste, lire]);

  if (etatVue.v === 'charge') return <p className="gst-info" role="status">Chargement du dossier…</p>;
  if (etatVue.v === 'erreur') {
    return (
      <div className="gst-corps">
        <p className="gst-erreur" role="status">{etatVue.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void lire()}>Réessayer</button>
      </div>
    );
  }

  const d = etatVue.d;
  return (
    <div className="gst-corps">
      <EtatCarte etat={d.etat} traiteLe={d.traiteLe} traitePar={d.traitePar} occupe={occupe}
        onEtat={(e) => void agir({ etat: e }, `Événement ${d.reference} : ${libelleEtat(e).toLowerCase()}.`)} />

      {edition
        ? <FormulaireCarte detail={d} occupe={occupe}
            onValider={(champs) => void agir(champs, `Événement ${d.reference} mis à jour.`)}
            onAnnuler={() => setEdition(false)} />
        : <ResumeCarte detail={d} maintenant={maintenant} onModifier={() => setEdition(true)} occupe={occupe} />}

      <h3 className="gst-sous-titre">
        Échanges rattachés <span className="gst-compte">{d.fils.length}</span>
      </h3>
      {d.fils.length === 0 && d.mailsDeplaces.length === 0
        ? <p className="gst-vide">Aucun échange rattaché. Un échange détaché retourne dans la file, il n’est jamais perdu.</p>
        : (
          <ul className="gst-liste">
            {d.fils.map((f) => (
              <FilRattache key={f.filId} fil={f} evenementId={evenementId} maintenant={maintenant} onGeste={onGeste} />
            ))}
          </ul>
        )}

      {/* LES MAILS VENUS SEULS — à part, parce que ce ne sont pas des échanges, et en disant d'où ils sortent. */}
      {d.mailsDeplaces.length > 0 && (
        <>
          <h3 className="gst-sous-titre">
            Mails déplacés ici <span className="gst-compte">{d.mailsDeplaces.length}</span>
          </h3>
          <ol className="gst-fil">
            {d.mailsDeplaces.map((m) => (
              <li key={m.message.messageId} className="gst-item gst-item--fil">
                <p className="gst-note">
                  Venu de l’échange « {m.objetDuFil?.trim() || '(sans objet)'} », qui l’annonce toujours.
                </p>
                <ol className="gst-fil">
                  {/* LOT 5b — la MÊME brique que dans une conversation, ouverte d'emblée : un mail venu seul n'a pas
                      de fil à parcourir, il n'y a rien à replier. Le geste « Détacher ce mail » est conservé. */}
                  <MessageConversation message={m.message} maintenant={maintenant} ouvert onBasculer={() => {}}
                    onRemettre={() => void agirSurLeMail(m.message.messageId, null, onGeste)} />
                </ol>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/** Les trois états, en toutes lettres. « Traité » DIT sa date : un dossier clos sans date serait introuvable après. */
function EtatCarte({ etat, traiteLe, traitePar, occupe, onEtat }: {
  etat: CarteDetail['etat']; traiteLe: string | null; traitePar: string | null; occupe: boolean;
  onEtat: (e: CarteDetail['etat']) => void;
}) {
  const choix: CarteDetail['etat'][] = ['a_traiter', 'en_cours', 'traite'];
  return (
    <div className="gst-bloc">
      <div className="gst-voies" role="group" aria-label="État de l’événement">
        {choix.map((c) => (
          <button key={c} type="button" className={`gst-voie${etat === c ? ' gst-voie--active' : ''}`}
            aria-pressed={etat === c} disabled={occupe || etat === c} onClick={() => onEtat(c)}>
            {libelleEtat(c)}
          </button>
        ))}
      </div>
      {etat === 'traite' && traiteLe && (
        <p className="gst-note">Traité le {formaterDateFr(traiteLe)}{traitePar ? ` par ${traitePar}` : ''}. Rouvrable à tout moment : il suffit de rechoisir un état.</p>
      )}
    </div>
  );
}

/** Ce que porte la carte, en lecture. Un champ vide est DIT vide plutôt que laissé deviner. */
function ResumeCarte({ detail, maintenant, onModifier, occupe }: {
  detail: CarteDetail; maintenant: Date; onModifier: () => void; occupe: boolean;
}) {
  const demandeur = detail.demandeurNom ?? detail.demandeurEmail;
  return (
    <div className="gst-bloc">
      <dl className="gst-fiche">
        <dt>Quoi</dt><dd>{detail.objet}</dd>
        <dt>Qui demande</dt><dd>{demandeur ?? <span className="gst-absent">non renseigné</span>}</dd>
        <dt>Adresse</dt><dd>{detail.adresseLibre ?? <span className="gst-absent">non renseignée</span>}</dd>
        <dt>Ouvert</dt>
        <dd><span title={formaterDateFr(detail.ouvertLe)}>{depuis(detail.ouvertLe, maintenant)}</span>{detail.ouvertPar ? ` par ${detail.ouvertPar}` : ''}</dd>
      </dl>
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onModifier}>Modifier</button>
      </div>
    </div>
  );
}

/** La correction à la main. Le pré-remplissage ne propose que ce qui est écrit dans le mail : il fallait pouvoir corriger. */
function FormulaireCarte({ detail, occupe, onValider, onAnnuler }: {
  detail: CarteDetail; occupe: boolean;
  onValider: (champs: { objet: string; demandeurNom: string; adresseLibre: string }) => void;
  onAnnuler: () => void;
}) {
  const [objet, setObjet] = useState(detail.objet);
  const [demandeur, setDemandeur] = useState(detail.demandeurNom ?? detail.demandeurEmail ?? '');
  const [adresse, setAdresse] = useState(detail.adresseLibre ?? '');
  return (
    <div className="gst-bloc gst-champs">
      <label className="gst-champ">
        <span className="svv-label">Quoi</span>
        <input className="gst-saisie" value={objet} onChange={(e) => setObjet(e.target.value)} maxLength={300} />
      </label>
      <label className="gst-champ">
        <span className="svv-label">Qui demande</span>
        <input className="gst-saisie" value={demandeur} onChange={(e) => setDemandeur(e.target.value)} maxLength={300} />
      </label>
      <label className="gst-champ">
        <span className="svv-label">Adresse (texte libre)</span>
        <input className="gst-saisie" value={adresse} onChange={(e) => setAdresse(e.target.value)} maxLength={300} />
      </label>
      <p className="gst-note">Un champ vidé est effacé ; le « quoi », lui, ne peut pas rester vide — sans titre, la carte devient introuvable.</p>
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe || objet.trim() === ''}
          onClick={() => onValider({ objet, demandeurNom: demandeur, adresseLibre: adresse })}>
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/**
 * Un échange rattaché : replié, il ne coûte rien ; déplié, il montre la conversation entière.
 *
 * Ses commandes vivent dans un MENU DISCRET, posé dans le coin — pas dans une rangée de boutons. Le titre d'un
 * `BlocRepliable` EST un bouton : on n'imbrique donc pas le menu dedans (ce serait un bouton dans un bouton, invalide
 * et injouable au clavier), il est son VOISIN, placé dans le coin par le CSS.
 */
function FilRattache({ fil, evenementId, maintenant, onGeste }: {
  fil: FilDeCarte; evenementId: number; maintenant: Date; onGeste: Rapport;
}) {
  const [deplacer, setDeplacer] = useState(false);
  return (
    <li className="gst-item gst-item--fil">
      <div className="gst-coin">
        <MenuDiscret titre="Actions sur cet échange" entrees={[
          { libelle: 'Déplacer l’échange…', onChoisir: () => setDeplacer(true) },
          { libelle: 'Détacher l’échange', discrete: true, onChoisir: () => void detacherFil(fil.filId, onGeste) },
        ]} />
      </div>
      {deplacer && (
        <DeplacerVers
          titre={`Déplacer l’échange « ${fil.objet?.trim() || '(sans objet)'} » vers`}
          exclure={evenementId}
          onAnnuler={() => setDeplacer(false)}
          onValider={async (cible) => {
            await deplacerFil(fil.filId, cible, onGeste);
            setDeplacer(false);
          }} />
      )}
      <BlocRepliable
        titreClasseExtra="gst-repli gst-repli--avec-menu"
        titre={
          <span className="gst-carte-titre">
            <span className="gst-objet">{fil.objet?.trim() || '(sans objet)'}</span>
            {fil.attend && <span className="gst-attend">attend une réponse</span>}
            <span className="gst-carte-bas">
              <span className="gst-qui">{fil.interlocuteur ?? '(expéditeur inconnu)'}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span title={formaterDateFr(fil.dernierLe)}>{depuis(fil.dernierLe, maintenant)}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span>{fil.nbMessages} message{fil.nbMessages > 1 ? 's' : ''}</span>
              {fil.nbPieces > 0 && <>
                <span className="gst-sep" aria-hidden="true">·</span>
                <span>{fil.nbPieces} pièce{fil.nbPieces > 1 ? 's' : ''} jointe{fil.nbPieces > 1 ? 's' : ''}</span>
              </>}
            </span>
          </span>
        }
      >
        {() => <Conversation filId={fil.filId} maintenant={maintenant} onGeste={onGeste} avecBandeau={false} />}
      </BlocRepliable>
    </li>
  );
}

/**
 * DÉPLACER = RATTACHER AILLEURS. Le geste existe déjà côté serveur (`affecter`) et il est atomique : l'ancienne
 * affectation est désactivée et la nouvelle créée dans UNE transaction, après une lecture verrouillée — il n'existe
 * aucun instant où l'échange n'a plus de carte. Rien de nouveau n'est écrit ici, seule la manière de le demander change.
 */
async function deplacerFil(filId: number, evenementId: number, onGeste: Rapport): Promise<void> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evenementId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reference?: string; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Déplacement impossible.'); return; }
    onGeste(`Échange déplacé vers ${data.reference ?? 'l’événement choisi'}.`, { rechargerTout: true });
  } catch {
    onGeste('Déplacement impossible : le serveur n’a pas répondu.');
  }
}

/** DÉTACHER : l'échange retourne dans la file. Rien n'est supprimé — il y revient avec tous ses messages. */
async function detacherFil(filId: number, onGeste: Rapport): Promise<void> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Détachement impossible.'); return; }
    onGeste('Échange détaché : il est revenu dans la file, avec tous ses messages.', { rechargerTout: true });
  } catch {
    onGeste('Détachement impossible : le serveur n’a pas répondu.');
  }
}


/**
 * LOT 5b — `CorpsFil`, `Message` et leur ligne de pièce jointe ONT DÉMÉNAGÉ dans `Conversation.tsx`, qui est désormais
 * la SEULE vue conversation du module — utilisée par la carte, par le poste de tri et par la boîte mail.
 *
 * RIEN N'EST PERDU au passage, et c'est la condition pour que ce déménagement soit acceptable : les gestes par message
 * (déplacer ce mail, le détacher), la liste des mails sortis de l'échange avec leur bouton « Remettre dans son
 * échange », les pièces servies par l'application, les images de signature repliées et l'historique cité repliable
 * sont tous dans la nouvelle vue. Elle y AJOUTE l'en-tête complet, le dépliage message par message et les messages
 * tenus hors de la file.
 */
