import { useEffect, useMemo, useState } from 'react';
import { decodeEventLog, encodeFunctionData, formatEther, parseEther, type Address } from 'viem';
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { bscTestnet } from './config/chain';
import { factoryAbi, factoryAddress, vaultAbi, walletAbi } from './config/contracts';
import { calculateAllocations, validatePreset, type ContainerRule } from './logic/allocation';

type Payment = { id: bigint; amount: bigint; state: number; temporaryUnlockAt: bigint; decisionAt: bigint };
const priorityNames = ['Very Low','Low','Medium','High','Very High'];
const emptyContainer = (): ContainerRule => ({ name: '', percentage: 0, lockDuration: 0, priority: 2 });

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [wallet, setWallet] = useState<Address | null>(() => localStorage.getItem('allocash.wallet') as Address | null);
  const [vault, setVault] = useState<Address | null>(() => localStorage.getItem('allocash.vault') as Address | null);
  const [presetName, setPresetName] = useState('Salary');
  const [containers, setContainers] = useState<ContainerRule[]>([emptyContainer(), {...emptyContainer(), name:'Free Money', percentage:100, lockDuration:0, priority:1}]);
  const [deposit, setDeposit] = useState('0.1');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState('Connect a wallet to begin.');
  const [presetId, setPresetId] = useState<bigint | null>(null);

  const walletBalance = useReadContract({ address: wallet ?? undefined, abi: walletAbi, functionName: 'vault', query: { enabled: Boolean(wallet) } });
  const vaultBalance = useReadContract({ address: vault ?? undefined, abi: [{type:'function',name:'totalProtectedBalance',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]}] as const, functionName:'totalProtectedBalance', query:{enabled:Boolean(vault)} });

  useEffect(() => {
    if (!vault || !client) return;
    let cancelled = false;
    (async () => {
      const latest = await client.getBlockNumber();
      const from = latest > 5000n ? latest - 5000n : 0n;
      const logs = await client.getLogs({ address: vault, event: { type:'event', name:'IncomingPayment', inputs:[{indexed:true,name:'paymentId',type:'uint256'},{indexed:true,name:'payer',type:'address'},{indexed:false,name:'amount',type:'uint256'},{indexed:false,name:'receivedAt',type:'uint256'}] } } as any, fromBlock: from, toBlock:'latest' });
      if (cancelled) return;
      const loaded = await Promise.all(logs.map(async (log:any) => {
        const id = log.args.paymentId as bigint;
        const p:any = await client.readContract({address:vault, abi:vaultAbi, functionName:'payments', args:[id]});
        return {id, amount:p[0], state:Number(p[5]), temporaryUnlockAt:p[3], decisionAt:p[4]};
      }));
      setPayments(loaded.reverse());
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [vault, client]);

  const total = useMemo(() => containers.reduce((s,c)=>s+c.percentage,0), [containers]);
  const validation = validatePreset(containers);

  async function createSmartAccount() {
    if (!address) return;
    try {
      setStatus('Creating your dedicated smart account…');
      const hash = await writeContractAsync({ address: factoryAddress, abi: factoryAbi, functionName:'createWallet', args:[address], chainId:bscTestnet.id });
      if (!client) return;
      const receipt = await client.waitForTransactionReceipt({hash});
      const event = receipt.logs.find((log:any) => log.address.toLowerCase() === factoryAddress.toLowerCase());
      if (!event) throw new Error('WalletCreated event not found in confirmed receipt.');
      const decoded = decodeEventLog({abi:factoryAbi, data:event.data, topics:event.topics});
      const args:any = decoded.args;
      setWallet(args.wallet); setVault(args.vault);
      localStorage.setItem('allocash.wallet', args.wallet); localStorage.setItem('allocash.vault', args.vault);
      setStatus('Smart account created. Fund it with testnet gas if you later use ERC-4337 bundling.');
    } catch (e:any) { setStatus(e?.shortMessage || e?.message || 'Smart account creation failed.'); }
  }

  async function depositIncoming() {
    if (!vault) return setStatus('Create the smart account first.');
    try {
      setStatus('Confirm the incoming testnet payment in your wallet…');
      const hash = await writeContractAsync({ address:vault, abi:vaultAbi, functionName:'recordIncoming', value:parseEther(deposit), chainId:bscTestnet.id });
      if (!client) return;
      await client.waitForTransactionReceipt({hash});
      setStatus('Incoming payment confirmed on-chain. It is now in the protected pre-vault.');
    } catch (e:any) { setStatus(e?.shortMessage || e?.message || 'Deposit failed or was rejected.'); }
  }

  async function createPreset() {
    if (!wallet || !validation) return setStatus(validation || 'Invalid preset.');
    try {
      setStatus('Review complete. Confirm the preset creation in your wallet…');
      const input = containers.map(c=>({name:c.name,percentage:c.percentage,lockDuration:c.lockDuration,priority:c.priority,exists:true}));
      const data = encodeFunctionData({abi:vaultAbi, functionName:'createPreset', args:[presetName,input]});
      const hash = await writeContractAsync({address:wallet, abi:walletAbi, functionName:'executeVault', args:[data], chainId:bscTestnet.id});
      if (client) await client.waitForTransactionReceipt({hash});
      setStatus('Preset confirmed on-chain and is now immutable.');
    } catch (e:any) { setStatus(e?.shortMessage || e?.message || 'Preset creation failed.'); }
  }

  async function allocate(paymentId: bigint, id: bigint) {
    if (!wallet) return;
    try {
      const p:any = await client!.readContract({address:vault!,abi:vaultAbi,functionName:'payments',args:[paymentId]});
      const preview = calculateAllocations(p[0], containers);
      if (!window.confirm(`Confirm allocation of ${formatEther(p[0])} tBNB?\n\n${preview.map(x=>`${x.name}: ${formatEther(x.amount)} tBNB`).join('\n')}`)) return;
      const data = encodeFunctionData({abi:vaultAbi,functionName:'applyPreset',args:[paymentId,id]});
      const hash = await writeContractAsync({address:wallet,abi:walletAbi,functionName:'executeVault',args:[data],chainId:bscTestnet.id});
      await client!.waitForTransactionReceipt({hash});
      setStatus('Allocation transaction confirmed.');
    } catch (e:any) { setStatus(e?.shortMessage || e?.message || 'Allocation failed.'); }
  }

  async function tempLock(paymentId: bigint) {
    if (!wallet) return;
    if (!window.confirm('Confirm a one-hour temporary lock for this unresolved payment?')) return;
    try {
      const data = encodeFunctionData({abi:vaultAbi,functionName:'temporaryLock',args:[paymentId]});
      const hash = await writeContractAsync({address:wallet,abi:walletAbi,functionName:'executeVault',args:[data],chainId:bscTestnet.id});
      await client!.waitForTransactionReceipt({hash});
      setStatus('Temporary lock confirmed on-chain for one hour.');
    } catch (e:any) { setStatus(e?.shortMessage || e?.message || 'Temporary lock failed.'); }
  }

  return <main className="shell">
    <header><div><p className="eyebrow">ALLOCASH</p><h1>Money with intention.</h1><p className="muted">Incoming money does not become forgotten spendable balance. You decide what it is for.</p></div><div className="walletBox">{isConnected ? <><span>{address?.slice(0,6)}…{address?.slice(-4)}</span><button onClick={()=>disconnect()}>Disconnect</button></> : <button onClick={()=>connect({connector:connectors[0]})}>Connect wallet</button>}</div></header>
    {chainId && chainId !== 97 && <div className="warning">Wrong network. Allocash V1 only operates on BSC Testnet (chain 97).</div>}
    <section className="grid">
      <article className="card hero"><div><span className="label">PROTECTED PRE-VAULT</span><strong>{formatEther((vaultBalance.data as bigint | undefined) ?? 0n)} tBNB</strong><p className="muted">Visible, protected, and awaiting an intentional allocation decision.</p></div>{!wallet ? <button className="primary" disabled={!isConnected} onClick={createSmartAccount}>Create smart account</button> : <div className="address"><small>Smart account</small><code>{wallet}</code><small>Pre-vault</small><code>{vault}</code></div>}</article>
      <article className="card"><span className="label">TESTNET INCOMING PAYMENT</span><input value={deposit} onChange={e=>setDeposit(e.target.value)} inputMode="decimal"/><button className="primary" disabled={!vault || chainId !== 97} onClick={depositIncoming}>Receive into pre-vault</button><p className="muted">This sends a real BSC Testnet transaction. No fake balances or confirmations.</p></article>
    </section>
    <section className="card"><div className="sectionHead"><div><span className="label">IMMUTABLE PRESET</span><h2>Create an intentional rule set</h2></div><span className={total===100?'ok':'bad'}>{total}% / 100%</span></div><input value={presetName} onChange={e=>setPresetName(e.target.value)} placeholder="Preset name"/>{containers.map((c,i)=><div className="row" key={i}><input placeholder="Container" value={c.name} onChange={e=>setContainers(xs=>xs.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/><input type="number" min="0" max="100" value={c.percentage} onChange={e=>setContainers(xs=>xs.map((x,j)=>j===i?{...x,percentage:Number(e.target.value)}:x))}/><input type="number" min="0" value={c.lockDuration/86400} onChange={e=>setContainers(xs=>xs.map((x,j)=>j===i?{...x,lockDuration:Number(e.target.value)*86400}:x))} title="Lock days"/><select value={c.priority} onChange={e=>setContainers(xs=>xs.map((x,j)=>j===i?{...x,priority:Number(e.target.value) as any}:x))}>{priorityNames.map((p,j)=><option key={p} value={j}>{p}</option>)}</select></div>)}<div className="actions"><button onClick={()=>setContainers(xs=>xs.length<10?[...xs,emptyContainer()]:xs)}>Add container</button><button className="primary" disabled={!wallet || Boolean(validation)} onClick={createPreset}>Review & confirm preset</button></div>{validation && <p className="bad">{validation}</p>}<p className="muted">Once confirmed, the contract stores the preset as immutable. Changing a rule means creating a new preset.</p></section>
    <section className="card"><div className="sectionHead"><div><span className="label">ALLOCATION QUEUE</span><h2>Every incoming payment stays separate</h2></div></div>{payments.length===0?<p className="muted">No confirmed incoming payments found in the recent testnet history.</p>:payments.map(p=><div className="payment" key={p.id.toString()}><div><b>Payment #{p.id.toString()}</b><span>{formatEther(p.amount)} tBNB</span><small>{p.state===0?'Action needed':p.state===1?'Temporarily locked':'Allocated'}</small></div>{p.state===0&&<div className="actions"><button onClick={()=>presetId?allocate(p.id,presetId):setStatus('Set a preset ID after reading the confirmed preset event.')}>Use preset</button><button onClick={()=>tempLock(p.id)}>Temporary 1h lock</button></div>}</div>)}</section>
    <footer><span>{status}</span><span>V1 · BSC Testnet only · No custody · No AI signing</span></footer>
  </main>;
}
