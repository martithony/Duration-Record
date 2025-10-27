interface Window {
  ethereum?: {
    isMetaMask?: boolean;
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    send: (method: string, params?: any[]) => Promise<any>;
    on: (event: string, handler: (...args: any[]) => void) => void;
    removeListener: (event: string, handler: (...args: any[]) => void) => void;
  };
  relayerSDK?: any & { 
    __initialized__?: boolean;
    SepoliaConfig?: any;
    initSDK?: () => Promise<boolean>;
    createInstance?: (config: any) => Promise<any>;
  };
}

