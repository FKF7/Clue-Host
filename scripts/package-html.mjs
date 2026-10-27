import { rm, rename } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("dist", "index.html");
const destination = resolve("dist", "Clue Host.html");

await rm(destination, { force: true });
await rename(source, destination);

console.log("Portable file created at dist/Clue Host.html");
