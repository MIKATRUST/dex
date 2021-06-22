// SPDX-License-Identifier: MIT
/// @title Rep mockup
/// @author MikaTrust
/// @notice For education only !
/// @dev ERC20: the default value of {decimals} is 18

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Rep is ERC20 {
    
    constructor() ERC20('REP', 'Augure token') {

    }

    function faucet(address to, uint amount) external {
        _mint(to, amount);
    }
}