'use client';

import { useCallback, useEffect, useState } from 'react';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';
import type { ContexteRedaction } from '../../../../lib/gestion/classementBien';
// 🔴 LE MOTEUR DE RECHERCHE DE BIENS, TEL QU'IL EXISTE : mêmes groupes, mêmes raisons, même route.
import { grouperResultats, messageAucunBien, motRaison } from '../../../../lib/gestion/rechercheBien';
import { ligneCompacteDuBien } from '../../../../lib/gestion/classementBoutons';
import type { BienTrouve, ResultatsBiens } from '../../../../lib/gestion/rechercheBienRepo';

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — « RATTACHER CE MAIL À… », PENDANT QU'ON L'ÉCRIT ═══════════════════════════
 *
 * Demande d'Arno : « dès qu'une adresse est VALIDÉE dans À, Cc ou Cci […] une MODALE s'ouvre au centre de
 * l'écran ». Elle propose les biens que le moteur déduit des destinataires, on coche, on valide — et à l'envoi le
 * mail est rattaché à TOUS les biens cochés.
 *
 * ═══ 🔴 CE QUE ÇA RÉPARE ════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le classement se faisait APRÈS COUP, sur un mail reçu, dans une file de plusieurs milliers de lignes. Un mail
 * qu'on écrit soi-même est pourtant le cas où l'on sait le MIEUX de quoi il parle — et c'est le seul moment où
 * cela ne coûte rien. Le faire à l'écriture, c'est retirer du travail à la file plutôt que lui en ajouter.
 *
 * ═══ 🔴 CE QU'ELLE NE FAIT PAS, ET C'EST DÉLIBÉRÉ ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE N'ÉCRIT RIEN EN BASE. Elle ne fait que remplir le champ `cibles` du BROUILLON — la même liste que le
 * bloc « Classer ce mail », posée par la même porte au moment de l'envoi. Cocher puis fermer la fenêtre de
 * rédaction sans envoyer ne laisse aucune trace, ce qui est exactement ce qu'on attend d'un brouillon.
 *
 * ⚠️ IGNORER OU FERMER LA MODALE N'EST PAS UNE ERREUR : le mail part « à classer », comme avant ce lot. C'est une
 * proposition, jamais un passage obligé — une modale qu'on ne peut pas fermer transforme un service en péage.
 *
 * ═══ ⚠️ UNE SEULE OUVERTURE AUTOMATIQUE PAR ENSEMBLE DE PROPOSITIONS ════════════════════════════════════════════
 *
 * La décision d'OUVRIR n'est pas ici : elle est chez l'appelant (`Redaction`), qui compare l'ensemble des biens
 * proposés à celui qu'il a déjà montré. Ce composant-ci, une fois monté, est simplement visible. Mêler les deux
 * aurait donné une fenêtre qui se rouvre à chaque frappe — le défaut que la demande nomme explicitement.
 */
