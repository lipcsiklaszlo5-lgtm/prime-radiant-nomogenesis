use std::collections::BTreeSet;

use crate::storage_ledger_model::{Bond, Book, Error as BookError, Record, Totals};

// Isolated research model, NOT linked to the NEAR contract.
//
// InternalEvent has no public constructor. The tests below
// emulate an authoritative event source. Actual storage
// measurement, event authentication and authorization
// MUST be implemented before any on-chain integration.
//
// A unique event ID prevents the same ID being reused.
// It does NOT prove two different IDs represent different
// physical storage deltas.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    Allocate(u64),
    Restore(u64),
    Credit(u128),
}

#[derive(Debug, Clone)]
pub struct InternalEvent {
    id: u64,
    record: Record,
    payer: String,
    change: Change,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardError {
    Replay,
    WrongPayer,
    UnknownRecord,
    ZeroDelta,
    InvalidPrice,
    Book(BookError),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GuardedBook {
    book: Book,
    processed: BTreeSet<u64>,
}

impl GuardedBook {
    pub fn register(
        &mut self,
        record: Record,
        payer: String,
        amount: u128,
    ) -> Result<(), BookError> {
        self.book.register(record, payer, amount)
    }

    pub fn get(&self, record: Record) -> Option<&Bond> {
        self.book.get(record)
    }

    pub fn totals(&self) -> Result<Totals, BookError> {
        self.book.totals()
    }

    pub fn processed_count(&self) -> usize {
        self.processed.len()
    }

    pub fn apply_internal(
        &mut self,
        event: InternalEvent,
        byte_price: u128,
    ) -> Result<Option<(String, u128)>, GuardError> {
        if self.processed.contains(&event.id) {
            return Err(GuardError::Replay);
        }

        if byte_price == 0 {
            return Err(GuardError::InvalidPrice);
        }

        let row = self
            .book
            .get(event.record)
            .ok_or(GuardError::UnknownRecord)?;

        if row.payer != event.payer {
            return Err(GuardError::WrongPayer);
        }

        match event.change {
            Change::Allocate(0) | Change::Restore(0) | Change::Credit(0) => {
                return Err(GuardError::ZeroDelta);
            }
            _ => {}
        }

        // Prepare all accounting changes on a copy.
        // No event marker is written if arithmetic fails.
        let mut candidate = self.book.clone();

        let payout = match event.change {
            Change::Allocate(bytes) => {
                candidate
                    .consume(event.record, bytes, byte_price)
                    .map_err(GuardError::Book)?;
                None
            }
            Change::Restore(bytes) => {
                candidate
                    .restore(event.record, bytes, byte_price)
                    .map_err(GuardError::Book)?;
                None
            }
            Change::Credit(amount) => Some(
                candidate
                    .simulated_credit(event.record, amount)
                    .map_err(GuardError::Book)?,
            ),
        };

        candidate.totals().map_err(GuardError::Book)?;

        self.book = candidate;
        self.processed.insert(event.id);

        Ok(payout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "reserve_a.test.near";
    const B: &str = "reserve_b.test.near";

    fn event(id: u64, record: Record, payer: &str, change: Change) -> InternalEvent {
        // Test fixture, not an authorization mechanism.
        InternalEvent {
            id,
            record,
            payer: payer.into(),
            change,
        }
    }

    fn setup() -> GuardedBook {
        let mut book = GuardedBook::default();

        book.register(Record::OfferFunding(1), A.into(), 150)
            .unwrap();
        book.register(Record::OfferFunding(2), B.into(), 150)
            .unwrap();

        book
    }

    #[test]
    fn repeated_partial_credit_is_rejected() {
        let mut book = setup();
        let key = Record::OfferFunding(1);

        let first = event(10, key, A, Change::Credit(10));
        assert_eq!(
            book.apply_internal(first.clone(), 1).unwrap(),
            Some((A.into(), 10))
        );

        let before = book.clone();

        assert_eq!(book.apply_internal(first, 1), Err(GuardError::Replay));
        assert_eq!(book, before);
        assert_eq!(book.get(key).unwrap().unused, 140);
    }

    #[test]
    fn same_event_cannot_move_between_owners() {
        let mut book = setup();

        book.apply_internal(event(20, Record::OfferFunding(1), A, Change::Credit(10)), 1)
            .unwrap();

        let before = book.clone();

        assert_eq!(
            book.apply_internal(event(20, Record::OfferFunding(2), B, Change::Credit(10)), 1),
            Err(GuardError::Replay)
        );

        assert_eq!(book, before);
        assert_eq!(book.get(Record::OfferFunding(2)).unwrap().released, 0);
    }

    #[test]
    fn foreign_payer_claim_is_rejected() {
        let mut book = setup();
        let before = book.clone();

        assert_eq!(
            book.apply_internal(event(30, Record::OfferFunding(1), B, Change::Credit(10)), 1),
            Err(GuardError::WrongPayer)
        );

        assert_eq!(book, before);

        assert_eq!(
            book.apply_internal(event(30, Record::OfferFunding(1), A, Change::Credit(10)), 1)
                .unwrap(),
            Some((A.into(), 10))
        );
    }

    #[test]
    fn failed_allocation_does_not_burn_event_id() {
        let mut book = setup();
        let key = Record::OfferFunding(1);
        let before = book.clone();

        assert_eq!(
            book.apply_internal(event(40, key, A, Change::Allocate(151)), 1),
            Err(GuardError::Book(BookError::InsufficientUnused))
        );

        assert_eq!(book, before);

        book.apply_internal(event(40, key, A, Change::Allocate(50)), 1)
            .unwrap();

        assert_eq!(book.get(key).unwrap().consumed, 50);
        assert_eq!(book.processed_count(), 1);
    }

    #[test]
    fn restore_replay_cannot_free_same_event_twice() {
        let mut book = setup();
        let key = Record::OfferFunding(1);

        book.apply_internal(event(50, key, A, Change::Allocate(100)), 1)
            .unwrap();

        let restore = event(51, key, A, Change::Restore(40));

        book.apply_internal(restore.clone(), 1).unwrap();

        let before = book.clone();

        assert_eq!(book.apply_internal(restore, 1), Err(GuardError::Replay));

        assert_eq!(book, before);
        assert_eq!(book.get(key).unwrap().consumed, 60);
    }

    #[test]
    fn mixed_owner_conservation() {
        let mut book = setup();

        let operations = [
            (60, 1, A, Change::Allocate(90)),
            (61, 2, B, Change::Allocate(60)),
            (62, 1, A, Change::Restore(20)),
            (63, 1, A, Change::Credit(30)),
            (64, 2, B, Change::Credit(40)),
        ];

        let mut payouts = Vec::new();

        for (id, record, payer, change) in operations {
            if let Some(payment) = book
                .apply_internal(event(id, Record::OfferFunding(record), payer, change), 1)
                .unwrap()
            {
                payouts.push(payment);
            }
        }

        assert_eq!(payouts, vec![(A.into(), 30), (B.into(), 40)]);

        let totals = book.totals().unwrap();

        assert_eq!(totals.total, 300);
        assert_eq!(totals.consumed, 130);
        assert_eq!(totals.unused, 100);
        assert_eq!(totals.released, 70);
        assert_eq!(book.processed_count(), 5);
    }

    #[test]
    fn zero_events_and_arithmetic_overflow_are_atomic() {
        let mut book = setup();
        let key = Record::OfferFunding(1);
        let before = book.clone();

        assert_eq!(
            book.apply_internal(event(70, key, A, Change::Credit(0)), 1),
            Err(GuardError::ZeroDelta)
        );

        assert_eq!(
            book.apply_internal(event(70, key, A, Change::Allocate(u64::MAX)), u128::MAX),
            Err(GuardError::Book(BookError::Overflow))
        );

        assert_eq!(book, before);

        book.apply_internal(event(70, key, A, Change::Allocate(1)), 1)
            .unwrap();

        assert_eq!(book.processed_count(), 1);
    }
}
