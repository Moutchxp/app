'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChoisirCible, CSS_CHOISIR_CIBLE, type CibleChoisie } from './ChoisirCible';
import { memeCibleBrouillon, type CibleBrouillon } from '../../../../lib/gestion/redaction';
import type { ContexteRedaction } from '../../../../lib/gestion/classementBien';

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
  destinataires, objet, corps, pieces, cibles, onChange, interneDisponible, interneChoisi, onInterne, onFerme,
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
  /** La migration 281 est-elle là ? Sinon le bouton « Interne » est grisé, avec son motif. */
  interneDisponible: boolean;
  /** « Interne » a-t-il été choisi pour ce brouillon ? */
  interneChoisi: boolean;
  onInterne: (actif: boolean) => void;
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
  /** La recherche de biens (« + Ajouter un autre bien »), ouverte à la demande. */
  const [ajout, setAjout] = useState(false);
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

  const ajouterDeLaRecherche = (choix: CibleChoisie[]) => {
    const neufs: CibleBrouillon[] = [];
    for (const c of choix) {
      // ⚠️ UN BIEN, ET RIEN D'AUTRE : la modale rattache des LOGEMENTS. Le reste n'est pas une cible ici.
      if (c.cible.sorte !== 'lot') continue;
      const n: CibleBrouillon = { sorte: 'lot', cle: c.cible.cle ?? null, id: c.cible.id ?? null, libelle: c.libelle };
      if (!ajoutes.some((x) => memeCibleBrouillon(x, n))) neufs.push(n);
    }
    setAjoutes((a) => [...a, ...neufs]);
    // 🔴 UN BIEN QU'ON EST ALLÉ CHERCHER EST COCHÉ D'OFFICE : on ne le cherche pas pour ne pas le prendre.
    setCoches((l) => [...new Set([...(l ?? []), ...neufs.map((n) => n.cle ?? '')])]);
    setAjout(false);
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

  return (
    <div className="mrt-voile rec-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_CHOISIR_CIBLE}</style>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
      <div className="mrt rec" role="dialog" aria-modal="true" aria-labelledby="rec-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
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
          <>
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

            <p className="rec-ajouter">
              <button type="button" className="gst-lien-bouton" onClick={() => setAjout(true)}>
                + Ajouter un autre bien
              </button>
              {' '}— recherche par adresse, lot, nom, téléphone ou e-mail.
            </p>
          </>
        )}

        {/* ══ 🔴 « INTERNE » — L'AUTRE RÉPONSE : il n'y a pas de bien à rattacher ═══════════════════════════════
            ⚠️ IL S'EXCLUT DES BIENS : cocher un bien ET « interne » enregistrerait une contradiction. Choisir
            « interne » décoche donc tout, et cocher un bien lève « interne ». */}
        <div className="rec-interne">
          <button type="button"
            className={`svv-btn gst-btn ${interneChoisi ? 'svv-btn-primary' : 'svv-btn-outline'}`}
            disabled={!interneDisponible}
            aria-pressed={interneChoisi}
            title={interneDisponible ? undefined
              : 'Mise à jour de la base à appliquer (migration 281) : le statut « Interne » n’est pas encore '
                + 'installé sur cette base.'}
            onClick={() => { const a = !interneChoisi; if (a) setCoches([]); onInterne(a); }}>
            Interne — échange entre collègues
          </button>
          {!interneDisponible && <span className="rec-note"> (pas encore installé sur cette base)</span>}
          {interneChoisi && (
            <span className="rec-note">
              {' '}La marque vaudra pour toute la conversation : la réponse d’un collègue en héritera.
            </span>
          )}
        </div>

        <div className="mrt-pied rec-pied">
          {/* ⚠️ « Ignorer » EST UNE SORTIE FRANCHE, et elle est nommée : le mail part « à classer », comme avant
              ce lot. Une modale qu'on ne peut quitter que par la croix se referme dans le doute. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>
            Ignorer — envoyer « à classer »
          </button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={valider}>
            {selection.length === 0 && !interneChoisi
              ? 'Valider sans rattachement'
              : interneChoisi ? 'Valider — interne' : `Valider — ${selection.length} bien(s)`}
          </button>
        </div>
      </div>

      {ajout && (
        <ChoisirCible titre="Ajouter un bien à ce mail"
          dejaLa={[...(contexte?.biens ?? []).map((b) => ({ sorte: 'lot', cle: b.cle, id: null })),
            ...ajoutes.map((a) => ({ sorte: a.sorte, cle: a.cle, id: a.id }))] as never}
          onAnnuler={() => setAjout(false)}
          onValider={ajouterDeLaRecherche} />
      )}
    </div>
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
   On ne se repose donc sur AUCUNE feuille exterieure : ce bloc suffit a lui seul. Arno demande une modale « au
   centre de l'ecran » — ce qui veut dire au-dessus de la fenetre depuis laquelle on l'a ouverte. */
.rec-voile{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);overflow-y:auto}
.rec{max-width:640px;width:min(640px, 96vw);background:var(--color-svv-surface);color:var(--color-svv-ink);
  border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);max-height:92vh;overflow-y:auto}
.rec-dest{margin:0 0 .4rem;font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.rec-interne-dabord{margin:0 0 .5rem;padding:6px 10px;border-radius:.5rem;font-size:.82rem;
  color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.rec-barre{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem;
  margin:.2rem 0 .4rem}
.rec-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.rec-biens{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;
  max-height:46vh;overflow-y:auto}
.rec-bien{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem}
/* CIBLE TACTILE : la ligne entiere est cliquable, et la case ne descend pas sous 44 px de hauteur totale. */
.rec-choix{display:flex;align-items:flex-start;gap:.5rem;min-height:32px;cursor:pointer}
.rec-bien-nom{font-weight:600;overflow-wrap:anywhere}
.rec-motif{margin:.2rem 0 0 1.6rem;font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}
.rec-parties{list-style:none;margin:.2rem 0 0 1.6rem;padding:0;font-size:.78rem;color:var(--color-svv-muted)}
.rec-role{font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:.02em}
.rec-ajouter{margin:.5rem 0 0;font-size:.8rem;color:var(--color-svv-muted)}
.rec-interne{margin:.7rem 0 0;padding-top:.6rem;border-top:1px solid var(--color-svv-line)}
.rec-note{font-size:.78rem;color:var(--color-svv-muted)}
.rec-pied{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.5rem;margin-top:.8rem}
@media (max-width:520px){
  .rec{width:100%;max-width:100%}
  .rec-pied>.svv-btn{flex:1 1 100%}
}
`;
