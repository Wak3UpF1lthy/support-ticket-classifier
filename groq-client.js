const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

function createGroqClient(options = {}) {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  const baseURL = options.baseURL ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("GROQ_API_KEY is required for AI classification.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to call GroqCloud.");
  }

  return {
    chat: {
      completions: {
        async create(request) {
          let response;

          try {
            response = await fetchImpl(`${baseURL}/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(request),
            });
          } catch (error) {
            throw new Error("Groq API network request failed.", { cause: error });
          }

          if (!response.ok) {
            throw new Error(`Groq API request failed with status ${response.status}.`);
          }

          try {
            return await response.json();
          } catch (error) {
            throw new Error("Groq API returned an invalid JSON response.", { cause: error });
          }
        },
      },
    },
  };
}

module.exports = { DEFAULT_BASE_URL, createGroqClient };
