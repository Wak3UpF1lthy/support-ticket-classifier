const VALID_CATEGORIES = new Set(["sales", "support", "cancellation"]);

async function classifyTickets(tickets, classifyTicket) {
  if (!Array.isArray(tickets)) {
    throw new TypeError("Tickets must be an array.");
  }

  if (typeof classifyTicket !== "function") {
    throw new TypeError("A ticket classifier function is required.");
  }

  return Promise.all(
    tickets.map(async (ticket, index) => {
      const category = await classifyTicket(ticket);

      if (!VALID_CATEGORIES.has(category)) {
        throw new TypeError(
          `Classifier returned an unsupported category for ticket at index ${index}.`
        );
      }

      return {
        id: ticket.id,
        category,
      };
    })
  );
}

module.exports = { classifyTickets };
