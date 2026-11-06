// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";

/// Usage (from contracts/):
///   source .env
///   forge script script/Deploy.s.sol:DeployVault --rpc-url $SEPOLIA_RPC_URL --broadcast
contract DeployVault is Script {
    function run() external returns (Vault vault) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        vault = new Vault();
        vm.stopBroadcast();

        console.log("Vault deployed at:", address(vault));
    }
}
