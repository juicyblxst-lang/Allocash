// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {SignerECDSA} from "@openzeppelin/contracts/utils/cryptography/signers/SignerECDSA.sol";
import {SelfControlVault} from "./SelfControlVault.sol";

/// @dev ERC-4337 smart account constrained to its own vault. V1 also permits the
/// ECDSA owner to submit a normal wallet transaction directly; this keeps testnet
/// operation usable without trusting a bundler while retaining ERC-4337 support.
contract SelfControlWallet is Account, SignerECDSA {
    address public vault;
    address public immutable factory;

    error FactoryOnly();
    error InvalidVault();
    error UnauthorizedExecutor();

    constructor(address owner_) SignerECDSA(owner_) {
        if (owner_ == address(0)) revert InvalidVault();
        factory = msg.sender;
    }

    function initializeVault(address vault_) external {
        if (msg.sender != factory) revert FactoryOnly();
        if (vault != address(0) || vault_ == address(0)) revert InvalidVault();
        vault = vault_;
    }

    function executeVault(bytes calldata data) external returns (bytes memory result) {
        if (vault == address(0)) revert InvalidVault();
        if (msg.sender != signer() && msg.sender != address(entryPoint()) && msg.sender != address(this)) {
            revert UnauthorizedExecutor();
        }
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
