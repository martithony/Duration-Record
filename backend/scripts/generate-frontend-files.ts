import "hardhat-deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as fs from "fs";
import * as path from "path";

/**
 * 从 deployments 目录中自动读取合约部署（支持 localhost 与 sepolia），
 * 并更新前端的地址与 ABI 文件。若未找到任何部署则优雅跳过。
 */
async function main() {
  const hre = require("hardhat") as HardhatRuntimeEnvironment;

  const contractName = "DurationRecord";

  const networks = [
    { key: "localhost", chainId: 31337, chainName: "Localhost" },
    { key: "sepolia", chainId: 11155111, chainName: "Sepolia" },
  ] as const;

  type DeploymentInfo = {
    key: string;
    address: string;
    chainId: number;
    chainName: string;
  };

  const found: DeploymentInfo[] = [];

  // 1) 首先尝试从 deployments/<network>/<contract>.json 读取
  for (const net of networks) {
    const deploymentFile = path.join(
      hre.config.paths.root,
      "deployments",
      net.key,
      `${contractName}.json`
    );
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
      if (deployment?.address) {
        found.push({
          key: net.key,
          address: deployment.address,
          chainId: net.chainId,
          chainName: net.chainName,
        });
        console.log(
          `Found deployment from file: ${contractName} at ${deployment.address} on ${net.key} (${net.chainId})`
        );
      }
    }
  }

  // 2) 若文件未找到对应网络，再尝试通过 hardhat-deploy API 获取当前网络的部署
  if (!found.some((f) => f.key === hre.network.name)) {
    try {
      const hreWithDeploy = hre as HardhatRuntimeEnvironment & {
        deployments: { get: (name: string) => Promise<any> };
        getChainId: () => Promise<string>;
      };
      const dep = await hreWithDeploy.deployments.get(contractName);
      const currentChainId = Number(await hreWithDeploy.getChainId());
      const known = networks.find((n) => n.chainId === currentChainId);
      if (dep?.address && known) {
        found.push({
          key: known.key,
          address: dep.address,
          chainId: known.chainId,
          chainName: known.chainName,
        });
        console.log(
          `Found deployment from HRE: ${contractName} at ${dep.address} on ${known.key} (${known.chainId})`
        );
      }
    } catch {
      // ignore
    }
  }

  if (found.length === 0) {
    console.log(
      `No deployments found for ${contractName} on localhost or sepolia. Skipping...`
    );
    return;
  }

  // 读取合约 ABI
  const artifactPath = path.join(
    hre.config.paths.artifacts,
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    console.log(`Artifact not found at ${artifactPath}. Please compile first.`);
    return;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;

  // 读取并合并已有地址
  const addressesFilePath = path.join(
    __dirname,
    "../../frontend/src/config/addresses.ts"
  );
  let existingAddresses: Record<
    string,
    { address: string; chainId: number; chainName: string }
  > = {};

  if (fs.existsSync(addressesFilePath)) {
    const fileContent = fs.readFileSync(addressesFilePath, "utf8");
    const regex =
      /"(\d+)":\s*{\s*address:\s*"([^"]+)"[^}]*chainId:\s*(\d+)[^}]*chainName:\s*"([^"]+)"[^}]*}/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
      const [, chainId, address, chainIdNum, chainName] = match;
      existingAddresses[chainId] = {
        address,
        chainId: parseInt(chainIdNum),
        chainName,
      };
    }
  }

  // 写入/更新找到的各网络地址
  for (const d of found) {
    existingAddresses[d.chainId.toString()] = {
      address: d.address,
      chainId: d.chainId,
      chainName: d.chainName,
    };
  }

  const addressesContent = `export const CONTRACT_ADDRESSES: Record<string, { address: \`0x\${string}\`; chainId: number; chainName: string }> = {
${Object.entries(existingAddresses)
  .map(
    ([chainId, data]) => `  "${chainId}": { 
    address: "${data.address}" as \`0x\${string}\`, 
    chainId: ${data.chainId}, 
    chainName: "${data.chainName}" 
  }`
  )
  .join(",\n")},
};
`;

  const abiContent = `export const ${contractName}ABI = ${JSON.stringify(
    abi,
    null,
    2
  )} as const;
`;

  fs.writeFileSync(addressesFilePath, addressesContent, "utf8");
  console.log(`✓ Updated ${addressesFilePath}`);

  const abiFilePath = path.join(
    __dirname,
    "../../frontend/src/abi/DurationRecordABI.ts"
  );
  fs.writeFileSync(abiFilePath, abiContent, "utf8");
  console.log(`✓ Updated ${abiFilePath}`);

  console.log(
    `\nSuccessfully generated frontend files for ${contractName}: ${found
      .map((f) => `${f.chainName}(${f.chainId})`)
      .join(", ")}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

