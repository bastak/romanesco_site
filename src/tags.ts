// The tags a blog post may use in its frontmatter (`tags: [rnn]`).
// To add one: add an entry here and a colour in styles/global.css
// (--tag-<key>), then a class entry in components/Tags.astro.

export const TAGS = {
	rl: { label: 'reinforcement learning' },
	vr: { label: 'vr' },
	rnn: { label: 'RNN' },
} as const;

export type Tag = keyof typeof TAGS;

export const TAG_KEYS = Object.keys(TAGS) as [Tag, ...Tag[]];
