/* Minimal FHEVM Relayer SDK loader and helpers following Zama official pattern */
export const SDK_CDN_URL = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";

export type FhevmWindow = Window & {
  relayerSDK?: any & { __initialized__?: boolean };
  ethereum?: any;
};

export async function loadRelayerSDK(): Promise<void> {
  const w = window as FhevmWindow;
  if (w.relayerSDK) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_CDN_URL;
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Relayer SDK from ${SDK_CDN_URL}`));
    document.head.appendChild(script);
  });
}

export async function initRelayerSDK(): Promise<void> {
  const w = window as FhevmWindow;
  if (!w.relayerSDK) throw new Error("relayerSDK not loaded");
  if (w.relayerSDK.__initialized__) return;
  const ok = await w.relayerSDK.initSDK();
  if (!ok) throw new Error("relayerSDK.initSDK failed");
  w.relayerSDK.__initialized__ = true;
}

export async function createFhevmInstance(network: any) {
  const w = window as FhevmWindow;
  if (!w.relayerSDK?.SepoliaConfig) throw new Error("SepoliaConfig not found on relayerSDK");
  const config = { ...w.relayerSDK.SepoliaConfig, network };
  const instance = await w.relayerSDK.createInstance(config);
  return instance as any;
}

// -------- Auto detect mock (31337) or relayer (11155111) --------
const DEFAULT_LOCAL_RPC = "http://localhost:8545";

async function fetchWeb3ClientVersion(rpcUrl: string) {
  const { JsonRpcProvider } = await import("ethers");
  const rpc = new JsonRpcProvider(rpcUrl);
  try {
    const version = await rpc.send("web3_clientVersion", []);
    return String(version ?? "");
  } finally {
    rpc.destroy?.();
  }
}

async function tryFetchFhevmRelayerMetadata(rpcUrl: string): Promise<
  | {
      ACLAddress: `0x${string}`;
      InputVerifierAddress: `0x${string}`;
      KMSVerifierAddress: `0x${string}`;
    }
  | undefined
> {
  const version = await fetchWeb3ClientVersion(rpcUrl);
  if (!version.toLowerCase().includes("hardhat")) return undefined;
  const { JsonRpcProvider } = await import("ethers");
  const rpc = new JsonRpcProvider(rpcUrl);
  try {
    const metadata = await rpc.send("fhevm_relayer_metadata", []);
    if (
      metadata &&
      typeof metadata === "object" &&
      typeof metadata.ACLAddress === "string" &&
      metadata.ACLAddress.startsWith("0x") &&
      typeof metadata.InputVerifierAddress === "string" &&
      metadata.InputVerifierAddress.startsWith("0x") &&
      typeof metadata.KMSVerifierAddress === "string" &&
      metadata.KMSVerifierAddress.startsWith("0x")
    ) {
      return metadata;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    rpc.destroy?.();
  }
}

export async function createFhevmInstanceAuto(provider: any, chainId: number) {
  // Local Hardhat mock
  if (chainId === 31337) {
    const metadata = await tryFetchFhevmRelayerMetadata(DEFAULT_LOCAL_RPC);
    if (!metadata) {
      throw new Error("Local FHEVM Hardhat node not detected. Ensure http://localhost:8545 is running and supports fhevm_relayer_metadata.");
    }
    const mod = await import("./mock/fhevmMock");
    const mockInstance = await mod.fhevmMockCreateInstance({
      rpcUrl: DEFAULT_LOCAL_RPC,
      chainId,
      metadata,
    });
    return mockInstance as any;
  }

  // Sepolia relayer
  if (chainId === 11155111) {
    await loadRelayerSDK();
    await initRelayerSDK();
    return await createFhevmInstance(provider);
  }

  throw new Error("Current network is not supported for FHE. Please switch to local 31337 (mock) or Sepolia (Relayer).");
}

export function toCategoryKey(category: string): `0x${string}` {
  const bytes = new TextEncoder().encode(category);
  // simple keccak stub via ethers if available at runtime; else return 0x padded slice
  // We will compute keccak256 using ethers at call sites.
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0")}` as `0x${string}`;
}


