import { createClient, generateKeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import {
  closeInstruction,
  fetchCounter,
  incrementInstruction,
  initializeInstruction,
  PROGRAM_ID,
} from "../lib/counter";
import { sendWithSigners } from "../lib/send";
import type { AppClient } from "../lib/client";

const rpcUrl = process.env.RPC_URL ?? "https://api.devnet.solana.com";

async function main() {
  const client = (await createClient()
    .use(signerFromFile(process.env.HOME + "/.config/solana/id.json"))
    .use(solanaRpc({ rpcUrl }))) as unknown as AppClient;

  const authority = client.payer.address;
  const counterSigner = await generateKeyPairSigner();

  console.log("program: ", PROGRAM_ID);
  console.log("authority:", authority);
  console.log("counter: ", counterSigner.address);

  const init = await sendWithSigners(
    client,
    client.payer,
    [counterSigner],
    [initializeInstruction(counterSigner.address, authority)],
  );
  console.log("initialize:", init);

  const afterInit = await fetchCounter(client.rpc, counterSigner.address);
  console.log("after init:", afterInit);
  if (!afterInit || afterInit.count !== 0n) throw new Error("init state wrong");

  const incResult = await client.sendTransaction([
    incrementInstruction(counterSigner.address, authority),
  ]);
  console.log("increment:", incResult.context.signature);

  const afterInc = await fetchCounter(client.rpc, counterSigner.address);
  console.log("after increment:", afterInc);
  if (!afterInc || afterInc.count !== 1n) throw new Error("increment state wrong");

  const closeResult = await client.sendTransaction([
    closeInstruction(counterSigner.address, authority),
  ]);
  console.log("close:", closeResult.context.signature);

  const afterClose = await fetchCounter(client.rpc, counterSigner.address);
  console.log("after close:", afterClose);
  if (afterClose !== null) throw new Error("close did not remove account");

  console.log("smoke test passed");
  console.log(
    `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
