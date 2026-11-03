use near_sdk::{AccountId, env, near, store::LookupMap};
mod offer;
mod task;
use offer::{Offer, OfferStatus};
use sha2::{Digest, Sha256};
use task::{Task, TaskPhase};

#[near(contract_state)]
pub struct Nomogenesis {
    next_task_id: u64,
    tasks: LookupMap<u64, Task>,
    next_offer_id: u64,
    offers: LookupMap<u64, Offer>,
    slot_locks: LookupMap<String, u64>,
}

impl Default for Nomogenesis {
    fn default() -> Self {
        Self {
            next_task_id: 0,
            tasks: LookupMap::new(b"tasks".as_slice()),
            next_offer_id: 0,
            offers: LookupMap::new(b"offers".as_slice()),
            slot_locks: LookupMap::new(b"locks".as_slice()),
        }
    }
}

#[near]
impl Nomogenesis {
    pub fn create_task(
        &mut self,
        primary: AccountId,
        root: Vec<u8>,
        height: u8,
        index: u64,
        primary_deadline: u64,
        reserve_deadline: u64,
    ) -> u64 {
        let buyer = env::predecessor_account_id();
        let now = env::block_timestamp();

        assert_ne!(buyer, primary, "buyer and primary must differ");
        assert_eq!(root.len(), 32, "invalid commitment root");
        assert!((1..=10).contains(&height), "invalid tree height");
        assert!(index < (1u64 << height), "invalid leaf index");
        assert!(
            now < primary_deadline && primary_deadline < reserve_deadline,
            "invalid deadlines"
        );

        let id = self.next_task_id;
        self.next_task_id = id.checked_add(1).expect("task ID overflow");

        self.tasks.insert(
            id,
            Task {
                id,
                buyer,
                primary,
                root,
                height,
                index,
                primary_deadline,
                reserve_deadline,
                phase: TaskPhase::SeekingPrimary,
                selected_offer: None,
                backup_activator: None,
            },
        );
        id
    }

    pub fn post_offer(&mut self, task_id: u64, slot_id: String, expires_at: u64) -> u64 {
        let reserve = env::predecessor_account_id();
        let now = env::block_timestamp();
        let task = self.tasks.get(&task_id).expect("unknown task");

        assert_eq!(task.phase, TaskPhase::SeekingReserve, "invalid state");
        assert_ne!(reserve, task.buyer, "buyer cannot provide reserve");
        assert_ne!(reserve, task.primary, "primary cannot be reserve");
        assert!(
            now < expires_at && expires_at <= task.primary_deadline,
            "invalid offer expiry"
        );
        assert!(
            !slot_id.is_empty()
                && slot_id.len() <= 64
                && slot_id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "invalid slot identifier"
        );

        let id = self.next_offer_id;
        self.next_offer_id = id.checked_add(1).expect("offer ID overflow");

        self.offers.insert(
            id,
            Offer {
                id,
                task_id,
                reserve,
                slot_id,
                expires_at,
                status: OfferStatus::Available,
            },
        );

        id
    }

    pub fn select_offer(&mut self, task_id: u64, offer_id: u64) {
        let buyer = env::predecessor_account_id();
        let now = env::block_timestamp();
        let task = self.tasks.get(&task_id).expect("unknown task");

        assert_eq!(buyer, task.buyer, "not task buyer");
        assert_eq!(task.phase, TaskPhase::SeekingReserve, "invalid task state");
        assert!(task.selected_offer.is_none(), "option already selected");
        assert!(now < task.primary_deadline, "task deadline passed");

        let offer = self.offers.get(&offer_id).expect("unknown offer");
        assert_eq!(offer.task_id, task_id, "offer belongs to another task");
        assert_eq!(offer.status, OfferStatus::Available, "offer unavailable");
        assert!(now < offer.expires_at, "offer expired");

        let key = format!("{}|{}", offer.reserve, offer.slot_id);
        assert!(self.slot_locks.get(&key).is_none(), "slot already reserved");

        self.slot_locks.insert(key, offer_id);
        self.offers.get_mut(&offer_id).unwrap().status = OfferStatus::Selected;
        let task = self.tasks.get_mut(&task_id).unwrap();
        task.selected_offer = Some(offer_id);
        task.phase = TaskPhase::OfferSelected;
    }

