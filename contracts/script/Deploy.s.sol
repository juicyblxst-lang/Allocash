// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SelfControlWalletFactory} from "../src/SelfControlWallet.sol";

contract Deploy is Script {
    function run() external returns (SelfControlWalletFactory factory) {
        address owner = vm.envAddress("DEPLOY_OWNER");
        vm.startBroadcast();
        factory = new SelfControlWalletFactory();
        vm.stopBroadcast();
        console2.log("SelfControlWalletFactory", address(factory));
        console2.log("Configured owner", owner);
    }
}
