// ============================================================
//  FALLBACK RULES. Use the dashboard (your Vercel URL) instead.
//  These are only used while Upstash Redis storage is NOT connected.
//  Once storage is connected, the dashboard's automations replace these.
// ============================================================
//
// HOW A RULE WORKS
//  1. Someone comments a keyword on your reel (case-insensitive).
//  2. Bot replies publicly under the comment (`publicReply`, optional).
//  3. Bot DMs them `opener.text` with a button (`opener.button`).
//  4. They tap the button →
//       - if `requireFollow` is true and they DON'T follow you:
//           bot sends `followPrompt.text` with an "I followed" button.
//           Tapping it re-checks; once they follow → step 5.
//       - otherwise → step 5.
//  5. Bot DMs them the `resource`.
//
// Sending the keyword as a normal DM (e.g. "link") also works — it
// jumps straight to step 4.
//
// Why the button? Instagram only lets the bot check "does this person
// follow me?" after they interact with the DM. Every big DM tool
// (ManyChat etc.) works this way.
//
// Placeholders you can use in any text: {username}
// Limits: button titles ≤ 20 characters, texts ≤ 640 characters.
//
// `id`        unique short name, letters/numbers/_ only (used internally)
// `mediaIds`  optional — limit the rule to specific reels. Leave it out
//             to apply to ALL your posts/reels. The media ID of every
//             comment is printed in the Vercel logs.

export const rules = [
  {
    id: "link",
    keywords: ["link", "guide"],
    publicReply: "Sent you a DM! 📩",
    opener: {
      text: "Hey {username}! 👋 Thanks for commenting. Tap below and I'll send you the link.",
      button: "Send me the link",
    },
    requireFollow: true,
    followPrompt: {
      text: "Almost there! 🙌 This is only for my followers — please follow my account, then tap the button below.",
      button: "I followed ✅",
    },
    resource: "Here you go 🎉 https://example.com",
    // mediaIds: ["17900000000000000"],
  },
  {
    id: "price",
    keywords: ["price", "cost"],
    publicReply: "Check your DMs 🙌",
    opener: {
      text: "Hi {username}! Tap below for the full pricing details.",
      button: "Show pricing",
    },
    requireFollow: false,
    resource: "Here are all the pricing details: https://example.com/pricing",
  },
];

// Set to true to DM *every* commenter, even if no keyword matches.
// The first matching rule (respecting mediaIds) is used.
export const replyToAllComments = false;

// If Instagram's "does this person follow me?" check itself errors out
// (rare API hiccup), should the bot still send the resource?
//   true  = yes, send it anyway (nobody gets stuck)
//   false = no, ask them to follow and try again
export const sendResourceIfFollowCheckFails = true;
