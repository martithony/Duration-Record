import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed = await deploy("DurationRecord", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  console.log(`DurationRecord deployed at: ${deployed.address}`);
};
export default func;
func.id = "deploy_duration_record"; // id required to prevent reexecution
func.tags = ["DurationRecord"];


