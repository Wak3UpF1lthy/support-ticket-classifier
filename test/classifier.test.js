const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { classifyTicket, readTickets } = require("../index");

test("classifies sales, support, and cancellation messages", () => {
  assert.equal(classifyTicket({ message: "Хочу купить подписку" }), "sales");
  assert.equal(classifyTicket({ message: "Не могу войти в аккаунт" }), "support");
  assert.equal(classifyTicket({ message: "Прошу отменить подписку" }), "cancellation");
});

test("preserves ticket ids in the results", () => {
  const ticketsPath = path.join(__dirname, "..", "data", "tickets.json");

  assert.deepEqual(readTickets(ticketsPath), [
    { id: "T-1001", category: "sales" },
    { id: "T-1002", category: "support" },
    { id: "T-1003", category: "cancellation" },
    { id: "T-1004", category: "sales" },
  ]);
});

test("rejects tickets with invalid messages", () => {
  assert.throws(() => classifyTicket({ message: "" }), /non-empty string message/);
});
