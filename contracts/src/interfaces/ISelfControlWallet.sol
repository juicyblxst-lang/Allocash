// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISelfControlWallet {
    function vault() external view returns (address);
    function executeVault(bytes calldata data) external returns (bytes memory);
}
