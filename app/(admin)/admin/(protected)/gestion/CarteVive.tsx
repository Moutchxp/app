'use client';

import { useCallback, useEffect, useState } from 'react';
import { BlocRepliable } from '../permis/BlocRepliable';
import { ChoisirEvenement } from './ChoisirEvenement';
import { MenuDiscret } from './MenuDiscret';
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

type Rapport = (message: string, options?: { rechargerTout?: boolean }) => void;

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

/** Déplace UN mail vers une autre carte, ou l'y remet. Le mail n'est jamais copié : seul son rattachement change. */
async function agirSurLeMail(
  messageId: number, cible: number | null, onGeste: Rapport,
): Promise<void> {
  try {
    const res = cible === null
      ? await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, { method: 'DELETE' })
      : await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evenementId: cible }),
      });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reference?: string; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Geste impossible sur ce mail.'); return; }
    onGeste(cible === null
      ? 'Mail remis dans son échange.'
      : `Mail déplacé vers ${data.reference ?? 'l’événement choisi'} — il reste dans son échange d’origine, qui l’annonce.`,
    { rechargerTout: true });
  } catch {
    onGeste('Geste impossible : le serveur n’a pas répondu.');
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
                  <Message message={m.message} maintenant={maintenant}
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
        {() => <CorpsFil filId={fil.filId} maintenant={maintenant} onGeste={onGeste} />}
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

/** Le petit panneau de destination : la MÊME recherche que partout ailleurs, et rien d'autre. */
function DeplacerVers({ titre, exclure, onValider, onAnnuler }: {
  titre: string; exclure: number | null;
  onValider: (evenementId: number) => Promise<void> | void;
  onAnnuler: () => void;
}) {
  const [choisi, setChoisi] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  return (
    <div className="gst-panneau">
      <p className="gst-panneau-titre">{titre}</p>
      <ChoisirEvenement choisi={choisi} onChoisir={setChoisi} exclure={exclure} autoFocus />
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={choisi === null || enCours}
          onClick={() => { setEnCours(true); void Promise.resolve(onValider(choisi as number)).finally(() => setEnCours(false)); }}>
          {enCours ? 'Déplacement…' : 'Déplacer'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={enCours} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/** Les messages d'un échange. Montés au dépliage — un fil jamais ouvert ne traverse jamais le réseau. */
function CorpsFil({ filId, maintenant, onGeste }: { filId: number; maintenant: Date; onGeste: Rapport }) {
  const [vue, setVue] = useState<
    { v: 'charge' } | { v: 'ok'; messages: MessageDeFil[]; partis: MailParti[] } | { v: 'erreur'; m: string }
  >({ v: 'charge' });
  const [deplacer, setDeplacer] = useState<number | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await chargerMessages(filId);
      if (!annule) setVue(r);
    })();
    return () => { annule = true; };
  }, [filId]);

  if (vue.v === 'charge') return <p className="gst-info" role="status">Chargement des messages…</p>;
  if (vue.v === 'erreur') return <p className="gst-erreur" role="status">{vue.m}</p>;

  return (
    <div className="gst-corps">
      <ol className="gst-fil">
        {vue.messages.map((m) => (
          <Message key={m.messageId} message={m} maintenant={maintenant}
            onDeplacer={() => setDeplacer(m.messageId)}
            onRemettre={() => void agirSurLeMail(m.messageId, null, onGeste)}
            panneau={deplacer === m.messageId ? (
              <DeplacerVers titre="Déplacer ce mail vers" exclure={null}
                onAnnuler={() => setDeplacer(null)}
                onValider={async (cible) => { await agirSurLeMail(m.messageId, cible, onGeste); setDeplacer(null); }} />
            ) : null} />
        ))}
      </ol>
      {/* LES MAILS SORTIS DE CET ÉCHANGE — annoncés, jamais effacés en silence, et remis d'un clic. */}
      {vue.partis.length > 0 && (
        <ul className="gst-partis">
          {vue.partis.map((p) => (
            <li key={p.messageId} className="gst-parti">
              <span>
                1 mail déplacé vers <span className="gst-ref">{p.reference}</span>
                {p.objet?.trim() ? ` — « ${p.objet.trim()} »` : ''}
              </span>
              <button type="button" className="gst-lien-bouton"
                onClick={() => void agirSurLeMail(p.messageId, null, onGeste)}>
                Remettre dans son échange
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* LOT 4d — le gros bouton « Détacher de cet événement » est devenu une entrée du menu « ⋯ » de l'échange :
          la fonction est CONSERVÉE, seule sa présentation change (décision d'Arno : pas de boutons partout). */}
      <p className="gst-note">Détacher ou déplacer ne supprime rien : par le menu « ⋯ » de l’échange, il retourne dans la file ou rejoint une autre carte, avec tous ses messages et ses pièces.</p>
    </div>
  );
}

/** UN message. Le texte est rendu TEL QUEL (jamais interprété comme du HTML) et respecte ses retours à la ligne. */
function Message({ message, maintenant, onDeplacer, onRemettre, panneau }: {
  message: MessageDeFil; maintenant: Date;
  onDeplacer?: () => void; onRemettre?: () => void; panneau?: React.ReactNode;
}) {
  const lisible = corpsLisible(message.corps);
  const { vraies, signatures } = trierPieces(message.pieces);
  return (
    <li className={`gst-msg gst-msg--${message.sens}`}>
      <div className="gst-msg-haut">
        <span className="gst-qui">{libelleSens(message.sens)} {message.deNom?.trim() || message.de}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(message.recuLe)}>{depuis(message.recuLe, maintenant)}</span>
        {message.automatique && <span className="gst-etiquette">message automatique</span>}
        {/* LE MENU DU MAIL — effacé au repos (décision d'Arno : pas de boutons partout), mais toujours atteignable. */}
        {(onDeplacer || onRemettre) && (
          <span className="gst-msg-menu">
            <MenuDiscret titre="Actions sur ce message" entrees={[
              ...(onDeplacer ? [{ libelle: 'Déplacer ce mail vers un autre événement…', onChoisir: onDeplacer }] : []),
              ...(onRemettre ? [{ libelle: 'Détacher ce mail', discrete: true, onChoisir: onRemettre }] : []),
            ]} />
          </span>
        )}
      </div>
      {/* LOT 4d-C — références d'images masquées, historique cité REPLIÉ. Rien n'est modifié en base : le corps
          capturé reste entier, on choisit seulement ce qu'on montre d'emblée. */}
      {lisible.visible
        ? <p className="gst-msg-corps">{lisible.visible}</p>
        : <p className="gst-msg-corps gst-absent">(message sans texte)</p>}
      {lisible.cite && (
        <details className="gst-cite">
          <summary className="gst-cite-titre">Afficher le message cité</summary>
          <p className="gst-msg-corps gst-cite-corps">{lisible.cite}</p>
        </details>
      )}
      {vraies.length > 0 && (
        <ul className="gst-pieces">
          {vraies.map((p) => (
            <li key={p.pieceId} className="gst-piece">
              {p.disponible ? (
                <>
                  {/* Servie par l'application : le droit est relu à chaque ouverture. Aucune URL de stockage ici. */}
                  <a className="gst-lien" href={`/api/admin/gestion/pieces/${p.pieceId}`} target="_blank" rel="noreferrer">
                    {p.nomFichier}
                  </a>
                  <span className="gst-sep" aria-hidden="true">·</span>
                  <span>{formaterTaille(p.tailleOctets)}</span>
                  <span className="gst-sep" aria-hidden="true">·</span>
                  <a className="gst-lien" href={`/api/admin/gestion/pieces/${p.pieceId}?telecharger=1`}>Télécharger</a>
                </>
              ) : (
                // Pas de lien : une pièce non déposée ne s'ouvrira pas, et un lien mort userait la confiance.
                <span className="gst-absent">
                  {p.nomFichier} — non conservée{p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* LES IMAGES DE SIGNATURE, à part et repliées : elles restent consultables, mais ne noient plus les vraies
          pièces. Trier n'est pas supprimer — elles sont enregistrées et servies comme les autres. */}
      {signatures.length > 0 && (
        <details className="gst-cite">
          <summary className="gst-cite-titre">
            {signatures.length} image{signatures.length > 1 ? 's' : ''} de signature
          </summary>
          <ul className="gst-pieces">
            {signatures.map((p) => (
              <li key={p.pieceId} className="gst-piece">
                {p.disponible
                  ? <a className="gst-lien" href={`/api/admin/gestion/pieces/${p.pieceId}`} target="_blank" rel="noreferrer">{p.nomFichier}</a>
                  : <span className="gst-absent">{p.nomFichier} — non conservée</span>}
                <span className="gst-sep" aria-hidden="true">·</span>
                <span>{formaterTaille(p.tailleOctets)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {panneau}
    </li>
  );
}
