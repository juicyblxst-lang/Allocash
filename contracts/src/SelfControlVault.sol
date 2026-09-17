// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AllocationRules} from "./AllocationRules.sol";

contract SelfControlVault is ReentrancyGuard {
    uint256 public constant ONE_HOUR = 1 hours;
    uint256 public constant REMINDER_5_MIN = 5 minutes;
    uint256 public constant REMINDER_10_MIN = 10 minutes;
    uint256 public constant RELOCK_AFTER_15_MIN = 15 minutes;
    uint16 public constant BPS = 10_000;
    uint8 public constant MAX_CONTAINERS = 10;

    enum PaymentState { PendingDecision, TemporarilyLocked, Allocated }
    enum Priority { VeryLow, Low, Medium, High, VeryHigh }

    struct Container { string name; uint16 percentage; uint64 lockDuration; Priority priority; bool exists; }
    struct Preset { string name; uint256 createdAt; bool archived; bool deleted; uint256 activeFunds; string archiveReason; }
    struct Payment { uint256 amount; address payer; uint64 receivedAt; uint64 temporaryUnlockAt; uint64 decisionAt; PaymentState state; uint256 allocationCount; }
    struct Allocation { uint256 paymentId; uint256 presetId; uint8 containerIndex; uint256 amount; uint64 unlockAt; bool unlocked; bool withdrawn; }

    address public immutable controller;
    uint256 public nextPresetId = 1;
    uint256 public nextPaymentId = 1;
    uint256 public nextAllocationId = 1;
    uint256 public totalProtectedBalance;

    mapping(uint256 => Preset) private _presets;
    mapping(uint256 => Container[]) private _containers;
    mapping(uint256 => Payment) public payments;
    mapping(uint256 => Allocation) public allocations;
    mapping(uint256 => uint256[]) private _paymentAllocations;

    event IncomingPayment(uint256 indexed paymentId, address indexed payer, uint256 amount, uint256 receivedAt);
    event PresetCreated(uint256 indexed presetId, string name);
    event PresetArchived(uint256 indexed presetId, string reason);
    event PresetDeleted(uint256 indexed presetId);
    event AllocationCreated(uint256 indexed allocationId, uint256 indexed paymentId, uint256 indexed presetId, uint8 containerIndex, uint256 amount, uint256 unlockAt);
    event TemporaryLockStarted(uint256 indexed paymentId, uint256 amount, uint256 unlockAt);
    event TemporaryLockExpired(uint256 indexed paymentId);
    event TemporaryLockRepeated(uint256 indexed paymentId, uint256 amount, uint256 unlockAt);
    event AllocationUnlocked(uint256 indexed allocationId);
    event Withdrawal(uint256 indexed allocationId, address indexed recipient, uint256 amount);

    error Unauthorized(); error ZeroAmount(); error InvalidPreset(); error InvalidPercentages(); error TooManyContainers();
    error ActiveFunds(); error PaymentNotPending(); error LockActive(); error UnlockNotReady(); error AlreadyUnlocked();
    error AlreadyWithdrawn(); error InvalidRecipient(); error InvalidAmount(); error NotExpired();

    constructor(address controller_) {
        if (controller_ == address(0)) revert Unauthorized();
        controller = controller_;
    }

    modifier onlyController() { if (msg.sender != controller) revert Unauthorized(); _; }

    receive() external payable { _recordIncoming(msg.sender, msg.value); }

    function recordIncoming() external payable returns (uint256 id) {
        return _recordIncoming(msg.sender, msg.value);
    }

    function _recordIncoming(address payer, uint256 amount) internal returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        id = nextPaymentId++;
        payments[id] = Payment(amount, payer, uint64(block.timestamp), 0, uint64(block.timestamp), PaymentState.PendingDecision, 0);
        totalProtectedBalance += amount;
        emit IncomingPayment(id, payer, amount, block.timestamp);
    }

    function createPreset(string calldata name, Container[] calldata input) external onlyController returns (uint256 id) {
        if (bytes(name).length == 0 || input.length == 0) revert InvalidPreset();
        if (input.length > MAX_CONTAINERS) revert TooManyContainers();
        uint256 total;
        id = nextPresetId++;
        uint16[] memory percentages = new uint16[](input.length);
        for (uint256 i; i < input.length; ++i) {
            if (input[i].percentage == 0 || bytes(input[i].name).length == 0) revert InvalidPercentages();
            total += input[i].percentage;
            percentages[i] = input[i].percentage;
            _containers[id].push(input[i]);
        }
        AllocationRules.validatePercentages(percentages);
        if (total != BPS) revert InvalidPercentages();
        _presets[id] = Preset(name, block.timestamp, false, false, 0, "");
        emit PresetCreated(id, name);
    }

    function preset(uint256 id) external view returns (Preset memory, Container[] memory) { return (_presets[id], _containers[id]); }

    function applyPreset(uint256 paymentId, uint256 presetId) external onlyController nonReentrant {
        Payment storage p = payments[paymentId];
        Preset storage pr = _presets[presetId];
        if (p.amount == 0 || pr.createdAt == 0 || pr.deleted || pr.archived) revert InvalidPreset();
        if (p.state == PaymentState.Allocated) revert PaymentNotPending();
        if (p.state == PaymentState.TemporarilyLocked) {
            if (block.timestamp < p.temporaryUnlockAt) revert LockActive();
            p.state = PaymentState.PendingDecision;
            p.decisionAt = p.temporaryUnlockAt;
            emit TemporaryLockExpired(paymentId);
        }
        Container[] storage cs = _containers[presetId];
        uint256 allocated;
        for (uint8 i; i < cs.length; ++i) {
            uint256 amount = AllocationRules.amountFor(p.amount, cs[i].percentage, i == cs.length - 1, allocated);
            allocated += amount;
            uint64 unlockAt = cs[i].lockDuration == 0 ? uint64(block.timestamp) : uint64(block.timestamp + cs[i].lockDuration);
            uint256 aid = nextAllocationId++;
            allocations[aid] = Allocation(paymentId, presetId, i, amount, unlockAt, cs[i].lockDuration == 0, false);
            _paymentAllocations[paymentId].push(aid);
            p.allocationCount++;
            pr.activeFunds += amount;
            emit AllocationCreated(aid, paymentId, presetId, i, amount, unlockAt);
        }
        p.state = PaymentState.Allocated;
    }

    function temporaryLock(uint256 paymentId) external onlyController nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.amount == 0 || p.state != PaymentState.PendingDecision) revert PaymentNotPending();
        p.state = PaymentState.TemporarilyLocked;
        p.temporaryUnlockAt = uint64(block.timestamp + ONE_HOUR);
        p.decisionAt = p.temporaryUnlockAt;
        emit TemporaryLockStarted(paymentId, p.amount, p.temporaryUnlockAt);
    }

    function expireTemporaryLock(uint256 paymentId) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.state != PaymentState.TemporarilyLocked || block.timestamp < p.temporaryUnlockAt) revert NotExpired();
        p.state = PaymentState.PendingDecision;
        p.decisionAt = p.temporaryUnlockAt;
        emit TemporaryLockExpired(paymentId);
    }

    function autoTemporaryRelock(uint256 paymentId) external nonReentrant {
        Payment storage p = payments[paymentId];
        if (p.state != PaymentState.PendingDecision || block.timestamp < p.decisionAt + RELOCK_AFTER_15_MIN) revert NotExpired();
        p.state = PaymentState.TemporarilyLocked;
        p.temporaryUnlockAt = uint64(block.timestamp + ONE_HOUR);
        p.decisionAt = p.temporaryUnlockAt;
        emit TemporaryLockRepeated(paymentId, p.amount, p.temporaryUnlockAt);
    }

    function unlockAllocation(uint256 allocationId) external onlyController nonReentrant {
        Allocation storage a = allocations[allocationId];
        if (a.amount == 0 || a.withdrawn) revert AlreadyWithdrawn();
        if (a.unlocked) revert AlreadyUnlocked();
        if (block.timestamp < a.unlockAt) revert UnlockNotReady();
        a.unlocked = true;
        emit AllocationUnlocked(allocationId);
    }

    function withdraw(uint256 allocationId, address payable recipient, uint256 amount) external onlyController nonReentrant {
        Allocation storage a = allocations[allocationId];
        if (recipient == address(0) || amount == 0 || a.amount == 0) revert InvalidAmount();
        if (a.withdrawn) revert AlreadyWithdrawn();
        if (!a.unlocked || block.timestamp < a.unlockAt) revert LockActive();
        if (amount != a.amount) revert InvalidAmount();
        a.withdrawn = true;
        _presets[a.presetId].activeFunds -= amount;
        totalProtectedBalance -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert InvalidRecipient();
        emit Withdrawal(allocationId, recipient, amount);
    }

    function archivePreset(uint256 presetId, string calldata reason) external onlyController {
        Preset storage p = _presets[presetId];
        if (p.createdAt == 0 || p.deleted || p.archived || p.activeFunds != 0 || bytes(reason).length == 0) revert ActiveFunds();
        p.archived = true;
        p.archiveReason = reason;
        emit PresetArchived(presetId, reason);
    }

    function deletePreset(uint256 presetId) external onlyController {
        Preset storage p = _presets[presetId];
        if (p.createdAt == 0 || p.activeFunds != 0) revert ActiveFunds();
        p.deleted = true;
        emit PresetDeleted(presetId);
    }

    function paymentAllocations(uint256 paymentId) external view returns (uint256[] memory) { return _paymentAllocations[paymentId]; }
}
