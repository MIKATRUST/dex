const { expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const Dai = artifacts.require('mocks/Dai.sol');
const Bat = artifacts.require('mocks/Bat.sol');
const Rep = artifacts.require('mocks/Rep.sol');
const Zrx = artifacts.require('mocks/Zrx.sol');
const Dex = artifacts.require('dex.sol');

contract('Dex', (accounts) => {
    let dai, bat, rep, zrx, dex;
    const[trader1, trader2] = [accounts[1], accounts[2]];

    const ticket = web3.utils.fromAscii('DAI');

    const [DAI, BAT, REP, ZRX] = ['DAI', 'BAT', 'REP', 'ZRX']
        .map(ticker => web3.utils.fromAscii(ticker));

    const SIDE = {
        BUY:0,
        SELL:1
    };

    beforeEach(async() => {
        ([dai, bat, rep, zrx] = await Promise.all([
            Dai.new(),
            Bat.new(),
            Rep.new(),
            Zrx.new(),
        ]));

        dex = await Dex.new(); 

        await Promise.all([
            dex.addToken(DAI, dai.address),
            dex.addToken(BAT, bat.address),
            dex.addToken(REP, rep.address),
            dex.addToken(ZRX, zrx.address),
        ]);


        const amount = web3.utils.toWei('1000');
        const seedTokenBalance = async (token, trader) => {
            await token.faucet(trader, amount);
            await token.approve(
                dex.address,
                amount,
                {from:trader}
            );
        };

        await Promise.all(
            [dai, bat, rep, zrx].map(
                token => seedTokenBalance(token, trader1)
            )
        );

        await Promise.all(
            [dai, bat, rep, zrx].map(
                token => seedTokenBalance(token, trader2)
            )
        );

    });


    it('should deposit token', async () => {
        const amount = web3.utils.toWei('50');

        await dex.deposit(
            amount,
            DAI,
            {from:trader1}
        );
        const balance = await dex.traderBalances(trader1, DAI);
        assert (balance.toString() === amount);
    });

    it('should NOT deposit token if token does not exist', async () => {
        await expectRevert(
            dex.deposit(
                web3.utils.toWei('100'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                {from: trader1}
            ),
            'this token does not exist'
        );
    });

    it('should NOT withdraw token if token does not exist', async () => {
        await expectRevert(
            dex.withdraw(
                web3.utils.toWei('1'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                {from: trader1}
            ),
            'this token does not exist'
        );
    });

    it('should NOT withdraw token if balance is too low', async () => {
        await expectRevert(
            dex.withdraw(
                web3.utils.toWei('1000'),
                DAI,
                {from: trader1}
            ),
            'balance too low'
        );
    });

    it('should withdraw token, dex balance should be 0 and trader balance should be set to the initial amount ', async () => {

        const amount = web3.utils.toWei('100');

        await dex.deposit(
            amount,
            DAI,
            {from:trader1}
        );

        await dex.withdraw(
            amount,
            DAI,
            {from:trader1}
        );
 
        const [balanceDex, balanceTrader] = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dai.balanceOf(trader1)
        ]);

        assert(balanceDex.isZero());
        assert(balanceTrader.toString() === web3.utils.toWei('1000'));

    });

    it('should NOT createLimitOrder if token does not exist', async () => {
        await expectRevert(
            dex.createLimitOrder(
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                10,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'this token does not exist'
        );
    });

    it('should NOT createLimitOrder if token is DAI', async () => {
        await expectRevert(
            dex.createLimitOrder(
                DAI,
                10,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'can not trade DAI'
        );
    });

    it('should NOT createLimitOrder if token balance too low', async () => {
        await expectRevert(
            dex.createLimitOrder(
                BAT,
                1,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'token balance too low'
        );
    });

    it('should NOT createLimitOrder if dai balance too low', async () => {
        await expectRevert(
            dex.createLimitOrder(
                BAT,
                100,
                web3.utils.toWei('100'),
                SIDE.BUY,
                {from: trader1}
            ),
            'dai balance too low'
        );
    });

    it('should createLimitOrder, order book should be set correctly ', async () => {

        const amount = web3.utils.toWei('1000');

        await dex.deposit(
            amount,
            DAI,
            {from:trader1}
        );

        await dex.deposit(
            amount,
            BAT,
            {from:trader2}
        );

        await dex.createLimitOrder(
            BAT,
            5,
            web3.utils.toWei('100'),
            SIDE.BUY,
            {from: trader1}
        );

        await dex.createLimitOrder(
            BAT,
            6,
            web3.utils.toWei('101'),
            SIDE.BUY,
            {from: trader1}
        );
        await dex.createLimitOrder(
            BAT,
            100,
            web3.utils.toWei('98'),
            SIDE.SELL,
            {from: trader2}
        );

        await dex.createLimitOrder(
            BAT,
            90,
            web3.utils.toWei('99'),
            SIDE.SELL,
            {from: trader2}
        ); 

        const [buyOrders, sellOrders] = await Promise.all([
            dex.getOrders(BAT, SIDE.BUY),
            dex.getOrders(BAT, SIDE.SELL),
        ]);

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

        assert(buyOrders.length === 2);

        assert(buyOrders[0].trader === trader1);
        assert(buyOrders[0].ticker === web3.utils.padRight(BAT, 64));
        assert(buyOrders[0].price === web3.utils.toWei('101'));
        assert(buyOrders[0].amount === '6');

        assert(buyOrders[1].trader === trader1);
        assert(buyOrders[1].ticker === web3.utils.padRight(BAT, 64));
        assert(buyOrders[1].side === SIDE.BUY.toString());
        assert(buyOrders[1].price === web3.utils.toWei('100'));
        assert(buyOrders[1].amount === '5');

        assert(sellOrders.length === 2);

        assert(sellOrders[0].trader === trader2);
        assert(sellOrders[0].ticker === web3.utils.padRight(BAT, 64));
        assert(sellOrders[0].price === web3.utils.toWei('98'));
        assert(sellOrders[0].amount === '100');   

        assert(sellOrders[1].trader === trader2);
        assert(sellOrders[1].ticker === web3.utils.padRight(BAT, 64));
        assert(sellOrders[1].price === web3.utils.toWei('99'));
        assert(sellOrders[1].amount === '90');
    });

    it('should createMarketOrder and match against limit orders ', async () => {
        const amount = '1000'; //web3.utils.toWei('1000');

        await dex.deposit(
            amount,
            DAI,
            {from:trader1}
        );

        await dex.deposit(
            amount,
            BAT,
            {from:trader2}
        );
        
        await dex.createLimitOrder(
            BAT,
            '5',
            '100',/*web3.utils.toWei('100')*/
            SIDE.BUY,
            {from: trader1}
        );

        await dex.createMarketOrder(
            BAT,
            '100',
            SIDE.SELL,
            {from: trader2}
        );
        
        const balance11 = await dex.traderBalances(trader1, DAI);
        const balance12 = await dex.traderBalances(trader1, BAT);
        const balance21 = await dex.traderBalances(trader2, DAI);
        const balance22 = await dex.traderBalances(trader2, BAT);

        assert (balance11.toString() === '500');
        assert (balance12.toString() === '5');
        assert (balance21.toString() === '500');
        assert (balance22.toString() === '995');
    
    });

});


