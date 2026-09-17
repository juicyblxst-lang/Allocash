import type { AgentMemory } from './memory.js';

export function suggestPreset(memory:AgentMemory){
  if (!memory.presetUsage.length) return null;
  const top=[...memory.presetUsage].sort((a,b)=>b.uses-a.uses)[0];
  return {type:'PRESET_SUGGESTION' as const,presetId:top.presetId,presetName:top.name,usageCount:top.uses,requiresExplicitChoice:true};
}
