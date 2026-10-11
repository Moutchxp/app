'use client';

import { useEffect, useState, type RefObject } from 'react';
import { grouperResultats, messageAucunBien, motRaison } from '../../../../lib/gestion/rechercheBien';
import { deuxLignesParties, ligneCompacteDuBien } from '../../../../lib/gestion/classementBoutons';
import { AUCUNE_PROPOSITION } from '../../../../lib/gestion/classementAvantEnvoi';
import { InfoBien } from './InfoBien';
import { ZoneDefilante } from './ZoneDefilante';
import type { BienTrouve, ResultatsBiens } from '../../../../lib/gestion/rechercheBienRepo';

/**
 * ══ 🔴🔴 LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — LE SEUL COMPOSANT DE CHOIX DE BIENS DE L'APPLICATION ═══════════════════
 *
 * DÉCISION D'ARNO (11/10/2026) : « un seul moteur, le modèle (A) ». Deux fenêtres choisissaient des biens, chacune
 * avec son dessin : « Rattacher ce mail à… » (cartes compactes, case, titre « adresse — nature · type » avec « i »,
 * PROPRIÉTAIRE / LOCATAIRE, motif en italique gris) et « Modifier le rattachement » (grandes cartes à deux colonnes,
 * pastille « À trancher », blocs e-mail + Copier, ligne récapitulative). Le second dessin est SUPPRIMÉ ; les deux
 * fenêtres rendent désormais CE composant, extrait tel quel de la première.
 *
 * ═══ 🔴 CE QU'IL EST, ET CE QU'IL N'EST PAS ════════════════════════════════════════════════════════════════════════
 *
 * Il PEINT les deux cartes — « Propositions » (compteur « N bien(s) coché(s) sur M affiché(s) », « Sélectionner /
 * Désélectionner tous les biens », cases, « i », parties sur deux lignes, motif, « voir les autres », défilement
 * interne) et « Moteur de recherche » (légende, champ, groupes « Par adresse » / « Par nom ou coordonnée », lignes
 * compactes, « déjà dans la sélection »). Il ne DÉCIDE rien : ce qui est proposé, coché, validé reste à chaque
 * fenêtre, parce que l'une remplit un brouillon et l'autre pose une exception de suivi.
 *
 * ⚠️ UNE SEULE DIFFÉRENCE ADMISE (Arno) : dans « Modifier le rattachement », les locataires sont ceux À LA DATE DU
 * MAIL — « LOCATAIRE (à la date du mail) », ou « Vacant à cette date ». C'est une donnée, pas un dessin :
 * `aLaDateDuMail`.
 */

/** L'état de la recherche, le même des deux côtés. */
export type EtatRecherche =
  | { v: 'repos' }
  | { v: 'cherche' }
  | { v: 'ok'; resultats: ResultatsBiens }
  | { v: 'erreur' };

/**
 * ══ LA RECHERCHE, DIFFÉRÉE DE 250 ms ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE MÊME DÉLAI QUE PARTOUT DANS LE MODULE : chercher à chaque lettre ferait une requête par caractère.
 * ⚠️ DEUX CARACTÈRES AU MINIMUM, comme l'annuaire : une seule lettre rend la moitié du fichier.
 * 🔴 `date` : les parties sont alors celles À CETTE DATE (route `/biens?date=`), pour un mail ancien.
 * ⚠️ `vivant` couvre le démontage ET la réponse périmée (« vic » lente ne doit pas écraser « victor hugo »).
 */
export function useRechercheBiens(saisie: string, date: string | null = null): EtatRecherche {
  const [recherche, setRecherche] = useState<EtatRecherche>({ v: 'repos' });
  useEffect(() => {
    const t = saisie.trim();
    if (t.length < 2) { setRecherche({ v: 'repos' }); return undefined; }
    setRecherche({ v: 'cherche' });
    let vivant = true;
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const p = new URLSearchParams({ q: t });
          if (date !== null) p.set('date', date);
          const res = await fetch(`/api/admin/gestion/biens?${p}`, { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string } & Partial<ResultatsBiens>;
          if (!vivant) return;
          if (d.etat === 'ok') {
            setRecherche({ v: 'ok', resultats: {
              lignes: d.lignes ?? [], tronque: d.tronque === true, disponible: d.disponible !== false,
            } });
          } else setRecherche({ v: 'erreur' });
        } catch { if (vivant) setRecherche({ v: 'erreur' }); }
      })();
    }, 250);
    return () => { vivant = false; clearTimeout(minuteur); };
  }, [saisie, date]);
  return recherche;
}

