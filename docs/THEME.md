# Second Brain — Theme Spec ("minimal Claude app" style)

The app copies the feel of Anthropic's Claude app: warm ivory surfaces, one
terracotta accent, serif display type, generous whitespace, hairline borders
instead of shadows, no gradients, no glassmorphism.

## Palette

```ts
export const light = {
  bg:        '#FAF9F5', // warm ivory page background
  surface:   '#FFFFFF', // cards
  surfaceAlt:'#F0EEE6', // chips, inputs, pressed states
  text:      '#1F1E1D', // near-black warm
  textMuted: '#6E6C66',
  textFaint: '#9C9A93',
  border:    '#E8E6E0', // hairline
  accent:    '#D97757', // terracotta (primary actions, active tab, links)
  accentSoft:'#F5E8E2', // accent-tinted background (badges, selected)
  success:   '#5E8C61',
  danger:    '#C0392B',
};

export const dark = {
  bg:        '#262624',
  surface:   '#30302E',
  surfaceAlt:'#3A3A37',
  text:      '#F5F4EF',
  textMuted: '#B8B5AD',
  textFaint: '#807D75',
  border:    '#3E3D3A',
  accent:    '#D97757',
  accentSoft:'#453832',
  success:   '#7FA982',
  danger:    '#E06552',
};
```

## Typography

- **Display / headings & wisdom-card text:** serif — `Georgia` (iOS/Android
  system fallback: `serif`). Large journal/wisdom text at 24–30pt, line-height
  1.35, letter-spacing -0.3.
- **Body / UI:** system sans (`System`), 15–16pt, line-height 1.45.
- **Labels / overlines:** 11–12pt, uppercase, letter-spacing 1, `textFaint`.

## Shape & spacing

- Radius: 12 (inputs, chips), 16 (cards), 999 (pills/FAB).
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32. Screen gutter 20.
- Borders: `StyleSheet.hairlineWidth` in `border`. **No elevation/shadow** except
  a very soft one under the FAB.

## Components

- **Tab bar:** minimal, `bg` background, hairline top border, active = `accent`
  icon + label, inactive = `textFaint`. Icons: Ionicons outline style.
- **Buttons:** primary = `accent` bg, white text, radius 999, height 48.
  Secondary = `surfaceAlt` bg, `text` color. Text buttons in `accent`.
- **Cards:** `surface` bg, radius 16, hairline border, padding 16.
- **Inputs:** `surfaceAlt` bg, radius 12, no border until focus (`accent`).
- **Wisdom feed cards:** full-screen `bg` (alternate very subtle tints per kind),
  serif quote text centered-left, source line as an overline; right-side action
  rail of circular `surface` buttons.
- **Empty states:** centered, small serif line + one primary action, plenty of air.

## Motion

Subtle only: 150–200ms opacity/translate. Feed uses paging snap
(`pagingEnabled` FlatList). No springy overshoot.

Both color schemes must work; follow `useColorScheme()`.
