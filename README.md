# Anchor Counter — live demo

A minimal Anchor program for the Anchor class. It matches the 12-slide deck:
one state account, initialize, increment, close, custom errors, and four tests.

```
programs/counter/src/lib.rs          the whole program
programs/counter/tests/test_initialize.rs   four LiteSVM tests
Anchor.toml                          program ID and provider
```

## Toolchain

This project was verified with:

```text
Anchor CLI       1.2.1
Solana CLI       4.1.2
Rust             1.97.1
litesvm          0.18.2
```

Install/switch Anchor:

```bash
avm install 1.2.1
avm use 1.2.1
anchor --version
```

The installed Solana CLI must be 4.1.x for this LiteSVM setup. To switch:

```bash
agave-install init 4.1.2
solana --version
```

`rust-toolchain.toml` pins Rust `1.97.1`. The program itself is built with
`cargo build-sbf`; the tests run on the host with LiteSVM.

## Build and test

```bash
anchor build
anchor test
```

Expected:

```text
running 4 tests
test initializes_and_increments ... ok
test wrong_authority_cannot_increment ... ok
test stops_at_max_count ... ok
test closes_the_counter_and_returns_rent ... ok

test result: ok. 4 passed; 0 failed
```

`anchor build` writes:

```text
target/deploy/counter.so
target/idl/counter.json
target/types/counter.ts
```

`anchor test` runs the Rust test in
`programs/counter/tests/test_initialize.rs` through LiteSVM. No local validator
and no JavaScript install are needed.

## Seeing the test logs

`Anchor.toml` runs:

```toml
[scripts]
test = "cargo test -- --nocapture --test-threads=1"
```

So every `println!` in the tests is visible. `--test-threads=1` keeps the four
tests from interleaving their output.

You can run the same thing directly:

```bash
cargo test -p counter -- --nocapture --test-threads=1
```

Remove `--nocapture` to hide the logs again.

## The program

```rust
#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}
```

- `#[account]` adds an 8-byte discriminator and Borsh serialization.
- `InitSpace` computes the field size: `32 + 8 = 40` bytes.
- Total account size: `8 + 40 = 48` bytes.
- `authority` is the wallet allowed to increment.
- `count` is the number being incremented.

### Initialize

```rust
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    counter.authority = ctx.accounts.authority.key();
    counter.count = 0;
    Ok(())
}
```

The accounts struct:

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Counter::INIT_SPACE)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

- `init` creates the account and assigns it to the program.
- `payer = authority` says who pays rent.
- `space = 8 + INIT_SPACE` allocates 48 bytes.
- `authority` is `mut` because it pays lamports.
- `system_program` is required because account creation is a System Program
  instruction.

This counter is a normal account, not a PDA, so the `counter` keypair also
signs the initialize transaction. That is why the test signs with both the payer
and the counter keypair.

### Increment

```rust
#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, has_one = authority)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

pub fn increment(ctx: Context<Increment>) -> Result<()> {
    ctx.accounts.counter.count += 1;
    Ok(())
}
```

- `mut` makes the counter writable.
- `has_one = authority` checks `counter.authority == authority.key()`.
- `authority` is a `Signer` but not `mut`, because it only signs.
- If the check fails, the handler never runs and the transaction reverts.

### Custom error and `require!`

```rust
#[constant]
pub const MAX_COUNT: u64 = 10;

#[error_code]
pub enum CounterError {
    #[msg("Counter has reached the maximum value")]
    Full,
}
```

```rust
pub fn increment(ctx: Context<Increment>) -> Result<()> {
    require!(
        ctx.accounts.counter.count < MAX_COUNT,
        CounterError::Full
    );

    ctx.accounts.counter.count += 1;
    Ok(())
}
```

- `#[constant]` puts `MAX_COUNT` in the IDL.
- `#[error_code]` defines a typed program error.
- `require!` returns `Err(CounterError::Full.into())` when the condition is false.
- The transaction reverts, so the count is not changed.

### Close

```rust
#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut, close = authority, has_one = authority)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close(_ctx: Context<Close>) -> Result<()> {
    Ok(())
}
```

- `mut` is required because closing changes the account.
- `has_one = authority` ensures only the stored authority can close it.
- `close = authority` runs **after** the handler:
  - sends the account’s lamports (the rent) to `authority`,
  - zeroes the account data,
  - assigns the account back to the System Program.
- The handler can be empty. If the handler returns `Err`, the close does not
  happen because the whole transaction reverts.
- The account can be created again later; “close” means “empty and refund,” not
  “delete from the ledger.”

## The tests

`test_initialize.rs` has four tests:

1. `initializes_and_increments` — creates a payer and counter keypair, airdrops
   the payer, initializes the counter, checks `authority` and `count = 0`, then
   increments and checks `count = 1`.
2. `wrong_authority_cannot_increment` — passes a different signer as
   `authority`. `has_one` rejects it, so `send_transaction` returns `Err`.
3. `stops_at_max_count` — increments ten times, checks `count = 10`, then the
   eleventh increment fails with `CounterError::Full`.
4. `closes_the_counter_and_returns_rent` — calls `close`, then checks that the
   counter account has zero lamports (or is gone).

LiteSVM loads the compiled `.so`, sends real transactions, and lets us read the
account state directly.

## Teaching flow

1. Open `lib.rs` and read the state struct.
2. Read `Initialize` and explain `init`, `payer`, `space`, `Signer`, `System`.
3. Read the initialize handler: authority + count.
4. Read `Increment` and explain `mut`, `has_one`, `require!`, and `CounterError`.
5. Read `Close` and explain `close = authority`, rent, and why the handler can be
   empty.
6. Run `anchor test`. Show four passing tests.
7. Break `has_one = authority`, rerun. The wrong-authority and close tests fail.
   Restore it.
8. Change `space` to `8` and rerun. Initialization fails because the account is
   too small. Restore it.
9. Run `anchor build` and open `target/idl/counter.json`. Point out the IDL.

## Experiments

- Add `reset` that sets `count = 0`.
- Add an event on increment with `#[event]` and `emit!`.
- Change the counter to a PDA with
  `seeds = [b"counter", authority.key().as_ref()], bump`.
- Add a `close` test with a different authority and assert it fails.

## Devnet deploy (optional)

```bash
solana config set --url devnet
solana airdrop 1
anchor deploy
```

The program ID is in `Anchor.toml` and `declare_id!`. If you regenerate the
program keypair, run:

```bash
anchor keys sync
```
# Dev3pack-Counter-example-program-
