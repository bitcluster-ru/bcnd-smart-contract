const [deployer] = await ethers.getSigners();

console.log("Deploying contracts with the account:", deployer.address);

console.log("Account balance:", (await deployer.getBalance()).toString());

const TokenFactory = await ethers.getContractFactory("BitClusterNordToken");
const token = await TokenFactory.deploy();
console.log("Token address:", token.address);

const CrowdsaleFactory = await ethers.getContractFactory("BitClusterNordCrowdsale");
const crowdsale = await CrowdsaleFactory.deploy(
  token.address,
  ethers.BigNumber.from(Math.round(Date.now() / 1000) + 86400*30),
  100,
  "0x14C446830eC820614BB373b0E33e5f15b024E393",
  "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
  "0xc6fDe3FD2Cc2b173aEC24cc3f267cb3Cd78a26B7"
);
console.log("Crowdsale address:", crowdsale.address);
