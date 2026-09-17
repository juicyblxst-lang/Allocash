// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AllocationRules} from "../src/AllocationRules.sol";

contract AllocationRulesTest is Test {
    function testFuzzLastContainerReceivesRemainder(uint128 amount, uint16 firstBps) public {
        firstBps = uint16(bound(firstBps, 1, 9999));
        uint256 first = AllocationRules.amountFor(amount, firstBps, false, 0);
        uint256 last = AllocationRules.amountFor(amount, uint16(10000-firstBps), true, first);
        assertEq(first + last, amount);
    }

    function testPercentagesMustSumTo10000() public {
        uint16[] memory good = new uint16[](2);
        good[0] = 2500; good[1] = 7500;
        AllocationRules.validatePercentages(good);
    }

    function testInvalidContainerCountReverts() public {
        uint16[] memory empty = new uint16[](0);
        vm.expectRevert();
        AllocationRules.validatePercentages(empty);
    }
}
