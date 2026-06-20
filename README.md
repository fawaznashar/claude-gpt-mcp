# Claude GPT MCP Server

Remote MCP server that lets Claude call OpenAI GPT through one tool: `ask_gpt`.

## Local run

```powershell
npm install
copy .env.example .env
notepad .env
npm start
```

Open:

```text
http://localhost:3000/health
```

## Render deploy

1. Upload this folder to GitHub.
2. Create a new Render Web Service.
3. Build command:

```text
npm install
```

4. Start command:

```text
npm start
```

5. Environment variables:

```text
OPENAI_API_KEY=your key
OPENAI_MODEL=gpt-5.5
```

6. Claude connector URL:

```text
https://your-render-service.onrender.com/mcp
```
