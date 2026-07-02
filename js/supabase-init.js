// ============================================================
//  supabase-init.js — Initialize the Supabase client
//  Must load AFTER supabase CDN script + supabase-config.js
// ============================================================

(function () {
  try {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
      throw new Error('not-configured');
    }

    window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession:   true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    });

    console.log('[NexChat] Supabase initialized ✓');
  } catch (e) {
    console.error('[NexChat] Supabase init error:', e);

    const isConfig = e.message === 'not-configured';
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  background:#090A12;color:#F0F2FF;font-family:Inter,sans-serif;
                  text-align:center;padding:24px;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;">${isConfig ? '⚙️' : '⚠️'}</div>
          <h2 style="margin-bottom:10px;">
            ${isConfig ? 'Supabase Not Configured' : 'Initialization Error'}
          </h2>
          <p style="color:#8890B5;max-width:440px;line-height:1.8;">
            ${isConfig
              ? 'Please open <strong>supabase-config.js</strong> and paste your Supabase project URL and anon key.<br/>See <strong>SETUP.md</strong> for step-by-step instructions.'
              : 'Check the browser console for details. Make sure your supabase-config.js values are correct.'}
          </p>
          <a href="SETUP.md" style="display:inline-block;margin-top:20px;padding:10px 22px;
             background:linear-gradient(135deg,#6366F1,#8B5CF6);color:white;border-radius:10px;
             text-decoration:none;font-weight:600;">View Setup Guide</a>
        </div>
      </div>`;
  }
})();
