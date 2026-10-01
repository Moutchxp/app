'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  descriptifDuBien, descriptifPauvre, DESCRIPTIF_A_COMPLETER, type LigneDescriptif,
} from '../../../../lib/gestion/descriptifBien';
import { texteFiche } from '../../../../lib/gestion/ecranUrl';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';

/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LA PASTILLE « i », ET CE QU'ELLE OUVRE ══════════════════════════════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « À côté du titre de chaque bien, une petite pastille “i”. Un clic (ou le survol
 * plus Entrée au clavier) ouvre une petite fenêtre flottante ancrée au bien, avec TOUT le descriptif connu du
 * bien […]. Lien “Ouvrir la fiche du bien” dans la fenêtre. Fermeture par la croix, par Échap ou par un clic à
 * l'extérieur. Cliquer la pastille ne coche ni ne décoche le bien. »
 *
 * ═══ 🔴🔴 « CLIQUER LA PASTILLE NE COCHE NI NE DÉCOCHE LE BIEN » — ET C'EST LE POINT DÉLICAT ═════════════════════
 *
 * La pastille vit DANS le libellé d'une case à cocher. Or un clic sur un `<label>` coche la case qu'il désigne :
 * c'est le comportement du navigateur, pas une option. Sans précaution, consulter un descriptif aurait coché le
 * bien — l'exact contraire de ce qu'Arno demande, et une erreur qu'on ne remarquerait qu'après avoir validé.
 *
 * 🔴 ON ARRÊTE DONC L'ÉVÉNEMENT À TROIS ENDROITS, et il en faut trois :
 *   ① `preventDefault` sur le CLIC — c'est lui qui annule l'activation du label ;
 *   ② `stopPropagation` — pour que le clic ne remonte pas jusqu'au label ni jusqu'à la ligne cliquable ;
 *   ③ `onMouseDown` avec `preventDefault` — certains navigateurs activent le label dès l'enfoncement, et le
 *      `click` arrive trop tard pour l'empêcher. C'est la même précaution que la liste de suggestions
 *      d'adresses du lot REDACTION (correctif du 24/09/2026), et pour exactement la même raison.
 *
 * ⚠️ LA FENÊTRE NE CHARGE QU'À L'OUVERTURE. Une modale montre parfois quarante biens : charger quarante fiches
 * pour des pastilles que personne n'ouvrira ferait quarante requêtes à chaque recherche.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : `FicheLot` passe par `import type`, effacé à la compilation.
 */
