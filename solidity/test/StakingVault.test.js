const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingVault", function () {
  async function deployFixture() {
    const [owner, attacker] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy(ethers.parseEther("1000000"));
    const StakingVault = await ethers.getContractFactory("StakingVault");
    const vault = await StakingVault.deploy(await token.getAddress(), 1e12); // 0.0001 per second
    await token.transfer(vault.getAddress(), ethers.parseEther("100000"));
    return { vault, token, owner, attacker };
  }

  it("should stake and update balance", async function () {
    const { vault, token, owner } = await loadFixture(deployFixture);
    await token.approve(vault.getAddress(), ethers.parseEther("100"));
    await vault.stake(ethers.parseEther("100"));
    expect(await vault.getStakedBalance(owner.address)).to.equal(ethers.parseEther("100"));
  });

  it("should prevent reentrancy in withdraw", async function () {
    const { vault, token, owner, attacker } = await loadFixture(deployFixture);

    // Deploy attacker contract
    const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttackerStaking");
    const attackerContract = await ReentrancyAttacker.deploy(vault.getAddress());

    // Fund attacker with staking tokens
    await token.transfer(attacker.address, ethers.parseEther("1000"));
    await token.connect(attacker).transfer(attackerContract.getAddress(), ethers.parseEther("100"));

    // Attacker tries to reenter withdraw — should fail
    await expect(
      attackerContract.connect(attacker).attack(ethers.parseEther("50"))
    ).to.be.revertedWithCustomError(vault, "EnforcedPause")
     .or.to.be.revertedWith("ReentrancyGuard: reentrant call");
  });

  it("should prevent reentrancy in claimRewards", async function () {
    const { vault, token, owner, attacker } = await loadFixture(deployFixture);
    const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttackerRewards");
    const attackerContract = await ReentrancyAttacker.deploy(vault.getAddress());
    await token.transfer(attacker.address, ethers.parseEther("1000"));
    await token.connect(attacker).transfer(attackerContract.getAddress(), ethers.parseEther("100"));
    // Stake first so rewards accumulate
    await token.connect(attacker).approve(vault.getAddress(), ethers.parseEther("100"));
    await attackerContract.connect(attacker).stakeAndAttack(ethers.parseEther("100"));
    // Fast forward time
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    // claimRewards reentrancy attempt should revert
    await expect(attackerContract.connect(attacker).attackClaim()).to.be.reverted;
  });

  it("should update state before external call in withdraw", async function () {
    const { vault, token, owner } = await loadFixture(deployFixture);
    await token.approve(vault.getAddress(), ethers.parseEther("200"));
    await vault.stake(ethers.parseEther("100"));
    await vault.withdraw(ethers.parseEther("50"));
    expect(await vault.getStakedBalance(owner.address)).to.equal(ethers.parseEther("50"));
  });

  it("should update state before external call in claimRewards", async function () {
    const { vault, token, owner } = await loadFixture(deployFixture);
    await token.approve(vault.getAddress(), ethers.parseEther("100"));
    await vault.stake(ethers.parseEther("100"));
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");
    await vault.claimRewards();
    expect(await vault.rewards(owner.address)).to.equal(0);
  });
});
