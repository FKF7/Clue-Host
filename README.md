# Clue Host

Clue Host is an offline referee for games of Clue. The host enters the deck,
assigns every player's hand, and defines the turn order. During the game, the
app identifies who must respond to each guess and which cards they can show.

## Features

- Guided setup for suspects, items, places, hands, and turn order
- Automatic identification of the three case-file cards
- Response calculation based on player order and card ownership
- Support for eliminated players and public cards
- Guess and player-removal history with undo support
- Automatic progress saving in the browser's local storage
- Fully offline, portable single-file build

## Development

Install the dependencies and start the development server:

```bash
npm install
npm run dev
```

## Verification

Run the automated tests and create a production build:

```bash
npm test
npm run build
```

## Portable build

The build creates a single file at `dist/Clue Host.html`. It can be copied to
another computer and opened directly in Chrome or Edge without Node.js, a web
server, or an internet connection.
