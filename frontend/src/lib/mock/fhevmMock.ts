//////////////////////////////////////////////////////////////////////////
//
// WARNING!!
// ALWAYS DYNAMICALLY IMPORT THIS FILE TO AVOID INCLUDING THE ENTIRE
// FHEVM MOCK LIB IN THE FINAL PRODUCTION BUNDLE!!
//
//////////////////////////////////////////////////////////////////////////

import { JsonRpcProvider } from "ethers";
import { MockFhevmInstance } from "@fhevm/mock-utils";

export async function fhevmMockCreateInstance(parameters: {
	rpcUrl: string;
	chainId: number;
	metadata: {
		ACLAddress: `0x${string}`;
		InputVerifierAddress: `0x${string}`;
		KMSVerifierAddress: `0x${string}`;
	};
}) {
	const provider = new JsonRpcProvider(parameters.rpcUrl);

	// Query EIP712 domain from InputVerifier to get the actual verifyingContract address
	const InputVerifierAbi = [
		"function eip712Domain() external view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
	];
	const inputVerifierContract = new (await import("ethers")).Contract(
		parameters.metadata.InputVerifierAddress,
		InputVerifierAbi,
		provider
	);
	const domain = await inputVerifierContract.eip712Domain();
	const verifyingContractAddressInputVerification: `0x${string}` = domain[4];

	const instance = await MockFhevmInstance.create(
		provider,
		provider,
		{
			aclContractAddress: parameters.metadata.ACLAddress,
			chainId: parameters.chainId,
			gatewayChainId: parameters.chainId,
			inputVerifierContractAddress: parameters.metadata.InputVerifierAddress,
			kmsContractAddress: parameters.metadata.KMSVerifierAddress,
			verifyingContractAddressDecryption: parameters.metadata.KMSVerifierAddress,
			verifyingContractAddressInputVerification,
		},
		{
			inputVerifierProperties: {},
			kmsVerifierProperties: {},
		}
	);
	return instance as any;
}