/** Une carte de la liste « Propositions ». */
export interface BienACocher {
  cle: string;
  /** `null` = pas encore connues (fiche en cours de lecture) : les deux lignes ne sont pas écrites. */
  parties: readonly { role: string; nom: string }[] | null;
  /** Pourquoi ce bien est là : « locataire de ce bien », « déjà rattaché — décochez pour le retirer »… */
  motif: string;
}

export function ListeBiensACocher({
  afficherPropositions = true, lignes, titre, selection, onBasculer, clesVisibles, toutesCochees, onToutBasculer,
  replies = 0, autresDeplies = false, onBasculerAutres, saisie, onSaisie, champ, recherche, clesEnHaut,
  onBasculerResultat, aLaDateDuMail = false,
}: {
  /** `false` = le moteur n'est pas installé sur cette base : seule la recherche est montrée. */
  afficherPropositions?: boolean;
  /** Les cartes du haut, DANS L'ORDRE où elles doivent paraître. */
  lignes: readonly BienACocher[];
  /** Le titre d'un bien (« adresse — nature · type »), calculé par la fenêtre sur toutes ses listes à la fois. */
  titre: (cle: string) => string;
  selection: ReadonlySet<string>;
  onBasculer: (cle: string) => void;
  /** Tout ce qui est à l'écran avec une case : c'est ce que le compteur compte et ce que « tous » touche. */
  clesVisibles: readonly string[];
  toutesCochees: boolean;
  onToutBasculer: () => void;
  replies?: number;
  autresDeplies?: boolean;
  onBasculerAutres?: () => void;
  saisie: string;
  onSaisie: (s: string) => void;
  champ?: RefObject<HTMLInputElement | null>;
  recherche: EtatRecherche;
  /** Les biens déjà montrés au-dessus (ou ailleurs dans la fenêtre) : leur résultat dit « déjà dans la sélection ». */
  clesEnHaut: ReadonlySet<string>;
  onBasculerResultat: (b: BienTrouve) => void;
  /** 🔴 LA SEULE DIFFÉRENCE ADMISE : les locataires à la date du mail (« Modifier le rattachement »). */
  aLaDateDuMail?: boolean;
}) {
  /**
   * 🔴 « AUCUNE PROPOSITION » EST UN ÉTAT À PART (lot AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE) : rien à cocher,
   * nulle part. C'est alors la PHRASE qui remplace le compteur — jamais « 0 bien(s) coché(s) sur 0 affiché(s) ».
   */
  const aucuneProposition = clesVisibles.length === 0;
  return (
    <>
      {afficherPropositions && (
        /* 🔴 LOT CLASSER-DEUX-BOUTONS — LES PROPOSITIONS SONT UNE CARTE, la recherche en est une autre :
           « chaque categorie a sa place » (demande d'Arno). */
        <section className="rec-carte" aria-label="Biens proposés">
          <p className="rec-carte-titre">Propositions</p>
          <div className="rec-barre">
            {/* 🔴 LE COMPTEUR : des biens DISTINCTS (un ensemble), sur ce qui est AFFICHÉ. */}
            {aucuneProposition
              ? <p className="rec-compte rec-aucune" role="status">{AUCUNE_PROPOSITION}</p>
              : (
                <p className="rec-compte" role="status">
                  {`${selection.size} bien(s) coché(s) sur ${clesVisibles.length} affiché(s).`}
                </p>
              )}
            {/* 🔴 UN SEUL LIEN QUI BASCULE, sur les propositions ET les résultats affichés. Il disparaît avec les
                cases : « tout sélectionner » sur rien ne veut rien dire. */}
            {!aucuneProposition && (
              <button type="button" className="gst-lien-bouton" onClick={onToutBasculer}>
                {toutesCochees ? 'Désélectionner tous les biens' : 'Sélectionner tous les biens'}
              </button>
            )}
          </div>

          {/* 🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — la zone DIT ce qu'elle cache en dessous. */}
          <ZoneDefilante className="rec-biens" as="ul" enfants={<>
            {lignes.map((b) => (
              <li key={b.cle} className="rec-bien">
                <label className="rec-choix">
                  <input type="checkbox" checked={selection.has(b.cle)} onChange={() => onBasculer(b.cle)} />
                  {/* 🔴 LE TITRE, SANS NUMÉRO DE LOT : « adresse — qualité ». */}
                  <span className="rec-bien-nom">{titre(b.cle)}</span>
                  {/* ⚠️ LA PASTILLE EST DANS LE LABEL, et elle NE COCHE PAS : voir `InfoBien`. */}
                  <InfoBien cle={b.cle} titre={titre(b.cle)}
                    surLaLigne={`${titre(b.cle)} ${(b.parties ?? []).map((p) => p.nom).join(' ')}`} />
                </label>
                {b.parties !== null && <PartiesSurDeuxLignes parties={b.parties} aLaDateDuMail={aLaDateDuMail} />}
                {/* 🔴 LE MOTIF EST ÉCRIT EN CLAIR, TOUJOURS : pourquoi ce bien est là, pourquoi sa case est cochée. */}
                <p className="rec-motif">{b.motif}</p>
              </li>
            ))}
            {/* 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — « VOIR LES AUTRES » : au-delà de cinq, à un clic. */}
            {replies > 0 && onBasculerAutres !== undefined && (
              <li className="rec-bien rec-autres">
                <button type="button" className="gst-lien-bouton" onClick={onBasculerAutres}>
                  {autresDeplies ? 'masquer les autres biens' : `voir les autres (${replies})`}
                </button>
              </li>
            )}
          </>} />
        </section>
      )}

      {/* ══ 🔴🔴 LE MOTEUR DE RECHERCHE, TOUJOURS VISIBLE (demande d'Arno) ═════════════════════════════════════ */}
      <section className="rec-carte rec-recherche" aria-label="Moteur de recherche">
        <p className="rec-carte-titre">Moteur de recherche</p>
        <label className="rec-champ">
          {/* 🔴 LA LÉGENDE EST AU-DESSUS DU CHAMP, jamais dans le champ. */}
          <span className="rec-legende">
            Adresse, n° de lot, nom (propriétaire ou locataire), téléphone ou e-mail — tous les mots, dans
            n’importe quel ordre
          </span>
          <input ref={champ}
            className="rec-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
            placeholder="ex. « 28 marceau », « 421 », « MARTY », « 06 03 05 07 03 »"
            onChange={(e) => onSaisie(e.target.value)} />
        </label>

        {recherche.v === 'cherche' && <p className="rec-vide" role="status">Recherche…</p>}
        {recherche.v === 'erreur' && (
          <p className="rec-vide" role="alert">La recherche n’a pas répondu. Réessayez.</p>
        )}
        {recherche.v === 'ok' && !recherche.resultats.disponible && (
          <p className="rec-vide">Annuaire des biens pas encore installé sur cette base.</p>
        )}
        {recherche.v === 'ok' && recherche.resultats.disponible && recherche.resultats.lignes.length === 0 && (
          // 🔴 ON DIT CE QU'ON A CHERCHÉ : « aucun résultat » tout court se lit comme une panne.
          <p className="rec-vide">{messageAucunBien(saisie)}</p>
        )}

        {recherche.v === 'ok' && recherche.resultats.lignes.length > 0 && (
          <ZoneDefilante className="rec-resultats" enfants={<>
            {grouperResultats(recherche.resultats.lignes).map((g) => (
              <section key={g.sorte} className="rec-groupe">
                {/* Les deux groupes titrés du moteur : « Par adresse », puis « Par nom ou coordonnée ». */}
                <p className="rec-groupe-titre">{g.titre}</p>
                <ul className="rec-lignes">
                  {g.biens.map((b) => (
                    <LigneBienCompacte key={b.cle} bien={b} coche={selection.has(b.cle)} titre={titre(b.cle)}
                      /* 🔴 « déjà dans la sélection » : ce bien est DÉJÀ montré plus haut. Les deux cases n'en font
                         qu'une, et le compteur ne le compte qu'une fois. */
                      dejaEnHaut={clesEnHaut.has(b.cle)} aLaDateDuMail={aLaDateDuMail}
                      onBasculer={() => onBasculerResultat(b)} />
                  ))}
                </ul>
              </section>
            ))}
          </>} />
        )}
        {recherche.v === 'ok' && recherche.resultats.tronque && (
          <p className="rec-vide">Seuls les premiers biens sont affichés — précisez votre recherche.</p>
        )}
      </section>
    </>
  );
}

