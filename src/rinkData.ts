export const RINK_COLORS: Record<string, string> = {
  'Weber County Ice Sheet': '#3b82f6',
  'Acord Ice Center': '#06b6d4',
  'County Ice Center': '#10b981',
  'Peaks Ice Arena': '#eab308',
  'SLC Sports Complex': '#f97316',
}

export const RINK_REGISTRY = [
  { id: 'Weber County Ice Sheet', abbrev: 'Weber' },
  { id: 'Acord Ice Center', abbrev: 'Acord' },
  { id: 'County Ice Center', abbrev: 'County' },
  { id: 'Peaks Ice Arena', abbrev: 'Peaks' },
  { id: 'SLC Sports Complex', abbrev: 'SLC SC' },
] as const
