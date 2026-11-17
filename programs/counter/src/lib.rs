use anchor_lang::prelude::*;

declare_id!("2VXwN3CYDMWdFbXcjYxaUAZMqLA3StMjebaQu7KdRDMM");

/// The counter stops at this value.
#[constant]
pub const MAX_COUNT: u64 = 10;

#[program]
pub mod counter {
    use super::*;

    /// Create the counter account and set its first state.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.authority = ctx.accounts.authority.key();
        counter.count = 0;
        Ok(())
    }

    /// Add one. Only the stored authority can do this, and only below MAX_COUNT.
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        require!(
            ctx.accounts.counter.count < MAX_COUNT,
            CounterError::Full
        );

        ctx.accounts.counter.count += 1;
        Ok(())
    }

    /// Close the counter and return its rent to the authority.
    ///
    /// The handler can be empty: the `close` constraint does the work after it.
    pub fn close(_ctx: Context<Close>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Counter::INIT_SPACE
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, has_one = authority)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut, close = authority, has_one = authority)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}

#[error_code]
pub enum CounterError {
    #[msg("Counter has reached the maximum value")]
    Full,
}
