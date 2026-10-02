'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  motRoleInstantane, tonRoleInstantane,
  AUCUNE_INTERVENTION, INTRO_INTERVENTIONS, TITRE_INTERVENTIONS,
  type InterventionDeFiche, type RoleInstantane,
} from '../../../../lib/gestion/contactExterne';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — « ÉCHANGES PAR UN CONTACT EXTÉRIEUR », DANS UNE FICHE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (02/10/2026) : « Le mail apparaît dans “Vie du bien” ET dans l'historique de chaque carte ou
 * fiche concernée, avec le rôle instantané et le contact externe (“via Me Martin, avocat”). C'est une section ou
 * un filtre DISTINCT des “Documents automatiques”. »
 *
 * 🔴 DISTINCT, ET LA PHRASE D'INTRODUCTION LE DIT. Deux listes de mails dans la même fiche se confondraient au
 * premier coup d'œil, et elles ne disent pas la même chose :
 *   · « Documents automatiques » — NOS envois (quittances, avis, relances), rangés chez une PERSONNE, SANS bien ;
 *   · « Échanges par un contact extérieur » — du courrier REÇU, rattaché à un BIEN, qui concerne AUSSI cette
 *     personne par un intermédiaire. Le bien est affiché sur chaque ligne, et ce n'est pas décoratif : une
 *     intervention ne vit jamais sans son bien (migration 293).
 *
 * 🔴 LE RÔLE AFFICHÉ EST CELUI DU JOUR DU MAIL, ET IL NE BOUGERA PLUS. Un courrier d'avocat d'août 2025 porte
 * « Locataire occupant » pour toujours, même si la personne est partie depuis. C'est tout l'objet de l'instantané
 * — sans lui, la même ligne changerait de sens chaque année.
 *
 * ⚠️ SANS LA MIGRATION 293, LA ROUTE REND « sans_schema » ET LA SECTION NE S'AFFICHE PAS DU TOUT. Pas de cadre
 * vide, pas de « bientôt disponible » : la fiche est exactement celle d'avant ce lot.
 *
 * ⚠️ UNE FICHE SANS INTERVENTION N'A PAS DE SECTION NON PLUS — une ligne discrète, et rien d'autre. C'est le cas
 * NORMAL : la plupart des locataires n'ont jamais d'avocat.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : seuls les mots et les types du module PUR entrent ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function InterventionsDeLaFiche({ sorte, id, onOuvrirFil }: {
  sorte: 'proprietaire' | 'locataire';
  /** L'identifiant de la fiche. La CLÉ est relue par le serveur : elle ne transite pas par le navigateur. */
  id: number;
  /** Ouvrir l'échange depuis une ligne. Absent ⇒ les lignes restent du texte (cas d'une fiche en lecture). */
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'absent' } | { v: 'ok'; liste: InterventionDeFiche[] }
  >({ v: 'charge' });
  /** Le filtre par rôle : il n'apparaît que s'il y a au moins deux rôles différents à départager. */
  const [role, setRole] = useState<RoleInstantane | ''>('');

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/annuaire/interventions?sorte=${sorte}&id=${id}`,
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: InterventionDeFiche[] };
        if (!vivant) return;
        /**
         * 🔴 « sans_schema » ET TOUTE ERREUR MÈNENT AU MÊME ÉTAT : la section disparaît. Une fiche ne doit jamais
         * afficher un cadre en panne pour une nouveauté qui n'est pas encore installée — c'est la règle que
         * `DocumentsAutomatiques` applique déjà, et pour la même raison.
         */
        setEtat(d.etat === 'ok' && Array.isArray(d.data) ? { v: 'ok', liste: d.data } : { v: 'absent' });
      } catch {
        if (vivant) setEtat({ v: 'absent' });
      }
    })();
    return () => { vivant = false; };
  }, [sorte, id]);

  const liste = etat.v === 'ok' ? etat.liste : [];
  const roles = useMemo(
    () => [...new Set(liste.map((x) => x.role))] as RoleInstantane[], [liste]);
  const visibles = useMemo(
    () => liste.filter((x) => role === '' || x.role === role), [liste, role]);

  // ⚠️ RIEN À MONTRER ⇒ RIEN DU TOUT : ni titre, ni cadre. Une section vide se lit comme une panne.
  if (etat.v !== 'ok') return null;
  if (liste.length === 0) return <p className="ann-gris itv-vide">{AUCUNE_INTERVENTION}</p>;

  return (
    <section className="ann-bloc itv" aria-labelledby={`itv-titre-${sorte}-${id}`}>
      <style>{CSS_INTERVENTIONS}</style>
      <h4 className="ann-bloc-titre" id={`itv-titre-${sorte}-${id}`}>
        {TITRE_INTERVENTIONS}
        <span className="gst-compte">{liste.length}</span>
      </h4>
      {/* 🔴 LA PHRASE QUI DISTINGUE LES DEUX LISTES (demande d'Arno). Elle est en tête, parce que c'est à la
          première lecture qu'on risque de les confondre. */}
      <p className="itv-intro">{INTRO_INTERVENTIONS}</p>

      {/* LE FILTRE N'APPARAÎT QUE S'IL DÉPARTAGE QUELQUE CHOSE : un seul rôle, et il ne sert à rien. */}
      {roles.length > 1 && (
        <div className="itv-filtres" role="group" aria-label="Filtrer par rôle à la date du mail">
          <button type="button" aria-pressed={role === ''}
            className={`itv-filtre${role === '' ? ' itv-filtre--actif' : ''}`}
            onClick={() => setRole('')}>Tous</button>
          {roles.map((r) => (
            <button key={r} type="button" aria-pressed={role === r}
              className={`itv-filtre${role === r ? ' itv-filtre--actif' : ''}`}
              onClick={() => setRole(r)}>{motRoleInstantane(r)}</button>
          ))}
        </div>
      )}

      <ul className="itv-liste">
        {visibles.map((x) => (
          <li key={x.messageId} className="itv-item">
            <div className="itv-haut">
              <span className="itv-date">{dateFr(x.le)}</span>
              {/* 🔴 LE RÔLE EST CELUI DU JOUR DU MAIL. Le MOT porte l'information, le ton ne fait que l'appuyer. */}
              <span className={`itv-pastille itv-pastille--${tonRoleInstantane(x.role)}`}
                title={`Rôle au ${dateFr(x.le)}, figé à cette date`}>
                {motRoleInstantane(x.role)}
              </span>
              {/* 🔴 « via Me Martin, avocat » — composé par le dépôt depuis le contact mémorisé. */}
              {x.via !== null && <span className="itv-via">{x.via}</span>}
            </div>
            <p className="itv-objet">{x.objet === '' ? '(sans objet)' : x.objet}</p>
            {/* 🔴 LE OU LES BIENS DU MÊME MAIL, TOUJOURS : une intervention ne vit jamais sans son bien, et
                l'afficher le PROUVE à l'écran. Une ligne sans aucun bien serait le signe d'une intervention
                orpheline — le cas que la migration 293 nomme sans pouvoir l'empêcher. */}
            <p className="itv-biens">
              {x.biens.length === 0
                ? <span className="itv-orphelin">aucun bien rattaché à ce mail — à reprendre</span>
                : x.biens.map((b) => <span key={b.cle} className="itv-bien">{b.libelle}</span>)}
            </p>
            {onOuvrirFil && x.filId > 0 && (
              <button type="button" className="gst-lien-bouton"
                onClick={() => onOuvrirFil(x.filId, x.messageId)}>Ouvrir l’échange →</button>
            )}
          </li>
        ))}
      </ul>
      {visibles.length === 0 && (
        <p className="ann-gris" role="status">Aucun échange avec ce rôle.</p>
      )}
    </section>
  );
}

/** Une date ISO en date française. ⚠️ Aucun `new Date` : un jour civil ne passe pas par un fuseau. PUR. */
export function dateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? iso : `${m[3]}/${m[2]}/${m[1]}`;
}

export const CSS_INTERVENTIONS = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : un seul le terminerait (piege consigne douze fois dans ce depot). */
.itv-intro{margin:0 0 .6rem;font-size:.8rem;line-height:1.45;color:var(--color-svv-muted)}
.itv-vide{margin:.3rem 0 0;font-size:.8rem;font-style:italic}
.itv-filtres{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .5rem}
.itv-filtre{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:999px;padding:.3rem .8rem;font:inherit;font-size:.78rem;color:var(--color-svv-muted);
  cursor:pointer;min-height:36px}
.itv-filtre:hover{color:var(--color-svv-ink)}
/* LE FILTRE ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.itv-filtre--actif{background:var(--color-svv-ink);border-color:var(--color-svv-ink);
  color:var(--color-svv-surface);font-weight:700}
.itv-filtre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.itv-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.itv-item{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.itv-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;min-width:0}
.itv-date{font-size:.78rem;font-weight:700;color:var(--color-svv-ink);flex:0 0 auto}
.itv-pastille{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;
  border:1px solid transparent;flex:0 0 auto;white-space:nowrap}
.itv-pastille--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);
  border-color:var(--color-svv-green-soft)}
.itv-pastille--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-soft)}
.itv-pastille--gris{background:var(--color-svv-field);color:var(--color-svv-muted);
  border-color:var(--color-svv-line)}
/* « via Me Martin, avocat » : en italique, parce que c'est un intermediaire et non l'auteur du dossier. */
.itv-via{font-size:.76rem;font-style:italic;color:var(--color-svv-muted);overflow-wrap:anywhere}
.itv-objet{margin:.25rem 0 0;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
.itv-biens{display:flex;flex-wrap:wrap;gap:.3rem;margin:.25rem 0 0;min-width:0}
.itv-bien{font-size:.74rem;color:var(--color-svv-muted);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-radius:.4rem;padding:.05rem .4rem;overflow-wrap:anywhere}
/* 🔴 UN CAS QUI NE DOIT PAS SE PRODUIRE, ET QUI SE VOIT S'IL SE PRODUIT. Le liseret rouge n'est qu'un renfort :
   c'est le MOT qui porte l'information, regle du module depuis la premiere capsule. */
.itv-orphelin{font-size:.74rem;font-weight:700;color:var(--color-svv-red-dark);
  background:var(--color-svv-red-soft);border-radius:.4rem;padding:.05rem .4rem}
`;
