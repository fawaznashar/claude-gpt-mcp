import express from "express";
import OpenAI from "openai";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fs from "fs";

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const server = new McpServer({
  name: "arabic-image-generator",
  version: "1.0.0",
});

server.tool(
  "generate_arabic_image",
  {
    prompt: z.string().describe("Arabic or English image prompt"),
    size: z.string().optional().describe("Example: 1024x1024"),
  },
  async ({ prompt, size }) => {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: `Generate a high-quality image. Support Arabic text accurately when requested. Prompt: ${prompt}`,
      tools: [
        {
          type: "image_generation",
          size: size || process.env.OPENAI_IMAGE_SIZE || "1024x1024",
        },
      ],
    });

    const imageBase64 = response.output
      .filter((x) => x.type === "image_generation_call")
      .map((x) => x.result)[0];

    if (!imageBase64) {
      return {
        content: [{ type: "text", text: "لم يتم توليد صورة." }],
      };
    }

    const fileName = `image-${Date.now()}.png`;
    const filePath = `./public/${fileName}`;
    fs.mkdirSync("./public", { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));

    const url = `${process.env.PUBLIC_BASE_URL}/${fileName}`;

    return {
      content: [
        {
          type: "text",
          text: `تم توليد الصورة بنجاح: ${url}`,
        },
      ],
    };
  }
);

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.use(express.static("public"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`MCP running on port ${process.env.PORT || 3000}`);
});
