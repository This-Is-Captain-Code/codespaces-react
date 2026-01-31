# Quick Start: Railway Bot Architecture

## 🚀 Getting Started

### 1. Environment Setup

Create/update `.env` in the `backend/` directory:

```bash
# Railway API Access
RAILWAY_API_TOKEN=your_railway_api_key_here
RAILWAY_PROJECT_ID=your_project_id
RAILWAY_ENVIRONMENT_ID=production
RAILWAY_OPENCLAW_TEMPLATE_ID=your_openclaw_template_id

# OpenRouter LLM
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Server
PORT=3001
BACKEND_URL=http://localhost:3001
NODE_ENV=development
```

**How to get Railway credentials:**
1. Go to https://railway.app
2. Create project or select existing
3. Get API token from Settings → API Token
4. Find project ID and environment ID in project settings
5. Create/reference OpenClaw service template

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend (if not already done)
cd ../
npm install
```

### 3. Start Services

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Server running on http://localhost:3001
```

**Terminal 2 - Frontend (if using dev server):**
```bash
npm run dev
# Frontend running on http://localhost:5173
```

Or use simple-browser to open `public/index.html`

---

## ✅ Test the Flow

### Create Your First Bot

1. **Open the app** → See "Create Your Bot" form
2. **Fill form:**
   - Name: "Test Bot"
   - Model: "gpt-3.5-turbo"
   - System Prompt: "You are a helpful assistant."
   - API Key: Your OpenRouter key (sk-or-v1-...)
3. **Click "Create Bot"** → Wait for Railway service to deploy
4. **See success message** → UI switches to chat view

### Chat with Your Bot

1. **Type message:** "Hello, what's your name?"
2. **Click Send** or press Enter
3. **See response** from bot

### Manage Your Bot

- **Update Config:** Click "Update Config" → change model/prompt
- **Copy Token:** Click "Copy Token" → use for API calls
- **Regenerate Token:** Confirm → new token (old one expires)
- **Delete Bot:** Type "DELETE_BOT" → bot removed from Railway

---

## 🔍 API Testing

### Test with curl

**Create Bot:**
```bash
curl -X POST http://localhost:3001/api/bots/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Bot",
    "model": "gpt-3.5-turbo",
    "systemPrompt": "You are helpful",
    "apiKey": "sk-or-v1-..."
  }'
```

Response:
```json
{
  "token": "botId123:abc123def456",
  "bot": {
    "botId": "botId123",
    "botName": "Test Bot",
    "model": "gpt-3.5-turbo",
    "endpoint": "https://railway-service-url",
    "status": "deploying"
  }
}
```

**Get Bot Status:**
```bash
TOKEN=botId123:abc123def456

curl http://localhost:3001/api/bots/me \
  -H "Authorization: Bearer $TOKEN"
```

**Send Message:**
```bash
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "Hello!"}'
```

---

## 🐛 Debugging

### Common Issues

**1. Railway service not deploying**
```
Error: Railway API returned 401
→ Check RAILWAY_API_TOKEN is correct
→ Verify token has API access permission
```

**2. OpenRouter errors**
```
Error: Invalid API key
→ Verify OPENROUTER_API_KEY in .env
→ Ensure it's sk-or-v1-... format
```

**3. Bot endpoint not responding**
```
Error: Service unavailable (503)
→ Service still deploying (wait 30-60s)
→ Check Railway service logs
```

**4. Token not persisting**
```
Problem: Token lost on page refresh
→ Check browser localStorage
→ Verify localStorage.getItem('botToken') in console
```

### Enable Verbose Logging

Edit `backend/src/services/railwayService.js`:
```javascript
// Add console.log for debugging:
console.log('Railway API Response:', JSON.stringify(response.data, null, 2));
```

---

## 📦 File Structure

```
backend/
├── src/
│   ├── services/
│   │   ├── railwayService.js      ← Railway API client
│   │   └── botService.js          ← Bot lifecycle
│   ├── routes/
│   │   ├── bots.js                ← Bot endpoints
│   │   ├── chat.js                ← Message routing
│   │   └── index.js               ← Server config
│   └── index.js                   ← Entry point
├── .env                           ← Configuration
└── package.json

public/
└── index.html                     ← New bot-based UI
```

---

## 🧪 Local Testing (Without Railway)

To test locally without Railway:

1. **Mock Railway responses** in `railwayService.js`:
```javascript
async function createBotService(userId, config) {
  // Mock implementation for testing
  return {
    serviceId: 'mock-' + userId,
    endpoint: 'http://localhost:3002/mock-bot',
    status: 'running'
  };
}
```

2. **Create mock OpenClaw server** (optional):
```bash
# In separate terminal
node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      response: 'Mock response: ' + new Date().toISOString()
    }));
  }
});
server.listen(3002);
console.log('Mock server on port 3002');
"
```

---

## 📊 Monitoring

### Check Bot Status
```bash
curl http://localhost:3001/api/bots/admin/list \
  -H "Authorization: Bearer admin-token"
```

### View Railway Service Logs
```bash
# In Railway dashboard:
1. Select project
2. Select bot service
3. View Logs tab
```

### Monitor Message Traffic
```bash
# Add to chat.js before/after message call:
console.log('Sending to:', bot.endpoint);
console.log('Message:', message);
console.log('Response:', response);
```

---

## 🚀 Production Deployment

### Before Going Live

- [ ] Set `NODE_ENV=production` in backend .env
- [ ] Use strong `RAILWAY_API_TOKEN` (rotate regularly)
- [ ] Encrypt API keys in storage
- [ ] Set up database (replace in-memory Maps)
- [ ] Add request logging/monitoring
- [ ] Configure CORS properly
- [ ] Set up error tracking (Sentry)
- [ ] Enable HTTPS
- [ ] Add rate limiting on endpoints
- [ ] Test with production OpenRouter key

### Deployment Steps

```bash
# 1. Push to Railway
git push railway main

# 2. Verify service deployed
curl https://your-railway-domain/api/health

# 3. Test bot creation
# (Use same curl commands as above, pointing to production URL)

# 4. Monitor logs
# (Check Railway dashboard for errors)
```

---

## 💡 Tips & Tricks

**Persist tokens between sessions:**
- Already done! Check `localStorage.getItem('botToken')`

**Test with multiple users:**
- Create different bots with different tokens
- Each token stored separately in localStorage (simulated)

**Export conversation:**
- Copy messages from chat
- Save to .txt file
- (Database integration in Phase 2)

**Debug Railway API:**
- Enable verbose logging in railwayService.js
- Log all GraphQL mutations/queries
- Check `variables` and `data` in responses

---

## 📚 Resources

- [Railway Docs](https://docs.railway.app)
- [OpenRouter API](https://openrouter.ai/docs)
- [GraphQL Basics](https://graphql.org/learn)

---

## 🆘 Still Having Issues?

1. Check console for JavaScript errors (F12)
2. Check backend logs for API errors
3. Verify all environment variables set
4. Check Railway service is running
5. Verify OpenRouter API key is valid
6. Try fresh page reload
7. Clear browser cache and localStorage

**Not resolved?** Check the detailed [RAILWAY_MIGRATION.md](./RAILWAY_MIGRATION.md) guide.
