import {
  categories,
  type Card,
  type Catalog,
  type GameConfig,
  type GameSession,
  type Guess,
  type JudgeResult,
  type Player,
} from "./types";

export const categoryLabels = {
  suspects: "Suspects",
  items: "Items",
  places: "Places",
} as const;

export function parseList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function comparisonKey(value: string) {
  return value.toLocaleLowerCase("en");
}

export function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    const key = comparisonKey(value);
    if (seen.has(key)) duplicates.add(value);
    seen.add(key);
  }

  return [...duplicates];
}

export type CatalogValidation = {
  valid: boolean;
  errors: string[];
  totalCards: number;
  cardsPerPlayer: number | null;
};

export function validateCatalog(catalog: Catalog): CatalogValidation {
  const errors: string[] = [];
  const playerCount = catalog.suspects.length;
  const totalCards = categories.reduce(
    (total, category) => total + catalog[category].length,
    0,
  );

  for (const category of categories) {
    if (catalog[category].length === 0) {
      errors.push(`Add at least one card to ${categoryLabels[category]}.`);
    }
    const duplicates = findDuplicates(catalog[category]);
    if (duplicates.length > 0) {
      errors.push(
        `${categoryLabels[category]} contains ${duplicates.length === 1 ? "a duplicate name" : "duplicate names"}: ${duplicates.join(", ")}.`,
      );
    }
  }

  const distributedCards = totalCards - 3;
  const cardsPerPlayer =
    playerCount > 0 &&
    distributedCards >= playerCount &&
    distributedCards % playerCount === 0
      ? distributedCards / playerCount
      : null;

  if (
    errors.length === 0 &&
    cardsPerPlayer === null
  ) {
    errors.push(
      "After setting aside the three case-file cards, the remaining cards must be divided equally among all players.",
    );
  }

  return {
    valid: errors.length === 0 && cardsPerPlayer !== null,
    errors,
    totalCards,
    cardsPerPlayer,
  };
}

export function moveEntry<T>(values: T[], from: number, to: number) {
  if (
    from < 0 ||
    from >= values.length ||
    to < 0 ||
    to >= values.length ||
    from === to
  ) {
    return values;
  }
  const next = [...values];
  const [value] = next.splice(from, 1);
  next.splice(to, 0, value);
  return next;
}

export function createPlayers(names: string[]): Player[] {
  return names.map((name, index) => ({ id: `player:${index}`, name, active: true }));
}

export function isPlayerActive(player: Player) {
  return player.active !== false;
}

export function nextActivePlayerIndex(
  players: Player[],
  startIndex: number,
  direction: -1 | 1 = 1,
) {
  if (players.length === 0) return -1;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index =
      (startIndex + direction * offset + players.length * 2) % players.length;
    if (isPlayerActive(players[index])) return index;
  }
  return -1;
}

export function createCards(catalog: Catalog): Card[] {
  return categories.flatMap((category) =>
    catalog[category].map((name, index) => ({
      id: `${category}:${index}`,
      category,
      name,
    })),
  );
}

export function formatCardsForMessage(cards: Pick<Card, "name">[]) {
  return cards.map((card) => `**${card.name}**`).join("\n");
}

function secureRandomIndex(length: number) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("A positive collection length is required for random selection.");
  }
  const range = 0x1_0000_0000;
  const limit = range - (range % length);
  const buffer = new Uint32Array(1);
  let value = limit;
  while (value >= limit) {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % length;
}

function secureShuffle<T>(values: readonly T[]) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = secureRandomIndex(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export type AnonymousDeal = {
  caseFile: string[];
  hands: string[][];
};

export function createAnonymousDeal(
  cards: Card[],
  playerCount: number,
  cardsPerPlayer: number,
): AnonymousDeal {
  const caseFile = categories.map((category) => {
    const categoryCards = cards.filter((card) => card.category === category);
    if (categoryCards.length === 0) {
      throw new Error(`The deck has no ${categoryLabels[category].toLocaleLowerCase("en")} cards.`);
    }
    return categoryCards[secureRandomIndex(categoryCards.length)].id;
  });
  const caseFileSet = new Set(caseFile);
  const remainingCards = secureShuffle(
    cards.filter((card) => !caseFileSet.has(card.id)).map((card) => card.id),
  );

  if (remainingCards.length !== playerCount * cardsPerPlayer) {
    throw new Error("The remaining cards cannot be divided equally among the players.");
  }

  return {
    caseFile,
    hands: Array.from({ length: playerCount }, (_, index) =>
      remainingCards.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer),
    ),
  };
}

export function assignAnonymousHands(
  players: Player[],
  anonymousHands: string[][],
) {
  if (players.length !== anonymousHands.length) {
    throw new Error("There must be exactly one anonymous hand for each player.");
  }
  const assignments = secureShuffle(
    anonymousHands.map((cards, index) => ({ cards, handNumber: index + 1 })),
  );

  return {
    hands: Object.fromEntries(
      players.map((player, index) => [player.id, [...assignments[index].cards]]),
    ) as Record<string, string[]>,
    handNumbers: Object.fromEntries(
      players.map((player, index) => [player.id, assignments[index].handNumber]),
    ) as Record<string, number>,
  };
}

