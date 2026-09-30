'use client';

import { useCallback, useEffect, useState } from 'react';
// LOT CONTACT-LIGNES — le type passe dans le titre, et ne s'ecrit qu'une fois par groupe.
import { lignesParType } from '../../../../lib/gestion/telephoneAffichage';
import { ModifierRattachement, motSorteLong, CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';
import { MenuRattachementBien } from './MenuRattachementBien';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
// LOT FICHE-RATTACHEMENT — les mots et les ordres vivent dans un module PUR, éprouvé sans écran.
import {
  adresseDossierDrive, adresseFicheAnnuaire, motNbMails, motPeriode, motRole, motSansLocataire, motStatutBien,
  motSurface, qualitePersonne,
  type BienRattache, type FicheRattachementFil, type PersonneRattachement,
} from '../../../../lib/gestion/ficheRattachement';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';

/**
 * LOT BARRE-STATUT, REFAIT AU LOT FICHE-RATTACHEMENT — « VISUALISER / MODIFIER » : CE QUE DIT UN ÉCHANGE CLASSÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE DISAIT AVANT, ET POURQUOI C'ÉTAIT TROP PEU. Une ligne : « Propriétaire X — automatique ». Pour
 * rappeler le locataire, retrouver l'adresse du logement ou son numéro de lot, il fallait refermer, rouvrir
 * l'échange, déplier un message, puis ouvrir l'annuaire dans un autre onglet. On ouvrait cette fenêtre pour SAVOIR,
 * et elle ne disait presque rien.
 *
 * 🔴 DÉSORMAIS, LE BIEN D'ABORD — c'est la règle du 28/09/2026, appliquée à l'affichage. Pour CHAQUE bien de
 * l'échange : son adresse complète, son n° de lot, sa nature, son type, sa surface, son statut ; puis ses
 * PERSONNES, avec leurs téléphones et leurs e-mails, le libellé de la colonne d'où vient chaque valeur, et un
 * bouton « Copier » sur chacune.
 *
 * 🔴 L'EXPÉDITEUR EN TÊTE. Un mail du propriétaire met son bloc en premier, marqué « Expéditeur » ; un mail du
 * locataire met le sien. On ouvre cette fenêtre en ayant un mail sous les yeux, et le geste suivant est presque
 * toujours de répondre ou de rappeler celui qui a écrit.
 *
 * 🔴 RIEN N'EST RETIRÉ. « Voir le détail par mail », « Modifier », « Retirer » et « Rattacher à un bien » sont tous
 * là, au même endroit qu'avant. Cette fenêtre AJOUTE ce qu'il fallait aller chercher ailleurs.
 *
 * ⚠️ ELLE NE RÉÉCRIT AUCUN GESTE. Modifier reste ENTIÈREMENT le travail de `ModifierRattachement`, rattacher celui
 * de `MenuRattachementBien`. Réimplémenter ici aurait créé une deuxième façon de faire le même geste — donc, un
 * jour, deux comportements différents.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Etat =
  | { v: 'charge' }
  | { v: 'ok'; fiche: FicheRattachementFil; liens: LienAffiche[] }
  | { v: 'sans_schema' }
  | { v: 'erreur'; message: string };

export function RattachementsDuFil({ filId, titre, onFerme, onGeste }: {
  filId: number;
  /** L'objet de l'échange, connu de la liste. La fiche en rend un aussi ; celui-ci sert de repli. */
  titre?: string | null;
  onFerme: () => void;
  onGeste?: (message: string) => void;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [modifie, setModifie] = useState<LienAffiche | null>(null);
  const [rattache, setRattache] = useState(false);
  /**
   * 🔴 LES DOSSIERS DRIVE DES BIENS, par clé de lot. Lus À PART, et APRÈS le reste.
   *
   * ⚠️ C'EST UN CONFORT, PAS UNE DONNÉE DE LA FICHE : la descente jusqu'au sous-dossier du lot demande un appel à
   * Google, qui peut être lent ou muet. L'attendre pour afficher l'adresse et le téléphone du locataire ferait
   * payer à tout le monde le prix d'un lien que l'on ne clique pas toujours.
   */
  const [dossiers, setDossiers] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      // LES DEUX ENSEMBLE : la fiche (les biens et leurs parties) et les liens bruts (le détail par mail et les
      //   gestes). Les enchaîner doublerait l'attente pour un résultat identique.
      const [rf, rl] = await Promise.all([
        fetch(`/api/admin/gestion/rattachements?fiche=${filId}`, { cache: 'no-store' }),
        fetch(`/api/admin/gestion/rattachements?fil=${filId}`, { cache: 'no-store' }),
      ]);
      const df = (await rf.json()) as { etat?: string; data?: FicheRattachementFil; message?: string };
      const dl = (await rl.json()) as { etat?: string; data?: LienAffiche[] };
      if (df.etat === 'sans_schema' || dl.etat === 'sans_schema') { setEtat({ v: 'sans_schema' }); return; }
      /**
       * ⚠️ ON VÉRIFIE LA FORME, PAS SEULEMENT L'ÉTAT. Une réponse « ok » dont le corps n'a pas la forme attendue
       * (un serveur plus ancien, un onglet resté ouvert pendant un déploiement) doit donner un message lisible,
       * jamais un écran blanc : `fiche.biens.length` sur un tableau absent casse tout le rendu.
       */
      const f = df.data;
      if (df.etat !== 'ok' || !f || !Array.isArray(f.biens)) {
        setEtat({ v: 'erreur', message: df.message ?? 'Lecture impossible : réponse inattendue du serveur.' });
        return;
      }
      setEtat({ v: 'ok', fiche: f, liens: dl.etat === 'ok' && Array.isArray(dl.data) ? dl.data : [] });
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des rattachements n’a pas abouti.' });
    }
  }, [filId]);

  useEffect(() => { void charger(); }, [charger]);

  /**
   * ══ 🔒 LE DOSSIER DU BIEN DANS LE DRIVE — LECTURE SEULE, ET AU MIEUX-EFFORT ═══════════════════════════════════
   *
   * On réemploie la route du lot DRIVE-DOSSIER-DU-BIEN, qui part du dossier du PROPRIÉTAIRE (connu en base depuis
   * le lot 253) et descend, par UN `files.list`, jusqu'au sous-dossier « … — lot N ». Aucune écriture, aucune
   * création : l'application lit des métadonnées, et le lien affiché ouvre Drive dans un autre onglet, avec les
   * droits Google de la personne connectée.
   *
   * ⚠️ SON ÉCHEC NE SE VOIT PAS : sans réponse, le lien retombe sur le dossier du propriétaire porté par la fiche,
   * et à défaut il n'y a pas de lien. Un raccourci absent n'est pas une panne.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/drive/dossier-du-bien?fil=${filId}`, { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; dossiers?: { dossierId: string; cles: string[] }[];
        };
        if (annule || d.etat !== 'ok') return;
        const carte: Record<string, string> = {};
        for (const x of d.dossiers ?? []) for (const c of x.cles) carte[c] = x.dossierId;
        setDossiers(carte);
      } catch { /* confort absent : la fiche reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * ⚠️ LA FENÊTRE DE MODIFICATION PREND TOUTE LA PLACE quand elle s'ouvre : deux boîtes de dialogue empilées sont
   * injouables au clavier, et un lecteur d'écran ne sait plus laquelle est active. On rend donc l'une OU l'autre.
   */
  if (modifie !== null) {
    return (
      <ModifierRattachement lien={modifie} messageId={modifie.messageId}
        onGeste={onGeste}
        onAnnuler={() => setModifie(null)}
        onFait={async () => { setModifie(null); await charger(); }} />
    );
  }

  const fiche = etat.v === 'ok' ? etat.fiche : null;
  const liensParId = new Map((etat.v === 'ok' ? etat.liens : []).map((l) => [l.id, l]));
  const objet = fiche?.objet ?? titre ?? null;

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <style>{CSS_RATTACHEMENTS_FIL}</style>
      <div className="mrt rdf" role="dialog" aria-modal="true" aria-labelledby="rdf-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>

        {/* ══ 🔴 EN TÊTE : L'OBJET, ET COMBIEN DE MAILS (demande d'Arno) ══════════════════════════════════════
            Sans l'objet, on ne sait plus quelle ligne on a ouverte ; sans le nombre de mails, on ne sait pas si
            « sur 3 mails » plus bas veut dire « tous » ou « trois sur douze ». */}
        <h2 className="mrt-titre" id="rdf-titre">Bien(s) de cet échange</h2>
        {objet !== null && objet !== '' && <p className="rdf-objet">{objet}</p>}
        {fiche !== null && <p className="rdf-detail">{motNbMails(fiche.nbMailsDuFil)}</p>}

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des rattachements…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}
        {/* ⚠️ LA MIGRATION 257 ABSENTE EST UN ÉTAT, PAS UNE PANNE : on le DIT, on ne montre pas une liste vide. */}
        {etat.v === 'sans_schema' && (
          <p className="gst-tronc">
            Les rattachements ne sont pas encore installés sur cette base (mise à jour 257 à appliquer).
          </p>
        )}

        {/* ══ 🔴 HORS GESTION, OU AUCUN BIEN : ON LE DIT, ET ON PROPOSE LE GESTE ═════════════════════════════
            Un cadre vide se lit comme une panne. Ces deux états sont des RÉPONSES — « ce mail ne concerne aucun
            bien », « il n'est rattaché à rien pour l'instant » — et chacun a sa suite naturelle. */}
        {fiche !== null && fiche.biens.length === 0 && (
          <div className="rdf-vide">
            <p className="rdf-vide-mot">
              {fiche.horsGestion
                ? 'Cet échange est marqué « Hors gestion » : il ne concerne aucun bien.'
                : 'Cet échange n’est rattaché à aucun bien pour l’instant.'}
            </p>
            <p className="rdf-detail">
              {fiche.horsGestion
                ? 'La marque se lève d’elle-même si vous le rattachez à un bien.'
                : 'Il a pu être retiré depuis l’affichage de la liste, ou n’avoir jamais été classé.'}
            </p>
          </div>
        )}

        {/* ══ 🔴 UN BLOC PAR BIEN ════════════════════════════════════════════════════════════════════════════ */}
        {fiche !== null && fiche.biens.map((b) => (
          <BlocBien key={b.cle} bien={b} dossierId={dossiers[b.cle] ?? b.dossierDriveId}
            liens={b.lienIds.map((id) => liensParId.get(id)).filter((l): l is LienAffiche => l !== undefined)}
            onModifier={setModifie} />
        ))}

        {/* ══ « RATTACHER À UN BIEN » — le MÊME menu que dans le fil, jamais une seconde implémentation ══════ */}
        {fiche !== null && fiche.messageRecentId !== null && (
          rattache
            ? (
              <MenuRattachementBien messageId={fiche.messageRecentId} filId={filId}
                onFerme={() => setRattache(false)}
                onGeste={onGeste}
                onChange={async () => { await charger(); }}
                onHorsGestion={() => setRattache(false)} />
            )
            : (
              <button type="button" className="gst-lien-bouton rdf-rattacher" onClick={() => setRattache(true)}>
                Rattacher à un bien
              </button>
            )
        )}

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/** UN BIEN : sa fiche, ses personnes, ses gestes. */
function BlocBien({ bien, dossierId, liens, onModifier }: {
  bien: BienRattache;
  dossierId: string | null;
  liens: LienAffiche[];
  onModifier: (l: LienAffiche) => void;
}) {
  const drive = adresseDossierDrive(dossierId);
  return (
    <section className="rdf-item" aria-label={bien.adresseComplete}>
      <div className="rdf-tete">
        <span className="rdf-cible">{bien.adresseComplete}</span>
        {/* Le MOT est toujours écrit ; la couleur ne fait que l'appuyer. */}
        <span className={`rdf-statut rdf-statut--${bien.statut}`}>{motStatutBien(bien.statut)}</span>
      </div>

      {/* 🔴 LES CARACTÉRISTIQUES, DANS L'ORDRE OÙ ON LES CHERCHE. La surface est DITE absente quand elle l'est —
          l'export WIPPIMMO n'en porte aucune —, jamais devinée d'après le type. */}
      <p className="rdf-detail rdf-caract">
        <span>lot {bien.numeroLot}</span>
        {bien.nature !== null && <span>{bien.nature}</span>}
        {bien.typeBien !== null && <span>{bien.typeBien}</span>}
        <span className={bien.surfaceM2 === null ? 'rdf-absent' : undefined}>{motSurface(bien.surfaceM2)}</span>
        <span>sur {bien.nbMails} mail{bien.nbMails > 1 ? 's' : ''} de la conversation</span>
      </p>

      {/* 🔒 LE DOSSIER DU BIEN : une ADRESSE que le navigateur ouvre, jamais un appel de l'application à Google.
          Nouvel onglet, en lecture, avec les droits Google de la personne connectée. */}
      {drive !== null && (
        <p className="rdf-detail">
          <a className="rdf-lien" href={drive} target="_blank" rel="noopener noreferrer">
            Ouvrir le dossier du bien <span aria-hidden="true">↗</span>
          </a>
          <span className="rdf-note"> — dans Google Drive, en lecture</span>
        </p>
      )}

      {/* ══ 🔴 LES PERSONNES, L'EXPÉDITEUR EN TÊTE ═════════════════════════════════════════════════════════ */}
      {bien.personnes.filter((p) => p.role === 'proprietaire').length === 0 && (
        <p className="rdf-detail rdf-absent">Aucun propriétaire connu pour ce lot dans l’annuaire.</p>
      )}
      {bien.personnes.map((p) => <CartePersonne key={`${p.role}-${p.cle}`} personne={p} />)}
      {/* 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE, pas un vide : il explique pourquoi le mail vient du bailleur. */}
      {bien.personnes.filter((p) => p.role === 'locataire').length === 0 && (
        <p className="rdf-detail rdf-absent">{motSansLocataire(bien.dateMail)}</p>
      )}

      {/* LE DÉTAIL PAR MAIL, REPLIÉ : chaque mail, sa règle, sa date, son auteur, et son propre « Modifier ». */}
      {liens.length > 0 && (
        <details className="rdf-detail-mails">
          <summary className="rdf-resume">Voir le détail par mail</summary>
          <ul className="rdf-sous-liste">
            {liens.map((l) => (
              <li key={l.id} className="rdf-sous-item">
                <span className="rdf-detail">
                  {motSorteLong(l.cible.sorte)} · mail nº {l.messageId}
                  {' · '}{l.statut === 'confirme' ? 'confirmé' : 'proposé'}
                  {' · '}{l.origine === 'manuel' ? 'posé à la main' : 'posé automatiquement'}
                  {l.regle ? ` · règle ${l.regle}` : ''}
                  {l.creeLe ? ` · ${dateHeureComplete(l.creeLe)}` : ''}
                  {l.creePar ? ` · ${l.creePar}` : ''}
                  {l.pieceId !== null ? ' · cette pièce jointe seulement' : ''}
                </span>
                <button type="button" className="gst-lien-bouton" onClick={() => onModifier(l)}>
                  Modifier ce rattachement…
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** UNE PERSONNE : son nom, sa qualité, et TOUS ses moyens de contact, chacun avec sa colonne d'origine. */
function CartePersonne({ personne }: { personne: PersonneRattachement }) {
  const qualite = qualitePersonne(personne.civilite);
  const periode = motPeriode(personne);
  const fiche = adresseFicheAnnuaire(personne);
  /** ⚠️ LA SORTE EST RENDUE EXPLICITE : `CoordonneeFiche` ne la porte pas, elle vivait dans le NOM du tableau. */
  const contacts = [
    ...personne.telephones.map((c) => ({ ...c, sorte: 'telephone' as const, quoi: 'le numéro' })),
    ...personne.emails.map((c) => ({ ...c, sorte: 'email' as const, quoi: 'l’adresse e-mail' })),
  ];

  return (
    <div className={`rdf-personne${personne.expediteur ? ' rdf-personne--expediteur' : ''}`}>
      <p className="rdf-personne-tete">
        <span className="rdf-sorte">{motRole(personne.role)}</span>
        <span className="rdf-personne-nom">{personne.nom}</span>
        {qualite !== null && <span className="rdf-note">{qualite}</span>}
        {/* 🔴 LE MOT « Expéditeur », jamais la couleur seule : c'est lui qui porte l'information. */}
        {personne.expediteur && <span className="rdf-expediteur">Expéditeur</span>}
        {/* LA FICHE D'ANNUAIRE, à côté de CHAQUE personne : c'est là qu'on va voir ou corriger ses coordonnées. */}
        {fiche !== null && (
          <a className="rdf-lien" href={fiche} target="_blank" rel="noopener noreferrer">
            Fiche annuaire <span aria-hidden="true">↗</span>
          </a>
        )}
      </p>
      {periode !== null && <p className="rdf-detail">{periode}</p>}

      {contacts.length === 0
        ? <p className="rdf-detail rdf-absent">Aucune coordonnée dans l’annuaire.</p>
        : (
          <ul className="rdf-contacts">
            {/* ══ 🔴🔴 LOT CONTACT-LIGNES — TITRE | VALEUR | COPIER ══════════════════════════════════════════
                Le titre portait le libellé D'ORIGINE (« Mobile 1 », « Email 2 ») ; il porte désormais le TYPE —
                MOBILE, FIXE, E-MAIL —, écrit une seule fois par groupe, et « Copier » est collé au bord droit,
                aligné d'une ligne à l'autre.

                ⚠️ CE QUE LE LIBELLÉ D'ORIGINE PROTÉGEAIT RESTE VRAI : « l'export ne permet PAS de dire à qui
                appartient chaque valeur quand une personne en porte plusieurs ». On n'invente toujours aucune
                attribution — on dit le TYPE, ce qui est vrai, au lieu du numéro de colonne, qui ne parlait
                qu'à celui qui avait lu l'export. */}
            {lignesParType(contacts).map(({ contact: c, titre }) => (
              /* ⚠️ MÊME RAISON QUE DANS `PropositionsDeBiens` : la note vit HORS de la ligne, qui garde son
                 `nowrap` — sans quoi une adresse longue repousserait « Copier » à la ligne suivante. */
              <li key={`${c.sorte}|${c.valeur}`} className="rdf-contact-bloc">
                <span className="rdf-contact">
                {titre === null
                  ? <span className="rdf-contact-libelle" aria-hidden="true" />
                  : <span className="rdf-contact-libelle">{titre}</span>}
                {/* 🔴 LOT FICHES-RETOUCHES — le numéro se lit groupé par deux ; `valeur` reste la forme
                    canonique, pour les comparaisons et le lien `tel:`. */}
                <span className="rdf-contact-valeur" title={c.sorte === 'email' ? c.valeur : c.affichage}>
                  {c.affichage}
                </span>
                <BoutonCopier valeur={c.affichage} quoi={`${c.quoi} de ${personne.nom}`} />
                </span>
                {/* 🔴 LOT ANNOTATIONS-TEL — la note passe SOUS la ligne, alignée sur la valeur. */}
                {c.note !== null && <span className="rdf-note-tel">{c.note}</span>}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

export const CSS_RATTACHEMENTS_FIL = `
.rdf-objet{margin:-6px 0 2px;font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.rdf-item{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:10px;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.rdf-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;min-width:0}
.rdf-sorte{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.rdf-cible{flex:1 1 14rem;font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* Le mot est TOUJOURS écrit : la couleur ne fait que l'appuyer. */
.rdf-statut{padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;line-height:1.6;
  border:1px solid transparent;white-space:nowrap}
.rdf-statut--classe{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.rdf-statut--auto{color:var(--color-svv-green-ink);border-color:var(--color-svv-line-strong)}
.rdf-statut--a_trancher{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.rdf-detail{margin:0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* Les caractéristiques sur une rangée souple, séparées par des points médians tracés en CSS. */
.rdf-caract{display:flex;flex-wrap:wrap;gap:.1rem .5rem}
.rdf-caract > span + span::before{content:'· ';color:var(--color-svv-line-strong)}
/* Une donnée ABSENTE est dite, et se distingue d'une donnée présente — par le mot d'abord, l'italique ensuite. */
.rdf-absent{font-style:italic}
.rdf-note{font-size:.74rem;color:var(--color-svv-muted)}
.rdf-lien{font-size:.78rem;font-weight:600;color:var(--color-svv-red)}
.rdf-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ UNE PERSONNE ══════════════════════════════════════════════════════════════════════════════════════════ */
.rdf-personne{display:flex;flex-direction:column;gap:3px;padding:8px 10px;min-width:0;
  background:var(--color-svv-field);border-radius:.5rem}
/* 🔴 L'EXPÉDITEUR : un liseré rouge ET le mot « Expéditeur ». Jamais la couleur seule. */
.rdf-personne--expediteur{border-left:3px solid var(--color-svv-red);border-radius:0 .5rem .5rem 0}
.rdf-personne-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.1rem .5rem;margin:0;min-width:0}
.rdf-personne-nom{font-size:.88rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rdf-expediteur{padding:.05rem .4rem;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.03em;
  text-transform:uppercase;color:var(--color-svv-red);border:1px solid var(--color-svv-red);white-space:nowrap}
.rdf-contacts{display:flex;flex-direction:column;gap:2px;margin:2px 0 0;padding:0;list-style:none}
/* ══ 🔴 LOT CONTACT-LIGNES — titre | valeur | Copier, et « Copier » colle au bord DROIT ═══════════════════
   Plus de flex-wrap : une adresse longue ne doit jamais pousser « Copier » a la ligne suivante. Elle est
   TRONQUEE avec « … », son texte entier en infobulle, et la copie, elle, reste intacte. */
.rdf-contact{display:flex;flex-wrap:nowrap;align-items:center;gap:.5rem;min-height:32px;min-width:0}
.rdf-contact-libelle{flex:0 0 4.6rem;min-width:0;font-size:.7rem;font-weight:700;letter-spacing:.02em;
  text-transform:uppercase;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdf-contact-valeur{flex:1 1 auto;min-width:0;font-size:.85rem;color:var(--color-svv-ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Le bouton ne retrecit jamais : c'est la valeur qui cede la place, pas lui. */
.rdf-contact>.bcp{flex:0 0 auto;margin-left:auto}
/* LOT ANNOTATIONS-TEL — la note vit SOUS la ligne, dans son propre bloc : la ligne, elle, garde son nowrap. */
.rdf-contact-bloc{display:flex;flex-direction:column;min-width:0}
.rdf-note-tel{margin-left:5.1rem;font-size:.72rem;font-style:italic;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
/* ══ LE VIDE, DIT ══════════════════════════════════════════════════════════════════════════════════════════ */
.rdf-vide{display:flex;flex-direction:column;gap:2px;margin-bottom:10px;padding:10px;
  border-left:3px solid var(--color-svv-red);border-radius:0 .5rem .5rem 0;background:var(--color-svv-field)}
.rdf-vide-mot{margin:0;font-size:.88rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-rattacher{align-self:flex-start;font-size:.84rem;font-weight:700}
/* LOT STATUT-PAR-MAIL — le detail par mail, REPLIE. On ne cache rien : on cesse de repeter. */
.rdf-detail-mails{margin-top:2px}
.rdf-resume{font-size:.78rem;color:var(--color-svv-muted);cursor:pointer}
.rdf-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rdf-sous-liste{display:flex;flex-direction:column;gap:6px;margin:6px 0 0;padding:0 0 0 10px;list-style:none;
  border-left:2px solid var(--color-svv-line)}
.rdf-sous-item{display:flex;flex-direction:column;gap:2px;min-width:0}
@media (max-width:520px){
  /* ⚠️ MEME A 390 px, LA LIGNE NE SE REPLIE PAS : « Copier » doit rester sur la ligne de sa valeur. On retrecit
     le titre, la valeur tronque — c'est exactement ce que la troncature est la pour faire. */
  .rdf-contact-libelle{flex-basis:3.6rem}
}
`;
