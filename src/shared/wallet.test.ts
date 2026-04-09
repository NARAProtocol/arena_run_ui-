import test from "node:test";
import assert from "node:assert/strict";

import { APP_CHAIN_ID, APP_CHAIN_NAME } from "./wallet";

test("wallet starter targets Base by default", () => {
  assert.equal(APP_CHAIN_ID, 8453);
  assert.equal(APP_CHAIN_NAME, "Base");
});
