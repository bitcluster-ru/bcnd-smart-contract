const { expect } = require("chai");
const hardhat = require("hardhat");
const fs = require("fs");

const provider = hardhat.waffle.provider;
const parseEther = s => ethers.utils.parseEther(String(s));
const parseUnits = ethers.utils.parseUnits;
const parseTokens = s => parseUnits(String(s), 18);
const BigNumber = ethers.BigNumber;

const TEST_BLOCK_TIMESTAMP = 1627543958;
const USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_TREASURY_ADDRESS = "0x5754284f345afc66a98fbb0a0afe71e0f007b949";

describe("BitCluster Nord Crowdsale", () => {

  let token;
  let crowdsale;
  let ethUsdExchangeRate;
  let usdt;

  let owner;
  let output;
  let ethPurchaser;
  let usdtPurchaser;

  let deployCrowdsaleContract = async (endTime) => {
    let CrowdsaleFactory = await ethers.getContractFactory("BitClusterNordCrowdsale");
    return await CrowdsaleFactory.deploy(
      token.address,
      endTime,
      100,
      output.address,
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      USDT_CONTRACT_ADDRESS,
    );
  };

  beforeEach(async () => {
    [owner, output, ethPurchaser, usdtPurchaser] = await ethers.getSigners();
    let TokenFactory = await ethers.getContractFactory("BitClusterNordToken");
    token = await TokenFactory.deploy();

    crowdsale = await deployCrowdsaleContract(
      BigNumber.from(TEST_BLOCK_TIMESTAMP + 3600),
    )
    await token.mint(crowdsale.address, parseTokens(1e6));

    let ethUsdExchangeRateFeed = new ethers.Contract(
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      JSON.parse(fs.readFileSync("test/resources/eth_usd_exchange_rate_feed_abi.json")),
      provider
    );
    ethUsdExchangeRate = (await ethUsdExchangeRateFeed.latestRoundData()).answer;

    usdt = new ethers.Contract(
      USDT_CONTRACT_ADDRESS,
      JSON.parse(fs.readFileSync("test/resources/usdt_abi.json")),
      provider
    );

    // steal some USDT from Tether Treasury :)
    await hardhat.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDT_TREASURY_ADDRESS]
    });
    let tetherTreasury = await ethers.getSigner(USDT_TREASURY_ADDRESS);
    await usdt.connect(tetherTreasury).transfer(usdtPurchaser.address, 1000e6);
    await hardhat.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [USDT_TREASURY_ADDRESS]
    });
  });

  afterEach(async () => {
    // return stolen funds :)
    await usdt.connect(usdtPurchaser).transfer(USDT_TREASURY_ADDRESS, 1000e6);
  });

  it("should set the correct owner", async () => {
    expect(await crowdsale.owner()).equals(owner.address);
  });

  it("should allow buying tokens via ETH transfer", async () => {
    let outputBalanceBefore = await output.getBalance();
    let expectedTokenAmount = parseEther(1).mul(ethUsdExchangeRate).mul(100).div(1e8);
    await expect(ethPurchaser.sendTransaction({ to: crowdsale.address, value: parseEther(1) }))
      .emit(crowdsale, "TokenPurchase").withArgs(ethPurchaser.address, expectedTokenAmount);
    expect(await output.getBalance()).equals(outputBalanceBefore.add(parseEther(1)));
    expect(await token.balanceOf(ethPurchaser.address)).equals(expectedTokenAmount);
    expect(await token.balanceOf(crowdsale.address)).equals(parseTokens(1e6).sub(expectedTokenAmount));
    expect(await crowdsale.remainingSupply()).equals(parseTokens(1e6).sub(expectedTokenAmount));
  });
  it("should allow buying tokens via buyTokensWithETH call", async () => {
    let outputBalanceBefore = await output.getBalance();
    let expectedTokenAmount = parseEther("1.0").mul(ethUsdExchangeRate).mul(100).div(1e8);
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({value: parseEther(1) }))
      .emit(crowdsale, "TokenPurchase").withArgs(ethPurchaser.address, expectedTokenAmount);
    expect(await output.getBalance()).equals(outputBalanceBefore.add(parseEther(1)));
    expect(await token.balanceOf(ethPurchaser.address)).equals(expectedTokenAmount);
    expect(await token.balanceOf(crowdsale.address)).equals(parseTokens(1e6).sub(expectedTokenAmount));
    expect(await crowdsale.remainingSupply()).equals(parseTokens(1e6).sub(expectedTokenAmount));
  });
  it("should allow buying tokes via pre-approved USDT transfer", async () => {
    await usdt.connect(usdtPurchaser).approve(crowdsale.address, 1000e6);
    let expectedTokenAmount = parseTokens(1000 * 100);
    await expect(crowdsale.connect(usdtPurchaser).buyTokensWithUSDT(1000e6))
      .emit(crowdsale, "TokenPurchase").withArgs(usdtPurchaser.address, expectedTokenAmount);
    expect(await token.balanceOf(usdtPurchaser.address)).equals(expectedTokenAmount);
    expect(await usdt.balanceOf(output.address)).equals(1000e6);
    expect(await token.balanceOf(crowdsale.address)).equals(parseTokens(1e6).sub(expectedTokenAmount));
    expect(await crowdsale.remainingSupply()).equals(parseTokens(1e6).sub(expectedTokenAmount));
    // cleanup
    await usdt.connect(output).transfer(usdtPurchaser.address, 1000e6);
  });
  it("should reject token purchase if USDT was not approved", async () => {
    await expect(crowdsale.connect(usdtPurchaser).buyTokensWithUSDT(1000e6)).reverted;
  });

  it("should reject token purchase after sale has ended", async () => {
    crowdsale = await deployCrowdsaleContract(BigNumber.from(TEST_BLOCK_TIMESTAMP - 3600));
    await token.mint(crowdsale.address, parseTokens(1e6));
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({ value: parseEther(1) })).reverted;
  });

  it("should reject purchase of zero tokens", async () => {
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({ value: 0 })).reverted;
  });
  it("should reject token purchase exceeding available crowdsale supply", async () => {
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({ value: parseEther(10) })).reverted;
  });

  it("should allow withdrawal of crowdsale funds for the owner account", async () => {
    await crowdsale.connect(owner).withdrawAnyERC20Token(token.address, owner.address, parseTokens(100e3));
    expect(await token.balanceOf(crowdsale.address)).equals(parseTokens(900e3));
    expect(await crowdsale.remainingSupply()).equals(parseTokens(900e3));
    expect(await token.balanceOf(owner.address)).equals(parseTokens(100e3));
  });
  it("should forbid withdrawal of crowdsale funds for non-owner account", async () => {
    await expect(crowdsale.connect(ethPurchaser).withdrawAnyERC20Token(token.address, ethPurchaser.address, parseTokens(100e3))).reverted;
  });

  it("should allow extraction of tokens sent by mistake", async () => {
    await usdt.connect(usdtPurchaser).transfer(crowdsale.address, 100e6);
    expect(await usdt.balanceOf(crowdsale.address)).equals(100e6);
    await crowdsale.connect(owner).withdrawAnyERC20Token(usdt.address, owner.address, 100e6);
    expect(await usdt.balanceOf(crowdsale.address)).equals(0);
    expect(await usdt.balanceOf(owner.address)).equals(100e6);
    // cleanup
    await usdt.connect(owner).transfer(usdtPurchaser.address, 100e6);
  });
  it("should forbid extraction of tokens sent by mistake from non-owner account", async () => {
    await usdt.connect(usdtPurchaser).transfer(crowdsale.address, 100e6);
    expect(await usdt.balanceOf(crowdsale.address)).equals(100e6);
    await expect(crowdsale.connect(ethPurchaser).withdrawAnyERC20Token(usdt.address, ethPurchaser.address, 100e6)).reverted;
    // cleanup
    await crowdsale.connect(owner).withdrawAnyERC20Token(usdt.address, usdtPurchaser.address, 100e6);
  });

  it("should allow updating output wallet", async () => {
    await expect(crowdsale.setOutputWallet(owner.address))
      .emit(crowdsale, "OutputWalletUpdate").withArgs(owner.address);
    let ownerBalanceBefore = await owner.getBalance();
    let outputBalanceBefore = await output.getBalance();
    await crowdsale.connect(ethPurchaser).buyTokensWithETH({ value: parseEther(1) });
    expect(await output.getBalance()).equals(outputBalanceBefore);
    expect(await owner.getBalance()).equals(ownerBalanceBefore.add(parseEther(1)));
  });
  it("should forbid updating output wallet for non-owner", async () => {
    await expect(crowdsale.connect(ethPurchaser).setOutputWallet(ethPurchaser.address)).reverted;
  });

  it("should reject token purchases if contract is paused", async () => {
    await crowdsale.pause();
    let outputBalanceBefore = await output.getBalance();
    let purchaserBalanceBefore = await ethPurchaser.getBalance();
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({ value: parseEther(1) })).reverted;
    expect(await output.getBalance()).equals(outputBalanceBefore);
  });
  it("should allow token purchases after unpausing the contract", async () => {
    await crowdsale.pause();
    await crowdsale.unpause();
    await expect(crowdsale.connect(ethPurchaser).buyTokensWithETH({value: parseEther(1) }))
      .emit(crowdsale, "TokenPurchase");
  });
  it("should forbid pausing for non-owner account", async () => {
    await expect(crowdsale.connect(ethPurchaser).pause()).reverted;
  });
  it("should forbid un-pausing from non-owner account", async () => {
    await crowdsale.pause();
    await expect(crowdsale.connect(ethPurchaser).unpause()).reverted;
  });

  it("should allow transfer of ownership to another account", async () => {
    await expect(crowdsale.transferOwnership(output.address))
      .emit(crowdsale, "OwnershipTransferred").withArgs(owner.address, output.address);
  });
  it("should allow new owner access to owner-only tools", async () => {
    await crowdsale.transferOwnership(output.address);
    await crowdsale.connect(output).pause();
    await crowdsale.connect(output).unpause();
    await crowdsale.connect(output).withdrawAnyERC20Token(token.address, output.address, parseTokens(100e3));
  });
  it("should forbid transfer of ownership by non-owner account", async () => {
    await expect(crowdsale.connect(ethPurchaser).transferOwnership(output.address)).reverted;
  });

});
