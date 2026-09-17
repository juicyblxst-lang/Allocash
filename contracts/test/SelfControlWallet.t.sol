// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SelfControlWallet, SelfControlWalletFactory} from "../src/SelfControlWallet.sol";
import {SelfControlVault} from "../src/SelfControlVault.sol";

contract SelfControlWalletTest is Test {
    SelfControlWalletFactory factory;
    address owner = address(0x1234);
    address attacker = address(0x9999);

    function setUp() public { factory = new SelfControlWalletFactory(); }

    function testFactoryCreatesDedicatedWalletAndVault() public {
        (address wallet, address vault) = factory.createWallet(owner);
        assertEq(SelfControlWallet(payable(wallet)).vault(), vault);
        assertEq(SelfControlVault(payable(vault)).controller(), wallet);
        assertEq(SelfControlWallet(payable(wallet)).signer(), owner);
    }

    function testOnlyOwnerCanDirectlyExecuteVault() public {
        (address wallet,) = factory.createWallet(owner);
        vm.prank(attacker);
        vm.expectRevert(SelfControlWallet.UnauthorizedExecutor.selector);
        SelfControlWallet(payable(wallet)).executeVault(abi.encodeWithSelector(SelfControlVault.totalProtectedBalance.selector));
    }
}
