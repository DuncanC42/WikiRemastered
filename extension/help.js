const topics = {
  market: {
    title: 'Enchères automatiques',
    summary: 'Marché + parcourt tout le marché et mise pour vous sur les cartes qui correspondent à vos mots-clés, sans dépasser vos limites.',
    steps: [
      ['Choisissez les cartes', 'Ajoutez des mots-clés. Un seul mot présent dans le titre ou la catégorie suffit.'],
      ['Fixez vos limites', 'Un maximum par carte, un budget pour la session et le temps restant à partir duquel miser.'],
      ['Activez', 'L’extension cherche à intervalle régulier et mise le minimum nécessaire.'],
    ],
    example: '10 WB par carte et 50 WB de budget : jusqu’à 5 mises à 10 WB, davantage si elles coûtent moins.',
    points: [
      ['Budget', 'Chaque mise compte en entier : 10 WB puis 13 WB consomment 23 WB. Les remboursements ne rechargent pas la session.'],
      ['Surenchère', 'Option à activer : l’extension remise quand on vous dépasse, jusqu’au max par carte, jamais sur sa propre mise.'],
      ['Arrêt', 'Arrêter bloque les prochaines mises, sans annuler celles déjà envoyées. Gardez un onglet Wiki Masters ouvert.'],
    ],
    intro: 'Marché + recherche les cartes qui vous intéressent et mise pour vous dans les limites choisies.',
    sections: [
      ['Choisir les cartes', 'Ajoutez un ou plusieurs mots-clés. Un seul mot correspondant au titre ou à la catégorie suffit. La recherche parcourt tout le marché, même si vous avez appliqué un filtre sur la page.'],
      ['Fixer les limites', 'La mise maximale limite chaque enchère. Le budget total limite la somme de vos mises pendant cette session. Exemple : 10 WB par carte et 50 WB de budget permettent cinq mises à 10 WB, ou davantage si elles coûtent moins.'],
      ['Quand la mise part', '« Temps restant max » limite les enchères aux dernières 1, 5, 15, 30 minutes ou à la dernière heure. « Sans limite » accepte tout temps restant. L’extension mise le minimum nécessaire lors d’une recherche, si votre solde et vos budgets le permettent. « Recherche toutes les » règle la pause entre les recherches : la mise n’est pas garantie à une seconde précise.'],
      ['Si quelqu’un vous dépasse', 'Activez « Surenchérir si dépassé » pour remiser à une prochaine recherche, jusqu’au max par carte et dans le budget total restant. L’extension ne surenchérit jamais sur sa propre mise et vérifie à nouveau le temps restant, même après une prolongation. Switch désactivé : une seule mise par enchère et par session.'],
      ['Comprendre le budget', 'Chaque mise compte intégralement : 10 WB puis une nouvelle mise à 13 WB consomment 23 WB du budget total. Le max par carte limite chaque montant misé, pas leur somme. Les remboursements ne rechargent pas la session. Pour changer les réglages, arrêtez la session ; cela n’annule pas les mises déjà envoyées. Gardez le navigateur et un onglet Wiki Masters connecté ouverts.'],
      ['Viser une carte précise', 'L’enchère forcée se programme sur une carte ou sur sa fiche. Elle intervient dans la dernière minute avec son propre plafond, indépendant du budget par mots-clés.'],
    ],
  },
  collection: {
    title: 'Collection +',
    summary: 'Repérez les cartes peu consultées, défaussez-les en une fois et gardez toujours celles qui comptent.',
    steps: [
      ['Réglez le seuil', 'Le curseur fixe un nombre de vues sur 30 jours. Seules les cartes strictement en dessous sont concernées.'],
      ['Choisissez la portée', '« Cette page » suit les cartes et filtres affichés. « Toute la collection » inclut les autres pages.'],
      ['Vérifiez la liste', 'Filtrez-la par nom ou par rareté et retirez les cartes à garder. Rien n’est défaussé avant votre confirmation.'],
    ],
    example: 'Seuil à 30 vues : une carte à 29 vues est défaussée, une carte à 30 vues est gardée.',
    points: [
      ['Toujours gardées', 'Les favoris, les cartes en échange, celles qui contiennent un mot protégé et les raretés décochées.'],
      ['Définitif', 'Une défausse ne peut pas être annulée.'],
      ['Estimation', 'Le départ estimé vient des ventes comparables : ce n’est pas une garantie de vente.'],
    ],
    intro: 'Repérez vos cartes peu consultées, protégez celles à garder et retrouvez vos doublons.',
    sections: [
      ['Lire les informations', 'Les vues portent sur les 30 derniers jours. Le départ estimé vient des ventes comparables ; c’est une estimation, pas une garantie de vente. Les prix se rechargent automatiquement.'],
      ['Choisir quoi défausser', 'Le curseur sélectionne les cartes strictement sous le seuil de vues. Cette page suit les cartes et les filtres affichés ; Toute la collection inclut aussi les autres pages. Rien n’est défaussé avant votre clic.'],
      ['Protéger vos cartes', 'Les favoris et les cartes en échange sont préservés. Les mots protégés et les raretés décochées dans « Raretés à défausser » s’appliquent à la défausse groupée. Le bouton sous une carte reste une action manuelle. Une défausse est définitive.'],
      ['Voir les doublons', 'Doublons regroupe toute la collection en piles. Les variantes les plus rares apparaissent devant, puis les shiny à rareté égale. Dépliez une pile pour voir ses exemplaires.'],
    ],
  },
  late: {
    title: 'Enchère forcée',
    summary: 'Programmez une carte précise : l’extension mise pour vous dans sa dernière minute.',
    steps: [
      ['Choisissez un plafond', 'Le montant maximum que vous acceptez de miser sur cette carte.'],
      ['Programmez', 'L’extension attend la dernière minute, puis mise le minimum nécessaire.'],
      ['Laissez faire', 'Si quelqu’un vous dépasse, elle remise jusqu’à votre plafond, prolongations comprises.'],
    ],
    points: [
      ['Indépendant', 'Ce plafond ne compte pas dans le budget des enchères par mots-clés.'],
      ['Sans garantie', 'Un autre joueur peut toujours miser au-delà de votre plafond.'],
      ['Arrêt', 'Arrêter bloque les prochains envois, sans annuler une mise déjà envoyée.'],
    ],
    intro: 'Programmez une carte précise pour sa dernière minute.',
    sections: [
      ['Choisir un plafond', 'L’extension attend la dernière minute et mise le minimum nécessaire. Si quelqu’un vous dépasse, elle peut remiser jusqu’à votre plafond. Elle ne surenchérit pas sur sa propre mise.'],
      ['Suivre les prolongations', 'Wiki Masters peut prolonger une enchère disputée. L’extension suit sa nouvelle heure de fin. Le plafond est indépendant de la session par mots-clés et ne garantit pas le gain.'],
      ['Garder le contrôle', 'Gardez un onglet Wiki Masters connecté et le navigateur ouverts. Arrêter bloque les prochains envois, sans annuler une mise déjà envoyée. Un résultat incertain doit être vérifié dans Mes enchères.'],
    ],
  },
  afk: {
    title: 'Ouvertures AFK',
    summary: 'Quand votre stock atteint 10/10, l’extension ouvre un paquet pour ne rien perdre de la régénération.',
    steps: [
      ['Stock plein', 'Le site confirme que vous avez 10 paquets sur 10.'],
      ['Un paquet ouvert', 'Un seul paquet normal, jamais un pack spécial ou quotidien.'],
      ['Récapitulatif', 'Les cartes obtenues apparaissent dans Ouvertures AFK.'],
    ],
    points: [
      ['Vérification humaine', 'Si le site la demande, le bouton devient jaune : terminez-la vous-même sur Paquets.'],
      ['Navigateur ouvert', 'Gardez un onglet Wiki Masters connecté.'],
      ['Priorité', 'Une ouverture manuelle passe toujours avant.'],
    ],
    intro: 'Libérez une place dès que votre stock atteint 10/10.',
    sections: [
      ['Un paquet à stock plein', 'Un seul paquet normal est ouvert quand le site confirme 10/10. Gardez le navigateur et un onglet Wiki Masters connecté ouverts. Une ouverture manuelle reste prioritaire.'],
      ['Retrouver les cartes', 'Les cartes des 150 derniers paquets AFK restent dans le récapitulatif, séparément pour chaque compte. Vous pouvez désactiver les ouvertures à tout moment.'],
      ['Vérification humaine', 'Le bouton devient jaune si le site demande votre présence. Cliquez sur Vérifier et terminez la vérification sur Paquets. L’extension ne la réalise pas à votre place.'],
    ],
  },
  duplicates: {
    title: 'Vos doublons',
    summary: 'Une pile réunit tous vos exemplaires d’une même carte, variantes comprises.',
    steps: [
      ['Repérez', 'Chaque pile affiche son nombre d’exemplaires.'],
      ['Dépliez', 'Cliquez sur une pile pour voir chaque exemplaire et ses statistiques.'],
      ['Triez', 'Par quantité ou par nom, sur toute la collection.'],
    ],
    points: [
      ['Ordre', 'Les raretés les plus hautes sont devant ; à rareté égale, les shiny passent en premier.'],
      ['Toute la collection', 'Les filtres de la page native ne limitent pas cette vue.'],
    ],
    intro: 'Une pile réunit tous vos exemplaires d’une même carte, y compris leurs variantes.',
    sections: [
      ['Voir les meilleurs devant', 'Les raretés les plus élevées sont devant. À rareté égale, les shiny passent en premier. Cliquez sur la pile pour voir chaque exemplaire et ses statistiques.'],
      ['Trier toute la collection', 'Le tri par quantité ou par nom et la recherche portent sur toutes vos cartes. Les filtres de la page native ne limitent pas cette vue.'],
    ],
  },
};

