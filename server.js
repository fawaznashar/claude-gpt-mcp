import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is missing.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function createMcpServer() {
  const server = new McpServer({
    name: "claude-gpt-mcp",
    version: "1.2.0",
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

  server.tool(
    "analyze_lesson_to_lab",
    "Analyze an Arabic course lesson transcript, extract skills, build a knowledge card, and generate a learning report.",
    {
      lesson_title: z.string().describe("Title of the lesson or video."),
      course_name: z.string().optional().describe("Name of the course if available."),
      target_audience: z.string().optional().describe("Who this lesson is for."),
      transcript: z.string().min(50).describe("Full lesson transcript from YouTube or any course."),
    },
    async ({ lesson_title, course_name, target_audience, transcript }) => {
      const prompt = `
أنت نظام Knowledge Skills Engine متخصص في تحويل ترانسكربت الدورات إلى بنك معرفة قابل لإعادة الاستخدام.

حلل الدرس التالي بعمق، ولا تلخصه فقط.

اسم الدورة:
${course_name || "غير محدد"}

عنوان الدرس:
${lesson_title}

الجمهور المستهدف:
${target_audience || "غير محدد"}

الترانسكربت:
${transcript}

أخرج النتيجة بالعربية وبصيغة منظمة تشمل:
1. ملخص تنفيذي للدرس
2. المهارات المستخرجة:
- اسم المهارة
- نوعها
- المستوى
- أين ظهرت في الدرس
- كيف نستفيد منها عمليًا
3. المفاهيم الجوهرية
4. خطوات قابلة للتطبيق
5. تمارين عملية
6. أسئلة اختبار
7. أسلوب المدرب
8. رحلة العميل المرتبطة بالدرس
9. بطاقة معرفة Knowledge Card
10. تقرير الاستفادة:
- مهارات جديدة
- مهارات تم تعزيزها
- فرص تحويل الدرس إلى دورة أو منتج رقمي
- اقتراحات لدروس تالية
`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [
          {
            type: "text",
            text: response.output_text || "No analysis returned.",
          },
        ],
      };
    }
  );

  server.tool(
    "design_governance",
    "Create a visual governance brief and QA checklist before any design is generated.",
    {
      project_name: z.string().describe("Name of the design project."),
      design_goal: z.string().describe("The purpose of the design."),
      target_audience: z.string().describe("Who will see or use this design."),
      content_summary: z.string().describe("Summary of the content that will be designed."),
      design_format: z.string().optional().describe("Post, slide, course cover, infographic, landing page, etc."),
      preferred_style: z.string().optional().describe("Preferred visual style."),
      forbidden_elements: z.string().optional().describe("Things that must not appear in the design."),
    },
    async ({
      project_name,
      design_goal,
      target_audience,
      content_summary,
      design_format,
      preferred_style,
      forbidden_elements,
    }) => {
      const prompt = `
أنت مسؤول حوكمة تصميم بصري. لا تصمم الصورة ولا العرض. مهمتك إنشاء بوابة اعتماد قبل التصميم.

المشروع:
${project_name}

هدف التصميم:
${design_goal}

الجمهور:
${target_audience}

نوع التصميم:
${design_format || "غير محدد"}

الأسلوب المفضل:
${preferred_style || "غير محدد"}

العناصر الممنوعة:
${forbidden_elements || "غير محدد"}

ملخص المحتوى:
${content_summary}

أخرج النتيجة بالعربية وتشمل:

1. قرار الحوكمة:
- مسموح بالتصميم / يحتاج تعديل / مرفوض مؤقتًا

2. Design Brief:
- الهدف
- الجمهور
- الرسالة الأساسية
- المقاس المقترح
- الأسلوب البصري
- الألوان المقترحة
- نوع الخط
- العناصر البصرية المسموحة
- العناصر البصرية الممنوعة

3. النصوص النهائية المقترحة للتصميم

4. تعليمات دقيقة لأداة التصميم Canva/Gamma:
- ماذا تصمم
- ماذا تتجنب
- توزيع العناصر
- مستوى البساطة
- الهوية البصرية

5. Visual QA Checklist:
- وضوح النص
- عدم التشويه
- اتساق الألوان
- عدم وجود شخصيات عشوائية
- مناسبة الجمهور
- قابلية القراءة
- عدم المبالغة في المؤثرات

6. أمر الاعتماد:
لا يتم تنفيذ التصميم إلا بعد أن يقول المستخدم نصًا: "اعتمد التصميم".
`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [
          {
            type: "text",
            text: response.output_text || "No governance brief returned.",
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
    tools: ["ask_gpt", "analyze_lesson_to_lab", "design_governance"],
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
      res.status(500).json({
        error: error.message || "Internal server error",
      });
    }
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}`);
});