'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChoisirEvenement } from './ChoisirEvenement';
/**
 * 🔴 DEPUIS LE MODULE **PUR**, JAMAIS DEPUIS `gestes.ts`. Ce composant vit dans le navigateur : importer le dépôt
 * le ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire TOUTE l'application
 * — page de connexion comprise (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  bornesEvenement, NOTE_EVENEMENT_MAX, TYPES_EVENEMENT, NIVEAUX_URGENCE,
  motCategorie, motUrgence, type EvenementDuMail,
} from '../../../../lib/gestion/evenementQualite';
/* 🔴 LE JOUR D'AUJOURD'HUI À PARIS, par la fonction PURE qui le dit déjà dans ce dépôt — jamais `toISOString()`,
   qui rend le jour UTC et change de date une heure par nuit. */
import { jourParis } from '../../../../lib/gestion/historiqueBien';

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — LE BLOC « ÉVÉNEMENT RATTACHÉ », EN TÊTE DE L'ENCART.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 L'ÉVÉNEMENT EST FACULTATIF, ET CE BLOC NE CHANGE JAMAIS LA CAPSULE DE STATUT. C'est la règle métier posée au
 * lot STATUT-HORS-GESTION, et elle vaut ici mot pour mot : la capsule d'un mail dit son rattachement à un BIEN,
 * jamais son événement. « Aucun » est donc une réponse normale, pas un travail en retard.
 *
 * 🔴 DEUX ACTIONS, ET ELLES S'OUVRENT JUSTE SOUS LA LIGNE — c'est la demande d'Arno, et la même raison que pour la
 * recherche de biens : un panneau qui s'ouvre en bas de page apparaît hors du regard, parfois hors de l'écran.
 *   · « Lier à un événement » — la recherche partagée (`ChoisirEvenement`), qui cherche par référence, objet et
 *     expéditeur ;
 *   · « Créer un événement » — titre, catégorie (travaux / fuite d'eau / administratif / litige), urgence. La carte
 *     neuve est rattachée au BIEN identifié, à son propriétaire et à son locataire, et le mail y est lié.
 *
 * 🔴 LA PORTÉE EST LE MÊME CHOIX QUE POUR LE CLASSEMENT : « ce mail » ou « toute la conversation ». Les deux
 * chemins existaient déjà en base et sont réversibles — `deplacerMessage` pour le mail seul (migration 234),
 * `affecter` pour l'échange. On ne réécrit ni l'un ni l'autre : on les appelle.
 *
 * 🔴 DÉLIER EST TOUJOURS POSSIBLE, réversible et journalisé : ce qui se fait d'un clic se défait d'un clic. Rien
 * n'est supprimé — l'affectation défaite reste en base, inactive et datée.
 *
 * ⚠️ SANS LA MIGRATION 268, la catégorie et l'urgence ne sont pas proposées (elles n'auraient nulle part où
 * s'écrire) et le reste fonctionne exactement comme avant.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les valeurs importées sont des constantes et des fonctions PURES, et le type
 * passe par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function BlocEvenement({ messageId, filId, biens, onGeste, onChange, jourDuMail = null }: {
  messageId: number;
  /**
   * 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LE JOUR DU MAIL, `AAAA-MM-JJ`, pour préremplir la date d'ouverture
   * de la carte neuve (accord d'Arno). `null`/absent ⇒ aujourd'hui, et c'est exactement le comportement d'avant
   * ce lot (la base posait `now()`).
   */
  jourDuMail?: string | null;
  /** L'échange, pour la portée « toute la conversation ». `null` = seule la portée « ce mail » est offerte. */
  filId: number | null;
  /**
   * 🔴 LES BIENS CLASSÉS DE CE MAIL. Ils servent à DEUX choses : rattacher la carte neuve au bien, à son
   * propriétaire et à son locataire ; et pré-remplir le titre. Vide = on crée une carte sans bien, ce qui reste
   * permis — un mail hors gestion peut mériter une carte.
   */
  biens: readonly { cle: string; libelle: string; parties: readonly { role: string; cle: string; nom: string }[] }[];
  onGeste?: (message: string) => void;
  /** Recharge la conversation après un geste : la capsule « Événement : … » en haut doit suivre. */
  onChange: () => void | Promise<void>;
}) {
  /**
   * 🔴 CORRECTIF DU 28/09/2026 — LA 268 SE DEMANDE AU SERVEUR, ELLE NE SE REÇOIT PLUS EN PROPRIÉTÉ.
   *
   * Le bloc annonçait « mise à jour 268 à appliquer » sur une base où elle était appliquée. La sonde était juste ;
   * c'est le chemin qui manquait : `qualifieDisponible` était une propriété FACULTATIVE que la conversation ne
   * passait pas, et sa valeur par défaut — `false` — se lisait « migration absente ». Un composant affirmait donc
   * quelque chose de la base sans le lui avoir demandé. Désormais la réponse d'`/affectation`, celle-là même qui
   * porte l'événement du mail, porte aussi `qualifie` : la donnée et sa condition arrivent ENSEMBLE, ou pas du tout.
   *
   * ⚠️ `false` TANT QU'ON N'A PAS RÉPONDU, et c'est volontaire : on ne propose pas un champ qu'on ne saurait
   * peut-être pas écrire. Mais c'est un « pas encore », pas un « non » — et il ne dure que le temps du chargement.
   */
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; evenement: EvenementDuMail | null; qualifie: boolean }
  >({ v: 'charge' });
  const [panneau, setPanneau] = useState<'aucun' | 'lier' | 'creer'>('aucun');
  const [portee, setPortee] = useState<'mail' | 'conversation'>('mail');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /** Le formulaire de création. Rien n'est écrit tant qu'on n'a pas validé. */
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [urgence, setUrgence] = useState('');
  /**
   * 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — les deux dates et la note (accord d'Arno).
   *
   * ⚠️ `dateDuMail` DÉCIDE DU PRÉREMPLISSAGE, et l'appelant la donne : « préremplie à la date du mail quand on
   * vient d'un mail, sinon aujourd'hui ». Ce bloc vit TOUJOURS sous un mail — il a donc toujours la date — mais
   * la propriété reste facultative pour que rien ne casse si un écran le monte sans elle.
   */
  const [ouvertLe, setOuvertLe] = useState('');
  const [closLe, setClosLe] = useState('');
  const [note, setNote] = useState('');

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; evenement?: EvenementDuMail | null; qualifie?: boolean };
      setEtat({
        v: 'ok',
        evenement: d.etat === 'ok' ? (d.evenement ?? null) : null,
        qualifie: d.etat === 'ok' && d.qualifie === true,
      });
    } catch {
      // Silence volontaire : une erreur rouge au-dessus d'un mail ferait croire que le mail a un problème.
      setEtat({ v: 'ok', evenement: null, qualifie: false });
    }
  }, [messageId]);

  useEffect(() => { void charger(); }, [charger]);

  const apresGeste = async (dit: string) => {
    setPanneau('aucun');
    onGeste?.(dit);
    await charger();
    await onChange();
  };

  /** L'adresse d'écriture, selon la portée. Les deux existent déjà et sont réversibles : on les appelle. */
  const adresse = (): string => (portee === 'mail' || filId === null
    ? `/api/admin/gestion/messages/${messageId}/affectation`
    : `/api/admin/gestion/fils/${filId}/affectation`);

  const agir = async (methode: 'POST' | 'DELETE', corps: Record<string, unknown> | null, dit: string) => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch(adresse(), {
        method: methode,
        ...(corps === null ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const d = (await res.json()) as { erreur?: string };
      if (!res.ok) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return; }
      await apresGeste(dit);
    } catch {
      setErreur('Le geste n’a pas abouti : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  /**
   * 🔴 LES PARTIES DE LA CARTE NEUVE : le bien, son propriétaire, son locataire — demande d'Arno. On les prend
   * des biens DÉJÀ CLASSÉS de ce mail : ce sont les seuls dont on soit sûr.
   */
  const partiesDesBiens = () => {
    const out: { sorte: 'lot' | 'proprietaire' | 'locataire'; cle: string; libelle: string }[] = [];
    for (const b of biens) {
      out.push({ sorte: 'lot', cle: b.cle, libelle: b.libelle });
      for (const p of b.parties) {
        if (p.role === 'proprietaire' || p.role === 'locataire') {
          out.push({ sorte: p.role, cle: p.cle, libelle: p.nom });
        }
      }
    }
    return out;
  };

  const creer = async () => {
    if (titre.trim() === '') { setErreur('Donnez un titre à l’événement.'); return; }
    /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — le refus des bornes vient du module PUR, et il ARRÊTE le geste
       avant la requête. Le serveur le refuserait aussi (la contrainte de base est la dernière garde), mais une
       phrase sous les deux champs se lit mieux qu'une erreur après l'envoi. */
    const bornes = bornesEvenement(ouvertLe, closLe);
    if (bornes.refus !== null) { setErreur(bornes.refus); return; }
    await agir('POST', {
      nouveau: {
        objet: titre.trim(),
        ...(qualifieDisponible ? { categorie: categorie === '' ? null : categorie } : {}),
        ...(qualifieDisponible ? { urgence: urgence === '' ? null : urgence } : {}),
        parties: partiesDesBiens(),
        /* ⚠️ ON ENVOIE LES JOURS TELS QUELS : c'est le SQL qui les ancre à midi, heure de Paris, et c'est la
           seule place où cette règle doit vivre. */
        ouvertLe: bornes.ouvertLe,
        closLe: bornes.closLe,
        note: note.trim() === '' ? null : note.trim(),
      },
    }, `Événement créé et lié à ${portee === 'mail' ? 'ce mail' : 'la conversation'}.`);
  };

  const ev = etat.v === 'ok' ? etat.evenement : null;
  const qualifieDisponible = etat.v === 'ok' && etat.qualifie;

  return (
    <div className="bev">
      <style>{CSS_BLOC_EVENEMENT}</style>

      {/* ⚠️ `bev-tete` EN PLUS de `ert-tete` : les deux lignes partagent la mise en page, et il faut pouvoir les
          DISTINGUER — à l'écran comme dans un test, « la ligne des biens » et « la ligne de l'événement » ne sont
          pas la même chose, et un sélecteur qui les confondrait désignerait un jour l'autre. */}
      <div className="ert-tete bev-tete">
        <span className="ert-titre">Événement rattaché :</span>
        {etat.v === 'charge' && <span className="ert-vide">lecture…</span>}
        {etat.v === 'ok' && ev === null && (
          // 🔴 « Aucun » EST UNE RÉPONSE : l'événement est facultatif, et ne change jamais la capsule de statut.
          <span className="ert-vide">aucun — l’événement est facultatif</span>
        )}
        {ev !== null && (
          <>
            <span className="bev-nom">{ev.reference} · {ev.objet}</span>
            <span className="bev-portee">
              {ev.portee === 'mail' ? 'posé sur ce mail' : 'posé sur la conversation'}
            </span>
            {ev.categorie !== null && <span className="bev-marque">{motCategorie(ev.categorie)}</span>}
            {ev.urgence !== null && <span className="bev-marque">Urgence : {motUrgence(ev.urgence)}</span>}
          </>
        )}

        {panneau === 'aucun' && (
          <>
            <button type="button" className="gst-lien-bouton" disabled={occupe}
              onClick={() => { setErreur(null); setPanneau('lier'); }}>
              Lier à un événement
            </button>
            <button type="button" className="gst-lien-bouton" disabled={occupe}
              onClick={() => {
                setErreur(null);
                // Le titre part du bien classé : c'est ce qu'on écrirait à la main neuf fois sur dix.
                setTitre(biens[0] ? biens[0].libelle : '');
                /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — « préremplie à la date du mail quand on vient d'un
                   mail, sinon aujourd'hui » (Arno). Ce bloc vit sous un mail : c'est donc sa date. */
                setOuvertLe(jourDuMail ?? jourParis(new Date()));
                setClosLe('');
                setNote('');
                setPanneau('creer');
              }}>
              Créer un événement
            </button>
            {/* 🔴 DÉLIER, TOUJOURS : ce qui se fait d'un clic se défait d'un clic. Rien n'est supprimé. */}
            {ev !== null && (
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void agir('DELETE', null, 'Événement délié. Rien n’est supprimé.')}>
                Délier
              </button>
            )}
          </>
        )}
      </div>

      {/* ══ 🔴 LE CHOIX DE PORTÉE, LE MÊME QUE POUR LE CLASSEMENT ════════════════════════════════════════════ */}
      {panneau !== 'aucun' && (
        <fieldset className="bev-portee-bloc">
          <legend className="bev-legende">Portée</legend>
          <label className="bev-choix">
            <input type="radio" name="bev-portee" checked={portee === 'mail'} onChange={() => setPortee('mail')} />
            <span>Ce mail uniquement</span>
          </label>
          <label className={`bev-choix${filId === null ? ' bev-choix--inactif' : ''}`}>
            <input type="radio" name="bev-portee" checked={portee === 'conversation'} disabled={filId === null}
              onChange={() => setPortee('conversation')} />
            <span>Toute la conversation{filId === null ? ' — échange inconnu' : ''}</span>
          </label>
        </fieldset>
      )}

      {/* ══ 🔴 LA RECHERCHE S'OUVRE JUSTE SOUS LA LIGNE, jamais en bas de page ═══════════════════════════════ */}
      {panneau === 'lier' && (
        <div className="bev-forme">
          <p className="bev-legende">Lier à un événement</p>
          {/* ⚠️ LA RECHERCHE PARTAGÉE, jamais une seconde : elle cherche par référence, objet ET expéditeur, et
              elle borne ses résultats. En recopier une ici donnerait deux comportements de recherche. */}
          <ChoisirEvenement choisi={ev?.evenementId ?? null} exclure={ev?.evenementId ?? null} autoFocus
            onChoisir={(evenementId) => {
              if (evenementId === null) return;
              void agir('POST', { evenementId }, 'Mail lié à l’événement.');
            }} />
          <div className="bev-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
              onClick={() => setPanneau('aucun')}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {panneau === 'creer' && (
        <div className="bev-forme">
          <p className="bev-legende">Créer un événement</p>
          {/* 🔴🔴 LE FORMULAIRE EST UN COMPOSANT À PART DEPUIS LE LOT CLASSER-PAR-LA-MODALE (POINT 3) — voir son
              encadré. Il n'a pas changé d'une virgule : il a changé d'ADRESSE, pour que la fenêtre
              « Bien(s) rattaché(s) à ce mail » l'emploie sans le recopier. */}
          <ChampsEvenement titre={titre} onTitre={setTitre}
            categorie={categorie} onCategorie={setCategorie}
            urgence={urgence} onUrgence={setUrgence}
            qualifieDisponible={qualifieDisponible}
            libellesDesBiens={biens.map((b) => b.libelle)}
            ouvertLe={ouvertLe} onOuvertLe={setOuvertLe}
            closLe={closLe} onClosLe={setClosLe}
            note={note} onNote={setNote} />

          <div className="bev-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
              onClick={() => setPanneau('aucun')}>
              Annuler
            </button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
              onClick={() => void creer()}>
              {occupe ? 'Création…' : 'Créer et lier'}
            </button>
          </div>
        </div>
      )}

      {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}
    </div>
  );
}

/**
 * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — LE FORMULAIRE DE CRÉATION, EXTRAIT POUR ÊTRE RÉEMPLOYÉ ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « La création ouvre dans la fenêtre le formulaire de création existant […] :
 * réutilise le formulaire actuel, sans copie. »
 *
 * 🔴 « SANS COPIE » EST LA CONSIGNE, ET VOILÀ COMMENT ELLE EST TENUE : les champs sont sortis d'ici sans qu'une
 * ligne change, et DEUX écrans les montent — le bloc « Événement rattaché » de l'encart (juste au-dessus) et la
 * fenêtre « Bien(s) rattaché(s) à ce mail ». Deux formulaires recopiés auraient divergé au premier ajustement, et
 * c'est celui qu'on regarde le moins qui aurait gardé l'ancienne version.
 *
 * 🔴 IL NE PORTE AUCUN BOUTON, ET C'EST VOLONTAIRE : ici « Créer et lier » écrit tout de suite ; dans la fenêtre,
 * la création attend « Valider le suivi » (pour que la carte neuve reçoive les biens qu'on vient de cocher). Un
 * bouton commun aurait donc dû mentir dans l'un des deux cas.
 *
 * ⚠️ IL N'ÉCRIT RIEN ET NE LIT RIEN : il rend des champs et remonte leur valeur. C'est l'appelant qui écrit, par
 * la route qu'il employait déjà.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ChampsEvenement({
  titre, onTitre, categorie, onCategorie, urgence, onUrgence, qualifieDisponible, libellesDesBiens,
  ouvertLe, onOuvertLe, closLe, onClosLe, note, onNote,
}: {
  titre: string;
  onTitre: (v: string) => void;
  categorie: string;
  onCategorie: (v: string) => void;
  urgence: string;
  onUrgence: (v: string) => void;
  /** Migration 268 appliquée ? Sinon on ne propose pas deux champs qui n'auraient nulle part où s'écrire. */
  qualifieDisponible: boolean;
  /** Les biens auxquels la carte neuve sera rattachée — dits AVANT de valider. Vide = aucune. */
  libellesDesBiens: readonly string[];
  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LES TROIS CHAMPS DEMANDÉS ══════════════════════════════════════
   *
   * ACCORD D'ARNO (06/10/2026) : « date d'ouverture » (préremplie à la date du mail quand on vient d'un mail,
   * sinon aujourd'hui), « date de clôture » (facultative) et « note » (facultative).
   *
   * 🔴 LE PRÉREMPLISSAGE EST LA RESPONSABILITÉ DE L'APPELANT, et pas de ce composant : lui seul sait s'il vient
   * d'un mail (et de quelle date) ou de nulle part. Un défaut posé ici aurait obligé à lui passer « la date du
   * mail OU rien », c'est-à-dire la même information sous un autre nom.
   *
   * 🔴 DES JOURS CIVILS `AAAA-MM-JJ` (champs `type="date"`), jamais des instants : c'est une date qu'on DÉCLARE,
   * et le SQL l'ancre à midi, heure de Paris.
   */
  ouvertLe: string;
  onOuvertLe: (v: string) => void;
  closLe: string;
  onClosLe: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  /* 🔴 LE REFUS EST DIT ICI, SOUS LES DEUX CHAMPS QU'IL CONCERNE — et c'est le module PUR qui le formule. */
  const refus = bornesEvenement(ouvertLe, closLe).refus;
  return (
    <>
      <label className="bev-champ">
        <span className="bev-label">Titre</span>
        <input className="bev-saisie" value={titre} onChange={(e) => onTitre(e.target.value)}
          placeholder="Ce dont il s’agit, en une ligne" />
      </label>

      {/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LES DEUX DATES, CÔTE À CÔTE ════════════════════════════
          Elles se répondent : l'une ouvre, l'autre clôt. Les séparer aurait fait chercher la seconde.

          ⚠️ LA CLÔTURE EST FACULTATIVE, ET SON ABSENCE EST DITE : sans ce mot, un champ de date vide se lit
          comme un champ qu'on a oublié de remplir. */}
      <div className="bev-deux">
        <label className="bev-champ">
          <span className="bev-label">Date d’ouverture</span>
          <input className="bev-saisie" type="date" value={ouvertLe}
            onChange={(e) => onOuvertLe(e.target.value)} />
        </label>
        <label className="bev-champ">
          <span className="bev-label">Date de clôture (facultative)</span>
          <input className="bev-saisie" type="date" value={closLe}
            onChange={(e) => onClosLe(e.target.value)} />
        </label>
      </div>
      {/* 🔴 CE QUE LA CLÔTURE VEUT DIRE, DIT AVANT DE VALIDER : la base lie l'état et la date de clôture
          (`CHECK ((etat = 'traite') = (traite_le IS NOT NULL))`), et une carte datée naît donc CLOSE. */}
      {closLe.trim() !== '' && refus === null && (
        <p className="bev-note">La carte sera créée déjà CLÔTURÉE à cette date.</p>
      )}
      {refus !== null && <p className="bev-refus" role="alert">{refus}</p>}

      <label className="bev-champ">
        <span className="bev-label">Note (facultative)</span>
        <textarea className="bev-saisie bev-note-saisie" value={note} rows={3}
          maxLength={NOTE_EVENEMENT_MAX}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Ce qu’il faut savoir pour reprendre ce dossier" />
      </label>

      {/* ⚠️ SANS LA MIGRATION 268, ces deux champs n'auraient nulle part où s'écrire : on ne les propose pas. */}
      {qualifieDisponible ? (
        <div className="bev-deux">
          <label className="bev-champ">
            <span className="bev-label">Catégorie</span>
            {/* 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 2 — LES CHOIX VIENNENT DE LA SOURCE UNIQUE, et de la MÊME
                manière que dans le formulaire de modification (`FormulaireCarte`). Avant, l'un parcourait les
                clés puis cherchait leur mot (`CATEGORIES_EVENEMENT` + `motCategorie`) : deux lectures pour une
                liste qui n'en a qu'une. Un type ajouté à `TYPES_EVENEMENT` paraît ici sans toucher ce fichier. */}
            <select className="bev-saisie" value={categorie} onChange={(e) => onCategorie(e.target.value)}>
              <option value="">non précisée</option>
              {TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.mot}</option>)}
            </select>
          </label>
          <label className="bev-champ">
            <span className="bev-label">Urgence</span>
            {/* 🔴🔴 LOT URGENCE-EVENEMENT, POINT 2 — LES CHOIX VIENNENT DE LA SOURCE UNIQUE, et de la MÊME manière
                que ceux du type juste à côté. Avant, ce `<select>` parcourait les CLÉS (`URGENCES_EVENEMENT`) puis
                cherchait leur mot (`motUrgence`) : deux lectures pour une liste qui n'en a qu'une. Un niveau
                ajouté à `NIVEAUX_URGENCE` paraît ici sans qu'on touche à ce fichier — et le plus haut s'appelle
                désormais « Urgent », dans ce formulaire comme dans tous les autres. */}
            <select className="bev-saisie" value={urgence} onChange={(e) => onUrgence(e.target.value)}>
              <option value="">non précisée</option>
              {NIVEAUX_URGENCE.map((n) => <option key={n.cle} value={n.cle}>{n.mot}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="bev-note">
          Catégorie et urgence ne sont pas encore installées sur cette base (mise à jour 268 à appliquer).
        </p>
      )}

      {/* 🔴 CE À QUOI LA CARTE SERA RATTACHÉE, DIT AVANT DE VALIDER. */}
      <p className="bev-note">
        {libellesDesBiens.length === 0
          ? 'Aucun bien classé sur ce mail : la carte sera ouverte sans bien rattaché.'
          : `Sera rattaché à ${libellesDesBiens.join(', ')}, à son propriétaire et à son locataire.`}
      </p>
    </>
  );
}

export const CSS_BLOC_EVENEMENT = `
.bev{min-width:0}
.bev-nom{font-size:.88rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bev-portee{font-size:.72rem;color:var(--color-svv-muted)}
/* Le MOT est toujours ecrit : la couleur ne fait que l'appuyer. */
.bev-marque{padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;line-height:1.5;
  color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong)}
.bev-portee-bloc{margin:6px 0;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;min-width:0}
.bev-legende{margin:0 0 .2rem;padding:0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--color-svv-muted)}
.bev-choix{display:flex;align-items:center;gap:.5rem;min-height:32px;font-size:.85rem;color:var(--color-svv-ink);
  cursor:pointer}
.bev-choix--inactif{color:var(--color-svv-muted);cursor:default}
.bev-forme{margin:6px 0;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.bev-champ{display:flex;flex-direction:column;gap:.2rem;margin:.35rem 0;min-width:0}
.bev-label{font-size:.72rem;font-weight:700;color:var(--color-svv-muted)}
.bev-saisie{min-height:36px;padding:.25rem .5rem;font:inherit;font-size:.85rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.4rem;min-width:0}
.bev-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bev-deux{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}
@media (max-width:720px){.bev-deux{grid-template-columns:1fr}}
.bev-note{margin:.35rem 0 0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* LOT RATTACHEMENT-PONCTUEL, POINT 0 — le refus des deux dates, et la note.
   LE REFUS EST ECRIT, pas seulement colore : une couleur seule ne se lit ni en niveaux de gris ni pour un
   daltonien. Le jeton rouge ne fait que l'appuyer. */
.bev-refus{margin:.35rem 0 0;font-size:.78rem;font-weight:700;color:var(--color-svv-red);overflow-wrap:anywhere}
.bev-note-saisie{min-height:60px;resize:vertical;line-height:1.4}
.bev-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:8px}
`;
