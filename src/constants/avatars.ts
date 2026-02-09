export const AVATAR_EMOJIS = [
  'fox', 'cat', 'dog', 'frog', 'lion', 'panda',
  'unicorn', 'octopus', 'butterfly', 'bee', 'parrot', 'turtle',
  'gamepad', 'guitar', 'rocket', 'lightning', 'rainbow', 'fire',
  'gem', 'target', 'trophy', 'star', 'pizza', 'flower',
];

export const AVATAR_COLORS = [
  '#fbcfe8', // pastel pink
  '#a5f3fc', // pastel cyan
  '#fde68a', // pastel yellow
  '#d1fae5', // pastel green
  '#e9d5ff', // pastel lavender
  '#fed7aa', // pastel peach
  '#bfdbfe', // pastel blue
  '#fecaca', // pastel red
];

export function randomEmoji(): string {
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}
