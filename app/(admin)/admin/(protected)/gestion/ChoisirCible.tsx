'use client';

import { useEffect, useState } from 'react';
import type { LigneResultat, Resultats } from '../../../../lib/gestion/annuaireRepo';
import type { Cible } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-1 — CHOISIR UN OU PLUSIEURS LOGEMENTS / PROPRIÉTAIRES DANS L'ANNUAIRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN SEUL PANNEAU POUR LES DEUX ÉCRANS — le bandeau d'un mail et la file de tri. Deux panneaux de recherche
 * divergeraient au premier changement : l'un accepterait le choix multiple et l'autre non, et personne ne saurait
 * lequel fait foi.
 *
 * 🔴 CHOIX MULTIPLE, parce que c'est le besoin réel : un dégât des eaux touche deux appartements, un mail de charges
 * concerne le bailleur ET son logement. On coche, puis on valide une fois.
 *
 * ⚠️ IL RÉUTILISE LA RECHERCHE DE L'ANNUAIRE TELLE QUELLE (`/api/admin/gestion/annuaire?q=`) : un seul champ, toutes
 * les entrées (nom, adresse, téléphone, e-mail, numéro de lot). Écrire un second moteur de recherche donnerait deux
 * comportements pour une seule question.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`. Les types viennent par `import type`, effacé à la compilation — c'est ce que le garde
 * `clientBoundary.guard.test.ts` vérifie, après l'incident du 24/09/2026 où toute l'application est tombée.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une cible proposée au choix, avec son nom lisible. */
export interface CibleChoisie { cible: Cible; libelle: string }

/** La clé d'une cible dans les cases cochées. Distingue un LOT d'un PROPRIÉTAIRE de même clé. PUR. */
export function cleChoix(c: Cible): string {
  return `${c.sorte}|${c.cle ?? ''}|${c.id ?? 0}`;
}

/**
 * LES CIBLES QU'UNE LIGNE DE RÉSULTAT PROPOSE : son logement, et son propriétaire. PUR.
 *
 * ⚠️ UNE LIGNE SANS LOT (un bailleur dont on ne gère rien) ne propose QUE le propriétaire ; une ligne de locataire
 * hors gestion n'en propose aucune, et on ne l'affiche pas plutôt que d'afficher une ligne inerte.
 */
export function ciblesDeLaLigne(l: LigneResultat): CibleChoisie[] {
  const out: CibleChoisie[] = [];
  if (l.lotNumero !== null && l.lotNumero !== '') {
    const lieu = [l.adresse, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
    out.push({
      cible: { sorte: 'lot', cle: l.lotNumero, id: null },
      libelle: `${lieu === '' ? 'Adresse non renseignée' : lieu} — lot ${l.lotNumero}`,
    });
  }
  if (l.proprietaireCle !== null && l.proprietaireCle !== '') {
    out.push({
      cible: { sorte: 'proprietaire', cle: l.proprietaireCle, id: null },
      libelle: l.proprietaireNom.trim() === '' ? `propriétaire ${l.proprietaireCle}` : l.proprietaireNom,
    });
  }
  return out;
}

export function ChoisirCible({ titre, dejaLa, onValider, onAnnuler }: {
  titre: string;
  /** Les cibles DÉJÀ rattachées : leurs cases sont cochées et verrouillées, pour qu'on ne les repose pas. */
  dejaLa?: readonly Cible[];
  onValider: (choix: CibleChoisie[]) => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState<'vide' | 'cherche' | 'ok' | 'sans_schema' | 'erreur'>('vide');
  const [resultats, setResultats] = useState<Resultats>({ lignes: [], tronque: false });
  const [choisis, setChoisis] = useState<Map<string, CibleChoisie>>(new Map());
  const [envoi, setEnvoi] = useState(false);

  const verrouillees = new Set((dejaLa ?? []).map(cleChoix));

  // La recherche part APRÈS une pause : une requête par frappe ferait dix requêtes pour un mot de dix lettres.
  useEffect(() => {
    const t = texte.trim();
    if (t.length < 2) { setEtat('vide'); setResultats({ lignes: [], tronque: false }); return; }
    setEtat('cherche');
    let vivant = true;
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string; data?: Resultats };
          if (!vivant) return;
          if (d.etat === 'ok') { setResultats(d.data ?? { lignes: [], tronque: false }); setEtat('ok'); }
          else if (d.etat === 'sans_schema') setEtat('sans_schema');
          else setEtat('erreur');
        } catch {
          if (vivant) setEtat('erreur');
        }
      })();
    }, 250);
    return () => { vivant = false; clearTimeout(minuteur); };
  }, [texte]);

  const basculer = (c: CibleChoisie): void => {
    const cle = cleChoix(c.cible);
    if (verrouillees.has(cle)) return;
    setChoisis((m) => {
      const n = new Map(m);
      if (n.has(cle)) n.delete(cle); else n.set(cle, c);
      return n;
    });
  };

  // Les mêmes cibles reviennent d'une ligne à l'autre (un bailleur a plusieurs lots) : on ne les montre qu'une fois.
  const vues = new Set<string>();
  const propositions: CibleChoisie[] = [];
  for (const l of resultats.lignes) {
    for (const c of ciblesDeLaLigne(l)) {
      const cle = cleChoix(c.cible);
      if (vues.has(cle)) continue;
      vues.add(cle);
      propositions.push(c);
    }
  }

  return (
    <div className="chc" role="group" aria-label={titre}>
      <style>{CSS_CHOISIR_CIBLE}</style>
      <p className="chc-titre">{titre}</p>

      <input type="search" className="chc-champ" value={texte} onChange={(e) => setTexte(e.target.value)}
        placeholder="Nom, adresse, téléphone, e-mail, numéro de lot…"
        aria-label="Chercher dans l’annuaire" autoComplete="off" />

      {etat === 'sans_schema' && <p className="gst-tronc">Annuaire pas encore installé (migration 253 à appliquer).</p>}
      {etat === 'erreur' && <p className="gst-tronc" role="alert">L’annuaire n’a pas répondu. Réessayez.</p>}
      {etat === 'vide' && texte.trim() !== '' && texte.trim().length < 2 && (
        <p className="chc-aide">Tapez au moins deux caractères.</p>
      )}
      {etat === 'cherche' && <p className="chc-aide" role="status">Recherche…</p>}

      {etat === 'ok' && propositions.length === 0 && (
        <p className="chc-aide">Personne ne correspond à « {texte.trim()} ».</p>
      )}

      {propositions.length > 0 && (
        <ul className="chc-liste">
          {propositions.map((c) => {
            const cle = cleChoix(c.cible);
            const verrou = verrouillees.has(cle);
            return (
              <li key={cle}>
                <label className={`chc-ligne${verrou ? ' chc-ligne--verrou' : ''}`}>
                  <input type="checkbox" checked={verrou || choisis.has(cle)} disabled={verrou}
                    onChange={() => basculer(c)} />
                  {/* La SORTE est écrite en toutes lettres : « Logement » ou « Propriétaire ». Aucune couleur seule. */}
                  <span className="chc-sorte">{c.cible.sorte === 'lot' ? 'Logement' : 'Propriétaire'}</span>
                  <span className="chc-nom">{c.libelle}</span>
                  {verrou && <span className="chc-note">déjà rattaché</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* La troncature est DITE, jamais cachée : la même règle que la recherche de l'annuaire. */}
      {resultats.tronque && (
        <p className="chc-aide">Seuls les premiers résultats sont montrés — précisez votre recherche.</p>
      )}

      <div className="chc-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn"
          disabled={choisis.size === 0 || envoi}
          onClick={() => {
            setEnvoi(true);
            void (async () => {
              try { await onValider([...choisis.values()]); } finally { setEnvoi(false); }
            })();
          }}>
          {envoi ? 'Rattachement…' : choisis.size <= 1 ? 'Rattacher' : `Rattacher les ${choisis.size} choisis`}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export const CSS_CHOISIR_CIBLE = `
/* Un panneau sobre, mobile d'abord : tout s'empile, les cibles tactiles font au moins 44 px. */
.chc{display:flex;flex-direction:column;gap:.5rem;margin:.6rem 0;padding:12px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.chc-titre{margin:0;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted)}
.chc-champ{width:100%;min-height:44px;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-bg,#fff);color:var(--color-svv-ink);font:inherit}
.chc-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.chc-aide{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.chc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;
  max-height:min(50vh,320px);overflow-y:auto}
.chc-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-height:44px;padding:6px 8px;
  border-radius:8px;cursor:pointer;overflow-wrap:anywhere}
.chc-ligne:hover{background:var(--color-svv-line)}
.chc-ligne:focus-within{outline:2px solid var(--color-svv-red);outline-offset:1px}
.chc-ligne--verrou{cursor:default;opacity:.7}
.chc-ligne input{min-width:20px;min-height:20px;align-self:center}
.chc-sorte{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.chc-nom{font-size:.85rem;color:var(--color-svv-ink)}
.chc-note{font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}
.chc-boutons{display:flex;flex-wrap:wrap;gap:.4rem}
`;
