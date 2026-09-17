import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { bscTestnet } from './chain';

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: { [bscTestnet.id]: http(import.meta.env.VITE_RPC_URL || 'https://bsc-testnet.bnbchain.org') },
});