export function validateDistribution(
  cards: Card[],
  players: Player[],
  hands: Record<string, string[]>,
  cardsPerPlayer: number,
) {
  const errors: string[] = [];
  const assigned = players.flatMap((player) => hands[player.id] ?? []);
  const assignedSet = new Set(assigned);

  if (assignedSet.size !== assigned.length) {
    errors.push("A card cannot belong to more than one player.");
  }
  for (const player of players) {
    if ((hands[player.id]?.length ?? 0) !== cardsPerPlayer) {
      errors.push(`${player.name} must receive exactly ${cardsPerPlayer} card(s).`);
    }
  }

  const caseFile = cards.filter((card) => !assignedSet.has(card.id));
  if (caseFile.length !== 3) {
    errors.push("Exactly three cards must remain in the case file.");
  } else {
    for (const category of categories) {
      if (caseFile.filter((card) => card.category === category).length !== 1) {
        errors.push(
          `The case file must contain exactly one ${categoryLabels[category].toLocaleLowerCase("en")} card.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, caseFile };
}

export function createGameConfig(
  catalog: Catalog,
  players: Player[],
  hands: Record<string, string[]>,
  cardsPerPlayer: number,
): GameConfig {
  const cards = createCards(catalog);
  const distribution = validateDistribution(
    cards,
    players,
    hands,
    cardsPerPlayer,
  );
  if (!distribution.valid) throw new Error(distribution.errors[0]);

  return {
    catalog,
    cards,
    players,
    hands,
    cardsPerPlayer,
    caseFile: distribution.caseFile.map((card) => card.id),
  };
}

export function judgeGuess(
  config: GameConfig,
  guesserIndex: number,
  guess: Guess,
): JudgeResult {
  const guessedCardIds = new Set(Object.values(guess));

  for (let offset = 1; offset < config.players.length; offset += 1) {
    const responderIndex = (guesserIndex + offset) % config.players.length;
    const responder = config.players[responderIndex];
    if (!isPlayerActive(responder)) continue;
    const possibleCardIds = (config.hands[responder.id] ?? []).filter((cardId) =>
      guessedCardIds.has(cardId),
    );
    if (possibleCardIds.length > 0) {
      return { responderId: responder.id, possibleCardIds };
    }
  }

  return { responderId: null, possibleCardIds: [] };
}

export function cardById(config: GameConfig, cardId: string) {
  return config.cards.find((card) => card.id === cardId);
}

export function removePlayerFromGame(
  session: GameSession,
  playerId: string,
  createdAt = Date.now(),
) {
  const playerIndex = session.config.players.findIndex(
    (player) => player.id === playerId,
  );
  const player = session.config.players[playerIndex];
  if (!player || !isPlayerActive(player)) return session;
  if (session.config.players.filter(isPlayerActive).length <= 1) {
    throw new Error("At least one player must remain in the game.");
  }

  const nextPlayers = session.config.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, active: false } : candidate,
  );
  let nextCurrentPlayerIndex = session.currentPlayerIndex;
  const currentPlayer = session.config.players[session.currentPlayerIndex];
  if (currentPlayer.id === playerId) {
    const nextIndex = nextActivePlayerIndex(nextPlayers, session.currentPlayerIndex);
    if (nextIndex >= 0) nextCurrentPlayerIndex = nextIndex;
  }

  return {
    ...session,
    config: { ...session.config, players: nextPlayers },
    currentPlayerIndex: nextCurrentPlayerIndex,
    history: [
      ...session.history,
      {
        type: "player-removed" as const,
        id: `${createdAt}:${session.history.length}`,
        playerId,
        previousCurrentPlayerId: currentPlayer.id,
        createdAt,
      },
    ],
  };
}

export function undoLastGameEvent(session: GameSession) {
  const event = session.history.at(-1);
  if (!event) return { session, restoredGuess: null as Guess | null };

  const history = session.history.slice(0, -1);
  if (event.type === "player-removed") {
    const players = session.config.players.map((player) =>
      player.id === event.playerId ? { ...player, active: true } : player,
    );
    const previousCurrentPlayerIndex = players.findIndex(
      (player) => player.id === event.previousCurrentPlayerId,
    );
    return {
      session: {
        ...session,
        config: { ...session.config, players },
        currentPlayerIndex:
          previousCurrentPlayerIndex >= 0
            ? previousCurrentPlayerIndex
            : session.currentPlayerIndex,
        history,
      },
      restoredGuess: null as Guess | null,
    };
  }

  const guesserIndex = session.config.players.findIndex(
    (player) => player.id === event.guesserId,
  );
  const guesserIsActive =
    guesserIndex >= 0 && isPlayerActive(session.config.players[guesserIndex]);
  const restoredPlayerIndex = guesserIsActive
    ? guesserIndex
    : nextActivePlayerIndex(session.config.players, guesserIndex);
  return {
    session: {
      ...session,
      currentPlayerIndex:
        restoredPlayerIndex >= 0
          ? restoredPlayerIndex
          : session.currentPlayerIndex,
      history,
    },
    restoredGuess: guesserIsActive ? event.guess : null,
  };
}
