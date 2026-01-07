# Setup Instructions

Complete guide to getting the visual novel running.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- (Optional) Ollama or local LLM for EPIC 4

## Quick Start

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install all project dependencies (frontend + backend)
npm run install:all
```

### 2. Configure Environment

#### Frontend (.env)
```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:
```bash
VITE_API_URL=http://localhost:4003
VITE_GENERATOR_URL=https://your-generator.com
VITE_PRO_URL=https://your-generator.com/pro
```

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```bash
PORT=4003
NODE_ENV=development

# LLM Configuration (EPIC 4)
LLM_ENABLED=false  # Set to true to enable LLM
LLM_ENDPOINT=http://localhost:11434
LLM_MODEL=llama2
```

### 3. Run Development Servers

From the root directory:

```bash
# Starts both frontend (port 4002) and backend (port 4003)
npm run dev
```

Or run separately:

```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend
cd backend
npm run dev
```

### 4. Open in Browser

Navigate to: http://localhost:4002

You should see the visual novel interface with the character guide.

## Testing the Backend

Test the dialogue endpoint:

```bash
curl http://localhost:4003/api/dialogue/test
```

Expected response:
```json
{
  "status": "success",
  "test": {...},
  "response": {
    "text": "Welcome. I'm your guide...",
    "choices": [...],
    "usedLLM": false
  }
}
```

## Enabling LLM (EPIC 4)

### Option 1: Ollama (Recommended for local)

1. Install Ollama: https://ollama.ai/
2. Pull a model:
```bash
ollama pull llama2
```

3. Verify Ollama is running:
```bash
curl http://localhost:11434/api/tags
```

4. Update `backend/.env`:
```bash
LLM_ENABLED=true
LLM_ENDPOINT=http://localhost:11434
LLM_MODEL=llama2
```

5. Restart backend server

### Option 2: OpenAI API

1. Get API key from OpenAI
2. Update `backend/.env`:
```bash
LLM_ENABLED=true
OPENAI_API_KEY=your_key_here
```

3. Modify `backend/src/services/llm.ts` to use OpenAI SDK

## Project Structure

```
visual-novel/
├── frontend/              # React + Vite frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── engine/        # Game state management
│   │   ├── data/          # Scene definitions
│   │   └── App.tsx        # Main app
│   └── package.json
│
├── backend/               # Express backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # LLM service
│   │   └── server.ts      # Main server
│   └── package.json
│
└── shared/                # Shared TypeScript types
    └── types.ts
```

## Development Workflow

### Making Changes

1. **Add new scenes**: Edit `frontend/src/data/scenes.ts`
2. **Modify UI**: Edit components in `frontend/src/components/`
3. **Change LLM behavior**: Edit `backend/src/services/llm.ts`
4. **Update types**: Edit `shared/types.ts`

### Building for Production

```bash
# Build frontend
cd frontend
npm run build

# Build backend
cd backend
npm run build
```

### Deployment

**Frontend**: Deploy `frontend/dist` to any static host (Vercel, Netlify, etc.)

**Backend**: Deploy backend to Node.js server (Railway, Render, etc.)

Update `frontend/.env` to point to your deployed backend URL.

## Troubleshooting

### Port already in use

```bash
# Kill process on port 4002 (frontend)
npx kill-port 4002

# Kill process on port 4003 (backend)
npx kill-port 4003
```

### TypeScript errors about shared types

```bash
# Rebuild TypeScript references
cd frontend && npm run build
cd backend && npm run build
```

### LLM not responding

1. Check Ollama is running: `ollama list`
2. Verify endpoint in `.env`: `http://localhost:11434`
3. Check backend logs for errors
4. Test API directly: `curl http://localhost:11434/api/generate -d '{"model":"llama2","prompt":"test"}'`

### Canvas not rendering

- Check browser console for errors
- Verify React DevTools shows GameCanvas component
- Try disabling browser extensions
- Check if Canvas API is supported

## Next Steps

### Implementing Remaining EPICs

**EPIC 5 - Visual Layer**:
- Add character sprite PNGs to `frontend/public/sprites/`
- Add background images to `frontend/public/backgrounds/`
- Update `GameCanvas.tsx` to load real images

**EPIC 6 - Generator Tease**:
- Create demo generator component
- Add image generation preview
- Implement free tier limitations

**EPIC 7 - Monetization**:
- Create PRO comparison modal
- Add pricing info
- Integrate payment/checkout

**EPIC 8 - Polish**:
- Add typewriter text effect
- Implement fade transitions
- Add character sprite animations
- Improve error handling

## Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Express Documentation](https://expressjs.com/)
- [Ollama Documentation](https://ollama.ai/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Support

For issues or questions:
1. Check the console logs (browser + backend)
2. Review this SETUP.md
3. Check the main README.md for architecture details
