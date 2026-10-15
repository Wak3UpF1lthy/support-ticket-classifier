# AI Support Ticket Classifier

An AI-powered web application that automatically classifies customer support tickets into three categories: Sales, Support, and Cancellation.

**Live Demo:** [Try the application](https://support-ticket-classifier-w6ga.onrender.com)  
**Source Code:** [GitHub Repository](https://github.com/Wak3UpF1lthy/support-ticket-classifier)

## Features

- **AI-powered classification** using the Groq API.
- **Three ticket categories:** Sales, Support, and Cancellation.
- **Web interface** for submitting customer messages and viewing classification results.
- **Rule-based classifier** implemented in JavaScript for comparison with the AI classifier.
- **Automated tests** covering classification logic, API validation, error handling, and server behavior.
- **Input validation** with limits on request size and ticket length.
- **Error handling** designed to avoid exposing API credentials or customer messages in server logs.

## Tech Stack

- JavaScript (Node.js)
- Built-in Node.js HTTP server
- Groq API
- HTML and CSS
- Node.js test runner

## Getting Started

### Prerequisites

- Node.js 18 or later
- A Groq API key

### Installation

Clone the repository:

```bash
git clone https://github.com/Wak3UpF1lthy/support-ticket-classifier.git
cd support-ticket-classifier
```

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Add your Groq API key to `.env` using the environment variable expected by the application. Keep this file private and never commit it to GitHub.

### Run the Application

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API

### Classify a Ticket

**Endpoint:** `POST /api/classify`

**Request body:**

```json
{
  "text": "I was charged twice for my subscription."
}
```

**Example response:**

```json
{
  "text": "I was charged twice for my subscription.",
  "category": "support"
}
```

Supported categories:

- `sales`
- `support`
- `cancellation`

The API validates incoming requests and returns appropriate HTTP error responses for invalid or unsupported input.

## Testing

Run the automated test suite:

```bash
npm test
```

The tests cover classification behavior, input validation, malformed requests, oversized payloads, API errors, and safe error logging.

## Project Structure

```text
.
├── data/
├── public/
│   └── index.html
├── test/
├── classification-service.js
├── classifyTicketWithAI.js
├── evaluation.js
├── evaluate.js
├── groq-client.js
├── index.js
├── server.js
├── package.json
├── .env.example
└── README.md
```

## Deployment

The application is deployed on Render:

[Open the live application](https://support-ticket-classifier-w6ga.onrender.com)

The
