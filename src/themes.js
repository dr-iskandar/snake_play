export const THEME_PACKS = {
  snake: {
    id: 'snake',
    name: 'Snake Garden',
    backgroundA: 0xeef2d8,
    backgroundB: 0xdce9c8,
    gridLine: 0xb8cf98,
    head: { fill: 0x3f7d4a, stroke: 0x214a2a },
    bodyPalette: [0x65a765, 0x589958, 0x74b66d],
    collectible: { common: 'apple', power: 'star', mystery: 'mystery' },
    obstacle: { fill: 0x8f826a, stroke: 0x625744 }
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping Rush',
    backgroundA: 0xfff6ea,
    backgroundB: 0xffeadf,
    gridLine: 0xefc8bb,
    head: { fill: 0xf7b6c8, stroke: 0x88445a },
    bodyPalette: [0x7cc8ff, 0xffd166, 0xa7e8bd, 0xff9fa4, 0xd8b4fe],
    segmentLabels: ['BAG', 'SALE', 'BOX', 'NEW', 'GIFT'],
    collectible: { common: 'coin', power: 'coupon', mystery: 'mystery' },
    obstacle: { fill: 0xb98d74, stroke: 0x795844 }
  }
};
