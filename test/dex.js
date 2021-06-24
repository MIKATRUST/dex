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

    it('should NOT createLimiteOrder if token does not exist', async () => {
        await expectRevert(
            dex.createLimiteOrder(
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                10,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'this token does not exist'
        );
    });

    it('should NOT createLimiteOrder if token is DAI', async () => {
        await expectRevert(
            dex.createLimiteOrder(
                DAI,
                10,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'can not trade DAI'
        );
    });

    it('should NOT createLimiteOrder if token balance too low', async () => {
        await expectRevert(
            dex.createLimiteOrder(
                BAT,
                1,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'token balance too low'
        );
    });

    it('should NOT createLimiteOrder if dai balance too low', async () => {
        await expectRevert(
            dex.createLimiteOrder(
                BAT,
                100,
                web3.utils.toWei('100'),
                SIDE.BUY,
                {from: trader1}
            ),
            'dai balance too low'
        );
    });

    it.only('should createLimiteOrder, order book should be set correctly ', async () => {

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

        await dex.createLimiteOrder(
            BAT,
            5,
            web3.utils.toWei('100'),
            SIDE.BUY,
            {from: trader1}
        );

        await dex.createLimiteOrder(
            BAT,
            6,
            web3.utils.toWei('101'),
            SIDE.BUY,
            {from: trader1}
        );
        await dex.createLimiteOrder(
            BAT,
            100,
            web3.utils.toWei('98'),
            SIDE.SELL,
            {from: trader2}
        );

        await dex.createLimiteOrder(
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

        await dex.createLimiteOrder(
            BAT,
            5,
            web3.utils.toWei('100'),
            SIDE.BUY,
            {from: trader1}
        );

        await dex.createMarketOrder(
            BAT,
            100,
            SIDE.SELL,
            {from: trader2}
        );

/*
        const balance = await dex.traderBalances(trader1, DAI);
        assert (balance.toString() === amount);

        const balance = await dex.traderBalances(trader2, DAI);
        assert (balance.toString() === amount);
*/
/*
        let balance = await dex.traderBalances(trader1, BAT);
        assert (balance.toString() === '0');
*/
/*
        balance = await dex.traderBalances(trader1, BAT);
        assert (balance.toString() === '5');
*/

/*
        const [buyOrders, sellOrders] = await Promise.all([
            dex.getOrders(BAT, SIDE.BUY),
            dex.getOrders(BAT, SIDE.SELL),
        ]);

*/


    });

    
});


