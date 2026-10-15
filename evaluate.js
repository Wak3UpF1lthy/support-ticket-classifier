const path = require("node:path");
const { readTicketInputs, classifyTicket } = require("./index");
const { classifyTicketWithAI } = require("./classifyTicketWithAI");
const { createGroqClient } = require("./groq-client");
const {
  evaluateClassifiers,
  formatEvaluationTable,
  summarizeAccuracy,
} = require("./evaluation");

async function main() {
  const evaluationPath = path.join(__dirname, "data", "evaluation-tickets.json");
  const tickets = readTicketInputs(evaluationPath);

  for (const [index, ticket] of tickets.entries()) {
    if (
      !["sales", "support", "cancellation"].includes(ticket.expectedCategory)
    ) {
      throw new TypeError(`Evaluation ticket at index ${index} has an unsupported expected category.`);
    }
  }

  console.log(
    `Evaluation will make ${tickets.length} real GroqCloud API requests; API usage may incur charges.`
  );
  const client = createGroqClient();
  const results = await evaluateClassifiers(tickets, {
    localClassifier: classifyTicket,
    aiClassifier: (ticket) => classifyTicketWithAI(ticket, { client }),
  });

  console.table(formatEvaluationTable(results));

  for (const [name, key] of [["Local", "local"], ["GPT-OSS 20B", "ai"]]) {
    const summary = summarizeAccuracy(results, key);
    console.log(
      `${name}: ${summary.correct}/${summary.total} correct; accuracy ${summary.accuracy.toFixed(1)}%`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Evaluation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
