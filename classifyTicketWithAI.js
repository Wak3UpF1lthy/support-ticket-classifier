const { createGroqClient } = require("./groq-client");

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const VALID_CATEGORIES = ["sales", "support", "cancellation"];

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: VALID_CATEGORIES,
    },
    reason: {
      type: "string",
    },
  },
  required: ["category", "reason"],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTION = [
  "Classify the ticket into exactly one category.",
  "sales: sales or questions about purchasing.",
  "support: questions, problems, and technical support.",
  "cancellation: cancellation of an order.",
  "Understand both Russian and English.",
  "Return a brief reason and follow the required JSON schema.",
].join(" ");

function validateTicket(ticket) {
  if (
    !ticket ||
    typeof ticket !== "object" ||
    Array.isArray(ticket) ||
    typeof ticket.message !== "string" ||
    ticket.message.trim() === ""
  ) {
    throw new TypeError("AI classification requires a ticket with a non-empty string message.");
  }
}

function parseClassification(content) {
  let result;

  try {
    result = JSON.parse(content);
  } catch (error) {
    throw new Error("AI classifier returned invalid JSON.", { cause: error });
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).length !== 2 ||
    !Object.hasOwn(result, "category") ||
    !Object.hasOwn(result, "reason") ||
    !VALID_CATEGORIES.includes(result.category) ||
    typeof result.reason !== "string" ||
    result.reason.trim() === ""
  ) {
    throw new TypeError("AI classifier returned an invalid classification object.");
  }

  return result.category;
}

async function classifyTicketWithAI(ticket, options = {}) {
  validateTicket(ticket);

  const client = options.client || createGroqClient(options);
  const model = options.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: JSON.stringify({ message: ticket.message }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ticket_classification",
        strict: true,
        schema: CLASSIFICATION_SCHEMA,
      },
    },
  });

  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new TypeError("Groq API response did not include a JSON message.");
  }

  return parseClassification(content);
}

module.exports = {
  CLASSIFICATION_SCHEMA,
  DEFAULT_MODEL,
  classifyTicketWithAI,
};
