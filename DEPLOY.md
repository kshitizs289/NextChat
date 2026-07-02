# NexChat — Deployment Guide

Since NexChat is a static frontend that connects directly to Supabase, you can host it publicly for **100% free** without installing anything on your PC.

Here are the two easiest ways to do it:

---

## Method 1 — Netlify Drop (Easiest, 30 seconds)

This requires **zero installation** and no command line. You literally drag and drop your folder.

1. Open your browser and go to **[app.netlify.com/drop](https://app.netlify.com/drop)**.
2. Drag your **`Chat`** folder from your Windows File Explorer and drop it onto the big box on the webpage.
3. Wait 10 seconds for it to upload.
4. **Done!** Netlify will give you a public URL (like `https://slanted-ice-12345.netlify.app`) that you can share with anyone immediately.
5. *(Optional)* Sign up for a free Netlify account on that page so your site doesn't expire and you can customize the domain name (e.g., change it to `mychat.netlify.app`).

---

## Method 2 — GitHub Pages (Recommended for long-term)

If you want to save your code online and update it easily:

1. Go to **[github.com](https://github.com)** and log in (or create a free account).
2. Click **"New"** (green button) to create a new repository.
3. Name it `nexchat`, keep it **Public**, and click **"Create repository"**.
4. Click the link that says **"uploading an existing file"**.
5. Drag all the files and folders *inside* your `Chat` folder (e.g., `index.html`, `chat.html`, `css/`, `js/`, `supabase-config.js`) into the upload box.
6. Scroll down and click **"Commit changes"** (this saves the files online).
7. Go to **Settings** (tab at the top of the repository) -> **Pages** (on the left menu).
8. Under **Build and deployment -> Branch**, click the dropdown (currently "None"), change it to **`main`** (or `master`), select `/ (root)`, and click **Save**.
9. Wait about 1 minute, refresh the page, and you will see your public link at the top:
   `https://yourusername.github.io/nexchat/`

---

## ⚠️ Important: Update your Supabase Auth Redirect

Once you have your public URL (from Netlify or GitHub), you need to register it in Supabase so users get redirected back to the right place after logging in or signing up.

1. Go to your **Supabase Dashboard**.
2. Click **Authentication** (user icon on the left) -> **URL Configuration**.
3. Under **Redirect URLs**, click **"Add URL"**.
4. Paste your new public URL (e.g., `https://slanted-ice-12345.netlify.app/chat.html` or `https://yourusername.github.io/nexchat/chat.html`).
5. Click **Save**.
