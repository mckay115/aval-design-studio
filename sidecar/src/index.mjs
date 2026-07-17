import { createInterface } from "node:readline";

import { handleRequest } from "./protocol.mjs";

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`);

for await (const line of lines) {
  if (!line.trim()) continue;
  let response;
  try {
    const request = JSON.parse(line);
    response = await handleRequest(request, write);
  } catch (error) {
    response = {
      requestId: null,
      type: "result",
      ok: false,
      error: { code: "INVALID_JSON", message: error instanceof Error ? error.message : "Invalid JSON request" }
    };
  }
  write(response);
}
