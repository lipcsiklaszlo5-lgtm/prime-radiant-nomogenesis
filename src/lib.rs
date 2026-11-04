use near_sdk::{AccountId, env, json_types::U128, near, store::LookupMap};
mod escrow;
mod ledger;
mod offer;
pub mod rescue;
pub mod settlement;
mod task;
mod withdrawal;
use escrow::{OfferDeposit, StorageBond, TaskDeposit, reserve_cost};
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
    task_deposits: LookupMap<u64, TaskDeposit>,
    offer_deposits: LookupMap<u64, OfferDeposit>,
    economic_escrow: u128,
    collateral_escrow: u128,
    storage_reserves: u128,
    task_creation_bonds: LookupMap<u64, StorageBond>,
    offer_creation_bonds: LookupMap<u64, StorageBond>,
    claimables: LookupMap<AccountId, u128>,
    claimable_total: u128,
    settled_tasks: LookupMap<u64, bool>,
    next_withdrawal_id: u64,
    pending_withdrawals: LookupMap<u64, withdrawal::PendingWithdrawal>,
    pending_total: u128,
    next_rescue_job_id: u64,
    rescue_cases: LookupMap<[u8; 32], rescue::RescueCase>,
    rescue_jobs: LookupMap<u64, rescue::RescueJob>,
    rescue_mandates: LookupMap<u64, rescue::RescueMandate>,
    rescue_escrow: u128,
}

impl Default for Nomogenesis {
    fn default() -> Self {
        Self {
            next_task_id: 0,
            tasks: LookupMap::new(b"tasks".as_slice()),
            next_offer_id: 0,
            offers: LookupMap::new(b"offers".as_slice()),
            slot_locks: LookupMap::new(b"locks".as_slice()),
            task_deposits: LookupMap::new(b"taskdep".as_slice()),
            offer_deposits: LookupMap::new(b"offerdep".as_slice()),
            economic_escrow: 0,
            collateral_escrow: 0,
            storage_reserves: 0,
            task_creation_bonds: LookupMap::new(b"taskbond".as_slice()),
            offer_creation_bonds: LookupMap::new(b"offerbond".as_slice()),
            claimables: LookupMap::new(b"claims".as_slice()),
            claimable_total: 0,
            settled_tasks: LookupMap::new(b"settled".as_slice()),
            next_withdrawal_id: 0,
            pending_withdrawals: LookupMap::new(b"pending".as_slice()),
            pending_total: 0,
            next_rescue_job_id: 0,
            rescue_cases: LookupMap::new(b"m3cases".as_slice()),
            rescue_jobs: LookupMap::new(b"m3jobs".as_slice()),
            rescue_mandates: LookupMap::new(b"m3mandates".as_slice()),
            rescue_escrow: 0,
        }
    }
}

#[near]
impl Nomogenesis {
    pub fn m3_storage_quote(&self) -> rescue::M3StorageQuoteView {
        rescue::storage_quote()
    }

    pub fn get_rescue_case(&self, case_id: Vec<u8>) -> Option<rescue::RescueCaseView> {
        let key = rescue::parse_case_id(case_id).ok()?;
        self.rescue_cases
            .get(&key)
            .map(rescue::RescueCaseView::from)
    }

    #[payable]
    pub fn create_rescue_case(&mut self, descriptor: rescue::RescueCaseDescriptorInput) -> Vec<u8> {
        let rescue::RescueCaseDescriptorInput {
            descriptor_version,
            original_provider,
            component_commitments,
            dependency_deadline,
            bid_close,
            award_close,
            recovery_deadline,
        } = descriptor;

        let now = env::block_timestamp();

        assert_eq!(descriptor_version, 1, "unsupported descriptor version");
        assert_ne!(
            original_provider,
            env::current_account_id(),
            "contract cannot be original provider"
        );
        assert!(
            now < dependency_deadline
                && dependency_deadline < bid_close
                && bid_close < award_close
                && award_close < recovery_deadline,
            "invalid rescue case deadlines"
        );

        let commitments = rescue::parse_component_commitments(component_commitments)
            .expect("invalid component commitments");
        assert_ne!(
            commitments[0], commitments[1],
            "component commitments must differ"
        );

        let deadlines = [
            dependency_deadline,
            bid_close,
            award_close,
            recovery_deadline,
        ];
        let descriptor_hash = rescue::derive_descriptor_hash(
            descriptor_version,
            &original_provider,
            &commitments,
            deadlines,
        );
        let case_id = rescue::derive_case_id(&env::current_account_id(), &descriptor_hash);

        assert!(
            self.rescue_cases.get(&case_id).is_none(),
            "rescue case already exists"
        );

        let storage_payment = rescue::case_storage_cost();
        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            storage_payment,
            "incorrect rescue case storage deposit"
        );