export function RattacherEnEcrivant({
  destinataires, objet, corps, pieces, cibles, onChange, onFerme,
}: {
  /** Toutes les adresses VALIDÉES dans À, Cc et Cci. C'est d'elles que le moteur déduit les biens. */
  destinataires: readonly string[];
  objet?: string | null;
  corps?: string | null;
  /** Les noms des pièces déjà jointes : ils peuvent citer une adresse ou un n° de lot (cas c et d du moteur). */
  pieces?: readonly string[];
  /** Les cibles déjà retenues pour ce brouillon. La modale les coche d'avance : elle ne repart pas de zéro. */
  cibles: readonly CibleBrouillon[];
  onChange: (c: CibleBrouillon[]) => void;
  onFerme: () => void;
}) {
  const [etat, setEtat] = useState<
    | { v: 'charge' }
    | { v: 'ok'; contexte: ContexteRedaction }
    | { v: 'erreur'; message: string }
  >({ v: 'charge' });
  /**
   * Les clés cochées. `null` = « pas encore décidé », et c'est ce qui permet de poser la PRÉ-COCHE une seule fois,
   * au chargement : la recalculer ferait recocher d'elle-même une case qu'on vient de décocher.
   */
  const [coches, setCoches] = useState<string[] | null>(null);
  /**
   * ══ 🔴🔴 LOT CLASSER-DEUX-BOUTONS — LE MOTEUR DE RECHERCHE EST DANS LA MODALE, TOUJOURS VISIBLE ══════════
   *
   * Il était derrière un lien « + Ajouter un autre bien » qui ouvrait une SECONDE fenêtre par-dessus celle-ci.
   * Demande d'Arno : le bloc « Moteur de recherche » prend sa place, juste sous les propositions, avec sa
   * légende au-dessus du champ.
   *
   * ⚠️ C'EST LE MOTEUR EXISTANT, pas un second : même route (`/api/admin/gestion/biens`), mêmes groupes
   * (« Par adresse » / « Par nom ou coordonnée »), mêmes raisons de correspondance. Seule la LIGNE change —
   * compacte, pour tenir dans une modale à côté des propositions.
   */
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState<
    | { v: 'repos' }
    | { v: 'cherche' }
    | { v: 'ok'; resultats: ResultatsBiens }
    | { v: 'erreur' }
  >({ v: 'repos' });
  /** Les biens ajoutés à la main : ils ne viennent pas du moteur, mais ils se cochent et se valident pareil. */
  const [ajoutes, setAjoutes] = useState<CibleBrouillon[]>([]);

  const cle = destinataires.join(',');
  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      /**
       * ⚠️ UN `POST` POUR UNE LECTURE, et c'est voulu : la question porte sur des ADRESSES, un OBJET et un CORPS
       * en cours de frappe. Les mettre dans l'adresse de la requête y écrirait des données personnelles, et les
       * ferait entrer dans les journaux du serveur et l'historique du navigateur. Rien n'est écrit en base.
       */
      const res = await fetch('/api/admin/gestion/classement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinataires, objet, corps, pieces }),
      });
      const d = (await res.json()) as { etat?: string; contexte?: ContexteRedaction; message?: string };
      if (d.etat !== 'ok' || d.contexte === undefined) {
        setEtat({ v: 'erreur', message: d.message ?? 'La lecture des biens n’a pas abouti.' });
        return;
      }
      setEtat({ v: 'ok', contexte: d.contexte });
      /**
       * 🔴 LA PRÉ-COCHE, POSÉE UNE SEULE FOIS. Elle suit EXACTEMENT les règles du moteur, qui sont celles
       * qu'Arno a écrites : locataire → son bien ; propriétaire à bien unique → ce bien ; propriétaire à
       * plusieurs biens → seulement si l'adresse ou le lot est cité dans l'objet ou le texte. C'est le champ
       * `recommande` qui les porte — on ne les réécrit pas ici, sans quoi elles divergeraient du motif affiché
       * juste à côté.
       *
       * ⚠️ ET LES CIBLES DÉJÀ RETENUES RESTENT COCHÉES : rouvrir la modale ne décoche jamais un choix fait.
       */
      const dejaLa = cibles.filter((c) => c.sorte === 'lot').map((c) => c.cle ?? '');
      setCoches([...new Set([...d.contexte.biens.filter((b) => b.recommande).map((b) => b.cle), ...dejaLa])]);
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des biens n’a pas abouti.' });
    }
    // ⚠️ `cibles` HORS DES DÉPENDANCES : elles ne servent qu'à la pré-coche initiale. Les y mettre relancerait la
    //   requête à chaque case cochée — une lecture du serveur par clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, objet, corps]);

  useEffect(() => { void charger(); }, [charger]);

  const contexte = etat.v === 'ok' ? etat.contexte : null;
  /** Tous les biens montrés : ceux du moteur, puis ceux qu'on est allé chercher à la main. */
  const tous: { cle: string; libelle: string; manuel: boolean }[] = [
    ...(contexte?.biens ?? []).map((b) => ({ cle: b.cle, libelle: b.libelle, manuel: false })),
    ...ajoutes.filter((a) => !(contexte?.biens ?? []).some((b) => b.cle === (a.cle ?? '')))
      .map((a) => ({ cle: a.cle ?? '', libelle: a.libelle, manuel: true })),
  ];
  const selection = coches ?? [];
  const toutesCochees = tous.length > 0 && tous.every((b) => selection.includes(b.cle));

  const basculer = (c: string) => setCoches((l) => {
    const v = l ?? [];
    return v.includes(c) ? v.filter((x) => x !== c) : [...v, c];
  });

  /**
   * 🔴 « TOUT SÉLECTIONNER / TOUT DÉSÉLECTIONNER » EST UN SEUL BOUTON, qui bascule. Deux boutons séparés
   * laisseraient toujours l'un des deux sans effet, et il faudrait deviner lequel.
   */
  const toutBasculer = () => setCoches(toutesCochees ? [] : tous.map((b) => b.cle));

  /**
   * ══ LA RECHERCHE, DIFFÉRÉE DE 250 ms ═══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ LE MÊME DÉLAI QUE PARTOUT DANS LE MODULE : chercher à chaque lettre ferait une requête par caractère, et
   * la base répondrait à des questions que personne n'a fini de poser.
   *
   * ⚠️ DEUX CARACTÈRES AU MINIMUM, comme l'annuaire : une seule lettre rend la moitié du fichier.
   */
  useEffect(() => {
    const t = saisie.trim();
    if (t.length < 2) { setRecherche({ v: 'repos' }); return undefined; }
    setRecherche({ v: 'cherche' });
    let vivant = true;
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/biens?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
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
  }, [saisie]);

  /**
   * 🔴 UN RÉSULTAT COCHÉ REJOINT LA LISTE DU HAUT, et le compteur bouge. Demande d'Arno, mot pour mot. Il entre
   * donc dans `ajoutes` — la même liste que les biens trouvés à la main avant ce lot — et se coche d'office :
   * on ne coche pas un résultat pour ne pas le prendre.
   *
   * ⚠️ DÉCOCHER UN RÉSULTAT NE LE RETIRE PAS DE LA LISTE : il reste visible, décoché, comme une proposition.
   * L'effacer ferait disparaître sous le doigt la ligne qu'on vient de toucher.
   */
  const basculerResultat = (b: BienTrouve) => {
    const n: CibleBrouillon = { sorte: 'lot', cle: b.cle, id: null, libelle: b.libelle };
    if (!ajoutes.some((x) => memeCibleBrouillon(x, n))
      && !(contexte?.biens ?? []).some((x) => x.cle === b.cle)) {
      setAjoutes((a) => [...a, n]);
    }
    basculer(b.cle);
  };

  const valider = () => {
    const parCle = new Map<string, { libelle: string; id: number | null }>();
    for (const b of contexte?.biens ?? []) parCle.set(b.cle, { libelle: b.libelle, id: null });
    for (const a of ajoutes) parCle.set(a.cle ?? '', { libelle: a.libelle, id: a.id });
    const retenues: CibleBrouillon[] = selection
      .filter((c) => parCle.has(c))
      .map((c) => ({ sorte: 'lot' as const, cle: c, id: parCle.get(c)?.id ?? null, libelle: parCle.get(c)?.libelle ?? c }));
    /**
     * ⚠️ LES CIBLES QUI NE SONT PAS DES LOGEMENTS SONT CONSERVÉES TELLES QUELLES. Un événement choisi dans le
     * bloc « Classer ce mail » n'a rien à faire dans cette fenêtre, et valider ici ne doit pas l'effacer.
     */
    onChange([...cibles.filter((c) => c.sorte !== 'lot'), ...retenues]);
    onFerme();
  };

  /**
   * ══ 🔴 FERMER SANS CHOISIR : LA CROIX ET « ÉCHAP » NE CHANGENT RIEN ═══════════════════════════════════════
   *
   * Demande d'Arno : « Rien n'est changé et le bloc reste à l'état initial. » C'est déjà vrai par construction —
   * `onChange` n'est appelé QUE par « Valider » — et cette fonction ne fait que fermer. On l'écrit quand même à
   * un seul endroit : trois sorties qui appelleraient trois choses finiraient par ne plus faire la même.
   */
  const fermerSansRien = () => onFerme();

  return (
    <div className="mrt-voile rec-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) fermerSansRien(); }}>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
      <div className="mrt rec" role="dialog" aria-modal="true" aria-labelledby="rec-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerSansRien(); } }}>
        {/* 🔴 LA CROIX EST UNE SORTIE NOMMÉE (demande d'Arno) : elle remplace le bouton « Ignorer » du pied, qui
            disait la même chose en prenant la place d'une décision. Rien n'est changé en sortant par elle. */}
        <button type="button" className="rec-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={fermerSansRien}>×</button>
        <h2 className="mrt-titre" id="rec-titre">Rattacher ce mail à…</h2>
        <p className="rec-dest">
          D’après {destinataires.length === 1 ? 'le destinataire' : `les ${destinataires.length} destinataires`}
          {' : '}{destinataires.join(', ')}
        </p>

        {/* ══ 🔴 « INTERNE » EN PREMIER QUAND TOUS LES DESTINATAIRES SONT DE LA MAISON ══════════════════════════
            Demande d'Arno. C'est une PROPOSITION de place, pas une décision : rien n'est coché d'avance, et le
            bouton se re-clique pour se défaire. Quand les destinataires sont mêlés, le bouton reste — en bas,
            avec les autres réponses — parce qu'un échange peut être interne sans que l'adresse le dise. */}
        {contexte?.interneDabord && (
          <p className="rec-interne-dabord">
            Tous les destinataires sont de la maison : cet échange est probablement <strong>interne</strong>.
          </p>
        )}

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des biens possibles…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}

        {contexte !== null && !contexte.disponible && (
          <p className="gst-tronc">
            Le classement n’est pas encore installé sur cette base (annuaire des biens ou mise à jour 257 à
            appliquer). Le mail partira « à classer ».
          </p>
        )}

        {contexte?.disponible && (
          /* 🔴 LOT CLASSER-DEUX-BOUTONS — LES PROPOSITIONS SONT UNE CARTE, la recherche en est une autre :
             « chaque categorie a sa place » (demande d'Arno). Sans cette separation, les deux listes de cases a
             cocher se confondaient en une seule, et l'on ne savait plus ce qui venait de l'automatisation. */
          <section className="rec-carte" aria-label="Biens proposés">
            <p className="rec-carte-titre">Propositions</p>
            <div className="rec-barre">
              <p className="rec-compte" role="status">
                {tous.length === 0
                  ? 'Aucun bien ne se déduit de ces destinataires.'
                  : `${selection.length} bien(s) coché(s) sur ${tous.length} proposé(s).`}
              </p>
              {tous.length > 0 && (
                <button type="button" className="gst-lien-bouton" onClick={toutBasculer}>
                  {toutesCochees ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              )}
            </div>

            <ul className="rec-biens">
              {(contexte.biens ?? []).map((b) => (
                <li key={b.cle} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.includes(b.cle)} onChange={() => basculer(b.cle)} />
                    <span className="rec-bien-nom">{b.libelle}</span>
                  </label>
                  {/* 🔴 LE MOTIF EST ÉCRIT EN CLAIR, TOUJOURS (« locataire de ce bien », « propriétaire »…) : on
                      doit savoir POURQUOI ce bien est proposé, et pourquoi sa case est cochée, sans rouvrir le
                      code. C'est la règle du lot AFFECTATION-PAR-BIEN, et elle vaut ici à l'identique. */}
                  <p className="rec-motif">{b.motif}</p>
                  <ul className="rec-parties">
                    {b.parties.length === 0 && <li className="rec-partie">aucune partie connue aujourd’hui</li>}
                    {b.parties.map((p) => (
                      <li key={`${p.role}|${p.cle}`} className="rec-partie">
                        <span className="rec-role">{p.role === 'proprietaire' ? 'propriétaire' : 'locataire'}</span>
                        {' '}{p.nom}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {/* Les biens trouvés à la main : mêmes cases, même validation — ils n'ont simplement pas de motif. */}
              {ajoutes.map((a) => (
                <li key={`ajout-${a.cle}`} className="rec-bien">
                  <label className="rec-choix">
                    <input type="checkbox" checked={selection.includes(a.cle ?? '')}
                      onChange={() => basculer(a.cle ?? '')} />
                    <span className="rec-bien-nom">{a.libelle}</span>
                  </label>
                  <p className="rec-motif">ajouté à la main depuis la recherche</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ══ 🔴🔴 LE MOTEUR DE RECHERCHE, TOUJOURS VISIBLE (demande d'Arno) ═══════════════════════════════════
            Il était derrière un lien qui ouvrait une SECONDE fenêtre par-dessus celle-ci : on perdait de vue les
            propositions au moment précis où l'on cherchait ce qu'elles n'avaient pas trouvé. */}
        <section className="rec-carte rec-recherche" aria-label="Moteur de recherche">
          <p className="rec-carte-titre">Moteur de recherche</p>
          <label className="rec-champ">
            {/* 🔴 LA LÉGENDE EST AU-DESSUS DU CHAMP, jamais dans le champ : un texte d'aide qui disparaît à la
                première lettre n'aide qu'avant qu'on en ait besoin. */}
            <span className="rec-legende">
              Adresse, n° de lot, nom (propriétaire ou locataire), téléphone ou e-mail — tous les mots, dans
              n’importe quel ordre
            </span>
            <input className="rec-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
              placeholder="ex. « 28 marceau », « 421 », « MARTY », « 06 03 05 07 03 »"
              onChange={(e) => setSaisie(e.target.value)} />
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
            <div className="rec-resultats">
              {grouperResultats(recherche.resultats.lignes).map((g) => (
                <section key={g.sorte} className="rec-groupe">
                  {/* Les deux groupes titrés du moteur : « Par adresse », puis « Par nom ou coordonnée ». */}
                  <p className="rec-groupe-titre">{g.titre}</p>
                  <ul className="rec-lignes">
                    {g.biens.map((b) => (
                      <LigneBienCompacte key={b.cle} bien={b} coche={selection.includes(b.cle)}
                        onBasculer={() => basculerResultat(b)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {recherche.v === 'ok' && recherche.resultats.tronque && (
            <p className="rec-vide">Seuls les premiers biens sont affichés — précisez votre recherche.</p>
          )}
        </section>

        {/* ══ 🔴 LE PIED NE PORTE PLUS QU'UNE DÉCISION ═════════════════════════════════════════════════════════
            CE QU'IL Y AVAIT, ET QUI A ÉTÉ RETIRÉ SUR DEMANDE D'ARNO :
              · « Interne — échange entre collègues » → il est devenu le GROS BOUTON BLANC du bloc « Classer ce
                mail », où il est visible sans ouvrir de fenêtre. Ici, il obligeait à ouvrir une modale de
                rattachement pour dire qu'il n'y avait rien à rattacher ;
              · « Ignorer — envoyer à classer » → c'est la CROIX, en haut à droite, et la touche Échap. Deux
                sorties qui ne changent rien n'ont pas besoin de deux libellés ; celle-ci prenait la place d'une
                décision, à côté du seul bouton qui en pose une.
            🔒 LE BOUTON ROUGE N'EST PAS TOUCHÉ : même mot, même compte, même geste. */}
        <div className="mrt-pied rec-pied">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={valider}>
            {selection.length === 0 ? 'Valider sans rattachement' : `Valider — ${selection.length} bien(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ══ 🔴 UNE LIGNE DE RÉSULTAT, COMPACTE ════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « adresse — lot · type | PROPRIÉTAIRE(S) nom(s) | LOCATAIRE nom ou “Vacant” », avec une case.
 *
 * 🔴 COMPACTE, ET PAS UNE CARTE À DEUX COLONNES comme celle du panneau de rattachement : ici la recherche vit
 * SOUS les propositions, dans une modale. Des cartes hautes repousseraient les propositions hors de l'écran, au
 * moment précis où l'on compare les deux.
 *
 * ⚠️ LA MISE EN FORME EST DÉCIDÉE DANS LE MODULE PUR (`ligneCompacteDuBien`) : « Vacant », les co-propriétaires,
 * le type accolé au libellé. Cet écran place et peint, il ne décide pas.
 */
function LigneBienCompacte({ bien: b, coche, onBasculer }: {
  bien: BienTrouve; coche: boolean; onBasculer: () => void;
}) {
  const l = ligneCompacteDuBien(b);
  return (
    <li className="rec-ligne">
      <label className="rec-ligne-choix">
        <input type="checkbox" checked={coche} onChange={onBasculer} />
        <span className="rec-ligne-corps">
          <span className="rec-ligne-titre">{l.titre}</span>
          <span className="rec-ligne-parties">
            <span className="rec-ligne-role">{b.parties.filter((p) => p.role === 'proprietaire').length > 1
              ? 'Propriétaires' : 'Propriétaire'}</span>
            {' '}{l.proprietaires}
            <span className="rec-ligne-sep" aria-hidden="true"> | </span>
            <span className="rec-ligne-role">Locataire</span>{' '}{l.locataire}
          </span>
          {/* Pourquoi cette ligne répond : c'est ce qui permet de comprendre un résultat surprenant. */}
          <span className="rec-ligne-motif">trouvé par {b.raisons.map(motRaison).join(' · ')}</span>
        </span>
      </label>
    </li>
  );
}

export const CSS_RATTACHER_EN_ECRIVANT = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot).

   ══ 🔴🔴 LE VOILE PORTE SON PROPRE PLEIN ECRAN, ET C'EST INDISPENSABLE ════════════════════════════════════════
   VU A L'ECRAN LE 30/09/2026 : la modale s'ouvrait DANS la fenetre de redaction flottante, large de 494 px, et
   restait derriere elle. Deux causes, et il fallait les deux :
     ① la classe .mrt-voile (qui porte le plein ecran des autres fenetres du module) vit dans une AUTRE feuille
        de style, que la fenetre de redaction ne monte pas — la classe etait ecrite, et ne s'appliquait pas ;
     ② la fenetre flottante porte un z-index de 60 ; un voile sans z-index propre passe dessous, meme en fixed.
   On ne se repose donc sur AUCUNE feuille exterieure : ce bloc suffit a lui seul.

   ══ 🔴 LOT CLASSER-DEUX-BOUTONS — LE RELIEF DEMANDE PAR ARNO ══════════════════════════════════════════════════
   « fond de modale legerement teinte, blocs en cartes blanches a bordure fine et ombre douce, libelles gris,
   valeurs foncees ». AUCUNE COULEUR NOUVELLE : le fond teinte est le jeton « field » (celui des champs), les
   cartes sont le jeton « surface » (celui des fenetres). En sombre, les deux s'inversent tout seuls — c'est
   justement pourquoi on prend des jetons et pas des valeurs. */
.rec-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow-y:auto}
.rec{position:relative;max-width:680px;width:min(680px, 96vw);background:var(--color-svv-field);
  color:var(--color-svv-ink);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);
  max-height:92vh;overflow-y:auto}

/* LA CROIX : 44 px de cible, en permanence, jamais au survol — au doigt, le survol n'existe pas. */
.rec-croix{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;justify-content:center;
  min-width:36px;min-height:36px;padding:0;font:inherit;font-size:1.4rem;line-height:1;color:var(--color-svv-muted);
  background:transparent;border:0;border-radius:50%;cursor:pointer}
.rec-croix:hover{background:color-mix(in srgb, var(--color-svv-ink) 8%, transparent);color:var(--color-svv-ink)}
.rec-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

.rec-dest{margin:0 0 .5rem;padding-right:2.2rem;font-size:.8rem;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
.rec-interne-dabord{margin:0 0 .5rem;padding:6px 10px;border-radius:.5rem;font-size:.82rem;
  color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}

/* ══ LES CARTES : c'est elles qui donnent le relief, et qui separent les categories ═════════════════════════ */
.rec-carte{margin:0 0 10px;padding:10px 12px;background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.7rem;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0}
.rec-carte-titre{margin:0 0 .4rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}

.rec-barre{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem;
  margin:0 0 .4rem}
.rec-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.rec-biens{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;
  max-height:34vh;overflow-y:auto}
.rec-bien{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
/* CIBLE TACTILE : la ligne entiere est cliquable, et la case ne descend pas sous 44 px de hauteur totale. */
.rec-choix{display:flex;align-items:flex-start;gap:.5rem;min-height:32px;cursor:pointer}
.rec-bien-nom{font-weight:600;overflow-wrap:anywhere}
.rec-motif{margin:.2rem 0 0 1.6rem;font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}
.rec-parties{list-style:none;margin:.2rem 0 0 1.6rem;padding:0;font-size:.78rem;color:var(--color-svv-muted)}
.rec-role{font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.02em}

/* ══ LE MOTEUR DE RECHERCHE ════════════════════════════════════════════════════════════════════════════════ */
.rec-champ{display:flex;flex-direction:column;gap:.25rem;min-width:0}
/* LA LEGENDE EST AU-DESSUS DU CHAMP, jamais dedans : un texte d'aide qui disparait a la premiere lettre n'aide
   qu'avant qu'on en ait besoin. */
.rec-legende{font-size:.75rem;color:var(--color-svv-muted);line-height:1.35}
.rec-saisie{min-height:40px;padding:.35rem .55rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.45rem;
  min-width:0;width:100%}
.rec-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rec-vide{margin:.4rem 0 0;font-size:.8rem;color:var(--color-svv-muted)}
/* DEFILEMENT INTERNE (demande d'Arno) : la recherche ne pousse jamais les propositions hors de l'ecran. */
.rec-resultats{margin-top:.4rem;max-height:30vh;overflow-y:auto}
.rec-groupe+.rec-groupe{margin-top:.5rem}
.rec-groupe-titre{margin:0 0 .25rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-ink)}
.rec-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rec-ligne{border-radius:.45rem}
.rec-ligne:hover{background:var(--color-svv-field)}
.rec-ligne-choix{display:flex;align-items:flex-start;gap:.5rem;padding:5px 6px;min-height:40px;cursor:pointer;
  min-width:0}
.rec-ligne-corps{display:flex;flex-direction:column;gap:1px;min-width:0}
/* VALEURS FONCEES, LIBELLES GRIS (demande d'Arno) : la hierarchie se lit sans couleur supplementaire. */
.rec-ligne-titre{font-size:.84rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-parties{font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rec-ligne-role{font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;
  color:var(--color-svv-muted)}
.rec-ligne-sep{color:var(--color-svv-muted)}
.rec-ligne-motif{font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}

.rec-note{font-size:.78rem;color:var(--color-svv-muted)}
.rec-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem;margin-top:.8rem}
@media (max-width:520px){
  .rec{width:100%;max-width:100%}
  .rec-pied>.svv-btn{flex:1 1 100%}
}
`;
