const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { classifyTicketWithAI } = require("./classifyTicketWithAI");

const MAX_BODY_SIZE = 1024 * 1024;
const MAX_TEXT_LENGTH = 4000;
const INDEX_PATH = path.join(__dirname, "public", "index.html");
const VALID_CATEGORIES = new Set(["sales", "support", "cancellation"]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    function cleanup() {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("aborted", onAborted);
      request.off("error", onError);
      request.off("close", onClose);
    }

    function fail(message, statusCode, closeRequest = false) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (closeRequest) {
        request.pause();
      }
      const error = new Error(message);
      error.statusCode = statusCode;
      error.closeRequest = closeRequest;
      if (message === "Request was interrupted.") {
        error.code = "ERR_REQUEST_INTERRUPTED";
      }
      reject(error);
    }

    function onData(chunk) {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        fail("Request body is too large.", 413, true);
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("Request body must contain valid JSON.");
        error.statusCode = 400;
        reject(error);
      }
    }

    function onAborted() {
      fail("Request was interrupted.", 400);
    }

    function onError() {
      fail("Request could not be read.", 400);
    }

    function onClose() {
      if (!request.complete) {
        fail("Request was interrupted.", 400);
      }
    }

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("aborted", onAborted);
    request.once("error", onError);
    request.once("close", onClose);

    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
      fail("Request body is too large.", 413, true);
    }
  });
}

function exceedsTextLimit(text) {
  let length = 0;
  for (const character of text) {
    length += 1;
    if (length > MAX_TEXT_LENGTH) {
      return true;
    }
  }
  return false;
}

function createServer({ classify = classifyTicketWithAI } = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/api/classify") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed. Use POST." });
        return;
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        if (response.destroyed || response.writableEnded) {
          return;
        }
        if (error.closeRequest) {
          response.setHeader("Connection", "close");
          response.once("finish", () => request.destroy());
        }
        sendJson(response, error.statusCode || 400, {
          error: error.statusCode === 413
            ? "Request body is too large."
            : error.code === "ERR_REQUEST_INTERRUPTED"
              ? "Request was interrupted before it could be processed."
              : "Request body must contain valid JSON.",
        });
        return;
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.text !== "string" ||
        body.text.trim() === ""
      ) {
        sendJson(response, 400, { error: "text must be a non-empty string." });
        return;
      }

      if (exceedsTextLimit(body.text)) {
        sendJson(response, 413, {
          error: `text must be at most ${MAX_TEXT_LENGTH} characters.`,
        });
        return;
      }

      try {
        const category = await classify({ message: body.text });
        if (!VALID_CATEGORIES.has(category)) {
          throw new TypeError("Classifier returned an unsupported category.");
        }
        sendJson(response, 200, { text: body.text, category });
      } catch {
        console.error("Ticket classification failed.");
        if (response.destroyed || response.writableEnded) {
          return;
        }
        sendJson(response, 502, {
          error: "Classification failed. Check the API configuration and try again.",
        });
      }
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      fs.readFile(INDEX_PATH, (error, html) => {
        if (error) {
          sendJson(response, 500, { error: "Could not load the web interface." });
          return;
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`Support ticket classifier is available at http://localhost:${port}`);
  });
}

module.exports = { createServer };
