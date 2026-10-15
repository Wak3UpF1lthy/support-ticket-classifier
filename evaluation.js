const VALID_CATEGORIES = new Set(["sales", "support", "cancellation"]);

async function evaluateClassifiers(tickets, { localClassifier, aiClassifier }) {
  if (!Array.isArray(tickets)) {
    throw new TypeError("Evaluation tickets must be an array.");
  }

  if (typeof localClassifier !== "function" || typeof aiClassifier !== "function") {
    throw new TypeError("Both local and AI classifier functions are required.");
  }

  const results = [];

  for (const [index, ticket] of tickets.entries()) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
      throw new TypeError(`Evaluation ticket at index ${index} must be an object.`);
    }

    if (!VALID_CATEGORIES.has(ticket.expectedCategory)) {
      throw new TypeError(`Evaluation ticket at index ${index} has an unsupported expected category.`);
    }

    const local = await classifyOne(localClassifier, ticket);
    const ai = await classifyOne(aiClassifier, ticket);

    results.push({
      id: ticket.id,
      expected: ticket.expectedCategory,
      local,
      ai,
    });
  }

  return results;
}

async function classifyOne(classifier, ticket) {
  try {
    const category = await classifier(ticket);
    if (!VALID_CATEGORIES.has(category)) {
      throw new TypeError("Classifier returned an unsupported category.");
    }
    return { category };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown classification error.",
    };
  }
}

function summarizeAccuracy(results, key) {
  const correct = results.filter((result) => result[key].category === result.expected).length;
  const total = results.length;

  return {
    correct,
    total,
    accuracy: total === 0 ? 0 : (correct / total) * 100,
  };
}

function formatEvaluationTable(results) {
  return results.map((result) => ({
    ID: result.id,
    Expected: result.expected,
    Local: result.local.category ?? `ERROR: ${result.local.error}`,
    "GPT-OSS 20B": result.ai.category ?? `ERROR: ${result.ai.error}`,
  }));
}

module.exports = {
  evaluateClassifiers,
  formatEvaluationTable,
  summarizeAccuracy,
};