    pub fn close_unactivated(&mut self, task_id: u64) {
        let now = env::block_timestamp();
        let task = self.tasks.get(&task_id).expect("unknown task");

        assert_eq!(task.phase, TaskPhase::OfferSelected, "invalid task state");
        assert!(now >= task.reserve_deadline, "selection not expired");

        let id = task.selected_offer.expect("missing selection");
        let offer = self.offers.get(&id).expect("missing offer");
        assert_eq!(offer.task_id, task_id, "offer/task mismatch");
        assert!(task.backup_activator.is_none(), "backup already activated");
        let key = format!("{}|{}", offer.reserve, offer.slot_id);

        assert_eq!(self.slot_locks.get(&key).copied(), Some(id));
        assert_eq!(offer.status, OfferStatus::Selected);

        assert_eq!(self.slot_locks.remove(&key), Some(id));
        self.offers.get_mut(&id).unwrap().status = OfferStatus::Released;
        self.tasks.get_mut(&task_id).unwrap().phase = TaskPhase::UnactivatedExpired;
    }

    pub fn slot_holder(&self, reserve: AccountId, slot_id: String) -> Option<u64> {
        let key = format!("{reserve}|{slot_id}");
        self.slot_locks.get(&key).copied()
    }

    pub fn release_unaccepted_offer(&mut self, offer_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let offer = self.offers.get(&offer_id).expect("unknown offer");

        assert_eq!(
            offer.status,
            OfferStatus::Available,
            "offer is not available"
        );
        let task = self.tasks.get(&offer.task_id).expect("missing offer task");
        let task_closed = matches!(
            task.phase,
            TaskPhase::Cancelled | TaskPhase::UnmatchedExpired
        );

        assert!(
            caller == offer.reserve || now >= offer.expires_at || task_closed,
            "only owner can release before expiry"
        );

        self.offers.get_mut(&offer_id).unwrap().status = OfferStatus::Released;
    }

    pub fn get_offer(&self, offer_id: u64) -> Option<Offer> {
        self.offers.get(&offer_id).cloned()
    }

    pub fn accept_primary(&mut self, task_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let task = self.tasks.get_mut(&task_id).expect("unknown task");

        assert_eq!(caller, task.primary, "not designated primary");
        assert_eq!(task.phase, TaskPhase::SeekingPrimary, "invalid state");
        assert!(now < task.primary_deadline, "primary deadline passed");

        task.phase = TaskPhase::SeekingReserve;
    }

    pub fn cancel_unmatched(&mut self, task_id: u64) {
        let caller = env::predecessor_account_id();
        let task = self.tasks.get_mut(&task_id).expect("unknown task");

        assert_eq!(caller, task.buyer, "not task buyer");
        assert!(
            matches!(
                task.phase,
                TaskPhase::SeekingPrimary | TaskPhase::SeekingReserve
            ),
            "task is not unmatched"
        );
        assert!(task.selected_offer.is_none(), "option already selected");

        task.phase = TaskPhase::Cancelled;
    }

    pub fn expire_unmatched(&mut self, task_id: u64) {
        let now = env::block_timestamp();
        let task = self.tasks.get_mut(&task_id).expect("unknown task");

        assert!(
            matches!(
                task.phase,
                TaskPhase::SeekingPrimary | TaskPhase::SeekingReserve
            ),
            "task is not unmatched"
        );
        assert!(task.selected_offer.is_none(), "option already selected");
        assert!(now >= task.primary_deadline, "task not expired");

        task.phase = TaskPhase::UnmatchedExpired;
    }

    pub fn get_task(&self, task_id: u64) -> Option<Task> {
        self.tasks.get(&task_id).cloned()
    }

    pub fn submit_primary_proof(&mut self, task_id: u64, payload: Vec<u8>, siblings: Vec<Vec<u8>>) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let (offer_id, key) = {
            let task = self.tasks.get(&task_id).expect("unknown task");

            assert_eq!(caller, task.primary, "not designated primary");
            assert_eq!(task.phase, TaskPhase::OfferSelected, "invalid task state");
            assert!(now < task.primary_deadline, "primary deadline passed");

            assert!(
                verify_merkle(&task.root, task.height, task.index, &payload, &siblings),
                "invalid task proof"
            );

            let offer_id = task.selected_offer.expect("missing selection");
            let offer = self.offers.get(&offer_id).expect("missing offer");

            assert_eq!(offer.task_id, task_id, "offer/task mismatch");
            assert_eq!(offer.status, OfferStatus::Selected);

            (offer_id, format!("{}|{}", offer.reserve, offer.slot_id))
        };

