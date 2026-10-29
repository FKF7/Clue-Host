import { describe, expect, it } from "vitest";
import {
  assignAnonymousHands,
  createCards,
  createAnonymousDeal,
  createGameConfig,
  createPlayers,
  findDuplicates,
  formatCardsForMessage,
  judgeGuess,
  nextActivePlayerIndex,
  parseList,
  removePlayerFromGame,
  undoLastGameEvent,
  validateCatalog,
  validateDistribution,
} from "./domain";
import { createExampleSession } from "./exampleGame";
import { categories, type Catalog } from "./types";

const catalog: Catalog = {
  suspects: ["Alex", "Blake", "Casey", "Drew"],
  items: ["Rope", "Knife", "Poison", "Candlestick", "Revolver"],
  places: ["Kitchen", "Garden", "Lounge", "Study", "Garage", "Library"],
};

describe("setup", () => {
  it("parses pasted lines and ignores whitespace and empty lines", () => {
    expect(parseList(" Alex \n\nBlake\r\n Casey ")).toEqual(["Alex", "Blake", "Casey"]);
  });

  it("detects duplicate names without considering capitalization", () => {
    expect(findDuplicates(["Alex", "Blake", " alex ".trim()])).toEqual(["alex"]);
  });

  it("formats a hand for copying into a message", () => {
    expect(
      formatCardsForMessage([
        { name: "Card 1" },
        { name: "Card 2" },
        { name: "Card 3" },
      ]),
    ).toBe("**Card 1**\n**Card 2**\n**Card 3**");
  });

  it("calculates the number of cards per player", () => {
    expect(validateCatalog(catalog)).toMatchObject({
      valid: true,
      totalCards: 15,
      cardsPerPlayer: 3,
    });
  });

  it("rejects a catalog that cannot be divided equally", () => {
    const invalid = { ...catalog, places: catalog.places.slice(1) };
    expect(validateCatalog(invalid).valid).toBe(false);
  });

  it("requires one crime card from each category", () => {
    const players = createPlayers(catalog.suspects);
    const cards = createCards(catalog);
    const hands = Object.fromEntries(players.map((player) => [player.id, [] as string[]]));
    const distributed = cards.filter((card) => !["suspects:0", "items:0", "places:0"].includes(card.id));
    distributed.forEach((card, index) => hands[players[Math.floor(index / 3)].id].push(card.id));

    const result = validateDistribution(cards, players, hands, 3);
    expect(result.valid).toBe(true);
    expect(result.caseFile.map((card) => card.id)).toEqual(["suspects:0", "items:0", "places:0"]);
  });

  it("creates a complete anonymous deal with one crime card per category", () => {
    const cards = createCards(catalog);
    const deal = createAnonymousDeal(cards, 4, 3);
    const caseCards = deal.caseFile.map(
      (cardId) => cards.find((card) => card.id === cardId)!,
    );
    const allDealtCards = [...deal.caseFile, ...deal.hands.flat()];

    expect(deal.hands).toHaveLength(4);
    expect(deal.hands.every((hand) => hand.length === 3)).toBe(true);
    expect(new Set(allDealtCards).size).toBe(cards.length);
    expect(categories.map(
      (category) => caseCards.filter((card) => card.category === category).length,
    )).toEqual([1, 1, 1]);
  });

  it("assigns every anonymous hand to exactly one player", () => {
    const players = createPlayers(catalog.suspects);
    const anonymousHands = [
      ["suspects:0", "items:0", "places:0"],
      ["suspects:1", "items:1", "places:1"],
      ["suspects:2", "items:2", "places:2"],
      ["suspects:3", "items:3", "places:3"],
    ];
    const assignment = assignAnonymousHands(players, anonymousHands);
    const assignedHands = players.map((player) => assignment.hands[player.id]);

    expect(new Set(Object.values(assignment.handNumbers))).toEqual(new Set([1, 2, 3, 4]));
    expect(assignedHands.map((hand) => hand.join("|")).sort()).toEqual(
      anonymousHands.map((hand) => hand.join("|")).sort(),
    );
  });

  it("keeps each hand with its player when turn order is changed after dealing", () => {
    const players = createPlayers(catalog.suspects);
    const hands: Record<string, string[]> = {
      [players[0].id]: ["suspects:1", "items:1", "places:1"],
      [players[1].id]: ["suspects:2", "items:2", "places:2"],
      [players[2].id]: ["suspects:3", "items:3", "places:3"],
      [players[3].id]: ["items:4", "places:4", "places:5"],
    };
    const reorderedPlayers = [players[2], players[0], players[1], players[3]];
    const config = createGameConfig(catalog, reorderedPlayers, hands, 3);

    expect(config.players.map((player) => player.name)).toEqual([
      "Casey",
      "Alex",
      "Blake",
      "Drew",
    ]);
    expect(config.hands[players[0].id]).toEqual([
      "suspects:1",
      "items:1",
      "places:1",
    ]);
  });
});

