export type PresetUsage = { presetId:string; name:string; uses:number };
export type AgentMemory = { presetUsage: PresetUsage[] };

export function rememberPreset(memory: AgentMemory, presetId:string, name:string): AgentMemory {
  const existing = memory.presetUsage.find(x=>x.presetId===presetId);
  if (existing) return {...memory,presetUsage:memory.presetUsage.map(x=>x.presetId===presetId?{...x,uses:x.uses+1}:x)};
  return {...memory,presetUsage:[...memory.presetUsage,{presetId,name,uses:1}]};
}
