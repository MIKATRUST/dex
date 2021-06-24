// SPDX-License-Identifier: MIT
/// @title Decentralized Exchange
/// @author MikaTrust
/// @notice For education only !
/// @dev By default, the owner of an Ownable contract is the account that deployed it
/// @dev Solidity 0.8.0, no need to import OpenZeppelin SafeMath anymore

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Dex is Ownable {

    enum Side {
        BUY,
        SELL
    }

    struct Token {
        bytes32 ticker;
        address tokenAddress;
    }

    struct Order {
        uint id;
        address trader;
        Side side;
        bytes32 ticker;
        uint amount;
        uint filled;
        uint price;
        uint date;
    }

    mapping (bytes32 => Token) public tokens;
    bytes32[] public tokenList;
    mapping (address => mapping(bytes32 => uint)) public traderBalances;
    mapping (bytes32 => mapping ( uint => Order[])) public orderBook;
    uint public nextOrderId;
    uint public nextTradeId;
    bytes32 constant DAI = bytes32('DAI');

    event NewTrade (
        uint tradeId,
        uint orderId,
        bytes32 indexed ticker,
        address indexed trader1,
        address indexed trader2,
        uint amount,
        uint price,
        uint date
    );

    constructor() {}

    function addToken (
        bytes32 ticker,
        address tokenAddress)
        onlyOwner()
        external {
            tokens[ticker] = Token(ticker, tokenAddress);
            tokenList.push(ticker);
    }

    function deposit (
        uint amount,
        bytes32 ticker)
        tokenExists(ticker)
        external {
            IERC20(tokens[ticker].tokenAddress).transferFrom(
                msg.sender, 
                address(this),
                amount);
            traderBalances[msg.sender][ticker] += amount;
        }

    function withdraw (
        uint amount,
        bytes32 ticker)
        tokenExists(ticker)
        external {
            require (amount <= traderBalances[msg.sender][ticker], 'balance too low');
            traderBalances[msg.sender][ticker] -= amount;
            IERC20(tokens[ticker].tokenAddress).transfer(
                msg.sender,
                amount);
        }

    function createLimiteOrder (
        bytes32 ticker,
        uint amount,
        uint price,
        Side side)
        tokenExists(ticker)
        tokenIsNotDai(ticker)
        external {
            if(side == Side.SELL){
                require(traderBalances[msg.sender][ticker] >= amount,
                'token balance too low'
                );
            } else {
                require(traderBalances[msg.sender][DAI] >= amount * price,
                'dai balance too low'
                );

            }

            /*
            struct Order {
                uint id;
                address trader;
                Side side;
                bytes32 ticker;
                uint amount;
                uint filled;
                uint price;
                uint date;
            }
            */

            Order[] storage orders = orderBook[ticker][uint(side)];
            orders.push(Order(
                nextOrderId,
                msg.sender,
                side,
                ticker,
                amount,
                uint(0),
                price,
                block.timestamp
            )); 

            //Bubble sort
            uint i = orders.length-1;
            while(i>0){
                if(side == Side.BUY && orders[i].price < orders[i-1].price){
                    break;
                }

                if(side == Side.SELL && orders[i].price > orders[i-1].price){
                    break;
                }
                Order memory order = orders[i - 1];
                orders[i - 1] = orders[i];
                orders[i] = order;
                i--;
            }
            
            nextOrderId++;

    }

    function createMarketOrder (
        bytes32 ticker,
        uint amount,
        Side side)
        tokenExists(ticker)
        tokenIsNotDai(ticker)
        external {
            if(side == Side.SELL){
                require(traderBalances[msg.sender][ticker] >= amount,
                'token balance too low'
                );
            }
            
            Order[] storage orders = orderBook[ticker][uint(side == Side.BUY ? Side.SELL : Side.BUY)];
            uint i;
            uint remaining = amount;

            while(i < orders.length && remaining > 0){
                uint available = orders[i].amount - orders[i].filled;
                uint matched = (remaining > available) ? available : remaining;
                remaining -= matched;
                orders[i].filled += matched;
                emit NewTrade(
                    nextTradeId, 
                    orders[i].id, 
                    ticker,
                    orders[i].trader,
                    msg.sender, 
                    matched, 
                    orders[i].price, 
                    block.timestamp
                );

                if(side == Side.SELL){
                    traderBalances[msg.sender][ticker] -= matched;
                    traderBalances[msg.sender][DAI] += matched * orders[i].price;
                    traderBalances[orders[i].trader][ticker] += matched;
                    traderBalances[orders[i].trader][DAI]  -= matched * orders[i].price;
                }
                if(side == Side.BUY){
                    require(
                        traderBalances[msg.sender][DAI] >= matched * orders[i].price,
                        'dai balance too low'
                    );
                    traderBalances[msg.sender][ticker] += matched;
                    traderBalances[msg.sender][DAI] -= matched * orders[i].price;
                    traderBalances[orders[i].trader][ticker] -= matched;
                    traderBalances[orders[i].trader][DAI] += matched * orders[i].price;
                }
                nextTradeId++;
                i++;
            }

            //Clean the order book by removing filled order
            while(i < orders.length && orders[i].filled == orders[i].amount){
                for(uint j = i; j<orders.length; j++){
                    orders[j] = orders [j + 1];
                }
                orders.pop();
                i++; 
            }
    }

    function getOrders(
        bytes32 ticker,
        Side side)
        external
        view
        returns(Order[] memory)
        {
            return orderBook[ticker][uint(side)];
        }

    function getTokens(
    )
        external
        view
        returns (Token[] memory)
        {
            Token[] memory _tokens = new Token[](tokenList.length);
            for(uint i = 0; i < tokenList.length - 1; i++){
                _tokens[i] = Token(
                    tokens[tokenList[i]].ticker,
                    tokens[tokenList[i]].tokenAddress
                );

            }
            return _tokens;
        }
    
    modifier tokenExists(bytes32 ticker){
        require(tokens[ticker].tokenAddress != address(0), 
        'this token does not exist');
        _;
    }

    modifier tokenIsNotDai(bytes32 ticker){
        require(ticker != DAI,
        'can not trade DAI');
        _;
    }  
}

