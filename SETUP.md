# NexChat — Supabase Setup Guide

> **Zero installation required on your PC.** Supabase runs in the cloud; all SDKs load from CDN.

---

## Step 1 — Create a free Supabase project (2 minutes)

1. Go to **[supabase.com](https://supabase.com)** and sign up / log in.
2. Click **"New Project"**.
3. Choose an organization, name it `NexChat`, set a secure database password, and choose a region close to you.
4. Keep the free plan selected (unlimited free projects, no credit card required) and click **"Create new project"**.

---

## Step 2 — Run the SQL setup schema

Once your project is created (takes about 1 minute to provision):
1. In the Supabase sidebar, click on **"SQL Editor"** (the `>_` icon).
2. Click **"New Query"**.
3. Open the file [setup.sql](file:///C:/Users/Kshitiz%20Saxena/OneDrive/Documents/Chat/setup.sql) in this directory and copy all of its contents.
4. Paste the SQL query into the Supabase editor and click **"Run"** (bottom right).
   * This creates all the required tables (`profiles`, `channels`, `dms`, `messages`), seeds default channels, handles automatic profile creation, configures Row Level Security (RLS) policies, and enables real-time updates!

---

## Step 3 — Get your project credentials

1. In the Supabase sidebar, click the **Gear Icon ⚙️** (Project Settings) -> **API**.
2. Scroll to the **"Project API keys"** section.
3. Copy the following keys:
   * **Project URL** (under "Project URL")
   * **`anon` `public`** key (under "Project API keys")

---

## Step 4 — Paste config into the app

Open [supabase-config.js](file:///C:/Users/Kshitiz%20Saxena/OneDrive/Documents/Chat/supabase-config.js) and replace the placeholder values:

```js
const SUPABASE_URL      = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key...';
```

---

## Step 5 — Run the app

**Double-click `start.bat`** — this starts a local web server using Python (already on Windows).

Then open your browser and go to:
```
http://localhost:8080
```

---

## Multiple Users & testing

To test with multiple users, open the app in:
- **Different browser windows** (each can be a different user)
- **Incognito/private mode** (acts as a separate user)
- **Different devices on the same WiFi** — just open `http://YOUR_PC_IP:8080`
  - Find your IP: open Command Prompt -> type `ipconfig` -> look for IPv4 address
