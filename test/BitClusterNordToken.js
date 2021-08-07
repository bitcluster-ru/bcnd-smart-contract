const { expect } = require("chai");
const hardhat = require("hardhat");
const fs = require("fs");

const provider = hardhat.waffle.provider;
const parseEther = ethers.utils.parseEther;

const USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_TREASURY_ADDRESS = "0x5754284f345afc66a98fbb0a0afe71e0f007b949";

describe("BitCluster Nord Token", () => {
  let token;

  let owner;
  let addr1;
  let addr2;

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    let TokenFactory = await ethers.getContractFactory("BitClusterNordToken");
    token = await TokenFactory.deploy();
  });

  describe("Base token functionality", () => {
    it("should set the correct owner", async () => {
      expect(await token.owner()).equals(owner.address);
    });

    it("should forbid sending ETH directly to the smart-contract", async () => {
      await expect(addr1.sendTransaction({
        to: token.address,
        value: parseEther("1.0")
      })).reverted;
    });

    it("should allow minting of tokens to the owner", async () => {
      await token.mint(owner.address, 42);
      expect(await token.balanceOf(owner.address)).equals(42);
    });
    it("should forbid minting for non-owners", async () => {
      await expect(token.connect(addr1).mint(addr2.address, 42)).reverted;
    });
    it("should forbid minting to zero address", async () => {
      await expect(token.mint(ethers.constants.AddressZero, 42)).reverted;
    });
    it("should allow minting of tokens to the non-owner account", async () => {
      await token.mint(addr1.address, 42);
      expect(await token.balanceOf(addr1.address)).equals(42);
    });
    it("should emit mint event", async () => {
      await expect(token.mint(owner.address, 42))
        .emit(token, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, 42);
    });

    it("should allow transfers between non-owner addresses, and emit corresponding event", async () => {
      await token.mint(addr1.address, 42);
      expect(await token.balanceOf(addr1.address)).equals(42);
      await expect(token.connect(addr1).transfer(addr2.address, 20))
        .emit(token, "Transfer")
        .withArgs(addr1.address, addr2.address, 20);
      expect(await token.balanceOf(addr1.address)).equals(22);
      expect(await token.balanceOf(addr2.address)).equals(20);
    });
    it("should forbid transfers from accounts with zero balance", async () => {
      expect(await token.balanceOf(addr1.address)).equals(0);
      await expect(token.connect(addr1).transfer(addr2.address, 42)).reverted;
    });
    it("should forbid transfers from accounts with insufficient balance", async () => {
      await token.mint(addr1.address, 42);
      await expect(token.connect(addr1).transfer(addr2.address, 100)).reverted;
      expect(await token.balanceOf(addr1.address)).equals(42);
      expect(await token.balanceOf(addr2.address)).equals(0);
    });
    it("should forbid transfers to zero account", async () => {
      await token.mint(addr1.address, 42);
      await expect(token.transfer(ethers.constants.AddressZero, 42)).reverted;
    });

    it("should allow pull-style transfers", async () => {
      await token.mint(owner.address, 42);
      await token.increaseAllowance(addr1.address, 21);
      await expect(token.connect(addr1).transferFrom(owner.address, addr1.address, 22)).reverted;
      await token.connect(addr1).transferFrom(owner.address, addr1.address, 21);
      expect(await token.balanceOf(owner.address)).equals(21);
      expect(await token.balanceOf(addr1.address)).equals(21);
    });
    it("should allow pull-style transfers (via approve, deprecated way)", async () => {
      await token.mint(owner.address, 42);
      await token.approve(addr1.address, 21);
      await expect(token.connect(addr1).transferFrom(owner.address, addr1.address, 22)).reverted;
      await token.connect(addr1).transferFrom(owner.address, addr1.address, 21);
      expect(await token.balanceOf(owner.address)).equals(21);
      expect(await token.balanceOf(addr1.address)).equals(21);
    });
    it("should handle decreasing allowance correctly", async () => {
      await token.mint(owner.address, 42);
      await token.increaseAllowance(addr1.address, 21);
      await token.connect(addr1).transferFrom(owner.address, addr1.address, 10);
      await token.decreaseAllowance(addr1.address, 2);
      await expect(token.decreaseAllowance(addr1.address, 30)).reverted;
      await expect(token.connect(addr1).transferFrom(owner.address, addr1.address, 10)).reverted;
      await token.connect(addr1).transferFrom(owner.address, addr1.address, 9);
      expect(await token.balanceOf(owner.address)).equals(23);
      expect(await token.balanceOf(addr1.address)).equals(19);
    });
    it("should revert transfers from the zero address", async () => {
      await expect(token.transferFrom(ethers.constants.AddressZero, owner.address, 0)).reverted
    });

    it("should allow burning the tokens for the owner account", async () => {
      await token.mint(owner.address, 42);
      await token.burn(21);
      expect(await token.balanceOf(owner.address)).equals(21);
    });
    it("should forbid burning the tokens with insufficient balance", async () => {
      await expect(token.connect(addr1).burn(42)).reverted;
    });
    it("should allow burning the tokens for the non-owner account", async () => {
      await token.mint(addr1.address, 42);
      await token.connect(addr1).burn(21);
      expect(await token.balanceOf(addr1.address)).equals(21);
    });
    it("should allow burning the tokens after another account allowed them", async () => {
      await token.mint(owner.address, 42);
      await token.increaseAllowance(addr1.address, 21);
      await expect(token.connect(addr1).burnFrom(owner.address, 28)).reverted;
      await token.connect(addr1).burnFrom(owner.address, 14);
      expect(await token.balanceOf(owner.address)).equals(28);
    });

    it("should report current owner", async () => {
      expect(await token.owner()).equals(owner.address);
    });
    it("should allow transfer of ownership to another account", async () => {
      await token.transferOwnership(addr1.address);
      expect(await token.owner()).equals(addr1.address);
    });
    it("should forbid transfer of ownership to zero account", async () => {
      await expect(token.transferOwnership(ethers.constants.AddressZero)).reverted;
    });
    it("should forbid transfer of ownership from non-owner account", async () => {
      await expect(token.connect(addr1).transferOwnership(addr1.address)).reverted;
    });
    it("should allow new owner access to admin actions", async () => {
      await token.transferOwnership(addr1.address);
      await token.connect(addr1).mint(addr1.address, 42);
      expect(await token.balanceOf(addr1.address)).equals(42);
    });
    it("should forbid old owner access to admin actions", async () => {
      await token.transferOwnership(addr1.address);
      await expect(token.mint(owner.address, 42)).reverted;
    });
    it("should allow renouncing the ownership", async () => {
      await token.renounceOwnership();
      await expect(token.mint(owner.address, 42)).reverted;
      await expect(token.mint(addr1.address, 42)).reverted;
    });

    it("should revert transfers after pausing", async () => {
      await token.mint(addr1.address, 42);
      await token.pause();
      await expect(token.connect(addr1).transfer(addr2.address, 21)).reverted;
    });
    it("should allow transfers after un-pausing", async () => {
      await token.mint(addr1.address, 42);
      await token.pause();
      await token.unpause();
      await token.connect(addr1).transfer(addr2.address, 21);
      expect(await token.balanceOf(addr2.address)).equals(21);
    });
    it("should forbid pausing from non-owner account", async () => {
      await expect(token.connect(addr1).pause()).reverted;
    });
    it("should forbid un-pausing from non-owner account", async () => {
      await token.pause();
      await expect(token.connect(addr1).unpause()).reverted;
    });
    it("should forbid double-pausing", async () => {
      await token.pause();
      await expect(token.pause()).reverted;
    });
    it("should forbid unpausing non-paused contract", async () => {
      await expect(token.unpause()).reverted;
    });
  });

  describe("Custom token functionality", () => {
    it("should return token name and symbol", async () => {
      expect(await token.name()).equals("BitCluster Nord");
      expect(await token.symbol()).equals("BCND");
      expect(await token.decimals()).equals(18);
    });
    it("should return current total supply", async () => {
      expect(await token.totalSupply()).equals(0);
      await token.mint(owner.address, 42);
      expect(await token.totalSupply()).equals(42);
      await token.mint(owner.address, 42);
      expect(await token.totalSupply()).equals(84);
      await token.burn(42);
      expect(await token.totalSupply()).equals(42);
      await token.transfer(addr1.address, 42);
      expect(await token.totalSupply()).equals(42);
      await token.connect(addr1).burn(42);
      expect(await token.totalSupply()).equals(0);
    });

    it("should set btc payout address and return the same string after", async () => {
      await token.connect(addr1).setBtcPayoutAddress("deadbeef");
      expect(await token.getBtcPayoutAddressOf(addr1.address)).equals("deadbeef");
      expect(await token.getBtcPayoutAddressOf(addr2.address)).equals("");
    });
    it("setting btc payout address should emit the corresponding event", async () => {
      await expect(token.connect(addr1).setBtcPayoutAddress("deadbeef"))
        .emit(token, "SetBtcPayoutAddress")
        .withArgs(addr1.address, "deadbeef");
    });

    it("should allow extracting USDT that was mistakenly sent to the token contract", async () => {
      let usdt = new ethers.Contract(
        USDT_CONTRACT_ADDRESS,
        JSON.parse(fs.readFileSync("test/resources/usdt_abi.json")),
        provider
      );
      expect(await usdt.balanceOf(addr1.address)).equals(0);

      // steal some USDT from Tether Treasury :)
      await hardhat.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [USDT_TREASURY_ADDRESS]
      });
      let tetherTreasury = await ethers.getSigner(USDT_TREASURY_ADDRESS);
      await usdt.connect(tetherTreasury).transfer(addr1.address, 1000e6);
      expect(await usdt.balanceOf(addr1.address)).equals(1000e6);
      await hardhat.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [USDT_TREASURY_ADDRESS]
      });

      await usdt.connect(addr1).transfer(token.address, 500e6);
      expect(await usdt.balanceOf(token.address)).equals(500e6);

      await token.withdrawAnyERC20Token(usdt.address, owner.address, 500e6);
      expect(await usdt.balanceOf(token.address)).equals(0);
      expect(await usdt.balanceOf(owner.address)).equals(500e6);

      // cleanup
      await usdt.connect(owner).transfer(USDT_TREASURY_ADDRESS, 500e6);
      await usdt.connect(addr1).transfer(USDT_TREASURY_ADDRESS, 500e6);
    });
  });

});