/**
 * ══ 🔴 UNE LIGNE DE RÉSULTAT, COMPACTE ═══════════════════════════════════════════════════════════════════════════
 *
 * « adresse — nature · type », PROPRIÉTAIRE, LOCATAIRE, puis « trouvé par … ». ⚠️ La mise en forme est décidée dans
 * le module pur (`ligneCompacteDuBien`) : cet écran place et peint.
 */
function LigneBienCompacte({ bien: b, coche, titre, dejaEnHaut, aLaDateDuMail, onBasculer }: {
  bien: BienTrouve; coche: boolean; titre: string; dejaEnHaut: boolean; aLaDateDuMail: boolean; onBasculer: () => void;
}) {
  const l = ligneCompacteDuBien(b, titre);
  return (
    <li className={`rec-ligne${dejaEnHaut ? ' rec-ligne--deja' : ''}`}>
      <label className="rec-ligne-choix">
        <input type="checkbox" checked={coche} onChange={onBasculer} />
        <span className="rec-ligne-corps">
          <span className="rec-ligne-titre">
            {l.titre}
            {/* ⚠️ `surLaLigne` PORTE AUSSI LES PARTIES, écrites juste dessous : la fenêtre ne les répète pas. */}
            <InfoBien cle={b.cle} titre={l.titre} surLaLigne={`${l.titre} ${l.proprietaires} ${l.locataire}`} />
          </span>
          {/* 🔴 « déjà dans la sélection » : la même case, vue d'un autre endroit — jamais un second bien. */}
          {dejaEnHaut && <span className="rec-ligne-deja">déjà dans la sélection</span>}
          <PartiesSurDeuxLignes parties={b.parties} dansUneLigne aLaDateDuMail={aLaDateDuMail} />
          {/* Pourquoi cette ligne répond : c'est ce qui permet de comprendre un résultat surprenant. */}
          <span className="rec-ligne-motif">trouvé par {b.raisons.map(motRaison).join(' · ')}</span>
        </span>
      </label>
    </li>
  );
}

