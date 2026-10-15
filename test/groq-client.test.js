const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_BASE_URL, createGroqClient } = require("../groq-client");
const { classifyTicketWithAI } = require("../classifyTicketWithAI");

test("reports a clear configuration error when the API key is missing", async () => {
  assert.throws(() => createGroqClient({ apiKey: "" }), /GROQ_API_KEY is required/);
  await assert.rejects(
    classifyTicketWithAI({ message: "Question" }, { apiKey: "" }),
    /GROQ_API_KEY is required/
  );
});

test("sends an OpenAI-compatible request to the GroqCloud base URL", async () => {
  let requestUrl;
  let requestOptions;
  const client = createGroqClient({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: '{"category":"support","reason":"Help"}' } }] };
        },
      };
    },
  });

  const category = await classifyTicketWithAI({ message: "Help me" }, { client });

  assert.equal(category, "support");
  assert.equal(requestUrl, `${DEFAULT_BASE_URL}/chat/completions`);
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-key");
});

test("uses globalThis.fetch by default and passes it through to the request", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return {
      ok: true,
      async json() {
        return { choices: [] };
      },
    };
  };

  try {
    const client = createGroqClient({ apiKey: "test-key" });
    await client.chat.completions.create({});
    assert.equal(requestUrl, `${DEFAULT_BASE_URL}/chat/completions`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports HTTP and network errors without exposing credentials", async (t) => {
  await t.test("HTTP error", async () => {
    const client = createGroqClient({
      apiKey: "secret-test-key",
      fetchImpl: async () => ({ ok: false, status: 429 }),
    });

    await assert.rejects(
      client.chat.completions.create({}),
      (error) => error.message.includes("429") && !error.message.includes("secret-test-key")
    );
  });

  await t.test("network error", async () => {
    const client = createGroqClient({
      apiKey: "secret-test-key",
      fetchImpl: async () => {
        throw new Error("simulated network failure");
      },
    });

    await assert.rejects(
      client.chat.completions.create({}),
      (error) => error.message === "Groq API network request failed."
    );
  });
});

test("reports invalid JSON from the HTTP response", async () => {
  const client = createGroqClient({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        throw new SyntaxError("invalid response");
      },
    }),
  });

  await assert.rejects(client.chat.completions.create({}), /invalid JSON response/);
});
