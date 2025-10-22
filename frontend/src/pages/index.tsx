import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { DurationRecordABI } from "../abi/DurationRecordABI";
import { CONTRACT_ADDRESSES } from "../config/addresses";
import { createFhevmInstanceAuto } from "../lib/fhevm";

type DecryptSignature = {
  publicKey: string;
  privateKey: string;
  signature: string;
  startTimestamp: number;
  durationDays: number;
  userAddress: `0x${string}`;
  contractAddresses: `0x${string}`[];
  eip712: any;
};

type TabType = "organizations" | "management" | "hours";
type ManagementSubPage = "manage" | "approve" | null;
type HoursSubPage = "submit" | "myhours" | null;

type OrganizationInfo = {
  id: number;
  name: string;
  admin: string;
  active: boolean;
};

type ActivityInfo = {
  id: number;
  orgId: number;
  category: string;
  active: boolean;
};

export default function Home() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | undefined>(undefined);
  const [signer, setSigner] = useState<ethers.Signer | undefined>(undefined);
  const [address, setAddress] = useState<`0x${string}` | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [instance, setInstance] = useState<any | undefined>(undefined);
  const [contractAddress, setContractAddress] = useState<`0x${string}` | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabType>("organizations");
  const [managementSubPage, setManagementSubPage] = useState<ManagementSubPage>(null);
  const [hoursSubPage, setHoursSubPage] = useState<HoursSubPage>(null);
  
  // Organizations list states
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [orgActivities, setOrgActivities] = useState<ActivityInfo[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showOrgSelectModal, setShowOrgSelectModal] = useState(false);
  const [selectedOrgForActivity, setSelectedOrgForActivity] = useState<OrganizationInfo | null>(null);
  const [showOrgSelectModalForSubmit, setShowOrgSelectModalForSubmit] = useState(false);
  const [showActivitySelectModal, setShowActivitySelectModal] = useState(false);
  const [selectedOrgForSubmit, setSelectedOrgForSubmit] = useState<OrganizationInfo | null>(null);
  const [selectedActivityForSubmit, setSelectedActivityForSubmit] = useState<ActivityInfo | null>(null);
  const [activitiesForSelectedOrg, setActivitiesForSelectedOrg] = useState<ActivityInfo[]>([]);
  const [loadingActivitiesForSubmit, setLoadingActivitiesForSubmit] = useState(false);
  const [myOrganizations, setMyOrganizations] = useState<OrganizationInfo[]>([]);
  const [selectedOrgForApprove, setSelectedOrgForApprove] = useState<OrganizationInfo | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [showOrgSelectModalForApprove, setShowOrgSelectModalForApprove] = useState(false);

  // UI states
  const [orgName, setOrgName] = useState("");
  const [orgAdmin, setOrgAdmin] = useState("");
  const [orgIdForActivity, setOrgIdForActivity] = useState<number>(0);
  const [activityCategory, setActivityCategory] = useState("education");
  const [minHours, setMinHours] = useState<number>(0);
  const [maxHours, setMaxHours] = useState<number>(10);

  const [submitOrgId, setSubmitOrgId] = useState<number>(0);
  const [submitActivityId, setSubmitActivityId] = useState<number>(0);
  const [submitCategory, setSubmitCategory] = useState("education");
  const [hours, setHours] = useState<number>(1);

  const [submissionId, setSubmissionId] = useState<number | undefined>(undefined);
  const [approveId, setApproveId] = useState<number>(0);

  const [overallHandle, setOverallHandle] = useState<string | undefined>(undefined);
  const [overallDecrypted, setOverallDecrypted] = useState<bigint | undefined>(undefined);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error" | "warning">("info");
  const [isOwner, setIsOwner] = useState<boolean | undefined>(undefined);

  // Helper to show user-friendly messages
  const showMessage = useCallback((msg: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setMessage(msg);
    setMessageType(type);
  }, []);

  // FHEVM status (derived)
  const fhevmStatus = useMemo(() => {
    if (!provider) return { text: "Wallet not connected", color: "#718096", ready: false };
    if (!chainId) return { text: "Detecting network...", color: "#718096", ready: false };
    if (chainId === 31337) {
      return instance
        ? { text: "Local FHEVM Ready", color: "#48bb78", ready: true }
        : { text: "Initializing Local FHEVM...", color: "#ed8936", ready: false };
    }
    if (chainId === 11155111) {
      return instance
        ? { text: "Sepolia FHEVM Ready", color: "#48bb78", ready: true }
        : { text: "Initializing Sepolia FHEVM...", color: "#ed8936", ready: false };
    }
    return { text: "Unsupported Network", color: "#f56565", ready: false };
  }, [provider, chainId, instance]);

  // connect wallet
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      showMessage("Please install MetaMask to continue", "error");
      return;
    }
    try {
    const prov = new ethers.BrowserProvider(window.ethereum);
    await prov.send("eth_requestAccounts", []);
    const s = await prov.getSigner();
    const a = (await s.getAddress()) as `0x${string}`;
    const { chainId } = await prov.getNetwork();
    setProvider(prov);
    setSigner(s);
    setAddress(a);
    setChainId(Number(chainId));
      showMessage("Wallet connected successfully", "success");
    } catch (e: any) {
      showMessage(`Failed to connect wallet: ${e?.message ?? e}`, "error");
    }
  }, [showMessage]);

  // init FHEVM
  useEffect(() => {
    (async () => {
      if (!provider || !chainId) return;
      try {
        showMessage("Initializing FHEVM encryption system...", "info");
        const inst = await createFhevmInstanceAuto((window as any).ethereum, chainId);
        setInstance(inst);
        showMessage(
          chainId === 31337 
            ? "Local FHEVM encryption system ready" 
            : "Sepolia FHEVM encryption system ready",
          "success"
        );
      } catch (e: any) {
        setInstance(undefined);
        showMessage(`Failed to initialize FHEVM: ${e?.message ?? e}`, "error");
      }
    })();
  }, [provider, chainId]);

  // resolve contract address by chain id
  useEffect(() => {
    if (!chainId) return;
    const entry = CONTRACT_ADDRESSES[String(chainId)];
    setContractAddress(entry?.address);
  }, [chainId]);

  const contract = useMemo(() => {
    if (!contractAddress || !provider) return undefined;
    if (!ethers.isAddress(contractAddress)) return undefined;
    return new ethers.Contract(contractAddress, DurationRecordABI, provider);
  }, [contractAddress, provider]);

  const signerContract = useMemo(() => {
    if (!contractAddress || !signer) return undefined;
    return new ethers.Contract(contractAddress, DurationRecordABI, signer);
  }, [contractAddress, signer]);

  // load contract owner and compare with connected address
  useEffect(() => {
    (async () => {
      setIsOwner(undefined);
      if (!address || !contractAddress) return;
      if (!ethers.isAddress(contractAddress)) return;

      let ownerAddr: string | undefined;

      if (provider) {
        try {
          const code = await provider.getCode(contractAddress);
          if (!code || code === "0x") {
            showMessage(`Contract not found at configured address on this network`, "warning");
            return;
          }
        } catch {
          // ignore
        }
      }

      if (contract) {
        try {
          ownerAddr = await contract.owner();
        } catch {
          // continue to fallback
        }
      }

      // Fallback RPCs
      if (!ownerAddr) {
        const fallbackRpc =
          chainId === 31337
            ? "http://localhost:8545"
            : chainId === 11155111
            ? "https://rpc.sepolia.org"
            : undefined;
        if (fallbackRpc) {
          const fb = new ethers.JsonRpcProvider(fallbackRpc);
          try {
            const fbCode = await fb.getCode(contractAddress);
            if (!fbCode || fbCode === "0x") {
              showMessage(`Contract not deployed at configured address`, "warning");
              return;
            }
            const fbContract = new ethers.Contract(contractAddress, DurationRecordABI, fb);
            ownerAddr = await fbContract.owner();
          } catch (e2: any) {
            showMessage(`Failed to read contract owner`, "error");
          } finally {
            fb.destroy?.();
          }
        } else {
          showMessage("Network configuration not available", "warning");
        }
      }

      if (ownerAddr) {
        setIsOwner(ownerAddr.toLowerCase() === address.toLowerCase());
      }
    })();
  }, [contract, address, provider, contractAddress, chainId]);

  // Warn if contract address is invalid
  useEffect(() => {
    if (!contractAddress) return;
    if (!ethers.isAddress(contractAddress)) {
      showMessage("Invalid contract address configured. Please update configuration.", "error");
    }
  }, [contractAddress]);

  const ensureReady = useCallback(() => {
    if (!signer || !instance || !signerContract) throw new Error("System not ready");
  }, [signer, instance, signerContract]);

  const keccakCategory = useCallback((name: string) => {
    return ethers.solidityPackedKeccak256(["string"], [name]) as `0x${string}`;
  }, []);

  // Admin: register org
  const onRegisterOrg = useCallback(async () => {
    try {
      ensureReady();
      const admin = orgAdmin.trim();
      if (!ethers.isAddress(admin) || admin.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
        showMessage("Please enter a valid organization admin address", "warning");
        return;
      }

      showMessage("Verifying permissions...", "info");
      const fallbackRpc =
        chainId === 31337
          ? "http://localhost:8545"
          : chainId === 11155111
          ? "https://rpc.sepolia.org"
          : undefined;

      if (fallbackRpc && contractAddress && address) {
        try {
          const fb = new ethers.JsonRpcProvider(fallbackRpc);
          try {
            const fbContract = new ethers.Contract(contractAddress, DurationRecordABI, fb);
            const ownerAddr: string = await fbContract.owner();
            if (ownerAddr?.toLowerCase() !== address.toLowerCase()) {
              showMessage(`Only contract owner can register organizations`, "error");
              return;
            }
          } finally {
            fb.destroy?.();
          }
        } catch (e: any) {
          showMessage(`Permission check inconclusive, proceeding with transaction...`, "warning");
        }
      }

      if (fallbackRpc && contractAddress && address) {
        try {
          const fb = new ethers.JsonRpcProvider(fallbackRpc);
          try {
            const iface = new ethers.Interface(DurationRecordABI as any);
            const data = iface.encodeFunctionData("registerOrganization", [orgName, admin]);
            await fb.send("eth_call", [{ to: contractAddress, from: address, data }, "latest"]);
          } finally {
            fb.destroy?.();
          }
        } catch (e: any) {
          const msg = e?.shortMessage ?? e?.message ?? String(e);
          if (/revert|execution reverted|onlyowner|invalid admin|forbidden/i.test(msg)) {
            showMessage(`Transaction would fail: ${msg}`, "error");
            return;
          }
          showMessage(`Pre-flight check inconclusive, proceeding...`, "warning");
        }
      }

      showMessage("Registering organization...", "info");
      const tx = await signerContract!.registerOrganization(orgName, admin as `0x${string}`, { gasLimit: 3_000_000 });
      showMessage("Waiting for transaction confirmation...", "info");
      await tx.wait();
      showMessage(`Organization "${orgName}" registered successfully`, "success");
      setOrgName("");
      setOrgAdmin("");
    } catch (e: any) {
      showMessage(`Failed to register organization: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, orgName, orgAdmin, signerContract, chainId, contractAddress, address, showMessage]);

  // Org admin: create activity
  const onCreateActivity = useCallback(async () => {
    try {
      ensureReady();
      if (!selectedOrgForActivity) {
        showMessage("Please select an organization", "warning");
        return;
      }
      showMessage("Creating activity...", "info");
      const tx = await signerContract!.createActivity(
        selectedOrgForActivity.id,
        keccakCategory(activityCategory),
        minHours,
        maxHours
      );
      showMessage("Waiting for transaction confirmation...", "info");
      const receipt = await tx.wait();
      showMessage(`Activity created successfully in organization ${selectedOrgForActivity.name}`, "success");
    } catch (e: any) {
      showMessage(`Failed to create activity: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, selectedOrgForActivity, activityCategory, minHours, maxHours, keccakCategory, signerContract, showMessage]);

  // Fetch activities for submit
  const fetchActivitiesForSubmit = useCallback(async (orgId: number) => {
    if (!contract) {
      showMessage("Contract not available", "error");
        return;
      }
    
        const fallbackRpc =
          chainId === 31337
            ? "http://localhost:8545"
            : chainId === 11155111
            ? "https://rpc.sepolia.org"
            : undefined;
    
    let providerToUse: ethers.Provider | undefined = undefined;
    
    try {
      setLoadingActivitiesForSubmit(true);
      showMessage("Loading activities...", "info");
      
      providerToUse = fallbackRpc ? new ethers.JsonRpcProvider(fallbackRpc) : provider;
      const contractToUse = new ethers.Contract(contractAddress!, DurationRecordABI, providerToUse);
      
      const activityCount = await contractToUse.activityCount();
      const activities: ActivityInfo[] = [];
      
      for (let i = 1; i <= Number(activityCount); i++) {
        try {
          const activity = await contractToUse.activities(i);
          if (Number(activity.orgId) === orgId) {
            activities.push({
              id: i,
              orgId: Number(activity.orgId),
              category: activity.category,
              active: activity.active
            });
          }
        } catch (e) {
          // Skip if activity doesn't exist
        }
      }
      
      setActivitiesForSelectedOrg(activities);
      setShowActivitySelectModal(true);
      showMessage(`Loaded ${activities.length} activities`, "success");
    } catch (e: any) {
      showMessage(`Failed to load activities: ${e.message ?? e}`, "error");
    } finally {
      setLoadingActivitiesForSubmit(false);
      if (fallbackRpc && providerToUse) {
        (providerToUse as any).destroy?.();
      }
    }
  }, [contract, contractAddress, chainId, provider, showMessage]);

  // Volunteer: submit hours
  const onSubmitHours = useCallback(async () => {
    try {
      ensureReady();
      if (!address || !instance || !signerContract) throw new Error("System not ready");
      if (!selectedOrgForSubmit || !selectedActivityForSubmit) {
        showMessage("Please select organization and activity", "warning");
        return;
      }
      showMessage("Encrypting hours data...", "info");
      const input = instance.createEncryptedInput(contractAddress, address);
      input.add32(BigInt(Math.max(0, hours)));
      const enc = await input.encrypt();

      showMessage("Submitting encrypted hours...", "info");
      // Use category from selected activity
      // Contract no longer requires org signature or nonce
      const tx = await signerContract!.submitHours(
        selectedOrgForSubmit.id,
        selectedActivityForSubmit.id,
        selectedActivityForSubmit.category,
        enc.handles[0],
        enc.inputProof
      );
      showMessage("Waiting for transaction confirmation...", "info");
      const receipt = await tx.wait();
      showMessage(`Hours submitted successfully. Awaiting organization approval.`, "success");
      setSubmissionId(undefined);
    } catch (e: any) {
      showMessage(`Failed to submit hours: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, address, instance, signerContract, contractAddress, hours, selectedOrgForSubmit, selectedActivityForSubmit, chainId, showMessage]);

  // Fetch organizations where current user is admin
  const fetchMyOrganizations = useCallback(async () => {
    if (!contract || !address) {
      showMessage("Contract or address not available", "error");
      return;
    }
    
    const fallbackRpc =
      chainId === 31337
        ? "http://localhost:8545"
        : chainId === 11155111
        ? "https://rpc.sepolia.org"
        : undefined;
    
    let providerToUse: ethers.Provider | undefined = undefined;
    
    try {
      providerToUse = fallbackRpc ? new ethers.JsonRpcProvider(fallbackRpc) : provider;
      const contractToUse = new ethers.Contract(contractAddress!, DurationRecordABI, providerToUse);
      
      const orgCount = await contractToUse.orgCount();
      const myOrgs: OrganizationInfo[] = [];
      
      for (let i = 1; i <= Number(orgCount); i++) {
        try {
          const org = await contractToUse.orgs(i);
          if (org.admin.toLowerCase() === address.toLowerCase()) {
            myOrgs.push({
              id: i,
              name: org.name,
              admin: org.admin,
              active: org.active
            });
          }
        } catch (e) {
          // Skip if org doesn't exist
        }
      }
      
      setMyOrganizations(myOrgs);
    } catch (e: any) {
      showMessage(`Failed to load your organizations: ${e.message ?? e}`, "error");
    } finally {
      if (fallbackRpc && providerToUse) {
        (providerToUse as any).destroy?.();
      }
    }
  }, [contract, contractAddress, chainId, provider, address, showMessage]);

  // Fetch pending submissions for an organization
  const fetchPendingSubmissions = useCallback(async (orgId: number) => {
    if (!contract) {
      showMessage("Contract not available", "error");
      return;
    }
    
    const fallbackRpc =
      chainId === 31337
        ? "http://localhost:8545"
        : chainId === 11155111
        ? "https://rpc.sepolia.org"
        : undefined;
    
    let providerToUse: ethers.Provider | undefined = undefined;
    
    try {
      setLoadingSubmissions(true);
      showMessage("Loading pending submissions...", "info");
      
      providerToUse = fallbackRpc ? new ethers.JsonRpcProvider(fallbackRpc) : provider;
      const contractToUse = new ethers.Contract(contractAddress!, DurationRecordABI, providerToUse);
      
      const submissionCount = await contractToUse.submissionCount();
      const submissions: any[] = [];
      
      for (let i = 1; i <= Number(submissionCount); i++) {
        try {
          const submission = await contractToUse.submissions(i);
          if (Number(submission.orgId) === orgId && !submission.approved && !submission.rejected) {
            submissions.push({
              id: i,
              user: submission.user,
              orgId: Number(submission.orgId),
              activityId: Number(submission.activityId),
              category: submission.category,
              approved: submission.approved,
              rejected: submission.rejected
            });
          }
        } catch (e) {
          // Skip if submission doesn't exist
        }
      }
      
      setPendingSubmissions(submissions);
      showMessage(`Found ${submissions.length} pending submissions`, "success");
    } catch (e: any) {
      showMessage(`Failed to load submissions: ${e.message ?? e}`, "error");
    } finally {
      setLoadingSubmissions(false);
      if (fallbackRpc && providerToUse) {
        (providerToUse as any).destroy?.();
      }
    }
  }, [contract, contractAddress, chainId, provider, showMessage]);

  // Org admin: approve submission
  const onApprove = useCallback(async () => {
    try {
      ensureReady();
      if (!approveId) {
        showMessage("Please select a submission to approve", "warning");
        return;
      }
      showMessage("Approving submission...", "info");
      const tx = await signerContract!.approveSubmission(approveId);
      showMessage("Waiting for transaction confirmation...", "info");
      const receipt = await tx.wait();
      showMessage(`Submission approved successfully`, "success");
      // Refresh submissions list
      if (selectedOrgForApprove) {
        fetchPendingSubmissions(selectedOrgForApprove.id);
      }
    } catch (e: any) {
      showMessage(`Failed to approve submission: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, approveId, signerContract, showMessage, selectedOrgForApprove, fetchPendingSubmissions]);

  // User: grant ACL
  const onGrantAccess = useCallback(async () => {
    try {
      ensureReady();
      showMessage("Granting access to your totals...", "info");
      const tx = await signerContract!.grantAccessToMyTotals(keccakCategory(submitCategory));
      showMessage("Waiting for transaction confirmation...", "info");
      await tx.wait();
      showMessage("Access granted successfully", "success");
    } catch (e: any) {
      showMessage(`Failed to grant access: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, signerContract, submitCategory, keccakCategory, showMessage]);

  // Read handle then decrypt
  const onRefreshOverall = useCallback(async () => {
    try {
      if (!contract || !address) throw new Error("System not ready");
      showMessage("Fetching encrypted data...", "info");
      let handle: string;
      try {
        handle = await contract.getEncryptedOverall(address);
      } catch {
        const fallbackRpc =
          chainId === 31337
            ? "http://localhost:8545"
            : chainId === 11155111
            ? "https://rpc.sepolia.org"
            : undefined;
        if (!fallbackRpc) throw new Error("Network configuration not available");
        const fb = new ethers.JsonRpcProvider(fallbackRpc);
        try {
          const fbContract = new ethers.Contract(contractAddress!, DurationRecordABI, fb);
          handle = await fbContract.getEncryptedOverall(address);
        } finally {
          fb.destroy?.();
        }
      }
      setOverallHandle(handle);
      setOverallDecrypted(undefined);
      showMessage("Encrypted data retrieved. Click Decrypt to view.", "success");
    } catch (e: any) {
      showMessage(`Failed to fetch encrypted data: ${e.message ?? e}`, "error");
    }
  }, [contract, address, chainId, contractAddress, showMessage]);

  const onDecryptOverall = useCallback(async () => {
    try {
      if (!instance || !overallHandle || !address || !contractAddress || !signer) throw new Error("System not ready");
      showMessage("Generating decryption keys...", "info");
      const { publicKey, privateKey } = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 365;
      const eip712 = instance.createEIP712(publicKey, [contractAddress], startTimestamp, durationDays);
      const sig = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );
      showMessage("Decrypting data...", "info");
      const res = await instance.userDecrypt(
        [{ handle: overallHandle, contractAddress }],
        privateKey,
        publicKey,
        sig,
        [contractAddress],
        address,
        startTimestamp,
        durationDays
      );
      const val = res[overallHandle] as bigint;
      setOverallDecrypted(val);
      showMessage("Data decrypted successfully", "success");
    } catch (e: any) {
      showMessage(`Failed to decrypt data: ${e.message ?? e}`, "error");
    }
  }, [instance, overallHandle, address, contractAddress, signer, showMessage]);

  const onClaimOrUpgrade = useCallback(async () => {
    try {
      ensureReady();
      showMessage("Processing credential claim...", "info");
      const tx = await signerContract!.claimOrUpgrade();
      showMessage("Waiting for transaction confirmation...", "info");
      const receipt = await tx.wait();
      showMessage(`Credential claimed successfully`, "success");
    } catch (e: any) {
      showMessage(`Failed to claim credential: ${e.message ?? e}`, "error");
    }
  }, [ensureReady, signerContract, showMessage]);

  // Fetch all organizations
  const fetchOrganizations = useCallback(async () => {
    if (!contract) {
      showMessage("Contract not available", "error");
      return;
    }
    
    const fallbackRpc =
      chainId === 31337
        ? "http://localhost:8545"
        : chainId === 11155111
        ? "https://rpc.sepolia.org"
        : undefined;
    
    let providerToUse: ethers.Provider | undefined = undefined;
    
    try {
      setLoadingOrgs(true);
      showMessage("Loading organizations...", "info");
      
      providerToUse = fallbackRpc ? new ethers.JsonRpcProvider(fallbackRpc) : provider;
      const contractToUse = new ethers.Contract(contractAddress!, DurationRecordABI, providerToUse);
      
      const orgCount = await contractToUse.orgCount();
      const orgs: OrganizationInfo[] = [];
      
      for (let i = 1; i <= Number(orgCount); i++) {
        try {
          const org = await contractToUse.orgs(i);
          orgs.push({
            id: i,
            name: org.name,
            admin: org.admin,
            active: org.active
          });
        } catch (e) {
          // Skip if org doesn't exist
        }
      }
      
      setOrganizations(orgs);
      showMessage(`Loaded ${orgs.length} organizations`, "success");
    } catch (e: any) {
      showMessage(`Failed to load organizations: ${e.message ?? e}`, "error");
    } finally {
      setLoadingOrgs(false);
      if (fallbackRpc && providerToUse) {
        (providerToUse as any).destroy?.();
      }
    }
  }, [contract, contractAddress, chainId, provider, showMessage]);

  // Fetch activities for a specific organization
  const fetchOrgActivities = useCallback(async (orgId: number) => {
    if (!contract) {
      showMessage("Contract not available", "error");
      return;
    }
    
    const fallbackRpc =
      chainId === 31337
        ? "http://localhost:8545"
        : chainId === 11155111
        ? "https://rpc.sepolia.org"
        : undefined;
    
    let providerToUse: ethers.Provider | undefined = undefined;
    
    try {
      setLoadingActivities(true);
      showMessage("Loading activities...", "info");
      
      providerToUse = fallbackRpc ? new ethers.JsonRpcProvider(fallbackRpc) : provider;
      const contractToUse = new ethers.Contract(contractAddress!, DurationRecordABI, providerToUse);
      
      const activityCount = await contractToUse.activityCount();
      const activities: ActivityInfo[] = [];
      
      for (let i = 1; i <= Number(activityCount); i++) {
        try {
          const activity = await contractToUse.activities(i);
          if (Number(activity.orgId) === orgId) {
            // Try to decode category (it's a bytes32, might need to reverse keccak256)
            // For now, just show the hex value
            activities.push({
              id: i,
              orgId: Number(activity.orgId),
              category: activity.category,
              active: activity.active
            });
          }
        } catch (e) {
          // Skip if activity doesn't exist
        }
      }
      
      setOrgActivities(activities);
      setSelectedOrgId(orgId);
      setShowActivityModal(true);
      showMessage(`Loaded ${activities.length} activities`, "success");
    } catch (e: any) {
      showMessage(`Failed to load activities: ${e.message ?? e}`, "error");
    } finally {
      setLoadingActivities(false);
      if (fallbackRpc && providerToUse) {
        (providerToUse as any).destroy?.();
      }
    }
  }, [contract, contractAddress, chainId, provider, showMessage]);

  // Auto-fetch organizations when contract is ready
  useEffect(() => {
    if (contract && contractAddress && address) {
      fetchOrganizations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, contractAddress, address]);

  const messageColors = {
    info: { bg: "#bee3f8", border: "#4299e1", text: "#2c5282" },
    success: { bg: "#c6f6d5", border: "#48bb78", text: "#22543d" },
    error: { bg: "#fed7d7", border: "#f56565", text: "#742a2a" },
    warning: { bg: "#feebc8", border: "#ed8936", text: "#7c2d12" }
  };

  const tabs = [
    { id: "organizations" as TabType, label: "Organizations", icon: "🏛️", show: true },
    { id: "management" as TabType, label: "Management", icon: "🏢", show: true },
    { id: "hours" as TabType, label: "Hours", icon: "⏱️", show: true },
  ];

  return (
    <div style={{ 
      minHeight: "100vh", 
      backgroundColor: "#ffffff",
    }}>
      <style jsx>{`
        input, textarea, select {
          border: 1px solid #cbd5e0;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 14px;
          color: #2d3748;
          background: #ffffff;
          transition: all 0.2s;
          font-family: inherit;
        }
        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: #4299e1;
          box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
        }
        input::placeholder, textarea::placeholder {
          color: #a0aec0;
        }
        button {
          background: #4299e1;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        button:hover {
          background: #3182ce;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
        }
        button:active {
          transform: translateY(0);
        }
        button:disabled {
          background: #cbd5e0;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .primary-button {
          background: #48bb78;
        }
        .primary-button:hover {
          background: #38a169;
          box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
        }
        .secondary-button {
          background: #ed8936;
        }
        .secondary-button:hover {
          background: #dd6b20;
          box-shadow: 0 4px 12px rgba(237, 137, 54, 0.3);
        }
        .tab-button {
          background: transparent;
          color: #718096;
          padding: 12px 24px;
          border-radius: 0;
          border-bottom: 3px solid transparent;
          font-weight: 600;
          transform: none;
          box-shadow: none;
        }
        .tab-button:hover {
          background: #f7fafc;
          color: #2d3748;
          transform: none;
          box-shadow: none;
        }
        .tab-button.active {
          color: #4299e1;
          border-bottom-color: #4299e1;
          background: transparent;
        }
      `}</style>

      {/* Top Navigation Bar */}
      {address && (
        <div style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
        }}>
          <div style={{ 
            maxWidth: "1200px", 
            margin: "0 auto",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ 
                fontSize: "20px", 
                fontWeight: "700",
                color: "#2d3748",
                margin: "16px 0",
                letterSpacing: "-0.5px"
              }}>
                Duration Record
              </h1>
            </div>
            
            <div style={{ display: "flex", gap: "4px" }}>
              {tabs.filter(t => t.show).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <span style={{ marginRight: "6px" }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{
              padding: "6px 12px",
              borderRadius: "20px",
              background: fhevmStatus.color,
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "600",
              whiteSpace: "nowrap"
            }}>
              {fhevmStatus.text}
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        maxWidth: "1200px", 
        margin: "0 auto", 
        padding: "40px 20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif"
      }}>
      {!address ? (
          <>
            {/* Header */}
            <div style={{ 
              textAlign: "center", 
              marginBottom: "40px",
              paddingTop: "40px"
            }}>
              <h1 style={{ 
                fontSize: "42px", 
                fontWeight: "700",
                color: "#1a202c",
                margin: "0 0 12px 0",
                letterSpacing: "-0.5px"
              }}>
                Duration Record
              </h1>
              <p style={{ 
                fontSize: "18px", 
                color: "#718096",
                margin: 0,
                fontWeight: "400"
              }}>
                Secure volunteer hour tracking with encrypted data
              </p>
            </div>

            {/* Connection Card */}
            <div style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "60px 40px",
              textAlign: "center",
              maxWidth: "500px",
              margin: "0 auto",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)"
            }}>
              <div style={{
                width: "80px",
                height: "80px",
                background: "#ebf8ff",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px auto",
                fontSize: "36px"
              }}>
                🔐
              </div>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: "0 0 12px 0",
                fontWeight: "600"
              }}>
                Connect Your Wallet
              </h2>
              <p style={{ 
                color: "#718096", 
                margin: "0 0 32px 0",
                fontSize: "15px",
                lineHeight: "1.6"
              }}>
                Connect your MetaMask wallet to start tracking volunteer hours securely
              </p>
              <button 
                onClick={connect} 
                className="primary-button"
                style={{ 
                  padding: "14px 32px",
                  fontSize: "16px"
                }}
              >
                Connect MetaMask
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Status Cards */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
              marginBottom: "40px"
            }}>
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ color: "#718096", fontSize: "13px", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Account
                </div>
                <div style={{ color: "#2d3748", fontSize: "14px", fontWeight: "500", wordBreak: "break-all" }}>
                  {address.slice(0, 10)}...{address.slice(-8)}
                </div>
              </div>

              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ color: "#718096", fontSize: "13px", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Network
                </div>
                <div style={{ color: "#2d3748", fontSize: "14px", fontWeight: "500" }}>
                  {chainId === 31337 ? "Local Network" : chainId === 11155111 ? "Sepolia Testnet" : `Chain ${chainId}`}
                </div>
              </div>

              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ color: "#718096", fontSize: "13px", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Contract
                </div>
                <div style={{ color: "#2d3748", fontSize: "14px", fontWeight: "500", wordBreak: "break-all" }}>
                  {contractAddress ? `${contractAddress.slice(0, 8)}...${contractAddress.slice(-6)}` : "Not configured"}
                </div>
              </div>

              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ color: "#718096", fontSize: "13px", fontWeight: "600", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Role
                </div>
                <div style={{ 
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  background: isOwner === undefined ? "#718096" : isOwner ? "#48bb78" : "#4299e1",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "600"
                }}>
                  {isOwner === undefined ? "Checking..." : isOwner ? "Contract Owner" : "User"}
                </div>
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === "organizations" && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
                    <h2 style={{ 
                      fontSize: "24px", 
                      color: "#2d3748", 
                      margin: "0 0 8px 0",
                      fontWeight: "600"
                    }}>
                      🏛️ All Organizations
                    </h2>
                    <p style={{ 
                      color: "#718096", 
                      margin: 0,
                      fontSize: "15px"
                    }}>
                      Browse all registered volunteer organizations
                    </p>
                  </div>
                  <button 
                    onClick={fetchOrganizations} 
                    disabled={loadingOrgs}
                    style={{ padding: "10px 20px" }}
                  >
                    {loadingOrgs ? "Loading..." : "Refresh"}
                  </button>
                </div>

                {loadingOrgs ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#718096" }}>
                    Loading organizations...
                  </div>
                ) : organizations.length === 0 ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "60px 20px",
                    background: "#f7fafc",
                    borderRadius: "12px"
                  }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
                    <div style={{ color: "#718096", fontSize: "16px" }}>No organizations found</div>
                  </div>
                ) : (
                  <div style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: "20px"
                  }}>
                    {organizations.map((org) => (
                      <div
                        key={org.id}
                        onClick={() => fetchOrgActivities(org.id)}
              style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          padding: "24px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#4299e1";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(66, 153, 225, 0.15)";
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#e2e8f0";
                          e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <div style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "space-between",
                          marginBottom: "16px"
                        }}>
                          <h3 style={{ 
                            fontSize: "18px", 
                            color: "#2d3748", 
                            margin: 0,
                            fontWeight: "600"
                          }}>
                            {org.name}
                          </h3>
                          {org.active ? (
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              background: "#c6f6d5",
                              color: "#22543d",
                              fontSize: "12px",
                              fontWeight: "600"
                            }}>
                              Active
            </span>
                          ) : (
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              background: "#fed7d7",
                              color: "#742a2a",
                              fontSize: "12px",
                              fontWeight: "600"
                            }}>
                              Inactive
                            </span>
                          )}
          </div>
                        <div style={{ marginTop: "12px" }}>
                          <div style={{ 
                            fontSize: "12px", 
                            color: "#718096", 
                            marginBottom: "4px",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}>
                            Founder
                          </div>
                          <div style={{ 
                            fontSize: "14px", 
                            color: "#2d3748",
                            fontFamily: "monospace",
                            wordBreak: "break-all"
                          }}>
                            {org.admin.slice(0, 10)}...{org.admin.slice(-8)}
                          </div>
                        </div>
                        <div style={{ 
                          marginTop: "16px",
                          paddingTop: "16px",
                          borderTop: "1px solid #e2e8f0",
                          fontSize: "13px",
                          color: "#4299e1",
                          fontWeight: "600"
                        }}>
                          Click to view activities →
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Management Tab - Button Selection */}
            {activeTab === "management" && managementSubPage === null && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px", textAlign: "center" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    🏢 Management
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    Select a feature
                  </p>
                </div>
                
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "20px",
                  maxWidth: "800px",
                  margin: "0 auto"
                }}>
                  <button
                    onClick={() => setManagementSubPage("manage")}
                    style={{
                      padding: "40px 30px",
                      background: "#ffffff",
                      border: "2px solid #e2e8f0",
                      borderRadius: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#2d3748",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#4299e1";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(66, 153, 225, 0.15)";
                      e.currentTarget.style.transform = "translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span style={{ fontSize: "48px" }}>🏢</span>
                    <span>Organization Management</span>
                    <span style={{ fontSize: "13px", color: "#718096", fontWeight: "400" }}>
                      Register organizations and create activities
                    </span>
                  </button>

                  <button
                    onClick={() => setManagementSubPage("approve")}
                    style={{
                      padding: "40px 30px",
                      background: "#ffffff",
                      border: "2px solid #e2e8f0",
                      borderRadius: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#2d3748",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#48bb78";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(72, 187, 120, 0.15)";
                      e.currentTarget.style.transform = "translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span style={{ fontSize: "48px" }}>✅</span>
                    <span>Approve Hours</span>
                    <span style={{ fontSize: "13px", color: "#718096", fontWeight: "400" }}>
                      Approve volunteer hour submissions
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Manage Sub-page */}
            {activeTab === "management" && managementSubPage === "manage" && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    🏢 Organization Management
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    Register new organizations and create activities for volunteer tracking
                  </p>
                </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px",
                  marginBottom: "24px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    Register New Organization
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                    <input 
                      placeholder="Organization name" 
                      value={orgName} 
                      onChange={(e) => setOrgName(e.target.value)} 
                    />
                    <input 
                      placeholder="Admin wallet address" 
                      value={orgAdmin} 
                      onChange={(e) => setOrgAdmin(e.target.value)} 
                    />
                  </div>
                  <button onClick={onRegisterOrg} style={{ width: "100%" }}>
                    Register Organization
                  </button>
                </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    Create New Activity
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setShowOrgSelectModal(true)}
              style={{
                          width: "100%",
                          background: selectedOrgForActivity ? "#ffffff" : "#ffffff",
                          border: "1px solid #cbd5e0",
                          color: selectedOrgForActivity ? "#2d3748" : "#a0aec0",
                          textAlign: "left",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: selectedOrgForActivity ? "500" : "400",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#4299e1";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(66, 153, 225, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e0";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        {selectedOrgForActivity ? selectedOrgForActivity.name : "Select Organization"}
                      </button>
                    </div>
                    <input 
                      placeholder="Category (e.g., education)" 
                      value={activityCategory} 
                      onChange={(e) => setActivityCategory(e.target.value)} 
                    />
                    <input 
                      type="number" 
                      placeholder="Minimum hours" 
                      value={minHours} 
                      onChange={(e) => setMinHours(Number(e.target.value))} 
                    />
                    <input 
                      type="number" 
                      placeholder="Maximum hours" 
                      value={maxHours} 
                      onChange={(e) => setMaxHours(Number(e.target.value))} 
                    />
                  </div>
                  <button 
                    onClick={onCreateActivity} 
                    disabled={!selectedOrgForActivity}
                    style={{ width: "100%" }}
                  >
                    Create Activity
                  </button>
                </div>

                <button 
                  onClick={() => setManagementSubPage(null)}
                  style={{
                    marginTop: "24px",
                    padding: "12px 24px",
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#2d3748",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#edf2f7";
                    e.currentTarget.style.borderColor = "#cbd5e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f7fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Hours Tab - Button Selection */}
            {activeTab === "hours" && hoursSubPage === null && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px", textAlign: "center" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    ⏱️ Hours
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    Select a feature
                  </p>
                </div>
                
              <div style={{
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "20px",
                  maxWidth: "800px",
                  margin: "0 auto"
                }}>
                  <button
                    onClick={() => setHoursSubPage("submit")}
                    style={{
                      padding: "40px 30px",
                      background: "#ffffff",
                      border: "2px solid #e2e8f0",
                      borderRadius: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#2d3748",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#4299e1";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(66, 153, 225, 0.15)";
                      e.currentTarget.style.transform = "translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span style={{ fontSize: "48px" }}>⏱️</span>
                    <span>Submit Hours</span>
                    <span style={{ fontSize: "13px", color: "#718096", fontWeight: "400" }}>
                      Submit encrypted volunteer hours
                    </span>
                  </button>

                  <button
                    onClick={() => setHoursSubPage("myhours")}
                    style={{
                      padding: "40px 30px",
                      background: "#ffffff",
                      border: "2px solid #e2e8f0",
                      borderRadius: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#2d3748",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#9f7aea";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(159, 122, 234, 0.15)";
                      e.currentTarget.style.transform = "translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span style={{ fontSize: "48px" }}>📊</span>
                    <span>My Hours</span>
                    <span style={{ fontSize: "13px", color: "#718096", fontWeight: "400" }}>
                      View total volunteer hours
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Submit Hours Sub-page */}
            {activeTab === "hours" && hoursSubPage === "submit" && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    ⏱️ Submit Volunteer Hours
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    Submit your encrypted volunteer hours for organization approval
                  </p>
                </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    Submit Your Hours
                  </h3>
                  <p style={{ 
                    color: "#718096", 
                    margin: "0 0 16px 0",
                    fontSize: "14px",
                    lineHeight: "1.6"
                  }}>
                    Enter your volunteer hours details. The hours will be encrypted before submission to ensure privacy.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setShowOrgSelectModalForSubmit(true)}
                        style={{
                          width: "100%",
                          background: "#ffffff",
                          border: "1px solid #cbd5e0",
                          color: selectedOrgForSubmit ? "#2d3748" : "#a0aec0",
                          textAlign: "left",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: selectedOrgForSubmit ? "500" : "400",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#4299e1";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(66, 153, 225, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e0";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        {selectedOrgForSubmit ? selectedOrgForSubmit.name : "Select Organization"}
                      </button>
      </div>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => {
                          if (!selectedOrgForSubmit) {
                            showMessage("Please select an organization first", "warning");
                            return;
                          }
                          fetchActivitiesForSubmit(selectedOrgForSubmit.id);
                        }}
                        disabled={!selectedOrgForSubmit}
                        style={{
                          width: "100%",
                          background: "#ffffff",
                          border: "1px solid #cbd5e0",
                          color: selectedActivityForSubmit ? "#2d3748" : "#a0aec0",
                          textAlign: "left",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: selectedActivityForSubmit ? "500" : "400",
                          cursor: selectedOrgForSubmit ? "pointer" : "not-allowed",
                          transition: "all 0.2s",
                          opacity: selectedOrgForSubmit ? 1 : 0.6
                        }}
                        onMouseEnter={(e) => {
                          if (selectedOrgForSubmit) {
                            e.currentTarget.style.borderColor = "#4299e1";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(66, 153, 225, 0.1)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e0";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        {selectedActivityForSubmit ? `Activity #${selectedActivityForSubmit.id}` : "Select Activity"}
                      </button>
      </div>
                    <input 
                      type="number" 
                      placeholder="Hours worked" 
                      value={hours} 
                      onChange={(e) => setHours(Number(e.target.value))} 
                    />
                  </div>
                  <button 
                    onClick={onSubmitHours} 
                    className="primary-button"
                    style={{ width: "100%" }}
                  >
                    Submit Encrypted Hours
                  </button>
                </div>

                <button 
                  onClick={() => setHoursSubPage(null)}
                  style={{
                    marginTop: "24px",
                    padding: "12px 24px",
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#2d3748",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#edf2f7";
                    e.currentTarget.style.borderColor = "#cbd5e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f7fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Approve Sub-page */}
            {activeTab === "management" && managementSubPage === "approve" && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    ✅ Approve Hour Submissions
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    Select your organization to view and approve pending volunteer hour submissions
                  </p>
                </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px",
                  marginBottom: "24px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    Select Your Organization
                  </h3>
                  <p style={{ 
                    color: "#718096", 
                    margin: "0 0 16px 0",
                    fontSize: "14px",
                    lineHeight: "1.6"
                  }}>
                    Choose an organization you manage to view pending submissions
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                    <button
                      onClick={() => {
                        fetchMyOrganizations();
                        setShowOrgSelectModalForApprove(true);
                      }}
                      style={{
                        width: "100%",
                        background: "#ffffff",
                        border: "1px solid #cbd5e0",
                        color: selectedOrgForApprove ? "#2d3748" : "#a0aec0",
                        textAlign: "left",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: selectedOrgForApprove ? "500" : "400",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#4299e1";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(66, 153, 225, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#cbd5e0";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {selectedOrgForApprove ? selectedOrgForApprove.name : "Select Your Organization"}
                    </button>
                    <button 
                      onClick={() => {
                        if (!selectedOrgForApprove) {
                          showMessage("Please select an organization first", "warning");
                          return;
                        }
                        fetchPendingSubmissions(selectedOrgForApprove.id);
                      }}
                      disabled={!selectedOrgForApprove}
                      className="primary-button"
                    >
                      View Submissions
                    </button>
      </div>
      </div>

                {selectedOrgForApprove && (
                  <div style={{ 
                    background: "#f7fafc",
                    padding: "28px",
                    borderRadius: "12px"
                  }}>
                    <h3 style={{ 
                      fontSize: "18px", 
                      color: "#2d3748", 
                      margin: "0 0 20px 0",
                      fontWeight: "600"
                    }}>
                      Pending Submissions - {selectedOrgForApprove.name}
                    </h3>
                    {loadingSubmissions ? (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "#718096" }}>
                        Loading submissions...
                      </div>
                    ) : pendingSubmissions.length === 0 ? (
                      <div style={{ 
                        textAlign: "center", 
                        padding: "40px 20px",
                        background: "#ffffff",
                        borderRadius: "12px"
                      }}>
                        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📭</div>
                        <div style={{ color: "#718096", fontSize: "14px" }}>No pending submissions found</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {pendingSubmissions.map((submission) => (
                          <div
                            key={submission.id}
                            style={{
                              padding: "20px",
                              background: "#ffffff",
                              borderRadius: "12px",
                              border: "1px solid #e2e8f0"
                            }}
                          >
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "flex-start",
                              marginBottom: "16px"
                            }}>
      <div>
                                <div style={{ fontSize: "16px", color: "#2d3748", fontWeight: "600", marginBottom: "8px" }}>
                                  Submission #{submission.id}
      </div>
                                <div style={{ fontSize: "13px", color: "#718096", marginBottom: "4px" }}>
                                  <strong>Volunteer:</strong> {submission.user.slice(0, 10)}...{submission.user.slice(-8)}
                                </div>
                                <div style={{ fontSize: "13px", color: "#718096", marginBottom: "4px" }}>
                                  <strong>Activity ID:</strong> {submission.activityId}
                                </div>
                                <div style={{ fontSize: "13px", color: "#718096" }}>
                                  <strong>Category Hash:</strong> {submission.category.slice(0, 20)}...
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setApproveId(submission.id);
                                  onApprove();
                                }}
                                className="primary-button"
                                style={{ padding: "8px 16px", fontSize: "13px" }}
                              >
                                Approve
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => setManagementSubPage(null)}
                  style={{
                    marginTop: "24px",
                    padding: "12px 24px",
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#2d3748",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#edf2f7";
                    e.currentTarget.style.borderColor = "#cbd5e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f7fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  ← Back
                </button>
              </div>
            )}

            {/* My Hours Sub-page */}
            {activeTab === "hours" && hoursSubPage === "myhours" && (
              <div style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
              }}>
                <div style={{ marginBottom: "32px" }}>
                  <h2 style={{ 
                    fontSize: "24px", 
                    color: "#2d3748", 
                    margin: "0 0 8px 0",
                    fontWeight: "600"
                  }}>
                    📊 My Total Volunteer Hours
                  </h2>
                  <p style={{ 
                    color: "#718096", 
                    margin: 0,
                    fontSize: "15px"
                  }}>
                    View your total approved volunteer hours stored securely with encryption
                  </p>
      </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px",
                  marginBottom: "24px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    View Encrypted Total
                  </h3>
                  <p style={{ 
                    color: "#718096", 
                    margin: "0 0 16px 0",
                    fontSize: "14px",
                    lineHeight: "1.6"
                  }}>
                    Your total hours are stored encrypted on-chain. First grant access, then fetch and decrypt to view your total.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
                    <button onClick={onGrantAccess} className="secondary-button">
                      Grant Access
                    </button>
                    <button onClick={onRefreshOverall}>
                      Fetch Encrypted Data
                    </button>
                    <button onClick={onDecryptOverall} disabled={!overallHandle} className="primary-button">
                      Decrypt Hours
                    </button>
                  </div>

                  {overallDecrypted !== undefined && (
                    <div style={{
                      marginTop: "24px",
                      padding: "32px",
                      background: "#ffffff",
                      borderRadius: "12px",
                      border: "2px solid #48bb78",
                      textAlign: "center"
                    }}>
                      <div style={{ fontSize: "14px", color: "#718096", marginBottom: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>
                        Total Approved Hours
      </div>
                      <div style={{ fontSize: "56px", color: "#2d3748", fontWeight: "700", lineHeight: "1" }}>
                        {overallDecrypted.toString()}
                      </div>
                      <div style={{ fontSize: "16px", color: "#718096", marginTop: "8px", fontWeight: "500" }}>
                        volunteer hours
                      </div>
                    </div>
                  )}
      </div>

                <div style={{ 
                  background: "#f7fafc",
                  padding: "28px",
                  borderRadius: "12px"
                }}>
                  <h3 style={{ 
                    fontSize: "18px", 
                    color: "#2d3748", 
                    margin: "0 0 20px 0",
                    fontWeight: "600"
                  }}>
                    Claim Volunteer Credential
                  </h3>
                  <p style={{ 
                    color: "#718096", 
                    margin: "0 0 16px 0",
                    fontSize: "14px",
                    lineHeight: "1.6"
                  }}>
                    Based on your total volunteer hours, claim or upgrade your volunteer credential NFT.
                  </p>
                  <button onClick={onClaimOrUpgrade} className="primary-button" style={{ width: "100%" }}>
                    Claim or Upgrade Credential
                  </button>
                </div>

                <button 
                  onClick={() => setHoursSubPage(null)}
                  style={{
                    marginTop: "24px",
                    padding: "12px 24px",
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    color: "#2d3748",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#edf2f7";
                    e.currentTarget.style.borderColor = "#cbd5e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f7fafc";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Message Box */}
            {message && (
              <div style={{
                marginTop: "24px",
                padding: "16px 20px",
                background: messageColors[messageType].bg,
                border: `1px solid ${messageColors[messageType].border}`,
                borderRadius: "12px",
                color: messageColors[messageType].text,
                fontSize: "14px",
                lineHeight: "1.6",
                fontWeight: "500"
              }}>
                {message}
              </div>
            )}
          </>
        )}
      </div>

      {/* Organization Select Modal for Submit */}
      {showOrgSelectModalForSubmit && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
          onClick={() => setShowOrgSelectModalForSubmit(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: 0,
                fontWeight: "600"
              }}>
                Select Organization
              </h2>
              <button
                onClick={() => setShowOrgSelectModalForSubmit(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  color: "#718096",
                  cursor: "pointer",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f7fafc";
                  e.currentTarget.style.color = "#2d3748";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#718096";
                }}
              >
                ×
              </button>
      </div>

            {organizations.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "60px 20px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
                <div style={{ color: "#718096", fontSize: "16px" }}>No organizations found</div>
                <button 
                  onClick={fetchOrganizations}
                  style={{ marginTop: "16px", padding: "10px 20px" }}
                >
                  Refresh Organizations
                </button>
    </div>
            ) : (
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px"
              }}>
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => {
                      setSelectedOrgForSubmit(org);
                      setSubmitOrgId(org.id);
                      setSelectedActivityForSubmit(null);
                      setShowOrgSelectModalForSubmit(false);
                    }}
                    style={{
                      background: "#ffffff",
                      border: selectedOrgForSubmit?.id === org.id ? "2px solid #4299e1" : "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "20px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: selectedOrgForSubmit?.id === org.id ? "0 4px 12px rgba(66, 153, 225, 0.2)" : "0 2px 4px rgba(0,0,0,0.02)"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedOrgForSubmit?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#4299e1";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(66, 153, 225, 0.15)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedOrgForSubmit?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }
                    }}
                  >
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      marginBottom: "12px"
                    }}>
                      <h3 style={{ 
                        fontSize: "16px", 
                        color: "#2d3748", 
                        margin: 0,
                        fontWeight: "600"
                      }}>
                        {org.name}
                      </h3>
                      {org.active ? (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#c6f6d5",
                          color: "#22543d",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#fed7d7",
                          color: "#742a2a",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "#718096", 
                        marginBottom: "4px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Founder
                      </div>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#2d3748",
                        fontFamily: "monospace",
                        wordBreak: "break-all"
                      }}>
                        {org.admin.slice(0, 10)}...{org.admin.slice(-8)}
                      </div>
                    </div>
                    {selectedOrgForSubmit?.id === org.id && (
                      <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #e2e8f0",
                        fontSize: "12px",
                        color: "#4299e1",
                        fontWeight: "600"
                      }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Select Modal for Submit */}
      {showActivitySelectModal && selectedOrgForSubmit && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
          onClick={() => setShowActivitySelectModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: 0,
                fontWeight: "600"
              }}>
                Select Activity
              </h2>
              <button
                onClick={() => setShowActivitySelectModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  color: "#718096",
                  cursor: "pointer",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f7fafc";
                  e.currentTarget.style.color = "#2d3748";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#718096";
                }}
              >
                ×
              </button>
            </div>

            {selectedOrgForSubmit && (
              <div style={{ 
                marginBottom: "24px",
                padding: "16px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "14px", color: "#718096", marginBottom: "4px", fontWeight: "600" }}>
                  Organization
                </div>
                <div style={{ fontSize: "18px", color: "#2d3748", fontWeight: "600" }}>
                  {selectedOrgForSubmit.name}
                </div>
              </div>
            )}

            {loadingActivitiesForSubmit ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#718096" }}>
                Loading activities...
              </div>
            ) : activitiesForSelectedOrg.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "40px 20px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
                <div style={{ color: "#718096", fontSize: "14px" }}>No activities found for this organization</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {activitiesForSelectedOrg.map((activity) => (
                  <div
                    key={activity.id}
                    onClick={() => {
                      setSelectedActivityForSubmit(activity);
                      setSubmitActivityId(activity.id);
                      setShowActivitySelectModal(false);
                    }}
                    style={{
                      padding: "20px",
                      background: selectedActivityForSubmit?.id === activity.id ? "#ebf8ff" : "#f7fafc",
                      borderRadius: "12px",
                      border: selectedActivityForSubmit?.id === activity.id ? "2px solid #4299e1" : "1px solid #e2e8f0",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedActivityForSubmit?.id !== activity.id) {
                        e.currentTarget.style.borderColor = "#4299e1";
                        e.currentTarget.style.background = "#ffffff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedActivityForSubmit?.id !== activity.id) {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.background = "#f7fafc";
                      }
                    }}
                  >
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center",
                      marginBottom: "12px"
                    }}>
                      <div style={{ fontSize: "16px", color: "#2d3748", fontWeight: "600" }}>
                        Activity #{activity.id}
                      </div>
                      {activity.active ? (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#c6f6d5",
                          color: "#22543d",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#fed7d7",
                          color: "#742a2a",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#718096", 
                        marginBottom: "4px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Category Hash
                      </div>
                      <div style={{ 
                        fontSize: "13px", 
                        color: "#2d3748",
                        fontFamily: "monospace",
                        wordBreak: "break-all"
                      }}>
                        {activity.category}
                      </div>
                    </div>
                    {selectedActivityForSubmit?.id === activity.id && (
                      <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #e2e8f0",
                        fontSize: "12px",
                        color: "#4299e1",
                        fontWeight: "600"
                      }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Organization Select Modal for Approve */}
      {showOrgSelectModalForApprove && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
          onClick={() => setShowOrgSelectModalForApprove(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: 0,
                fontWeight: "600"
              }}>
                Select Your Organization
              </h2>
              <button
                onClick={() => setShowOrgSelectModalForApprove(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  color: "#718096",
                  cursor: "pointer",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f7fafc";
                  e.currentTarget.style.color = "#2d3748";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#718096";
                }}
              >
                ×
              </button>
            </div>

            {myOrganizations.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "60px 20px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
                <div style={{ color: "#718096", fontSize: "16px", marginBottom: "8px" }}>You don't manage any organizations</div>
                <div style={{ color: "#a0aec0", fontSize: "14px" }}>Only organizations where you are the admin will appear here</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {myOrganizations.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => {
                      setSelectedOrgForApprove(org);
                      setShowOrgSelectModalForApprove(false);
                    }}
                    style={{
                      background: selectedOrgForApprove?.id === org.id ? "#ebf8ff" : "#f7fafc",
                      border: selectedOrgForApprove?.id === org.id ? "2px solid #4299e1" : "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "20px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedOrgForApprove?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#4299e1";
                        e.currentTarget.style.background = "#ffffff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedOrgForApprove?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.background = "#f7fafc";
                      }
                    }}
                  >
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      marginBottom: "12px"
                    }}>
                      <h3 style={{ 
                        fontSize: "16px", 
                        color: "#2d3748", 
                        margin: 0,
                        fontWeight: "600"
                      }}>
                        {org.name}
                      </h3>
                      {org.active ? (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#c6f6d5",
                          color: "#22543d",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#fed7d7",
                          color: "#742a2a",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    {selectedOrgForApprove?.id === org.id && (
                      <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #e2e8f0",
                        fontSize: "12px",
                        color: "#4299e1",
                        fontWeight: "600"
                      }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Organization Select Modal for Activity Creation */}
      {showOrgSelectModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
          onClick={() => setShowOrgSelectModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: 0,
                fontWeight: "600"
              }}>
                Select Organization
              </h2>
              <button
                onClick={() => setShowOrgSelectModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  color: "#718096",
                  cursor: "pointer",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f7fafc";
                  e.currentTarget.style.color = "#2d3748";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#718096";
                }}
              >
                ×
              </button>
      </div>

            {organizations.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "60px 20px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
                <div style={{ color: "#718096", fontSize: "16px" }}>No organizations found</div>
                <button 
                  onClick={fetchOrganizations}
                  style={{ marginTop: "16px", padding: "10px 20px" }}
                >
                  Refresh Organizations
                </button>
    </div>
            ) : (
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "16px"
              }}>
                {organizations.map((org) => (
                  <div
                    key={org.id}
                    onClick={() => {
                      setSelectedOrgForActivity(org);
                      setOrgIdForActivity(org.id);
                      setShowOrgSelectModal(false);
                    }}
                    style={{
                      background: "#ffffff",
                      border: selectedOrgForActivity?.id === org.id ? "2px solid #4299e1" : "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "20px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: selectedOrgForActivity?.id === org.id ? "0 4px 12px rgba(66, 153, 225, 0.2)" : "0 2px 4px rgba(0,0,0,0.02)"
                    }}
                    onMouseEnter={(e) => {
                      if (selectedOrgForActivity?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#4299e1";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(66, 153, 225, 0.15)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedOrgForActivity?.id !== org.id) {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }
                    }}
                  >
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      marginBottom: "12px"
                    }}>
                      <h3 style={{ 
                        fontSize: "16px", 
                        color: "#2d3748", 
                        margin: 0,
                        fontWeight: "600"
                      }}>
                        {org.name}
                      </h3>
                      {org.active ? (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#c6f6d5",
                          color: "#22543d",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#fed7d7",
                          color: "#742a2a",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "#718096", 
                        marginBottom: "4px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Founder
                      </div>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#2d3748",
                        fontFamily: "monospace",
                        wordBreak: "break-all"
                      }}>
                        {org.admin.slice(0, 10)}...{org.admin.slice(-8)}
                      </div>
                    </div>
                    {selectedOrgForActivity?.id === org.id && (
                      <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: "1px solid #e2e8f0",
                        fontSize: "12px",
                        color: "#4299e1",
                        fontWeight: "600"
                      }}>
                        ✓ Selected
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivityModal && selectedOrgId !== null && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px"
          }}
          onClick={() => {
            setShowActivityModal(false);
            setSelectedOrgId(null);
            setOrgActivities([]);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <h2 style={{ 
                fontSize: "24px", 
                color: "#2d3748", 
                margin: 0,
                fontWeight: "600"
              }}>
                Organization Activities
              </h2>
              <button
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedOrgId(null);
                  setOrgActivities([]);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "24px",
                  color: "#718096",
                  cursor: "pointer",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f7fafc";
                  e.currentTarget.style.color = "#2d3748";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#718096";
                }}
              >
                ×
              </button>
            </div>

            {organizations.find(o => o.id === selectedOrgId) && (
              <div style={{ 
                marginBottom: "24px",
                padding: "16px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "14px", color: "#718096", marginBottom: "4px", fontWeight: "600" }}>
                  Organization
                </div>
                <div style={{ fontSize: "18px", color: "#2d3748", fontWeight: "600" }}>
                  {organizations.find(o => o.id === selectedOrgId)!.name}
                </div>
              </div>
            )}

            {loadingActivities ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#718096" }}>
                Loading activities...
              </div>
            ) : orgActivities.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "40px 20px",
                background: "#f7fafc",
                borderRadius: "12px"
              }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
                <div style={{ color: "#718096", fontSize: "14px" }}>No activities found for this organization</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {orgActivities.map((activity) => (
                  <div
                    key={activity.id}
                    style={{
                      padding: "20px",
                      background: "#f7fafc",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center",
                      marginBottom: "12px"
                    }}>
                      <div style={{ fontSize: "16px", color: "#2d3748", fontWeight: "600" }}>
                        Activity #{activity.id}
                      </div>
                      {activity.active ? (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#c6f6d5",
                          color: "#22543d",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          Active
                        </span>
                      ) : (
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          background: "#fed7d7",
                          color: "#742a2a",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#718096", 
                        marginBottom: "4px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Category Hash
                      </div>
                      <div style={{ 
                        fontSize: "13px", 
                        color: "#2d3748",
                        fontFamily: "monospace",
                        wordBreak: "break-all"
                      }}>
                        {activity.category}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
