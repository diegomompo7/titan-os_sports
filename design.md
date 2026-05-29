# TitanOS Sports — Design Document

## 1. App Overview

**TitanOS Sports** is a TV channel guide and media player for Titan OS smart televisions. It displays a grid of sports channels, allows users to play live streams, and provides a full sports event schedule.

**Platform:** Smart TV (16:9 screens, 32"–75", resolutions 1366×768 to 3840×2160)  
**Input:** Remote D-pad (↑↓←→ + OK + Back), mouse/touch optional  
**Audience:** Sports fans watching live sports on TV  
**Visual feeling:** Dark, cinematic, high-contrast. Deep navy/black backgrounds, cyan accent (#00bfff), red for live events. Premium broadcast aesthetic — like a professional sports TV guide.

---

## 2. Design Tokens

### Colors
```
Background base:      #0d0f14   (darkest — main screen background)
Background surface:   #161b25   (cards, sidebars, modals)
Background elevated:  #1e2535   (dropdowns, popovers, active states)
Background overlay:   rgba(13,15,20,0.85) (dimmed overlays)

Accent (cyan):        #00bfff   (focus rings, active states, links, badges)
Accent dim:           rgba(0,191,255,0.12) (subtle accent backgrounds)

Text primary:         #e8eaf0   (main content text)
Text secondary:       #b0b8cc   (supporting text)
Text muted:           #7b8496   (placeholders, labels, hints)

Live red:             #ff4444   (LIVE badge, live indicator pulse)
Danger:               #ef4444   (delete buttons, error states)
Favorite gold:        #f5a623   (star/favorite icon)
Recent purple:        #a78bfa   (recent history icon)

Border default:       rgba(255,255,255,0.08)
Border accent:        rgba(0,191,255,0.45)
Border live:          rgba(255,68,68,0.3)

Focus ring:           0 0 0 3px rgba(0,191,255,0.35)
Card shadow:          0 4px 20px rgba(0,0,0,0.5)
```

### Typography
```
Font family:     system-ui, -apple-system, "Segoe UI", sans-serif
Base font size:  1.3vw  (scales with screen width)
  — 1366px screen → ~17.8px
  — 1920px screen → ~25px
  — 3840px screen → ~50px

Weights used:
  400 — body text, descriptions
  600 — channel names, labels
  700 — filter chips, badges, button labels
  800 — initials/large display text
```

### Spacing Scale (rem — scales with base font)
```
--space-1: 0.35rem   (~6px)   micro gaps
--space-2: 0.7rem    (~12px)  compact padding
--space-3: 1rem      (~18px)  standard card padding
--space-4: 1.4rem    (~25px)  section gaps
--space-5: 1.8rem    (~32px)  large gaps
--space-6: 2.2rem    (~40px)  section headers
--space-8: 3rem      (~54px)  modal padding
```

### Border Radius
```
--radius-sm:   0.45rem  (inputs, small badges)
--radius-md:   0.7rem   (cards, panels, modals)
--radius-lg:   1.1rem   (large modals, overlays)
--radius-pill: 999px    (filter chips, tags)
```

### Shadows & Effects
```
Card shadow:    0 4px 20px rgba(0,0,0,0.5)
Focus ring:     0 0 0 3px rgba(0,191,255,0.35), 0 0 12px rgba(0,191,255,0.25)
Modal shadow:   0 20px 60px rgba(0,0,0,0.7)
Elevated:       0 8px 32px rgba(0,0,0,0.6), [focus ring]
```

---

## 3. Layout — Screen Structure

### Fixed Elements
```
┌─────────────────────────────────────────────────────┐
│  HEADER  (height: 10vh, background: #161b25)        │
│  [⚡ TitanOS Sports]  [Teatro] [Multi]  [⚙ Admin]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│                MAIN CONTENT AREA                    │
│                   (90vh)                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Header
- Left: Logo (⚡ lightning bolt icon, orange) + app name "TitanOS Sports" in cyan
- Center: Mode buttons — "🎬 Teatro" / "⊞ Multi" (pill buttons, border style)
- Right: "⚙" settings/admin icon button
- Background: `#161b25`, bottom border: `rgba(255,255,255,0.08)`

---

## 4. Mode Layouts

### Mode 1: Normal (default)
```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (10vh)                                                │
├──────────────────────────────────────────────────────────────┤
│ FILTER BAR (8.5vh) [🔍 Search...] [All][● LIVE][⭐][🕑][⚽] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Card] [Card] [Card] [Card]   ← 4-column grid (flex: 2)    │
│  [Card] [Card] [Card] [Card]     padding: 1.5vw             │
│  [Card] [Card] [Card] [Card]     gap: 1.2vw                 │
│                                  overflow-y: auto           │
├──────────────────────────────────────────────────────────────┤
│  PROMO SECTION (flex: 1)                                     │
│  [Channel Preview] [Video Ad placeholder] [Banner]          │
│   1fr               1.5fr                  1fr              │
└──────────────────────────────────────────────────────────────┘
```

### Mode 2: Teatro (Theatre)
```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (10vh)                                                │
├────────────┬─────────────────────────────────────────────────┤
│  SIDEBAR   │                                                 │
│  (22vw)    │         VIDEO PLAYER                           │
│            │         (full remaining width)                 │
│  Single-   │         16:9 aspect ratio                      │
│  column    │         [Channel name bar on top]              │
│  channel   │         [VideoPlayer component]                │
│  list      │                                                 │
│  No filter │                                                 │
│  chips     │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

### Mode 3: Multi-stream
```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (10vh)                                                │
├────────────┬─────────────────────────────────────────────────┤
│  SIDEBAR   │                                                 │
│  (22vw)    │     MULTI-STREAM VIEW                          │
│            │                                                 │
│  Channel   │  Grid sub-mode: equal-size video grid          │
│  list to   │  [Vid1] [Vid2]                                 │
│  add to    │  [Vid3] [Vid4]                                 │
│  streams   │                                                 │
│            │  Pro sub-mode:                                 │
│            │  [Large video (70%)] [Small1]                  │
│            │                      [Small2]                  │
│            │                      [Small3]                  │
└────────────┴─────────────────────────────────────────────────┘
```

---

## 5. Components

### 5.1 Channel Card
**Size:** fills 1 grid column (~25% of content width)  
**Background:** `#161b25`  
**Border:** 1px solid `rgba(255,255,255,0.08)`, radius `0.7rem`  
**Padding:** `1rem`  

**Layout (vertical stack):**
```
┌─────────────────────────────────┐
│ [Logo 3.5rem×3.5rem] Channel    │  ← Header row
│                      Name       │
│                      [● LIVE]   │
│                      [⚽ Sport] │
│                      [HLS]      │
│─────────────────────────────────│
│ 📅 Real Madrid vs Barça in 2h   │  ← Next event row (if any)
│─────────────────────────────────│
│ [✏️ Edit] [🗑️ Delete] [⭐]      │  ← Admin/fav row (optional)
└─────────────────────────────────┘
```

**Channel Logo:**
- 3.5rem × 3.5rem square, border-radius `0.45rem`
- Fallback: initials block with `--color-accent` text on `--color-accent-dim` background

**States:**
- Default: subtle border, no glow
- Hover: border `rgba(0,191,255,0.45)`, background tint `rgba(0,191,255,0.04)`
- Focused (D-pad): border cyan `#00bfff` full opacity, `scale(1.03)`, focus ring glow
- Live: border `rgba(255,68,68,0.3)`, red tint
- Compact (sidebar): logo 2.4rem, minimal padding, single line layout

**Badges:**
- `● LIVE`: red pill `#ff4444`, pulsing animation, uppercase
- Sport category: `rgba(255,255,255,0.08)` background, `#7b8496` text, small caps
- Stream type (HLS/Twitch): similar subtle badge

**Next event:**
- One line, small font (0.78rem), muted color
- If text overflows: marquee scroll animation (horizontal loop)

---

### 5.2 Filter Bar
**Height:** `8.5vh`  
**Background:** `#161b25`  
**Bottom border:** `1px solid rgba(255,255,255,0.08)`  
**Padding:** `0 1.5vw`  
**Layout:** horizontal flex row, items centered vertically

**Search field:**
- Width: 16vw (expands to 22vw on focus)
- Height: 5.5vh
- Background: `#0d0f14`, border: 1px solid `rgba(255,255,255,0.08)`
- Border-radius: 999px (pill)
- Left icon: 🔍 (positioned absolutely)
- On focus: border turns cyan `#00bfff`

**Filter chips (pill buttons):**
- Height: 5vh, padding: `0 1.1rem`
- Background: transparent, border: 1px solid `rgba(255,255,255,0.08)`
- Border-radius: 999px
- Text: UPPERCASE, 0.82rem, weight 700, color `#7b8496`
- Variants:
  - Default: as above
  - Active (selected): background `#00bfff`, border `#00bfff`, text `#000`
  - LIVE chip: border `rgba(255,68,68,0.4)`, text `#ff4444`
  - LIVE active: background `#ff4444`, text white
  - Favorites chip: border `rgba(245,166,35,0.4)`, text `#f5a623`
  - Recent chip: border `rgba(167,139,250,0.4)`, text `#a78bfa`

---

### 5.3 Channel Preview (Hover Preview)
**Appears:** when user hovers or D-pad focuses a channel card  
**Position in promo section:** fills the left column completely  
**Background:** `#161b25`  
**Border:** 2px solid `#00bfff`  
**Border-radius:** `0.7rem`  
**Box-shadow:** elevated + focus ring  
**Cursor:** pointer (click = open channel)

**Layout:**
```
┌──────────────────────────────────┐
│                                  │  ← Video area (16:9 ratio)
│   [VideoPlayer or logo placeholder] │
│                                  │
├──────────────────────────────────┤
│ [Logo] Channel Name  Tap to view │  ← Info bar
└──────────────────────────────────┘
                                [✕] ← Close button (absolute top-right)
```

**Video area:**
- 16:9 aspect ratio
- Black background `#000`
- If streaming: real video after 500ms delay
- If not streamable or loading: centered logo (max 60% size, 0.7 opacity) or initials in cyan

**Info bar:**
- `#161b25` background
- Left: small logo (1.6rem) + channel name (0.82rem, weight 700)
- Right: "Tap to view" label (0.7rem, muted)

**Close button:**
- 1.6rem circle, `rgba(0,0,0,0.65)` background, white ✕ (0.65rem)
- Position: absolute, top-right of the card
- On hover: full opacity

**Animation:**
- Enter: slide up from below + fade in (0.22s ease)
- Exit: slide down + fade out

---

### 5.4 Player Modal (Full-screen Player)
**Triggered:** clicking a channel card or the preview  
**Layout:** full-screen overlay

```
┌──────────────────────────────────────────────────────┐
│ TOP BAR: [Channel logo + name] [● LIVE] [Chat][✕]   │
├────────────────────────────────────┬─────────────────┤
│                                    │                 │
│         VIDEO PLAYER               │  SIDE PANEL     │
│         (fills remaining width)    │  (25vw)         │
│                                    │                 │
│                                    │  Twitch: chat   │
│                                    │  YouTube: info  │
│                                    │  Other: logo    │
│                                    │                 │
└────────────────────────────────────┴─────────────────┘
```

**Top bar:**
- Background: `#161b25`, bottom border
- Channel logo (circle, 2.4rem) + name (weight 600) + stream type badge
- Right: "💬 Chat" toggle button (if Twitch) + "✕ Close" button

**Video area:**
- Black background, fills all available height
- Centered placeholder (logo) while loading

**Side panel (25vw):**
- Background: `#0d0f14`
- Twitch channels: embedded Twitch chat iframe
- YouTube channels: next event info
- Others: large channel logo centered

---

### 5.5 Promo Section (below channel grid)
**Height:** `flex: 1` (fills all remaining space to bottom of window)  
**Layout:** 3-column CSS grid — `1fr 1.5fr 1fr`

```
┌────────────────┬────────────────────────┬──────────────┐
│                │                        │              │
│  CHANNEL       │   VIDEO AD             │   BANNER     │
│  PREVIEW       │   placeholder          │   placeholder│
│  (hover panel) │   (red #c0392b)        │   (green)    │
│                │                        │   #1a6e4a    │
│  1fr           │   1.5fr                │   1fr        │
└────────────────┴────────────────────────┴──────────────┘
```

**Column 1 — Channel Preview:**
- Shows `ChannelPreview` component when a channel is hovered/focused
- Empty when no channel is selected

**Column 2 — Video Ad (placeholder):**
- Background: `#c0392b` (red) — placeholder color
- Fills full height of section
- Will contain: video player for advertising content

**Column 3 — Banner (placeholder):**
- Background: `#1a6e4a` (green) — placeholder color
- Same width as one channel card
- Fills full height of section
- Will contain: static or animated banner image

**Gaps:** `1.2vw`  
**Padding:** `1.5vw` (all sides except top: 0)

---

### 5.6 Multi-Stream View
**Fills:** full content area to the right of sidebar

**Grid sub-mode:**
- Equal-size video tiles in a responsive grid (2×2, 3×3, 4×4)
- Each tile: black background, channel name overlay at bottom
- Bottom bar: "Pro view" button + optional Twitch chat selector

**Pro sub-mode:**
```
┌──────────────────────┬────────────┐
│                      │ [Channel2] │
│  MAIN VIDEO          │ [⊞]  [✕] │
│  (large, ~70% width) ├────────────┤
│                      │ [Channel3] │
│  [⊞ Swap with main]  │ [⊞]  [✕] │
│                      ├────────────┤
│                      │ [Channel4] │
└──────────────────────┴────────────┘
```

**Secondary tile buttons:**
- `⊞`: swap this channel with the main view
- `✕`: remove from multi-stream view
- Both: small pill buttons, bottom-right corner of tile

---

### 5.7 Admin Panel (Events)
**Triggered:** settings icon → admin login → events button  
**Type:** full-screen modal overlay

**Sections (tabs or vertical stack):**
1. **Add single event** — channel selector + title + datetime picker
2. **Add weekly event** — channel + title + time + day buttons (L M X J V S D)
3. **Sync YouTube** — per-channel sync button
4. **Event list** — table of future events with delete button

**Day buttons (weekly events):**
- Small square buttons: L M X J V S D
- Inactive: border only
- Active (selected): filled cyan background

---

### 5.8 Base Modal
**Overlay:** `rgba(13,15,20,0.85)` full-screen dim  
**Card:** `#1e2535` background, `1.1rem` radius, `0 20px 60px rgba(0,0,0,0.7)` shadow  
**Header:** title left + `✕` close button right  
**Max width:** varies by content (~600px typical)  
**Animation:** fade + scale-in from slightly smaller

---

## 6. Component States Reference

| State      | Border               | Background              | Transform        |
|-----------|----------------------|------------------------|------------------|
| Default   | `rgba(255,255,255,0.08)` | `#161b25`           | none             |
| Hover     | `rgba(0,191,255,0.45)` | `rgba(0,191,255,0.04)` | none           |
| Focused   | `#00bfff` full        | `rgba(0,191,255,0.08)` | `scale(1.03)`  |
| Live      | `rgba(255,68,68,0.3)` | `rgba(255,68,68,0.04)` | none           |
| Selected  | `#00bfff`             | `rgba(0,191,255,0.12)` | none           |
| Error     | `rgba(239,68,68,0.5)` | `rgba(239,68,68,0.06)` | none           |
| Loading   | default               | shimmer animation       | none           |

---

## 7. Key Interactions & Flows

### Browse channels
1. App loads → grid of channel cards (4 columns)
2. D-pad moves blue focus ring from card to card
3. Filter chips at top narrow results (LIVE / Favorites / Sport category)
4. Search field filters by name
5. Focused card emits preview → ChannelPreview appears in promo section left column

### Watch a channel
1. Press OK (D-pad) or click card → PlayerModal opens full-screen
2. Video starts (HLS stream / Twitch iframe / YouTube iframe)
3. Press Back/Escape → modal closes, returns to grid

### Theatre mode
1. Press "🎬 Teatro" button in header
2. Layout splits: sidebar left (channel list) + video right
3. Selecting any channel plays it immediately in the video pane
4. Press "🎬 Teatro" again → return to normal grid

### Admin flow
1. Press "⚙" icon → AdminLogin modal (password field)
2. Enter correct token → admin mode activated (token in sessionStorage)
3. Edit/delete buttons appear on each channel card
4. "+ Canal" button appears in header → ChannelForm modal opens
5. Form has logo auto-fetch, stream type selector, optional advanced fields

### Favorites & History
- Star icon on any channel card → toggles favorite (persists in localStorage)
- Watching a channel → automatically added to history (last 8)
- Filter "⭐ Favoritos" / "🕑 Recientes" in filter bar

---

## 8. Animations

| Name | Trigger | Effect |
|------|---------|--------|
| `fade-in` | component mount | scale 0.97→1 + opacity 0→1, 0.25s ease |
| `slide-up` | preview/modal appear | translateY(1.5rem)→0 + opacity 0→1, 0.22s |
| `live-pulse` | LIVE badge | opacity 1→0.3→1, 1.2s infinite |
| `marquee-scroll` | long event title | translateX(0→-100%), 8s linear infinite |
| Card hover | mouse enter card | border color transition, 0.12s |
| Card focus | D-pad navigation | border + scale, 0.1s |

---

## 9. Responsive & TV Scaling

**Core principle:** Everything scales with `1.3vw` root font size — no media queries needed.

| TV Size | Resolution | Base font | Card width |
|---------|-----------|-----------|------------|
| 32" HD  | 1366×768  | ~17.8px   | ~300px     |
| 43" FHD | 1920×1080 | ~25px     | ~420px     |
| 55" FHD | 1920×1080 | ~25px     | ~420px     |
| 65" 4K  | 3840×2160 | ~50px     | ~840px     |
| 75" 4K  | 3840×2160 | ~50px     | ~840px     |

**Grid:** always 4 columns, gaps and padding scale with `vw`  
**Header/filterbar:** height in `vh`, scales with screen height  
**Sidebar width:** `22vw` (fixed proportion)

---

## 10. Icon & Media Guidelines

**Icons:** emoji-based (no icon library dependency)  
- ⚡ App logo  
- ● Live indicator  
- ⚽🏀🎾🏎️🥊 Sport categories  
- ⭐ Favorites  
- 🕑 Recent history  
- 🎬 Theatre mode  
- ⊞ Multi-stream  
- ⚙ Admin settings  
- ✏️ Edit  
- 🗑️ Delete  
- 📅 Event  

**Channel logos:**
- Image URL from channel data
- Fallback: 2-letter initials block (cyan text on cyan-tinted background)
- Auto-fetched from Twitch/YouTube API when creating channel

**Video placeholders:**
- Black background `#000`
- Centered channel logo or initials
- Loading state: subtle shimmer or spinner
