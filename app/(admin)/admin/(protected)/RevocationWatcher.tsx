'use client';

import { useEffect, useState } from 'react';

/**
 * Surveille les réponses de l'API admin et affiche un overlay dédié quand la session n'est plus exploitable — SANS jamais
 * rediriger ni reconnecter tout seul (l'utilisateur doit comprendre pourquoi l'écran s'est vidé). DEUX cas, UN SEUL foyer :
 *
 *   · 401 (SESSION) — le proxy (`proxy.ts`) renvoie un 401 à CORPS VIDE pour toute `/api/admin/*` sans session valide (cookie
 *     absent / invalide / EXPIRÉ). Le statut SUFFIT (aucun parsing). `/api/admin/session` est EXCLU : son 401 = mauvais mot de
 *     passe sur la page de connexion (route whitelistée, hors layout protégé) → jamais une expiration.
 *   · 403 (DROITS) — droits révoqués pendant la session : `{ erreur: 'ACCES_REVOQUE' }` posé par le garde `exigerCompteActif`
 *     (M3-0). Cause LUE dans le corps JSON. Comportement strictement inchangé.
 *
 * PLACEMENT MINIMAL (justifié) : il n'existe aucun helper `fetch` commun côté admin — les appels sont dispersés dans des
 * dizaines de sites (dont des fichiers carto sensibles). Plutôt que modifier chaque site d'appel, ce composant est monté UNE
 * fois dans le layout protégé et enveloppe `window.fetch` : il couvre tous les appels admin existants ET futurs, sans toucher
 * aux pages. La sécurité est 100 % serveur (proxy + gardes) ; ce watcher n'est qu'un confort d'UI.
 */
export type MotifSession = 'expire' | 'revoque';

/**
 * Décide le motif d'overlay à partir d'une réponse admin. PUR (testable sans DOM). Le 401 n'a pas de corps → `status` + `url`
 * suffisent. Le 403 exige la cause LUE dans le corps (`ACCES_REVOQUE`) → l'appelant la fournit déjà parsée (`corpsErreur`,
 * `null` si corps absent/non-JSON). Tout le reste → `null` (aucun overlay). `/api/admin/session` est EXCLU du cas 401.
 */
export function motifSession(status: number, url: string, corpsErreur: string | null): MotifSession | null {
  if (!url.includes('/api/admin/')) return null;
  if (status === 401 && !url.includes('/api/admin/session')) return 'expire';
  if (status === 403 && corpsErreur === 'ACCES_REVOQUE') return 'revoque';
  return null;
}

const TEXTES: Record<MotifSession, { titre: string; texte: string }> = {
  expire: { titre: 'Session expirée', texte: 'Reconnectez-vous pour continuer.' },
  revoque: { titre: 'Vos droits d’accès ont été modifiés', texte: 'Reconnectez-vous pour continuer.' },
};

export function RevocationWatcher() {
  const [motif, setMotif] = useState<MotifSession | null>(null);

  useEffect(() => {
    const fetchOriginal = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const reponse = await fetchOriginal(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request | URL).toString();
      if (reponse.status === 401) {
        // 401 SESSION : corps VIDE → le statut suffit, AUCUN parsing (et `/api/admin/session` est exclu par `motifSession`).
        const m = motifSession(401, url, null);
        if (m) setMotif((prev) => prev ?? m); // premier motif gagne (état stable, pas de bascule)
      } else if (reponse.status === 403 && url.includes('/api/admin/')) {
        // 403 DROITS : on clone pour ne pas consommer le flux du vrai appelant, et on lit la cause (ACCES_REVOQUE). INCHANGÉ.
        try {
          const corps = await reponse.clone().json();
          const m = motifSession(403, url, typeof corps?.erreur === 'string' ? corps.erreur : null);
          if (m) setMotif((prev) => prev ?? m);
        } catch {
          /* corps non-JSON : on ignore, réponse rendue telle quelle */
        }
      }
      return reponse;
    };
    return () => {
      window.fetch = fetchOriginal;
    };
  }, []);

  if (!motif) return null;
  const { titre, texte } = TEXTES[motif];

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="svv-revoque-titre" className="svv-revoque-overlay">
      <style>{CSS}</style>
      <div className="svv-revoque-carte">
        <h2 id="svv-revoque-titre" className="svv-revoque-titre">{titre}</h2>
        <p className="svv-revoque-texte">{texte}</p>
        <a href="/admin/login" className="svv-btn svv-btn-primary svv-revoque-lien">
          Se reconnecter
        </a>
      </div>
    </div>
  );
}

const CSS = `
.svv-revoque-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
  padding:1.5rem;background:rgba(20,20,20,.55)}
.svv-revoque-carte{width:100%;max-width:360px;background:#fff;border:1px solid var(--color-svv-line);
  border-radius:.9rem;padding:1.25rem;box-shadow:0 8px 30px rgba(0,0,0,.18)}
.svv-revoque-titre{margin:0 0 6px;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.svv-revoque-texte{margin:0 0 16px;font-size:.9rem;color:var(--color-svv-muted)}
.svv-revoque-lien{display:inline-flex;align-items:center;justify-content:center;min-height:44px;width:100%}
`;
