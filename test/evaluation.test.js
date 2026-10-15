const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readTicketInputs } = require("../index");
const {
  evaluateClassifiers,
  formatEvaluationTable,
  summarizeAccuracy,
} = require("../evaluation");

const evaluationTicketsPath = path.join(__dirname, "..", "data", "evaluation-tickets.json");

test("evaluation dataset contains twelve unique bilingual examples and supported categories", () => {
  const tickets = readTicketInputs(evaluationTicketsPath);
  const ids = tickets.map((ticket) => ticket.id);

  assert.equal(tickets.length, 12);
  assert.equal(new Set(ids).size, tickets.length);
  assert.ok(tickets.some((ticket) => /[А-Яа-яЁё]/.test(ticket.message)));
  assert.ok(tickets.some((ticket) => /[A-Za-z]/.test(ticket.message)));
  assert.ok(tickets.every((ticket) => ["sales", "support", "cancellation"].includes(ticket.expectedCategory)));
});

test("compares both classifiers on the same tickets and preserves IDs", async () => {
  const tickets = [
    { id: "EV-A", message: "first", expectedCategory: "sales" },
    { id: "EV-B", message: "second", expectedCategory: "support" },
  ];
  const localInputs = [];
  const aiInputs = [];
  const results = await evaluateClassifiers(tickets, {
    localClassifier: (ticket) => {
      localInputs.push(ticket);
      return ticket.id === "EV-A" ? "sales" : "sales";
    },
    aiClassifier: async (ticket) => {
      aiInputs.push(ticket);
      return ticket.id === "EV-A" ? "support" : "support";
    },
  });

  assert.deepEqual(localInputs, tickets);
  assert.deepEqual(aiInputs, tickets);
  assert.deepEqual(results.map((result) => result.id), ["EV-A", "EV-B"]);
  assert.deepEqual(summarizeAccuracy(results, "local"), {
    correct: 1,
    total: 2,
    accuracy: 50,
  });
  assert.deepEqual(summarizeAccuracy(results, "ai"), {
    correct: 1,
    total: 2,
    accuracy: 50,
  });
});

test("reports a failed AI classification for its ticket and excludes it from correct answers", async () => {
  let aiCalls = 0;
  const results = await evaluateClassifiers(
    [
      { id: "EV-ERR", message: "first ticket", expectedCategory: "support" },
      { id: "EV-OK", message: "second ticket", expectedCategory: "sales" },
    ],
    {
      localClassifier: (ticket) => ticket.expectedCategory,
      aiClassifier: async () => {
        aiCalls += 1;
        if (aiCalls === 1) {
          throw new Error("simulated API failure");
        }
        return "sales";
      },
    }
  );

  assert.deepEqual(results[0].ai, { error: "simulated API failure" });
  assert.deepEqual(results[1].ai, { category: "sales" });
  assert.equal(aiCalls, 2);
  assert.equal(summarizeAccuracy(results, "ai").correct, 1);
  assert.match(formatEvaluationTable(results)[0]["GPT-OSS 20B"], /ERROR: simulated API failure/);
});

test("treats unsupported classifier output as an error, not a correct prediction", async () => {
  const results = await evaluateClassifiers(
    [{ id: "EV-BAD", message: "test ticket", expectedCategory: "sales" }],
    {
      localClassifier: () => "unknown",
      aiClassifier: () => "sales",
    }
  );

  assert.deepEqual(results[0].local, {
    error: "Classifier returned an unsupported category.",
  });
  assert.equal(summarizeAccuracy(results, "local").correct, 0);
  assert.equal(summarizeAccuracy(results, "ai").correct, 1);
});

test("returns zero accuracy for an empty evaluation set", () => {
  assert.deepEqual(summarizeAccuracy([], "ai"), {
    correct: 0,
    total: 0,
    accuracy: 0,
  });
});

test("rejects invalid evaluation inputs", async () => {
  await assert.rejects(
    evaluateClassifiers([], { localClassifier: () => "support" }),
    /Both local and AI classifier functions are required/
  );
  await assert.rejects(
    evaluateClassifiers(
      [{ id: "EV-INVALID", expectedCategory: "billing" }],
      { localClassifier: () => "support", aiClassifier: () => "support" }
    ),
    /unsupported expected category/
  );
});
