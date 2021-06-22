const { expectRevert } = require('@openzeppelin/test-helpers');
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

    it.only('should withdraw token, dex balance should be 0 and trader balance should be set to the initial amount ', async () => {

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

});


