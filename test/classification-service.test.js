const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTickets } = require("../classification-service");
const { readTicketInputs } = require("../index");
const path = require("node:path");

test("classifies tickets through an injected async classifier and preserves ids", async () => {
  const tickets = [
    { id: "T-1", message: "A purchase question" },
    { id: "T-2", message: "A cancellation request" },
  ];

  const results = await classifyTickets(tickets, async (ticket) =>
    ticket.id === "T-1" ? "sales" : "cancellation"
  );

  assert.deepEqual(results, [
    { id: "T-1", category: "sales" },
    { id: "T-2", category: "cancellation" },
  ]);
});

test("rejects categories outside the supported set", async () => {
  await assert.rejects(
    classifyTickets([{ id: "T-1", message: "Question" }], async () => "other"),
    /unsupported category/
  );
});

test("propagates errors from the injected classifier", async () => {
  const apiError = new Error("simulated API failure");

  await assert.rejects(
    classifyTickets([{ id: "T-1", message: "Question" }], async () => {
      throw apiError;
    }),
    (error) => error === apiError
  );
});

test("loads validated raw tickets separately from classification", () => {
  const ticketsPath = path.join(__dirname, "..", "data", "tickets.json");
  const tickets = readTicketInputs(ticketsPath);

  assert.equal(tickets.length, 4);
  assert.equal(tickets[0].id, "T-1001");
  assert.equal(tickets[0].message, "Хочу узнать цену и купить годовую подписку.");
});
