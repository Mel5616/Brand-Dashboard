// node extensions/mix-and-save/test.mjs
import assert from "node:assert/strict";
import { cartLinesDiscountsGenerateRun as run, brandOf } from "./src/cart_lines_discounts_generate_run.js";
const line = (vendor, i) => ({ id: `gid://shopify/CartLine/${i}`, quantity: 1, merchandise: { __typename: "ProductVariant", product: { vendor, isGiftCard: false } } });
const input = (vendors, tiers) => ({ cart: { lines: vendors.map(line) }, discount: { discountClasses: ["ORDER"], metafield: tiers ? { jsonValue: tiers } : null } });
const pct = r => r.operations[0]?.orderDiscountsAdd.candidates[0].value.percentage.value ?? 0;

assert.equal(pct(run(input(["UPPAbaby"]))), 0, "one brand: full price");
assert.equal(pct(run(input(["UPPAbaby", "UPPAbaby Australia"]))), 0, "same brand under two vendor names");
assert.equal(pct(run(input(["UPPAbaby", "Nanit"]))), 5, "two brands");
assert.equal(pct(run(input(["UPPAbaby", "Nanit", "Magic"]))), 10, "three brands");
assert.equal(pct(run(input(["UPPAbaby", "Nanit", "Magic", "Frida", "ZAZU"]))), 15, "five brands caps at 15");
assert.equal(pct(run(input(["WonderFold", "WonderFold Wagons Australia", "Frida"]))), 5, "WonderFold aliases");
assert.equal(pct(run(input(["Nanit", "Coolkidz Australia"]))), 0, "Coolkidz own products don't count");
assert.equal(pct(run(input(["UPPAbaby", "Nanit"], { 2: 7, 3: 12, 4: 18 }))), 7, "tiers from metafield");
assert.equal(run({ ...input(["UPPAbaby", "Nanit"]), discount: { discountClasses: ["PRODUCT"], metafield: null } }).operations.length, 0, "only acts as an order discount");
assert.equal(brandOf("smarTrike"), "smartrike");
console.log("mix-and-save: all tests passed");
