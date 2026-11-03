use std::collections::BTreeMap;

// Experimental arithmetic model. NOT connected to contract state.
// No caller authorization or storage-delta authenticity is implied.

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Record {
    TaskCreation(u64),
    TaskFunding(u64),
    OfferCreation(u64),
    OfferFunding(u64),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidOwner,
    ZeroAmount,
    ZeroPrice,
    Duplicate,
    Missing,
    InsufficientUnused,
    InsufficientConsumed,
    Overflow,
    Invariant,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bond {
    pub payer: String,
    pub total: u128,
    pub consumed: u128,
    pub unused: u128,
    pub released: u128,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Totals {
    pub total: u128,
    pub consumed: u128,
    pub unused: u128,
    pub released: u128,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Book {
    records: BTreeMap<Record, Bond>,
}

impl Book {
    pub fn register(&mut self, key: Record, payer: String, amount: u128) -> Result<(), Error> {
        if payer.is_empty() {
            return Err(Error::InvalidOwner);
        }
        if amount == 0 {
            return Err(Error::ZeroAmount);
        }
        if self.records.contains_key(&key) {
            return Err(Error::Duplicate);
        }

        self.records.insert(
            key,
            Bond {
                payer,
                total: amount,
                consumed: 0,
                unused: amount,
                released: 0,
            },
        );
        Ok(())
    }

    pub fn get(&self, key: Record) -> Option<&Bond> {
        self.records.get(&key)
    }

    fn value(bytes: u64, price: u128) -> Result<u128, Error> {
        if price == 0 {
            return Err(Error::ZeroPrice);
        }
        u128::from(bytes).checked_mul(price).ok_or(Error::Overflow)
    }

    pub fn consume(&mut self, key: Record, bytes: u64, price: u128) -> Result<(), Error> {
        let amount = Self::value(bytes, price)?;
        let old = self.records.get(&key).ok_or(Error::Missing)?;

        let unused = old
            .unused
            .checked_sub(amount)
            .ok_or(Error::InsufficientUnused)?;

        let consumed = old.consumed.checked_add(amount).ok_or(Error::Overflow)?;

        let row = self.records.get_mut(&key).unwrap();
        row.unused = unused;
        row.consumed = consumed;
        Ok(())
    }

    pub fn restore(&mut self, key: Record, bytes: u64, price: u128) -> Result<(), Error> {
        let amount = Self::value(bytes, price)?;
        let old = self.records.get(&key).ok_or(Error::Missing)?;

        let consumed = old
            .consumed
            .checked_sub(amount)
            .ok_or(Error::InsufficientConsumed)?;

        let unused = old.unused.checked_add(amount).ok_or(Error::Overflow)?;

        let row = self.records.get_mut(&key).unwrap();
        row.consumed = consumed;
        row.unused = unused;
        Ok(())
    }

    // Arithmetic-only release. External authorization and proof
    // that unused capacity is no longer needed MUST be verified
    // before any future on-chain integration.
    pub fn simulated_credit(&mut self, key: Record, amount: u128) -> Result<(String, u128), Error> {
        if amount == 0 {
            return Err(Error::ZeroAmount);
        }

        let old = self.records.get(&key).ok_or(Error::Missing)?;

        let unused = old
            .unused
            .checked_sub(amount)
            .ok_or(Error::InsufficientUnused)?;

        let released = old.released.checked_add(amount).ok_or(Error::Overflow)?;

        let payer = old.payer.clone();

        let row = self.records.get_mut(&key).unwrap();
        row.unused = unused;
        row.released = released;

        Ok((payer, amount))
    }

    pub fn totals(&self) -> Result<Totals, Error> {
        let mut result = Totals::default();

        for row in self.records.values() {
            let accounted = row
                .consumed
                .checked_add(row.unused)
                .and_then(|v| v.checked_add(row.released))
                .ok_or(Error::Overflow)?;

            if accounted != row.total {
                return Err(Error::Invariant);
            }

            result.total = result.total.checked_add(row.total).ok_or(Error::Overflow)?;
            result.consumed = result
                .consumed
                .checked_add(row.consumed)
                .ok_or(Error::Overflow)?;
            result.unused = result
                .unused
                .checked_add(row.unused)
                .ok_or(Error::Overflow)?;
            result.released = result
                .released
                .checked_add(row.released)
                .ok_or(Error::Overflow)?;
        }

        let aggregate = result
            .consumed
            .checked_add(result.unused)
            .and_then(|v| v.checked_add(result.released))
            .ok_or(Error::Overflow)?;

        if aggregate != result.total {
            return Err(Error::Invariant);
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const Q: u128 = 10_000_000_000_000_000_000;

    #[test]
    fn creation_split_preserves_owner_and_value() {
        let mut book = Book::default();
        let key = Record::TaskCreation(7);

        book.register(key, "buyer.test.near".into(), 2048 * Q)
            .unwrap();
        book.consume(key, 528, Q).unwrap();

        let row = book.get(key).unwrap();
        assert_eq!(row.payer, "buyer.test.near");
        assert_eq!(row.consumed, 528 * Q);
        assert_eq!(row.unused, 1520 * Q);
        assert_eq!(row.released, 0);
        assert_eq!(book.totals().unwrap().total, 2048 * Q);
    }

    #[test]
    fn external_trigger_cannot_redirect_original_owner() {
        let mut book = Book::default();
        let a = Record::OfferFunding(1);
        let b = Record::OfferFunding(2);

        book.register(a, "reserve_a.test.near".into(), 2048 * Q)
            .unwrap();
        book.register(b, "reserve_b.test.near".into(), 2048 * Q)
            .unwrap();

        book.consume(a, 88, Q).unwrap();
        book.consume(b, 88, Q).unwrap();
        book.restore(a, 88, Q).unwrap();

        // Caller identity is deliberately not an input.
        // This verifies bookkeeping, not release authorization.
        let credit = book.simulated_credit(a, 88 * Q).unwrap();

        assert_eq!(credit.0, "reserve_a.test.near");
        assert_eq!(credit.1, 88 * Q);
        assert_eq!(book.get(b).unwrap().released, 0);
        assert_eq!(book.get(b).unwrap().consumed, 88 * Q);
    }

    #[test]
    fn duplicate_release_and_overfree_are_rejected() {
        let mut book = Book::default();
        let key = Record::TaskFunding(3);

        book.register(key, "buyer.test.near".into(), 100).unwrap();
        book.consume(key, 40, 1).unwrap();

        let before = book.clone();
        assert_eq!(book.restore(key, 41, 1), Err(Error::InsufficientConsumed));
        assert_eq!(book, before);

        book.restore(key, 40, 1).unwrap();
        book.simulated_credit(key, 100).unwrap();

        let after = book.clone();
        assert_eq!(
            book.simulated_credit(key, 1),
            Err(Error::InsufficientUnused)
        );
        assert_eq!(book, after);
    }

    #[test]
    fn rejected_operations_are_atomic() {
        let mut book = Book::default();
        let key = Record::OfferCreation(9);

        book.register(key, "reserve.test.near".into(), 10).unwrap();

        let before = book.clone();

        assert_eq!(
            book.register(key, "attacker.test.near".into(), 10),
            Err(Error::Duplicate)
        );
        assert_eq!(book.consume(key, 11, 1), Err(Error::InsufficientUnused));
        assert_eq!(book.consume(key, u64::MAX, u128::MAX), Err(Error::Overflow));
        assert_eq!(book.consume(key, 1, 0), Err(Error::ZeroPrice));
        assert_eq!(book, before);
    }

    #[test]
    fn conservative_double_counting_is_removed_in_model() {
        let mut book = Book::default();
        let key = Record::TaskCreation(0);

        let base_bytes = 314_810u128;
        let buffer_bytes = 2048u128;
        let margin = 80_000_000_000_000_000_000_000u128;
        let bond = 2048 * Q;

        let initial_balance = base_bytes * Q + margin;

        book.register(key, "buyer.test.near".into(), bond).unwrap();
        book.consume(key, 528, Q).unwrap();

        let remaining = book.totals().unwrap().unused;
        let balance = initial_balance + bond;

        let before_free = initial_balance - (base_bytes + buffer_bytes) * Q;

        let after_free = balance - (base_bytes + 528 + buffer_bytes) * Q - remaining;

        assert_eq!(before_free, after_free);

        // The old conservative model would count both the
        // full bond and the actual incremental storage stake.
        let old_free = balance - (base_bytes + 528 + buffer_bytes) * Q - bond;

        assert_eq!(after_free - old_free, 528 * Q);
    }

    #[test]
    fn exhaustive_small_state_conservation() {
        for total in 1u128..=12 {
            for used in 0..=total {
                for freed in 0..=used {
                    let available = total - used + freed;

                    for payout in 0..=available {
                        let mut book = Book::default();
                        let key = Record::TaskCreation(1);

                        book.register(key, "owner".into(), total).unwrap();
                        book.consume(key, used as u64, 1).unwrap();
                        book.restore(key, freed as u64, 1).unwrap();

                        if payout > 0 {
                            book.simulated_credit(key, payout).unwrap();
                        }

                        let totals = book.totals().unwrap();

                        assert_eq!(totals.total, total);
                        assert_eq!(totals.consumed, used - freed);
                        assert_eq!(totals.unused, available - payout);
                        assert_eq!(totals.released, payout);
                    }
                }
            }
        }
    }
}
