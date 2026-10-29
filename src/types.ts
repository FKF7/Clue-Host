export const categories = ["suspects", "items", "places"] as const;

export type Category = (typeof categories)[number];

export type Catalog = Record<Category, string[]>;

export type Card = {
  id: string;
  category: Category;
  name: string;
};

export type Player = {
  id: string;
  name: string;
  active: boolean;
};

export type GameConfig = {
  catalog: Catalog;
  cards: Card[];
  players: Player[];
  hands: Record<string, string[]>;
  caseFile: string[];
  cardsPerPlayer: number;
};

export type Guess = {
  suspects: string;
  items: string;
  places: string;
};

export type JudgeResult = {
  responderId: string | null;
  possibleCardIds: string[];
};

export type GuessRecord = {
  type: "guess";
  id: string;
  guesserId: string;
  guess: Guess;
  responderId: string | null;
  possibleCardIds: string[];
  createdAt: number;
};

export type PlayerRemovedRecord = {
  type: "player-removed";
  id: string;
  playerId: string;
  previousCurrentPlayerId: string;
  createdAt: number;
};

export type GameEvent = GuessRecord | PlayerRemovedRecord;

export type GameSession = {
  config: GameConfig;
  currentPlayerIndex: number;
  history: GameEvent[];
};