export function InfoBien({ cle, titre }: {
  /** La clé WIPPIMMO du lot. C'est tout ce que les écrans de rattachement connaissent du bien. */
  cle: string;
  /** Le titre affiché à côté, repris dans l'en-tête de la fenêtre : on doit savoir de quel bien on parle. */
  titre: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<
    { v: 'repos' } | { v: 'charge' } | { v: 'ok'; fiche: FicheLot } | { v: 'erreur'; message: string }
  >({ v: 'repos' });
  const racine = useRef<HTMLSpanElement | null>(null);

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/annuaire?lotCle=${encodeURIComponent(cle)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: FicheLot };
      if (d.etat !== 'ok' || d.data === undefined) {
        setEtat({ v: 'erreur', message: 'La fiche de ce bien n’a pas pu être lue.' });
        return;
      }
      setEtat({ v: 'ok', fiche: d.data });
    } catch {
      setEtat({ v: 'erreur', message: 'La fiche de ce bien n’a pas pu être lue.' });
    }
  }, [cle]);

  /**
   * ══ 🔴 LES TROIS SORTIES D'ARNO : la croix, « Échap », et un clic à l'extérieur ═══════════════════════════
   *
   * ⚠️ `mousedown` ET NON `click` POUR L'EXTÉRIEUR : au `click`, le navigateur a déjà activé ce qui se trouvait
   * sous le doigt — une case à cocher, par exemple. En écoutant l'enfoncement, la fenêtre se referme avant.
   *
   * ⚠️ EN PHASE DE CAPTURE : la modale de rattachement arrête certains événements sur son propre voile ; un
   * écouteur en phase de bulle ne les verrait jamais, et la fenêtre resterait ouverte.
   */
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e: MouseEvent): void => {
      if (racine.current !== null && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); }
    };
    document.addEventListener('mousedown', dehors, true);
    /**
     * ⚠️ ET LE `click` AUSSI, EN PLUS DU `mousedown`. Un geste qui n'émet pas d'enfoncement — une activation au
     * clavier, un clic simulé — laisserait sinon DEUX fenêtres ouvertes en même temps (constaté à l'écran en
     * ouvrant deux pastilles de suite). L'ordre tient : la capture du document s'exécute avant le gestionnaire
     * de la pastille, donc l'ancienne fenêtre se ferme avant que la nouvelle ne s'ouvre.
     */
    document.addEventListener('click', dehors, true);
    document.addEventListener('keydown', echap, true);
    return () => {
      document.removeEventListener('mousedown', dehors, true);
      document.removeEventListener('click', dehors, true);
      document.removeEventListener('keydown', echap, true);
    };
  }, [ouvert]);

  const basculer = (e: { preventDefault: () => void; stopPropagation: () => void }): void => {
    // 🔴 LES TROIS GESTES QUI EMPÊCHENT LA CASE DE SE COCHER (voir l'encadré du composant).
    e.preventDefault();
    e.stopPropagation();
    const futur = !ouvert;
    setOuvert(futur);
    if (futur && etat.v === 'repos') void charger();
  };

  const fiche = etat.v === 'ok' ? etat.fiche : null;
  const lignes: LigneDescriptif[] = fiche === null ? [] : descriptifDuBien({
    cle: fiche.numero,
    nature: fiche.nature, typeBien: fiche.typeBien, immeuble: fiche.immeuble,
    adresse: fiche.adresse, codePostal: fiche.codePostal, commune: fiche.commune,
    gestionDebut: fiche.debut, gestionFin: fiche.fin,
    // ⚠️ `surfaceM2` EST TOUJOURS `null` EN BASE (aucune colonne de surface n'existe) : la ligne ne s'affiche
    //   donc jamais aujourd'hui, et s'affichera d'elle-même le jour où l'import la portera.
    surface: fiche.surfaceM2 === null ? null : `${fiche.surfaceM2} m²`,
    proprietaires: fiche.proprietaires.length > 0
      ? fiche.proprietaires.map((p) => p.nom)
      : [fiche.proprietaireNom],
    // 🔴 LES OCCUPANTS EN PLACE, c'est-à-dire ceux dont l'occupation n'a pas de date de sortie. L'historique
    //   complet est dans la fiche du bien — cette fenêtre dit QUI EST LÀ, pas qui est passé.
    occupants: fiche.occupations.filter((o) => (o.sortie ?? '') === '')
      .map((o) => ({ nom: o.nom, depuis: o.entree })),
    driveDossierId: fiche.driveDossierId,
  });

  return (
    <span className="ifb" ref={racine}>
      {/* 🔴 LA FEUILLE DE STYLE N'EST PAS MONTÉE ICI, ET C'EST VOULU. La pastille vit DANS le libellé d'une case
          à cocher : un élément `style` à cet endroit entre dans le `textContent` du titre — mesuré, une épreuve
          y lisait le texte de la feuille collé au nom du bien. L'écran qui emploie la pastille monte
          `CSS_INFO_BIEN`, comme il monte déjà les autres feuilles du module. */}
      {/* ⚠️ `type="button"` : dans un formulaire, un bouton sans type SOUMET — et la modale se refermerait. */}
      <button type="button" className="ifb-pastille" aria-expanded={ouvert}
        aria-label={`Descriptif du bien — ${titre}`} title="Descriptif du bien"
        onMouseDown={basculer} onClick={basculer}>
        <span aria-hidden="true">i</span>
      </button>

      {ouvert && (
        <span className="ifb-fenetre" role="dialog" aria-label={`Descriptif — ${titre}`}>
          <span className="ifb-tete">
            <span className="ifb-titre">{titre}</span>
            <button type="button" className="ifb-croix" aria-label="Fermer le descriptif"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOuvert(false); }}>
              ×
            </button>
          </span>

          {etat.v === 'charge' && <span className="ifb-note" role="status">Lecture de la fiche…</span>}
          {etat.v === 'erreur' && <span className="ifb-note" role="alert">{etat.message}</span>}

          {fiche !== null && (
            <>
              <dl className="ifb-liste">
                {lignes.map((l) => (
                  <span className="ifb-ligne" key={`${l.libelle}-${l.valeur}`}>
                    <dt className="ifb-libelle">{l.libelle}</dt>
                    <dd className="ifb-valeur">{l.valeur}</dd>
                  </span>
                ))}
              </dl>
              {/* 🔴 « s'il ne reste presque rien, la fenêtre l'indique » — et « presque rien » veut dire : rien
                  au-delà de ce que le titre disait déjà (voir `descriptifBien`). */}
              {descriptifPauvre(lignes) && <span className="ifb-note">{DESCRIPTIF_A_COMPLETER}</span>}
              {/* ⚠️ UN VRAI LIEN, dans un nouvel onglet : on consulte une fiche sans perdre le classement en
                  cours. Un bouton qui NAVIGUERAIT ferait refermer la modale et oublier les cases cochées. */}
              <a className="ifb-fiche" target="_blank" rel="noreferrer"
                href={`/admin/gestion?ecran=annuaire&fiche=${encodeURIComponent(
                  texteFiche({ sorte: 'lot', id: fiche.id }))}`}>
                Ouvrir la fiche du bien
              </a>
            </>
          )}
        </span>
      )}
    </span>
  );
}

