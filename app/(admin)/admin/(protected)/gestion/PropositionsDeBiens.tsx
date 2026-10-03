'use client';

import { useCallback, useEffect, useState } from 'react';
import { planClassement } from '../../../../lib/gestion/gesteClassement';
import {
  groupesParProprietaire, locatairesDuBien, periodeOccupation, titreCarte, type PersonneFiche,
} from '../../../../lib/gestion/ficheBien';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';
// LOT CONTACT-LIGNES — le type passe dans le titre, et ne s'ecrit qu'une fois par groupe.
import { lienAppel, lignesParType } from '../../../../lib/gestion/telephoneAffichage';
import type { BienProposable, ContexteClassement } from '../../../../lib/gestion/classementBien';

/**
 * 🔴 LOT FICHE-PROPOSITION — L'ENCART D'UNE PROPOSITION DE BIEN, EN FICHE COMPLÈTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE LE LOT PRÉCÉDENT AVAIT ÉTABLI, ET QUI NE BOUGE PAS : la cible d'un classement est TOUJOURS un BIEN. Le
 * mail « Contestation de la retenue de 450 € » proposait « PROPRIÉTAIRE MARTY Jean-François » ; il propose
 * désormais « 6 Rue Edouard Detaille — lot 449 ». Un propriétaire n'est pas un dossier, c'est une PARTIE d'un
 * dossier — et c'est précisément pour cela qu'il a maintenant sa place, EN HAUT, comme information de contexte.
 *
 * 🔴 CE QUE CE LOT-CI AJOUTE (demande d'Arno) : la fiche qu'on avait sous les yeux ne suffisait pas pour AGIR.
 * Classer un mail, c'est presque toujours rappeler quelqu'un dans la foulée — et il fallait rouvrir WIPPIMMO dans
 * un autre onglet pour trouver un numéro. L'encart porte donc :
 *   ① EN HAUT, le ou les PROPRIÉTAIRES : une carte par personne, nom, téléphones, e-mails. Plusieurs bailleurs
 *      candidats ⇒ un bloc par groupe de biens — un seul bandeau ferait croire qu'ils sont tous au même.
 *   ② EN DESSOUS, un bloc PAR BIEN, en DEUX COLONNES ÉGALES : à gauche le bien (case à cocher, adresse complète,
 *      n° de lot, caractéristiques de l'import, certitude, motif) ; à droite ses LOCATAIRES à la date du mail
 *      (nom, téléphones, e-mails, période), ou « Vacant à cette date ».
 *   ③ un bouton « Copier » en face de CHAQUE adresse et de CHAQUE numéro.
 *
 * ⚠️ SUR ÉCRAN ÉTROIT, LES DEUX COLONNES PASSENT L'UNE SOUS L'AUTRE (`grid-template-columns: 1fr` sous 720 px).
 * L'exigence transverse du dépôt : tout écran d'administration doit être pleinement utilisable sur un téléphone.
 *
 * 🔴 RIEN N'EST RETIRÉ. « Valider », « Hors gestion », le classement par pièce et la portée mail/conversation sont
 * exactement là où ils étaient, et font exactement ce qu'ils faisaient.
 *
 * 🔴 VALIDATION OBLIGATOIRE : cocher, décocher, changer d'avis, replier — aucune écriture. Le plan de ce qui sera
 * fait vient du module PUR `planClassement`, le même que la fenêtre de classement.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function PropositionsDeBiens({ messageId, occupe, onChange, onGeste, onClasser }: {
  messageId: number;
  /** Un geste est déjà en cours dans l'encart : on n'en lance pas un second par-dessus. */
  occupe: boolean;
  onChange: () => void | Promise<void>;
  onGeste?: (message: string) => void;
  /** Ouvre LA fenêtre de classement (portée, hors gestion, pièces par bien). */
  onClasser: () => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; contexte: ContexteClassement } | { v: 'rien' }
  >({ v: 'charge' });
  const [coches, setCoches] = useState<string[] | null>(null);
  const [envoi, setEnvoi] = useState<{ en_cours: boolean; erreur: string | null }>(
    { en_cours: false, erreur: null });

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/classement?message=${messageId}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; contexte?: ContexteClassement };
      /**
       * ⚠️ `(d.contexte.biens ?? [])` ET NON `d.contexte.biens` : une réponse plus ancienne que ce lot ne porte pas
       * les mêmes champs, et `undefined.length` ferait tomber le bandeau au-dessus du mail. On ne rend alors rien.
       */
      if (d.etat !== 'ok' || !d.contexte || !d.contexte.disponible || (d.contexte.biens ?? []).length === 0) {
        setEtat({ v: 'rien' });
        return;
      }
      setEtat({ v: 'ok', contexte: d.contexte });
      /**
       * 🔴 LA PRÉ-COCHE VIENT DU MOTEUR, ET D'ELLE SEULE — jamais d'une règle réécrite ici. Elle n'est posée QU'UNE
       * FOIS : si on la recalculait, décocher un bien le recocherait aussitôt.
       */
      setCoches((d.contexte.biens ?? []).filter((b) => b.recommande).map((b) => b.cle));
    } catch {
      // Silence volontaire : une erreur rouge au-dessus d'un mail ferait croire que le mail a un problème.
      setEtat({ v: 'rien' });
    }
  }, [messageId]);

  useEffect(() => { void charger(); }, [charger]);

  if (etat.v === 'charge') return <p className="gst-info" role="status">Lecture des biens possibles…</p>;
  if (etat.v === 'rien') return null;

  const { contexte } = etat;
  const selection = coches ?? [];
  /** Le plan, recalculé à chaque coche. C'est LUI qui écrit la phrase, jamais un compte fait à la main. */
  const plan = planClassement({
    messageId, portee: 'mail', mailsSansManuel: [messageId], selection,
    existants: [], // ce bloc ne retire rien : il POSE ce qu'on coche. Retirer se fait dans la liste du dessus.
  });
  const aFaire = plan.aPoser.length > 0;

  const basculer = (cle: string) => setCoches((c) => {
    const l = c ?? [];
    return l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle];
  });

  /** LA VALIDATION — un appel après l'autre, et on compte les échecs plutôt que de s'arrêter au premier. */
  const valider = async () => {
    if (!aFaire) return;
    setEnvoi({ en_cours: true, erreur: null });
    let faits = 0;
    const ratés: string[] = [];
    for (const p of plan.aPoser) {
      try {
        const res = await fetch('/api/admin/gestion/rattachements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: p.messageId, cible: { sorte: 'lot', cle: p.cle }, motif: 'proposition validée à la main',
          }),
        });
        if (res.ok) faits += 1; else ratés.push(p.cle);
      } catch { ratés.push(p.cle); }
    }
    setEnvoi({
      en_cours: false,
      erreur: ratés.length === 0 ? null : `${faits} rattachement(s) posé(s), ${ratés.length} en échec.`,
    });
    if (ratés.length === 0) {
      onGeste?.(plan.resume);
      await onChange();
    }
  };

  const nb = contexte.biens.length;
  const groupes = groupesParProprietaire(contexte.biens);
  const fige = occupe || envoi.en_cours;

  return (
    <>
      <style>{CSS_PROPOSITIONS_BIENS}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <p className="ert-sous-titre">
        {nb === 1 ? 'Une proposition à trancher' : `${nb} propositions à trancher`}
        {/* CE QUE LE MOTEUR CONCLUT, en une ligne : on doit pouvoir juger la proposition sans rouvrir le code. */}
        {contexte.examen && <span className="pdb-examen"> — {contexte.examen.motif}</span>}
      </p>

      {groupes.map((g, i) => (
        <section className="pdb-groupe" key={g.cle === '' ? `sans-proprio-${i}` : g.cle}
          aria-label={`Biens de ${g.personnes.map((p) => p.nom).join(', ') || 'propriétaire inconnu'}`}>

          {/* ══ ① EN HAUT : LE OU LES PROPRIÉTAIRES ═══════════════════════════════════════════════════════════ */}
          <div className="pdb-proprios">
            <p className="pdb-groupe-titre">
              {g.personnes.length > 1 ? 'Propriétaires' : 'Propriétaire'}
              {g.biens.length > 1 && <span className="pdb-compte"> · {g.biens.length} biens</span>}
            </p>
            {g.personnes.length === 0
              // Dire qu'on ne sait pas est une information ; un blanc n'en est pas une.
              ? <p className="pdb-vide">Aucun propriétaire à l’annuaire pour ce bien.</p>
              : (
                <ul className="pdb-cartes">
                  {g.personnes.map((p) => <CartePersonne key={`${p.role}|${p.cle}`} personne={p} />)}
                </ul>
              )}
          </div>

          {/* ══ ② UN BLOC PAR BIEN, EN DEUX COLONNES ÉGALES ═══════════════════════════════════════════════════ */}
          <ul className="pdb-liste">
            {g.biens.map((b) => (
              <li key={b.cle} className="pdb-item">
                <div className="pdb-deux">
                  <ColonneBien bien={b} coche={selection.includes(b.cle)} fige={fige}
                    onBasculer={() => basculer(b.cle)} />
                  <ColonneLocataires bien={b} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="pdb-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn"
          disabled={fige || !aFaire} onClick={() => void valider()}>
          {envoi.en_cours ? 'Enregistrement…' : 'Valider'}
        </button>
        {/* « Hors gestion » et les cas fins passent par LA fenêtre de classement — une seule implémentation. */}
        <button type="button" className="gst-lien-bouton" disabled={fige} onClick={onClasser}>
          Hors gestion, ou classer autrement…
        </button>
        <span className="pdb-resume" role="status">
          {aFaire ? plan.resume : 'Aucun bien coché : rien ne sera classé.'}
        </span>
      </div>

      {envoi.erreur !== null && <p className="gst-tronc" role="alert">{envoi.erreur}</p>}
    </>
  );
}

/**
 * LA COLONNE DE GAUCHE — LE BIEN. Case à cocher, adresse complète, n° de lot, caractéristiques de l'import,
 * certitude et motif.
 *
 * 🔴 LES CARACTÉRISTIQUES VIENNENT DU MODULE PUR, pas d'un calcul fait ici : c'est lui qui sait ce que l'import
 * porte vraiment, et qui écarte les champs vides. L'écran ne fait que les rendre.
 */
export function ColonneBien({ bien, coche, fige, onBasculer }: {
  bien: BienProposable; coche: boolean; fige: boolean; onBasculer: () => void;
}) {
  return (
    <div className="pdb-col pdb-col--bien">
      <label className="pdb-tete">
        <input type="checkbox" checked={coche} disabled={fige} onChange={onBasculer} />
        {/* ⚠️ LE N° DE LOT N'EST AJOUTÉ QU'À L'ADRESSE COMPLÈTE. Le `libelle` de repli le porte DÉJÀ
            (« … — lot 442 ») : l'ajouter par-dessus écrivait « — lot 442 — lot 442 ». */}
        <span className="pdb-nom">
          {bien.adresseComplete
            ? <>{bien.adresseComplete}<span className="pdb-lot"> — lot {bien.cle}</span></>
            : bien.libelle}
        </span>
      </label>

      {/**
        * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — UN BIEN DÉJÀ RATTACHÉ N'EST PLUS « À TRANCHER » ═══════════
        *
        * DÉCISION D'ARNO (03/10/2026) : « un bien déjà rattaché n'affiche que “déjà rattaché”, sans la pastille
        * “À trancher” ».
        *
        * 🔴 LES DEUX PASTILLES SE CONTREDISAIENT. « À trancher » est la CERTITUDE du moteur — « je ne sais pas si
        * c'est celui-là » — et « déjà rattaché » est un FAIT : quelqu'un a tranché, et c'est écrit en base. Les
        * afficher côte à côte revenait à redemander une décision déjà prise.
        *
        * ⚠️ « Quasi certain » DISPARAÎT AUSSI dans ce cas, et pour la même raison : la certitude du moteur
        * n'apprend plus rien une fois le bien rattaché. Le fait l'emporte sur l'estimation.
        */}
      <p className="pdb-marques">
        {bien.dejaRattache
          ? <span className="pdb-certitude">déjà rattaché</span>
          : (
            <span className={`pdb-certitude${bien.certitude === 'quasi_certaine' ? ' pdb-certitude--sure' : ''}`}>
              {bien.certitude === 'quasi_certaine' ? 'Quasi certain' : 'À trancher'}
            </span>
          )}
      </p>

      {/* ⚠️ UN CHAMP VIDE N'EST PAS DANS LA LISTE : le module pur l'a déjà écarté. Pas de tiret, pas de « inconnu ». */}
      {(bien.caracteristiques ?? []).length > 0 && (
        <dl className="pdb-carac">
          {(bien.caracteristiques ?? []).map((c) => (
            <div className="pdb-carac-ligne" key={c.libelle}>
              <dt>{c.libelle}</dt>
              <dd>{c.valeur}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="pdb-motif">{bien.motif}</p>
    </div>
  );
}

/**
 * LA COLONNE DE DROITE — LE OU LES LOCATAIRES À LA DATE DU MAIL.
 *
 * 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE. Une colonne vide se lirait « on n'a pas regardé » ; or on a regardé,
 * et la base dit qu'aucun bail ne couvrait ce jour-là. C'est une information qui change la façon de traiter le mail.
 */
export function ColonneLocataires({ bien }: { bien: BienProposable }) {
  const locataires = locatairesDuBien(bien);
  return (
    <div className="pdb-col pdb-col--loc">
      <p className="pdb-groupe-titre">
        {locataires.length > 1 ? 'Locataires' : 'Locataire'}
        <span className="pdb-compte"> · à la date du mail</span>
      </p>
      {locataires.length === 0
        ? <p className="pdb-vide">Vacant à cette date.</p>
        : (
          <ul className="pdb-cartes">
            {locataires.map((p) => <CartePersonne key={`${p.role}|${p.cle}`} personne={p} />)}
          </ul>
        )}
    </div>
  );
}

/**
 * UNE CARTE DE PERSONNE : son nom, sa période s'il y en a une, puis ses moyens de contact.
 *
 * 🔴 UNE CARTE PAR PERSONNE, ET LE NOM N'EST JAMAIS DÉCOUPÉ. L'annuaire ne porte qu'un enregistrement par
 * propriétaire, même pour une indivision (« MOTTAIS GRAINDORGE Didier et Sandrine ») : deux e-mails et un
 * téléphone appartiennent alors au couple. Deviner lequel est à qui fabriquerait deux fiches fausses.
 *
 * 🔴 CHAQUE CONTACT EST CLIQUABLE **ET** COPIABLE. Cliquable pour agir tout de suite (`mailto:` ouvre l'éditeur,
 * `tel:` compose sur un téléphone) ; copiable parce que, neuf fois sur dix, on colle l'adresse ailleurs — et
 * qu'une adresse sélectionnée à la souris rate un caractère une fois sur trois.
 */
export function CartePersonne({ personne }: { personne: PersonneFiche }) {
  const periode = periodeOccupation(personne.depuis, personne.jusqua);
  const titre = titreCarte(personne);
  const emails = personne.emails ?? [];
  const telephones = personne.telephones ?? [];
  /**
   * 🔴 UNE SEULE LISTE, ET CHAQUE COORDONNÉE PORTE SA SORTE. `Coordonnee` (module `ficheBien`) ne la porte pas :
   * elle vivait dans le NOM du tableau qui la contenait. On la rend explicite ici, le temps du regroupement —
   * `lignesParType` en a besoin pour savoir si un libellé absent désigne un téléphone ou une adresse.
   */
  const contacts = [
    ...telephones.map((c) => ({ ...c, sorte: 'telephone' as const })),
    ...emails.map((c) => ({ ...c, sorte: 'email' as const })),
  ];
  return (
    <li className="pdb-carte">
      <p className="pdb-personne">
        {titre.nom}
        {/* 🔴 UNE SOCIÉTÉ EST DITE COMME TELLE : sans ce mot, « MARS AVENIR » se lit comme un patronyme, et l'on
            cherche un prénom qui n'existe pas dans l'export. */}
        {titre.qualite !== null && <span className="pdb-qualite">{titre.qualite}</span>}
      </p>
      {periode !== null && <p className="pdb-periode">{periode}</p>}

      {/* ══ 🔴🔴 LOT CONTACT-LIGNES — TITRE | VALEUR | COPIER, ET LE TITRE PORTE LE TYPE ═══════════════════════
          L'étiquette disait le libellé D'ORIGINE (« Mobile 1 », « Email 2 »), et le « Copier » se posait là où
          sa ligne le laissait. Arno : le titre porte désormais le TYPE — MOBILE, FIXE, E-MAIL —, il ne s'écrit
          qu'une fois par groupe, et les « Copier » sont collés au bord droit, alignés entre eux.

          ⚠️ CE QUE L'ÉTIQUETTE PROTÉGEAIT N'EST PAS PERDU. Elle existait parce que « l'export ne dit PAS à qui
          est le numéro quand une personne en porte plusieurs » : on n'invente toujours aucune attribution — on
          dit le TYPE de chaque coordonnée, ce qui est vrai, au lieu du numéro de colonne, qui ne parlait qu'à
          celui qui avait lu l'export. */}
      {lignesParType(contacts).map(({ contact: c, titre: mot }) => {
        /* 🔴 LOT ANNOTATIONS-TEL — LE LIEN PART DE L'AFFICHAGE, PAS DE LA VALEUR STOCKÉE. Mesuré le 30/09/2026 :
           16 des 804 téléphones portent dans `valeur` un repli de l'import (l'annotation avait fait échouer la
           normalisation), dont « 06688073220629617981 » — les DEUX numéros d'une cellule collés. Ce lien-là ne
           composait rien. `affichage` a déjà été décortiqué ; `lienTelephone` lui retire ses espaces. */
        const lien = c.sorte === 'telephone' ? lienAppel(c.affichage) : `mailto:${c.valeur}`;
        return (
          /* ⚠️ UN BLOC PAR COORDONNÉE, et la note EN DEHORS de la ligne. Poser la note dans la ligne aurait exigé
             d'y remettre `flex-wrap:wrap` — et une adresse longue aurait de nouveau poussé « Copier » à la ligne
             suivante, le défaut que le lot CONTACT-LIGNES venait de fermer. */
          <div className="pdb-contact-bloc" key={`${c.sorte}-${c.valeur}`}>
          <p className="pdb-contact">
            {mot === null
              ? <span className="pdb-etiquette" aria-hidden="true" />
              : <span className="pdb-etiquette">{mot}</span>}
            {/* 🔴 LOT FICHES-RETOUCHES — ON AFFICHE `affichage` (« 06 59 08 82 56 »), ON COPIE `affichage`, et le
                lien `tel:` part de `valeur` : un lien ne porte jamais d'espaces, et ce qu'on copie doit être ce
                qu'on lit — un numéro collé recollé dans un autre outil se relit aussi mal ici qu'ailleurs. */}
            {lien === null
              ? <span className="pdb-valeur" title={c.affichage}>{c.affichage}</span>
              : (
                <a className="pdb-valeur pdb-lien" href={lien}
                  title={c.sorte === 'email' ? c.valeur : c.affichage}>
                  {c.sorte === 'email' ? c.valeur : c.affichage}
                </a>
              )}
            <BoutonCopier valeur={c.sorte === 'email' ? c.valeur : c.affichage}
              quoi={`${mot ?? c.libelle} de ${titre.nom}`} />
          </p>
          {/* 🔴 LOT ANNOTATIONS-TEL — la note passe SOUS la ligne, alignée sur la valeur. */}
          {c.note !== null && <p className="pdb-note-tel">{c.note}</p>}
          </div>
        );
      })}

      {/* Dire qu'on n'a AUCUN contact est une information : on sait alors qu'il faudra chercher ailleurs. */}
      {telephones.length === 0 && emails.length === 0 && (
        <p className="pdb-vide">Aucun contact à l’annuaire.</p>
      )}
    </li>
  );
}

export const CSS_PROPOSITIONS_BIENS = `
.pdb-examen{font-weight:400;color:var(--color-svv-muted)}
/* UN GROUPE = un propriétaire (ou un groupe de co-propriétaires) et SES biens. */
.pdb-groupe{margin:0 0 10px;min-width:0}
.pdb-proprios{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem .6rem 0 0;
  border-bottom:0;background:var(--color-svv-field);min-width:0}
.pdb-groupe-titre{margin:0 0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.pdb-compte{font-weight:400;letter-spacing:0;text-transform:none}
.pdb-cartes{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.pdb-carte{flex:1 1 15rem;min-width:0;padding:6px 8px;border:1px solid var(--color-svv-line);border-radius:.5rem;
  background:var(--color-svv-surface)}
.pdb-personne{margin:0;font-size:.86rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* LOT CONTACTS-ET-EVENEMENT — « Société » quand l'export le dit, jamais un prenom invente. */
.pdb-qualite{margin-left:.4rem;padding:.05rem .35rem;border-radius:999px;font-size:.66rem;font-weight:700;
  color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong)}
/* ══ 🔴 LE TITRE DE LA LIGNE : le TYPE (MOBILE, FIXE, E-MAIL), ecrit une seule fois par groupe. ═══════════════
   Largeur FIXE : c'est elle qui aligne les valeurs entre elles, et qui laisse la cellule vide des lignes
   suivantes d'un meme groupe tenir sa place. */
.pdb-etiquette{flex:0 0 4.6rem;min-width:0;font-size:.7rem;font-weight:700;letter-spacing:.02em;
  text-transform:uppercase;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdb-periode{margin:.1rem 0 0;font-size:.76rem;color:var(--color-svv-muted)}
/* ══ 🔴 LA LIGNE : titre | valeur | Copier, et « Copier » colle au bord DROIT ═════════════════════════════════
   Plus de flex-wrap : une adresse longue ne doit jamais pousser « Copier » a la ligne suivante. Elle est
   TRONQUEE avec « … », son texte entier en infobulle, et la copie, elle, reste intacte. */
.pdb-contact{display:flex;flex-wrap:nowrap;align-items:center;gap:.4rem;margin:.25rem 0 0;font-size:.8rem;
  min-width:0}
.pdb-valeur{flex:1 1 auto;min-width:0;color:var(--color-svv-ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Le bouton ne retrecit jamais : c'est la valeur qui cede la place, pas lui. Il est colle au bord DROIT. */
.pdb-contact>.bcp{flex:0 0 auto;margin-left:auto}
/* LOT ANNOTATIONS-TEL — la note vit SOUS la ligne, dans son propre bloc : la ligne, elle, garde son nowrap. */
.pdb-contact-bloc{min-width:0}
.pdb-note-tel{margin:.05rem 0 0 5.05rem;font-size:.72rem;font-style:italic;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
.pdb-lien{text-decoration:underline;text-underline-offset:2px}
.pdb-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.pdb-vide{margin:.15rem 0 0;font-size:.78rem;font-style:italic;color:var(--color-svv-muted)}
.pdb-liste{display:flex;flex-direction:column;gap:0;margin:0 0 8px;padding:0;list-style:none}
.pdb-item{border:1px solid var(--color-svv-line);border-top:0;background:var(--color-svv-surface);min-width:0}
.pdb-item:last-child{border-radius:0 0 .6rem .6rem}
/* 🔴 DEUX COLONNES ÉGALES — et l'une SOUS l'autre des qu'on manque de place (exigence mobile du depot). */
.pdb-deux{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 10px;min-width:0}
@media (max-width:720px){.pdb-deux{grid-template-columns:1fr}}
.pdb-col{min-width:0}
.pdb-col--loc{border-left:1px solid var(--color-svv-line);padding-left:10px}
@media (max-width:720px){.pdb-col--loc{border-left:0;border-top:1px solid var(--color-svv-line);
  padding-left:0;padding-top:8px}}
.pdb-tete{display:flex;align-items:flex-start;gap:8px;min-height:32px;cursor:pointer;min-width:0}
.pdb-tete input{margin-top:.25rem;flex:0 0 auto}
.pdb-nom{flex:1 1 auto;min-width:0;font-size:.9rem;font-weight:600;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.pdb-lot{font-weight:400;color:var(--color-svv-muted);white-space:nowrap}
.pdb-marques{display:flex;flex-wrap:wrap;gap:6px;margin:.25rem 0 0 1.6rem}
/* Le MOT est toujours ecrit : la couleur ne fait que l'appuyer. */
.pdb-certitude{flex:0 0 auto;padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;
  line-height:1.5;color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong)}
.pdb-certitude--sure{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.pdb-carac{margin:.35rem 0 0 1.6rem;font-size:.78rem}
.pdb-carac-ligne{display:flex;align-items:baseline;gap:.4rem;margin:0}
.pdb-carac dt{flex:0 0 8.5rem;font-weight:700;color:var(--color-svv-muted)}
.pdb-carac dt::after{content:' :'}
.pdb-carac dd{flex:1 1 auto;margin:0;min-width:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
.pdb-motif{margin:.3rem 0 0 1.6rem;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.pdb-boutons{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.pdb-resume{font-size:.78rem;color:var(--color-svv-muted)}
`;
