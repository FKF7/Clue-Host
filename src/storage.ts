import type { GameEvent, GameSession } from "./types";

const STORAGE_KEY = "clue-host:session:v1";

export function readSession(): GameSession | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const session = parsed as Partial<GameSession>;
    if (
      !session.config ||
      !Array.isArray(session.config.players) ||
      !Array.isArray(session.config.cards) ||
      typeof session.currentPlayerIndex !== "number" ||
      !Array.isArray(session.history)
    ) {
      return null;
    }
    return {
      ...(session as GameSession),
      config: {
        ...session.config,
        players: session.config.players.map((player) => ({
          ...player,
          active: player.active !== false,
        })),
      },
      history: (session.history as unknown[]).map((event) => {
        if (
          event &&
          typeof event === "object" &&
          "type" in event
        ) {
          const typedEvent = event as { type: unknown };
          if (typedEvent.type === "player-removed" || typedEvent.type === "guess") {
            return event as GameEvent;
          }
          if (typedEvent.type === "suggestion") {
            return { ...event, type: "guess" } as GameEvent;
          }
        }
        return { ...(event as object), type: "guess" } as GameEvent;
      }),
    };
  } catch {
    return null;
  }
}

export function saveSession(session: GameSession) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The game remains usable if browser storage is unavailable.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to do.
  }
}
