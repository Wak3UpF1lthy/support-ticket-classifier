const fs = require("node:fs");
const path = require("node:path");
const { classifyTickets } = require("./classification-service");
const { classifyTicketWithAI } = require("./classifyTicketWithAI");

function classifyTicket(ticket) {
  if (
    !ticket ||
    typeof ticket !== "object" ||
    Array.isArray(ticket) ||
    typeof ticket.message !== "string" ||
    ticket.message.trim() === ""
  ) {
    throw new TypeError("Each ticket must be an object with a non-empty string message.");
  }

  const message = ticket.message.toLowerCase();

  if (["отмен", "расторг", "cancel", "cancellation"].some((word) => message.includes(word))) {
    return "cancellation";
  }

  if (["куп", "цен", "стоимост", "стоит", "заказ", "приобр", "buy", "price", "order"].some((word) => message.includes(word))) {
    return "sales";
  }

  return "support";
}

function readTicketInputs(filePath) {
  let content;

  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Could not read tickets file at "${filePath}": ${error.message}`, { cause: error });
  }

  let tickets;

  try {
    tickets = JSON.parse(content);
  } catch (error) {
    throw new Error(`Tickets file contains invalid JSON: ${error.message}`, { cause: error });
  }

  if (!Array.isArray(tickets)) {
    throw new TypeError("Tickets file must contain a JSON array.");
  }

  return tickets.map((ticket, index) => {
    if (
      !ticket ||
      typeof ticket !== "object" ||
      Array.isArray(ticket) ||
      !(typeof ticket.id === "string" && ticket.id.trim() !== "") &&
        !(typeof ticket.id === "number" && Number.isFinite(ticket.id))
    ) {
      throw new TypeError(`Ticket at index ${index} must be an object with a non-empty string or finite numeric id.`);
    }

    if (typeof ticket.message !== "string" || ticket.message.trim() === "") {
      throw new TypeError(`Ticket at index ${index} must have a non-empty string message.`);
    }

    return ticket;
  });
}

function readTickets(filePath) {
  return readTicketInputs(filePath).map((ticket) => ({
    id: ticket.id,
    category: classifyTicket(ticket),
  }));
}

async function main(mode = process.argv[2]) {
  const ticketsPath = path.join(__dirname, "data", "tickets.json");
  const tickets = readTicketInputs(ticketsPath);
  const classifier = mode === "--ai" ? classifyTicketWithAI : classifyTicket;
  const results = await classifyTickets(tickets, classifier);
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { classifyTicket, main, readTicketInputs, readTickets };
