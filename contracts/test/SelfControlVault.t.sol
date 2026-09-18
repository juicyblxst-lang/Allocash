// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SelfControlVault} from "../src/SelfControlVault.sol";

contract SelfControlVaultTest is Test {
    SelfControlVault vault;
    address controller = address(0xCAFE);
    address recipient = address(0xBEEF);

    function setUp() public {
        vault = new SelfControlVault(controller);
        vm.deal(address(this), 100 ether);
    }

    function _preset() internal returns (uint256 id) {
        SelfControlVault.Container[] memory cs = new SelfControlVault.Container[](2);
        cs[0] = SelfControlVault.Container("Savings", 3000, 30 days, SelfControlVault.Priority.High, true);
        cs[1] = SelfControlVault.Container("Free Money", 7000, 0, SelfControlVault.Priority.Low, true);
        vm.prank(controller);
        id = vault.createPreset("Salary", cs);
    }

    function testEachIncomingPaymentGetsItsOwnCycle() public {
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        (ok,) = address(vault).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(vault.payments(1).amount, 1 ether);
        assertEq(vault.payments(2).amount, 2 ether);
        assertEq(vault.totalProtectedBalance(), 3 ether);
    }

    function testAllocationIsProportionalAndRemainderIsDeterministic() public {
        uint256 presetId = _preset();
        (bool ok,) = address(vault).call{value: 10 ether}("");
        assertTrue(ok);
        vm.prank(controller);
        vault.applyPreset(1, presetId);
        uint256[] memory ids = vault.paymentAllocations(1);
        assertEq(ids.length, 2);
        assertEq(vault.allocations(ids[0]).amount, 3 ether);
        assertEq(vault.allocations(ids[1]).amount, 7 ether);
    }

    function testElevenContainersReverts() public {
        SelfControlVault.Container[] memory cs = new SelfControlVault.Container[](11);
        for (uint256 i; i < 11; ++i) cs[i] = SelfControlVault.Container("x", 909, 0, SelfControlVault.Priority.Medium, true);
        vm.prank(controller);
        vm.expectRevert(SelfControlVault.TooManyContainers.selector);
        vault.createPreset("Too many", cs);
    }

    function testTemporaryLockRequiresOneHourAndCanRepeatAfterFifteenMinutes() public {
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        vm.prank(controller);
        vault.temporaryLock(1);
        vm.warp(block.timestamp + 1 hours);
        vault.expireTemporaryLock(1);
        vm.warp(block.timestamp + 14 minutes + 59 seconds);
        vm.expectRevert(SelfControlVault.NotExpired.selector);
        vault.autoTemporaryRelock(1);
        vm.warp(block.timestamp + 1);
        vault.autoTemporaryRelock(1);
        assertEq(uint8(vault.payments(1).state), uint8(SelfControlVault.PaymentState.TemporarilyLocked));
    }

    function testLockedAllocationCannotBeWithdrawn() public {
        uint256 presetId = _preset();
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        vm.prank(controller);
        vault.applyPreset(1, presetId);
        uint256[] memory ids = vault.paymentAllocations(1);
        vm.prank(controller);
        vm.expectRevert(SelfControlVault.LockActive.selector);
        vault.withdraw(ids[0], payable(recipient), 0.3 ether);
    }

    function testOnlyControllerCanAllocateAndWithdraw() public {
        uint256 presetId = _preset();
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        vm.expectRevert(SelfControlVault.Unauthorized.selector);
        vault.applyPreset(1, presetId);
    }

    function testArchiveBlockedByActiveFunds() public {
        uint256 presetId = _preset();
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertTrue(ok);
        vm.prank(controller);
        vault.applyPreset(1, presetId);
        vm.prank(controller);
        vm.expectRevert(SelfControlVault.ActiveFunds.selector);
        vault.archivePreset(presetId, "no longer used");
    }
}
