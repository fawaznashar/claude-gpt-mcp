import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is missing. Add it to .env locally or Render Environment Variables.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function createMcpServer() {
  const server = new McpServer({
    name: "claude-gpt-mcp",
    version: "1.0.0",
  });

  server.tool(
    "ask_gpt",
    "Send a question or task to OpenAI GPT and return the answer.",
    {
      prompt: z.string().min(1).describe("The user's question or task to send to GPT."),
    },
    async ({ prompt }) => {
      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [
          {
            type: "text",
            text: response.output_text || "No response returned from GPT.",
          },
        ],
      };
    }
  );

  return server;
}

app.get("/", (req, res) => {
  res.status(200).send("Claude GPT MCP server is running. MCP endpoint: /mcp");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    openai_key_loaded: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5.5",
  });
});

app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}`);
});