export async function openHelp(topic, trigger, signal) {
  const content = topics[topic];
  if (!content) return;
  const host = document.createElement('div');
  host.dataset.wme = 'help';
  host.dataset.theme = 'dark';
  const root = host.attachShadow({ mode: 'open' });
  const styles = ['ui.css', 'help.css'].map(name => new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(name);
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    root.append(link);
  }));
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const dialog = make('dialog', 'help-dialog');
  dialog.lang = 'fr';
  dialog.setAttribute('aria-labelledby', 'help-title');
  dialog.setAttribute('aria-describedby', 'help-summary');
  const header = make('header', 'help-header');
  const titles = make('div', 'help-titles');
  const heading = make('h2', '', content.title);
  heading.id = 'help-title';
  const summary = make('p', 'help-intro', content.summary || content.intro);
  summary.id = 'help-summary';
  titles.append(heading, summary);
  const dismiss = make('button', 'help-dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Fermer');
  dismiss.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  header.append(titles, dismiss);
  const body = make('div', 'help-body');
  if (content.steps?.length) {
    const steps = make('ol', 'help-steps');
    steps.setAttribute('aria-label', 'En trois étapes');
    content.steps.forEach(([label, text]) => {
      const step = make('li', 'help-step');
      step.append(make('h3', '', label), make('p', '', text));
      steps.append(step);
    });
    body.append(steps);
  }
  if (content.example) {
    const example = make('p', 'help-example');
    example.append(make('strong', '', 'Exemple. '), content.example);
    body.append(example);
  }
  if (content.points?.length) {
    const points = make('section', 'help-points');
    points.append(make('h3', 'help-section-title', 'À retenir'));
    const list = make('ul');
    for (const [label, text] of content.points) {
      const item = make('li');
      item.append(make('strong', '', label), make('span', '', text));
      list.append(item);
    }
    points.append(list);
    body.append(points);
  }
  const details = make('details', 'help-details');
  details.append(make('summary', '', 'Tous les détails'));
  for (const [title, text] of content.sections) {
    const section = make('section');
    section.append(make('h3', '', title), make('p', '', text));
    details.append(section);
  }
  if (!content.steps) details.open = true;
  body.append(details);
  const footer = make('footer', 'help-footer');
  const close = make('button', 'button button-primary', 'Compris');
  close.type = 'button';
  footer.append(close);
  dialog.append(header, body, footer);
  root.append(dialog);
  document.body.append(host);
  function destroy() {
    signal?.removeEventListener('abort', destroy);
    if (dialog.open) dialog.close();
    host.remove();
  }
  signal?.addEventListener('abort', destroy, { once: true });
  dialog.addEventListener('close', () => {
    destroy();
    if (trigger.isConnected && !signal?.aborted) trigger.focus({ preventScroll: true });
  }, { once: true });
  close.addEventListener('click', () => dialog.close());
  dismiss.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup']) {
    root.addEventListener(name, event => event.stopPropagation());
  }
  if ((await Promise.all(styles)).every(Boolean) && !signal?.aborted && host.isConnected) {
    dialog.showModal();
    close.focus({ preventScroll: true });
  } else destroy();
}
