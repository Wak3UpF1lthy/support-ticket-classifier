const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTicketWithAI } = require("../classifyTicketWithAI");
const { classifyTickets } = require("../classification-service");

function fakeClient(content, onRequest = () => {}) {
  return {
    chat: {
      completions: {
        async create(request) {
          onRequest(request);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

for (const category of ["sales", "support", "cancellation"]) {
  test(`returns validated ${category} category from the AI response`, async () => {
    const result = await classifyTicketWithAI(
      { id: "T-1", message: "Нужна помощь", privateNote: "do not send" },
      { client: fakeClient(JSON.stringify({ category, reason: "Краткая причина" })) }
    );

    assert.equal(result, category);
  });
}

test("sends only the ticket message and requests strict JSON Schema output", async () => {
  let requestReceived;
  const ticket = { id: "T-42", message: "Please cancel my order", email: "private@example.com" };

  await classifyTicketWithAI(ticket, {
    model: "openai/gpt-oss-20b",
    client: fakeClient('{"category":"cancellation","reason":"Requests cancellation"}', (request) => {
      requestReceived = request;
    }),
  });

  assert.equal(requestReceived.model, "openai/gpt-oss-20b");
  assert.deepEqual(JSON.parse(requestReceived.messages[1].content), {
    message: ticket.message,
  });
  assert.equal(requestReceived.response_format.type, "json_schema");
  assert.equal(requestReceived.response_format.json_schema.strict, true);
  assert.equal(requestReceived.response_format.json_schema.schema.additionalProperties, false);
});

test("works with classifyTickets and preserves the original ticket id", async () => {
  const tickets = [{ id: "T-99", message: "Where can I buy?" }];
  const classifier = (ticket) =>
    classifyTicketWithAI(ticket, {
      client: fakeClient('{"category":"sales","reason":"Purchase question"}'),
    });

  assert.deepEqual(await classifyTickets(tickets, classifier), [
    { id: "T-99", category: "sales" },
  ]);
});

test("rejects malformed JSON, unknown categories, and invalid response shapes", async (t) => {
  const invalidResponses = [
    ["not JSON", /invalid JSON/],
    ['{"category":"billing","reason":"Unknown"}', /invalid classification/],
    ['{"category":"sales","reason":"OK","extra":true}', /invalid classification/],
    ['{"category":"sales","reason":""}', /invalid classification/],
  ];

  for (const [content, error] of invalidResponses) {
    await t.test(content, async () => {
      await assert.rejects(
        classifyTicketWithAI({ message: "Question" }, { client: fakeClient(content) }),
        error
      );
    });
  }
});

test("rejects a response without message content", async () => {
  const client = {
    chat: { completions: { async create() { return { choices: [] }; } } },
  };

  await assert.rejects(
    classifyTicketWithAI({ message: "Question" }, { client }),
    /did not include a JSON message/
  );
});

test("propagates API/client errors without falling back to local classification", async () => {
  const apiError = new Error("simulated API failure");
  const client = {
    chat: { completions: { async create() { throw apiError; } } },
  };

  await assert.rejects(
    classifyTicketWithAI({ message: "Хочу купить" }, { client }),
    (error) => error === apiError
  );
});
