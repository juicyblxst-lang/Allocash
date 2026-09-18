export const factoryAddress=(import.meta.env.VITE_FACTORY_ADDRESS||'0x0000000000000000000000000000000000000000') as `0x${string}`;
export const factoryAbi=[
{type:'function',name:'createWallet',stateMutability:'nonpayable',inputs:[{name:'owner',type:'address'}],outputs:[{name:'wallet',type:'address'},{name:'vault',type:'address'}]},
{type:'event',name:'WalletCreated',inputs:[{indexed:true,name:'owner',type:'address'},{indexed:true,name:'wallet',type:'address'},{indexed:true,name:'vault',type:'address'}]}
] as const;
export const walletAbi=[
{type:'function',name:'vault',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
{type:'function',name:'signer',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
{type:'function',name:'executeVault',stateMutability:'nonpayable',inputs:[{name:'data',type:'bytes'}],outputs:[{name:'result',type:'bytes'}]}
] as const;
export const vaultAbi=[
{type:'function',name:'nextPresetId',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
{type:'function',name:'preset',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'preset',type:'tuple',components:[{name:'name',type:'string'},{name:'createdAt',type:'uint256'},{name:'archived',type:'bool'},{name:'deleted',type:'bool'},{name:'activeFunds',type:'uint256'},{name:'archiveReason',type:'string'}]},{name:'containers',type:'tuple[]',components:[{name:'name',type:'string'},{name:'percentage',type:'uint16'},{name:'lockDuration',type:'uint64'},{name:'priority',type:'uint8'},{name:'exists',type:'bool'}]}]},
{type:'function',name:'payments',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'amount',type:'uint256'},{name:'payer',type:'address'},{name:'receivedAt',type:'uint64'},{name:'temporaryUnlockAt',type:'uint64'},{name:'decisionAt',type:'uint64'},{name:'state',type:'uint8'},{name:'allocationCount',type:'uint256'}]},
{type:'function',name:'allocations',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'paymentId',type:'uint256'},{name:'presetId',type:'uint256'},{name:'containerIndex',type:'uint8'},{name:'amount',type:'uint256'},{name:'unlockAt',type:'uint64'},{name:'unlocked',type:'bool'},{name:'withdrawn',type:'bool'}]},
{type:'function',name:'paymentAllocations',stateMutability:'view',inputs:[{name:'paymentId',type:'uint256'}],outputs:[{name:'',type:'uint256[]'}]},
{type:'function',name:'createPreset',stateMutability:'nonpayable',inputs:[{name:'name',type:'string'},{name:'input',type:'tuple[]',components:[{name:'name',type:'string'},{name:'percentage',type:'uint16'},{name:'lockDuration',type:'uint64'},{name:'priority',type:'uint8'},{name:'exists',type:'bool'}]}],outputs:[{name:'id',type:'uint256'}]},
{type:'function',name:'applyPreset',stateMutability:'nonpayable',inputs:[{name:'paymentId',type:'uint256'},{name:'presetId',type:'uint256'}],outputs:[]},
{type:'function',name:'temporaryLock',stateMutability:'nonpayable',inputs:[{name:'paymentId',type:'uint256'}],outputs:[]},
{type:'function',name:'expireTemporaryLock',stateMutability:'nonpayable',inputs:[{name:'paymentId',type:'uint256'}],outputs:[]},
{type:'function',name:'autoTemporaryRelock',stateMutability:'nonpayable',inputs:[{name:'paymentId',type:'uint256'}],outputs:[]},
{type:'function',name:'unlockAllocation',stateMutability:'nonpayable',inputs:[{name:'allocationId',type:'uint256'}],outputs:[]},
{type:'function',name:'withdraw',stateMutability:'nonpayable',inputs:[{name:'allocationId',type:'uint256'},{name:'recipient',type:'address'},{name:'amount',type:'uint256'}],outputs:[]},
{type:'function',name:'archivePreset',stateMutability:'nonpayable',inputs:[{name:'presetId',type:'uint256'},{name:'reason',type:'string'}],outputs:[]},
{type:'function',name:'deletePreset',stateMutability:'nonpayable',inputs:[{name:'presetId',type:'uint256'}],outputs:[]},
{type:'function',name:'totalProtectedBalance',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
{type:'event',name:'IncomingPayment',inputs:[{indexed:true,name:'paymentId',type:'uint256'},{indexed:true,name:'payer',type:'address'},{indexed:false,name:'amount',type:'uint256'},{indexed:false,name:'receivedAt',type:'uint256'}]},
{type:'event',name:'AllocationCreated',inputs:[{indexed:true,name:'allocationId',type:'uint256'},{indexed:true,name:'paymentId',type:'uint256'},{indexed:true,name:'presetId',type:'uint256'},{indexed:false,name:'containerIndex',type:'uint8'},{indexed:false,name:'amount',type:'uint256'},{indexed:false,name:'unlockAt',type:'uint256'}]},
{type:'event',name:'TemporaryLockStarted',inputs:[{indexed:true,name:'paymentId',type:'uint256'},{indexed:false,name:'amount',type:'uint256'},{indexed:false,name:'unlockAt',type:'uint256'}]},
{type:'event',name:'TemporaryLockExpired',inputs:[{indexed:true,name:'paymentId',type:'uint256'}]},
{type:'event',name:'TemporaryLockRepeated',inputs:[{indexed:true,name:'paymentId',type:'uint256'},{indexed:false,name:'amount',type:'uint256'},{indexed:false,name:'unlockAt',type:'uint256'}]},
{type:'event',name:'AllocationUnlocked',inputs:[{indexed:true,name:'allocationId',type:'uint256'}]},
{type:'event',name:'Withdrawal',inputs:[{indexed:true,name:'allocationId',type:'uint256'},{indexed:true,name:'recipient',type:'address'},{indexed:false,name:'amount',type:'uint256'}]},
{type:'event',name:'PresetCreated',inputs:[{indexed:true,name:'presetId',type:'uint256'},{indexed:false,name:'name',type:'string'}]},
{type:'event',name:'PresetArchived',inputs:[{indexed:true,name:'presetId',type:'uint256'},{indexed:false,name:'reason',type:'string'}]},
{type:'event',name:'PresetDeleted',inputs:[{indexed:true,name:'presetId',type:'uint256'}]}
] as const;