/**
 * ══ LES PARTIES SUR DEUX LIGNES, POUR TOUTES LES CARTES ═══════════════════════════════════════════════════════════
 * « PROPRIÉTAIRE » (petites capitales grises) puis le ou les propriétaires séparés par « · » ; « LOCATAIRE » puis le
 * ou les locataires, ou « Vacant ». Décidé dans le module pur (`deuxLignesParties`).
 * 🔴 `aLaDateDuMail` : « LOCATAIRE (à la date du mail) », et « Vacant à cette date ». La précision est hors des
 * petites capitales : c'est une phrase, pas un intitulé.
 */
export function PartiesSurDeuxLignes({ parties, dansUneLigne = false, aLaDateDuMail = false }: {
  parties: readonly { role: string; nom: string }[];
  /** Dans une ligne de résultat (déjà décalée par sa case) : pas de retrait supplémentaire. */
  dansUneLigne?: boolean;
  aLaDateDuMail?: boolean;
}) {
  const l = deuxLignesParties(parties, { aLaDateDuMail });
  return (
    <span className={`rec-deux-lignes${dansUneLigne ? '' : ' rec-deux-lignes--carte'}`}>
      <span className="rec-ligne-parties">
        <span className="rec-ligne-role">{l.libelleProprietaires}</span>{' '}{l.proprietaires}
      </span>
      <span className="rec-ligne-parties">
        <span className="rec-ligne-role">{l.libelleLocataires}</span>
        {l.precisionLocataires !== null && <span className="rec-ligne-precision"> {l.precisionLocataires}</span>}
        {' '}{l.locataires}
      </span>
    </span>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot).
   Les regles ci-dessous sont celles de la modale « Rattacher ce mail a… », DEPLACEES ici sans retouche : c'est ce qui
   rend les deux fenetres identiques a l'oeil. Seule la regle .rec-ligne-precision est nouvelle. */
export const CSS_LISTE_BIENS = `
/* ══ LES CARTES : c'est elles qui donnent le relief, et qui separent les categories ═════════════════════════ */
.rec-carte{margin:0 0 10px;padding:10px 12px;background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.7rem;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0}
.rec-carte-titre{margin:0 0 .4rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}

.rec-barre{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem;
  margin:0 0 .4rem}
.rec-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
/* LA PHRASE QUI REMPLACE LE COMPTEUR A ZERO : toute la largeur, la couleur du texte ordinaire. */
.rec-aucune{flex:1 1 100%;font-size:.84rem;line-height:1.45;color:var(--color-svv-ink)}
/* LOT DEFILEMENT-MODALES — EXCEPTION N° 1 : les propositions defilent dans une hauteur bornee (76 biens possibles).
   overscroll-behavior:auto ECRIT EXPLICITEMENT : en bout de liste, la molette passe a la fenetre. */
.rec-biens{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;
  max-height:34vh;overflow-y:auto;overscroll-behavior:auto}
.rec-bien{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
/* CIBLE TACTILE : la ligne entiere est cliquable. */
.rec-choix{display:flex;align-items:flex-start;gap:.5rem;min-height:32px;cursor:pointer}
.rec-bien-nom{font-weight:600;overflow-wrap:anywhere}
.rec-motif{margin:.2rem 0 0 1.6rem;font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}

/* ══ LE MOTEUR DE RECHERCHE ════════════════════════════════════════════════════════════════════════════════ */
.rec-champ{display:flex;flex-direction:column;gap:.25rem;min-width:0}
.rec-legende{font-size:.75rem;color:var(--color-svv-muted);line-height:1.35}
.rec-saisie{min-height:40px;padding:.35rem .55rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.45rem;
  min-width:0;width:100%}
.rec-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rec-vide{margin:.4rem 0 0;font-size:.8rem;color:var(--color-svv-muted)}
/* LOT DEFILEMENT-MODALES — EXCEPTION N° 2 : la recherche ne pousse jamais les propositions hors de l'ecran. */
.rec-resultats{margin-top:.4rem;max-height:30vh;overflow-y:auto;overscroll-behavior:auto}
.rec-groupe+.rec-groupe{margin-top:.5rem}
.rec-groupe-titre{margin:0 0 .25rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-ink)}
.rec-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rec-ligne{border-radius:.45rem}
.rec-ligne:hover{background:var(--color-svv-field)}
/* UN RESULTAT DEJA MONTRE EN HAUT : il garde sa case, mais DIT qu'il n'est pas un second bien. */
.rec-ligne--deja{border-left:3px solid var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.rec-ligne-deja{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-green-ink)}
.rec-ligne-choix{display:flex;align-items:flex-start;gap:.5rem;padding:5px 6px;min-height:40px;cursor:pointer;
  min-width:0}
.rec-ligne-corps{display:flex;flex-direction:column;gap:1px;min-width:0}
/* VALEURS FONCEES, LIBELLES GRIS (demande d'Arno). */
.rec-ligne-titre{display:inline-flex;align-items:center;flex-wrap:wrap;font-size:.84rem;font-weight:600;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-parties{font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-role{font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
/* LOT MOTEUR-RECHERCHE-BIENS-UNIFIE — « (a la date du mail) » : gris, sans capitales — une precision, pas un titre. */
.rec-ligne-precision{font-size:.7rem;color:var(--color-svv-muted)}
.rec-ligne-sep{color:var(--color-svv-muted)}
.rec-deux-lignes{display:flex;flex-direction:column;gap:1px;min-width:0}
.rec-deux-lignes--carte{margin:.25rem 0 0 1.6rem}
.rec-ligne-motif{font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}
`;
