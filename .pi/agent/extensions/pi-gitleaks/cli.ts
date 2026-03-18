// Usage: cat somefile.env | npx jiti cli.ts
import { redactText } from "./redact.js";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const text = Buffer.concat(chunks).toString("utf-8");

process.stdout.write(await redactText(text));
