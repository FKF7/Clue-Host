import { createCards, createGameConfig, createPlayers } from "./domain";
import type { Catalog, Category, GameSession } from "./types";

export const exampleCatalog: Catalog = {
  suspects: [
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
  ],
  items: [
    "Cactus",
    "Electric Guitar",
    "Fluffy Stuffie",
    "Giant Popsicle",
    "Handbag",
    "Lei",
    "Lollipop",
    "MP3",
    "Ninja Belt",
    "Surfboard",
    "Vase",
    "Wizard Staff",
  ],
  places: [
    "Beach",
    "Book Room",
    "Box Dimension",
    "Cove",
    "Dance Club",
    "Dojo",
    "Iceberg",
    "Mine",
    "Plaza",
    "Ski Lodge",
    "Snow Forts",
    "Stadium",
    "Town",
  ],
};

type NamedCard = [category: Category, name: string];

const exampleHands: Record<string, NamedCard[]> = {
  Lucy: [
    ["suspects", "Rosie"],
    ["items", "Surfboard"],
    ["places", "Dance Club"],
  ],
  Discenti: [
    ["suspects", "Caustic"],
    ["items", "MP3"],
    ["places", "Town"],
  ],
  Caustic: [
    ["suspects", "Discenti"],
    ["items", "Handbag"],
    ["places", "Stadium"],
  ],
  Ron: [
    ["suspects", "Storm"],
    ["items", "Cactus"],
    ["places", "Plaza"],
  ],
  Rosie: [
    ["suspects", "Lucy"],
    ["items", "Giant Popsicle"],
    ["places", "Book Room"],
  ],
  JGMC: [
    ["suspects", "Doogie"],
    ["items", "Lollipop"],
    ["places", "Iceberg"],
  ],
  Doogie: [
    ["suspects", "Tumgu"],
    ["items", "Electric Guitar"],
    ["places", "Dojo"],
  ],
  Storm: [
    ["items", "Wizard Staff"],
    ["places", "Box Dimension"],
    ["places", "Ski Lodge"],
  ],
  FKF: [
    ["suspects", "Ron"],
    ["items", "Fluffy Stuffie"],
    ["places", "Mine"],
  ],
  Omars: [
    ["suspects", "FKF"],
    ["items", "Vase"],
    ["places", "Beach"],
  ],
  Tumgu: [
    ["suspects", "JGMC"],
    ["items", "Ninja Belt"],
    ["places", "Cove"],
  ],
};

function namedCardKey(category: Category, name: string) {
  return `${category}:${name}`;
}

export function createExampleSession(): GameSession {
  const players = createPlayers(exampleCatalog.suspects);
  const cards = createCards(exampleCatalog);
  const cardIdByName = new Map(
    cards.map((card) => [namedCardKey(card.category, card.name), card.id]),
  );
  const hands = Object.fromEntries(
    players.map((player) => [
      player.id,
      exampleHands[player.name].map(([category, name]) => {
        const cardId = cardIdByName.get(namedCardKey(category, name));
        if (!cardId) throw new Error(`Example card not found: ${name}`);
        return cardId;
      }),
    ]),
  );

  return {
    config: createGameConfig(exampleCatalog, players, hands, 3),
    currentPlayerIndex: 0,
    history: [],
  };
}
