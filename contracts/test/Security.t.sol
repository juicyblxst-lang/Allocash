// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SelfControlVault} from "../src/SelfControlVault.sol";
import {SelfControlWallet,SelfControlWalletFactory} from "../src/SelfControlWallet.sol";

contract SecurityTest is Test {
    SelfControlVault vault;
    SelfControlWalletFactory factory;
    address controller=address(0xCAFE);
    address attacker=address(0xBAD);
    address recipient=address(0xBEEF);

    function setUp() public { vault=new SelfControlVault(controller); factory=new SelfControlWalletFactory(); vm.deal(address(this),100 ether); }

    function presetWithLock(uint64 lockDuration) internal returns(uint256 id){
        SelfControlVault.Container[] memory cs=new SelfControlVault.Container[](2);
        cs[0]=SelfControlVault.Container("Locked",5000,lockDuration,SelfControlVault.Priority.High,true);
        cs[1]=SelfControlVault.Container("Free Money",5000,0,SelfControlVault.Priority.Medium,true);
        vm.prank(controller); id=vault.createPreset("Test",cs);
    }

    function fund() internal { (bool ok,)=address(vault).call{value:1 ether}(""); assertTrue(ok); }

    function testUnauthorizedAllocationUnlockAndWithdrawAreRejected() public {
        uint256 pid=presetWithLock(1 days); fund();
        vm.prank(attacker); vm.expectRevert(SelfControlVault.Unauthorized.selector); vault.applyPreset(1,pid);
        vm.prank(controller); vault.applyPreset(1,pid);
        uint256 aid=vault.paymentAllocations(1)[0];
        vm.prank(attacker); vm.expectRevert(SelfControlVault.Unauthorized.selector); vault.unlockAllocation(aid);
        vm.prank(attacker); vm.expectRevert(SelfControlVault.Unauthorized.selector); vault.withdraw(aid,payable(recipient),0.5 ether);
    }

    function testLockBoundaryIsEnforced() public {
        uint256 pid=presetWithLock(1 days); fund(); vm.prank(controller); vault.applyPreset(1,pid);
        uint256 aid=vault.paymentAllocations(1)[0];
        vm.prank(controller); vm.expectRevert(SelfControlVault.UnlockNotReady.selector); vault.unlockAllocation(aid);
        vm.warp(block.timestamp+1 days-1); vm.prank(controller); vm.expectRevert(SelfControlVault.UnlockNotReady.selector); vault.unlockAllocation(aid);
        vm.warp(block.timestamp+1); vm.prank(controller); vault.unlockAllocation(aid);
        vm.prank(controller); vault.withdraw(aid,payable(recipient),0.5 ether);
        assertEq(recipient.balance,0.5 ether);
    }

    function testTemporaryLockExactExpiryAndFifteenMinuteBoundary() public {
        fund(); vm.prank(controller); vault.temporaryLock(1);
        vm.warp(block.timestamp+1 hours-1);
        vm.expectRevert(SelfControlVault.NotExpired.selector); vault.expireTemporaryLock(1);
        vm.warp(block.timestamp+1); vault.expireTemporaryLock(1);
        vm.warp(block.timestamp+15 minutes-1);
        vm.expectRevert(SelfControlVault.NotExpired.selector); vault.autoTemporaryRelock(1);
        vm.warp(block.timestamp+1); vault.autoTemporaryRelock(1);
        assertEq(uint8(vault.payments(1).state),uint8(SelfControlVault.PaymentState.TemporarilyLocked));
    }

    function testRepeatedRelockCanRepeat() public {
        fund(); vm.prank(controller); vault.temporaryLock(1);
        vm.warp(block.timestamp+SelfControlVault.ONE_HOUR()+SelfControlVault.RELOCK_AFTER_15_MIN());
        vault.autoTemporaryRelock(1);
        vm.warp(block.timestamp+SelfControlVault.ONE_HOUR()+SelfControlVault.RELOCK_AFTER_15_MIN());
        vault.autoTemporaryRelock(1);
        assertGt(vault.payments(1).temporaryUnlockAt,block.timestamp);
    }

    function testPerPaymentIsolation() public {
        uint256 pid=presetWithLock(0);
        fund(); fund();
        vm.prank(controller); vault.applyPreset(1,pid);
        assertEq(uint8(vault.payments(2).state),uint8(SelfControlVault.PaymentState.PendingDecision));
        assertEq(vault.payments(2).allocationCount,0);
        assertEq(vault.payments(1).allocationCount,2);
    }

    function testZeroAmountAndInvalidPercentagesAreRejected() public {
        vm.expectRevert(SelfControlVault.ZeroAmount.selector); vault.recordIncoming{value:0}();
        SelfControlVault.Container[] memory cs=new SelfControlVault.Container[](2);
        cs[0]=SelfControlVault.Container("A",4000,0,SelfControlVault.Priority.Medium,true);
        cs[1]=SelfControlVault.Container("B",5000,0,SelfControlVault.Priority.Medium,true);
        vm.prank(controller); vm.expectRevert(SelfControlVault.InvalidPercentages.selector); vault.createPreset("Bad",cs);
    }

    function testArchiveRequiresReasonAndNoActiveFunds() public {
        uint256 pid=presetWithLock(0);
        vm.prank(controller); vm.expectRevert(SelfControlVault.ActiveFunds.selector); vault.archivePreset(pid,"");
        fund(); vm.prank(controller); vault.applyPreset(1,pid);
        vm.prank(controller); vm.expectRevert(SelfControlVault.ActiveFunds.selector); vault.archivePreset(pid,"used");
    }

    function testPresetRulesRemainImmutableAcrossLifecycleChanges() public {
        uint256 pid=presetWithLock(0);
        (SelfControlVault.Preset memory p,SelfControlVault.Container[] memory cs)=vault.preset(pid);
        assertEq(p.name,"Test"); assertEq(cs.length,2); assertEq(cs[0].percentage,5000); assertEq(cs[1].percentage,5000);
        vm.prank(controller); vault.archivePreset(pid,"retired");
        (,SelfControlVault.Container[] memory afterArchive)=vault.preset(pid);
        assertEq(afterArchive[0].percentage,5000); assertEq(afterArchive[1].percentage,5000);
    }

    function testDeleteDoesNotEraseChainRecordAndBlocksActiveFunds() public {
        uint256 pid=presetWithLock(0); fund(); vm.prank(controller); vault.applyPreset(1,pid);
        vm.prank(controller); vm.expectRevert(SelfControlVault.ActiveFunds.selector); vault.deletePreset(pid);
        uint256 aid=vault.paymentAllocations(1)[0]; vm.prank(controller); vault.withdraw(aid,payable(recipient),0.5 ether);
        uint256 aid2=vault.paymentAllocations(1)[1]; vm.prank(controller); vault.withdraw(aid2,payable(recipient),0.5 ether);
        vm.prank(controller); vault.deletePreset(pid);
        (SelfControlVault.Preset memory p,)=vault.preset(pid); assertTrue(p.deleted); assertEq(vault.payments(1).allocationCount,2);
    }

    function testWalletCannotBeUsedByAttackerAndIsBoundToVault() public {
        (address wallet,address v)=factory.createWallet(controller);
        assertEq(SelfControlWallet(payable(wallet)).vault(),v);
        vm.prank(attacker); vm.expectRevert(SelfControlWallet.UnauthorizedExecutor.selector);
        SelfControlWallet(payable(wallet)).executeVault(abi.encodeWithSelector(SelfControlVault.totalProtectedBalance.selector));
        vm.prank(controller); SelfControlWallet(payable(wallet)).executeVault(abi.encodeWithSelector(SelfControlVault.totalProtectedBalance.selector));
    }
}
