import {
  addSignersToTransactionMessage,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { AppClient } from "./client";

/**
 * Send a transaction that needs extra signers beyond the connected wallet.
 * `client.sendTransaction` only knows the wallet signer, so initialize needs
 * this path to attach the new counter keypair.
 */
export async function sendWithSigners(
  client: AppClient,
  payer: TransactionSigner,
  signers: TransactionSigner[],
  instructions: Instruction[],
): Promise<string> {
  const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) => addSignersToTransactionMessage(signers, m),
  );

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: client.rpc,
    rpcSubscriptions: client.rpcSubscriptions,
  });

  await sendAndConfirm(signed, { commitment: "confirmed" });
  return String(getSignatureFromTransaction(signed));
}
