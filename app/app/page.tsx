"use client";

import { useEffect, useState } from "react";
import { useClient } from "@solana/react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
} from "@solana/kit-plugin-wallet/react";
import { address, generateKeyPairSigner, type Address } from "@solana/kit";
import type { AppClient } from "@/lib/client";
import {
  MAX_COUNT,
  PROGRAM_ID,
  closeInstruction,
  fetchCounter,
  incrementInstruction,
  initializeInstruction,
  shortAddress,
  type CounterState,
} from "@/lib/counter";
import { sendWithSigners } from "@/lib/send";

const STORAGE_KEY = "dev3pack:counter";
const CLUSTER = "devnet";

function explorer(path: string) {
  return `https://explorer.solana.com/${path}?cluster=${CLUSTER}`;
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatSol(lamports: bigint): string {
  return (Number(lamports) / 1_000_000_000).toFixed(4);
}

export default function Home() {
  const client = useClient<AppClient>();
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);

  const [counterAddress, setCounterAddress] = useState<Address | null>(null);
  const [counter, setCounter] = useState<CounterState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const signer = connected?.signer ?? null;
  const authority = connected ? address(connected.account.address) : null;
  const isConnected = Boolean(signer && authority);
  const atMax = counter ? counter.count >= MAX_COUNT : false;

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setCounterAddress(address(saved));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!counterAddress) {
      setCounter(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCounter(client.rpc, counterAddress)
      .then((next) => {
        if (cancelled) return;
        setCounter(next);
        if (!next) setError("No counter at this address. It may have been closed.");
      })
      .catch((cause) => {
        if (!cancelled) setError(readError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, counterAddress, refreshKey]);

  function persist(next: Address) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setCounterAddress(next);
  }

  async function handleInitialize() {
    if (!signer || !authority) {
      setError("Connect a wallet first.");
      return;
    }

    setBusy("initialize");
    setError(null);
    setSignature(null);

    try {
      const counterSigner = await generateKeyPairSigner();
      const instruction = initializeInstruction(counterSigner.address, authority);
      const tx = await sendWithSigners(
        client,
        signer,
        [counterSigner],
        [instruction],
      );
      persist(counterSigner.address);
      setSignature(tx);
      setRefreshKey((n) => n + 1);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function handleIncrement() {
    if (!signer || !authority || !counterAddress) {
      setError("Connect a wallet and create or load a counter first.");
      return;
    }

    setBusy("increment");
    setError(null);
    setSignature(null);

    try {
      const result = await client.sendTransaction([
        incrementInstruction(counterAddress, authority),
      ]);
      setSignature(String(result.context.signature));
      setRefreshKey((n) => n + 1);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function handleClose() {
    if (!signer || !authority || !counterAddress) {
      setError("Connect a wallet and load a counter first.");
      return;
    }

    setBusy("close");
    setError(null);
    setSignature(null);

    try {
      const result = await client.sendTransaction([
        closeInstruction(counterAddress, authority),
      ]);
      setSignature(String(result.context.signature));
      window.localStorage.removeItem(STORAGE_KEY);
      setCounterAddress(null);
      setCounter(null);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(null);
    }
  }

  function handleLoad(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = address(input.trim());
      persist(parsed);
      setInput("");
      setError(null);
      setRefreshKey((n) => n + 1);
    } catch {
      setError("That is not a valid Solana address.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">D3P</span>
          <span>Dev3Pack</span>
        </div>

        <details className="wallet-menu">
          <summary>
            {isConnected && authority ? (
              <>
                <span className="dot" />
                {shortAddress(authority)}
              </>
            ) : (
              "Connect wallet"
            )}
          </summary>
          <div className="wallet-pop">
            {isConnected && authority ? (
              <>
                <p className="eyebrow">CONNECTED</p>
                <p className="mono break">{authority}</p>
                <button
                  className="ghost wide"
                  onClick={() => void disconnect.dispatch()}
                >
                  Disconnect
                </button>
              </>
            ) : wallets.length === 0 ? (
              <p className="hint">
                No Wallet Standard wallet found. Install Phantom or Backpack,
                then refresh.
              </p>
            ) : (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  className="wallet-option"
                  disabled={connect.isRunning || status === "pending"}
                  onClick={() => void connect.dispatch(wallet)}
                >
                  <span>{wallet.name}</span>
                  <span className="hint">Connect</span>
                </button>
              ))
            )}

            {status === "pending" ? (
              <p className="hint">Reconnecting…</p>
            ) : null}
            {connect.error || disconnect.error ? (
              <p className="error-text">
                {readError(connect.error ?? disconnect.error)}
              </p>
            ) : null}
          </div>
        </details>
      </header>

      <section className="hero">
        <span className="eyebrow">SOLANA · DEVNET</span>
        <h1>
          One counter.
          <br />
          <span>On chain.</span>
        </h1>
        <p className="lede">
          Create a counter account, increment it, close it, and watch the
          account state change. No backend, no database — just a program and an
          RPC.
        </p>
      </section>

      <section className="grid">
        <article className="card counter-card">
          <div className="card-head">
            <span className="eyebrow">COUNTER</span>
            <span className="mono muted">
              {counterAddress ? shortAddress(counterAddress, 6) : "not created"}
            </span>
          </div>

          <div className={`count${counter ? "" : " empty"}`}>{counter ? counter.count.toString() : "0"}</div>

          <p className="hint">
            {counter
              ? `${counter.count.toString()} of ${MAX_COUNT.toString()} · ${formatSol(counter.lamports)} SOL rent`
              : counterAddress
                ? loading
                  ? "Reading account…"
                  : "No counter loaded."
                : "Create a fresh counter account to start."}
          </p>

          <div className="actions">
            <button
              onClick={handleIncrement}
              disabled={!isConnected || !counterAddress || atMax || busy !== null}
            >
              {busy === "increment"
                ? "Incrementing…"
                : atMax
                  ? "Max reached"
                  : "+1"}
            </button>
            <button
              className="ghost"
              onClick={handleClose}
              disabled={!isConnected || !counterAddress || busy !== null}
            >
              {busy === "close" ? "Closing…" : "Close"}
            </button>
            <button
              className="ghost icon"
              onClick={() => setRefreshKey((n) => n + 1)}
              disabled={!counterAddress || loading}
              aria-label="Refresh counter"
            >
              ↻
            </button>
          </div>

          {!counterAddress ? (
            <button
              className="primary wide create"
              onClick={handleInitialize}
              disabled={!isConnected || busy !== null}
            >
              {busy === "initialize" ? "Creating…" : "Create counter"}
            </button>
          ) : null}

          {counterAddress && !counter && !loading ? (
            <p className="hint warn">
              No account at this address. It may have been closed.
            </p>
          ) : null}
        </article>

        <aside className="stack">
          <article className="card dark">
            <span className="eyebrow light">AUTHORITY</span>
            <p className="mono light break">
              {counter?.authority ?? authority ?? "Connect a wallet"}
            </p>
            <p className="hint light">
              Only this wallet can increment or close the counter.
            </p>
          </article>

          <article className="card">
            <span className="eyebrow">LOAD EXISTING</span>
            <form className="load" onSubmit={handleLoad}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Counter address"
                spellCheck={false}
                aria-label="Counter address"
              />
              <button className="ghost" type="submit">
                Load
              </button>
            </form>
            <p className="hint">
              Useful if you cleared local storage or created the account from
              the CLI.
            </p>
          </article>

          <article className="card">
            <span className="eyebrow">PROGRAM</span>
            <a
              className="mono link break"
              href={explorer(`address/${PROGRAM_ID}`)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(String(PROGRAM_ID), 8)}
            </a>
            <p className="hint">Devnet · Anchor 1.2.1</p>
          </article>
        </aside>
      </section>

      {error ? <div className="banner error">{error}</div> : null}
      {signature ? (
        <a
          className="banner success"
          href={explorer(`tx/${signature}`)}
          target="_blank"
          rel="noreferrer"
        >
          Transaction confirmed ↗{" "}
          <span className="mono">{shortAddress(signature, 8)}</span>
        </a>
      ) : null}

      <footer className="footer">
        <span>Dev3Pack · Counter</span>
        <span className="mono">Next.js + @solana/kit</span>
      </footer>
    </main>
  );
}
