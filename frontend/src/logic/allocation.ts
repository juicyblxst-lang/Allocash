export type ContainerRule = { name: string; percentage: number; lockDuration: number; priority: 0|1|2|3|4 };

export function validatePreset(containers: ContainerRule[]): string | null {
  if (containers.length === 0) return 'Add at least one container.';
  if (containers.length > 10) return 'A preset can contain at most 10 containers.';
  const total = containers.reduce((sum, c) => sum + c.percentage, 0);
  if (total !== 100) return `The preset must total 100%. ${100 - total}% remains.`;
  if (containers.some(c => !c.name.trim())) return 'Every container needs a name.';
  if (containers.some(c => c.percentage <= 0 || c.percentage > 100)) return 'Container percentages must be between 1% and 100%.';
  if (containers.some(c => c.lockDuration < 0)) return 'Lock duration cannot be negative.';
  return null;
}

export function calculateAllocations(amountWei: bigint, containers: ContainerRule[]) {
  const total = containers.reduce((sum, c) => sum + c.percentage, 0);
  if (total !== 100) throw new Error('Preset must total 100%.');
  let allocated = 0n;
  return containers.map((container, index) => {
    const amount = index === containers.length - 1 ? amountWei - allocated : (amountWei * BigInt(container.percentage)) / 100n;
    allocated += amount;
    return { ...container, amount };
  });
}
