use near_sdk::env;
use sha2::{Digest, Sha256};

use crate::{
    Nomogenesis,
    capacity::{self, CapacityOwner},
    rescue::{self, RescueBundlePhase, RescueCasePhase, RescueComponentOutcome, RescueOfferPhase},
};

pub(crate) fn validate_component_payload(
    component: u8,
    payload: &[u8],
) -> Result<(), &'static str> {
    if component >= rescue::COMPONENT_COUNT as u8 {
        return Err("invalid component index");
    }
    if payload.len() < 13 || payload.len() > rescue::MAX_COMPONENT_PAYLOAD_BYTES {
        return Err("invalid component payload length");
    }
    if payload[0] != 1 || payload[1] != component + 1 {
        return Err("invalid component header");
    }

    let count = usize::from(payload[2]);
    if !(1..=16).contains(&count) || payload.len() != 3 + 10 * count {
        return Err("invalid component record count");
    }

    let mut previous = None;
    for record in payload[3..].as_chunks::<10>().0 {
        let item_id = u16::from_be_bytes([record[0], record[1]]);
        if previous.is_some_and(|id| item_id <= id) {
            return Err("component items not strictly ascending");
        }
        previous = Some(item_id);
    }
    Ok(())
}

pub(crate) fn component_metadata_sibling(component: u8) -> [u8; 32] {
    assert!(component < 2, "invalid component index");
    let metadata = [1u8, 0x7f, component + 1];
    let mut hash = Sha256::new();
    hash.update([0u8]);
    hash.update(1u64.to_be_bytes());
    hash.update(3u32.to_be_bytes());
    hash.update(metadata);
    hash.finalize().into()
}

impl Nomogenesis {
    pub(crate) fn submit_rescue_component_inner(
        &mut self,
        bundle_id: u64,
        component_index: u8,
        payload: Vec<u8>,
        sibling: Vec<u8>,
    ) {
        validate_component_payload(component_index, &payload).expect("invalid component payload");
        let index = usize::from(component_index);

        let mut bundle = self
            .rescue_bundles
            .get(&bundle_id)
            .cloned()
            .expect("unknown rescue bundle");

        assert_eq!(bundle.id, bundle_id, "bundle ID mismatch");
        assert_eq!(bundle.phase, RescueBundlePhase::Awarded);
        assert_eq!(
            bundle.component_outcomes[index],
            RescueComponentOutcome::Pending,
            "component already submitted"
        );
        assert!(
            env::block_timestamp() < bundle.recovery_deadline,
            "recovery deadline reached"
        );

        let mut case = self
            .rescue_cases
            .get(&bundle.case_id)
            .cloned()
            .expect("missing rescue case");

        assert_eq!(case.id, bundle.case_id, "case ID mismatch");
        assert_eq!(case.phase, RescueCasePhase::BundleAwarded);
        assert_eq!(case.awarded_bundle_id, Some(bundle_id));
        assert_eq!(case.recovery_deadline, bundle.recovery_deadline);
        assert!(
            case.resolved_payloads[index].is_none(),
            "component payload already stored"
        );

        let offer_id = bundle.offer_ids[index];
        let mut offer = self
            .rescue_offers
            .get(&offer_id)
            .cloned()
            .expect("missing selected offer");

        assert_eq!(offer.id, offer_id, "offer ID mismatch");
        assert_eq!(offer.case_id, bundle.case_id);
        assert_eq!(offer.component_index, component_index);
        assert_eq!(offer.locked_bundle_id, Some(bundle_id));
        assert_eq!(offer.phase, RescueOfferPhase::Locked);
        assert_eq!(offer.held_bond, bundle.total_price);
        assert_eq!(
            env::predecessor_account_id(),
            offer.provider,
            "not selected rescue provider"
        );

        let key = capacity::capacity_key(&offer.provider, &offer.slot_id);
        assert_eq!(
            self.capacity_locks.get(&key),
            Some(&CapacityOwner::M3RescueOffer(offer_id)),
            "capacity lock mismatch"
        );

        let expected_sibling = component_metadata_sibling(component_index);
        assert_eq!(
            sibling.as_slice(),
            expected_sibling.as_slice(),
            "noncanonical metadata sibling"
        );
        assert!(
            crate::verify_merkle(
                &case.component_commitments[index],
                1,
                0,
                &payload,
                &[sibling],
            ),
            "invalid component Merkle proof"
        );

        // Every validation precedes persistent state mutation.
        case.resolved_payloads[index] = Some(payload);
        bundle.component_outcomes[index] = RescueComponentOutcome::Proven;
        offer.phase = RescueOfferPhase::Proven;

        self.rescue_cases.insert(bundle.case_id, case);
        self.rescue_bundles.insert(bundle_id, bundle);
        self.rescue_offers.insert(offer_id, offer);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(component: u8, ids: &[u16]) -> Vec<u8> {
        let mut result = vec![1, component + 1, ids.len() as u8];
        for id in ids {
            result.extend(id.to_be_bytes());
            result.extend(10u64.to_be_bytes());
        }
        result
    }

    #[test]
    fn canonical_payload_accepts_bounded_sorted_records() {
        for component in 0..2 {
            for count in 1..=16 {
                let ids: Vec<u16> = (0..count).collect();
                assert!(validate_component_payload(component, &payload(component, &ids)).is_ok());
            }
        }
    }

    #[test]
    fn malformed_records_are_rejected() {
        let good = payload(0, &[1, 2]);
        let mut cases = vec![
            vec![],
            vec![1, 1, 0],
            payload(0, &[]),
            payload(0, &[2, 1]),
            payload(0, &[1, 1]),
            payload(0, &(0..17).collect::<Vec<_>>()),
        ];
        let mut bad_version = good.clone();
        bad_version[0] = 2;
        cases.push(bad_version);
        let mut wrong_count = good.clone();
        wrong_count[2] = 3;
        cases.push(wrong_count);
        let mut trailing = good.clone();
        trailing.push(0);
        cases.push(trailing);
        for bad in cases {
            assert!(validate_component_payload(0, &bad).is_err());
        }
        assert!(validate_component_payload(1, &good).is_err());
        assert!(validate_component_payload(2, &good).is_err());
    }

    #[test]
    fn metadata_sibling_matches_existing_merkle_verifier() {
        let data = payload(0, &[1]);
        let sibling = component_metadata_sibling(0);
        let mut leaf = Sha256::new();
        leaf.update([0u8]);
        leaf.update(0u64.to_be_bytes());
        leaf.update((data.len() as u32).to_be_bytes());
        leaf.update(&data);

        let mut root = Sha256::new();
        root.update([1u8]);
        root.update(leaf.finalize());
        root.update(sibling);

        assert!(crate::verify_merkle(
            &root.finalize(),
            1,
            0,
            &data,
            &[sibling.to_vec()]
        ));
        assert_ne!(component_metadata_sibling(0), component_metadata_sibling(1));
    }
}
