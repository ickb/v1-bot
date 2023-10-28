import {
    epochCompare, getLiveCell, getRpc, getSyncedIndexer, initializeChainAdapter, parseEpoch, secp256k1SignerFrom
} from "lumos-utils";

import { IckbTransactionBuilder, fund, deposit, withdrawFrom } from "v1-core";

import config from "./config.json";
import { Config } from "@ckb-lumos/config-manager";
import { parseUnit } from "@ckb-lumos/bi";
import { Account, asyncSleep, randomSecp256k1Account } from "./account";

async function main() {
    await initializeChainAdapter("devnet", config as Config);
    const rpc = getRpc();
    const indexer = await getSyncedIndexer();

    // const { create, sudtHash } = newLimitOrderUtils();

    //Genesis account
    const genesisAccount = randomSecp256k1Account("0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc");

    //Bot account
    const botAccount = randomSecp256k1Account();

    const newTransactionBuilder = (account: Account) => new IckbTransactionBuilder(
        account.lockScript,
        secp256k1SignerFrom(account.privKey)
    );

    const { txHash: botFundingTx } = await (
        await fund(
            newTransactionBuilder(genesisAccount)
                .add("output", "end", {
                    cellOutput: {
                        capacity: parseUnit("1000000", "ckb").toHexString(),
                        lock: botAccount.lockScript,
                        type: undefined,
                    },
                    data: "0x"
                })
        )
    ).buildAndSend();
    console.log("Bot funded with " + botFundingTx);


    const { txHash: depositTx } = await (
        await fund(
            deposit(newTransactionBuilder(botAccount), 5, parseUnit("100000", "ckb"))
        )
    ).buildAndSend();
    console.log("Bot deposit half of the funds with " + depositTx);

    const depositAtIndex0 = await getLiveCell({ txHash: depositTx, index: "0x0" });
    const { txHash: withdrawalRequest } = await (
        await fund(
            withdrawFrom(newTransactionBuilder(botAccount), depositAtIndex0)
        )
    ).buildAndSend();
    console.log("Bot withdraw first deposit " + withdrawalRequest);

    const withdrawalRequestAtIndex0 = await getLiveCell({ txHash: withdrawalRequest, index: "0x0" });
    while (true) {
        const b = newTransactionBuilder(botAccount);
        const tipEpoch = parseEpoch((await getRpc().getTipHeader()).epoch);
        const maturityEpoch = parseEpoch(await b.withdrawedDaoSince(withdrawalRequestAtIndex0));
        if (epochCompare(maturityEpoch, tipEpoch) < 1) {//Withdrawal request is ripe
            break
        }
        console.log("Waiting 10 seconds...")
        await asyncSleep(10000);
    }

    const { txHash: botSelfSendTx } = await (
        await fund(
            newTransactionBuilder(botAccount)
                .add("output", "end", {
                    cellOutput: {
                        capacity: parseUnit("1000", "ckb").toHexString(),
                        lock: botAccount.lockScript,
                        type: undefined,
                    },
                    data: "0x"
                })
        )
    ).buildAndSend();
    console.log("Bot botSelfSendTx " + botSelfSendTx);
}

main();