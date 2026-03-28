import assert from "node:assert/strict";
import test from "node:test";
import { calculateBidValue, compareBidValues } from "@/lib/domain/auction/shared";

test("calculateBidValue implements constitutional formula correctly", () => {
  // Examples from constitution:
  // 1 year at $10 = value of $25
  // 2 years at $10 = value of $30  
  // 3 years at $10 = value of $35
  // 4 years at $10 = value of $40
  
  assert.equal(calculateBidValue(10, 1), 25);
  assert.equal(calculateBidValue(10, 2), 30);
  assert.equal(calculateBidValue(10, 3), 35);
  assert.equal(calculateBidValue(10, 4), 40);
  
  // Constitution example: 1-year, $10 offer (value $25) loses to 4-year, $7 offer (value $28)
  assert.equal(calculateBidValue(7, 4), 28);
  
  // Constitution example: 1-year, $10 offer (value $25) beats 4-year, $6 offer (value $24)
  assert.equal(calculateBidValue(6, 4), 24);
});

test("compareBidValues orders bids correctly by constitutional value", () => {
  const bid1year10 = { salaryAmount: 10, contractYears: 1 }; // value: 25
  const bid4year7 = { salaryAmount: 7, contractYears: 4 };   // value: 28
  const bid4year6 = { salaryAmount: 6, contractYears: 4 };   // value: 24
  
  // 4-year $7 should beat 1-year $10
  assert.ok(compareBidValues(bid4year7, bid1year10) > 0);
  
  // 1-year $10 should beat 4-year $6  
  assert.ok(compareBidValues(bid1year10, bid4year6) > 0);
  
  // Equal bids should return 0
  const bidCopy = { salaryAmount: 10, contractYears: 1 };
  assert.equal(compareBidValues(bid1year10, bidCopy), 0);
});

test("bid valuation formula handles edge cases", () => {
  // Minimum contract (1 year, $1)
  assert.equal(calculateBidValue(1, 1), 2.5);
  
  // Maximum contract (4 years, high salary)
  assert.equal(calculateBidValue(100, 4), 400);
  
  // Zero salary edge case
  assert.equal(calculateBidValue(0, 2), 0);
  
  // Large salary with short contract
  assert.equal(calculateBidValue(50, 1), 125);
});

test("bid sorting works correctly with constitutional valuation", () => {
  const bids = [
    { salaryAmount: 10, contractYears: 1 }, // value: 25
    { salaryAmount: 8, contractYears: 2 },  // value: 24
    { salaryAmount: 7, contractYears: 4 },  // value: 28 (highest)
    { salaryAmount: 12, contractYears: 1 }, // value: 30 (second)
  ];
  
  const sorted = bids.sort((a, b) => -compareBidValues(a, b));
  
  assert.equal(sorted[0]?.salaryAmount, 12); // $30 value
  assert.equal(sorted[1]?.salaryAmount, 7);  // $28 value
  assert.equal(sorted[2]?.salaryAmount, 10); // $25 value
  assert.equal(sorted[3]?.salaryAmount, 8);  // $24 value
});