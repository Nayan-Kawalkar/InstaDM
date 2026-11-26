# Instagram Reel Comment → DM Bot (free, with follow-gate)

Someone comments a keyword (e.g. "LINK") on your reel →
1. the bot replies "Sent you a DM! 📩" under their comment,
2. DMs them a message with a button ("Send me the link"),
3. when they tap it, the bot checks **whether they follow you**:
   - **following** → sends the resource,
   - **not following** → "Please follow me first" + an **"I followed ✅"** button; tapping it re-checks, and once they follow, the resource is sent.

Typing the keyword straight into your DMs triggers the same flow.

> **Why a button first?** Instagram only lets apps check "does this person follow me?" after the person interacts with the DM. That's why ManyChat and the like all use this button step.

Runs on Vercel's free Hobby plan + Meta's free Instagram API. Costs ₹0.

```
insta-comment-bot/
├─ api/webhook.js       ← Vercel endpoint Meta calls (verification + signature check)
├─ lib/bot.js           ← the flow: comment → opener → follow check → resource
├─ lib/instagram.js     ← Instagram Graph API calls
├─ config.js            ← ✏️ YOUR keywords, messages and resources
└─ scripts/test-local.mjs  ← `npm test` simulates the whole flow offline
```

---

## Step 1 — Switch to a Professional account
Instagram app → Settings → Account type and tools → **Switch to professional account** → choose **Creator** (free, reversible).

Then: Settings → Messages and story replies → Message controls → **Connected tools → Allow access to messages = ON**.

## Step 2 — Put the code on GitHub and deploy to Vercel
1. Create a new GitHub repo and upload this folder (`.env` is git-ignored — never upload it).
2. Go to vercel.com → sign in with GitHub → **Add New → Project** → import the repo → Deploy.
3. Your webhook URL will be: `https://YOUR-PROJECT.vercel.app/api/webhook`

## Step 3 — Create a Meta app
1. Go to developers.facebook.com → **My Apps → Create App**.
2. Use case: **"Manage messaging & content on Instagram"** → create.
3. **Use cases → Customize → API setup with Unified login** (older dashboards call it "API setup with Instagram login"). **Not** "API setup with Facebook login".
4. If it says *"Business portfolio selection is mandatory"* → **+ Business portfolio** → create one (free; your name/handle is fine) → confirm the email Meta sends → select it.
5. Make sure these permissions are added: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`.
6. **Generate access tokens → Add account** → log in with Instagram and allow everything → **Generate token**. Copy it (`IG_ACCESS_TOKEN`) and the number next to your username (`IG_USER_ID`).
7. **App secret** (`APP_SECRET`): look for **Instagram app secret → Show** on the API setup page. If your dashboard has none, use **App settings → Basic → App secret → Show**. Unsure which one signs webhooks? Put both, comma-separated — the bot accepts either.

## Step 4 — Add environment variables in Vercel
Vercel → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `VERIFY_TOKEN` | any random text (one is already generated in your local `.env`) |
| `APP_SECRET` | from Step 3.7 — or both secrets comma-separated: `instaSecret,facebookSecret` |
| `IG_ACCESS_TOKEN` | from Step 3.6 |
| `IG_USER_ID` | from Step 3.6 |

Then **Deployments → ⋯ → Redeploy** so the variables take effect.
The bot rejects every webhook until `APP_SECRET` is set (so nobody can fake requests).

## Step 5 — Connect the webhook
Back in Meta → the same API setup page → **Configure webhooks**:
- Callback URL: `https://YOUR-PROJECT.vercel.app/api/webhook`
- Verify token: same as your `VERIFY_TOKEN`
- Click **Verify and save**
- Subscribe to these webhook fields:
  - **`comments`** — new comments on your reels
  - **`messages`** — people typing the keyword in DMs
  - **`messaging_postbacks`** — button taps ("Send me the link", "I followed ✅")

## Step 6 — Turn the app Live
Top of the Meta app dashboard → switch **App Mode: Development → Live** (you'll need a privacy policy URL; a public Google Doc or Notion page works).

> In Development mode, only accounts with a role on your app (you + testers) trigger webhooks — handy for testing with a second account added as an Instagram Tester.

## Step 7 — Set your keywords, messages and resources
Edit `config.js`, commit to GitHub → Vercel auto-redeploys. Each rule:

```js
{
  id: "link",                         // unique short name
  keywords: ["link", "guide"],
  publicReply: "Sent you a DM! 📩",   // optional
  opener: { text: "Hey {username}! Tap below and I'll send it.", button: "Send me the link" },
  requireFollow: true,                // false = skip the follow check
  followPrompt: { text: "Please follow me first, then tap below 🙌", button: "I followed ✅" },
  resource: "Here you go 🎉 https://...",
  mediaIds: ["..."],                  // optional: only for specific reels
}
```
Button titles: max 20 characters. Texts: max 640 characters.

## Test it
- **Offline:** `npm test` simulates comments, button taps, followers and non-followers with Instagram mocked.
- **For real:** from a second account, comment "link" on a reel → tap the button → you should get the follow prompt → follow → tap "I followed ✅" → resource arrives. Watch Vercel → your project → **Logs**.

---

## Things to know
- **One private-reply DM per comment**, within 7 days (the bot sends it instantly).
- After the person taps a button or messages you, the bot has 24 hours to message them — that's what the follow prompt / resource use.
- The follow check uses Instagram's `is_user_follow_business` field. If that check ever errors, `sendResourceIfFollowCheckFails` in `config.js` decides whether to still send the resource (default: yes).
- If Instagram rejects the button for some reason, the bot falls back to a text DM asking them to reply with the keyword — which triggers the same flow.
- **Token expires every 60 days.** Refresh it by opening this in your browser (replace the token), then update `IG_ACCESS_TOKEN` in Vercel and redeploy:
  `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=YOUR_TOKEN`
  Set a calendar reminder for every ~50 days.
- The bot ignores your own comments, replies-to-comments and its own messages, so it won't loop. DMs that don't contain a keyword are left alone for you to answer.
- Don't make DMs spammy — Instagram can restrict accounts that send lots of identical messages.

## Troubleshooting
- **"Verify and save" fails** → `VERIFY_TOKEN` doesn't match, or you didn't redeploy after adding env vars.
- **"Invalid signature" in logs** → wrong `APP_SECRET` (use the *Instagram* app secret) or not redeployed.
- **No logs when someone comments** → `comments` field not subscribed, or app still in Development mode and the commenter isn't a tester.
- **Opener DM arrives but tapping the button does nothing** → subscribe to `messaging_postbacks`.
- **Everyone gets the follow prompt even when following** → check the logs for `follows=`; if it says `null`, the profile lookup is failing (see the error logged next to it).
- **"FAILED" in logs** → read the error; usually an expired token or a missing `instagram_business_manage_messages` / `instagram_business_manage_comments` permission (re-generate the token, allow everything).