describe("judge", () => {
  it("selects the first player in circular order who can answer", () => {
    const players = createPlayers(catalog.suspects);
    const hands: Record<string, string[]> = {
      [players[0].id]: ["suspects:1", "items:1", "places:1"],
      [players[1].id]: ["suspects:2", "items:2", "places:2"],
      [players[2].id]: ["suspects:3", "items:3", "places:3"],
      [players[3].id]: ["items:4", "places:4", "places:5"],
    };
    const config = createGameConfig(catalog, players, hands, 3);

    expect(
      judgeGuess(config, 3, {
        suspects: "suspects:2",
        items: "items:2",
        places: "places:4",
      }),
    ).toEqual({ responderId: players[1].id, possibleCardIds: ["suspects:2", "items:2"] });
  });

  it("returns no responder when no hand contains a guessed card", () => {
    const players = createPlayers(catalog.suspects);
    const hands: Record<string, string[]> = {
      [players[0].id]: ["suspects:1", "items:1", "places:1"],
      [players[1].id]: ["suspects:2", "items:2", "places:2"],
      [players[2].id]: ["suspects:3", "items:3", "places:3"],
      [players[3].id]: ["items:4", "places:4", "places:5"],
    };
    const config = createGameConfig(catalog, players, hands, 3);
    expect(
      judgeGuess(config, 0, {
        suspects: "suspects:0",
        items: "items:0",
        places: "places:0",
      }),
    ).toEqual({ responderId: null, possibleCardIds: [] });
  });

  it("skips an eliminated player and lets the next active player respond", () => {
    const session = createExampleSession();
    const discenti = session.config.players.find((player) => player.name === "Discenti")!;
    const caustic = session.config.players.find((player) => player.name === "Caustic")!;
    const cardId = (name: string) =>
      session.config.cards.find((card) => card.name === name)!.id;
    const config = {
      ...session.config,
      players: session.config.players.map((player) =>
        player.id === discenti.id ? { ...player, active: false } : player,
      ),
    };

    expect(
      judgeGuess(config, 0, {
        suspects: cardId("Discenti"),
        items: cardId("MP3"),
        places: cardId("Snow Forts"),
      }),
    ).toEqual({
      responderId: caustic.id,
      possibleCardIds: [cardId("Discenti")],
    });
  });

  it("skips eliminated players when advancing or reversing the turn", () => {
    const players = createPlayers(catalog.suspects);
    players[1] = { ...players[1], active: false };

    expect(nextActivePlayerIndex(players, 0)).toBe(2);
    expect(nextActivePlayerIndex(players, 2, -1)).toBe(0);
  });
});

describe("example game", () => {
  it("starts with the complete Clue ACS fixture", () => {
    const session = createExampleSession();
    const cardNames = (playerName: string) => {
      const player = session.config.players.find((candidate) => candidate.name === playerName)!;
      return session.config.hands[player.id].map(
        (cardId) => session.config.cards.find((card) => card.id === cardId)!.name,
      );
    };
    const caseFileNames = session.config.caseFile.map(
      (cardId) => session.config.cards.find((card) => card.id === cardId)!.name,
    );

    expect(session.config.players.map((player) => player.name)).toEqual([
      "Lucy",
      "Discenti",
      "Caustic",
      "Ron",
      "Rosie",
      "JGMC",
      "Doogie",
      "Storm",
      "FKF",
      "Omars",
      "Tumgu",
    ]);
    expect(session.config.cardsPerPlayer).toBe(3);
    expect(session.config.cards).toHaveLength(36);
    expect(
      Object.fromEntries(
        session.config.players.map((player) => [player.name, cardNames(player.name)]),
      ),
    ).toEqual({
      Lucy: ["Rosie", "Surfboard", "Dance Club"],
      Discenti: ["Caustic", "MP3", "Town"],
      Caustic: ["Discenti", "Handbag", "Stadium"],
      Ron: ["Storm", "Cactus", "Plaza"],
      Rosie: ["Lucy", "Giant Popsicle", "Book Room"],
      JGMC: ["Doogie", "Lollipop", "Iceberg"],
      Doogie: ["Tumgu", "Electric Guitar", "Dojo"],
      Storm: ["Wizard Staff", "Box Dimension", "Ski Lodge"],
      FKF: ["Ron", "Fluffy Stuffie", "Mine"],
      Omars: ["FKF", "Vase", "Beach"],
      Tumgu: ["JGMC", "Ninja Belt", "Cove"],
    });
    expect(caseFileNames).toEqual(["Omars", "Lei", "Snow Forts"]);
    expect(session.history).toEqual([]);
  });

  it("records player removal and undo restores the player", () => {
    const session = createExampleSession();
    const discenti = session.config.players.find((player) => player.name === "Discenti")!;
    const removed = removePlayerFromGame(session, discenti.id, 1234);

    expect(removed.config.players.find((player) => player.id === discenti.id)?.active).toBe(false);
    expect(removed.history).toEqual([
      {
        type: "player-removed",
        id: "1234:0",
        playerId: discenti.id,
        previousCurrentPlayerId: session.config.players[0].id,
        createdAt: 1234,
      },
    ]);

    const undone = undoLastGameEvent(removed);
    expect(undone.session.config.players.find((player) => player.id === discenti.id)?.active).toBe(true);
    expect(undone.session.history).toEqual([]);
    expect(undone.session.currentPlayerIndex).toBe(0);
  });

  it("moves the turn when the current player leaves and restores it on undo", () => {
    const session = createExampleSession();
    const lucy = session.config.players[0];
    const removed = removePlayerFromGame(session, lucy.id, 5678);

    expect(removed.config.players[removed.currentPlayerIndex].name).toBe("Discenti");

    const undone = undoLastGameEvent(removed);
    expect(undone.session.config.players[undone.session.currentPlayerIndex].name).toBe("Lucy");
    expect(undone.session.config.players[0].active).toBe(true);
  });
});
