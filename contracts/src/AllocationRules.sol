// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library AllocationRules {
    uint16 internal constant BPS = 10_000;
    uint8 internal constant MAX_CONTAINERS = 10;

    function validatePercentages(uint16[] memory percentages) internal pure {
        require(percentages.length > 0 && percentages.length <= MAX_CONTAINERS, "INVALID_CONTAINER_COUNT");
        uint256 total;
        for (uint256 i; i < percentages.length; ++i) total += percentages[i];
        require(total == BPS, "INVALID_PERCENTAGES");
    }

    function amountFor(uint256 amount, uint16 bps, bool last, uint256 allocated) internal pure returns (uint256) {
        return last ? amount - allocated : (amount * bps) / BPS;
    }
}
