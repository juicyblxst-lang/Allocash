// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {SignerECDSA} from "@openzeppelin/contracts/utils/cryptography/signers/SignerECDSA.sol";
import {SelfControlVault} from "./SelfControlVault.sol";

/// @dev ERC-4337 smart account whose only execution target is its immutable-in-practice vault.
/// The owner ECDSA signer authorizes UserOperations; the backend/agent has no signing capability.
contract SelfControlWallet is Account, SignerECDSA {
    address public vault;
    address public immutable factory;

    error FactoryOnly();
    error InvalidVault();

    constructor(address owner_) SignerECDSA(owner_) {
        if (owner_ == address(0)) revert InvalidVault();
        factory = msg.sender;
    }

    function initializeVault(address vault_) external {
        if (msg.sender != factory) revert FactoryOnly();
        if (vault != address(0) || vault_ == address(0)) revert InvalidVault();
        vault = vault_;
    }

    function executeVault(bytes calldata data) external onlyEntryPointOrSelf returns (bytes memory result) {
        if (vault == address(0)) revert InvalidVault();
        (bool ok, bytes memory returndata) = vault.call(data);
        if (!ok) assembly { revert(add(returndata, 32), mload(returndata)) }
        return returndata;
    }
}

contract SelfControlWalletFactory {
    event WalletCreated(address indexed owner, address indexed wallet, address indexed vault);

    function createWallet(address owner) external returns (address wallet, address vault) {
        SelfControlWallet w = new SelfControlWallet(owner);
        SelfControlVault v = new SelfControlVault(address(w));
        w.initializeVault(address(v));
        wallet = address(w);
        vault = address(v);
        emit WalletCreated(owner, wallet, vault);
    }
}