        assert_eq!(
            self.slot_locks.get(&key).copied(),
            Some(offer_id),
            "slot lock mismatch"
        );

        self.slot_locks.remove(&key);
        self.offers.get_mut(&offer_id).unwrap().status = OfferStatus::Released;
        self.tasks.get_mut(&task_id).unwrap().phase = TaskPhase::PrimaryProofAccepted;
    }

    pub fn trigger_backup(&mut self, task_id: u64) {
        let keeper = env::predecessor_account_id();
        let now = env::block_timestamp();
        let task = self.tasks.get(&task_id).expect("unknown task");

        assert_eq!(task.phase, TaskPhase::OfferSelected, "invalid task state");
        assert!(
            now >= task.primary_deadline && now < task.reserve_deadline,
            "outside backup activation window"
        );
        assert!(task.backup_activator.is_none(), "already activated");

        let offer_id = task.selected_offer.expect("missing selection");
        let offer = self.offers.get(&offer_id).expect("missing offer");

        assert_eq!(offer.task_id, task_id, "offer/task mismatch");
        assert_eq!(offer.status, OfferStatus::Selected);

        let key = format!("{}|{}", offer.reserve, offer.slot_id);
        assert_eq!(
            self.slot_locks.get(&key).copied(),
            Some(offer_id),
            "slot lock mismatch"
        );

        let task = self.tasks.get_mut(&task_id).unwrap();
        task.phase = TaskPhase::BackupActive;
        task.backup_activator = Some(keeper);
    }

    pub fn submit_reserve_proof(&mut self, task_id: u64, payload: Vec<u8>, siblings: Vec<Vec<u8>>) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let (offer_id, key) = {
            let task = self.tasks.get(&task_id).expect("unknown task");

            assert_eq!(task.phase, TaskPhase::BackupActive, "backup not active");
            assert!(
                now >= task.primary_deadline && now < task.reserve_deadline,
                "outside reserve proof window"
            );

            let offer_id = task.selected_offer.expect("missing selection");
            let offer = self.offers.get(&offer_id).expect("missing offer");

            assert_eq!(caller, offer.reserve, "not designated reserve");
            assert_eq!(offer.task_id, task_id, "offer/task mismatch");
            assert_eq!(offer.status, OfferStatus::Selected);

            let key = format!("{}|{}", offer.reserve, offer.slot_id);

            assert_eq!(
                self.slot_locks.get(&key).copied(),
                Some(offer_id),
                "slot lock mismatch"
            );

            assert!(
                verify_merkle(&task.root, task.height, task.index, &payload, &siblings),
                "invalid reserve proof"
            );

            (offer_id, key)
        };

        self.slot_locks.remove(&key);
        self.offers.get_mut(&offer_id).unwrap().status = OfferStatus::Released;
        self.tasks.get_mut(&task_id).unwrap().phase = TaskPhase::ReserveProofAccepted;
    }

    pub fn finalize_reserve_failure(&mut self, task_id: u64) {
        let now = env::block_timestamp();

        let (offer_id, key) = {
            let task = self.tasks.get(&task_id).expect("unknown task");

            assert_eq!(task.phase, TaskPhase::BackupActive, "backup not active");
            assert!(now >= task.reserve_deadline, "reserve deadline not reached");

            let offer_id = task.selected_offer.expect("missing selection");
            let offer = self.offers.get(&offer_id).expect("missing offer");

            assert_eq!(offer.task_id, task_id, "offer/task mismatch");
            assert_eq!(offer.status, OfferStatus::Selected);

            (offer_id, format!("{}|{}", offer.reserve, offer.slot_id))
        };

        assert_eq!(
            self.slot_locks.get(&key).copied(),
            Some(offer_id),
            "slot lock mismatch"
        );

        assert_eq!(self.slot_locks.remove(&key), Some(offer_id));
        self.offers.get_mut(&offer_id).unwrap().status = OfferStatus::Released;
        self.tasks.get_mut(&task_id).unwrap().phase = TaskPhase::ReserveFailed;
    }

    pub fn verify_task_chunk(
        &self,
        task_id: u64,
        payload: Vec<u8>,
        siblings: Vec<Vec<u8>>,
    ) -> bool {
        let Some(task) = self.tasks.get(&task_id) else {
            return false;
        };
        verify_merkle(&task.root, task.height, task.index, &payload, &siblings)
    }
}

