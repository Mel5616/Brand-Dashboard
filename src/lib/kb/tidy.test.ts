import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyReply } from "./tidy.ts";

test("removes dollar signs wrapped around a measurement", () => {
  assert.equal(tidyReply("one child up to $22.7$ kg."), "one child up to 22.7 kg.");
  assert.equal(tidyReply("folds to $34.0$ x 53.3 cm"), "folds to 34.0 x 53.3 cm");
  assert.equal(tidyReply("from $6$ months"), "from 6 months");
});

test("removes a dollar sign put on a measurement without a closing one", () => {
  assert.equal(tidyReply("takes up to $15.9 kg"), "takes up to 15.9 kg");
});

test("keeps real prices and drops only a stray closing dollar sign", () => {
  assert.equal(tidyReply("The adapter is $49.95."), "The adapter is $49.95.");
  assert.equal(tidyReply("It costs $1,799 in Greyson."), "It costs $1,799 in Greyson.");
  assert.equal(tidyReply("It is $49.95$ and in stock."), "It is $49.95 and in stock.");
});

test("leaves text without dollar signs alone", () => {
  const t = "The Vista V3 folds to 41.4 x 65.3 x 85.9 cm. [Vista V3](/pages/vista-v3-support)";
  assert.equal(tidyReply(t), t);
});
