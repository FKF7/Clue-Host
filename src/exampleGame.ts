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
  weapons: [
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
    ["weapons", "Surfboard"],
    ["places", "Dance Club"],
  ],
  Discenti: [
    ["suspects", "Caustic"],
    ["weapons", "MP3"],
    ["places", "Town"],
  ],
  Caustic: [
    ["suspects", "Discenti"],
    ["weapons", "Handbag"],
    ["places", "Stadium"],
  ],
  Ron: [
    ["suspects", "Storm"],
    ["weapons", "Cactus"],
    ["places", "Plaza"],
  ],
  Rosie: [
    ["suspects", "Lucy"],
    ["weapons", "Giant Popsicle"],
    ["places", "Book Room"],
  ],
  JGMC: [
    ["suspects", "Doogie"],
    ["weapons", "Lollipop"],
    ["places", "Iceberg"],
  ],
  Doogie: [
    ["suspects", "Tumgu"],
    ["weapons", "Electric Guitar"],
    ["places", "Dojo"],
  ],
  Storm: [
    ["weapons", "Wizard Staff"],
    ["places", "Box Dimension"],
    ["places", "Ski Lodge"],
  ],
  FKF: [
    ["suspects", "Ron"],
    ["weapons", "Fluffy Stuffie"],
    ["places", "Mine"],
  ],
  Omars: [
    ["suspects", "FKF"],
    ["weapons", "Vase"],
    ["places", "Beach"],
  ],
  Tumgu: [
    ["suspects", "JGMC"],
    ["weapons", "Ninja Belt"],
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
