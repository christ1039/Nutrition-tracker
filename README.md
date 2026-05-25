# Destiny Fuel

A simple, premium nutrition accountability dashboard for **Destiny Fitness** members. Built as a single-page web app to be embedded inside Whop.com/DestinyFitness.

> Soft rose. Warm gold. Apple-level simplicity. Everything you need to fuel your destiny — nothing you don't.

---

## What Destiny Fuel does

Destiny Fuel helps members of Destiny Fitness:

- Set personal nutrition goals (calories, protein, carbs, fats, water, meals/day)
- Log every meal with macros, notes, and quality tags
- Track water intake by the cup
- See their **Destiny Score** (out of 100) update in real time
- Get a dynamic **Today's Focus** message that adapts to their day
- Review the **last 7 days** with averages, streaks, and a clean bar chart
- Adjust their profile, photo, and goals at any time

No accounts. No logins. No backend. All data stays on the member's own browser via `localStorage`.

---

## Project structure

```
destiny-fuel/
├── index.html      # The full page markup (onboarding, dashboard, log, progress, settings)
├── styles.css      # Brand system — rose, gold, blush, gradients, cards, animations
├── script.js       # All app logic — storage, validation, score, focus, weekly summary
├── README.md       # You're reading it
└── assets/
    └── destiny-fitness-logo.png
```

To run locally, **just open `index.html` in a browser**. That's it. No build step, no install.

---

## Deploy to Cloudflare Pages (via GitHub)

### 1. Push the project to GitHub

```bash
cd destiny-fuel
git init
git add .
git commit -m "Initial commit — Destiny Fuel v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/destiny-fuel.git
git push -u origin main
```

### 2. Connect the repo to Cloudflare Pages

1. Go to **Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git**.
2. Authorize Cloudflare to access your GitHub account.
3. Select the `destiny-fuel` repository.
4. **Build settings:**
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/` *(the project root)*
5. Click **Save and Deploy**.

In ~30 seconds you'll get a URL like:

```
https://destiny-fuel.pages.dev
```

Every push to `main` will redeploy automatically.

### 3. (Optional) Add a custom domain

In the Pages project: **Custom domains → Set up a custom domain** (e.g. `fuel.destinyfitness.com`).

---

## Embed Destiny Fuel into Whop

1. Open your Whop dashboard at **whop.com/dashboard**.
2. Go to **Apps → Add app → Website Embed** (or whichever Whop calls their embed-a-URL app — it may be labeled "Custom App" or "iFrame App").
3. Paste your Cloudflare Pages URL: `https://destiny-fuel.pages.dev`
4. Save. Members visiting your Whop hub will now see Destiny Fuel inside the page.

**Tip:** the app is designed mobile-first with a max width of ~480px, so it looks and feels great in Whop's embed frame on any device.

---

## How the Destiny Score works

The Destiny Score is a daily 0–100 number summarizing how well a member is on track with their nutrition for the day.

| Section        | Max points | How it's earned                                                                                             |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| Calories       | 25         | Full 25 if calories are **80–110%** of target. Partial points below 80% (linear) or above 110% (tapered).   |
| Protein        | 25         | Scaled by **protein eaten / protein target**. Capped at 25.                                                 |
| Water          | 20         | Scaled by **cups consumed / water target**. Capped at 20.                                                   |
| Meals logged   | 15         | Scaled by **meals logged / preferred meals**. Capped at 15.                                                 |
| Macro balance  | 15         | Average progress across protein, carbs, fats vs. their targets. Capped at 15.                               |

The final score is clamped between 0 and 100.

**Coaching messages by score:**
- **90–100** — *"You're locked in today."*
- **75–89**  — *"Strong day. Keep the momentum going."*
- **50–74**  — *"You're building consistency. Focus on the next meal."*
- **Below 50** — *"Start simple. Log your next meal and get back on track."*

---

## What's stored in localStorage

Everything is saved under the single key `destinyFuelData`:

```js
{
  profile: {
    name:           "",   // member's name
    photo:          "",   // base64 data URL, or empty
    currentWeight:  "",   // lbs
    goalWeight:     "",   // lbs
    goalType:       "",   // Fat Loss | Muscle Gain | Maintenance | Lifestyle Balance
    calorieTarget:  "",
    proteinTarget:  "",   // grams
    carbTarget:     "",   // grams
    fatTarget:      "",   // grams
    waterTarget:    "",   // cups
    mealsTarget:    ""    // meals / day
  },
  dailyLogs: {
    "2026-05-24": {
      meals: [
        {
          id:       "m_...",
          type:     "Breakfast",
          name:     "Oats & berries",
          calories: 340,
          protein:  18,
          carbs:    52,
          fats:     7,
          notes:    "Optional",
          tags:     ["Balanced", "High Protein"]
        }
      ],
      water: 4
    }
  }
}
```

A new day automatically starts blank. Previous days are kept so the **Progress** tab can summarize the last 7 days.

---

## v1 Limitations

- Data is stored **only on the user's current browser and device**.
- Data **does not sync across devices** yet.
- **Clearing browser storage erases saved data.**
- **No backend or Whop identity sync** is included in this version.
- **No food database** is included — all nutrition values are entered manually.
- No barcode scanner.

These are intentional v1 simplifications so the app stays small, fast, and easy to maintain.

---

## Future upgrade ideas

- Whop member identity sync (use Whop's user ID as the data key)
- A backend database (Cloudflare D1, Supabase, etc.) for cross-device saving
- Coach / admin dashboard for the Destiny Fitness team
- Favorite meals & meal templates
- Built-in food database
- Barcode scanning
- AI meal-photo analysis
- Export weekly progress to CSV
- Coach review dashboard with notes per member

---

## License

© Destiny Fitness. Built for Destiny Fitness members.
