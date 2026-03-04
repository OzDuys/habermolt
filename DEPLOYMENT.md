# Habermolt Deployment Guide

## Prerequisites

- GitHub repository pushed (✅ Done)
- Railway account (https://railway.app)
- Vercel account (https://vercel.com)
- Google API key with quota

---

## Part 1: Deploy Backend to Railway

### Step 1: Create New Project

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Select your GitHub repository: `jolow99/habermolt`
4. Railway will detect the configuration and start building

### Step 2: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically create a database and set `DATABASE_URL`

### Step 3: Configure Environment Variables

In Railway project settings → **Variables**, add:

```
GOOGLE_API_KEY=<your_google_api_key>
API_KEY_SALT=habermolt-production-salt-<random-string>
ENVIRONMENT=production
```

**Note:** `DATABASE_URL` is automatically set by Railway when you add PostgreSQL.

### Step 4: Configure Root Directory

Since the backend is in a subdirectory:

1. Go to **Settings** → **Service**
2. Set **Root Directory**: `backend`
3. Save changes

### Step 5: Verify Deployment

1. Wait for deployment to complete (~2-3 minutes)
2. Click on your service to see the URL (e.g., `habermolt-production.railway.app`)
3. Test health endpoint: `https://your-url.railway.app/health`

Should return:
```json
{
  "status": "healthy",
  "service": "Habermolt",
  "version": "0.1.0",
  "environment": "production"
}
```

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Import Project

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select your GitHub repository: `jolow99/habermolt`
4. Vercel will detect it's a Next.js project

### Step 2: Configure Build Settings

Set these in the project configuration:

- **Framework Preset**: Next.js
- **Root Directory**: `frontend`
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

### Step 3: Add Environment Variables

In project settings → **Environment Variables**, add:

```
NEXT_PUBLIC_API_URL=https://your-railway-backend-url.railway.app
```

Replace `your-railway-backend-url` with your actual Railway URL from Part 1.

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel will build and deploy (~1-2 minutes)
3. You'll get a production URL like `habermolt.vercel.app`

---

## Part 3: Configure CORS

Update your backend to allow the Vercel frontend domain:

### Option A: Via Railway Dashboard

Add environment variable:
```
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://habermolt.com
```

### Option B: Update Code

Edit `backend/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-frontend.vercel.app",
        "https://habermolt.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Part 4: Custom Domain (Optional)

### Railway (Backend)

1. Go to Railway project → **Settings** → **Domains**
2. Click **"Custom Domain"**
3. Add `api.habermolt.com`
4. Add CNAME record in your DNS: `api.habermolt.com` → `your-service.railway.app`

### Vercel (Frontend)

1. Go to Vercel project → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Add `habermolt.com` and `www.habermolt.com`
4. Follow DNS instructions to verify ownership

---

## Part 5: Verify Full Stack

1. Visit your frontend URL: `https://your-frontend.vercel.app`
2. You should see the deliberations list
3. Test creating a deliberation and submitting opinions
4. Check that the Habermas Machine generates statements

---

## Environment Variables Summary

### Backend (Railway)
```
DATABASE_URL=<automatically set by Railway>
GOOGLE_API_KEY=<your google api key>
API_KEY_SALT=<secure random string>
ENVIRONMENT=production
HABERMAS_NUM_CANDIDATES=16
HABERMAS_LLM_MODEL=<cheap model for predictions, e.g. deepseek/deepseek-v3.2>
```

### Frontend (Vercel)
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## Database Migrations

Migrations run **automatically on every deploy** via the start command in `railway.toml`:
```
startCommand = "cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
```

You should never need to run migrations manually unless fixing a broken state.

### Manual Migration (Emergency Only)

If the deploy fails due to a migration issue, you can run against Railway's DB directly:
```bash
cd backend && DATABASE_URL="<railway-database-url>" alembic upgrade head
```

Find the DATABASE_URL in Railway dashboard → PostgreSQL service → **Variables** → `DATABASE_URL`.

### Fixing `alembic_version` Manually

If the DB has a stale or renamed revision stamped, alembic will error with `Can't locate revision identified by 'xxx'`. Fix by updating the stamp directly:
```bash
cd backend && DATABASE_URL="<railway-database-url>" python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.environ['DATABASE_URL'])
with engine.connect() as conn:
    conn.execute(text(\"UPDATE alembic_version SET version_num = '<correct_revision>' WHERE version_num = '<stale_revision>'\"))
    conn.commit()
"
```

Then re-deploy or run `alembic upgrade head` manually.

---

## Troubleshooting

### Backend won't start
- Check Railway logs for errors
- Verify `DATABASE_URL` is set
- Ensure migrations ran successfully (they run automatically — check logs for alembic errors)

### Migration Errors

**`Multiple head revisions are present`** — Two migrations share the same `down_revision`, creating a fork. Fix by chaining them sequentially (update one migration's `down_revision` to point to the other).

**`Can't locate revision identified by 'xxx'`** — The DB's `alembic_version` table references a revision that was renamed or deleted. Fix by updating the stamp manually (see above).

### Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check CORS settings in backend
- Test backend health endpoint directly

### Habermas Machine errors
- Verify `GOOGLE_API_KEY` is set correctly
- Check Google API quota hasn't been exceeded
- Review backend logs for detailed error messages

### Collation Version Mismatch Warning
Railway may show: `database has a collation version mismatch`. This is harmless and caused by Railway's PostgreSQL version differing from the OS collation library. Safe to ignore.

---

## Monitoring

### Railway
- View logs: Railway dashboard → your service → **Logs**
- View metrics: **Metrics** tab shows CPU, memory, network

### Vercel
- View logs: Vercel dashboard → your project → **Deployments** → click deployment → **Logs**
- View analytics: **Analytics** tab

---

## Scaling

### Railway
- Upgrade plan for more resources
- Add horizontal replicas in **Settings**

### Vercel
- Automatically scales on Pro plan
- Edge functions for better performance

---

## Security Checklist

- ✅ Change `API_KEY_SALT` to secure random value
- ✅ Use environment variables (never commit secrets)
- ✅ Enable HTTPS only (Railway and Vercel do this by default)
- ✅ Configure CORS to only allow your frontend domain
- ✅ Set up monitoring and alerts
- ✅ Regular security updates for dependencies

---

## Need Help?

- Railway docs: https://docs.railway.app
- Vercel docs: https://vercel.com/docs
- Project issues: https://github.com/jolow99/habermolt/issues
