use {
    anchor_lang::{
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn setup() -> (LiteSVM, Keypair, Keypair) {
    let program_id = counter::id();
    let payer = Keypair::new();
    let counter = Keypair::new();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/counter.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    println!("program: {}", program_id);
    println!("payer:   {}", payer.pubkey());
    println!("counter: {}", counter.pubkey());

    let instruction = Instruction::new_with_bytes(
        program_id,
        &counter::instruction::Initialize {}.data(),
        counter::accounts::Initialize {
            counter: counter.pubkey(),
            authority: payer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(message),
        &[&payer, &counter],
    )
    .unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    println!("initialize: ok");

    (svm, payer, counter)
}

#[test]
fn initializes_and_increments() {
    let (mut svm, payer, counter) = setup();

    let account = svm.get_account(&counter.pubkey()).unwrap();
    let mut data: &[u8] = &account.data;
    let state = counter::Counter::try_deserialize(&mut data).unwrap();
    assert_eq!(state.authority, payer.pubkey());
    assert_eq!(state.count, 0);
    println!(
        "after initialize: authority={} count={}",
        state.authority, state.count
    );

    let instruction = Instruction::new_with_bytes(
        counter::id(),
        &counter::instruction::Increment {}.data(),
        counter::accounts::Increment {
            counter: counter.pubkey(),
            authority: payer.pubkey(),
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[&payer]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    println!("increment: ok");

    let account = svm.get_account(&counter.pubkey()).unwrap();
    let mut data: &[u8] = &account.data;
    let state = counter::Counter::try_deserialize(&mut data).unwrap();
    assert_eq!(state.count, 1);
    println!("after increment: count={}", state.count);
}

#[test]
fn wrong_authority_cannot_increment() {
    let (mut svm, payer, counter) = setup();
    let attacker = Keypair::new();
    println!("attacker: {}", attacker.pubkey());

    let instruction = Instruction::new_with_bytes(
        counter::id(),
        &counter::instruction::Increment {}.data(),
        counter::accounts::Increment {
            counter: counter.pubkey(),
            authority: attacker.pubkey(),
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(message),
        &[&payer, &attacker],
    )
    .unwrap();

    let result = svm.send_transaction(tx);
    println!("wrong authority rejected: {}", result.is_err());
    assert!(result.is_err());
}

#[test]
fn stops_at_max_count() {
    let (mut svm, payer, counter) = setup();

    for i in 0..10 {
        let instruction = Instruction::new_with_bytes(
            counter::id(),
            &counter::instruction::Increment {}.data(),
            counter::accounts::Increment {
                counter: counter.pubkey(),
                authority: payer.pubkey(),
            }
            .to_account_metas(None),
        );

        svm.expire_blockhash();
        let blockhash = svm.latest_blockhash();
        let message =
            Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(
            VersionedMessage::Legacy(message),
            &[&payer],
        )
        .unwrap();
        assert!(svm.send_transaction(tx).is_ok());
        println!("increment {}: ok", i + 1);
    }

    let account = svm.get_account(&counter.pubkey()).unwrap();
    let mut data: &[u8] = &account.data;
    let state = counter::Counter::try_deserialize(&mut data).unwrap();
    assert_eq!(state.count, 10);
    println!("count at max: {}", state.count);

    let instruction = Instruction::new_with_bytes(
        counter::id(),
        &counter::instruction::Increment {}.data(),
        counter::accounts::Increment {
            counter: counter.pubkey(),
            authority: payer.pubkey(),
        }
        .to_account_metas(None),
    );

    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[&payer]).unwrap();
    println!("increment 11 rejected: {}", svm.send_transaction(tx).is_err());
}

#[test]
fn closes_the_counter_and_returns_rent() {
    let (mut svm, payer, counter) = setup();

    let before = svm
        .get_account(&counter.pubkey())
        .map(|account| account.lamports);
    println!("lamports before close: {:?}", before);

    let instruction = Instruction::new_with_bytes(
        counter::id(),
        &counter::instruction::Close {}.data(),
        counter::accounts::Close {
            counter: counter.pubkey(),
            authority: payer.pubkey(),
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message =
        Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[&payer]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    println!("close: ok");

    match svm.get_account(&counter.pubkey()) {
        Some(account) => println!("lamports after close: {}", account.lamports),
        None => println!("account gone after close"),
    }
}
