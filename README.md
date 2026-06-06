# Maybe Shelf

Your personal events inbox. Browse things you might want to go to, powered by Notion as a database and Claude for smart extraction.

## Setup

### 1. Environment variables (set these in Netlify)

```
NOTION_API_KEY=secret_xxxxxxxxxxxx
NOTION_DATABASE_ID=ed3b3c4e-4da9-4364-92ca-6beb5a03df65
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

### 2. Notion integration
- Go to https://www.notion.so/profile/integrations
- Create a new integration, copy the secret → NOTION_API_KEY
- Share your Maybe Shelf database with the integration

### 3. Deploy
- Push to GitHub
- Connect repo to Netlify
- Add environment variables in Netlify → Site settings → Environment variables
- Deploy!

### 4. Add to iPhone home screen
- Open your Netlify URL in Safari
- Tap the Share button → Add to Home Screen
- Name it "Maybe Shelf"

## Local dev

```bash
npm install
npm run dev
```

You'll also need [Netlify CLI](https://docs.netlify.com/cli/get-started/) for local function testing:

```bash
npx netlify-cli dev
```
