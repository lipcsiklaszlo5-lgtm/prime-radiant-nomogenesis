use near_sdk::{AccountId, env, near, store::LookupMap};
mod task;
use sha2::{Digest, Sha256};
use task::{Task, TaskPhase};

#[near(contract_state)]
pub struct Nomogenesis {
    next_task_id: u64,
    tasks: LookupMap<u64, Task>,
}

impl Default for Nomogenesis {
    fn default() -> Self {
        Self {
            next_task_id: 0,
            tasks: LookupMap::new(b"tasks".as_slice()),
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
            },
        );
        id
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

    pub fn get_task(&self, task_id: u64) -> Option<Task> {
        self.tasks.get(&task_id).cloned()
    }

    pub fn verify_chunk(
        &self,
        root: Vec<u8>,
        height: u8,
        index: u64,
        payload: Vec<u8>,
        siblings: Vec<Vec<u8>>,
    ) -> bool {
        verify_merkle(&root, height, index, &payload, &siblings)
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

    fn fixture() -> (Vec<u8>, Vec<Vec<u8>>) {
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
        assert!(Nomogenesis::default().verify_chunk(root, 2, 2, b"charlie".to_vec(), siblings));
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