fn verify_merkle(
    root: &[u8],
    height: u8,
    index: u64,
    payload: &[u8],
    siblings: &[Vec<u8>],
) -> bool {
    if root.len() != 32
        || !(1..=10).contains(&height)
        || index >= (1_u64 << height)
        || !(1..=256).contains(&payload.len())
        || siblings.len() != usize::from(height)
        || siblings.iter().any(|s| s.len() != 32)
    {
        return false;
    }

    let mut leaf = Sha256::new();
    leaf.update([0]);
    leaf.update(index.to_be_bytes());
    leaf.update((payload.len() as u32).to_be_bytes());
    leaf.update(payload);

    let mut node = leaf.finalize().to_vec();

    for (depth, sibling) in siblings.iter().enumerate() {
        let mut parent = Sha256::new();
        parent.update([1]);

        if (index >> depth) & 1 == 0 {
            parent.update(&node);
            parent.update(sibling);
        } else {
            parent.update(sibling);
            parent.update(&node);
        }

        node = parent.finalize().to_vec();
    }

    node == root
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(input: &str) -> Vec<u8> {
        input
            .as_bytes()
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect()
    }

    pub(super) fn fixture() -> (Vec<u8>, Vec<Vec<u8>>) {
        let root = hex("37931d88e0728e9809cc9a71af1494e90174f8ecee166627eb22eac5b40c9314");
        let siblings = vec![
            hex("dc5fe2eda0ba5ac4f85d2c3d30c93cef8994276ede3f4008ce395526fb9e2f35"),
            hex("4f1acd1519355baa8c1519e131833af25e0a24c178f8791c79e9d9f34f91cdb3"),
        ];
        (root, siblings)
    }

    #[test]
    fn accepts_independent_reference_vector() {
        let (root, siblings) = fixture();
        assert!(verify_merkle(&root, 2, 2, b"charlie", &siblings));
    }

    #[test]
    fn rejects_modified_payload() {
        let (root, siblings) = fixture();
        assert!(!verify_merkle(&root, 2, 2, b"changed", &siblings));
    }

    #[test]
    fn rejects_wrong_leaf_index() {
        let (root, siblings) = fixture();
        assert!(!verify_merkle(&root, 2, 3, b"charlie", &siblings));
    }

    #[test]
    fn rejects_modified_sibling() {
        let (root, mut siblings) = fixture();
        siblings[0][0] ^= 1;
        assert!(!verify_merkle(&root, 2, 2, b"charlie", &siblings));
    }

    #[test]
    fn rejects_wrong_root() {
        let (mut root, siblings) = fixture();
        root[0] ^= 1;
        assert!(!verify_merkle(&root, 2, 2, b"charlie", &siblings));
    }

    #[test]
    fn rejects_malformed_proofs() {
        let (root, siblings) = fixture();

        assert!(!verify_merkle(&root, 0, 2, b"charlie", &siblings));
        assert!(!verify_merkle(&root, 11, 2, b"charlie", &siblings));
        assert!(!verify_merkle(&root, 2, 4, b"charlie", &siblings));
        assert!(!verify_merkle(&root, 2, 2, b"", &siblings));
        assert!(!verify_merkle(&root, 2, 2, &[0; 257], &siblings));
        assert!(!verify_merkle(&root[..31], 2, 2, b"charlie", &siblings));
        assert!(!verify_merkle(&root, 2, 2, b"charlie", &siblings[..1]));
    }
}

#[cfg(test)]
mod task_tests;

#[cfg(test)]
mod offer_tests;

#[cfg(test)]
mod reservation_tests;

#[cfg(test)]
mod release_tests;

#[cfg(test)]
mod proof_tests;

#[cfg(test)]
mod primary_proof_tests;

#[cfg(test)]
mod backup_tests;

#[cfg(test)]
mod reserve_proof_tests;

#[cfg(test)]
mod reserve_failure_tests;

#[cfg(test)]
mod unmatched_tests;

#[cfg(test)]
mod unactivated_tests;

#[cfg(test)]
mod persistence_audit_tests;

#[cfg(test)]
mod terminal_audit_tests;