        let next_storage = self
            .storage_reserves
            .checked_add(storage_payment)
            .expect("storage reserve overflow");

        self.rescue_cases.insert(
            case_id,
            rescue::RescueCase {
                id: case_id,
                descriptor_version,
                descriptor_hash,
                original_provider,
                component_commitments: commitments,
                dependency_deadline,
                bid_close,
                award_close,
                recovery_deadline,
                job_ids: Vec::new(),
                phase: rescue::RescueCasePhase::Open,
                awarded_bundle_id: None,
                resolved_payloads: [None, None],
            },
        );
        self.storage_reserves = next_storage;

        case_id.to_vec()
    }

    pub fn m3_totals(&self) -> rescue::M3TotalsView {
        rescue::M3TotalsView {
            rescue_escrow: U128(self.rescue_escrow),
            storage_reserves: U128(self.storage_reserves),
            next_rescue_job_id: self.next_rescue_job_id,
        }
    }

    pub fn get_rescue_job(&self, job_id: u64) -> Option<rescue::RescueJobView> {
        self.rescue_jobs
            .get(&job_id)
            .map(rescue::RescueJobView::from)
    }

    pub fn get_rescue_mandate(&self, job_id: u64) -> Option<rescue::RescueMandateView> {
        self.rescue_mandates
            .get(&job_id)
            .map(rescue::RescueMandateView::from)
    }

    #[payable]
    pub fn create_funded_rescue_job(&mut self, input: rescue::FundedRescueJobInput) -> u64 {
        let buyer = env::predecessor_account_id();
        let now = env::block_timestamp();

        let rescue::FundedRescueJobInput {
            case_id,
            worker,
            worker_reward,
            rescue_cap,
            result_profile,
            result_commitment,
            threshold,
            final_deadline,
        } = input;

        let case_id = rescue::parse_case_id(case_id).expect("invalid rescue case ID");
        let mut case = self
            .rescue_cases
            .get(&case_id)
            .cloned()
            .expect("unknown rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(now < case.dependency_deadline, "dependency deadline passed");
        assert!(
            case.job_ids.len() < rescue::MAX_RESCUE_JOBS,
            "rescue case is full"
        );
        assert_ne!(buyer, worker, "buyer and worker must differ");
        assert_ne!(
            worker,
            env::current_account_id(),
            "contract cannot be worker"
        );
        assert!(worker_reward.0 > 0, "zero worker reward");
        assert!(rescue_cap.0 > 0, "zero rescue cap");
        assert!(
            final_deadline > case.recovery_deadline,
            "job deadline must follow recovery deadline"
        );

        for existing_id in &case.job_ids {
            let existing = self
                .rescue_jobs
                .get(existing_id)
                .expect("case job index is corrupt");
            assert_ne!(
                existing.buyer, buyer,
                "buyer already registered in rescue case"
            );
        }

        let result_commitment =
            rescue::parse_result_commitment(result_commitment).expect("invalid result commitment");
        let threshold = rescue::validated_threshold(&result_profile, threshold)
            .expect("invalid result profile");

        let principal = worker_reward
            .0
            .checked_add(rescue_cap.0)
            .expect("rescue principal overflow");
        let storage_payment = rescue::job_storage_cost();
        let required = principal
            .checked_add(storage_payment)
            .expect("rescue job deposit overflow");

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            required,
            "incorrect funded rescue job deposit"
        );

        let next_id = self
            .next_rescue_job_id
            .checked_add(1)
            .expect("rescue job ID overflow");
        let next_escrow = self
            .rescue_escrow
            .checked_add(principal)
            .expect("rescue escrow overflow");
        let next_storage = self
            .storage_reserves
            .checked_add(storage_payment)
            .expect("storage reserve overflow");

        let job_id = self.next_rescue_job_id;
        assert!(
            self.rescue_jobs.get(&job_id).is_none() && self.rescue_mandates.get(&job_id).is_none(),
            "rescue job ID already used"
        );

        case.job_ids.push(job_id);

        self.rescue_jobs.insert(
            job_id,
            rescue::RescueJob {
                id: job_id,
                case_id,
                buyer,
                worker,
                worker_reward: worker_reward.0,
                held_worker_reward: worker_reward.0,
                result_commitment,
                threshold,
                final_deadline,
                phase: rescue::RescueJobPhase::Funded,
            },
        );

        self.rescue_mandates.insert(
            job_id,
            rescue::RescueMandate {
                job_id,
                original_cap: rescue_cap.0,
                held_principal: rescue_cap.0,
                phase: rescue::RescueMandatePhase::Open,
                locked_bundle_id: None,
                locked_allocation: None,
                release_reason: None,
            },
        );

        self.rescue_cases.insert(case_id, case);
        self.next_rescue_job_id = next_id;
        self.rescue_escrow = next_escrow;
        self.storage_reserves = next_storage;

        job_id
    }

    pub fn accept_rescue_job(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.worker, "not designated worker");
        assert_eq!(
            job.phase,
            rescue::RescueJobPhase::Funded,
            "rescue job is not awaiting acceptance"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(
            env::block_timestamp() < case.dependency_deadline,
            "dependency deadline passed"
        );

        self.rescue_jobs.get_mut(&job_id).unwrap().phase = rescue::RescueJobPhase::Accepted;
    }

    pub fn cancel_unaccepted_rescue_job(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let mut job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.buyer, "not rescue job buyer");
        assert_eq!(
            job.phase,
            rescue::RescueJobPhase::Funded,
            "rescue job is not awaiting acceptance"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(
            now < case.dependency_deadline,
            "use expiry after dependency deadline"
        );

        let mut mandate = self
            .rescue_mandates
            .get(&job_id)
            .cloned()
            .expect("missing rescue mandate");

        let released_cap = match mandate.phase.clone() {
            rescue::RescueMandatePhase::Open => {
                assert!(mandate.held_principal > 0, "empty open rescue mandate");
                let amount = mandate.held_principal;
                mandate.held_principal = 0;
                mandate.phase = rescue::RescueMandatePhase::Released;
                mandate.release_reason = Some(rescue::MandateReleaseReason::JobCancelled);
                amount
            }
            rescue::RescueMandatePhase::Released => {
                assert_eq!(
                    mandate.release_reason,
                    Some(rescue::MandateReleaseReason::Revoked),
                    "invalid released mandate for cancellation"
                );
                assert_eq!(
                    mandate.held_principal, 0,
                    "released mandate still holds principal"
                );
                0
            }
            rescue::RescueMandatePhase::Locked => {
                panic!("locked rescue mandate cannot be cancelled")
            }
        };

        assert!(
            job.held_worker_reward > 0,
            "rescue job has no held worker reward"
        );

        let released = job
            .held_worker_reward
            .checked_add(released_cap)
            .expect("rescue cancellation credit overflow");

        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        job.held_worker_reward = 0;
        job.phase = rescue::RescueJobPhase::Cancelled;

        self.credit_accounts(&[(job.buyer.clone(), released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_jobs.insert(job_id, job);
        self.rescue_mandates.insert(job_id, mandate);
    }

    pub fn revoke_open_rescue_mandate(&mut self, job_id: u64) {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        let job = self
            .rescue_jobs
            .get(&job_id)
            .cloned()
            .expect("unknown rescue job");

        assert_eq!(caller, job.buyer, "not rescue job buyer");
        assert!(
            matches!(
                job.phase,
                rescue::RescueJobPhase::Funded | rescue::RescueJobPhase::Accepted
            ),
            "rescue job cannot revoke its mandate"
        );

        let case = self
            .rescue_cases
            .get(&job.case_id)
            .expect("missing rescue case");

        assert_eq!(
            case.phase,
            rescue::RescueCasePhase::Open,
            "rescue case is not open"
        );
        assert!(now < case.award_close, "use expiry after award close");

        let mut mandate = self
            .rescue_mandates
            .get(&job_id)
            .cloned()
            .expect("missing rescue mandate");

        assert_eq!(
            mandate.phase,
            rescue::RescueMandatePhase::Open,
            "rescue mandate is not open"
        );
        assert!(
            mandate.held_principal > 0,
            "open rescue mandate holds no principal"
        );
        assert!(
            mandate.locked_bundle_id.is_none() && mandate.locked_allocation.is_none(),
            "open rescue mandate contains a lock"
        );

        let released = mandate.held_principal;
        let next_escrow = self
            .rescue_escrow
            .checked_sub(released)
            .expect("rescue escrow underflow");

        mandate.held_principal = 0;
        mandate.phase = rescue::RescueMandatePhase::Released;
        mandate.release_reason = Some(rescue::MandateReleaseReason::Revoked);

        self.credit_accounts(&[(job.buyer, released)]);
        self.rescue_escrow = next_escrow;
        self.rescue_mandates.insert(job_id, mandate);
    }

    pub fn rescue_escrow_total(&self) -> U128 {
        U128(self.rescue_escrow)
    }

    pub fn next_rescue_job_id(&self) -> u64 {
        self.next_rescue_job_id
    }

    pub fn has_rescue_case(&self, case_id: Vec<u8>) -> bool {
        let Ok(key) = <[u8; 32]>::try_from(case_id) else {
            return false;
        };
        self.rescue_cases.get(&key).is_some()
    }

    pub fn has_rescue_job(&self, job_id: u64) -> bool {
        self.rescue_jobs.get(&job_id).is_some()
    }

    pub fn has_rescue_mandate(&self, job_id: u64) -> bool {
        self.rescue_mandates.get(&job_id).is_some()
    }

    pub fn task_storage_bond(&self, task_id: u64) -> Option<(AccountId, U128)> {
        self.task_creation_bonds
            .get(&task_id)
            .map(|bond| (bond.payer.clone(), U128(bond.amount)))
    }

    pub fn offer_storage_bond(&self, offer_id: u64) -> Option<(AccountId, U128)> {
        self.offer_creation_bonds
            .get(&offer_id)
            .map(|bond| (bond.payer.clone(), U128(bond.amount)))
    }

    pub fn payout_totals(&self) -> (U128, U128) {
        (U128(self.claimable_total), U128(self.pending_total))
    }

    pub fn get_pending_withdrawal(&self, withdrawal_id: u64) -> Option<(AccountId, U128)> {
        self.pending_withdrawals
            .get(&withdrawal_id)
            .map(|p| (p.owner.clone(), U128(p.amount)))
    }

    pub fn withdraw(&mut self, amount: U128) {
        self.begin_withdrawal(amount.0)
    }

    #[private]
    pub fn on_withdraw_complete(&mut self, withdrawal_id: u64) {
        self.finish_withdrawal(withdrawal_id);
    }

    pub fn get_claimable(&self, account: AccountId) -> U128 {
        U128(self.claimables.get(&account).copied().unwrap_or(0))
    }

    pub fn claimable_total(&self) -> U128 {
        U128(self.claimable_total)
    }

    pub fn is_task_settled(&self, task_id: u64) -> bool {
        self.settled_tasks.get(&task_id).copied().unwrap_or(false)
    }

    pub fn storage_reserve_required(&self) -> U128 {
        U128(reserve_cost())
    }

    pub fn escrow_totals(&self) -> (U128, U128, U128) {
        (
            U128(self.economic_escrow),
            U128(self.collateral_escrow),
            U128(self.storage_reserves),
        )
    }

    pub fn is_task_funded(&self, task_id: u64) -> bool {
        self.task_deposits.get(&task_id).is_some()
    }

    pub fn is_offer_collateralized(&self, offer_id: u64) -> bool {
        self.offer_deposits.get(&offer_id).is_some()
    }

    #[payable]
    pub fn fund_task(
        &mut self,
        task_id: u64,
        primary_reward: U128,
        reserve_reward: U128,
        option_premium: U128,
        keeper_bounty: U128,
    ) {
        let buyer = env::predecessor_account_id();
        let task = self.tasks.get(&task_id).expect("unknown task");

        assert_eq!(buyer, task.buyer, "not task buyer");
        assert_eq!(
            task.phase,
            TaskPhase::SeekingPrimary,
            "task no longer fundable"
        );
        assert!(
            env::block_timestamp() < task.primary_deadline,
            "primary deadline passed"
        );
        assert!(
            self.task_deposits.get(&task_id).is_none(),
            "task already funded"
        );

        let record = TaskDeposit {
            primary_reward: primary_reward.0,
            reserve_reward: reserve_reward.0,
            option_premium: option_premium.0,
            keeper_bounty: keeper_bounty.0,
            storage_reserve: reserve_cost(),
        };

        let funding = record
            .budget()
            .funding()
            .expect("invalid or overflowing budget");

        let required = funding
            .checked_add(record.storage_reserve)
            .expect("deposit overflow");

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            required,
            "incorrect attached task deposit"
        );

        let next_economic = self
            .economic_escrow
            .checked_add(funding)
            .expect("economic escrow overflow");

        let next_storage = self
            .storage_reserves
            .checked_add(record.storage_reserve)
            .expect("storage reserve overflow");

        self.task_deposits.insert(task_id, record);
        self.economic_escrow = next_economic;
        self.storage_reserves = next_storage;
    }

    #[payable]
    pub fn fund_offer(&mut self, offer_id: u64, collateral: U128) {
        let caller = env::predecessor_account_id();
        let offer = self.offers.get(&offer_id).expect("unknown offer");

        assert_eq!(caller, offer.reserve, "not reserve owner");
        assert_eq!(offer.status, OfferStatus::Available, "offer unavailable");
        assert!(env::block_timestamp() < offer.expires_at, "offer expired");
        assert!(
            self.offer_deposits.get(&offer_id).is_none(),
            "offer already funded"
        );

        let task = self.tasks.get(&offer.task_id).expect("missing task");

        assert_eq!(task.phase, TaskPhase::SeekingReserve, "invalid task state");

        let task_deposit = self
            .task_deposits
            .get(&offer.task_id)
            .expect("task has no buyer funding");

        let minimum = task_deposit
            .budget()
            .minimum_collateral()
            .expect("collateral calculation overflow");

        assert!(collateral.0 >= minimum, "insufficient reserve collateral");

        let storage_reserve = reserve_cost();
        let required = collateral
            .0
            .checked_add(storage_reserve)
            .expect("deposit overflow");

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            required,
            "incorrect attached collateral deposit"
        );

        let next_collateral = self
            .collateral_escrow
            .checked_add(collateral.0)
            .expect("collateral escrow overflow");

        let next_storage = self
            .storage_reserves
            .checked_add(storage_reserve)
            .expect("storage reserve overflow");

        self.offer_deposits.insert(
            offer_id,
            OfferDeposit {
                collateral: collateral.0,
                storage_reserve,
            },
        );

        self.collateral_escrow = next_collateral;
        self.storage_reserves = next_storage;
    }

    #[payable]
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

        let creation_reserve = reserve_cost();

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            creation_reserve,
            "incorrect task creation storage deposit"
        );

        let next_storage = self
            .storage_reserves
            .checked_add(creation_reserve)
            .expect("storage reserve overflow");

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

        self.task_creation_bonds.insert(
            id,
            StorageBond {
                payer: env::predecessor_account_id(),
                amount: creation_reserve,
            },
        );

        self.storage_reserves = next_storage;
        id
    }

    #[payable]
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

        let creation_reserve = reserve_cost();

        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            creation_reserve,
            "incorrect offer creation storage deposit"
        );

        let next_storage = self
            .storage_reserves
            .checked_add(creation_reserve)
            .expect("storage reserve overflow");

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

        self.offer_creation_bonds.insert(
            id,
            StorageBond {
                payer: env::predecessor_account_id(),
                amount: creation_reserve,
            },
        );

        self.storage_reserves = next_storage;
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

        // A funded task may not select an unfunded reserve offer.
        if self.task_deposits.get(&task_id).is_some() {
            assert!(
                self.offer_deposits.get(&offer_id).is_some(),
                "reserve offer lacks collateral"
            );
        }

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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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

        if self.offer_deposits.get(&offer_id).is_some() {
            self.refund_released_offer(offer_id);
        }
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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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
        if self.task_deposits.get(&task_id).is_some() {
            self.settle_funded_task(task_id);
        }
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

#[cfg(test)]
mod escrow_tests;

#[cfg(test)]
mod ledger_tests;

#[cfg(test)]
mod withdrawal_tests;

#[cfg(test)]
mod rescue_schema_tests;

#[cfg(test)]
mod rescue_case_tests;

#[cfg(test)]
mod rescue_funding_tests;

#[cfg(test)]
mod rescue_release_tests;

#[cfg(test)]
mod storage_admission_tests;

#[cfg(test)]
mod refund_tests;
