export type ProposedAllocation = { containerIndex:number; amountBaseUnits:bigint };

/** The agent may prepare an allocation, but it never has a signer, provider, or execution capability. */
export function prepareAllocation(amountBaseUnits:bigint, percentages:number[]):ProposedAllocation[] {
  if (!percentages.length || percentages.reduce((a,b)=>a+b,0)!==100) throw new Error('Percentages must total 100');
  let allocated=0n;
  return percentages.map((percentage,index)=>{
    const amount=index===percentages.length-1?amountBaseUnits-allocated:(amountBaseUnits*BigInt(percentage))/100n;
    allocated+=amount;
    return {containerIndex:index,amountBaseUnits:amount};
  });
}
