use near_sdk::near;
use sha2::{Digest, Sha256};

#[near(contract_state)]
#[derive(Default)]
pub struct Nomogenesis {}

#[near]
impl Nomogenesis {
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
            .chunks_exact(2)
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
