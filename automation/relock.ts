import {createPublicClient,createWalletClient,http,parseAbi,privateKeyToAccount,type Address} from 'viem';
import {bscTestnet} from 'viem/chains';

const key=process.env.RELOCK_RELAYER_PRIVATE_KEY as any;
const vaults=(process.env.ALLOCASH_VAULT_ADDRESSES||'').split(',').map(x=>x.trim()).filter(Boolean) as Address[];
if(!key) throw new Error('RELOCK_RELAYER_PRIVATE_KEY is required for the external automation worker.');
if(!vaults.length) throw new Error('ALLOCASH_VAULT_ADDRESSES must contain at least one deployed vault.');
const account=privateKeyToAccount(key);
const transport=http(process.env.RPC_URL||'https://bsc-testnet.bnbchain.org');
const publicClient=createPublicClient({chain:bscTestnet,transport});
const walletClient=createWalletClient({account,chain:bscTestnet,transport});
const abi=parseAbi(['function payments(uint256 id) view returns (uint256 amount,address payer,uint64 receivedAt,uint64 temporaryUnlockAt,uint64 decisionAt,uint8 state,uint256 allocationCount)','function autoTemporaryRelock(uint256 paymentId)','event TemporaryLockStarted(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)','event TemporaryLockRepeated(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)','event IncomingPayment(uint256 indexed paymentId,address indexed payer,uint256 amount,uint256 receivedAt)']);
const lookback=BigInt(Number(process.env.RELOCK_LOOKBACK_BLOCKS||5000));
async function run(){const latest=await publicClient.getBlockNumber();const from=latest>lookback?latest-lookback:0n;for(const vault of vaults){const logs=await publicClient.getLogs({address:vault,event:abi[2],fromBlock:from,toBlock:latest});const repeated=await publicClient.getLogs({address:vault,event:abi[3],fromBlock:from,toBlock:latest});const incoming=await publicClient.getLogs({address:vault,event:abi[4],fromBlock:from,toBlock:latest});const ids=[...new Set([...logs,...repeated,...incoming].map((x:any)=>x.args.paymentId.toString()))];for(const id of ids){const p:any=await publicClient.readContract({address:vault,abi,functionName:'payments',args:[BigInt(id)]});const opportunity=p[5]===1?p[3]:p[5]===0?p[4]:0n;if(opportunity&&BigInt(Math.floor(Date.now()/1000))>=opportunity+900n){try{const hash=await walletClient.writeContract({address:vault,abi,functionName:'autoTemporaryRelock',args:[BigInt(id)]});await publicClient.waitForTransactionReceipt({hash});console.log('relocked',vault,id,hash)}catch(e){console.log('skip',vault,id,String(e))}}}}}
await run();
