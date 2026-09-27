'use client';

/**
 * LOT ERGO-BOITE — « DÉCONNEXION », EN HAUT À DROITE, À CÔTÉ DE « CHANGER MON MOT DE PASSE ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 IL N'EST PAS SUPPRIMÉ, IL EST DÉPLACÉ. Demande d'Arno du 27/09/2026. Plusieurs collaborateurs partagent ce
 * poste : sans ce bouton, changer de personne obligerait à vider les cookies. Il quitte le bas de la colonne de
 * gauche — où il voisinait les modules, donc la navigation ordinaire — pour rejoindre l'autre geste de compte, avec
 * lequel il forme une paire évidente.
 *
 * ⚠️ POURQUOI UN COMPOSANT SÉPARÉ. La barre du haut est rendue par `layout.tsx`, qui est un composant SERVEUR : il
 * lit la session en base et ne peut pas porter de `onClick`. Ce fichier-ci est le plus petit morceau de client
 * possible — un bouton et son appel — plutôt que de rendre toute la barre cliente pour un seul geste.
 *
 * 🔒 LA DÉCONNEXION EST UNE ÉCRITURE : `DELETE /api/admin/session`, qui invalide la session côté serveur. On quitte
 * la page ENSUITE, et même si l'appel échoue (réseau coupé) : on ne laisse jamais quelqu'un devant un écran qu'il
 * croit avoir quitté.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function BoutonDeconnexion() {
  async function deconnexion() {
    /**
     * ⚠️ ON ATTRAPE, ON NE SE CONTENTE PAS D'UN `finally`. Avec `try/finally` seul, un réseau coupé faisait bien
     * partir la navigation — mais l'erreur s'échappait ensuite en rejet non traité, visible dans la console du
     * navigateur. Un test l'a montré. Ici l'échec est DÉLIBÉRÉMENT avalé : la seule chose qui compte est de quitter
     * l'écran, et la session côté serveur expirera d'elle-même.
     */
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } catch {
      // réseau coupé : on sort quand même, voir ci-dessus
    }
    window.location.assign('/admin/login');
  }

  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="svv-adm-deco-haut" onClick={deconnexion}>
        Déconnexion
      </button>
    </>
  );
}

/* Le même poids visuel que « Changer mon mot de passe », à côté duquel il vit — mais dans la couleur de la marque,
   parce que c'est le seul geste de cette barre qui fait perdre ce qu'on est en train de faire. */
const CSS = `
.svv-adm-deco-haut{background:transparent;border:1px solid var(--color-svv-line);border-radius:8px;
  padding:.25rem .6rem;font-size:.85rem;font-weight:600;color:var(--color-svv-red);cursor:pointer}
.svv-adm-deco-haut:hover{background:var(--color-svv-field)}
`;
