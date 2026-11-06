// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";

/// @dev Tries to re-enter withdraw() from its receive hook.
contract Reenterer {
    Vault public immutable vault;
    uint256 public reentryAttempts;

    constructor(Vault _vault) {
        vault = _vault;
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            // Balance is already zero, so this must revert; the revert bubbles up
            // through the low-level call and makes the outer withdraw fail too.
            vault.withdraw();
        }
    }
}

/// @dev A contract that refuses ETH, to exercise the "Transfer failed" branch.
contract Rejecter {
    function depositInto(Vault vault) external payable {
        vault.deposit{value: msg.value}();
    }

    function withdrawFrom(Vault vault) external {
        vault.withdraw();
    }
}

contract VaultTest is Test {
    Vault vault;
    address alice = address(1);
    address bob = address(2);

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function setUp() public {
        vault = new Vault();
        // Give Alice and Bob some ETH
        vm.deal(alice, 10 ether);
        vm.deal(bob, 5 ether);
    }

    /* ---------------- Deployment ---------------- */

    function testContractStartsWithZeroBalance() public view {
        assertEq(vault.contractBalance(), 0);
    }

    function testUserStartsWithZeroBalance() public view {
        assertEq(vault.getBalance(alice), 0);
    }

    /* ---------------- Deposit ---------------- */

    function testDepositETH() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();

        assertEq(vault.getBalance(alice), 1 ether);
        assertEq(vault.contractBalance(), 1 ether);
    }

    function testMultipleDeposits() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vault.deposit{value: 2 ether}();
        vm.stopPrank();

        assertEq(vault.getBalance(alice), 3 ether);
        assertEq(vault.contractBalance(), 3 ether);
    }

    function testDifferentUsersCanDeposit() public {
        vm.prank(alice);
        vault.deposit{value: 2 ether}();

        vm.prank(bob);
        vault.deposit{value: 1 ether}();

        assertEq(vault.getBalance(alice), 2 ether);
        assertEq(vault.getBalance(bob), 1 ether);
        assertEq(vault.contractBalance(), 3 ether);
    }

    function testCannotDepositZeroETH() public {
        vm.prank(alice);
        vm.expectRevert("Send ETH");
        vault.deposit{value: 0}();
    }

    function testDepositEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit Deposited(alice, 1 ether);

        vm.prank(alice);
        vault.deposit{value: 1 ether}();
    }

    /* ---------------- Withdraw ---------------- */

    function testWithdrawETH() public {
        vm.startPrank(alice);
        vault.deposit{value: 2 ether}();

        uint256 balanceBefore = alice.balance;
        vault.withdraw();
        uint256 balanceAfter = alice.balance;
        vm.stopPrank();

        assertEq(balanceAfter, balanceBefore + 2 ether);
        assertEq(vault.getBalance(alice), 0);
        assertEq(vault.contractBalance(), 0);
    }

    function testCannotWithdrawWithoutDeposit() public {
        vm.prank(alice);
        vm.expectRevert("Nothing to withdraw");
        vault.withdraw();
    }

    function testBalanceResetsAfterWithdraw() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vault.withdraw();
        vm.stopPrank();

        assertEq(vault.getBalance(alice), 0);
    }

    function testCannotWithdrawTwice() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vault.withdraw();
        vm.expectRevert("Nothing to withdraw");
        vault.withdraw();
        vm.stopPrank();
    }

    function testWithdrawEmitsEvent() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();

        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(alice, 1 ether);

        vm.prank(alice);
        vault.withdraw();
    }

    function testWithdrawRevertsWhenRecipientRejectsETH() public {
        Rejecter rejecter = new Rejecter();
        rejecter.depositInto{value: 1 ether}(vault);

        vm.expectRevert("Transfer failed");
        rejecter.withdrawFrom(vault);

        // Nothing moved: the revert rolled the zeroed balance back.
        assertEq(vault.getBalance(address(rejecter)), 1 ether);
        assertEq(vault.contractBalance(), 1 ether);
    }

    function testReentrancyCannotDrainOtherUsers() public {
        vm.prank(bob);
        vault.deposit{value: 4 ether}();

        Reenterer attacker = new Reenterer(vault);

        vm.expectRevert("Transfer failed");
        attacker.attack{value: 1 ether}();

        // Bob's funds are untouched.
        assertEq(vault.getBalance(bob), 4 ether);
        assertEq(vault.contractBalance(), 4 ether);
    }

    /* ---------------- Contract balance ---------------- */

    function testContractBalanceAfterSeveralDeposits() public {
        vm.prank(alice);
        vault.deposit{value: 2 ether}();

        vm.prank(bob);
        vault.deposit{value: 3 ether}();

        assertEq(vault.contractBalance(), 5 ether);
    }

    function testContractBalanceAfterWithdraw() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();

        vm.prank(bob);
        vault.deposit{value: 4 ether}();

        vm.prank(alice);
        vault.withdraw();

        assertEq(vault.contractBalance(), 4 ether);
        assertEq(vault.getBalance(bob), 4 ether);
    }

    /* ---------------- Fuzz ---------------- */

    function testFuzzDepositThenWithdraw(uint96 amount) public {
        vm.assume(amount > 0);
        address user = makeAddr("fuzzUser");
        vm.deal(user, amount);

        vm.startPrank(user);
        vault.deposit{value: amount}();
        assertEq(vault.getBalance(user), amount);
        vault.withdraw();
        vm.stopPrank();

        assertEq(user.balance, amount);
        assertEq(vault.contractBalance(), 0);
    }
}