export const CSS_INFO_BIEN = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne plusieurs fois dans ce depot).

   ══ 🔴 LA PASTILLE « i » ════════════════════════════════════════════════════════════════════════════════════════
   Petite, discrete, et pourtant atteignable : 18 px a l'oeil, 20 px de cible reelle, 28 px au doigt. Elle vit
   dans le libelle d'une case a cocher, donc en ligne avec le texte, jamais au-dessus. */
.ifb{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}
.ifb-pastille{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;
  margin:0 0 0 .3rem;font:inherit;font-size:.68rem;font-weight:700;font-style:italic;line-height:1;
  color:var(--color-svv-muted);background:transparent;border:1px solid var(--color-svv-line-strong);
  border-radius:50%;cursor:pointer;flex:0 0 auto}
.ifb-pastille:hover{color:var(--color-svv-ink);border-color:var(--color-svv-ink)}
.ifb-pastille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (pointer:coarse){.ifb-pastille{width:24px;height:24px;font-size:.78rem}}

/* ══ 🔴 LA FENETRE, ANCREE AU BIEN (demande d'Arno) ══════════════════════════════════════════════════════════════
   Elle s'ouvre SOUS la pastille, decalee a gauche pour ne pas sortir de la modale : un descriptif qui deborde
   hors de l'ecran n'est pas un descriptif.
   ⚠️ z-index 90 : au-dessus du voile de la modale de rattachement (80), sans quoi elle naitrait DERRIERE elle. */
.ifb-fenetre{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:90;
  display:flex;flex-direction:column;gap:.3rem;width:min(320px, 80vw);max-height:60vh;overflow-y:auto;
  padding:10px 12px;font-size:.8rem;font-weight:400;font-style:normal;text-align:left;line-height:1.4;
  color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;box-shadow:0 10px 30px rgba(0,0,0,.22);
  cursor:default;white-space:normal}
/* Pres du bord droit d'une modale etroite, on recale la fenetre sous la pastille plutot que centree. */
@media (max-width:560px){
  .ifb-fenetre{left:auto;right:0;transform:none;width:min(280px, 88vw)}
}
.ifb-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem}
.ifb-titre{font-weight:700;overflow-wrap:anywhere}
.ifb-croix{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;padding:0;
  font:inherit;font-size:1.1rem;line-height:1;color:var(--color-svv-muted);background:transparent;border:0;
  border-radius:50%;cursor:pointer;flex:0 0 auto}
.ifb-croix:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.ifb-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

/* LE DESCRIPTIF : un libelle gris, une valeur foncee — la hierarchie se lit sans couleur supplementaire. */
.ifb-liste{display:flex;flex-direction:column;gap:2px;margin:0;padding:0}
.ifb-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;min-width:0}
.ifb-libelle{margin:0;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.ifb-valeur{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
.ifb-note{font-size:.76rem;font-style:italic;color:var(--color-svv-muted)}
.ifb-fiche{align-self:flex-start;margin-top:.2rem;font-size:.78rem;font-weight:600;color:var(--color-svv-red);
  text-decoration:underline;text-underline-offset:3px}
`;
