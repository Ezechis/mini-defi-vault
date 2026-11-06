// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Mini DeFi Vault
/// @notice Users deposit Sepolia ETH into their own vault balance and withdraw it back.
contract Vault {
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Deposit ETH into the caller's vault balance.
    function deposit() external payable {
        require(msg.value > 0, "Send ETH");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw the caller's entire vault balance.
    /// @dev Checks-effects-interactions: the balance is zeroed before ETH is sent,
    ///      so a re-entrant call finds nothing to withdraw.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "Nothing to withdraw");

        balances[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Vault balance of `user`.
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    /// @notice Total ETH held by the vault across all users.
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
