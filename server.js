import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { google } from "googleapis";
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

function getGoogleAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing.");
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

async function moveFileToFolder(drive, fileId, folderId) {
  if (!folderId) return;

  const file = await drive.files.get({
    fileId,
    fields: "parents",
  });

  const previousParents = (file.data.parents || []).join(",");

  await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, parents",
  });
}

async function makeFileReadableByLink(drive, fileId) {
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });
}

function createMcpServer() {
  const server = new McpServer({
    name: "claude-gpt-mcp",
    version: "1.5.0",
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
        content: [{ type: "text", text: response.output_text || "No response returned from GPT." }],
      };
    }
  );

  server.tool(
    "analyze_lesson_to_lab",
    "Analyze an Arabic course lesson transcript, extract skills, build a knowledge card, and generate a learning report.",
    {
      lesson_title: z.string(),
      course_name: z.string().optional(),
      target_audience: z.string().optional(),
      transcript: z.string().min(50),
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
2. المهارات المستخرجة
3. المفاهيم الجوهرية
4. خطوات قابلة للتطبيق
5. تمارين عملية
6. أسئلة اختبار
7. أسلوب المدرب
8. رحلة العميل
9. بطاقة معرفة Knowledge Card
10. فرص المنتجات الرقمية والدروس التالية
`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [{ type: "text", text: response.output_text || "No analysis returned." }],
      };
    }
  );

  server.tool(
    "design_governance",
    "Create a visual governance brief and QA checklist before any design is generated.",
    {
      project_name: z.string(),
      design_goal: z.string(),
      target_audience: z.string(),
      content_summary: z.string(),
      design_format: z.string().optional(),
      preferred_style: z.string().optional(),
      forbidden_elements: z.string().optional(),
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
أنت مسؤول حوكمة تصميم بصري. لا تصمم الصورة ولا العرض.

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

أخرج:
1. قرار الحوكمة
2. Design Brief
3. النصوص النهائية المقترحة
4. تعليمات Canva/Gamma
5. Visual QA Checklist
6. أمر الاعتماد: لا يتم التنفيذ إلا بعد عبارة "اعتمد التصميم".
`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [{ type: "text", text: response.output_text || "No governance brief returned." }],
      };
    }
  );

  server.tool(
    "avatar_prompt",
    "Generate a reusable prompt using the fixed Fawaz Avatar reference.",
    {
      emotion: z.string(),
      pose: z.string(),
      context: z.string(),
    },
    async ({ emotion, pose, context }) => {
      const avatarImageUrl = process.env.AVATAR_IMAGE_URL || "No avatar URL configured";
      const avatarStyle = process.env.AVATAR_STYLE || "Looney Tunes Style";
      const avatarName = process.env.AVATAR_NAME || "Fawaz Avatar";

      const prompt = `
Use the fixed reference avatar image:
${avatarImageUrl}

Character Name:
${avatarName}

Visual Style:
${avatarStyle}

Rules:
- Never redesign the face.
- Keep the same identity.
- Change only expression, pose, and scene.
- Preserve the same avatar across all future content.

Emotion:
${emotion}

Pose:
${pose}

Context:
${context}
`;

      return {
        content: [{ type: "text", text: prompt }],
      };
    }
  );

  server.tool(
    "design_review",
    "Review a generated design against brand governance and quality standards.",
    {
      design_type: z.string(),
      design_goal: z.string(),
      target_audience: z.string(),
      design_description: z.string(),
      brand_style: z.string().optional(),
    },
    async ({ design_type, design_goal, target_audience, design_description, brand_style }) => {
      const prompt = `
أنت مراجع تصميم بصري محترف.

نوع التصميم:
${design_type}

هدف التصميم:
${design_goal}

الجمهور:
${target_audience}

الأسلوب:
${brand_style || process.env.AVATAR_STYLE || "Looney Tunes Style"}

وصف التصميم:
${design_description}

أخرج:
- التقييم العام /100
- Brand Compliance /100
- Readability /100
- Visual Hierarchy /100
- Engagement /100
- Technical Quality /100
- نقاط القوة
- المشاكل
- التحسينات
- القرار النهائي: PASS أو CONDITIONAL PASS أو REJECT
- سبب القرار
`;

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        input: prompt,
      });

      return {
        content: [{ type: "text", text: response.output_text || "No design review returned." }],
      };
    }
  );

  server.tool(
    "save_knowledge_card",
    "Save a Knowledge Card into Google Docs and Google Sheets.",
    {
      course_name: z.string(),
      lesson_title: z.string(),
      source: z.string().optional(),
      skills: z.string().optional(),
      skill_level: z.string().optional(),
      concepts: z.string().optional(),
      exercises: z.string().optional(),
      customer_journey_stage: z.string().optional(),
      teaching_style: z.string().optional(),
      digital_product_ideas: z.string().optional(),
      next_lessons: z.string().optional(),
      summary: z.string(),
      full_knowledge_card: z.string(),
      drive_folder_id: z.string().optional(),
      knowledge_bank_sheet_id: z.string().optional(),
    },
    async ({
      course_name,
      lesson_title,
      source,
      skills,
      skill_level,
      concepts,
      exercises,
      customer_journey_stage,
      teaching_style,
      digital_product_ideas,
      next_lessons,
      summary,
      full_knowledge_card,
      drive_folder_id,
      knowledge_bank_sheet_id,
    }) => {
      const auth = getGoogleAuth();
      const docs = google.docs({ version: "v1", auth });
      const drive = google.drive({ version: "v3", auth });
      const sheets = google.sheets({ version: "v4", auth });

      const folderId = drive_folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID || "";
      let spreadsheetId = knowledge_bank_sheet_id || process.env.KNOWLEDGE_BANK_SHEET_ID || "";

      if (!spreadsheetId) {
        const spreadsheet = await sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: "Knowledge Engine Bank",
            },
            sheets: [
              {
                properties: {
                  title: "Knowledge Bank",
                },
              },
            ],
          },
        });

        spreadsheetId = spreadsheet.data.spreadsheetId;

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "Knowledge Bank!A1:N1",
          valueInputOption: "RAW",
          requestBody: {
            values: [[
              "ID",
              "Course Name",
              "Lesson Title",
              "Source",
              "Skills",
              "Skill Level",
              "Concepts",
              "Exercises",
              "Customer Journey Stage",
              "Teaching Style",
              "Digital Product Ideas",
              "Next Lessons",
              "Summary",
              "Date",
            ]],
          },
        });

        if (folderId) {
          await moveFileToFolder(drive, spreadsheetId, folderId);
        }

        await makeFileReadableByLink(drive, spreadsheetId);
      }

      const existingRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Knowledge Bank!A2:A",
      });

      const rowCount = existingRows.data.values ? existingRows.data.values.length : 0;
      const cardId = `KC-${String(rowCount + 1).padStart(3, "0")}`;
      const today = new Date().toISOString().slice(0, 10);

      const docTitle = `${cardId} - ${course_name} - ${lesson_title}`;

      const doc = await docs.documents.create({
        requestBody: {
          title: docTitle,
        },
      });

      const documentId = doc.data.documentId;

      const docBody = `
${docTitle}

Course Name:
${course_name}

Lesson Title:
${lesson_title}

Source:
${source || ""}

Summary:
${summary}

Full Knowledge Card:
${full_knowledge_card}
`;

      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: {
                  index: 1,
                },
                text: docBody,
              },
            },
          ],
        },
      });

      if (folderId) {
        await moveFileToFolder(drive, documentId, folderId);
      }

      await makeFileReadableByLink(drive, documentId);

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Knowledge Bank!A:N",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[
            cardId,
            course_name,
            lesson_title,
            source || "",
            skills || "",
            skill_level || "",
            concepts || "",
            exercises || "",
            customer_journey_stage || "",
            teaching_style || "",
            digital_product_ideas || "",
            next_lessons || "",
            summary,
            today,
          ]],
        },
      });

      const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      return {
        content: [
          {
            type: "text",
            text: `
Knowledge Card Saved Successfully.

ID:
${cardId}

Google Doc:
${docUrl}

Knowledge Bank Sheet:
${sheetUrl}

Important:
If this is the first time and a new sheet was created, save this in Render:
KNOWLEDGE_BANK_SHEET_ID=${spreadsheetId}
`,
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
    google_service_account_loaded: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    tools: [
      "ask_gpt",
      "analyze_lesson_to_lab",
      "design_governance",
      "avatar_prompt",
      "design_review",
      "save_knowledge_card",
    ],
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
