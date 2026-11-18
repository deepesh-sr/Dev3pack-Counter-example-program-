import {
  AccountRole,
  address,
  fetchEncodedAccount,
  getBase58Decoder,
  type Address,
  type Instruction,
} from "@solana/kit";
import type { AppClient } from "./client";

export const PROGRAM_ID = address(
  "2VXwN3CYDMWdFbXcjYxaUAZMqLA3StMjebaQu7KdRDMM",
);
export const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
export const MAX_COUNT = 10n;

const COUNTER_DISCRIMINATOR = Uint8Array.from([
  255, 176, 4, 245, 188, 253, 124, 25,
]);

const DISCRIMINATORS = {
  initialize: Uint8Array.from([175, 175, 109, 31, 13, 152, 155, 237]),
  increment: Uint8Array.from([11, 18, 104, 9, 104, 174, 59, 33]),
  close: Uint8Array.from([98, 165, 201, 177, 108, 65, 206, 96]),
};

export type CounterState = {
  address: Address;
  authority: string;
  count: bigint;
  lamports: bigint;
};

/** initialize(counter signer, authority signer, system program) */
export function initializeInstruction(
  counter: Address,
  authority: Address,
): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: counter, role: AccountRole.WRITABLE_SIGNER },
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: DISCRIMINATORS.initialize,
  };
}

/** increment(counter writable, authority signer) */
export function incrementInstruction(
  counter: Address,
  authority: Address,
): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: counter, role: AccountRole.WRITABLE },
      { address: authority, role: AccountRole.READONLY_SIGNER },
    ],
    data: DISCRIMINATORS.increment,
  };
}

/** close(counter writable, authority writable signer) */
export function closeInstruction(
  counter: Address,
  authority: Address,
): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: counter, role: AccountRole.WRITABLE },
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
    ],
    data: DISCRIMINATORS.close,
  };
}

export async function fetchCounter(
  rpc: AppClient["rpc"],
  counter: Address,
): Promise<CounterState | null> {
  const account = await fetchEncodedAccount(rpc, counter);
  if (!account.exists || account.programAddress !== PROGRAM_ID) return null;

  const data = account.data;
  if (data.length < 48) return null;

  for (let i = 0; i < COUNTER_DISCRIMINATOR.length; i++) {
    if (data[i] !== COUNTER_DISCRIMINATOR[i]) return null;
  }

  const authority = getBase58Decoder().decode(data.slice(8, 40));
  const view = new DataView(data.buffer, data.byteOffset + 40, 8);
  const count = view.getBigUint64(0, true);

  return {
    address: counter,
    authority,
    count,
    lamports: account.lamports,
  };
}

export function shortAddress(value: string, size = 4): string {
  return value.length <= size * 2 + 1
    ? value
    : `${value.slice(0, size)}…${value.slice(-size)}`;
}
