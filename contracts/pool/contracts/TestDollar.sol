// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Zeronym Test Dollar (tUSD). TESTNET ONLY. HAS NO VALUE.
/// @notice Anyone can claim test dollars from the faucet, once per cooldown.
contract TestDollar is ERC20 {
    uint256 public constant DRIP = 1_000 * 1e6;
    uint256 public constant COOLDOWN = 1 hours;
    mapping(address => uint256) public lastDrip;

    constructor() ERC20("Zeronym Test Dollar", "tUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        require(block.timestamp >= lastDrip[msg.sender] + COOLDOWN, "faucet: wait for the cooldown");
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, DRIP);
    }
}
