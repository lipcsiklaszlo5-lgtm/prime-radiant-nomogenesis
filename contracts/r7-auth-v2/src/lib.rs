use near_sdk::{AccountId, env, json_types::U128, near, store::LookupMap};

const DOMAIN: &str = "NOMOGENESIS/R7-06E/SUBSET/V1";
const MAX_CONSENTS: u8 = 6;
const STORAGE_BOND_BYTES: u128 = 4096;

#[near(serializers = [json])]
pub struct ConsentInput {
    pub case_id: Vec<u8>,
    pub contract: AccountId,
    pub domain: String,
    pub job_id: u64,
    pub buyer: AccountId,
    pub nonce: u64,
    pub plan_hash: Vec<u8>,
    pub max_payment: U128,
    pub exact_payment: U128,
    pub expires_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct StoredConsent {
    buyer: AccountId,
    nonce: u64,
    plan_hash: Vec<u8>,
    max_payment: u128,
    exact_payment: u128,
    expires_at: u64,
}

#[near(serializers = [json])]
pub struct ConsentView {
    pub buyer: AccountId,
    pub nonce: u64,
    pub plan_hash: Vec<u8>,
    pub max_payment: U128,
    pub exact_payment: U128,
    pub expires_at: u64,
}

#[near(contract_state)]
#[derive(near_sdk::PanicOnDefault)]
pub struct AuthV2 {
    contract_id: AccountId,
    case_id: Vec<u8>,
    bid_close: u64,
    award_close: u64,
    consents: LookupMap<u64, StoredConsent>,
    active_buyers: LookupMap<AccountId, u64>,
    used_nonces: LookupMap<String, bool>,
    active_count: u8,
    storage_bond_total: u128,
}

fn nonce_key(buyer: &AccountId, nonce: u64) -> String {
    format!("{buyer}:{nonce}")
}

#[near]
impl AuthV2 {
    #[init]
    pub fn new(case_id: Vec<u8>, bid_close: u64, award_close: u64) -> Self {
        assert!(
            case_id.len() == 32 && case_id.iter().any(|b| *b != 0),
            "invalid case ID"
        );
        assert!(bid_close < award_close, "invalid award window");

        Self {
            contract_id: env::current_account_id(),
            case_id,
            bid_close,
            award_close,
            consents: LookupMap::new(b"v2consent".as_slice()),
            active_buyers: LookupMap::new(b"v2buyer".as_slice()),
            used_nonces: LookupMap::new(b"v2nonce".as_slice()),
            active_count: 0,
            storage_bond_total: 0,
        }
    }

    pub fn quote_consent_storage(&self) -> U128 {
        U128(
            env::storage_byte_cost()
                .as_yoctonear()
                .checked_mul(STORAGE_BOND_BYTES)
                .expect("storage quote overflow"),
        )
    }

    pub fn get_consent(&self, job_id: u64) -> Option<ConsentView> {
        self.consents.get(&job_id).map(|c| ConsentView {
            buyer: c.buyer.clone(),
            nonce: c.nonce,
            plan_hash: c.plan_hash.clone(),
            max_payment: U128(c.max_payment),
            exact_payment: U128(c.exact_payment),
            expires_at: c.expires_at,
        })
    }

    pub fn is_nonce_used(&self, buyer: AccountId, nonce: u64) -> bool {
        self.used_nonces
            .get(&nonce_key(&buyer, nonce))
            .copied()
            .unwrap_or(false)
    }

    pub fn active_consent_count(&self) -> u8 {
        self.active_count
    }

    pub fn retained_storage_bonds(&self) -> U128 {
        U128(self.storage_bond_total)
    }

    #[payable]
    pub fn register_consent(&mut self, input: ConsentInput) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        assert_eq!(
            env::current_account_id(),
            self.contract_id,
            "contract identity mismatch"
        );
        assert!(
            now >= self.bid_close && now < self.award_close,
            "authorization window closed"
        );
        assert_eq!(input.buyer, caller, "wrong buyer");
        assert_eq!(input.contract, self.contract_id, "wrong contract");
        assert_eq!(input.case_id, self.case_id, "wrong case");
        assert_eq!(input.domain, DOMAIN, "wrong domain");

        assert!(
            input.expires_at > now && input.expires_at <= self.award_close,
            "invalid expiration"
        );
        assert!(
            input.plan_hash.len() == 32 && input.plan_hash.iter().any(|b| *b != 0),
            "invalid plan hash"
        );
        assert!(
            input.max_payment.0 > 0
                && input.exact_payment.0 > 0
                && input.exact_payment.0 <= input.max_payment.0,
            "invalid payment consent"
        );
        assert!(self.active_count < MAX_CONSENTS, "consent limit reached");
        assert!(
            self.consents.get(&input.job_id).is_none(),
            "job already authorized"
        );
        assert!(
            self.active_buyers.get(&caller).is_none(),
            "buyer already has active consent"
        );

        let key = nonce_key(&caller, input.nonce);
        assert!(
            self.used_nonces.get(&key).is_none(),
            "nonce already consumed"
        );

        let required = self.quote_consent_storage().0;
        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            required,
            "incorrect storage bond"
        );

        let next_total = self
            .storage_bond_total
            .checked_add(required)
            .expect("storage reserve overflow");
        let next_count = self
            .active_count
            .checked_add(1)
            .expect("consent count overflow");

        let record = StoredConsent {
            buyer: caller.clone(),
            nonce: input.nonce,
            plan_hash: input.plan_hash,
            max_payment: input.max_payment.0,
            exact_payment: input.exact_payment.0,
            expires_at: input.expires_at,
        };

        self.used_nonces.insert(key, true);
        self.active_buyers.insert(caller, input.job_id);
        self.consents.insert(input.job_id, record);
        self.active_count = next_count;
        self.storage_bond_total = next_total;
    }

    pub fn revoke_consent(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        assert!(
            now >= self.bid_close && now < self.award_close,
            "revocation window closed"
        );

        let consent = self
            .consents
            .get(&job_id)
            .cloned()
            .expect("no active consent");

        assert_eq!(consent.buyer, caller, "wrong buyer");

        self.consents.remove(&job_id);
        self.active_buyers.remove(&caller);
        self.active_count = self
            .active_count
            .checked_sub(1)
            .expect("consent count underflow");

        // Nonces remain consumed.
        // Storage bonds remain retained until a separately
        // specified and tested refund mechanism exists.
    }
}
