const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { createServer } = require("../server");

const MAX_TEXT_LENGTH = 4000;

async function withServer(classify, run) {
  const server = createServer({ classify });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`, server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

test("serves the web interface", async () => {
  await withServer(
    async () => "support",
    async baseUrl => {
      const response = await fetch(baseUrl);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);

      const html = await response.text();
      assert.match(html, /AI Support Ticket Classifier/);
    },
  );
});

test("classifies one text and returns the original text and category", async () => {
  let receivedTicket;
  await withServer(
    async ticket => {
      receivedTicket = ticket;
      return "cancellation";
    },
    async baseUrl => {
      const response = await fetch(`${baseUrl}/api/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "I want to cancel my subscription" }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        text: "I want to cancel my subscription",
        category: "cancellation",
      });
      assert.deepEqual(receivedTicket, {
        message: "I want to cancel my subscription",
      });
    },
  );
});

test("rejects malformed JSON, empty text, and unsupported methods", async t => {
  await withServer(
    async () => "support",
    async baseUrl => {
      await t.test("malformed JSON", async () => {
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          body: "{",
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /valid JSON/);
      });

      await t.test("empty text", async () => {
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "  " }),
        });
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /non-empty string/);
      });

      await t.test("unsupported method", async () => {
        const response = await fetch(`${baseUrl}/api/classify`);
        assert.equal(response.status, 405);
        assert.equal(response.headers.get("allow"), "POST");
      });
    },
  );
});

test("accepts text at the limit and rejects longer text without classifying it", async t => {
  let classifyCalls = 0;
  await withServer(
    async () => {
      classifyCalls += 1;
      return "support";
    },
    async baseUrl => {
      await t.test("accepts exactly 4000 characters", async () => {
        const text = "a".repeat(MAX_TEXT_LENGTH);
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { text, category: "support" });
      });

      await t.test("rejects 4001 Unicode characters", async () => {
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "😀".repeat(MAX_TEXT_LENGTH + 1) }),
        });
        assert.equal(response.status, 413);
        assert.match((await response.json()).error, /4000 characters/);
      });

      assert.equal(classifyCalls, 1);
    },
  );
});

test("rejects oversized request bodies and stops before classification", async () => {
  let classifyCalled = false;
  await withServer(
    async () => {
      classifyCalled = true;
      return "support";
    },
    async baseUrl => {
      const { port } = new URL(baseUrl);
      const response = await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        let responseText = "";
        socket.setEncoding("utf8");
        socket.on("connect", () => {
          socket.write(
            "POST /api/classify HTTP/1.1\r\n" +
              `Host: 127.0.0.1:${port}\r\n` +
              "Content-Type: application/json\r\n" +
              `Content-Length: ${1024 * 1024 + 1}\r\n` +
              "Connection: close\r\n\r\n",
          );
        });
        socket.on("data", chunk => {
          responseText += chunk;
        });
        socket.on("end", () => resolve(responseText));
        socket.on("error", reject);
      });
      assert.match(response, /^HTTP\/1\.1 413/);
      assert.match(response, /Connection: close/i);
      assert.equal(classifyCalled, false);
    },
  );
});

test("rejects oversized streamed bodies without buffering the full request", async () => {
  await withServer(
    async () => "support",
    async baseUrl => {
      const { port } = new URL(baseUrl);
      const response = await new Promise((resolve, reject) => {
        const request = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/classify",
            method: "POST",
            headers: { "Transfer-Encoding": "chunked" },
          },
          incoming => {
            const chunks = [];
            incoming.on("data", chunk => chunks.push(chunk));
            incoming.on("end", () =>
              resolve({
                statusCode: incoming.statusCode,
                headers: incoming.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        request.on("error", reject);
        request.end(Buffer.alloc(1024 * 1024 + 1, 0x61));
      });

      assert.equal(response.statusCode, 413);
      assert.equal(response.headers.connection, "close");
      assert.match(JSON.parse(response.body).error, /too large/);
    },
  );
});

test("handles interrupted request bodies without classifying or breaking later requests", async () => {
  let classifyCalled = false;
  await withServer(
    async () => {
      classifyCalled = true;
      return "support";
    },
    async (baseUrl, server) => {
      const { port } = new URL(baseUrl);
      let receivedBody;
      const bodyReceived = new Promise(resolve => {
        receivedBody = resolve;
      });
      let aborted;
      const abortedRequest = new Promise(resolve => {
        aborted = resolve;
      });
      server.once("request", incoming => {
        incoming.once("data", receivedBody);
        incoming.once("aborted", aborted);
      });
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        path: "/api/classify",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "100",
        },
      });
      request.on("error", () => {});
      await new Promise(resolve =>
        request.once("socket", socket => {
          if (socket.connecting) {
            socket.once("connect", resolve);
          } else {
            resolve();
          }
        }),
      );
      request.write("{");
      await bodyReceived;
      request.destroy();
      await abortedRequest;
      assert.equal(classifyCalled, false);

      const response = await fetch(`${baseUrl}/api/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ text: "A later complete request" }),
      });
      assert.equal(response.status, 200);
    },
  );
});

test("returns a safe API error and logs no secrets or ticket text", async () => {
  const originalConsoleError = console.error;
  const logOutput = [];
  console.error = (...values) => logOutput.push(values.join(" "));
  try {
    await withServer(
      async ({ message }) => {
        throw new Error(`request failed with key secret-value for ${message}`);
      },
      async baseUrl => {
        const text = "private ticket text";
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        assert.equal(response.status, 502);
        const body = await response.text();
        assert.match(body, /Classification failed/);
        assert.doesNotMatch(body, /secret-value/);
        assert.equal(logOutput.length, 1);
        assert.doesNotMatch(logOutput[0], /secret-value|private ticket text/);
      },
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test("rejects unsupported classifier categories", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withServer(
      async () => "neutral",
      async baseUrl => {
        const response = await fetch(`${baseUrl}/api/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "A message" }),
        });
        assert.equal(response.status, 502);
      },
    );
  } finally {
    console.error = originalConsoleError;
  }
});
